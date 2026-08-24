/**
 * The data-preserving deploy: what happens to a live database when a schema
 * migration is applied to it.
 *
 * The contract these assert: existing rows survive a migration, a migration
 * that fails leaves the database exactly as it was, a migration that corrupts
 * referential integrity is rejected and rolled back rather than shipped, and a
 * migration file that manages its own transaction is refused before the service
 * is ever stopped. The last three are the reason this path takes a copy of the
 * database first: a migration is the one deploy step that can destroy data no
 * rebuild can recreate.
 *
 * The remote half is exercised directly against a real SQLite file, with the
 * host-side steps around it (image load, systemd, compose) out of reach here;
 * what is proved is the part that touches the data.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import BetterSqlite3 from 'better-sqlite3';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const OPERATOR_SCRIPT = join(process.cwd(), 'scripts/deploy-migrate.sh');

let workDir: string;
let dbPath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-migrate-'));
  dbPath = join(workDir, 'footbag.db');
  const db = new BetterSqlite3(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE members (id TEXT PRIMARY KEY, slug TEXT NOT NULL);
    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES members(id),
      amount_cents INTEGER NOT NULL
    );
    INSERT INTO members (id, slug) VALUES ('m1', 'one'), ('m2', 'two');
    INSERT INTO payments (id, member_id, amount_cents) VALUES ('p1', 'm1', 2500);
  `);
  db.close();
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Runs only the migration half of the remote body, against a real database.
 * The surrounding host steps need systemd, docker and root, none of which a
 * test has, so the block under test is extracted and run on its own with the
 * service-control commands stubbed out.
 */
function applyMigration(
  sql: string,
  named?: { name: string; checksum: string },
): { status: number; stderr: string; stdout: string } {
  const remote = readFileSync(
    join(process.cwd(), 'scripts/internal/deploy-code-remote.sh'), 'utf8',
  );
  const start = remote.indexOf('if [[ -n "${MIGRATION_SQL:-}" ]]; then');
  const end = remote.indexOf('echo "==> Restarting service');
  expect(start, 'migration block not found in the remote half').toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = remote.slice(start, end);

  const harness = join(workDir, 'harness.sh');
  writeFileSync(harness, [
    'set -euo pipefail',
    // systemd is not present in a test; the migration must not depend on the
    // service actually stopping for its data handling to be correct.
    'systemctl() { :; }',
    `FOOTBAG_DB_DIR=${JSON.stringify(workDir)}`,
    block,
    'echo MIGRATION_BLOCK_DONE',
  ].join('\n'));

  const res = spawnSync('bash', [harness], {
    env: {
      ...process.env,
      ...SPAWN_GUARD,
      MIGRATION_SQL: sql,
      MIGRATION_NAME: named?.name ?? '',
      MIGRATION_CHECKSUM: named?.checksum ?? '',
    },
    encoding: 'utf8',
  });
  return { status: res.status ?? -1, stderr: res.stderr ?? '', stdout: res.stdout ?? '' };
}

function readDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

