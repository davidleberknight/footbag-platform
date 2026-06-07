/**
 * ClubCleanupService -- club viability evaluation and admin cleanup queue.
 *
 * Owns:
 *   - `crowdsource_club_viability` predicate (G1-G4 gates per US 7.2);
 *     gates weigh onboarding-wizard signals, one vote per member (latest
 *     signal per member wins); queue items name the members whose latest
 *     answer was negative (admin-only authorship exposure)
 *   - `leaderless_active_club` predicate
 *   - `stale_provisional_leader` predicate
 *   - Admin club cleanup queue page shaping (with category/region filter
 *     and sort, applied in-service on the assembled queue)
 *   - Admin-home backlog badge (open-item count plus oldest-item age,
 *     computed from the same queue assembly so badge and queue agree)
 *   - Admin club cleanup resolution (demote, archive, dismiss, defer)
 *   - Candidate-flag queue group: wizard activity answers about unpromoted
 *     candidates (candidate-keyed signal rows, club_id NULL), grouped per
 *     candidate with one vote per member and admin-only negative-reporter
 *     names; resolved by terminal dismiss or defer. Club-keyed signals stay
 *     the exclusive territory of the viability gates, so a vote never
 *     surfaces on both
 *   - Admin override entry point for candidate promotion (the queue lists
 *     unpromoted non-junk candidates with a promote action)
 *   - Candidate cleanup actions: demote (onboarding-visible to dormant),
 *     archive, junk handling (confirm junk as terminal, or return a junk
 *     candidate to dormant for further evaluation); guarded writes turn a
 *     concurrent admin's repeat action into an audited no-op
 *   - Candidate defer: an unpromoted candidate leaves the queue for 30/90/180
 *     days and re-surfaces with a deferred-by annotation when the window
 *     expires; there is no unbounded defer. The promotable item and the
 *     candidate-flag item carry separate resolutions, so deferring one never
 *     hides the other
 *   - Admin de-list of unconfirmed legacy residue (pending -> former_only),
 *     also cascaded when a club is demoted or archived
 *   - Group-level bulk actions: bulk defer across a predicate group or the
 *     candidate-flag group (one shared reason, one audit row per item), and
 *     bulk de-list across all residue clubs (each club in its own
 *     transaction, idempotent). Bulk covers the items currently in the
 *     group; promotable and junk candidates have no bulk action because
 *     their resolutions are per-item judgment calls
 *   - Concurrent-admin claim markers: a non-blocking "claimed by Admin X at
 *     time T" coordination hint per queue item, auto-released by any resolve
 *     action and stale after 30 minutes; deliberately un-audited (a claim is
 *     a hint, not a resolution)
 *
 * Does not own:
 *   - Club lifecycle (ClubService)
 *   - The promotion transaction itself (ClubService.promoteCandidate;
 *     this service only delegates the admin trigger)
 *   - Signal collection during onboarding (MemberOnboardingService writes signals)
 *
 * Persistence:
 *   club_viability_signals (read: club-keyed rows feed the gates,
 *   candidate-keyed rows feed the candidate-flag group),
 *   club_cleanup_resolutions (read + write),
 *   candidate_cleanup_resolutions (read + write),
 *   club_cleanup_claims (read + write),
 *   clubs (status write on resolution),
 *   legacy_person_club_affiliations (residue read + de-list write),
 *   club_leaders (read), member_club_affiliations (read),
 *   club_bootstrap_leaders (read),
 *   legacy_club_candidates (read + classification/lifecycle cleanup writes),
 *   audit_entries (append).
 *
 * Service shape: singleton object (no external adapters).
 */
import {
  clubViabilitySignals,
  clubCleanupResolutions,
  candidateCleanupResolutions,
  clubCleanupClaims,
  clubCleanupPredicates,
  clubLeaders,
  memberClubAffiliations,
  legacyClubCandidates,
  legacyPersonClubAffiliations,
  clubs as clubsDb,
  transaction,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { clubService } from './clubService';
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
  // Gates weigh onboarding-wizard signals, one vote per member (a member's
  // latest answer wins, so re-posts and changed answers never inflate them).
  const counts = clubViabilitySignals.countWizardByClub.get(clubId) as SignalCounts | undefined;

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
  region: string | null;
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
  region: string | null;
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
  const rows = clubCleanupResolutions.listAll.all() as ResolutionRow[];
  const map = new Map<string, ResolutionRow>();
  for (const r of rows) {
    map.set(`${r.club_id}:${r.predicate_name}`, r);
  }
  return map;
}

// Candidate queue items carry one predicate name per item type so a defer
// on one item never hides the other: the promotable listing and the
// wizard-flag group resolve independently for the same candidate.
const PROMOTABLE_PREDICATE = 'promotable_candidate';
const CANDIDATE_FLAG_PREDICATE = 'candidate_flags';

// Candidate-flag items can carry any unpromoted classification (the wizard
// shows a card whenever an affiliation suggests the candidate), so the
// label map covers the full enum, unlike the promotable listing which only
// ever holds onboarding-visible and dormant rows.
const CLASSIFICATION_LABELS: Record<string, string> = {
  pre_populate: 'Pre-populate',
  onboarding_visible: 'Onboarding-visible',
  dormant: 'Dormant',
  junk: 'Junk-flagged',
};

