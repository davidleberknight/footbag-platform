/**
 * Integration tests for the password-reset flow + confirmation emails.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { expectLoggedError } from '../setup-env';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt, insertSystemConfig } from '../fixtures/factories';
import { assertSecureSessionCookie } from '../fixtures/assertSecureSessionCookie';
import { rowPin, snapshotIds, oneRowAddedSince, theOnlyRow } from '../fixtures/rowPinning';

const { dbPath } = setTestEnv('3070');

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID       = 'pwreset-member-001';
const MEMBER_SLUG     = 'pwreset_member';
const MEMBER_EMAIL    = 'pwreset-member@example.com';
const ORIGINAL_PASSWORD = 'OrigPass!1';
const NEW_PASSWORD    = 'BrandNew!2';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const hash = await hashTestPassword(ORIGINAL_PASSWORD);
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    login_email: MEMBER_EMAIL,
    display_name: 'Pw Reset Member',
    password_hash: hash,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  // Rewind per-test: password restored, password_version=1, outbox empty,
  // account_tokens empty. Keeps each test hermetic.
  const db = new BetterSqlite3(dbPath);
  const hash = await hashTestPassword(ORIGINAL_PASSWORD);
  db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?').run(hash, MEMBER_ID);
  db.prepare('DELETE FROM outbox_emails').run();
  db.prepare('DELETE FROM account_tokens').run();
  db.close();
  // The stub adapter's captured mail outlives each test, and the dev card sorts it by wall-clock
  // time; clearing it leaves only this test's reset link on the page, whatever the clock does.
  (await import('../../src/adapters/sesAdapter')).getStubSesAdapterForTests()?.clear();
});

/**
 * Extracts the just-sent reset token from the rendered sent page. On a dev or
 * staging host (stub adapter) the sent page renders the reset link in the
 * simulated-email card, scoped to the submitted address, so the page itself is
 * the source of the token URL. The enqueued outbox row's body is scrubbed once
 * the drain sends it, so the DB row is no longer the authoritative source.
 */
