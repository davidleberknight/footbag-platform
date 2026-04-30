/**
 * Integration tests for the admin dashboard route.
 *
 * Covers GET /admin: auth gate, admin gate, and dashboard content with
 * the link to the curator upload page.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-admin-dashboard-${Date.now()}.db`);

process.env.FOOTBAG_DB_PATH = TEST_DB_PATH;
process.env.PORT            = '3098';
process.env.NODE_ENV        = 'test';
process.env.LOG_LEVEL       = 'error';
process.env.PUBLIC_BASE_URL = 'http://localhost:3098';
process.env.SESSION_SECRET  = 'admin-dashboard-routes-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const ADMIN_ID  = 'admin-dashboard-001';
const MEMBER_ID = 'member-dashboard-001';

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

beforeAll(async () => {
  const schema = fs.readFileSync(
    path.join(process.cwd(), 'database', 'schema.sql'),
    'utf8',
  );
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  insertMember(db, { id: ADMIN_ID,  slug: 'dashboard_admin',  display_name: 'Dashboard Admin', login_email: 'dash-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'dashboard_member', display_name: 'Dashboard Member', login_email: 'dash-member@example.com' });
  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;
});

afterAll(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
});

describe('GET /admin', () => {
  it('unauthenticated -> 302 to /login with returnTo', async () => {
    const app = createApp();
    const res = await request(app).get('/admin');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?returnTo=%2Fadmin');
  });

  it('non-admin authenticated -> 403', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin')
      .set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin authenticated -> 200 with dashboard heading and link to curator upload', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Admin Dashboard</h1>');
    expect(res.text).toContain('href="/admin/curator/upload"');
  });
});
