/**
 * Membership-completion gate (requireOnboardingComplete). A verified member is
 * not a full member until the two REQUIRED onboarding tasks are completed:
 * personal_details and the legacy_claim decision. Until then the member is
 * redirected off the member, club, and admin capability surfaces to the wizard.
 * A skipped required task does NOT satisfy the gate (skipping is not a
 * decision). club_affiliations is optional and never gates membership. Once both
 * required tasks are completed the gate is a no-op.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertOnboardingTask, createTestSessionJwt } from '../fixtures/factories';

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

describe('requireOnboardingComplete — membership gate', () => {
  it('zero task rows: a gated club route redirects to the wizard', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_zero_rows' });
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('both required tasks completed (club task still pending): gated route passes through', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_required_done' });
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'completed');
    insertOnboardingTask(testDb, memberId, 'club_affiliations', 'pending');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).not.toBe(303);
  });

  it('personal_details only SKIPPED: still gated (skipping is not completing)', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_pd_skipped' });
    insertOnboardingTask(testDb, memberId, 'personal_details', 'skipped');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'completed');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('legacy_claim only SKIPPED: still gated (the legacy decision is required)', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_lc_skipped' });
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'skipped');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('personal_details NOT_APPLICABLE: still gated (only completed satisfies the predicate)', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_pd_na' });
    insertOnboardingTask(testDb, memberId, 'personal_details', 'not_applicable');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'completed');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('legacy_claim NOT_APPLICABLE: still gated (only completed satisfies the predicate)', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_lc_na' });
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'not_applicable');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('not complete but nothing outstanding: redirects to the wizard complete page, never back into a task', async () => {
    // legacy_claim marked not_applicable leaves the member not-complete yet with
    // no task pending or paused. The gate must send them to the terminal complete
    // page, which re-checks and routes onward if needed, rather than to a specific
    // task that is not outstanding and would immediately redirect again.
    const memberId = insertMember(testDb, { slug: 'gate_none_outstanding' });
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'not_applicable');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/complete');
  });

  it('club browse (GET /clubs) stays reachable mid-onboarding', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_browse_open' });
    const res = await request(createApp())
      .get('/clubs')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).not.toBe(303);
  });

  it('own profile stays reachable mid-onboarding (whitelisted)', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_own_profile' });
    const res = await request(createApp())
      .get('/members/gate_own_profile')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).not.toBe(303);
  });

  it('admin work pages use normal admin gating, not the onboarding gate', async () => {
    // Admin is earned by completing onboarding (a separate go-live mechanism),
    // so an admin reaching an admin page is already onboarded. The onboarding
    // gate does not fence the admin work surface: an admin is denied by
    // requireAdmin (403) when not authorized, never bounced to the wizard.
    const adminId = insertMember(testDb, { slug: 'gate_admin_normal', is_admin: 1 });
    const res = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', cookieFor(adminId));
    expect(res.headers.location ?? '').not.toContain('/register/wizard/');
    expect(res.status).not.toBe(303);
  });
});
