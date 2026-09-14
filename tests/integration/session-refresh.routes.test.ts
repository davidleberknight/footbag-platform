/**
 * Sliding-session refresh: an authenticated request carrying a token within
 * six hours of expiry receives a freshly-signed session cookie on the same
 * response; a younger token does not. No refresh tokens exist: an expired
 * token gets no cookie and the request lands unauthenticated.
 *
 * The refresh is an optimisation, never a precondition. When the signer is
 * unavailable the request is still served on the token the member presented,
 * because that token is valid until it expires and the next in-window request
 * can retry the refresh.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3086');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db: BetterSqlite3.Database = createTestDb(dbPath);
  insertMember(db, {
    id: 'mem-refresh', slug: 'mem_refresh', login_email: 'refresh@example.com',
    real_name: 'Refresh Tester', display_name: 'Refresh Tester',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function sessionCookies(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  const arr = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return arr.filter((c) => c.startsWith('__Host-footbag_session='));
}

describe('sliding-session refresh window', () => {
  it('re-issues a fresh cookie when the token is within six hours of expiry', async () => {
    // One-hour TTL: well inside the refresh window from the first second.
    const nearExpiry = createTestSessionJwt({ memberId: 'mem-refresh', ttlSeconds: 60 * 60 });
    const res = await request(createApp())
      .get('/members/mem_refresh')
      .set('Cookie', `__Host-footbag_session=${nearExpiry}`);
    expect(res.status).toBe(200);
    const cookies = sessionCookies(res);
    expect(cookies).toHaveLength(1);
    // The re-issued token differs from the presented one and is a JWT.
    const reissued = cookies[0].split(';')[0].split('=')[1];
    expect(reissued).not.toBe(nearExpiry);
    expect(reissued.split('.')).toHaveLength(3);
  });

  it('does not re-issue for a token outside the window', async () => {
    const fresh = createTestSessionJwt({ memberId: 'mem-refresh', ttlSeconds: 24 * 60 * 60 });
    const res = await request(createApp())
      .get('/members/mem_refresh')
      .set('Cookie', `__Host-footbag_session=${fresh}`);
    expect(res.status).toBe(200);
    expect(sessionCookies(res)).toHaveLength(0);
  });

  it('an expired token gets no cookie and lands unauthenticated', async () => {
    const expired = createTestSessionJwt({ memberId: 'mem-refresh', ttlSeconds: -60 });
    const res = await request(createApp())
      .get('/members/mem_refresh')
      .set('Cookie', `__Host-footbag_session=${expired}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login\?returnTo=/);
    expect(sessionCookies(res)).toHaveLength(0);
  });

  // A signing failure inside the refresh must never cost the member the request
  // they made. The token they presented is still valid, so the right answer is
  // to serve them on it and let the next in-window request retry the refresh;
  // answering 500 would turn a transient signer blip into an outage for every
  // member whose session happened to be near expiry.
  it('serves the request on the presented token when re-signing fails', async () => {
    const adapterMod = await import('../../src/adapters/jwtSigningAdapter');
    const real = adapterMod.getJwtSigningAdapter();
    adapterMod.setJwtSigningAdapterForTests({
      signJwt: () => {
        throw new Error('signing key unavailable');
      },
      verifyJwt: (token) => real.verifyJwt(token),
    });
    try {
      const nearExpiry = createTestSessionJwt({ memberId: 'mem-refresh', ttlSeconds: 60 * 60 });
      const res = await request(createApp())
        .get('/members/mem_refresh')
        .set('Cookie', `__Host-footbag_session=${nearExpiry}`);
      expect(res.status).toBe(200);
      expect(sessionCookies(res)).toHaveLength(0);
    } finally {
      adapterMod.resetJwtSigningAdapterForTests();
    }
  });
});
