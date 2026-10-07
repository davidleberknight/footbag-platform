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
import { createTestDb, renderSidecarTemplate } from '../fixtures/testDb';
import {
  insertEmailTemplate, insertMember, insertMemberTierGrant,
  insertFreestyleTrick, insertFreestyleTrickAlias, insertFreestyleTrickSource,
  insertFreestyleTrickSourceLink, insertFreestyleTrickModifier, insertFreestyleTrickModifierLink,
  insertFreestyleTrickTip, insertFreestyleRecord, insertConsecutiveKicksRecord,
  insertFreestyleEvAdjudication, insertMediaSource, insertVideoMediaItem, insertTag, attachMediaTag,
  insertMemberGallery, insertGalleryCriterionTag, insertGalleryExcludeTag, insertGalleryExternalLink,
} from '../fixtures/factories';

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

  // The migration aims at the directory the compose files mount at /app/db, which
  // the host env file records, so the harness gives it a real env file rather than
  // a variable standing in for one. Taking the reader out of the script under test
  // rather than re-implementing it here keeps the test honest: a re-implementation
  // would go on passing if the real one changed. A directory other than the
  // default is the case that matters, since the defaulted resolution could not
  // express it.
  const envPath = join(workDir, 'env');
  writeFileSync(envPath, `FOOTBAG_ENV=staging\nFOOTBAG_DB_DIR=${workDir}\n`);

  // Ends on a closing brace in the first column, not the next brace of any kind:
  // the function body holds an awk program whose own braces come first.
  const readEnvMatch = remote.match(/^read_env\(\) \{\n[\s\S]*?^\}$/m);
  expect(readEnvMatch, 'read_env not found in the remote half').not.toBeNull();
  const readEnv = readEnvMatch![0];

  const harness = join(workDir, 'harness.sh');
  writeFileSync(harness, [
    'set -euo pipefail',
    // systemd is not present in a test; the migration must not depend on the
    // service actually stopping for its data handling to be correct.
    'systemctl() { :; }',
    `ENV_PATH=${JSON.stringify(envPath)}`,
    readEnv,
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
      { env: { ...process.env }, encoding: 'utf8', ...SPAWN_GUARD },
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
    const res = runOperator(['--target', 'prod', '--migration', ordinaryMigration()]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not default');
  });

  it('refuses an unknown option before showing the SQL it would apply', () => {
    // Defect caught: an option forwarded to the code deploy, which takes none,
    // failing only after the operator was shown the migration to confirm.
    const res = runOperator(['--target', 'staging', '--migration', ordinaryMigration(), '--foo']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown argument '--foo'");
    expect(res.stderr).not.toContain('ALTER TABLE');
  });

  it('refuses a DEPLOY_TARGET inherited from the shell rather than honouring it', () => {
    // Defect caught: a value left exported by an earlier session choosing the
    // live database to migrate, with nothing on the command line saying so.
    const res = runOperator(['--target', 'staging', '--migration', ordinaryMigration()], {
      DEPLOY_TARGET: 'footbag-production',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('DEPLOY_TARGET is set in this shell');
  });

  it('refuses --yes on production, because a flag cannot say a person is there', () => {
    // This is the one deploy that can destroy rows no rebuild can recreate, and
    // the confirmation exists to establish that somebody is present rather than
    // to slow anybody down. A flag that answered it in advance would leave a
    // scripted caller, a scheduled job or an agent session able to migrate the
    // live database unattended, which is exactly what the rule forbids.
    const res = runOperator(['--target', 'production', '--migration', ordinaryMigration(), '--yes']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--yes does not apply to a production migration');
  });

  it('keeps --yes working on staging, which is fed unattended by design', () => {
    // Refusing it here would break the scripted recovery path for a host whose
    // data is disposable, so the production refusal has to be the narrow one
    // rather than the blanket one.
    const res = runOperator(['--target', 'staging', '--migration', ordinaryMigration(), '--yes']);
    expect(res.stderr).not.toContain('--yes does not apply');
    // It gets past the gate and fails later, with no terminal and no host to
    // reach; what this pins is that the confirmation did not stop it.
    expect(res.stderr).not.toContain('no terminal available to confirm on');
  });

  it('refuses a production migration with no terminal at all', () => {
    // The other half of the same rule: no unattended form, whether the operator
    // reaches for the flag or simply has no terminal attached.
    const res = runOperator(['--target', 'production', '--migration', ordinaryMigration()]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no terminal available to confirm on');
    expect(res.stderr).toContain('no unattended form');
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
      ['--target', 'staging', '--migration', 'ordinary.sql'], {}, script,
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

/**
 * Every admin-authored domain across a data-preserving deploy, on the real
 * schema. After cutover the production database is the only copy of what
 * admins have written: an edited email template, a member's account and the
 * flags only an admin sets, the freestyle dictionary and its records and
 * rulings, curated media and galleries. A migrating deploy that loses or
 * resets any of it loses it for good, because nothing is reseeded. Each domain
 * migrates its own table, so each case proves its rows survive a change to the
 * table that holds them.
 */
describe('admin-authored content across a data-preserving deploy, on the real schema', () => {
  const TEMPLATE_KEY = 'account_verify';
  const OPERATOR_KEY = 'member-hof';

  beforeEach(() => {
    for (const ext of ['', '-wal', '-shm']) rmSync(`${dbPath}${ext}`, { force: true });
    createTestDb(dbPath).close();
  });

  function seed(fn: (db: BetterSqlite3.Database) => void): void {
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    try {
      fn(db);
    } finally {
      db.close();
    }
  }

  function count(table: string): number {
    return readDb((db) => (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c);
  }

  function seedEditedTemplate(db: BetterSqlite3.Database): void {
    insertEmailTemplate(db, {
      id: `emailtpl_test_${TEMPLATE_KEY}`,
      template_key: TEMPLATE_KEY,
      subject_template: 'Admin-edited subject',
      body_template: 'Admin-edited body for {memberName}',
      is_enabled: 0,
      pii_classification: 'restricted',
    });
  }

  function seedMembers(db: BetterSqlite3.Database): void {
    insertMember(db, {
      id: OPERATOR_KEY, slug: 'hall-of-famer', login_email: 'hof@example.com',
      password_hash: 'argon2id$fixture-hash', is_hof: 1, hof_inducted_year: 1999, is_board: 1,
      bio: 'Admin-corrected biography',
    });
    insertMember(db, { id: 'member-deceased', slug: 'remembered', is_deceased: 1, deceased_at: '2024-05-01T00:00:00.000Z' });
    insertMemberTierGrant(db, { member_id: OPERATOR_KEY, new_tier_status: 'tier2', reason_code: 'admin.manual_grant' });
  }

  function seedDictionary(db: BetterSqlite3.Database): void {
    insertFreestyleTrick(db, {
      slug: 'blender', canonical_name: 'Blender',
      short_description: 'Curator short description',
      execution_summary: 'Curator execution summary',
      learning_notes: 'Curator learning notes',
      prerequisite_notes: 'Curator prerequisites',
      pronunciation: 'BLEN-der',
      operational_notation_source: 'curator',
    });
    insertFreestyleTrickAlias(db, 'blendah', 'blender', 'Blendah', { alias_origin_producer: 'curator-application' });
    const source = insertFreestyleTrickSource(db, { source_label: 'Curator citation' });
    insertFreestyleTrickSourceLink(db, 'blender', source, { external_url: 'https://example.com/blender' });
    insertFreestyleTrickModifier(db, { slug: 'curator-mod' });
    insertFreestyleTrickModifierLink(db, 'blender', 'curator-mod');
    insertFreestyleTrickTip(db, { trick_slug: 'blender', tip_text: 'Curator-approved tip', status: 'published' });
  }

  function seedRecords(db: BetterSqlite3.Database): void {
    insertFreestyleRecord(db, {
      id: 'record-1', display_name: 'Record Holder', trick_name: 'Blender', adds_count: 4,
      confidence: 'verified', video_timecode: '1:06',
    });
    insertConsecutiveKicksRecord(db, { id: 'ck-1', sort_order: 7, division: 'Open Singles' });
  }

  function seedRulings(db: BetterSqlite3.Database): void {
    insertFreestyleEvAdjudication(db, { candidate_id: 'ev-first', submitted_name: 'First Ruling', note: 'Ruled first' });
    insertFreestyleEvAdjudication(db, { candidate_id: 'ev-second', submitted_name: 'Second Ruling', note: 'Ruled second' });
  }

  function seedCurated(db: BetterSqlite3.Database): void {
    insertMember(db, { id: 'curator-owner', slug: 'curator-owner' });
    insertMediaSource(db, 'passback_records', { sourceName: 'PassBack Records' });
    const media = insertVideoMediaItem(db, {
      id: 'media-real-1', uploader_member_id: 'curator-owner', video_platform: 'youtube',
      video_id: 'CURATED', video_url: 'https://www.youtube.com/watch?v=CURATED',
      caption: 'Admin caption', source_id: 'passback_records',
    });
    const include = insertTag(db, { tag_normalized: '#curated', tag_display: '#curated' });
    const exclude = insertTag(db, { tag_normalized: '#outtake', tag_display: '#outtake' });
    attachMediaTag(db, media, include);
    const gallery = insertMemberGallery(db, { id: 'gallery-real-1', owner_member_id: 'curator-owner', name: 'Admin gallery' });
    insertGalleryCriterionTag(db, gallery, include);
    insertGalleryExcludeTag(db, gallery, exclude);
    insertGalleryExternalLink(db, { gallery_id: gallery, label: 'Admin link', url: 'https://example.com/more' });
  }

  it('keeps an admin-edited email template, with no seeder run', () => {
    // Defect caught: a migrating deploy that replays the committed sidecars or
    // rebuilds the table, so members get the old wording back.
    seed(seedEditedTemplate);
    const before = count('email_templates');

    const res = applyMigration('ALTER TABLE email_templates ADD COLUMN locale TEXT;');
    expect(res.status, res.stderr).toBe(0);

    const row = readDb((db) => db.prepare(
      'SELECT subject_template, body_template, is_enabled, pii_classification FROM email_templates WHERE template_key = ?',
    ).get(TEMPLATE_KEY)) as { subject_template: string; body_template: string; is_enabled: number; pii_classification: string };
    expect(row).toEqual({
      subject_template: 'Admin-edited subject', body_template: 'Admin-edited body for {memberName}',
      is_enabled: 0, pii_classification: 'restricted',
    });
    expect(row.subject_template).not.toBe(renderSidecarTemplate(TEMPLATE_KEY).subject);
    expect(count('email_templates')).toBe(before);
    expect(readDb((db) => db.prepare('SELECT COUNT(*) AS c FROM email_templates_enabled WHERE template_key = ?')
      .get(TEMPLATE_KEY) as { c: number }).c).toBe(0);
  });

  it('keeps member accounts and the flags only an admin sets', () => {
    // Defect caught: members unable to sign in, Hall of Fame listings vanishing,
    // or a deceased member reappearing after a deploy.
    seed(seedMembers);
    const activeBefore = count('members_active');

    const res = applyMigration('ALTER TABLE members ADD COLUMN pronouns TEXT;');
    expect(res.status, res.stderr).toBe(0);

    const hof = readDb((db) => db.prepare(
      'SELECT slug, login_email, password_hash, is_hof, hof_inducted_year, is_board, bio FROM members WHERE id = ?',
    ).get(OPERATOR_KEY));
    expect(hof).toEqual({
      slug: 'hall-of-famer', login_email: 'hof@example.com', password_hash: 'argon2id$fixture-hash',
      is_hof: 1, hof_inducted_year: 1999, is_board: 1, bio: 'Admin-corrected biography',
    });
    expect(readDb((db) => (db.prepare('SELECT is_deceased FROM members WHERE id = ?')
      .get('member-deceased') as { is_deceased: number }).is_deceased)).toBe(1);
    expect(readDb((db) => (db.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?')
      .get(OPERATOR_KEY) as { tier_status: string }).tier_status)).toBe('tier2');
    expect(count('members_active')).toBe(activeBefore);
  });

  it('keeps the freestyle dictionary: prose, aliases, citations, modifiers and tips', () => {
    // Defect caught: after cutover the database is the only copy, so a deploy
    // that loses a trick's editorial prose, its alias redirect, its citation or
    // its tips loses them for good.
    seed(seedDictionary);

    const res = applyMigration('ALTER TABLE freestyle_tricks ADD COLUMN etymology TEXT;');
    expect(res.status, res.stderr).toBe(0);

    expect(readDb((db) => db.prepare(
      `SELECT short_description, execution_summary, learning_notes, prerequisite_notes,
              pronunciation, operational_notation_source FROM freestyle_tricks WHERE slug = 'blender'`,
    ).get())).toEqual({
      short_description: 'Curator short description', execution_summary: 'Curator execution summary',
      learning_notes: 'Curator learning notes', prerequisite_notes: 'Curator prerequisites',
      pronunciation: 'BLEN-der', operational_notation_source: 'curator',
    });
    expect(readDb((db) => (db.prepare("SELECT trick_slug FROM freestyle_trick_aliases WHERE alias_slug = 'blendah'")
      .get() as { trick_slug: string }).trick_slug)).toBe('blender');
    expect(readDb((db) => (db.prepare("SELECT external_url FROM freestyle_trick_source_links WHERE trick_slug = 'blender'")
      .get() as { external_url: string }).external_url)).toBe('https://example.com/blender');
    expect(count('freestyle_trick_modifier_links')).toBe(1);
    expect(readDb((db) => (db.prepare("SELECT tip_text FROM freestyle_trick_tips WHERE trick_slug = 'blender'")
      .get() as { tip_text: string }).tip_text)).toBe('Curator-approved tip');
  });

  it('keeps freestyle and consecutive-kicks records, including an admin\'s ordering', () => {
    // Defect caught: the record tables reverting or emptying after a deploy.
    seed(seedRecords);

    const res = applyMigration('ALTER TABLE freestyle_records ADD COLUMN verified_by TEXT;');
    expect(res.status, res.stderr).toBe(0);

    expect(readDb((db) => db.prepare(
      "SELECT display_name, adds_count, confidence, video_timecode FROM freestyle_records WHERE id = 'record-1'",
    ).get())).toEqual({ display_name: 'Record Holder', adds_count: 4, confidence: 'verified', video_timecode: '1:06' });
    expect(readDb((db) => db.prepare("SELECT sort_order, division FROM consecutive_kicks_records WHERE id = 'ck-1'").get()))
      .toEqual({ sort_order: 7, division: 'Open Singles' });
  });

  it('keeps emerging-vocabulary rulings in order, and every symbolic-grammar row', () => {
    // Defect caught: curator rulings lost or reordered, or the symbolic layer
    // the dictionary pages read emptied by a deploy.
    seed(seedRulings);
    const symbolic = readDb((db) => (db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'symbolic\\_%' ESCAPE '\\' ORDER BY name",
    ).all() as { name: string }[]).map((t) => t.name));
    expect(symbolic.length).toBeGreaterThan(0);
    const before = Object.fromEntries(symbolic.map((t) => [t, count(t)]));

    const res = applyMigration('ALTER TABLE freestyle_ev_adjudications ADD COLUMN reviewer_note TEXT;');
    expect(res.status, res.stderr).toBe(0);

    expect(readDb((db) => (db.prepare(
      "SELECT candidate_id FROM freestyle_ev_adjudications WHERE candidate_id IN ('ev-first', 'ev-second') ORDER BY sequence_no",
    ).all() as { candidate_id: string }[]).map((r) => r.candidate_id))).toEqual(['ev-first', 'ev-second']);
    expect(readDb((db) => (db.prepare("SELECT note FROM freestyle_ev_adjudications WHERE candidate_id = 'ev-second'")
      .get() as { note: string }).note)).toBe('Ruled second');
    for (const table of symbolic) expect(count(table), table).toBe(before[table]);
  });

  it('keeps curated media and galleries, including exclusions, links and sources', () => {
    // Defect caught: a gallery showing the wrong videos after a deploy, because
    // its exclusion or its source attribution was lost.
    seed(seedCurated);

    const res = applyMigration('ALTER TABLE member_galleries ADD COLUMN banner TEXT;');
    expect(res.status, res.stderr).toBe(0);

    expect(readDb((db) => db.prepare("SELECT caption, source_id FROM media_items WHERE id = 'media-real-1'").get()))
      .toEqual({ caption: 'Admin caption', source_id: 'passback_records' });
    expect(readDb((db) => (db.prepare("SELECT name FROM member_galleries WHERE id = 'gallery-real-1'")
      .get() as { name: string }).name)).toBe('Admin gallery');
    expect(count('media_tags')).toBe(1);
    expect(count('member_gallery_tags')).toBe(1);
    expect(count('member_gallery_exclude_tags')).toBe(1);
    expect(readDb((db) => (db.prepare("SELECT label FROM gallery_external_links WHERE gallery_id = 'gallery-real-1'")
      .get() as { label: string }).label)).toBe('Admin link');
    expect(count('media_sources')).toBeGreaterThan(0);
  });

  it('keeps every domain unchanged when the migration fails and is rolled back', () => {
    // Defect caught: a failed migration that partly lands, or restores a copy
    // missing content written before it.
    seed((db) => {
      seedEditedTemplate(db); seedMembers(db); seedDictionary(db);
      seedRecords(db); seedRulings(db); seedCurated(db);
    });

    const res = applyMigration(
      'ALTER TABLE email_templates ADD COLUMN note TEXT;\n' +
      // factory-cannot-express: the migration must fail, so its row is one the schema refuses
      "INSERT INTO email_templates (id) VALUES ('broken-row');\n",
    );
    expect(res.status).not.toBe(0);

    expect(readDb((db) => (db.prepare('SELECT subject_template FROM email_templates WHERE template_key = ?')
      .get(TEMPLATE_KEY) as { subject_template: string }).subject_template)).toBe('Admin-edited subject');
    expect(readDb((db) => (db.prepare('SELECT password_hash FROM members WHERE id = ?')
      .get(OPERATOR_KEY) as { password_hash: string }).password_hash)).toBe('argon2id$fixture-hash');
    expect(readDb((db) => (db.prepare("SELECT learning_notes FROM freestyle_tricks WHERE slug = 'blender'")
      .get() as { learning_notes: string }).learning_notes)).toBe('Curator learning notes');
    expect(count('freestyle_records')).toBe(1);
    expect(count('freestyle_ev_adjudications')).toBeGreaterThanOrEqual(2);
    expect(count('member_gallery_exclude_tags')).toBe(1);
    const columns = readDb((db) => db.prepare('PRAGMA table_info(email_templates)').all() as { name: string }[])
      .map((c) => c.name);
    expect(columns).not.toContain('note');
  });
});

describe('pruning set-aside database copies after a code deploy', () => {
  const REMOTE = join(process.cwd(), 'scripts/internal/deploy-code-remote.sh');
  const PRUNE_LIB = join(process.cwd(), 'scripts/internal/prune-db-copies.sh');

  /**
   * Runs the remote half from its readiness poll through the prune, with the
   * host's tools stubbed as shell functions: the poll and the identity check
   * answer as a healthy release unless READY_EXIT says otherwise. The prelude
   * stands where the shipped helper does on the wire.
   */
  function runTail(prelude: string, extraEnv?: NodeJS.ProcessEnv) {
    const remote = readFileSync(REMOTE, 'utf8');
    const start = remote.indexOf('_stack_healthy=0');
    const endMarker = 'unset _prune_db_dir';
    const end = remote.indexOf(endMarker);
    expect(start, 'readiness poll not found in the remote half').toBeGreaterThan(-1);
    expect(end, 'prune step not found after the readiness poll').toBeGreaterThan(start);
    const readEnv = remote.match(/^read_env\(\) \{\n[\s\S]*?^\}$/m)![0];

    const dbDir = join(workDir, 'host-db');
    mkdirSync(dbDir, { recursive: true });
    const envPath = join(workDir, 'host-env');
    writeFileSync(envPath, `FOOTBAG_ENV=staging\nFOOTBAG_DB_DIR=${dbDir}\n`);
    const log = join(workDir, 'tail-calls.log');
    rmSync(log, { force: true });

    const harness = join(workDir, 'tail-harness.sh');
    writeFileSync(harness, [
      'set -euo pipefail',
      prelude,
      `LOG=${JSON.stringify(log)}`,
      'systemctl() { echo "systemctl $*" >> "$LOG"; }',
      'sleep() { :; }',
      'docker() {',
      '  echo "docker $*" >> "$LOG"',
      '  case "$*" in',
      '    *wget*) return "${READY_EXIT:-0}" ;;',
      '    *GetCallerIdentityCommand*) printf "arn:aws:sts::1:assumed-role/footbag-staging-app-runtime/s" ;;',
      '  esac',
      '}',
      `ENV_PATH=${JSON.stringify(envPath)}`,
      'FOOTBAG_ENV_VAL=staging',
      readEnv,
      remote.slice(start, end + endMarker.length),
      'echo TAIL_DONE',
    ].join('\n'));

    const res = spawnSync('bash', [harness], {
      env: { ...process.env, ...(extraEnv ?? {}) },
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
    return {
      status: res.status ?? -1,
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
      dbDir,
      log: existsSync(log) ? readFileSync(log, 'utf8') : '',
    };
  }

  /** A copy-aside timestamp, `days` before now. */
  const stampDaysAgo = (days: number): string =>
    new Date(Date.now() - days * 86_400_000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  // Defect caught: the deploy's half of the seven-day promise not kept, so a
  // host that migrates routinely fills its disk with copies of the member
  // database; or pruning aimed at a literal directory rather than the one the
  // host records.
  it('deletes old copies from the database directory the host records, once the release is ready', () => {
    const recording = `prune_db_copies() { echo "prune $1" >> ${JSON.stringify(join(workDir, 'tail-calls.log'))}; }`;
    const res = runTail(recording);

    expect(res.status, res.stderr).toBe(0);
    expect(res.log).toContain(`prune ${res.dbDir}`);
    expect(res.log.indexOf('wget')).toBeLessThan(res.log.indexOf('prune '));
    expect(res.log.indexOf('GetCallerIdentityCommand')).toBeLessThan(res.log.indexOf('prune '));
  });

  it('prunes with the shipped helper for real', () => {
    const hostDb = join(workDir, 'host-db');
    mkdirSync(hostDb, { recursive: true });
    const old = join(hostDb, `footbag.db.pre-migration.${stampDaysAgo(8)}`);
    const recent = join(hostDb, `footbag.db.pre-migration.${stampDaysAgo(1)}`);
    writeFileSync(old, 'old');
    writeFileSync(recent, 'recent');

    const res = runTail(readFileSync(PRUNE_LIB, 'utf8'));
    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
  });

  // Defect caught: copies deleted by a deploy that never came up, removing a
  // way back from an operator who may need it.
  it('does not prune when the release never reports ready', () => {
    const recording = `prune_db_copies() { echo "prune $1" >> ${JSON.stringify(join(workDir, 'tail-calls.log'))}; }`;
    const res = runTail(recording, { READY_EXIT: '1' });

    expect(res.status).toBe(1);
    expect(res.log).not.toContain('prune ');
  });

  // Defect caught: a deploy that had already succeeded reported as failed
  // because tidying up afterwards did not finish.
  it('warns and carries on when pruning fails', () => {
    const res = runTail('prune_db_copies() { return 1; }');

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('TAIL_DONE');
    expect(res.stderr).toContain('WARNING: pruning old database copies did not complete');
  });

  // The remote half calls a function only the helper defines, so the sender
  // has to put the helper ahead of the body on the stream.
  it('is shipped ahead of the remote half by the code deploy', () => {
    const sender = readFileSync(join(process.cwd(), 'scripts/deploy-code.sh'), 'utf8');
    expect(sender).toContain('PRUNE_LIB="${SCRIPT_DIR}/internal/prune-db-copies.sh"');
    expect(sender).toContain('cat "$PRUNE_LIB" "$REMOTE_HALF"');
  });
});
