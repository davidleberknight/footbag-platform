/**
 * Integration tests for the async curator video upload routes:
 *   POST /ipc/job-events                                  (worker -> web push)
 *   GET  /admin/curator/upload/jobs/:jobId                (status page)
 *   GET  /admin/curator/upload/jobs/:jobId/events         (SSE stream)
 *
 * Covers shared-secret auth, anti-enumeration on the status page, SSE
 * delivery of bus-published events, and the initial-state snapshot.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-curator-async-${Date.now()}.db`);
const TEST_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-media-async-'));
const TEST_SECRET = 'a'.repeat(48);

process.env.FOOTBAG_DB_PATH    = TEST_DB_PATH;
process.env.FOOTBAG_MEDIA_DIR  = TEST_MEDIA_DIR;
process.env.FOOTBAG_CURATED_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.PORT               = '3157';
process.env.NODE_ENV           = 'test';
process.env.LOG_LEVEL          = 'error';
process.env.PUBLIC_BASE_URL    = 'http://localhost:3157';
process.env.SESSION_SECRET     = 'admin-curator-async-test-secret';
process.env.INTERNAL_EVENT_SECRET = TEST_SECRET;
// Short heartbeat so a brief read-window catches at least the initial state.
process.env.SSE_HEARTBEAT_SECONDS = '5';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { expectLoggedError } from '../setup-env';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { createTestDb } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

let createApp: typeof import('../../src/app').createApp;
let createMediaJobService: typeof import('../../src/services/mediaJobService').createMediaJobService;
let publishJobEvent: typeof import('../../src/services/jobEventBus').publishJobEvent;
let setTranscodeDispatchClientForTests: typeof import('../../src/services/transcodeDispatchClient').setTranscodeDispatchClientForTests;
let resetTranscodeDispatchClientForTests: typeof import('../../src/services/transcodeDispatchClient').resetTranscodeDispatchClientForTests;

interface DispatchedJob { jobId: string }
const dispatchedJobs: DispatchedJob[] = [];
let dispatchShouldFail = false;

const ADMIN_A = 'member-async-admin-a';
const ADMIN_B = 'member-async-admin-b';

function adminACookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_A, role: 'admin' })}`;
}
function adminBCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_B, role: 'admin' })}`;
}

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
  insertMember(db, { id: ADMIN_A, slug: 'async_admin_a', display_name: 'A', login_email: 'a@example.com', is_admin: 1 });
  insertMember(db, { id: ADMIN_B, slug: 'async_admin_b', display_name: 'B', login_email: 'b@example.com', is_admin: 1 });
  db.close();

  const appMod = await import('../../src/app');
  createApp = appMod.createApp;
  const svcMod = await import('../../src/services/mediaJobService');
  createMediaJobService = svcMod.createMediaJobService;
  const busMod = await import('../../src/services/jobEventBus');
  publishJobEvent = busMod.publishJobEvent;
  const dispatchMod = await import('../../src/services/transcodeDispatchClient');
  setTranscodeDispatchClientForTests = dispatchMod.setTranscodeDispatchClientForTests;
  resetTranscodeDispatchClientForTests = dispatchMod.resetTranscodeDispatchClientForTests;

  // Inject a fake dispatch client so /finalize tests don't make real HTTP
  // calls to a non-existent worker container.
  setTranscodeDispatchClientForTests({
    async dispatch(jobId: string) {
      if (dispatchShouldFail) {
        throw new dispatchMod.TranscodeDispatchError('synthetic dispatch failure', 500);
      }
      dispatchedJobs.push({ jobId });
    },
  });
});

afterAll(() => {
  if (resetTranscodeDispatchClientForTests) resetTranscodeDispatchClientForTests();
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
  try { fs.rmSync(TEST_MEDIA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

beforeEach(() => {
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.prepare('DELETE FROM media_jobs').run();
  db.close();
  dispatchedJobs.length = 0;
  dispatchShouldFail = false;
});

function seedJob(adminId: string, state: 'pending_upload' | 'pending_transcode' | 'processing' | 'succeeded' | 'failed' = 'pending_transcode'): string {
  const svc = createMediaJobService();
  const { id } = svc.createPendingUploadJob({
    kind: 'curator_video',
    adminMemberId: adminId,
    sourceVideoKey: 'pending/job-a/source.mp4',
    sourcePosterKey: 'pending/job-a/source-poster.jpg',
    caption: 'a clip',
    tags: '#demo_freestyle',
    sourceFilename: `clip-${Math.random().toString(36).slice(2, 8)}.mp4`,
    expiresAtIso: '2099-01-01T00:00:00.000Z',
  });
  if (state !== 'pending_upload') {
    svc.markPendingTranscode(id, adminId);
  }
  if (state === 'processing') {
    svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
  } else if (state === 'succeeded') {
    svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
    // Insert a media item to satisfy the FK before marking succeeded.
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.prepare(`
      INSERT INTO media_items (
        id, created_at, created_by, updated_at, updated_by, version,
        uploader_member_id, media_type, is_avatar, caption, uploaded_at,
        s3_key_thumb, s3_key_display, width_px, height_px, source_filename
      ) VALUES (?, datetime('now'), 'test', datetime('now'), 'test', 1, ?, 'photo', 0, NULL, datetime('now'), 'k/thumb.jpg', 'k/display.jpg', 100, 100, NULL)
    `).run(`media_${id.slice(-12)}`, adminId);
    db.close();
    svc.markSucceeded(id, `media_${id.slice(-12)}`);
  } else if (state === 'failed') {
    svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
    svc.markFailed(id, 'synthetic failure', 1);
  }
  return id;
}

// ── POST /ipc/job-events ────────────────────────────────────────────────────

describe('POST /ipc/job-events', () => {
  it('rejects missing secret with 401', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/ipc/job-events')
      .send({ jobId: 'mediajob_x', state: 'claimed' });
    expect(res.status).toBe(401);
  });

  it('rejects wrong secret with 401', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/ipc/job-events')
      .set('x-internal-secret', 'wrong')
      .send({ jobId: 'mediajob_x', state: 'claimed' });
    expect(res.status).toBe(401);
  });

  it('rejects missing jobId with 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/ipc/job-events')
      .set('x-internal-secret', TEST_SECRET)
      .send({ state: 'claimed' });
    expect(res.status).toBe(400);
  });

  it('rejects unknown state value with 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/ipc/job-events')
      .set('x-internal-secret', TEST_SECRET)
      .send({ jobId: 'mediajob_x', state: 'something_invalid' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid event and returns 204', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/ipc/job-events')
      .set('x-internal-secret', TEST_SECRET)
      .send({
        jobId: 'mediajob_x',
        state: 'claimed',
        occurredAtIso: '2026-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(204);
  });

  it('accepts the retrying state the worker emits between transcode attempts', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/ipc/job-events')
      .set('x-internal-secret', TEST_SECRET)
      .send({
        jobId: 'mediajob_x',
        state: 'retrying',
        errorMessage: 'transient transcode failure',
        occurredAtIso: '2026-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(204);
  });
});

// ── GET /admin/curator/upload/jobs/:jobId ──────────────────────────────────

describe('GET /admin/curator/upload/jobs/:jobId', () => {
  it('unauthenticated -> 302 to login', async () => {
    const app = createApp();
    const jobId = seedJob(ADMIN_A);
    const res = await request(app).get(`/admin/curator/upload/jobs/${jobId}`);
    expect(res.status).toBe(302);
  });

  it('owning admin -> 200 with state in the response', async () => {
    const app = createApp();
    const jobId = seedJob(ADMIN_A, 'processing');
    const res = await request(app)
      .get(`/admin/curator/upload/jobs/${jobId}`)
      .set('Cookie', adminACookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Transcoding now');
    expect(res.text).toContain(jobId);
    expect(res.text).toContain(`/admin/curator/upload/jobs/${jobId}/events`);
  });

  it('returns 404 for another admin (anti-enumeration)', async () => {
    const app = createApp();
    const jobId = seedJob(ADMIN_A);
    const res = await request(app)
      .get(`/admin/curator/upload/jobs/${jobId}`)
      .set('Cookie', adminBCookie());
    expect(res.status).toBe(404);
    expect(res.text).toContain('No curator upload job');
  });

  it('returns 404 for unknown jobId', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/curator/upload/jobs/mediajob_does_not_exist')
      .set('Cookie', adminACookie());
    expect(res.status).toBe(404);
  });

  it('shows succeeded message and link when state=succeeded', async () => {
    const app = createApp();
    const jobId = seedJob(ADMIN_A, 'succeeded');
    const res = await request(app)
      .get(`/admin/curator/upload/jobs/${jobId}`)
      .set('Cookie', adminACookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Transcode succeeded');
    expect(res.text).toContain('/admin/curator/media/');
  });

  it('shows failed message and back-to-upload link when state=failed', async () => {
    const app = createApp();
    const jobId = seedJob(ADMIN_A, 'failed');
    const res = await request(app)
      .get(`/admin/curator/upload/jobs/${jobId}`)
      .set('Cookie', adminACookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Transcode failed');
    expect(res.text).toContain('synthetic failure');
  });
});

// ── GET /admin/curator/upload/jobs/:jobId/events (SSE) ─────────────────────

interface SseRead {
  status: number;
  contentType: string | undefined;
  events: string[];
  destroy: () => void;
}

async function openSseStream(
  port: number,
  path: string,
  cookie: string | null,
): Promise<{ start: SseRead; readNextEvent: () => Promise<string>; destroy: () => void; status: number; contentType: string | undefined }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      port,
      hostname: '127.0.0.1',
      path,
      method: 'GET',
      headers: cookie ? { Cookie: cookie } : {},
    };
    const req = http.request(opts, (res) => {
      const events: string[] = [];
      let buffer = '';
      const eventQueue: ((value: string) => void)[] = [];

      function tryDeliver(): void {
        while (events.length > 0 && eventQueue.length > 0) {
          const next = events.shift()!;
          eventQueue.shift()!(next);
        }
      }

      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        const parts = buffer.split('\n\n');
        for (let i = 0; i < parts.length - 1; i++) {
          if (parts[i].trim().length > 0) events.push(parts[i]);
        }
        buffer = parts[parts.length - 1];
        tryDeliver();
      });
      res.on('end', () => {
        // Reject any pending listeners.
        for (const w of eventQueue) w('__END__');
      });

      const start: SseRead = {
        status: res.statusCode ?? 0,
        contentType: res.headers['content-type'],
        events,
        destroy: () => req.destroy(),
      };
      const destroy = (): void => {
        req.destroy();
      };
      function readNextEvent(): Promise<string> {
        return new Promise<string>((resolveEvent) => {
          eventQueue.push(resolveEvent);
          tryDeliver();
        });
      }
      resolve({
        start,
        readNextEvent,
        destroy,
        status: res.statusCode ?? 0,
        contentType: res.headers['content-type'],
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('GET /admin/curator/upload/jobs/:jobId/events (SSE)', () => {
  it('returns 404 for non-owner (anti-enumeration)', async () => {
    const app = createApp();
    const jobId = seedJob(ADMIN_A);
    const res = await request(app)
      .get(`/admin/curator/upload/jobs/${jobId}/events`)
      .set('Cookie', adminBCookie());
    expect(res.status).toBe(404);
  });

  it('returns 302 for unauthenticated', async () => {
    const app = createApp();
    const jobId = seedJob(ADMIN_A);
    const res = await request(app)
      .get(`/admin/curator/upload/jobs/${jobId}/events`);
    expect(res.status).toBe(302);
  });

  it('streams initial state immediately, then a published event from the bus', async () => {
    const app = createApp();
    const jobId = seedJob(ADMIN_A, 'pending_transcode');
    const server = app.listen(0);
    try {
      await new Promise<void>((r) => server.once('listening', () => r()));
      const port = (server.address() as AddressInfo).port;

      const stream = await openSseStream(port, `/admin/curator/upload/jobs/${jobId}/events`, adminACookie());
      expect(stream.status).toBe(200);
      expect(stream.contentType).toMatch(/^text\/event-stream/);

      // Initial state event.
      const first = await stream.readNextEvent();
      expect(first).toContain('event: state');
      expect(first).toContain('"state":"pending_transcode"');

      // Publish a state change and verify it streams.
      publishJobEvent({
        jobId,
        state: 'claimed',
        occurredAtIso: '2026-01-01T00:00:00.000Z',
      });
      const next = await stream.readNextEvent();
      expect(next).toContain('event: state');
      expect(next).toContain('"state":"claimed"');

      stream.destroy();
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('does not deliver events for other jobs', async () => {
    const app = createApp();
    const jobIdA = seedJob(ADMIN_A, 'pending_transcode');
    const server = app.listen(0);
    try {
      await new Promise<void>((r) => server.once('listening', () => r()));
      const port = (server.address() as AddressInfo).port;

      const stream = await openSseStream(port, `/admin/curator/upload/jobs/${jobIdA}/events`, adminACookie());
      // Drain initial state event.
      await stream.readNextEvent();

      // Publish for a different jobId.
      publishJobEvent({
        jobId: 'mediajob_unrelated',
        state: 'succeeded',
        mediaId: 'media_unrelated',
        occurredAtIso: '2026-01-01T00:00:00.000Z',
      });

      // Then publish for our jobId.
      publishJobEvent({
        jobId: jobIdA,
        state: 'succeeded',
        mediaId: 'media_for_a',
        occurredAtIso: '2026-01-01T00:00:00.000Z',
      });

      const next = await stream.readNextEvent();
      // Should be the for-a event, not the unrelated one.
      expect(next).toContain('"state":"succeeded"');
      expect(next).toContain('media_for_a');
      expect(next).not.toContain('media_unrelated');

      stream.destroy();
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});

// ── POST /admin/curator/upload/sign ────────────────────────────────────────

describe('POST /admin/curator/upload/sign', () => {
  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      videoFilename: 'clip.mp4',
      videoContentType: 'video/mp4',
      videoSizeBytes: 5 * 1024 * 1024,
      posterContentType: 'image/jpeg',
      posterSizeBytes: 100 * 1024,
      caption: 'a clip',
      tags: '#demo_freestyle',
      ...overrides,
    };
  }

  it('unauthenticated -> 302', async () => {
    const app = createApp();
    const res = await request(app).post('/admin/curator/upload/sign').send(validBody());
    expect(res.status).toBe(302);
  });

  it('missing videoFilename -> 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/sign')
      .set('Cookie', adminACookie())
      .send(validBody({ videoFilename: '' }));
    expect(res.status).toBe(400);
  });

  it('invalid video content type -> 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/sign')
      .set('Cookie', adminACookie())
      .send(validBody({ videoContentType: 'application/octet-stream' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/MP4/);
  });

  it('invalid poster content type -> 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/sign')
      .set('Cookie', adminACookie())
      .send(validBody({ posterContentType: 'image/gif' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JPEG or PNG/);
  });

  it('video too large -> 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/sign')
      .set('Cookie', adminACookie())
      .send(validBody({ videoSizeBytes: 200 * 1024 * 1024 }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Video is too large/);
  });

  it('poster too large -> 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/sign')
      .set('Cookie', adminACookie())
      .send(validBody({ posterSizeBytes: 50 * 1024 * 1024 }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Poster is too large/);
  });

  it('non-positive size -> 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/sign')
      .set('Cookie', adminACookie())
      .send(validBody({ videoSizeBytes: 0 }));
    expect(res.status).toBe(400);
  });

  it('happy path: returns jobId + URLs and inserts pending_upload row', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/sign')
      .set('Cookie', adminACookie())
      .send(validBody());
    expect(res.status).toBe(200);
    expect(res.body.jobId).toMatch(/^mediajob_/);
    expect(typeof res.body.videoUrl).toBe('string');
    expect(res.body.videoUrl.length).toBeGreaterThan(0);
    expect(typeof res.body.posterUrl).toBe('string');
    expect(typeof res.body.expiresAtIso).toBe('string');

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const row = db.prepare('SELECT * FROM media_jobs WHERE id = ?').get(res.body.jobId) as Record<string, unknown>;
    db.close();
    expect(row.state).toBe('pending_upload');
    expect(row.admin_member_id).toBe(ADMIN_A);
    expect(String(row.source_video_key)).toContain(`pending/${res.body.jobId}/`);
    expect(String(row.source_video_key)).toMatch(/source\.mp4$/);
    expect(String(row.source_poster_key)).toMatch(/poster\.jpg$/);
    expect(row.caption).toBe('a clip');
    expect(row.tags).toBe('#demo_freestyle');
  });
});

// ── POST /admin/curator/upload/finalize ────────────────────────────────────

describe('POST /admin/curator/upload/finalize', () => {
  async function signFor(adminCookie: string): Promise<{ jobId: string; videoKey: string; posterKey: string }> {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/sign')
      .set('Cookie', adminCookie)
      .send({
        videoFilename: 'finalize.mp4',
        videoContentType: 'video/mp4',
        videoSizeBytes: 1024,
        posterContentType: 'image/jpeg',
        posterSizeBytes: 1024,
        caption: 'fin',
        tags: '',
      });
    expect(res.status).toBe(200);
    const jobId = res.body.jobId as string;
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const row = db.prepare('SELECT source_video_key, source_poster_key FROM media_jobs WHERE id = ?').get(jobId) as { source_video_key: string; source_poster_key: string };
    db.close();
    return { jobId, videoKey: row.source_video_key, posterKey: row.source_poster_key };
  }

  function writeLocalMediaFile(key: string): void {
    const full = path.join(TEST_MEDIA_DIR, key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'fake-source-bytes');
  }

  it('unauthenticated -> 302', async () => {
    const app = createApp();
    const res = await request(app).post('/admin/curator/upload/finalize').send({ jobId: 'mediajob_x' });
    expect(res.status).toBe(302);
  });

  it('unknown jobId -> 404', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/finalize')
      .set('Cookie', adminACookie())
      .send({ jobId: 'mediajob_does_not_exist' });
    expect(res.status).toBe(404);
  });

  it("another admin's jobId -> 404 (anti-enumeration)", async () => {
    const { jobId, videoKey, posterKey } = await signFor(adminACookie());
    writeLocalMediaFile(videoKey);
    writeLocalMediaFile(posterKey);
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/finalize')
      .set('Cookie', adminBCookie())
      .send({ jobId });
    expect(res.status).toBe(404);
  });

  it('returns 409 if source files have not been uploaded yet', async () => {
    const { jobId } = await signFor(adminACookie());
    // Do NOT write files to disk.
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/finalize')
      .set('Cookie', adminACookie())
      .send({ jobId });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not been uploaded/);
  });

  it('rejects an uploaded video larger than the per-type max with 413 and never dispatches (the presigned PUT cannot bind size)', async () => {
    const { jobId, videoKey, posterKey } = await signFor(adminACookie());
    writeLocalMediaFile(posterKey);
    // Sparse file: logical size just over the 150 MB video max without
    // writing real bytes.
    const full = path.join(TEST_MEDIA_DIR, videoKey);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '');
    fs.truncateSync(full, 150 * 1024 * 1024 + 1);

    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/finalize')
      .set('Cookie', adminACookie())
      .send({ jobId });
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/i);
    expect(dispatchedJobs).toHaveLength(0);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const row = db.prepare('SELECT state FROM media_jobs WHERE id = ?').get(jobId) as { state: string };
    db.close();
    expect(row.state).toBe('pending_upload');
  });

  it('rejects an uploaded poster larger than the per-type max with 413 and never dispatches', async () => {
    const { jobId, videoKey, posterKey } = await signFor(adminACookie());
    writeLocalMediaFile(videoKey);
    const full = path.join(TEST_MEDIA_DIR, posterKey);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '');
    fs.truncateSync(full, 25 * 1024 * 1024 + 1);

    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/finalize')
      .set('Cookie', adminACookie())
      .send({ jobId });
    expect(res.status).toBe(413);
    expect(dispatchedJobs).toHaveLength(0);
  });

  it('happy path: transitions to pending_transcode, dispatches, returns statusUrl', async () => {
    const { jobId, videoKey, posterKey } = await signFor(adminACookie());
    writeLocalMediaFile(videoKey);
    writeLocalMediaFile(posterKey);
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/finalize')
      .set('Cookie', adminACookie())
      .send({ jobId });
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(jobId);
    expect(res.body.statusUrl).toBe(`/admin/curator/upload/jobs/${encodeURIComponent(jobId)}`);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const row = db.prepare('SELECT state FROM media_jobs WHERE id = ?').get(jobId) as { state: string };
    db.close();
    expect(row.state).toBe('pending_transcode');

    expect(dispatchedJobs).toEqual([{ jobId }]);
  });

  it('idempotent: a duplicate finalize call still dispatches and returns success', async () => {
    const { jobId, videoKey, posterKey } = await signFor(adminACookie());
    writeLocalMediaFile(videoKey);
    writeLocalMediaFile(posterKey);
    const app = createApp();
    const first = await request(app)
      .post('/admin/curator/upload/finalize')
      .set('Cookie', adminACookie())
      .send({ jobId });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/admin/curator/upload/finalize')
      .set('Cookie', adminACookie())
      .send({ jobId });
    expect(second.status).toBe(200);
    expect(dispatchedJobs).toHaveLength(2);
  });

  it('returns 502 when worker dispatch fails', async () => {
    expectLoggedError('finalize: worker dispatch failed');
    const { jobId, videoKey, posterKey } = await signFor(adminACookie());
    writeLocalMediaFile(videoKey);
    writeLocalMediaFile(posterKey);
    dispatchShouldFail = true;
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload/finalize')
      .set('Cookie', adminACookie())
      .send({ jobId });
    expect(res.status).toBe(502);
  });
});
