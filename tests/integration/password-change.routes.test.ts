/**
 * Integration tests for GET/POST /members/:slug/edit/password.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { expectLoggedError } from '../setup-env';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3064');

let createApp: Awaited<ReturnType<typeof importApp>>;

const OWN_ID   = 'pw-own-001';
const OWN_SLUG = 'pw_owner';
const OWN_EMAIL = 'pw-owner@example.com';
const OLD_PASSWORD = 'OldPassword!1';
const NEW_PASSWORD = 'NewPassword!2';

function ownCookie(passwordVersion = 1): string {
  return `footbag_session=${createTestSessionJwt({ memberId: OWN_ID, passwordVersion })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const hash = await hashTestPassword(OLD_PASSWORD);
  insertMember(db, {
    id: OWN_ID,
    slug: OWN_SLUG,
    login_email: OWN_EMAIL,
    display_name: 'Pw Owner',
    password_hash: hash,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /members/:slug/edit/password', () => {
  it('unauthenticated → 302 to /login', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${OWN_SLUG}/edit/password`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('own profile → 200 with form', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="oldPassword"');
    expect(res.text).toContain('name="newPassword"');
    expect(res.text).toContain('name="confirmPassword"');
  });

  it("another member's password page → 404", async () => {
    const app = createApp();
    // Use a JWT for the real owner but request someone else's slug.
    const res = await request(app)
      .get(`/members/some_other/edit/password`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(404);
  });
});

describe('POST /members/:slug/edit/password', () => {
  it('valid change → 200 with success, reissues session cookie', async () => {
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.close();

    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Your password has been changed');
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    expect(cookies?.some((c) => c.startsWith('footbag_session='))).toBe(true);

    // Verify DB state: password_version incremented.
    const db2 = new BetterSqlite3(dbPath, { readonly: true });
    const row = db2.prepare('SELECT password_version FROM members WHERE id=?')
      .get(OWN_ID) as { password_version: number };
    db2.close();
    expect(row.password_version).toBe(2);
  });

  it('wrong old password → 422', async () => {
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.close();

    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: 'wrong-password',
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Current password is incorrect');
  });

  it('mismatched new passwords → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: 'different',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('do not match');
  });

  it('7-char new password → 422 (lower boundary, just below MIN_PASSWORD_LENGTH=8)', async () => {
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.close();

    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: 'pass!12',
        confirmPassword: 'pass!12',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('at least 8 characters');
  });

  it('8-char new password → 200 (lower boundary, exactly MIN_PASSWORD_LENGTH=8)', async () => {
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.close();

    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: 'pass!123',
        confirmPassword: 'pass!123',
      });
    expect(res.status).toBe(200);
  });

  it('128-char new password → 200 (upper boundary, exactly MAX_PASSWORD_LENGTH=128)', async () => {
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.close();

    const longPassword = 'a'.repeat(128);
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: longPassword,
        confirmPassword: longPassword,
      });
    expect(res.status).toBe(200);
  });

  it('129-char new password → 422 (upper boundary, just above MAX_PASSWORD_LENGTH=128)', async () => {
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.close();

    const tooLongPassword = 'a'.repeat(129);
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: tooLongPassword,
        confirmPassword: tooLongPassword,
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('at most 128 characters');
  });

  it('stale JWT (pre-change passwordVersion) is rejected by middleware → 302', async () => {
    // Restore DB to password_version=1, old password hash so we can change it.
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.close();

    const app = createApp();
    const first = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
    expect(first.status).toBe(200);

    // A stale cookie still carrying pwv=1 is rejected on a subsequent request.
    const stale = await request(app)
      .get(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1));
    expect(stale.status).toBe(302);
    expect(stale.headers.location).toContain('/login');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Session-reissue failure (KMS Sign / IAM regression / key rotation mid-flight)
// ─────────────────────────────────────────────────────────────────────────

describe('POST /members/:slug/edit/password — session reissue failure', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let adapterMod: typeof import('../../src/adapters/jwtSigningAdapter');
  let realAdapter: import('../../src/adapters/jwtSigningAdapter').JwtSigningAdapter;

  beforeAll(async () => {
    adapterMod = await import('../../src/adapters/jwtSigningAdapter');
    // Capture the real adapter BEFORE injection. The failure-adapter delegates
    // verifyJwt to it so the auth middleware can still validate the incoming
    // session cookie (only signJwt should fail in this scenario).
    realAdapter = adapterMod.getJwtSigningAdapter();
  });

  afterEach(() => {
    adapterMod.resetJwtSigningAdapterForTests();
  });

  it('signJwt failure after password_version commit → 503, no Set-Cookie, DB committed, actionable error', async () => {
    expectLoggedError('password change: session reissue failed');
    // Restore a deterministic starting state: prior tests in this file mutate
    // password_hash and password_version, so seed from scratch.
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.close();

    adapterMod.setJwtSigningAdapterForTests({
      signJwt: async () => {
        // Mirrors a real KMS Sign rejection wire shape (the AWS SDK throws an
        // Error subclass with name='AccessDeniedException' on IAM regression).
        const err = new Error('KMS Sign failed: AccessDeniedException');
        err.name = 'KMSAccessDenied';
        throw err;
      },
      verifyJwt: (token) => realAdapter.verifyJwt(token),
    });

    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });

    // A1: actionable error message, 503 status, body names the recovery path.
    expect(res.status).toBe(503);
    expect(res.text).toContain('Your password was changed');
    expect(res.text).toContain('could not re-issue your session');
    expect(res.text).toContain('Forgot password');

    // A3: no Set-Cookie issuing a fresh footbag_session. (A clear-cookie
    // header with Max-Age=0 would be acceptable; this test asserts no
    // newly-valid session cookie was issued.)
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const sessionCookieIssued = cookies?.some((c) =>
      c.startsWith('footbag_session=') &&
      !c.match(/Max-Age=0|Expires=Thu, 01 Jan 1970/i),
    );
    expect(sessionCookieIssued).toBeFalsy();

    // A2: password_version was committed before the signing attempt (the
    // failure mode is "row updated + session not issued" — exactly what the
    // controller must recover from). pv was 1 at the start of this test;
    // a successful commit lands it at 2.
    const dbCheck = new BetterSqlite3(dbPath, { readonly: true });
    const row = dbCheck.prepare('SELECT password_version FROM members WHERE id=?')
      .get(OWN_ID) as { password_version: number };
    dbCheck.close();
    expect(row.password_version).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Confirmation-email enqueue failure (outbox unavailable / SQLite busy)
// ─────────────────────────────────────────────────────────────────────────

describe('POST /members/:slug/edit/password — confirmation-email enqueue failure', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let commsMod: typeof import('../../src/services/communicationService');

  beforeAll(async () => {
    commsMod = await import('../../src/services/communicationService');
  });

  afterEach(() => {
    commsMod.resetCommunicationServiceForTests();
  });

  it('enqueueEmailOrFail throws → 503 + actionable error + audit row + DB committed + no Set-Cookie', async () => {
    expectLoggedError('audit: auth.password_change_notification_failed');
    // Restore deterministic starting state.
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.prepare(
      `DELETE FROM audit_entries WHERE entity_id = ? AND action_type = 'auth.password_change_notification_failed'`,
    ).run(OWN_ID);
    db.close();

    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    // Inject a CommunicationService whose enqueueEmailOrFail throws. Mirrors
    // the production failure mode (outbox DB busy, schema mismatch, OOM).
    commsMod.setCommunicationServiceForTests({
      enqueueEmail: () => {
        throw new ServiceUnavailableError('synthetic enqueue failure');
      },
      enqueueEmailOrFail: () => {
        throw new ServiceUnavailableError(
          'synthetic enqueueEmailOrFail failure for password-change confirmation',
        );
      },
      enqueueMailingListEmail: () => ({ enqueued: 0, duplicates: 0 }),
      processSendQueue: async () => ({
        claimed: 0, sent: 0, failed: 0, deadLettered: 0, paused: false,
      }),
    });

    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });

    // A1: actionable error message + 503 status + body names the recovery path.
    expect(res.status).toBe(503);
    expect(res.text).toContain('Your password was changed');
    expect(res.text).toContain('could not enqueue the confirmation email');
    expect(res.text).toContain('Forgot password');

    // A4: no Set-Cookie issuing a fresh footbag_session.
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const sessionCookieIssued = cookies?.some((c) =>
      c.startsWith('footbag_session=') &&
      !c.match(/Max-Age=0|Expires=Thu, 01 Jan 1970/i),
    );
    expect(sessionCookieIssued).toBeFalsy();

    // A3: password_version committed before the enqueue attempt.
    // A2: audit row with the dedicated action_type was written.
    const dbCheck = new BetterSqlite3(dbPath, { readonly: true });
    const row = dbCheck.prepare('SELECT password_version FROM members WHERE id=?')
      .get(OWN_ID) as { password_version: number };
    const auditRow = dbCheck.prepare(
      `SELECT action_type, category, actor_type FROM audit_entries
         WHERE entity_id = ? AND action_type = 'auth.password_change_notification_failed'
         ORDER BY created_at DESC LIMIT 1`,
    ).get(OWN_ID) as
      | { action_type: string; category: string; actor_type: string }
      | undefined;
    dbCheck.close();
    expect(row.password_version).toBe(2);
    expect(auditRow).toBeDefined();
    expect(auditRow!.action_type).toBe('auth.password_change_notification_failed');
    expect(auditRow!.category).toBe('auth');
    expect(auditRow!.actor_type).toBe('system');
  });
});
