// dotenv MUST be imported first, before any module that reads process.env
import 'dotenv/config';

import { config } from './config/env';
import { logger } from './config/logger';
import { createApp } from './app';
import { runExternalUrlBootScan } from './services/externalUrlBootScan';
// CUTOVER-REMOVE: dev/staging boot banner and tier2 invariant repair. Delete this import and the initDevShortcuts() call at production cutover.
import { initDevShortcuts } from './dev-admin-shortcuts/runtime';

const app = createApp();

/**
 * Dev-only probe: warn loudly if the image worker is unreachable, or
 * reachable but missing INTERNAL_EVENT_SECRET. Both states make every
 * authenticated upload fail with a 503 page, which is exactly the class
 * of misconfiguration that prompted this probe. No-op outside development;
 * production has health-check infrastructure that catches the same class
 * via /health/ready aggregation.
 */
async function probeImageWorkerForDev(): Promise<void> {
  if (config.footbagEnv !== 'development') return;
  const probeUrl = `${config.imageProcessorUrl.replace(/\/$/, '')}/health`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(probeUrl, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      logger.warn('dev probe: image worker reachable but unhealthy', {
        url: probeUrl,
        status: res.status,
        runbook: 'restart ./run_dev.sh; check INTERNAL_EVENT_SECRET in .env',
      });
      return;
    }
    if (!config.internalEventSecret) {
      logger.warn('dev probe: INTERNAL_EVENT_SECRET unset on web; uploads will 503', {
        runbook: 'set INTERNAL_EVENT_SECRET in .env and restart ./run_dev.sh',
      });
    }
  } catch (err) {
    logger.warn('dev probe: image worker unreachable; uploads will 503', {
      url: probeUrl,
      error: err instanceof Error ? err.message : String(err),
      runbook: 'start the image worker via ./run_dev.sh (it spawns web + image together)',
    });
  }
}

// One-shot scan for external URLs that bypassed the runtime validator
// (curator gallery sidecar seeder writes rows directly without calling the
// Node validator). Rows missing validated_at get checked here; failures land
// in quarantine_reason and are filtered out of public render. Sequential,
// blocking on startup so we never serve a partial-quarantine state.
let server: ReturnType<typeof app.listen>;
(async () => {
  try {
    await runExternalUrlBootScan({
      log: (message, fields) => {
        if (fields) logger.info(`boot-scan: ${message}`, fields);
        else logger.info(`boot-scan: ${message}`);
      },
    });
  } catch (err) {
    logger.error('external URL boot scan failed', { error: String(err) });
  }
  server = app.listen(config.port, () => {
    logger.info('server started', {
      port: config.port,
      env: config.nodeEnv,
      db: config.dbPath,
    });
    initDevShortcuts(); // CUTOVER-REMOVE
    // Fire-and-forget; never blocks server start.
    void probeImageWorkerForDev();
  });
})();

function shutdown(signal: string): void {
  logger.info('graceful shutdown initiated', { signal });
  if (server) {
    server.close(() => {
      logger.info('server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