interface CandidateResolutionRow {
  candidate_id: string;
  predicate_name: string;
  resolution: string;
  deferred_until: string | null;
  reason_text: string | null;
  deferred_by_name: string | null;
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

// A defer hides the item only while its window is open; an expired defer
// re-surfaces the item carrying the deferred-by annotation.
function isStillDeferred(res: CandidateResolutionRow | undefined): boolean {
  return res?.resolution === 'deferred' && !!res.deferred_until
    && new Date(res.deferred_until) > new Date();
}

function deferAnnotationFrom(res: CandidateResolutionRow | undefined): string | null {
  return res?.resolution === 'deferred'
    ? `previously deferred by ${res.deferred_by_name ?? 'an admin'}${res.reason_text ? `, reason: ${res.reason_text}` : ''}`
    : null;
}

// ---------------------------------------------------------------------------
// Admin cleanup queue page
// ---------------------------------------------------------------------------

export type PredicateSource = 'crowdsource_viability' | 'leaderless_active' | 'stale_provisional';

export interface CleanupQueueItem {
  clubId: string;
  clubName: string;
  clubCity: string | null;
  clubRegion: string | null;
  clubCountry: string | null;
  clubStatus: string;
  predicate: PredicateSource;
  predicateLabel: string;
  detail: string;
  recommendedAction: string;
  // Sort inputs, not rendered: negative-signal weight and the timestamp the
  // item has been open since (the club's last update stands in for predicate
  // items, which carry no dedicated opened-at of their own).
  flagCount: number;
  openSince: string;
  claimLabel: string | null;
}

// Unconfirmed legacy residue: live clubs that still carry 'pending'
// affiliations. Listed separately from the predicate queue (which never flags
// healthy active clubs) so an admin can de-list residue regardless of club
// status. The age label exposes how long the oldest row has sat so the admin
// applies a long, advisory grace period; nothing here transitions on a timer.
export interface ResidueItem {
  clubId: string;
  clubName: string;
  clubCity: string | null;
  clubRegion: string | null;
  clubCountry: string | null;
  clubStatus: string;
  pendingCount: number;
  oldestPendingAt: string;
  oldestPendingAgeLabel: string;
  claimLabel: string | null;
}

interface ResidueRow {
  club_id: string;
  club_name: string;
  club_city: string | null;
  club_region: string | null;
  club_country: string | null;
  club_status: string;
  pending_count: number;
  oldest_pending_at: string;
}

// Unpromoted non-junk candidates: onboarding_visible / dormant rows with no
// live clubs row yet. Listed so the admin can exercise the override
// promotion path; member-confirmation promotion happens in the wizard.
export interface PromotableCandidateItem {
  candidateId: string;
  displayName: string;
  city: string | null;
  region: string | null;
  country: string | null;
  classificationLabel: string;
  createdAt: string;
  // Set when an earlier defer window has expired: the item is back in the
  // queue and the annotation tells the next admin who parked it and why.
  deferAnnotation: string | null;
  claimLabel: string | null;
}

// Wizard activity flags about unpromoted candidates, grouped per candidate.
// These are the activity answers a member leaves while declining or
// correcting a card whose club candidate has no live clubs row yet; they
// cannot feed the viability gates (no club to evaluate), so the queue
// surfaces them for human judgment. Counting matches the gates: one vote
// per member, latest answer wins. Negative-reporter names are admin-only.
export interface CandidateFlagItem {
  candidateId: string;
  displayName: string;
  city: string | null;
  region: string | null;
  country: string | null;
  classificationLabel: string;
  detail: string;
  flagCount: number;
  oldestFlagAt: string;
  deferAnnotation: string | null;
  claimLabel: string | null;
}

// Junk-flagged candidates awaiting an admin verdict. Junk never renders on
// any public surface; the queue is where an admin confirms the verdict or
// rescues the candidate back to dormant.
export interface JunkCandidateItem {
  candidateId: string;
  displayName: string;
  city: string | null;
  region: string | null;
  country: string | null;
  createdAt: string;
  claimLabel: string | null;
}

export interface CleanupQueueFilter {
  category?: string;
  region?: string;
  sort?: string;
}

interface FilterOption {
  value: string;
  label: string;
  selected: boolean;
}

interface CleanupQueueFilters {
  category: string | null;
  region: string | null;
  sort: string | null;
  categoryOptions: FilterOption[];
  sortOptions: FilterOption[];
  isFiltered: boolean;
}

// Predicate items render grouped by category, collapsed by default; the
// admin expands a group to its per-row table. The predicate key lets the
// group header carry its bulk-defer form.
interface CleanupQueueItemGroup {
  label: string;
  predicate: PredicateSource;
  count: number;
  items: CleanupQueueItem[];
}

interface CleanupQueueContent {
  itemGroups: CleanupQueueItemGroup[];
  totalItems: number;
  residue: ResidueItem[];
  candidates: PromotableCandidateItem[];
  junkCandidates: JunkCandidateItem[];
  candidateFlags: CandidateFlagItem[];
  filters: CleanupQueueFilters;
}

export interface BacklogBadge {
  openCount: number;
  oldestOpenAt: string | null;
  oldestOpenAgeLabel: string | null;
  hasBacklog: boolean;
}

function monthsAgeLabel(since: string): string {
  const months = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / (1000 * 60 * 60 * 24 * 30)),
  );
  if (months < 1) return 'under 1 month';
  return `${months} month${months === 1 ? '' : 's'}`;
}

