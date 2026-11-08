/**
 * Login-gated archive redirect: where a deployment routes the Legacy Archive
 * card through the platform's own login gate (the archive edge cannot share
 * the platform session cookie), the home card links to /archive, a signed-in
 * member is redirected to the archive landing page (the only archive URL the
 * platform ever emits), and a signed-out visitor is sent to login. This file
 * boots with the redirect mode on; the direct-link default lives in
 * home.archive-card.routes.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';
import { hashTestPassword } from '../fixtures/hashTestPassword';

const { dbPath } = setTestEnv('4037');

process.env.ARCHIVE_URL = 'https://archive.example.test';
process.env.ARCHIVE_LOGIN_REDIRECT = '1';

const ARCHIVE_LOGIN_EMAIL = 'archive-login@example.com';
const ARCHIVE_LOGIN_PASSWORD = 'archive-login-password-123';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db: BetterSqlite3.Database = createTestDb(dbPath);
  insertMember(db, {
    id: 'mem-archive', slug: 'mem_archive', login_email: 'archive@example.com',
    real_name: 'Archive Tester', display_name: 'Archive Tester',
  });
  insertMember(db, {
    id: 'mem-archive-login', slug: 'mem_archive_login', login_email: ARCHIVE_LOGIN_EMAIL,
    real_name: 'Archive Login', display_name: 'Archive Login',
    password_hash: await hashTestPassword(ARCHIVE_LOGIN_PASSWORD),
    email_verified_at: '2025-01-01T00:00:00.000Z',
  });
  db.close();
  const cfg = await import('../../src/config/env');
  expect(cfg.config.archiveUrl).toBe('https://archive.example.test');
  expect(cfg.config.archiveLoginRedirect).toBe(true);
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET / — Legacy Archive card in login-redirect mode', () => {
  it('links the card to /archive and emits no archive-host URL on the page', async () => {
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<div class="card-title">Legacy Archive<\/div>/);
    expect(res.text).toContain('href="/archive"');
    expect(res.text).not.toContain('archive.example.test');
  });
});

describe('GET /archive — login-gated hop to the archive landing page', () => {
  it('redirects a signed-out visitor to login with a safe return path', async () => {
    const res = await request(createApp()).get('/archive');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/login?returnTo=%2Farchive');
  });

  it('redirects a signed-in member to exactly the archive landing page', async () => {
    const jwt = createTestSessionJwt({ memberId: 'mem-archive', ttlSeconds: 24 * 60 * 60 });
    const res = await request(createApp())
      .get('/archive')
      .set('Cookie', `__Host-footbag_session=${jwt}`);
    expect(res.status).toBe(303);
    // Exactly the landing page: no interior path, no query, nothing derived
    // from request input may reach the redirect target.
    expect(res.headers['location']).toBe('https://archive.example.test');
  });

  it('a login from the archive gate lands on the archive host: every hop is one form-action allows', async () => {
    const app = createApp();
    const loginPage = await request(app).get('/login?returnTo=%2Farchive');
    const formAction = String(loginPage.headers['content-security-policy'])
      .split(';')
      .find((d) => d.startsWith('form-action '));

    const login = await request(app)
      .post('/login')
      .type('form')
      .send({ email: ARCHIVE_LOGIN_EMAIL, password: ARCHIVE_LOGIN_PASSWORD, returnTo: '/archive' });
    expect(login.status).toBe(303);
    expect(login.headers['location']).toBe('/archive');
    const session = login.get('Set-Cookie')?.find((c) => c.startsWith('__Host-footbag_session='));
    expect(session).toBeTruthy();

    const hop = await request(app)
      .get('/archive')
      .set('Cookie', session!.split(';')[0]);
    expect(hop.status).toBe(303);
    const target = new URL(hop.headers['location']);

    // Browsers apply form-action to every hop of the login POST's redirect
    // chain. An archive origin missing here leaves the member on the login
    // page after a successful sign-in, with nothing logged on the server.
    expect(formAction?.split(' ')).toContain(target.origin);
  });

  it('ignores request query input when building the redirect target', async () => {
    const jwt = createTestSessionJwt({ memberId: 'mem-archive', ttlSeconds: 24 * 60 * 60 });
    const res = await request(createApp())
      .get('/archive?path=/clubs/evil&redirect=https://attacker.example')
      .set('Cookie', `__Host-footbag_session=${jwt}`);
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe('https://archive.example.test');
  });
});
