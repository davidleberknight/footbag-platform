/**
 * Turning a snapshot back into a running database.
 *
 * The backup producer has been sound for months and no restore had ever been
 * performed, which makes the whole recovery story a belief rather than a control.
 * These cover the procedure that closes that gap, against real SQLite files.
 *
 * The contract they assert: a snapshot is verified before anything is stopped, so
 * a bad artifact costs nothing; the database being replaced is copied aside with
 * its write-ahead log folded in first, because that copy is the only way back; the
 * service is stopped for the swap and restarted afterwards; and the operator half
 * refuses a destination it was not given rather than choosing one.
 *
 * The root-side body runs here with the host's own tools stubbed: it expects to
 * download from S3, drive systemd and run as root, none of which a test has. What
 * is exercised is everything that touches the data, which is the part that can
 * lose it.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import BetterSqlite3 from 'better-sqlite3';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/restore-db-remote.sh');
const OPERATOR_SCRIPT = join(process.cwd(), 'scripts/restore-db.sh');

/** The tables the restore reports counts over, and nothing else. */
const FIXTURE_SCHEMA = `
  CREATE TABLE members (id TEXT PRIMARY KEY);
  CREATE TABLE legacy_members (id TEXT PRIMARY KEY);
  CREATE TABLE historical_persons (id TEXT PRIMARY KEY);
  CREATE TABLE clubs (id TEXT PRIMARY KEY);
  CREATE TABLE audit_entries (id TEXT PRIMARY KEY);
  CREATE TABLE auto_link_staged_candidates (id TEXT PRIMARY KEY);
`;

let workDir: string;
let dbDir: string;
let dbPath: string;
let binDir: string;
let s3Dir: string;
let envPath: string;
let callLog: string;

function seedDb(path: string, members: string[]): void {
  const db = new BetterSqlite3(path);
  db.exec(FIXTURE_SCHEMA);
  const insert = db.prepare('INSERT INTO members (id) VALUES (?)');
  for (const id of members) insert.run(id);
  db.close();
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-restore-'));
  dbDir = join(workDir, 'db');
  binDir = join(workDir, 'bin');
  s3Dir = join(workDir, 's3');
  mkdirSync(dbDir);
  mkdirSync(binDir);
  mkdirSync(s3Dir);
  dbPath = join(dbDir, 'footbag.db');
  callLog = join(workDir, 'calls.log');

  // The database in place: two members, so a restore that puts the snapshot's
  // single member there is visibly a different database afterwards.
  seedDb(dbPath, ['live-1', 'live-2']);

  envPath = join(workDir, 'env');
  writeFileSync(envPath, [
    `FOOTBAG_DB_DIR=${dbDir}`,
    'BACKUP_S3_BUCKET=footbag-test-snapshots',
    'FOOTBAG_ENV=test',
    '',
  ].join('\n'));

  // The host's tools, stubbed. `aws s3 cp` copies out of a directory standing in
  // for the bucket, and systemctl records that it was called so a case can assert
  // the service was never stopped.
  writeFileSync(join(binDir, 'aws'), [
    '#!/usr/bin/env bash',
    `echo "aws $*" >> ${JSON.stringify(callLog)}`,
    'if [[ "$1" == "s3" && "$2" == "cp" ]]; then',
    `  key="\${3#s3://footbag-test-snapshots/}"`,
    `  cp ${JSON.stringify(s3Dir)}/"\${key}" "$4" || exit 1`,
    'fi',
    'exit 0',
  ].join('\n'));
  writeFileSync(join(binDir, 'systemctl'), [
    '#!/usr/bin/env bash',
    `echo "systemctl $*" >> ${JSON.stringify(callLog)}`,
    'exit 0',
  ].join('\n'));
  chmodSync(join(binDir, 'aws'), 0o755);
  chmodSync(join(binDir, 'systemctl'), 0o755);
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Writes a gzipped snapshot into the stand-in bucket and returns its key. */
function publishSnapshot(members: string[], key = 'routine/2026/08/21/snap.db.gz'): string {
  const raw = join(workDir, 'to-publish.db');
  rmSync(raw, { force: true });
  seedDb(raw, members);
  const target = join(s3Dir, key);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, gzipSync(readFileSync(raw)));
  return key;
}