interface SignalListRow {
  club_id: string;
  club_name: string;
  club_city: string | null;
  club_region: string | null;
  club_country: string | null;
  club_status: string;
  club_updated_at: string;
  active_count: number;
  not_active_count: number;
  never_heard_count: number;
  not_sure_count: number;
  total_count: number;
}

interface AssembledQueue {
  items: CleanupQueueItem[];
  residue: ResidueItem[];
  candidates: PromotableCandidateItem[];
  junkCandidates: JunkCandidateItem[];
  candidateFlags: CandidateFlagItem[];
}

// Negative votes are rare and admins judge them by who cast them, so queue
// items name the members whose latest answer was negative. Admin queue
// only: signal authorship is never exposed on public surfaces.
function negativeReporterSuffix(
  reporters: Array<{ display_name: string; activity_signal: string }>,
): string {
  const saidInactive = reporters.filter((r) => r.activity_signal === 'not_active').map((r) => r.display_name);
  const saidNeverHeard = reporters.filter((r) => r.activity_signal === 'never_heard_of_it').map((r) => r.display_name);
  const reporterParts: string[] = [];
  if (saidInactive.length) reporterParts.push(`inactive per: ${saidInactive.join(', ')}`);
  if (saidNeverHeard.length) reporterParts.push(`never heard of it per: ${saidNeverHeard.join(', ')}`);
  return reporterParts.length ? ` (${reporterParts.join('; ')})` : '';
}

// ---------------------------------------------------------------------------
// Concurrent-admin claim markers
// ---------------------------------------------------------------------------

const CLAIM_STALE_MINUTES = 30;

interface ClaimRow {
  item_type: string;
  item_id: string;
  claimed_at: string;
  claimed_by_name: string;
}

function loadActiveClaims(): Map<string, ClaimRow> {
  const cutoff = new Date(Date.now() - CLAIM_STALE_MINUTES * 60 * 1000).toISOString();
  const map = new Map<string, ClaimRow>();
  for (const r of clubCleanupClaims.listActiveClaims.all(cutoff) as ClaimRow[]) {
    map.set(`${r.item_type}:${r.item_id}`, r);
  }
  return map;
}

function claimLabelFrom(
  claims: Map<string, ClaimRow>,
  itemType: 'club' | 'candidate',
  itemId: string,
): string | null {
  const c = claims.get(`${itemType}:${itemId}`);
  if (!c) return null;
  return `claimed by ${c.claimed_by_name} at ${c.claimed_at.slice(0, 16).replace('T', ' ')}`;
}

