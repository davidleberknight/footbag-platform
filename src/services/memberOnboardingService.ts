/**
 * MemberOnboardingService -- post-verification onboarding wizard and dashboard task widget.
 *
 * Owns:
 *   - The onboarding task list and its lifecycle: idempotent startTaskList on first wizard GET,
 *     per-task state (pending / in_progress_paused / skipped / completed / not_applicable), and the
 *     sequential advance order that the wizard and the dashboard Resume target both follow.
 *   - The three current tasks: personal_details, legacy_claim, and club_affiliations. personal_details
 *     and legacy_claim are REQUIRED to become a full member and cannot be skipped (the legacy_claim
 *     "nothing to claim" control is the required decision, which completes the task); club_affiliations
 *     is optional. Each renders a single page and resolves via submit (save-and-advance) or, where
 *     allowed, skip. The results-visibility preference (show_competitive_results) is collected within
 *     the personal_details task, not as a separate task.
 *   - The membership-completion predicate isOnboardingComplete (personal_details AND legacy_claim
 *     both completed), consumed by the requireOnboardingComplete gate that fences the member and
 *     club capability surfaces until onboarding is finished.
 *   - The dashboard task widget (getDashboardTaskWidget): one row per outstanding task with a Resume target;
 *     hidden when no outstanding tasks remain.
 *
 * Does not own:
 *   - Legacy-account claim and historical-person matching (IdentityAccessService; the legacy_claim
 *     task delegates to it).
 *   - Member profile field writes (MemberService; e.g. setShowCompetitiveResults).
 *   - Club promotion and leadership confirmation (ClubService).
 *
 * Serves (all auth-required; an unauthenticated request redirects to /login?returnTo=...):
 *   - GET /register/wizard/:taskType and the per-action sub-paths (the /submit and /skip POSTs, the
 *     club_affiliations /dismiss POST and /detour GET, and the legacy_claim sub-actions). Unknown
 *     :taskType renders 404. GET /register/wizard/complete is the terminal page.
 *
 * Required patterns:
 *   - State-changing wizard POSTs follow post-redirect-get: a 303 to the next-task GET or to
 *     /register/wizard/complete on advance; a 303 to the same step with a signed flash cookie for a
 *     transient notice; a 422 re-render on validation error; a 429 with Retry-After on rate-limit.
 *   - The wizard never reveals whether the member has a plausible legacy match beyond the existing
 *     anti-enumeration contract; a task the server determines is not_applicable is simply not
 *     rendered.
 *   - Per-task answers persist on submit; completing a task advances the sequence.
 *   - The personal_details task precedes and gates the legacy_claim task: no resolving
 *     action (confirm, search, token confirm, direct record claim, or the continue-without-
 *     linking decision) runs until personal_details is completed, so the required personal
 *     details including date of birth are on file before any matching. The gate is task-
 *     level only and never applies to the admin link-help apply path. Date of birth is
 *     collected only in personal_details, not the claim task; the continue-without-linking
 *     decision additionally requires the member to affirm they never had an old-site account.
 *   - State-changing wizard POSTs are subject to the global Origin-pin CSRF middleware; a wizard
 *     POST is never added to that middleware's exemption list.
 *   - Every task page renders through the shared wizard layout primitive so all tasks present the
 *     same chrome.
 *
 * Persistence:
 *   member_onboarding_tasks (and the tables the delegated services own).
 *
 * Side effects:
 *   - audit_entries append.
 *
 * Service shape: singleton object.
 */
import { randomUUID } from 'crypto';
import {
  account,
  clubBootstrapLeaders,
  clubBootstrapLeaderSignals,
  clubViabilitySignals,
  legacyClubCandidates,
  legacyPersonClubAffiliations,
  memberClubAffiliations,
  memberOnboarding,
  transaction,
  type ClubBootstrapLeaderRow,
  type ClubBootstrapLeaderSignalRow,
  type LegacyPersonClubAffiliationRow,
  type MemberOnboardingTaskRow,
  type WizardMembershipCardRow,
  type WizardLeadershipCardRow,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { memberService } from './memberService';
import { clubService } from './clubService';
import {
  classifyBootstrapLeader,
  type StructuralSignals,
  type ContextModifiers,
} from './clubBootstrapClassificationService';
import { identityAccessService, SurnameMismatchError } from './identityAccessService';
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  ServiceError,
  ValidationError,
} from './serviceErrors';

function normalizeToArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

type ActivitySignal = 'active' | 'not_active' | 'not_sure' | 'never_heard_of_it';

const VALID_ACTIVITY_SIGNALS: ReadonlySet<string> = new Set([
  'active', 'not_active', 'not_sure', 'never_heard_of_it',
]);

