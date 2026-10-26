/**
 * MemberOnboardingService -- post-verification onboarding wizard and dashboard task widget.
 *
 * Owns:
 *   - The onboarding task list and its lifecycle once IdentityAccessService has created its
 *     rows, pending, in the transaction that verifies the email (a missing row reads as
 *     pending, and a POST that completes a task creates its row if needed), per-task state (pending until answered, then completed; there are no other states), and
 *     the sequential advance order that the wizard and the dashboard widget target both follow.
 *   - The three tasks: personal_details, legacy_claim, and club_affiliations. ALL THREE are
 *     required to become a full member, and each completes only by a recorded explicit answer,
 *     never by a bare page render: personal_details by saving its fields, legacy_claim by the
 *     claim decision (a claim, or one of the two continue-without-linking answers: never had
 *     an old-site account, or had one and cannot find it), and club_affiliations by a confirmed
 *     club affiliation or the explicit no-club
 *     answer, which also declines every remaining suggestion card when it is applied. The
 *     club task also invites optional free-text insight about the club on the member's last card,
 *     or about clubs in their area on the wrap-up landing, stored as admin-only evidence for the
 *     club cleanup queue; leaving it blank writes nothing and never blocks the answer. The
 *     club task is optional to fulfil (no club is ever required) but not to answer. There is no
 *     skip, no dismissal, and no detour; the wizard carries no outward links. The
 *     results-visibility preference (show_competitive_results) is collected within the
 *     personal_details task, not as a separate task.
 *   - The membership-completion predicate isOnboardingComplete (all three tasks completed, or
 *     the system member, which owns the curated content and never onboards).
 *     Membership is an authorization level: an account is pending from registration until the
 *     predicate turns true, and a prospective member holds a session but no member
 *     authorization. The auth middleware derives req.isMember from this predicate and the
 *     requireMember route guard routes a pending request to its next wizard task, so a
 *     prospective member reaches only public browse, the wizard and its claim affordances, and
 *     logout.
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
 *   - A prospective member is not a member, so nothing they answer that reaches beyond
 *     their own account lands in a shared table before the last task is answered. The
 *     claim and the club answers (cards, activity signals, notes, the no-club answer) are
 *     held as JSON on their step's task row; personal details, date of birth and declared
 *     anchors are written to the account as they go. The transaction that completes the
 *     last task writes every held answer, in the order given: the claim first, then the
 *     club answers, each under its own savepoint. An answer that can no longer be
 *     applied, whether the rules now refuse it or its replay faults, is dropped alone,
 *     recorded (wizard.held_answer.dropped, with the reason) and logged at warn, so it
 *     never locks the member in the wizard; a busy or failing database aborts the
 *     request instead, to be retried. A dropped claim takes the club answers with it
 *     except the no-club answer, and the completion page says that the claim could not
 *     be applied. The same grouped-card answer submitted twice is held once.
 *   - A member's club answer, given after onboarding, is written at once: nothing is
 *     held for a member, because nothing would ever apply it.
 *   - Until then the wizard reads the state the held answers imply by replaying them
 *     through the same writers inside a transaction that is rolled back, once per page,
 *     and checks a new answer the same way before holding it. Opening a wizard page
 *     persists nothing, and a page whose replay fails outright renders the state as
 *     written.
 *   - Each task completes in the transaction of the answer that settles it (the
 *     personal-details save, the claim or the non-claiming answer, the club card or the
 *     no-club answer), never on a later page load.
 *   - A completing answer is given once and not again. Each of the three -- the
 *     personal_details save, the club task's no-club answer, and the claim task's
 *     continue-without-linking decision -- refuses once its task is completed and bounces
 *     to the step's own GET, which is the single place deciding where a completed task
 *     sends the member. This holds against a stale tab, a back-button re-post and a crafted
 *     request alike, so a member cannot rewrite the personal details the claim task has
 *     already matched on. It is not a blanket freeze: the claim and club tasks still render
 *     and still take card-level actions in their completed state, for the reasons their
 *     render exceptions record (an open candidate card, a linkage still missing, a
 *     cap-hit answer that must be read beside the step that produced it).
 *   - A membership card whose club has no live clubs row yet promotes its candidate when
 *     onboarding completes, which creates the club; every refusal is checked and the
 *     candidate's web address validated when the member answers. Where that club's country writes its
 *     addresses with states or provinces and the candidate carries none, the card asks
 *     the member for one and promotion refuses without it, because a region-less club
 *     flattens the grouping on its country's page for every other club there. A
 *     candidate that already carries a state keeps it; that value descends from the
 *     curated club seed and outranks an answer supplied now.
 *   - The personal_details task precedes and gates the legacy_claim task: no resolving
 *     action (confirm, direct record claim, anchor addition, or the
 *     continue-without-linking decision) runs until personal_details is
 *     completed, so the required personal details including date of birth are on file
 *     before any matching. The gate is task-level only and never applies to the admin
 *     link-help apply path. Date of birth is collected only in personal_details, not the
 *     claim task; the continue-without-linking decision additionally requires the member to
 *     choose which of its two answers is true (never had an old-site account, or had one and
 *     cannot find it), and each is recorded as given, with the cards it passed over.
 *   - The audit log holds nothing about a prospective member. Claim evidence the claim
 *     step produces (an anchor added, a refused claim, the no-link answer) is held on
 *     the claim step's task row and written to the audit log by the transaction that
 *     completes onboarding; step transitions write no audit row.
 *   - The claim step is answered only when its task is completed and no answerable card in
 *     it is still open. This governs sequencing only: isOnboardingComplete reads the task
 *     rows alone, so an open row never takes membership away from a member who has already
 *     finished.
 *   - A claim confirmation records the evidence tier the member's anchor proves at that
 *     moment, re-derived from the live match when it still names the same person; the
 *     confidence band never sets it. An old email address is a matching key only: a match
 *     through one confirms like any other, at the declared-anchor tier.
 *   - Claim confirmations share the direct record claim's rate-limit bucket. A confirmation
 *     repeated after it already landed reports the success it already had rather than a
 *     refusal.
 *   - State-changing wizard POSTs are subject to the global Origin-pin CSRF middleware; a wizard
 *     POST is never added to that middleware's exemption list.
 *   - Every task page renders through the shared wizard layout primitive so all tasks present the
 *     same chrome.
 *   - The club insight note, the free text this service writes itself, is cleaned with the
 *     shared write-time sanitizer before its length is checked.
 *
 * Persistence:
 *   member_onboarding_tasks (state, and the held answers and held claim evidence in answer_json),
 *   club_viability_signals and club_insight_notes (written at completion), and the tables the
 *   delegated services own, also written at completion.
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
  inTransaction,
  rehearse,
  savepoint,
  transaction,
  type ClubBootstrapLeaderRow,
  type ClubBootstrapLeaderSignalRow,
  type LegacyPersonClubAffiliationRow,
  type MemberOnboardingTaskRow,
  type WizardMembershipCardRow,
  type WizardLeadershipCardRow,
} from '../db/db';
import { appendAuditEntry, type AuditAppendInput } from './auditService';
import { logger } from '../config/logger';
import { BirthDateParts } from '../lib/birthDate';
import { INVALID_TEXT_ENCODING_MESSAGE, sanitizeUserText } from '../lib/textSanitizer';
import { memberService } from './memberService';
import { clubService } from './clubService';
import { subdivisionsForCountry } from './countryUtils';
import {
  classifyBootstrapLeader,
  type StructuralSignals,
  type ContextModifiers,
} from './clubBootstrapClassificationService';
import { identityAccessService, type AuditSink, type ClaimTarget } from './identityAccessService';
import { readIntConfig } from './configReader';
import { type Candidate } from './legacyMatchingService';
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

// clubId is null for candidate-keyed flags: activity signals about a club
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

type InsightNoteResult =
  | { status: 'ok'; note: string | null }
  | { status: 'invalid'; message: string };

// The note is cleaned with the shared sanitizer before it is measured, so the
// limit counts what is stored and a note that was only markup writes nothing.
function normalizeInsightNote(raw: unknown): InsightNoteResult {
  if (typeof raw !== 'string') return { status: 'ok', note: null };
  const result = sanitizeUserText(raw, 'multi_line');
  if (result.status === 'invalid_encoding') {
    return { status: 'invalid', message: INVALID_TEXT_ENCODING_MESSAGE };
  }
  if (result.text.length > MAX_INSIGHT_NOTE_LENGTH) {
    return { status: 'invalid', message: `Please keep your note under ${MAX_INSIGHT_NOTE_LENGTH} characters.` };
  }
  return { status: 'ok', note: result.text.length > 0 ? result.text : null };
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
// A capped membership Yes and a capped leadership claim record the same thing,
// a former membership, because a co-leader is always a current member.
function buildClubCapHitNoticeMessage(clubName: string): string {
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

// The task row's own state and completed_at are the record of a step; the audit
// log takes only the wizard.complete row that makes the person a member.
function transitionTask(
  memberId: string,
  taskType: string,
  nextState: OnboardingTaskState,
): void {
  assertTaskType(taskType);
  const row = ensureTaskRow(memberId, taskType);
  if (row.state === nextState) return;
  const now = new Date().toISOString();
  const completedAt = nextState === 'completed' ? now : null;
  memberOnboarding.updateState.run(
    nextState, completedAt, now, 'onboarding_service', row.id,
  );
}

// A task is outstanding until it is completed. Stated as a predicate rather
// than an equality so every consumer, the wizard sequence, the gate, the
// completion page and the dashboard widget, shares one definition of
// outstanding.
function isOutstandingState(state: string): boolean {
  return state !== 'completed';
}

// Whether a step is fully answered, for sequencing: once it is completed. The
// claim step answers in one pass, so nothing in it stays open after it
// completes.
function isTaskAnswered(_memberId: string, _taskType: OnboardingTaskType, state: string): boolean {
  return !isOutstandingState(state);
}

// The next task to send a still-onboarding member to: the lowest-index task
// not yet answered. The catalogue is walked rather than the stored rows, and a
// missing row reads as pending, so a member with partial or no rows is routed
// to the first step they owe instead of being bounced between a completed step
// and the completion page. Returns null only when nothing is outstanding.
function nextOutstandingTaskType(memberId: string): OnboardingTaskType | null {
  return TASK_CATALOG.find(
    (t) => !isTaskAnswered(memberId, t, getTaskState(memberId, t) ?? 'pending'),
  ) ?? null;
}

// The membership authorization predicate: the auth middleware derives
// req.isMember from it, and the requireMember route guard denies every
// member capability while it is false. An account becomes a member only after
// ALL THREE tasks are COMPLETED: personal_details (its required fields
// populated), the legacy_claim decision (a claim, or the explicit "nothing to
// claim" completion), and the club_affiliations answer (a written club
// affiliation, or the explicit no-club answer). Only completed satisfies
// this: a residual skipped, paused, or inapplicable row is unanswered, not
// done. Zero task rows (never entered the wizard) reads as incomplete. The
// system member is the one exception: it owns the curated content and is a
// member without ever onboarding.
function isOnboardingComplete(memberId: string): boolean {
  const system = memberOnboarding.findIsSystem.get(memberId) as { is_system: number } | undefined;
  if (system?.is_system === 1) return true;
  return getTaskState(memberId, 'personal_details') === 'completed'
      && getTaskState(memberId, 'legacy_claim') === 'completed'
      && getTaskState(memberId, 'club_affiliations') === 'completed';
}

// Whether the member still has an outstanding task OTHER than the given one.
// Drives the wizard submit label: completing this task continues the wizard
// when more steps remain, and finishes it when this is the last one.
function hasOtherOutstandingTasks(memberId: string, exceptTaskType: OnboardingTaskType): boolean {
  return TASK_CATALOG.some(
    (t) => t !== exceptTaskType && isOutstandingState(getTaskState(memberId, t) ?? 'pending'),
  );
}

function getTaskState(memberId: string, taskType: OnboardingTaskType): OnboardingTaskState | null {
  const row = memberOnboarding.findByMemberAndType.get(memberId, taskType) as
    | MemberOnboardingTaskRow
    | undefined;
  return row ? row.state as OnboardingTaskState : null;
}

// The step that must be answered before `taskType` can run, or null when there
// is nothing outstanding ahead of it.
//
// The catalogue order is the rule, not merely the order the wizard offers. A
// registrant answers the steps in sequence, and the server holds them to it
// rather than trusting that they arrived by the offered route: routing alone
// decides only what the next link points at, so a request made directly would
// otherwise answer a later step first and leave the earlier one to become the
// answer that completes signing up.
//
// Deriving it from the catalogue rather than listing pairs keeps the rule true
// if a step is ever added or moved, and it subsumes the narrower gate this
// replaces: personal details still precede the claim step, because they are
// first in the catalogue and the matcher must not run before the date of birth
// it disambiguates on is on file.
function prerequisiteTaskFor(
  memberId: string,
  taskType: OnboardingTaskType,
): OnboardingTaskType | null {
  for (const earlier of TASK_CATALOG) {
    if (earlier === taskType) return null;
    if (!isTaskAnswered(memberId, earlier, getTaskState(memberId, earlier) ?? 'pending')) return earlier;
  }
  return null;
}

/**
 * Complete a task, and when that completion is the one that makes the
 * membership predicate true, emit the member's single wizard.complete audit
 * row on the same edge. Computing the edge here, around the transition, covers
 * every completion path (wizard submits, the claim decision,
 * the cross-surface claim) and cannot double-fire: the predicate is false
 * before at most one completing transition per member and true after it.
 */
