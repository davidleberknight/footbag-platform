/**
 * ClubCleanupService -- club viability evaluation and admin cleanup queue.
 *
 * Owns:
 *   - `crowdsource_club_viability` predicate (G1-G4 gates per US 7.2)
 *   - `leaderless_active_club` predicate
 *   - `stale_provisional_leader` predicate
 *   - Admin club cleanup queue page shaping
 *   - Admin club cleanup resolution (demote, archive, dismiss, defer)
 *   - Club detail page signal submission
 *
 * Does not own:
 *   - Club lifecycle (ClubService)
 *   - Signal collection during onboarding (MemberOnboardingService writes signals)
 *
 * Persistence:
 *   club_viability_signals (read + write for detail page signals),
 *   club_cleanup_resolutions (read + write),
 *   clubs (status write on resolution),
 *   club_leaders (read), member_club_affiliations (read),
 *   club_bootstrap_leaders (read), legacy_club_candidates (read),
 *   audit_entries (append).
 *
 * Service shape: singleton object (no external adapters).
 */
import {
  clubViabilitySignals,
  clubCleanupResolutions,
  clubCleanupPredicates,
  clubLeaders,
  memberClubAffiliations,
  legacyClubCandidates,
  clubs as clubsDb,
  transaction,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';

// ---------------------------------------------------------------------------
// Crowdsource club viability predicate (G1-G4)
// ---------------------------------------------------------------------------

export type ViabilityGate =
  | 'G1_confirmed_active'
  | 'G2_concordant_inactive'
  | 'G3_weak_inactive'
  | 'G4_needs_review'
  | 'no_signals';

export interface ClubViabilityResult {
  clubId: string;
  gate: ViabilityGate;
  s1AnyActive: boolean;
  s2AnyInactive: boolean;
  s3ConcordantInactive: boolean;
  l1StrongLegacy: boolean;
  o1HasOperationalLife: boolean;
}

interface SignalCounts {
  active_count: number;
  not_active_count: number;
  never_heard_count: number;
  not_sure_count: number;
  total_count: number;
}

function evaluateClubViability(clubId: string): ClubViabilityResult {
  const counts = clubViabilitySignals.countByClub.get(clubId) as SignalCounts | undefined;

  const s1 = (counts?.active_count ?? 0) > 0;
  const s2 = (counts?.not_active_count ?? 0) > 0;
  const s3 = (counts?.not_active_count ?? 0) >= 2;

  const candidateRow = legacyClubCandidates.findByMappedClubId.get(clubId) as
    | { classification: string; r1: number; r2: number; r3: number; r4: number } | undefined;
  const l1 = candidateRow?.classification === 'pre_populate'
    && candidateRow.r1 === 1 && candidateRow.r2 === 1;

  const leaderCount = (clubLeaders.countByClubId.get(clubId) as { c: number } | undefined)?.c ?? 0;
  const memberCount = (memberClubAffiliations.countCurrentByClubId.get(clubId) as { c: number } | undefined)?.c ?? 0;
  const o1 = leaderCount > 0 || memberCount > 0;

  let gate: ViabilityGate;
  if (!counts || counts.total_count === 0) {
    gate = 'no_signals';
  } else if (s1) {
    gate = 'G1_confirmed_active';
  } else if (s3 && !s1 && !o1) {
    gate = 'G2_concordant_inactive';
  } else if (s2 && !s3 && !s1 && !o1 && !l1) {
    gate = 'G3_weak_inactive';
  } else if (s2 && !s3 && !s1 && !o1 && l1) {
    gate = 'G4_needs_review';
  } else {
    gate = 'no_signals';
  }

  return { clubId, gate, s1AnyActive: s1, s2AnyInactive: s2, s3ConcordantInactive: s3, l1StrongLegacy: l1, o1HasOperationalLife: o1 };
}

// ---------------------------------------------------------------------------
// Leaderless active club predicate
// ---------------------------------------------------------------------------

interface LeaderlessClubRow {
  club_id: string;
  club_name: string;
  city: string | null;
  country: string | null;
  status: string;
  last_updated: string;
}

function findLeaderlessActiveClubs(): LeaderlessClubRow[] {
  return clubCleanupPredicates.leaderlessActiveClubs.all() as LeaderlessClubRow[];
}

// ---------------------------------------------------------------------------
// Stale provisional leader predicate
// ---------------------------------------------------------------------------

interface StaleLeaderRow {
  bootstrap_leader_id: string;
  club_id: string;
  club_name: string;
  city: string | null;
  country: string | null;
  role: string;
  provisional_since: string;
}

function findStaleProvisionalLeaders(): StaleLeaderRow[] {
  return clubCleanupPredicates.staleProvisionalLeaders.all() as StaleLeaderRow[];
}

// ---------------------------------------------------------------------------
// Resolution tracking
// ---------------------------------------------------------------------------

interface ResolutionRow {
  club_id: string;
  predicate_name: string;
  resolution: string;
  deferred_until: string | null;
}

function getActiveResolutions(): Map<string, ResolutionRow> {
  const rows = clubCleanupResolutions.listActive.all() as ResolutionRow[];
  const map = new Map<string, ResolutionRow>();
  for (const r of rows) {
    map.set(`${r.club_id}:${r.predicate_name}`, r);
  }
  return map;
}

function isResolved(resolutions: Map<string, ResolutionRow>, clubId: string, predicate: string): boolean {
  const key = `${clubId}:${predicate}`;
  const r = resolutions.get(key);
  if (!r) return false;
  if (r.resolution === 'deferred' && r.deferred_until) {
    return new Date(r.deferred_until) > new Date();
  }
  return true;
}

// ---------------------------------------------------------------------------
// Admin cleanup queue page
// ---------------------------------------------------------------------------

export type PredicateSource = 'crowdsource_viability' | 'leaderless_active' | 'stale_provisional';

export interface CleanupQueueItem {
  clubId: string;
  clubName: string;
  clubCity: string | null;
  clubCountry: string | null;
  clubStatus: string;
  predicate: PredicateSource;
  predicateLabel: string;
  detail: string;
  recommendedAction: string;
}

interface CleanupQueueContent {
  items: CleanupQueueItem[];
  totalItems: number;
}

interface SignalListRow {
  club_id: string;
  club_name: string;
  club_city: string | null;
  club_country: string | null;
  club_status: string;
  active_count: number;
  not_active_count: number;
  never_heard_count: number;
  not_sure_count: number;
  total_count: number;
}

function getCleanupQueuePage(): PageViewModel<CleanupQueueContent> {
  const resolutions = getActiveResolutions();
  const items: CleanupQueueItem[] = [];

  const signalRows = clubViabilitySignals.listClubsWithSignals.all() as SignalListRow[];
  for (const row of signalRows) {
    if (isResolved(resolutions, row.club_id, 'crowdsource_viability')) continue;
    const viability = evaluateClubViability(row.club_id);
    if (viability.gate === 'G1_confirmed_active' || viability.gate === 'no_signals') continue;

    let recommendedAction: string;
    switch (viability.gate) {
      case 'G2_concordant_inactive': recommendedAction = 'Demote to inactive'; break;
      case 'G3_weak_inactive': recommendedAction = 'Demote to inactive'; break;
      case 'G4_needs_review': recommendedAction = 'Review: strong legacy contradicts negative signal'; break;
      default: recommendedAction = 'Review'; break;
    }
    items.push({
      clubId: row.club_id,
      clubName: row.club_name,
      clubCity: row.club_city,
      clubCountry: row.club_country,
      clubStatus: row.club_status,
      predicate: 'crowdsource_viability',
      predicateLabel: 'Crowdsource viability',
      detail: `${row.active_count} active, ${row.not_active_count} inactive, ${row.never_heard_count} never heard`,
      recommendedAction,
    });
  }

  const leaderless = findLeaderlessActiveClubs();
  for (const row of leaderless) {
    if (isResolved(resolutions, row.club_id, 'leaderless_active')) continue;
    items.push({
      clubId: row.club_id,
      clubName: row.club_name,
      clubCity: row.city,
      clubCountry: row.country,
      clubStatus: row.status,
      predicate: 'leaderless_active',
      predicateLabel: 'Leaderless active club',
      detail: 'Active club with no leaders',
      recommendedAction: 'Demote to inactive or find a leader',
    });
  }

  const staleLeaders = findStaleProvisionalLeaders();
  const staleByClub = new Map<string, StaleLeaderRow[]>();
  for (const row of staleLeaders) {
    const arr = staleByClub.get(row.club_id) ?? [];
    arr.push(row);
    staleByClub.set(row.club_id, arr);
  }
  for (const [clubId, leaders] of staleByClub) {
    if (isResolved(resolutions, clubId, 'stale_provisional')) continue;
    const first = leaders[0];
    items.push({
      clubId,
      clubName: first.club_name,
      clubCity: first.city,
      clubCountry: first.country,
      clubStatus: 'active',
      predicate: 'stale_provisional',
      predicateLabel: 'Stale provisional leader',
      detail: `${leaders.length} provisional leader(s) since ${first.provisional_since.slice(0, 10)}`,
      recommendedAction: 'Review or dismiss',
    });
  }

  return {
    seo: { title: 'Club Cleanup Queue' },
    page: { sectionKey: 'admin', pageKey: 'admin_club_cleanup', title: 'Club Cleanup Queue' },
    content: {
      items,
      totalItems: items.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution actions
// ---------------------------------------------------------------------------

type ResolveAction = 'demote_inactive' | 'archive' | 'dismiss' | 'defer_30' | 'defer_90' | 'defer_180';

const DEFER_DAYS: Record<string, number> = {
  defer_30: 30,
  defer_90: 90,
  defer_180: 180,
};

function resolveClub(
  adminMemberId: string,
  clubId: string,
  predicate: string,
  action: ResolveAction,
  reasonText: string | null,
): void {
  const validActions: ReadonlySet<string> = new Set([
    'demote_inactive', 'archive', 'dismiss', 'defer_30', 'defer_90', 'defer_180',
  ]);
  if (!validActions.has(action)) {
    throw new ValidationError(`Invalid action: ${action}`);
  }

  transaction(() => {
    const now = new Date().toISOString();

    if (action === 'demote_inactive') {
      clubsDb.updateStatus.run('inactive', now, adminMemberId, clubId);
    } else if (action === 'archive') {
      clubsDb.updateStatus.run('archived', now, adminMemberId, clubId);
    }

    let resolution: string;
    let deferredUntil: string | null = null;
    if (action.startsWith('defer_')) {
      resolution = 'deferred';
      const days = DEFER_DAYS[action] ?? 30;
      const until = new Date();
      until.setDate(until.getDate() + days);
      deferredUntil = until.toISOString();
    } else if (action === 'demote_inactive') {
      resolution = 'demoted';
    } else if (action === 'archive') {
      resolution = 'archived';
    } else {
      resolution = 'dismissed';
    }

    const resId = `ccr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    clubCleanupResolutions.upsert.run(
      resId, now, adminMemberId,
      clubId, predicate,
      resolution, deferredUntil, reasonText,
    );

    appendAuditEntry({
      actionType: `admin.club_cleanup.${action}`,
      category: 'admin',
      actorType: 'admin',
      actorMemberId: adminMemberId,
      entityType: 'club',
      entityId: clubId,
      reasonText,
      metadata: {
        action,
        predicate,
        deferred_until: deferredUntil,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Club detail page signal submission
// ---------------------------------------------------------------------------

type DetailActivitySignal = 'active' | 'not_active' | 'not_sure' | 'never_heard_of_it';

function submitClubDetailSignal(
  memberId: string,
  clubId: string,
  activitySignal: DetailActivitySignal,
): void {
  const now = new Date().toISOString();
  clubViabilitySignals.insertSignal.run(
    `cvs_detail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    now,
    'club_detail_page',
    memberId,
    clubId,
    'club_detail',
    activitySignal,
    null,
    null,
  );
}

export const clubCleanupService = {
  evaluateClubViability,
  getCleanupQueuePage,
  resolveClub,
  submitClubDetailSignal,
};
