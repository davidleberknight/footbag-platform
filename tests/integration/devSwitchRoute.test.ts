/**
 * GET /dev/switch?as=<slug> — dev-only persona cookie issuance.
 *
 * The route is mounted when config.footbagEnv is 'development' or 'staging'
 * (never in production); this test pins 'development'. It resolves a seeded
 * persona by slug and issues a real session
 * cookie via the same primitive the production login path uses, so the cookie
 * is verified by the standard auth middleware (not an auth bypass). Covers the
 * happy path, role propagation through the issued cookie, unknown slug,
 * missing param, and the audit trail.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedPersona } from '../../src/testkit/personaFactory';

const { dbPath } = setTestEnv('3403');

// The /dev router mounts when footbagEnv is 'development' or 'staging'; pin it before
// importApp boots the frozen config singleton.
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = 'development';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedPersona(db, { slug: 'sw_member', displayName: 'Switch Member', tier: 'tier1', onboardingComplete: true, coverageNotes: ['switch member'] });
  seedPersona(db, { slug: 'sw_admin', displayName: 'Switch Admin', tier: 'tier2', isAdmin: true, onboardingComplete: true, coverageNotes: ['switch admin'] });
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

function sessionCookie(setCookie: string[] | undefined): string {
  const entry = (setCookie ?? []).find((c) => c.startsWith('footbag_session='));
  if (!entry) throw new Error('no footbag_session cookie issued');
  return entry.split(';')[0];
}

describe('GET /dev/switch', () => {
  it('resolves a persona slug, issues a session cookie, and 302s to /', async () => {
    const res = await request(createApp()).get('/dev/switch?as=sw_member');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(() => sessionCookie(res.headers['set-cookie'] as unknown as string[])).not.toThrow();
  });

  it('issues a cookie the production auth middleware accepts, carrying the admin role', async () => {
    const switchRes = await request(createApp()).get('/dev/switch?as=sw_admin');
    const cookie = sessionCookie(switchRes.headers['set-cookie'] as unknown as string[]);
    // The admin persona's cookie reaches the admin-gated surface (requireAuth +
    // requireAdmin), proving the cookie verifies and carries role=admin.
    const adminRes = await request(createApp()).get('/admin').set('Cookie', cookie);
    expect(adminRes.status).toBe(200);
  });

  it('returns 404 for an unknown persona slug', async () => {
    const res = await request(createApp()).get('/dev/switch?as=does_not_exist');
    expect(res.status).toBe(404);
  });

  it('returns 400 when ?as is missing', async () => {
    const res = await request(createApp()).get('/dev/switch');
    expect(res.status).toBe(400);
  });

  it('writes an audit entry with action_type testkit.persona_switch', async () => {
    await request(createApp()).get('/dev/switch?as=sw_member');
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const row = db.prepare(
        `SELECT COUNT(*) c FROM audit_entries WHERE action_type = 'testkit.persona_switch' AND entity_id = ?`,
      ).get('member_persona_sw_member') as { c: number };
      expect(row.c).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
