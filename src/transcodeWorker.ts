/**
 * Transcode dispatch HTTP server, hosted in the worker container.
 *
 * The worker container already owns the email-outbox polling loop in
 * src/worker.ts. This module adds an HTTP server alongside it so the web
 * container can push admin curator video transcode jobs over the docker
 * internal network. Web POSTs /transcode/dispatch with a job id; the worker
 * claims the media_jobs row, runs ffmpeg in the background (via the existing
 * image worker over HTTP), writes the final media_items row, and POSTs state
 * transitions back to web's /ipc/job-events.
 *
 * Recovery scans: recoverOnBoot runs once at worker startup and resets rows
 * orphaned by a previous crash, and reapExpiredProcessing repeats the
 * expired-lease pass on a cycle (driven from src/worker.ts). The recurring
 * pass exists because a lease can outlive the process that holds it: a row
 * claimed shortly before a restart still holds a live lease when the boot
 * sweep runs, is correctly left alone, and would otherwise never be looked at
 * again. Only provably-dead leases are ever reclaimed; a live one is never
 * touched, whatever process topology is running.
 */
// dotenv MUST be imported first, before any module that reads process.env.
// Matches src/server.ts / src/worker.ts / src/imageWorker.ts. Without this
// the transcode worker spawned outside the docker compose context misses
// .env-supplied INTERNAL_EVENT_SECRET and rejects every web push with 503.
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { logger } from './config/logger';
import {
  config,
  TRANSCODE_BUSY_RETRIES,
  TRANSCODE_BUSY_WAIT_MAX_SECONDS,
} from './config/env';
import { VideoTranscodingError } from './adapters/videoTranscodingAdapter';
import { Semaphore } from './lib/semaphore';
import { TRANSCODE_ADMISSION_REFUSAL } from './lib/hostMemory';
import {
  getMediaJobService,
  MEDIA_JOB_LAST_ERROR_MAX_LENGTH,
  type MediaJobService,
} from './services/mediaJobService';
import { getMediaStorageAdapter } from './adapters/mediaStorageAdapter';
import { getImageProcessingAdapter } from './adapters/imageProcessingAdapter';
import { getVideoTranscodingAdapter } from './adapters/videoTranscodingAdapter';
import { getSesAdapter, getStubSesAdapterForTests } from './adapters/sesAdapter';
import { createCuratorMediaService } from './services/curatorMediaService';
import type { MediaJobRow } from './db/db';

export type DispatchJobEventState = 'claimed' | 'retrying' | 'succeeded' | 'failed';

export interface DispatchJobEventPayload {
  jobId: string;
  state: DispatchJobEventState;
  mediaId?: string;
  errorMessage?: string;
  occurredAtIso: string;
}

export type FinalizeImpl = (job: MediaJobRow) => Promise<{ mediaId: string }>;
export type WebEventPoster = (event: DispatchJobEventPayload) => Promise<void>;

export interface TranscodeWorkerOptions {
  mediaJobService?: MediaJobService;
  // Test seam: substitute the actual ffmpeg / S3 work.
  finalize?: FinalizeImpl;
  // Test seam: capture state notifications without making real HTTP calls.
  postEvent?: WebEventPoster;
  // Test seam: override the shared-secret expectation. Default reads from
  // config.internalEventSecret.
  internalSecret?: string;
  // Test seam: cap concurrent transcodes. Defaults to 1, matching the image
  // container's IMAGE_VIDEO_MAX_CONCURRENT.
  maxConcurrent?: number;
  semaphoreWaitMs?: number;
  // Test seam: retry budget per job. Defaults to config.mediaJobMaxRetries
  // (env MEDIA_JOB_MAX_RETRIES).
  maxRetries?: number;
}

export interface TranscodeWorker {
  app: express.Express;
  recoverOnBoot(): Promise<{ reclaimedIds: string[] }>;
  reapExpiredProcessing(): Promise<{ reclaimedIds: string[] }>;
  // Awaited only by tests. Production fires-and-forgets after responding 202.
  pendingForTests(): Promise<void>;
}

const SECRET_HEADER = 'x-internal-secret';

