/**
 * Integration tests for email verification at registration.
 *
 * Exercises the full verify flow: registration enqueues a verify email, the
 * emailed GET /verify/:token opens a page that changes nothing, its button's
 * POST /verify consumes the token and logs the member in, a repeat of that POST
 * reports the first outcome without a session, resend is
 * rate-limited, and unverified members cannot log in and do not appear in
 * authenticated member search.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { expectLoggedError } from '../setup-env';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt, insertSystemConfig } from '../fixtures/factories';
import { assertSecureSessionCookie } from '../fixtures/assertSecureSessionCookie';
import { rowPin, theOnlyRow } from '../fixtures/rowPinning';

const { dbPath } = setTestEnv('3069');

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let sesMod: typeof import('../../src/adapters/sesAdapter');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Searcher: must exist so we can authenticate the search call.
  insertMember(db, { id: 'verify-searcher', slug: 'verify_searcher', login_email: 'searcher@example.com' });
  db.close();
  createApp = await importApp();
  sesMod = await import('../../src/adapters/sesAdapter');
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const stub = sesMod.getStubSesAdapterForTests();
  stub?.clear();
});

// The registration request drains its mail through the stub sender, so the
// verify link is read from what the stub captured. Every case registers under
// its own address, so the address identifies the mail outright and no ordering
// is needed; a case that ever sends two mails to one address is named as such
// instead of quietly handing back whichever one came last.
function tokenFromOutbox(email: string): string {
  const sent = (sesMod.getStubSesAdapterForTests()?.sentMessages ?? []).filter((m) => m.to === email);
  if (sent.length !== 1) throw new Error(`expected one mail to ${email}, found ${sent.length}`);
  const match = sent[0].bodyText.match(/\/verify\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`no verify link in body for ${email}`);
  return match[1];
}

/** The landing page's one button: the POST that spends the token. */
function pressVerify(app: ReturnType<typeof createApp>, token: string) {
  return request(app).post('/verify').type('form').send({ token });
}

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Moves a faked clock just past the minute within which a further verify-email
 * request is the same request submitted twice, so the next one is judged as a
 * new request. The resend rate-limit window is an hour, so this never empties
 * it. Call `vi.useFakeTimers({ toFake: ['Date'] })` first.
 */
function stepPastRepeatWindow(): void {
  vi.setSystemTime(Date.now() + 61_000);
}