function completeTask(memberId: string, taskType: string): void {
  // A replay re-runs held answers through the writers that apply them; it
  // never moves a task, because the step that held the answer already did.
  if (replayMode !== 'off') return;
  // The task transition, the held answers it releases and the completion row
  // commit together, so a member never exists without what they answered.
  if (!inTransaction()) {
    transaction(() => completeTask(memberId, taskType));
    return;
  }
  const wasComplete = isOnboardingComplete(memberId);
  transitionTask(memberId, taskType, 'completed');
  if (!wasComplete && isOnboardingComplete(memberId)) {
    const { claimNotApplied } = applyHeldAnswersOnCompletion(memberId);
    appendAuditEntry({
      actionType:    'wizard.complete',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      metadata: { completing_task: taskType, claim_not_applied: claimNotApplied },
    });
  }
}

// ---------------------------------------------------------------------------
// Held answers. A prospective member is not a member until the last onboarding
// task is answered, so nothing they answer that reaches beyond their own
// account lands in a shared table before then. The claim and the club answers
// are held on their step's own task row as JSON and written by the transaction
// that completes onboarding. Until then the wizard reads them by replaying them
// through the same writers that will apply them, inside a transaction that is
// rolled back: one set of rules, and nothing persisted.
// ---------------------------------------------------------------------------

