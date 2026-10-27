/**
 * Admin audit-log viewer service.
 *
 * Owns: the read-and-shape surface for the admin audit-log page, its
 * periodic summary and its export over `audit_entries`. The summary takes the same filters as
 * the list, so it is the filtered view aggregated rather than a second question
 * with a scope of its own. Does not own: writing domain audit rows (that is
 * each owning service via `appendAuditEntry`), or any mutation of
 * `audit_entries` (the table is append-only; only the retention purge, owned by
 * the operations platform service, deletes rows past the seven-year window).
 *
 * A browse with no dates shows the last 90 days ending today; a member's or an
 * entity's history keeps its whole span. The export takes a required window of
 * at most 90 days and streams every row in it. The summary counts live rows.
 *
 * Audience: admin only (Sensitivity 4). The page is read-only; it never edits
 * or deletes entries. Content is shown as logged: domain rows already exclude
 * secrets and personal data at write time (people are named by id; claim
 * evidence names an email only as a keyed hash), so the viewer needs no
 * read-time redaction.
 *
 * Side effects: none. Every method is a read; reading or exporting the log
 * records nothing, because a GET changes no stored state.
 */
import {
  queryAuditLog,
  iterateAuditLog,
  countAuditLog,
  listAuditLogCategories,
  summarizeAuditLogByMonthAndCategory,
  type AuditLogFilters,
  type AuditLogQueryRow,
} from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { ValidationError } from './serviceErrors';
import type { PageViewModel } from '../types/page';

const PAGE_SIZE = 50;
const ACTOR_TYPES = ['admin', 'member', 'system'] as const;

/**
 * The export takes a required date window of at most this many days and
 * returns every row in it. The window, not a row cap, is what keeps a file a
 * manageable size, so the file is always the complete set for its dates.
 */
const EXPORT_MAX_WINDOW_DAYS = 90;
const EXPORT_WINDOW_RULE = 'To export, choose From and To dates no more than 90 days apart.';

export interface AuditLogQuery {
  memberId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionType?: string | null;
  category?: string | null;
  actorType?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  selfActionOnly?: boolean;
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
    entityType: string;
    entityId: string;
    actionType: string;
    category: string;
    actorType: string;
    fromDate: string;
    toDate: string;
    selfActionOnly: boolean;
  };
  categoryOptions: string[];
  actorTypeOptions: string[];
  /** Null when the filters carry no valid export window; exportRule says why. */
  exportCsvHref: string | null;
  exportJsonHref: string | null;
  exportRule: string;
  summaryHref: string;
}

/** One month of the periodic summary: its categories and their counts. */
export interface AuditSummaryMonth {
  month: string;
  monthLabel: string;
  total: number;
  rows: Array<{ category: string; count: number }>;
}

export interface AuditLogSummaryContent {
  months: AuditSummaryMonth[];
  hasMonths: boolean;
  rangeSummary: string;
  backHref: string;
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
      entityType: q.entityType || null,
      entityId: q.entityId || null,
      actionType: q.actionType || null,
      category: q.category || null,
      actorType: q.actorType || null,
      fromDate: q.fromDate || null,
      toDate: expandToDate(q.toDate),
      selfActionOnly: Boolean(q.selfActionOnly),
    },
  };
}

function filterParams(q: AuditLogQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.memberId) p.set('member', q.memberId);
  if (q.entityType && q.entityId) {
    p.set('entityType', q.entityType);
    p.set('entityId', q.entityId);
  }
  if (q.actionType) p.set('actionType', q.actionType);
  if (q.category) p.set('category', q.category);
  if (q.actorType) p.set('actorType', q.actorType);
  if (q.fromDate) p.set('from', q.fromDate);
  if (q.toDate) p.set('to', q.toDate);
  if (q.selfActionOnly) p.set('self', '1');
  return p;
}

function hrefFor(q: AuditLogQuery, page: number): string {
  const p = filterParams(q);
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return qs ? `/admin/audit-log?${qs}` : '/admin/audit-log';
}

