/**
 * Shared CLI helpers for the dev/staging seed runners (seed.ts,
 * personaSeedRunner.ts, personaRefreshCli.ts). They all resolve the database
 * the same way; this is the single source for that logic so the runners cannot
 * drift apart on it.
 *
 * Pure string/argv utilities only — no personaSecrets import, so this module is
 * freely importable in any environment (the runners themselves carry the
 * personaSecrets env-guard).
 */

/** Resolve the SQLite path from a `--db <path>` flag, else FOOTBAG_DB_PATH, else the dev default. */
export function parseDbArg(argv: string[]): { dbPath: string } {
  let dbPath = process.env.FOOTBAG_DB_PATH ?? './database/footbag.db';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--db' && argv[i + 1]) {
      dbPath = argv[i + 1];
      i += 1;
    }
  }
  return { dbPath };
}