function runRemote(snapshotKey: string): { status: number; stdout: string; stderr: string } {
  const res = spawnSync('bash', [REMOTE_HALF], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      ENV_PATH: envPath,
      SNAPSHOT_KEY: snapshotKey,
    },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function calls(): string {
  return existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
}

function memberIds(path: string): string[] {
  const db = new BetterSqlite3(path, { readonly: true });
  try {
    return (db.prepare('SELECT id FROM members ORDER BY id').all() as { id: string }[])
      .map((r) => r.id);
  } finally {
    db.close();
  }
}

function asideCopies(): string[] {
  return readdirSync(dbDir).filter((f) => f.includes('.pre-restore.'));
}

describe('restoring a snapshot onto a host', () => {
  it('replaces the database with the snapshot and restarts the service', () => {
    const key = publishSnapshot(['snapshot-1']);
    const res = runRemote(key);

    expect(res.status, res.stderr).toBe(0);
    expect(memberIds(dbPath)).toEqual(['snapshot-1']);
    expect(calls()).toContain('systemctl stop footbag');
    expect(calls()).toContain('systemctl start footbag');
    expect(res.stdout).toContain('DATABASE RESTORED');
  });

  it('copies the database it replaces aside, and says where', () => {
    // The copy is the only way back from restoring the wrong snapshot, so it is
    // taken before the swap and never cleaned up on the way out.
    const key = publishSnapshot(['snapshot-1']);
    const res = runRemote(key);

    expect(res.status, res.stderr).toBe(0);
    const aside = asideCopies();
    expect(aside).toHaveLength(1);
    expect(memberIds(join(dbDir, aside[0]))).toEqual(['live-1', 'live-2']);
    expect(res.stdout).toContain(aside[0]);
  });

  it('keeps rows that were still in the write-ahead log when it copied the database aside', () => {
    // Same lesson the migrating deploy learned. A stop that was not clean can
    // leave committed rows in the WAL, and a copy of the main file alone would
    // not carry them: the operator's only way back would be missing exactly the
    // writes that happened just before the restore.
    const live = new BetterSqlite3(dbPath);
    live.pragma('journal_mode = WAL');
    live.prepare('INSERT INTO members (id) VALUES (?)').run('live-3-in-wal');
    const stagedDb = join(workDir, 'staged.db');
    const stagedWal = join(workDir, 'staged.db-wal');
    writeFileSync(stagedDb, readFileSync(dbPath));
    writeFileSync(stagedWal, readFileSync(`${dbPath}-wal`));
    live.close();
    writeFileSync(dbPath, readFileSync(stagedDb));
    writeFileSync(`${dbPath}-wal`, readFileSync(stagedWal));

    const res = runRemote(publishSnapshot(['snapshot-1']));
    expect(res.status, res.stderr).toBe(0);

    const aside = asideCopies();
    expect(aside).toHaveLength(1);
    expect(memberIds(join(dbDir, aside[0]))).toContain('live-3-in-wal');
  });

  it('refuses a corrupt snapshot without stopping anything', () => {
    // The ordering that makes a failed restore a non-event: verification happens
    // while the site is still serving, so a bad artifact costs nothing.
    const key = 'routine/2026/08/21/corrupt.db.gz';
    const target = join(s3Dir, key);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, gzipSync(Buffer.from('this is not a database')));

    const res = runRemote(key);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('integrity check');
    expect(res.stderr).toContain('Nothing was stopped');
    expect(calls()).not.toContain('systemctl stop');
    expect(memberIds(dbPath)).toEqual(['live-1', 'live-2']);
    expect(asideCopies()).toHaveLength(0);
  });

  it('refuses a snapshot that is not in the bucket, without stopping anything', () => {
    const res = runRemote('routine/2026/08/21/absent.db.gz');

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not download');
    expect(calls()).not.toContain('systemctl stop');
    expect(memberIds(dbPath)).toEqual(['live-1', 'live-2']);
  });

  it('refuses a host whose env names no snapshot bucket', () => {
    writeFileSync(envPath, `FOOTBAG_DB_DIR=${dbDir}\n`);
    const res = runRemote(publishSnapshot(['snapshot-1']));

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('BACKUP_S3_BUCKET');
    expect(calls()).not.toContain('systemctl stop');
  });

  it('reports what the snapshot holds and what it would replace', () => {
    // Reported rather than judged: a count this script called "too low" would be
    // a guess about which snapshot was meant.
    const res = runRemote(publishSnapshot(['snapshot-1']));

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('snapshot contents:');
    expect(res.stdout).toContain('database in place:');
    expect(res.stdout).toContain('members=1');
    expect(res.stdout).toContain('members=2');
  });
});