interface HeldClaim {
  target: ClaimTarget;
  withSurname: boolean;
  heldAt: string;
}

// What a confirmed card needs to create its club when the candidate has none
// yet: the region the member gave and the web address validated when they
// answered, since that check is network I/O and cannot run at completion.
interface HeldPromotion {
  region: string | null;
  externalUrl: string | null;
}

type HeldClubAnswer =
  | {
      kind: 'card';
      card: 'membership' | 'leadership';
      candidateId: string;
      userDecision: 'confirm' | 'correct' | 'decline';
      activitySignal: ActivitySignal;
      insightNote: string | null;
      promotion: HeldPromotion | null;
      heldAt: string;
    }
  | { kind: 'disambiguation'; selectedId: string | null; allIds: string[]; heldAt: string }
  | { kind: 'no_clubs'; insightNote: string | null; heldAt: string };

function readHeld<T>(memberId: string, taskType: OnboardingTaskType): T | null {
  const row = memberOnboarding.findHeldAnswer.get(memberId, taskType) as
    | { answer_json: string | null } | undefined;
  return row?.answer_json ? JSON.parse(row.answer_json) as T : null;
}

function writeHeld(memberId: string, taskType: OnboardingTaskType, value: unknown): void {
  ensureTaskRow(memberId, taskType);
  memberOnboarding.setHeldAnswer.run(
    value === null ? null : JSON.stringify(value),
    new Date().toISOString(), 'onboarding_service', memberId, taskType,
  );
}

// A claim-evidence audit row (an anchor added, a refused claim, the no-link
// answer) a prospective member's claim step produced. The audit log holds
// nothing about someone who is not a member, so the row waits on the claim
// step's task row, with when it happened, and is written at completion.
type HeldAuditEntry = AuditAppendInput & { heldAt: string };

interface HeldLegacyClaimStep {
  claim?: HeldClaim;
  audit?: HeldAuditEntry[];
}

function readHeldLegacyClaimStep(memberId: string): HeldLegacyClaimStep {
  return readHeld<HeldLegacyClaimStep>(memberId, 'legacy_claim') ?? {};
}

function readHeldClaim(memberId: string): HeldClaim | null {
  return readHeldLegacyClaimStep(memberId).claim ?? null;
}

// The audit sink the claim step passes to the identity writers: a member's row
// is written at once, a prospective member's is held.
function auditOrHold(memberId: string): AuditSink {
  return (input) => {
    if (isOnboardingComplete(memberId)) {
      appendAuditEntry(input);
      return;
    }
    const held = readHeldLegacyClaimStep(memberId);
    writeHeld(memberId, 'legacy_claim', {
      ...held,
      audit: [...(held.audit ?? []), { ...input, heldAt: new Date().toISOString() }],
    });
  };
}

// Inside the completion transaction, once the person is a member: write the
// held claim-evidence rows in the order they happened.
function releaseHeldAuditEntries(memberId: string): void {
  for (const { heldAt, ...input } of readHeldLegacyClaimStep(memberId).audit ?? []) {
    appendAuditEntry({ ...input, metadata: { ...(input.metadata ?? {}), held_at: heldAt } });
  }
}

function readHeldClubAnswers(memberId: string): HeldClubAnswer[] {
  return readHeld<{ answers: HeldClubAnswer[] }>(memberId, 'club_affiliations')?.answers ?? [];
}

function holdsAnything(memberId: string): boolean {
  return readHeldClaim(memberId) !== null || readHeldClubAnswers(memberId).length > 0;
}

function holdClaim(memberId: string, claim: HeldClaim): void {
  writeHeld(memberId, 'legacy_claim', { ...readHeldLegacyClaimStep(memberId), claim });
}

function holdClubAnswer(memberId: string, answer: HeldClubAnswer): void {
  writeHeld(memberId, 'club_affiliations', { answers: [...readHeldClubAnswers(memberId), answer] });
}

type ReplayMode = 'off' | 'rehearse' | 'apply';
let replayMode: ReplayMode = 'off';

// A held claim the claim rules now refuse: the record was taken by someone who
// finished first, or marked deceased, while the answer was held.
class HeldClaimUnavailable extends Error {}

function errorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

// Held answers are append-only, so one the rules now refuse, or one whose
// replay faults, would otherwise fail every later page and the completion
// itself, leaving the member stuck in the wizard for good. Every failure
// therefore drops that one answer, except a busy or failing database: that
// says nothing about the answer, so the request fails and can be retried.
function isDroppable(err: unknown): boolean {
  const code = errorCode(err);
  return !(code?.startsWith('SQLITE_BUSY') || code?.startsWith('SQLITE_IOERR'));
}

function dropReason(err: unknown): string {
  if (err === null) return 'claim_not_applied';
  if (err instanceof HeldClaimUnavailable) return 'claim_refused';
  return errorCode(err) ?? (err instanceof Error ? err.name : 'unknown');
}

// A drop is recorded and logged at warn, the level production shows, because
// an answer the member gave that never landed is something an operator must
// be able to see without reading the audit log.
function recordHeldAnswerDropped(memberId: string, taskType: OnboardingTaskType, answerKind: string, err: unknown): void {
  const reason = dropReason(err);
  logger.warn('held onboarding answer dropped at completion', {
    member_id: memberId, task_type: taskType, answer_kind: answerKind, reason,
  });
  appendAuditEntry({
    actionType:    'wizard.held_answer.dropped',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'member',
    entityId:      memberId,
    metadata: { task_type: taskType, answer_kind: answerKind, reason },
  });
}

function applyHeldClaim(memberId: string, claim: HeldClaim): void {
  const outcome = claim.withSurname
    ? identityAccessService.claimWithFormerSurnameInTx(memberId, claim.target)
    : identityAccessService.claimCandidateInTx(memberId, claim.target);
  if (outcome.status === 'refused') throw new HeldClaimUnavailable();
}

function applyHeldClubAnswer(memberId: string, answer: HeldClubAnswer): void {
  if (answer.kind === 'card') {
    applyClubCard(memberId, answer);
  } else if (answer.kind === 'disambiguation') {
    applyDisambiguation(memberId, answer.selectedId, answer.allIds);
  } else {
    applyNoClubs(memberId, answer.insightNote);
  }
}

/**
 * Re-run every answer the member holds through the writers that apply it, in
 * the order they were given: the claim first, because the club cards derive
 * from the identity it gives, then the club answers. Each runs under its own
 * savepoint, so an answer the rules now refuse is dropped alone. A dropped
 * claim takes every club answer with it except the no-club answer, because
 * those answers were about an identity the member did not get. In 'apply'
 * mode the caller's transaction commits the result and each drop is recorded;
 * in 'rehearse' mode the caller rolls everything back.
 */
function replayHeldAnswers(memberId: string, mode: 'rehearse' | 'apply'): { claimNotApplied: boolean } {
  const previous = replayMode;
  replayMode = mode;
  try {
    let claimNotApplied = false;
    const claim = readHeldClaim(memberId);
    if (claim) {
      try {
        savepoint(() => applyHeldClaim(memberId, claim));
      } catch (err) {
        if (!isDroppable(err)) throw err;
        claimNotApplied = true;
        if (mode === 'apply') recordHeldAnswerDropped(memberId, 'legacy_claim', 'claim', err);
      }
    }
    for (const answer of readHeldClubAnswers(memberId)) {
      if (claimNotApplied && answer.kind !== 'no_clubs') {
        if (mode === 'apply') recordHeldAnswerDropped(memberId, 'club_affiliations', answer.kind, null);
        continue;
      }
      try {
        savepoint(() => applyHeldClubAnswer(memberId, answer));
      } catch (err) {
        if (!isDroppable(err)) throw err;
        if (mode === 'apply') recordHeldAnswerDropped(memberId, 'club_affiliations', answer.kind, err);
      }
    }
    return { claimNotApplied };
  } finally {
    replayMode = previous;
  }
}

