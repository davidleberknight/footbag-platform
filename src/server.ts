// dotenv MUST be imported first, before any module that reads process.env
import 'dotenv/config';

import { config } from './config/env';
import { logger } from './config/logger';
import { createApp } from './app';
import { runExternalUrlBootScan } from './services/externalUrlBootScan';

const app = createApp();

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