describe('the operator-facing restore script', () => {
  function runOperator(
    args: string[],
    env?: NodeJS.ProcessEnv,
  ): { status: number; stdout: string; stderr: string } {
    const res = spawnSync('setsid', ['bash', OPERATOR_SCRIPT, ...args], {
      encoding: 'utf8',
      input: '',
      ...(env ? { env } : {}),
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }

  /**
   * An AWS CLI that answers the way an unusable one does: 253 is what it returns
   * when the environment or profile it was told to use does not resolve, which is
   * the state of any machine that holds no credentials for this account.
   */
  function withBrokenAws(): NodeJS.ProcessEnv {
    const stubDir = join(workDir, 'broken-bin');
    mkdirSync(stubDir, { recursive: true });
    const stub = join(stubDir, 'aws');
    writeFileSync(stub, ['#!/usr/bin/env bash', 'exit 253'].join('\n'));
    chmodSync(stub, 0o755);
    return { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ''}` };
  }

  it('refuses without a destination rather than choosing one', () => {
    const res = runOperator([]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('name a destination');
  });

  it('refuses two destinations at once', () => {
    const res = runOperator(['--target', 'staging', '--to-local', join(workDir, 'out.db')]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('mutually exclusive');
  });

  it('refuses a snapshot stream that is not one of the two environments', () => {
    const res = runOperator(['--to-local', join(workDir, 'out.db'), '--source', 'prod']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("must be 'staging' or 'production'");
  });

  it('reads each environment from its own snapshot bucket', () => {
    // The two buckets are not named to the same pattern. Guessing one shape for
    // both reads an empty listing on the other and calls it "no snapshots".
    const prod = runOperator(['--to-local', join(workDir, 'p.db'), '--source', 'production', '--dry-run']);
    const staging = runOperator(['--to-local', join(workDir, 's.db'), '--source', 'staging', '--dry-run']);

    expect(prod.stdout).toContain('footbag-production-db-snapshots');
    expect(staging.stdout).toContain('footbag-staging-snapshots');
  });

  it('refuses to overwrite an existing local file', () => {
    const existing = join(workDir, 'already-here.db');
    writeFileSync(existing, 'do not clobber me');
    const res = runOperator(['--to-local', existing, '--source', 'staging']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('refusing to overwrite');
    expect(readFileSync(existing, 'utf8')).toBe('do not clobber me');
  });

  it('refuses to overwrite before it needs AWS, so the refusal survives a machine with no credentials', () => {
    // The destination check is a local fact and must answer first. Behind a
    // snapshot listing it never runs on a machine whose AWS CLI cannot resolve
    // an account: the listing fails, the script exits on that instead, and the
    // operator is told about credentials rather than about the file they were
    // about to lose.
    const existing = join(workDir, 'guarded.db');
    writeFileSync(existing, 'do not clobber me');
    const res = runOperator(['--to-local', existing, '--source', 'staging'], withBrokenAws());
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('refusing to overwrite');
    expect(readFileSync(existing, 'utf8')).toBe('do not clobber me');
  });
});