// Single assembly point for everything the queue surfaces. The backlog badge
// counts the same arrays the queue page renders, so the badge can never
// disagree with what the admin finds after clicking through.
function assembleQueue(): AssembledQueue {
  const resolutions = getActiveResolutions();
  const claims = loadActiveClaims();
  const items: CleanupQueueItem[] = [];

  const signalRows = clubViabilitySignals.listClubsWithWizardSignals.all() as SignalListRow[];
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
    const reporters = clubViabilitySignals.listNegativeWizardReportersByClub.all(row.club_id) as
      Array<{ display_name: string; activity_signal: string }>;
    const reporterSuffix = negativeReporterSuffix(reporters);

    items.push({
      clubId: row.club_id,
      clubName: row.club_name,
      clubCity: row.club_city,
      clubRegion: row.club_region,
      clubCountry: row.club_country,
      clubStatus: row.club_status,
      predicate: 'crowdsource_viability',
      predicateLabel: 'Crowdsource viability',
      detail: `${row.active_count} active, ${row.not_active_count} inactive, ${row.never_heard_count} never heard${reporterSuffix}`,
      recommendedAction,
      flagCount: row.not_active_count + row.never_heard_count,
      openSince: row.club_updated_at,
      claimLabel: claimLabelFrom(claims, 'club', row.club_id),
    });
  }

  const leaderless = findLeaderlessActiveClubs();
  for (const row of leaderless) {
    if (isResolved(resolutions, row.club_id, 'leaderless_active')) continue;
    items.push({
      clubId: row.club_id,
      clubName: row.club_name,
      clubCity: row.city,
      clubRegion: row.region,
      clubCountry: row.country,
      clubStatus: row.status,
      predicate: 'leaderless_active',
      predicateLabel: 'Leaderless active club',
      detail: 'Active club with no leaders',
      recommendedAction: 'Demote to inactive or find a leader',
      flagCount: 0,
      openSince: row.last_updated,
      claimLabel: claimLabelFrom(claims, 'club', row.club_id),
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
      clubRegion: first.region,
      clubCountry: first.country,
      clubStatus: 'active',
      predicate: 'stale_provisional',
      predicateLabel: 'Stale provisional leader',
      detail: `${leaders.length} provisional leader(s) since ${first.provisional_since.slice(0, 10)}`,
      recommendedAction: 'Review or dismiss',
      flagCount: leaders.length,
      openSince: first.provisional_since,
      claimLabel: claimLabelFrom(claims, 'club', clubId),
    });
  }

  const residueRows = legacyPersonClubAffiliations.listUnconfirmedResidueByClub.all() as ResidueRow[];
  const residue: ResidueItem[] = residueRows.map((r) => ({
    clubId: r.club_id,
    clubName: r.club_name,
    clubCity: r.club_city,
    clubRegion: r.club_region,
    clubCountry: r.club_country,
    clubStatus: r.club_status,
    pendingCount: r.pending_count,
    oldestPendingAt: r.oldest_pending_at,
    oldestPendingAgeLabel: monthsAgeLabel(r.oldest_pending_at),
    claimLabel: claimLabelFrom(claims, 'club', r.club_id),
  }));

  const candidateRows = legacyClubCandidates.listPromotableForQueue.all() as Array<{
    id: string;
    display_name: string;
    city: string | null;
    region: string | null;
    country: string | null;
    classification: 'onboarding_visible' | 'dormant';
    created_at: string;
  }>;
  const candidateResolutions = new Map<string, CandidateResolutionRow>();
  for (const r of candidateCleanupResolutions.listAll.all() as CandidateResolutionRow[]) {
    candidateResolutions.set(`${r.candidate_id}:${r.predicate_name}`, r);
  }
  const candidates: PromotableCandidateItem[] = [];
  for (const r of candidateRows) {
    const res = candidateResolutions.get(`${r.id}:${PROMOTABLE_PREDICATE}`);
    if (isStillDeferred(res)) continue;
    candidates.push({
      candidateId: r.id,
      displayName: r.display_name,
      city: r.city,
      region: r.region,
      country: r.country,
      classificationLabel: r.classification === 'dormant' ? 'Dormant' : 'Onboarding-visible',
      createdAt: r.created_at,
      deferAnnotation: deferAnnotationFrom(res),
      claimLabel: claimLabelFrom(claims, 'candidate', r.id),
    });
  }

  // Wizard flags about unpromoted candidates, grouped per candidate. Rows
  // here are candidate-keyed signals only; club-keyed signals stay with the
  // viability gates above, so a vote never surfaces twice. Dismiss is
  // terminal; an expired defer re-surfaces with the deferred-by annotation.
  const flagRows = clubViabilitySignals.listCandidatesWithFlags.all() as Array<{
    candidate_id: string;
    display_name: string;
    city: string | null;
    region: string | null;
    country: string | null;
    classification: string;
    oldest_flag_at: string;
    active_count: number;
    not_active_count: number;
    never_heard_count: number;
    not_sure_count: number;
    total_count: number;
  }>;
  const candidateFlags: CandidateFlagItem[] = [];
  for (const r of flagRows) {
    const res = candidateResolutions.get(`${r.candidate_id}:${CANDIDATE_FLAG_PREDICATE}`);
    if (res?.resolution === 'dismissed') continue;
    if (isStillDeferred(res)) continue;
    const reporters = clubViabilitySignals.listNegativeCandidateReporters.all(r.candidate_id) as
      Array<{ display_name: string; activity_signal: string }>;
    candidateFlags.push({
      candidateId: r.candidate_id,
      displayName: r.display_name,
      city: r.city,
      region: r.region,
      country: r.country,
      classificationLabel: CLASSIFICATION_LABELS[r.classification] ?? r.classification,
      detail: `${r.active_count} active, ${r.not_active_count} inactive, ${r.never_heard_count} never heard${negativeReporterSuffix(reporters)}`,
      flagCount: r.not_active_count + r.never_heard_count,
      oldestFlagAt: r.oldest_flag_at,
      deferAnnotation: deferAnnotationFrom(res),
      claimLabel: claimLabelFrom(claims, 'candidate', r.candidate_id),
    });
  }

  const junkRows = legacyClubCandidates.listJunkForQueue.all() as Array<{
    id: string;
    display_name: string;
    city: string | null;
    region: string | null;
    country: string | null;
    created_at: string;
  }>;
  const junkCandidates: JunkCandidateItem[] = junkRows.map((r) => ({
    candidateId: r.id,
    displayName: r.display_name,
    city: r.city,
    region: r.region,
    country: r.country,
    createdAt: r.created_at,
    claimLabel: claimLabelFrom(claims, 'candidate', r.id),
  }));

  return { items, residue, candidates, junkCandidates, candidateFlags };
}

// ---------------------------------------------------------------------------
// Queue filter and sort
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'crowdsource_viability', label: 'Crowdsource viability' },
  { value: 'leaderless_active', label: 'Leaderless active club' },
  { value: 'stale_provisional', label: 'Stale provisional leader' },
  { value: 'candidate_flag', label: 'Wizard flags by candidate' },
  { value: 'residue', label: 'Unconfirmed residue' },
  { value: 'candidate', label: 'Promotable candidates' },
  { value: 'junk_candidate', label: 'Junk-flagged candidates' },
];

const SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'age', label: 'Age (oldest first)' },
  { value: 'category', label: 'Category' },
  { value: 'region', label: 'Region' },
  { value: 'flag_count', label: 'Flag count' },
  { value: 'source', label: 'Source surface' },
];

// Unknown query values fall back to "no filter" rather than erroring: the
// queue is an admin working surface and a stale bookmark must still render.
function normalizeFilter(filter: CleanupQueueFilter | undefined): {
  category: string | null;
  region: string | null;
  sort: string | null;
} {
  const category = CATEGORY_OPTIONS.some((o) => o.value === filter?.category)
    ? filter!.category!
    : null;
  const sort = SORT_OPTIONS.some((o) => o.value === filter?.sort)
    ? filter!.sort!
    : null;
  const region = typeof filter?.region === 'string' && filter.region.trim()
    ? filter.region.trim()
    : null;
  return { category, region, sort };
}

function matchesRegion(region: string | null, ...fields: Array<string | null>): boolean {
  if (!region) return true;
  const needle = region.toLowerCase();
  // Region matches the geographic columns loosely: admins think "Quebec" or
  // "Canada" interchangeably, and many legacy rows carry only a country.
  return fields.some((f) => f != null && f.toLowerCase() === needle);
}

function compareNullableStrings(a: string | null, b: string | null): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' });
}

function applyFilterAndSort(
  queue: AssembledQueue,
  filter: { category: string | null; region: string | null; sort: string | null },
): AssembledQueue {
  const { category, region, sort } = filter;

  const showPredicate = (p: PredicateSource): boolean => category === null || category === p;
  let items = queue.items.filter(
    (i) => showPredicate(i.predicate) && matchesRegion(region, i.clubRegion, i.clubCountry),
  );
  let residue = (category === null || category === 'residue')
    ? queue.residue.filter((r) => matchesRegion(region, r.clubRegion, r.clubCountry))
    : [];
  let candidates = (category === null || category === 'candidate')
    ? queue.candidates.filter((c) => matchesRegion(region, c.region, c.country))
    : [];
  let junkCandidates = (category === null || category === 'junk_candidate')
    ? queue.junkCandidates.filter((c) => matchesRegion(region, c.region, c.country))
    : [];
  let candidateFlags = (category === null || category === 'candidate_flag')
    ? queue.candidateFlags.filter((c) => matchesRegion(region, c.region, c.country))
    : [];

  if (sort === 'age') {
    items = [...items].sort((a, b) => a.openSince.localeCompare(b.openSince));
    residue = [...residue].sort((a, b) => a.oldestPendingAt.localeCompare(b.oldestPendingAt));
    candidates = [...candidates].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    junkCandidates = [...junkCandidates].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    candidateFlags = [...candidateFlags].sort((a, b) => a.oldestFlagAt.localeCompare(b.oldestFlagAt));
  } else if (sort === 'flag_count') {
    items = [...items].sort((a, b) => b.flagCount - a.flagCount);
    residue = [...residue].sort((a, b) => b.pendingCount - a.pendingCount);
    candidateFlags = [...candidateFlags].sort((a, b) => b.flagCount - a.flagCount);
  } else if (sort === 'region') {
    items = [...items].sort((a, b) =>
      compareNullableStrings(a.clubRegion ?? a.clubCountry, b.clubRegion ?? b.clubCountry));
    residue = [...residue].sort((a, b) =>
      compareNullableStrings(a.clubRegion ?? a.clubCountry, b.clubRegion ?? b.clubCountry));
    candidates = [...candidates].sort((a, b) =>
      compareNullableStrings(a.region ?? a.country, b.region ?? b.country));
    junkCandidates = [...junkCandidates].sort((a, b) =>
      compareNullableStrings(a.region ?? a.country, b.region ?? b.country));
    candidateFlags = [...candidateFlags].sort((a, b) =>
      compareNullableStrings(a.region ?? a.country, b.region ?? b.country));
  } else if (sort === 'category' || sort === 'source') {
    // Category and source surface coincide on this queue: each item's
    // category IS the surface it came from (a predicate, the residue
    // aggregation, or the candidate list). Both keys group the items table
    // by predicate; residue and candidates already render as their own
    // tables, so their order is unchanged.
    items = [...items].sort((a, b) => a.predicateLabel.localeCompare(b.predicateLabel));
  }

  return { items, residue, candidates, junkCandidates, candidateFlags };
}

// ---------------------------------------------------------------------------
// Admin cleanup queue page + admin-home backlog badge
// ---------------------------------------------------------------------------

