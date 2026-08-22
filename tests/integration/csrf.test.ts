/**
 * CSRF-related integration tests.
 *
 * State-changing routes are protected by two invariants:
 *   1. All mutations are POST (no state change on GET).
 *   2. Session cookie carries SameSite=Lax, which browsers will not attach
 *      to cross-site POSTs — so an attacker page cannot ride the victim's
 *      authenticated session.
 *
 * The effective test is therefore: a POST without a session cookie must not
 * reach the controller's mutation path. Protected routes go through
 * requireAuth and redirect to /login (302).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3065');

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID    = 'csrf-test-001';
const MEMBER_SLUG  = 'csrf_tester';
const MEMBER_EMAIL = 'csrf-tester@example.com';
const MEMBER_PASSWORD = 'CsrfTestPass!1';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const hash = await hashTestPassword(MEMBER_PASSWORD);
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    login_email: MEMBER_EMAIL,
    display_name: 'Csrf Tester',
    password_hash: hash,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('CSRF — SameSite cookie attribute', () => {
  it('login issues a session cookie with SameSite=Lax and HttpOnly', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: MEMBER_EMAIL, password: MEMBER_PASSWORD });
    expect(res.status).toBe(303);
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const session = cookies?.find((c) => c.startsWith('__Host-footbag_session='));
    expect(session).toBeDefined();
    expect(session!).toMatch(/SameSite=Lax/i);
    expect(session!).toMatch(/HttpOnly/i);
  });

  it('login under X-Forwarded-Proto: https issues a Secure session cookie', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/login')
      .set('X-Forwarded-Proto', 'https')
      .type('form')
      .send({ email: MEMBER_EMAIL, password: MEMBER_PASSWORD });
    expect(res.status).toBe(303);
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const session = cookies?.find((c) => c.startsWith('__Host-footbag_session='));
    expect(session).toBeDefined();
    expect(session!).toMatch(/Secure/i);
    expect(session!).toMatch(/SameSite=Lax/i);
    expect(session!).toMatch(/HttpOnly/i);
  });

  it('registration does not set a session cookie (unverified until /verify/:token)', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Csrf', familyName: 'Newcomer',
        email: 'csrf-newcomer@example.com',
        password: 'CsrfNewcomer!1',
        confirmPassword: 'CsrfNewcomer!1',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    expect(cookies?.some((c) => c.startsWith('__Host-footbag_session='))).toBeFalsy();
  });
});

describe('CSRF — cross-site POST without session cookie is blocked', () => {
  // A real browser with SameSite=Lax would not attach the cookie on a
  // cross-site POST, leaving the server to see an unauthenticated request.
  // Each protected POST below must redirect to /login instead of mutating.
  const protectedPosts: Array<[string, string, Record<string, string>]> = [
    ['profile edit',      `/members/${MEMBER_SLUG}/edit`,           { displayName: 'Hacked' }],
    ['password change',   `/members/${MEMBER_SLUG}/edit/password`,  { oldPassword: 'x', newPassword: 'y', confirmPassword: 'y' }],
    ['claim lookup',      `/register/wizard/legacy_claim/find`,            { identifier: 'LM-1' }],
    ['claim confirm',     `/register/wizard/legacy_claim/claim/confirm`,   { token: 'x' }],
  ];

  for (const [name, path, body] of protectedPosts) {
    it(`${name}: POST without cookie → 302 to /login`, async () => {
      const app = createApp();
      const res = await request(app).post(path).type('form').send(body);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });
  }
});

describe('CSRF — verb discipline', () => {
  it('logout is not reachable by GET at all, so no link on another site can trigger it', async () => {
    const app = createApp();
    // First establish a session.
    const loginRes = await request(app)
      .post('/login')
      .type('form')
      .send({ email: MEMBER_EMAIL, password: MEMBER_PASSWORD });
    const cookies = loginRes.headers['set-cookie'] as string[];
    const sessionCookie = cookies.find((c) => c.startsWith('__Host-footbag_session='))!
      .split(';')[0];

    // No GET route exists. The Origin pin only guards state-changing verbs, so
    // anything a plain cross-site link can reach is outside its protection:
    // a GET that logged the member out, or a GET page that posted on load from
    // our own origin, would both be forced logouts the pin would never see.
    const res = await request(app).get('/logout').set('Cookie', sessionCookie);
    expect(res.status).toBe(404);
    const respCookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
    expect(respCookies.some((c) => /footbag_session=\s*;/.test(c))).toBe(false);

    // The session still resolves afterwards: nothing about it changed.
    const after = await request(app).get('/').set('Cookie', sessionCookie);
    expect(after.status).toBe(200);
  });
});
