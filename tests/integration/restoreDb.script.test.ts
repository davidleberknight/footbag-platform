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
  // The stub is bucket-generic: it strips only the scheme, so the bucket name
  // becomes the first path segment under the stand-in. That is what lets a case
  // assert WHICH bucket was read, which is the whole point of the DR case below.
  writeFileSync(join(binDir, 'aws'), [
    '#!/usr/bin/env bash',
    `echo "aws $*" >> ${JSON.stringify(callLog)}`,
    'if [[ "$1" == "s3" && "$2" == "cp" ]]; then',
    `  path="\${3#s3://}"`,
    `  cp ${JSON.stringify(s3Dir)}/"\${path}" "$4" || exit 1`,
    'fi',
    'exit 0',
  ].join('\n'));
  writeFileSync(join(binDir, 'systemctl'), [
    '#!/usr/bin/env bash',
    `echo "systemctl $*" >> ${JSON.stringify(callLog)}`,
    'exit 0',
  ].join('\n'));
  // The erasure replay runs in a throwaway container. Stubbed so the call is
  // recorded and its ordering against the service start can be asserted, and so
  // a case can make it fail on demand by setting DOCKER_STUB_EXIT.
  writeFileSync(join(binDir, 'docker'), [
    '#!/usr/bin/env bash',
    `echo "docker $*" >> ${JSON.stringify(callLog)}`,
    'exit "${DOCKER_STUB_EXIT:-0}"',
  ].join('\n'));
  chmodSync(join(binDir, 'aws'), 0o755);
  chmodSync(join(binDir, 'systemctl'), 0o755);
  chmodSync(join(binDir, 'docker'), 0o755);
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const HOST_BUCKET = 'footbag-test-snapshots';

/** Writes a snapshot into the stand-in bucket and returns its key. */
function publishSnapshot(
  members: string[],
  key = 'routine/2026/08/21/snap.db.gz',
  { bucket = HOST_BUCKET, compress = true }: { bucket?: string; compress?: boolean } = {},
): string {
  const raw = join(workDir, 'to-publish.db');
  rmSync(raw, { force: true });
  seedDb(raw, members);
  const target = join(s3Dir, bucket, key);
  mkdirSync(join(target, '..'), { recursive: true });
  const body = readFileSync(raw);
  writeFileSync(target, compress ? gzipSync(body) : body);
  return key;
}