function getCleanupQueuePage(filter?: CleanupQueueFilter): PageViewModel<CleanupQueueContent> {
  const normalized = normalizeFilter(filter);
  const { items, residue, candidates, junkCandidates, candidateFlags } =
    applyFilterAndSort(assembleQueue(), normalized);

  // Group predicate items by category for the collapsed-by-default
  // presentation; group order follows the items' (possibly sorted) order.
  const itemGroups: CleanupQueueItemGroup[] = [];
  const groupsByLabel = new Map<string, CleanupQueueItemGroup>();
  for (const item of items) {
    let group = groupsByLabel.get(item.predicateLabel);
    if (!group) {
      group = { label: item.predicateLabel, predicate: item.predicate, count: 0, items: [] };
      groupsByLabel.set(item.predicateLabel, group);
      itemGroups.push(group);
    }
    group.items.push(item);
    group.count += 1;
  }

  const filters: CleanupQueueFilters = {
    category: normalized.category,
    region: normalized.region,
    sort: normalized.sort,
    categoryOptions: CATEGORY_OPTIONS.map((o) => ({ ...o, selected: o.value === normalized.category })),
    sortOptions: SORT_OPTIONS.map((o) => ({ ...o, selected: o.value === normalized.sort })),
    isFiltered: normalized.category !== null || normalized.region !== null || normalized.sort !== null,
  };

  return {
    seo: { title: 'Club Cleanup Queue' },
    page: { sectionKey: 'admin', pageKey: 'admin_club_cleanup', title: 'Club Cleanup Queue' },
    content: {
      itemGroups,
      totalItems: items.length,
      residue,
      candidates,
      junkCandidates,
      candidateFlags,
      filters,
    },
  };
}

// Backlog badge for the admin home page: how much queue work is waiting and
// how long the oldest item has waited, visible without opening the queue.
// Evaluated fresh on each admin-home load; there is no background process.
function getBacklogBadge(): BacklogBadge {
  const { items, residue, candidates, junkCandidates, candidateFlags } = assembleQueue();
  const openCount = items.length + residue.length + candidates.length
    + junkCandidates.length + candidateFlags.length;

  const timestamps = [
    ...items.map((i) => i.openSince),
    ...residue.map((r) => r.oldestPendingAt),
    ...candidates.map((c) => c.createdAt),
    ...junkCandidates.map((c) => c.createdAt),
    ...candidateFlags.map((c) => c.oldestFlagAt),
  ].filter((t) => typeof t === 'string' && t.length > 0);
  const oldestOpenAt = timestamps.length ? timestamps.reduce((a, b) => (a < b ? a : b)) : null;

  return {
    openCount,
    oldestOpenAt,
    oldestOpenAgeLabel: oldestOpenAt ? monthsAgeLabel(oldestOpenAt) : null,
    hasBacklog: openCount > 0,
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

function deferredUntilFor(action: string): string {
  const days = DEFER_DAYS[action] ?? 30;
  const until = new Date();
  until.setDate(until.getDate() + days);
  return until.toISOString();
}

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

    let residueDelisted = 0;
    if (action === 'demote_inactive') {
      clubsDb.updateStatus.run('inactive', now, adminMemberId, clubId);
    } else if (action === 'archive') {
      clubsDb.updateStatus.run('archived', now, adminMemberId, clubId);
    }
    // Scrubbing a defunct club also retires its unconfirmed legacy residue so a
    // demoted/archived club's roster does not linger as "possible members".
    if (action === 'demote_inactive' || action === 'archive') {
      residueDelisted = legacyPersonClubAffiliations.delistResidueByClub.run(adminMemberId, clubId).changes;
    }

    let resolution: string;
    let deferredUntil: string | null = null;
    if (action.startsWith('defer_')) {
      resolution = 'deferred';
      deferredUntil = deferredUntilFor(action);
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
    clubCleanupClaims.releaseClaim.run('club', clubId);

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
        residue_delisted: residueDelisted,
      },
    });
  });
}

