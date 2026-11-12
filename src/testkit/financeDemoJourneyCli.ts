/**
 * Runs the finance persona's journey from a persona command (the seed and
 * refresh runners), after their own database handle has closed.
 *
 * The journey writes through the application's database singleton, which opens
 * the configured database path, while the commands write the file `--db`
 * names. Running it against a different file would leave the seeded money in
 * one database and its reports in another, so the command is refused, before
 * it writes, unless the two paths resolve to the same file. The journey and
 * the application config are
 * imported only when the journey runs, because both need the application
 * environment the commands otherwise do without.
 *
 * The run returns the exit code the journey contributes: a failed job is an
 * error; a digest already sent today is a warning the command prints, with
 * the report and every other page still showing the seeded money.
 */
import { realpathSync } from 'node:fs';

let databaseModule: { checkpointAndCloseDatabase(): void } | null = null;

function resolved(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

/** Whether the journey would write the file `--db` names. Checked before the
 *  command writes anything, so a mismatch leaves the database untouched. */
export async function financeDemoJourneyDatabaseMatches(dbPath: string, tag: string): Promise<boolean> {
  const { config } = await import('../config/env');
  const target = resolved(dbPath);
  if (target !== null && target === resolved(config.dbPath)) return true;
  console.error(
    `[${tag}] refused: the finance persona's journey writes the application database` +
      ` (${config.dbPath}), not --db ${dbPath}. Set FOOTBAG_DB_PATH to the same file and re-run.`,
  );
  return false;
}

export async function runFinanceDemoJourneyFromCli(tag: string): Promise<number> {
  const { runFinanceDemoJourney } = await import('./financeDemoJourney');
  databaseModule = await import('../db/db');
  const result = await runFinanceDemoJourney();
  switch (result.status) {
    case 'ran':
      console.log(`[${tag}] finance journey: reconciliation and digest ran at ${result.at}.`);
      return 0;
    case 'digest_already_sent_today':
      console.warn(
        `[${tag}] WARNING finance journey: reconciliation ran at ${result.at}, but a Treasurer` +
          ' digest already went out today, so none was sent. /dev/outbox shows that earlier one.',
      );
      return 0;
    case 'job_failed':
      console.error(`[${tag}] finance journey: ${result.job} failed: ${result.error}`);
      return 1;
  }
}

/** Closes the application database if the journey opened it. For the
 *  command's script entry only: a test that calls `main()` in process shares
 *  the singleton and must keep it open. */
export function closeFinanceDemoJourneyDatabase(): void {
  databaseModule?.checkpointAndCloseDatabase();
}
