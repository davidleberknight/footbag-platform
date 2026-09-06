/**
 * Erasure replay entry point, run by the restore path before the restored
 * database is reachable.
 *
 * A backup taken before an erasure carries the personal data that erasure
 * removed, and it also carries the state that erasure was applied to: the
 * account is still soft-deleted, or still flagged deceased, and past its grace
 * window. The erasure ledger row recording that the shape was already applied
 * lives in the same database, so it disappears along with the erasure when an
 * older snapshot is restored. That combination is what makes the replay both
 * necessary and safe: necessary because the personal data comes back, and safe
 * because the conditions that justified removing it come back with it.
 *
 * Without this step the daily retention pass would eventually notice and purge
 * again, so nothing is permanently un-erased. The gap it closes is the window:
 * a restore otherwise serves a member's erased personal data until that pass
 * next runs, which can be most of a day, and the person asked for it to be gone.
 *
 * The scan is idempotent. Running it on a database with nothing to replay is a
 * no-op that reports zero, so the restore path can run it unconditionally
 * rather than trying to work out whether the snapshot predates an erasure.
 *
 * Usage:
 *   node dist/runErasureReplay.js
 *   npx tsx src/runErasureReplay.ts
 */
import { operationsPlatformService } from './services/operationsPlatformService';
import { initDataOrigin } from './services/dataOriginService';
import { logger } from './config/logger';

export async function runErasureReplay(): Promise<number> {
  await initDataOrigin();

  const result = await operationsPlatformService.runPiiPurgeScan();

  const errors = [
    ...result.deleted.errors,
    ...result.deceased.errors,
  ];

  process.stdout.write(
    `erasure-replay: accounts purged=${result.deleted.purged} ` +
      `(eligible=${result.deleted.eligible}, honors preserved=${result.deleted.honorsPreserved}), ` +
      `deceased scrubbed=${result.deceased.scrubbed} ` +
      `(eligible=${result.deceased.eligible})\n`,
  );

  if (errors.length > 0) {
    // Loud rather than fatal-to-the-restore: the database is already in place
    // and serving it is better than not, but an operator must know that some
    // erasures did not re-apply and act on them by hand.
    logger.error('erasure replay: some rows could not be re-applied', {
      failed: errors.length,
    });
    process.stdout.write(
      `erasure-replay: FAILED for ${errors.length} row(s); re-apply by hand before the site takes traffic\n`,
    );
    return 1;
  }

  process.stdout.write('erasure-replay: ok\n');
  return 0;
}

if (require.main === module) {
  runErasureReplay()
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      process.stderr.write(`erasure-replay: ${(err as Error).message}\n`);
      process.exit(1);
    });
}
