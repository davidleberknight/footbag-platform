/**
 * Integration tests for memberOnboardingService.
 *
 * Exercises the scaffold contract: task list lifecycle, state transitions,
 * audit emission per transition, idempotent startTaskList, and the
 * NotImplementedError thrown by submitTaskResponse pending per-task handlers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3140');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let NotImplementedError: typeof import('../../src/services/memberOnboardingService').NotImplementedError;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let TASK_CATALOG: typeof import('../../src/services/memberOnboardingService').TASK_CATALOG;
import type { ValidationError as ValidationErrorType } from '../../src/services/serviceErrors';
let ValidationError: typeof ValidationErrorType;

// One member per scenario keeps tests independent without per-test DB resets.
const MEMBER_NO_TASKS    = 'member-onb-no-tasks';
const MEMBER_LIST        = 'member-onb-list';
const MEMBER_NO_AUDIT    = 'member-onb-no-audit';
const MEMBER_SKIP        = 'member-onb-skip';
const MEMBER_SKIP_AUDIT  = 'member-onb-skip-audit';
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
    MEMBER_NO_TASKS, MEMBER_LIST, MEMBER_NO_AUDIT, MEMBER_SKIP,
    MEMBER_SKIP_AUDIT, MEMBER_LAZY, MEMBER_COMPLETE, MEMBER_CYCLE,
    MEMBER_BAD_TYPE,
    MEMBER_NEXT_PENDING, MEMBER_NEXT_PAUSED, MEMBER_NEXT_NONE,
  ]) {
    insertMember(db, { id, slug: id.replace(/-/g, '_'), login_email: `${id}@example.com` });
  }
  db.close();

  const mod = await import('../../src/services/memberOnboardingService');
  svc = mod.memberOnboardingService;
  NotImplementedError = mod.NotImplementedError;
  TASK_CATALOG = mod.TASK_CATALOG;

  const errs = await import('../../src/services/serviceErrors');
  ValidationError = errs.ValidationError;
});

afterAll(() => cleanupTestDb(dbPath));

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

describe('memberOnboardingService.getDashboardTaskWidget', () => {
  it('lists outstanding tasks in story order (personal details, legacy claim, club affiliations)', () => {
    const d = new BetterSqlite3(dbPath);
    insertMember(d, { id: 'dash-order-1', slug: 'dash_order_1', login_email: 'dash1@example.com' });
    d.close();
    svc.startTaskList('dash-order-1');
    const widget = svc.getDashboardTaskWidget('dash-order-1');
    expect(widget.pending.map((t) => t.taskType)).toEqual([
      'personal_details', 'legacy_claim', 'club_affiliations',
    ]);
  });
});

describe('memberOnboardingService.getTaskWidget', () => {
  it('returns an empty array for a member with no tasks', () => {
    expect(svc.getTaskWidget(MEMBER_NO_TASKS)).toEqual([]);
  });
});

describe('memberOnboardingService.startTaskList', () => {
  it('inserts one pending row per task type in the catalog', () => {
    svc.startTaskList(MEMBER_LIST);
    const rows = readTaskRows(MEMBER_LIST);
    expect(rows).toHaveLength(TASK_CATALOG.length);
    for (const row of rows) {
      expect(row.state).toBe('pending');
      expect(row.completed_at).toBeNull();
    }
    expect(new Set(rows.map((r) => r.task_type))).toEqual(new Set(TASK_CATALOG));
  });

  it('is idempotent: a second call does not duplicate rows', () => {
    svc.startTaskList(MEMBER_LIST);
    const rows = readTaskRows(MEMBER_LIST);
    expect(rows).toHaveLength(TASK_CATALOG.length);
  });

  it('does not emit audit rows', () => {
    svc.startTaskList(MEMBER_NO_AUDIT);
    expect(readAuditRowsForMember(MEMBER_NO_AUDIT)).toHaveLength(0);
  });

  it('getTaskWidget returns all tasks in catalog order after startTaskList', () => {
    const widget = svc.getTaskWidget(MEMBER_LIST);
    expect(widget.map((t) => t.taskType)).toEqual([...TASK_CATALOG]);
    for (const item of widget) {
      expect(item.state).toBe('pending');
    }
  });
});

describe('memberOnboardingService.skipTask', () => {
  it('transitions a pending task to skipped and surfaces it in the dashboard widget skipped bucket (not in the in-sequence wizard advance set)', () => {
    svc.startTaskList(MEMBER_SKIP);
    svc.skipTask(MEMBER_SKIP, 'legacy_claim');

    // In-sequence wizard advance: skipped tasks are intentionally excluded so
    // the live wizard sequence does not loop the member back into a task they
    // deliberately bypassed.
    const advanceSet = svc.getTaskWidget(MEMBER_SKIP);
    expect(advanceSet.find((t) => t.taskType === 'legacy_claim')).toBeUndefined();

    // Dashboard widget: skipped is its own bucket, still actionable.
    const dashboard = svc.getDashboardTaskWidget(MEMBER_SKIP);
    const legacy = dashboard.skipped.find((t) => t.taskType === 'legacy_claim');
    expect(legacy).toBeDefined();
    expect(legacy!.state).toBe('skipped');
    expect(legacy!.ctaHref).toBe('/register/wizard/legacy_claim');
  });

  it('emits one audit row with action_type=wizard.task.skipped', () => {
    svc.startTaskList(MEMBER_SKIP_AUDIT);
    svc.skipTask(MEMBER_SKIP_AUDIT, 'club_affiliations');
    const audits = readAuditRowsForMember(MEMBER_SKIP_AUDIT);
    expect(audits).toHaveLength(1);
    const a = audits[0];
    expect(a.action_type).toBe('wizard.task.skipped');
    expect(a.actor_type).toBe('member');
    expect(a.actor_member_id).toBe(MEMBER_SKIP_AUDIT);
    expect(a.entity_type).toBe('member_onboarding_task');
    expect(a.category).toBe('onboarding');
    expect(JSON.parse(a.metadata_json)).toEqual({ task_type: 'club_affiliations' });
  });

  it('lazily creates the row when called before startTaskList (defensive idempotency)', () => {
    svc.skipTask(MEMBER_LAZY, 'club_affiliations');
    const rows = readTaskRows(MEMBER_LAZY);
    const ca = rows.find((r) => r.task_type === 'club_affiliations');
    expect(ca).toBeDefined();
    expect(ca!.state).toBe('skipped');
  });
});

describe('memberOnboardingService.completeTask', () => {
  it('transitions to completed, sets completed_at, removes from widget, and emits one audit row', () => {
    svc.startTaskList(MEMBER_COMPLETE);
    svc.completeTask(MEMBER_COMPLETE, 'club_affiliations');

    const rows = readTaskRows(MEMBER_COMPLETE);
    const target = rows.find((r) => r.task_type === 'club_affiliations')!;
    expect(target.state).toBe('completed');
    expect(target.completed_at).not.toBeNull();

    const widget = svc.getTaskWidget(MEMBER_COMPLETE);
    expect(widget.find((t) => t.taskType === 'club_affiliations')).toBeUndefined();

    const audits = readAuditRowsForMember(MEMBER_COMPLETE)
      .filter((a) => a.action_type === 'wizard.task.completed');
    expect(audits).toHaveLength(1);
    expect(audits[0].entity_id).toBe(target.id);
    expect(JSON.parse(audits[0].metadata_json)).toEqual({
      task_type: 'club_affiliations',
    });
  });
});

describe('memberOnboardingService.startTask (skip-resume-complete cycle)', () => {
  it('emits three audit rows for the same row in skip → start → complete order', () => {
    svc.startTaskList(MEMBER_CYCLE);
    svc.skipTask(MEMBER_CYCLE, 'club_affiliations');
    svc.startTask(MEMBER_CYCLE, 'club_affiliations');
    svc.completeTask(MEMBER_CYCLE, 'club_affiliations');

    const rows = readTaskRows(MEMBER_CYCLE);
    const target = rows.find((r) => r.task_type === 'club_affiliations')!;
    expect(target.state).toBe('completed');
    expect(target.completed_at).not.toBeNull();

    const audits = readAuditRowsForMember(MEMBER_CYCLE)
      .filter((a) => a.entity_id === target.id);
    expect(audits.map((a) => a.action_type)).toEqual([
      'wizard.task.skipped',
      'wizard.task.started',
      'wizard.task.completed',
    ]);
    expect(new Set(audits.map((a) => a.entity_id)).size).toBe(1);
  });
});

describe('memberOnboardingService.submitTaskResponse', () => {
  it('throws NotImplementedError for a valid task type', () => {
    expect(() => svc.submitTaskResponse(MEMBER_NO_TASKS, 'legacy_claim', {}))
      .toThrow(NotImplementedError);
  });

  it('throws ValidationError for an unknown task type', () => {
    expect(() => svc.submitTaskResponse(MEMBER_NO_TASKS, 'bogus' as never, {}))
      .toThrow(ValidationError);
  });
});

describe('memberOnboardingService transition validation', () => {
  it('startTask throws ValidationError for an unknown task type', () => {
    expect(() => svc.startTask(MEMBER_BAD_TYPE, 'bogus' as never))
      .toThrow(ValidationError);
  });
  it('skipTask throws ValidationError for an unknown task type', () => {
    expect(() => svc.skipTask(MEMBER_BAD_TYPE, 'bogus' as never))
      .toThrow(ValidationError);
  });
  it('completeTask throws ValidationError for an unknown task type', () => {
    expect(() => svc.completeTask(MEMBER_BAD_TYPE, 'bogus' as never))
      .toThrow(ValidationError);
  });
});

describe('memberOnboardingService.nextOutstandingTaskType', () => {
  it('returns the lowest-index pending task for a fresh task list', () => {
    svc.startTaskList(MEMBER_NEXT_PENDING);
    expect(svc.nextOutstandingTaskType(MEMBER_NEXT_PENDING)).toBe(TASK_CATALOG[0]);
  });

  it('falls back to the lowest-index paused task when none are pending', () => {
    svc.startTaskList(MEMBER_NEXT_PAUSED);
    const db = new BetterSqlite3(dbPath);
    db.prepare(
      `UPDATE member_onboarding_tasks SET state = 'in_progress_paused' WHERE member_id = ?`,
    ).run(MEMBER_NEXT_PAUSED);
    db.close();
    expect(svc.nextOutstandingTaskType(MEMBER_NEXT_PAUSED)).toBe(TASK_CATALOG[0]);
  });

  it('returns null when the member has no outstanding tasks', () => {
    expect(svc.nextOutstandingTaskType(MEMBER_NEXT_NONE)).toBeNull();
  });
});
