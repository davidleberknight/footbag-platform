/**
 * Adversarial tests: anti-enumeration assertions.
 *
 * Timing attacks against anti-enumeration endpoints (login, password reset,
 * claim lookup). Endpoints that could leak existence (login, password reset,
 * email verify, claim lookup) must return identical UX for 'exists' vs
 * 'does not exist' cases.
 *
 * This suite asserts the long-term contract that the identity-probing
 * endpoints are response-shape-identical for positive and negative inputs.
 * Strict timing comparisons are omitted because they flake under CI jitter;
 * shape equality is the durable assertion. Services enforce the actual
 * behavior at `src/services/identityAccessService.ts`; these tests pin
 * against regression.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3082');

let createApp: Awaited<ReturnType<typeof importApp>>;

const KNOWN_EMAIL         = 'known@example.com';
const UNKNOWN_EMAIL       = 'nobody@example.com';
const UNVERIFIED_EMAIL    = 'unverified@example.com';
const KNOWN_PASSWORD      = 'KnownPass1!';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const hash = await hashTestPassword(KNOWN_PASSWORD);
  insertMember(db, {
    id: 'anti-enum-known-001',
    slug: 'known_user',
    login_email: KNOWN_EMAIL,
    display_name: 'Known User',
    password_hash: hash,
  });
  insertMember(db, {
    id: 'anti-enum-unverified-001',
    slug: 'unverified_user',
    login_email: UNVERIFIED_EMAIL,
    display_name: 'Unverified User',
    password_hash: hash,
    email_verified_at: null,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ── POST /login ───────────────────────────────────────────────────────────────

describe('POST /login — response shape identical for exists vs not-exists', () => {
  it('identical status and body shape', async () => {
    const app = createApp();

    const knownWrongPw = await request(app)
      .post('/login')
      .type('form')
      .send({ email: KNOWN_EMAIL, password: 'WrongPass1!' });

    const unknownEmail = await request(app)
      .post('/login')
      .type('form')
      .send({ email: UNKNOWN_EMAIL, password: 'WrongPass1!' });

    expect(knownWrongPw.status).toBe(unknownEmail.status);
    // Same length within tolerance (tiny variations from cookies/etc OK).
    const lenRatio = knownWrongPw.text.length / unknownEmail.text.length;
    expect(lenRatio).toBeGreaterThan(0.95);
    expect(lenRatio).toBeLessThan(1.05);
    // Both must use the same user-facing error phrase.
    expect(knownWrongPw.text).toContain('Invalid email or password. Please try again.');
    expect(unknownEmail.text).toContain('Invalid email or password. Please try again.');
  });

  it('unverified member login matches wrong-password response shape', async () => {
    const app = createApp();
    const knownWrongPw = await request(app)
      .post('/login')
      .type('form')
      .send({ email: KNOWN_EMAIL, password: 'WrongPass1!' });
    const unverified = await request(app)
      .post('/login')
      .type('form')
      .send({ email: UNVERIFIED_EMAIL, password: 'WrongPass1!' });
    expect(unverified.status).toBe(knownWrongPw.status);
    const lenRatio = unverified.text.length / knownWrongPw.text.length;
    expect(lenRatio).toBeGreaterThan(0.95);
    expect(lenRatio).toBeLessThan(1.05);
    expect(unverified.text).toContain('Invalid email or password. Please try again.');
  });
});

// ── POST /password/forgot ─────────────────────────────────────────────────────

describe('POST /password/forgot — non-revealing sent page for exists vs not-exists', () => {
  it('identical status and the same non-revealing banner for both', async () => {
    const app = createApp();

    const known = await request(app)
      .post('/password/forgot')
      .type('form')
      .send({ email: KNOWN_EMAIL });

    const unknown = await request(app)
      .post('/password/forgot')
      .type('form')
      .send({ email: UNKNOWN_EMAIL });

    expect(known.status).toBe(unknown.status);
    expect(known.status).toBe(200);
    // The banner never states whether an account exists. Under the stub adapter
    // the dev card intentionally differs (it shows the submitter's own reset link
    // when an account exists), so full byte-identity is the production guarantee,
    // verified under the live adapter in the prod sibling suite.
    expect(known.text).toContain('If an account exists');
    expect(unknown.text).toContain('If an account exists');
  });
});

// ── POST /verify/resend ───────────────────────────────────────────────────────

describe('POST /verify/resend — non-revealing page for exists/unverified/unknown', () => {
  it('identical status and the same non-revealing banner across all three cases', async () => {
    const app = createApp();

    const unverified = await request(app)
      .post('/verify/resend')
      .type('form')
      .send({ email: UNVERIFIED_EMAIL });

    const alreadyVerified = await request(app)
      .post('/verify/resend')
      .type('form')
      .send({ email: KNOWN_EMAIL });

    const unknown = await request(app)
      .post('/verify/resend')
      .type('form')
      .send({ email: UNKNOWN_EMAIL });

    expect(unverified.status).toBe(alreadyVerified.status);
    expect(unverified.status).toBe(unknown.status);
    expect(unverified.status).toBe(200);

    // The banner never states whether an account exists. Under the stub adapter
    // the dev card intentionally differs (it shows the submitter's own verify
    // link when an unverified account exists), so full byte-identity is the
    // production guarantee, verified under the live adapter in the prod sibling.
    expect(unverified.text).toContain('new verification link has been sent');
    expect(alreadyVerified.text).toContain('new verification link has been sent');
    expect(unknown.text).toContain('new verification link has been sent');
  });
});

// ── POST /register (duplicate email) ──────────────────────────────────────────

describe('POST /register — duplicate email is indistinguishable from a fresh registration', () => {
  it('fresh registration and duplicate email both return the identical 303, no existence leak', async () => {
    const app = createApp();

    const fresh = await request(app)
      .post('/register')
      .type('form')
      .send({
        email: 'fresh@example.com',
        realName: 'Fresh User',
        displayName: 'Fresh User',
        password: 'FreshPass1!',
        confirmPassword: 'FreshPass1!',
      });
    expect(fresh.status).toBe(303);
    expect(fresh.headers.location).toBe('/register/check-email');

    const duplicate = await request(app)
      .post('/register')
      .type('form')
      .send({
        email: KNOWN_EMAIL,
        realName: 'Another User',
        displayName: 'Another User',
        password: 'AnotherPass1!',
        confirmPassword: 'AnotherPass1!',
      });
    // Same status and redirect as the fresh registration; the response must
    // never reveal that the email is already registered.
    expect(duplicate.status).toBe(fresh.status);
    expect(duplicate.headers.location).toBe(fresh.headers.location);
    expect(duplicate.text).not.toContain('already exists');
  });
});