function countOutboxTo(email: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_email = ?`,
  ).get(email) as { n: number };
  db.close();
  return row.n;
}

describe('POST /register → check-email + outbox enqueue', () => {
  it('enqueues a verify email with a /verify/:token link', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Verify', familyName: 'Tester',
        email: 'verify-one@example.com',
        password: 'verifypass!1',
        confirmPassword: 'verifypass!1',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');

    // The request drained its mail through the stub sender, so the row is sent
    // and the link is in what the stub captured.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT recipient_email, status FROM outbox_emails WHERE recipient_email = ?`,
    ).get('verify-one@example.com') as { recipient_email: string; status: string };
    db.close();
    expect(row.status).toBe('sent');
    expect(tokenFromOutbox('verify-one@example.com')).toMatch(/^[A-Za-z0-9_-]+$/);

    // Unverified DB state: email_verified_at IS NULL, not in members_searchable.
    const db2 = new BetterSqlite3(dbPath, { readonly: true });
    const m = db2.prepare(
      `SELECT email_verified_at FROM members WHERE login_email_normalized = ?`,
    ).get('verify-one@example.com') as { email_verified_at: string | null };
    const searchable = db2.prepare(
      `SELECT COUNT(*) AS n FROM members_searchable WHERE login_email_normalized = ?`,
    ).get('verify-one@example.com') as { n: number };
    db2.close();
    expect(m.email_verified_at).toBeNull();
    expect(searchable.n).toBe(0);
  });

  it('a repeat registration while the first verify email is still live sends nothing more', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      givenNames: 'Dup', familyName: 'One',
      email: 'verify-dup@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const auditCount = () => {
      const ro = new BetterSqlite3(dbPath, { readonly: true });
      const n = (ro.prepare('SELECT COUNT(*) AS n FROM audit_entries').get() as { n: number }).n;
      ro.close();
      return n;
    };
    const auditBefore = auditCount();

    // The same form submitted again, as a double click or back-button re-post.
    const repeat = await request(app).post('/register').type('form').send({
      givenNames: 'Dup', familyName: 'One',
      email: 'verify-dup@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    // The first outcome, unchanged: the same redirect to check-email.
    expect(repeat.status).toBe(303);
    expect(repeat.headers.location).toBe('/register/check-email');

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const rows = db.prepare(
      `SELECT template_key FROM outbox_emails WHERE recipient_email = ?`,
    ).all('verify-dup@example.com') as Array<{ template_key: string }>;
    const members = db.prepare(
      `SELECT COUNT(*) AS n FROM members WHERE login_email_normalized = ?`,
    ).get('verify-dup@example.com') as { n: number };
    db.close();
    // The first registration's one verification email is the only mail; the
    // repeat sent neither a second link nor an account-exists notice, made no
    // second account, and wrote no audit row.
    expect(rows.map((r) => r.template_key)).toEqual(['account_verify']);
    expect(members.n).toBe(1);
    expect(auditCount()).toBe(auditBefore);
  });

  it('registering an address whose account is already verified still sends the account-exists notice', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      givenNames: 'Dup', familyName: 'Verified',
      email: 'verify-dup-verified@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    await pressVerify(app, tokenFromOutbox('verify-dup-verified@example.com'));

    await request(app).post('/register').type('form').send({
      givenNames: 'Dup', familyName: 'Verified',
      email: 'verify-dup-verified@example.com',
      password: 'anotherpass!2',
      confirmPassword: 'anotherpass!2',
    });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const rows = db.prepare(
      `SELECT template_key FROM outbox_emails WHERE recipient_email = ?`,
    ).all('verify-dup-verified@example.com') as Array<{ template_key: string }>;
    db.close();
    // Sorted: both rows can stamp the same millisecond, so enqueue order is not the claim.
    expect(rows.map((r) => r.template_key).sort()).toEqual(['account_exists_notice', 'account_verify']);
  });
});

