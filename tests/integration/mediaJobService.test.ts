/**
 * Integration tests for MediaJobService: lifecycle for the admin curator
 * video upload path. Covers state transitions, anti-enumeration, contention
 * (two simulated dispatches cannot double-claim), retry vs terminal failure,
 * and boot-time orphan recovery.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertMediaItem } from '../fixtures/factories';

const { dbPath } = setTestEnv('3120');

let createMediaJobService: typeof import('../../src/services/mediaJobService').createMediaJobService;
let MEDIA_JOB_LAST_ERROR_MAX_LENGTH: number;
let ConflictError: typeof import('../../src/services/serviceErrors').ConflictError;
let NotFoundError: typeof import('../../src/services/serviceErrors').NotFoundError;
let ValidationError: typeof import('../../src/services/serviceErrors').ValidationError;

let adminId: string;
let otherAdminId: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  adminId = insertMember(db, { id: 'member-admin-A', is_admin: 1 });
  otherAdminId = insertMember(db, { id: 'member-admin-B', is_admin: 1 });
  db.close();
  const svcMod = await import('../../src/services/mediaJobService');
  const errMod = await import('../../src/services/serviceErrors');
  createMediaJobService = svcMod.createMediaJobService;
  MEDIA_JOB_LAST_ERROR_MAX_LENGTH = svcMod.MEDIA_JOB_LAST_ERROR_MAX_LENGTH;
  ConflictError = errMod.ConflictError;
  NotFoundError = errMod.NotFoundError;
  ValidationError = errMod.ValidationError;
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM media_jobs').run();
  db.close();
});

function readRow(id: string): Record<string, unknown> | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM media_jobs WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  db.close();
  return row;
}

function makeInput(overrides: Partial<Parameters<ReturnType<typeof createMediaJobService>['createPendingUploadJob']>[0]> = {}) {
  return {
    kind: 'curator_video' as const,
    adminMemberId: adminId,
    sourceVideoKey: 'pending/job1/source.mp4',
    sourcePosterKey: 'pending/job1/source-poster.jpg',
    caption: 'Test clip',
    tags: '#curated #test',
    sourceFilename: 'clip.mp4',
    expiresAtIso: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('createPendingUploadJob', () => {
  it('inserts a row in pending_upload state', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    const row = readRow(id);
    expect(row).toBeDefined();
    expect(row?.state).toBe('pending_upload');
    expect(row?.kind).toBe('curator_video');
    expect(row?.admin_member_id).toBe(adminId);
    expect(row?.source_video_key).toBe('pending/job1/source.mp4');
    expect(row?.source_poster_key).toBe('pending/job1/source-poster.jpg');
    expect(row?.caption).toBe('Test clip');
    expect(row?.tags).toBe('#curated #test');
    expect(row?.source_filename).toBe('clip.mp4');
    expect(row?.expires_at).toBe('2099-01-01T00:00:00.000Z');
    expect(row?.retry_count).toBe(0);
    expect(row?.media_id).toBeNull();
  });

  it('rejects missing required fields', () => {
    const svc = createMediaJobService();
    expect(() => svc.createPendingUploadJob(makeInput({ adminMemberId: '' }))).toThrow(ValidationError);
    expect(() => svc.createPendingUploadJob(makeInput({ sourceVideoKey: '' }))).toThrow(ValidationError);
    expect(() => svc.createPendingUploadJob(makeInput({ sourcePosterKey: '' }))).toThrow(ValidationError);
    expect(() => svc.createPendingUploadJob(makeInput({ sourceFilename: '' }))).toThrow(ValidationError);
  });

  it('allows null caption', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput({ caption: null }));
    expect(readRow(id)?.caption).toBeNull();
  });
});

describe('markPendingTranscode', () => {
  it('transitions pending_upload to pending_transcode and clears expires_at', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    svc.markPendingTranscode(id, adminId);
    const row = readRow(id);
    expect(row?.state).toBe('pending_transcode');
    expect(row?.expires_at).toBeNull();
  });

  it('throws NotFoundError when job is owned by another admin (anti-enumeration)', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    expect(() => svc.markPendingTranscode(id, otherAdminId)).toThrow(NotFoundError);
  });

  it('throws NotFoundError when job does not exist', () => {
    const svc = createMediaJobService();
    expect(() => svc.markPendingTranscode('mediajob_does_not_exist', adminId)).toThrow(NotFoundError);
  });

  it('throws ConflictError when job is already past pending_upload', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    svc.markPendingTranscode(id, adminId);
    expect(() => svc.markPendingTranscode(id, adminId)).toThrow(ConflictError);
  });
});

describe('claimForProcessing', () => {
  it('claims a pending_transcode row and returns it', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    svc.markPendingTranscode(id, adminId);
    const claimed = svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
    expect(claimed).not.toBeNull();
    expect(claimed?.state).toBe('processing');
    expect(claimed?.lease_expires_at).toBe('2099-01-01T00:30:00.000Z');
    expect(claimed?.last_attempted_at).toBeTruthy();
  });

  it('returns null if the job is not in pending_transcode state', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    const claimed = svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
    expect(claimed).toBeNull();
  });

  it('cannot be double-claimed: second claim returns null', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    svc.markPendingTranscode(id, adminId);
    const first = svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
    const second = svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});

describe('markSucceeded', () => {
  it('transitions processing to succeeded and stores media_id', () => {
    const db = new BetterSqlite3(dbPath);
    const mediaId = insertMediaItem(db, { id: 'media_abc123', uploader_member_id: adminId });
    db.close();
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    svc.markPendingTranscode(id, adminId);
    svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
    svc.markSucceeded(id, mediaId);
    const row = readRow(id);
    expect(row?.state).toBe('succeeded');
    expect(row?.media_id).toBe(mediaId);
    expect(row?.lease_expires_at).toBeNull();
  });

  it('throws ConflictError when job is not in processing state', () => {
    const db = new BetterSqlite3(dbPath);
    const mediaId = insertMediaItem(db, { uploader_member_id: adminId });
    db.close();
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    expect(() => svc.markSucceeded(id, mediaId)).toThrow(ConflictError);
  });

  it('throws NotFoundError for unknown job id', () => {
    const svc = createMediaJobService();
    expect(() => svc.markSucceeded('mediajob_unknown', 'media_abc')).toThrow(NotFoundError);
  });
});

describe('markFailed', () => {
  function setupProcessing(svc: ReturnType<typeof createMediaJobService>): string {
    const { id } = svc.createPendingUploadJob(makeInput());
    svc.markPendingTranscode(id, adminId);
    svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
    return id;
  }

  it('returns to pending_transcode and increments retry_count when below max', () => {
    const svc = createMediaJobService();
    const id = setupProcessing(svc);
    const result = svc.markFailed(id, 'first failure', 3);
    expect(result.state).toBe('pending_transcode');
    expect(result.retryCount).toBe(1);
    const row = readRow(id);
    expect(row?.state).toBe('pending_transcode');
    expect(row?.retry_count).toBe(1);
    expect(row?.last_error).toBe('first failure');
    expect(row?.lease_expires_at).toBeNull();
  });

  it('terminates with state=failed when retry_count would reach max', () => {
    const svc = createMediaJobService();
    const id = setupProcessing(svc);
    const r1 = svc.markFailed(id, 'first', 3);
    expect(r1.state).toBe('pending_transcode');
    svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
    const r2 = svc.markFailed(id, 'second', 3);
    expect(r2.state).toBe('pending_transcode');
    svc.claimForProcessing(id, '2099-01-01T00:30:00.000Z');
    const r3 = svc.markFailed(id, 'third', 3);
    expect(r3.state).toBe('failed');
    expect(r3.retryCount).toBe(3);
    const row = readRow(id);
    expect(row?.state).toBe('failed');
    expect(row?.last_error).toBe('third');
  });

  it('bounds an oversized error message before persisting it', () => {
    // last_error is rendered on the admin status page and carried on failure
    // events, so an upstream message of arbitrary size (a wrapped response
    // body, an encoder dump) must not ride into those surfaces via
    // persistence.
    const svc = createMediaJobService();
    const id = setupProcessing(svc);
    const oversized = 'e'.repeat(MEDIA_JOB_LAST_ERROR_MAX_LENGTH * 5);
    svc.markFailed(id, oversized, 1);
    const row = readRow(id);
    expect(row?.state).toBe('failed');
    expect((row?.last_error as string).length).toBe(MEDIA_JOB_LAST_ERROR_MAX_LENGTH);
  });

  it('throws ConflictError when not in processing state', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    expect(() => svc.markFailed(id, 'oops', 3)).toThrow(ConflictError);
  });

  it('throws NotFoundError for unknown job id', () => {
    const svc = createMediaJobService();
    expect(() => svc.markFailed('mediajob_unknown', 'oops', 3)).toThrow(NotFoundError);
  });
});

describe('getJobForAdmin', () => {
  it('returns the row for the owning admin', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    const row = svc.getJobForAdmin(id, adminId);
    expect(row?.id).toBe(id);
  });

  it('returns null for another admin (anti-enumeration)', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    const row = svc.getJobForAdmin(id, otherAdminId);
    expect(row).toBeNull();
  });

  it('returns null for unknown job id', () => {
    const svc = createMediaJobService();
    const row = svc.getJobForAdmin('mediajob_unknown', adminId);
    expect(row).toBeNull();
  });
});

describe('recoverOrphanedProcessingJobs', () => {
  it('resets rows whose lease has expired back to pending_transcode', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    svc.markPendingTranscode(id, adminId);
    svc.claimForProcessing(id, '2024-01-01T00:00:00.000Z'); // expired

    const { recoveredIds } = svc.recoverOrphanedProcessingJobs('2026-01-01T00:00:00.000Z');
    expect(recoveredIds).toEqual([id]);
    const row = readRow(id);
    expect(row?.state).toBe('pending_transcode');
    expect(row?.lease_expires_at).toBeNull();
    expect(row?.last_attempted_at).toBeNull();
  });

  it('leaves rows whose lease is still valid alone', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    svc.markPendingTranscode(id, adminId);
    svc.claimForProcessing(id, '2099-01-01T00:00:00.000Z'); // valid

    const { recoveredIds } = svc.recoverOrphanedProcessingJobs('2026-01-01T00:00:00.000Z');
    expect(recoveredIds).toEqual([]);
    const row = readRow(id);
    expect(row?.state).toBe('processing');
  });

  it('returns empty list when no rows in processing', () => {
    const svc = createMediaJobService();
    const { recoveredIds } = svc.recoverOrphanedProcessingJobs('2026-01-01T00:00:00.000Z');
    expect(recoveredIds).toEqual([]);
  });
});

describe('findDispatchablePendingTranscode', () => {
  it('returns every row awaiting transcode, whether or not it has been attempted', () => {
    // Both kinds have source bytes in storage and no process working on them.
    // A row that was failed retryably lost its dispatcher to a crash; a row
    // that has never been attempted lost its dispatch push to an unreachable
    // worker. Nothing else covers either one, so boot recovery covers both.
    const svc = createMediaJobService();
    const neverAttempted = svc.createPendingUploadJob(makeInput({ sourceVideoKey: 'pending/fresh/source.mp4' })).id;
    svc.markPendingTranscode(neverAttempted, adminId);

    const parked = svc.createPendingUploadJob(makeInput({ sourceVideoKey: 'pending/parked/source.mp4' })).id;
    svc.markPendingTranscode(parked, adminId);
    svc.claimForProcessing(parked, '2099-01-01T00:00:00.000Z');
    const r = svc.markFailed(parked, 'transient failure', 3);
    expect(r.state).toBe('pending_transcode');

    const rows = svc.findDispatchablePendingTranscode();
    expect(rows.map((row) => row.id).sort()).toEqual([neverAttempted, parked].sort());
  });

  it('excludes rows that are not awaiting transcode', () => {
    const svc = createMediaJobService();
    const stillUploading = svc.createPendingUploadJob(makeInput({ sourceVideoKey: 'pending/uploading/source.mp4' })).id;

    const claimed = svc.createPendingUploadJob(makeInput({ sourceVideoKey: 'pending/claimed/source.mp4' })).id;
    svc.markPendingTranscode(claimed, adminId);
    svc.claimForProcessing(claimed, '2099-01-01T00:00:00.000Z');

    const rows = svc.findDispatchablePendingTranscode().map((row) => row.id);
    expect(rows).not.toContain(stillUploading);
    expect(rows).not.toContain(claimed);
  });
});

describe('markAbandoned', () => {
  it('marks a row still waiting on the browser as abandoned', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    svc.markAbandoned(id);
    expect(readRow(id)?.state).toBe('abandoned');
  });

  it('is a no-op on rows past pending_upload', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput());
    svc.markPendingTranscode(id, adminId);
    svc.markAbandoned(id);
    const row = readRow(id);
    expect(row?.state).toBe('pending_transcode');
  });
});

/**
 * The status read reconciles one thing the state machine cannot learn any
 * other way from an event: an upload the browser never finished. The grants it
 * was signed for stop opening at the recorded moment, so no further bytes and
 * no finalize can follow, and the row would otherwise say it is still
 * uploading for as long as it exists.
 */
