/**
 * The error page a visitor actually receives, over real routes.
 *
 * One template serves every failing route, and the number printed on it is the
 * status the response carries. The case that motivated the coverage: a request
 * answering 422 rendering a page that displays "404" and tells the visitor the
 * page does not exist and that their old link is no longer routable, which is
 * false for an admin whose submission simply failed validation.
 *
 * The other contract is the control. An error page offers one way out, home,
 * and its label names where the click lands.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3712');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import baseRequest from 'supertest';
import request from '../fixtures/supertestWithOrigin';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const ADMIN_ID = 'error-pages-admin-001';
const ADMIN_COOKIE = `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id:           ADMIN_ID,
    slug:         'error_pages_admin',
    display_name: 'Error Pages Admin',
    login_email:  'error-pages-admin@example.com',
    is_admin:     1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** The big number the visitor reads, from the error page's own code block. */
function displayedCode(html: string): string | null {
  return html.match(/class="error-code">\s*(\d+)\s*</)?.[1] ?? null;
}

function homeLinks(html: string): string[] {
  return [...html.matchAll(/<a href="([^"]*)"[^>]*class="btn btn-primary">([^<]*)<\/a>/g)]
    .map(m => `${m[2].trim()} -> ${m[1]}`);
}

describe('an unknown URL', () => {
  it('answers 404 and displays 404', async () => {
    const res = await request(createApp()).get('/no-such-page-anywhere');
    expect(res.status).toBe(404);
    expect(displayedCode(res.text)).toBe('404');
  });

  it('speaks to a visitor arriving from a link on the old site', async () => {
    const res = await request(createApp()).get('/no-such-page-anywhere');
    expect(res.text).toMatch(/no longer routable/);
  });

  it('offers exactly one control, and it goes where its label says', async () => {
    const res = await request(createApp()).get('/no-such-page-anywhere');
    expect(homeLinks(res.text)).toEqual(['Go to Home -> /']);
  });
});

describe('a state-changing request from a foreign origin', () => {
  it('answers 403 and displays 403, not 404', async () => {
    const res = await baseRequest(createApp())
      .post('/login')
      .set('Origin', 'https://attacker.example')
      .send({ email: 'nobody@example.com', password: 'irrelevant' });
    expect(res.status).toBe(403);
    expect(displayedCode(res.text)).toBe('403');
    expect(res.text).not.toMatch(/no longer routable/);
  });
});

describe('an admin submission that fails validation', () => {
  it('answers 422 and displays 422', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/any-club-id/resolve')
      .set('Cookie', ADMIN_COOKIE)
      .send({ action: 'not-a-real-action', predicate: 'not-a-real-predicate' });
    expect(res.status).toBe(422);
    expect(displayedCode(res.text)).toBe('422');
  });

  it('does not tell the admin the page does not exist', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/any-club-id/resolve')
      .set('Cookie', ADMIN_COOKIE)
      .send({ action: 'not-a-real-action', predicate: 'not-a-real-predicate' });
    expect(res.text).not.toMatch(/does not exist on footbag\.org/);
    expect(res.text).not.toMatch(/no longer routable/);
  });
});
