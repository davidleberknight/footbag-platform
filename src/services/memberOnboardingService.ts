import { randomUUID } from 'crypto';
import {
  memberOnboarding,
  transaction,
  clubBootstrapLeaders,
  clubBootstrapLeaderSignals,
  type MemberOnboardingTaskRow,
  type ClubBootstrapLeaderRow,
  type ClubBootstrapLeaderSignalRow,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { memberService } from './memberService';
import { clubService } from './clubService';
import {
  classifyBootstrapLeader,
  type StructuralSignals,
  type ContextModifiers,
} from './clubBootstrapClassificationService';
import { identityAccessService } from './identityAccessService';
import { getStubSesAdapterForTests } from '../adapters/sesAdapter';
import { config } from '../config/env';
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  ServiceError,
  ValidationError,
} from './serviceErrors';

export const TASK_CATALOG = [
  'legacy_claim',
  'club_affiliations',
  'first_competition_year',
  'show_competitive_results',
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

/**
 * Dashboard task widget shape. Splits tasks by state so the view template
 * can render section headers ("To do" / "Paused" / "Done") without
 * branching on raw state strings. Paused entries carry a resumeUrl back
 * to the wizard card the user detoured from.
 */
export interface DashboardTaskItem {
  taskType: OnboardingTaskType;
  state: OnboardingTaskState;
  completedAt: string | null;
  resumeUrl: string | null;
  targetStory: string | null;
  sourceCard:  string | null;
}

export interface DashboardTaskWidget {
  pending:   DashboardTaskItem[];
  paused:    DashboardTaskItem[];
  completed: DashboardTaskItem[];
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
  const rows = memberOnboarding.listForMember.all(memberId) as MemberOnboardingTaskRow[];
  return rows
    .filter((r) => r.state === 'pending' || r.state === 'skipped')
    .map((r) => ({
      taskType: r.task_type as OnboardingTaskType,
      state: r.state as OnboardingTaskState,
      completedAt: r.completed_at,
    }))
    .sort((a, b) => TASK_TYPE_INDEX[a.taskType] - TASK_TYPE_INDEX[b.taskType]);
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
  transitionTask(memberId, taskType, 'pending', 'onboarding_task_started');
}

function skipTask(memberId: string, taskType: string): void {
  transitionTask(memberId, taskType, 'skipped', 'onboarding_task_skipped');
}

function completeTask(memberId: string, taskType: string): void {
  transitionTask(memberId, taskType, 'completed', 'onboarding_task_completed');
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
 * metadata (target_story + source_card). The url shape is intentionally
 * generic (`/onboarding-wizard?task={taskType}&card={sourceCard}`) so the
 * wizard controller can route the member back to the exact card without
 * the widget needing to know wizard route specifics.
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

  const widget: DashboardTaskWidget = { pending: [], paused: [], completed: [] };
  for (const r of rows) {
    const taskType = r.task_type as OnboardingTaskType;
    if (!(taskType in TASK_TYPE_INDEX)) continue;
    let resumeUrl:   string | null = null;
    let targetStory: string | null = null;
    let sourceCard:  string | null = null;
    if (r.state === 'in_progress_paused' && r.detour_metadata_json) {
      try {
        const meta = JSON.parse(r.detour_metadata_json) as {
          target_story?: string; source_card?: string;
        };
        targetStory = meta.target_story ?? null;
        sourceCard  = meta.source_card  ?? null;
        const cardParam = sourceCard ? `&card=${encodeURIComponent(sourceCard)}` : '';
        resumeUrl = `/onboarding-wizard?task=${encodeURIComponent(taskType)}${cardParam}`;
      } catch { /* malformed metadata leaves resumeUrl null; widget still renders */ }
    }
    const item: DashboardTaskItem = {
      taskType,
      state: r.state as OnboardingTaskState,
      completedAt: r.completed_at,
      resumeUrl,
      targetStory,
      sourceCard,
    };
    if (r.state === 'completed')             widget.completed.push(item);
    else if (r.state === 'in_progress_paused') widget.paused.push(item);
    else if (r.state === 'pending' || r.state === 'skipped') widget.pending.push(item);
  }

  const sortByCatalog = (a: DashboardTaskItem, b: DashboardTaskItem) =>
    TASK_TYPE_INDEX[a.taskType] - TASK_TYPE_INDEX[b.taskType];
  widget.pending.sort(sortByCatalog);
  widget.paused.sort(sortByCatalog);
  widget.completed.sort(sortByCatalog);
  return widget;
}

type ClubAffiliationsBranch =
  | 'promoted_leader'
  | 'promoted_co_leader'
  | 'affiliated_only'
  | 'idempotent'
  | 'declined';

interface ClubAffiliationsResult {
  branch: ClubAffiliationsBranch;
  classification: 'strong' | 'weak' | 'none';
  actualRole: 'leader' | 'co-leader' | null;
}

// Read pre-computed evidence rows for a bootstrap leader candidate and split
// them into the StructuralSignals + ContextModifiers shapes that
// classifyBootstrapLeader accepts. Defaults missing signals to false so the
// classifier sees a complete shape even before the legacy_data pre-compute
// pipeline ships (Slice 1 integration tests fixture-insert the signal rows
// they need; production wizard use is gated on James's pre-compute).
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

function submitClubAffiliationsResponse(
  memberId: string,
  body: Record<string, unknown>,
): ClubAffiliationsResult {
  const candidateId = typeof body.candidateId === 'string' ? body.candidateId : '';
  const userDecision = body.userDecision;
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
    completeTask(memberId, 'club_affiliations');
    const branch: ClubAffiliationsBranch =
      leader.status === 'claimed' ? 'idempotent'
      : leader.status === 'rejected' ? 'declined'
      : 'idempotent';
    return { branch, classification: 'none', actualRole: null };
  }

  const { structural, modifiers, rows } = readSignalsForCandidate(candidateId);
  const result = classifyBootstrapLeader(structural, modifiers);

  if (userDecision === 'decline') {
    clubBootstrapLeaders.setStatusRejected.run('onboarding_service', candidateId);
    completeTask(memberId, 'club_affiliations');
    appendAuditEntry({
      actionType:    'wizard.club_affiliations.declined',
      category:      'onboarding',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'club_bootstrap_leader',
      entityId:      candidateId,
      metadata: {
        classification: result.classification,
        matched_gate:   result.matchedGate,
        signal_rows:    rows.length,
      },
    });
    return { branch: 'declined', classification: result.classification, actualRole: null };
  }

  // 'confirm' OR 'correct': auto-promote regardless of classification.
  // promoteFromCandidate handles role downgrade to co-leader and the cap-
  // exceeded affiliate-only fall-through. Admins can later promote
  // affiliate-only members or reshape leadership via A_* admin powers.
  // The promote writes (status, club_leaders, affiliation) are atomic via
  // promoteFromCandidate's internal transaction; the task-complete + audit
  // writes that follow are non-transactional but follow the same
  // append-only pattern as transitionTask (low risk: better-sqlite3 inserts
  // are synchronous and audit_entries inserts essentially cannot fail).
  const promote = clubService.promoteFromCandidate(candidateId, memberId);
  completeTask(memberId, 'club_affiliations');
  appendAuditEntry({
    actionType:    'wizard.club_affiliations.promoted',
    category:      'onboarding',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'club_bootstrap_leader',
    entityId:      candidateId,
    metadata: {
      classification: result.classification,
      matched_gate:   result.matchedGate,
      user_decision:  userDecision,
      promote_branch: promote.branch,
      actual_role:    promote.actualRole,
      club_id:        promote.clubId,
      club_leader_id: promote.clubLeaderId,
      affiliation_id: promote.affiliationId,
      signal_rows:    rows.length,
    },
  });
  return {
    branch:         promote.branch,
    classification: result.classification,
    actualRole:     promote.actualRole,
  };
}

