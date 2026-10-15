/**
 * Integration tests for GET/POST /members/:slug/edit/password.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { expectLoggedError } from '../setup-env';
import { insertMember, createTestSessionJwt, insertSystemConfig } from '../fixtures/factories';

const { dbPath } = setTestEnv('3064');

let createApp: Awaited<ReturnType<typeof importApp>>;

const OWN_ID   = 'pw-own-001';
const OWN_SLUG = 'pw_owner';
const OWN_EMAIL = 'pw-owner@example.com';
const OLD_PASSWORD = 'OldPassword!1';
const NEW_PASSWORD = 'NewPassword!2';

const PASSWORD_CHANGED_BANNER = 'Your password has been changed.';

function ownCookie(passwordVersion = 1): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: OWN_ID, passwordVersion })}`;
}

/** The newly issued session cookie (name=value only), if the response set one. */
function sessionCookieFrom(res: { get(h: string): string[] | undefined }): string | undefined {
  return (res.get('Set-Cookie') ?? [])
    .filter((c) => c.startsWith('__Host-footbag_session=') && !/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c))
    .map((c) => c.split(';')[0])[0];
}

/** The signed flash cookie (name=value only), if the response set one. */
function flashCookieFrom(res: { get(h: string): string[] | undefined }): string | undefined {
  return (res.get('Set-Cookie') ?? [])
    .filter((c) => c.startsWith('footbag_flash=') && !c.startsWith('footbag_flash=;'))
    .map((c) => c.split(';')[0])[0];
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
  it('valid change → 303 back to the password page, reissues session cookie, and the page reports the change once', async () => {
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

    // Post-Redirect-Get: a refresh of the landing page re-posts nothing.
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${OWN_SLUG}/edit/password`);
    const session = sessionCookieFrom(res);
    expect(session).toBeDefined();

    // Verify DB state: password_version incremented.
    const db2 = new BetterSqlite3(dbPath, { readonly: true });
    const row = db2.prepare('SELECT password_version FROM members WHERE id=?')
      .get(OWN_ID) as { password_version: number };
    db2.close();
    expect(row.password_version).toBe(2);

    // The redirect target reports the change, carried by the flash, and a
    // reload without it does not claim a second change.
    const landed = await request(app)
      .get(res.headers.location)
      .set('Cookie', [session!, flashCookieFrom(res)!].join('; '));
    expect(landed.status).toBe(200);
    expect(landed.text).toContain(PASSWORD_CHANGED_BANNER);
    // The page that shows the message also clears it, so a browser reload
    // does not carry it again.
    expect((landed.get('Set-Cookie') ?? []).some((c) => /^footbag_flash=;/.test(c))).toBe(true);
    const reload = await request(app)
      .get(res.headers.location)
      .set('Cookie', session!);
    expect(reload.status).toBe(200);
    expect(reload.text).not.toContain(PASSWORD_CHANGED_BANNER);
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

  it('8-char new password → 303 (lower boundary, exactly MIN_PASSWORD_LENGTH=8)', async () => {
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
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${OWN_SLUG}/edit/password`);
  });

  it('128-char new password → 303 (upper boundary, exactly MAX_PASSWORD_LENGTH=128)', async () => {
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
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${OWN_SLUG}/edit/password`);
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
    expect(first.status).toBe(303);

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
      kid: realAdapter.kid,
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
    const cookies = res.get('Set-Cookie');
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
      kid: realAdapter.kid,
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
      liftAddressSuppression: async () => {},
      processSendQueue: async () => ({
        claimed: 0, sent: 0, failed: 0, deadLettered: 0, manualReview: 0, paused: false,
        suppressed: 0, bulkHalted: false, bulkPaused: false,
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
    const cookies = res.get('Set-Cookie');
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
    expect(res.status).toBe(303);
    const check = new BetterSqlite3(dbPath, { readonly: true });
    const row = check.prepare('SELECT password_version FROM members WHERE id=?')
      .get(OWN_ID) as { password_version: number };
    check.close();
    expect(row.password_version).toBe(2);
    // ... and the silence is on the record.
    expect(notificationFailureCount()).toBe(before + 1);
  });

});

// ─────────────────────────────────────────────────────────────────────────
// A change submitted twice (back button, second tab) reports the first outcome
// ─────────────────────────────────────────────────────────────────────────

describe('POST /members/:slug/edit/password — submitted twice', () => {
  // A member of its own, so the audit and outbox counts belong to these cases.
  const REPEAT_ID = 'pw-repeat-001';
  const REPEAT_SLUG = 'pw_repeater';
  // A ceiling of two attempts makes every spent slot visible: the change takes
  // one, so exactly one more attempt is allowed before the bucket closes.
  const MAX_ATTEMPTS = 2;
  const WINDOW_MINUTES = 15;
  const passwordPath = `/members/${REPEAT_SLUG}/edit/password`;
  const changeForm = { oldPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };
  const wrongGuessForm = { oldPassword: 'NotMyPassword!9', newPassword: 'SomeOther!3', confirmPassword: 'SomeOther!3' };

  function repeatCookie(passwordVersion: number): string {
    return `__Host-footbag_session=${createTestSessionJwt({ memberId: REPEAT_ID, passwordVersion })}`;
  }

  function state(): { audits: number; emails: number; version: number; hash: string } {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const audits = (db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ? AND action_type = 'auth.password_change'`,
    ).get(REPEAT_ID) as { n: number }).n;
    const emails = (db.prepare(
      `SELECT COUNT(*) AS n FROM outbox_emails WHERE idempotency_key LIKE ?`,
    ).get(`pwchange:${REPEAT_ID}:%`) as { n: number }).n;
    const row = db.prepare('SELECT password_version, password_hash FROM members WHERE id = ?')
      .get(REPEAT_ID) as { password_version: number; password_hash: string };
    db.close();
    return { audits, emails, version: row.password_version, hash: row.password_hash };
  }

  async function post(cookie: string, form: Record<string, string>) {
    return request(createApp()).post(passwordPath).set('Cookie', cookie).type('form').send(form);
  }

  /** Makes the first change and returns the session cookie it issued. */
  async function changeOnce(): Promise<string> {
    const first = await post(repeatCookie(1), changeForm);
    expect(first.status).toBe(303);
    const session = sessionCookieFrom(first);
    expect(session).toBeDefined();
    return session!;
  }

  beforeAll(async () => {
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: REPEAT_ID,
      slug: REPEAT_SLUG,
      login_email: 'pw-repeater@example.com',
      display_name: 'Pw Repeater',
      password_hash: await hashTestPassword(OLD_PASSWORD),
    });
    insertSystemConfig(db, { config_key: 'password_change_rate_limit_max_attempts', value_json: String(MAX_ATTEMPTS) });
    insertSystemConfig(db, { config_key: 'password_change_rate_limit_window_minutes', value_json: String(WINDOW_MINUTES) });
    db.close();
  });

  beforeEach(async () => {
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?')
      .run(await hashTestPassword(OLD_PASSWORD), REPEAT_ID);
    db.close();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Defect caught: a member who re-posts the change form after it landed is
  // told their current password is wrong, or the repeat sends a second
  // "password changed" email, writes a second audit row, issues another session
  // or uses up a password-change attempt.
  it('a re-post with the new session cookie reports the same success and spends nothing', async () => {
    const session = await changeOnce();
    const afterFirst = state();
    expect(afterFirst.version).toBe(2);

    // Well inside the window rather than at its start, so a recognition window
    // shorter than the rate-limit window is caught.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + (WINDOW_MINUTES - 5) * 60_000);
    const repeat = await post(session, changeForm);
    expect(repeat.status).toBe(303);
    expect(repeat.headers.location).toBe(passwordPath);
    expect(sessionCookieFrom(repeat)).toBeUndefined();
    // The same message as the first submit, through the same flash.
    const landed = await request(createApp())
      .get(passwordPath)
      .set('Cookie', [session, flashCookieFrom(repeat)!].join('; '));
    expect(landed.status).toBe(200);
    expect(landed.text).toContain(PASSWORD_CHANGED_BANNER);

    expect(state()).toEqual(afterFirst);

    // The repeat took no slot: with the change holding one of two, a further
    // attempt is still judged on its merits rather than refused.
    const next = await post(session, wrongGuessForm);
    expect(next.status).toBe(422);
    expect(next.text).toContain('Current password is incorrect');
  });

  // Defect caught: recognising a repeat lets an attacker holding the session
  // guess at the current password without the attempts being counted.
  it('a wrong guess after a change still spends a slot', async () => {
    const session = await changeOnce();

    const guess = await post(session, wrongGuessForm);
    expect(guess.status).toBe(422);
    const refused = await post(session, wrongGuessForm);
    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBeDefined();
    expect(state().version).toBe(2);
  });

  // Defect caught: the repeat check runs a submitted secret against the stored
  // hash past a closed bucket, so a locked-out session still gets an answer
  // telling it which new password is the right one.
  it('once the bucket is closed the repeat is refused too, even with the correct new password', async () => {
    const session = await changeOnce();
    const closing = await post(session, wrongGuessForm);
    expect(closing.status).toBe(422);
    const before = state();

    const repeat = await post(session, changeForm);
    expect(repeat.status).toBe(429);
    expect(repeat.headers['retry-after']).toBeDefined();
    expect(flashCookieFrom(repeat)).toBeUndefined();
    expect(state()).toEqual(before);
  });

  // Defect caught: the repeat check tests a submitted new password against the
  // stored hash before the attempt is counted, so a parallel burst from a
  // session holder gets every guess judged, and a right one confirmed, while
  // the bucket has room for only one more attempt.
  it('a parallel burst of guesses after a change is counted before any is judged', async () => {
    await changeOnce();
    const before = state();
    const { identityAccessService } = await import('../../src/services/identityAccessService');
    const { RateLimitedError, ValidationError } = await import('../../src/services/serviceErrors');

    // Started in one synchronous loop, each call runs up to its first await
    // before the next begins: exactly the overlap a burst of requests has
    // while the first guess is still being hashed. The right new password
    // comes last, when the bucket has no room left.
    const guesses = ['Guess!0001', 'Guess!0002', 'Guess!0003', NEW_PASSWORD];
    const outcomes = await Promise.allSettled(
      guesses.map((pw) => identityAccessService.changePassword(REPEAT_ID, OLD_PASSWORD, pw, pw)),
    );

    // The change took one of the two slots, so one guess is judged (and found
    // wrong on its current password) and every later one is refused unjudged,
    // the right one included: it learns nothing.
    const reasons = outcomes.map((o) => (o.status === 'rejected' ? o.reason : o.value));
    expect(reasons[0]).toBeInstanceOf(ValidationError);
    for (const r of reasons.slice(1)) expect(r).toBeInstanceOf(RateLimitedError);
    expect(state()).toEqual(before);
  });

  // Defect caught: two overlapping submits of one change both read the row
  // before either commits; the second loses the version race and is told
  // another session changed the password, and its response carries no new
  // session, so the browser can end up signed out by its own change.
  it('an overlapping double submit reports the change to both and keeps the browser signed in', async () => {
    const adapterMod = await import('../../src/adapters/jwtSigningAdapter');
    const real = adapterMod.getJwtSigningAdapter();
    // Each request signs its replacement session after reading the row and
    // before committing; holding the first signature until the second request
    // arrives there makes the two genuinely overlap on every run.
    let arrived = 0;
    let releaseBoth!: () => void;
    const bothArrived = new Promise<void>((resolve) => { releaseBoth = resolve; });
    adapterMod.setJwtSigningAdapterForTests({
      kid: real.kid,
      signJwt: async (claims, ttlSeconds) => {
        arrived += 1;
        if (arrived === 2) releaseBoth();
        await bothArrived;
        return real.signJwt(claims, ttlSeconds);
      },
      verifyJwt: (token) => real.verifyJwt(token),
    });
    try {
      const before = state();
      const [a, b] = await Promise.all([post(repeatCookie(1), changeForm), post(repeatCookie(1), changeForm)]);
      expect([a.status, b.status]).toEqual([303, 303]);
      const after = state();
      expect(after.version).toBe(2);
      // One change recorded. (The notification's key is per version, and
      // earlier cases here already reached this version, so its count is not
      // this case's evidence; the audit row is.)
      expect(after.audits).toBe(before.audits + 1);

      // Whichever response the browser keeps, its session is the current one.
      for (const res of [a, b]) {
        const session = sessionCookieFrom(res);
        expect(session).toBeDefined();
        const page = await request(createApp()).get(passwordPath).set('Cookie', session!);
        expect(page.status).toBe(200);
      }

      // The twin gave back the slot it took: of two, only the change holds
      // one, so a further attempt is judged rather than refused.
      const next = await post(sessionCookieFrom(a)!, wrongGuessForm);
      expect(next.status).toBe(422);
    } finally {
      adapterMod.resetJwtSigningAdapterForTests();
    }
  });

  // Defect caught: a stale change recognised as a repeat long after it landed
  // gives a session a standing way to confirm the current password without
  // knowing the one it replaced.
  it('a re-post after the window has passed is refused as an incorrect current password', async () => {
    const session = await changeOnce();
    const before = state();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + (WINDOW_MINUTES + 1) * 60_000);

    const late = await post(session, changeForm);
    expect(late.status).toBe(422);
    expect(late.text).toContain('Current password is incorrect');
    expect(state()).toEqual(before);
  });
});
