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
 *   - Admin club cleanup resolution (demote, archive, dismiss, park). A parked
 *     club stays in the parked listing until the working queue has actually
 *     taken it back, so no club falls between the two listings. The action, the
 *     predicate and the club are all validated: an unknown predicate would
 *     write a resolution the queue can never look up again, and an archived club
 *     refuses every action because archiving is terminal
 *   - An admin's own promotion of a candidate counts as the club's record
 *     saying it exists, so the rules never undo it
 *   - Contact-members action on a leaderless club: emails the club's current
 *     members the volunteer-to-co-lead invitation (audit-logged, no link).
 *     This sends only; it does not resolve the item, so the leaderless
 *     opportunity resurfaces until a member volunteers
 *   - Candidate-flag queue group: wizard activity answers about unpromoted
 *     candidates (candidate-keyed signal rows, club_id NULL), grouped per
 *     candidate with one vote per member and admin-only negative-reporter
 *     names; resolved by terminal dismiss or by parking. Club-keyed signals stay
 *     the exclusive territory of the viability gates, so a vote never
 *     surfaces on both
 *   - Admin override entry point for candidate promotion (the queue lists
 *     unpromoted non-junk candidates with a promote action)
 *   - Candidate cleanup actions: demote (onboarding-visible to dormant),
 *     archive, junk handling (confirm junk as terminal, or return a junk
 *     candidate to dormant for further evaluation); guarded writes turn a
 *     concurrent admin's repeat action into an audited no-op
 *   - Candidate park: an unpromoted candidate leaves the working queue with no
 *     deadline and stays listed as parked with who parked it and why. The
 *     promotable item and the candidate-flag item carry separate resolutions,
 *     so parking one never hides the other. Like a parked club, it returns to
 *     the working queue by itself once a member says something about it after
 *     the park; an unpromoted candidate has no club row, so that evidence is
 *     the signal and note rows keyed to the candidate itself. It leaves the
 *     parked listing only when the working queue has really taken it back,
 *     never on the evidence comparison alone, so a candidate promoted or
 *     retired since the park still shows somewhere
 *   - Admin de-list of unconfirmed legacy residue (pending -> former_only),
 *     also cascaded when a club is demoted or archived
 *   - Archiving is refused while a club still has a current member or
 *     co-leader, because no admin can end an affiliation and an archived club
 *     can be neither reached nor left; demotion is the action for those
 *   - Group-level bulk actions: bulk park across a predicate group or the
 *     candidate-flag group (one shared reason, one audit row per item). Bulk
 *     covers the items currently in the group; promotable and junk candidates
 *     have no bulk action because their resolutions are per-item judgment
 *     calls. De-listing residue is per-club only: retiring a club's unconfirmed
 *     legacy roster is a judgment about that club, so there is no queue-wide
 *     de-list
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
 *   club_leaders (read),
 *   member_club_affiliations (read),
 *   club_bootstrap_leaders (read),
 *   legacy_club_candidates (read + classification/lifecycle cleanup writes),
 *   audit_entries (append).
 *
 * Side effects: audit_entries append; outbox_emails enqueue (the
 * contact-members action only), best-effort after the read.
 *
 * Service shape: singleton object (no external adapters).
 */