function submitTaskResponse(memberId: string, taskType: string, response: unknown): void {
  assertTaskType(taskType);
  const body = (response ?? {}) as Record<string, unknown>;
  if (taskType === 'first_competition_year') {
    memberService.setFirstCompetitionYear(memberId, body.year);
    completeTask(memberId, taskType);
    return;
  }
  if (taskType === 'show_competitive_results') {
    memberService.setShowCompetitiveResults(memberId, body.enabled);
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
      payload: { hpPersonId: string | null; sinceIndex: number | null };
    }
  | { kind: 'WIZARD_AUTO_LINK_DRIFT' };

// Per-method `formState` shapes carried in the `validation_error` arm
// of `WizardActionResult`. Each shape is typed-per-method so controllers
// pass through to the template without `as` casts. DD §5.2 (Service
// action-result shape) requires this for every state-changing service
// method that can return `validation_error`.

export type LegacyClaimSubmitFormState = { identifier: string };
export type LegacyClaimAutoLinkConfirmFormState =
  | { personId: string; personName: string; confidence: 'high' | 'medium' }
  | null;
export type LegacyClaimTokenConfirmFormState = null;
export type FirstCompetitionYearFormState = { yearValue: string };
export type ShowCompetitiveResultsFormState = { enabled: boolean };

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

function nextTaskAfter(
  memberId: string,
  currentTaskType: OnboardingTaskType,
): OnboardingTaskType | null {
  const widget = getTaskWidget(memberId);
  const currentIdx = TASK_TYPE_INDEX[currentTaskType];
  for (const item of widget) {
    if (TASK_TYPE_INDEX[item.taskType] > currentIdx) return item.taskType;
  }
  return null;
}

function advanceAfter(
  memberId: string,
  currentTaskType: OnboardingTaskType,
): WizardAdvanceArm {
  startTaskList(memberId);
  return { kind: 'advance', nextTaskType: nextTaskAfter(memberId, currentTaskType) };
}

function captureSinceIndex(): number | null {
  if (config.sesAdapter !== 'stub') return null;
  return getStubSesAdapterForTests()?.sentMessages.length ?? 0;
}

async function processLegacyClaimSubmit(
  memberId: string,
  identifier: string,
  ip: string,
): Promise<WizardActionResult<LegacyClaimSubmitFormState>> {
  if (!identifier) {
    return {
      kind: 'validation_error',
      formState: { identifier: '' },
      message: 'Enter an identifier to search.',
    };
  }
  const sinceIndex = captureSinceIndex();
  try {
    const outcome = identityAccessService.initiateLegacyClaim(memberId, identifier, ip);
    if (outcome.kind === 'auto_linked') {
      completeTask(memberId, 'legacy_claim');
      return advanceAfter(memberId, 'legacy_claim');
    }
    startTaskList(memberId);
    if (outcome.kind === 'enqueued') {
      return {
        kind: 'retry_same',
        flash: {
          kind: 'WIZARD_LEGACY_CLAIM_RESULT',
          payload: { hpPersonId: null, sinceIndex },
        },
      };
    }
    const hp = identityAccessService.findHistoricalPersonForLinkSubmit(identifier);
    return {
      kind: 'retry_same',
      flash: {
        kind: 'WIZARD_LEGACY_CLAIM_RESULT',
        payload: { hpPersonId: hp ? hp.person_id : null, sinceIndex: null },
      },
    };
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return {
        kind: 'rate_limited',
        retryAfterSeconds: err.retryAfterSeconds ?? 60,
      };
    }
    if (err instanceof ValidationError) {
      return {
        kind: 'validation_error',
        formState: { identifier },
        message: err.message,
      };
    }
    throw err;
  }
}

