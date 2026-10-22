/**
 * Worker entry point.
 *
 * Hosts four concerns in one Node process:
 *   1. Email-outbox polling loop: drains transactional emails. Polling is
 *      fine here because outbound email is not a foreground UX.
 *   2. Scheduled-jobs loop: every tick runs each job in the job registry that
 *      is due, then writes the heartbeat line the missed-run alarm reads. The
 *      registry is the only place a clock-driven job is declared; this loop
 *      knows none of them by name.
 *   3. Notification feed loop: drains the SES bounce/complaint queue and the
 *      platform alarm queue, handing each envelope to the service that owns
 *      that feed. Reading these from a queue rather than being pushed to over
 *      HTTPS is what makes a notification arriving while the platform is down
 *      wait to be read instead of being discarded.
 *   4. Curator video transcode HTTP server: receives /transcode/dispatch
 *      pushes from the web container, runs ffmpeg, posts state events back.
 *      Dispatch is event-driven; the registry's media-lease reclaim job
 *      re-runs its expired-lease recovery pass.
 *
 * All of these shut down cleanly on SIGTERM/SIGINT.
 */
import 'dotenv/config';
import type { Server } from 'node:http';
import { logger } from './config/logger';
import { config } from './config/env';
import { operationsPlatformService } from './services/operationsPlatformService';
import { createTranscodeWorker } from './transcodeWorker';
import { checkpointAndCloseDatabase } from './db/db';
import { initDataOrigin } from './services/dataOriginService';
import { outboxDepthLevel } from './lib/outboxDepthLevel';
import { JOB_TICK_MS } from './lib/jobSchedule';
import { runDueJobs, writeJobsHeartbeat } from './services/jobRegistry';

let stopping = false;

/** Pause after a feed read fails, so a persistent failure is not a hot loop. */
const FEED_ERROR_BACKOFF_MS = 30_000;

// Aborts the in-flight feed poll at shutdown. The poll waits with the
// connection open, so without this the loop is unreachable for the length of a
// wait and a shutdown lands inside one.
const feedPollAbort = new AbortController();

// Wakes every sleeping loop at shutdown, so the loops can be waited for
// without waiting out a five-minute tick.
const stopSignal = new AbortController();

// How long shutdown waits for the loops to finish their current step before
// closing the database anyway. Inside the container runtime's ten-second stop
// grace, so a hung provider call cannot hold a deploy.
const SHUTDOWN_WAIT_MS = 8_000;

// Do NOT unref() the email-outbox sleep timer: better-sqlite3 is synchronous,
// so an unref'd timer lets Node exit the event loop mid-sleep (exit code 0,
// restart-backoff masquerading as crash-loop). The HTTP server keeps Node
// alive on its own; the unref guard is still required for the off-cycle
// where the polling loop is sleeping and HTTP has no in-flight request.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (stopSignal.signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      stopSignal.signal.removeEventListener('abort', done);
      resolve();
    }
    stopSignal.signal.addEventListener('abort', done, { once: true });
  });
}

