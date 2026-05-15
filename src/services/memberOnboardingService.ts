import { randomUUID } from 'crypto';
import { memberOnboarding, type MemberOnboardingTaskRow } from '../db/db';
import { appendAuditEntry } from './auditService';
import { memberService } from './memberService';
import { identityAccessService } from './identityAccessService';
import { getStubSesAdapterForTests } from '../adapters/sesAdapter';
import { config } from '../config/env';
import { RateLimitedError, ServiceError, ValidationError } from './serviceErrors';

export const TASK_CATALOG = [
  'legacy_claim',
  'club_affiliations',
  'first_competition_year',
  'show_competitive_results',
] as const;
export type OnboardingTaskType = typeof TASK_CATALOG[number];

export const TASK_STATES = [
  'pending',
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
  for (const taskType of TASK_CATALOG) {
    memberOnboarding.insertTaskIfMissing.run(
      newTaskId(), now, 'onboarding_service', now, 'onboarding_service',
      memberId, taskType,
    );
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

export type WizardActionResult =
  | { kind: 'advance'; nextTaskType: OnboardingTaskType | null }
  | { kind: 'retry_same'; flash: WizardFlash | null }
  | { kind: 'validation_error'; formState: unknown; message: string }
  | { kind: 'rate_limited'; retryAfterSeconds: number };

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
): WizardActionResult {
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
): Promise<WizardActionResult> {
  if (!identifier) {
    return {
      kind: 'validation_error',
      formState: { identifier: '' },
      message: 'Enter an identifier to search.',
    };
  }
  const sinceIndex = captureSinceIndex();
  try {
    const outcome = identityAccessService.initiateLegacyClaim(memberId, identifier);
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
): WizardActionResult {
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
    identityAccessService.claimHistoricalPerson(memberId, personId);
    completeTask(memberId, 'legacy_claim');
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
): WizardActionResult {
  if (!token) {
    return { kind: 'validation_error', formState: null, message: '' };
  }
  try {
    identityAccessService.consumeAndClaimLegacy(memberId, token);
    completeTask(memberId, 'legacy_claim');
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
): WizardActionResult {
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
): WizardActionResult {
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

export const memberOnboardingService = {
  getTaskWidget,
  startTaskList,
  startTask,
  skipTask,
  completeTask,
  submitTaskResponse,
  processLegacyClaimSubmit,
  processLegacyClaimAutoLinkConfirm,
  processLegacyClaimTokenConfirm,
  processFirstCompetitionYearSubmit,
  processShowCompetitiveResultsSubmit,
  processTaskSkip,
};