function processLegacyClaimAutoLinkConfirm(
  memberId: string,
  personId: string,
): WizardActionResult<LegacyClaimAutoLinkConfirmFormState> {
  if (!personId) {
    return {
      kind: 'validation_error',
      formState: null,
      message: 'Invalid claim request.',
    };
  }
  const classification = identityAccessService.getAutoLinkClassificationForMember(memberId);
  if (classification.confidence !== 'high' && classification.confidence !== 'medium') {
    return { kind: 'retry_same', flash: { kind: 'WIZARD_AUTO_LINK_DRIFT' } };
  }
  if (classification.personId !== personId) {
    return { kind: 'retry_same', flash: { kind: 'WIZARD_AUTO_LINK_DRIFT' } };
  }
  try {
    // Merge and the wizard task transition run in one transaction: a partial
    // failure cannot leave the member claimed but the task still pending.
    transaction(() => {
      identityAccessService.claimHistoricalPersonInTx(memberId, personId);
      completeTask(memberId, 'legacy_claim');
    });
    return advanceAfter(memberId, 'legacy_claim');
  } catch (err) {
    if (err instanceof ValidationError) {
      return {
        kind: 'validation_error',
        formState: {
          personId: classification.personId,
          personName: classification.personName,
          confidence: classification.confidence,
        },
        message: err.message,
      };
    }
    throw err;
  }
}