// clubId is null for candidate-keyed flags: activity answers about a club
// candidate that has no live clubs row yet. Those rows must carry the
// candidate id in sourceEntityId (schema CHECK); promotion later stamps the
// club id onto them.
function writeViabilitySignal(
  memberId: string,
  clubId: string | null,
  sourceStage: string,
  activitySignal: ActivitySignal,
  sourceEntityType: string,
  sourceEntityId: string,
): void {
  const now = new Date().toISOString();
  clubViabilitySignals.insertSignal.run(
    `cvs_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    now,
    'onboarding_service',
    memberId,
    clubId,
    sourceStage,
    activitySignal,
    sourceEntityType,
    sourceEntityId,
  );
}

// The task order is the wizard sequence: personal details first, because the
// required personal fields (including date of birth) must be on file before any
// legacy-record matching runs; then the legacy-account claim; then the optional
// club affiliation. This order is the single source of truth -- both the
// sequential advance and the gate / completion redirects derive their "what's
// next" from this index.
export const TASK_CATALOG = [
  'personal_details',
  'legacy_claim',
  'club_affiliations',
] as const;
export type OnboardingTaskType = typeof TASK_CATALOG[number];

export const TASK_STATES = [
  'pending',
  'in_progress_paused',
  'skipped',
  'completed',
  'not_applicable',
] as const;
export type OnboardingTaskState = typeof TASK_STATES[number];

export interface OnboardingTaskView {
  taskType: OnboardingTaskType;
  state: OnboardingTaskState;
  completedAt: string | null;
}

export interface DashboardTaskItem {
  taskType: OnboardingTaskType;
  taskLabel: string;
  state: OnboardingTaskState;
  completedAt: string | null;
  resumeUrl: string | null;
  targetStory: string | null;
  sourceCard:  string | null;
  ctaLabel: string;
  ctaHref:  string | null;
  dismissHref: string | null;
}

export interface DashboardTaskWidget {
  pending:   DashboardTaskItem[];
  paused:    DashboardTaskItem[];
  skipped:   DashboardTaskItem[];
  hasOutstanding: boolean;
}

const TASK_LABELS: Record<OnboardingTaskType, string> = {
  personal_details:         'Personal details',
  legacy_claim:             'Find your past records and clubs',
  club_affiliations:        'Club affiliation',
};

export class NotImplementedError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('not_implemented', message, details);
  }
}

const TASK_TYPE_INDEX: Record<string, number> = Object.fromEntries(
  TASK_CATALOG.map((t, i) => [t, i]),
);

function assertTaskType(taskType: string): asserts taskType is OnboardingTaskType {
  if (!(taskType in TASK_TYPE_INDEX)) {
    throw new ValidationError(`Unknown onboarding task type: ${taskType}`);
  }
}

function newTaskId(): string {
  return `mot_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function ensureTaskRow(memberId: string, taskType: OnboardingTaskType): MemberOnboardingTaskRow {
  const existing = memberOnboarding.findByMemberAndType.get(memberId, taskType) as
    | MemberOnboardingTaskRow
    | undefined;
  if (existing) return existing;

  const now = new Date().toISOString();
  memberOnboarding.insertTaskIfMissing.run(
    newTaskId(), now, 'onboarding_service', now, 'onboarding_service',
    memberId, taskType,
  );
  return memberOnboarding.findByMemberAndType.get(memberId, taskType) as MemberOnboardingTaskRow;
}

function transitionTask(
  memberId: string,
  taskType: string,
  nextState: OnboardingTaskState,
  actionType: string,
): void {
  assertTaskType(taskType);
  const row = ensureTaskRow(memberId, taskType);
  if (row.state === nextState) return;
  const now = new Date().toISOString();
  const completedAt = nextState === 'completed' ? now : null;
  memberOnboarding.updateState.run(
    nextState, completedAt, now, 'onboarding_service', row.id,
  );
  appendAuditEntry({
    actionType,
    category: 'onboarding',
    actorType: 'member',
    actorMemberId: memberId,
    entityType: 'member_onboarding_task',
    entityId: row.id,
    metadata: { task_type: taskType },
  });
}

function getTaskWidget(memberId: string): OnboardingTaskView[] {
  // In-sequence advance set: tasks the wizard should still push the member through.
  // Excludes `skipped` (the dashboard surfaces those; the live wizard sequence
  // does not loop the user back into a task they deliberately bypassed).
  const rows = memberOnboarding.listForMember.all(memberId) as MemberOnboardingTaskRow[];
  return rows
    .filter((r) => r.state === 'pending')
    .map((r) => ({
      taskType: r.task_type as OnboardingTaskType,
      state: r.state as OnboardingTaskState,
      completedAt: r.completed_at,
    }))
    .sort((a, b) => TASK_TYPE_INDEX[a.taskType] - TASK_TYPE_INDEX[b.taskType]);
}

// The next task to send a still-onboarding member to. Prefers the
// lowest-index pending task (the active wizard sequence); falls back to the
// lowest-index `in_progress_paused` task so a member whose tasks are all
// detour-paused is not redirected to a task that is not actually pending.
// Returns null only when nothing is outstanding.
function nextOutstandingTaskType(memberId: string): OnboardingTaskType | null {
  const rows = (memberOnboarding.listForMember.all(memberId) as MemberOnboardingTaskRow[])
    .filter((r) => (r.task_type as OnboardingTaskType) in TASK_TYPE_INDEX);
  const byIndex = (state: OnboardingTaskState): OnboardingTaskType[] =>
    rows
      .filter((r) => r.state === state)
      .map((r) => r.task_type as OnboardingTaskType)
      .sort((a, b) => TASK_TYPE_INDEX[a] - TASK_TYPE_INDEX[b]);
  const pending = byIndex('pending');
  if (pending.length > 0) return pending[0];
  const paused = byIndex('in_progress_paused');
  return paused[0] ?? null;
}

// Membership-completion predicate consumed by the requireOnboardingComplete
// gate. A verified member becomes a full member only after the two required
// tasks are COMPLETED: personal_details (its required fields populated) and the
// legacy_claim decision (a claim, or the explicit "nothing to claim"
// completion). A skipped required task does NOT satisfy this: skipping is not a
// decision. club_affiliations is optional and never gates membership, so a
// member who finished both required tasks is complete even while the club task
// is still pending or detour-paused. Zero task rows (never entered the wizard)
// reads as incomplete.
function isOnboardingComplete(memberId: string): boolean {
  return getTaskState(memberId, 'personal_details') === 'completed'
      && getTaskState(memberId, 'legacy_claim') === 'completed';
}

// Whether the member still has an outstanding task OTHER than the given one.
// Drives the wizard submit label: completing this task continues the wizard
// when more steps remain, and finishes it when this is the last one.
function hasOtherOutstandingTasks(memberId: string, exceptTaskType: OnboardingTaskType): boolean {
  const rows = memberOnboarding.listForMember.all(memberId) as MemberOnboardingTaskRow[];
  return rows.some(
    (r) =>
      (r.task_type as OnboardingTaskType) !== exceptTaskType &&
      (r.state === 'pending' || r.state === 'in_progress_paused'),
  );
}

function getTaskState(memberId: string, taskType: OnboardingTaskType): OnboardingTaskState | null {
  const row = memberOnboarding.findByMemberAndType.get(memberId, taskType) as
    | MemberOnboardingTaskRow
    | undefined;
  return row ? row.state as OnboardingTaskState : null;
}

// Tasks that must not run until the personal_details fields (including date of
// birth) are on file: matching a member to legacy records depends on those
// fields, so the wizard collects them first. personal_details is the single
// collector, so it has no prerequisite of its own.
const TASKS_REQUIRING_PERSONAL_DETAILS: ReadonlySet<OnboardingTaskType> = new Set([
  'legacy_claim',
  'club_affiliations',
]);

// The task that must be completed before `taskType` can run, or null when the
// task has no unmet prerequisite. Enforces personal-details-before-matching: the
// legacy-claim matcher only runs once this returns null for legacy_claim.
function prerequisiteTaskFor(
  memberId: string,
  taskType: OnboardingTaskType,
): OnboardingTaskType | null {
  if (TASKS_REQUIRING_PERSONAL_DETAILS.has(taskType)
      && getTaskState(memberId, 'personal_details') !== 'completed') {
    return 'personal_details';
  }
  return null;
}

function startTaskList(memberId: string): void {
  const now = new Date().toISOString();
  let inserted = 0;
  for (const taskType of TASK_CATALOG) {
    const result = memberOnboarding.insertTaskIfMissing.run(
      newTaskId(), now, 'onboarding_service', now, 'onboarding_service',
      memberId, taskType,
    );
    inserted += result.changes;
  }
  // Audit emitted once per member, only on first materialization (inserted > 0).
  // Idempotent re-calls from subsequent GETs produce no inserts and no audit
  // row, so the log records the wizard start event without flooding.
  if (inserted > 0) {
    appendAuditEntry({
      actionType:    'wizard.start',
      category:      'onboarding',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      metadata: { tasks_inserted: inserted },
    });
  }
}

function startTask(memberId: string, taskType: string): void {
  transitionTask(memberId, taskType, 'pending', 'wizard.task.started');
}

function skipTask(memberId: string, taskType: string): void {
  transitionTask(memberId, taskType, 'skipped', 'wizard.task.skipped');
}

function completeTask(memberId: string, taskType: string): void {
  transitionTask(memberId, taskType, 'completed', 'wizard.task.completed');
}

function markTaskNotApplicable(memberId: string, taskType: string): void {
  // personal_details is always completable by saving its required fields, so it
  // has no not_applicable path and must never be removed from the outstanding
  // set this way; doing so would leave a member who can never finish onboarding.
  // legacy_claim may legitimately become not_applicable when there is no
  // plausible legacy match, and club_affiliations is optional, so both are allowed.
  if (taskType === 'personal_details') {
    throw new Error(`personal_details cannot be marked not_applicable`);
  }
  transitionTask(memberId, taskType, 'not_applicable', 'wizard.task.not_applicable');
}

/**
 * Member-initiated permanent dismissal of the optional club task. Unlike a skip
 * (which the dashboard keeps offering to resume), a dismiss marks the task
 * not_applicable so it no longer surfaces. Idempotent, and scoped to the
 * optional club task only.
 */
function dismissClubAffiliationsTask(memberId: string): void {
  const state = getTaskState(memberId, 'club_affiliations');
  if (state === 'completed' || state === 'not_applicable') return;
  markTaskNotApplicable(memberId, 'club_affiliations');
}

/**
 * Cross-service hook: called when a member completes the underlying state of
 * a task outside the wizard surface (profile-edit saving first_competition_year,
 * direct HP claim succeeding, etc.). Idempotent: a no-op for tasks that are
 * already in a terminal state (completed, not_applicable). When called for an
 * unmaterialized task, the task row is created in the target state directly.
 */
function completeTaskIfOutstanding(memberId: string, taskType: OnboardingTaskType): void {
  const existing = memberOnboarding.findByMemberAndType.get(memberId, taskType) as
    | MemberOnboardingTaskRow
    | undefined;
  if (existing && (existing.state === 'completed' || existing.state === 'not_applicable')) {
    return;
  }
  completeTask(memberId, taskType);
}

/**
 * Auto-transition `legacy_claim` to `completed` when the underlying state
 * shows the member is already linked. Returns true if a transition occurred.
 * Handles the case where a link succeeded outside the wizard (e.g. direct
 * HP claim from the history page, or profile-edit side channel).
 */
function ensureLegacyClaimReflectsState(memberId: string): boolean {
  const row = memberOnboarding.findByMemberAndType.get(memberId, 'legacy_claim') as
    | MemberOnboardingTaskRow
    | undefined;
  if (!row || row.state === 'completed' || row.state === 'not_applicable') return false;
  const links = account.findLegacyAndHpIdsById.get(memberId) as
    | { legacy_member_id: string | null; historical_person_id: string | null }
    | undefined;
  if (!links) return false;
  if (links.legacy_member_id || links.historical_person_id) {
    completeTask(memberId, 'legacy_claim');
    return true;
  }
  return false;
}

/**
 * Whether the member still lacks a legacy-account or historical-person link.
 * The claim task remains renderable after completion while either linkage is
 * missing: it is the sole claim and anchor surface, reached from the
 * profile's legacy-claim link after onboarding.
 */
function legacyClaimLinkageIncomplete(memberId: string): boolean {
  const links = account.findLegacyAndHpIdsById.get(memberId) as
    | { legacy_member_id: string | null; historical_person_id: string | null }
    | undefined;
  if (!links) return false;
  return !links.legacy_member_id || !links.historical_person_id;
}

/**
 * Auto-complete `club_affiliations` when the member already holds a current
 * club affiliation and has no card left to act on.
 * Returns true if a transition occurred. The task is universal, like
 * legacy_claim: a member with no suggestion cards is NOT skipped: the task
 * stays renderable so every member reaches the find-or-create-your-club
 * wrap-up landing and is asked to join or create a club.
 */
function ensureClubAffiliationsReflectsState(memberId: string): boolean {
  const row = memberOnboarding.findByMemberAndType.get(memberId, 'club_affiliations') as
    | MemberOnboardingTaskRow
    | undefined;
  if (!row || row.state === 'completed' || row.state === 'not_applicable') return false;
  const cards = listWizardCardsForMember(memberId);
  if (cards.length > 0) return false;
  // No cards left and a current club affiliation in hand: the task's goal
  // is met regardless of how the affiliation arrived.
  const current = (memberClubAffiliations.countCurrentByMemberId.get(memberId) as { c: number }).c;
  if (current > 0) {
    completeTask(memberId, 'club_affiliations');
    return true;
  }
  // No cards and no current affiliation: the task stays pending so the wrap-up
  // landing renders for every member, including one with no legacy suggestion
  // material. No auto-transition.
  return false;
}

/**
 * Whether the member ever had legacy club-suggestion material: a linked legacy
 * member id carrying at least one scored person-club affiliation or bootstrap
 * leadership candidate. Drives the wrap-up landing copy: a member with no
 * material is told no legacy club affiliation was found, rather than that their
 * suggestion cards resolved without a club.
 */
function memberHadClubSuggestionMaterial(memberId: string): boolean {
  const memberRow = account.findLegacyMemberIdById.get(memberId) as
    | { legacy_member_id: string | null }
    | undefined;
  const legacyMemberId = memberRow?.legacy_member_id ?? null;
  if (!legacyMemberId) return false;
  const lpca = (legacyPersonClubAffiliations.countByLegacyMember.get(legacyMemberId) as { c: number }).c;
  const cbl  = (clubBootstrapLeaders.countByLegacyMember.get(legacyMemberId) as { c: number }).c;
  return lpca > 0 || cbl > 0;
}

/**
 * Move a wizard task into `in_progress_paused` because the member detoured
 * into another flow (e.g. M_Create_Club). The audit row carries the
 * `target_story` (where the member is going) and `source_card` (which wizard
 * card they came from) so the dashboard widget can render a "Resume
 * onboarding" link back to the correct card after the detour resolves.
 *
 * No-op if the task is already in a terminal state (`completed`,
 * `not_applicable`); a completed task cannot be paused.
 */
function transitionToDetourPaused(
  memberId: string,
  taskType: string,
  targetStory: string,
  sourceCard: string,
): void {
  assertTaskType(taskType);
  const row = ensureTaskRow(memberId, taskType);
  if (row.state === 'completed' || row.state === 'not_applicable') {
    return;
  }
  const now = new Date().toISOString();
  memberOnboarding.updateState.run(
    'in_progress_paused', null, now, 'onboarding_service', row.id,
  );
  appendAuditEntry({
    actionType:    'wizard.task.detour_paused',
    category:      'onboarding',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'member_onboarding_task',
    entityId:      row.id,
    metadata: { task_type: taskType, target_story: targetStory, source_card: sourceCard },
  });
}

/**
 * Dashboard task widget: returns a member's onboarding tasks split into
 * pending / paused / completed. Paused entries carry a `resumeUrl`
 * reconstructed from the latest `wizard.task.detour_paused` audit row's
 * metadata (target_story + source_card). The resume url is the wizard entry
 * path for the task (`/register/wizard/{taskType}`) so the wizard controller
 * can route the member back into the in-progress task without the widget
 * needing to know wizard route specifics.
 */
function getDashboardTaskWidget(memberId: string): DashboardTaskWidget {
  interface WidgetRow {
    id: string;
    member_id: string;
    task_type: string;
    state: string;
    completed_at: string | null;
    detour_metadata_json: string | null;
  }
  const rows = memberOnboarding.listForMemberWithDetourMeta.all(memberId) as WidgetRow[];

  const widget: DashboardTaskWidget = {
    pending: [], paused: [], skipped: [],
    hasOutstanding: false,
  };
  for (const r of rows) {
    const taskType = r.task_type as OnboardingTaskType;
    if (!(taskType in TASK_TYPE_INDEX)) continue;
    const state = r.state as OnboardingTaskState;
    if (state === 'not_applicable' || state === 'completed') continue;

    let resumeUrl:   string | null = null;
    let targetStory: string | null = null;
    let sourceCard:  string | null = null;
    if (state === 'in_progress_paused' && r.detour_metadata_json) {
      try {
        const meta = JSON.parse(r.detour_metadata_json) as {
          target_story?: string; source_card?: string;
        };
        targetStory = meta.target_story ?? null;
        sourceCard  = meta.source_card  ?? null;
      } catch { /* malformed metadata leaves resume context null */ }
    }
    if (state === 'in_progress_paused') {
      resumeUrl = `/register/wizard/${taskType}`;
    }

    let ctaLabel: string = '';
    let ctaHref:  string | null = null;
    if (state === 'in_progress_paused') {
      ctaLabel = 'Resume Onboarding';
      ctaHref  = resumeUrl;
    } else if (state === 'pending') {
      ctaLabel = 'Continue Onboarding';
      ctaHref  = `/register/wizard/${taskType}`;
    } else if (state === 'skipped') {
      // A skipped task was never started, so "Open" reads truer than "Resume".
      ctaLabel = 'Open Task';
      ctaHref  = `/register/wizard/${taskType}`;
    }
    const item: DashboardTaskItem = {
      taskType,
      taskLabel: TASK_LABELS[taskType],
      state,
      completedAt: r.completed_at,
      resumeUrl,
      targetStory,
      sourceCard,
      ctaLabel,
      ctaHref,
      // Only the optional club task can be permanently dismissed from the
      // dashboard; the required tasks have no dismiss path.
      dismissHref: taskType === 'club_affiliations'
        ? '/register/wizard/club_affiliations/dismiss'
        : null,
    };
    if      (state === 'in_progress_paused') widget.paused.push(item);
    else if (state === 'skipped')            widget.skipped.push(item);
    else if (state === 'pending')            widget.pending.push(item);
  }

  // The dashboard lists outstanding tasks in the wizard's task order, the same
  // order the sequential advance and the completion redirects follow.
  const sortByDisplayOrder = (a: DashboardTaskItem, b: DashboardTaskItem) =>
    (TASK_TYPE_INDEX[a.taskType] ?? 99) - (TASK_TYPE_INDEX[b.taskType] ?? 99);
  widget.pending.sort(sortByDisplayOrder);
  widget.paused.sort(sortByDisplayOrder);
  widget.skipped.sort(sortByDisplayOrder);
  widget.hasOutstanding =
    widget.pending.length + widget.paused.length + widget.skipped.length > 0;
  return widget;
}

// ---------------------------------------------------------------------------
// Wizard card listing — per-member view of the club_affiliations task.
//
// Two card kinds: 'membership' (pending legacy_person_club_affiliations) and
// 'leadership' (provisional club_bootstrap_leaders). Leadership cards render
// before membership cards; within each kind, alphabetical by club name.
// ---------------------------------------------------------------------------

export type MembershipConfidenceBand = 'high' | 'medium' | 'low';

export type WizardSignalType =
  | 'listed_contact' | 'affiliation' | 'hosting' | 'roster' | 'mirror_text'
  | 'recent_activity' | 'geographic_alignment';

export interface SignalChecklistRow {
  signalType: WizardSignalType;
  signalLabel: string;
  isPresent: boolean;
}

export interface WizardMembershipCard {
  kind: 'membership';
  isMembership: true;
  isLeadership: false;
  isDisambiguation: false;
  // Pre-shaped legend for the confirm/decline radio fieldset.
  questionLabel: string;
  candidateId: string;       // legacy_person_club_affiliations.id
  clubId: string | null;     // null until the candidate is promoted on confirm
  clubName: string;
  confidenceBand: MembershipConfidenceBand;
  confidenceBandLabel: string;
  clubDescription: string | null;
  clubExternalUrl: string | null;
}

export interface WizardLeadershipCard {
  kind: 'leadership';
  isMembership: false;
  isLeadership: true;
  isDisambiguation: false;
  questionLabel: string;
  consequencesNote: string;
  candidateId: string;       // club_bootstrap_leaders.id
  clubId: string;
  clubName: string;
  role: 'leader' | 'co-leader';
  roleLabel: string;
  classification: 'strong' | 'weak' | 'none';
  classificationLabel: string;
  signals: SignalChecklistRow[];
  clubDescription: string | null;
  clubExternalUrl: string | null;
}

export interface WizardDisambiguationCard {
  kind: 'disambiguation';
  isMembership: false;
  isLeadership: false;
  isDisambiguation: true;
  city: string;
  clubs: Array<{
    candidateId: string;
    clubId: string | null;
    clubName: string;
    confidenceBand: MembershipConfidenceBand;
    confidenceBandLabel: string;
    clubDescription: string | null;
    clubExternalUrl: string | null;
  }>;
}

export type WizardCard = WizardMembershipCard | WizardLeadershipCard | WizardDisambiguationCard;

function confidenceBandFor(score: number | null): MembershipConfidenceBand {
  // Scores arrive at fixed increments (0.50 / 0.70 / 0.90) so each band
  // maps to a real signal-count state.
  if (score === null) return 'low';
  if (score >= 0.90) return 'high';
  if (score >= 0.70) return 'medium';
  return 'low';
}

const CONFIDENCE_BAND_LABELS: Record<MembershipConfidenceBand, string> = {
  high:   'High',
  medium: 'Medium',
  low:    'Low',
};

const CLASSIFICATION_LABELS: Record<'strong' | 'weak' | 'none', string> = {
  strong: 'Strong match',
  weak:   'Possible match',
  none:   'Uncertain match',
};

const ROLE_LABELS: Record<'leader' | 'co-leader', string> = {
  'leader':    'Primary contact',
  'co-leader': 'Contact',
};

const SIGNAL_LABELS: Record<WizardSignalType, string> = {
  listed_contact:       'Listed as contact',
  affiliation:          'Has affiliations',
  hosting:              'Hosted events',
  roster:               'Roster of 5 or more members',
  mirror_text:          'Name mirrored in description',
  recent_activity:      'Active in last 5 years',
  geographic_alignment: 'Geographic match',
};

function listWizardCardsForMember(memberId: string): WizardCard[] {
  const memberRow = account.findLegacyMemberIdById.get(memberId) as
    | { legacy_member_id: string | null }
    | undefined;
  const legacyMemberId = memberRow?.legacy_member_id ?? null;
  if (!legacyMemberId) return [];

  const membershipRows = legacyPersonClubAffiliations.listPendingForLegacyMember.all(
    legacyMemberId,
  ) as WizardMembershipCardRow[];
  const leadershipRows = clubBootstrapLeaders.listProvisionalForLegacyMember.all(
    legacyMemberId,
  ) as WizardLeadershipCardRow[];

  // Group membership rows by city for disambiguation. Single-club cities
  // produce normal cards; multi-club cities produce a disambiguation card.
  const cityGroups = new Map<string, WizardMembershipCardRow[]>();
  for (const r of membershipRows) {
    const cityKey = (r.club_city || '').toLowerCase();
    if (!cityGroups.has(cityKey)) cityGroups.set(cityKey, []);
    cityGroups.get(cityKey)!.push(r);
  }

  const memberships: (WizardMembershipCard | WizardDisambiguationCard)[] = [];
  for (const [, rows] of cityGroups) {
    if (rows.length === 1) {
      const r = rows[0];
      const band = confidenceBandFor(r.confidence_score);
      memberships.push({
        kind:                'membership' as const,
        isMembership:        true as const,
        isLeadership:        false as const,
        isDisambiguation:    false as const,
        questionLabel:       `Were you a member of ${r.club_name}?`,
        candidateId:         r.affiliation_id,
        clubId:              r.club_id,
        clubName:            r.club_name,
        confidenceBand:      band,
        confidenceBandLabel: CONFIDENCE_BAND_LABELS[band],
        clubDescription:     r.club_description || null,
        clubExternalUrl:     r.club_external_url || null,
      });
    } else {
      memberships.push({
        kind: 'disambiguation' as const,
        isMembership: false as const,
        isLeadership: false as const,
        isDisambiguation: true as const,
        city: rows[0].club_city,
        clubs: rows.map((r) => {
          const band = confidenceBandFor(r.confidence_score);
          return {
            candidateId:         r.affiliation_id,
            clubId:              r.club_id,
            clubName:            r.club_name,
            confidenceBand:      band,
            confidenceBandLabel: CONFIDENCE_BAND_LABELS[band],
            clubDescription:     r.club_description || null,
            clubExternalUrl:     r.club_external_url || null,
          };
        }),
      });
    }
  }

  const leaderships: WizardLeadershipCard[] = leadershipRows.map((r) => {
    const { structural, modifiers } = readSignalsForCandidate(r.candidate_id);
    const classified = classifyBootstrapLeader(structural, modifiers);
    const signals: SignalChecklistRow[] = [
      { signalType: 'listed_contact',       signalLabel: SIGNAL_LABELS.listed_contact,       isPresent: structural.listed_contact },
      { signalType: 'affiliation',          signalLabel: SIGNAL_LABELS.affiliation,          isPresent: structural.affiliation },
      { signalType: 'hosting',              signalLabel: SIGNAL_LABELS.hosting,              isPresent: structural.hosting },
      { signalType: 'roster',               signalLabel: SIGNAL_LABELS.roster,               isPresent: structural.roster },
      { signalType: 'mirror_text',          signalLabel: SIGNAL_LABELS.mirror_text,          isPresent: structural.mirror_text },
      { signalType: 'recent_activity',      signalLabel: SIGNAL_LABELS.recent_activity,      isPresent: modifiers.recent_activity },
      { signalType: 'geographic_alignment', signalLabel: SIGNAL_LABELS.geographic_alignment, isPresent: modifiers.geographic_alignment },
    ];
    return {
      kind:                'leadership' as const,
      isMembership:        false as const,
      isLeadership:        true as const,
      isDisambiguation:    false as const,
      questionLabel:       `Were you a leader or organizer of ${r.club_name}?`,
      consequencesNote:    `The old footbag.org site listed you as a contact for ${r.club_name}. Confirming makes you a co-leader of the club, brings it back to active if it is inactive, and grants you a one-time Active Player period. If you already co-lead another club, you will be added as a member instead.`,
      candidateId:         r.candidate_id,
      clubId:              r.club_id,
      clubName:            r.club_name,
      role:                r.role,
      roleLabel:           ROLE_LABELS[r.role],
      classification:      classified.classification,
      classificationLabel: CLASSIFICATION_LABELS[classified.classification],
      signals,
      clubDescription:     r.club_description || null,
      clubExternalUrl:     r.club_external_url || null,
    };
  });

  // Leadership first, then membership/disambiguation. Within each group,
  // sort alphabetically (by clubName for single cards, by city for disambiguation).
  const all: WizardCard[] = [...leaderships, ...memberships];
  const stageOrder = (c: WizardCard): number => (c.kind === 'leadership' ? 0 : 1);
  const sortKey = (c: WizardCard): string =>
    c.kind === 'disambiguation' ? c.city.toLowerCase() : c.clubName.toLowerCase();
  all.sort((a, b) => {
    const stageDiff = stageOrder(a) - stageOrder(b);
    if (stageDiff !== 0) return stageDiff;
    return sortKey(a).localeCompare(sortKey(b));
  });
  return all;
}

type ClubAffiliationsBranch =
  | 'promoted_co_leader'
  | 'affiliated_only'
  | 'idempotent'
  | 'declined'
  | 'confirmed'
  | 'cap_hit';

interface ClubAffiliationsResult {
  branch: ClubAffiliationsBranch;
  classification: 'strong' | 'weak' | 'none';
  actualRole: 'co-leader' | null;
  resolvedClubId?: string | null;
  taskState: 'in_progress' | 'completed';
}

// Read pre-computed evidence rows for a bootstrap leader candidate and split
// them into the StructuralSignals + ContextModifiers shapes that
// classifyBootstrapLeader accepts. Defaults missing signals to false so the
// classifier sees a complete shape even when signal rows are absent.
function readSignalsForCandidate(candidateId: string): {
  structural: StructuralSignals;
  modifiers: ContextModifiers;
  rows: ClubBootstrapLeaderSignalRow[];
} {
  const rows = clubBootstrapLeaderSignals.listByBootstrapLeaderId.all(
    candidateId,
  ) as ClubBootstrapLeaderSignalRow[];
  const structural: StructuralSignals = {
    listed_contact: false,
    affiliation: false,
    hosting: false,
    roster: false,
    mirror_text: false,
  };
  const modifiers: ContextModifiers = {
    tier_signal: false,
    recent_activity: false,
    geographic_alignment: false,
  };
  const structuralWritable = structural as unknown as Record<string, boolean>;
  const modifiersWritable  = modifiers  as unknown as Record<string, boolean>;
  for (const r of rows) {
    const present = r.is_present === 1;
    if (r.signal_type in structural) {
      structuralWritable[r.signal_type] = present;
    } else if (r.signal_type in modifiers) {
      modifiersWritable[r.signal_type] = present;
    }
  }
  return { structural, modifiers, rows };
}

function maybeCompleteClubAffiliationsTask(memberId: string): 'in_progress' | 'completed' {
  // The task is multi-card: completion fires only when the member has no
  // remaining unresolved cards AND holds a current club affiliation. A
  // member whose cards all resolved without a confirmed club stays
  // 'in_progress' so the find-or-create-your-club guidance screen renders
  // before the task ends (skip from that screen finishes it).
  const remaining = listWizardCardsForMember(memberId);
  if (remaining.length > 0) return 'in_progress';
  const current = (memberClubAffiliations.countCurrentByMemberId.get(memberId) as { c: number }).c;
  if (current === 0) return 'in_progress';
  completeTask(memberId, 'club_affiliations');
  return 'completed';
}

function submitMembershipResponse(
  memberId: string,
  candidateId: string,
  userDecision: 'confirm' | 'correct' | 'decline',
  activitySignal: ActivitySignal | null,
): ClubAffiliationsResult {
  const affiliation = legacyPersonClubAffiliations.findById.get(candidateId) as
    | LegacyPersonClubAffiliationRow
    | undefined;
  if (!affiliation) {
    throw new NotFoundError(`Legacy affiliation candidate not found: ${candidateId}`);
  }

  // 'correct' = "this record is wrong": same lpca transition as decline,
  // distinguished only by audit metadata.
  const treatAsDecline = userDecision === 'decline' || userDecision === 'correct';
  const result = clubService.confirmAffiliation(
    candidateId,
    memberId,
    treatAsDecline ? 'decline' : 'confirm',
  );

  // The activity answer feeds the viability predicate independently of the
  // membership answer, so it is recorded on every branch: a confirm resolves
  // to a live club; a decline/correct on an already-promoted candidate still
  // targets that candidate's live club; a decline/correct on an unpromoted
  // candidate has no live club to target, so the answer is stored as a
  // candidate-keyed flag (club_id NULL, keyed by the candidate id) and
  // surfaces on the admin cleanup queue's candidate-flag group.
  if (activitySignal) {
    const flagCandidate = legacyClubCandidates.findById.get(
      affiliation.legacy_club_candidate_id,
    ) as { id: string; mapped_club_id: string | null } | undefined;
    const liveClubId = result.resolvedClubId ?? flagCandidate?.mapped_club_id ?? null;
    if (liveClubId) {
      writeViabilitySignal(
        memberId,
        liveClubId,
        'stage1b_affiliated',
        activitySignal,
        'legacy_person_club_affiliation',
        candidateId,
      );
    } else if (flagCandidate) {
      writeViabilitySignal(
        memberId,
        null,
        'stage1b_affiliated',
        activitySignal,
        'legacy_club_candidate',
        flagCandidate.id,
      );
    }
  }

  const actionType =
    result.branch === 'confirmed'
      ? 'wizard.club_affiliations.confirmed'
      : result.branch === 'declined'
        ? 'wizard.club_affiliations.declined'
        : result.branch === 'cap_hit'
          ? 'wizard.club_affiliations.cap_hit'
          : 'wizard.club_affiliations.idempotent';
  appendAuditEntry({
    actionType,
    category:      'onboarding',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'legacy_person_club_affiliation',
    entityId:      candidateId,
    metadata: {
      kind:              'membership',
      user_decision:     userDecision,
      activity_signal:   activitySignal,
      confirm_branch:    result.branch,
      resolved_club_id:  result.resolvedClubId,
      new_affiliation_id: result.newAffiliationId,
      confidence_score:  affiliation.confidence_score,
    },
  });

  const branch: ClubAffiliationsBranch =
    result.branch === 'confirmed'  ? 'confirmed'
    : result.branch === 'declined' ? 'declined'
    : result.branch === 'cap_hit'  ? 'cap_hit'
    : 'idempotent';
  const taskState = maybeCompleteClubAffiliationsTask(memberId);
  return {
    branch,
    classification: 'none',
    actualRole:     null,
    resolvedClubId: result.resolvedClubId,
    taskState,
  };
}

function submitLeadershipResponse(
  memberId: string,
  candidateId: string,
  userDecision: 'confirm' | 'correct' | 'decline',
  activitySignal: ActivitySignal | null,
): ClubAffiliationsResult {
  const leader = clubBootstrapLeaders.findById.get(candidateId) as
    | ClubBootstrapLeaderRow
    | undefined;
  if (!leader) {
    throw new NotFoundError(`Bootstrap leader candidate not found: ${candidateId}`);
  }

  // Idempotency: a candidate already resolved (claimed / rejected / superseded)
  // produces a no-op result. The task is completed regardless so re-submits
  // do not block wizard progression.
  if (leader.status !== 'provisional') {
    const taskState = maybeCompleteClubAffiliationsTask(memberId);
    const branch: ClubAffiliationsBranch =
      leader.status === 'claimed' ? 'idempotent'
      : leader.status === 'rejected' ? 'declined'
      : 'idempotent';
    return { branch, classification: 'none', actualRole: null, taskState };
  }

  if (activitySignal) {
    writeViabilitySignal(
      memberId,
      leader.club_id,
      'stage1a_contact',
      activitySignal,
      'club_bootstrap_leader',
      candidateId,
    );
  }

  const { structural, modifiers, rows } = readSignalsForCandidate(candidateId);
  const result = classifyBootstrapLeader(structural, modifiers);

  if (userDecision === 'decline') {
    clubBootstrapLeaders.setStatusRejected.run('onboarding_service', candidateId);
    appendAuditEntry({
      actionType:    'wizard.club_affiliations.declined',
      category:      'onboarding',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'club_bootstrap_leader',
      entityId:      candidateId,
      metadata: {
        kind:           'leadership',
        activity_signal: activitySignal,
        classification: result.classification,
        matched_gate:   result.matchedGate,
        signal_rows:    rows.length,
      },
    });
    const taskState = maybeCompleteClubAffiliationsTask(memberId);
    return { branch: 'declined', classification: result.classification, actualRole: null, taskState };
  }

  // 'confirm' OR 'correct': auto-promote regardless of classification.
  // claimLeadership inserts a flat co-leader row, or falls through to
  // affiliate-only when the club is at the cap or the member already co-leads
  // another club. Admins can later add affiliate-only members as co-leaders or
  // reshape leadership via A_* admin powers.
  // The promote writes (status, club_leaders, affiliation) are atomic via
  // claimLeadership's internal transaction; the task-complete + audit
  // writes that follow are non-transactional but follow the same
  // append-only pattern as transitionTask (low risk: better-sqlite3 inserts
  // are synchronous and audit_entries inserts essentially cannot fail).
  const promote = clubService.claimLeadership(candidateId, memberId);
  appendAuditEntry({
    actionType:    'wizard.club_affiliations.promoted',
    category:      'onboarding',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'club_bootstrap_leader',
    entityId:      candidateId,
    metadata: {
      kind:             'leadership',
      activity_signal:  activitySignal,
      classification:   result.classification,
      matched_gate:     result.matchedGate,
      user_decision:    userDecision,
      promote_branch:   promote.branch,
      actual_role:      promote.actualRole,
      club_id:          promote.clubId,
      club_leader_id:   promote.clubLeaderId,
      affiliation_id:   promote.affiliationId,
      signal_rows:      rows.length,
    },
  });
  const taskState = maybeCompleteClubAffiliationsTask(memberId);
  return {
    branch:          promote.branch,
    classification:  result.classification,
    actualRole:      promote.actualRole,
    taskState,
  };
}

function submitClubAffiliationsResponse(
  memberId: string,
  body: Record<string, unknown>,
): ClubAffiliationsResult {
  // Body shape: { kind: 'membership' | 'leadership' (default 'leadership'),
  //               candidateId, userDecision, activitySignal? }. `kind` is
  //               optional for backward-compatibility with direct service
  //               callers (tests that predate the membership path); the
  //               controller-facing wrapper (`processClubAffiliationsSubmit`)
  //               always sets it explicitly from the form's hidden input.
  const candidateId  = typeof body.candidateId  === 'string' ? body.candidateId  : '';
  const userDecision = body.userDecision;
  const kindRaw      = typeof body.kind === 'string' ? body.kind : 'leadership';
  if (!candidateId) {
    throw new ValidationError('candidateId is required');
  }
  if (
    userDecision !== 'confirm' &&
    userDecision !== 'correct' &&
    userDecision !== 'decline'
  ) {
    throw new ValidationError(
      "userDecision must be one of 'confirm', 'correct', 'decline'",
    );
  }
  if (kindRaw !== 'membership' && kindRaw !== 'leadership') {
    throw new ValidationError("kind must be one of 'membership', 'leadership'");
  }

  const rawSignal = typeof body.activitySignal === 'string' ? body.activitySignal : null;
  const activitySignal: ActivitySignal | null =
    rawSignal && VALID_ACTIVITY_SIGNALS.has(rawSignal) ? rawSignal as ActivitySignal : null;

  return kindRaw === 'membership'
    ? submitMembershipResponse(memberId, candidateId, userDecision, activitySignal)
    : submitLeadershipResponse(memberId, candidateId, userDecision, activitySignal);
}

function submitTaskResponse(memberId: string, taskType: string, response: unknown): void {
  assertTaskType(taskType);
  const body = (response ?? {}) as Record<string, unknown>;
  if (taskType === 'personal_details') {
    memberService.setPersonalDetails(memberId, body);
    completeTask(memberId, taskType);
    return;
  }
  if (taskType === 'club_affiliations') {
    submitClubAffiliationsResponse(memberId, body);
    return;
  }
  throw new NotImplementedError(
    `submitTaskResponse handler for task_type "${taskType}" is not implemented`,
  );
}

export type WizardFlash =
  | {
      kind: 'WIZARD_LEGACY_CLAIM_RESULT';
      payload: { hpPersonId: string | null };
    }
  | { kind: 'WIZARD_AUTO_LINK_DRIFT' }
  | {
      kind: 'WIZARD_CLUB_CARD_RESOLVED';
      payload: { clubName: string; decision: 'confirm' | 'correct' | 'decline' };
    }
  | {
      kind: 'WIZARD_CLUB_CAP_HIT';
      payload: { clubName: string };
    };

// Per-method `formState` shapes carried in the `validation_error` arm
// of `WizardActionResult`. Typed per-method so controllers pass through
// to the template without `as` casts.

export type LegacyClaimSubmitFormState = { identifier: string };
export type LegacyClaimAutoLinkConfirmFormState =
  | { personId: string; personName: string; confidence: 'high' | 'medium' }
  | null;
export type LegacyClaimTokenConfirmFormState = null;
export type PersonalDetailsFormState = { city: string; region: string; country: string; birthDate: string; gender: string; yearValue: string; showFirstCompetitionYear: boolean; showCompetitiveResults: boolean };

// Per-arm types so the discriminant union's non-formState arms can be
// returned from helpers (e.g. advanceAfter) without binding to a
// specific TFormState parameter.
export type WizardAdvanceArm = { kind: 'advance'; nextTaskType: OnboardingTaskType | null };
export type WizardRetrySameArm = { kind: 'retry_same'; flash: WizardFlash | null };
export type WizardRateLimitedArm = { kind: 'rate_limited'; retryAfterSeconds: number };

export type WizardActionResult<TFormState = unknown> =
  | WizardAdvanceArm
  | WizardRetrySameArm
  | { kind: 'validation_error'; formState: TFormState; message: string }
  | WizardRateLimitedArm;

function advanceAfter(
  memberId: string,
  _currentTaskType: OnboardingTaskType,
): WizardAdvanceArm {
  startTaskList(memberId);
  // One sequencing algorithm for the whole wizard: the next task is simply the
  // lowest-index task still outstanding, so the advance and the gate /
  // completion redirects can never disagree about what comes next.
  return { kind: 'advance', nextTaskType: nextOutstandingTaskType(memberId) };
}

// Personal-details-before-matching applies to every legacy-claim resolution,
// not just the page GET: a resolving action that arrives by direct POST must not
// run until personal_details (which collects the required date of birth) is
// complete. The action bounces back to the task GET, which redirects the member
// to finish personal details.
function legacyClaimPrerequisiteUnmet(memberId: string): boolean {
  return prerequisiteTaskFor(memberId, 'legacy_claim') !== null;
}

async function processLegacyClaimSubmit(
  memberId: string,
  identifier: string,
  ip: string,
): Promise<WizardActionResult<LegacyClaimSubmitFormState>> {
  if (legacyClaimPrerequisiteUnmet(memberId)) {
    return { kind: 'retry_same', flash: null };
  }
  if (!identifier) {
    return {
      kind: 'validation_error',
      formState: { identifier: '' },
      message: 'Enter an identifier to search.',
    };
  }
  try {
    const outcome = identityAccessService.initiateLegacyClaim(memberId, identifier, ip);
    if (outcome.kind === 'auto_linked') {
      // initiateLegacyClaim commits the email-equality link inside its own
      // transaction, which cannot nest, so completing the task is a separate
      // write. A crash in the gap leaves the member linked with the task still
      // pending; the next legacy_claim GET reconciles it through
      // ensureLegacyClaimReflectsState, so the end state self-corrects.
      completeTask(memberId, 'legacy_claim');
      return advanceOrOfferCrossSource(memberId);
    }
    startTaskList(memberId);
    if (outcome.kind === 'enqueued') {
      return {
        kind: 'retry_same',
        flash: {
          kind: 'WIZARD_LEGACY_CLAIM_RESULT',
          payload: { hpPersonId: null },
        },
      };
    }
    const hp = identityAccessService.findHistoricalPersonForLinkSubmit(identifier);
    return {
      kind: 'retry_same',
      flash: {
        kind: 'WIZARD_LEGACY_CLAIM_RESULT',
        payload: { hpPersonId: hp ? hp.person_id : null },
      },
    };
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return {
        kind: 'rate_limited',
        retryAfterSeconds: err.retryAfterSeconds ?? 60,
      };
    }
    // ConflictError = a concurrent claimant won the race after the
    // pre-check; same user-readable inline message as the synchronous path.
    if (err instanceof ValidationError || err instanceof ConflictError) {
      return {
        kind: 'validation_error',
        formState: { identifier },
        message: err.message,
      };
    }
    throw err;
  }
}


// After a claim completes on one source, a cross-source offer for the other
// source may stage; staying on the task renders the offer card immediately,
// otherwise the wizard advances as usual.
function advanceOrOfferCrossSource(memberId: string): WizardActionResult<never> {
  const offer = identityAccessService.offerCrossSourceCandidate(memberId);
  if (offer.offered) {
    return { kind: 'retry_same', flash: null };
  }
  return advanceAfter(memberId, 'legacy_claim');
}

function parseMatchedAnchors(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function processLegacyClaimAutoLinkConfirm(
  memberId: string,
  personId: string,
): WizardActionResult<LegacyClaimAutoLinkConfirmFormState> {
  if (legacyClaimPrerequisiteUnmet(memberId)) {
    return { kind: 'retry_same', flash: null };
  }
  if (!personId) {
    return {
      kind: 'validation_error',
      formState: null,
      message: 'Invalid claim request.',
    };
  }
  // An open staged row for this member/person is itself authorization to
  // confirm (the staging pass computed the match); otherwise the view-time
  // classifier must produce the same person, or the card has drifted.
  const stagedRow = identityAccessService
    .listOpenStagedCandidates(memberId)
    .find((r) => r.historical_person_id === personId);
  let personName: string;
  let evidenceStrength: 'currently_controls_modern_email_matching_legacy' | 'declared_anchor_only';
  let confidence: 'high' | 'medium';
  // A match anchored on a declared old email the member has not proven control
  // of cannot confirm a claim: the mailbox round-trip is mandatory for an
  // old-email anchor. The verified form ('declared_old_email_verified') and the
  // login-email and name anchors are unaffected.
  let matchedViaUnverifiedOldEmail = false;
  if (stagedRow) {
    confidence = stagedRow.confidence;
    personName = '';
    // The staging pass already derived the evidence tier from the matched
    // anchor set; the confirmation carries it through.
    evidenceStrength =
      stagedRow.proposed_evidence_strength === 'currently_controls_modern_email_matching_legacy'
        ? 'currently_controls_modern_email_matching_legacy'
        : 'declared_anchor_only';
    // Re-derive the member's current best anchor rather than trusting the frozen
    // staged row: verifying the old email after the card was staged flips the
    // anchor to the verified form and must unblock this card. The frozen staged
    // value is a conservative fallback only when the current match is
    // inconclusive.
    const current = identityAccessService.getAutoLinkClassificationForMember(memberId);
    const currentAnchor =
      current.confidence === 'high' || current.confidence === 'medium'
        ? current.anchorSource
        : undefined;
    matchedViaUnverifiedOldEmail =
      currentAnchor === 'declared_old_email'
        ? true
        : currentAnchor === undefined
          ? parseMatchedAnchors(stagedRow.matched_anchors_json).includes('declared_old_email')
          : false;
  } else {
    const classification = identityAccessService.getAutoLinkClassificationForMember(memberId);
    if (classification.confidence !== 'high' && classification.confidence !== 'medium') {
      return { kind: 'retry_same', flash: { kind: 'WIZARD_AUTO_LINK_DRIFT' } };
    }
    if (classification.personId !== personId) {
      return { kind: 'retry_same', flash: { kind: 'WIZARD_AUTO_LINK_DRIFT' } };
    }
    confidence = classification.confidence;
    personName = classification.personName;
    // High confidence anchored on the verified login email carries the
    // email-control tier; a declared-old-email anchor or a name-variant
    // match carries only the asserted-identity floor tier.
    evidenceStrength =
      classification.confidence === 'high' && classification.anchorSource === 'login_email'
        ? 'currently_controls_modern_email_matching_legacy'
        : 'declared_anchor_only';
    matchedViaUnverifiedOldEmail = classification.anchorSource === 'declared_old_email';
  }
  if (matchedViaUnverifiedOldEmail) {
    return {
      kind: 'validation_error',
      formState: null,
      message: 'We matched this record to an old email address you have not confirmed yet. Open the verification link we sent to that address, then come back to confirm this match. If you can no longer reach that mailbox, use a different match or ask an admin to link it for you.',
    };
  }
  try {
    // Merge and the wizard task transition run in one transaction: a partial
    // failure cannot leave the member claimed but the task still pending.
    // The claim resolves any matching staged candidate to 'confirmed' and
    // emits the confirmed audit event inside the same transaction.
    transaction(() => {
      identityAccessService.claimHistoricalPersonInTx(memberId, personId, evidenceStrength);
      completeTask(memberId, 'legacy_claim');
    });
    return advanceOrOfferCrossSource(memberId);
  } catch (err) {
    if (err instanceof SurnameMismatchError) {
      // Recorded after the rollback so the forensic row survives the
      // failed claim.
      identityAccessService.recordHistoricalPersonClaimBlocked(memberId, err);
    }
    if (err instanceof ValidationError || err instanceof ConflictError) {
      return {
        kind: 'validation_error',
        formState: {
          personId,
          personName,
          confidence,
        },
        message: err.message,
      };
    }
    throw err;
  }
}

/**
 * Member confirms a cross-source LEGACY offer card: the staged offer's
 * legacy account is claimed with the offer's evidence tier; the offer row
 * resolves with the cross-source confirmed event inside the claim
 * transaction.
 */
function processCrossSourceLegacyConfirm(
  memberId: string,
  candidateId: string,
): WizardActionResult<null> {
  if (!candidateId) {
    return { kind: 'validation_error', formState: null, message: 'Invalid request.' };
  }
  try {
    const result = identityAccessService.confirmCrossSourceLegacyCandidate(memberId, candidateId);
    if (result.status === 'not_found') {
      // Already resolved or foreign id: re-render whatever cards remain
      // (same non-revealing UX as decline).
      return { kind: 'retry_same', flash: null };
    }
    return { kind: 'retry_same', flash: null };
  } catch (err) {
    if (err instanceof ValidationError || err instanceof ConflictError) {
      return { kind: 'validation_error', formState: null, message: err.message };
    }
    throw err;
  }
}

/**
 * Member declines a staged auto-link candidate from the wizard card. The
 * decline is terminal for that member/target pair; the wizard re-renders
 * without the card.
 */
function processLegacyClaimAutoLinkDecline(
  memberId: string,
  candidateId: string,
  personId: string,
): WizardActionResult<null> {
  if (candidateId) {
    identityAccessService.declineStagedCandidate(memberId, candidateId);
    // Both outcomes re-render the task: 'declined' drops the card; 'not_found'
    // (already resolved or foreign id) renders whatever cards remain, which is
    // the same non-revealing UX.
    return { kind: 'retry_same', flash: null };
  }
  if (personId) {
    // A classifier-produced card has no staged row yet; the decline is made
    // just as durable by staging the pair and resolving it declined. Either
    // outcome re-renders the task without the card.
    identityAccessService.declineClassifierCandidate(memberId, personId);
    return { kind: 'retry_same', flash: null };
  }
  return { kind: 'validation_error', formState: null, message: 'Invalid request.' };
}

function processLegacyClaimTokenConfirm(
  memberId: string,
  token: string,
): WizardActionResult<LegacyClaimTokenConfirmFormState> {
  if (!token) {
    return { kind: 'validation_error', formState: null, message: '' };
  }
  try {
    // One transaction so the token consume, the claim merge, and the wizard
    // task transition commit together; none lands without the others.
    transaction(() => {
      identityAccessService.consumeAndClaimLegacyInTx(memberId, token);
      completeTask(memberId, 'legacy_claim');
    });
    return advanceOrOfferCrossSource(memberId);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof ConflictError) {
      return { kind: 'validation_error', formState: null, message: err.message };
    }
    throw err;
  }
}

function processPersonalDetailsSubmit(
  memberId: string,
  city: string,
  region: string,
  country: string,
  birthDate: string,
  gender: string,
  yearValue: string,
  showFirstCompetitionYear: boolean,
  showCompetitiveResults: boolean,
): WizardActionResult<PersonalDetailsFormState> {
  try {
    // showCompetitiveResults rides the same setPersonalDetails transaction
    // as the other fields, so a crash cannot complete the task while
    // silently losing the preference.
    submitTaskResponse(memberId, 'personal_details', {
      city, region, country, birthDate, gender, yearValue, showFirstCompetitionYear,
      showCompetitiveResults,
    });
    return advanceAfter(memberId, 'personal_details');
  } catch (err) {
    if (err instanceof ValidationError) {
      return {
        kind: 'validation_error',
        formState: { city, region, country, birthDate, gender, yearValue, showFirstCompetitionYear, showCompetitiveResults },
        message: err.message,
      };
    }
    throw err;
  }
}


function processTaskSkip(
  memberId: string,
  taskType: OnboardingTaskType,
  attestedNoOldAccount = false,
): WizardActionResult {
  // personal_details and legacy_claim are required to become a member and
  // cannot be skipped.
  if (taskType === 'personal_details') {
    // Required fields must be saved; a skip request (only reachable by a
    // tampered POST, since the view offers no skip control) is a no-op that
    // re-renders the form.
    return { kind: 'retry_same', flash: null };
  }
  if (taskType === 'legacy_claim') {
    // The legacy decision is required; the wizard's "continue without linking"
    // control posts here and is the explicit DECISION, which COMPLETES the task
    // rather than skipping it. Like every other resolution of this task, it does
    // not run until personal_details is complete.
    if (legacyClaimPrerequisiteUnmet(memberId)) {
      return { kind: 'retry_same', flash: null };
    }
    // Linking is the expected path; continuing without it is reserved for a
    // member who never had an old-site account and must affirm that first.
    if (!attestedNoOldAccount) {
      return {
        kind: 'validation_error',
        formState: null,
        message: 'To continue without linking, confirm you never had an account on the old footbag.org.',
      };
    }
    completeTask(memberId, 'legacy_claim');
    return advanceAfter(memberId, 'legacy_claim');
  }
  // A task already resolved (completed or marked not applicable) cannot be
  // re-opened by a skip: a stray or tampered skip POST is a no-op that leaves
  // the terminal state intact rather than re-listing the task as outstanding.
  const state = getTaskState(memberId, taskType);
  if (state === 'completed' || state === 'not_applicable') {
    return { kind: 'retry_same', flash: null };
  }
  skipTask(memberId, taskType);
  return advanceAfter(memberId, taskType);
}

/**
 * Cross-surface HP claim: invoked by the out-of-wizard claim route
 * (`/history/:personId/claim/confirm`). Runs the merge and the wizard task
 * transition in one transaction so the dashboard widget can never disagree
 * with the underlying link state.
 *
 * Idempotent on the wizard side: completeTaskIfOutstanding is a no-op for
 * tasks already in a terminal state. Propagates ValidationError from the
 * underlying claim so the caller can re-render the form with a user-safe
 * message.
 */
function claimHistoricalPersonAndCompleteTask(
  memberId: string,
  personId: string,
  ip: string,
): void {
  // Reached only after onboarding completes (the router-level completion gate
  // guarantees it), so personal_details is already done; assert the invariant.
  if (legacyClaimPrerequisiteUnmet(memberId)) {
    throw new Error('personal_details must be complete before a historical-person claim');
  }
  identityAccessService.enforceHistoricalPersonClaimLimit(memberId, ip);
  try {
    transaction(() => {
      identityAccessService.claimHistoricalPersonInTx(memberId, personId);
      completeTaskIfOutstanding(memberId, 'legacy_claim');
    });
    identityAccessService.offerCrossSourceCandidate(memberId);
  } catch (err) {
    if (err instanceof SurnameMismatchError) {
      // Recorded after the rollback so the forensic row survives.
      identityAccessService.recordHistoricalPersonClaimBlocked(memberId, err);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Wizard club_affiliations dispatcher (controller-facing).
//
// Wraps submitClubAffiliationsResponse with:
//   - body-shape validation (validation_error result on missing kind /
//     candidateId / userDecision rather than thrown ValidationError)
//   - F1 anti-enumeration: candidate's legacy_member_id must match the
//     authenticated member's legacy_member_id; mismatch surfaces as
//     NotFoundError (controller maps to 404, identical UX to "row missing")
//   - taskState -> WizardActionResult mapping: 'completed' advances to the
//     next task; 'in_progress' redirects back to GET to render the next
//     remaining card.
// ---------------------------------------------------------------------------

export type ClubAffiliationsFormState = null;

function assertCandidateOwnership(
  memberId: string,
  candidateId: string,
  kind: 'membership' | 'leadership',
): void {
  const memberRow = account.findLegacyMemberIdById.get(memberId) as
    | { legacy_member_id: string | null }
    | undefined;
  const memberLegacyId = memberRow?.legacy_member_id ?? null;
  if (!memberLegacyId) {
    throw new NotFoundError(`Candidate not found: ${candidateId}`);
  }
  let candidateLegacyId: string | null = null;
  if (kind === 'leadership') {
    const cbl = clubBootstrapLeaders.findById.get(candidateId) as
      | ClubBootstrapLeaderRow
      | undefined;
    candidateLegacyId = cbl?.legacy_member_id ?? null;
  } else {
    const lpca = legacyPersonClubAffiliations.findById.get(candidateId) as
      | LegacyPersonClubAffiliationRow
      | undefined;
    candidateLegacyId = lpca?.legacy_member_id ?? null;
  }
  if (!candidateLegacyId || candidateLegacyId !== memberLegacyId) {
    throw new NotFoundError(`Candidate not found: ${candidateId}`);
  }
}

function submitDisambiguationResponse(
  memberId: string,
  selectedIds: string[],
  allIds: string[],
): ClubAffiliationsResult {
  for (const id of allIds) {
    assertCandidateOwnership(memberId, id, 'membership');
  }
  const selectedSet = new Set(selectedIds);
  let anyCapHit = false;
  for (const id of allIds) {
    const decision = selectedSet.has(id) ? 'confirm' : 'decline';
    const r = submitMembershipResponse(memberId, id, decision, null);
    // A confirm that hit the two-current-club cap left the card unresolved.
    // Carry that up so the wizard surfaces the cap notice instead of telling
    // the member the club was added.
    if (decision === 'confirm' && r.branch === 'cap_hit') anyCapHit = true;
  }
  const taskState = maybeCompleteClubAffiliationsTask(memberId);
  return {
    branch:         anyCapHit ? 'cap_hit' : selectedIds.length > 0 ? 'confirmed' : 'declined',
    classification: 'none',
    actualRole:     null,
    taskState,
  };
}

// A member confirming their own suggestion card is the promotion trigger for
// candidates that have no live clubs row yet. Promotion runs before the
// confirm transition so confirmAffiliation sees a mapped candidate; the
// confirming member's own affiliation row is excluded from the bulk
// 'promoted' carry-forward so it records the member's answer. Junk
// candidates are skipped here; the confirm path then 404s on them exactly
// like a missing row.
async function promoteCandidateIfUnmapped(memberId: string, affiliationId: string): Promise<void> {
  const affiliation = legacyPersonClubAffiliations.findById.get(affiliationId) as
    | LegacyPersonClubAffiliationRow
    | undefined;
  if (!affiliation || affiliation.resolution_status !== 'pending') return;
  const candidate = legacyClubCandidates.findById.get(affiliation.legacy_club_candidate_id) as
    | { id: string; mapped_club_id: string | null; classification: string }
    | undefined;
  if (!candidate || candidate.mapped_club_id || candidate.classification === 'junk') return;
  await clubService.promoteCandidate(candidate.id, memberId, {
    actorType: 'member',
    trigger:   'stage1',
    excludeAffiliationId: affiliationId,
  });
}

async function processClubAffiliationsSubmit(
  memberId: string,
  body: Record<string, unknown>,
): Promise<WizardActionResult<ClubAffiliationsFormState>> {
  const kindRaw = typeof body.kind === 'string' ? body.kind : '';

  if (kindRaw === 'disambiguation') {
    const allIds      = normalizeToArray(body.allCandidateIds);
    const selectedIds = normalizeToArray(body.selectedCandidateIds);
    if (allIds.length === 0) {
      return { kind: 'validation_error', formState: null, message: 'allCandidateIds is required' };
    }
    for (const id of allIds) {
      assertCandidateOwnership(memberId, id, 'membership');
    }
    for (const id of selectedIds) {
      if (allIds.includes(id)) await promoteCandidateIfUnmapped(memberId, id);
    }
    const result = submitDisambiguationResponse(memberId, selectedIds, allIds);
    if (result.taskState === 'completed') {
      return advanceAfter(memberId, 'club_affiliations');
    }
    if (result.branch === 'cap_hit') {
      // At least one confirmed club could not be added at the two-current-club
      // cap; the card stays actionable. Surface the cap notice rather than a
      // "resolved" banner so the member can free a slot.
      return {
        kind: 'retry_same',
        flash: { kind: 'WIZARD_CLUB_CAP_HIT', payload: { clubName: 'the selected club(s)' } },
      };
    }
    const selectedCount = selectedIds.length;
    return {
      kind: 'retry_same',
      flash: {
        kind: 'WIZARD_CLUB_CARD_RESOLVED',
        payload: {
          clubName: selectedCount > 0 ? `${selectedCount} club(s)` : 'none',
          decision: selectedCount > 0 ? 'confirm' : 'decline',
        },
      },
    };
  }

  const candidateId  = typeof body.candidateId  === 'string' ? body.candidateId  : '';
  const userDecision = body.userDecision;

  if (!candidateId) {
    return { kind: 'validation_error', formState: null, message: 'candidateId is required' };
  }
  if (
    userDecision !== 'confirm' &&
    userDecision !== 'correct' &&
    userDecision !== 'decline'
  ) {
    return {
      kind:      'validation_error',
      formState: null,
      message:   "userDecision must be one of 'confirm', 'correct', 'decline'",
    };
  }
  if (kindRaw !== 'membership' && kindRaw !== 'leadership') {
    return {
      kind:      'validation_error',
      formState: null,
      message:   "kind must be one of 'membership', 'leadership'",
    };
  }

  const rawSignal = typeof body.activitySignal === 'string' ? body.activitySignal : '';
  if (!rawSignal || !VALID_ACTIVITY_SIGNALS.has(rawSignal)) {
    return {
      kind:      'validation_error',
      formState: null,
      message:   'Please select whether this club is still active.',
    };
  }

  assertCandidateOwnership(memberId, candidateId, kindRaw);

  if (kindRaw === 'membership' && userDecision === 'confirm') {
    await promoteCandidateIfUnmapped(memberId, candidateId);
  }

  const cardsBefore = listWizardCardsForMember(memberId);
  const resolvedCard = cardsBefore.find(
    (c): c is WizardMembershipCard | WizardLeadershipCard =>
      c.kind !== 'disambiguation' && c.candidateId === candidateId,
  );
  const clubName = resolvedCard?.clubName ?? 'that club';

  const result = submitClubAffiliationsResponse(memberId, body);
  if (result.taskState === 'completed') {
    return advanceAfter(memberId, 'club_affiliations');
  }
  if (result.branch === 'cap_hit') {
    // At the two-current-club cap the card stays actionable; surface the cap
    // notice instead of a "resolved" banner so the member can free a slot.
    return {
      kind: 'retry_same',
      flash: { kind: 'WIZARD_CLUB_CAP_HIT', payload: { clubName } },
    };
  }
  return {
    kind: 'retry_same',
    flash: {
      kind: 'WIZARD_CLUB_CARD_RESOLVED',
      payload: { clubName, decision: userDecision },
    },
  };
}

// ---------------------------------------------------------------------------
// Club affiliation wrap-up. The wizard asks club questions only about the
// member's own mirror-suggested affiliations (the card flow above); a member
// whose cards all resolve without a confirmed club lands on a guidance
// screen pointing at the clubs browse and create-club surfaces.
// ---------------------------------------------------------------------------

export type ClubAffiliationStage = 'stage1' | 'wrap_up';

function getClubAffiliationStage(memberId: string): ClubAffiliationStage {
  return listWizardCardsForMember(memberId).length > 0 ? 'stage1' : 'wrap_up';
}

export type { ClubAffiliationsBranch, ClubAffiliationsResult };


export const memberOnboardingService = {
  getTaskWidget,
  getDashboardTaskWidget,
  nextOutstandingTaskType,
  startTaskList,
  startTask,
  skipTask,
  completeTask,
  completeTaskIfOutstanding,
  markTaskNotApplicable,
  ensureLegacyClaimReflectsState,
  legacyClaimLinkageIncomplete,
  ensureClubAffiliationsReflectsState,
  memberHadClubSuggestionMaterial,
  transitionToDetourPaused,
  submitTaskResponse,
  submitClubAffiliationsResponse,
  processClubAffiliationsSubmit,
  listWizardCardsForMember,
  processPersonalDetailsSubmit,
  processLegacyClaimSubmit,
  processLegacyClaimAutoLinkConfirm,
  processLegacyClaimAutoLinkDecline,
  processCrossSourceLegacyConfirm,
  processLegacyClaimTokenConfirm,
  processTaskSkip,
  dismissClubAffiliationsTask,
  claimHistoricalPersonAndCompleteTask,
  getTaskState,
  prerequisiteTaskFor,
  isOnboardingComplete,
  hasOtherOutstandingTasks,
  getClubAffiliationStage,
};
