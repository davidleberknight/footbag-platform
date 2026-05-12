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
 * No polling. The only DB scan anywhere in this design is recoverOnBoot,
 * called once at worker startup to reset rows orphaned by a previous crash.
 */
// dotenv MUST be imported first, before any module that reads process.env.
// Matches src/server.ts / src/worker.ts / src/imageWorker.ts. Without this
// the transcode worker spawned outside the docker compose context misses
// .env-supplied INTERNAL_EVENT_SECRET and rejects every web push with 503.
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { logger } from './config/logger';
import { config } from './config/env';
import { Semaphore } from './lib/semaphore';
import {
  getMediaJobService,
  type MediaJobService,
} from './services/mediaJobService';
import { getMediaStorageAdapter } from './adapters/mediaStorageAdapter';
import { getImageProcessingAdapter } from './adapters/imageProcessingAdapter';
import { getVideoTranscodingAdapter } from './adapters/videoTranscodingAdapter';
import { createCuratorMediaService } from './services/curatorMediaService';
import type { MediaJobRow } from './db/db';

export type DispatchJobEventState = 'claimed' | 'succeeded' | 'failed';

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
}

export interface TranscodeWorker {
  app: express.Express;
  recoverOnBoot(): Promise<{ reclaimedIds: string[] }>;
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
      try {
        mediaJobs.markFailed(job.id, message, config.mediaJobMaxRetries);
      } catch (err) {
        logger.error('transcodeWorker: markFailed after semaphore timeout failed', {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await postEvent({ jobId: job.id, state: 'failed', errorMessage: message, occurredAtIso: nowIso() });
      return;
    }
    try {
      const result = await finalize(job);
      mediaJobs.markSucceeded(job.id, result.mediaId);
      await postEvent({
        jobId: job.id,
        state: 'succeeded',
        mediaId: result.mediaId,
        occurredAtIso: nowIso(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('transcodeWorker: finalize failed', { jobId: job.id, error: message });
      let terminal = false;
      try {
        const r = mediaJobs.markFailed(job.id, message, config.mediaJobMaxRetries);
        terminal = r.state === 'failed';
      } catch (markErr) {
        logger.error('transcodeWorker: markFailed itself failed', {
          jobId: job.id,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
        // Treat as terminal so we still notify web.
        terminal = true;
      }
      if (terminal) {
        await postEvent({
          jobId: job.id,
          state: 'failed',
          errorMessage: message,
          occurredAtIso: nowIso(),
        });
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

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('transcodeWorker: unhandled error', { error: err.message });
    res.status(500).json({ error: err.message || 'transcode worker error' });
  });

  async function recoverOnBoot(): Promise<{ reclaimedIds: string[] }> {
    const recovered = mediaJobs.recoverOrphanedProcessingJobs(nowIso());
    const reclaimedIds: string[] = [];
    for (const id of recovered.recoveredIds) {
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

  return { app, recoverOnBoot, pendingForTests };
}
