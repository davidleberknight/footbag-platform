import { randomUUID } from 'crypto';
import { memberOnboarding, type MemberOnboardingTaskRow } from '../db/db';
import { appendAuditEntry } from './auditService';
import { ServiceError, ValidationError } from './serviceErrors';

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

function submitTaskResponse(_memberId: string, taskType: string, _response: unknown): never {
  assertTaskType(taskType);
  throw new NotImplementedError(
    `submitTaskResponse handler for task_type "${taskType}" is not implemented`,
  );
}

export const memberOnboardingService = {
  getTaskWidget,
  startTaskList,
  startTask,
  skipTask,
  completeTask,
  submitTaskResponse,
};