// Inside the transaction that completes onboarding: write every held answer
// and release the holds.
function applyHeldAnswersOnCompletion(memberId: string): { claimNotApplied: boolean } {
  releaseHeldAuditEntries(memberId);
  if (!holdsAnything(memberId)) {
    writeHeld(memberId, 'legacy_claim', null);
    return { claimNotApplied: false };
  }
  const outcome = replayHeldAnswers(memberId, 'apply');
  writeHeld(memberId, 'legacy_claim', null);
  writeHeld(memberId, 'club_affiliations', null);
  return outcome;
}

/**
 * Run `work` on top of the member's held answers, in a transaction that is
 * rolled back. The whole body runs as a rehearsal, so an answer that would
 * finish the club step only reports that; the caller completes the step for
 * real in its own transaction rather than running completion inside this one.
 */
function rehearseOnHeld<T>(memberId: string, work: () => T): T {
  return rehearse(() => {
    const previous = replayMode;
    replayMode = 'rehearse';
    try {
      replayHeldAnswers(memberId, 'rehearse');
      return work();
    } finally {
      replayMode = previous;
    }
  });
}

/**
 * Read wizard state as the member's held answers would leave it. Inside a
 * transaction the caller has already arranged the state it wants read; with
 * nothing held there is nothing to replay; otherwise the answers are replayed
 * and rolled back around the read. A replay that fails outright falls back to
 * the state as written, so a page the member needs still renders.
 */
function withHeldAnswers<T>(memberId: string, read: () => T): T {
  if (inTransaction() || !holdsAnything(memberId)) return read();
  try {
    return rehearseOnHeld(memberId, read);
  } catch (err) {
    logger.warn('wizard read fell back to unreplayed state', {
      member_id: memberId, reason: dropReason(err),
    });
    return read();
  }
}

// Whether the member's last completion left a held claim unapplied, so the
// page they land on can say so once.
function claimNotAppliedAtCompletion(memberId: string): boolean {
  const row = memberOnboarding.findCompletionAudit.get(memberId) as
    | { metadata_json: string | null } | undefined;
  if (!row?.metadata_json) return false;
  return (JSON.parse(row.metadata_json) as { claim_not_applied?: boolean }).claim_not_applied === true;
}

