/**
 * MemberOnboardingService -- post-verification onboarding wizard and dashboard task widget.
 *
 * Owns:
 *   - The onboarding task list and its lifecycle: idempotent startTaskList on first wizard GET,
 *     per-task state (pending until answered, then completed; there are no other states), and
 *     the sequential advance order that the wizard and the dashboard widget target both follow.
 *   - The three tasks: personal_details, legacy_claim, and club_affiliations. ALL THREE are
 *     required to become a full member, and each completes only by a recorded explicit answer,
 *     never by a bare page render: personal_details by saving its fields, legacy_claim by the
 *     claim decision (a claim, or continue-without-linking with the never-had-an-account
 *     affirmation), and club_affiliations by a written club affiliation or the explicit no-club
 *     answer, which also declines every remaining suggestion card in the same transaction. The
 *     club task also invites optional free-text insight about the club on the member's last card,
 *     or about clubs in their area on the wrap-up landing, stored as admin-only evidence for the
 *     club cleanup queue; leaving it blank writes nothing and never blocks the answer. The
 *     club task is optional to fulfil (no club is ever required) but not to answer. There is no
 *     skip, no dismissal, and no detour; the wizard carries no outward links. The
 *     results-visibility preference (show_competitive_results) is collected within the
 *     personal_details task, not as a separate task.
 *   - The membership-completion predicate isOnboardingComplete (all three tasks completed).
 *     Membership is an authorization level: an account is pending from registration until the
 *     predicate turns true, and a pending registrant holds a session but no member
 *     authorization. The auth middleware derives req.isMember from this predicate and the
 *     requireMember route guard routes a pending request to its next wizard task, so a pending
 *     registrant reaches only public browse, the wizard and its claim affordances, and logout.
 *     A wizard.complete audit row is emitted exactly once, on the transition that makes the
 *     predicate true.
 *
 * Does not own:
 *   - Legacy-account claim and historical-person matching (IdentityAccessService; the legacy_claim
 *     task delegates to it).
 *   - Member profile field writes, which MemberService owns; the wizard's
 *     personal_details task submits through it rather than writing columns.
 *   - Club promotion and leadership confirmation (ClubService).
 *
 * Serves (all auth-required; an unauthenticated request redirects to /login?returnTo=...):
 *   - GET /register/wizard/:taskType and the per-action sub-paths (the /submit POSTs, the
 *     club_affiliations /none POST, the legacy_claim /continue-without-linking POST, and the
 *     legacy_claim sub-actions). Unknown :taskType renders 404. GET /register/wizard/complete is
 *     the terminal page, rendered only when the completion predicate passes.
 *
 * Required patterns:
 *   - State-changing wizard POSTs follow post-redirect-get: a 303 to the next-task GET or to
 *     /register/wizard/complete on advance; a 303 to the same step with a signed flash cookie for a
 *     transient notice; a 422 re-render on validation error; a 429 with Retry-After on rate-limit.
 *   - The wizard never reveals whether the member has a plausible legacy match beyond the existing
 *     anti-enumeration contract.
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
 *   member_onboarding_tasks, club_viability_signals, club_insight_notes (and the tables the
 *   delegated services own).
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
  clubInsightNotes,
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

type ActivitySignal = 'active' | 'not_active';

// The wizard's activity question offers exactly these two answers: a member
// answering a club card commits to whether the club is still active, so every
// answered card feeds the viability gates. The schema CHECK admits the same
// two values, so a value outside this set arriving in a POST is a tampered or
// stale request and is refused at the door.
const VALID_ACTIVITY_SIGNALS: ReadonlySet<string> = new Set([
  'active', 'not_active',
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

// The insight question is optional, so an empty answer writes nothing at all
// rather than an empty row: a blank note is not evidence and would only dilute
// the admin surface that reads these. The cap is generous enough for a few
// sentences of local knowledge and small enough that the queue can render a
// note inline without truncation logic.
const MAX_INSIGHT_NOTE_LENGTH = 1000;

// Free text a member typed goes in as typed, minus the characters that would
// break the admin surface rendering it: control characters other than the
// newlines and tabs a member legitimately types.
function normalizeInsightNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      if (ch === '\n' || ch === '\t') return true;
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

// The wording of the insight question, shaped here with the rest of the
// wizard's copy so the template renders it rather than composing it. It is
// asked once per member, on the last card or on the wrap-up landing, because
// asking it beside every card would train members to leave it blank.
export interface ClubInsightPrompt {
  fieldName: string;
  legend: string;
  helpText: string;
  maxLength: number;
}

function buildClubInsightPrompt(onWrapUp: boolean): ClubInsightPrompt {
  return {
    fieldName: 'insightNote',
    legend: onWrapUp
      // The wrap-up landing names no club, so the card wording would be asking
      // about something the member cannot see.
      ? 'Do you know anything about footbag clubs in your area?'
      : 'Do you have any other insight or information about this club, or any other club in your area?',
    helpText: 'Optional. Anything you know helps us keep club listings accurate: a club that merged, moved, changed name, or is still going under someone new.',
    maxLength: MAX_INSIGHT_NOTE_LENGTH,
  };
}

// Has this member already left an insight note? The question is asked once, so
// a member who answers it on their last card is not asked again on the wrap-up
// landing they may land on straight afterwards.
function memberHasLeftClubInsight(memberId: string): boolean {
  const row = clubInsightNotes.countForMember.get(memberId) as { c: number } | undefined;
  return (row?.c ?? 0) > 0;
}

// clubId and the source-entity pair are all optional: a note left on a club
// card keys to that club or its candidate, and a note left on the wrap-up
// landing keys to nothing, because the member is writing about clubs in their
// area rather than about one the wizard named.
function writeInsightNote(
  memberId: string,
  clubId: string | null,
  sourceStage: 'onboarding_club_card' | 'onboarding_club_wrapup',
  noteText: string,
  sourceEntityType: string | null,
  sourceEntityId: string | null,
): void {
  clubInsightNotes.insertNote.run(
    `cin_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    new Date().toISOString(),
    'onboarding_service',
    memberId,
    clubId,
    sourceStage,
    noteText,
    sourceEntityType,
    sourceEntityId,
  );
  appendAuditEntry({
    actionType:    'wizard.club_insight.recorded',
    category:      'onboarding',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    clubId ? 'club' : (sourceEntityType ?? 'member'),
    entityId:      clubId ?? sourceEntityId ?? memberId,
    metadata: {
      source_stage: sourceStage,
      // The note itself is member-authored free text and never goes into an
      // audit row; the row records that one was left and how long it was.
      note_length:  noteText.length,
    },
  });
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

// Two states, matching the schema CHECK: a task is outstanding until the
// member answers it. Every exit is an explicit answer, so there is nothing to
// skip, dismiss, or park.
export const TASK_STATES = [
  'pending',
  'completed',
] as const;
export type OnboardingTaskState = typeof TASK_STATES[number];

// Member-facing notice wording for the club step's transient banners. Shaped
// here so the controller stays pass-through and the template never branches
// on a decision code.
function buildClubCapHitNoticeMessage(
  clubName: string,
  kind: 'membership' | 'leadership' = 'membership',
): string {
  // A capped leadership claim is not a former membership: the member is a
  // co-leader of the club and simply not one of its members, so the two cases
  // need different words for what actually happened.
  if (kind === 'leadership') {
    return `You are at the two current-club limit, so you lead ${clubName} but it is not one of your current clubs. To add it, leave one of your current clubs from your profile after onboarding.`;
  }
  return `You are at the two current-club limit, so ${clubName} was recorded as a former membership. To make it current, leave one of your current clubs from your profile after onboarding.`;
}

function buildClubResolvedNoticeMessage(
  decision: 'confirm' | 'correct' | 'decline',
  clubName: string,
): string {
  switch (decision) {
    case 'confirm': return `Added ${clubName} to your clubs.`;
    case 'decline': return `Marked ${clubName} as not yours.`;
    case 'correct': return `Noted that the ${clubName} record needs correction.`;
  }
}

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

// A task is outstanding until it is completed. Stated as a predicate rather
// than an equality so every consumer, the wizard sequence, the gate, the
// completion page and the dashboard widget, shares one definition of
// outstanding.
function isOutstandingState(state: string): boolean {
  return state !== 'completed';
}

// The next task to send a still-onboarding member to: the lowest-index task
// not yet completed. Residual non-pending states count as outstanding here so
// a member carrying one is routed back into the task, where entry repairs the
// row to pending. Returns null only when nothing is outstanding.
function nextOutstandingTaskType(memberId: string): OnboardingTaskType | null {
  const outstanding = (memberOnboarding.listForMember.all(memberId) as MemberOnboardingTaskRow[])
    .filter((r) => (r.task_type as OnboardingTaskType) in TASK_TYPE_INDEX)
    .filter((r) => isOutstandingState(r.state))
    .map((r) => r.task_type as OnboardingTaskType)
    .sort((a, b) => TASK_TYPE_INDEX[a] - TASK_TYPE_INDEX[b]);
  return outstanding[0] ?? null;
}

// The membership authorization predicate: the auth middleware derives
// req.isMember from it, and the requireMember route guard denies every
// member capability while it is false. An account becomes a member only after
// ALL THREE tasks are COMPLETED: personal_details (its required fields
// populated), the legacy_claim decision (a claim, or the explicit "nothing to
// claim" completion), and the club_affiliations answer (a written club
// affiliation, or the explicit no-club answer). Only completed satisfies
// this: a residual skipped, paused, or inapplicable row is unanswered, not
// done. Zero task rows (never entered the wizard) reads as incomplete.
function isOnboardingComplete(memberId: string): boolean {
  return getTaskState(memberId, 'personal_details') === 'completed'
      && getTaskState(memberId, 'legacy_claim') === 'completed'
      && getTaskState(memberId, 'club_affiliations') === 'completed';
}

// Whether the member still has an outstanding task OTHER than the given one.
// Drives the wizard submit label: completing this task continues the wizard
// when more steps remain, and finishes it when this is the last one.
function hasOtherOutstandingTasks(memberId: string, exceptTaskType: OnboardingTaskType): boolean {
  const rows = memberOnboarding.listForMember.all(memberId) as MemberOnboardingTaskRow[];
  return rows.some(
    (r) =>
      (r.task_type as OnboardingTaskType) !== exceptTaskType &&
      isOutstandingState(r.state),
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

/**
 * Complete a task, and when that completion is the one that makes the
 * membership predicate true, emit the member's single wizard.complete audit
 * row on the same edge. Computing the edge here, around the transition, covers
 * every completion path (wizard submits, the claim decision, the reconcilers,
 * the cross-surface claim) and cannot double-fire: the predicate is false
 * before at most one completing transition per member and true after it.
 */
