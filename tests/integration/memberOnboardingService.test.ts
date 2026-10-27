/**
 * Integration tests for memberOnboardingService.
 *
 * Exercises the scaffold contract: task list lifecycle, state transitions,
 * audit emission per transition, a missing task row reading as pending, and
 * submitTaskResponse refusing the legacy_claim task, which only the claim decision completes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertOnboardingTask } from '../fixtures/factories';

const { dbPath } = setTestEnv('3140');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let TASK_CATALOG: typeof import('../../src/services/memberOnboardingService').TASK_CATALOG;
import type { ValidationError as ValidationErrorType } from '../../src/services/serviceErrors';
let ValidationError: typeof ValidationErrorType;

// One member per scenario keeps tests independent without per-test DB resets.
const MEMBER_NO_TASKS    = 'member-onb-no-tasks';
const MEMBER_PARTIAL     = 'member-onb-partial';
const MEMBER_UNANSWERED  = 'member-onb-unanswered';
const MEMBER_LAZY        = 'member-onb-lazy';
const MEMBER_COMPLETE    = 'member-onb-complete';
const MEMBER_CYCLE       = 'member-onb-cycle';
const MEMBER_BAD_TYPE    = 'member-onb-bad-type';
const MEMBER_NEXT_PENDING = 'member-onb-next-pending';
const MEMBER_NEXT_PAUSED  = 'member-onb-next-paused';
const MEMBER_NEXT_NONE    = 'member-onb-next-none';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const id of [
    MEMBER_NO_TASKS, MEMBER_PARTIAL, MEMBER_UNANSWERED,
    MEMBER_LAZY, MEMBER_COMPLETE, MEMBER_CYCLE,
    MEMBER_BAD_TYPE,
    MEMBER_NEXT_PENDING, MEMBER_NEXT_PAUSED, MEMBER_NEXT_NONE,
  ]) {
    insertMember(db, { id, slug: id.replace(/-/g, '_'), login_email: `${id}@example.com`, onboarding: 'none' });
  }
  db.close();

  const mod = await import('../../src/services/memberOnboardingService');
  svc = mod.memberOnboardingService;
  TASK_CATALOG = mod.TASK_CATALOG;

  const errs = await import('../../src/services/serviceErrors');
  ValidationError = errs.ValidationError;
});

afterAll(() => cleanupTestDb(dbPath));

// The checklist as email verification leaves it: three pending rows.
function seedPendingTasks(memberId: string): void {
  const d = new BetterSqlite3(dbPath);
  for (const t of ['personal_details', 'legacy_claim', 'club_affiliations'] as const) {
    insertOnboardingTask(d, memberId, t, 'pending');
  }
  d.close();
}

interface TaskRow {
  id: string;
  member_id: string;
  task_type: string;
  state: string;
  completed_at: string | null;
}

interface AuditRow {
  id: string;
  action_type: string;
  actor_type: string;
  actor_member_id: string | null;
  entity_type: string;
  entity_id: string;
  category: string;
  metadata_json: string;
  occurred_at: string;
}

function readTaskRows(memberId: string): TaskRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    `SELECT id, member_id, task_type, state, completed_at
       FROM member_onboarding_tasks
      WHERE member_id = ?
      ORDER BY task_type`,
  ).all(memberId) as TaskRow[];
  db.close();
  return rows;
}

function readAuditRowsForMember(memberId: string): AuditRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  // ORDER BY rowid: SQLite's implicit rowid is monotonic per-INSERT and gives
  // deterministic insertion order even when occurred_at collides within a millisecond.
  const rows = db.prepare(
    `SELECT id, action_type, actor_type, actor_member_id,
            entity_type, entity_id, category, metadata_json, occurred_at
       FROM audit_entries
      WHERE actor_member_id = ?
        AND entity_type = 'member_onboarding_task'
      ORDER BY rowid`,
  ).all(memberId) as AuditRow[];
  db.close();
  return rows;
}

// The member-scoped completion marker, which is keyed to the member entity
// rather than a task row, so it is read separately from the task audit rows.
function readCompletionAudits(memberId: string): AuditRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    `SELECT id, action_type, actor_type, actor_member_id,
            entity_type, entity_id, category, metadata_json, occurred_at
       FROM audit_entries
      WHERE actor_member_id = ?
        AND action_type = 'wizard.complete'
      ORDER BY rowid`,
  ).all(memberId) as AuditRow[];
  db.close();
  return rows;
}

describe('memberOnboardingService.nextOutstandingTaskType', () => {
  it('walks the tasks in story order (personal details, legacy claim, club affiliations)', () => {
    const d = new BetterSqlite3(dbPath);
    insertMember(d, { id: 'dash-order-1', slug: 'dash_order_1', login_email: 'dash1@example.com', onboarding: 'none' });
    d.close();
    seedPendingTasks('dash-order-1');
    expect(svc.nextOutstandingTaskType('dash-order-1')).toBe('personal_details');
    svc.completeTask('dash-order-1', 'personal_details');
    expect(svc.nextOutstandingTaskType('dash-order-1')).toBe('legacy_claim');
    svc.completeTask('dash-order-1', 'legacy_claim');
    expect(svc.nextOutstandingTaskType('dash-order-1')).toBe('club_affiliations');
    svc.completeTask('dash-order-1', 'club_affiliations');
    expect(svc.nextOutstandingTaskType('dash-order-1')).toBeNull();
  });
});

describe('a missing task row reads as pending', () => {
  it('a member with no rows is pending and is sent to the first step, and reading writes no row', () => {
    // Zero rows must never read as "all done": the account has not answered
    // anything, so the membership predicate stays false and the member is
    // routed to the first step rather than to a completion page that would
    // bounce them straight back.
    expect(svc.nextOutstandingTaskType(MEMBER_NO_TASKS)).toBe(TASK_CATALOG[0]);
    expect(svc.hasOtherOutstandingTasks(MEMBER_NO_TASKS, 'personal_details')).toBe(true);
    expect(svc.isOnboardingComplete(MEMBER_NO_TASKS)).toBe(false);
    expect(readTaskRows(MEMBER_NO_TASKS)).toHaveLength(0);
  });

  it('a member holding only a completed first row is sent to the next step, not looped back', () => {
    const d = new BetterSqlite3(dbPath);
    insertOnboardingTask(d, MEMBER_PARTIAL, 'personal_details', 'completed');
    d.close();
    expect(svc.nextOutstandingTaskType(MEMBER_PARTIAL)).toBe('legacy_claim');
    expect(svc.hasOtherOutstandingTasks(MEMBER_PARTIAL, 'legacy_claim')).toBe(true);
    expect(svc.isOnboardingComplete(MEMBER_PARTIAL)).toBe(false);
  });

  it('completing a task with no row creates it completed, and writes no audit row about the prospective member', () => {
    const memberId = 'onb-rowless-complete';
    const d = new BetterSqlite3(dbPath);
    insertMember(d, { id: memberId, slug: 'onb_rowless_complete', login_email: 'onbrc@example.com', onboarding: 'none' });
    d.close();
    svc.completeTask(memberId, 'personal_details');
    const rows = readTaskRows(memberId);
    expect(rows.map((r) => [r.task_type, r.state])).toEqual([['personal_details', 'completed']]);
    expect(readAuditRowsForMember(memberId)).toEqual([]);
  });
});

describe('a task is outstanding until it is completed', () => {
  it('a pending task is offered everywhere the member could act on it', () => {
    const d = new BetterSqlite3(dbPath);
    insertOnboardingTask(d, MEMBER_UNANSWERED,'personal_details', 'completed');
    insertOnboardingTask(d, MEMBER_UNANSWERED,'legacy_claim', 'pending');
    insertOnboardingTask(d, MEMBER_UNANSWERED,'club_affiliations', 'pending');
    d.close();

    expect(svc.isOnboardingComplete(MEMBER_UNANSWERED)).toBe(false);
    expect(svc.nextOutstandingTaskType(MEMBER_UNANSWERED)).toBe('legacy_claim');
  });

  it('the club answer alone decides membership when both identity tasks are done', () => {
    const d = new BetterSqlite3(dbPath);
    insertOnboardingTask(d, MEMBER_LAZY, 'personal_details', 'completed');
    insertOnboardingTask(d, MEMBER_LAZY, 'legacy_claim', 'completed');
    insertOnboardingTask(d, MEMBER_LAZY, 'club_affiliations', 'pending');
    d.close();

    expect(svc.isOnboardingComplete(MEMBER_LAZY)).toBe(false);
    svc.completeTask(MEMBER_LAZY, 'club_affiliations');
    expect(svc.isOnboardingComplete(MEMBER_LAZY)).toBe(true);
    expect(svc.nextOutstandingTaskType(MEMBER_LAZY)).toBeNull();
  });
});

describe('memberOnboardingService.completeTask', () => {
  it('transitions to completed, sets completed_at, and removes it from the widget; the task row is the record', () => {
    seedPendingTasks(MEMBER_COMPLETE);
    svc.completeTask(MEMBER_COMPLETE, 'club_affiliations');

    const rows = readTaskRows(MEMBER_COMPLETE);
    const target = rows.find((r) => r.task_type === 'club_affiliations')!;
    expect(target.state).toBe('completed');
    expect(target.completed_at).not.toBeNull();

    expect(svc.nextOutstandingTaskType(MEMBER_COMPLETE)).not.toBe('club_affiliations');
    expect(readAuditRowsForMember(MEMBER_COMPLETE).filter((a) => a.entity_id === target.id)).toEqual([]);
  });
});

describe('memberOnboardingService repeated transition', () => {
  it('a no-op transition writes nothing, so the first completion time stands', () => {
    const d = new BetterSqlite3(dbPath);
    insertOnboardingTask(d, MEMBER_CYCLE, 'personal_details', 'pending');
    insertOnboardingTask(d, MEMBER_CYCLE, 'legacy_claim', 'pending');
    insertOnboardingTask(d, MEMBER_CYCLE, 'club_affiliations', 'pending');
    d.close();

    // Completing an already-completed task changes nothing, so it must not
    // move the recorded completion time.
    svc.completeTask(MEMBER_CYCLE, 'club_affiliations');
    const first = readTaskRows(MEMBER_CYCLE).find((r) => r.task_type === 'club_affiliations')!;
    svc.completeTask(MEMBER_CYCLE, 'club_affiliations');

    const target = readTaskRows(MEMBER_CYCLE).find((r) => r.task_type === 'club_affiliations')!;
    expect(target.state).toBe('completed');
    expect(target.completed_at).toBe(first.completed_at);
  });
});

describe('memberOnboardingService completion audit row', () => {
  it('emits exactly one wizard.complete row, on the transition that finishes the last task', () => {
    const memberId = 'onb-complete-audit';
    const d = new BetterSqlite3(dbPath);
    insertMember(d, { id: memberId, slug: 'onb_complete_audit', login_email: 'onbca@example.com', onboarding: 'none' });
    d.close();
    seedPendingTasks(memberId);

    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'legacy_claim');
    expect(readCompletionAudits(memberId)).toHaveLength(0);

    svc.completeTask(memberId, 'club_affiliations');
    expect(readCompletionAudits(memberId)).toHaveLength(1);

    // Re-completing an already-completed task is a no-op and never emits a
    // second completion row.
    svc.completeTask(memberId, 'club_affiliations');
    svc.completeTaskIfOutstanding(memberId, 'legacy_claim');
    expect(readCompletionAudits(memberId)).toHaveLength(1);
  });

  it('fires whichever task finishes last, not a fixed one', () => {
    const memberId = 'onb-complete-audit-2';
    const d = new BetterSqlite3(dbPath);
    insertMember(d, { id: memberId, slug: 'onb_complete_audit_2', login_email: 'onbca2@example.com', onboarding: 'none' });
    d.close();
    seedPendingTasks(memberId);

    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'club_affiliations');
    expect(readCompletionAudits(memberId)).toHaveLength(0);

    svc.completeTask(memberId, 'legacy_claim');
    const rows = readCompletionAudits(memberId);
    expect(rows).toHaveLength(1);
    // Nothing was held, so no held claim failed to land at completion.
    expect(JSON.parse(rows[0].metadata_json)).toEqual({ completing_task: 'legacy_claim', claim_not_applied: false });
  });
});

describe('memberOnboardingService.submitTaskResponse', () => {
  it('refuses the legacy_claim task, which only the claim decision completes', () => {
    expect(() => svc.submitTaskResponse(MEMBER_NO_TASKS, 'legacy_claim', {}))
      .toThrow('the claim decision completes it');
  });

  it('throws ValidationError for an unknown task type', () => {
    expect(() => svc.submitTaskResponse(MEMBER_NO_TASKS, 'bogus' as never, {}))
      .toThrow(ValidationError);
  });
});

describe('memberOnboardingService transition validation', () => {
  it('completeTaskIfOutstanding throws ValidationError for an unknown task type', () => {
    expect(() => svc.completeTaskIfOutstanding(MEMBER_BAD_TYPE, 'bogus' as never))
      .toThrow(ValidationError);
  });
  it('completeTask throws ValidationError for an unknown task type', () => {
    expect(() => svc.completeTask(MEMBER_BAD_TYPE, 'bogus' as never))
      .toThrow(ValidationError);
  });
});

describe('memberOnboardingService.nextOutstandingTaskType', () => {
  it('returns the lowest-index pending task for a fresh task list', () => {
    seedPendingTasks(MEMBER_NEXT_PENDING);
    expect(svc.nextOutstandingTaskType(MEMBER_NEXT_PENDING)).toBe(TASK_CATALOG[0]);
  });

  it('skips answered tasks and returns the next one still pending', () => {
    seedPendingTasks(MEMBER_NEXT_PAUSED);
    svc.completeTask(MEMBER_NEXT_PAUSED, TASK_CATALOG[0]);
    expect(svc.nextOutstandingTaskType(MEMBER_NEXT_PAUSED)).toBe(TASK_CATALOG[1]);
  });

  it('returns null when the member has no outstanding tasks', () => {
    const d = new BetterSqlite3(dbPath);
    for (const t of TASK_CATALOG) insertOnboardingTask(d, MEMBER_NEXT_NONE, t, 'completed');
    d.close();
    expect(svc.nextOutstandingTaskType(MEMBER_NEXT_NONE)).toBeNull();
  });
});