const CLAIM_NOT_APPLIED_NOTICE =
  "We couldn't link the old footbag.org record you chose, because it is no longer available. You can ask the IFPA administrator to look into it with the Contact IFPA admin link on your profile.";


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
  /**
   * Confirming a membership on a club the old site never turned into a real
   * club record creates that club, and the country page groups clubs by state
   * or province only when every club in the country has one. The mirror the
   * candidates came from carried no state, so the member is asked for it here
   * rather than letting one confirmation flatten a country's whole listing.
   * False whenever the state is already known or the country does not use one.
   */
  needsRegion: boolean;
  regionQuestionLabel: string;
  regionOptions: Array<{ value: string; label: string }>;
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
    const subdivisions = subdivisionsForCountry(r.club_country ?? '');
    const needsRegion = subdivisions.length > 0 && !r.club_region;
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
      needsRegion,
      regionQuestionLabel: `Which state or province is ${r.club_name} in?`,
      // Clubs store the full state or province name, so that is what the
      // control offers and submits.
      regionOptions:       needsRegion
        ? subdivisions.map((s) => ({ value: s.label, label: s.label }))
        : [],
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
  // Inside a replay this only reports the outcome; the step that holds the
  // answer completes the task in its own transaction.
  const remaining = listWizardCardsForMember(memberId);
  if (remaining.length > 0) return 'in_progress';
  const current = (memberClubAffiliations.countCurrentByMemberId.get(memberId) as { c: number }).c;
  if (current === 0) return 'in_progress';
  if (replayMode === 'off') completeTask(memberId, 'club_affiliations');
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
  const result = clubService.confirmAffiliationInTx(
    candidateId,
    memberId,
    treatAsDecline ? 'decline' : 'confirm',
  );

  // The activity signal feeds the viability predicate independently of the
  // membership answer, so it is recorded on every branch: a confirm resolves
  // to a live club; a decline/correct on an already-promoted candidate still
  // targets that candidate's live club; a decline/correct on an unpromoted
  // candidate has no live club to target, so the answer is stored as a
  // candidate-keyed flag (club_id NULL, keyed by the candidate id) and
  // surfaces on the admin cleanup queue's candidate-flag group.
  //
  // An idempotent branch means this card was already answered, so there is no
  // new answer to record: writing one appends a second signal row saying what
  // the first already said. Readers take a member's latest signal per club, so
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

  // A repeated answer changed nothing, so like the signal above it writes no row.
  if (result.branch !== 'idempotent') {
    appendAuditEntry({
      actionType:
        result.branch === 'confirmed'
          ? 'wizard.club_affiliations.confirmed'
          : result.branch === 'declined'
            ? 'wizard.club_affiliations.declined'
            : 'wizard.club_affiliations.cap_hit',
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
  }

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
  // reshape leadership via A_* admin powers. The promote writes, the audit row
  // and the task completion share the caller's transaction.
  const promote = clubService.claimLeadershipInTx(candidateId, memberId);
  appendAuditEntry({
    actionType:    'wizard.club_affiliations.promoted',
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
    throw new ValidationError('That form is out of date. Reload the page and answer the card again.');
  }
  if (
    userDecision !== 'confirm' &&
    userDecision !== 'correct' &&
    userDecision !== 'decline'
  ) {
    throw new ValidationError(
      'Choose whether that club was yours.',
    );
  }
  if (kindRaw !== 'membership' && kindRaw !== 'leadership') {
    throw new ValidationError('That form is out of date. Reload the page and answer the card again.');
  }

  // Both card answers are required. The form marks the activity radios
  // required, but only this server-side check makes it hold: a tampered or
  // stale POST without a valid activity answer must not resolve the card
  // signal-less, because the wizard is the only surface that collects the
  // club-viability evidence.
  const rawSignal = typeof body.activitySignal === 'string' ? body.activitySignal : null;
  if (!rawSignal || !VALID_ACTIVITY_SIGNALS.has(rawSignal)) {
    throw new ValidationError(
      'Please select whether this club is still active.',
    );
  }
  const activitySignal = rawSignal as ActivitySignal;

  // A member's answer is written at once; a prospective member's is held and
  // lands with the rest when the last onboarding task is answered. Either way
  // the card's ownership is asserted with the transition, and the step's
  // completion commits with the answer that finishes it.
  return holdClubCardAnswer(memberId, {
    kind: 'card',
    card: kindRaw,
    candidateId,
    userDecision,
    activitySignal,
    insightNote: null,
    promotion: null,
    heldAt: new Date().toISOString(),
  }).result;
}

/**
 * Apply one club card answer: create the club first when the confirmed card's
 * candidate has none, then record the answer, then the optional note. Runs
 * inside a transaction, both when the wizard rehearses an answer and when
 * completion applies it. Returns the outcome and the club name the card showed.
 */
function applyClubCard(
  memberId: string,
  answer: Extract<HeldClubAnswer, { kind: 'card' }>,
): { result: ClubAffiliationsResult; clubName: string } {
  const { candidateId, card, userDecision, activitySignal, insightNote } = answer;
  assertCandidateOwnership(memberId, candidateId, card);
  if (card === 'membership' && userDecision === 'confirm' && answer.promotion) {
    promoteIfUnmappedInTx(memberId, candidateId, answer.promotion);
  }
  const resolvedCard = listWizardCardsForMember(memberId).find(
    (c): c is WizardMembershipCard | WizardLeadershipCard =>
      c.kind !== 'disambiguation' && c.candidateId === candidateId,
  );
  const clubName = resolvedCard?.clubName ?? 'that club';
  const result = card === 'membership'
    ? submitMembershipResponse(memberId, candidateId, userDecision, activitySignal)
    : submitLeadershipResponse(memberId, candidateId, userDecision, activitySignal);
  // The note is invited once per member and stored with the answer, keyed to
  // the club the answer resolved to; a membership answer on a candidate with no
  // live club yet keys it to the candidate, stamped with the club id if the
  // candidate is ever promoted. An answer already given carries no note.
  if (result.branch !== 'idempotent' && insightNote && !memberHasLeftClubInsight(memberId)) {
    const resolvedClubId = result.resolvedClubId ?? resolvedCard?.clubId ?? null;
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
  return { result, clubName };
}

/**
 * A card answer. A member's is written at once, as any member's club answer
 * is. A prospective member's is rehearsed on top of what they already hold,
 * and held when it is a new answer. When it is the answer that finishes the
 * club step, the step completes in the same transaction, and if that completes
 * onboarding every held answer is written there too.
 */
function holdClubCardAnswer(
  memberId: string,
  answer: Extract<HeldClubAnswer, { kind: 'card' }>,
): { result: ClubAffiliationsResult; clubName: string } {
  if (isOnboardingComplete(memberId)) {
    return transaction(() => applyClubCard(memberId, answer));
  }
  const outcome = rehearseOnHeld(memberId, () => applyClubCard(memberId, answer));
  if (outcome.result.branch !== 'idempotent') {
    transaction(() => {
      holdClubAnswer(memberId, answer);
      if (outcome.result.taskState === 'completed') completeTask(memberId, 'club_affiliations');
    });
  }
  return outcome;
}

function submitTaskResponse(memberId: string, taskType: string, response: unknown): void {
  assertTaskType(taskType);
  const body = (response ?? {}) as Record<string, unknown>;
  if (taskType === 'personal_details') {
    // The save and the completion commit together, so the step can never be
    // completed without its answer or answered without completing.
    transaction(() => {
      memberService.setPersonalDetailsInTx(memberId, body);
      completeTask(memberId, taskType);
    });
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

export type PersonalDetailsFormState = { city: string; region: string; country: string; birthDay: string; birthMonth: string; birthYear: string; gender: string; yearValue: string; showCompetitiveResults: boolean };

// Per-arm types so the discriminant union's non-formState arms can be
// returned from helpers (e.g. advanceAfter) without binding to a
// specific TFormState parameter.
export type WizardAdvanceArm = { kind: 'advance'; nextTaskType: OnboardingTaskType | null };
export type WizardRetrySameArm = {
  kind: 'retry_same';
  flash: WizardFlash | null;
  /**
   * Query string appended to the task URL the member is sent back to, without
   * the leading `?`. The claim step reads its notices from the query, so an
   * action that lands the member back on the step with something to say passes
   * it here rather than inventing a second notice channel.
   */
  query?: string;
};
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

// Claim confirmations are rate-limited per member, per source address and per
// target record, on the same buckets and settings as the direct record claim.
function claimConfirmRateLimited(memberId: string, ip: string, targetId?: string): WizardRateLimitedArm | null {
  try {
    identityAccessService.enforceHistoricalPersonClaimLimit(memberId, ip, targetId);
    return null;
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return { kind: 'rate_limited', retryAfterSeconds: err.retryAfterSeconds ?? 60 };
    }
    throw err;
  }
}

// The one refusal every claim the re-check turns away receives, whatever the
// reason: a forged id, a stale card, or a candidate the member's evidence no
// longer makes claimable all read the same, so the response reveals nothing.
const CLAIM_NO_LONGER_AVAILABLE = 'This record is no longer available to claim.';

/** Reads the candidate a claim-step form names. Empty fields read as absent. */
export function readClaimTarget(body: { accountId?: unknown; recordId?: unknown } | undefined): ClaimTarget {
  const read = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  return { accountId: read(body?.accountId), recordId: read(body?.recordId) };
}

/**
 * Whether the claim step still takes card answers: while its task is pending,
 * and on the completed step only during the one last attempt that answering
 * "I had one but cannot find it" opens. The attempt closes once the member
 * holds an account or a record.
 */
function claimStepTakesAnswers(memberId: string): boolean {
  if (getTaskState(memberId, 'legacy_claim') !== 'completed') return true;
  return lastAttemptOpen(memberId);
}

function memberHoldsTarget(memberId: string, target: ClaimTarget): boolean {
  const held = readHeldClaim(memberId);
  if (held && (
    (target.accountId !== null && held.target.accountId === target.accountId)
    || (target.recordId !== null && held.target.recordId === target.recordId)
  )) return true;
  const links = account.findLegacyAndHpIdsById.get(memberId) as
    | { legacy_member_id: string | null; historical_person_id: string | null } | undefined;
  return (target.accountId !== null && links?.legacy_member_id === target.accountId)
    || (target.recordId !== null && links?.historical_person_id === target.recordId);
}

function lastAttemptOpen(memberId: string): boolean {
  const counters = memberOnboarding.findLegacyClaimCounters.get(memberId) as
    | { last_attempt_opened_at: string | null } | undefined;
  if (!counters?.last_attempt_opened_at) return false;
  // A claim held during the last attempt answers it, as a landed one does.
  if (readHeldClaim(memberId)) return false;
  const links = account.findLegacyAndHpIdsById.get(memberId) as
    | { legacy_member_id: string | null; historical_person_id: string | null } | undefined;
  return !links?.legacy_member_id && !links?.historical_person_id;
}

/**
 * A claim from a card ("This Is Me, Link My History"), or with the surname the
 * card's candidate carries ("This is me, I used the surname X"). One
 * transaction holds the re-check, the claim and the task completion, so nothing
 * lands without the others; a refusal is recorded after its rollback.
 */
function processClaimCandidate(
  memberId: string,
  target: ClaimTarget,
  ip: string,
  withSurname: boolean,
): WizardActionResult<null> {
  if (legacyClaimPrerequisiteUnmet(memberId)) {
    return { kind: 'retry_same', flash: null };
  }
  // A repeat of a claim that already landed (a double click, a back-button
  // re-post) reports the success it had. Holding the record answers the step,
  // so a task still pending beside it completes here; a page load never does.
  if (memberHoldsTarget(memberId, target)) {
    transaction(() => completeTaskIfOutstanding(memberId, 'legacy_claim'));
    return advanceAfter(memberId, 'legacy_claim');
  }
  if (!claimStepTakesAnswers(memberId)) {
    return { kind: 'retry_same', flash: null };
  }
  if (!target.accountId && !target.recordId) {
    return { kind: 'validation_error', formState: null, message: CLAIM_NO_LONGER_AVAILABLE };
  }
  const limited = claimConfirmRateLimited(memberId, ip, target.recordId ?? target.accountId ?? undefined);
  if (limited) return limited;
  const refusal = rehearseClaim(memberId, target, withSurname);
  if (refusal) return { kind: 'validation_error', formState: null, message: refusal };
  holdClaimAndAnswerStep(memberId, target, withSurname);
  return advanceAfter(memberId, 'legacy_claim');
}

/**
 * Check a claim exactly as completion will apply it, on top of what the member
 * already holds, and keep none of it. Returns the refusal to show, or null when
 * the claim stands. A refusal by the claim rules is recorded after the
 * rehearsal's rollback, so it survives.
 */
function rehearseClaim(memberId: string, target: ClaimTarget, withSurname: boolean): string | null {
  let refused: { candidate: Candidate | null } | null = null as { candidate: Candidate | null } | null;
  try {
    rehearseOnHeld(memberId, () => {
      const outcome = withSurname
        ? identityAccessService.claimWithFormerSurnameInTx(memberId, target)
        : identityAccessService.claimCandidateInTx(memberId, target);
      if (outcome.status === 'refused') refused = { candidate: outcome.candidate };
    });
  } catch (err) {
    // A concurrent claimant holds the record already: the member was just shown
    // a claimable card, so they are told plainly it is someone else's.
    if (err instanceof ConflictError || err instanceof ValidationError) return err.message;
    throw err;
  }
  if (refused) {
    identityAccessService.recordClaimRefused(memberId, target, refused.candidate, auditOrHold(memberId));
    return CLAIM_NO_LONGER_AVAILABLE;
  }
  return null;
}

// The claim is held, not written: it lands with everything else the member
// answered when the last onboarding task is answered. Holding it answers the
// claim step.
function holdClaimAndAnswerStep(memberId: string, target: ClaimTarget, withSurname: boolean): void {
  transaction(() => {
    holdClaim(memberId, { target, withSurname, heldAt: new Date().toISOString() });
    completeTaskIfOutstanding(memberId, 'legacy_claim');
  });
}

/**
 * A date-of-birth correction made on the claim step while onboarding. The date
 * is the strongest key the matching holds, so the number of changes before
 * onboarding completes is capped, which stops it being used to probe old
 * accounts. Re-entering the date already on file is a confirmation, not a
 * change, and is not counted. The change and its count commit together.
 */
function processLegacyClaimBirthDate(
  memberId: string,
  slug: string,
  parts: BirthDateParts,
): WizardActionResult<null> {
  if (legacyClaimPrerequisiteUnmet(memberId) || !claimStepTakesAnswers(memberId)) {
    return { kind: 'retry_same', flash: null };
  }
  const max = readIntConfig('onboarding_birth_date_change_max', 3);
  try {
    // The count lives on the claim step's row, so the row is made sure of
    // first: without it the increment would change nothing and the cap would
    // never be reached. The cap is read in the same transaction as the change.
    const outcome = transaction((): 'capped' | 'changed' | 'unchanged' => {
      ensureTaskRow(memberId, 'legacy_claim');
      const counters = memberOnboarding.findLegacyClaimCounters.get(memberId) as
        | { birth_date_changes: number | null } | undefined;
      if ((counters?.birth_date_changes ?? 0) >= max) return 'capped';
      if (memberService.correctOwnBirthDateInTx(slug, parts)) {
        memberOnboarding.incrementBirthDateChanges.run(new Date().toISOString(), memberId, memberId);
        return 'changed';
      }
      return 'unchanged';
    });
    if (outcome === 'capped') {
      return {
        kind: 'validation_error',
        formState: null,
        message: 'Your date of birth cannot be changed again while you are signing up. You can correct it from your profile once you have finished.',
      };
    }
    // The same date submitted again changed nothing, so the page says so in the
    // informational tone rather than claiming a save.
    return { kind: 'retry_same', flash: null, query: outcome === 'changed' ? 'birth_date=saved' : 'birth_date=unchanged' };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { kind: 'validation_error', formState: null, message: err.message };
    }
    throw err;
  }
}

/**
 * A former surname or an old email address added on the claim step. Add-only
 * and audited; the next render re-runs the match on it. The saved notice reads
 * the same whether or not anything matched.
 */
function processAddAnchor(memberId: string, anchorType: string, anchorValue: string): WizardActionResult<null> {
  if (legacyClaimPrerequisiteUnmet(memberId) || !claimStepTakesAnswers(memberId)) {
    return { kind: 'retry_same', flash: null };
  }
  try {
    identityAccessService.declareAnchor(memberId, anchorType, anchorValue, auditOrHold(memberId));
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return { kind: 'rate_limited', retryAfterSeconds: err.retryAfterSeconds ?? 60 };
    }
    if (err instanceof ValidationError) {
      return { kind: 'validation_error', formState: null, message: err.message };
    }
    throw err;
  }
  return { kind: 'retry_same', flash: null, query: 'anchor=saved' };
}

function processPersonalDetailsSubmit(
  memberId: string,
  city: string,
  region: string,
  country: string,
  birth: BirthDateParts,
  gender: string,
  yearValue: string,
  showCompetitiveResults: boolean,
): WizardActionResult<PersonalDetailsFormState> {
  const birthFields = { birthDay: birth.day, birthMonth: birth.month, birthYear: birth.year };
  // A completed task cannot be re-answered by a stray or replayed POST. The
  // page render already refuses to draw a completed step, so a submission
  // reaching here came from a stale tab, a back-button re-post, or a crafted
  // request; without this it would rewrite the member's personal details after
  // the claim task had already matched on them. Bouncing to the step's own GET
  // rather than deciding a destination here keeps one home for where a
  // completed task sends the member.
  if (getTaskState(memberId, 'personal_details') === 'completed') {
    return { kind: 'retry_same', flash: null };
  }
  try {
    // showCompetitiveResults rides the same setPersonalDetails transaction
    // as the other fields, so a crash cannot complete the task while
    // silently losing the preference.
    submitTaskResponse(memberId, 'personal_details', {
      city, region, country, ...birthFields, gender, yearValue,
      showCompetitiveResults,
    });
    return advanceAfter(memberId, 'personal_details');
  } catch (err) {
    if (err instanceof ValidationError) {
      return {
        kind: 'validation_error',
        formState: {
          city, region, country, ...birthFields, gender, yearValue, showCompetitiveResults,
        },
        message: err.message,
      };
    }
    throw err;
  }
}


/**
 * The two honest ways to finish the claim task without linking a record.
 *
 * They are separate answers because they are different facts. A registrant who
 * did hold an old-site account must never have to assert that they did not in
 * order to finish signing up, and must not be pushed into claiming a record
 * that is not clearly theirs.
 */
export type NoLinkAnswer = 'never_had_one' | 'cannot_find_it';

function readNoLinkAnswer(raw: unknown): NoLinkAnswer | null {
  return raw === 'never_had_one' || raw === 'cannot_find_it' ? raw : null;
}

/**
 * The legacy-claim task's non-claiming resolutions, both of which COMPLETE the
 * required task. There is no skip anywhere in the wizard; these are the task's
 * two explicit negative answers, gated on the personal-details prerequisite
 * like every other resolution of the task.
 *
 * Passing over a card is the answer that it is not the member's: the answer
 * records which cards were shown alongside it, with the claim evidence block,
 * so an administrator later sees what the member passed over. Which answer was given is recorded in the same transaction that
 * completes the task.
 *
 * The cannot-find-it answer additionally opens the one last attempt at the
 * match. That attempt gates nothing, because completion has already happened
 * by the time it is offered.
 */
function processContinueWithoutLinking(
  memberId: string,
  answer: NoLinkAnswer | null,
): WizardActionResult {
  if (legacyClaimPrerequisiteUnmet(memberId)) {
    return { kind: 'retry_same', flash: null };
  }
  // A completed task cannot be re-decided by a stray or replayed POST.
  if (getTaskState(memberId, 'legacy_claim') === 'completed') {
    return { kind: 'retry_same', flash: null };
  }
  if (answer === null) {
    return {
      kind: 'validation_error',
      formState: null,
      message: 'Tell us which one applies before continuing.',
    };
  }
  transaction(() => {
    identityAccessService.recordClaimStepAnswered(memberId, answer, auditOrHold(memberId));
    completeTask(memberId, 'legacy_claim');
    if (answer === 'cannot_find_it') {
      const now = new Date().toISOString();
      memberOnboarding.markLastAttemptOpened.run(now, now, memberId, memberId);
    }
  });
  if (answer === 'cannot_find_it') {
    // Back to the same step for the last attempt, rather than on to the next
    // task. The member has said they had an account, so the platform owes them
    // one more try at finding it before it stops asking.
    return { kind: 'retry_same', flash: null, query: 'sharpen=1' };
  }
  return advanceAfter(memberId, 'legacy_claim');
}

/**
 * The club task's explicit no-club answer: "none of these are my clubs".
 * Declines every remaining suggestion card and completes the task in ONE
 * transaction, mirroring the continue-without-linking attestation, so the
 * task can never finish with a card left open. Bulk declines record no
 * activity evidence (like a per-card "Not sure") and carry a bulk marker in
 * their audit metadata so a considered per-card No stays distinguishable.
 * Both decline writers use the club service's in-transaction entry points,
 * because the transaction helper does not nest.
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
  const insight = normalizeInsightNote(rawInsightNote);
  if (insight.status === 'invalid') {
    return { kind: 'validation_error', formState: null, message: insight.message };
  }
  const insightNote = insight.note;

  // The answer is held and completes the step; when that completes onboarding,
  // the declines and the note are written with every other held answer.
  transaction(() => {
    holdClubAnswer(memberId, { kind: 'no_clubs', insightNote, heldAt: new Date().toISOString() });
    completeTask(memberId, 'club_affiliations');
  });
  return advanceAfter(memberId, 'club_affiliations');
}

// The no-club answer applied: every card still open is declined, and the note
// is stored when the member left none on a card.
function applyNoClubs(memberId: string, insightNote: string | null): void {
  for (const card of listWizardCardsForMember(memberId)) {
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
  if (insightNote && !memberHasLeftClubInsight(memberId)) {
    writeInsightNote(memberId, null, 'onboarding_club_wrapup', insightNote, null, null);
  }
}

// The two bulk-decline writers mirror the per-card decline paths exactly
// (same status transitions, same audit action types) minus the activity
// signal and the per-card completion probe, plus the bulk marker.
function bulkDeclineMembership(memberId: string, candidateId: string): void {
  const result = clubService.confirmAffiliationInTx(candidateId, memberId, 'decline');
  appendAuditEntry({
    actionType:    'wizard.club_affiliations.declined',
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
  // Reached only while onboarding is still incomplete: the claim route closes
  // the moment it finishes, and sends a member to the administrator request form
  // instead. The claim controller sends a member who has not finished personal
  // details back to that step before calling here, so this throw is an
  // internal invariant check, not a user-facing outcome.
  if (legacyClaimPrerequisiteUnmet(memberId)) {
    throw new Error('personal_details must be complete before a historical-person claim');
  }
  const target: ClaimTarget = { accountId: null, recordId: personId };
  // A repeat of a confirmation that already landed reports that success, and
  // completes the step if it is somehow still pending beside the held record.
  if (memberHoldsTarget(memberId, target)) {
    transaction(() => completeTaskIfOutstanding(memberId, 'legacy_claim'));
    return;
  }
  if (!claimStepTakesAnswers(memberId)) {
    throw new ValidationError(CLAIM_NO_LONGER_AVAILABLE);
  }
  identityAccessService.enforceHistoricalPersonClaimLimit(memberId, ip, personId);
  const refusal = rehearseClaim(memberId, target, false);
  if (refusal) throw new ValidationError(refusal);
  holdClaimAndAnswerStep(memberId, target, false);
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

// The grouped card resolves which club, if any, the member belonged to: it
// declines only the clubs the member did NOT pick and leaves the chosen row
// pending, so the next render presents that club's standard card and its
// activity question. Confirming here would consume the pending row the
// standard card renders from, and the activity signal would never be
// collected. Runs inside a transaction, rehearsed or applied.
function applyDisambiguation(
  memberId: string,
  selectedId: string | null,
  allIds: string[],
): 'in_progress' | 'completed' {
  for (const id of allIds) {
    assertCandidateOwnership(memberId, id, 'membership');
  }
  for (const id of allIds) {
    if (id === selectedId) continue;
    submitMembershipResponse(memberId, id, 'decline', null);
  }
  return selectedId !== null ? 'in_progress' : maybeCompleteClubAffiliationsTask(memberId);
}

function submitDisambiguationResponse(
  memberId: string,
  selectedId: string | null,
  allIds: string[],
): ClubAffiliationsResult {
  let taskState: 'in_progress' | 'completed';
  if (isOnboardingComplete(memberId)) {
    // A member's answer is written at once, as any member's club answer is.
    taskState = transaction(() => applyDisambiguation(memberId, selectedId, allIds));
  } else {
    taskState = rehearseOnHeld(memberId, () => applyDisambiguation(memberId, selectedId, allIds));
    // The same answer submitted again is already held: holding it twice would
    // replay it twice, so the repeat reports the first outcome and holds nothing.
    const repeat = readHeldClubAnswers(memberId).some((held) =>
      held.kind === 'disambiguation' && held.selectedId === selectedId
      && held.allIds.length === allIds.length && held.allIds.every((id) => allIds.includes(id)));
    if (!repeat) {
      transaction(() => {
        holdClubAnswer(memberId, { kind: 'disambiguation', selectedId, allIds, heldAt: new Date().toISOString() });
        if (taskState === 'completed') completeTask(memberId, 'club_affiliations');
      });
    }
  }
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
function unmappedCandidateFor(
  affiliationId: string,
): { id: string; mapped_club_id: string | null; classification: string } | null {
  const affiliation = legacyPersonClubAffiliations.findById.get(affiliationId) as
    | LegacyPersonClubAffiliationRow
    | undefined;
  if (!affiliation || affiliation.resolution_status !== 'pending') return null;
  const candidate = legacyClubCandidates.findById.get(affiliation.legacy_club_candidate_id) as
    | { id: string; mapped_club_id: string | null; classification: string }
    | undefined;
  if (!candidate || candidate.mapped_club_id || candidate.classification === 'junk') return null;
  return candidate;
}

// When the member answers: what creating the club will need, with every
// refusal checked now. Null when the card's candidate needs no club created.
async function prepareCardPromotion(
  affiliationId: string,
  region: string | null,
): Promise<HeldPromotion | null> {
  const candidate = unmappedCandidateFor(affiliationId);
  if (!candidate) return null;
  const prepared = await clubService.preparePromotion(candidate.id, region);
  return prepared.branch === 'promotable' ? { region, externalUrl: prepared.externalUrl } : null;
}

// Inside a transaction: create the club the confirmed card's candidate lacks.
// Runs before the confirm transition so it sees a mapped candidate; the
// confirming member's own affiliation row is excluded from the bulk
// 'promoted' carry-forward so it records the member's answer.
function promoteIfUnmappedInTx(memberId: string, affiliationId: string, promotion: HeldPromotion): void {
  const candidate = unmappedCandidateFor(affiliationId);
  if (!candidate) return;
  clubService.promoteCandidateInTx(candidate.id, memberId, {
    actorType: 'member',
    trigger:   'stage1',
    excludeAffiliationId: affiliationId,
    region:    promotion.region,
    externalUrl: promotion.externalUrl,
  });
}

async function processClubAffiliationsSubmit(
  memberId: string,
  body: Record<string, unknown>,
): Promise<WizardActionResult<ClubAffiliationsFormState>> {
  // The step order holds on every request: a club answer posted directly while
  // an earlier step is still owed (personal details, or a card still open in
  // the claim step) would otherwise finish signing up past it.
  if (prerequisiteTaskFor(memberId, 'club_affiliations')) {
    return { kind: 'retry_same', flash: null };
  }
  const kindRaw = typeof body.kind === 'string' ? body.kind : '';

  if (kindRaw === 'disambiguation') {
    const allIds      = normalizeToArray(body.allCandidateIds);
    const selectedIds = normalizeToArray(body.selectedCandidateIds);
    if (allIds.length === 0) {
      return { kind: 'validation_error', formState: null, message: 'That form is out of date. Reload the page and answer the card again.' };
    }
    // Single-select: the grouped card asks which ONE club, if any, the member
    // belonged to. Two picks would re-group into the same card forever.
    if (selectedIds.length > 1) {
      return { kind: 'validation_error', formState: null, message: 'Select at most one club.' };
    }
    const selectedId = selectedIds.length === 1 && allIds.includes(selectedIds[0])
      ? selectedIds[0]
      : null;
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
    return { kind: 'validation_error', formState: null, message: 'That form is out of date. Reload the page and answer the card again.' };
  }
  if (
    userDecision !== 'confirm' &&
    userDecision !== 'correct' &&
    userDecision !== 'decline'
  ) {
    return {
      kind:      'validation_error',
      formState: null,
      message:   'Choose whether that club was yours.',
    };
  }
  if (kindRaw !== 'membership' && kindRaw !== 'leadership') {
    return {
      kind:      'validation_error',
      formState: null,
      message:   'That form is out of date. Reload the page and answer the card again.',
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
  const insight = normalizeInsightNote(body.insightNote);
  if (insight.status === 'invalid') {
    return { kind: 'validation_error', formState: null, message: insight.message };
  }
  const insightNote = insight.note;

  // A confirmed card whose candidate has no club yet creates one at
  // completion. Every refusal that creation would make is checked now, so it
  // shows on the card the member is looking at, and the candidate's web
  // address is validated now, because that is network I/O. The region is only
  // offered, and only required, when the card asked for it.
  // A card already answered keeps its first answer, so a repeat skips the
  // check: it would only spend a network call on an answer that is not used.
  const alreadyHeld = readHeldClubAnswers(memberId).some((held) =>
    held.kind === 'card' && held.candidateId === candidateId);
  let promotion: HeldPromotion | null = null;
  if (kindRaw === 'membership' && userDecision === 'confirm' && !alreadyHeld) {
    const clubRegion = typeof body.clubRegion === 'string' ? body.clubRegion.trim() : '';
    try {
      promotion = await prepareCardPromotion(candidateId, clubRegion || null);
    } catch (err) {
      if (err instanceof ValidationError) {
        return { kind: 'validation_error', formState: null, message: err.message };
      }
      throw err;
    }
  }

  // The answer is rehearsed on top of what the member already holds and then
  // held; a repeat of an answer already given (an idempotent outcome) holds
  // nothing new and carries no note.
  let held: { result: ClubAffiliationsResult; clubName: string };
  try {
    held = holdClubCardAnswer(memberId, {
      kind: 'card',
      card: kindRaw,
      candidateId,
      userDecision,
      activitySignal: rawSignal as ActivitySignal,
      insightNote,
      promotion,
      heldAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return { kind: 'validation_error', formState: null, message: err.message };
    }
    // A card answered from a stale page: its club was archived, or its
    // leadership claimed, after the page rendered. The card is no longer
    // offered, so the step re-renders without it.
    if (err instanceof ConflictError) {
      return { kind: 'retry_same', flash: null };
    }
    throw err;
  }
  const { result, clubName } = held;

  if (result.branch === 'cap_hit') {
    // At the two-current-club cap the card still resolves and the Yes is
    // recorded as a former membership. The notice comes before any advance,
    // so the member learns how the answer was recorded; when this was the
    // last card the answer has already completed the step, and the club page
    // shows the notice with a way onward.
    return {
      kind: 'retry_same',
      flash: {
        kind: 'WIZARD_CLUB_CAP_HIT',
        payload: { clubName },
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
// capabilities, fenced until onboarding completes. The member is on the
// landing exactly when no card remains.
// ---------------------------------------------------------------------------

export type { ClubAffiliationsBranch, ClubAffiliationsResult };


// The reads a wizard page makes, each as the member's held answers would leave
// the state, so a prospective member sees the cards and links their answers
// imply although none of them is written yet.
export const memberOnboardingService = {
  nextOutstandingTaskType,
  completeTask,
  completeTaskIfOutstanding,
  buildClubCapHitNoticeMessage,
  buildClubInsightPrompt,
  buildClubResolvedNoticeMessage,
  submitTaskResponse,
  submitClubAffiliationsResponse,
  processClubAffiliationsSubmit,
  listWizardCardsForMember: (memberId: string): WizardCard[] =>
    withHeldAnswers(memberId, () => listWizardCardsForMember(memberId)),
  // Everything the club step's page reads, in one replay of the held answers.
  getClubAffiliationsView: (memberId: string) =>
    withHeldAnswers(memberId, () => {
      const cards = listWizardCardsForMember(memberId);
      return {
        cards,
        isWrapUp: cards.length === 0,
        hadSuggestionMaterial: memberHadClubSuggestionMaterial(memberId),
        hasLeftInsight: memberHasLeftClubInsight(memberId),
      };
    }),
  // Everything the claim step's page reads, in one replay of the held answers.
  getLinkHistoryView: (memberId: string) =>
    withHeldAnswers(memberId, () => ({
      view: identityAccessService.getLinkHistoryViewForWizard(memberId),
      declaredAnchors: identityAccessService.listDeclaredAnchors(memberId),
    })),
  claimNotAppliedAtCompletion,
  CLAIM_NOT_APPLIED_NOTICE,
  processPersonalDetailsSubmit,
  processClaimCandidate,
  processLegacyClaimBirthDate,
  processAddAnchor,
  lastAttemptOpen,
  claimStepTakesAnswers,
  processContinueWithoutLinking,
  readNoLinkAnswer,
  processNoClubsAnswer,
  claimHistoricalPersonAndCompleteTask,
  getTaskState,
  prerequisiteTaskFor,
  isOnboardingComplete,
  hasOtherOutstandingTasks,
};
