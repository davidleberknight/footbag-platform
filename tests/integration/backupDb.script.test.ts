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
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../../src/lib/personaGuards';
import {
  PERSONA_SEED_CREATED_BY, PERSONA_SWITCH_AUDIT_ACTION_TYPE,
} from '../../src/testkit/personaFactory';

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

  // The producer reads one thing from the database it copies: the newest row of
  // the audit ledger that the testkit can neither write nor delete, which is
  // what it records as the snapshot's lineage. The ledger here carries only the
  // columns that read touches, with the same nullability as the real schema,
  // created by this file so its rows are the file's own; nothing else about the
  // schema matters to a backup. The defaults make an ordinary row: a real
  // action, written by the application, with no persona as its actor.
  const db = new BetterSqlite3(join(dbDir, 'footbag.db'));
  db.exec('CREATE TABLE backup_probe (id INTEGER PRIMARY KEY);');
  db.exec(`CREATE TABLE audit_entries (
    id TEXT PRIMARY KEY,
    occurred_at TEXT NOT NULL,
    action_type TEXT NOT NULL DEFAULT 'member.profile_update',
    created_by TEXT NOT NULL DEFAULT 'system',
    actor_member_id TEXT
  );`);
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
    // Object metadata lives in a parallel tree beside the bucket, so listing the
    // bucket still shows only snapshots.
    `META=${JSON.stringify(`${s3Dir}.meta`)}`,
    'echo "aws $*" >> "$LOG"',
    'svc="$1"; shift',
    'if [[ "$svc" == "s3" && "$1" == "cp" ]]; then',
    '  shift',
    '  pos=(); metadata=""',
    '  while (( $# )); do',
    '    case "$1" in',
    '      --metadata) metadata="$2"; shift 2 ;;',
    '      --*) shift ;;',
    '      *) pos+=("$1"); shift ;;',
    '    esac',
    '  done',
    '  src="${pos[0]}"; dst="${pos[1]}"',
    '  if [[ "$dst" == s3://* && -n "$metadata" ]]; then',
    '    m="$META/${dst#s3://}"; mkdir -p "$(dirname "$m")"; printf "%s" "$metadata" > "$m"',
    '  fi',
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
    // Uploads refused a set number of times before one succeeds, counted in a
    // file beside the bucket, standing in for a brief outage the retry rides out.
    '  if [[ "$dst" == s3://* && -n "${AWS_STUB_UPLOAD_FAILS:-}" ]]; then',
    '    n=$(cat "$S3.upload-failures" 2>/dev/null || echo 0)',
    '    if (( n < AWS_STUB_UPLOAD_FAILS )); then',
    '      echo $(( n + 1 )) > "$S3.upload-failures"',
    '      echo "aws-stub: upload refused for this case" >&2',
    '      exit 1',
    '    fi',
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
    '  shift; bucket=""; prefix=""; hasquery=0; query=""',
    '  while (( $# )); do',
    '    case "$1" in',
    '      --bucket) bucket="$2"; shift 2 ;;',
    '      --prefix) prefix="$2"; shift 2 ;;',
    '      --query)  hasquery=1; query="$2"; shift 2 ;;',
    '      *) shift ;;',
    '    esac',
    '  done',
    // The lineage search asks for the keys themselves. With `--output text`
    // the real CLI prints a list query's values tab-separated on one line, and
    // the literal None when the prefix holds nothing.
    '  if [[ "$query" == "Contents[].Key" ]]; then',
    '    [[ -n "${AWS_STUB_LIST_FAILS:-}" ]] && { echo "aws-stub: list refused for this case" >&2; exit 254; }',
    '    keys=$(find "$S3/$bucket" -type f 2>/dev/null | sed "s|^$S3/$bucket/||" | grep "^$prefix" | paste -sd "\\t" -)',
    '    echo "${keys:-None}"',
    '    exit 0',
    '  fi',
    '  n=$(find "$S3/$bucket" -type f 2>/dev/null | sed "s|^$S3/$bucket/||" \\',
    '        | grep -c "^$prefix" || true)',
    '  if (( hasquery )); then echo "$n"; else echo "{\\"KeyCount\\": $n}"; fi',
    '  exit 0',
    'fi',
    // A query over three metadata fields prints them tab-separated on one line,
    // None for each the object does not carry.
    'if [[ "$svc" == "s3api" && "$1" == "head-object" ]]; then',
    '  [[ -n "${AWS_STUB_HEAD_FAILS:-}" ]] && { echo "aws-stub: head refused for this case" >&2; exit 254; }',
    '  shift; bucket=""; key=""',
    '  while (( $# )); do',
    '    case "$1" in',
    '      --bucket) bucket="$2"; shift 2 ;;',
    '      --key) key="$2"; shift 2 ;;',
    '      *) shift ;;',
    '    esac',
    '  done',
    `  ${JSON.stringify(process.execPath)} -e '` +
      'const fs = require("fs"); const f = process.argv[1];' +
      ' const m = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};' +
      ' const v = (k) => (k in m ? m[k] : "None");' +
      ' console.log([v("audit-newest-id"), v("audit-newest-at"), v("lineage-since")].join("\\t"));' +
      `' "$META/$bucket/$key"`,
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
    // Like S3's default copy, the metadata travels with the object.
    '  if [[ -f "$META/$source" ]]; then',
    '    mkdir -p "$(dirname "$META/$bucket/$key")"; cp "$META/$source" "$META/$bucket/$key"',
    '  fi',
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

