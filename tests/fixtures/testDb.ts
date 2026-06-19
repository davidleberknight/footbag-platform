/**
 * Shared test database setup helpers.
 *
 * New test files should use these instead of repeating the ~20 lines of
 * boilerplate for env vars, schema loading, and cleanup.
 *
 * Usage:
 *   // At module top level (before any src/ import):
 *   const { dbPath, sessionSecret } = setTestEnv('3050');
 *
 *   let createApp: Awaited<ReturnType<typeof importApp>>;
 *
 *   beforeAll(async () => {
 *     const db = createTestDb(dbPath);
 *     insertMember(db, { ... });
 *     db.close();
 *     createApp = await importApp();
 *   });
 *
 *   afterAll(() => cleanupTestDb(dbPath));
 */
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Set all required env vars for a test file.
 * Must be called at module top level BEFORE any dynamic import of src/.
 * Returns the generated dbPath and sessionSecret for use in test helpers.
 */
export function setTestEnv(port: string): { dbPath: string; sessionSecret: string } {
  // Multiple test files reuse the same port number (audit found 7 duplicates).
  // Vitest runs them in parallel workers; without pid + random the dbPath
  // collides under millisecond clock granularity and one worker's schema
  // load races the other's, surfacing as flaky "table X already exists" or
  // "no such table: events" errors.
  // Temp DBs land in os.tmpdir(), NOT process.cwd(). The project root is
  // the wrong location for transient files — leaks (from worker timeout,
  // OOM, SIGKILL, or WAL-checkpoint races against afterAll) accumulate in
  // the working tree and pollute `ls`. The OS cleans /tmp on reboot or via
  // tmpwatch; the project root is forever. The `footbag-test-` prefix
  // makes leaks findable and avoids /tmp collisions with other projects.
  const uniq = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const dbPath = path.join(os.tmpdir(), `footbag-test-${port}-${Date.now()}-${uniq}.db`);
  const sessionSecret = `test-secret-${port}`;

  process.env.FOOTBAG_DB_PATH = dbPath;
  process.env.PORT            = port;
  process.env.NODE_ENV        = 'test';
  process.env.LOG_LEVEL       = 'error';
  process.env.PUBLIC_BASE_URL = `http://localhost:${port}`;
  process.env.SESSION_SECRET  = sessionSecret;
  // Tests exercise the FH-owned gallery sidecar write/delete contract;
  // enable explicitly because the prod default for non-dev is off.
  process.env.ALLOW_CURATED_SIDECAR_WRITES = '1';

  // JWT_LOCAL_KEYPAIR_PATH / JWT_SIGNER / SES_ADAPTER / AWS_REGION are set by
  // tests/setup-env.ts per-vitest-worker. Integration tests MUST NOT override
  // JWT_LOCAL_KEYPAIR_PATH: src/config/env.ts freezes the path on module load
  // (before these per-file top-level statements run under hoisted imports),
  // so a late override here would desync the middleware's verifier keypair
  // from the test factory's signer keypair.

  return { dbPath, sessionSecret };
}

// ── Symbolic-grammar seed ──────────────────────────────────────────────────
// symbolicGrammarService reads the symbolic_* tables at runtime. Seeding every
// test DB from the committed CSVs keeps the observational panels populated the
// way the always-present CSVs used to be, so freestyle/glossary route tests see
// real symbolic data without each one re-seeding.
const SYMBOLIC_SPECS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ['symbolic_equivalence_clusters.csv', 'symbolic_equivalence_clusters',
    ['cluster_id', 'cluster_label', 'symbolic_normalization', 'member_trick_slugs',
     'ifpa_decomposition_variance', 'add_range', 'anchor_topology_group', 'notes', 'review_status']],
  ['symbolic_group_membership.csv', 'symbolic_group_membership',
    ['trick_slug', 'symbolic_group_id', 'membership_reason', 'confidence', 'source']],
  ['movement_archetype_registry.csv', 'symbolic_movement_archetypes',
    ['archetype_id', 'archetype_label', 'uptime_pattern', 'midtime_pattern', 'downtime_pattern',
     'anchor_topology_group', 'anchor_modifier_groups', 'member_examples', 'min_adds', 'max_adds',
     'educational_value', 'notes']],
  ['symbolic_topology_groups.csv', 'symbolic_topology_groups',
    ['symbolic_group_id', 'display_name', 'classification_axis', 'description',
     'representative_examples', 'confidence_level', 'source_basis', 'review_status']],
  ['symbolic_modifier_groups.csv', 'symbolic_modifier_groups',
    ['symbolic_group_id', 'display_name', 'classification_axis', 'description',
     'representative_examples', 'confidence_level', 'source_basis', 'review_status']],
  ['glossary_crosslinks.csv', 'symbolic_glossary_crosslinks',
    ['crosslink_id', 'term_a', 'term_b', 'relationship', 'cluster', 'source', 'notes', 'educational_value']],
];

function parseQuotedCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], q = false, i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Parse the CSVs once per worker; reuse across every createTestDb call.
let symbolicSeedCache: { table: string; cols: readonly string[]; rows: string[][] }[] | null = null;
function symbolicSeedData(): { table: string; cols: readonly string[]; rows: string[][] }[] {
  if (symbolicSeedCache) return symbolicSeedCache;
  const dir = path.join(process.cwd(), 'freestyle', 'symbolic_grammar');
  symbolicSeedCache = SYMBOLIC_SPECS.map(([file, table, cols]) => {
    const parsed = parseQuotedCsv(fs.readFileSync(path.join(dir, file), 'utf8'));
    const header = parsed[0] ?? [];
    const colIdx = cols.map(c => header.indexOf(c));
    const rows = parsed.slice(1)
      .filter(r => !(r.length === 1 && r[0] === ''))
      .map(r => colIdx.map(ci => (ci >= 0 ? (r[ci] ?? '') : '')));
    return { table, cols, rows };
  });
  return symbolicSeedCache;
}

export function seedSymbolicGrammar(db: BetterSqlite3.Database): void {
  const data = symbolicSeedData();
  db.transaction(() => {
    for (const { table, cols, rows } of data) {
      const stmt = db.prepare(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      );
      for (const r of rows) stmt.run(r);
    }
  })();
}

/**
 * Create and initialize a test database with the full schema.
 * Returns an open db handle; caller should close it after inserting test data.
 */
export function createTestDb(dbPath: string): BetterSqlite3.Database {
  const schema = fs.readFileSync(
    path.join(process.cwd(), 'database', 'schema.sql'),
    'utf8',
  );
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  seedSymbolicGrammar(db);
  return db;
}

/**
 * Remove the test database and WAL/SHM sidecars.
 */
export function cleanupTestDb(dbPath: string): void {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + ext); } catch { /* ignore */ }
  }
}

/**
 * Dynamic import of createApp. Call in beforeAll after env vars are set.
 */
export async function importApp(): Promise<typeof import('../../src/app').createApp> {
  const mod = await import('../../src/app');
  return mod.createApp;
}
