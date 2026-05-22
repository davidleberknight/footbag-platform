/**
 * Integration tests for the transcode dispatch HTTP server hosted in the
 * worker container. Covers shared-secret auth, claim contention, success and
 * failure event emission, and boot-time orphan recovery.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { expectLoggedError } from '../setup-env';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertMediaItem } from '../fixtures/factories';
import type { MediaJobRow } from '../../src/db/db';

const { dbPath } = setTestEnv('3155');

let createMediaJobService: typeof import('../../src/services/mediaJobService').createMediaJobService;
let createTranscodeWorker: typeof import('../../src/transcodeWorker').createTranscodeWorker;

let adminId: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  adminId = insertMember(db, { id: 'member-twk-admin', is_admin: 1 });
  db.close();
  const svcMod = await import('../../src/services/mediaJobService');
  const wkMod = await import('../../src/transcodeWorker');
  createMediaJobService = svcMod.createMediaJobService;
  createTranscodeWorker = wkMod.createTranscodeWorker;
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM media_jobs').run();
  db.close();
});

const SECRET = 'test-internal-secret';

interface CapturedEvent {
  jobId: string;
  state: string;
  mediaId?: string;
  errorMessage?: string;
}

function makeWorker(opts: {
  finalize?: (job: MediaJobRow) => Promise<{ mediaId: string }>;
  events?: CapturedEvent[];
}) {
  const events = opts.events ?? [];
  return createTranscodeWorker({
    mediaJobService: createMediaJobService(),
    finalize: opts.finalize ?? (async () => ({ mediaId: 'media_default' })),
    postEvent: async (e) => {
      events.push({
        jobId: e.jobId,
        state: e.state,
        mediaId: e.mediaId,
        errorMessage: e.errorMessage,
      });
    },
    internalSecret: SECRET,
    semaphoreWaitMs: 5000,
  });
}

function seedPendingTranscode(): string {
  const svc = createMediaJobService();
  const { id } = svc.createPendingUploadJob({
    kind: 'curator_video',
    adminMemberId: adminId,
    sourceVideoKey: 'pending/twk/source.mp4',
    sourcePosterKey: 'pending/twk/source-poster.jpg',
    caption: null,
    tags: '',
    sourceFilename: 'twk.mp4',
    expiresAtIso: '2099-01-01T00:00:00.000Z',
  });
  svc.markPendingTranscode(id, adminId);
  return id;
}

function seedMediaItem(id: string): string {
  const db = new BetterSqlite3(dbPath);
  try {
    return insertMediaItem(db, { id, uploader_member_id: adminId });
  } finally {
    db.close();
  }
}

function readRow(id: string): Record<string, unknown> | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM media_jobs WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  db.close();
  return row;
}

describe('POST /transcode/dispatch — auth and validation', () => {
  it('rejects missing secret with 401', async () => {
    const w = makeWorker({});
    const res = await request(w.app).post('/transcode/dispatch').send({ jobId: 'x' });
    expect(res.status).toBe(401);
  });

  it('rejects wrong secret with 401', async () => {
    const w = makeWorker({});
    const res = await request(w.app)
      .post('/transcode/dispatch')
      .set('x-internal-secret', 'wrong')
      .send({ jobId: 'x' });
    expect(res.status).toBe(401);
  });

  it('rejects missing jobId with 400', async () => {
    const w = makeWorker({});
    const res = await request(w.app)
      .post('/transcode/dispatch')
      .set('x-internal-secret', SECRET)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects unknown jobId with 409', async () => {
    const w = makeWorker({});
    const res = await request(w.app)
      .post('/transcode/dispatch')
      .set('x-internal-secret', SECRET)
      .send({ jobId: 'mediajob_does_not_exist' });
    expect(res.status).toBe(409);
  });
});

describe('POST /transcode/dispatch — happy path', () => {
  it('returns 202, claims the row, runs finalize, and emits claimed + succeeded events', async () => {
    const events: CapturedEvent[] = [];
    seedMediaItem('media_happy_001');
    const w = makeWorker({
      finalize: async () => ({ mediaId: 'media_happy_001' }),
      events,
    });
    const jobId = seedPendingTranscode();

    const res = await request(w.app)
      .post('/transcode/dispatch')
      .set('x-internal-secret', SECRET)
      .send({ jobId });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, jobId });

    // Wait for the in-flight finalize to settle.
    await w.pendingForTests();

    const row = readRow(jobId);
    expect(row?.state).toBe('succeeded');
    expect(row?.media_id).toBe('media_happy_001');

    const states = events.map((e) => e.state);
    expect(states).toContain('claimed');
    expect(states).toContain('succeeded');
    const succeeded = events.find((e) => e.state === 'succeeded');
    expect(succeeded?.mediaId).toBe('media_happy_001');
  });

  it('cannot be double-claimed: second dispatch returns 409', async () => {
    expectLoggedError('transcodeWorker: finalize failed');
    const events: CapturedEvent[] = [];
    let resolveFinalize: (() => void) | null = null;
    const w = makeWorker({
      finalize: () =>
        new Promise<{ mediaId: string }>((resolve) => {
          resolveFinalize = () => resolve({ mediaId: 'media_double_001' });
        }),
      events,
    });
    const jobId = seedPendingTranscode();

    const first = await request(w.app)
      .post('/transcode/dispatch')
      .set('x-internal-secret', SECRET)
      .send({ jobId });
    expect(first.status).toBe(202);

    const second = await request(w.app)
      .post('/transcode/dispatch')
      .set('x-internal-secret', SECRET)
      .send({ jobId });
    expect(second.status).toBe(409);

    resolveFinalize?.();
    await w.pendingForTests();
  });
});

describe('POST /transcode/dispatch — failure path', () => {
  it('emits failed event and writes failed state when finalize throws', async () => {
    expectLoggedError('transcodeWorker: finalize failed');
    const events: CapturedEvent[] = [];
    const w = makeWorker({
      finalize: async () => {
        throw new Error('synthetic transcode failure');
      },
      events,
    });
    const jobId = seedPendingTranscode();

    await request(w.app)
      .post('/transcode/dispatch')
      .set('x-internal-secret', SECRET)
      .send({ jobId });
    await w.pendingForTests();

    const row = readRow(jobId);
    expect(row?.state).toBe('failed');
    expect(row?.last_error).toBe('synthetic transcode failure');

    const failed = events.find((e) => e.state === 'failed');
    expect(failed?.errorMessage).toBe('synthetic transcode failure');
  });
});

describe('recoverOnBoot', () => {
  it('re-enqueues orphaned processing rows whose lease has expired', async () => {
    const svc = createMediaJobService();
    const jobId = seedPendingTranscode();
    // Simulate a worker crash mid-processing: claim + then leave the lease
    // in the past.
    svc.claimForProcessing(jobId, '2024-01-01T00:00:00.000Z');

    const events: CapturedEvent[] = [];
    seedMediaItem('media_recovered_001');
    const w = makeWorker({
      finalize: async () => ({ mediaId: 'media_recovered_001' }),
      events,
    });

    const result = await w.recoverOnBoot();
    expect(result.reclaimedIds).toEqual([jobId]);
    await w.pendingForTests();

    const row = readRow(jobId);
    expect(row?.state).toBe('succeeded');
    expect(row?.media_id).toBe('media_recovered_001');
    expect(events.map((e) => e.state)).toContain('succeeded');
  });

  it('leaves rows whose lease is still valid alone', async () => {
    const svc = createMediaJobService();
    const jobId = seedPendingTranscode();
    svc.claimForProcessing(jobId, '2099-01-01T00:00:00.000Z');

    const w = makeWorker({});
    const result = await w.recoverOnBoot();
    expect(result.reclaimedIds).toEqual([]);

    const row = readRow(jobId);
    expect(row?.state).toBe('processing');
  });

  it('returns empty list when no rows in processing', async () => {
    const w = makeWorker({});
    const result = await w.recoverOnBoot();
    expect(result.reclaimedIds).toEqual([]);
  });
});

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const w = makeWorker({});
    const res = await request(w.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
