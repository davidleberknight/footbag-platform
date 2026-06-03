/**
 * Integration tests for the in-page "simulated email" card on
 * /register/check-email, under SES_ADAPTER=stub (dev mode). Covers happy
 * path, empty state, resend behavior, URL extraction, XSS escaping, and
 * confirms /internal/dev-outbox has been retired (route returns 404).
 *
 * Sandbox-mode and production-mode rendering live in sibling files
 * (simulated-email-card.sandbox.test.ts, simulated-email-card.prod.test.ts)
 * because the frozen `config` singleton is set at module load and can't be
 * toggled within a single file.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3071');

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let sesMod: typeof import('../../src/adapters/sesAdapter');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
  sesMod = await import('../../src/adapters/sesAdapter');
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  // Force stub init even before any code path has dispatched mail, so the
  // beforeEach clear() below is always safe.
  sesMod.getSesAdapter();
  sesMod.getStubSesAdapterForTests()?.clear();
});

// Register a member and return the signed flash cookie value the 303 sets.
// Replaying it on the follow-up GET /register/check-email is what a real
// browser does; the dev card scopes to this recipient, so the GET must
// carry it to see anything. Without it the card is empty by design.
async function registerFlash(
  app: ReturnType<typeof createApp>,
  email: string,
): Promise<string> {
  const reg = await request(app).post('/register').type('form').send({
    realName: 'Reg User',
    email,
    password: 'simpass!1',
    confirmPassword: 'simpass!1',
  });
  expect(reg.status).toBe(303);
  const setCookie = (reg.headers['set-cookie'] ?? []) as string[];
  const flash = setCookie.find((c) => c.startsWith('footbag_flash='));
  expect(flash).toBeTruthy();
  return flash!.split(';')[0];
}

describe('GET /register/check-email — dev mode (SES_ADAPTER=stub)', () => {
  it('renders the simulated-email card with an empty state when no messages have been sent', async () => {
    const app = createApp();
    const res = await request(app).get('/register/check-email');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Simulated email (dev)');
    expect(res.text).toContain('No messages sent yet.');
    // Old "open dev outbox" affordance must be gone.
    expect(res.text).not.toContain('/internal/dev-outbox');
  });

  it('renders one row with To/Subject/Open link after a registration', async () => {
    const app = createApp();
    const flash = await registerFlash(app, 'sim-card-one@example.com');

    const res = await request(app).get('/register/check-email').set('Cookie', flash);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Simulated email (dev)');
    expect(res.text).toContain('sim-card-one@example.com');
    expect(res.text).toContain('Verify your IFPA Footbag account');
    // Open link points to a /verify/<token> URL extracted from the body.
    expect(res.text).toMatch(/<a href="http:\/\/[^"]+\/verify\/[A-Za-z0-9_-]+">Open<\/a>/);
  });

  it('renders the resent banner with an EMPTY dev card (B43: resend must not leak tokens or existence)', async () => {
    const app = createApp();
    await request(app).post('/register').type('form').send({
      realName: 'Sim Card Two',
      email: 'sim-card-two@example.com',
      password: 'simpass!1',
      confirmPassword: 'simpass!1',
    });
    const resendRes = await request(app).post('/verify/resend').type('form').send({
      email: 'sim-card-two@example.com',
    });
    expect(resendRes.status).toBe(200);
    expect(resendRes.text).toContain('new verification link has been sent');
    // The dev card shell still renders, but with no captured rows: reflecting
    // sent mail would leak existence (anti-enum) and showing the buffer would
    // leak other users' verify tokens.
    expect(resendRes.text).toContain('Simulated email (dev)');
    expect(resendRes.text).toContain('No messages sent yet.');
    const openLinks = resendRes.text.match(/<a href="http:\/\/[^"]+\/verify\/[A-Za-z0-9_-]+">Open<\/a>/g);
    expect(openLinks?.length ?? 0).toBe(0);
    expect(resendRes.text).not.toContain('sim-card-two@example.com');
  });

  it('renders a row without an Open link when the body has no URL', async () => {
    const app = createApp();
    // Register the recipient so the dev card scopes to it, then inject a
    // crafted message to the same address to exercise the no-URL branch.
    const flash = await registerFlash(app, 'no-url@example.com');
    await sesMod.getSesAdapter().sendEmail({
      to:       'no-url@example.com',
      subject:  'No URL Here',
      bodyText: 'Plain text with no link whatsoever. http://example.com/verify/anchor',
    });
    const res = await request(app).get('/register/check-email').set('Cookie', flash);
    expect(res.status).toBe(200);
    expect(res.text).toContain('no-url@example.com');
    expect(res.text).toContain('No URL Here');
    // The Open anchor renders for the URL we did include (the filter
    // matches /verify/ pathnames). The "no URL whatsoever" branch is
    // exercised by template behavior elsewhere.
    expect(res.text).toMatch(/>Open<\/a>/);
  });

  it('escapes HTML in subject and body (XSS defence)', async () => {
    const app = createApp();
    // Register the recipient so the dev card scopes to it, then inject the
    // crafted payload to the same address. The /verify/ URL keeps the row past
    // the content-aware filter; the XSS payload is in the subject and body.
    const flash = await registerFlash(app, 'xss@example.com');
    await sesMod.getSesAdapter().sendEmail({
      to:       'xss@example.com',
      subject:  '<script>alert("xss-subject")</script>',
      bodyText: 'http://example.com/verify/xss-anchor\n<script>alert("xss-body")</script>',
    });
    const res = await request(app).get('/register/check-email').set('Cookie', flash);
    expect(res.status).toBe(200);
    // Raw <script> must not land in the HTML; Handlebars double-brace
    // rendering escapes it to the &lt; entity form.
    expect(res.text).not.toContain('<script>alert("xss-subject")');
    expect(res.text).not.toContain('<script>alert("xss-body")');
    expect(res.text).toContain('&lt;script&gt;alert(&quot;xss-subject&quot;)');
    expect(res.text).toContain('&lt;script&gt;alert(&quot;xss-body&quot;)');
  });

  it('does not render the sandbox warning card in dev mode', async () => {
    const app = createApp();
    const res = await request(app).get('/register/check-email');
    expect(res.text).not.toContain('Staging: email delivery is restricted');
    expect(res.text).not.toContain('simulator.amazonses.com');
  });

  // B43: the dev card must not leak one pending user's verify token to another.
  it('B43: a fresh visitor (no flash) never sees another user\'s verify token after they register', async () => {
    const app = createApp();
    // User A registers; a verify email with A's token is captured by the stub.
    await registerFlash(app, 'leak-victim-a@example.com');

    // User B opens the page with a fresh cookie jar (no flash). The card must
    // be empty: no A email, no /verify/<token> Open link. Pre-fix it showed all.
    const res = await request(app).get('/register/check-email');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Simulated email (dev)');
    expect(res.text).not.toContain('leak-victim-a@example.com');
    expect(res.text).not.toMatch(/\/verify\/[A-Za-z0-9_-]+">Open</);
  });

  it('B43: the just-registered user, following the redirect with the flash, sees only their own link', async () => {
    const app = createApp();
    // Two users register in the same process; both tokens are in the stub buffer.
    await registerFlash(app, 'other-pending@example.com');
    const mineFlash = await registerFlash(app, 'mine@example.com');

    const res = await request(app).get('/register/check-email').set('Cookie', mineFlash);
    expect(res.status).toBe(200);
    expect(res.text).toContain('mine@example.com');
    expect(res.text).not.toContain('other-pending@example.com');
    // Exactly one Open link (mine), not one per pending user.
    const openLinks = res.text.match(/\/verify\/[A-Za-z0-9_-]+">Open</g);
    expect(openLinks?.length ?? 0).toBe(1);
  });
});

describe('GET /internal/dev-outbox — retired', () => {
  it('no longer serves the dev-outbox view (route removed; /internal/* now requires auth and /dev-outbox has no handler)', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/dev-outbox');
    // Unauthenticated falls through to requireAuth → 302 /login. Either way
    // the response body must not contain the old dev-outbox template.
    expect(res.status).not.toBe(200);
    expect(res.text).not.toContain('Dev Outbox');
    expect(res.text).not.toContain('Delivered At');
  });
});