describe('GET /verify/:token — the emailed link opens a page that changes nothing', () => {
  it('renders the one-button page carrying the token, spends nothing, and is not cacheable', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      givenNames: 'Verify', familyName: 'Landing',
      email: 'verify-landing@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const token = tokenFromOutbox('verify-landing@example.com');

    // Opened twice, as a mail scanner and then the member would.
    await request(app).get(`/verify/${token}`);
    const res = await request(app).get(`/verify/${token}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Press the button below to confirm your email address.');
    expect(res.text).toContain('action="/verify"');
    expect(res.text).toContain(`value="${token}"`);
    expect(res.text).toContain('Verify My Email');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.get('Set-Cookie')?.some((c) => c.startsWith('__Host-footbag_session=')) ?? false).toBe(false);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const m = db.prepare(
      `SELECT email_verified_at FROM members WHERE login_email_normalized = ?`,
    ).get('verify-landing@example.com') as { email_verified_at: string | null };
    db.close();
    expect(m.email_verified_at).toBeNull();

    // The token is still unspent, so the button works afterwards.
    expect((await pressVerify(app, token)).status).toBe(303);
  });

  it('an unknown token opens the same page: the link reveals nothing about the token', async () => {
    const res = await request(createApp()).get('/verify/bogus-token-landing');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Verify My Email');
  });
});

describe('POST /verify', () => {
  it('consumes valid token → sets email_verified_at, issues session cookie, redirects to the wizard', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      givenNames: 'Verify', familyName: 'Good',
      email: 'verify-good@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const token = tokenFromOutbox('verify-good@example.com');
    const res = await pressVerify(app, token);
    expect(res.status).toBe(303);
    // Post-verify landing is the first outstanding onboarding task.
    expect(res.headers.location).toBe('/register/wizard/personal_details');
    const cookies = res.get('Set-Cookie');
    expect(cookies?.some((c) => c.startsWith('__Host-footbag_session='))).toBe(true);
    assertSecureSessionCookie(res.headers['set-cookie']);
    // A response that establishes a session must not be cacheable.
    expect(res.headers['cache-control']).toMatch(/no-store/);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const m = db.prepare(
      `SELECT id, email_verified_at FROM members WHERE login_email_normalized = ?`,
    ).get('verify-good@example.com') as { id: string; email_verified_at: string | null };
    // Verification is an account-lifecycle transition and leaves an audit row.
    const audit = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries
        WHERE action_type = 'auth.email_verified' AND entity_id = ?`,
    ).get(m.id) as { n: number };
    db.close();
    expect(m.email_verified_at).not.toBeNull();
    expect(audit.n).toBe(1);
  });

  it('a still-valid token consumed after the account is already verified issues a session and still audits', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      givenNames: 'Verify', familyName: 'Already',
      email: 'verify-already@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const token = tokenFromOutbox('verify-already@example.com');

    // The account reaches verified by another route (a second outstanding link
    // redeemed first), leaving this link valid and unused against an account
    // that no longer needs verifying.
    const seed = new BetterSqlite3(dbPath);
    seed.prepare(
      `UPDATE members SET email_verified_at = ? WHERE login_email_normalized = ?`,
    ).run(new Date().toISOString(), 'verify-already@example.com');
    seed.close();

    const res = await pressVerify(app, token);

    // The link still signs the member in, so it is a session issuance and has
    // to be recorded as one. Gating the audit row on the row-changing UPDATE
    // lost exactly this case: nothing changed, so nothing was written, while a
    // session went out with no trail behind it.
    expect(res.status).toBe(303);
    const cookies = res.get('Set-Cookie');
    expect(cookies?.some((c) => c.startsWith('__Host-footbag_session='))).toBe(true);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const m = db.prepare(
      `SELECT id FROM members WHERE login_email_normalized = ?`,
    ).get('verify-already@example.com') as { id: string };
    const rows = db.prepare(
      `SELECT metadata_json FROM audit_entries
        WHERE action_type = 'auth.email_verified' AND entity_id = ?`,
    ).all(m.id) as { metadata_json: string }[];
    db.close();

    expect(rows).toHaveLength(1);
    // Flagged, so the trail does not read as a second account activation.
    expect(JSON.parse(rows[0].metadata_json).alreadyVerified).toBe(true);
  });

  it('a second press of the same link reports the first outcome: verified, sign in, no session, nothing written', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      givenNames: 'Verify', familyName: 'Twice',
      email: 'verify-twice@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const token = tokenFromOutbox('verify-twice@example.com');
    const first = await pressVerify(app, token);
    expect(first.status).toBe(303);

    const counts = () => {
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const audit = (db.prepare('SELECT COUNT(*) AS n FROM audit_entries').get() as { n: number }).n;
      const outbox = (db.prepare('SELECT COUNT(*) AS n FROM outbox_emails').get() as { n: number }).n;
      db.close();
      return { audit, outbox };
    };
    const before = counts();

    const second = await pressVerify(app, token);
    expect(second.status).toBe(200);
    expect(second.text).toContain('Your email is verified. Log in to continue.');
    expect(second.text).toContain('href="/login"');
    expect(second.text).not.toContain('invalid, expired, or already used');
    expect(second.get('Set-Cookie')?.some((c) => c.startsWith('__Host-footbag_session=')) ?? false).toBe(false);
    expect(second.headers['cache-control']).toContain('no-store');
    expect(counts()).toEqual(before);
  });

  it('unknown token → 400 with the generic error', async () => {
    const res = await pressVerify(createApp(), 'bogus-token-xxx');
    expect(res.status).toBe(400);
    expect(res.text).toContain('invalid, expired, or already used');
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('a missing token → 400 with the generic error', async () => {
    const res = await request(createApp()).post('/verify').type('form').send({});
    expect(res.status).toBe(400);
    expect(res.text).toContain('invalid, expired, or already used');
  });
});