import {
  clubEvidence,
  candidateEvidence,
  clubInsightNotes,
  clubViabilitySignals,
  clubCleanupResolutions,
  candidateCleanupResolutions,
  clubCleanupClaims,
  clubCleanupPredicates,
  clubLeaders,
  legacyClubCandidates,
  legacyPersonClubAffiliations,
  memberClubAffiliations,
  clubs as clubsDb,
  transaction,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { clubService } from './clubService';
import { emailService } from './emailService';
import { logger } from '../config/logger';
import { PageViewModel } from '../types/page';
import { subdivisionsForCountry } from './countryUtils';

// ---------------------------------------------------------------------------
// Club evidence
// ---------------------------------------------------------------------------

// One club's full evidence row. The operational columns are what let a verdict
// be reached for the roughly one club in three that can never receive a member
// vote, and newest_evidence_at is what returns a parked club to the queue.
export interface ClubEvidenceRow {
  club_id: string;
  club_name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  status: string;
  club_updated_at: string;
  has_description: number;
  has_external_url: number;
  url_verified: number;
  leader_count: number;
  current_member_count: number;
  hosted_event_count: number;
  result_entry_count: number;
  pending_residue_count: number;
  insight_note_count: number;
  // The legacy record, aggregated across every candidate row that resolved to
  // this club. A club can carry a junk or half-empty record alongside its good
  // one, so the classification arrives as one flag per kind and the strongest
  // governs rather than whichever row the query happened to meet first.
  candidate_row_count: number;
  // Set when an admin promoted one of those candidates into this live club.
  any_admin_promoted: number | null;
  any_pre_populate: number | null;
  any_onboarding_visible: number | null;
  ever_hosted: number | null;
  last_hosted_year: number | null;
  max_affiliated_member_last_year: number | null;
  unique_member_names: number | null;
  linkable_member_count: number | null;
  active_votes: number;
  inactive_votes: number;
  newest_evidence_at: string | null;
}

// ---------------------------------------------------------------------------
// One verdict per club
// ---------------------------------------------------------------------------

// The queue exists for the cases the evidence leaves genuinely open, not for
// paperwork. One verdict per club decides which of three things happens:
// nothing, a demotion the rules make on their own, or a row an admin judges.
//
// These are rules over hard facts, not a score with tunable weights. Each
// condition is something that is simply true or false about the club: does
// anyone lead it, does anyone belong to it, did a member vouch for it or write
// it off, did it ever host an event. Applied in order, the first match wins.
//
// A club is never required to have a website, so whether it has one, and
// whether that address once passed its safety and reachability check, says
// nothing about whether the club exists. It is not part of any rule here.
//
// Most clubs carry no member vote at all and many never will, so the rules must
// reach a verdict without one. That is what the hosting fact does: a club that
// never once hosted an event and that nobody leads or belongs to has nothing on
// any side of the ledger saying it exists.
export type ClubVerdict = 'alive' | 'defunct_by_rule' | 'needs_review' | 'waiting';

export interface ClubVerdictResult {
  clubId: string;
  verdict: ClubVerdict;
  activeVotes: number;
  inactiveVotes: number;
  hasCurrentPeople: boolean;
  everHostedEvent: boolean;
  wasEstablished: boolean;
  adminPromoted: boolean;
  hasMemberNote: boolean;
}

function evaluateClubVerdict(row: ClubEvidenceRow): ClubVerdictResult {
  const activeVotes = row.active_votes;
  const inactiveVotes = row.inactive_votes;
  const hasCurrentPeople = row.leader_count > 0 || row.current_member_count > 0;
  // Either source of the same fact counts: an event this platform records as
  // hosted here, or the mirror-derived hosting flag the import pipeline
  // computed for clubs whose events predate the platform.
  const everHostedEvent = row.hosted_event_count > 0 || row.ever_hosted === 1;
  // The import pipeline's own verdict on what kind of club this is. It weighed
  // the mirror evidence once, at import, and its answer is a fact here rather
  // than something to re-derive: established clubs were pre-populated, clubs it
  // could not settle were marked for members to confirm during onboarding, and
  // the rest it judged dormant or junk.
  // The strongest record a club carries governs: a club known to have been
  // established stays established even when a junk record also landed on it,
  // and a club any record marked for members to confirm still gets asked about
  // rather than written off.
  // An admin who promoted a candidate into a live club has decided the club is
  // real, and that is the club's record speaking as loudly as the import
  // pipeline ever did. It carries the same weight here, so the rules never
  // demote a club an admin just created, and a member who later writes it off
  // is contradicting the record and gets a person to judge it.
  const adminPromoted = row.any_admin_promoted === 1;
  const wasEstablished = row.any_pre_populate === 1 || adminPromoted;
  // A member who wrote about the club has spoken about it, and the rules cannot
  // read a sentence. A club carrying one is therefore not a club whose record
  // says nothing: it goes to a person, who can read it, rather than being
  // written off with the sentence unread.
  const hasMemberNote = row.insight_note_count > 0;
  const awaitingConfirmation = row.any_onboarding_visible === 1;
  const notEstablished = row.candidate_row_count > 0 && !wasEstablished && !awaitingConfirmation;

  let verdict: ClubVerdict;
  if (hasCurrentPeople || activeVotes > 0) {
    // Someone leads it, belongs to it, or vouched for it. Nothing else matters.
    verdict = 'alive';
  } else if (inactiveVotes > 0) {
    // A member wrote it off. That settles it only where the club's own record
    // agrees; event history or an established-club classification is the club
    // pushing back, and a person decides those.
    verdict = everHostedEvent || wasEstablished || hasMemberNote ? 'needs_review' : 'defunct_by_rule';
  } else if (wasEstablished) {
    verdict = 'alive';
  } else if (notEstablished && !everHostedEvent) {
    // Nothing on any side says this club exists: never ran an event, nobody
    // leads or belongs to it, and the pipeline did not judge it established.
    // Unless a member wrote about it, in which case something does.
    verdict = hasMemberNote ? 'needs_review' : 'defunct_by_rule';
  } else {
    // No member has spoken and the record is not empty enough to rule on. These
    // are the clubs the onboarding wizard exists to ask about, so they are
    // neither demoted nor put in front of an admin; they wait for an answer.
    verdict = 'waiting';
  }

  return {
    clubId: row.club_id,
    verdict,
    activeVotes,
    inactiveVotes,
    hasCurrentPeople,
    everHostedEvent,
    wasEstablished,
    adminPromoted,
    hasMemberNote,
  };
}

// The rules act on the clubs they settle, so the admin never clicks through a
// decision that was never in doubt. Runs when an admin opens the queue, which
// is the only trigger there is: nothing here happens unattended.
//
// A club an admin has already ruled on is left alone, including a parked one. A
// park is an explicit "not now" from a person, so new evidence returns that club
// to the queue as a human decision rather than resolving it behind their back.
// The clubs the rules will demote the next time an admin opens the queue. Both
// the sweep and the queue assembly ask this one question, so the backlog badge
// can never count work that is about to resolve itself: an admin who sees a
// count and clicks through finds exactly that count waiting.
function clubsPendingRuleDemotion(
  evidence: ClubEvidenceRow[],
  resolutions: Map<string, ResolutionRow>,
): Set<string> {
  const pending = new Set<string>();
  for (const row of evidence) {
    if (row.status !== 'active') continue;
    const res = resolutions.get(`${row.club_id}:crowdsource_viability`);
    if (res && !isStaleDemotion(res, row.status)) continue;
    if (evaluateClubVerdict(row).verdict !== 'defunct_by_rule') continue;
    pending.add(row.club_id);
  }
  return pending;
}

// A demote is a verdict about a club that looked finished. A member claiming or
// joining it puts it back to active, and that contradicts the verdict outright,
// so the verdict stops speaking for the club and the predicates evaluate it
// fresh like any other live club. Without this one admin demote silences a club
// permanently: it leaves both the rules sweep and the working queue, and no
// amount of later evidence brings it back. Only a demotion goes stale this way.
// An archive is terminal, and a dismissal is a judgment about the flags rather
// than about whether the club is alive.
function isStaleDemotion(res: ResolutionRow, clubStatus: string): boolean {
  return res.resolution === 'demoted' && clubStatus === 'active';
}

function applyRuleVerdicts(
  evidence: ClubEvidenceRow[],
  resolutions: Map<string, ResolutionRow>,
): number {
  let demoted = 0;
  const pending = clubsPendingRuleDemotion(evidence, resolutions);

  for (const row of evidence) {
    if (!pending.has(row.club_id)) continue;

    const verdict = evaluateClubVerdict(row);
    const now = new Date().toISOString();
    transaction(() => {
      clubsDb.updateStatus.run('inactive', now, 'club_cleanup_rules', row.club_id);
      // A demoted club's unconfirmed legacy roster goes with it, exactly as it
      // does when an admin demotes by hand.
      const residueDelisted = legacyPersonClubAffiliations
        .delistResidueByClub.run('club_cleanup_rules', row.club_id).changes;

      appendAuditEntry({
        actionType: 'club.auto_demoted',
        category: 'club_lifecycle',
        actorType: 'system',
        actorMemberId: null,
        entityType: 'club',
        entityId: row.club_id,
        reasonText: null,
        // The evidence that decided it, so the row explains itself without a
        // re-run of the rules against data that has since moved on.
        metadata: {
          club_name: row.club_name,
          was_established: verdict.wasEstablished,
          legacy_record_count: row.candidate_row_count,
          ever_hosted_event: verdict.everHostedEvent,
          leader_count: row.leader_count,
          current_member_count: row.current_member_count,
          active_votes: verdict.activeVotes,
          inactive_votes: verdict.inactiveVotes,
          residue_delisted: residueDelisted,
        },
      });
    });
    demoted += 1;
  }

  return demoted;
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
  club_status: string;
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
  created_at: string;
  reason_text: string | null;
  parked_by_name: string | null;
}

function getActiveResolutions(): Map<string, ResolutionRow> {
  const rows = clubCleanupResolutions.listAll.all() as ResolutionRow[];
  const map = new Map<string, ResolutionRow>();
  for (const r of rows) {
    map.set(`${r.club_id}:${r.predicate_name}`, r);
  }
  return map;
}

// Candidate queue items carry one predicate name per item type so parking
// on one item never hides the other: the promotable listing and the
// wizard-flag group resolve independently for the same candidate.
const PROMOTABLE_PREDICATE = 'promotable_candidate';
const CANDIDATE_FLAG_PREDICATE = 'candidate_flags';

// The club-side predicates the working queue assembles. A resolution is keyed
// on club and predicate, and the queue only ever looks up these three names, so
// a row stored under any other name can never be matched again: it would sit in
// the parked listing permanently with nothing able to reach it.
const CLUB_PREDICATES: ReadonlySet<string> = new Set([
  'crowdsource_viability', 'leaderless_active', 'stale_provisional',
]);

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
  created_at: string;
  reason_text: string | null;
  parked_by_name: string | null;
}

