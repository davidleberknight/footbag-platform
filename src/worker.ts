/**
 * Worker entry point.
 *
 * Hosts two concerns in one Node process:
 *   1. Email-outbox polling loop (existing): drains transactional emails.
 *      Polling is fine here because outbound email is not a foreground UX.
 *   2. Curator video transcode HTTP server (new): receives /transcode/dispatch
 *      pushes from the web container, runs ffmpeg, posts state events back.
 *      No polling — strictly event-driven.
 *
 * Both shut down cleanly on SIGTERM/SIGINT.
 */
import 'dotenv/config';
import type { Server } from 'node:http';
import { logger } from './config/logger';
import { config } from './config/env';
import { operationsPlatformService } from './services/operationsPlatformService';
import { createTranscodeWorker } from './transcodeWorker';

let stopping = false;

// Do NOT unref() the email-outbox sleep timer: better-sqlite3 is synchronous,
// so an unref'd timer lets Node exit the event loop mid-sleep (exit code 0,
// restart-backoff masquerading as crash-loop). The HTTP server keeps Node
// alive on its own; the unref guard is still required for the off-cycle
// where the polling loop is sleeping and HTTP has no in-flight request.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function emailOutboxLoop(): Promise<void> {
  logger.info('worker: email-outbox loop started');
  while (!stopping) {
    try {
      await operationsPlatformService.runEmailWorker();
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

async function startTranscodeServer(): Promise<{ close: () => Promise<void> }> {
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
  };
}

let transcodeServer: { close: () => Promise<void> } | null = null;

function shutdown(signal: NodeJS.Signals): void {
  logger.info('worker: received signal, shutting down', { signal });
  stopping = true;
  if (transcodeServer) {
    transcodeServer.close().catch((err) => {
      logger.warn('worker: transcode server close error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

(async () => {
  try {
    transcodeServer = await startTranscodeServer();
  } catch (err) {
    logger.error('worker: failed to start transcode server', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
  emailOutboxLoop().catch((err) => {
    logger.error('worker: fatal email-outbox error', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
})();