interface AuditOrigin { actionType?: string; createdBy?: string; actorMemberId?: string }

/**
 * Appends a row to the live database's audit ledger. With no origin it is an
 * ordinary application row; an origin makes it one the testkit wrote.
 */
function addAuditRow(id: string, occurredAt: string, origin: AuditOrigin = {}): void {
  const db = new BetterSqlite3(join(dbDir, 'footbag.db'));
  db.prepare(
    `INSERT INTO audit_entries (id, occurred_at, action_type, created_by, actor_member_id)
     VALUES (?, ?, COALESCE(?, 'member.profile_update'), COALESCE(?, 'system'), ?)`,
  ).run(id, occurredAt, origin.actionType ?? null, origin.createdBy ?? null, origin.actorMemberId ?? null);
  db.close();
}

/** Removes audit rows the way the persona rebuild does, by id. */
function deleteAuditRows(ids: string[]): void {
  const db = new BetterSqlite3(join(dbDir, 'footbag.db'));
  const del = db.prepare('DELETE FROM audit_entries WHERE id = ?');
  for (const id of ids) del.run(id);
  db.close();
}

interface Lineage { 'audit-newest-id'?: string; 'audit-newest-at'?: string; 'lineage-since'?: string }

/** Places a snapshot in the stand-in bucket carrying the given lineage record. */
function seedSnapshot(key: string, lineage?: Lineage): void {
  seedObject(key);
  if (lineage) {
    const m = join(`${s3Dir}.meta`, BUCKET, key);
    mkdirSync(join(m, '..'), { recursive: true });
    writeFileSync(m, JSON.stringify(lineage));
  }
}

/** The lineage record stored with an object, or null when it carries none. */
function lineageOf(key: string): Lineage | null {
  const m = join(`${s3Dir}.meta`, BUCKET, key);
  return existsSync(m) ? JSON.parse(readFileSync(m, 'utf8')) as Lineage : null;
}

/** A routine key a full day before now, so it is never the run's own key. */
function yesterdayRoutineKey(): string {
  return `routine/${utcDayPrefix(-1)}/footbag-${stampInAnotherHour()}.db.gz`;
}

function failureCount(): string {
  return readFileSync(join(dbDir, '.backup-consecutive-failures'), 'utf8').trim();
}

function writeMarker(lines: Record<string, string>): string {
  const path = join(dbDir, '.declared-restore');
  writeFileSync(path, Object.entries(lines).map(([k, v]) => `${k}=${v}\n`).join(''));
  return path;
}

const nowEpoch = (): number => Math.floor(Date.now() / 1000);

