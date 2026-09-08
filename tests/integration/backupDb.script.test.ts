/**
 * Thinning the snapshot history as it ages.
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
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
    '  if [[ "$dst" == s3://* ]]; then',
    '    out="$S3/${dst#s3://}"; mkdir -p "$(dirname "$out")"; cp "$src" "$out"; exit $?',
    '  fi',
    '  cp "$S3/${src#s3://}" "$dst"; exit $?',
    'fi',
    // Honours --query the way the real CLI does: with it, a bare count; without
    // it, the JSON envelope. The script's control flow reads this output as a
    // number, so a probe that lost its --query would silently stop promoting,
    // and a stub that answered with a count regardless would hide that.
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
    'exit 0',
  ].join('\n'));
  chmodSync(join(binDir, 'aws'), 0o755);
});

afterAll(() => {
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
