/**
 * Shared CLI helpers for the dev/staging seed runners (seed.ts,
 * personaSeedRunner.ts). Both runners parse the same `--db` flag and accept
 * the same JSONC (`//` line-comment) input shape; this is the single source
 * for that logic so the two runners cannot drift (mirrors DD §1.14's
 * "no parallel code path" intent for the persona row builders).
 *
 * Pure string/argv utilities only — no seedConfig import, so this module is
 * freely importable in any environment (the runners themselves carry the
 * seedConfig env-guard).
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

/**
 * Strip `//` line comments from a JSONC blob so JSON.parse can consume it.
 * Quoted strings preserve their content (URLs, escaped quotes, etc.).
 */
export function stripJsonComments(raw: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      out += ch;
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && raw[i + 1] === '/') {
      while (i < raw.length && raw[i] !== '\n') i += 1;
      if (i < raw.length) out += raw[i];
      continue;
    }
    out += ch;
  }
  return out;
}
