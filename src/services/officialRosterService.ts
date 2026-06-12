/**
 * Official IFPA Roster reporting service.
 *
 * Reads `official_ifpa_roster_current` (the operational roster surface
 * defined in schema §13D) and shapes the dashboard summary, list, and
 * CSV export per US A_View_Official_Roster_Reports.
 *
 * Pure read service. Every call audit-logs with category='roster_access' and
 * the supplied actorId, so the access record exists independent of how the
 * controller-side authorization is wired.
 *
 * Authorization runs in the controller layer, not here: a roster controller
 * binds the appropriate requireTier middleware (requireTier2Plus / requireTier3
 * in src/middleware/requireTier.ts) to each route so the tier gate runs before
 * this service is reached.
 *
 * The roster view already excludes deceased and soft-deleted members
 * (members_active + is_deceased = 0), and Tier 0 members without current
 * Active Player. This service does not re-filter those.
 */
import {
  officialRoster,
  type OfficialRosterRow,
  type OfficialRosterExportRow,
  type OfficialRosterSummaryRow,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { NotFoundError, ValidationError } from './serviceErrors';

export type MemberTier = 'tier0' | 'tier1' | 'tier2' | 'tier3';

export interface RosterFilter {
  tier?: MemberTier[];
}

export interface RosterByTier {
  tier0_active_player: number;
  tier1: number;
  tier2: number;
  tier3: number;
}

export interface RosterByHonor {
  hof: number;
  bap: number;
  board: number;
}

export interface RosterSummary {
  total: number;
  byTier: RosterByTier;
  byHonor: RosterByHonor;
  totalRegistered: number;
}

const VALID_TIERS: ReadonlySet<MemberTier> = new Set(['tier0', 'tier1', 'tier2', 'tier3']);

function validateFilter(filter: RosterFilter | undefined): MemberTier[] | null {
  if (!filter || !filter.tier || filter.tier.length === 0) return null;
  for (const t of filter.tier) {
    if (!VALID_TIERS.has(t)) {
      throw new ValidationError(`invalid tier filter value: ${t}`);
    }
  }
  return filter.tier;
}

/**
 * List the current Official IFPA Roster. Optional tier filter narrows to a
 * subset of the four tiers (filter applied in-memory; the roster is small).
 *
 * Every call is audit-logged with category='roster_access'.
 */
export function list(actorId: string, filter?: RosterFilter): OfficialRosterRow[] {
  const tierFilter = validateFilter(filter);
  const all = officialRoster.selectAll.all() as OfficialRosterRow[];
  const rows = tierFilter
    ? all.filter((r) => tierFilter.includes(r.tier_status))
    : all;

  appendAuditEntry({
    actionType: 'roster.list',
    category: 'roster_access',
    actorType: 'admin',
    actorMemberId: actorId,
    entityType: 'roster',
    entityId: 'official_ifpa_roster',
    reasonText: null,
    metadata: {
      filter: tierFilter,
      row_count: rows.length,
    },
  });

  return rows;
}

/**
 * Dashboard summary: total roster count, breakdown by tier (with Tier 0
 * Active Player split out), breakdown by special flag (HoF / BAP / Board —
 * may overlap with tier counts), and total registered accounts (including
 * Tier 0 members without Active Player status, for comparison).
 */
export function summary(actorId: string): RosterSummary {
  const row = officialRoster.summary.get() as OfficialRosterSummaryRow;
  const totalRow = officialRoster.totalRegisteredAccounts.get() as { n: number };

  const result: RosterSummary = {
    total: row.total,
    byTier: {
      // Tier 0 members in the roster view are exactly Tier 0 with current AP.
      tier0_active_player: row.tier0_count,
      tier1: row.tier1_count,
      tier2: row.tier2_count,
      tier3: row.tier3_count,
    },
    byHonor: {
      hof: row.hof_count,
      bap: row.bap_count,
      board: row.board_count,
    },
    totalRegistered: totalRow.n,
  };

  appendAuditEntry({
    actionType: 'roster.summary',
    category: 'roster_access',
    actorType: 'admin',
    actorMemberId: actorId,
    entityType: 'roster',
    entityId: 'official_ifpa_roster',
    reasonText: null,
    metadata: {
      total: result.total,
      total_registered: result.totalRegistered,
    },
  });

  return result;
}

/**
 * RFC-4180-ish CSV escape: wrap in double quotes if the field contains
 * comma, double-quote, CR, or LF; double internal quotes. NULL becomes
 * an empty field. We do not escape unicode mischief beyond this; CSV
 * readers are responsible for character-set handling.
 */
function csvEscape(field: string | number | null): string {
  if (field === null) return '';
  const s = typeof field === 'number' ? String(field) : field;
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function isoDate(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function compactDate(now: Date): string {
  return isoDate(now).replace(/-/g, '');
}

/**
 * Export the Official IFPA Roster as CSV. Includes the prescribed header
 * comment line, a column header row, and one row per roster member.
 *
 * Email field is included only when the member's email_visibility is
 * 'members' or 'public' (opt-in); 'private' members appear with an empty
 * email column. Deceased and Tier 0-without-AP members are already
 * excluded by official_ifpa_roster_current.
 *
 * Filename is `official_roster_YYYYMMDD.csv` based on UTC.
 */
export function exportCsv(actorId: string): { csv: string; filename: string } {
  const adminRow = officialRoster.findDisplayNameById.get(actorId) as
    | { display_name: string }
    | undefined;
  if (!adminRow) {
    throw new NotFoundError(`actor ${actorId} not found`);
  }

  const rows = officialRoster.selectAllForExport.all() as OfficialRosterExportRow[];
  const now = new Date();
  const headerComment =
    `# Official IFPA Roster - Tier 1, Tier 2, Tier 3, and Tier 0 Active Player members ` +
    `- Generated ${isoDate(now)} by ${adminRow.display_name}`;
  const columnHeader = [
    'member_id', 'display_name', 'tier_status', 'underlying_tier_status',
    'is_active_player', 'active_player_expires_at',
    'is_hof', 'is_bap', 'is_board',
    'email', 'city', 'region', 'country',
  ].join(',');

  const dataLines = rows.map((r) => {
    const email = r.email_visibility === 'private' ? null : r.login_email;
    return [
      r.member_id,
      r.display_name,
      r.tier_status,
      r.underlying_tier_status,
      r.is_active_player,
      r.active_player_expires_at,
      r.is_hof,
      r.is_bap,
      r.is_board,
      email,
      r.city,
      r.region,
      r.country,
    ].map(csvEscape).join(',');
  });

  const csv = [headerComment, columnHeader, ...dataLines].join('\n') + '\n';
  const filename = `official_roster_${compactDate(now)}.csv`;

  appendAuditEntry({
    actionType: 'roster.export',
    category: 'roster_access',
    actorType: 'admin',
    actorMemberId: actorId,
    entityType: 'roster',
    entityId: 'official_ifpa_roster',
    reasonText: null,
    metadata: {
      row_count: rows.length,
      filename,
    },
  });

  return { csv, filename };
}
