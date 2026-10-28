/**
 * Server-side Turnstile CAPTCHA gate on the anti-enumeration auth surfaces:
 * registration, login, verify-email resend, and the password-reset request and
 * completion. Each surface rejects a failed challenge before any DB read,
 * returns a generic 422 that looks identical to any other non-result, and
 * performs no account mutation. When the verifier cannot answer, each answers
 * 503 with Retry-After, changes nothing, and keeps the process serving.
 *
 * User story anchors: V_Register_Account, M_Login, M_Verify_Email,
 * M_Reset_Password.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';
import { expectLoggedError } from '../setup-env';

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
  return list.filter((c) => String(c).startsWith('__Host-footbag_session='));
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
        givenNames: 'Reg', familyName: 'Captcha',
        email,
        password: 'sufficiently-long-pw',
        confirmPassword: 'sufficiently-long-pw',
        displayName: 'Reg Captcha',
        slug: 'reg_captcha',
        'cf-turnstile-response': STUB_CAPTCHA_FAIL_TOKEN,
      });

    expect(res.status).toBe(422);
    expect(res.text).toContain('Please complete the verification challenge');
    // The gate fires before any DB read, so no account row is written.
    expect(memberByEmail(email)).toBeUndefined();
    // The rejected render has to be recoverable: registration asks for a lot,
    // and a challenge failure that silently empties the form makes the visitor
    // retype all of it to retry.
    expect(res.text).toContain('value="Reg"');
    expect(res.text).toContain('value="Captcha"');
    expect(res.text).toContain(email);
    expect(res.text).toContain('name="givenNames"');
    expect(res.text).toContain('name="familyName"');
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
    expect(res.text).toContain('Please complete the verification challenge');
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
    expect(res.text).toContain('Please complete the verification challenge');
    // The failed-challenge render must not also claim the visitor just
    // registered. The page's three states are mutually exclusive, and a
    // rejected resend sitting under a success message tells the reader the
    // opposite of what happened.
    expect(res.text).not.toContain('Registration successful');
  });

  it('the ordinary post-registration arrival still confirms the account was created', async () => {
    // Guards the fix above from being "solved" by deleting the confirmation:
    // a visitor who has just registered must still be told to go read their
    // mail, with no error banner in sight.
    const res = await request(createApp()).get('/register/check-email');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Registration successful');
    expect(res.text).not.toContain('form-error-banner');
  });
});

describe('captcha widget on the invalid verify-link page', () => {
  // The page offers a resend form, and the resend route refuses a submit
  // without a challenge token. Without the widget the form fails its first
  // submit in production, where the challenge is live, and sends nothing.
  it('the resend form carries the challenge field', async () => {
    const res = await request(createApp())
      .post('/verify')
      .type('form')
      .send({ token: 'no-such-verify-token' });

    expect(res.status).toBe(400);
    const form = res.text.match(/<form method="POST" action="\/verify\/resend"[\s\S]*?<\/form>/)?.[0];
    expect(form).toBeDefined();
    expect(form).toContain('You are human');
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
    expect(res.text).toContain('Please complete the verification challenge');
    // The gate fires before requestPasswordReset, so no reset token is issued.
    const tokens = db
      .prepare('SELECT COUNT(*) AS n FROM account_tokens WHERE member_id = ?')
      .get(memberId) as { n: number };
    expect(tokens.n).toBe(0);
  });
});

describe('captcha gate refuses a blank answer', () => {
  it('a sign-in post with an empty challenge field gets the challenge re-render and no session', async () => {
    // The stub passing a blank answer would hide a form that never rendered the
    // challenge until its first submit in production.
    insertMember(db, {
      slug: 'login_blank_cap',
      login_email: 'login-blank-captcha@example.com',
      real_name: 'Login Blank Cap',
    });
    const res = await request(createApp())
      .post('/login')
      .type('form')
      .send({
        email: 'login-blank-captcha@example.com',
        password: 'whatever-password',
        'cf-turnstile-response': '',
      });

    expect(res.status).toBe(422);
    expect(sessionCookies(res)).toHaveLength(0);
  });

  it('the stub card posts an answer the stub passes, so the rendered form works below production', async () => {
    const page = await request(createApp()).get('/login');
    const answer = page.text.match(/name="cf-turnstile-response" value="([^"]+)"/)?.[1];
    expect(answer).toBeDefined();
    const { getCaptchaAdapter } = await import('../../src/adapters/captchaAdapter');
    expect(await getCaptchaAdapter().verify(answer!)).toEqual({ outcome: 'passed' });
  });
});

describe('captcha gate when the verifier cannot answer', () => {
  // Each gated form, with what a submit would change if it got past the gate.
  // A verifier outage must refuse the form with a retry-later answer: never let
  // the submit through, never tell the visitor their challenge failed, and
  // never take the web process down.
  let run = 0;
  async function postEach(token: string): Promise<{ path: string; res: import('supertest').Response }[]> {
    run += 1;
    const email = `outage-${run}@example.com`;
    const memberId = insertMember(db, { slug: `outage_cap_${run}`, login_email: email, real_name: 'Outage Cap' });
    const app = createApp();
    const posts: { path: string; body: Record<string, string> }[] = [
      { path: '/login', body: { email, password: 'whatever-password' } },
      {
        path: '/register',
        body: {
          givenNames: 'Outage', familyName: 'Register', displayName: 'Outage Register',
          slug: `outage_reg_${run}`,
          email: `outage-reg-${run}@example.com`,
          password: 'sufficiently-long-pw', confirmPassword: 'sufficiently-long-pw',
        },
      },
      { path: '/verify/resend', body: { email } },
      { path: '/password/forgot', body: { email } },
      { path: '/password/reset/some-reset-token', body: { newPassword: 'new-strong-password', confirmPassword: 'new-strong-password' } },
    ];
    const before = snapshot(memberId);
    const results = [];
    for (const { path, body } of posts) {
      const res = await request(app).post(path).type('form').send({ ...body, 'cf-turnstile-response': token });
      results.push({ path, res });
    }
    expect(snapshot(memberId), 'a refused submit changed nothing').toEqual(before);
    return results;
  }

  function snapshot(memberId: string) {
    const count = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
    return {
      members: count('SELECT COUNT(*) AS n FROM members'),
      tokens: count('SELECT COUNT(*) AS n FROM account_tokens'),
      outbox: count('SELECT COUNT(*) AS n FROM outbox_emails'),
      audit: count('SELECT COUNT(*) AS n FROM audit_entries'),
      passwordVersion: (db.prepare('SELECT password_version FROM members WHERE id = ?').get(memberId) as { password_version: number }).password_version,
    };
  }

  it('every gated form answers 503 with Retry-After and changes nothing', async () => {
    const { STUB_CAPTCHA_UNAVAILABLE_TOKEN } = await import('../../src/adapters/captchaAdapter');
    for (const { path, res } of await postEach(STUB_CAPTCHA_UNAVAILABLE_TOKEN)) {
      expect(res.status, path).toBe(503);
      expect(res.headers['retry-after'], path).toMatch(/^\d+$/);
      expect(sessionCookies(res), path).toHaveLength(0);
    }
  });

  it('a check that throws reaches the error page on every gated form instead of escaping the handler', async () => {
    // A failure thrown from the check outside the handler's try was dropped by
    // Express, and Node then exited the whole web process: one anonymous post
    // took the site down for everyone.
    const { setCaptchaAdapterForTests, resetCaptchaAdapterForTests } = await import('../../src/adapters/captchaAdapter');
    setCaptchaAdapterForTests({
      async verify() {
        throw new Error('verifier exploded');
      },
    });
    try {
      expectLoggedError(/unhandled error/);
      for (const { path, res } of await postEach('any-answer')) {
        expect(res.status, path).toBe(500);
      }
    } finally {
      resetCaptchaAdapterForTests();
    }
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
    expect(res.text).toContain('Please complete the verification challenge');
    // The reset token is never consumed and password_version never bumps,
    // because the gate fires before completePasswordReset runs.
    const after = db
      .prepare('SELECT password_version FROM members WHERE id = ?')
      .get(memberId) as { password_version: number };
    expect(after.password_version).toBe(before.password_version);
  });
});