async function emailOutboxLoop(): Promise<void> {
  logger.info('worker: email-outbox loop started');
  while (!stopping) {
    try {
      await operationsPlatformService.runEmailWorker();
      // Only a backlog past the alarm's threshold is logged at warn, which feeds
      // the OutboxDepth metric in production; a normal drain logs at debug.
      const outboxDepth = operationsPlatformService.getOutboxBacklogDepth();
      logger[outboxDepthLevel(outboxDepth)]('outbox.depth', { depth: outboxDepth });
    } catch (err) {
      logger.error('worker: email-outbox unexpected error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (stopping) break;
    const intervalMs = operationsPlatformService.getOutboxPollIntervalMs();
    await sleep(intervalMs);
  }
  logger.info('worker: email-outbox loop stopped');
}

/**
 * Drains the SES bounce/complaint and platform alarm queues.
 *
 * The poll holds its connection open waiting for a message, which is what keeps
 * an idle feed cheap and is also why this loop needs an abort: for the length of
 * a wait it is unreachable, and a shutdown arriving mid-wait would otherwise sit
 * on a database that has already been closed. Aborting on the signal turns that
 * wait into an ordinary return.
 */
async function notificationFeedLoop(abortSignal: AbortSignal): Promise<void> {
  if (!operationsPlatformService.hasNotificationFeeds()) {
    logger.info('worker: notification feeds not configured, loop not started');
    return;
  }
  logger.info('worker: notification feed loop started');
  while (!stopping) {
    try {
      await operationsPlatformService.runNotificationFeeds({
        waitTimeSeconds: operationsPlatformService.getNotificationFeedWaitSeconds(),
        abortSignal,
      });
    } catch (err) {
      if (stopping) break;
      // A feed that cannot be read is one an operator must act on: bounces stop
      // reaching the suppression record and alarms stop reaching the admin
      // surface, and neither failure is visible anywhere else. The short pause
      // keeps a persistent failure from becoming a hot loop against AWS.
      logger.error('worker: notification feed unexpected error', {
        error: err instanceof Error ? err.message : String(err),
      });
      if (stopping) break;
      await sleep(FEED_ERROR_BACKOFF_MS);
    }
  }
  logger.info('worker: notification feed loop stopped');
}

/**
 * Runs the job registry on a fixed tick. Each tick runs what is due, so after a
 * restart or an outage the first tick catches up every job that fell behind,
 * then writes the heartbeat line whose absence or overdue count raises the
 * missed-run alarm.
 */
async function scheduledJobsLoop(
  reapExpiredMediaJobs: () => Promise<{ reclaimedIds: string[] }>,
): Promise<void> {
  const workerStartedAt = new Date();
  logger.info('worker: scheduled-jobs loop started', { tickMs: JOB_TICK_MS });
  while (!stopping) {
    try {
      await runDueJobs({ reapExpiredMediaJobs, shouldStop: () => stopping });
      if (stopping) break;
      writeJobsHeartbeat(new Date(), workerStartedAt);
    } catch (err) {
      logger.error('worker: scheduled-jobs unexpected error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (stopping) break;
    await sleep(JOB_TICK_MS);
  }
  logger.info('worker: scheduled-jobs loop stopped');
}

async function startTranscodeServer(): Promise<{
  close: () => Promise<void>;
  reapExpiredProcessing: () => Promise<{ reclaimedIds: string[] }>;
}> {
  const transcodeWorker = createTranscodeWorker();
  await transcodeWorker.recoverOnBoot();
  const server: Server = await new Promise((resolve) => {
    const s = transcodeWorker.app.listen(config.workerInternalPort, () => {
      logger.info('worker: transcode dispatch listening', {
        port: config.workerInternalPort,
      });
      resolve(s);
    });
  });
  return {
    close: (): Promise<void> =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    reapExpiredProcessing: transcodeWorker.reapExpiredProcessing,
  };
}

let transcodeServer: {
  close: () => Promise<void>;
  reapExpiredProcessing: () => Promise<{ reclaimedIds: string[] }>;
} | null = null;

// The running loops, so shutdown can wait for the step each is in.
const loops: Promise<void>[] = [];

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  logger.info('worker: received signal, shutting down', { signal });
  // Setting stopping and waking the sleeps ends every loop after its current
  // step. That step can be an awaited provider call (a reconciliation page, a
  // mail send) that writes to the database when it returns, so the database
  // is closed only once the loops have finished or the bounded wait runs out;
  // closing it at once would fail the step's own write and leave its run row
  // marked running. Checkpoint the WAL and close so the on-disk DB is
  // consistent for the post-stop host backup.
  stopping = true;
  stopSignal.abort();
  // The feed poll holds its connection open for a long wait, so it is cut
  // rather than waited out.
  feedPollAbort.abort();
  let waitTimer: NodeJS.Timeout | undefined;
  const waitedOut = await Promise.race([
    Promise.allSettled(loops).then(() => false),
    new Promise<boolean>((resolve) => {
      waitTimer = setTimeout(() => resolve(true), SHUTDOWN_WAIT_MS);
    }),
  ]);
  clearTimeout(waitTimer);
  if (waitedOut) {
    logger.warn('worker: a loop was still busy at shutdown; closing the database anyway', {
      waitMs: SHUTDOWN_WAIT_MS,
    });
  }
  if (transcodeServer) {
    transcodeServer.close().catch((err) => {
      logger.warn('worker: transcode server close error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
  checkpointAndCloseDatabase();
}

process.on('SIGTERM', (signal) => { void shutdown(signal); });
process.on('SIGINT', (signal) => { void shutdown(signal); });

(async () => {
  // Resolved before any loop turns, because the worker appends audit rows from
  // inside database transactions and cannot read the go-live marker there.
  await initDataOrigin();
  try {
    transcodeServer = await startTranscodeServer();
  } catch (err) {
    logger.error('worker: failed to start transcode server', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
  loops.push(emailOutboxLoop().catch((err) => {
    logger.error('worker: fatal email-outbox error', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }));
  loops.push(scheduledJobsLoop(transcodeServer.reapExpiredProcessing).catch((err) => {
    logger.error('worker: fatal scheduled-jobs loop error', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }));
  loops.push(notificationFeedLoop(feedPollAbort.signal).catch((err) => {
    logger.error('worker: fatal notification feed loop error', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }));
})();
