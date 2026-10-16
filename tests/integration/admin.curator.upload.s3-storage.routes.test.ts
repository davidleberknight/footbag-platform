/**
 * The admin curator upload form in the shape every deployed host runs: media
 * storage is the S3 adapter and the authoring tree is not written.
 *
 * Video bytes on such a host travel browser to storage through the async
 * sign, PUT and finalize path, which needs JavaScript. A video posted through
 * the plain form means JavaScript was off; it is refused with 410 and nothing
 * is stored, rather than pushed synchronously through the proxy chain.
 *
 * The storage adapter and the sidecar flag are read once per process, so this
 * shape needs a file of its own.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

// The form lists the authoring tree's categories; point that read at a temp
// tree so no run touches the repo.
const TEST_CURATED_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-curated-s3-storage-'));

const { dbPath } = setTestEnv('4207');
process.env.MEDIA_STORAGE_ADAPTER = 's3';
process.env.MEDIA_STORAGE_S3_BUCKET = 'footbag-test-media-bucket';
process.env.AWS_REGION = 'us-east-1';
process.env.ALLOW_CURATED_SIDECAR_WRITES = '0';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { insertMember, createTestSessionJwt } from '../fixtures/factories';

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'admin-curator-s3-storage-001';

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'curator_admin_s3', display_name: 'Curator Admin S3', is_admin: 1 });
  insertMember(db, { id: 'member_footbag_hacky_s3_routes', slug: 'footbag_hacky_s3_routes', display_name: 'Footbag Hacky', is_system: 1 });
  db.close();
  createApp = await importApp();
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(TEST_CURATED_DIR);
});

afterAll(async () => {
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  cleanupTestDb(dbPath);
  fs.rmSync(TEST_CURATED_DIR, { recursive: true, force: true });
});

describe('POST /admin/curator/upload on S3 storage', () => {
  it('refuses a video posted without JavaScript with 410 and stores nothing', async () => {
    const res = await request(createApp())
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'video')
      .field('caption', 'no script')
      .field('tags', '')
      .attach('mediaFile', Buffer.from('not really a video'), 'clip.mp4')
      .attach('poster', Buffer.from('not really a poster'), 'poster.jpg');
    expect(res.status).toBe(410);
    expect(res.text).toContain('Enable JavaScript');

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const media = db.prepare('SELECT COUNT(*) AS n FROM media_items').get() as { n: number };
      const jobs = db.prepare('SELECT COUNT(*) AS n FROM media_jobs').get() as { n: number };
      expect(media.n).toBe(0);
      expect(jobs.n).toBe(0);
    } finally { db.close(); }
  });
});
