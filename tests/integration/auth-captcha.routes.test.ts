/**
 * Server-side Turnstile CAPTCHA gate on the anti-enumeration auth surfaces:
 * registration, login, verify-email resend, and the password-reset request and
 * completion. Each surface rejects a failed challenge before any DB read,
 * returns a generic 422 that looks identical to any other non-result, and
 * performs no account mutation.
 *
 * User story anchors: V_Register_Account, M_Login, M_Verify_Email,
 * M_Reset_Password.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3231');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function memberByEmail(email: string): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM members WHERE login_email = ?').get(email) as
    | Record<string, unknown>
    | undefined;
}

function sessionCookies(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.filter((c) => String(c).startsWith('footbag_session='));
}

// Imported lazily inside each test: a top-level import of captchaAdapter would
// load src/config/env before setTestEnv runs, pinning the wrong origin.

describe('captcha gate on registration', () => {
  it('rejects a failed challenge with a generic 422 and creates no member', async () => {
    const { STUB_CAPTCHA_FAIL_TOKEN } = await import('../../src/adapters/captchaAdapter');
    const email = 'reg-captcha@example.com';
    const res = await request(createApp())
      .post('/register')
      .type('form')
      .send({
        realName: 'Reg Captcha',
        email,
        password: 'sufficiently-long-pw',
        confirmPassword: 'sufficiently-long-pw',
        displayName: 'Reg Captcha',
        slug: 'reg_captcha',
        'cf-turnstile-response': STUB_CAPTCHA_FAIL_TOKEN,
      });

    expect(res.status).toBe(422);
    expect(res.text).toContain('verification');
    // The gate fires before any DB read, so no account row is written.
    expect(memberByEmail(email)).toBeUndefined();
  });
});

describe('captcha gate on login', () => {
  it('rejects a failed challenge with a generic 422 and issues no session', async () => {
    const { STUB_CAPTCHA_FAIL_TOKEN } = await import('../../src/adapters/captchaAdapter');
    insertMember(db, {
      slug: 'login_cap',
      login_email: 'login-captcha@example.com',
      real_name: 'Login Cap',
    });

    const res = await request(createApp())
      .post('/login')
      .type('form')
      .send({
        email: 'login-captcha@example.com',
        password: 'whatever-password',
        'cf-turnstile-response': STUB_CAPTCHA_FAIL_TOKEN,
      });

    expect(res.status).toBe(422);
    expect(res.text).toContain('verification');
    // No credential check ran, so no session cookie is issued.
    expect(sessionCookies(res)).toHaveLength(0);
  });
});

describe('captcha gate on verify-email resend', () => {
  it('rejects a failed challenge with a generic 422', async () => {
    const { STUB_CAPTCHA_FAIL_TOKEN } = await import('../../src/adapters/captchaAdapter');
    const res = await request(createApp())
      .post('/verify/resend')
      .type('form')
      .send({
        email: 'resend-captcha@example.com',
        'cf-turnstile-response': STUB_CAPTCHA_FAIL_TOKEN,
      });

    // A passing challenge renders the resend confirmation at 200; the gate
    // turns it into a 422 with the generic challenge message instead.
    expect(res.status).toBe(422);
    expect(res.text).toContain('verification');
  });
});

describe('captcha widget on the password-reset request form', () => {
  it('renders the stub "You are human" card in the stub environment', async () => {
    const res = await request(createApp()).get('/password/forgot');
    expect(res.status).toBe(200);
    // Stub adapter + null turnstileSiteKey makes the captcha-field partial show
    // the labeled bypass card instead of the real Turnstile widget.
    expect(res.text).toContain('You are human');
  });
});

describe('captcha gate on password-reset request', () => {
  it('rejects a failed challenge with a generic 422 and issues no reset token', async () => {
    const { STUB_CAPTCHA_FAIL_TOKEN } = await import('../../src/adapters/captchaAdapter');
    const memberId = insertMember(db, {
      slug: 'forgot_cap',
      login_email: 'forgot-captcha@example.com',
      real_name: 'Forgot Cap',
    });

    const res = await request(createApp())
      .post('/password/forgot')
      .type('form')
      .send({
        email: 'forgot-captcha@example.com',
        'cf-turnstile-response': STUB_CAPTCHA_FAIL_TOKEN,
      });

    expect(res.status).toBe(422);
    expect(res.text).toContain('verification');
    // The gate fires before requestPasswordReset, so no reset token is issued.
    const tokens = db
      .prepare('SELECT COUNT(*) AS n FROM account_tokens WHERE member_id = ?')
      .get(memberId) as { n: number };
    expect(tokens.n).toBe(0);
  });
});

describe('captcha gate on password reset', () => {
  it('rejects a failed challenge with a generic 422 and changes no password', async () => {
    const { STUB_CAPTCHA_FAIL_TOKEN } = await import('../../src/adapters/captchaAdapter');
    const memberId = insertMember(db, {
      slug: 'reset_cap',
      login_email: 'reset-captcha@example.com',
      real_name: 'Reset Cap',
    });
    const before = db
      .prepare('SELECT password_version FROM members WHERE id = ?')
      .get(memberId) as { password_version: number };

    const res = await request(createApp())
      .post('/password/reset/some-reset-token')
      .type('form')
      .send({
        newPassword: 'new-strong-password',
        confirmPassword: 'new-strong-password',
        'cf-turnstile-response': STUB_CAPTCHA_FAIL_TOKEN,
      });

    expect(res.status).toBe(422);
    expect(res.text).toContain('verification');
    // The reset token is never consumed and password_version never bumps,
    // because the gate fires before completePasswordReset runs.
    const after = db
      .prepare('SELECT password_version FROM members WHERE id = ?')
      .get(memberId) as { password_version: number };
    expect(after.password_version).toBe(before.password_version);
  });
});