function tokenFromResetPage(html: string): string {
  const match = html.match(/\/password\/reset\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error('no reset link rendered in the simulated-email card');
  return match[1];
}

async function issueAndExtractResetToken(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const res = await request(app).post('/password/forgot').type('form').send({ email });
  expect(res.status).toBe(200);
  return tokenFromResetPage(res.text);
}

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Moves the faked clock just past the span within which a second request is
 * the same request submitted twice (a minute), so the next request is judged
 * as a new one. The rate-limit window is an hour, so this never empties it.
 */
function stepPastRepeatWindow(): void {
  vi.setSystemTime(Date.now() + 61_000);
}

function countResetTokensFor(memberId: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM account_tokens WHERE member_id = ? AND token_type = 'password_reset'`,
  ).get(memberId) as { n: number };
  db.close();
  return row.n;
}

function countOutboxFor(email: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(
    'SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_email = ?',
  ).get(email) as { n: number };
  db.close();
  return row.n;
}

describe('POST /password/forgot', () => {
  it('existing member → enqueues a reset email + renders generic "sent" page', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/password/forgot')
      .type('form')
      .send({ email: MEMBER_EMAIL });
    expect(res.status).toBe(200);
    expect(res.text).toContain('If an account exists');
    expect(countOutboxFor(MEMBER_EMAIL)).toBe(1);
  });

  it('renders the reset link in the dev card scoped to the submitter under the stub adapter', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/password/forgot')
      .type('form')
      .send({ email: MEMBER_EMAIL });
    expect(res.status).toBe(200);
    // On a dev or staging host the sent page shows the reset link so a tester
    // completes the reset on the page itself. The card is scoped to the address
    // the visitor submitted.
    expect(res.text).toContain('Simulated Email (Dev)');
    expect(res.text).toContain(MEMBER_EMAIL);
    expect(res.text).toMatch(/\/password\/reset\/[A-Za-z0-9_-]+">CLICK THIS LINK</);
  });

  it('renders no reset link for an unknown email (nothing was enqueued, so the dev card stays empty)', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/password/forgot')
      .type('form')
      .send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    // Anti-enumeration is visible even in stub mode: no account, no enqueue, no
    // link. In production the whole card is gone (covered in the prod sibling).
    expect(res.text).not.toMatch(/\/password\/reset\/[A-Za-z0-9_-]+">CLICK THIS LINK</);
  });

  it('unknown email → identical generic response, no outbox row', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/password/forgot')
      .type('form')
      .send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('If an account exists');
    expect(countOutboxFor('nobody@example.com')).toBe(0);
  });

  it('rate-limits after 5 requests per email per hour', async () => {
    const app = createApp();
    // Each request is a minute apart, so none is the same request submitted
    // twice and each one mails a fresh link.
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let i = 0; i < 5; i++) {
      await request(app).post('/password/forgot').type('form').send({ email: MEMBER_EMAIL });
      stepPastRepeatWindow();
    }
    const before = countOutboxFor(MEMBER_EMAIL);
    expect(before).toBe(5);
    const blocked = await request(app).post('/password/forgot').type('form').send({ email: MEMBER_EMAIL });
    // Identical UX — still 200 with the generic "sent" page.
    expect(blocked.status).toBe(200);
    // But no new outbox row.
    expect(countOutboxFor(MEMBER_EMAIL)).toBe(before);
  });

  // Defect caught: a double click or back-button re-post of the forgot form
  // mails a second reset link (two live links, two emails), or the repeat
  // stops counting against the bucket and so becomes a free probe.
  it('a request repeated within seconds issues no second link, yet every request counts against the bucket', async () => {
    const app = createApp();
    vi.useFakeTimers({ toFake: ['Date'] });
    // Ten seconds apart, so the last repeat lands forty seconds after the
    // first request: still the same request, not a new one.
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/password/forgot').type('form').send({ email: MEMBER_EMAIL });
      expect(r.status).toBe(200);
      expect(r.text).toContain('If an account exists');
      vi.setSystemTime(Date.now() + 10_000);
    }
    expect(countOutboxFor(MEMBER_EMAIL)).toBe(1);
    expect(countResetTokensFor(MEMBER_ID)).toBe(1);

    // Past the repeat window a request would mail again, but the five above
    // filled the bucket, so this one is refused all the same.
    stepPastRepeatWindow();
    const sixth = await request(app).post('/password/forgot').type('form').send({ email: MEMBER_EMAIL });
    expect(sixth.status).toBe(200);
    expect(countOutboxFor(MEMBER_EMAIL)).toBe(1);
    expect(countResetTokensFor(MEMBER_ID)).toBe(1);
  });

  // Defect caught: one member's fresh reset email is taken for another
  // member's repeat, so a request from anyone silences everyone else's reset
  // mail for a minute.
  it("another member's request seconds earlier does not stop this member's link", async () => {
    const otherEmail = 'pwreset-neighbour@example.com';
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id: 'pwreset-neighbour-001', slug: 'pwreset_neighbour', login_email: otherEmail, display_name: 'Pw Neighbour' });
    db.close();
    const app = createApp();
    await request(app).post('/password/forgot').type('form').send({ email: otherEmail });
    expect(countOutboxFor(otherEmail)).toBe(1);

    const mine = await request(app).post('/password/forgot').type('form').send({ email: MEMBER_EMAIL });
    expect(mine.status).toBe(200);
    expect(countOutboxFor(MEMBER_EMAIL)).toBe(1);
  });

  // Defect caught: a link already used to reset the password still counts as
  // the email on its way, so a member asking again straight after a reset is
  // sent nothing.
  it('a request straight after the last link was used mails a fresh one', async () => {
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    const reset = await request(app).post(`/password/reset/${token}`).type('form')
      .send({ newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(reset.status).toBe(303);
    const resetMails = rowPin('outbox_emails', `recipient_email = ? AND idempotency_key LIKE 'pwreset:%'`, [MEMBER_EMAIL]);
    const snapDb = new BetterSqlite3(dbPath, { readonly: true });
    const before = snapshotIds(snapDb, resetMails);
    snapDb.close();

    const again = await request(app).post('/password/forgot').type('form').send({ email: MEMBER_EMAIL });
    expect(again.status).toBe(200);
    const after = new BetterSqlite3(dbPath, { readonly: true });
    expect(oneRowAddedSince(after, resetMails, before)).toBeDefined();
    after.close();
  });
  it('password-forgot rate limit is tunable via system_config_current', async () => {
    // Lower the bucket to 2 via system_config; the 3rd request should not enqueue.
    const tuneDb = new BetterSqlite3(dbPath);
    insertSystemConfig(tuneDb, {
      config_key: 'password_reset_rate_limit_max_attempts',
      value_json: '2',
      created_at: '2026-05-22T00:00:00.000Z',
    });
    tuneDb.close();
    try {
      // Seed a fresh verified member so the per-email bucket is unused and the
      // success path enqueues an outbox row we can count.
      const TUNE_EMAIL = 'pwreset-tunable@example.com';
      const TUNE_ID = 'pwreset-tunable-001';
      const TUNE_SLUG = 'pwreset_tunable';
      const seedDb = new BetterSqlite3(dbPath);
      const hash = await hashTestPassword(ORIGINAL_PASSWORD);
      insertMember(seedDb, {
        id: TUNE_ID,
        slug: TUNE_SLUG,
        login_email: TUNE_EMAIL,
        display_name: 'Pw Reset Tunable',
        password_hash: hash,
      });
      seedDb.close();
      const app = createApp();
      // 2 requests are allowed under the configured cap; each enqueues a row.
      // They are a minute apart, so neither is a repeat of the other.
      vi.useFakeTimers({ toFake: ['Date'] });
      for (let i = 0; i < 2; i++) {
        const r = await request(app).post('/password/forgot').type('form').send({ email: TUNE_EMAIL });
        expect(r.status).toBe(200);
        stepPastRepeatWindow();
      }
      const before = countOutboxFor(TUNE_EMAIL);
      expect(before).toBe(2);
      // Bucket is at 2 (= configured limit); the 3rd request is blocked
      // (anti-enumeration: response is still 200, but no new outbox row).
      const blocked = await request(app).post('/password/forgot').type('form').send({ email: TUNE_EMAIL });
      expect(blocked.status).toBe(200);
      expect(countOutboxFor(TUNE_EMAIL)).toBe(before);
    } finally {
      // Restore the platform default so later tests see 5/attempt.
      const restoreDb = new BetterSqlite3(dbPath);
      insertSystemConfig(restoreDb, {
        config_key: 'password_reset_rate_limit_max_attempts',
        value_json: '5',
        created_at: '2026-05-22T00:00:01.000Z',
        reason_text: 'Test restore',
      });
      restoreDb.close();
    }
  });
});

describe('POST /password/reset/:token', () => {
  it('valid token + matching passwords → 303 to /members/:slug, reissues session cookie, new password works, password_version bumped', async () => {
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);

    const res = await request(app)
      .post(`/password/reset/${token}`)
      .type('form')
      .send({ newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${MEMBER_SLUG}`);
    const cookies = res.get('Set-Cookie');
    expect(cookies?.some((c) => c.startsWith('__Host-footbag_session='))).toBe(true);
    assertSecureSessionCookie(res.headers['set-cookie']);
    // A response that establishes a session must not be cacheable.
    expect(res.headers['cache-control']).toMatch(/no-store/);

    // DB: password_version should be 2.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT password_version FROM members WHERE id=?').get(MEMBER_ID) as
      | { password_version: number }
      | undefined;
    db.close();
    expect(row!.password_version).toBe(2);

    // Confirmation email enqueued.
    expect(countOutboxFor(MEMBER_EMAIL)).toBeGreaterThanOrEqual(2);

    // Log in with NEW_PASSWORD succeeds.
    const login = await request(app).post('/login').type('form').send({
      email: MEMBER_EMAIL, password: NEW_PASSWORD,
    });
    expect(login.status).toBe(303);
    // Log in with ORIGINAL_PASSWORD fails.
    const oldLogin = await request(app).post('/login').type('form').send({
      email: MEMBER_EMAIL, password: ORIGINAL_PASSWORD,
    });
    expect(oldLogin.status).toBe(200);
    expect(oldLogin.text).toContain('Invalid email or password. Please try again.');
  });

  it('token is single-use: a second submit reports the first outcome, changes nothing, and signs nobody in', async () => {
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    const first = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
    });
    expect(first.status).toBe(303);
    const versionAfterFirst = (() => {
      const ro = new BetterSqlite3(dbPath, { readonly: true });
      const v = (ro.prepare('SELECT password_version FROM members WHERE id=?').get(MEMBER_ID) as { password_version: number }).password_version;
      ro.close();
      return v;
    })();

    const second = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
    });
    expect(second.status).toBe(200);
    expect(second.text).toContain('Your password has been reset. Log in with your new password.');
    expect(second.text).toContain('href="/login"');
    expect(second.text).not.toContain('invalid, expired, or already used');
    expect(second.get('Set-Cookie')?.some((c) => c.startsWith('__Host-footbag_session=')) ?? false).toBe(false);
    expect(second.headers['cache-control']).toMatch(/no-store/);

    // The repeat set nothing.
    const ro = new BetterSqlite3(dbPath, { readonly: true });
    const v = (ro.prepare('SELECT password_version FROM members WHERE id=?').get(MEMBER_ID) as { password_version: number }).password_version;
    ro.close();
    expect(v).toBe(versionAfterFirst);
  });

  // Defect caught: a reopened spent link took a different password, said it had
  // been reset, and kept the first one, so the member was told a password works
  // that never did.
  it('a different password on a spent link is not a repeat: the invalid-link answer, and the first password stands', async () => {
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    const first = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
    });
    expect(first.status).toBe(303);

    const other = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: 'Another!3', confirmPassword: 'Another!3',
    });
    expect(other.status).toBe(422);
    expect(other.text).toContain('invalid, expired, or already used');
    expect(other.text).not.toContain('Your password has been reset');

    const withOther = await request(app).post('/login').type('form').send({ email: MEMBER_EMAIL, password: 'Another!3' });
    expect(withOther.status).toBe(200);   // refused: the login page re-renders
    const withFirst = await request(app).post('/login').type('form').send({ email: MEMBER_EMAIL, password: NEW_PASSWORD });
    expect(withFirst.status).toBe(303);
  });

  // Defect caught: comparing a submitted password with the stored hash makes a
  // spent link an unlimited way to test guesses at the member's current password.
  it('guesses on a spent link are rate-limited: once the limit is spent, even the right password gets the invalid-link answer', async () => {
    const rlMod = await import('../../src/services/rateLimitService');
    rlMod.resetRateLimitForTests();
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    expect((await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
    })).status).toBe(303);

    const guess = (pw: string) => request(app).post(`/password/reset/${token}`).type('form')
      .send({ newPassword: pw, confirmPassword: pw });

    // The default limit is 10 attempts per window, one per submit. Nine wrong
    // guesses leave the tenth attempt for the right password, which is still
    // recognised; the tenth wrong guess closes the window for it.
    for (let i = 0; i < 9; i += 1) await guess(`Wrong!guess${i}`);
    expect((await guess(NEW_PASSWORD)).status).toBe(200);   // refunded, so the window still has one left
    await guess('Wrong!guess9');
    const right = await guess(NEW_PASSWORD);
    expect(right.status).toBe(422);
    expect(right.text).toContain('invalid, expired, or already used');
    rlMod.resetRateLimitForTests();
  });

  // Defect caught: a recognised repeat that keeps its rate-limit slot turns a
  // member's own re-posts into the invalid-link page once they pass the limit.
  it("a member's own repeats give their rate-limit slot back: more of them than the limit all report the reset", async () => {
    const rlMod = await import('../../src/services/rateLimitService');
    rlMod.resetRateLimitForTests();
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    const send = () => request(app).post(`/password/reset/${token}`).type('form')
      .send({ newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect((await send()).status).toBe(303);
    for (let i = 0; i < 12; i += 1) {
      const repeat = await send();
      expect(repeat.status, `repeat ${i + 1}`).toBe(200);
    }
    rlMod.resetRateLimitForTests();
  });

  // Defect caught: a captcha token is single-use, so a re-post of a reset that
  // already landed carries a spent one; checked first, it shows the captcha
  // error to a member whose password was in fact reset.
  it('a re-post carrying a spent captcha token still reports the first outcome', async () => {
    const { STUB_CAPTCHA_FAIL_TOKEN } = await import('../../src/adapters/captchaAdapter');
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    const first = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
    });
    expect(first.status).toBe(303);

    const repeat = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
      'cf-turnstile-response': STUB_CAPTCHA_FAIL_TOKEN,
    });
    expect(repeat.status).toBe(200);
    expect(repeat.text).toContain('Your password has been reset. Log in with your new password.');
    expect(repeat.get('Set-Cookie')?.some((c) => c.startsWith('__Host-footbag_session=')) ?? false).toBe(false);
  });

  // Defect caught: two overlapping submits of one reset both pass the
  // already-reset check before either consumes the link; the second then meets
  // the consumed link and is told it is invalid, though its reset landed.
  it('an overlapping double submit reports the reset to both', async () => {
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    const form = { newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };
    const [a, b] = await Promise.all([
      request(app).post(`/password/reset/${token}`).type('form').send(form),
      request(app).post(`/password/reset/${token}`).type('form').send(form),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 303]);
    const repeat = a.status === 200 ? a : b;
    expect(repeat.text).toContain('Your password has been reset. Log in with your new password.');
    expect(repeat.text).not.toContain('invalid, expired, or already used');
  });

  it('token issued before the member was marked deceased no longer consumes: 422, password unchanged, no session cookie', async () => {
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET is_deceased=1 WHERE id=?').run(MEMBER_ID);
    db.close();
    try {
      const res = await request(app).post(`/password/reset/${token}`).type('form').send({
        newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
      });
      expect(res.status).toBe(422);
      expect(res.text).toContain('invalid, expired, or already used');
      const cookies = res.get('Set-Cookie');
      expect(cookies?.some((c) => c.startsWith('__Host-footbag_session='))).toBeFalsy();
      const ro = new BetterSqlite3(dbPath, { readonly: true });
      const row = ro.prepare('SELECT password_version FROM members WHERE id=?').get(MEMBER_ID) as
        | { password_version: number }
        | undefined;
      ro.close();
      expect(row!.password_version).toBe(1);
    } finally {
      const restore = new BetterSqlite3(dbPath);
      restore.prepare('UPDATE members SET is_deceased=0 WHERE id=?').run(MEMBER_ID);
      restore.close();
    }
  });

  it('mismatched passwords → 422', async () => {
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    const res = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: 'Different!4',
    });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Passwords do not match');
  });

  it('GET /password/reset/:token sends Cache-Control: no-store (token must not be cached)', async () => {
    const app = createApp();
    const res = await request(app).get('/password/reset/any-token-string');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.headers['pragma']).toBe('no-cache');
  });

  it('POST /password/reset/:token 422 sends Cache-Control: no-store (token in re-rendered HTML must not be cached)', async () => {
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    const res = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: 'Different!4',
    });
    expect(res.status).toBe(422);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.headers['pragma']).toBe('no-cache');
  });

  it('stale session cookie (pre-reset passwordVersion) is rejected after reset', async () => {
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
    });
    // A JWT minted against the pre-reset passwordVersion=1 is no longer valid.
    const stale = `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, passwordVersion: 1 })}`;
    const r = await request(app).get(`/members/${MEMBER_SLUG}/edit`).set('Cookie', stale);
    expect(r.status).toBe(302);
    expect(r.headers.location).toContain('/login');
  });
});

