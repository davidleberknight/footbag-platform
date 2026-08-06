/**
 * An oversized curator upload is refused while it is still arriving.
 *
 * The per-file ceiling is enforced by the multipart parser, which raises its
 * limit event as soon as a part crosses the cap. Answering there rather than
 * when the parser finishes is the whole contract: the parser cannot finish
 * until the entire body has arrived, so a reply that waits for it makes a
 * refusal cost the curator the full transfer of a file the server had already
 * decided to reject.
 *
 * The proof is a request body that never ends. If the refusal arrives while
 * the upload is still open, the server did not wait for it.
 *
 * The suite runs against the smallest cap the configuration admits so the
 * oversized case is a couple of megabytes rather than a couple of hundred.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'node:stream';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-curator-oversize-${Date.now()}.db`);
const TEST_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-media-oversize-'));
const TEST_CURATED_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-curated-oversize-'));

process.env.FOOTBAG_DB_PATH   = TEST_DB_PATH;
process.env.FOOTBAG_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.FOOTBAG_CURATED_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.PORT              = '3101';
process.env.NODE_ENV          = 'test';
process.env.LOG_LEVEL         = 'error';
process.env.PUBLIC_BASE_URL   = 'http://localhost:3101';
process.env.SESSION_SECRET    = 'curator-oversize-test-secret';
// The floor the configuration allows. The cap under test is the one the page
// states and the refusal names, so pinning it here pins all three at once.
process.env.VIDEO_MAX_BYTES   = String(1024 * 1024);

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { createTestDb } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const ADMIN_ID = 'admin-oversize-001';
const SYSTEM_ID = 'member_footbag_hacky_oversize';

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

const CAP_BYTES = 1024 * 1024;
const CAP_LABEL = '1 MB';

/**
 * A body that pushes past the ceiling and then holds the connection open
 * without ending it, the way a browser part-way through a large file does.
 * Nothing completes this upload, so a response can only come from a server
 * that refused without waiting for the rest.
 */
function neverEndingOversizedBody(): Readable {
  const chunk = Buffer.alloc(128 * 1024);
  chunk.write('ftyp', 4, 'ascii');
  let pushed = 0;
  return new Readable({
    read() {
      if (pushed < CAP_BYTES * 2) {
        pushed += chunk.length;
        this.push(chunk);
      }
      // Deliberately never pushes null: the request body stays open.
    },
  });
}

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
  insertMember(db, {
    id: ADMIN_ID,
    slug: 'oversize_admin',
    display_name: 'Oversize Admin',
    login_email: 'oversize-admin@example.com',
    is_admin: 1,
  });
  insertMember(db, {
    id: SYSTEM_ID,
    slug: 'footbag_hacky',
    display_name: 'Footbag Hacky',
    real_name: 'Footbag Hacky',
    is_system: 1,
  });
  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;

  // The curated tree is the committed source of truth, so the service refuses
  // to touch disk until a test points it somewhere throwaway.
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(TEST_CURATED_DIR);
});

afterAll(async () => {
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(`${TEST_DB_PATH}${suffix}`); } catch { /* already gone */ }
  }
  fs.rmSync(TEST_MEDIA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_CURATED_DIR, { recursive: true, force: true });
});

describe('POST /admin/curator/upload with a file over the per-file ceiling', () => {
  it('refuses while the upload is still arriving, without waiting for the rest', async () => {
    const app = createApp();
    const body = neverEndingOversizedBody();
    try {
      const res = await request(app)
        .post('/admin/curator/upload')
        .set('Cookie', adminCookie())
        .field('mediaType', 'video')
        .attach('mediaFile', body, 'huge.mp4');
      expect(res.status).toBe(422);
      expect(res.text).toContain(`maximum allowed size of ${CAP_LABEL}`);
    } finally {
      body.destroy();
    }
  });

  it('names the configured cap rather than refusing without a figure', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'video')
      .attach('mediaFile', Buffer.alloc(CAP_BYTES + 1024), 'over-by-a-little.mp4');
    expect(res.status).toBe(422);
    expect(res.text).toContain(`File exceeded the maximum allowed size of ${CAP_LABEL}.`);
  });

  it('states the same cap on the form the curator is sent back to', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/curator/upload')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`up to ${CAP_LABEL.replace(' ', '&nbsp;')}`);
    expect(res.text).toContain(`data-video-max-bytes="${CAP_BYTES}"`);
  });
});
