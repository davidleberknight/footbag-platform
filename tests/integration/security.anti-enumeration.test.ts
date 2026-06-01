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

/** Normalize response text for comparison: strip CSRF tokens, any volatile
 *  nonces or timestamps, and collapse whitespace. Two anti-enumeration
 *  responses must match under this normalization. */
function normalize(text: string): string {
  return text
    // Strip any <input name="..." value="..."> attribute values (covers
    // CSRF tokens, form-refill values that legitimately differ).
    .replace(/value="[^"]*"/g, 'value="REDACTED"')
    .replace(/\s+/g, ' ')
    .trim();
}

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

describe('POST /password/forgot — response shape identical for exists vs not-exists', () => {
  it('identical status and body shape', async () => {
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

    // Normalized bodies must be identical. Any divergence leaks existence.
    expect(normalize(known.text)).toBe(normalize(unknown.text));
  });
});

// ── POST /verify/resend ───────────────────────────────────────────────────────

describe('POST /verify/resend — response shape identical for exists/unverified/unknown', () => {
  it('identical status and body shape across all three cases', async () => {
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

    expect(normalize(unverified.text)).toBe(normalize(alreadyVerified.text));
    expect(normalize(unverified.text)).toBe(normalize(unknown.text));
  });
});

// ── POST /register (duplicate email) ──────────────────────────────────────────

describe('POST /register — duplicate email returns 422 with actionable error', () => {
  it('fresh registration → 303; duplicate email → 422 with login/reset guidance', async () => {
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
    expect(duplicate.status).toBe(422);
    expect(duplicate.text).toContain('already exists');
    expect(duplicate.text).toContain('log in');
  });
});
