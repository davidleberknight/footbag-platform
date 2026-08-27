/**
 * The per-actor throttle on the asynchronous curator video upload.
 *
 * Signing is the abusable operation on this path: it mints two time-bounded
 * write grants against the media bucket plus the job row that goes with them,
 * before a single byte has been transferred. The threat model is a compromised
 * administrator, so the admin role does not bypass the bucket, and exhausting
 * it answers 429 with the interval to wait rather than issuing more grants.
 * The route shares one bucket with every other curator write, and it spends
 * exactly one slot per request however many operations that request performs.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-curator-sign-rl-${Date.now()}.db`);
const TEST_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-media-sign-rl-'));

process.env.FOOTBAG_DB_PATH    = TEST_DB_PATH;
process.env.FOOTBAG_MEDIA_DIR  = TEST_MEDIA_DIR;
process.env.FOOTBAG_CURATED_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.PORT               = '3163';
process.env.NODE_ENV           = 'test';
process.env.LOG_LEVEL          = 'error';
process.env.PUBLIC_BASE_URL    = 'http://localhost:3163';
process.env.SESSION_SECRET     = 'admin-curator-sign-rate-limit-secret';
process.env.INTERNAL_EVENT_SECRET = 'b'.repeat(48);

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { createTestDb } from '../fixtures/testDb';
import { insertMember, insertSystemConfig, createTestSessionJwt } from '../fixtures/factories';

let createApp: typeof import('../../src/app').createApp;

const ADMIN_A = 'member-sign-rl-admin-a';
const ADMIN_B = 'member-sign-rl-admin-b';

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'admin' })}`;
}

function signBody(name: string) {
  return {
    videoFilename: name,
    videoContentType: 'video/mp4',
    videoSizeBytes: 1024,
    posterContentType: 'image/jpeg',
    posterSizeBytes: 1024,
    caption: '',
    tags: '',
  };
}

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
  insertMember(db, { id: ADMIN_A, slug: 'sign_rl_admin_a', display_name: 'A', login_email: 'signrl-a@example.com', is_admin: 1 });
  insertMember(db, { id: ADMIN_B, slug: 'sign_rl_admin_b', display_name: 'B', login_email: 'signrl-b@example.com', is_admin: 1 });
  // Two grants per actor, so the boundary is reachable in a test without
  // issuing the production allowance.
  insertSystemConfig(db, { config_key: 'curator_write_rate_limit_per_hour', value_json: '2' });
  db.close();

  const appMod = await import('../../src/app');
  createApp = appMod.createApp;
});

afterAll(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
  try { fs.rmSync(TEST_MEDIA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('POST /admin/curator/upload/sign throttling', () => {
  it('refuses the request past the allowance with 429 and an interval to wait', async () => {
    const app = createApp();
    const cookie = cookieFor(ADMIN_A);

    const first = await request(app).post('/admin/curator/upload/sign').set('Cookie', cookie).send(signBody('one.mp4'));
    expect(first.status).toBe(200);
    const second = await request(app).post('/admin/curator/upload/sign').set('Cookie', cookie).send(signBody('two.mp4'));
    expect(second.status).toBe(200);

    const third = await request(app).post('/admin/curator/upload/sign').set('Cookie', cookie).send(signBody('three.mp4'));
    expect(third.status).toBe(429);
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    expect(third.text).toMatch(/Too many curator operations/i);
  });

  it('issues no upload grant and mints no job row for the refused request', async () => {
    const app = createApp();
    const cookie = cookieFor(ADMIN_B);

    await request(app).post('/admin/curator/upload/sign').set('Cookie', cookie).send(signBody('b-one.mp4'));
    await request(app).post('/admin/curator/upload/sign').set('Cookie', cookie).send(signBody('b-two.mp4'));
    const refused = await request(app).post('/admin/curator/upload/sign').set('Cookie', cookie).send(signBody('b-three.mp4'));

    expect(refused.status).toBe(429);
    expect(refused.body.videoUrl).toBeUndefined();
    expect(refused.body.posterUrl).toBeUndefined();

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM media_jobs WHERE admin_member_id = ?')
      .get(ADMIN_B) as { n: number };
    db.close();
    expect(n).toBe(2);
  });
});
