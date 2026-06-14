/**
 * One-time cutover entry point that stages auto-link candidates across every
 * unlinked member after the legacy data import. It only stages candidates for
 * members to confirm later: it mutates no live identity tables and sends no
 * email, and re-running it produces no duplicate staged candidates. The run is
 * recorded in system_job_runs so an operator can see its status and counts.
 *
 * It reads the database through the app's standard connection (FOOTBAG_DB_PATH)
 * and needs the normal app runtime environment, which the cutover host has.
 *
 * Usage:
 *   npx tsx src/runBatchAutoLink.ts      (working-tree host)
 *   node dist/runBatchAutoLink.js        (compiled image)
 */
import { operationsPlatformService } from './services/operationsPlatformService';
import { logger } from './config/logger';

export async function runBatchAutoLinkJob(): Promise<number> {
  const result = await operationsPlatformService.runBatchAutoLink();
  logger.info('batch auto-link cutover job complete', result);
  return 0;
}

if (require.main === module) {
  runBatchAutoLinkJob()
    .then((code) => process.exit(code))
    .catch((err) => {
      logger.error('batch auto-link cutover job failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    });
}
