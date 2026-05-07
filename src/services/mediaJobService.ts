/**
 * MediaJobService: lifecycle for the admin curator video upload path.
 *
 * The browser PUTs source bytes directly to S3, then POSTs to /finalize, which
 * calls markPendingTranscode. The web container HTTP-pushes the job id to the
 * image worker, which calls claimForProcessing, runs ffmpeg, and finally calls
 * markSucceeded or markFailed. State changes are also broadcast back to the
 * web container via /ipc/job-events; this service does not know about
 * the event bus, only about persistence.
 *
 * The only periodic-ish call is recoverOrphanedProcessingJobs, invoked once at
 * worker boot to reset rows whose dispatch lease has expired (worker crashed
 * mid-transcode). There is no steady-state polling.
 */
import { randomUUID } from 'node:crypto';
import { mediaJobs, type MediaJobRow } from '../db/db';
import { ConflictError, NotFoundError, ValidationError } from './serviceErrors';

const ADMIN_ACTOR = 'admin';
const SYSTEM_ACTOR = 'system';

export type MediaJobKind = 'curator_video';
export type MediaJobState =
  | 'pending_upload'
  | 'pending_transcode'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'abandoned';

export interface CreatePendingUploadJobInput {
  // Caller-provided id. Optional; when omitted, the service mints a fresh
  // `mediajob_<uuid>` value. Callers that need to embed the id into the
  // pending S3 keys (so the keys and the row reference each other for ops
  // visibility) pre-mint and pass it through.
  jobId?: string;
  kind: MediaJobKind;
  adminMemberId: string;
  sourceVideoKey: string;
  sourcePosterKey: string;
  caption: string | null;
  tags: string;
  sourceFilename: string;
  expiresAtIso: string;
}

export interface MarkFailedResult {
  state: 'pending_transcode' | 'failed';
  retryCount: number;
}

export interface RecoverResult {
  recoveredIds: string[];
}

export interface MediaJobService {
  createPendingUploadJob(input: CreatePendingUploadJobInput): { id: string };
  markPendingTranscode(jobId: string, adminMemberId: string): void;
  claimForProcessing(jobId: string, leaseExpiresAtIso: string): MediaJobRow | null;
  markSucceeded(jobId: string, mediaId: string): void;
  markFailed(jobId: string, errorMessage: string, maxRetries: number): MarkFailedResult;
  getJobForAdmin(jobId: string, adminMemberId: string): MediaJobRow | null;
  recoverOrphanedProcessingJobs(nowIso: string): RecoverResult;
  markAbandoned(jobId: string): void;
  findExpiredPendingUploads(nowIso: string): MediaJobRow[];
}

export function createMediaJobService(): MediaJobService {
  return {
    createPendingUploadJob(input) {
      if (!input.adminMemberId) {
        throw new ValidationError('adminMemberId is required.');
      }
      if (!input.sourceVideoKey || !input.sourcePosterKey) {
        throw new ValidationError('sourceVideoKey and sourcePosterKey are required.');
      }
      if (!input.sourceFilename) {
        throw new ValidationError('sourceFilename is required.');
      }
      const id = input.jobId ?? `mediajob_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
      const now = new Date().toISOString();
      mediaJobs.insertPendingUpload.run(
        id,
        now,
        ADMIN_ACTOR,
        now,
        ADMIN_ACTOR,
        input.kind,
        input.adminMemberId,
        input.sourceVideoKey,
        input.sourcePosterKey,
        input.caption,
        input.tags,
        input.sourceFilename,
        input.expiresAtIso,
      );
      return { id };
    },

    markPendingTranscode(jobId, adminMemberId) {
      const now = new Date().toISOString();
      const result = mediaJobs.markPendingTranscode.run(now, ADMIN_ACTOR, jobId, adminMemberId);
      if (result.changes === 1) return;
      const existing = mediaJobs.findById.get(jobId) as MediaJobRow | undefined;
      if (!existing || existing.admin_member_id !== adminMemberId) {
        // Anti-enumeration: another admin's job appears as not-found.
        throw new NotFoundError('Media job not found.');
      }
      throw new ConflictError(
        `Cannot transition job ${jobId} from ${existing.state} to pending_transcode.`,
      );
    },

    claimForProcessing(jobId, leaseExpiresAtIso) {
      const now = new Date().toISOString();
      const result = mediaJobs.claimForProcessing.run(
        now,
        leaseExpiresAtIso,
        now,
        SYSTEM_ACTOR,
        jobId,
      );
      if (result.changes !== 1) return null;
      return mediaJobs.findById.get(jobId) as MediaJobRow;
    },

    markSucceeded(jobId, mediaId) {
      const now = new Date().toISOString();
      const result = mediaJobs.markSucceeded.run(mediaId, now, SYSTEM_ACTOR, jobId);
      if (result.changes !== 1) {
        const existing = mediaJobs.findById.get(jobId) as MediaJobRow | undefined;
        if (!existing) throw new NotFoundError('Media job not found.');
        throw new ConflictError(
          `Cannot mark job ${jobId} succeeded; not in 'processing' state (current: ${existing.state}).`,
        );
      }
    },

    markFailed(jobId, errorMessage, maxRetries) {
      const existing = mediaJobs.findById.get(jobId) as MediaJobRow | undefined;
      if (!existing) throw new NotFoundError('Media job not found.');
      if (existing.state !== 'processing') {
        throw new ConflictError(
          `Cannot fail job ${jobId}; not in 'processing' state (current: ${existing.state}).`,
        );
      }
      const now = new Date().toISOString();
      const nextRetry = existing.retry_count + 1;
      if (nextRetry >= maxRetries) {
        mediaJobs.markFailedTerminal.run(errorMessage, now, SYSTEM_ACTOR, jobId);
        return { state: 'failed', retryCount: nextRetry };
      }
      mediaJobs.markFailedRetry.run(errorMessage, now, SYSTEM_ACTOR, jobId);
      return { state: 'pending_transcode', retryCount: nextRetry };
    },

    getJobForAdmin(jobId, adminMemberId) {
      const row = mediaJobs.findByIdForAdmin.get(jobId, adminMemberId) as
        | MediaJobRow
        | undefined;
      return row ?? null;
    },

    recoverOrphanedProcessingJobs(nowIso) {
      const candidates = mediaJobs.selectOrphanedProcessing.all(nowIso) as MediaJobRow[];
      const recoveredIds: string[] = [];
      const updateNow = new Date().toISOString();
      for (const row of candidates) {
        const result = mediaJobs.resetOrphanedToTranscode.run(
          updateNow,
          SYSTEM_ACTOR,
          row.id,
          nowIso,
        );
        if (result.changes === 1) recoveredIds.push(row.id);
      }
      return { recoveredIds };
    },

    markAbandoned(jobId) {
      const now = new Date().toISOString();
      mediaJobs.markAbandoned.run(now, SYSTEM_ACTOR, jobId);
    },

    findExpiredPendingUploads(nowIso) {
      return mediaJobs.selectExpiredPendingUploads.all(nowIso) as MediaJobRow[];
    },
  };
}

let singleton: MediaJobService | null = null;

export function getMediaJobService(): MediaJobService {
  if (!singleton) singleton = createMediaJobService();
  return singleton;
}

export function resetMediaJobServiceForTests(): void {
  singleton = null;
}
