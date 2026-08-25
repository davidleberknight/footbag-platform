/**
 * A committed migration and `database/schema.sql` describe the same database.
 *
 * Two files have to agree once go-live has happened. `schema.sql` is what every
 * fresh build is made from, and a migration file is the only way a schema change
 * reaches the one database that is never rebuilt. Write one without the other and
 * production diverges from every other environment silently: nothing asserts the
 * running schema at boot, so the first symptom is a query failing against a column
 * that exists in one place and not the other.
 *
 * The check: apply a migration to a database built from `schema.sql` and require the
 * schema to be unchanged afterwards. A migration already folded into `schema.sql`
 * either errors on the duplicate or is a pure data change, and both leave the schema
 * identical. One that was never folded in applies cleanly and changes it, which fails.
 *
 * What it cannot tell apart: "already present" from "syntactically broken", because
 * both leave the schema untouched. A broken migration is caught by the migrating
 * deploy, which wraps it in a transaction and restores on failure.
 *
 * The check is proved on SQL written here, one statement already in the schema and one
 * deliberately absent from it, before it is turned on the committed directory. Nothing
 * is written into the repository to do that: the fixtures are strings, and the
 * databases they build are temporary.
 *
 * Before go-live the directory is empty by design: the whole database is replaced on
 * every deploy, so the schema is whatever `schema.sql` says and a migration file has
 * nothing to do. The emptiness is asserted so that vacuum is deliberate rather than a
 * silent hole.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import BetterSqlite3 from 'better-sqlite3';

const SCHEMA = join(process.cwd(), 'database/schema.sql');
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations');

function migrationFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

let workDir: string;
let counter = 0;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-migration-parity-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** The whole schema as SQLite itself reports it, which is what must not move. */
function schemaFingerprint(db: BetterSqlite3.Database): string {
  const rows = db.prepare(
    'SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name',
  ).all() as { type: string; name: string; tbl_name: string; sql: string | null }[];
  return rows.map((r) => `${r.type}|${r.name}|${r.tbl_name}|${r.sql ?? ''}`).join('\n');
}

/**
 * Builds a database from the committed schema, applies the migration to it, and
 * reports whether the schema moved. An error means the change is already there,
 * which is the passing case: SQLite refuses a duplicate column or table. It is
 * swallowed rather than asserted, because a data-only migration succeeds instead
 * and both outcomes are correct; the fingerprint is what decides.
 */
function schemaMovedBy(sql: string): boolean {
  counter += 1;
  const db = new BetterSqlite3(join(workDir, `parity-${counter}.db`));
  try {
    db.exec(readFileSync(SCHEMA, 'utf8'));
    const before = schemaFingerprint(db);
    try {
      db.exec(sql);
    } catch {
      // deliberately ignored; the fingerprint below is the answer
    }
    return schemaFingerprint(db) !== before;
  } finally {
    db.close();
  }
}

describe('the schema-parity check itself', () => {
  it('sees no movement from a change the schema already carries', () => {
    // `data_origin` is in the committed schema, so a migration adding it is the
    // shape every correctly authored migration has: already folded in.
    expect(schemaMovedBy(
      "ALTER TABLE audit_entries ADD COLUMN data_origin TEXT NOT NULL DEFAULT 'unknown';",
    )).toBe(false);
  });

  it('sees movement from a change the schema does not carry', () => {
    // The failure this whole check exists to catch: a migration written without
    // the matching edit to the schema file.
    expect(schemaMovedBy(
      'ALTER TABLE members ADD COLUMN never_in_the_schema_file TEXT;',
    )).toBe(true);
  });

  it('sees no movement from a migration that only touches data', () => {
    expect(schemaMovedBy(
      "UPDATE members SET display_name = display_name WHERE 1 = 0;",
    )).toBe(false);
  });
});

describe('committed migrations against the committed schema', () => {
  it('has no migration files before go-live', () => {
    // Stated as an expectation rather than left implicit. When the first real
    // migration lands this fails, and the per-file check below takes over as the
    // thing doing the work; that is the moment to delete this case.
    expect(migrationFiles()).toEqual([]);
  });

  it.each(migrationFiles())('%s leaves a schema.sql database unchanged', (filename) => {
    expect(schemaMovedBy(readFileSync(join(MIGRATIONS_DIR, filename), 'utf8'))).toBe(false);
  });
});