// A browse of the log with no dates chosen shows the most recent window, ending
// today so the latest rows are always in it, with the dates filled into the
// form so the reader sees what they are looking at; it is also the window the
// export takes. A member's or an entity's history is a lookup, not a browse,
// and keeps its whole span unless the reader narrows it.
function withDefaultWindow(q: AuditLogQuery, nowMs: number): AuditLogQuery {
  if (q.fromDate || q.toDate || q.memberId || (q.entityType && q.entityId)) return q;
  const to = new Date(nowMs).toISOString().slice(0, 10);
  const from = new Date(nowMs - EXPORT_MAX_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  return { ...q, fromDate: from, toDate: to };
}

function exportHref(q: AuditLogQuery, format: 'csv' | 'json'): string | null {
  if (!exportWindowValid(q)) return null;
  const p = filterParams(q);
  p.set('format', format);
  return `/admin/audit-log/export?${p.toString()}`;
}

const DAY_MS = 86_400_000;

function calendarDate(d: string | null | undefined): number | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ms = Date.parse(`${d}T00:00:00.000Z`);
  return Number.isNaN(ms) ? null : ms;
}

// Both dates given, in order, and no more than the maximum window apart.
function exportWindowValid(q: AuditLogQuery): boolean {
  const from = calendarDate(q.fromDate);
  const to = calendarDate(q.toDate);
  return from !== null && to !== null && to >= from && (to - from) / DAY_MS <= EXPORT_MAX_WINDOW_DAYS;
}

/**
 * The link to an entity's audit history in the viewer: the rows on it and the
 * rows on related entities that name it.
 */
export function auditHistoryHref(entityType: string, entityId: string): string {
  const p = new URLSearchParams({ entityType, entityId });
  return `/admin/audit-log?${p.toString()}`;
}

function summaryHref(q: AuditLogQuery): string {
  const qs = filterParams(q).toString();
  return qs ? `/admin/audit-log/summary?${qs}` : '/admin/audit-log/summary';
}

/** How many months the summary covers when the reader named no range. */
const SUMMARY_DEFAULT_MONTHS = 12;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-08' as 'August 2026'. Unparseable input is shown as it was stored. */
function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const name = MONTH_NAMES[Number(m[2]) - 1];
  return name ? `${name} ${m[1]}` : month;
}

/**
 * The start of the window when the reader named no dates. Without one the
 * summary would grow a row per month forever and the recent months, which are
 * the ones anyone is reporting on, would sink down the page.
 */
