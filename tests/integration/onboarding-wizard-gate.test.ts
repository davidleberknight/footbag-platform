/**
 * Integration tests for the onboarding gate middleware
 * (requireOnboardingComplete). Verifies that gated routes redirect
 * members with incomplete onboarding to the wizard, and that members
 * with all tasks in a terminal state pass through.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3214');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
  testDb = new BetterSqlite3(dbPath);
  testDb.pragma('foreign_keys = ON');
});

afterAll(() => {
  testDb.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

function insertTaskRows(memberId: string, state: string): void {
  const now = new Date().toISOString();
  for (const taskType of ['personal_details', 'legacy_claim', 'club_affiliations']) {
    testDb.prepare(`
      INSERT INTO member_onboarding_tasks (id, created_at, created_by, updated_at, updated_by, version, member_id, task_type, state)
      VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
    `).run(`task-${memberId}-${taskType}`, now, now, memberId, taskType, state);
  }
}

describe('requireOnboardingComplete — gate correctness', () => {
  it('zero task rows: gated route redirects to wizard', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_zero_rows' });
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('all tasks completed: gated route passes through', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_completed' });
    insertTaskRows(memberId, 'completed');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).not.toBe(303);
  });

  it('all tasks skipped: gated route passes through', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_skipped' });
    insertTaskRows(memberId, 'skipped');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).not.toBe(303);
  });

  it('mix of completed and pending: gated route redirects to wizard', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_mixed' });
    const now = new Date().toISOString();
    testDb.prepare(`
      INSERT INTO member_onboarding_tasks (id, created_at, created_by, updated_at, updated_by, version, member_id, task_type, state)
      VALUES (?, ?, 'test', ?, 'test', 1, ?, 'personal_details', 'completed')
    `).run(`task-${memberId}-pd`, now, now, memberId);
    testDb.prepare(`
      INSERT INTO member_onboarding_tasks (id, created_at, created_by, updated_at, updated_by, version, member_id, task_type, state)
      VALUES (?, ?, 'test', ?, 'test', 1, ?, 'legacy_claim', 'pending')
    `).run(`task-${memberId}-lc`, now, now, memberId);
    testDb.prepare(`
      INSERT INTO member_onboarding_tasks (id, created_at, created_by, updated_at, updated_by, version, member_id, task_type, state)
      VALUES (?, ?, 'test', ?, 'test', 1, ?, 'club_affiliations', 'pending')
    `).run(`task-${memberId}-ca`, now, now, memberId);

    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
  });
});
