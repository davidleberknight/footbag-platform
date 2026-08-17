/**
 * Integration tests for the transcode dispatch HTTP server hosted in the
 * worker container. Covers shared-secret auth, claim contention, success and
 * failure event emission, and boot-time orphan recovery.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { expectLoggedError } from '../setup-env';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertMediaItem } from '../fixtures/factories';
import type { MediaJobRow } from '../../src/db/db';

const { dbPath } = setTestEnv('3155');

let createMediaJobService: typeof import('../../src/services/mediaJobService').createMediaJobService;
let createTranscodeWorker: typeof import('../../src/transcodeWorker').createTranscodeWorker;
let VideoTranscodingError: typeof import('../../src/adapters/videoTranscodingAdapter').VideoTranscodingError;

let adminId: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  adminId = insertMember(db, { id: 'member-twk-admin', is_admin: 1 });
  db.close();
  const svcMod = await import('../../src/services/mediaJobService');
  const wkMod = await import('../../src/transcodeWorker');
  const adapterMod = await import('../../src/adapters/videoTranscodingAdapter');
  createMediaJobService = svcMod.createMediaJobService;
  createTranscodeWorker = wkMod.createTranscodeWorker;
  VideoTranscodingError = adapterMod.VideoTranscodingError;
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
  maxRetries?: number;
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
    maxRetries: opts.maxRetries,
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

describe('POST /transcode/dispatch — retry path', () => {
  it('retries a transient failure in-process and succeeds, with a retrying event in between', async () => {
    expectLoggedError('transcodeWorker: finalize failed');
    const events: CapturedEvent[] = [];
    seedMediaItem('media_retry_001');
    let attempts = 0;
    const w = makeWorker({
      finalize: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient transcode failure');
        return { mediaId: 'media_retry_001' };
      },
      events,
      maxRetries: 3,
    });
    const jobId = seedPendingTranscode();

    await request(w.app)
      .post('/transcode/dispatch')
      .set('x-internal-secret', SECRET)
      .send({ jobId });
    await w.pendingForTests();

    const row = readRow(jobId);
    expect(row?.state).toBe('succeeded');
    expect(row?.retry_count).toBe(1);
    expect(attempts).toBe(2);

    const states = events.map((e) => e.state);
    expect(states).toContain('retrying');
    expect(states).toContain('succeeded');
    const retrying = events.find((e) => e.state === 'retrying');
    expect(retrying?.errorMessage).toBe('transient transcode failure');
  });

  it('exhausts the retry budget and lands terminal failed with a final failed event', async () => {
    expectLoggedError('transcodeWorker: finalize failed');
    const events: CapturedEvent[] = [];
    const w = makeWorker({
      finalize: async () => {
        throw new Error('persistent transcode failure');
      },
      events,
      maxRetries: 2,
    });
    const jobId = seedPendingTranscode();

    await request(w.app)
      .post('/transcode/dispatch')
      .set('x-internal-secret', SECRET)
      .send({ jobId });
    await w.pendingForTests();

    const row = readRow(jobId);
    expect(row?.state).toBe('failed');
    expect(row?.retry_count).toBe(2);

    const states = events.map((e) => e.state);
    expect(states.filter((s) => s === 'retrying')).toHaveLength(1);
    expect(states[states.length - 1]).toBe('failed');
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

  it('re-enqueues a parked retry row left behind by a crash between park and re-claim', async () => {
    const svc = createMediaJobService();
    const jobId = seedPendingTranscode();
    // Simulate the crash window: a previous process claimed the job, failed
    // it retryably (parking it back in pending_transcode with retry_count 1),
    // and died before re-claiming.
    svc.claimForProcessing(jobId, '2099-01-01T00:00:00.000Z');
    const parked = svc.markFailed(jobId, 'transient failure before crash', 3);
    expect(parked.state).toBe('pending_transcode');

    const events: CapturedEvent[] = [];
    seedMediaItem('media_parked_001');
    const w = makeWorker({
      finalize: async () => ({ mediaId: 'media_parked_001' }),
      events,
      maxRetries: 3,
    });

    const result = await w.recoverOnBoot();
    expect(result.reclaimedIds).toEqual([jobId]);
    await w.pendingForTests();

    const row = readRow(jobId);
    expect(row?.state).toBe('succeeded');
  });

  it('does not hijack fresh pending_transcode rows that await their normal dispatch', async () => {
    const jobId = seedPendingTranscode();

    const w = makeWorker({});
    const result = await w.recoverOnBoot();
    expect(result.reclaimedIds).toEqual([]);

    const row = readRow(jobId);
    expect(row?.state).toBe('pending_transcode');
    expect(row?.retry_count).toBe(0);
  });
});

/**
 * The recurring expired-lease pass. A job claimed shortly before a restart
 * holds a live lease at boot, is correctly left alone there, and its lease
 * then expires with no further boot coming; this pass, run on a cycle from the
 * worker's reap loop, is what revisits the row. Only provably-dead leases are
 * reclaimed.
 */
