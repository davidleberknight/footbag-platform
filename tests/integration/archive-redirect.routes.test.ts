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

const { dbPath } = setTestEnv('4037');

process.env.ARCHIVE_URL = 'https://archive.example.test';
process.env.ARCHIVE_LOGIN_REDIRECT = '1';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db: BetterSqlite3.Database = createTestDb(dbPath);
  insertMember(db, {
    id: 'mem-archive', slug: 'mem_archive', login_email: 'archive@example.com',
    real_name: 'Archive Tester', display_name: 'Archive Tester',
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
      .set('Cookie', `footbag_session=${jwt}`);
    expect(res.status).toBe(302);
    // Exactly the landing page: no interior path, no query, nothing derived
    // from request input may reach the redirect target.
    expect(res.headers['location']).toBe('https://archive.example.test');
  });

  it('ignores request query input when building the redirect target', async () => {
    const jwt = createTestSessionJwt({ memberId: 'mem-archive', ttlSeconds: 24 * 60 * 60 });
    const res = await request(createApp())
      .get('/archive?path=/clubs/evil&redirect=https://attacker.example')
      .set('Cookie', `footbag_session=${jwt}`);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('https://archive.example.test');
  });
});