describe('applying a schema migration to a live database', () => {
  it('adds the new schema and keeps every row that was already there', () => {
    const res = applyMigration('ALTER TABLE payments ADD COLUMN currency TEXT;');
    expect(res.status, res.stderr).toBe(0);

    const row = readDb((db) => db.prepare('SELECT * FROM payments WHERE id = ?').get('p1')) as
      { amount_cents: number; currency: string | null };
    // The point of this deploy path: the data is still here afterwards.
    expect(row.amount_cents).toBe(2500);
    expect(row.currency).toBeNull();
    expect(readDb((db) => (db.prepare('SELECT COUNT(*) AS c FROM members').get() as { c: number }).c))
      .toBe(2);
  });

  it('takes a copy of the database before touching it', () => {
    applyMigration('ALTER TABLE payments ADD COLUMN note TEXT;');
    const copies = readDb(() => existsSync(`${dbPath}`)) && spawnSync(
      'bash', ['-c', `ls ${JSON.stringify(dbPath)}.pre-migration.* | wc -l`],
      { env: { ...process.env, ...SPAWN_GUARD }, encoding: 'utf8' },
    ).stdout.trim();
    // The copy is the whole safety story for a step that can destroy data no
    // rebuild can recreate.
    expect(Number(copies)).toBe(1);
  });

  it('restores the database untouched when the migration fails part-way', () => {
    // The first statement is valid and the second is not. Without the
    // transaction and the restore, the first would land and the database would
    // be in a state matching neither the old code nor the new.
    const res = applyMigration(
      'ALTER TABLE payments ADD COLUMN one TEXT;\nALTER TABLE nonexistent ADD COLUMN two TEXT;',
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Restoring the pre-migration database');

    const columns = readDb((db) =>
      (db.prepare('PRAGMA table_info(payments)').all() as { name: string }[]).map((c) => c.name));
    expect(columns).not.toContain('one');
    expect(readDb((db) => (db.prepare('SELECT COUNT(*) AS c FROM payments').get() as { c: number }).c))
      .toBe(1);
  });

  it('rejects and rolls back a migration that breaks referential integrity', () => {
    // A dangling foreign key is not corruption, so the integrity check passes
    // and nothing complains until a read quietly returns nothing months later.
    // Checked while the previous copy is still one command away.
    const res = applyMigration("DELETE FROM members WHERE id = 'm1';");
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('foreign-key violations');

    // The member the payment points at is still there.
    expect(readDb((db) => (db.prepare('SELECT COUNT(*) AS c FROM members').get() as { c: number }).c))
      .toBe(2);
  });
});

describe('the record of which migrations have been applied', () => {
  const NAMED = { name: '2026-08-25-add-currency.sql', checksum: 'a'.repeat(64) };

  function ledger(): Array<{ filename: string; checksum: string; applied_at: string }> {
    return readDb((db) => {
      const present = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
      ).get();
      if (!present) return [];
      return db.prepare('SELECT filename, checksum, applied_at FROM schema_migrations').all();
    }) as Array<{ filename: string; checksum: string; applied_at: string }>;
  }

  it('records what it applied, so the database says which migrations it has had', () => {
    const res = applyMigration('ALTER TABLE payments ADD COLUMN currency TEXT;', NAMED);
    expect(res.status, res.stderr).toBe(0);

    const rows = ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0].filename).toBe(NAMED.name);
    expect(rows[0].checksum).toBe(NAMED.checksum);
    expect(rows[0].applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('applies a first-ever migration to a database that has no ledger yet', () => {
    // Every database in service predates this record, so the first migration
    // applied to one finds no table to consult. That is "never applied", not a
    // failure to read, and it must not refuse.
    expect(readDb((db) => db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    ).get())).toBeUndefined();

    const res = applyMigration('ALTER TABLE payments ADD COLUMN currency TEXT;', NAMED);

    expect(res.status, res.stderr).toBe(0);
    expect(ledger()).toHaveLength(1);
  });

  it('applies the same migration once, however many times it is named', () => {
    // Re-running a deploy is ordinary. Re-running its ALTER is not: the second
    // one fails on a column that already exists, and the restore that follows
    // would roll the database back for no reason.
    expect(applyMigration('ALTER TABLE payments ADD COLUMN currency TEXT;', NAMED).status).toBe(0);
    const second = applyMigration('ALTER TABLE payments ADD COLUMN currency TEXT;', NAMED);

    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain('already applied');
    expect(ledger()).toHaveLength(1);
  });

  it('refuses a migration whose file has changed since it was applied', () => {
    // The database now matches neither the recorded file nor the current one,
    // and applying the new bytes would be guesswork about which half already
    // ran. The fix is a new migration, so this refuses rather than choosing.
    expect(applyMigration('ALTER TABLE payments ADD COLUMN currency TEXT;', NAMED).status).toBe(0);
    const edited = applyMigration(
      'ALTER TABLE payments ADD COLUMN currency TEXT;\nALTER TABLE payments ADD COLUMN fee TEXT;',
      { name: NAMED.name, checksum: 'b'.repeat(64) },
    );

    expect(edited.status).toBe(1);
    expect(edited.stderr).toContain('has');
    expect(edited.stderr).toContain('changed since');
    // Refused before the service was stopped, so nothing was applied and the
    // recorded state still describes the database.
    expect(ledger()).toHaveLength(1);
    expect(ledger()[0].checksum).toBe(NAMED.checksum);
    expect(readDb((db) => db.prepare('PRAGMA table_info(payments)').all()))
      .not.toContainEqual(expect.objectContaining({ name: 'fee' }));
  });

  it('records nothing when the migration itself fails', () => {
    // The row and the change it describes share one transaction, so a rolled
    // back migration must leave no claim to have run.
    const res = applyMigration(
      'ALTER TABLE payments ADD COLUMN ok TEXT;\nALTER TABLE nonexistent ADD COLUMN bad TEXT;',
      NAMED,
    );
    expect(res.status).toBe(1);
    expect(ledger()).toHaveLength(0);
  });
});

describe('the operator-facing script', () => {
  function runOperator(args: string[]): { status: number; stderr: string } {
    const res = spawnSync('bash', [OPERATOR_SCRIPT, ...args], {
      env: { ...process.env, ...SPAWN_GUARD },
      encoding: 'utf8',
      input: '',
    });
    return { status: res.status ?? -1, stderr: res.stderr ?? '' };
  }

  it('refuses without a migration file, so it can never be a code-only deploy by accident', () => {
    const res = runOperator([]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--migration is required');
  });

  it('refuses a migration file that is not there', () => {
    const res = runOperator(['--migration', join(workDir, 'absent.sql')]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('cannot read migration file');
  });

  it('refuses an empty migration file rather than deploying nothing loudly', () => {
    const empty = join(workDir, 'empty.sql');
    writeFileSync(empty, '');
    const res = runOperator(['--migration', empty]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('is empty');
  });

  it('resolves a bare name against the migrations directory', () => {
    // The usual invocation names the migration rather than a path into the
    // checkout. Confirmation is declined here, so reaching the prompt at all
    // proves the file was found and read.
    const res = runOperator(['--migration', '2026-08-25-audit-data-origin.sql']);
    expect(res.stderr).not.toContain('cannot read migration file');
  });

  it('refuses a migration filename it could not safely record', () => {
    // The name is written into the SQL that records the migration, so the
    // character set is restricted rather than escaped.
    const odd = join(workDir, "od'd.sql");
    writeFileSync(odd, 'ALTER TABLE payments ADD COLUMN x TEXT;\n');
    const res = runOperator(['--migration', odd]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('must contain only letters');
  });

  it('refuses a migration that manages its own transaction', () => {
    // The deploy wraps the file in one transaction, so a file opening its own
    // nests them and SQLite refuses it. Caught here, where the operator can fix
    // the file, rather than on the host with the service already stopped.
    const nested = join(workDir, 'nested.sql');
    writeFileSync(nested, 'BEGIN;\nALTER TABLE payments ADD COLUMN x TEXT;\nCOMMIT;\n');
    const res = runOperator(['--migration', nested]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('must not manage its own transaction');
  });
});
