/**
 * Entry point that stages auto-link candidates across every unlinked member of
 * a seeded environment. It only stages candidates for members to confirm
 * later: it mutates no live identity tables and sends no email, and re-running
 * it produces no duplicate staged candidates. The run is recorded in
 * system_job_runs so an operator can see its status and counts.
 *
 * Its environment is the seeded staging test load. Every account on the
 * launched platform is created after launch and is matched live by the
 * wizard's claim task as that task renders, so the members this pass has to
 * work with are the seeded personas waiting at the claim step: running it
 * there is what puts staged cards in front of them and exercises the
 * staged-card branch of the wizard view end to end.
 *
 * It reads the database through the app's standard connection (FOOTBAG_DB_PATH)
 * and needs the normal app runtime environment.
 *
 * Usage:
 *   npx tsx src/runBatchAutoLink.ts      (working-tree host)
 *   node dist/runBatchAutoLink.js        (compiled image)
 */
import { operationsPlatformService } from './services/operationsPlatformService';
import { logger } from './config/logger';
import { config } from './config/env';
import { initDataOrigin } from './services/dataOriginService';

export async function runBatchAutoLinkJob(
  // Defaulted from config so the real entry point needs no argument; taken as a
  // parameter so the refusal below is testable without booting a process whose
  // environment claims to be production, which the config layer refuses outright.
  footbagEnv: string | undefined = config.footbagEnv,
): Promise<number> {
  // Production is refused rather than merely unnecessary. Before launch the
  // real database carries the administrators who are testing on the preview
  // hostname, and they have finished signing up, so a suggestion staged for
  // them could never be shown to anyone: the wizard is the only surface that
  // renders one and it is closed to a member who has finished. The rows would
  // sit unreadable and unresolvable, which is exactly the state the platform is
  // meant not to produce. Nothing about the pass being harmless on production
  // was ever a property of the pass; it was a property of running it at a
  // moment when no account existed, and that moment has gone.
  if (footbagEnv === 'production') {
    logger.error('batch auto-link refused: this pass is for seeded environments, not production', {
      footbagEnv,
    });
    return 1;
  }
  // The job appends audit rows from inside database transactions, which cannot
  // read the go-live marker, so it is resolved before the first link is made.
  await initDataOrigin();
  const result = await operationsPlatformService.runBatchAutoLink();
  logger.info('batch auto-link job complete', result);
  return 0;
}

if (require.main === module) {
  runBatchAutoLinkJob()
    .then((code) => process.exit(code))
    .catch((err) => {
      logger.error('batch auto-link job failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    });
}
