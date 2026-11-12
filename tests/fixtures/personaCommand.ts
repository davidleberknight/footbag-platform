/**
 * Runs a persona command line (the seed or refresh runner) in process against
 * one database file, with that file as the application database too.
 *
 * The finance persona's journey, which follows its seed and every refresh,
 * writes through the application's database singleton, and the commands refuse
 * to run when `--db` names any other file. So each run points the application
 * database at the file under test and loads the command afresh, then closes
 * the connection the journey opened and drops the modules that held it, so the
 * next run or the next import starts clean. A case importing application
 * modules after a run therefore imports them again rather than reusing ones
 * loaded before it. Output from every console channel is captured, in order.
 */
import { vi } from 'vitest';

type Command = 'personaSeedRunner' | 'personaRefreshCli';

export async function runPersonaCommand(
  command: Command,
  dbPath: string,
  args: string[] = [],
  /** The application database, when a case means it to differ from `--db`. */
  appDbPath: string = dbPath,
): Promise<{ code: number; out: string }> {
  const priorDbPath = process.env.FOOTBAG_DB_PATH;
  const priorArgv = process.argv;
  process.env.FOOTBAG_DB_PATH = appDbPath;
  process.argv = ['node', `${command}.js`, '--db', dbPath, ...args];
  vi.resetModules();
  const lines: string[] = [];
  const capture = (...a: unknown[]) => void lines.push(a.join(' '));
  const log = vi.spyOn(console, 'log').mockImplementation(capture);
  const warn = vi.spyOn(console, 'warn').mockImplementation(capture);
  const err = vi.spyOn(console, 'error').mockImplementation(capture);
  try {
    const { main } = command === 'personaSeedRunner'
      ? await import('../../src/testkit/personaSeedRunner')
      : await import('../../src/testkit/personaRefreshCli');
    const code = await main();
    return { code, out: lines.join('\n') };
  } finally {
    const { closeFinanceDemoJourneyDatabase } = await import('../../src/testkit/financeDemoJourneyCli');
    closeFinanceDemoJourneyDatabase();
    // The closed connection belongs to this run's modules; the next import
    // anywhere in the file loads them afresh rather than reusing it.
    vi.resetModules();
    process.argv = priorArgv;
    if (priorDbPath === undefined) delete process.env.FOOTBAG_DB_PATH;
    else process.env.FOOTBAG_DB_PATH = priorDbPath;
    log.mockRestore();
    warn.mockRestore();
    err.mockRestore();
  }
}
