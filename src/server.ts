// dotenv MUST be imported first, before any module that reads process.env
import 'dotenv/config';

import { config } from './config/env';
import { logger } from './config/logger';
import { createApp } from './app';
// CUTOVER-REMOVE: dev/staging boot-time admin shortcuts.
// Current: initDevShortcuts() prints the dev/staging boot banner and runs
//   the Tier 2 invariant repair on every startup.
// Target: remove this import and the initDevShortcuts() call below before
//   production cutover.
import { initDevShortcuts } from './dev-bootstrap/runtime';

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

// External-URL verification (Safe Browsing + reachability) deliberately does
// NOT run at server startup. Booting the app happens on every deploy, and a
// deploy must make zero third-party network callouts. Probing hundreds of
// seeded club/gallery URLs at boot also stalls the health check that the reverse
// proxy depends on, so the proxy never starts and the site 504s. Seeded rows
// render as-is until a separate, non-boot verification path stamps a
// quarantine_reason; the public read hides only rows that carry one.
const server = app.listen(config.port, () => {
  logger.info('server started', {
    port: config.port,
    env: config.nodeEnv,
    db: config.dbPath,
  });
  initDevShortcuts(); // see deviation comment on the import above
  // Fire-and-forget; never blocks server start.
  void probeImageWorkerForDev();
});

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