function runRemote(
  snapshotKey: string,
  bucket?: string,
  extraEnv?: NodeJS.ProcessEnv,
): { status: number; stdout: string; stderr: string } {
  const res = spawnSync('bash', [REMOTE_HALF], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      ENV_PATH: envPath,
      SNAPSHOT_KEY: snapshotKey,
      ...(bucket === undefined ? {} : { BUCKET: bucket }),
      ...(extraEnv ?? {}),
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

  it('re-applies erasures before the service is allowed to serve the restored data', () => {
    // A snapshot older than an erasure carries back the personal data that
    // erasure removed, along with the ledger row that would have said it was
    // already applied. Replaying while the stack is still down is what keeps a
    // restore from serving an erased member's data until the next daily pass.
    const key = publishSnapshot(['snapshot-1']);
    const res = runRemote(key);

    expect(res.status, res.stderr).toBe(0);
    const log = calls();
    expect(log).toContain('runErasureReplay.js');
    expect(log.indexOf('runErasureReplay.js')).toBeLessThan(log.indexOf('systemctl start footbag'));
  });

  it('completes the restore, loudly, when the erasure replay cannot run', () => {
    // The database is already in place by this point. Refusing to start the
    // site would turn a privacy gap into an outage, so the replay failing is
    // reported rather than fatal, and it names what an operator must now do.
    const key = publishSnapshot(['snapshot-1']);
    const res = runRemote(key, undefined, { DOCKER_STUB_EXIT: '1' });

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('DATABASE RESTORED');
    expect(res.stderr).toContain('erasure replay did not complete');
    expect(calls()).toContain('systemctl start footbag');
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
    const target = join(s3Dir, HOST_BUCKET, key);
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

  it('fetches from the bucket the caller named, not the host\'s own', () => {
    // The cutover rollback artifact lives in the DR bucket, which is not the one
    // the host is configured with. --bucket used to select the snapshot and print
    // the confirmation banner, then get dropped before the ssh wire, so the host
    // restored from its own bucket while displaying the DR one. The failure was
    // invisible: correct-looking provenance, wrong database, after the live one
    // had already been replaced.
    const DR = 'footbag-production-db-snapshots-dr';
    const key = publishSnapshot(
      ['from-dr'],
      'pre-flip/pre-cutover-20260905T000000Z/pre-cutover-20260905T000000Z.db.gz',
      { bucket: DR },
    );

    const res = runRemote(key, DR);

    expect(res.status).toBe(0);
    expect(calls()).toContain(`s3://${DR}/`);
    expect(calls()).not.toContain(`s3://${HOST_BUCKET}/`);
    expect(memberIds(dbPath)).toEqual(['from-dr']);
  });

  it('falls back to the host\'s own bucket when the caller names none', () => {
    const key = publishSnapshot(['from-host']);

    const res = runRemote(key);

    expect(res.status).toBe(0);
    expect(calls()).toContain(`s3://${HOST_BUCKET}/`);
    expect(memberIds(dbPath)).toEqual(['from-host']);
  });

  it('restores an uncompressed snapshot as readily as a gzipped one', () => {
    // The pre-cutover snapshot now gzips, matching the routine stream. This
    // covers the assumption rather than the format: assuming compression is what
    // made the uncompressed artifact unreadable, and it failed at the one moment
    // there was nothing to fall back to. Detect, do not assume.
    const key = publishSnapshot(['plain-1'], 'pre-flip/plain/snap.db', { compress: false });

    const res = runRemote(key);

    expect(res.status).toBe(0);
    expect(memberIds(dbPath)).toEqual(['plain-1']);
  });

  it('refuses when the write-ahead-log checkpoint reports busy, rather than copying an incomplete database aside', () => {
    // The defect this pins: `PRAGMA wal_checkpoint` sets its first column to 1
    // when it could NOT complete, and sqlite3 still exits 0. The old code sent
    // that row to /dev/null and tested only the exit status, so a busy
    // checkpoint reported success and the copy taken next silently omitted
    // committed transactions still in the WAL — losing exactly the data the
    // copy existed to preserve. A stub standing in for a busy result is the only
    // way to reach that branch deterministically.
    writeFileSync(join(binDir, 'sqlite3'), [
      '#!/usr/bin/env bash',
      // Only the checkpoint call is faked busy; every other query passes through.
      'if [[ "$*" == *wal_checkpoint* ]]; then echo "5000"; echo "1|-1|-1"; exit 0; fi',
      `exec ${JSON.stringify(process.env.SQLITE3_BIN ?? '/usr/bin/sqlite3')} "$@"`,
    ].join('\n'));
    chmodSync(join(binDir, 'sqlite3'), 0o755);

    const res = runRemote(publishSnapshot(['snapshot-1']));

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('checkpoint');
    // The database is untouched and no copy was taken, which is the point: the
    // refusal lands before anything is replaced.
    expect(memberIds(dbPath)).toEqual(['live-1', 'live-2']);
    expect(asideCopies()).toHaveLength(0);
    // And the host is left as it was found: service back up, backup timer back
    // on. A timer left stopped is a silent loss of the recovery point that
    // nothing surfaces until the stale-backup alarm breaches.
    expect(calls()).toContain('systemctl start footbag\n');
    expect(calls()).toContain('systemctl start footbag-backup.timer');
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

  it('never picks a routine snapshot when the rollback artifact was asked for', () => {
    // The trap this pins: both classes replicate to the DR bucket, where ~1,200
    // routine objects sit beside one pre-flip artifact. A search across both
    // prefixes sorted by recency picks a routine snapshot every time, because
    // one lands every five minutes. That is a silent restore of the wrong point
    // in time during the cutover rollback, which is the moment with nothing
    // behind it. The two classes are therefore never searched together.
    const drill = join(workDir, 'preflip.db');
    const res = runOperator([
      '--to-local', drill, '--source', 'production', '--pre-flip', '--dry-run',
    ]);

    expect(res.stdout).toContain('pre-flip/');
    expect(res.stdout).not.toContain('routine/');
  });

  it('searches every retention generation by default, and says so', () => {
    // The producer keeps the fine-grained stream for two days and promotes an
    // hourly and a daily point out of it, so a search confined to the raw
    // stream would find nothing older than two days, and nothing whatever in
    // the disaster-recovery bucket, which carries only the promoted generations.
    const drill = join(workDir, 'routine.db');
    const res = runOperator([
      '--to-local', drill, '--source', 'production', '--dry-run',
    ]);

    expect(res.stdout).toContain('routine/');
    expect(res.stdout).toContain('hourly/');
    expect(res.stdout).toContain('daily/');
    expect(res.stdout).not.toContain('pre-flip/');
  });

  it('picks the newest point across tiers, not the alphabetically last tier', () => {
    // Tier names do not sort in time order, so concatenating the listings and
    // taking the last line would always answer with the raw stream whatever its
    // age. Here the newest point lives in the hourly tier while the raw stream
    // holds an older one, which is exactly the shape of a restore reaching
    // further back than the two-day window.
    const stubDir = join(workDir, 'tiered-bin');
    mkdirSync(stubDir, { recursive: true });
    const stub = join(stubDir, 'aws');
    writeFileSync(stub, [
      '#!/usr/bin/env bash',
      'args="$*"',
      'case "$args" in',
      '  *"/routine/"*) echo "2026-09-01 00:00:00 100 routine/2026/09/01/footbag-20260901T000000Z.db.gz"; exit 0 ;;',
      '  *"/hourly/"*)  echo "2026-09-04 00:00:00 100 hourly/2026/09/04/footbag-20260904T000000Z.db.gz"; exit 0 ;;',
      '  *"/daily/"*)   echo "2026-09-03 00:00:00 100 daily/2026/09/03/footbag-20260903T000000Z.db.gz"; exit 0 ;;',
      'esac',
      'exit 1',
    ].join('\n'));
    chmodSync(stub, 0o755);

    const drill = join(workDir, 'tiered.db');
    const res = runOperator(
      ['--to-local', drill, '--source', 'production'],
      { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ''}` },
    );

    expect(res.stdout).toContain('hourly/2026/09/04/footbag-20260904T000000Z.db.gz');
    expect(res.stdout).not.toContain('snapshot: s3://footbag-production-db-snapshots/routine/');
  });

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