// Claim a queue item for review: a non-blocking coordination hint shown to
// other admins. Always succeeds for a live item (a re-claim refreshes the
// marker); no audit row is written because a claim is a hint, not a
// resolution. Release happens on any resolve action or via the 30-minute
// staleness window.
function claimItem(
  adminMemberId: string,
  itemType: 'club' | 'candidate',
  itemId: string,
): void {
  if (itemType !== 'club' && itemType !== 'candidate') {
    throw new ValidationError(`Invalid item type: ${itemType}`);
  }
  const exists = itemType === 'club'
    ? clubsDb.findById.get(itemId)
    : legacyClubCandidates.findById.get(itemId);
  if (!exists) {
    throw new NotFoundError('Item not found');
  }

  const now = new Date().toISOString();
  const claimId = `ccl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  clubCleanupClaims.upsertClaim.run(claimId, now, adminMemberId, itemType, itemId, adminMemberId, now);
}

// ---------------------------------------------------------------------------
// Candidate resolution actions
// ---------------------------------------------------------------------------

type CandidateResolveAction =
  | 'defer_30' | 'defer_90' | 'defer_180' | 'dismiss'
  | 'demote' | 'archive' | 'confirm_junk' | 'promote_dormant';

export type CandidateResolveResult =
  | { status: 'applied'; action: CandidateResolveAction }
  | { status: 'noop'; action: CandidateResolveAction };

// Resolve a candidate queue item. The predicate names which of the
// candidate's queue items is being resolved: the promotable listing (the
// default) or the wizard-flag group; each carries its own resolution row,
// so resolving one never hides the other. Defer and dismiss are flag-style
// actions: defer parks any item until the window expires (it re-surfaces
// carrying the deferred-by annotation); dismiss is the terminal flag
// resolution and applies only to the wizard-flag item, since the promotable
// item's terminal states move the candidate itself. Every other action
// moves the candidate's own state: demote (onboarding-visible to dormant),
// archive (terminal), confirm_junk (terminal verdict on a junk-flagged
// candidate), promote_dormant (junk back to dormant for further
// evaluation). State actions use guarded writes; when the precondition no
// longer holds (a concurrent admin acted first) the result is a no-op,
// reported but not audited, never a double transition.
function resolveCandidate(
  adminMemberId: string,
  candidateId: string,
  action: CandidateResolveAction,
  reasonText: string | null,
  predicate: string = PROMOTABLE_PREDICATE,
): CandidateResolveResult {
  const validActions: ReadonlySet<string> = new Set([
    'defer_30', 'defer_90', 'defer_180', 'dismiss',
    'demote', 'archive', 'confirm_junk', 'promote_dormant',
  ]);
  if (!validActions.has(action)) {
    throw new ValidationError(`Invalid action: ${action}`);
  }
  if (predicate !== PROMOTABLE_PREDICATE && predicate !== CANDIDATE_FLAG_PREDICATE) {
    throw new ValidationError(`Invalid predicate: ${predicate}`);
  }
  const isFlagStyle = action.startsWith('defer_') || action === 'dismiss';
  if (action === 'dismiss' && predicate !== CANDIDATE_FLAG_PREDICATE) {
    throw new ValidationError('Dismiss applies only to wizard-flag items.');
  }
  if (predicate === CANDIDATE_FLAG_PREDICATE && !isFlagStyle) {
    throw new ValidationError(`Invalid action for wizard-flag items: ${action}`);
  }
  const candidate = legacyClubCandidates.findById.get(candidateId);
  if (!candidate) {
    throw new NotFoundError('Candidate not found');
  }

  let result: CandidateResolveResult = { status: 'applied', action };
  transaction(() => {
    const now = new Date().toISOString();

    if (isFlagStyle) {
      const deferredUntil = action === 'dismiss' ? null : deferredUntilFor(action);
      const resId = `cdr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      candidateCleanupResolutions.upsert.run(
        resId, now, adminMemberId,
        candidateId, predicate,
        action === 'dismiss' ? 'dismissed' : 'deferred',
        deferredUntil, adminMemberId, reasonText,
      );
      clubCleanupClaims.releaseClaim.run('candidate', candidateId);

      appendAuditEntry({
        actionType: action === 'dismiss'
          ? 'admin.club_cleanup.candidate_dismiss'
          : 'admin.club_cleanup.candidate_defer',
        category: 'admin',
        actorType: 'admin',
        actorMemberId: adminMemberId,
        entityType: 'legacy_club_candidate',
        entityId: candidateId,
        reasonText,
        metadata: {
          action,
          predicate,
          deferred_until: deferredUntil,
        },
      });
      return;
    }

    let changes = 0;
    if (action === 'demote') {
      changes = legacyClubCandidates.demoteToDormant.run(now, adminMemberId, candidateId).changes;
    } else if (action === 'archive') {
      changes = legacyClubCandidates.archiveCandidate.run(now, adminMemberId, candidateId).changes;
    } else if (action === 'confirm_junk') {
      changes = legacyClubCandidates.confirmJunkCandidate.run(now, adminMemberId, candidateId).changes;
    } else {
      changes = legacyClubCandidates.junkToDormant.run(now, adminMemberId, candidateId).changes;
    }

    if (changes === 0) {
      result = { status: 'noop', action };
      return;
    }
    clubCleanupClaims.releaseClaim.run('candidate', candidateId);

    appendAuditEntry({
      actionType: `admin.club_cleanup.candidate_${action}`,
      category: 'admin',
      actorType: 'admin',
      actorMemberId: adminMemberId,
      entityType: 'legacy_club_candidate',
      entityId: candidateId,
      reasonText,
      metadata: { action },
    });
  });
  return result;
}

// ---------------------------------------------------------------------------
// De-list unconfirmed legacy residue (per-club, admin one-click)
// ---------------------------------------------------------------------------

// Retire a single club's unconfirmed legacy residue: flip its 'pending'
// affiliations to 'former_only'. Safe to re-run (touches only 'pending').
// The per-row updated_by/updated_at/version stamp plus one summary audit
// entry record the action; delistedCount reports how many rows were retired.
function delistUnconfirmedResidue(
  adminMemberId: string,
  clubId: string,
  reasonText: string | null,
): { delistedCount: number } {
  let delistedCount = 0;
  transaction(() => {
    delistedCount = legacyPersonClubAffiliations.delistResidueByClub.run(adminMemberId, clubId).changes;
    clubCleanupClaims.releaseClaim.run('club', clubId);
    appendAuditEntry({
      actionType: 'admin.club_cleanup.delist_residue',
      category: 'admin',
      actorType: 'admin',
      actorMemberId: adminMemberId,
      entityType: 'club',
      entityId: clubId,
      reasonText,
      metadata: {
        action: 'delist_residue',
        predicate: 'unconfirmed_residue',
        delisted_count: delistedCount,
      },
    });
  });
  return { delistedCount };
}