describe('uploading only a continuation of the stored history', () => {
  // Defect caught: a restore cannot tell which snapshot holds the newest real
  // data, and the next run has nothing to check the database against, because
  // the upload, or the hourly and daily copies made from it, lost the record of
  // the newest audit row it holds.
  it('records the newest audit row on the upload and on both promoted copies', () => {
    addAuditRow('audit_older', '2026-11-01T00:00:00.000Z');
    addAuditRow('audit_newest', '2026-11-02T00:00:00.000Z');

    const res = runBackup();

    expect(res.status, res.stderr).toBe(0);
    const expected = {
      'audit-newest-id': 'audit_newest',
      'audit-newest-at': '2026-11-02T00:00:00.000Z',
      'lineage-since': 'none',
    };
    for (const generation of ['routine/', 'hourly/', 'daily/']) {
      const [key] = keysUnder(generation);
      expect(lineageOf(key), generation).toEqual(expected);
    }
  });

  // Defect caught: the backup refuses the live database it has been backing up
  // all along, stopping every backup after the first, because the check does not
  // recognise its own continuation.
  it('uploads a database that holds the row the newest stored snapshot records', () => {
    addAuditRow('audit_a', '2026-11-01T00:00:00.000Z');
    addAuditRow('audit_b', '2026-11-03T00:00:00.000Z');
    seedSnapshot(yesterdayRoutineKey(), {
      'audit-newest-id': 'audit_a', 'audit-newest-at': '2026-11-01T00:00:00.000Z', 'lineage-since': 'none',
    });

    const res = runBackup();

    expect(res.status, res.stderr).toBe(0);
    expect(keysUnder('routine/')).toHaveLength(2);
  });

  // Defect caught: a host rebuilt from a day-old disk snapshot uploads its old
  // database as the newest snapshot, which is promoted, locked off-region for
  // 90 days and put back by the next restore. Its worker has stamped a fresh
  // audit row since boot, so a comparison of newest timestamps would let it
  // through; the row it lacks is what gives it away.
  it('refuses a database missing the stored row, even when its own newest row is later', () => {
    addAuditRow('audit_from_snapshot_day', '2026-11-01T00:00:00.000Z');
    addAuditRow('audit_worker_after_boot', '2099-01-01T00:00:00.000Z');
    const stored = yesterdayRoutineKey();
    seedSnapshot(stored, {
      'audit-newest-id': 'audit_written_after_snapshot',
      'audit-newest-at': '2026-11-02T00:00:00.000Z',
      'lineage-since': 'none',
    });

    const res = runBackup();

    expect(res.status).toBe(1);
    expect(keysUnder('routine/')).toEqual([stored]);
    expect(keysUnder('hourly/')).toEqual([]);
    expect(calls()).not.toMatch(/aws s3 cp /);
    expect(failureCount()).toBe('1');
    expect(calls()).toContain('--metric-name BackupConsecutiveFailures --value 1');
    expect(res.stderr).toContain('audit_written_after_snapshot');
    expect(res.stderr).toContain('scripts/restore-db.sh');
  });

  // Defect caught: with the fine-grained stream aged out (a host down for more
  // than two days), the check finds nothing in routine/ and waves a stale
  // database through instead of checking it against the newest hourly point.
  it('checks against the newest hourly point when routine/ holds nothing', () => {
    addAuditRow('audit_stale', '2026-11-01T00:00:00.000Z');
    seedSnapshot(`hourly/${utcDayPrefix(-3)}/footbag-${stampInAnotherHour()}.db.gz`, {
      'audit-newest-id': 'audit_missing', 'audit-newest-at': '2026-11-04T00:00:00.000Z', 'lineage-since': 'none',
    });

    const res = runBackup();

    expect(res.status).toBe(1);
    expect(keysUnder('routine/')).toEqual([]);
    expect(res.stderr).toContain('audit_missing');
  });

  // Defect caught: the check reads a coarse generation before the fine stream,
  // so a day-old database, which does hold yesterday's daily point, passes as
  // a continuation although the routine stream has moved on without it.
  it('checks against the fine-grained stream before the coarser generations', () => {
    addAuditRow('audit_yesterday', '2026-11-01T00:00:00.000Z');
    seedSnapshot(`daily/${utcDayPrefix(-1)}/footbag-${stampInAnotherHour()}.db.gz`, {
      'audit-newest-id': 'audit_yesterday', 'audit-newest-at': '2026-11-01T00:00:00.000Z', 'lineage-since': 'none',
    });
    seedSnapshot(yesterdayRoutineKey(), {
      'audit-newest-id': 'audit_this_morning', 'audit-newest-at': '2026-11-02T08:00:00.000Z', 'lineage-since': 'none',
    });

    const res = runBackup();

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('audit_this_morning');
  });

  // Defect caught: an ordinary backup forgets when the history it continues
  // began, so after a restore that deliberately went back, the next restore
  // cannot tell the abandoned history from the current one.
  it('carries the start of the history forward onto an ordinary upload', () => {
    addAuditRow('audit_a', '2026-11-01T00:00:00.000Z');
    seedSnapshot(yesterdayRoutineKey(), {
      'audit-newest-id': 'audit_a', 'audit-newest-at': '2026-11-01T00:00:00.000Z',
      'lineage-since': '2026-10-30T12:00:00Z',
    });

    const res = runBackup();

    expect(res.status, res.stderr).toBe(0);
    const uploaded = keysUnder('routine/').find((k) => k.startsWith(`routine/${utcDayPrefix()}`));
    expect(lineageOf(uploaded as string)?.['lineage-since']).toBe('2026-10-30T12:00:00Z');
  });

  // Defect caught: a run that cannot read the bucket's listing treats it as
  // empty and uploads whatever database the host holds.
  it('refuses when the stored snapshots cannot be listed', () => {
    addAuditRow('audit_a', '2026-11-01T00:00:00.000Z');

    const res = runBackup({ AWS_STUB_LIST_FAILS: '1' });

    expect(res.status).toBe(1);
    expect(keysUnder('')).toEqual([]);
    expect(failureCount()).toBe('1');
    expect(res.stderr).toContain('aws-stub: list refused for this case');
  });

  // Defect caught: a run that cannot read the newest snapshot's lineage record
  // treats it as one that never had one and uploads unchecked.
  it('refuses when the newest stored snapshot\'s record cannot be read', () => {
    addAuditRow('audit_a', '2026-11-01T00:00:00.000Z');
    seedSnapshot(yesterdayRoutineKey(), {
      'audit-newest-id': 'audit_a', 'audit-newest-at': '2026-11-01T00:00:00.000Z', 'lineage-since': 'none',
    });

    const res = runBackup({ AWS_STUB_HEAD_FAILS: '1' });

    expect(res.status).toBe(1);
    expect(keysUnder('routine/')).toHaveLength(1);
    expect(res.stderr).toContain('aws-stub: head refused for this case');
  });

  // Defect caught: the first backup after this check is deployed refuses
  // forever, because every snapshot already stored predates the record.
  it('uploads with a warning over a newest snapshot written before the record existed', () => {
    addAuditRow('audit_a', '2026-11-01T00:00:00.000Z');
    seedSnapshot(yesterdayRoutineKey());

    const res = runBackup();

    expect(res.status, res.stderr).toBe(0);
    expect(keysUnder('routine/')).toHaveLength(2);
    expect(res.stderr).toContain('carries no lineage record');
  });

  // Defect caught: a stored snapshot of a database with no audit rows yet
  // blocks every later backup, since there is no row to look for.
  it('uploads over a newest snapshot whose database had no audit rows', () => {
    addAuditRow('audit_first', '2026-11-01T00:00:00.000Z');
    seedSnapshot(yesterdayRoutineKey(), {
      'audit-newest-id': 'none', 'audit-newest-at': 'none', 'lineage-since': 'none',
    });

    const res = runBackup();

    expect(res.status, res.stderr).toBe(0);
    expect(keysUnder('routine/')).toHaveLength(2);
  });
});