// A parked club leaves the working queue and does not come back on a clock. It
// comes back when the club's evidence changes, because that is the only new
// information a second look could act on: a member answering a card or leaving
// a note after the park makes the parked judgment stale, so the item returns.
// Anything else stays parked, visible in the parked listing rather than lost.
function isResolved(
  resolutions: Map<string, ResolutionRow>,
  clubId: string,
  predicate: string,
  newestEvidenceAt?: string | null,
  clubStatus?: string,
): boolean {
  const key = `${clubId}:${predicate}`;
  const r = resolutions.get(key);
  if (!r) return false;
  if (r.resolution === 'parked') {
    if (newestEvidenceAt && newestEvidenceAt > r.created_at) return false;
    return true;
  }
  if (clubStatus !== undefined && isStaleDemotion(r, clubStatus)) return false;
  return true;
}

// A parked candidate leaves the working queue on the same terms as a parked
// club: no clock, no window to expire, and a return only when a member says
// something about it after the park. The candidate's evidence is keyed to the
// candidate itself, since an unpromoted candidate has no club row to hang it on.
function isParked(
  res: CandidateResolutionRow | undefined,
  newestEvidenceAt?: string | null,
): boolean {
  if (res?.resolution !== 'parked') return false;
  if (newestEvidenceAt && newestEvidenceAt > res.created_at) return false;
  return true;
}

function parkAnnotationFrom(res: CandidateResolutionRow | undefined): string | null {
  return res?.resolution === 'parked'
    ? `parked by ${res.parked_by_name ?? 'an admin'}${res.reason_text ? `, reason: ${res.reason_text}` : ''}`
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
  // Only a leaderless-active item offers the add-co-leader and contact-members
  // controls; the service decides which rows show them so the template branches
  // on a boolean rather than the predicate enum.
  showLeaderlessControls: boolean;
  // Opportunity items (the "Needs Leader" list) are a tolerated state, not
  // remediation work: they render as a separate low-priority section and offer
  // no demote or dismiss action, because demotion stays driven only by the
  // crowdsourced inactivity signals and a standing opportunity is not something
  // to dismiss. Archive is offered, for the club an admin has confirmed defunct;
  // it is refused while the club still has a member or co-leader, so lacking a
  // co-leader can never on its own retire a club.
  isOpportunity?: boolean;
  // Sort inputs, not rendered: negative-signal weight and the timestamp the
  // item has been open since (the club's last update stands in for predicate
  // items, which carry no dedicated opened-at of their own).
  flagCount: number;
  openSince: string;
  claimLabel: string | null;
  // What members wrote about this club in the wizard, beyond the two fixed
  // answers. Rendered on this admin surface only, and only where it can change
  // a decision: it is the one place free text is worth an admin's attention.
  insightNotes: InsightNoteView[];
}