// ---------------------------------------------------------------------------
// Group-level bulk actions
// ---------------------------------------------------------------------------

// Bulk defer a whole queue group: every item currently in the group gets
// its own deferred resolution, claim release, and audit row, under one
// shared reason. Defer is the only bulk-safe flag action because a bulk
// mistake self-heals: the items re-surface when the window expires,
// carrying the deferred-by annotation. Items already resolved or deferred
// are not in the assembled group, so re-running is a natural no-op.
// Promotable and junk candidates have no bulk action; their resolutions
// are per-item judgment calls.
function bulkDeferGroup(
  adminMemberId: string,
  group: string,
  action: string,
  reasonText: string | null,
): { deferredCount: number } {
  const validGroups: ReadonlySet<string> = new Set([
    'crowdsource_viability', 'leaderless_active', 'stale_provisional', 'candidate_flag',
  ]);
  if (!validGroups.has(group)) {
    throw new ValidationError(`Invalid bulk group: ${group}`);
  }
  if (!(action in DEFER_DAYS)) {
    throw new ValidationError(`Invalid bulk action: ${action}`);
  }

  const queue = assembleQueue();
  const deferredUntil = deferredUntilFor(action);
  let deferredCount = 0;

  transaction(() => {
    const now = new Date().toISOString();

    if (group === 'candidate_flag') {
      for (const item of queue.candidateFlags) {
        const resId = `cdr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        candidateCleanupResolutions.upsert.run(
          resId, now, adminMemberId,
          item.candidateId, CANDIDATE_FLAG_PREDICATE,
          'deferred', deferredUntil, adminMemberId, reasonText,
        );
        clubCleanupClaims.releaseClaim.run('candidate', item.candidateId);
        appendAuditEntry({
          actionType: 'admin.club_cleanup.candidate_defer',
          category: 'admin',
          actorType: 'admin',
          actorMemberId: adminMemberId,
          entityType: 'legacy_club_candidate',
          entityId: item.candidateId,
          reasonText,
          metadata: {
            action,
            predicate: CANDIDATE_FLAG_PREDICATE,
            deferred_until: deferredUntil,
            bulk: true,
          },
        });
        deferredCount += 1;
      }
      return;
    }

    for (const item of queue.items) {
      if (item.predicate !== group) continue;
      const resId = `ccr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      clubCleanupResolutions.upsert.run(
        resId, now, adminMemberId,
        item.clubId, item.predicate,
        'deferred', deferredUntil, reasonText,
      );
      clubCleanupClaims.releaseClaim.run('club', item.clubId);
      appendAuditEntry({
        actionType: `admin.club_cleanup.${action}`,
        category: 'admin',
        actorType: 'admin',
        actorMemberId: adminMemberId,
        entityType: 'club',
        entityId: item.clubId,
        reasonText,
        metadata: {
          action,
          predicate: item.predicate,
          deferred_until: deferredUntil,
          bulk: true,
        },
      });
      deferredCount += 1;
    }
  });

  return { deferredCount };
}

// Bulk de-list across every club currently carrying unconfirmed residue.
// Each club runs through the existing per-club de-list in its own
// transaction, so the action stays idempotent and a mid-run failure leaves
// completed clubs cleanly de-listed rather than rolling everything back.
function bulkDelistResidue(
  adminMemberId: string,
  reasonText: string | null,
): { clubsProcessed: number; totalDelisted: number } {
  const { residue } = assembleQueue();
  let totalDelisted = 0;
  for (const item of residue) {
    totalDelisted += delistUnconfirmedResidue(adminMemberId, item.clubId, reasonText).delistedCount;
  }
  return { clubsProcessed: residue.length, totalDelisted };
}

// ---------------------------------------------------------------------------
// Admin override promotion (candidate -> live club)
// ---------------------------------------------------------------------------

// The cleanup queue owns the admin entry point; the promotion transaction
// itself (deterministic id, hashtag derivation, carry-forward, audit) lives
// in ClubService so the wizard's member-confirmation triggers share it.
async function promoteCandidate(
  adminMemberId: string,
  candidateId: string,
  reasonText: string | null,
): Promise<{ branch: 'promoted' | 'already_promoted'; clubId: string }> {
  const result = await clubService.promoteCandidate(candidateId, adminMemberId, {
    actorType: 'admin',
    reasonText,
    trigger: 'admin_queue',
  });
  // The promotion transaction lives in ClubService; releasing the claim
  // afterwards is fine because a leftover marker is only a hint and would
  // expire on its own.
  clubCleanupClaims.releaseClaim.run('candidate', candidateId);
  return result;
}

export const clubCleanupService = {
  evaluateClubViability,
  getCleanupQueuePage,
  getBacklogBadge,
  claimItem,
  resolveClub,
  resolveCandidate,
  delistUnconfirmedResidue,
  bulkDeferGroup,
  bulkDelistResidue,
  promoteCandidate,
};