// On staging a code-only deploy rebuilds the personas, which deletes the audit
// rows the testkit wrote and the rows a persona was the actor of. The testkit's
// own constants are used for those rows, so a rename in the testkit that the
// backup does not follow turns these cases red rather than letting staging's
// backups stop again.
describe('a lineage record the persona rebuild cannot delete', () => {
  const persona = `${SEEDED_PERSONA_MEMBER_ID_PREFIX}backup_probe`;

  // Defect caught: on staging every backup after a code-only deploy is refused
  // as a database that does not continue the stored history, because the
  // snapshot before the deploy recorded a persona switch row as its lineage and
  // the persona rebuild deleted that row.
  it('keeps uploading after the persona rebuild deletes the rows the testkit wrote', () => {
    addAuditRow('audit_real', '2026-11-01T00:00:00.000Z');
    addAuditRow('audit_switch', '2026-11-02T00:00:00.000Z', {
      actionType: PERSONA_SWITCH_AUDIT_ACTION_TYPE,
    });
    addAuditRow('audit_by_persona', '2026-11-03T00:00:00.000Z', { actorMemberId: persona });

    const first = runBackup();
    expect(first.status, first.stderr).toBe(0);
    const [stored] = keysUnder('routine/');
    expect(lineageOf(stored)?.['audit-newest-id']).toBe('audit_real');

    deleteAuditRows(['audit_switch', 'audit_by_persona']);
    addAuditRow('audit_worker_after_deploy', '2026-11-04T00:00:00.000Z');
    // A second run in the same second would reuse the first run's key.
    rmSync(join(s3Dir, BUCKET, stored));
    seedSnapshot(yesterdayRoutineKey(), lineageOf(stored) as Lineage);

    const second = runBackup();

    expect(second.status, second.stderr).toBe(0);
    expect(keysUnder('routine/')).toHaveLength(2);
  });

  // Defect caught: a host rebuilt from an old disk snapshot uploads its stale
  // database because rows the testkit wrote on it are treated as evidence that
  // it continues the stored history, and the refusal names a persona row as
  // the database's own newest row, which tells the operator nothing.
  it('still refuses a database missing the stored row, and names its newest lasting row', () => {
    addAuditRow('audit_old_real', '2026-11-01T00:00:00.000Z');
    addAuditRow('audit_old_switch', '2026-11-05T00:00:00.000Z', {
      actionType: PERSONA_SWITCH_AUDIT_ACTION_TYPE,
    });
    const stored = yesterdayRoutineKey();
    seedSnapshot(stored, {
      'audit-newest-id': 'audit_newer_real',
      'audit-newest-at': '2026-11-02T00:00:00.000Z',
      'lineage-since': 'none',
    });

    const res = runBackup();

    expect(res.status).toBe(1);
    expect(keysUnder('routine/')).toEqual([stored]);
    expect(failureCount()).toBe('1');
    expect(res.stderr).toContain('audit_newer_real');
    expect(res.stderr).toContain('its own newest audit row is audit_old_real (2026-11-01T00:00:00.000Z)');
  });

  // Defect caught: a row the persona rebuild deletes (one a persona was the
  // actor of, or one the persona seed wrote under its marker) becomes the
  // lineage record, so the next code-only deploy on staging stops backups.
  it('never records a row a persona wrote or the persona seed marked', () => {
    addAuditRow('audit_real', '2026-11-01T00:00:00.000Z');
    addAuditRow('audit_by_persona', '2026-11-02T00:00:00.000Z', { actorMemberId: persona });
    addAuditRow('audit_seed_marked', '2026-11-03T00:00:00.000Z', {
      actionType: 'membership.tier_grant', createdBy: PERSONA_SEED_CREATED_BY,
    });

    const res = runBackup();

    expect(res.status, res.stderr).toBe(0);
    const [key] = keysUnder('routine/');
    expect(lineageOf(key)).toEqual({
      'audit-newest-id': 'audit_real',
      'audit-newest-at': '2026-11-01T00:00:00.000Z',
      'lineage-since': 'none',
    });
  });

  // Defect caught: a staging database holding only rows the testkit wrote
  // records one of them as its lineage, so the first persona rebuild stops
  // every backup, where a database with no lasting row must record none.
  it('records no row when every audit row is one the testkit wrote', () => {
    addAuditRow('audit_switch', '2026-11-02T00:00:00.000Z', {
      actionType: PERSONA_SWITCH_AUDIT_ACTION_TYPE,
    });
    addAuditRow('audit_by_persona', '2026-11-03T00:00:00.000Z', { actorMemberId: persona });

    const res = runBackup();

    expect(res.status, res.stderr).toBe(0);
    const [key] = keysUnder('routine/');
    expect(lineageOf(key)).toEqual({
      'audit-newest-id': 'none', 'audit-newest-at': 'none', 'lineage-since': 'none',
    });
  });
});