export interface InsightNoteView {
  authorDisplayName: string;
  text: string;
  at: string;
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

// Clubs store the full state or province name, so that is what the control
// offers and submits. A candidate that already carries one needs no prompt:
// its value descends from the curated club seed and outranks anything an
// admin would supply now.
function promotionRegionPrompt(
  country: string | null,
  region: string | null,
): { needsRegion: boolean; regionOptions: Array<{ value: string; label: string }> } {
  const subdivisions = subdivisionsForCountry(country ?? '');
  const needsRegion = subdivisions.length > 0 && !region;
  return {
    needsRegion,
    regionOptions: needsRegion ? subdivisions.map((s) => ({ value: s.label, label: s.label })) : [],
  };
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
  // Set when this candidate was parked before: the annotation tells the next
  // admin who parked it and why.
  parkAnnotation: string | null;
  claimLabel: string | null;
  /**
   * The mirror these candidates came from recorded no state or province, and
   * the country page groups clubs by one only when every club in the country
   * has it, so promoting without it flattens the whole listing. The form asks
   * the admin when the candidate has none and its country uses them.
   */
  needsRegion: boolean;
  regionOptions: Array<{ value: string; label: string }>;
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
  parkAnnotation: string | null;
  claimLabel: string | null;
  insightNotes: InsightNoteView[];
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
  // Carries the outcome of the action that redirected here, so an action that
  // did nothing says so. A resolve that lost a race to another admin is a
  // no-op, and without this it is indistinguishable from one that applied.
  actionNotice?: string | null;
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
// group header carry its bulk-park form.
interface CleanupQueueItemGroup {
  label: string;
  predicate: PredicateSource;
  count: number;
  items: CleanupQueueItem[];
  // Marks the low-priority "Needs Leader" opportunity section; the template
  // renders its explanatory framing and withholds the remediation actions.
  isOpportunity?: boolean;
}

interface CleanupQueueContent {
  itemGroups: CleanupQueueItemGroup[];
  totalItems: number;
  residue: ResidueItem[];
  candidates: PromotableCandidateItem[];
  junkCandidates: JunkCandidateItem[];
  candidateFlags: CandidateFlagItem[];
  // Parked clubs and their count, always shown whole so the admin can see that
  // parking hid nothing permanently.
  parked: ParkedItem[];
  parkedCount: number;
  // Notes a member wrote about clubs in their area rather than about one club
  // the wizard named. They belong to no queue row, so without their own section
  // they would be collected and never read.
  areaInsights: AreaInsightView[];
  filters: CleanupQueueFilters;
}

export interface AreaInsightView {
  authorDisplayName: string;
  authorLocation: string;
  text: string;
  at: string;
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

interface AssembledQueue {
  items: CleanupQueueItem[];
  residue: ResidueItem[];
  candidates: PromotableCandidateItem[];
  junkCandidates: JunkCandidateItem[];
  candidateFlags: CandidateFlagItem[];
  parked: ParkedItem[];
}

// A parked club: out of the working queue, never out of sight. The listing is
// how parking stays honest, since nothing expires to bring the item back. It
// says who parked it, why, and when, and any club whose evidence changes after
// that moment rejoins the working queue on its own.
// Carries a club or an unpromoted candidate: both are parked from this queue
// and both must stay visible afterwards, so the listing is keyed by whichever
// id the resolution holds and the name and location columns serve both.
export interface ParkedItem {
  clubId: string | null;
  candidateId: string | null;
  clubName: string;
  clubCity: string | null;
  clubCountry: string | null;
  predicateLabel: string;
  parkedByLabel: string;
  parkedAt: string;
  reasonText: string | null;
}

// Member-authored notes for one club or candidate, newest first, shaped for
// the admin row. Purged text is already excluded by the read.
function insightNotesFor(rows: unknown[]): InsightNoteView[] {
  return (rows as Array<{ note_text: string; author_display_name: string; created_at: string }>)
    .map((r) => ({
      authorDisplayName: r.author_display_name,
      text: r.note_text,
      at: r.created_at.slice(0, 10),
    }));
}

// Negative votes are rare and admins judge them by who cast them, so queue
// items name the members whose latest answer was negative. Admin queue
// only: signal authorship is never exposed on public surfaces.
function negativeReporterSuffix(
  reporters: Array<{ display_name: string; activity_signal: string }>,
): string {
  const saidInactive = reporters.filter((r) => r.activity_signal === 'not_active').map((r) => r.display_name);
  return saidInactive.length ? ` (inactive per: ${saidInactive.join(', ')})` : '';
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
function assembleQueue(prefetched?: {
  evidence: ClubEvidenceRow[];
  resolutions: Map<string, ResolutionRow>;
}): AssembledQueue {
  // The caller may already hold both, because the rule sweep that runs before
  // the queue is assembled reads exactly the same two things. Passing them in
  // halves the work on the page an admin opens most; calling with nothing still
  // reads them here, which is what the badge and the bulk actions do.
  const resolutions = prefetched?.resolutions ?? getActiveResolutions();
  const claims = loadActiveClaims();
  const items: CleanupQueueItem[] = [];

  // One read of every club's evidence, used for two things: the newest moment a
  // member said anything about a club (which is what un-parks it), and the club
  // names the parked listing shows.
  const evidenceByClub = new Map<string, ClubEvidenceRow>();
  for (const row of prefetched?.evidence ?? (clubEvidence.listByClub.all(null, null) as ClubEvidenceRow[])) {
    evidenceByClub.set(row.club_id, row);
  }
  const newestEvidenceFor = (clubId: string): string | null =>
    evidenceByClub.get(clubId)?.newest_evidence_at ?? null;

  // A club the rules are about to demote is not work for anyone. It is left out
  // of every listing here, so the counts this function produces describe the
  // queue as it will stand once the rules have run rather than before.
  const pendingRuleDemotion = clubsPendingRuleDemotion(
    [...evidenceByClub.values()],
    resolutions,
  );

  // Only a club whose own record contradicts the member who wrote it off
  // reaches an admin. Everything the rules settle has already been acted on or
  // deliberately left alone, so nothing here is paperwork.
  for (const row of evidenceByClub.values()) {
    if (isResolved(resolutions, row.club_id, 'crowdsource_viability', newestEvidenceFor(row.club_id), row.status)) continue;
    const verdict = evaluateClubVerdict(row);
    if (verdict.verdict !== 'needs_review') continue;

    const reporters = clubViabilitySignals.listNegativeWizardReportersByClub.all(row.club_id) as
      Array<{ display_name: string; activity_signal: string }>;
    const reporterSuffix = negativeReporterSuffix(reporters);

    // The two or three facts behind the verdict, and nothing else: what the
    // member said, and what the club's own record says back.
    const contradiction = verdict.adminPromoted
      ? 'an admin promoted this club from the legacy record'
      : verdict.wasEstablished
        ? 'the club was an established club at import'
        : verdict.everHostedEvent
          ? 'the club has hosted an event'
          : 'a member left a note about it';
    // A club can also reach review on a note alone, with nobody having reported
    // it inactive, so the row says what actually brought it here.
    const detail = verdict.inactiveVotes > 0
      ? `Reported inactive${reporterSuffix}, but ${contradiction}`
      : 'A member left a note about this club';

    items.push({
      clubId: row.club_id,
      clubName: row.club_name,
      clubCity: row.city,
      clubRegion: row.region,
      clubCountry: row.country,
      clubStatus: row.status,
      predicate: 'crowdsource_viability',
      predicateLabel: 'Reported inactive, record disagrees',
      detail,
      recommendedAction: 'Demote to inactive, or dismiss the report',
      showLeaderlessControls: false,
      flagCount: verdict.inactiveVotes,
      openSince: row.club_updated_at,
      claimLabel: claimLabelFrom(claims, 'club', row.club_id),
      insightNotes: insightNotesFor(clubInsightNotes.listByClub.all(row.club_id)),
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
    if (pendingRuleDemotion.has(clubId)) continue;
    const first = leaders[0];
    if (isResolved(resolutions, clubId, 'stale_provisional', newestEvidenceFor(clubId), first.club_status)) continue;
    items.push({
      clubId,
      clubName: first.club_name,
      clubCity: first.city,
      clubRegion: first.region,
      clubCountry: first.country,
      clubStatus: first.club_status,
      predicate: 'stale_provisional',
      predicateLabel: 'Stale Provisional Leader',
      detail: `${leaders.length} provisional leader(s) since ${first.provisional_since.slice(0, 10)}`,
      recommendedAction: 'Review or dismiss',
      showLeaderlessControls: false,
      flagCount: leaders.length,
      openSince: first.provisional_since,
      claimLabel: claimLabelFrom(claims, 'club', clubId),
      insightNotes: insightNotesFor(clubInsightNotes.listByClub.all(clubId)),
    });
  }

  // Leaderless clubs come LAST: leaderless is a tolerated state, not a defect,
  // so these render as a separate low-priority "Needs Leader" opportunity
  // section beneath the review items rather than as remediation work. Before
  // members have claimed their clubs this matches nearly the whole active
  // universe, which is exactly why it must not read as a review backlog.
  const leaderless = findLeaderlessActiveClubs();
  for (const row of leaderless) {
    // A club about to be demoted is not an opportunity to find it a leader.
    if (pendingRuleDemotion.has(row.club_id)) continue;
    if (isResolved(resolutions, row.club_id, 'leaderless_active', newestEvidenceFor(row.club_id), row.status)) continue;
    items.push({
      clubId: row.club_id,
      clubName: row.club_name,
      clubCity: row.city,
      clubRegion: row.region,
      clubCountry: row.country,
      clubStatus: row.status,
      predicate: 'leaderless_active',
      predicateLabel: 'Needs Leader',
      detail: 'Active club with no co-leader yet; a tolerated state, and an opportunity, not a problem to fix',
      recommendedAction: 'Add a co-leader, invite members to volunteer, or park',
      showLeaderlessControls: true,
      isOpportunity: true,
      flagCount: 0,
      openSince: row.last_updated,
      claimLabel: claimLabelFrom(claims, 'club', row.club_id),
      insightNotes: insightNotesFor(clubInsightNotes.listByClub.all(row.club_id)),
    });
  }

  // Residue for a club the rules are about to demote is retired by that
  // demotion, so it is not admin work either.
  const residueRows = (legacyPersonClubAffiliations.listUnconfirmedResidueByClub.all() as ResidueRow[])
    .filter((r) => !pendingRuleDemotion.has(r.club_id));
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
  const newestCandidateEvidence = new Map<string, string | null>();
  for (const r of candidateEvidence.newestByCandidate.all() as Array<{
    candidate_id: string; newest_evidence_at: string | null;
  }>) {
    newestCandidateEvidence.set(r.candidate_id, r.newest_evidence_at);
  }
  const newestEvidenceForCandidate = (candidateId: string): string | null =>
    newestCandidateEvidence.get(candidateId) ?? null;

  const candidates: PromotableCandidateItem[] = [];
  for (const r of candidateRows) {
    const res = candidateResolutions.get(`${r.id}:${PROMOTABLE_PREDICATE}`);
    if (isParked(res, newestEvidenceForCandidate(r.id))) continue;
    candidates.push({
      candidateId: r.id,
      displayName: r.display_name,
      city: r.city,
      region: r.region,
      country: r.country,
      classificationLabel: r.classification === 'dormant' ? 'Dormant' : 'Onboarding-visible',
      createdAt: r.created_at,
      parkAnnotation: parkAnnotationFrom(res),
      claimLabel: claimLabelFrom(claims, 'candidate', r.id),
      ...promotionRegionPrompt(r.country, r.region),
    });
  }

  // Wizard flags about unpromoted candidates, grouped per candidate. Rows
  // here are candidate-keyed signals only; club-keyed signals stay with the
  // viability gates above, so a vote never surfaces twice. Dismiss is
  // terminal; a parked candidate stays listed with who parked it.
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
    total_count: number;
  }>;
  const candidateFlags: CandidateFlagItem[] = [];
  for (const r of flagRows) {
    const res = candidateResolutions.get(`${r.candidate_id}:${CANDIDATE_FLAG_PREDICATE}`);
    if (res?.resolution === 'dismissed') continue;
    if (isParked(res, newestEvidenceForCandidate(r.candidate_id))) continue;
    const reporters = clubViabilitySignals.listNegativeCandidateReporters.all(r.candidate_id) as
      Array<{ display_name: string; activity_signal: string }>;
    candidateFlags.push({
      candidateId: r.candidate_id,
      displayName: r.display_name,
      city: r.city,
      region: r.region,
      country: r.country,
      classificationLabel: CLASSIFICATION_LABELS[r.classification] ?? r.classification,
      detail: `${r.active_count} active, ${r.not_active_count} inactive${negativeReporterSuffix(reporters)}`,
      flagCount: r.not_active_count,
      oldestFlagAt: r.oldest_flag_at,
      parkAnnotation: parkAnnotationFrom(res),
      claimLabel: claimLabelFrom(claims, 'candidate', r.candidate_id),
      insightNotes: insightNotesFor(clubInsightNotes.listByCandidate.all(r.candidate_id)),
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

  // Parked clubs, listed rather than lost. A park drops off this listing only
  // when the working queue above has actually taken the club back, which is
  // checked against the rows that queue really holds rather than inferred from
  // the club having newer evidence. Newer evidence is necessary for a return
  // but not sufficient: a club whose verdict the rules can settle, or one no
  // longer leaderless, never rejoins the working queue, and inferring that it
  // had is what left such a club showing nowhere at all.
  const workingQueueKeys = new Set(items.map((i) => `${i.clubId}:${i.predicate}`));
  const parked: ParkedItem[] = [];
  for (const r of resolutions.values()) {
    if (r.resolution !== 'parked') continue;
    if (workingQueueKeys.has(`${r.club_id}:${r.predicate_name}`)) continue;
    const evidence = evidenceByClub.get(r.club_id);
    // The evidence read covers live clubs only, so a club archived since the
    // park has no row there and would render its bare id. Fetch the name
    // directly rather than showing an admin an identifier.
    const fallback = evidence
      ? null
      : clubsDb.findById.get(r.club_id) as
        | { name: string; city: string | null; country: string | null } | undefined;
    parked.push({
      clubId: r.club_id,
      candidateId: null,
      clubName: evidence?.club_name ?? fallback?.name ?? r.club_id,
      clubCity: evidence?.city ?? fallback?.city ?? null,
      clubCountry: evidence?.country ?? fallback?.country ?? null,
      predicateLabel: PARKED_PREDICATE_LABELS[r.predicate_name] ?? r.predicate_name,
      parkedByLabel: r.parked_by_name ?? 'an admin',
      parkedAt: r.created_at.slice(0, 10),
      reasonText: r.reason_text,
    });
  }

  // Parked candidates belong here for the same reason parked clubs do. The
  // loops above drop them from the working queue, so without this they would
  // show on no surface at all and be indistinguishable from a terminal
  // dismissal outside the database. Their name and location come from the
  // candidate rows already read for those loops.
  const candidateMeta = new Map<string, { name: string; city: string | null; country: string | null }>();
  for (const r of candidateRows) {
    candidateMeta.set(r.id, { name: r.display_name, city: r.city, country: r.country });
  }
  for (const r of flagRows) {
    if (!candidateMeta.has(r.candidate_id)) {
      candidateMeta.set(r.candidate_id, { name: r.display_name, city: r.city, country: r.country });
    }
  }
  // Same membership test the club listing above uses, and for the same reason:
  // a park leaves this listing only once the working queue has really taken the
  // candidate back. Newer evidence is necessary for that return but not
  // sufficient, because a candidate that has since been promoted, archived or
  // confirmed junk leaves the working listings for good; dropping it here on
  // the evidence comparison alone would leave it showing on no surface at all.
  const workingCandidateKeys = new Set<string>([
    ...candidates.map((c) => `${c.candidateId}:${PROMOTABLE_PREDICATE}`),
    ...candidateFlags.map((c) => `${c.candidateId}:${CANDIDATE_FLAG_PREDICATE}`),
  ]);
  for (const r of candidateResolutions.values()) {
    if (r.resolution !== 'parked') continue;
    if (workingCandidateKeys.has(`${r.candidate_id}:${r.predicate_name}`)) continue;
    // A candidate retired since the park is in none of the row sets read above,
    // so its name has to be fetched directly. Without this the row renders its
    // bare id, which names nothing an admin can act on. Bounded by the number
    // of parked-and-retired candidates, which is small by construction.
    if (!candidateMeta.has(r.candidate_id)) {
      const row = legacyClubCandidates.findById.get(r.candidate_id) as
        | { display_name: string; city: string | null; country: string | null } | undefined;
      if (row) {
        candidateMeta.set(r.candidate_id, {
          name: row.display_name, city: row.city, country: row.country,
        });
      }
    }
    const meta = candidateMeta.get(r.candidate_id);
    parked.push({
      clubId: null,
      candidateId: r.candidate_id,
      clubName: meta?.name ?? r.candidate_id,
      clubCity: meta?.city ?? null,
      clubCountry: meta?.country ?? null,
      predicateLabel: PARKED_PREDICATE_LABELS[r.predicate_name] ?? r.predicate_name,
      parkedByLabel: r.parked_by_name ?? 'an admin',
      parkedAt: r.created_at.slice(0, 10),
      reasonText: r.reason_text,
    });
  }

  parked.sort((a, b) => a.clubName.localeCompare(b.clubName));

  return { items, residue, candidates, junkCandidates, candidateFlags, parked };
}

const PARKED_PREDICATE_LABELS: Record<string, string> = {
  crowdsource_viability: 'Crowdsource Viability',
  leaderless_active: 'Needs Leader',
  stale_provisional: 'Stale Provisional Leader',
  promotable_candidate: 'Promotable Candidate',
  candidate_flags: 'Wizard Flags by Candidate',
};

// ---------------------------------------------------------------------------
// Queue filter and sort
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'crowdsource_viability', label: 'Crowdsource Viability' },
  { value: 'leaderless_active', label: 'Needs Leader' },
  { value: 'stale_provisional', label: 'Stale Provisional Leader' },
  { value: 'candidate_flag', label: 'Wizard Flags by Candidate' },
  { value: 'residue', label: 'Unconfirmed Residue' },
  { value: 'candidate', label: 'Promotable Candidates' },
  { value: 'junk_candidate', label: 'Junk-flagged Candidates' },
];

const SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'age', label: 'Age (Oldest First)' },
  { value: 'category', label: 'Category' },
  { value: 'region', label: 'Region' },
  { value: 'flag_count', label: 'Flag Count' },
  { value: 'source', label: 'Source Surface' },
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

  // The parked listing is deliberately unfiltered: it is the record that
  // nothing was dropped, so narrowing it by the working queue's filters would
  // defeat its only job.
  return { items, residue, candidates, junkCandidates, candidateFlags, parked: queue.parked };
}

// ---------------------------------------------------------------------------
// Admin cleanup queue page + admin-home backlog badge
// ---------------------------------------------------------------------------

function getCleanupQueuePage(filter?: CleanupQueueFilter): PageViewModel<CleanupQueueContent> {
  // The rules act first, so the queue an admin then reads holds only the clubs
  // the rules could not settle. This is the only place the sweep runs: opening
  // the queue is the trigger, and nothing here happens unattended.
  const evidence = clubEvidence.listByClub.all(null, null) as ClubEvidenceRow[];
  applyRuleVerdicts(evidence, getActiveResolutions());

  const normalized = normalizeFilter(filter);
  // Resolutions are re-read after the sweep, which writes some, but the
  // evidence the sweep just read is unchanged by it and is reused.
  const { items, residue, candidates, junkCandidates, candidateFlags, parked } =
    applyFilterAndSort(
      assembleQueue({ evidence, resolutions: getActiveResolutions() }),
      normalized,
    );

  // Group predicate items by category for the collapsed-by-default
  // presentation; group order follows the items' (possibly sorted) order.
  const itemGroups: CleanupQueueItemGroup[] = [];
  const groupsByLabel = new Map<string, CleanupQueueItemGroup>();
  for (const item of items) {
    let group = groupsByLabel.get(item.predicateLabel);
    if (!group) {
      group = {
        label: item.predicateLabel,
        predicate: item.predicate,
        count: 0,
        items: [],
        isOpportunity: item.isOpportunity === true,
      };
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
    page: {
      sectionKey: 'admin', pageKey: 'admin_club_cleanup', title: 'Club Cleanup Queue',
      ...(filter?.actionNotice ? { notice: filter.actionNotice } : {}),
    },
    content: {
      itemGroups,
      totalItems: items.length,
      residue,
      candidates,
      junkCandidates,
      candidateFlags,
      parked,
      parkedCount: parked.length,
      areaInsights: (clubInsightNotes.listUnkeyed.all() as Array<{
        note_text: string; author_display_name: string; created_at: string;
        author_city: string | null; author_region: string | null; author_country: string | null;
      }>).map((r) => ({
        authorDisplayName: r.author_display_name,
        authorLocation: [r.author_city, r.author_region, r.author_country].filter(Boolean).join(', '),
        text: r.note_text,
        at: r.created_at.slice(0, 10),
      })),
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

type ResolveAction = 'demote_inactive' | 'archive' | 'dismiss' | 'park';

function resolveClub(
  adminMemberId: string,
  clubId: string,
  predicate: string,
  action: ResolveAction,
  reasonText: string | null,
): void {
  const validActions: ReadonlySet<string> = new Set([
    'demote_inactive', 'archive', 'dismiss', 'park',
  ]);
  if (!validActions.has(action)) {
    throw new ValidationError(`Invalid action: ${action}`);
  }
  if (!CLUB_PREDICATES.has(predicate)) {
    throw new ValidationError(`Invalid predicate: ${predicate}`);
  }

  const club = clubsDb.findById.get(clubId) as
    | { club_id: string; status: string } | undefined;
  if (!club) {
    throw new NotFoundError('Club not found.');
  }
  // Archiving is terminal, so nothing resolves against an archived club: a
  // demotion would move it back to inactive and undo a decision the queue can
  // no longer surface, and a fresh park or dismissal would strand a resolution
  // row the working queue will never look for again. The queue reads clubs_open
  // so an archived club never enters it, but a stale page or a repeated submit
  // still carries its id here. The read side already refuses this; so does the
  // write.
  if (club.status === 'archived') {
    throw new ValidationError(
      'This club is archived, which is final. No further cleanup action applies to it.',
    );
  }

  // Archiving retires a club for good, and nothing but a member's own leave can
  // end their affiliation, so a club somebody still belongs to is never
  // archived: doing so would leave them affiliated to a club they can neither
  // reach nor leave, holding one of their two club slots. Demotion is the
  // action for a club that looks defunct but still has people; it keeps the
  // club listed and any member joining or claiming it revives it.
  if (action === 'archive') {
    const people = memberClubAffiliations.countCurrentPeopleForClub.get(clubId, clubId) as
      { member_count: number; leader_count: number };
    if (people.member_count > 0 || people.leader_count > 0) {
      throw new ValidationError(
        'This club still has members or co-leaders, so it cannot be archived. Demote it to inactive instead.',
      );
    }
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
    // Parking carries no date at all: the parked listing and the evidence
    // check are what stop a parked item being lost, not a countdown.
    if (action === 'park') {
      resolution = 'parked';
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
      resolution,
      action === 'park' ? adminMemberId : null,
      reasonText,
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
        residue_delisted: residueDelisted,
      },
    });
  });

}

// Contact-members action on a leaderless club: email the club's current
// members the volunteer-to-co-lead invitation. This does not resolve the queue
// item (the club stays leaderless until a member steps up); the item simply
// resurfaces on the next open. The email carries no link (anti-phishing); it
// gives precise log-in-and-navigate instructions. Audit-logged.
function contactMembersToVolunteer(
  adminMemberId: string,
  clubId: string,
): { recipientCount: number } {
  const club = clubsDb.findById.get(clubId) as
    | { club_id: string; name: string; status: string } | undefined;
  if (!club) throw new NotFoundError('Club not found.');

  const members = clubLeaders.listCurrentMemberContactsForClub.all(clubId) as Array<{
    id: string; display_name: string; login_email: string | null;
  }>;

  let recipientCount = 0;
  for (const m of members) {
    if (!m.login_email) continue;
    // One member's failure skips that member only. A single guard around the
    // whole loop abandoned every remaining recipient on the first error, and
    // the audit row below then reported a contact count for people who were
    // never reached.
    try {
      const sent = emailService.send({
        template: 'club_leaderless_contact',
        params: {
          memberName: m.display_name,
          clubName: club.name,
        },
        recipientEmail: m.login_email,
        recipientMemberId: m.id,
        idempotencyKey: `club-leaderless-contact:${clubId}:${m.id}`,
      });
      // A suppressed send never leaves the platform: the template is disabled,
      // or the mailbox has already bounced or complained. Counting it would
      // record a contact that did not happen. A duplicate counts, because the
      // idempotency key means the invitation is already queued for them.
      if (sent.status !== 'suppressed') recipientCount++;
    } catch (err) {
      logger.warn('club leaderless contact-members enqueue failed for one member', {
        clubId,
        recipientMemberId: m.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  appendAuditEntry({
    actionType: 'admin.club_cleanup.contact_members',
    category: 'admin',
    actorType: 'admin',
    actorMemberId: adminMemberId,
    entityType: 'club',
    entityId: clubId,
    reasonText: null,
    metadata: { recipient_count: recipientCount, club_name: club.name },
  });

  return { recipientCount };
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
  | 'park' | 'dismiss'
  | 'demote' | 'archive' | 'confirm_junk' | 'promote_dormant';

export type CandidateResolveResult =
  | { status: 'applied'; action: CandidateResolveAction }
  | { status: 'noop'; action: CandidateResolveAction };

// Resolve a candidate queue item. The predicate names which of the
// candidate's queue items is being resolved: the promotable listing (the
// default) or the wizard-flag group; each carries its own resolution row,
// so resolving one never hides the other. Park and dismiss are flag-style
// actions: park sets any item aside with no deadline (it stays listed with
// who parked it); dismiss is the terminal flag
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
    'park', 'dismiss',
    'demote', 'archive', 'confirm_junk', 'promote_dormant',
  ]);
  if (!validActions.has(action)) {
    throw new ValidationError(`Invalid action: ${action}`);
  }
  if (predicate !== PROMOTABLE_PREDICATE && predicate !== CANDIDATE_FLAG_PREDICATE) {
    throw new ValidationError(`Invalid predicate: ${predicate}`);
  }
  const isFlagStyle = action === 'park' || action === 'dismiss';
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
      const resId = `cdr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      candidateCleanupResolutions.upsert.run(
        resId, now, adminMemberId,
        candidateId, predicate,
        action === 'dismiss' ? 'dismissed' : 'parked',
        // Only a park names a parker; a dismissal is a decision, not a hold.
        action === 'park' ? adminMemberId : null,
        reasonText,
      );
      clubCleanupClaims.releaseClaim.run('candidate', candidateId);

      appendAuditEntry({
        actionType: action === 'dismiss'
          ? 'admin.club_cleanup.candidate_dismiss'
          : 'admin.club_cleanup.candidate_park',
        category: 'admin',
        actorType: 'admin',
        actorMemberId: adminMemberId,
        entityType: 'legacy_club_candidate',
        entityId: candidateId,
        reasonText,
        metadata: {
          action,
          predicate,
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
  // An id for a club that does not exist stays the harmless no-op it has always
  // been, but it must not reach the ledger: writing a de-listing against a
  // fabricated entity puts a row about a thing that never existed into an
  // append-only table where it can never be corrected.
  const club = clubsDb.findById.get(clubId) as { club_id: string } | undefined;
  if (!club) {
    return { delistedCount: 0 };
  }
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

// Bulk park a whole queue group: every item currently in the group gets its
// own parked resolution, claim release, and audit row, under one shared
// reason. Parking is the only bulk-safe action because a bulk mistake is
// recoverable: parked items stay listed with who parked them and why, and any
// club whose evidence changes afterwards returns to the working queue on its
// own. Items already resolved or parked are not in the assembled group, so
// re-running is a natural no-op. Promotable and junk candidates have no bulk
// action; their resolutions are per-item judgment calls.
function bulkParkGroup(
  adminMemberId: string,
  group: string,
  action: string,
  reasonText: string | null,
): { parkedCount: number } {
  const validGroups: ReadonlySet<string> = new Set([
    'crowdsource_viability', 'leaderless_active', 'stale_provisional', 'candidate_flag',
  ]);
  if (!validGroups.has(group)) {
    throw new ValidationError(`Invalid bulk group: ${group}`);
  }
  if (action !== 'park') {
    throw new ValidationError(`Invalid bulk action: ${action}`);
  }

  const queue = assembleQueue();
  let parkedCount = 0;

  transaction(() => {
    const now = new Date().toISOString();

    if (group === 'candidate_flag') {
      for (const item of queue.candidateFlags) {
        const resId = `cdr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        candidateCleanupResolutions.upsert.run(
          resId, now, adminMemberId,
          item.candidateId, CANDIDATE_FLAG_PREDICATE,
          'parked', adminMemberId, reasonText,
        );
        clubCleanupClaims.releaseClaim.run('candidate', item.candidateId);
        appendAuditEntry({
          actionType: 'admin.club_cleanup.candidate_park',
          category: 'admin',
          actorType: 'admin',
          actorMemberId: adminMemberId,
          entityType: 'legacy_club_candidate',
          entityId: item.candidateId,
          reasonText,
          metadata: {
            action,
            predicate: CANDIDATE_FLAG_PREDICATE,
                bulk: true,
          },
        });
        parkedCount += 1;
      }
      return;
    }

    for (const item of queue.items) {
      if (item.predicate !== group) continue;
      const resId = `ccr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      clubCleanupResolutions.upsert.run(
        resId, now, adminMemberId,
        item.clubId, item.predicate,
        'parked', adminMemberId, reasonText,
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
            bulk: true,
        },
      });
      parkedCount += 1;
    }
  });

  return { parkedCount };
}

// Residue is retired one club at a time, on the admin's judgment about that
// club, which is why there is no queue-wide de-list here: the transition is
// irreversible, so the decision is made per club with that club's pending count
// and oldest-row age in front of the admin.

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
  region: string | null = null,
): Promise<{ branch: 'promoted' | 'already_promoted'; clubId: string }> {
  const result = await clubService.promoteCandidate(candidateId, adminMemberId, {
    actorType: 'admin',
    reasonText,
    trigger: 'admin_queue',
    // The mirror the candidates came from carried no state or province, and a
    // club created without one flattens its country page's grouping, so the
    // queue offers the admin a state for a candidate that lacks one.
    region,
  });
  // The promotion transaction lives in ClubService; releasing the claim
  // afterwards is fine because a leftover marker is only a hint and would
  // expire on its own.
  clubCleanupClaims.releaseClaim.run('candidate', candidateId);
  return result;
}

// One club's verdict, for callers holding a club id rather than an evidence
// row. Reads the same single evidence statement the queue does, so a verdict is
// never derived two different ways.
function getClubVerdict(clubId: string): ClubVerdictResult | null {
  const row = (clubEvidence.listByClub.all(clubId, clubId) as ClubEvidenceRow[])[0];
  return row ? evaluateClubVerdict(row) : null;
}

export const clubCleanupService = {
  getClubVerdict,
  getCleanupQueuePage,
  getBacklogBadge,
  claimItem,
  resolveClub,
  contactMembersToVolunteer,
  resolveCandidate,
  delistUnconfirmedResidue,
  bulkParkGroup,
  promoteCandidate,
};
