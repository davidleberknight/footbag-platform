/**
 * The routine database backup: taking the copy, counting a killed run, and
 * thinning the snapshot history as it ages.
 *
 * The copy has to finish while members are writing and has to carry every
 * committed change, including the ones still in the write-ahead log, because a
 * snapshot that never completes or that silently drops recent changes is a
 * recovery point that is not there when it is needed. A run the service manager
 * kills has to count as a failed run, or a backup that is killed every time
 * looks exactly like one that was never asked to run.
 *
 * Every run writes a full snapshot under routine/, which is deleted within days.
 * What survives longer is whatever the run copies into hourly/ and daily/ when it
 * is the first of its window, so these promotions are the entire long-range
 * recovery story: a month of hourly points and a year of daily ones exist only
 * because a run made them.
 *
 * The contract they assert: the first run of a window promotes into both generations and
 * later runs in the same window promote into neither; the copy is made with an API
 * the backup role can actually call, since the role is scoped to reading and
 * writing objects and nothing else; and a promotion that fails says so, raises its
 * metric, and still leaves the routine snapshot uploaded, because losing the
 * fine-grained stream to a thinning failure would be the worse outcome.
 *
 * The host's tools are stubbed. The stub refuses a client-side copy between two
 * bucket paths exactly as the real role does, so the permission-safe form is a
 * property under test rather than a detail of how the script happens to be written.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import BetterSqlite3 from 'better-sqlite3';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const BACKUP_SCRIPT = join(process.cwd(), 'scripts/backup-db.sh');
const BUCKET = 'footbag-test-snapshots';

let workDir: string;
let dbDir: string;
let binDir: string;
let s3Dir: string;
let callLog: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-backup-'));
  dbDir = join(workDir, 'db');
  binDir = join(workDir, 'bin');
  s3Dir = join(workDir, 's3');
  mkdirSync(dbDir);
  mkdirSync(binDir);
  mkdirSync(join(s3Dir, BUCKET), { recursive: true });
  callLog = join(workDir, 'calls.log');

  // The producer snapshots whatever database it is pointed at and never reads a
  // row, so this needs to be a valid SQLite file and nothing more. No domain
  // rows are seeded, which keeps the suite clear of hand-rolled inserts.
  const db = new BetterSqlite3(join(dbDir, 'footbag.db'));
  db.exec('CREATE TABLE backup_probe (id INTEGER PRIMARY KEY);');
  db.close();

  // The bucket stands in as a directory tree, so a promotion is observable as a
  // file appearing under the generation prefix.
  //
  // `s3 cp` between two bucket paths exits non-zero the way the real role does:
  // the friendly wrapper reads the source object's tags first, which the role is
  // not granted. Uploading from disk is the same command and is allowed, so the
  // stub distinguishes the two rather than banning the command outright.
  writeFileSync(join(binDir, 'aws'), [
    '#!/usr/bin/env bash',
    `LOG=${JSON.stringify(callLog)}`,
    `S3=${JSON.stringify(s3Dir)}`,
    'echo "aws $*" >> "$LOG"',
    'svc="$1"; shift',
    'if [[ "$svc" == "s3" && "$1" == "cp" ]]; then',
    '  shift',
    '  pos=()',
    '  for a in "$@"; do [[ "$a" == --* ]] || pos+=("$a"); done',
    '  src="${pos[0]}"; dst="${pos[1]}"',
    '  if [[ "$src" == s3://* && "$dst" == s3://* ]]; then',
    '    echo "copy failed: An error occurred (AccessDenied) when calling the' +
      ' GetObjectTagging operation" >&2',
    '    exit 1',
    '  fi',
    // An upload that never returns, standing in for a run the service manager
    // signals while it is still working. It announces itself on stderr so the
    // test sends the signal on that event rather than after a guessed delay.
    '  if [[ "$dst" == s3://* && -n "${AWS_STUB_UPLOAD_BLOCKS:-}" ]]; then',
    '    echo "aws-stub: upload blocking" >&2',
    '    exec sleep 60',
    '  fi',
    '  if [[ "$dst" == s3://* ]]; then',
    '    out="$S3/${dst#s3://}"; mkdir -p "$(dirname "$out")"; cp "$src" "$out"; exit $?',
    '  fi',
    '  cp "$S3/${src#s3://}" "$dst"; exit $?',
    'fi',
    // With --query the real CLI returns a bare number, verified against
    // `aws s3api list-objects-v2 --query 'length(Contents || \`[]\`)' --output
    // text`, which is the only form the script uses. The script reads it as a
    // number, so a probe that lost its --query would silently stop promoting,
    // and a stub answering with a count regardless would hide that: hence the
    // branch.
    //
    // The no-query branch is a placeholder and not a claim. The real envelope
    // carries IsTruncated, Contents with its nested keys, Name, Prefix, MaxKeys,
    // EncodingType and KeyCount; this returns KeyCount alone. Nothing exercises
    // that path, and if something ever does, capture the envelope rather than
    // trusting this shape.
    'if [[ "$svc" == "s3api" && "$1" == "list-objects-v2" ]]; then',
    '  shift; bucket=""; prefix=""; hasquery=0',
    '  while (( $# )); do',
    '    case "$1" in',
    '      --bucket) bucket="$2"; shift 2 ;;',
    '      --prefix) prefix="$2"; shift 2 ;;',
    '      --query)  hasquery=1; shift 2 ;;',
    '      *) shift ;;',
    '    esac',
    '  done',
    '  n=$(find "$S3/$bucket" -type f 2>/dev/null | sed "s|^$S3/$bucket/||" \\',
    '        | grep -c "^$prefix" || true)',
    '  if (( hasquery )); then echo "$n"; else echo "{\\"KeyCount\\": $n}"; fi',
    '  exit 0',
    'fi',
    'if [[ "$svc" == "s3api" && "$1" == "copy-object" ]]; then',
    '  [[ -n "${AWS_STUB_COPY_FAILS:-}" ]] && { echo "copy-object refused" >&2; exit 1; }',
    '  shift; bucket=""; source=""; key=""',
    '  while (( $# )); do',
    '    case "$1" in',
    '      --bucket) bucket="$2"; shift 2 ;;',
    '      --copy-source) source="$2"; shift 2 ;;',
    '      --key) key="$2"; shift 2 ;;',
    '      *) shift ;;',
    '    esac',
    '  done',
    '  mkdir -p "$(dirname "$S3/$bucket/$key")"',
    '  cp "$S3/$source" "$S3/$bucket/$key"; exit $?',
    'fi',
    // A metric put the role refuses. The script relays the CLI's last line and
    // parses nothing in it, so this stands in for the shape without claiming it.
    'if [[ "$svc" == "cloudwatch" && -n "${AWS_STUB_METRIC_FAILS:-}" ]]; then',
    '  echo "" >&2',
    '  echo "aws-stub: metric put refused for this case" >&2',
    '  exit 254',
    'fi',
    'exit 0',
  ].join('\n'));
  chmodSync(join(binDir, 'aws'), 0o755);
});

// Every case gets its own directory, and one of them holds a database at
// production scale, so each is removed as soon as its case ends.
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function runBackup(extraEnv?: NodeJS.ProcessEnv): {
  status: number; stdout: string; stderr: string;
} {
  const res = spawnSync('bash', [BACKUP_SCRIPT], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      FOOTBAG_DB_DIR: dbDir,
      BACKUP_S3_BUCKET: BUCKET,
      FOOTBAG_ENV: 'test',
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

/** UTC day path the producer derives from its own timestamp. */
function utcDayPrefix(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`;
}

/** A snapshot name in a UTC hour that is certainly not the current one. */
function stampInAnotherHour(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  const hour = (d.getUTCHours() + 12) % 24;
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
    + `T${p(hour)}0000Z`;
}

/** Places an object in the stand-in bucket without going through the producer. */
function seedObject(key: string): void {
  const target = join(s3Dir, BUCKET, key);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, 'seeded');
}

/** Object keys present under a generation prefix in the stand-in bucket. */
function keysUnder(generation: string): string[] {
  const res = spawnSync('find', [join(s3Dir, BUCKET), '-type', 'f'], {
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return (res.stdout ?? '')
    .split('\n')
    .filter(Boolean)
    .map((p) => p.replace(`${join(s3Dir, BUCKET)}/`, ''))
    .filter((k) => k.startsWith(generation));
}

describe('thinning the snapshot history by age', () => {
  it('promotes the first run of the window into both the hourly and daily generations', () => {
    const res = runBackup();

    expect(res.status).toBe(0);
    expect(keysUnder('routine/')).toHaveLength(1);
    expect(keysUnder('hourly/')).toHaveLength(1);
    expect(keysUnder('daily/')).toHaveLength(1);
    expect(res.stdout).toContain('promoted to hourly/');
    expect(res.stdout).toContain('promoted to daily/');
  });

  it('promotes the same snapshot under all three prefixes, not three different ones', () => {
    runBackup();

    const basename = (k: string): string => k.split('/').pop() ?? '';
    expect(basename(keysUnder('hourly/')[0])).toBe(basename(keysUnder('routine/')[0]));
    expect(basename(keysUnder('daily/')[0])).toBe(basename(keysUnder('routine/')[0]));
  });

  // Both runs fall in the same hour and the same day because they are seconds
  // apart, which is the window this case needs. They also share a timestamp, so
  // the second snapshot lands on the first one's key rather than beside it; the
  // routine stream is counted by what the run reports uploading instead.
  it('leaves both generations alone on a later run in the same window', () => {
    runBackup();
    const firstHourly = keysUnder('hourly/')[0];
    const firstDaily = keysUnder('daily/')[0];

    const second = runBackup();

    expect(second.status).toBe(0);
    expect(second.stdout).toMatch(/uploaded s3:\/\/[^ ]*\/routine\//);
    expect(keysUnder('hourly/')).toEqual([firstHourly]);
    expect(keysUnder('daily/')).toEqual([firstDaily]);
    expect(second.stdout).not.toContain('promoted to');
  });

  // The hourly probe has to pin the hour, not the day. A probe widened to the
  // day would find this object and skip, collapsing the hourly generation into
  // a second daily one: 1 restore point a day where the design promises 24.
  it('still promotes when the hourly generation holds a point from a different hour', () => {
    seedObject(`hourly/${utcDayPrefix()}/footbag-${stampInAnotherHour()}.db.gz`);

    const res = runBackup();

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('promoted to hourly/');
    expect(keysUnder('hourly/')).toHaveLength(2);
  });

  // The daily probe has to pin the day. Widened to the whole generation it would find
  // yesterday's point and never promote again.
  it('still promotes when the daily generation holds yesterday', () => {
    seedObject(`daily/${utcDayPrefix(-1)}/footbag-${stampInAnotherHour()}.db.gz`);

    const res = runBackup();

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('promoted to daily/');
    expect(keysUnder(`daily/${utcDayPrefix()}/`)).toHaveLength(1);
  });

  it('copies with an API the object-scoped backup role can call', () => {
    runBackup();

    // A client-side copy would additionally read the source object's tags, which
    // the role is not granted; the stub refuses it exactly as the role does.
    expect(calls()).not.toMatch(/aws s3 cp .*s3:\/\/.* s3:\/\//);
    expect(calls()).toContain('aws s3api copy-object');
  });

  it('reports a failed promotion, raises its metric, and still keeps the snapshot', () => {
    const res = runBackup({ AWS_STUB_COPY_FAILS: '1' });

    expect(res.status).toBe(0);
    expect(keysUnder('routine/')).toHaveLength(1);
    expect(keysUnder('hourly/')).toHaveLength(0);
    expect(res.stderr).toContain('hourly promotion failed');
    expect(res.stderr).toContain('daily promotion failed');
    expect(calls()).toContain('--metric-name BackupPromotionFailures --value 1');
  });

  it('records a clean promotion run as zero failures', () => {
    runBackup();

    expect(calls()).toContain('--metric-name BackupPromotionFailures --value 0');
  });
});

describe('a metric the backup could not publish', () => {
  // Defect caught: a refused metric put was discarded with its reason, so an
  // alarm whose metric stopped arriving left the journal silent about why, while
  // the backup itself stayed green.
  it('logs which metric was lost and the CLI\'s reason, and still succeeds', () => {
    const res = runBackup({ AWS_STUB_METRIC_FAILS: '1' });

    expect(res.status, res.stderr).toBe(0);
    expect(keysUnder('routine/')).toHaveLength(1);
    expect(res.stderr).toMatch(
      /metric BackupConsecutiveFailures was not published: aws-stub: metric put refused for this case/,
    );
  });

  it('says nothing about lost metrics when every put succeeds', () => {
    const res = runBackup();

    expect(res.status).toBe(0);
    expect(calls()).toContain('--metric-name BackupConsecutiveFailures --value 0');
    expect(res.stderr).not.toContain('was not published');
  });
});

describe('clearing the consecutive-failure counter after a success', () => {
  // Defect caught: a counter the run could not reset was skipped silently, so
  // the old count survived and the next single failure added to it, raising the
  // failing-backup alarm early with nothing in the journal saying why.
  it('logs the counter it could not reset, with the shell\'s reason, and still succeeds', () => {
    const unwritable = join(workDir, 'no-such-dir', 'failures');

    const res = runBackup({ FOOTBAG_BACKUP_FAIL_STATE: unwritable });

    expect(res.status, res.stderr).toBe(0);
    expect(keysUnder('routine/')).toHaveLength(1);
    // The script's own journal line, the form every other problem it reports
    // takes, rather than bash's bare redirect error naming a line number.
    const reported = res.stderr.split('\n').find((l) => l.startsWith('backup-db: '));
    expect(reported, res.stderr).toBeDefined();
    expect(reported).toContain(unwritable);
    expect(reported).toMatch(/No such file or directory/);
  });

  it('resets the counter and says nothing about it when the write succeeds', () => {
    const counter = join(dbDir, '.backup-consecutive-failures');
    writeFileSync(counter, '2\n');

    const res = runBackup();

    expect(res.status, res.stderr).toBe(0);
    expect(readFileSync(counter, 'utf8').trim()).toBe('0');
    expect(res.stderr).not.toContain(counter);
  });
});

describe('backing up while a restore\'s erasure replay is pending', () => {
  // Defect caught: a restored database whose erasures were never re-applied was
  // backed up like any other, copying personal data members asked to have
  // erased into the snapshot stream, whose promoted generations replicate to an
  // object-locked bucket, and making it the newest restore point. The refusal
  // has to count as a failed run, or the paused backups go unnoticed.
  it('uploads nothing and counts the run as a failure', () => {
    writeFileSync(join(dbDir, '.erasure-replay-pending'), 'snapshot=routine/x.db.gz\n');

    const res = runBackup();

    expect(res.status).toBe(1);
    expect(keysUnder('')).toEqual([]);
    expect(calls()).not.toMatch(/aws s3 cp /);
    expect(calls()).toContain('--metric-name BackupConsecutiveFailures --value 1');
    expect(readFileSync(join(dbDir, '.backup-consecutive-failures'), 'utf8').trim()).toBe('1');
    expect(res.stderr).toContain('--resume-erasure-replay');
  });
});

/** The one routine snapshot the run uploaded, decompressed beside the bucket. */
function uploadedSnapshot(): string {
  const keys = keysUnder('routine/');
  expect(keys).toHaveLength(1);
  const out = join(workDir, 'restored.db');
  writeFileSync(out, gunzipSync(readFileSync(join(s3Dir, BUCKET, keys[0]))));
  return out;
}

function rowsAndIntegrity(path: string, table: string): { rows: number; integrity: string } {
  const db = new BetterSqlite3(path, { readonly: true });
  try {
    const rows = (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    const integrity = db.pragma('integrity_check', { simple: true }) as string;
    return { rows, integrity };
  } finally {
    db.close();
  }
}

describe('taking the copy while the application is using the database', () => {
  // Defect caught: a restore from the newest snapshot silently loses the most
  // recent member changes, because the copy read only the main database file
  // and missed the committed transactions still waiting in the write-ahead log.
  it('carries every committed change that is still only in the write-ahead log', () => {
    const live = new BetterSqlite3(join(dbDir, 'footbag.db'));
    live.pragma('journal_mode = WAL');
    // No automatic checkpoint, and the connection stays open through the run,
    // so these rows exist only in the log when the backup starts.
    live.pragma('wal_autocheckpoint = 0');
    const insert = live.prepare('INSERT INTO backup_probe (id) VALUES (?)');
    live.transaction(() => { for (let i = 1; i <= 500; i += 1) insert.run(i); })();
    expect(existsSync(join(dbDir, 'footbag.db-wal'))).toBe(true);

    try {
      const res = runBackup();
      expect(res.status).toBe(0);
    } finally {
      live.close();
    }

    expect(rowsAndIntegrity(uploadedSnapshot(), 'backup_probe')).toEqual({ rows: 500, integrity: 'ok' });
  });

  // Defect caught: while members are writing, the backup never finishes, so no
  // snapshot is taken for as long as the site is busy and the staleness alarm is
  // the only sign. A page-by-page copy restarts from the beginning whenever
  // another process commits, and at production scale it is overtaken every time.
  //
  // The database is built at production scale because the restart is a property
  // of the copy's length: the locally built database measured 56,688,640 bytes
  // on 2026-11-01, so this one is about 55 MB of 900-byte rows. The writer
  // commits continuously from a separate process, which is what the application
  // containers are to the host's backup.
  it('finishes with a sound snapshot while another process keeps committing', async () => {
    const big = new BetterSqlite3(join(dbDir, 'footbag.db'));
    big.pragma('journal_mode = WAL');
    big.exec('CREATE TABLE filler (id INTEGER PRIMARY KEY, v BLOB NOT NULL)');
    const fill = big.prepare('INSERT INTO filler (v) VALUES (randomblob(900))');
    big.transaction(() => { for (let i = 0; i < 60_000; i += 1) fill.run(); })();
    big.pragma('wal_checkpoint(TRUNCATE)');
    big.close();

    const writerScript = join(workDir, 'writer.cjs');
    writeFileSync(writerScript, [
      `const Database = require(${JSON.stringify(join(process.cwd(), 'node_modules', 'better-sqlite3'))});`,
      `const db = new Database(${JSON.stringify(join(dbDir, 'footbag.db'))}, { timeout: 30000 });`,
      "const add = db.prepare('INSERT INTO backup_probe (id) VALUES (NULL)');",
      'add.run();',
      "process.stdout.write('ready\\n');",
      'for (;;) { add.run(); }',
    ].join('\n'));
    const writer = spawn(process.execPath, [writerScript], { stdio: ['ignore', 'pipe', 'inherit'] });
    const exited = new Promise<void>((resolve) => { writer.once('exit', () => resolve()); });
    try {
      await new Promise<void>((resolve, reject) => {
        writer.stdout.once('data', () => resolve());
        writer.once('exit', (code) => reject(new Error(`writer exited early (${code})`)));
      });

      const res = runBackup();

      expect(res.stderr).toBe('');
      expect(res.status).toBe(0);
    } finally {
      writer.kill('SIGKILL');
      await exited;
    }

    const snap = rowsAndIntegrity(uploadedSnapshot(), 'filler');
    expect(snap).toEqual({ rows: 60_000, integrity: 'ok' });
  });
});

describe('a run the service manager kills', () => {
  // Defect caught: the final backup the service unit takes on stop, or any run
  // the service manager terminates, was killed without counting as a failure, so
  // a backup that dies every time raised neither the failure counter nor its
  // metric, and only a journal line recorded it.
  it('counts the killed run as a failure and publishes the failure metric', async () => {
    const child = spawn('bash', [BACKUP_SCRIPT], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        FOOTBAG_DB_DIR: dbDir,
        BACKUP_S3_BUCKET: BUCKET,
        FOOTBAG_ENV: 'test',
        AWS_STUB_UPLOAD_BLOCKS: '1',
      },
      // Its own process group, so the signal reaches the script and the upload
      // it is waiting on together, as the service manager's stop does.
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    const blocked = new Promise<void>((resolve) => {
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.includes('aws-stub: upload blocking')) resolve();
      });
    });
    const exited = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
    });

    await blocked;
    process.kill(-(child.pid as number), 'SIGTERM');
    const code = await exited;

    expect(code).not.toBe(0);
    expect(readFileSync(join(dbDir, '.backup-consecutive-failures'), 'utf8').trim()).toBe('1');
    expect(calls()).toContain('--metric-name BackupConsecutiveFailures --value 1');
    expect(stderr).toContain('SIGTERM');
    expect(keysUnder('')).toEqual([]);
  });
});
