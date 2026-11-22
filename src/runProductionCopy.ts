/**
 * Production copy entry point, run on a host by the copy script.
 *
 * Builds a copy of the database at `--source` into this process's own
 * database file, the one `FOOTBAG_DB_PATH` names, which must be new and
 * empty. It first takes an online backup of the source into a private snapshot
 * beside the copy, so the live database is only ever read and its writers are
 * never blocked, then hands the snapshot to the copy service, which follows the
 * column register and proves the result. The snapshot still holds every
 * credential, so it is deleted whatever happens. A refused or failed build
 * deletes the copy too: a half-built copy is never left where it could be
 * mistaken for a finished one.
 *
 * The script treats anything short of the final "production-copy: ok" line as
 * a failed copy.
 *
 * Usage:
 *   node dist/runProductionCopy.js --source <path to the live database>
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config/env';
import { logger } from './config/logger';
import { openDatabaseReadOnly } from './db/openDatabase';
import { checkpointAndCloseDatabase } from './db/db';
import { ProductionCopyRefusal, productionCopyService } from './services/productionCopyService';

function sourceFromArgs(argv: string[]): string | null {
  const i = argv.indexOf('--source');
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

function removeDatabaseFiles(file: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(`${file}${suffix}`, { force: true });
}

export async function runProductionCopy(argv: string[]): Promise<number> {
  const source = sourceFromArgs(argv);
  if (!source) {
    process.stderr.write('production-copy: --source <live database> is required\n');
    return 2;
  }
  const target = path.resolve(config.dbPath);
  if (path.resolve(source) === target) {
    process.stderr.write('production-copy: the copy cannot be built into the database it copies\n');
    return 2;
  }
  if (!fs.existsSync(source)) {
    process.stderr.write(`production-copy: no database at ${source}\n`);
    return 2;
  }

  const snapshot = path.join(path.dirname(target), `snapshot-${process.pid}.db`);
  let succeeded = false;
  try {
    // Read-only and never created: the live database is only ever read here,
    // and no startup setting of the site's own connection is applied to it.
    const live = openDatabaseReadOnly(source);
    try {
      await live.backup(snapshot);
    } finally {
      live.close();
    }
    fs.chmodSync(snapshot, 0o600);

    const report = productionCopyService.buildFromSnapshot(snapshot);
    productionCopyService.settle();
    for (const t of report.tables) process.stdout.write(`production-copy: copied ${t.table} ${t.rows}\n`);
    for (const t of report.notCopied) process.stdout.write(`production-copy: not copied ${t}\n`);
    process.stdout.write(`production-copy: copied at ${report.copiedAt}\n`);
    succeeded = true;
  } catch (err) {
    if (err instanceof ProductionCopyRefusal) {
      for (const reason of err.reasons) process.stderr.write(`production-copy: refused: ${reason}\n`);
    } else {
      logger.error('production copy failed', { errorClass: err instanceof Error ? err.name : typeof err });
      process.stderr.write(`production-copy: failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  } finally {
    checkpointAndCloseDatabase();
    removeDatabaseFiles(snapshot);
    if (!succeeded) removeDatabaseFiles(target);
  }
  if (!succeeded) return 1;
  fs.chmodSync(target, 0o600);
  process.stdout.write('production-copy: ok\n');
  return 0;
}

if (require.main === module) {
  runProductionCopy(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch(() => process.exit(1));
}