describe('getJobStatusForAdmin', () => {
  it('reconciles a row whose upload window has closed to abandoned', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput({ expiresAtIso: '2024-01-01T00:00:00.000Z' }));

    const job = svc.getJobStatusForAdmin(id, adminId);
    expect(job?.state).toBe('abandoned');
    // Reconciled on the row itself, not only in what this call returned.
    expect(readRow(id)?.state).toBe('abandoned');
  });

  it('leaves a row whose window is still open alone', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput({ expiresAtIso: '2099-01-01T00:00:00.000Z' }));

    expect(svc.getJobStatusForAdmin(id, adminId)?.state).toBe('pending_upload');
    expect(readRow(id)?.state).toBe('pending_upload');
  });

  it('never reconciles a row that is past waiting on the browser', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput({ expiresAtIso: '2024-01-01T00:00:00.000Z' }));
    svc.markPendingTranscode(id, adminId);

    expect(svc.getJobStatusForAdmin(id, adminId)?.state).toBe('pending_transcode');
    expect(readRow(id)?.state).toBe('pending_transcode');
  });

  it('keeps the owner scoping of the plain read: another admin sees nothing', () => {
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput({ expiresAtIso: '2024-01-01T00:00:00.000Z' }));

    expect(svc.getJobStatusForAdmin(id, 'member-someone-else')).toBeNull();
    // And the row another admin could not see was not reconciled on their behalf.
    expect(readRow(id)?.state).toBe('pending_upload');
  });

  it('leaves the finalize path reading the unreconciled row, so a late finish still completes', () => {
    // An upload that finished just before its window closed has bytes in
    // storage and a legitimate finalize to make. The plain read finalize uses
    // must not reconcile the row out from under it.
    const svc = createMediaJobService();
    const { id } = svc.createPendingUploadJob(makeInput({ expiresAtIso: '2024-01-01T00:00:00.000Z' }));

    expect(svc.getJobForAdmin(id, adminId)?.state).toBe('pending_upload');
    expect(readRow(id)?.state).toBe('pending_upload');
    svc.markPendingTranscode(id, adminId);
    expect(readRow(id)?.state).toBe('pending_transcode');
  });
});
