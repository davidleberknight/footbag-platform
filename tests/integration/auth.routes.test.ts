/**
 * Integration tests for DB-backed login.
 *
 * Covers: valid DB credentials, wrong password, unknown email, the non-email
 * dev stub identifier, a real member's email paired with the stub password
 * (which must not authenticate anyone), the rate-limit ceiling at its seeded
 * default, and the open-redirect defenses on returnTo.
 *
 * The two cases that lower a rate-limit ceiling live in their own file, because
 * the ceiling is a row in an append-only config table: a case that tunes it
 * changes what every later case in the same database reads, and cannot undo
 * that except by appending a further row. Passwords are hashed at setup time
 * via argon2; no hash is stored in git.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3002');

const TEST_PASSWORD      = 'test-password-123';
const TEST_MEMBER_EMAIL  = 'test-member@example.com';
const FOOTBAG_PASSWORD   = process.env.STUB_PASSWORD!;

let app: Express.Application;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Hash passwords at setup time — no hashes stored in git.
  const [testMemberHash, footbagHash] = await Promise.all([
    hashTestPassword(TEST_PASSWORD),
    hashTestPassword(FOOTBAG_PASSWORD),
  ]);

  // Regular verified member with a real email address.
  insertMember(db, {
    id:                'member-auth-test-001',
    slug:              'test_member',
    login_email:       TEST_MEMBER_EMAIL,
    display_name:      'Test Member',
    password_hash:     testMemberHash,
    email_verified_at: '2025-01-01T00:00:00.000Z',
  });

  // login_email='footbag' is a non-email dev stub identifier; the production
  // constraint requires a valid email.
  insertMember(db, {
    id:                'member-footbag-hacky',
    slug:              'footbag_hacky',
    login_email:       'footbag',
    display_name:      'Footbag Hacky',
    password_hash:     footbagHash,
    email_verified_at: '2025-01-01T00:00:00.000Z',
  });

  db.close();

  const createApp = await importApp();
  app = createApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /login — DB-backed auth', () => {
  it('valid DB credentials → 303 redirect and session cookie set', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: TEST_MEMBER_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(303);
    const cookie = (res.headers['set-cookie'] as string[])?.find((c) => c.startsWith('__Host-footbag_session='));
    expect(cookie).toBeTruthy();
  });

  it('a successful login confirms itself: flash cookie set, banner on the next page, gone after', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: TEST_MEMBER_EMAIL, password: TEST_PASSWORD });

    const cookies: string[] = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie']
      : [res.headers['set-cookie'] ?? ''];
    const flashCookie = cookies.find((c: string) => c.startsWith('footbag_flash='));
    expect(flashCookie).toBeDefined();

    // The banner is what the member actually sees; a cookie alone confirms
    // nothing to them.
    const landing = await request(app).get('/').set('Cookie', flashCookie!.split(';')[0]);
    expect(landing.status).toBe(200);
    expect(landing.text).toContain('You are now logged in.');

    // Shown once: the confirmation belongs to the sign-in, not to every page
    // the member visits afterwards.
    const next = await request(app).get('/');
    expect(next.text).not.toContain('You are now logged in.');
  });

  it('Footbag Hacky login (email=footbag) → 303 redirect and session cookie set', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'footbag', password: FOOTBAG_PASSWORD });

    expect(res.status).toBe(303);
    const cookie = (res.headers['set-cookie'] as string[])?.find((c) => c.startsWith('__Host-footbag_session='));
    expect(cookie).toBeTruthy();
  });

  it('correct email but wrong password → 200 with error', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: TEST_MEMBER_EMAIL, password: 'wrong-password' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid email or password. Please try again.');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('unknown email → 200 with error', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'nobody@example.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid email or password. Please try again.');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('real member email + Footbag password → 200 with error (no cross-account fallthrough)', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: TEST_MEMBER_EMAIL, password: FOOTBAG_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid email or password. Please try again.');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('login rate limit engages after max attempts on the same email/IP', async () => {
    // System-config default: login_rate_limit_max_attempts=10, window=15m.
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/login')
        .type('form')
        .send({ email: TEST_MEMBER_EMAIL, password: 'wrong-password' });
      expect(res.status).toBe(200);
    }
    // 11th attempt should be blocked with 429.
    const blocked = await request(app)
      .post('/login')
      .type('form')
      .send({ email: TEST_MEMBER_EMAIL, password: 'wrong-password' });
    expect(blocked.status).toBe(429);
    expect(blocked.text).toContain('Too many failed login attempts');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

});

describe('POST /login — returnTo open-redirect defenses (isSafePath)', () => {
  // These sign in under the stub identifier rather than the member email,
  // because the rate-limit case above deliberately exhausts that email's
  // bucket and a shared bucket would turn every redirect assertion into a 429.
  const SAFE_DEFAULT = '/members/footbag_hacky';

  it('rejects protocol-scheme returnTo (http://evil.com) and falls back to the safe default', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'footbag', password: FOOTBAG_PASSWORD, returnTo: 'http://evil.com' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(SAFE_DEFAULT);
  });

  it('rejects protocol-relative returnTo (//evil.com) and falls back to the safe default', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'footbag', password: FOOTBAG_PASSWORD, returnTo: '//evil.com/path' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(SAFE_DEFAULT);
  });

  it('rejects backslash-containing returnTo (/\\evil.com) and falls back to the safe default', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'footbag', password: FOOTBAG_PASSWORD, returnTo: '/\\evil.com' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(SAFE_DEFAULT);
  });

  it('honors a clean same-origin path returnTo', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'footbag', password: FOOTBAG_PASSWORD, returnTo: '/members/footbag_hacky/edit' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/members/footbag_hacky/edit');
  });
});
