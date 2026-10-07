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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import BetterSqlite3 from 'better-sqlite3';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/restore-db-remote.sh');
const OPERATOR_SCRIPT = join(process.cwd(), 'scripts/restore-db.sh');
const PRUNE_LIB = join(process.cwd(), 'scripts/internal/prune-db-copies.sh');

/** The remote half's exit status when it leaves an erasure replay pending. */
const PENDING_EXIT = 3;

/** A copy-aside timestamp, in the form the scripts name copies with, `days` ago. */
function stampDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
    .replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** The tables the restore and the drill report over, and nothing else. */
const FIXTURE_SCHEMA = `
  CREATE TABLE members (id TEXT PRIMARY KEY);
  CREATE TABLE legacy_members (id TEXT PRIMARY KEY);
  CREATE TABLE historical_persons (id TEXT PRIMARY KEY);
  CREATE TABLE clubs (id TEXT PRIMARY KEY);
  CREATE TABLE audit_entries (id TEXT PRIMARY KEY, occurred_at TEXT);
  CREATE TABLE legacy_claim_declines (id TEXT PRIMARY KEY);
  CREATE TABLE payments (id TEXT PRIMARY KEY);
`;

let workDir: string;
let dbDir: string;
let dbPath: string;
let binDir: string;
let s3Dir: string;
let envPath: string;
let callLog: string;

