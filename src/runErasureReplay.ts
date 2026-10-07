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
 * The restore runs it while the stack is down and treats anything short of the
 * final "erasure-replay: ok" line as a failed restore: the site stays stopped,
 * backups stay paused, and a marker beside the database keeps both refusing
 * across a reboot or a deploy until the replay is re-run and succeeds. A
 * restored database that has not been replayed is never served and never
 * backed up, so a nonzero exit here is what holds it back.
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
import { config } from './config/env';

export async function runErasureReplay(): Promise<number> {
  await initDataOrigin();

  const result = await operationsPlatformService.runPiiPurgeScan();

  // Every branch of the scan counts. An aged payment still carrying the
  // member's link, or an aged outbox copy still holding their address, is
  // personal data the restore brought back just as an account is.
  const errors = [
    ...result.deleted.errors,
    ...result.deceased.errors,
    ...result.payments.errors,
    ...result.outboxCopies.errors,
  ];

  process.stdout.write(
    `erasure-replay: accounts purged=${result.deleted.purged} ` +
      `(eligible=${result.deleted.eligible}, honors preserved=${result.deleted.honorsPreserved}), ` +
      `deceased scrubbed=${result.deceased.scrubbed} ` +
      `(eligible=${result.deceased.eligible}), ` +
      `payments anonymised=${result.payments.anonymized} ` +
      `(eligible=${result.payments.eligible}, failed=${result.payments.errors.length}), ` +
      `outbox copies failed=${result.outboxCopies.errors.length}\n`,
  );

  if (errors.length > 0) {
    // Fatal to the restore: some erasures did not re-apply, so the database in
    // place may still hold personal data a member asked to have erased. The
    // nonzero exit, and the missing "ok" line, keep the site stopped and the
    // backups paused until the replay is re-run and succeeds.
    logger.error('erasure replay: some rows could not be re-applied', {
      failed: errors.length,
    });
    process.stdout.write(
      `erasure-replay: FAILED for ${errors.length} row(s); finish it from a workstation with ` +
        `scripts/restore-db.sh --target ${config.footbagEnv ?? '<env>'} --resume-erasure-replay\n`,
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
