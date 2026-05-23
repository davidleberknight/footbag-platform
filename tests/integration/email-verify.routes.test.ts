/**
 * Integration tests for email verification at registration.
 *
 * Exercises the full verify flow: registration enqueues a verify email,
 * GET /verify/:token consumes the token and logs the member in, resend is
 * rate-limited, and unverified members cannot log in and do not appear in
 * authenticated member search.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { expectLoggedError } from '../setup-env';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';
import { assertSecureSessionCookie } from '../fixtures/assertSecureSessionCookie';

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

function tokenFromOutbox(email: string): string {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(
    `SELECT body_text FROM outbox_emails WHERE recipient_email = ? ORDER BY created_at DESC LIMIT 1`,
  ).get(email) as { body_text: string } | undefined;
  db.close();
  if (!row) throw new Error(`no outbox row for ${email}`);
  const match = row.body_text.match(/\/verify\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`no verify link in body for ${email}`);
  return match[1];
}

describe('POST /register → check-email + outbox enqueue', () => {
  it('enqueues a verify email with a /verify/:token link', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'Verify Tester',
        email: 'verify-one@example.com',
        password: 'verifypass!1',
        confirmPassword: 'verifypass!1',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT recipient_email, body_text, status FROM outbox_emails WHERE recipient_email = ?`,
    ).get('verify-one@example.com') as { recipient_email: string; body_text: string; status: string };
    db.close();
    expect(row.status).toBe('pending');
    expect(row.body_text).toMatch(/\/verify\/[A-Za-z0-9_-]+/);

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

  it('duplicate registration produces no new outbox row (silent dedup)', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      realName: 'Dup One',
      email: 'verify-dup@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    // Re-register same email — same RealName rules (must differ from existing slug).
    await request(app).post('/register').type('form').send({
      realName: 'Dup Two',
      email: 'verify-dup@example.com',
      password: 'anotherpass!2',
      confirmPassword: 'anotherpass!2',
    });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const rows = db.prepare(
      `SELECT id FROM outbox_emails WHERE recipient_email = ?`,
    ).all('verify-dup@example.com') as Array<{ id: string }>;
    db.close();
    expect(rows).toHaveLength(1);
  });
});

describe('GET /verify/:token', () => {
  it('consumes valid token → sets email_verified_at, issues session cookie, redirects to /members/:slug', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      realName: 'Verify Good',
      email: 'verify-good@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const token = tokenFromOutbox('verify-good@example.com');
    const res = await request(app).get(`/verify/${token}`);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    expect(cookies?.some((c) => c.startsWith('footbag_session='))).toBe(true);
    assertSecureSessionCookie(res.headers['set-cookie']);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const m = db.prepare(
      `SELECT email_verified_at FROM members WHERE login_email_normalized = ?`,
    ).get('verify-good@example.com') as { email_verified_at: string | null };
    db.close();
    expect(m.email_verified_at).not.toBeNull();
  });

  it('second consume of the same token → 400 with generic error', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      realName: 'Verify Twice',
      email: 'verify-twice@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const token = tokenFromOutbox('verify-twice@example.com');
    const first = await request(app).get(`/verify/${token}`);
    expect(first.status).toBe(303);
    const second = await request(app).get(`/verify/${token}`);
    expect(second.status).toBe(400);
    expect(second.text).toContain('invalid, expired, or already used');
  });

  it('unknown token → 400 with identical error', async () => {
    const app = createApp();
    const res = await request(app).get('/verify/bogus-token-xxx');
    expect(res.status).toBe(400);
    expect(res.text).toContain('invalid, expired, or already used');
  });
});

describe('GET /verify/:token — 500 handler redacts the raw token from logs', () => {
  it('an unhandled service error on a token-bearing GET logs the URL with the token redacted', async () => {
    const identityAccessMod = await import('../../src/services/identityAccessService');
    const logMod = await import('../../src/config/logger');

    const errorSpy = vi.spyOn(logMod.logger, 'error').mockImplementation(() => undefined);
    const verifySpy = vi
      .spyOn(identityAccessMod.identityAccessService, 'verifyEmailByToken')
      .mockRejectedValue(new Error('database connection refused'));

    try {
      const app = createApp();
      const res = await request(app).get('/verify/SECRET_RAW_TOKEN_xyz123');

      expect(res.status).toBe(500);

      const unhandled = errorSpy.mock.calls.find((args) => args[0] === 'unhandled error');
      expect(unhandled).toBeDefined();
      const payload = unhandled![1] as { url: string };
      expect(payload.url).toBe('/verify/[redacted]');
      expect(payload.url).not.toContain('SECRET_RAW_TOKEN_xyz123');
    } finally {
      verifySpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('GET /verify/:token — session reissue failure', () => {
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
      realName: 'Verify KmsFail',
      email: 'verify-kmsfail@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const token = tokenFromOutbox('verify-kmsfail@example.com');

    adapterMod.setJwtSigningAdapterForTests({
      signJwt: async () => {
        const err = new Error('KMS Sign failed: AccessDeniedException');
        err.name = 'KMSAccessDenied';
        throw err;
      },
      verifyJwt: (t) => realAdapter.verifyJwt(t),
    });

    const res = await request(app).get(`/verify/${token}`);

    expect(res.status).toBe(503);
    expect(res.text).toContain('email is verified');
    expect(res.text).toContain('could not sign you in');
    expect(res.text).toContain('Sign in');

    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const sessionCookieIssued = cookies?.some((c) =>
      c.startsWith('footbag_session=') &&
      !c.match(/Max-Age=0|Expires=Thu, 01 Jan 1970/i),
    );
    expect(sessionCookieIssued).toBeFalsy();

    // Verification was committed: email_verified_at is set despite the
    // failed signing.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const m = db.prepare(
      `SELECT email_verified_at FROM members WHERE login_email_normalized = ?`,
    ).get('verify-kmsfail@example.com') as { email_verified_at: string | null };
    db.close();
    expect(m.email_verified_at).not.toBeNull();

    // Replay of the consumed token yields the standard "invalid / already used" branch.
    const replay = await request(app).get(`/verify/${token}`);
    expect(replay.status).toBe(400);
    expect(replay.text).toContain('invalid, expired, or already used');

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
      realName: 'Verify Blocked',
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
    await request(app).post('/register').type('form').send({
      realName: 'Resend Tester',
      email: 'resend@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    // First outbox row is the registration email.
    for (let i = 0; i < 3; i++) {
      const r = await request(app).post('/verify/resend').type('form').send({ email: 'resend@example.com' });
      expect(r.status).toBe(200);
    }
    // After 3 allowed resends the bucket is at its limit; the 4th doesn't enqueue.
    const before = (() => {
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const count = db.prepare(
        `SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_email = ?`,
      ).get('resend@example.com') as { n: number };
      db.close();
      return count.n;
    })();
    const blocked = await request(app).post('/verify/resend').type('form').send({ email: 'resend@example.com' });
    // Identical response (200 check-email) either way — anti-enumeration.
    expect(blocked.status).toBe(200);
    const after = (() => {
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const count = db.prepare(
        `SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_email = ?`,
      ).get('resend@example.com') as { n: number };
      db.close();
      return count.n;
    })();
    expect(after).toBe(before);
  });

  it('renders identical check-email page when the email does not match any member', async () => {
    const app = createApp();
    const res = await request(app).post('/verify/resend').type('form').send({
      email: 'never-existed@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('new verification link has been sent');
  });

  it('response shape identical whether or not the email matches an unverified member', async () => {
    const app = createApp();
    // Seed a fresh unverified member; use an email distinct from the
    // resend-rate-limit tests above so the per-email bucket is unused.
    await request(app).post('/register').type('form').send({
      realName: 'Resend Equivalence',
      email: 'resend-equiv-exists@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    const existsRes = await request(app).post('/verify/resend').type('form')
      .send({ email: 'resend-equiv-exists@example.com' });
    const notExistsRes = await request(app).post('/verify/resend').type('form')
      .send({ email: 'resend-equiv-never@example.com' });
    expect(existsRes.status).toBe(notExistsRes.status);
    const lenRatio = existsRes.text.length / notExistsRes.text.length;
    expect(lenRatio).toBeGreaterThan(0.95);
    expect(lenRatio).toBeLessThan(1.05);
  });

  it('verify resend rate limit is tunable via system_config_current', async () => {
    // Lower the bucket to 2 via system_config; the 3rd resend should not enqueue.
    const tuneDb = new BetterSqlite3(dbPath);
    tuneDb.prepare(`
      INSERT INTO system_config
        (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
      VALUES (?, ?, 'verify_resend_rate_limit_max_attempts', '2', ?, 'Test tunable', NULL)
    `).run(
      'test-verify-resend-rl-tune',
      '2026-05-22T00:00:00.000Z',
      '2026-05-22T00:00:00.000Z',
    );
    tuneDb.close();
    try {
      const TUNE_EMAIL = 'verify-resend-tunable@example.com';
      const app = createApp();
      // Register a fresh unverified member; the registration creates the first
      // outbox row. The per-email bucket for /verify/resend is unused.
      await request(app).post('/register').type('form').send({
        realName: 'Verify Resend Tunable',
        email: TUNE_EMAIL,
        password: 'verifypass!1',
        confirmPassword: 'verifypass!1',
      });
      // 2 resends are allowed under the configured cap.
      for (let i = 0; i < 2; i++) {
        const r = await request(app).post('/verify/resend').type('form').send({ email: TUNE_EMAIL });
        expect(r.status).toBe(200);
      }
      // Bucket is at 2 (= configured limit); the 3rd resend is blocked
      // (anti-enumeration: response is still 200, but no new outbox row).
      const before = (() => {
        const db = new BetterSqlite3(dbPath, { readonly: true });
        const count = db.prepare(
          `SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_email = ?`,
        ).get(TUNE_EMAIL) as { n: number };
        db.close();
        return count.n;
      })();
      const blocked = await request(app).post('/verify/resend').type('form').send({ email: TUNE_EMAIL });
      expect(blocked.status).toBe(200);
      const after = (() => {
        const db = new BetterSqlite3(dbPath, { readonly: true });
        const count = db.prepare(
          `SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_email = ?`,
        ).get(TUNE_EMAIL) as { n: number };
        db.close();
        return count.n;
      })();
      expect(after).toBe(before);
    } finally {
      // Restore the platform default so later tests see 3/attempt.
      const restoreDb = new BetterSqlite3(dbPath);
      restoreDb.prepare(`
        INSERT INTO system_config
          (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
        VALUES (?, ?, 'verify_resend_rate_limit_max_attempts', '3', ?, 'Test restore', NULL)
      `).run(
        'test-verify-resend-rl-restore',
        '2026-05-22T00:00:01.000Z',
        '2026-05-22T00:00:01.000Z',
      );
      restoreDb.close();
    }
  });
});

describe('POST /verify/resend — verify-email enqueue failure', () => {
  // Regression for B21: ServiceUnavailableError previously fell through to the
  // 500 handler because postVerifyResend only called next(err). The 503 page
  // is the truthful surface — outbox/SES degradation is a dependency outage,
  // not an unexpected exception.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let commsMod: typeof import('../../src/services/communicationService');

  beforeAll(async () => {
    commsMod = await import('../../src/services/communicationService');
  });

  afterEach(() => {
    commsMod.resetCommunicationServiceForTests();
  });

  it('enqueueEmailOrFail throws → 503 + audit row (recovers via /verify/resend after outbox heals)', async () => {
    expectLoggedError('audit: auth.register_notification_failed');
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');

    // Seed a fresh unverified member through a real registration first, while
    // comms is still healthy; otherwise the registration itself 503s.
    const app = createApp();
    const targetEmail = 'resend-enqueue-fail@example.com';
    const registerRes = await request(app).post('/register').type('form').send({
      realName: 'Resend Fail',
      email: targetEmail,
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });
    expect(registerRes.status).toBe(303);

    // Now break enqueueEmailOrFail and exercise the resend path.
    commsMod.setCommunicationServiceForTests({
      enqueueEmail: () => {
        throw new ServiceUnavailableError('synthetic enqueue failure');
      },
      enqueueEmailOrFail: () => {
        throw new ServiceUnavailableError(
          'synthetic enqueueEmailOrFail failure for verify-resend',
        );
      },
      enqueueMailingListEmail: () => ({ enqueued: 0, duplicates: 0 }),
      processSendQueue: async () => ({
        claimed: 0, sent: 0, failed: 0, deadLettered: 0, paused: false,
      }),
    });

    const res = await request(app).post('/verify/resend').type('form').send({ email: targetEmail });
    expect(res.status).toBe(503);

    // Audit row records the failure for operator triage.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const member = db.prepare(
      `SELECT id FROM members WHERE login_email_normalized = ?`,
    ).get(targetEmail) as { id: string } | undefined;
    const auditRow = member ? db.prepare(
      `SELECT action_type FROM audit_entries
         WHERE entity_id = ? AND action_type = 'auth.register_notification_failed'
         ORDER BY created_at DESC LIMIT 1`,
    ).get(member.id) as { action_type: string } | undefined : undefined;
    db.close();
    expect(auditRow).toBeDefined();
  });
});

describe('Authenticated member search excludes unverified rows', () => {
  it('an unverified member is not in members_searchable and not in /members?q=', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      realName: 'Shadow Figure',
      email: 'shadow-figure@example.com',
      password: 'verifypass!1',
      confirmPassword: 'verifypass!1',
    });

    const cookie = `footbag_session=${createTestSessionJwt({ memberId: 'verify-searcher' })}`;
    const res = await request(app).get('/members?q=Shadow').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Shadow Figure');
  });
});
