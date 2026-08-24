/**
 * Admin audit-log viewer service.
 *
 * Owns: the read-and-shape surface for the admin audit-log page over
 * `audit_entries`, and the audit-of-audit write that records each admin's
 * access to it. Does not own: writing domain audit rows (that is each owning
 * service via `appendAuditEntry`), or any mutation of `audit_entries` (the
 * table is append-only and immutable).
 *
 * Audience: admin only (Sensitivity 4). The page is read-only; it never edits
 * or deletes entries. Content is shown as logged: domain rows already exclude
 * secrets and raw PII at write time (sensitive lookups are hashed; members are
 * referenced by id), so the viewer needs no read-time redaction.
 *
 * Side effects: every view and export appends one privacy-safe audit row
 * (`audit.viewed` / `audit.exported`, category `audit`) naming the admin and
 * the filter target, so access to the audit log is itself auditable. Those
 * access rows are excluded from the default browse to avoid self-noise.
 */
import {
  queryAuditLog,
  countAuditLog,
  listAuditLogCategories,
  type AuditLogFilters,
  type AuditLogQueryRow,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { runSqliteRead } from './sqliteRetry';
import type { PageViewModel } from '../types/page';

const PAGE_SIZE = 50;
const EXPORT_CAP = 5000;
const ACTOR_TYPES = ['admin', 'member', 'system'] as const;

export interface AuditLogQuery {
  memberId?: string | null;
  actionType?: string | null;
  category?: string | null;
  actorType?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  selfActionOnly?: boolean;
  includeAuditAccess?: boolean;
  page?: number;
}

interface AuditEntryViewModel {
  occurredAtDisplay: string;
  actorType: string;
  actorLabel: string;
  actorHref: string | null;
  actionType: string;
  category: string;
  entityLabel: string;
  entityHref: string | null;
  reasonText: string | null;
  metadataPreview: string | null;
  dataOriginLabel: string | null;
}

export interface AuditLogContent {
  entries: AuditEntryViewModel[];
  hasEntries: boolean;
  resultSummary: string;
  total: number;
  page: number;
  prevPageHref: string | null;
  nextPageHref: string | null;
  filters: {
    member: string;
    actionType: string;
    category: string;
    actorType: string;
    fromDate: string;
    toDate: string;
    selfActionOnly: boolean;
    includeAuditAccess: boolean;
  };
  categoryOptions: string[];
  actorTypeOptions: string[];
  exportCsvHref: string;
  exportJsonHref: string;
}

// Real business is unlabelled and everything else is called out, the same
// polarity the payment surfaces use for the provider's live/test flag: a
// missing or unrecognised value must never be read as real. A row written
// while production was being proven, or by a process that could not read the
// go-live marker, is labelled so a reviewer never mistakes a rehearsal for a
// member's actual history.
function dataOriginLabel(raw: string | null | undefined): string | null {
  if (raw === 'live') return null;
  return raw === 'test' ? 'Test data' : 'Unknown origin';
}

// A bare calendar date as the upper bound should include that whole day, so
// stretch it to the end of the day before the `occurred_at <=` comparison.
function expandToDate(d: string | null | undefined): string | null {
  if (!d) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T23:59:59.999Z` : d;
}

function normalize(q: AuditLogQuery): { filters: AuditLogFilters; page: number } {
  const page = q.page && q.page > 0 ? Math.floor(q.page) : 1;
  return {
    page,
    filters: {
      memberId: q.memberId || null,
      actionType: q.actionType || null,
      category: q.category || null,
      actorType: q.actorType || null,
      fromDate: q.fromDate || null,
      toDate: expandToDate(q.toDate),
      selfActionOnly: Boolean(q.selfActionOnly),
      includeAuditAccess: Boolean(q.includeAuditAccess),
    },
  };
}

function filterParams(q: AuditLogQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.memberId) p.set('member', q.memberId);
  if (q.actionType) p.set('actionType', q.actionType);
  if (q.category) p.set('category', q.category);
  if (q.actorType) p.set('actorType', q.actorType);
  if (q.fromDate) p.set('from', q.fromDate);
  if (q.toDate) p.set('to', q.toDate);
  if (q.selfActionOnly) p.set('self', '1');
  if (q.includeAuditAccess) p.set('includeAccess', '1');
  return p;
}

function hrefFor(q: AuditLogQuery, page: number): string {
  const p = filterParams(q);
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return qs ? `/admin/audit-log?${qs}` : '/admin/audit-log';
}

function exportHref(q: AuditLogQuery, format: 'csv' | 'json'): string {
  const p = filterParams(q);
  p.set('format', format);
  return `/admin/audit-log/export?${p.toString()}`;
}

// Quote a CSV cell when it carries a delimiter, quote, or newline; an internal
// quote is escaped by doubling, per RFC 4180. A leading '=', '+', '-', '@', tab
// or carriage return is neutralised with a leading apostrophe first: spreadsheet
// applications read those as the start of a formula, and this export carries
// member-chosen display names, whose validation constrains only length. Without
// it a member can plant a formula that runs on the administrator's machine when
// they open the file.
const FORMULA_LEAD = /^[=+\-@\t\r]/;
function csvCell(v: string | null): string {
  const raw = v ?? '';
  const s = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function actorLabel(row: AuditLogQueryRow): string {
  if (row.actor_type === 'system') return '(system)';
  if (row.actor_display_name) return row.actor_display_name;
  return row.actor_member_id ?? '(unknown)';
}

function entityLabel(row: AuditLogQueryRow): string {
  if (row.entity_type === 'member') return row.entity_display_name ?? row.entity_id;
  return `${row.entity_type}:${row.entity_id}`;
}

function metadataPreview(json: string): string | null {
  if (!json || json === '{}') return null;
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return null;
    const s = keys
      .map((k) => `${k}=${typeof obj[k] === 'object' ? JSON.stringify(obj[k]) : String(obj[k])}`)
      .join(' ');
    return s.length > 240 ? `${s.slice(0, 240)}...` : s;
  } catch {
    return null;
  }
}

function shapeRow(row: AuditLogQueryRow): AuditEntryViewModel {
  return {
    // Stored timestamps are UTC. The ledger's purpose is establishing a
    // sequence, so the zone is on the face of the figure rather than assumed.
    occurredAtDisplay: `${row.occurred_at.slice(0, 19).replace('T', ' ')} UTC`,
    actorType: row.actor_type,
    actorLabel: actorLabel(row),
    actorHref: row.actor_slug ? `/members/${row.actor_slug}` : null,
    actionType: row.action_type,
    category: row.category,
    entityLabel: entityLabel(row),
    entityHref: row.entity_type === 'member' && row.entity_slug ? `/members/${row.entity_slug}` : null,
    reasonText: row.reason_text,
    metadataPreview: metadataPreview(row.metadata_json),
    dataOriginLabel: dataOriginLabel(row.data_origin),
  };
}

export const auditLogService = {
  // A contended database renders the standard temporarily-unavailable page
  // rather than falling to the generic handler, which shows the same page under
  // a 500.
  getAuditLogPage(q: AuditLogQuery): PageViewModel<AuditLogContent> {
    return runSqliteRead('admin audit log page', () => this.readAuditLogPage(q));
  },

  readAuditLogPage(q: AuditLogQuery): PageViewModel<AuditLogContent> {
    const { filters, page } = normalize(q);
    const total = countAuditLog(filters);
    const offset = (page - 1) * PAGE_SIZE;
    const rows = queryAuditLog(filters, PAGE_SIZE, offset);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const firstShown = total === 0 ? 0 : offset + 1;
    const lastShown = offset + rows.length;
    const resultSummary = total === 0
      ? 'No matching audit entries.'
      : `Showing ${firstShown} to ${lastShown} of ${total} entr${total === 1 ? 'y' : 'ies'}.`;

    return {
      seo: { title: 'Audit Log', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_audit_log', title: 'Audit Log' },
      content: {
        entries: rows.map(shapeRow),
        hasEntries: rows.length > 0,
        resultSummary,
        total,
        page,
        prevPageHref: page > 1 ? hrefFor(q, page - 1) : null,
        nextPageHref: page < totalPages ? hrefFor(q, page + 1) : null,
        filters: {
          member: q.memberId ?? '',
          actionType: q.actionType ?? '',
          category: q.category ?? '',
          actorType: q.actorType ?? '',
          fromDate: q.fromDate ?? '',
          toDate: q.toDate ?? '',
          selfActionOnly: Boolean(q.selfActionOnly),
          includeAuditAccess: Boolean(q.includeAuditAccess),
        },
        categoryOptions: listAuditLogCategories(),
        actorTypeOptions: [...ACTOR_TYPES],
        exportCsvHref: exportHref(q, 'csv'),
        exportJsonHref: exportHref(q, 'json'),
      },
    };
  },

  /**
   * Serialize the filtered audit set (capped) as CSV or JSON for IR handoff.
   * Returns the body plus its content type and download filename.
   */
  getAuditLogExportBody(
    q: AuditLogQuery,
    format: 'csv' | 'json',
  ): { contentType: string; filename: string; body: string; count: number } {
    const { filters } = normalize(q);
    const rows = queryAuditLog(filters, EXPORT_CAP, 0);
    // The export is capped, and an incident handoff that silently loses its
    // oldest rows reads as the complete set. Both formats say so on their face
    // when the cap was reached, so the reader narrows the filters rather than
    // drawing conclusions from a partial file.
    const total = countAuditLog(filters);
    const truncated = total > rows.length;
    // JSON stays a bare array of entries, which is what a consumer parses; the
    // truncation is recorded on the audit-of-audit row instead, so it is
    // discoverable without changing the document's shape.
    if (format === 'json') {
      return {
        contentType: 'application/json',
        filename: 'audit-log.json',
        body: JSON.stringify(rows, null, 2),
        count: rows.length,
      };
    }
    const header = [
      'occurred_at', 'actor_type', 'actor_member_id', 'actor_name', 'action_type',
      'category', 'entity_type', 'entity_id', 'entity_name', 'reason_text', 'metadata_json',
      'data_origin',
    ];
    const lines: string[] = [];
    if (truncated) {
      lines.push(`# Showing the newest ${rows.length} of ${total} matching entries. Narrow the filters to export the rest.`);
    }
    lines.push(header.join(','));
    for (const r of rows) {
      lines.push([
        r.occurred_at, r.actor_type, r.actor_member_id, r.actor_display_name, r.action_type,
        r.category, r.entity_type, r.entity_id, r.entity_display_name, r.reason_text, r.metadata_json,
        r.data_origin,
      ].map(csvCell).join(','));
    }
    return {
      contentType: 'text/csv',
      filename: 'audit-log.csv',
      body: lines.join('\n'),
      count: rows.length,
    };
  },

  /** Append the audit-of-audit row recording a bulk export of the audit log. */
  recordAuditLogExport(adminMemberId: string, q: AuditLogQuery, format: string, count: number): void {
    const { filters } = normalize(q);
    appendAuditEntry({
      actorType: 'admin',
      actorMemberId: adminMemberId,
      actionType: 'audit.exported',
      entityType: filters.memberId ? 'member' : 'audit_log',
      entityId: filters.memberId ?? 'audit_log',
      category: 'audit',
      reasonText: null,
      metadata: {
        format,
        count,
        // Whether the export carried everything the filters matched. An incident
        // handoff that quietly lost its oldest rows would otherwise read, later,
        // as the complete set.
        matching: countAuditLog(filters),
        member: filters.memberId ?? null,
        action_type: filters.actionType ?? null,
        category: filters.category ?? null,
        actor_type: filters.actorType ?? null,
        from: filters.fromDate ?? null,
        to: filters.toDate ?? null,
      },
    });
  },

  /**
   * Append the audit-of-audit row recording that an admin read the audit log.
   * Metadata carries only the filter shape (ids and codes), never member PII.
   */
  recordAuditLogView(adminMemberId: string, q: AuditLogQuery): void {
    const { filters } = normalize(q);
    appendAuditEntry({
      actorType: 'admin',
      actorMemberId: adminMemberId,
      actionType: 'audit.viewed',
      entityType: filters.memberId ? 'member' : 'audit_log',
      entityId: filters.memberId ?? 'audit_log',
      category: 'audit',
      reasonText: null,
      metadata: {
        member: filters.memberId ?? null,
        action_type: filters.actionType ?? null,
        category: filters.category ?? null,
        actor_type: filters.actorType ?? null,
        from: filters.fromDate ?? null,
        to: filters.toDate ?? null,
        self_action_only: Boolean(filters.selfActionOnly),
      },
    });
  },
};
