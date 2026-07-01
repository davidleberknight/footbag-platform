/**
 * GET /dev/login?as=<slug> — dev-only "log in as a persona" affordance.
 *
 * The route is mounted when config.footbagEnv is 'development' or 'staging'
 * (never production); this test pins 'development'. Unlike /dev/switch, which
 * mints a session cookie directly, this route runs the production login path
 * (identityAccessService.attemptLogin) with the persona's seeded email and the
 * shared harness password, so the real credential and account-state gates
 * execute. A session-eligible persona gets a real cookie and a redirect to its
 * profile; a login-blocked persona (unverified/deceased/soft-deleted) is
 * rejected by the same query the public form uses and lands on /login with no
 * cookie. Covers the eligible path, the rejected path, unknown slug, missing
 * param, and the audit trail.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import argon2 from 'argon2';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedPersona } from '../../src/testkit/personaFactory';

const { dbPath } = setTestEnv('3404');

const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = 'development';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Imported here, not at module top: personaSecrets refuses to load outside
  // development/staging, and FOOTBAG_ENV is pinned to development above.
  const { TEST_PERSONA_SEED_PASSWORD_LITERAL } = await import('../../src/testkit/personaSecrets');
  // The harness seed password, argon2-hashed, so the real login path verifies it.
  const passwordHash = await argon2.hash(TEST_PERSONA_SEED_PASSWORD_LITERAL);
  // Session-eligible: verified, not deceased, not deleted.
  seedPersona(db, { slug: 'login_ok', displayName: 'Login Okay', tier: 'tier1', onboardingComplete: true, coverageNotes: ['eligible'] }, { passwordHash });
  // Login-blocked: registered but email not verified.
  seedPersona(db, { slug: 'login_unverified', displayName: 'Login Unverified', tier: 'tier0', emailVerified: false, coverageNotes: ['unverified'] }, { passwordHash });
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

function sessionCookie(setCookie: string[] | undefined): string | undefined {
  return (setCookie ?? []).find((c) => c.startsWith('footbag_session='));
}

describe('GET /dev/login', () => {
  it('a session-eligible persona logs in: 302 to its profile with a real session cookie', async () => {
    const res = await request(createApp()).get('/dev/login?as=login_ok');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/members/login_ok');
    expect(sessionCookie(res.headers['set-cookie'] as unknown as string[])).toBeDefined();
  });

  it('the issued cookie is accepted by the production auth middleware', async () => {
    const loginRes = await request(createApp()).get('/dev/login?as=login_ok');
    const cookie = sessionCookie(loginRes.headers['set-cookie'] as unknown as string[])!;
    const profileRes = await request(createApp()).get('/members/login_ok').set('Cookie', cookie.split(';')[0]);
    expect(profileRes.status).toBe(200);
  });

  it('a login-blocked persona is rejected: 302 to /login, no session cookie', async () => {
    const res = await request(createApp()).get('/dev/login?as=login_unverified');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
    expect(sessionCookie(res.headers['set-cookie'] as unknown as string[])).toBeUndefined();
  });

  it('returns 404 for an unknown persona slug', async () => {
    const res = await request(createApp()).get('/dev/login?as=does_not_exist');
    expect(res.status).toBe(404);
  });

  it('returns 400 when ?as is missing', async () => {
    const res = await request(createApp()).get('/dev/login');
    expect(res.status).toBe(400);
  });

  it('writes a testkit.persona_login audit row for both the eligible and rejected outcomes', async () => {
    await request(createApp()).get('/dev/login?as=login_ok');
    await request(createApp()).get('/dev/login?as=login_unverified');
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const ok = db.prepare(
        `SELECT COUNT(*) c FROM audit_entries WHERE action_type = 'testkit.persona_login' AND entity_id = ?`,
      ).get('login_ok') as { c: number };
      const blocked = db.prepare(
        `SELECT COUNT(*) c FROM audit_entries WHERE action_type = 'testkit.persona_login' AND entity_id = ?`,
      ).get('login_unverified') as { c: number };
      expect(ok.c).toBeGreaterThan(0);
      expect(blocked.c).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
