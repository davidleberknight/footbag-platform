/**
 * Production first-admin bootstrap: a signed-in member claiming with the
 * operator-provisioned SSM token receives is_admin=1 plus the Tier 2
 * invariant grant plus the admin.bootstrap_grant audit row atomically, and
 * the token parameter is deleted so the bootstrap closes. Wrong tokens,
 * an unprovisioned parameter, and a second claim all return the same
 * non-revealing result; unauthenticated visitors never reach the form.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3085');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let secrets: typeof import('../../src/adapters/secretsAdapter');

const TOKEN_PARAM = '/footbag/development/app/bootstrap/admin_token';

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: 'boot-claimer', slug: 'boot_claimer', login_email: 'boot@example.com' });
  insertMember(db, { id: 'boot-second', slug: 'boot_second', login_email: 'boot2@example.com' });
  createApp = await importApp();
  secrets = await import('../../src/adapters/secretsAdapter');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

function stub(): ReturnType<typeof secrets.getStubSecretsAdapterForTests> {
  const s = secrets.getStubSecretsAdapterForTests();
  if (!s) throw new Error('stub secrets adapter not active');
  return s;
}

describe('bootstrap claim', () => {
  it('requires sign-in', async () => {
    const res = await request(createApp()).get('/admin/bootstrap-claim');
    expect([302, 303]).toContain(res.status);
  });

  it('rejects a claim before any token is provisioned (non-revealing)', async () => {
    const res = await request(createApp())
      .post('/admin/bootstrap-claim')
      .set('Cookie', cookieFor('boot-claimer'))
      .type('form')
      .send({ token: 'anything' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('not accepted');
  });

  it('grants admin + Tier 2 + audit atomically on the right token, then consumes the single shot', async () => {
    stub().setSecret(TOKEN_PARAM, 'one-shot-bootstrap-token');

    const wrong = await request(createApp())
      .post('/admin/bootstrap-claim')
      .set('Cookie', cookieFor('boot-claimer'))
      .type('form')
      .send({ token: 'wrong-token' });
    expect(wrong.status).toBe(422);

    const res = await request(createApp())
      .post('/admin/bootstrap-claim')
      .set('Cookie', cookieFor('boot-claimer'))
      .type('form')
      .send({ token: 'one-shot-bootstrap-token' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Administrator access granted');

    const m = db.prepare('SELECT is_admin FROM members WHERE id = ?').get('boot-claimer') as Record<string, unknown>;
    expect(m.is_admin).toBe(1);
    const tier = db.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get('boot-claimer') as { tier_status?: string } | undefined;
    expect(tier?.tier_status).toBe('tier2');
    const audit = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = 'boot-claimer' AND action_type = 'admin.bootstrap_grant'`,
    ).get() as { n: number };
    expect(audit.n).toBe(1);

    // The parameter is gone: a second member's claim with the same token is
    // refused with the same non-revealing shape.
    const second = await request(createApp())
      .post('/admin/bootstrap-claim')
      .set('Cookie', cookieFor('boot-second'))
      .type('form')
      .send({ token: 'one-shot-bootstrap-token' });
    expect(second.status).toBe(422);
    const m2 = db.prepare('SELECT is_admin FROM members WHERE id = ?').get('boot-second') as Record<string, unknown>;
    expect(m2.is_admin).toBe(0);
  });

  it('refuses a valid-token claim once an admin exists, even with the token still present', async () => {
    // Re-provision the token to stand in for the concurrency window where one
    // claim has granted but its token deletion has not yet landed when a second
    // valid claim arrives. The grant must still be single-shot: the in-database
    // no-admin-exists guard, not the token's deletion, closes the bootstrap.
    stub().setSecret(TOKEN_PARAM, 'one-shot-bootstrap-token');

    const second = await request(createApp())
      .post('/admin/bootstrap-claim')
      .set('Cookie', cookieFor('boot-second'))
      .type('form')
      .send({ token: 'one-shot-bootstrap-token' });
    expect(second.status).toBe(422);

    const m2 = db.prepare('SELECT is_admin FROM members WHERE id = ?').get('boot-second') as Record<string, unknown>;
    expect(m2.is_admin).toBe(0);
    const tier = db.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get('boot-second') as { tier_status?: string } | undefined;
    expect(tier?.tier_status).not.toBe('tier2');
    const audit = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = 'boot-second' AND action_type = 'admin.bootstrap_grant'`,
    ).get() as { n: number };
    expect(audit.n).toBe(0);
  });
});