function seedDb(path: string, members: string[], schema = FIXTURE_SCHEMA, extraSql = ''): void {
  const db = new BetterSqlite3(path);
  db.exec(schema);
  const insert = db.prepare('INSERT INTO members (id) VALUES (?)');
  for (const id of members) insert.run(id);
  if (extraSql) db.exec(extraSql);
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
  // SYSTEMCTL_TIMER_INACTIVE makes the backup timer read as not running, the
  // state a host is in after an earlier restore left its replay pending.
  writeFileSync(join(binDir, 'systemctl'), [
    '#!/usr/bin/env bash',
    `echo "systemctl $*" >> ${JSON.stringify(callLog)}`,
    'if [[ "$1" == "is-active" && "$*" == *footbag-backup.timer* && -n "${SYSTEMCTL_TIMER_INACTIVE:-}" ]]; then exit 3; fi',
    'exit 0',
  ].join('\n'));
  // The erasure replay runs in a throwaway container. Stubbed so the call is
  // recorded and its ordering against the service start can be asserted. By
  // default it prints the replay's own success line; a case can make it fail by
  // setting DOCKER_STUB_EXIT, or change what it prints with DOCKER_STUB_OUTPUT.
  // The readiness probe is `docker compose ... exec`, answered by
  // DOCKER_STUB_EXEC_EXIT. DOCKER_STUB_SIGNAL sends that signal to the restore
  // itself from inside the replay, which is how a case lands an interrupt in the
  // window between the snapshot going in place and the replay finishing: the
  // replay runs inside a command substitution, so the restore is the parent of
  // the stub's parent.
  writeFileSync(join(binDir, 'docker'), [
    '#!/usr/bin/env bash',
    `echo "docker $*" >> ${JSON.stringify(callLog)}`,
    'if [[ " $* " == *" exec "* ]]; then exit "${DOCKER_STUB_EXEC_EXIT:-0}"; fi',
    'if [[ -n "${DOCKER_STUB_SIGNAL:-}" ]]; then',
    '  kill -"$DOCKER_STUB_SIGNAL" "$(ps -o ppid= -p "$PPID" | tr -d " ")"',
    'fi',
    'printf "%s\\n" "${DOCKER_STUB_OUTPUT-erasure-replay: ok}"',
    'exit "${DOCKER_STUB_EXIT:-0}"',
  ].join('\n'));
  // The readiness poll waits between probes. A no-op stand-in lets a case that
  // never becomes ready reach the poll's verdict without waiting for it.
  writeFileSync(join(binDir, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(join(binDir, 'aws'), 0o755);
  chmodSync(join(binDir, 'systemctl'), 0o755);
  chmodSync(join(binDir, 'docker'), 0o755);
  chmodSync(join(binDir, 'sleep'), 0o755);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const HOST_BUCKET = 'footbag-test-snapshots';

/** Writes a snapshot into the stand-in bucket and returns its key. */
function publishSnapshot(
  members: string[],
  key = 'routine/2026/08/21/snap.db.gz',
  {
    bucket = HOST_BUCKET, compress = true, schema = FIXTURE_SCHEMA, extraSql = '',
  }: { bucket?: string; compress?: boolean; schema?: string; extraSql?: string } = {},
): string {
  const raw = join(workDir, 'to-publish.db');
  rmSync(raw, { force: true });
  seedDb(raw, members, schema, extraSql);
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

/**
 * Runs the remote half the way the wire delivers it: a prelude (the real
 * pruning helper, or a stand-in for it) ahead of the body on one stream.
 */
function runRemoteShipped(
  snapshotKey: string,
  prelude: string,
  extraEnv?: NodeJS.ProcessEnv,
): { status: number; stdout: string; stderr: string } {
  const wire = join(workDir, 'wire.sh');
  writeFileSync(wire, `${prelude}\n${readFileSync(REMOTE_HALF, 'utf8')}`);
  const res = spawnSync('bash', [wire], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      ENV_PATH: envPath,
      SNAPSHOT_KEY: snapshotKey,
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
    // A warning on every restore is a warning nobody reads.
    expect(res.stderr).not.toContain('erasure replay did not complete');
    const log = calls();
    expect(log).toContain('runErasureReplay.js');
    expect(log.indexOf('runErasureReplay.js')).toBeLessThan(log.indexOf('systemctl start footbag'));
  });

  // Defect caught: a restore whose erasure replay failed started the site
  // anyway, serving personal data members had asked to have erased. The site
  // stays down instead, and the run names the one command that finishes the job.
  it('leaves the site stopped when the erasure replay cannot run', () => {
    const key = publishSnapshot(['snapshot-1']);
    const res = runRemote(key, undefined, { DOCKER_STUB_EXIT: '1' });

    expect(res.status).toBe(PENDING_EXIT);
    expect(memberIds(dbPath)).toEqual(['snapshot-1']);
    expect(calls()).not.toMatch(/^systemctl start footbag$/m);
    expect(res.stdout).not.toContain('DATABASE RESTORED');
    expect(res.stderr).toContain('erasure replay did not complete');
    expect(res.stderr).toContain('bash scripts/restore-db.sh --target test --resume-erasure-replay');
  });

  it('leaves the site stopped when the replay exits cleanly without reporting that it re-applied the erasures', () => {
    // Defect caught: the restore judged the replay on its exit status alone, so a
    // container that exited 0 without ever reaching the replay's verdict was
    // reported as a completed replay while the restored database served
    // personal data a member had asked to have erased.
    const key = publishSnapshot(['snapshot-1']);
    const res = runRemote(key, undefined, { DOCKER_STUB_OUTPUT: 'container started' });

    expect(res.status).toBe(PENDING_EXIT);
    expect(calls()).not.toMatch(/^systemctl start footbag$/m);
    expect(res.stderr).toContain('erasure replay did not complete');
  });

  it('refuses, and restarts the service, when it cannot measure the free space', () => {
    // The service is already stopped by this point, so how this fails decides
    // whether the host comes back. An unguarded `db_kb=$(du …)` takes the
    // command's status under set -e and aborts the script where it stands,
    // before the refusal below and before its restart, leaving the host down
    // with nothing printed to say why. A measurement that cannot be taken is
    // not permission to copy blind either: the aside copy is the only way back
    // from restoring the wrong snapshot.
    const failingDu = join(workDir, 'no-du');
    mkdirSync(failingDu, { recursive: true });
    writeFileSync(join(failingDu, 'du'), ['#!/usr/bin/env bash', 'exit 1'].join('\n'));
    chmodSync(join(failingDu, 'du'), 0o755);

    const key = publishSnapshot(['snapshot-1']);
    const res = runRemote(key, undefined, {
      PATH: `${failingDu}:${binDir}:${process.env.PATH ?? ''}`,
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not measure the database');
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

describe('a restore whose erasure replay has not completed', () => {
  const marker = (): string => join(dbDir, '.erasure-replay-pending');
  const timerStarted = (): boolean => /^systemctl start footbag-backup\.timer$/m.test(calls());

  // Defect caught: the exit trap restarted the backup timer on every exit, so a
  // failed replay had the un-erased database backed up within minutes, into a
  // stream whose promoted generations replicate to an object-locked bucket.
  it('keeps the backup timer stopped when the replay fails', () => {
    const res = runRemote(publishSnapshot(['snapshot-1']), undefined, { DOCKER_STUB_EXIT: '1' });

    expect(res.status).toBe(PENDING_EXIT);
    expect(calls()).toContain('systemctl stop footbag-backup.timer');
    expect(timerStarted()).toBe(false);
    expect(res.stderr).toContain('Backups are PAUSED');
  });

  // Defect caught: a failure after the snapshot went in place but before the
  // replay ran (here the hand-over to the application's account) left the
  // un-erased database in place and the trap restarted the backups anyway.
  it('keeps the backup timer stopped when a step between the swap and the replay fails', () => {
    const failing = join(workDir, 'failing-chown');
    mkdirSync(failing, { recursive: true });
    writeFileSync(join(failing, 'chown'), '#!/usr/bin/env bash\nexit 1\n');
    chmodSync(join(failing, 'chown'), 0o755);

    const res = runRemote(publishSnapshot(['snapshot-1']), undefined, {
      PATH: `${failing}:${binDir}:${process.env.PATH ?? ''}`,
    });

    expect(res.status).toBe(PENDING_EXIT);
    expect(memberIds(dbPath)).toEqual(['snapshot-1']);
    expect(timerStarted()).toBe(false);
    expect(calls()).not.toMatch(/^systemctl start footbag$/m);
    expect(existsSync(marker())).toBe(true);
  });

  // Defect caught: an interrupt in the window ran the cleanup, which restarted
  // the backups, and then the restore carried on from where it was.
  it('keeps the backup timer stopped when the run is terminated inside the window', () => {
    const res = runRemote(publishSnapshot(['snapshot-1']), undefined, { DOCKER_STUB_SIGNAL: 'TERM' });

    expect(res.status).toBe(PENDING_EXIT);
    expect(timerStarted()).toBe(false);
    expect(calls()).not.toMatch(/^systemctl start footbag$/m);
    expect(res.stdout).not.toContain('DATABASE RESTORED');
    expect(existsSync(marker())).toBe(true);
  });

  // Defect caught: the backups resumed before the replay had re-applied the
  // erasures, or never resumed at all after a clean restore.
  it('restarts the backup timer after a successful replay, and only after it', () => {
    const res = runRemote(publishSnapshot(['snapshot-1']));

    expect(res.status, res.stderr).toBe(0);
    const log = calls();
    expect(timerStarted()).toBe(true);
    expect(log.indexOf('runErasureReplay.js'))
      .toBeLessThan(log.indexOf('systemctl start footbag-backup.timer'));
    expect(existsSync(marker())).toBe(false);
  });

  // Defect caught: the only record of the pending window was the process
  // itself, so a reboot or a deploy's restart served the un-erased database and
  // the next scheduled backup shipped it.
  it('leaves a marker beside the database naming the snapshot it is waiting on', () => {
    const key = publishSnapshot(['snapshot-1']);
    runRemote(key, undefined, { DOCKER_STUB_EXIT: '1' });

    expect(readFileSync(marker(), 'utf8')).toContain(`snapshot=${key}`);
  });

  // Defect caught: putting the previous database back after a failed in-place
  // check left the marker behind, so the host refused to serve or back up a
  // database that never needed a replay.
  it('clears the marker and resumes everything when the previous database is put back', () => {
    const realSqlite = spawnSync('bash', ['-c', 'command -v sqlite3'], { encoding: 'utf8', ...SPAWN_GUARD })
      .stdout.trim();
    const failingCheck = join(workDir, 'in-place-check-fails');
    mkdirSync(failingCheck, { recursive: true });
    writeFileSync(join(failingCheck, 'sqlite3'), [
      '#!/usr/bin/env bash',
      `if [[ "$1" == ${JSON.stringify(dbPath)} && "$2" == "PRAGMA integrity_check;" ]]; then echo corrupt; exit 0; fi`,
      `exec ${JSON.stringify(realSqlite)} "$@"`,
    ].join('\n'));
    chmodSync(join(failingCheck, 'sqlite3'), 0o755);

    const res = runRemote(publishSnapshot(['snapshot-1']), undefined, {
      PATH: `${failingCheck}:${binDir}:${process.env.PATH ?? ''}`,
    });

    expect(res.status).toBe(1);
    expect(memberIds(dbPath)).toEqual(['live-1', 'live-2']);
    expect(existsSync(marker())).toBe(false);
    expect(calls()).toMatch(/^systemctl start footbag$/m);
    expect(timerStarted()).toBe(true);
  });

  // Defect caught: a second restore over a host whose first replay was still
  // pending found the timer already stopped, recorded that it had not paused it,
  // and so never resumed the backups after its own replay succeeded.
  it('resumes the backups an earlier pending restore paused once its own replay succeeds', () => {
    writeFileSync(marker(), 'snapshot=routine/earlier.db.gz\nbackup_timer_paused=1\n');
    const res = runRemote(publishSnapshot(['snapshot-1']), undefined, { SYSTEMCTL_TIMER_INACTIVE: '1' });

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(marker())).toBe(false);
    expect(timerStarted()).toBe(true);
  });
});

describe('finishing a pending erasure replay on the host', () => {
  const marker = (): string => join(dbDir, '.erasure-replay-pending');
  const resume = (extraEnv?: NodeJS.ProcessEnv) =>
    runRemote('', undefined, { RESUME_ERASURE_REPLAY: '1', ...(extraEnv ?? {}) });

  // Defect caught: a resume on a host with nothing pending ran the replay and
  // started the service on the strength of the operator's belief alone.
  it('refuses when no replay is pending, without running or starting anything', () => {
    const res = resume();

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no erasure replay is pending');
    expect(calls()).not.toContain('docker');
    expect(calls()).not.toContain('systemctl start');
  });

  // Defect caught: the marker cleared, or the site and backups started, before
  // the replay had succeeded.
  it('re-runs the replay, then clears the marker and starts the site and the backups', () => {
    writeFileSync(marker(), 'snapshot=routine/x.db.gz\nbackup_timer_paused=1\n');
    const res = resume();

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(marker())).toBe(false);
    const log = calls();
    const replayAt = log.indexOf('runErasureReplay.js');
    expect(replayAt).toBeGreaterThan(-1);
    expect(replayAt).toBeLessThan(log.search(/^systemctl start footbag$/m));
    expect(replayAt).toBeLessThan(log.indexOf('systemctl start footbag-backup.timer'));
  });

  it('keeps everything held when the replay fails again', () => {
    writeFileSync(marker(), 'snapshot=routine/x.db.gz\nbackup_timer_paused=1\n');
    const res = resume({ DOCKER_STUB_EXIT: '1' });

    expect(res.status).toBe(PENDING_EXIT);
    expect(existsSync(marker())).toBe(true);
    expect(calls()).not.toContain('systemctl start');
  });
});

describe('pruning old database copies after a restore', () => {
  /** A stand-in for the shipped helper that records when it ran and with what. */
  const recordingPrune = (): string =>
    `prune_db_copies() { echo "prune $1" >> ${JSON.stringify(callLog)}; }`;

  // Defect caught: copies pruned before the restored service had proved itself,
  // removing a week-old way back from an operator whose restore did not come up.
  it('prunes only after the restored service reports ready', () => {
    const res = runRemoteShipped(publishSnapshot(['snapshot-1']), recordingPrune());

    expect(res.status, res.stderr).toBe(0);
    const log = calls();
    expect(log).toContain(`prune ${dbDir}`);
    expect(log.indexOf('wget')).toBeGreaterThan(-1);
    expect(log.indexOf('wget')).toBeLessThan(log.indexOf('prune '));
  });

  it('does not prune when the restored service never reports ready', () => {
    const res = runRemoteShipped(publishSnapshot(['snapshot-1']), recordingPrune(), {
      DOCKER_STUB_EXEC_EXIT: '1',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('did not report ready');
    expect(calls()).not.toContain('prune ');
  });

  // Defect caught: the restore's own seven-day promise not kept, with copies of
  // the member database accumulating on the host.
  it('deletes a copy more than seven days old and keeps the one it just made', () => {
    const old = `footbag.db.pre-restore.${stampDaysAgo(8)}`;
    writeFileSync(join(dbDir, old), 'old copy');
    const res = runRemoteShipped(publishSnapshot(['snapshot-1']), readFileSync(PRUNE_LIB, 'utf8'));

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(join(dbDir, old))).toBe(false);
    expect(asideCopies()).toHaveLength(1);
  });

  // Defect caught: the drill, which promises to touch nothing the host keeps,
  // deleting the host's set-aside copies.
  it('never prunes during a drill', () => {
    const old = `footbag.db.pre-restore.${stampDaysAgo(8)}`;
    writeFileSync(join(dbDir, old), 'old copy');
    const res = runRemoteShipped(publishSnapshot(['snapshot-1']), readFileSync(PRUNE_LIB, 'utf8'), {
      DRILL: '1',
    });

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(join(dbDir, old))).toBe(true);
  });

  // Defect caught: a restore that had already succeeded reported as failed
  // because tidying up afterwards did not finish.
  it('warns, and still reports the restore done, when pruning fails', () => {
    const res = runRemoteShipped(publishSnapshot(['snapshot-1']), 'prune_db_copies() { return 1; }');

    expect(res.status, res.stderr).toBe(0);
    expect(res.stderr).toContain('WARNING: pruning old database copies did not complete');
    expect(res.stdout).toContain('DATABASE RESTORED');
  });
});

describe('the restore drill on a host', () => {
  /** A scratch root the drill's mktemp lands in, so a case can see what it left. */
  function scratchRoot(): string {
    const dir = join(workDir, 'scratch-root');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  it('proves the snapshot restores and answers queries, without touching the live database or the service', () => {
    // The drill is how the go-live backup gate is met without production data
    // leaving the production host. A drill that stopped the service, replaced
    // the live database or ran the erasure replay would turn a rehearsal into
    // an outage on the one host it exists to protect.
    const key = publishSnapshot(['snap-1', 'snap-2', 'snap-3'], undefined, {
      extraSql: `
        INSERT INTO payments (id) VALUES ('pay-1'), ('pay-2');
        INSERT INTO audit_entries (id, occurred_at) VALUES
          ('a-1', '2026-10-01T00:00:00.000Z'), ('a-2', '2026-10-05T12:00:00.000Z');
      `,
    });
    const res = runRemote(key, undefined, { DRILL: '1', TMPDIR: scratchRoot() });

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('RESTORE DRILL PASSED');
    expect(res.stdout).toMatch(/Members:\s+3\n/);
    expect(res.stdout).toMatch(/Payments:\s+2\n/);
    expect(res.stdout).toContain('Newest audit:  2026-10-05T12:00:00.000Z');
    expect(res.stdout).toMatch(/Elapsed:\s+\d+s/);
    expect(memberIds(dbPath)).toEqual(['live-1', 'live-2']);
    expect(asideCopies()).toHaveLength(0);
    expect(calls()).not.toContain('systemctl');
    expect(calls()).not.toContain('docker');
  });

  it('leaves no copy of the restored data behind on the host', () => {
    // The scratch directory holds a full copy of the member database. One left
    // behind is a second, unaudited copy of every member's personal data, and
    // a file deleted without shredding leaves its blocks readable on the disk.
    // The stand-in shred records each call and removes what it was given.
    writeFileSync(join(binDir, 'shred'), [
      '#!/usr/bin/env bash',
      `echo "shred $*" >> ${JSON.stringify(callLog)}`,
      'for f in "$@"; do [[ "$f" == -* ]] || rm -f -- "$f"; done',
    ].join('\n'));
    chmodSync(join(binDir, 'shred'), 0o755);
    const root = scratchRoot();
    const res = runRemote(publishSnapshot(['snap-1']), undefined, { DRILL: '1', TMPDIR: root });

    expect(res.status, res.stderr).toBe(0);
    expect(readdirSync(root)).toEqual([]);
    expect(calls()).toMatch(/^shred -u .*scratch-root\//m);
  });

  it('fails a snapshot that passes its integrity check but cannot answer the payment query', () => {
    // A well-formed file is not a usable restore. A snapshot missing a table the
    // site depends on passes PRAGMA integrity_check, and a drill judged on that
    // alone would record a recovery that could not serve the payments page.
    const withoutPayments = FIXTURE_SCHEMA.replace('CREATE TABLE payments (id TEXT PRIMARY KEY);', '');
    const key = publishSnapshot(['snap-1'], undefined, { schema: withoutPayments });
    const root = scratchRoot();
    const res = runRemote(key, undefined, { DRILL: '1', TMPDIR: root });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('restore drill FAILED');
    expect(memberIds(dbPath)).toEqual(['live-1', 'live-2']);
    expect(calls()).not.toContain('systemctl');
    expect(readdirSync(root)).toEqual([]);
  });
});

describe('the operator-facing restore script', () => {
  function runOperator(
    args: string[],
    env?: NodeJS.ProcessEnv,
  ): { status: number; stdout: string; stderr: string } {
    // The script settles and proves its identity before it searches the bucket,
    // through its own seams rather than the CLI on PATH, so a case that makes
    // that CLI unusable still makes it unusable for the search itself.
    const res = spawnSync('setsid', ['bash', OPERATOR_SCRIPT, ...args], {
      encoding: 'utf8',
      input: '',
      env: { ...(env ?? process.env), ...awsIdentityStubEnv(workDir) },
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
    const res = runOperator([
      '--target', 'production', '--pre-flip', '--bucket', 'footbag-production-db-snapshots-dr', '--dry-run',
    ]);

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('pre-flip/');
    expect(res.stdout).not.toContain('routine/');
  });

  it('drills the rollback artifact itself, in scratch, without replacing anything', () => {
    // Defect caught: the cutover's rollback snapshot verified only by a drill of
    // some other snapshot, or the drill flag dropped when the artifact is asked
    // for, turning a verification on the day of the flip into a live restore.
    const res = runOperator([
      '--target', 'production', '--drill', '--pre-flip',
      '--bucket', 'footbag-production-db-snapshots-dr', '--dry-run',
    ]);

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('prefix pre-flip/');
    expect(res.stdout).toContain('The live database and the service are not touched.');
  });

  it('searches every retention generation by default, and says so', () => {
    // The producer keeps the fine-grained stream for two days and promotes an
    // hourly and a daily point out of it, so a search confined to the raw
    // stream would find nothing older than two days, and nothing whatever in
    // the disaster-recovery bucket, which carries only the promoted generations.
    const res = runOperator(['--target', 'production', '--drill', '--dry-run']);

    expect(res.status, res.stderr).toBe(0);
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

    const local = join(workDir, 'tiered.db');
    const res = runOperator(
      ['--to-local', local, '--source', 'staging'],
      { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ''}` },
    );

    expect(res.stdout).toContain('hourly/2026/09/04/footbag-20260904T000000Z.db.gz');
    expect(res.stdout).not.toContain('snapshot: s3://footbag-staging-snapshots/routine/');
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

  // Defect caught: a staging snapshot, holding test accounts and rehearsal
  // data, is restored over the production database, whether named by stream or
  // by bucket. The refusal must land before any network step, and on no other
  // direction.
  it('refuses a staging snapshot onto production, by stream or by bucket, before touching the network', () => {
    const stubDir = join(workDir, 'recording-bin');
    mkdirSync(stubDir, { recursive: true });
    const marker = join(workDir, 'network-calls.log');
    for (const tool of ['aws', 'ssh']) {
      writeFileSync(join(stubDir, tool), [
        '#!/usr/bin/env bash',
        `echo "${tool} $*" >> "${marker}"`,
        'exit 1',
      ].join('\n'));
      chmodSync(join(stubDir, tool), 0o755);
    }
    const env = { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ''}` };
    const refusal = 'a staging snapshot never restores onto production';

    // The refused pair runs for real, not as a dry run, with the identity seams
    // pointed at the recording stub too: a refusal placed after the identity
    // lookup or the snapshot listing would leave a line in the marker.
    const real = spawnSync('setsid', [
      'bash', OPERATOR_SCRIPT, '--target', 'production', '--source', 'staging',
    ], {
      encoding: 'utf8',
      input: '',
      env: { ...env, AWS_PROFILE_BIN: join(stubDir, 'aws'), AWS_IDENTITY_BIN: join(stubDir, 'aws') },
      ...SPAWN_GUARD,
    });
    expect(real.status).toBe(1);
    expect(real.stderr).toContain(refusal);
    expect(existsSync(marker), 'the refusal reached AWS or the host first').toBe(false);

    // The bucket names the object store outright, so a staging bucket handed to
    // a production restore reads a staging snapshot even when the stream says
    // production. Refused for real too, before the network.
    const viaBucket = spawnSync('setsid', [
      'bash', OPERATOR_SCRIPT, '--target', 'production', '--source', 'production',
      '--bucket', 'footbag-staging-snapshots',
    ], {
      encoding: 'utf8',
      input: '',
      env: { ...env, AWS_PROFILE_BIN: join(stubDir, 'aws'), AWS_IDENTITY_BIN: join(stubDir, 'aws') },
      ...SPAWN_GUARD,
    });
    expect(viaBucket.status).toBe(1);
    expect(viaBucket.stderr).toContain(refusal);
    expect(existsSync(marker), 'the bucket refusal reached AWS or the host first').toBe(false);

    // The mirror case: a production bucket passes the bucket check, so only the
    // stream check refuses a staging stream named onto production.
    const viaStream = spawnSync('setsid', [
      'bash', OPERATOR_SCRIPT, '--target', 'production', '--source', 'staging',
      '--bucket', 'footbag-production-db-snapshots',
    ], {
      encoding: 'utf8',
      input: '',
      env: { ...env, AWS_PROFILE_BIN: join(stubDir, 'aws'), AWS_IDENTITY_BIN: join(stubDir, 'aws') },
      ...SPAWN_GUARD,
    });
    expect(viaStream.status).toBe(1);
    expect(viaStream.stderr).toContain(refusal);
    expect(existsSync(marker), 'the stream refusal reached AWS or the host first').toBe(false);

    // The cutover rollback reads production's DR bucket onto production, which
    // is not the refused direction.
    const rollback = runOperator([
      '--target', 'production', '--source', 'production',
      '--bucket', 'footbag-production-db-snapshots-dr', '--dry-run',
    ], env);
    expect(rollback.status, rollback.stderr).toBe(0);
  });

  // Defect caught: a production snapshot, holding every member's personal data,
  // lands on a workstation disk or on the internet-reachable staging host,
  // whether named by stream or by bucket. Production data never leaves
  // production, and the refusal must land before anything reaches the network.
  it('never lets a production snapshot leave production, before touching the network', () => {
    const stubDir = join(workDir, 'recording-bin-prod');
    mkdirSync(stubDir, { recursive: true });
    const marker = join(workDir, 'network-calls-prod.log');
    for (const tool of ['aws', 'ssh']) {
      writeFileSync(join(stubDir, tool), [
        '#!/usr/bin/env bash',
        `echo "${tool} $*" >> "${marker}"`,
        'exit 1',
      ].join('\n'));
      chmodSync(join(stubDir, tool), 0o755);
    }
    const env = {
      ...process.env,
      PATH: `${stubDir}:${process.env.PATH ?? ''}`,
      AWS_PROFILE_BIN: join(stubDir, 'aws'),
      AWS_IDENTITY_BIN: join(stubDir, 'aws'),
    };
    const refusal = 'a production snapshot never leaves production';

    // Each run is real, not a dry run, so a refusal placed after the identity
    // lookup or the snapshot listing would leave a line in the marker.
    const leaks: string[][] = [
      ['--to-local', join(workDir, 'prod-copy.db'), '--source', 'production'],
      ['--to-local', join(workDir, 'dr-copy.db'), '--source', 'staging', '--bucket', 'footbag-production-db-snapshots-dr'],
      ['--target', 'staging', '--source', 'production'],
      ['--target', 'staging', '--bucket', 'footbag-production-db-snapshots'],
      ['--target', 'staging', '--drill', '--source', 'production'],
      // A staging bucket passes the bucket check, so only the stream check
      // stands between these runs and the staging host or the workstation.
      ['--target', 'staging', '--source', 'production', '--bucket', 'footbag-staging-snapshots'],
      ['--to-local', join(workDir, 'stream-copy.db'), '--source', 'production', '--bucket', 'footbag-staging-snapshots'],
    ];
    for (const args of leaks) {
      const res = spawnSync('setsid', ['bash', OPERATOR_SCRIPT, ...args], {
        encoding: 'utf8', input: '', env, ...SPAWN_GUARD,
      });
      expect(res.status, args.join(' ')).toBe(1);
      expect(res.stderr, args.join(' ')).toContain(refusal);
    }
    expect(existsSync(marker), 'a refusal reached AWS or the host first').toBe(false);
    expect(existsSync(join(workDir, 'prod-copy.db'))).toBe(false);

    // Each environment still reads its own stream: the refusal is about the
    // direction, not about production or staging as such.
    for (const args of [
      ['--target', 'production', '--source', 'production', '--dry-run'],
      ['--target', 'production', '--drill', '--dry-run'],
      ['--target', 'staging', '--source', 'staging', '--dry-run'],
      ['--to-local', join(workDir, 'staging-copy.db'), '--source', 'staging', '--dry-run'],
    ]) {
      const res = runOperator(args);
      expect(res.status, `${args.join(' ')}: ${res.stderr}`).toBe(0);
    }
  });

  it('refuses a drill with no host to run it on', () => {
    // The drill exists so a production snapshot is verified where it already
    // is. One that fell through to a local destination would quietly bring
    // back the workstation copy it replaced.
    const res = runOperator(['--drill', '--to-local', join(workDir, 'x.db'), '--source', 'staging']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--drill runs on a host');
    expect(existsSync(join(workDir, 'x.db'))).toBe(false);
  });

  it('runs the drill on the host without replacing anything or asking for confirmation', () => {
    // Defect caught: a drill sent without its flag runs the in-place restore,
    // which stops production and replaces the live member database. The session
    // the host receives must carry the drill flag, and the run must need no typed
    // confirmation, because it changes nothing the host serves.
    const stubDir = join(workDir, 'drill-host-bin');
    mkdirSync(stubDir, { recursive: true });
    const session = join(workDir, 'drill-session.txt');
    writeFileSync(join(stubDir, 'ssh'), [
      '#!/usr/bin/env bash',
      hostIdentityAnswer(),
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.20\\nuser footbag\\n"; exit 0; fi',
      'done',
      `cat > "${session}"`,
      'echo "RESTORE DRILL PASSED on stand-in"',
      'exit 0',
    ].join('\n'));
    chmodSync(join(stubDir, 'ssh'), 0o755);
    writeFileSync(join(stubDir, 'aws'), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(stubDir, 'aws'), 0o755);
    const pin = join(workDir, 'drill-pin');
    writeFileSync(pin, '[203.0.113.20]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');

    const res = spawnSync('setsid', [
      'bash', OPERATOR_SCRIPT, '--target', 'production', '--drill',
      '--snapshot', 'hourly/2026/10/05/footbag-20261005T120000Z.db.gz',
    ], {
      encoding: 'utf8',
      input: 'fixture-sudo-password\n',
      env: {
        ...process.env,
        ...awsIdentityStubEnv(workDir),
        PATH: `${stubDir}:${process.env.PATH ?? ''}`,
        FOOTBAG_KNOWN_HOSTS: pin,
      },
      ...SPAWN_GUARD,
    });

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('restore drill passed on production');
    const sent = readFileSync(session, 'utf8');
    expect(sent).toContain('DRILL=1');
    expect(sent).toContain('SNAPSHOT_KEY=hourly/2026/10/05/footbag-20261005T120000Z.db.gz');
    // The same stream carries an in-place restore, whose remote half calls the
    // pruning helper; without it ahead of the body, old copies are never pruned.
    expect(sent.indexOf('prune_db_copies() {')).toBeGreaterThan(-1);
    expect(sent.indexOf('prune_db_copies() {'))
      .toBeLessThan(sent.indexOf('Root-side body of scripts/restore-db.sh'));
  });

  /**
   * A stand-in host for a resume run: answers the identity question as `env`,
   * records the session it is sent, and exits with `exitCode` as the remote
   * half would.
   */
  function resumeHost(env: string, exitCode: number): { stubDir: string; session: string; pin: string } {
    const stubDir = join(workDir, `resume-${env}-bin`);
    mkdirSync(stubDir, { recursive: true });
    const session = join(workDir, `resume-${env}-session.txt`);
    writeFileSync(join(stubDir, 'ssh'), [
      '#!/usr/bin/env bash',
      hostIdentityAnswer(env),
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.30\\nuser footbag\\n"; exit 0; fi',
      'done',
      `cat >> "${session}"`,
      `exit ${exitCode}`,
    ].join('\n'));
    chmodSync(join(stubDir, 'ssh'), 0o755);
    const pin = join(workDir, `resume-${env}-pin`);
    writeFileSync(pin, '[203.0.113.30]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
    return { stubDir, session, pin };
  }

  function runResume(args: string[], host: { stubDir: string; pin: string }) {
    const res = spawnSync('setsid', ['bash', OPERATOR_SCRIPT, ...args], {
      encoding: 'utf8',
      input: 'fixture-sudo-password\n',
      env: {
        ...process.env,
        ...awsIdentityStubEnv(workDir),
        PATH: `${host.stubDir}:${process.env.PATH ?? ''}`,
        FOOTBAG_KNOWN_HOSTS: host.pin,
      },
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }

  // Defect caught: the recovery from a failed replay was a pair of commands for
  // an operator to type on the host, in the right order, under pressure.
  it('finishes a pending erasure replay with one command, sending the host the resume and the pruning helper', () => {
    const host = resumeHost('staging', 0);
    const res = runResume(['--target', 'staging', '--resume-erasure-replay'], host);

    expect(res.status, res.stderr).toBe(0);
    const sent = readFileSync(host.session, 'utf8');
    expect(sent).toContain('RESUME_ERASURE_REPLAY=1');
    expect(sent).not.toMatch(/^SNAPSHOT_KEY=/m);
    expect(sent.indexOf('prune_db_copies() {')).toBeGreaterThan(-1);
    expect(sent.indexOf('prune_db_copies() {'))
      .toBeLessThan(sent.indexOf('Root-side body of scripts/restore-db.sh'));
  });

  // Defect caught: the workstation reported a generic failure while the host was
  // holding the site down with its backups paused, so the operator walked away
  // from a host that would neither serve nor back up.
  it('says backups are paused when the host leaves the replay pending', () => {
    const host = resumeHost('staging', PENDING_EXIT);
    const res = runResume(['--target', 'staging', '--resume-erasure-replay'], host);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Backups on footbag-staging are PAUSED');
    expect(res.stderr).toContain('bash scripts/restore-db.sh --target staging --resume-erasure-replay');
  });

  // Defect caught: a production resume, which starts the public site, sent to
  // the host without the typed confirmation every production change asks for.
  it('asks for the typed confirmation on production, and sends nothing without it', () => {
    const host = resumeHost('production', 0);
    const res = runResume(['--target', 'production', '--resume-erasure-replay'], host);

    expect(res.status).toBe(1);
    expect(existsSync(host.session) ? readFileSync(host.session, 'utf8') : '')
      .not.toContain('RESUME_ERASURE_REPLAY');
  });

  it('refuses a resume with no host, or with a snapshot to restore', () => {
    const noHost = runOperator(['--resume-erasure-replay']);
    expect(noHost.status).toBe(1);
    expect(noHost.stderr).toContain('name a destination');

    const withSnapshot = runOperator([
      '--target', 'staging', '--resume-erasure-replay', '--snapshot', 'routine/x.db.gz',
    ]);
    expect(withSnapshot.status).toBe(1);
    expect(withSnapshot.stderr).toContain('--resume-erasure-replay takes only --target');
  });

  it('takes no host other than the target\'s own', () => {
    // Defect caught: `--target staging --ssh-alias footbag-production` replaced
    // the production database with a staging snapshot and skipped the
    // production confirmation, because the host was chosen separately from
    // the label every guard read.
    const res = runOperator(['--target', 'staging', '--ssh-alias', 'footbag-production', '--dry-run']);
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/unknown argument '--ssh-alias'/);
  });

  it('refuses a host that records another environment before reading or changing anything on it', () => {
    // Defect caught: a host reached under the wrong label, by an ssh config
    // pointing the alias at the other environment's address. The host is asked
    // which environment it is, and that one question is all it is sent.
    const stubDir = join(workDir, 'mislabelled-host-bin');
    mkdirSync(stubDir, { recursive: true });
    const calls = join(workDir, 'mislabelled-host-calls.log');
    writeFileSync(join(stubDir, 'ssh'), [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${calls}"`,
      hostIdentityAnswer('production'),
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.10\\nuser footbag\\n"; exit 0; fi',
      'done',
      'cat > /dev/null',
      'exit 0',
    ].join('\n'));
    chmodSync(join(stubDir, 'ssh'), 0o755);
    // The script requires an AWS CLI before it reaches the host, and this case
    // must reach the host's identity question, so it owns the stand-in it
    // depends on rather than relying on one installed on the machine.
    writeFileSync(join(stubDir, 'aws'), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(stubDir, 'aws'), 0o755);
    const pin = join(workDir, 'mislabelled-pin');
    writeFileSync(pin, '[203.0.113.10]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');

    const res = spawnSync('setsid', [
      'bash', OPERATOR_SCRIPT, '--target', 'staging', '--snapshot', 'routine/2026/09/01/footbag-x.db.gz',
    ], {
      encoding: 'utf8',
      input: 'fixture-sudo-password\n',
      env: {
        ...process.env,
        ...awsIdentityStubEnv(workDir),
        PATH: `${stubDir}:${process.env.PATH ?? ''}`,
        FOOTBAG_KNOWN_HOSTS: pin,
      },
      ...SPAWN_GUARD,
    });
    expect(res.status, res.stderr).toBe(1);
    expect(res.stderr).toMatch(/records FOOTBAG_ENV=production, but this run is --target staging/);
    const sessions = readFileSync(calls, 'utf8').split('\n').filter((l) => l.includes('sudo'));
    expect(sessions, 'only the identity question reached the host').toHaveLength(1);
    expect(sessions[0]).toContain('footbag-host-identity');
  });

  it('refuses a snapshot stream that is not one of the two environments', () => {
    const res = runOperator(['--to-local', join(workDir, 'out.db'), '--source', 'prod']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("must be 'staging' or 'production'");
  });

  it('reads each environment from its own snapshot bucket', () => {
    // The two buckets are not named to the same pattern. Guessing one shape for
    // both reads an empty listing on the other and calls it "no snapshots".
    const prod = runOperator(['--target', 'production', '--dry-run']);
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
