/**
 * Integration tests for GET/POST /members/:slug/edit/password.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { expectLoggedError } from '../setup-env';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3064');

let createApp: Awaited<ReturnType<typeof importApp>>;

const OWN_ID   = 'pw-own-001';
const OWN_SLUG = 'pw_owner';
const OWN_EMAIL = 'pw-owner@example.com';
const OLD_PASSWORD = 'OldPassword!1';
const NEW_PASSWORD = 'NewPassword!2';

function ownCookie(passwordVersion = 1): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: OWN_ID, passwordVersion })}`;
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
    expect(cookies?.some((c) => c.startsWith('__Host-footbag_session='))).toBe(true);

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

  it('signJwt failure leaves the password unchanged and the member signed in → 503, no Set-Cookie, nothing committed', async () => {
    // Signing is a hard dependency, so its failure is operator-actionable and
    // the production alarm counts error-level lines. Opting in here pins the
    // level: softening it to a warning would silence the alarm and fail this.
    expectLoggedError('password change abandoned: session signing unavailable');
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

    // The message tells the truth: nothing changed, so retrying is the whole
    // recovery. It must not send the member to password reset, which would be
    // advice to recover from a lockout that did not happen.
    expect(res.status).toBe(503);
    expect(res.text).toContain('your password was not changed');
    expect(res.text).toContain('still signed in');
    expect(res.text).not.toContain('Forgot password');

    // No fresh session cookie: there is no new session to issue. (A clear-cookie
    // header with Max-Age=0 would be acceptable; this asserts no newly-valid
    // session cookie was issued.)
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const sessionCookieIssued = cookies?.some((c) =>
      c.startsWith('__Host-footbag_session=') &&
      !c.match(/Max-Age=0|Expires=Thu, 01 Jan 1970/i),
    );
    expect(sessionCookieIssued).toBeFalsy();

    // The signing attempt happens before the bump, so a signing outage leaves
    // password_version where it was and the member's existing session valid.
    const dbCheck = new BetterSqlite3(dbPath, { readonly: true });
    const row = dbCheck.prepare('SELECT password_version, password_hash FROM members WHERE id=?')
      .get(OWN_ID) as { password_version: number; password_hash: string };
    dbCheck.close();
    expect(row.password_version).toBe(1);
    // The old password still authenticates: the hash was never replaced.
    expect(row.password_hash).toBe(hash);
  });

  it('the member can still sign in on the old password after a signing outage', async () => {
    expectLoggedError('password change abandoned: session signing unavailable');
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.close();

    adapterMod.setJwtSigningAdapterForTests({
      signJwt: async () => { throw new Error('KMS Sign failed: AccessDeniedException'); },
      verifyJwt: (token) => realAdapter.verifyJwt(token),
    });

    const app = createApp();
    await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });

    adapterMod.resetJwtSigningAdapterForTests();

    // The session cookie the member arrived with still carries the current
    // password_version, so the browser that made the failed attempt is still
    // authenticated rather than locked out.
    const after = await request(createApp())
      .get(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1));
    expect(after.status).toBe(200);
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

  it('enqueue failure rolls the whole change back → 503, nothing committed, no audit row, no Set-Cookie', async () => {
    // Restore deterministic starting state.
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    // audit_entries is append-only, so the rollback is proved by the row count
    // standing still rather than by clearing the table first.
    const auditCountBefore = (db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ? AND action_type = 'auth.password_change'`,
    ).get(OWN_ID) as { n: number }).n;
    db.close();

    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    // Inject a CommunicationService whose enqueue throws. Mirrors the
    // production failure mode (outbox DB busy, schema mismatch, OOM).
    commsMod.setCommunicationServiceForTests({
      enqueue: () => {
        throw new ServiceUnavailableError(
          'synthetic enqueue failure for password-change confirmation',
        );
      },
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

    // Honest message: the password did not change, so there is nothing to
    // recover from and no reason to send the member to password reset.
    expect(res.status).toBe(503);
    expect(res.text).toContain('your password was not changed');
    expect(res.text).toContain('still signed in');
    expect(res.text).not.toContain('Forgot password');

    // No fresh session cookie was issued.
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const sessionCookieIssued = cookies?.some((c) =>
      c.startsWith('__Host-footbag_session=') &&
      !c.match(/Max-Age=0|Expires=Thu, 01 Jan 1970/i),
    );
    expect(sessionCookieIssued).toBeFalsy();

    // The notification is enqueued inside the same transaction as the bump and
    // its audit row, so a failed enqueue takes all three down together: the
    // password cannot change without the member being told it changed.
    const dbCheck = new BetterSqlite3(dbPath, { readonly: true });
    const row = dbCheck.prepare('SELECT password_version, password_hash FROM members WHERE id=?')
      .get(OWN_ID) as { password_version: number; password_hash: string };
    const auditCountAfter = (dbCheck.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ? AND action_type = 'auth.password_change'`,
    ).get(OWN_ID) as { n: number }).n;
    dbCheck.close();
    expect(row.password_version).toBe(1);
    expect(row.password_hash).toBe(hash);
    expect(auditCountAfter).toBe(auditCountBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// A change that commits with nobody told still leaves a trail
// ─────────────────────────────────────────────────────────────────────────

describe('POST /members/:slug/edit/password — the member could not be notified', () => {
  // Suppression is not an enqueue failure, so it does not roll the change back.
  // It ends with the password changed and no mail sent, which is precisely the
  // state someone using a stolen session would want, so it has to be visible
  // afterwards rather than passing as an ordinary change.

  function notificationFailureCount(): number {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries
        WHERE entity_id = ? AND action_type = 'auth.password_change_notification_failed'`,
    ).get(OWN_ID) as { n: number };
    db.close();
    return row.n;
  }

  async function seedMember(): Promise<void> {
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(hash, OWN_ID);
    db.close();
  }

  it('records the failure when an operator has disabled the notification template', async () => {
    expectLoggedError('audit: auth.password_change_notification_failed');
    await seedMember();
    const before = notificationFailureCount();

    const db = new BetterSqlite3(dbPath);
    db.prepare(`UPDATE email_templates SET is_enabled = 0 WHERE template_key = 'password_changed'`).run();
    db.close();

    const res = await request(createApp())
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });

    const restore = new BetterSqlite3(dbPath);
    restore.prepare(`UPDATE email_templates SET is_enabled = 1 WHERE template_key = 'password_changed'`).run();
    restore.close();

    // The change still succeeds: a disabled template is an operator's own
    // decision, not a reason to lock members out of changing their password.
    expect(res.status).toBe(200);
    const check = new BetterSqlite3(dbPath, { readonly: true });
    const row = check.prepare('SELECT password_version FROM members WHERE id=?')
      .get(OWN_ID) as { password_version: number };
    check.close();
    expect(row.password_version).toBe(2);
    // ... and the silence is on the record.
    expect(notificationFailureCount()).toBe(before + 1);
  });

});