describe('POST /verify — the token never reaches a log line', () => {
  it('an unhandled service error logs the URL, which carries no token', async () => {
    const identityAccessMod = await import('../../src/services/identityAccessService');
    const logMod = await import('../../src/config/logger');

    // The suite-wide guard already spies logger.error; re-spying returns
    // that same mock, so the calls inspected here stay visible to the guard
    // and the opt-in marks the deliberate error. A local mockImplementation
    // would swallow the call before the guard sees it.
    expectLoggedError('unhandled error');
    const errorSpy = vi.spyOn(logMod.logger, 'error');
    const verifySpy = vi
      .spyOn(identityAccessMod.identityAccessService, 'verifyEmailByToken')
      .mockRejectedValue(new Error('database connection refused'));

    try {
      const app = createApp();
      const res = await pressVerify(app, 'SECRET_RAW_TOKEN_xyz123');

      expect(res.status).toBe(500);

      const unhandled = errorSpy.mock.calls.find((args) => args[0] === 'unhandled error');
      expect(unhandled).toBeDefined();
      expect(JSON.stringify(unhandled)).not.toContain('SECRET_RAW_TOKEN_xyz123');
    } finally {
      verifySpy.mockRestore();
    }
  });
});

describe('POST /verify — session reissue failure', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let adapterMod: typeof import('../../src/adapters/jwtSigningAdapter');
  let realAdapter: import('../../src/adapters/jwtSigningAdapter').JwtSigningAdapter;

  beforeAll(async () => {
    adapterMod = await import('../../src/adapters/jwtSigningAdapter');
    realAdapter = adapterMod.getJwtSigningAdapter();
  });

  afterEach(() => {
    adapterMod.resetJwtSigningAdapterForTests();
  });

  it('signJwt failure after verification commit → 503, no Set-Cookie, email is verified, login with registration password still works', async () => {
    expectLoggedError('email verify: session issue failed');
    const app = createApp();
    await request(app).post('/register').type('form').send({
      givenNames: 'Verify', familyName: 'KmsFail',
      email: 'verify-kmsfail@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const token = tokenFromOutbox('verify-kmsfail@example.com');

    adapterMod.setJwtSigningAdapterForTests({
      kid: realAdapter.kid,
      signJwt: async () => {
        const err = new Error('KMS Sign failed: AccessDeniedException');
        err.name = 'KMSAccessDenied';
        throw err;
      },
      verifyJwt: (t) => realAdapter.verifyJwt(t),
    });

    const res = await pressVerify(app, token);

    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.text).toContain('email is verified');
    expect(res.text).toContain('could not sign you in');
    expect(res.text).toContain('Sign In');

    const cookies = res.get('Set-Cookie');
    const sessionCookieIssued = cookies?.some((c) =>
      c.startsWith('__Host-footbag_session=') &&
      !c.match(/Max-Age=0|Expires=Thu, 01 Jan 1970/i),
    );
    expect(sessionCookieIssued).toBeFalsy();

    // Verification was committed: email_verified_at is set despite the
    // failed signing.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const m = db.prepare(
      `SELECT id, email_verified_at FROM members WHERE login_email_normalized = ?`,
    ).get('verify-kmsfail@example.com') as { id: string; email_verified_at: string | null };
    // The onboarding checklist commits with the verification, so a member who
    // signs in afterwards finds it there although this request issued no session.
    const tasks = (db.prepare(
      `SELECT COUNT(*) AS c FROM member_onboarding_tasks WHERE member_id = ? AND state = 'pending'`,
    ).get(m.id) as { c: number }).c;
    db.close();
    expect(m.email_verified_at).not.toBeNull();
    expect(tasks).toBe(3);

    // A replay of the consumed token reports the first outcome: verified, sign in.
    const replay = await pressVerify(app, token);
    expect(replay.status).toBe(200);
    expect(replay.text).toContain('Your email is verified. Log in to continue.');

    // Simulate KMS recovery: the registration password still works at /login.
    adapterMod.resetJwtSigningAdapterForTests();
    const login = await request(app).post('/login').type('form').send({
      email: 'verify-kmsfail@example.com',
      password: 'verifypass!1',
    });
    expect(login.status).toBe(303);
  });
});

