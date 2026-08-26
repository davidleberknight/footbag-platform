/**
 * Official IFPA Roster reporting service.
 *
 * Reads `official_ifpa_roster_current` (the operational roster surface) and
 * shapes the roster page: the summary counts, the searchable and tier-filtered
 * list, and its paging.
 *
 * Pure read service. Every call audit-logs with category='roster_access' and
 * the supplied actorId, so the access record exists independent of how the
 * controller-side authorization is wired.
 *
 * Authorization runs at the route layer, not here: the roster route binds
 * `requireTier2Plus` from src/middleware/requireTier.ts. That gate is the IFPA
 * membership rules' own grant, which lets Tier 2 (IFPA Organizer Member) and
 * above reach the roster for official IFPA event and organizer purposes. Site
 * administrators must already hold Tier 2 or Tier 3, so the one gate serves
 * administrators, directors and organizers alike.
 *
 * The roster is never exported. The IFPA governing documents grant access and
 * say nothing about taking a copy, and they require the roster stay not
 * public; a file, once downloaded, is outside every control the platform has.
 * There is deliberately no CSV, no download route, and no attachment response.
 *
 * A member's sign-in address leaves this service only when that member set
 * their email visibility to 'members'. The raw address is redacted here rather
 * than at the template, so no caller can obtain a private one.
 *
 * The roster view already excludes deceased and soft-deleted members
 * (members_active + is_deceased = 0), and Tier 0 members without current
 * Active Player. This service does not re-filter those.
 */
