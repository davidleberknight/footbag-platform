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
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
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
      MIGRATION_SQL: sql,
      MIGRATION_NAME: named?.name ?? '',
      MIGRATION_CHECKSUM: named?.checksum ?? '',
    },
    encoding: 'utf8',
    ...SPAWN_GUARD,
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

  it('rolls the transaction back itself, rather than relying on the restore to undo it', () => {
    // Why this exists as a separate case: the test below asserts the database is
    // untouched after a part-way failure, and it passed even while the
    // transaction was broken — because the restore ran and put the copy back.
    // Restore and rollback are indistinguishable through that path, so the
    // promise in the code ("a statement that fails part-way leaves nothing
    // applied") was never actually tested.
    //
    // This runs the same pipeline shape the deploy uses, against a scratch
    // database, with NO restore anywhere. Without `.bail on` the sqlite3 CLI
    // keeps reading after the failing statement, reaches the COMMIT, and commits
    // the first ALTER. With it, nothing lands.
    const scratch = join(workDir, 'txn.db');
    const db = new BetterSqlite3(scratch);
    db.exec('CREATE TABLE payments (id INTEGER PRIMARY KEY);');
    db.close();

    const sql = 'ALTER TABLE payments ADD COLUMN one TEXT;\nALTER TABLE nonexistent ADD COLUMN two TEXT;';
    const res = spawnSync(
      'bash',
      ['-c', `printf '.bail on\\nBEGIN;\\n%s\\nCOMMIT;\\n' ${JSON.stringify(sql)} | sqlite3 ${JSON.stringify(scratch)}`],
      { encoding: 'utf8', ...SPAWN_GUARD },
    );

    expect(res.status).not.toBe(0);

    const after = new BetterSqlite3(scratch, { readonly: true });
    const columns = (after.prepare('PRAGMA table_info(payments)').all() as { name: string }[])
      .map((c) => c.name);
    after.close();
    expect(columns).not.toContain('one');
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

  it('keeps rows that were still in the write-ahead log when a migration fails', () => {
    // The service is stopped before the copy is taken, and a clean stop folds
    // the WAL into the database file on the way down. An unclean one does not:
    // the stop ends in SIGKILL after its timeout, and the backup that would
    // have checkpointed is best-effort. What survives is a database file
    // missing rows that a WAL beside it still holds.
    //
    // That state is built here rather than hoped for. A second connection keeps
    // the WAL alive while both files are copied aside; closing it checkpoints
    // and removes the WAL, and restoring the copied pair puts the split back
    // with no live connection holding it.
    const live = new BetterSqlite3(dbPath);
    live.pragma('journal_mode = WAL');
    live.prepare('INSERT INTO payments (id, member_id, amount_cents) VALUES (?, ?, ?)')
      .run('p_wal', 'm2', 4200);
    const stagedDb = join(workDir, 'staged.db');
    const stagedWal = join(workDir, 'staged.db-wal');
    copyFileSync(dbPath, stagedDb);
    copyFileSync(`${dbPath}-wal`, stagedWal);
    live.close();
    copyFileSync(stagedDb, dbPath);
    copyFileSync(stagedWal, `${dbPath}-wal`);

    // The split is the precondition, so it is asserted rather than assumed: the
    // main file on its own does not carry the row.
    const mainOnly = join(workDir, 'main-only.db');
    copyFileSync(dbPath, mainOnly);
    const orphaned = new BetterSqlite3(mainOnly, { readonly: true });
    expect(orphaned.prepare('SELECT COUNT(*) AS c FROM payments WHERE id = ?').get('p_wal'))
      .toEqual({ c: 0 });
    orphaned.close();

    const res = applyMigration(
      'ALTER TABLE payments ADD COLUMN one TEXT;\nALTER TABLE nonexistent ADD COLUMN two TEXT;',
    );
    expect(res.status).toBe(1);

    // The restore is what would lose the row: it deletes the WAL and puts back
    // the copy. The copy has to have carried the row for that to be safe.
    expect(readDb((db) =>
      (db.prepare('SELECT COUNT(*) AS c FROM payments WHERE id = ?').get('p_wal') as { c: number }).c))
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
    expect(res.stdout).toContain('MIGRATION APPLIED');
    expect(ledger()).toHaveLength(1);
  });

  it('applies the same migration once, however many times it is named', () => {
    // Re-running a deploy is ordinary. Re-running its ALTER is not: the second
    // one fails on a column that already exists, and the restore that follows
    // would roll the database back for no reason.
    expect(applyMigration('ALTER TABLE payments ADD COLUMN currency TEXT;', NAMED).status).toBe(0);
    const second = applyMigration('ALTER TABLE payments ADD COLUMN currency TEXT;', NAMED);

    expect(second.status, second.stderr).toBe(0);
    // Said loudly, not in passing. Skipping is a success that changed nothing,
    // which is indistinguishable from a successful migration unless the deploy
    // names which one happened: a rehearsal run against a host that already
    // carries the file would otherwise read as proof the migration works.
    expect(second.stdout).toContain('MIGRATION SKIPPED');
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
  // Run through `setsid`, so the child has no controlling terminal. The
  // confirmation prompt reads from /dev/tty rather than stdin, and a suite
  // launched from a terminal would otherwise hand the script the operator's
  // own terminal: it prints the prompt into the middle of the test output and
  // blocks there, eating whatever the operator types next. Detached, the
  // prompt has no terminal to open and refuses, which is the same branch a
  // scripted caller hits.
  //
  // DEPLOY_TARGET is stripped from the inherited environment and supplied per
  // test, so a developer who happens to have it exported cannot change what
  // these assert.
  function runOperator(
    args: string[],
    extraEnv: Record<string, string> = {},
    script: string = OPERATOR_SCRIPT,
  ): { status: number; stderr: string } {
    const inherited = { ...process.env };
    delete inherited.DEPLOY_TARGET;
    const res = spawnSync('setsid', ['bash', script, ...args], {
      env: { ...inherited, ...extraEnv },
      encoding: 'utf8',
      input: '',
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, stderr: res.stderr ?? '' };
  }

  function ordinaryMigration(name = 'ordinary.sql'): string {
    const file = join(workDir, name);
    writeFileSync(file, 'ALTER TABLE payments ADD COLUMN x TEXT;\n');
    return file;
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

  it('refuses a deploy that does not say which host it means', () => {
    // The shared deploy defaults to staging, and staging carries every
    // committed migration as already applied, so a defaulted run is skipped and
    // reports success having changed nothing. Refusing is the only outcome that
    // cannot be mistaken for a migration that ran.
    const res = runOperator(['--migration', ordinaryMigration()]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not default');
  });

  it('refuses a deploy target that is not one of the two known hosts', () => {
    // A near-miss alias is the realistic mistake, and it must not reach ssh to
    // find out.
    const res = runOperator(['--migration', ordinaryMigration()], { DEPLOY_TARGET: 'footbag-prod' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not default');
  });

  it('resolves a bare name against the migrations directory', () => {
    // The usual invocation names the migration rather than a path into the
    // checkout. Proved against a throwaway checkout rather than the real one:
    // the committed migrations directory is empty until the first post-go-live
    // schema change, and a test may not write into the tree to populate it.
    // The script resolves the directory from its own location, so copying the
    // script is what moves the resolution.
    const root = mkdtempSync(join(tmpdir(), 'footbag-test-migrate-tree-'));
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'database', 'migrations'), { recursive: true });
    const script = join(root, 'scripts', 'deploy-migrate.sh');
    copyFileSync(OPERATOR_SCRIPT, script);
    writeFileSync(join(root, 'database', 'migrations', 'ordinary.sql'),
      'ALTER TABLE payments ADD COLUMN x TEXT;\n');

    // Reaching the confirmation gate proves the bare name was resolved, found
    // and read: everything that refuses before it is a different message. The
    // gate itself refuses because the test runs with no terminal.
    const res = runOperator(
      ['--migration', 'ordinary.sql'], { DEPLOY_TARGET: 'footbag-staging' }, script,
    );
    rmSync(root, { recursive: true, force: true });

    expect(res.stderr).not.toContain('cannot read migration file');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no terminal available to confirm on');
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

/**
 * Curated content after the cutover exists in one place only. The authoring
 * tree that could rebuild it is a developer-machine surface that no deployed
 * host carries, and the seeder that reads that tree is never run against the
 * live database, because its orphan cleanup would delete every admin-created
 * row that has no authoring file behind it. So a data-preserving deploy is the
 * only deploy curated content can survive, and that survival is the whole
 * post-cutover authoring model rather than a convenience.
 */
describe('curated content across a data-preserving deploy', () => {
  /**
   * The shape the admin interface writes on a deployed host: a media row, its
   * tags, and a gallery whose criteria select it. Deliberately not the full
   * schema; these are the tables the model depends on surviving.
   */
  function seedCuratedContent(): void {
    const db = new BetterSqlite3(dbPath);
    db.exec(`
      CREATE TABLE media_items (
        id TEXT PRIMARY KEY,
        uploader_member_id TEXT NOT NULL REFERENCES members(id),
        caption TEXT,
        video_platform TEXT,
        video_url TEXT,
        source_id TEXT,
        start_seconds INTEGER,
        end_seconds INTEGER
      );
      CREATE TABLE tags (id TEXT PRIMARY KEY, tag_normalized TEXT NOT NULL);
      CREATE TABLE media_tags (
        media_id TEXT NOT NULL REFERENCES media_items(id),
        tag_id TEXT NOT NULL REFERENCES tags(id)
      );
      CREATE TABLE member_galleries (
        id TEXT PRIMARY KEY,
        owner_member_id TEXT NOT NULL REFERENCES members(id),
        name TEXT NOT NULL
      );
      CREATE TABLE member_gallery_tags (
        gallery_id TEXT NOT NULL REFERENCES member_galleries(id),
        tag_id TEXT NOT NULL REFERENCES tags(id)
      );
      INSERT INTO media_items (id, uploader_member_id, caption, video_platform, video_url,
                               source_id, start_seconds, end_seconds)
      VALUES ('media_curated_1', 'm1', 'Blender', 'youtube',
              'https://www.youtube.com/watch?v=CURATED', 'passback_records', 66, 90);
      INSERT INTO tags (id, tag_normalized) VALUES ('tag_curated', '#curated');
      INSERT INTO media_tags (media_id, tag_id) VALUES ('media_curated_1', 'tag_curated');
      INSERT INTO member_galleries (id, owner_member_id, name)
      VALUES ('gallery_records', 'm1', 'Passback World Records');
      INSERT INTO member_gallery_tags (gallery_id, tag_id) VALUES ('gallery_records', 'tag_curated');
    `);
    db.close();
  }

  it('keeps curated media, its tags and its galleries, with no seeder run', () => {
    seedCuratedContent();

    const res = applyMigration('ALTER TABLE media_items ADD COLUMN mime_type TEXT;');
    expect(res.status, res.stderr).toBe(0);

    const media = readDb((db) =>
      db.prepare('SELECT * FROM media_items WHERE id = ?').get('media_curated_1'),
    ) as { caption: string; source_id: string; start_seconds: number; end_seconds: number;
           mime_type: string | null };
    // Every field the admin edit surface can write is still what it was, which
    // is what "the database is the source of truth" has to mean in practice.
    expect(media.caption).toBe('Blender');
    expect(media.source_id).toBe('passback_records');
    expect(media.start_seconds).toBe(66);
    expect(media.end_seconds).toBe(90);
    expect(media.mime_type).toBeNull();

    expect(readDb((db) =>
      (db.prepare('SELECT COUNT(*) AS c FROM media_tags').get() as { c: number }).c,
    )).toBe(1);
    expect(readDb((db) =>
      (db.prepare('SELECT name FROM member_galleries WHERE id = ?').get('gallery_records') as
        { name: string }).name,
    )).toBe('Passback World Records');
    expect(readDb((db) =>
      (db.prepare('SELECT COUNT(*) AS c FROM member_gallery_tags').get() as { c: number }).c,
    )).toBe(1);
  });

  it('keeps them when the migration fails and the database is rolled back', () => {
    seedCuratedContent();

    // A migration that adds a column and then violates a constraint: the whole
    // file is one transaction, so nothing it did survives.
    const res = applyMigration(
      'ALTER TABLE media_items ADD COLUMN note TEXT;\n' +
      "INSERT INTO media_tags (media_id, tag_id) VALUES ('media_missing', 'tag_curated');\n",
    );
    expect(res.status).not.toBe(0);

    const media = readDb((db) =>
      db.prepare('SELECT caption, source_id FROM media_items WHERE id = ?').get('media_curated_1'),
    ) as { caption: string; source_id: string };
    expect(media.caption).toBe('Blender');
    expect(media.source_id).toBe('passback_records');
    expect(readDb((db) =>
      (db.prepare('SELECT COUNT(*) AS c FROM media_tags').get() as { c: number }).c,
    )).toBe(1);

    // The column the failed migration added is gone too. Without that, the
    // rows surviving would only mean the failure happened to come last, not
    // that the deploy is atomic.
    const columns = readDb((db) =>
      db.prepare('PRAGMA table_info(media_items)').all() as { name: string }[],
    ).map((c) => c.name);
    expect(columns).not.toContain('note');
  });
});