function defaultPostEvent(secret: string | undefined): WebEventPoster {
  return async (event) => {
    if (!secret) {
      logger.warn('transcodeWorker: dropping event, no INTERNAL_EVENT_SECRET configured', {
        jobId: event.jobId,
        state: event.state,
      });
      return;
    }
    const url = `${config.webInternalUrl.replace(/\/$/, '')}/ipc/job-events`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SECRET_HEADER]: secret,
        },
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        logger.warn('transcodeWorker: web rejected job event', {
          jobId: event.jobId,
          state: event.state,
          status: res.status,
        });
      }
    } catch (err) {
      logger.warn('transcodeWorker: failed to post job event', {
        jobId: event.jobId,
        state: event.state,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

/**
 * The admin-facing sentence for a busy refusal that outlasted every wait, or
 * null when the failure was not a busy refusal at all. A short actionable
 * sentence replaces the wrapped HTTP body, because the admin's lever is what to
 * do next, not the transport detail.
 *
 * The two refusals are told apart because they ask different things of whoever
 * reads them. A saturated worker clears on its own, so waiting and re-uploading
 * is the whole answer. A host that stayed under its transcode memory floor will
 * refuse the next upload the same way, and pointing that reader at "wait and
 * try again" sends them round a loop that cannot end until the host is given
 * more free memory.
 */
function busyRefusalMessage(err: unknown): string | null {
  if (!(err instanceof VideoTranscodingError) || err.status !== 503) return null;
  if (err.message.includes(TRANSCODE_ADMISSION_REFUSAL)) {
    return (
      'the host stayed below its transcode memory floor through every retry; ' +
      'uploads keep being refused until the host has more memory free'
    );
  }
  return 'the media worker stayed busy through every retry; wait a few minutes and re-upload';
}

function defaultFinalize(): FinalizeImpl {
  // Lazy-construct so unit tests that don't touch the real adapters never
  // import them.
  let svc: ReturnType<typeof createCuratorMediaService> | null = null;
  return async (job) => {
    if (!svc) {
      svc = createCuratorMediaService({
        storage: getMediaStorageAdapter(),
        imageProcessor: getImageProcessingAdapter(),
        videoTranscoder: getVideoTranscodingAdapter(),
      });
    }
    return svc.finalizeTranscodeForJob(job);
  };
}

export function createTranscodeWorker(opts: TranscodeWorkerOptions = {}): TranscodeWorker {
  const mediaJobs = opts.mediaJobService ?? getMediaJobService();
  const finalize = opts.finalize ?? defaultFinalize();
  const internalSecret = opts.internalSecret ?? config.internalEventSecret;
  const postEvent = opts.postEvent ?? defaultPostEvent(internalSecret);
  const maxConcurrent = opts.maxConcurrent ?? 1;
  const semaphoreWaitMs = opts.semaphoreWaitMs ?? 10 * 60 * 1000;
  const maxRetries = opts.maxRetries ?? config.mediaJobMaxRetries;
  const semaphore = new Semaphore(maxConcurrent, semaphoreWaitMs);
  const inFlight = new Set<Promise<void>>();

  function leaseExpiresAt(): string {
    return new Date(Date.now() + config.mediaJobLeaseSeconds * 1000).toISOString();
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function trackInFlight(p: Promise<void>): void {
    inFlight.add(p);
    p.finally(() => inFlight.delete(p));
  }

  async function runJob(job: MediaJobRow): Promise<void> {
    let acquired = false;
    try {
      await semaphore.acquire();
      acquired = true;
    } catch {
      const message = 'transcode worker semaphore acquire timed out';
      logger.warn('transcodeWorker: semaphore timeout', { jobId: job.id });
      let terminal = true;
      try {
        const r = mediaJobs.markFailed(job.id, message, maxRetries);
        terminal = r.state === 'failed';
      } catch (err) {
        logger.error('transcodeWorker: markFailed after semaphore timeout failed', {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // No in-process re-run here: the semaphore is saturated, so a
      // retry-eligible row waits for the next boot recovery or finalize
      // dispatch instead of re-queueing on the same contended slot.
      await postEvent({
        jobId: job.id,
        state: terminal ? 'failed' : 'retrying',
        errorMessage: message,
        occurredAtIso: nowIso(),
      });
      return;
    }
    try {
      let current: MediaJobRow | null = job;
      let busyWaits = 0;
      while (current) {
        const attempt = current;
        // Only the encode itself is guarded here. The bookkeeping that follows
        // a finished encode is deliberately outside this block: finalize
        // commits the media row and its audit entry before it returns, so a
        // failure recording that outcome is not a transcode failure and must
        // never be reported to the curator as one.
        let result: { mediaId: string };
        try {
          result = await finalize(attempt);
        } catch (err) {
          // A busy answer from the media worker (slot taken, or the host is
          // below its memory admission floor) is pressure, not failure: wait
          // the advised interval and try the same attempt again, without
          // consuming the job's retry budget. Bounded by TRANSCODE_BUSY_RETRIES
          // waits, and the lease cross-check in the config guarantees the
          // lease outlasts an attempt plus every wait this may take.
          if (
            err instanceof VideoTranscodingError &&
            err.status === 503 &&
            busyWaits < TRANSCODE_BUSY_RETRIES
          ) {
            busyWaits += 1;
            const waitSeconds = Math.min(
              Math.max(err.retryAfterSeconds ?? 20, 5),
              TRANSCODE_BUSY_WAIT_MAX_SECONDS,
            );
            logger.warn('transcodeWorker: media worker busy, waiting to retry', {
              jobId: attempt.id,
              waitSeconds,
              busyWaits,
            });
            await postEvent({
              jobId: attempt.id,
              state: 'retrying',
              errorMessage: 'media worker busy; waiting to retry',
              occurredAtIso: nowIso(),
            });
            await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
            continue;
          }
          // Bounded once here: this string is persisted as last_error and
          // rides the retrying/failed events to the admin's browser, and an
          // upstream failure can arrive carrying a wrapped response body of
          // arbitrary size.
          const message =
            busyRefusalMessage(err) ??
            (err instanceof Error ? err.message : String(err)).slice(
              0,
              MEDIA_JOB_LAST_ERROR_MAX_LENGTH,
            );
          logger.error('transcodeWorker: finalize failed', { jobId: attempt.id, error: message });
          let terminal = false;
          try {
            const r = mediaJobs.markFailed(attempt.id, message, maxRetries);
            terminal = r.state === 'failed';
          } catch (markErr) {
            logger.error('transcodeWorker: markFailed itself failed', {
              jobId: attempt.id,
              error: markErr instanceof Error ? markErr.message : String(markErr),
            });
            // Treat as terminal so we still notify web.
            terminal = true;
          }
          if (terminal) {
            await postEvent({
              jobId: attempt.id,
              state: 'failed',
              errorMessage: message,
              occurredAtIso: nowIso(),
            });
            return;
          }
          // Retry-eligible: markFailed parked the row back in
          // pending_transcode. Re-claim and run it again while we still hold
          // the transcode slot; retry_count vs maxRetries bounds the loop.
          // The event keeps the admin status page live through the retry.
          await postEvent({
            jobId: attempt.id,
            state: 'retrying',
            errorMessage: message,
            occurredAtIso: nowIso(),
          });
          current = mediaJobs.claimForProcessing(attempt.id, leaseExpiresAt());
          // A null claim means another dispatcher won the row; it finishes
          // there, not here.
          continue;
        }

        // The encode finished and the media row, its tags and its audit entry
        // are committed. Recording that on the job row can still fail, because
        // the transition refuses a row that is no longer processing, which is
        // what a reclaimed lease leaves behind. That is an operator's problem
        // and not the curator's: their upload exists and is openable, so the
        // event tells them so and the failure to record it is logged for
        // someone who can reconcile the row.
        try {
          mediaJobs.markSucceeded(attempt.id, result.mediaId);
        } catch (bookkeepingErr) {
          logger.error('transcodeWorker: could not record a finished job as succeeded', {
            jobId: attempt.id,
            mediaId: result.mediaId,
            error:
              bookkeepingErr instanceof Error
                ? bookkeepingErr.message
                : String(bookkeepingErr),
          });
        }
        await postEvent({
          jobId: attempt.id,
          state: 'succeeded',
          mediaId: result.mediaId,
          occurredAtIso: nowIso(),
        });
        return;
      }
    } finally {
      if (acquired) semaphore.release();
    }
  }

  function dispatchClaimed(jobId: string, claimed: MediaJobRow): void {
    const claimedAt = nowIso();
    const claimedEvent = postEvent({ jobId, state: 'claimed', occurredAtIso: claimedAt }).catch(
      () => undefined,
    );
    const finalizeRun = runJob(claimed);
    trackInFlight(Promise.all([claimedEvent, finalizeRun]).then(() => undefined));
  }

  const app = express();
  app.use(express.json({ limit: '4kb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // Web container POSTs here when a media_jobs row reaches pending_transcode.
  // Shared-secret auth (docker network is also an isolation layer; this is
  // belt-and-suspenders).
  app.post('/transcode/dispatch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!internalSecret) {
        res.status(503).json({ error: 'INTERNAL_EVENT_SECRET not configured' });
        return;
      }
      if (req.header(SECRET_HEADER) !== internalSecret) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const body = req.body as { jobId?: unknown };
      const jobId = body?.jobId;
      if (typeof jobId !== 'string' || jobId.length === 0) {
        res.status(400).json({ error: 'jobId required' });
        return;
      }
      const claimed = mediaJobs.claimForProcessing(jobId, leaseExpiresAt());
      if (!claimed) {
        res.status(409).json({ error: 'job not in pending_transcode state' });
        return;
      }
      // Respond 202 immediately; finalize runs in the background.
      res.status(202).json({ accepted: true, jobId });
      dispatchClaimed(jobId, claimed);
    } catch (err) {
      next(err);
    }
  });

  // Dev/staging only: the email-outbox loop runs in this worker process, so its
  // StubSesAdapter captures every worker-drained message in memory. The web
  // container's /dev/outbox viewer reads its own (separate) buffer, so it fetches
  // this endpoint to merge in the worker-captured messages a tester would
  // otherwise never see. Registered only under SES_ADAPTER=stub; shared-secret
  // authed like /transcode/dispatch. Never present in production (live adapter).
  if (config.sesAdapter === 'stub') {
    app.get('/dev/outbox-capture', (req: Request, res: Response) => {
      if (!internalSecret) {
        res.status(503).json({ error: 'INTERNAL_EVENT_SECRET not configured' });
        return;
      }
      if (req.header(SECRET_HEADER) !== internalSecret) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      // Force adapter init so the buffer exists even before the first drain.
      getSesAdapter();
      const stub = getStubSesAdapterForTests();
      res.status(200).json({ messages: stub ? [...stub.sentMessages] : [] });
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('transcodeWorker: unhandled error', { error: err.message });
    res.status(500).json({ error: err.message || 'transcode worker error' });
  });

  // Reset every processing row whose lease has expired, then re-claim and
  // re-dispatch each one. Runs at boot and again on a cycle, because a row
  // claimed shortly before a restart holds a live lease when the boot pass
  // runs and its lease then expires with no further boot coming. A live lease
  // is never touched: expiry is the proof that the process holding it is gone.
  async function reapExpiredProcessing(): Promise<{ reclaimedIds: string[] }> {
    const recovered = mediaJobs.recoverOrphanedProcessingJobs(nowIso());
    const reclaimedIds: string[] = [];
    for (const id of recovered.recoveredIds) {
      const claimed = mediaJobs.claimForProcessing(id, leaseExpiresAt());
      if (!claimed) continue;
      reclaimedIds.push(id);
      dispatchClaimed(id, claimed);
    }
    if (reclaimedIds.length > 0) {
      // warn, not info: an expired lease means a job was stranded mid-run,
      // which an operator should see in production logs.
      logger.warn('transcodeWorker: reclaimed expired-lease media jobs', {
        count: reclaimedIds.length,
      });
    }
    return { reclaimedIds };
  }

  async function recoverOnBoot(): Promise<{ reclaimedIds: string[] }> {
    const orphanReclaims = await reapExpiredProcessing();
    // Every row still awaiting transcode: one a previous process failed
    // retryably and then crashed before re-claiming, and one whose dispatch
    // push never arrived because the worker was unreachable when the browser
    // finalized. The second kind has been attempted zero times and no other
    // pass covers it — the recurring reap looks only at claimed rows with dead
    // leases — so without this it waits forever while its status page says the
    // transcode is about to start. Boot-only: during steady state the
    // in-process retry loop re-claims a parked row itself, and a recurring
    // pass could race it. The guarded claim keeps a row that the orphan pass
    // already reclaimed from being dispatched twice.
    const awaitingTranscodeIds = mediaJobs
      .findDispatchablePendingTranscode()
      .map((row) => row.id)
      .filter((id) => !orphanReclaims.reclaimedIds.includes(id));
    const reclaimedIds = [...orphanReclaims.reclaimedIds];
    for (const id of awaitingTranscodeIds) {
      const claimed = mediaJobs.claimForProcessing(id, leaseExpiresAt());
      if (!claimed) continue;
      reclaimedIds.push(id);
      dispatchClaimed(id, claimed);
    }
    if (reclaimedIds.length > 0) {
      logger.info('transcodeWorker: re-enqueued orphaned jobs on boot', {
        count: reclaimedIds.length,
      });
    }
    return { reclaimedIds };
  }

  async function pendingForTests(): Promise<void> {
    while (inFlight.size > 0) {
      await Promise.all(Array.from(inFlight));
    }
  }

  return { app, recoverOnBoot, reapExpiredProcessing, pendingForTests };
}