describe('a database put back on purpose', () => {
  function staleHost(): string {
    addAuditRow('audit_restored_point', '2026-11-01T00:00:00.000Z');
    const stored = yesterdayRoutineKey();
    seedSnapshot(stored, {
      'audit-newest-id': 'audit_not_here', 'audit-newest-at': '2026-11-02T00:00:00.000Z', 'lineage-since': 'none',
    });
    return stored;
  }

  // Defect caught: after a restore or a rebuild deploy deliberately puts an
  // older database in place, backups refuse forever, because nothing tells the
  // check the break in the history was intended; or the marker is honoured
  // more than once, so a later stale database rides through on it.
  it('uploads once under a declared restore, records where the new lineage began, and spends the marker', () => {
    staleHost();
    const marker = writeMarker({
      since: '2026-11-19T10:00:00Z', by: 'restore-db.sh', expires: String(nowEpoch() + 3600),
    });

    const res = runBackup();

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(marker)).toBe(false);
    const uploaded = keysUnder('routine/').find((k) => k.startsWith(`routine/${utcDayPrefix()}`));
    expect(uploaded).toBeDefined();
    expect(lineageOf(uploaded as string)).toEqual({
      'audit-newest-id': 'audit_restored_point',
      'audit-newest-at': '2026-11-01T00:00:00.000Z',
      'lineage-since': '2026-11-19T10:00:00Z',
    });

    // The next run is checked against the upload the marker let through.
    addAuditRow('audit_after_restore', '2026-11-19T11:00:00.000Z');
    const next = runBackup();
    expect(next.status, next.stderr).toBe(0);
    expect(lineageOf(uploaded as string)?.['lineage-since']).toBe('2026-11-19T10:00:00Z');
  });

  // Defect caught: a disk snapshot taken while a marker sat unspent brings it
  // back days later, and the stale host's database uploads on it.
  it('ignores an expired marker, removes it, and lets the lineage check refuse', () => {
    const stored = staleHost();
    const marker = writeMarker({
      since: '2026-11-18T10:00:00Z', by: 'restore-db.sh', expires: String(nowEpoch() - 1),
    });

    const res = runBackup();

    expect(res.status).toBe(1);
    expect(existsSync(marker)).toBe(false);
    expect(keysUnder('routine/')).toEqual([stored]);
    expect(res.stderr).toContain('ignoring the declared-restore marker');
  });

  // Defect caught: a marker with no expiry, or a damaged one, is honoured as if
  // valid and lets any database through.
  it('ignores a marker with no expiry', () => {
    const stored = staleHost();
    writeMarker({ since: '2026-11-19T10:00:00Z', by: 'restore-db.sh' });

    const res = runBackup();

    expect(res.status).toBe(1);
    expect(keysUnder('routine/')).toEqual([stored]);
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

describe('retrying a failed upload', () => {
  // Defect caught: the waits between upload attempts are fixed (exactly 1s,
  // then 2s), so callers that failed together retry together; or the random
  // part shortens a wait below half its step, so a brief outage outlasts every
  // attempt. A recording stand-in for sleep captures each wait the run asks for.
  it('waits a jittered half-to-whole step between attempts, then uploads', () => {
    const sleepBin = join(workDir, 'sleep-bin');
    const sleepLog = join(workDir, 'sleeps.log');
    mkdirSync(sleepBin);
    writeFileSync(join(sleepBin, 'sleep'), [
      '#!/usr/bin/env bash',
      `echo "$1" >> ${JSON.stringify(sleepLog)}`,
    ].join('\n'));
    chmodSync(join(sleepBin, 'sleep'), 0o755);

    const res = runBackup({
      AWS_STUB_UPLOAD_FAILS: '2',
      PATH: `${sleepBin}:${binDir}:${process.env.PATH ?? ''}`,
    });

    expect(res.status, res.stderr).toBe(0);
    expect(keysUnder('routine/')).toHaveLength(1);
    const waits = readFileSync(sleepLog, 'utf8').trim().split('\n');
    expect(waits).toHaveLength(2);
    // Millisecond precision is what the random part is drawn at; a whole-second
    // argument means the wait went back to a fixed step.
    for (const w of waits) expect(w, `wait ${w}`).toMatch(/^\d+\.\d{3}$/);
    const [first, second] = waits.map(Number);
    expect(first).toBeGreaterThanOrEqual(0.5);
    expect(first).toBeLessThanOrEqual(1);
    expect(second).toBeGreaterThanOrEqual(1);
    expect(second).toBeLessThanOrEqual(2);
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