describe('reapExpiredProcessing', () => {
  it('reclaims a processing row after its lease expires and runs it to completion', async () => {
    const svc = createMediaJobService();
    const jobId = seedPendingTranscode();
    // The orphan scenario: a previous process claimed the row, then died;
    // by the time this pass runs, the lease it held has expired.
    svc.claimForProcessing(jobId, '2024-01-01T00:00:00.000Z');

    const events: CapturedEvent[] = [];
    seedMediaItem('media_reaped_001');
    const w = makeWorker({
      finalize: async () => ({ mediaId: 'media_reaped_001' }),
      events,
    });

    const result = await w.reapExpiredProcessing();
    expect(result.reclaimedIds).toEqual([jobId]);
    await w.pendingForTests();

    const row = readRow(jobId);
    expect(row?.state).toBe('succeeded');
    expect(events.map((e) => e.state)).toContain('claimed');
    expect(events.map((e) => e.state)).toContain('succeeded');
  });

  it('never touches a processing row whose lease is still live', async () => {
    const svc = createMediaJobService();
    const jobId = seedPendingTranscode();
    svc.claimForProcessing(jobId, '2099-01-01T00:00:00.000Z');

    const w = makeWorker({});
    const result = await w.reapExpiredProcessing();
    expect(result.reclaimedIds).toEqual([]);

    const row = readRow(jobId);
    expect(row?.state).toBe('processing');
    expect(row?.lease_expires_at).toBe('2099-01-01T00:00:00.000Z');
  });

  it('leaves parked retry rows to the in-process retry loop and boot recovery', async () => {
    const svc = createMediaJobService();
    const jobId = seedPendingTranscode();
    svc.claimForProcessing(jobId, '2099-01-01T00:00:00.000Z');
    const parked = svc.markFailed(jobId, 'transient failure', 3);
    expect(parked.state).toBe('pending_transcode');

    const w = makeWorker({ maxRetries: 3 });
    const result = await w.reapExpiredProcessing();
    expect(result.reclaimedIds).toEqual([]);

    const row = readRow(jobId);
    expect(row?.state).toBe('pending_transcode');
    expect(row?.retry_count).toBe(1);
  });

  it('returns empty when nothing is stranded', async () => {
    const w = makeWorker({});
    const result = await w.reapExpiredProcessing();
    expect(result.reclaimedIds).toEqual([]);
  });
});

/**
 * A busy 503 from the media worker (slot taken, or the host below its memory
 * admission floor) is pressure, not failure: the dispatcher waits the advised
 * interval and retries the same attempt, bounded, without consuming the job's
 * retry budget.
 */