function processLegacyClaimTokenConfirm(
  memberId: string,
  token: string,
): WizardActionResult<LegacyClaimTokenConfirmFormState> {
  if (!token) {
    return { kind: 'validation_error', formState: null, message: '' };
  }
  try {
    // SC §LegacyClaim atomicity: the token consume, the merge, AND the
    // wizard task transition run in one transaction.
    transaction(() => {
      identityAccessService.consumeAndClaimLegacyInTx(memberId, token);
      completeTask(memberId, 'legacy_claim');
    });
    return advanceAfter(memberId, 'legacy_claim');
  } catch (err) {
    if (err instanceof ValidationError) {
      return { kind: 'validation_error', formState: null, message: err.message };
    }
    throw err;
  }
}

function processFirstCompetitionYearSubmit(
  memberId: string,
  rawYear: string,
): WizardActionResult<FirstCompetitionYearFormState> {
  try {
    submitTaskResponse(memberId, 'first_competition_year', { year: rawYear });
    return advanceAfter(memberId, 'first_competition_year');
  } catch (err) {
    if (err instanceof ValidationError) {
      return {
        kind: 'validation_error',
        formState: { yearValue: rawYear },
        message: err.message,
      };
    }
    throw err;
  }
}

function processShowCompetitiveResultsSubmit(
  memberId: string,
  rawEnabled: unknown,
): WizardActionResult<ShowCompetitiveResultsFormState> {
  try {
    submitTaskResponse(memberId, 'show_competitive_results', { enabled: rawEnabled });
    return advanceAfter(memberId, 'show_competitive_results');
  } catch (err) {
    if (err instanceof ValidationError) {
      return {
        kind: 'validation_error',
        formState: { enabled: Boolean(rawEnabled) },
        message: err.message,
      };
    }
    throw err;
  }
}

function processTaskSkip(
  memberId: string,
  taskType: OnboardingTaskType,
): WizardActionResult {
  skipTask(memberId, taskType);
  return advanceAfter(memberId, taskType);
}

export type { ClubAffiliationsBranch, ClubAffiliationsResult };

export const memberOnboardingService = {
  getTaskWidget,
  getDashboardTaskWidget,
  startTaskList,
  startTask,
  skipTask,
  completeTask,
  transitionToDetourPaused,
  submitTaskResponse,
  submitClubAffiliationsResponse,
  processLegacyClaimSubmit,
  processLegacyClaimAutoLinkConfirm,
  processLegacyClaimTokenConfirm,
  processFirstCompetitionYearSubmit,
  processShowCompetitiveResultsSubmit,
  processTaskSkip,
};