describe('Unverified login is rejected', () => {
  it('an unverified member cannot log in', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      givenNames: 'Verify', familyName: 'Blocked',
      email: 'verify-blocked@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const res = await request(app).post('/login').type('form').send({
      email: 'verify-blocked@example.com',
      password: 'verifypass!1',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid email or password. Please try again.');
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /verify/resend', () => {
  it('issues a new verify email for an unverified member and rate-limits after 3 per hour', async () => {
    const app = createApp();
    vi.useFakeTimers({ toFake: ['Date'] });
    await request(app).post('/register').type('form').send({
      givenNames: 'Resend', familyName: 'Tester',
      email: 'resend@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    // First outbox row is the registration email.
    expect(countOutboxTo('resend@example.com')).toBe(1);
    // Each resend a minute after the last, so none is a repeat and each mails.
    for (let i = 0; i < 3; i++) {
      stepPastRepeatWindow();
      const r = await request(app).post('/verify/resend').type('form').send({ email: 'resend@example.com' });
      expect(r.status).toBe(200);
      expect(countOutboxTo('resend@example.com')).toBe(2 + i);
    }
    // After 3 allowed resends the bucket is at its limit; the 4th doesn't enqueue.
    stepPastRepeatWindow();
    const blocked = await request(app).post('/verify/resend').type('form').send({ email: 'resend@example.com' });
    // Identical response (200 check-email) either way — anti-enumeration.
    expect(blocked.status).toBe(200);
    expect(countOutboxTo('resend@example.com')).toBe(4);
  });

  // Defect caught: a double click or re-post of the resend form mails a second
  // verify link, or the repeat stops counting against the bucket and so
  // becomes a free probe of which addresses await verification.
  it('a resend repeated within seconds mails once, yet every request counts against the bucket', async () => {
    const app = createApp();
    const email = 'resend-twice@example.com';
    vi.useFakeTimers({ toFake: ['Date'] });
    await request(app).post('/register').type('form').send({
      givenNames: 'Resend', familyName: 'Twice',
      email,
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    stepPastRepeatWindow();
    // Twenty seconds apart, so the last repeat lands forty seconds after the
    // first resend: still the same request, not a new one.
    for (let i = 0; i < 3; i++) {
      const r = await request(app).post('/verify/resend').type('form').send({ email });
      expect(r.status).toBe(200);
      expect(r.text).toContain('new verification link has been sent');
      vi.setSystemTime(Date.now() + 20_000);
    }
    // The registration email plus one resend.
    expect(countOutboxTo(email)).toBe(2);

    // Past the repeat window a resend would mail again, but the three above
    // filled the bucket, so this one is refused all the same.
    stepPastRepeatWindow();
    const fourth = await request(app).post('/verify/resend').type('form').send({ email });
    expect(fourth.status).toBe(200);
    expect(countOutboxTo(email)).toBe(2);
  });

  it('renders identical check-email page when the email does not match any member', async () => {
    const app = createApp();
    const res = await request(app).post('/verify/resend').type('form').send({
      email: 'never-existed@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('new verification link has been sent');
  });

  it('same status and non-revealing banner whether or not the email matches an unverified member', async () => {
    const app = createApp();
    // Seed a fresh unverified member; use an email distinct from the
    // resend-rate-limit tests above so the per-email bucket is unused.
    await request(app).post('/register').type('form').send({
      givenNames: 'Resend', familyName: 'Equivalence',
      email: 'resend-equiv-exists@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const existsRes = await request(app).post('/verify/resend').type('form')
      .send({ email: 'resend-equiv-exists@example.com' });
    const notExistsRes = await request(app).post('/verify/resend').type('form')
      .send({ email: 'resend-equiv-never@example.com' });
    expect(existsRes.status).toBe(notExistsRes.status);
    // The banner never states whether an account exists. Under the stub adapter
    // the dev card intentionally shows the submitter's own verify link when an
    // unverified account exists, so full byte-identity is the production
    // guarantee, verified under the live adapter in the anti-enumeration prod
    // sibling suite.
    expect(existsRes.text).toContain('new verification link has been sent');
    expect(notExistsRes.text).toContain('new verification link has been sent');
  });

  it('verify resend rate limit is tunable via system_config_current', async () => {
    // Lower the bucket to 2 via system_config; the 3rd resend should not enqueue.
    const tuneDb = new BetterSqlite3(dbPath);
    insertSystemConfig(tuneDb, {
      config_key: 'verify_resend_rate_limit_max_attempts',
      value_json: '2',
      created_at: '2026-05-22T00:00:00.000Z',
    });
    tuneDb.close();
    try {
      const TUNE_EMAIL = 'verify-resend-tunable@example.com';
      const app = createApp();
      vi.useFakeTimers({ toFake: ['Date'] });
      // Register a fresh unverified member; the registration creates the first
      // outbox row. The per-email bucket for /verify/resend is unused.
      await request(app).post('/register').type('form').send({
        givenNames: 'Verify', familyName: 'Resend Tunable',
        email: TUNE_EMAIL,
        password: 'verifypass!1',
        confirmPassword: 'verifypass!1',
      });
      // 2 resends are allowed under the configured cap. Each comes a minute
      // after the last, so none is a repeat and each one mails.
      for (let i = 0; i < 2; i++) {
        stepPastRepeatWindow();
        const r = await request(app).post('/verify/resend').type('form').send({ email: TUNE_EMAIL });
        expect(r.status).toBe(200);
      }
      const before = countOutboxTo(TUNE_EMAIL);
      expect(before).toBe(3);
      // Bucket is at 2 (= configured limit); the 3rd resend is blocked
      // (anti-enumeration: response is still 200, but no new outbox row).
      stepPastRepeatWindow();
      const blocked = await request(app).post('/verify/resend').type('form').send({ email: TUNE_EMAIL });
      expect(blocked.status).toBe(200);
      expect(countOutboxTo(TUNE_EMAIL)).toBe(before);
    } finally {
      // Restore the platform default so later tests see 3/attempt.
      const restoreDb = new BetterSqlite3(dbPath);
      insertSystemConfig(restoreDb, {
        config_key: 'verify_resend_rate_limit_max_attempts',
        value_json: '3',
        created_at: '2026-05-22T00:00:01.000Z',
        reason_text: 'Test restore',
      });
      restoreDb.close();
    }
  });
});

describe('POST /verify/resend — verify-email enqueue failure', () => {
  // Anti-enumeration: a registered-but-unverified email and an unknown email
  // must return identical UX. On outbox/SES degradation resendVerifyEmail
  // swallows the enqueue failure (recording auth.register_notification_failed
  // for operator triage) and returns void, so the route renders 200 in both
  // branches, matching requestPasswordReset. A status that differed by account
  // existence would leak which emails are pending verification.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let commsMod: typeof import('../../src/services/communicationService');

  beforeAll(async () => {
    commsMod = await import('../../src/services/communicationService');
  });

  afterEach(() => {
    commsMod.resetCommunicationServiceForTests();
  });

  it('enqueueEmailOrFail throws → 200 + audit row (anti-enumeration; recovers after outbox heals)', async () => {
    expectLoggedError('audit: auth.register_notification_failed');
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');

    // Seed a fresh unverified member through a real registration first, while
    // comms is still healthy; otherwise the registration itself 503s.
    const app = createApp();
    const targetEmail = 'resend-enqueue-fail@example.com';
    vi.useFakeTimers({ toFake: ['Date'] });
    const registerRes = await request(app).post('/register').type('form').send({
      givenNames: 'Resend', familyName: 'Fail',
      email: targetEmail,
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    expect(registerRes.status).toBe(303);
    // A resend within a minute of the registration email is the same request
    // again and issues nothing, so the resend under test comes later.
    stepPastRepeatWindow();

    // Now break the enqueue path and exercise the resend flow.
    commsMod.setCommunicationServiceForTests({
      enqueue: () => {
        throw new ServiceUnavailableError('synthetic enqueue failure for verify-resend');
      },
      liftAddressSuppression: async () => {},
      processSendQueue: async () => ({
        claimed: 0, sent: 0, failed: 0, deadLettered: 0, manualReview: 0, paused: false,
        suppressed: 0, bulkHalted: false, bulkPaused: false,
      }),
    });

    const res = await request(app).post('/verify/resend').type('form').send({ email: targetEmail });
    expect(res.status).toBe(200);

    // Audit row records the failure for operator triage.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const member = db.prepare(
      `SELECT id FROM members WHERE login_email_normalized = ?`,
    ).get(targetEmail) as { id: string } | undefined;
    // The address is unique to this case, so its member registers once and fails
    // once; the member and action type identify the row without an ordering.
    const auditRow = member ? theOnlyRow<{ action_type: string }>(
      db,
      rowPin(
        'audit_entries',
        `entity_id = ? AND action_type = 'auth.register_notification_failed'`,
        [member.id],
      ),
    ) : undefined;
    db.close();
    expect(auditRow).toBeDefined();
  });

  // Defect caught: a registration whose verification email never reached the
  // outbox leaves a live token behind, and the member's immediate retry is
  // taken for a double submit, so nothing at all is sent to them for a day.
  it('a registration retried after its verification email failed to queue still sends', async () => {
    expectLoggedError('audit: auth.register_notification_failed');
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    const app = createApp();
    const targetEmail = 'register-retry-after-fail@example.com';
    const form = {
      givenNames: 'Retry', familyName: 'Sender', email: targetEmail,
      password: 'verifypass!1', confirmPassword: 'verifypass!1',
    };

    commsMod.setCommunicationServiceForTests({
      enqueue: () => {
        throw new ServiceUnavailableError('synthetic enqueue failure for registration');
      },
      liftAddressSuppression: async () => {},
      processSendQueue: async () => ({
        claimed: 0, sent: 0, failed: 0, deadLettered: 0, manualReview: 0, paused: false,
        suppressed: 0, bulkHalted: false, bulkPaused: false,
      }),
    });
    await request(app).post('/register').type('form').send(form);
    commsMod.resetCommunicationServiceForTests();

    const retry = await request(app).post('/register').type('form').send(form);
    expect(retry.status).toBe(303);
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const queued = db.prepare(
      `SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_email = ?`,
    ).get(targetEmail) as { n: number };
    db.close();
    expect(queued.n).toBe(1);
  });

  it('issueToken throws (token-store failure) → 200 + audit row (token-issue path is audited, not silently swallowed)', async () => {
    expectLoggedError('audit: auth.register_notification_failed');
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    const tokenSvc = await import('../../src/services/accountTokenService');

    // Seed a fresh unverified member while comms + token store are healthy
    // (registration itself would 503 otherwise).
    const app = createApp();
    const targetEmail = 'resend-token-fail@example.com';
    vi.useFakeTimers({ toFake: ['Date'] });
    const registerRes = await request(app).post('/register').type('form').send({
      givenNames: 'Resend', familyName: 'Token Fail',
      email: targetEmail,
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    expect(registerRes.status).toBe(303);
    // A resend within a minute of the registration email is the same request
    // again and issues nothing, so the resend under test comes later.
    stepPastRepeatWindow();

    // Break token issuance — the DB write that runs *before* the enqueue. A regression
    // here would swallow it silently (200, no audit) because resendVerifyEmail catches
    // for anti-enumeration; the fix moved issuance inside the audited try.
    const spy = vi
      .spyOn(tokenSvc.accountTokenService, 'issueToken')
      .mockImplementation(() => {
        throw new ServiceUnavailableError('synthetic token-store failure for verify-resend');
      });
    try {
      const res = await request(app).post('/verify/resend').type('form').send({ email: targetEmail });
      // Anti-enumeration: swallowed → 200, identical to the unknown-email branch.
      expect(res.status).toBe(200);
    } finally {
      spy.mockRestore();
    }

    // ...but the failure is recorded for operator triage, not silently dropped.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const member = db.prepare(
      `SELECT id FROM members WHERE login_email_normalized = ?`,
    ).get(targetEmail) as { id: string } | undefined;
    // The address is unique to this case, so its member registers once and fails
    // once; the member and action type identify the row without an ordering.
    const auditRow = member ? theOnlyRow<{ action_type: string }>(
      db,
      rowPin(
        'audit_entries',
        `entity_id = ? AND action_type = 'auth.register_notification_failed'`,
        [member.id],
      ),
    ) : undefined;
    db.close();
    expect(auditRow).toBeDefined();
  });
});

describe('Authenticated member search excludes unverified rows', () => {
  it('an unverified member is not in members_searchable and not in member search', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      givenNames: 'Shadow', familyName: 'Figure',
      email: 'shadow-figure@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });

    const cookie = `__Host-footbag_session=${createTestSessionJwt({ memberId: 'verify-searcher' })}`;
    const res = await request(app).get('/members/verify_searcher?q=Shadow').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Shadow Figure');
  });
});

describe('email_verify token TTL honors system_config', () => {
  it('uses email_verify_expiry_hours override for both the token expiry and the email copy', async () => {
    const app = createApp();
    // Override the seeded 24h with 48h. effective_start_at is "now" so
    // system_config_current selects it over the schema seed.
    const wdb = new BetterSqlite3(dbPath);
    insertSystemConfig(wdb, {
      config_key: 'email_verify_expiry_hours',
      value_json: '48',
      created_at: '2026-06-03T00:00:00.000Z',
      reason_text: 'TTL test tunable',
    });
    wdb.close();
    try {
      const email = 'ttl-config@example.com';
      const res = await request(app).post('/register').type('form').send({
        givenNames: 'Ttl', familyName: 'Configtester',
        email,
        password: 'verifypass!1',
        confirmPassword: 'verifypass!1',
      });
      expect(res.status).toBe(303);

      // One registration under an address unique to this case, so one verify
      // token and one mail. Both are identified by the address rather than by
      // which was written last.
      const rdb = new BetterSqlite3(dbPath, { readonly: true });
      const tok = theOnlyRow<{ issued_at: string; expires_at: string }>(
        rdb,
        rowPin(
          'account_tokens',
          `member_id = (SELECT id FROM members WHERE login_email_normalized = ?)
             AND token_type = 'email_verify'`,
          [email],
        ),
      );
      rdb.close();
      const sent = (sesMod.getStubSesAdapterForTests()?.sentMessages ?? []).filter((m) => m.to === email);
      expect(sent).toHaveLength(1);

      const diffHours =
        (new Date(tok.expires_at).getTime() - new Date(tok.issued_at).getTime()) / 3_600_000;
      expect(Math.round(diffHours)).toBe(48);
      expect(sent[0].bodyText).toContain('expires in 48 hours');
    } finally {
      // system_config is append-only (DELETE is trigger-blocked), so restore the
      // 24h default by appending a later-effective override.
      const cdb = new BetterSqlite3(dbPath);
      insertSystemConfig(cdb, {
        config_key: 'email_verify_expiry_hours',
        value_json: '24',
        created_at: '2026-06-03T00:00:01.000Z',
        reason_text: 'TTL test restore',
      });
      cdb.close();
    }
  });
});
