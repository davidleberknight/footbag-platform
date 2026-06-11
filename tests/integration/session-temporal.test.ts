/**
 * Session-token temporal contract: expiry and the sliding-refresh window.
 *
 * A session JWT is valid for 24 hours and is silently re-issued when a request
 * arrives within the final 6 hours of its life; a token allowed to expire is
 * not renewed and the next request lands unauthenticated. These properties are
 * the lifetime half of authentication and were previously unexercised — token
 * issuance was tested, expiry behavior was not.
 *
 * Time is controlled through the token's own TTL (createTestSessionJwt's
 * ttlSeconds), not a faked clock, so the assertions exercise the real
 * verify-and-refresh path the auth middleware runs in production.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedPersona } from '../../src/testkit/personaFactory';
import { createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3416');

const SLUG = 'temporal_member';
const MEMBER_ID = `member_persona_${SLUG}`;
// A requireAuth-only route, ungated by the onboarding redirect, that renders for
// the owning member: a clean probe for "is this request authenticated".
const PROTECTED = `/members/${SLUG}/edit`;

const HOUR = 60 * 60;

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(ttlSeconds: number): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, ttlSeconds })}`;
}

function sessionSetCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers['set-cookie'] as string[] | undefined;
  return (raw ?? []).find((c) => c.startsWith('footbag_session='));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedPersona(db, {
    slug: SLUG,
    displayName: 'Tim Poral',
    tier: 'tier1',
    onboardingComplete: true,
    coverageNotes: ['session temporal probe member'],
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('session JWT temporal contract', () => {
  it('accepts a fresh session and serves the protected route', async () => {
    const res = await request(createApp()).get(PROTECTED).set('Cookie', cookieFor(24 * HOUR));
    expect(res.status, 'fresh session authenticated').toBe(200);
  });

  it('treats an expired session as unauthenticated (redirect to login)', async () => {
    const res = await request(createApp()).get(PROTECTED).set('Cookie', cookieFor(-10));
    expect(res.status, 'expired session redirected').toBe(302);
    expect(res.headers.location, 'redirected to login').toMatch(/^\/login/);
  });

  it('re-issues a fresh cookie when within the sliding-refresh window', async () => {
    // 1 minute to expiry is well inside the final-6-hours refresh window.
    const res = await request(createApp()).get(PROTECTED).set('Cookie', cookieFor(60));
    expect(res.status, 'still authenticated near expiry').toBe(200);
    expect(sessionSetCookie(res), 'a refreshed session cookie was issued').toBeDefined();
  });

  it('does not re-issue a cookie when outside the refresh window', async () => {
    // 7 hours to expiry is beyond the final-6-hours refresh window.
    const res = await request(createApp()).get(PROTECTED).set('Cookie', cookieFor(7 * HOUR));
    expect(res.status, 'authenticated, no refresh needed').toBe(200);
    expect(sessionSetCookie(res), 'no refreshed session cookie outside the window').toBeUndefined();
  });
});
