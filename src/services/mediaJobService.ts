/**
 * MediaJobService: lifecycle for the admin curator video upload path.
 *
 * The browser PUTs source bytes directly to S3, then POSTs to /finalize, which
 * calls markPendingTranscode. The web container HTTP-pushes the job id to the
 * transcode worker, which calls claimForProcessing, runs ffmpeg, and finally
 * calls markSucceeded or markFailed. A retry-eligible failure parks the row
 * back in pending_transcode with retry_count incremented; the worker re-claims
 * it immediately, and boot recovery picks up rows parked by a crash. State
 * changes are broadcast back to the web container via /ipc/job-events; this
 * service does not know about the event bus, only about persistence.
 *
 * Recovery: recoverOrphanedProcessingJobs resets rows whose dispatch lease has
 * expired (worker crashed or restarted mid-transcode). It runs at worker
 * startup and again on a recurring reap cycle, because a row claimed shortly
 * before a restart still holds a live lease at boot and its lease then expires
 * with no further boot coming. Only expired leases are ever reset; a live one
 * is proof the attempt may still be running. findDispatchablePendingTranscode
 * lists every row awaiting transcode and runs at startup only, since during
 * steady state the in-process retry loop re-claims a parked row itself. It is
 * deliberately not narrowed to rows that have already been attempted: a row
 * whose dispatch push never reached the worker has never been attempted and is
 * exactly the row nothing else will ever pick up.
 *
 * getJobForAdmin matches on (jobId, admin_member_id), so a job initiated by a
 * different admin returns null and reads as not-found (404, not 403); the admin
 * status surface cannot be enumerated. This authorization scoping is separate
 * from the in-progress optimistic lock on state transitions.
 *
 * getJobStatusForAdmin is that same scoped read for the surfaces that DISPLAY
 * the state, and it reconciles one thing on the way past: a row still waiting
 * on the browser whose upload window has closed becomes abandoned, because the
 * grants it was signed for no longer open and no bytes or finalize can follow.
 * Reconciling on the read rather than from a scan keeps the expired-lease pass
 * the only scan of this table, which is the one that has no alternative: its
 * subject is a claim that outlived the process holding it, observable no other
 * way. Finalize deliberately uses the plain read instead, because a browser
 * that finished its upload just before the window closed has bytes in storage
 * and a legitimate finalize to make, and the size check ahead of it is what
 * decides whether those bytes are really there.
 *
 * Persistence: media_jobs only.
 *
 * Side effects: none beyond media_jobs writes. No audit append, no outbox
 * enqueue, no work-queue insert; forensics for this surface live in the
 * media_jobs row itself (state, retry_count, last_error).
 *
 * Transaction discipline: every transition is a single guarded UPDATE with
 * the expected state in the WHERE clause, so no multi-statement transaction
 * is needed; concurrent claimers race the UPDATE and exactly one wins.
 *
 * Service shape: factory (createMediaJobService) with a process singleton via
 * getMediaJobService(); no injected adapters, db.ts only.
 */
import { randomUUID } from 'node:crypto';
import { mediaJobs, type MediaJobRow } from '../db/db';
import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from './serviceErrors';
import { hit as rateLimitHit } from './rateLimitService';
import { readIntConfig } from './configReader';

const ADMIN_ACTOR = 'admin';
const SYSTEM_ACTOR = 'system';

/**
 * Ceiling on what markFailed persists into last_error. The column's content is
 * rendered on the admin job-status page and carried on failure events to the
 * browser, so an unbounded upstream message (an encoder dump, a wrapped HTTP
 * body) must not ride into those surfaces on the persistence path. Callers
 * compose short messages; this cap is the guarantee, not the formatter.
 */
export const MEDIA_JOB_LAST_ERROR_MAX_LENGTH = 1000;

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
  getJobStatusForAdmin(jobId: string, adminMemberId: string): MediaJobRow | null;
  recoverOrphanedProcessingJobs(nowIso: string): RecoverResult;
  findDispatchablePendingTranscode(): MediaJobRow[];
  markAbandoned(jobId: string): void;
}

export function createMediaJobService(): MediaJobService {
  return {
    createPendingUploadJob(input) {
      if (!input.adminMemberId) {
        throw new ValidationError('adminMemberId is required.');
      }
      // Same per-admin curator-write bucket as the synchronous curator
      // writes; compromised-admin is the threat model, so no bypass.
      const max = readIntConfig('curator_write_rate_limit_per_hour', 60);
      const rl = rateLimitHit(`curator-write:${input.adminMemberId}`, max, 60);
      if (!rl.allowed) {
        throw new RateLimitedError(
          `Too many curator operations. Try again in ${rl.retryAfterSeconds} seconds.`,
          rl.retryAfterSeconds,
        );
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
      const boundedMessage = errorMessage.slice(0, MEDIA_JOB_LAST_ERROR_MAX_LENGTH);
      if (nextRetry >= maxRetries) {
        mediaJobs.markFailedTerminal.run(boundedMessage, now, SYSTEM_ACTOR, jobId);
        return { state: 'failed', retryCount: nextRetry };
      }
      mediaJobs.markFailedRetry.run(boundedMessage, now, SYSTEM_ACTOR, jobId);
      return { state: 'pending_transcode', retryCount: nextRetry };
    },

    getJobForAdmin(jobId, adminMemberId) {
      const row = mediaJobs.findByIdForAdmin.get(jobId, adminMemberId) as
        | MediaJobRow
        | undefined;
      return row ?? null;
    },

    getJobStatusForAdmin(jobId, adminMemberId) {
      const row = mediaJobs.findByIdForAdmin.get(jobId, adminMemberId) as
        | MediaJobRow
        | undefined;
      if (!row) return null;
      // A row still waiting on the browser past its upload window is an upload
      // that is not coming: the grants it was signed for no longer open, so no
      // further bytes can arrive under those keys and no finalize will follow.
      // Reconciling it when the state is asked for keeps the single scan of
      // this table the one that has to be a scan, the expired-lease pass,
      // whose subject is a claim that outlived the process holding it and can
      // therefore be observed no other way. This one has a reader by
      // definition, so it needs no pass of its own. The transition is guarded
      // on the state it expects, so two readers racing make one write and
      // agree on the answer.
      if (
        row.state === 'pending_upload' &&
        row.expires_at !== null &&
        row.expires_at <= new Date().toISOString()
      ) {
        mediaJobs.markAbandoned.run(new Date().toISOString(), SYSTEM_ACTOR, jobId);
        const reconciled = mediaJobs.findByIdForAdmin.get(jobId, adminMemberId) as
          | MediaJobRow
          | undefined;
        return reconciled ?? null;
      }
      return row;
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

    findDispatchablePendingTranscode() {
      return mediaJobs.selectDispatchablePendingTranscode.all() as MediaJobRow[];
    },

    markAbandoned(jobId) {
      const now = new Date().toISOString();
      mediaJobs.markAbandoned.run(now, SYSTEM_ACTOR, jobId);
    },
  };
}

let singleton: MediaJobService | null = null;

export function getMediaJobService(): MediaJobService {
  if (!singleton) singleton = createMediaJobService();
  return singleton;
}