function defaultSummaryFrom(nowMs: number): string {
  const d = new Date(nowMs);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - (SUMMARY_DEFAULT_MONTHS - 1));
  return d.toISOString();
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

  readAuditLogPage(requested: AuditLogQuery): PageViewModel<AuditLogContent> {
    const q = withDefaultWindow(requested, Date.now());
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
      page: {
        sectionKey: 'admin', pageKey: 'admin_audit_log', title: 'Audit Log',
        instructions: {
          what: 'Searches the record of every significant change on the platform: who did what, when, and why.',
          why: 'To investigate a member\'s complaint, or to confirm an action was recorded as it should be.',
          how: 'Filter by category, action, member or dates. With no dates and no member filter it shows the last 90 days. A member\'s history shows all of it. Export a window of up to 90 days as a CSV or JSON file, or open the monthly summary.',
          headsUp: ['Entries cannot be edited or deleted here. The platform removes them only after seven years.'],
        },
      },
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
          entityType: q.entityType ?? '',
          entityId: q.entityId ?? '',
          actionType: q.actionType ?? '',
          category: q.category ?? '',
          actorType: q.actorType ?? '',
          fromDate: q.fromDate ?? '',
          toDate: q.toDate ?? '',
          selfActionOnly: Boolean(q.selfActionOnly),
        },
        categoryOptions: listAuditLogCategories(),
        actorTypeOptions: [...ACTOR_TYPES],
        exportCsvHref: exportHref(q, 'csv'),
        exportJsonHref: exportHref(q, 'json'),
        exportRule: EXPORT_WINDOW_RULE,
        summaryHref: summaryHref(q),
      },
    };
  },

  /**
   * The periodic summary the audit story asks for: counts per category per
   * month. It takes the same filters as the list, so it is the filtered view
   * aggregated rather than a second, differently-scoped question, and a reader
   * who narrowed the list can carry that narrowing straight into the summary.
   */
  getAuditLogSummaryPage(q: AuditLogQuery): PageViewModel<AuditLogSummaryContent> {
    return runSqliteRead('admin audit log summary page', () => this.readAuditLogSummaryPage(q));
  },

  readAuditLogSummaryPage(q: AuditLogQuery): PageViewModel<AuditLogSummaryContent> {
    const { filters } = normalize(q);
    // A To date alone sets the end of the window, and the default span runs
    // back from it rather than from today, so a past period is never clipped
    // or emptied. Rehearsal and unknown-origin rows are left out: a summary of
    // activity reports real activity.
    const windowEnd = filters.toDate ? Date.parse(filters.toDate) : Date.now();
    const windowed: AuditLogFilters = {
      ...filters,
      liveOnly: true,
      fromDate: filters.fromDate ?? defaultSummaryFrom(Number.isNaN(windowEnd) ? Date.now() : windowEnd),
    };
    const rows = summarizeAuditLogByMonthAndCategory(windowed);

    const byMonth = new Map<string, AuditSummaryMonth>();
    for (const r of rows) {
      const entry = byMonth.get(r.month) ?? {
        month: r.month,
        monthLabel: monthLabel(r.month),
        total: 0,
        rows: [],
      };
      entry.rows.push({ category: r.category, count: r.n });
      entry.total += r.n;
      byMonth.set(r.month, entry);
    }
    const months = [...byMonth.values()];

    return {
      seo: { title: 'Audit Summary', noindex: true },
      page: {
        sectionKey: 'admin', pageKey: 'admin_audit_summary', title: 'Audit Summary',
        instructions: {
          what: 'Monthly counts of audit entries by category, for the filters you chose.',
          how: 'With no dates it covers the last 12 months.',
        },
      },
      content: {
        months,
        hasMonths: months.length > 0,
        rangeSummary: filters.fromDate === null && filters.toDate === null
          ? `Counts per category for the last ${SUMMARY_DEFAULT_MONTHS} months.`
          : 'Counts per category over the dates you selected.',
        backHref: hrefFor(q, 1),
      },
    };
  },

  /**
   * Every row of the filtered set inside its required date window, as CSV or
   * JSON for incident handoff, produced a piece at a time so the caller can
   * stream it. Refuses a missing, reversed or over-long window. CSV follows
   * RFC 4180: a header row, then one record per row, CRLF line endings. JSON is
   * a bare array of entries.
   */
  getAuditLogExport(
    q: AuditLogQuery,
    format: 'csv' | 'json',
  ): { contentType: string; filename: string; chunks: Iterable<string> } {
    if (!exportWindowValid(q)) {
      throw new ValidationError(EXPORT_WINDOW_RULE);
    }
    const { filters } = normalize(q);
    if (format === 'json') {
      return {
        contentType: 'application/json',
        filename: 'audit-log.json',
        chunks: jsonChunks(iterateAuditLog(filters)),
      };
    }
    return {
      contentType: 'text/csv',
      filename: 'audit-log.csv',
      chunks: csvChunks(iterateAuditLog(filters)),
    };
  },
};

const CSV_HEADER = [
  'occurred_at', 'actor_type', 'actor_member_id', 'actor_name', 'action_type',
  'category', 'entity_type', 'entity_id', 'entity_name', 'reason_text', 'metadata_json',
  'data_origin',
];

function* csvChunks(rows: Iterable<AuditLogQueryRow>): Generator<string> {
  yield `${CSV_HEADER.join(',')}\r\n`;
  for (const r of rows) {
    yield `${[
      r.occurred_at, r.actor_type, r.actor_member_id, r.actor_display_name, r.action_type,
      r.category, r.entity_type, r.entity_id, r.entity_display_name, r.reason_text, r.metadata_json,
      r.data_origin,
    ].map(csvCell).join(',')}\r\n`;
  }
}

function* jsonChunks(rows: Iterable<AuditLogQueryRow>): Generator<string> {
  yield '[';
  let first = true;
  for (const r of rows) {
    yield `${first ? '' : ','}\n${JSON.stringify(r)}`;
    first = false;
  }
  yield '\n]\n';
}
