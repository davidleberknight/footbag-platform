/**
 * Schema-level tests for member_onboarding_tasks.
 *
 * Verifies the contract of the table:
 *   - one row per task_type per member accepted (all three valid task_types)
 *   - default state is 'pending' when not supplied
 *   - CHECK enforces task_type enum
 *   - CHECK enforces state enum
 *   - UNIQUE(member_id, task_type) blocks duplicates
 *   - FK to members(id) enforced
 *   - NOT NULL on created_by enforced (row-metadata convention)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const TASK_TYPES = [
  'personal_details',
  'legacy_claim',
  'club_affiliations',
] as const;

// Two states only: a task is outstanding until the member answers it.
const STATES = ['pending', 'completed'] as const;
const REJECTED_STATES = ['in_progress_paused', 'skipped', 'not_applicable', 'bogus'] as const;

const TS = '2026-01-01T00:00:00.000Z';

function insertTask(
  db: BetterSqlite3.Database,
  o: {
    id: string;
    member_id: string;
    task_type: string;
    state?: string | null;
    completed_at?: string | null;
    created_by?: string | null;
  },
) {
  return db.prepare(`
    INSERT INTO member_onboarding_tasks (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, task_type, state, completed_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, COALESCE(?, 'pending'), ?)
  `).run(
    o.id,
    TS, o.created_by === undefined ? 'system' : o.created_by, TS, 'system',
    o.member_id, o.task_type, o.state ?? null, o.completed_at ?? null,
  );
}

describe('member_onboarding_tasks schema', () => {
  let db: BetterSqlite3.Database;
  let dbPath: string;
  let memberId: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `footbag-test-mot-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    db = createTestDb(dbPath);
    // This suite exercises the raw schema constraints, so the member must
    // start with no task rows at all.
    memberId = insertMember(db, { onboarding: 'none' });
  });

  afterEach(() => {
    db.close();
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it('accepts one row per task_type for a member', () => {
    for (const [i, taskType] of TASK_TYPES.entries()) {
      insertTask(db, { id: `mot-${i}`, member_id: memberId, task_type: taskType });
    }
    const rows = db.prepare(
      `SELECT task_type, state, completed_at, version
         FROM member_onboarding_tasks
        WHERE member_id = ?
        ORDER BY task_type`,
    ).all(memberId) as Array<{
      task_type: string;
      state: string;
      completed_at: string | null;
      version: number;
    }>;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(TASK_TYPES).toContain(row.task_type as typeof TASK_TYPES[number]);
      expect(row.state).toBe('pending');
      expect(row.completed_at).toBeNull();
      expect(row.version).toBe(1);
    }
  });

  it('schema default for state is pending when the column is omitted', () => {
    db.prepare(`
      INSERT INTO member_onboarding_tasks (
        id, created_at, created_by, updated_at, updated_by, version,
        member_id, task_type
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run('mot-default-state', TS, 'system', TS, 'system', memberId, 'legacy_claim');
    const row = db.prepare(
      `SELECT state FROM member_onboarding_tasks WHERE id = ?`,
    ).get('mot-default-state') as { state: string };
    expect(row.state).toBe('pending');
  });

  for (const state of STATES) {
    it(`accepts valid state "${state}"`, () => {
      insertTask(db, {
        id: `mot-state-${state}`,
        member_id: memberId,
        task_type: 'legacy_claim',
        state,
      });
      const row = db.prepare(
        `SELECT state FROM member_onboarding_tasks WHERE id = ?`,
      ).get(`mot-state-${state}`) as { state: string };
      expect(row.state).toBe(state);
    });
  }

  for (const state of REJECTED_STATES) {
    it(`refuses state "${state}", which the wizard has no way to write`, () => {
      expect(() => {
        insertTask(db, {
          id: `mot-bad-state-${state}`,
          member_id: memberId,
          task_type: 'legacy_claim',
          state,
        });
      }).toThrow(/CHECK constraint failed/);
    });
  }

  it('UNIQUE(member_id, task_type) blocks a duplicate insert', () => {
    insertTask(db, { id: 'mot-dup-1', member_id: memberId, task_type: 'legacy_claim' });
    expect(() => {
      insertTask(db, { id: 'mot-dup-2', member_id: memberId, task_type: 'legacy_claim' });
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('CHECK constraint rejects out-of-enum task_type', () => {
    expect(() => {
      insertTask(db, { id: 'mot-bad-type', member_id: memberId, task_type: 'bogus' });
    }).toThrow(/CHECK constraint failed/);
  });

  it('CHECK constraint rejects out-of-enum state', () => {
    expect(() => {
      insertTask(db, {
        id: 'mot-bad-state',
        member_id: memberId,
        task_type: 'legacy_claim',
        state: 'in_progress',
      });
    }).toThrow(/CHECK constraint failed/);
  });

  it('NOT NULL constraint rejects null created_by', () => {
    expect(() => {
      insertTask(db, {
        id: 'mot-no-creator',
        member_id: memberId,
        task_type: 'legacy_claim',
        created_by: null,
      });
    }).toThrow(/NOT NULL constraint failed/);
  });

  it('FK to members(id) rejects an unknown member_id', () => {
    expect(() => {
      insertTask(db, {
        id: 'mot-bad-fk',
        member_id: 'does-not-exist',
        task_type: 'legacy_claim',
      });
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('the member-search view counts the same number of tasks the catalog defines', () => {
    // members_searchable excludes a pending account by requiring every task
    // completed, and it spells that as a literal count. Extending the catalog
    // without updating the view inverts the predicate: a member who completes
    // the new task exceeds the count and vanishes from search, while one who
    // has not yet answered it still matches. Nothing else pins the two
    // together, so this does.
    const viewSql = fs.readFileSync(
      path.join(process.cwd(), 'database', 'schema.sql'),
      'utf8',
    );
    const definition = viewSql.slice(
      viewSql.indexOf('CREATE VIEW members_searchable'),
      viewSql.indexOf(';', viewSql.indexOf('CREATE VIEW members_searchable')),
    );
    const counted = definition.match(/state = 'completed'\s*\)\s*=\s*(\d+)/);
    expect(counted, 'members_searchable must gate on a completed-task count').not.toBeNull();
    expect(Number(counted![1])).toBe(TASK_TYPES.length);
  });
});