function completeTask(memberId: string, taskType: string): void {
  const wasComplete = isOnboardingComplete(memberId);
  transitionTask(memberId, taskType, 'completed', 'wizard.task.completed');
  if (!wasComplete && isOnboardingComplete(memberId)) {
    appendAuditEntry({
      actionType:    'wizard.complete',
      category:      'onboarding',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      metadata: { completing_task: taskType },
    });
  }
}


/**
 * Cross-service hook: called when a member completes the underlying state of
 * a task outside the wizard surface (profile-edit saving first_competition_year,
 * direct HP claim succeeding, etc.). Idempotent: a no-op for tasks that are
 * already completed. When called for an
 * unmaterialized task, the task row is created in the target state directly.
 */
function completeTaskIfOutstanding(memberId: string, taskType: OnboardingTaskType): void {
  const existing = memberOnboarding.findByMemberAndType.get(memberId, taskType) as
    | MemberOnboardingTaskRow
    | undefined;
  if (existing && existing.state === 'completed') {
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
  if (!row || row.state === 'completed') return false;
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
  if (!row || row.state === 'completed') return false;
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

// A member's claimed identity is the pair (legacy_member_id,
// historical_person_id): a claim can link either anchor alone (a competition
// record with no old-site account links only the historical person), and club
// suggestion rows may be anchored on either. Every club-card read resolves both
// anchors and matches a row on whichever one it carries, so a
// historical-record-only claimant sees the club data attached to their record.
interface MemberIdentityAnchors {
  legacy_member_id: string | null;
  historical_person_id: string | null;
}

function findIdentityAnchors(memberId: string): MemberIdentityAnchors {
  const row = account.findLegacyAndHpIdsById.get(memberId) as
    | MemberIdentityAnchors
    | undefined;
  return {
    legacy_member_id:     row?.legacy_member_id ?? null,
    historical_person_id: row?.historical_person_id ?? null,
  };
}

/**
 * Whether the member ever had legacy club-suggestion material: either identity
 * anchor carrying at least one scored person-club affiliation, or a linked
 * legacy member id carrying a bootstrap leadership candidate (leadership rows
 * are legacy-anchored by schema). Drives the wrap-up landing copy: a member
 * with no material is told no legacy club affiliation was found, rather than
 * that their suggestion cards resolved without a club.
 */
function memberHadClubSuggestionMaterial(memberId: string): boolean {
  const anchors = findIdentityAnchors(memberId);
  if (!anchors.legacy_member_id && !anchors.historical_person_id) return false;
  const lpca = (legacyPersonClubAffiliations.countByMemberAnchors.get(
    anchors.legacy_member_id, anchors.legacy_member_id,
    anchors.historical_person_id, anchors.historical_person_id,
  ) as { c: number }).c;
  const cbl = anchors.legacy_member_id
    ? (clubBootstrapLeaders.countByLegacyMember.get(anchors.legacy_member_id) as { c: number }).c
    : 0;
  return lpca > 0 || cbl > 0;
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
  clubCity: string | null;
  clubCountry: string | null;
  // How the old site recorded this person's relationship to the club, shown so
  // the member can tell one suggestion from another.
  roleLabel: string;
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
  clubCity: string | null;
  clubCountry: string | null;
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
    clubCountry: string | null;
    roleLabel: string;
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

// How the legacy record described the member's relationship to the club. The
// vocabulary is the affiliation row's own; these are the words a member reads.
const INFERRED_ROLE_LABELS: Record<'member' | 'contact' | 'leader' | 'co-leader', string> = {
  'member':    'Member',
  'contact':   'Contact',
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
  const anchors = findIdentityAnchors(memberId);
  if (!anchors.legacy_member_id && !anchors.historical_person_id) return [];

  const allMembershipRows = legacyPersonClubAffiliations.listPendingForMemberAnchors.all(
    anchors.legacy_member_id, anchors.legacy_member_id,
    anchors.historical_person_id, anchors.historical_person_id,
  ) as WizardMembershipCardRow[];
  // Leadership candidates are legacy-anchored by schema (club_bootstrap_leaders
  // carries no historical-person column), so a historical-record-only claimant
  // has membership cards but never a leadership card.
  const leadershipRows = anchors.legacy_member_id
    ? clubBootstrapLeaders.listProvisionalForLegacyMember.all(
        anchors.legacy_member_id,
      ) as WizardLeadershipCardRow[]
    : [];

  // One club, one question: while a leadership card for a club is open, the
  // membership suggestion about the same club stays off the screen — the
  // leadership card collects both the relationship and the activity signal.
  // Confirming leadership supersedes the hidden row in the claim transaction;
  // declining leaves it pending, so the membership question then surfaces.
  const leadershipClubIds = new Set(leadershipRows.map((r) => r.club_id));
  const membershipRows = allMembershipRows.filter(
    (r) => !r.club_id || !leadershipClubIds.has(r.club_id),
  );

  // Group membership rows into one disambiguation card per place, so several
  // suggestions that plausibly describe the same membership are answered once
  // instead of card by card. The place is city AND country: two clubs in a
  // Springfield on different continents describe different memberships and are
  // never grouped. A suggestion whose city the mirror never recorded has no
  // place to group on and always gets its own card, because folding every
  // city-less row together would present unrelated clubs as one single-select
  // question and force the member to disclaim all but one of them.
  const placeGroups = new Map<string, { city: string; rows: WizardMembershipCardRow[] }>();
  const placelessRows: WizardMembershipCardRow[] = [];
  for (const r of membershipRows) {
    if (!r.club_city) {
      placelessRows.push(r);
      continue;
    }
    // Keyed as a structured pair rather than a joined string, so no separator
    // character can collide with one occurring inside a city or country name.
    const placeKey = JSON.stringify([
      r.club_city.toLowerCase(),
      (r.club_country ?? '').toLowerCase(),
    ]);
    let group = placeGroups.get(placeKey);
    if (!group) {
      group = { city: r.club_city, rows: [] };
      placeGroups.set(placeKey, group);
    }
    group.rows.push(r);
  }

  const toMembershipCard = (r: WizardMembershipCardRow): WizardMembershipCard => {
    const band = confidenceBandFor(r.confidence_score);
    return {
      kind:                'membership' as const,
      isMembership:        true as const,
      isLeadership:        false as const,
      isDisambiguation:    false as const,
      questionLabel:       `Were you a member of ${r.club_name}?`,
      candidateId:         r.affiliation_id,
      clubId:              r.club_id,
      clubName:            r.club_name,
      clubCity:            r.club_city,
      clubCountry:         r.club_country,
      roleLabel:           INFERRED_ROLE_LABELS[r.inferred_role],
      confidenceBand:      band,
      confidenceBandLabel: CONFIDENCE_BAND_LABELS[band],
      clubDescription:     r.club_description || null,
      clubExternalUrl:     r.club_external_url || null,
    };
  };

  const memberships: (WizardMembershipCard | WizardDisambiguationCard)[] =
    placelessRows.map(toMembershipCard);
  for (const group of placeGroups.values()) {
    if (group.rows.length === 1) {
      memberships.push(toMembershipCard(group.rows[0]));
    } else {
      memberships.push({
        kind: 'disambiguation' as const,
        isMembership: false as const,
        isLeadership: false as const,
        isDisambiguation: true as const,
        city: group.city,
        clubs: group.rows.map((r) => {
          const band = confidenceBandFor(r.confidence_score);
          return {
            candidateId:         r.affiliation_id,
            clubId:              r.club_id,
            clubName:            r.club_name,
            clubCountry:         r.club_country,
            roleLabel:           INFERRED_ROLE_LABELS[r.inferred_role],
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
      clubCity:            r.club_city,
      clubCountry:         r.club_country,
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
  // remaining unresolved cards AND holds a current club affiliation, which is
  // the recorded answer that finishes the step. A member whose cards all
  // resolved without a confirmed club stays 'in_progress' so the wrap-up
  // landing renders and waits for the explicit no-club answer, the only other
  // way the task completes.
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
  //
  // An idempotent branch means this card was already answered, so there is no
  // new answer to record: writing one appends a second signal row saying what
  // the first already said. Readers take a member's latest answer per club, so
  // the tally never changed, but the table is meant to hold one row per member
  // per club per stage and nothing enforces that, so a repeated submit was the
  // one way to break it. The leadership path already returns before its own
  // signal write for the same reason.
  if (activitySignal && result.branch !== 'idempotent') {
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
      cap_hit:          promote.capHit,
      superseded_membership_rows: promote.supersededMembershipRows,
      signal_rows:      rows.length,
    },
  });
  const taskState = maybeCompleteClubAffiliationsTask(memberId);
  return {
    // The leadership outcome is what the claim did; the cap is what it could
    // not do. A capped claim reports the cap, because that is the part the
    // member cannot see for themselves and would otherwise be told the
    // opposite of.
    branch:          promote.capHit ? 'cap_hit' : promote.branch,
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

  // Both card answers are required. The form marks the activity radios
  // required, but only this server-side check makes it hold: a tampered or
  // stale POST without a valid activity answer must not resolve the card
  // signal-less, because the wizard is the only surface that collects the
  // club-viability evidence.
  const rawSignal = typeof body.activitySignal === 'string' ? body.activitySignal : null;
  if (!rawSignal || !VALID_ACTIVITY_SIGNALS.has(rawSignal)) {
    throw new ValidationError(
      "activitySignal must be one of 'active', 'not_active'",
    );
  }
  const activitySignal = rawSignal as ActivitySignal;

  // Ownership is asserted here as well as in the controller-facing wrapper, so
  // the check travels with the transition rather than with one caller. The
  // card reads are anchor-scoped, but the write transitions resolve a row by
  // id alone: without this, any caller holding another member's affiliation id
  // could confirm that club onto themselves or reject the card its owner has
  // not answered yet.
  assertCandidateOwnership(memberId, candidateId, kindRaw);

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
      // The card the cap was hit on, because what the platform recorded
      // differs between the two and the notice has to say which happened.
      payload: { clubName: string; capKind: 'membership' | 'leadership' };
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


/**
 * The legacy-claim continue-without-linking decision: the member states they
 * never held an old-site account, which COMPLETES the required task. There is
 * no skip anywhere in the wizard; this is the claim task's explicit negative
 * answer, gated on the personal-details prerequisite like every other
 * resolution of the task.
 */
function processContinueWithoutLinking(
  memberId: string,
  attestedNoOldAccount = false,
): WizardActionResult {
  if (legacyClaimPrerequisiteUnmet(memberId)) {
    return { kind: 'retry_same', flash: null };
  }
  // A completed task cannot be re-decided by a stray or replayed POST.
  if (getTaskState(memberId, 'legacy_claim') === 'completed') {
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
  // The attestation decides every candidate card the platform staged for this
  // member: they are stating there is no old-site account to link. Resolve
  // them in the same transaction that completes the task, so the task can
  // never finish with a card left open — a completed claim task keeps
  // rendering while open candidates remain, which would otherwise go on
  // offering records to someone who just said none of them are theirs.
  transaction(() => {
    identityAccessService.declineOpenStagedCandidatesOnAttestationInTx(memberId);
    completeTask(memberId, 'legacy_claim');
  });
  return advanceAfter(memberId, 'legacy_claim');
}

/**
 * The club task's explicit no-club answer: "none of these are my clubs".
 * Declines every remaining suggestion card and completes the task in ONE
 * transaction, mirroring the continue-without-linking attestation, so the
 * task can never finish with a card left open. Bulk declines record no
 * activity evidence (like a per-card "Not sure") and carry a bulk marker in
 * their audit metadata so a considered per-card No stays distinguishable.
 * Both decline write paths are transaction-free, which is what makes the
 * single wrapping transaction safe; the confirm/promote branches open their
 * own transactions and are never reached from here.
 */
function processNoClubsAnswer(
  memberId: string,
  rawInsightNote?: unknown,
): WizardActionResult {
  if (prerequisiteTaskFor(memberId, 'club_affiliations')) {
    // Tampered or out-of-order POST: personal details are not on file yet.
    return { kind: 'retry_same', flash: null };
  }
  if (getTaskState(memberId, 'club_affiliations') === 'completed') {
    return { kind: 'retry_same', flash: null };
  }

  // The wrap-up landing is the one place a member with no suggested club can
  // tell us anything, so its note is keyed to no club: it is knowledge about
  // the member's area, read by area rather than by club.
  const insightNote = normalizeInsightNote(rawInsightNote);
  if (insightNote && insightNote.length > MAX_INSIGHT_NOTE_LENGTH) {
    return {
      kind:      'validation_error',
      formState: null,
      message:   `Please keep your note under ${MAX_INSIGHT_NOTE_LENGTH} characters.`,
    };
  }

  // Snapshot the remaining cards outside the transaction; the decline writes
  // below are the only mutations and they cannot add cards.
  const remaining = listWizardCardsForMember(memberId);
  transaction(() => {
    for (const card of remaining) {
      if (card.kind === 'membership') {
        bulkDeclineMembership(memberId, card.candidateId);
      } else if (card.kind === 'leadership') {
        bulkDeclineLeadership(memberId, card.candidateId);
      } else {
        for (const club of card.clubs) {
          bulkDeclineMembership(memberId, club.candidateId);
        }
      }
    }
    if (insightNote) {
      writeInsightNote(memberId, null, 'onboarding_club_wrapup', insightNote, null, null);
    }
    completeTask(memberId, 'club_affiliations');
  });
  return advanceAfter(memberId, 'club_affiliations');
}

// The two bulk-decline writers mirror the per-card decline paths exactly
// (same status transitions, same audit action types) minus the activity
// signal and the per-card completion probe, plus the bulk marker.
function bulkDeclineMembership(memberId: string, candidateId: string): void {
  const result = clubService.confirmAffiliation(candidateId, memberId, 'decline');
  appendAuditEntry({
    actionType:    'wizard.club_affiliations.declined',
    category:      'onboarding',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'legacy_person_club_affiliation',
    entityId:      candidateId,
    metadata: {
      kind:             'membership',
      user_decision:    'decline',
      activity_signal:  null,
      confirm_branch:   result.branch,
      resolved_club_id: result.resolvedClubId,
      bulk_answer:      true,
    },
  });
}

function bulkDeclineLeadership(memberId: string, candidateId: string): void {
  const leader = clubBootstrapLeaders.findById.get(candidateId) as
    | ClubBootstrapLeaderRow
    | undefined;
  if (!leader || leader.status !== 'provisional') return;
  clubBootstrapLeaders.setStatusRejected.run('onboarding_service', candidateId);
  appendAuditEntry({
    actionType:    'wizard.club_affiliations.declined',
    category:      'onboarding',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'club_bootstrap_leader',
    entityId:      candidateId,
    metadata: {
      kind:            'leadership',
      activity_signal: null,
      bulk_answer:     true,
    },
  });
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
//   - F1 anti-enumeration: the candidate must belong to the authenticated
//     member's own claimed identity — its legacy_member_id matches the
//     member's legacy_member_id, or (membership cards only) its
//     historical_person_id matches the member's historical_person_id. Each
//     anchor compares strictly against the member's own same-kind anchor,
//     never across kinds, so one member's anchor can never resolve another
//     member's card. Mismatch surfaces as NotFoundError (controller maps to
//     404, identical UX to "row missing")
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
  const anchors = findIdentityAnchors(memberId);
  if (kind === 'leadership') {
    // Leadership candidates are legacy-anchored by schema, so only the legacy
    // anchor can prove ownership.
    const cbl = clubBootstrapLeaders.findById.get(candidateId) as
      | ClubBootstrapLeaderRow
      | undefined;
    const owned =
      anchors.legacy_member_id !== null &&
      cbl?.legacy_member_id === anchors.legacy_member_id;
    if (!owned) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }
    return;
  }
  // Membership cards: owned when EITHER of the row's anchors equals the
  // member's own same-kind anchor. Anchors never compare across kinds, and a
  // null on either side never matches, so one member's anchor cannot resolve
  // another member's card.
  const lpca = legacyPersonClubAffiliations.findById.get(candidateId) as
    | LegacyPersonClubAffiliationRow
    | undefined;
  const ownedByLegacy =
    anchors.legacy_member_id !== null &&
    lpca?.legacy_member_id === anchors.legacy_member_id;
  const ownedByHistorical =
    anchors.historical_person_id !== null &&
    lpca?.historical_person_id === anchors.historical_person_id;
  if (!ownedByLegacy && !ownedByHistorical) {
    throw new NotFoundError(`Candidate not found: ${candidateId}`);
  }
}

function submitDisambiguationResponse(
  memberId: string,
  selectedId: string | null,
  allIds: string[],
): ClubAffiliationsResult {
  for (const id of allIds) {
    assertCandidateOwnership(memberId, id, 'membership');
  }
  // The grouped card resolves which club, if any, the member belonged to: it
  // declines only the clubs the member did NOT pick and leaves the chosen row
  // pending, so the next render presents that club's standard card and its
  // activity question. Confirming here would consume the pending row the
  // standard card renders from, and the activity signal would never be
  // collected.
  for (const id of allIds) {
    if (id === selectedId) continue;
    submitMembershipResponse(memberId, id, 'decline', null);
  }
  const taskState = selectedId !== null
    ? ('in_progress' as const)
    : maybeCompleteClubAffiliationsTask(memberId);
  return {
    branch:         selectedId !== null ? 'confirmed' : 'declined',
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
    // Single-select: the grouped card asks which ONE club, if any, the member
    // belonged to. Two picks would re-group into the same card forever.
    if (selectedIds.length > 1) {
      return { kind: 'validation_error', formState: null, message: 'Select at most one club.' };
    }
    const selectedId = selectedIds.length === 1 && allIds.includes(selectedIds[0])
      ? selectedIds[0]
      : null;
    for (const id of allIds) {
      assertCandidateOwnership(memberId, id, 'membership');
    }
    const result = submitDisambiguationResponse(memberId, selectedId, allIds);
    if (result.taskState === 'completed') {
      return advanceAfter(memberId, 'club_affiliations');
    }
    if (selectedId !== null) {
      // The chosen club's standard card renders next and collects the
      // membership confirmation and activity signal; no banner needed.
      return { kind: 'retry_same', flash: null };
    }
    return {
      kind: 'retry_same',
      flash: {
        kind: 'WIZARD_CLUB_CARD_RESOLVED',
        payload: { clubName: 'none', decision: 'decline' },
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

  // The optional insight text is checked before the answer is recorded, so an
  // over-long note sends the member back to a card they can still fix rather
  // than resolving the card and dropping what they wrote.
  const insightNote = normalizeInsightNote(body.insightNote);
  if (insightNote && insightNote.length > MAX_INSIGHT_NOTE_LENGTH) {
    return {
      kind:      'validation_error',
      formState: null,
      message:   `Please keep your note under ${MAX_INSIGHT_NOTE_LENGTH} characters.`,
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

  // The note is stored after the answer, so it keys to the club the answer
  // resolved to. A membership answer on a candidate with no live club yet has
  // no club id to key on, so the note follows the candidate and is stamped
  // with the club id if that candidate is ever promoted, exactly as the
  // activity signal is.
  // The note is invited once per member and is never required, so a member who
  // has already left one writes no second note. Without this a repeated submit
  // of the same card (a double-click reaches the endpoint twice, and neither
  // the route nor the service checks the wizard step) lands a duplicate on the
  // admin evidence surface.
  if (insightNote && !memberHasLeftClubInsight(memberId)) {
    const resolvedClubId = result.resolvedClubId
      ?? (resolvedCard?.kind === 'leadership' ? resolvedCard.clubId : resolvedCard?.clubId)
      ?? null;
    if (resolvedClubId) {
      writeInsightNote(memberId, resolvedClubId, 'onboarding_club_card', insightNote, null, null);
    } else {
      const affiliation = legacyPersonClubAffiliations.findById.get(candidateId) as
        | LegacyPersonClubAffiliationRow
        | undefined;
      writeInsightNote(
        memberId,
        null,
        'onboarding_club_card',
        insightNote,
        affiliation ? 'legacy_club_candidate' : null,
        affiliation ? affiliation.legacy_club_candidate_id : null,
      );
    }
  }

  if (result.branch === 'cap_hit') {
    // At the two-current-club cap the card still resolves, but what was
    // recorded differs by card: a membership Yes becomes a former membership,
    // while a leadership claim makes the member a co-leader of a club they are
    // not a member of. Either way the notice comes before any advance, so the
    // member learns how the answer was recorded; the next GET advances via the
    // reconciler when this was the last card.
    return {
      kind: 'retry_same',
      flash: {
        kind: 'WIZARD_CLUB_CAP_HIT',
        payload: { clubName, capKind: kindRaw },
      },
    };
  }
  if (result.taskState === 'completed') {
    return advanceAfter(memberId, 'club_affiliations');
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
// whose cards all resolve without a confirmed club lands on the wrap-up
// landing, which explains that clubs are joined or created from the clubs
// pages after onboarding and waits for the explicit no-club answer. The
// landing carries no outward links: joining and creating are member
// capabilities, fenced until onboarding completes.
// ---------------------------------------------------------------------------

export type ClubAffiliationStage = 'stage1' | 'wrap_up';

function getClubAffiliationStage(memberId: string): ClubAffiliationStage {
  return listWizardCardsForMember(memberId).length > 0 ? 'stage1' : 'wrap_up';
}

export type { ClubAffiliationsBranch, ClubAffiliationsResult };


export const memberOnboardingService = {
  nextOutstandingTaskType,
  startTaskList,
  startTask,
  completeTask,
  completeTaskIfOutstanding,
  ensureLegacyClaimReflectsState,
  legacyClaimLinkageIncomplete,
  ensureClubAffiliationsReflectsState,
  memberHadClubSuggestionMaterial,
  buildClubCapHitNoticeMessage,
  buildClubInsightPrompt,
  memberHasLeftClubInsight,
  buildClubResolvedNoticeMessage,
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
  processContinueWithoutLinking,
  processNoClubsAnswer,
  claimHistoricalPersonAndCompleteTask,
  getTaskState,
  prerequisiteTaskFor,
  isOnboardingComplete,
  hasOtherOutstandingTasks,
  getClubAffiliationStage,
};