describe('POST /password/forgot — outbox failure does not leak via 500', () => {
  it('enqueue throws → uniform 200 sent page, audit row written, anti-enumeration preserved', async () => {
    expectLoggedError('audit: auth.password_reset_notification_failed');
    const commsMod = await import('../../src/services/communicationService');
    const commService = commsMod.getCommunicationService();
    const enqueueSpy = vi
      .spyOn(commService, 'enqueue')
      .mockImplementation(() => {
        throw new Error('SQLITE_BUSY: database is locked');
      });

    try {
      const app = createApp();
      const res = await request(app)
        .post('/password/forgot')
        .type('form')
        .send({ email: MEMBER_EMAIL });

      // Anti-enumeration contract: identical UX to the not-exists branch.
      expect(res.status).toBe(200);
      expect(res.text).toContain('If an account exists');

      // A high-priority audit row records the failure for operator review.
      const db = new BetterSqlite3(dbPath, { readonly: true });
      // This is the first case in the file to record that failure, so the action
      // type identifies the row. Asserting it names a second writer rather than
      // silently choosing between two.
      const row = theOnlyRow<{
        action_type: string; category: string; entity_type: string; entity_id: string;
      }>(
        db,
        rowPin('audit_entries', `action_type = 'auth.password_reset_notification_failed'`),
      );
      db.close();
      expect(row).toBeDefined();
      expect(row!.category).toBe('auth');
      expect(row!.entity_type).toBe('member');
      expect(row!.entity_id).toBe(MEMBER_ID);
    } finally {
      enqueueSpy.mockRestore();
    }
  });

  it('unknown email + enqueue throws → still 200 sent page, no audit row, no orphan token', async () => {
    const commsMod = await import('../../src/services/communicationService');
    const commService = commsMod.getCommunicationService();
    // The unknown-email branch returns before reaching enqueue, so this spy
    // should not be invoked; the assertion is symmetric with the exists path
    // to prove the anti-enum contract holds end-to-end.
    const enqueueSpy = vi
      .spyOn(commService, 'enqueue')
      .mockImplementation(() => {
        throw new Error('SQLITE_BUSY: database is locked');
      });

    try {
      const app = createApp();
      const res = await request(app)
        .post('/password/forgot')
        .type('form')
        .send({ email: 'nobody-here@example.com' });

      expect(res.status).toBe(200);
      expect(res.text).toContain('If an account exists');
      expect(enqueueSpy).not.toHaveBeenCalled();
    } finally {
      enqueueSpy.mockRestore();
    }
  });

  // Defect caught: a request whose email never queued is taken for a repeat,
  // so the member who tries again straight away is sent nothing at all.
  it('a retry straight after a failed enqueue mails the link', async () => {
    expectLoggedError('audit: auth.password_reset_notification_failed');
    const commsMod = await import('../../src/services/communicationService');
    const commService = commsMod.getCommunicationService();
    const enqueueSpy = vi
      .spyOn(commService, 'enqueue')
      .mockImplementation(() => {
        throw new Error('SQLITE_BUSY: database is locked');
      });
    const app = createApp();
    try {
      const failed = await request(app).post('/password/forgot').type('form').send({ email: MEMBER_EMAIL });
      expect(failed.status).toBe(200);
    } finally {
      enqueueSpy.mockRestore();
    }
    expect(countOutboxFor(MEMBER_EMAIL)).toBe(0);
    expect(countResetTokensFor(MEMBER_ID)).toBe(1);

    const retry = await request(app).post('/password/forgot').type('form').send({ email: MEMBER_EMAIL });
    expect(retry.status).toBe(200);
    expect(countOutboxFor(MEMBER_EMAIL)).toBe(1);
  });
});

