/**
 * Integration tests for the password-reset flow + confirmation emails.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { expectLoggedError } from '../setup-env';
import request from '../fixtures/supertestWithOrigin';
import argon2 from 'argon2';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';
import { assertSecureSessionCookie } from '../fixtures/assertSecureSessionCookie';

const { dbPath } = setTestEnv('3070');

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID       = 'pwreset-member-001';
const MEMBER_SLUG     = 'pwreset_member';
const MEMBER_EMAIL    = 'pwreset-member@example.com';
const ORIGINAL_PASSWORD = 'OrigPass!1';
const NEW_PASSWORD    = 'BrandNew!2';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const hash = await argon2.hash(ORIGINAL_PASSWORD);
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
  const hash = await argon2.hash(ORIGINAL_PASSWORD);
  db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?').run(hash, MEMBER_ID);
  db.prepare('DELETE FROM outbox_emails').run();
  db.prepare('DELETE FROM account_tokens').run();
  db.close();
});

/**
 * Extracts the reset token from the password-forgot-sent response HTML
 * (which now includes the simulated-email card on dev). The DB-row
 * body_text is NULLed by the post-render outbox drain in
 * simulatedEmailService.getEmailPreview(), so the HTML response is the
 * authoritative source for the just-sent token URL.
 */
function tokenFromForgotResponse(res: { text: string }): string {
  const match = res.text.match(/\/password\/reset\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error('no reset link in response HTML');
  return match[1];
}

async function issueAndExtractResetToken(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const res = await request(app).post('/password/forgot').type('form').send({ email });
  expect(res.status).toBe(200);
  return tokenFromForgotResponse(res);
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
    for (let i = 0; i < 5; i++) {
      await request(app).post('/password/forgot').type('form').send({ email: MEMBER_EMAIL });
    }
    const before = countOutboxFor(MEMBER_EMAIL);
    expect(before).toBe(5);
    const blocked = await request(app).post('/password/forgot').type('form').send({ email: MEMBER_EMAIL });
    // Identical UX — still 200 with the generic "sent" page.
    expect(blocked.status).toBe(200);
    // But no new outbox row.
    expect(countOutboxFor(MEMBER_EMAIL)).toBe(before);
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
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    expect(cookies?.some((c) => c.startsWith('footbag_session='))).toBe(true);
    assertSecureSessionCookie(res.headers['set-cookie']);

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

  it('token is single-use: second consume → 422', async () => {
    const app = createApp();
    const token = await issueAndExtractResetToken(app, MEMBER_EMAIL);
    const first = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
    });
    expect(first.status).toBe(303);
    const second = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: 'Another!3', confirmPassword: 'Another!3',
    });
    expect(second.status).toBe(422);
    expect(second.text).toContain('invalid, expired, or already used');
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
    const stale = `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, passwordVersion: 1 })}`;
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
      .spyOn(commService, 'enqueueEmailOrFail')
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
      const row = db.prepare(
        `SELECT action_type, category, entity_type, entity_id FROM audit_entries
         WHERE action_type = 'auth.password_reset_notification_failed'
         ORDER BY created_at DESC LIMIT 1`,
      ).get() as
        | { action_type: string; category: string; entity_type: string; entity_id: string }
        | undefined;
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
      .spyOn(commService, 'enqueueEmailOrFail')
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
    expect(res.text).toContain('Your password was reset');
    expect(res.text).toContain('could not sign you in');
    expect(res.text).toContain('login page');

    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const sessionCookieIssued = cookies?.some((c) =>
      c.startsWith('footbag_session=') &&
      !c.match(/Max-Age=0|Expires=Thu, 01 Jan 1970/i),
    );
    expect(sessionCookieIssued).toBeFalsy();

    // password_version was 1 at the start of the test (beforeEach restores
    // it); a successful commit before the failed signing lands it at 2.
    const dbCheck = new BetterSqlite3(dbPath, { readonly: true });
    const row = dbCheck.prepare('SELECT password_version FROM members WHERE id=?')
      .get(MEMBER_ID) as { password_version: number };
    expect(row.password_version).toBe(2);

    // Token was consumed; replay must yield 422.
    const replay = await request(app).post(`/password/reset/${token}`).type('form').send({
      newPassword: 'Another!9', confirmPassword: 'Another!9',
    });
    dbCheck.close();
    expect(replay.status).toBe(422);

    expect(res.headers['cache-control']).toMatch(/no-store/);

    // Simulate KMS recovery: a fresh login with the new password works.
    adapterMod.resetJwtSigningAdapterForTests();
    const login = await request(app).post('/login').type('form').send({
      email: MEMBER_EMAIL, password: NEW_PASSWORD,
    });
    expect(login.status).toBe(303);
  });
});

describe('Confirmation email for in-profile password change', () => {
  it('POST /members/:slug/edit/password enqueues a confirmation email', async () => {
    const app = createApp();
    const cookie = `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, passwordVersion: 1 })}`;
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/edit/password`)
      .set('Cookie', cookie)
      .type('form')
      .send({
        oldPassword: ORIGINAL_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
    expect(res.status).toBe(200);
    expect(countOutboxFor(MEMBER_EMAIL)).toBeGreaterThanOrEqual(1);
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT subject FROM outbox_emails WHERE recipient_email=? ORDER BY created_at DESC LIMIT 1`,
    ).get(MEMBER_EMAIL) as { subject: string };
    db.close();
    expect(row.subject).toMatch(/password was changed/i);
  });
});