describe('busy-refusal waits', () => {
  function seedExpiredProcessing(): string {
    const svc = createMediaJobService();
    const jobId = seedPendingTranscode();
    svc.claimForProcessing(jobId, '2020-01-01T00:00:00.000Z');
    return jobId;
  }

  it('waits through busy answers and succeeds without consuming the retry budget', async () => {
    vi.useFakeTimers();
    try {
      const jobId = seedExpiredProcessing();
      const events: CapturedEvent[] = [];
      seedMediaItem('media_busy_001');
      let calls = 0;
      const w = makeWorker({
        finalize: async () => {
          calls += 1;
          if (calls <= 2) {
            throw new VideoTranscodingError('video worker returned 503: busy', 503, 5);
          }
          return { mediaId: 'media_busy_001' };
        },
        events,
        maxRetries: 1,
      });

      const result = await w.reapExpiredProcessing();
      expect(result.reclaimedIds).toEqual([jobId]);
      await vi.advanceTimersByTimeAsync(200_000);
      await w.pendingForTests();

      expect(calls).toBe(3);
      const row = readRow(jobId);
      expect(row?.state).toBe('succeeded');
      // The busy waits consumed none of the retry budget: with maxRetries 1 a
      // single markFailed would have been terminal.
      expect(row?.retry_count).toBe(0);
      expect(events.map((e) => e.state)).toContain('retrying');
      expect(events.map((e) => e.state)).toContain('succeeded');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls through to the normal failure path when the busy budget is exhausted', async () => {
    vi.useFakeTimers();
    try {
      expectLoggedError('transcodeWorker: finalize failed');
      const jobId = seedExpiredProcessing();
      const events: CapturedEvent[] = [];
      let calls = 0;
      const w = makeWorker({
        finalize: async () => {
          calls += 1;
          throw new VideoTranscodingError('video worker returned 503: busy', 503, 5);
        },
        events,
        maxRetries: 1,
      });

      await w.reapExpiredProcessing();
      await vi.advanceTimersByTimeAsync(400_000);
      await w.pendingForTests();

      // Three waited re-attempts after the first, then the budget is spent and
      // the normal markFailed path takes over (terminal at maxRetries 1).
      expect(calls).toBe(4);
      const row = readRow(jobId);
      expect(row?.state).toBe('failed');
      expect(events.map((e) => e.state)).toContain('failed');
      // The admin-facing failure text is a plain actionable sentence, not the
      // wrapped HTTP body of the busy answer.
      expect(row?.last_error).toBe(
        'the media worker stayed busy through every retry; wait a few minutes and re-upload',
      );
      expect(row?.last_error).not.toContain('503');
    } finally {
      vi.useRealTimers();
    }
  });

  it('names the host memory floor when that, and not saturation, was the refusal', async () => {
    vi.useFakeTimers();
    try {
      expectLoggedError('transcodeWorker: finalize failed');
      const jobId = seedExpiredProcessing();
      const events: CapturedEvent[] = [];
      const w = makeWorker({
        finalize: async () => {
          // The shape the adapter builds from the media worker's 503 body.
          throw new VideoTranscodingError(
            'video worker returned 503: {"error":"host memory below transcode admission floor"}',
            503,
            60,
          );
        },
        events,
        maxRetries: 1,
      });

      await w.reapExpiredProcessing();
      await vi.advanceTimersByTimeAsync(400_000);
      await w.pendingForTests();

      const row = readRow(jobId);
      expect(row?.state).toBe('failed');
      // Waiting and re-uploading is the answer to a saturated worker and not to
      // a starved host, which refuses the next upload exactly the same way, so
      // the two refusals must not share one sentence.
      expect(row?.last_error).toBe(
        'the host stayed below its transcode memory floor through every retry; ' +
          'uploads keep being refused until the host has more memory free',
      );
      expect(row?.last_error).not.toContain('503');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a non-busy failure still fails through the retry path unchanged', async () => {
    expectLoggedError('transcodeWorker: finalize failed');
    const jobId = seedExpiredProcessing();
    const events: CapturedEvent[] = [];
    const w = makeWorker({
      finalize: async () => {
        throw new VideoTranscodingError('video worker returned 500: broken', 500);
      },
      events,
      maxRetries: 1,
    });

    await w.reapExpiredProcessing();
    await w.pendingForTests();

    const row = readRow(jobId);
    expect(row?.state).toBe('failed');
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