describe('POST /password/reset/:token — session reissue failure', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let adapterMod: typeof import('../../src/adapters/jwtSigningAdapter');
  let realAdapter: import('../../src/adapters/jwtSigningAdapter').JwtSigningAdapter;

  beforeAll(async () => {
    adapterMod = await import('../../src/adapters/jwtSigningAdapter');
    // Capture the real adapter before injection so verifyJwt continues to
    // work for any other request that runs in parallel; only signJwt fails.
    realAdapter = adapterMod.getJwtSigningAdapter();
  });

  afterEach(() => {
    adapterMod.resetJwtSigningAdapterForTests();
  });

  it('signJwt failure after token consumed and password_version commit → 503, no Set-Cookie, DB committed, actionable error', async () => {
    expectLoggedError('password reset: session issue failed');
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);

    adapterMod.setJwtSigningAdapterForTests({
      kid: realAdapter.kid,
      signJwt: async () => {
        // Mirrors a real KMS Sign rejection wire shape (the AWS SDK throws an
        // Error subclass with name='AccessDeniedException' on IAM regression).
        const err = new Error('KMS Sign failed: AccessDeniedException');
        err.name = 'KMSAccessDenied';
        throw err;
      },
      verifyJwt: (t) => realAdapter.verifyJwt(t),
    });

    const res = await request(app)
      .post(`/password/reset/${token}`)
      .type('form')
      .send({ newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.text).toContain('Your password was reset');
    expect(res.text).toContain('could not sign you in');
    expect(res.text).toContain('login page');

    const cookies = res.get('Set-Cookie');
    const sessionCookieIssued = cookies?.some((c) =>
      c.startsWith('__Host-footbag_session=') &&
      !c.match(/Max-Age=0|Expires=Thu, 01 Jan 1970/i),
    );
    expect(sessionCookieIssued).toBeFalsy();

    // password_version was 1 at the start of the test (beforeEach restores
    // it); a successful commit before the failed signing lands it at 2.
    const dbCheck = new BetterSqlite3(dbPath, { readonly: true });
    const row = dbCheck.prepare('SELECT password_version FROM members WHERE id=?')
      .get(MEMBER_ID) as { password_version: number };
    expect(row.password_version).toBe(2);

    // Token was consumed; a replay of the same submit reports the reset as done
    // and sets nothing.
    const replay = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
    });
    expect(replay.status).toBe(200);
    expect(replay.text).toContain('Your password has been reset.');
    const afterReplay = dbCheck.prepare('SELECT password_version FROM members WHERE id=?')
      .get(MEMBER_ID) as { password_version: number };
    dbCheck.close();
    expect(afterReplay.password_version).toBe(2);

    expect(res.headers['cache-control']).toMatch(/no-store/);

    // Simulate KMS recovery: a fresh login with the new password works.
    adapterMod.resetJwtSigningAdapterForTests();
    const login = await request(app).post('/login').type('form').send({
      email: MEMBER_EMAIL, password: NEW_PASSWORD,
    });
    expect(login.status).toBe(303);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Confirmation-email enqueue failure on reset completion.
// The reset itself committed; a degraded outbox must leave an operator signal
// (operational-error audit row) rather than a silent swallow. Unlike the
// in-profile password change, the failure is NOT surfaced as a 503: the reset
// token is single-use and already consumed, so the success path must complete.
// ─────────────────────────────────────────────────────────────────────────

describe('POST /password/reset/:token — confirmation-email enqueue failure', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let commsMod: typeof import('../../src/services/communicationService');

  beforeAll(async () => {
    commsMod = await import('../../src/services/communicationService');
  });

  afterEach(() => {
    commsMod.resetCommunicationServiceForTests();
  });

  it('enqueueEmailOrFail throws → reset still succeeds (303) + operational-error audit row', async () => {
    expectLoggedError('audit: auth.password_reset_notification_failed');
    const app = createApp();
    // Issue the token with the REAL comms so the reset link is delivered.
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);

    // Now degrade the outbox so the reset-completion confirmation enqueue fails.
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    commsMod.setCommunicationServiceForTests({
      enqueue: () => {
        throw new ServiceUnavailableError(
          'synthetic enqueue failure for password-reset confirmation',
        );
      },
      liftAddressSuppression: async () => {},
      processSendQueue: async () => ({
        claimed: 0, sent: 0, failed: 0, deadLettered: 0, manualReview: 0, paused: false,
        suppressed: 0, bulkHalted: false, bulkPaused: false,
      }),
    });

    // An earlier case in this file records the same failure for the same member,
    // and the ledger is append-only so the per-test cleanup cannot remove it.
    // Pin the row this reset adds rather than reading the most recent one.
    const notifyFailedAudit = rowPin(
      'audit_entries',
      `entity_id = ? AND action_type = 'auth.password_reset_notification_failed'`,
      [MEMBER_ID],
    );
    const snapDb = new BetterSqlite3(dbPath, { readonly: true });
    const beforeFailure = snapshotIds(snapDb, notifyFailedAudit);
    snapDb.close();

    const res = await request(app)
      .post(`/password/reset/${token}`)
      .type('form')
      .send({ newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    // The reset succeeds despite the failed confirmation enqueue.
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${MEMBER_SLUG}`);

    // The password actually rotated (version bumped).
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const verRow = db.prepare('SELECT password_version FROM members WHERE id=?')
      .get(MEMBER_ID) as { password_version: number };
    // The operator signal was recorded.
    const auditRow = oneRowAddedSince<{ action_type: string; category: string; actor_type: string }>(
      db,
      notifyFailedAudit,
      beforeFailure,
    );
    db.close();

    expect(verRow.password_version).toBe(2);
    expect(auditRow).toBeDefined();
    expect(auditRow!.category).toBe('auth');
    expect(auditRow!.actor_type).toBe('system');
  });
});

describe('Confirmation email for in-profile password change', () => {
  it('POST /members/:slug/edit/password enqueues a confirmation email', async () => {
    const app = createApp();
    const cookie = `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, passwordVersion: 1 })}`;
    // This address has been mailed earlier in the file, so take the mail this
    // change enqueues rather than the newest one: the outbox stamp ties to the
    // millisecond and the outbox id is random.
    const memberMail = rowPin('outbox_emails', 'recipient_email = ?', [MEMBER_EMAIL]);
    const snapDb = new BetterSqlite3(dbPath, { readonly: true });
    const beforeMail = snapshotIds(snapDb, memberMail);
    snapDb.close();
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/edit/password`)
      .set('Cookie', cookie)
      .type('form')
      .send({
        oldPassword: ORIGINAL_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
    expect(res.status).toBe(303);
    expect(countOutboxFor(MEMBER_EMAIL)).toBeGreaterThanOrEqual(1);
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = oneRowAddedSince<{ subject: string }>(db, memberMail, beforeMail);
    db.close();
    expect(row.subject).toMatch(/password was changed/i);
  });
});