import {
  officialRoster,
  type OfficialRosterRow,
  type OfficialRosterSummaryRow,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { ValidationError } from './serviceErrors';
import { formatDateDisplay } from './dateFormat';
import type { PageViewModel } from '../types/page';

export type MemberTier = 'tier0' | 'tier1' | 'tier2' | 'tier3';

export interface RosterFilter {
  tier?: MemberTier[];
}

/**
 * A roster member as callers see them: the view's columns, with the sign-in
 * address already redacted to the member's own visibility choice.
 */
export interface OfficialRosterListRow {
  member_id: string;
  display_name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  tier_status: MemberTier;
  underlying_tier_status: 'tier1' | 'tier2' | null;
  is_active_player: 0 | 1;
  active_player_expires_at: string | null;
  is_hof: 0 | 1;
  is_bap: 0 | 1;
  is_board: 0 | 1;
  slug: string | null;
  email: string | null;
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

/** One member as the roster table renders them: labels and flags, no raw codes. */
export interface OfficialRosterMemberViewModel {
  memberId: string;
  displayName: string;
  /** Null when the member has no slug yet, so the name renders unlinked. */
  profileHref: string | null;
  tierLabel: string;
  underlyingTierLabel: string | null;
  activePlayerLabel: string | null;
  isActivePlayer: boolean;
  honorLabels: string[];
  hasHonors: boolean;
  noHonorsLabel: string;
  locationLabel: string | null;
  email: string | null;
  hasEmail: boolean;
}

export interface RosterTierFilterOption {
  value: string;
  label: string;
  href: string;
  isActive: boolean;
}

export interface RosterSummaryRow {
  label: string;
  value: string;
}

export interface OfficialRosterPageContent {
  /** Whole-roster figures, unaffected by the search and tier filter below. */
  summaryRows: RosterSummaryRow[];
  summaryScopeNote: string;
  totalRegistered: number;
  accessNotice: string;
  members: OfficialRosterMemberViewModel[];
  /** The active tier filter, plus the option that returns every tier. */
  tierOptions: RosterTierFilterOption[];
  searchTerm: string;
  hasSearch: boolean;
  isFiltered: boolean;
  clearFiltersHref: string;
  /** Carried in the search form so searching keeps the tier the reader chose. */
  activeTier: string;
  matchCount: number;
  hasMembers: boolean;
  emptyStateText: string;
  backLabel: string;
  backHref: string;
  page: number;
  pageCount: number;
  hasPaging: boolean;
  previousHref: string | null;
  nextHref: string | null;
  rangeLabel: string;
}

export interface RosterPageOptions {
  tier?: MemberTier[];
  q?: string;
  page?: number;
}

const VALID_TIERS: ReadonlySet<MemberTier> = new Set(['tier0', 'tier1', 'tier2', 'tier3']);

/** Roster rows per page. The roster is small; this keeps the table readable. */
const PAGE_SIZE = 50;

const TIER_LABELS: Record<MemberTier, string> = {
  tier0: 'Tier 0 Registered Member',
  tier1: 'Tier 1 IFPA Member',
  tier2: 'Tier 2 IFPA Organizer Member',
  tier3: 'Tier 3 IFPA Director',
};

const TIER_FILTER_LABELS: Record<MemberTier, string> = {
  tier0: 'Tier 0 Active Player',
  tier1: 'Tier 1',
  tier2: 'Tier 2',
  tier3: 'Tier 3',
};

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
 * Redact the sign-in address to the member's own visibility choice. A member
 * who never opted in has no address in anything this service returns.
 */
function toListRow(r: OfficialRosterRow): OfficialRosterListRow {
  return {
    member_id: r.member_id,
    display_name: r.display_name,
    city: r.city,
    region: r.region,
    country: r.country,
    tier_status: r.tier_status,
    underlying_tier_status: r.underlying_tier_status,
    is_active_player: r.is_active_player,
    active_player_expires_at: r.active_player_expires_at,
    is_hof: r.is_hof,
    is_bap: r.is_bap,
    is_board: r.is_board,
    slug: r.slug,
    email: r.email_visibility === 'private' ? null : r.login_email,
  };
}

/**
 * List the current Official IFPA Roster. Optional tier filter narrows to a
 * subset of the four tiers (filter applied in-memory; the roster is small).
 *
 * Every call is audit-logged with category='roster_access'.
 */
export function list(actorId: string, filter?: RosterFilter): OfficialRosterListRow[] {
  const tierFilter = validateFilter(filter);
  const all = (officialRoster.selectAll.all() as OfficialRosterRow[]).map(toListRow);
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

function locationLabel(r: OfficialRosterListRow): string | null {
  const parts = [r.city, r.region, r.country].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(', ') : null;
}

function honorLabels(r: OfficialRosterListRow): string[] {
  const labels: string[] = [];
  if (r.is_hof === 1) labels.push('Hall of Fame');
  if (r.is_bap === 1) labels.push('Big Add Posse');
  if (r.is_board === 1) labels.push('IFPA Board');
  return labels;
}

/**
 * A roster member holding no honours still needs the cell to say so. An empty
 * table cell reads as data the platform failed to load rather than as an
 * answer, which is the same reason location and email carry their own wording.
 */
const NO_HONORS_LABEL = 'None';

function activePlayerLabel(r: OfficialRosterListRow): string | null {
  if (r.is_active_player !== 1) return null;
  return r.active_player_expires_at
    ? `Active Player through ${formatDateDisplay(r.active_player_expires_at)}`
    : 'Active Player';
}

function toMemberViewModel(r: OfficialRosterListRow): OfficialRosterMemberViewModel {
  const honors = honorLabels(r);
  return {
    memberId: r.member_id,
    displayName: r.display_name,
    profileHref: r.slug ? `/members/${r.slug}` : null,
    tierLabel: TIER_LABELS[r.tier_status],
    underlyingTierLabel: r.underlying_tier_status
      ? `Reverts to ${TIER_LABELS[r.underlying_tier_status]}`
      : null,
    activePlayerLabel: activePlayerLabel(r),
    isActivePlayer: r.is_active_player === 1,
    honorLabels: honors,
    hasHonors: honors.length > 0,
    noHonorsLabel: NO_HONORS_LABEL,
    locationLabel: locationLabel(r),
    email: r.email,
    hasEmail: Boolean(r.email),
  };
}

/** Build the query string for a roster link, omitting empty parts. */
function rosterHref(opts: { tier?: string; q?: string; page?: number }): string {
  const params = new URLSearchParams();
  if (opts.tier) params.set('tier', opts.tier);
  if (opts.q) params.set('q', opts.q);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  const qs = params.toString();
  return qs ? `/ifpa/roster?${qs}` : '/ifpa/roster';
}

/**
 * The Official IFPA Roster page: summary counts, then the searchable,
 * tier-filtered, paged list of roster members.
 *
 * Composes `summary` and `list`, so a page view writes one audit row per
 * dataset read. Each records a distinct read of a distinct dataset, which is
 * what the access record is for.
 */
export function getOfficialRosterPage(
  actorId: string,
  opts: RosterPageOptions = {},
): PageViewModel<OfficialRosterPageContent> {
  const tierFilter = opts.tier && opts.tier.length ? opts.tier : undefined;
  const counts = summary(actorId);
  const all = list(actorId, tierFilter ? { tier: tierFilter } : undefined);

  const searchTerm = (opts.q ?? '').trim();
  const needle = searchTerm.toLowerCase();
  const matched = needle
    ? all.filter((r) => r.display_name.toLowerCase().includes(needle))
    : all;

  const matchCount = matched.length;
  const pageCount = Math.max(1, Math.ceil(matchCount / PAGE_SIZE));
  const requested = opts.page && opts.page > 0 ? opts.page : 1;
  const page = Math.min(requested, pageCount);
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = matched.slice(start, start + PAGE_SIZE);

  const activeTier = tierFilter && tierFilter.length === 1 ? tierFilter[0] : null;
  // "All Tiers" leads, so a reader who narrowed to one tier can widen again
  // without losing the search term they typed. Clearing the whole filter set is
  // a separate control beside the search box.
  const tierOptions: RosterTierFilterOption[] = [
    {
      value: '',
      label: 'All Tiers',
      href: rosterHref({ q: searchTerm || undefined }),
      isActive: activeTier === null,
    },
    ...(['tier0', 'tier1', 'tier2', 'tier3'] as MemberTier[]).map((t) => ({
      value: t,
      label: TIER_FILTER_LABELS[t],
      href: rosterHref({ tier: t, q: searchTerm || undefined }),
      isActive: activeTier === t,
    })),
  ];

  const isFiltered = Boolean(activeTier) || Boolean(searchTerm);

  return {
    seo: {
      title: 'Official IFPA Roster',
      description:
        'The Official IFPA Roster of current IFPA members, for official IFPA event and organizer purposes.',
      noindex: true,
    },
    page: {
      sectionKey: 'ifpa',
      pageKey: 'ifpa_roster',
      title: 'Official IFPA Roster',
      // Orientation only. The access and audit terms are a standing condition
      // of reading the page rather than a description of it, so they render as
      // a notice in the body instead of crowding the hero.
      intro: 'Every current IFPA member, with their tier and Active Player standing.',
    },
    navigation: {
      breadcrumbs: [
        { label: 'IFPA', href: '/ifpa' },
        { label: 'Official IFPA Roster' },
      ],
      contextLinks: [{ label: 'Back to IFPA Documents', href: '/ifpa' }],
    },
    content: {
      summaryRows: [
        { label: 'Total on Roster', value: String(counts.total) },
        { label: 'Tier 0 Active Player', value: String(counts.byTier.tier0_active_player) },
        { label: 'Tier 1', value: String(counts.byTier.tier1) },
        { label: 'Tier 2', value: String(counts.byTier.tier2) },
        { label: 'Tier 3', value: String(counts.byTier.tier3) },
        { label: 'Hall of Fame', value: String(counts.byHonor.hof) },
        { label: 'Big Add Posse', value: String(counts.byHonor.bap) },
        { label: 'IFPA Board', value: String(counts.byHonor.board) },
        {
          label: 'Total Registered Accounts (including Tier 0 without current Active Player status)',
          value: String(counts.totalRegistered),
        },
      ],
      summaryScopeNote:
        'These figures cover the whole roster. Searching or filtering below changes the list, not these counts.',
      totalRegistered: counts.totalRegistered,
      accessNotice:
        'The Official IFPA Roster is not public. The IFPA membership rules make it available to Tier 2 members and above for official IFPA event and organizer purposes. It is read here rather than downloaded, and every visit is recorded against your name.',
      members: pageRows.map(toMemberViewModel),
      tierOptions,
      searchTerm,
      hasSearch: Boolean(searchTerm),
      isFiltered,
      clearFiltersHref: '/ifpa/roster',
      activeTier: activeTier ?? '',
      matchCount,
      hasMembers: pageRows.length > 0,
      emptyStateText: isFiltered
        ? 'No roster member matches this search or tier filter.'
        : 'The Official IFPA Roster is empty.',
      backLabel: 'Back to IFPA Documents',
      backHref: '/ifpa',
      page,
      pageCount,
      hasPaging: pageCount > 1,
      previousHref:
        page > 1
          ? rosterHref({ tier: activeTier ?? undefined, q: searchTerm || undefined, page: page - 1 })
          : null,
      nextHref:
        page < pageCount
          ? rosterHref({ tier: activeTier ?? undefined, q: searchTerm || undefined, page: page + 1 })
          : null,
      // Empty is already said by the empty state; repeating it as a range
      // reads as a second, contradictory answer to the same question.
      rangeLabel: matchCount
        ? `Showing ${start + 1} to ${start + pageRows.length} of ${matchCount}`
        : '',
    },
  };
}
