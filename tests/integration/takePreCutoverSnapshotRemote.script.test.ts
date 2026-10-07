/**
 * The root-side half of the pre-cutover snapshot, driven rather than read.
 *
 * This half runs on the production host under sudo, in place of the operator
 * typing anything there. It hands the host's own paths and the DR bucket to the
 * snapshot script that ships with the deploy, then reduces the manifest to three
 * marked lines the operator half greps out of a stream that also carries sudo and
 * ssh noise: where the rollback artifact went off the host, where the host-local
 * copy sits, and the checksum every later gate reads that copy against. A wrong
 * or missing line there means the cutover is certified against the wrong object,
 * or rolls back to nothing.
 *
 * On a host the live install directory is the only place the deploy puts the
 * snapshot script. The suite runs the shipped file itself, pointed at a scratch
 * install through the half's announced test seam.
 * The snapshot script inside the scratch install is the real one too, with real
 * SQLite; only the AWS CLI is a stand-in, recording what it was asked to upload.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, mkdirSync, rmSync, chmodSync, existsSync, readdirSync, copyFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import BetterSqlite3 from 'better-sqlite3';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = resolve(__dirname, '..', '..');
const REMOTE_HALF = join(REPO_ROOT, 'scripts', 'internal', 'take-pre-cutover-snapshot-remote.sh');
const SNAPSHOT_SCRIPT = join(REPO_ROOT, 'scripts', 'take-pre-cutover-snapshot.sh');
const BUCKET = 'footbag-test-dr';

let work: string;
let liveDir: string;
let dbDir: string;
let snapDir: string;
let binDir: string;
let callLog: string;

function installRealSnapshotScript(): void {
  mkdirSync(join(liveDir, 'scripts'), { recursive: true });
  copyFileSync(SNAPSHOT_SCRIPT, join(liveDir, 'scripts', 'take-pre-cutover-snapshot.sh'));
}

/** A snapshot script that prints the given manifest and nothing else. */
function installStandInSnapshot(manifest: string): void {
  mkdirSync(join(liveDir, 'scripts'), { recursive: true });
  writeFileSync(
    join(liveDir, 'scripts', 'take-pre-cutover-snapshot.sh'),
    `cat <<'EOF'\n${manifest}\nEOF\n`,
  );
}

function seedLiveDb(): void {
  mkdirSync(dbDir, { recursive: true });
  const db = new BetterSqlite3(join(dbDir, 'footbag.db'));
  db.pragma('synchronous = OFF');
  db.exec(readFileSync(join(REPO_ROOT, 'database', 'schema.sql'), 'utf8'));
  db.close();
}

beforeEach(() => {
  work = createScratchDir('precutover-remote');
  liveDir = join(work, 'srv-footbag');
  dbDir = join(work, 'db');
  snapDir = join(work, 'snapshots');
  binDir = join(work, 'bin');
  callLog = join(work, 'aws-calls.log');
  mkdirSync(binDir, { recursive: true });

  // The stand-in records each call on one line and succeeds: the subject here
  // is what the half does with the snapshot, not the upload itself.
  const aws = join(binDir, 'aws');
  writeFileSync(aws, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(callLog)}\nexit 0\n`);
  chmodSync(aws, 0o755);

});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function runHalf(env: Record<string, string> = {}) {
  const res = spawnSync('bash', [REMOTE_HALF], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      FOOTBAG_TEST_LIVE_DIR: liveDir,
      FOOTBAG_DB_DIR: dbDir,
      FOOTBAG_SNAPSHOT_DIR: snapDir,
      DR_BUCKET: BUCKET,
      ...env,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function marked(stdout: string, name: string): string | undefined {
  const line = stdout.split('\n').find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1);
}

function awsCalls(): string {
  return existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
}

describe('take-pre-cutover-snapshot-remote.sh: refusals before any snapshot is taken', () => {
  it('refuses a host the deploy has not reached, rather than snapshotting nothing', () => {
    seedLiveDb();
    const res = runHalf();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('is not on this host');
    expect(awsCalls()).toBe('');
  });

  it('refuses when there is no live database to snapshot', () => {
    installRealSnapshotScript();
    const res = runHalf();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no live database');
    expect(existsSync(snapDir)).toBe(false);
  });

  it('refuses a stream that carried no DR bucket, so no host-only snapshot is taken', () => {
    // Without the bucket the snapshot would exist on this host only, which is
    // not a rollback artifact: losing the host loses the way back.
    installRealSnapshotScript();
    seedLiveDb();
    const res = runHalf({ DR_BUCKET: '' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('DR_BUCKET was not passed');
    expect(existsSync(snapDir)).toBe(false);
    expect(awsCalls()).toBe('');
  });
});

describe('take-pre-cutover-snapshot-remote.sh: what it reports is the object it made', () => {
  it('reports the uploaded URI, the host-local copy and the checksum of the database inside it', () => {
    installRealSnapshotScript();
    seedLiveDb();
    const res = runHalf();
    expect(res.status, res.stderr).toBe(0);

    const uri = marked(res.stdout, 'PRECUTOVER_SNAPSHOT_URI');
    const localPath = marked(res.stdout, 'PRECUTOVER_SNAPSHOT_PATH');
    const sha = marked(res.stdout, 'PRECUTOVER_SNAPSHOT_SHA256');

    // The URI is the one the upload was sent to, under the pre-flip prefix of
    // the bucket the stream named.
    expect(uri).toMatch(new RegExp(`^s3://${BUCKET}/pre-flip/pre-cutover-[0-9TZ]+/pre-cutover-[0-9TZ]+\\.db\\.gz$`));
    expect(awsCalls()).toContain(` ${uri}`);

    // The local path is a real file in the snapshot directory beside the
    // database, and the checksum is of the database it decompresses to: the
    // later gates verify that copy against this value.
    expect(localPath?.startsWith(`${snapDir}/`)).toBe(true);
    expect(readdirSync(snapDir)).toContain(localPath!.slice(snapDir.length + 1));
    const db = gunzipSync(readFileSync(localPath!));
    expect(sha).toBe(createHash('sha256').update(db).digest('hex'));
  });

  it('refuses a snapshot that reports no DR URI, because nothing left the host', () => {
    installStandInSnapshot(JSON.stringify({
      snapshot_path: join(snapDir, 'x.db.gz'),
      sha256: 'a'.repeat(64),
      dr_s3_uri: null,
    }, null, 2));
    seedLiveDb();
    const res = runHalf();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('nothing left this host');
    expect(res.stdout).not.toContain('PRECUTOVER_SNAPSHOT_URI=');
  });

  it('refuses a manifest naming no checksum, rather than handing the gates nothing to verify against', () => {
    installStandInSnapshot(JSON.stringify({
      snapshot_path: join(snapDir, 'x.db.gz'),
      dr_s3_uri: `s3://${BUCKET}/pre-flip/x/x.db.gz`,
    }, null, 2));
    seedLiveDb();
    const res = runHalf();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no local path or checksum');
    expect(res.stdout).not.toContain('PRECUTOVER_SNAPSHOT_SHA256=');
  });
});
