/**
 * Proving cross-region replication delivers objects, read-only.
 *
 * Configuration and alarms say what should happen; only a real object present
 * in the recovery bucket shows it did. What these pin: the check judges the
 * newest object old enough to have finished replicating, requires the source to
 * report COMPLETED and the same key to exist in the destination the rule names,
 * refuses to report success when there is nothing to judge, covers the snapshot
 * tier on production only, covers the archive wherever its stack is on and
 * names it as skipped where it is off, and never writes.
 *
 * AWS and Terraform are stand-ins answering from fixtures; every AWS call is
 * recorded so a case can assert that none of them wrote anything.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/verify-replication.sh');
// The clock the lag window is measured from; objects at 07:00 are settled,
// objects at 07:58 are not.
const NOW = '2026-10-07T08:00:00';

let workDir: string;
let callLog: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-replication-'));
  callLog = join(workDir, 'calls.log');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface Bucket {
  /** Destination bucket ARN of the enabled rule, or '' for none. */
  dest: string;
  /** Objects as [LastModified, Key]. */
  objects: Array<[string, string]>;
  /** ReplicationStatus each key reports at the source; COMPLETED unless named. */
  status?: Record<string, string>;
}

/** The archive's bucket name as `terraform output -json` prints it. */
const ARCHIVE_OUTPUT = '"footbag-env-archive"';

function run(
  target: string,
  buckets: Record<string, Bucket>,
  /** Keys present in each destination bucket. */
  present: Record<string, string[]>,
  /**
   * What `terraform output -json archive_bucket_name` prints: the bucket name
   * as a JSON string, `null` while the archive stack is off, or `false` for a
   * read that fails.
   */
  archiveOutput: string | false = ARCHIVE_OUTPUT,
) {
  const fixtures = join(workDir, 'fixtures');
  const lines: string[] = [
    '#!/usr/bin/env bash',
    `echo "aws $*" >> ${JSON.stringify(callLog)}`,
    'bucket=""; key=""; prev=""',
    'for a in "$@"; do case "$prev" in --bucket) bucket="$a" ;; --key) key="$a" ;; esac; prev="$a"; done',
    'case "$2" in',
  ];
  lines.push('  get-bucket-replication)');
  for (const [name, b] of Object.entries(buckets)) {
    lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} ]] && { echo ${JSON.stringify(b.dest || 'None')}; exit 0; }`);
  }
  lines.push('    exit 254 ;;');
  lines.push('  list-objects-v2)');
  for (const [name, b] of Object.entries(buckets)) {
    const rows = b.objects.map(([m, k]) => `${m}\\t${k}`).join('\\n');
    lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} ]] && { printf "${rows}\\n"; exit 0; }`);
  }
  lines.push('    exit 0 ;;');
  lines.push('  head-object)');
  for (const [name, b] of Object.entries(buckets)) {
    for (const [, k] of b.objects) {
      const s = b.status?.[k] ?? 'COMPLETED';
      lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} && "$key" == ${JSON.stringify(k)} ]] && { echo ${JSON.stringify(s)}; exit 0; }`);
    }
  }
  for (const [name, keys] of Object.entries(present)) {
    for (const k of keys) {
      lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} && "$key" == ${JSON.stringify(k)} ]] && { echo "{}"; exit 0; }`);
    }
  }
  lines.push('    exit 254 ;;', 'esac', 'exit 64');
  writeFileSync(fixtures, lines.join('\n'));
  chmodSync(fixtures, 0o755);

  const tf = join(workDir, 'terraform');
  writeFileSync(tf, [
    '#!/usr/bin/env bash',
    'case "$*" in',
    '  *media_bucket_name*) echo footbag-env-media ;;',
    '  *snapshots_bucket_name*) echo footbag-env-db-snapshots ;;',
    archiveOutput === false
      ? '  *archive_bucket_name*) echo "Error: No outputs found" >&2; exit 1 ;;'
      : `  *"-json archive_bucket_name"*) echo ${JSON.stringify(archiveOutput)} ;;`,
    '  *) exit 1 ;;',
    'esac',
  ].join('\n'));
  chmodSync(tf, 0o755);

  const res = spawnSync('bash', [SCRIPT, '--target', target], {
    encoding: 'utf8',
    env: {
      ...process.env,
      VERIFY_REPLICATION_AWS_BIN: fixtures,
      VERIFY_REPLICATION_TERRAFORM_BIN: tf,
      VERIFY_REPLICATION_NOW: NOW,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function calls(): string {
  return existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
}

const MEDIA_DR = 'arn:aws:s3:::footbag-env-media-dr';
const SNAP_DR = 'arn:aws:s3:::footbag-env-db-snapshots-dr';
const ARCHIVE_DR = 'arn:aws:s3:::footbag-env-archive-dr';

function healthyProduction(): { buckets: Record<string, Bucket>; present: Record<string, string[]> } {
  return {
    buckets: {
      'footbag-env-media': {
        dest: MEDIA_DR,
        objects: [['2026-10-07T06:00:00+00:00', 'photos/old.jpg'], ['2026-10-07T07:00:00+00:00', 'photos/settled.jpg']],
      },
      'footbag-env-db-snapshots': {
        dest: SNAP_DR,
        objects: [['2026-10-07T07:00:00+00:00', 'hourly/2026/10/07/footbag-20261007T070000Z.db.gz']],
      },
      'footbag-env-archive': {
        dest: ARCHIVE_DR,
        objects: [['2026-10-07T07:10:00+00:00', 'members/roster.html']],
      },
    },
    present: {
      'footbag-env-media-dr': ['photos/settled.jpg'],
      'footbag-env-db-snapshots-dr': ['hourly/2026/10/07/footbag-20261007T070000Z.db.gz'],
      'footbag-env-archive-dr': ['members/roster.html'],
    },
  };
}

describe('verifying replication', () => {
  it('passes on production when each source\'s newest settled object is in its DR bucket', () => {
    const { buckets, present } = healthyProduction();
    const res = run('production', buckets, present);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('photos/settled.jpg');
    expect(res.stdout).toContain('hourly/2026/10/07/footbag-20261007T070000Z.db.gz');
    expect(res.stdout).toContain('members/roster.html');
    expect(res.stdout).toContain('present in footbag-env-archive-dr');
    expect(res.stdout).not.toContain('SKIP');
    expect(res.stdout).toContain('replication proven on production');
  });

  it('fails when the archive\'s settled object is missing from its DR bucket', () => {
    // Defect caught: the archive is the only copy of the legacy mirror once its
    // host is gone, so a check that left it out would report a healthy estate
    // while the mirror had no second-region copy at all.
    const { buckets, present } = healthyProduction();
    present['footbag-env-archive-dr'] = [];
    const res = run('production', buckets, present);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('members/roster.html is missing from footbag-env-archive-dr');
  });

  it('reports the archive as skipped, not passed, when its stack is off', () => {
    // Defect caught: a null output read as a pass would print "proven" over an
    // environment where nothing about the archive was looked at; read as a
    // failure, every environment without the archive would fail forever.
    const { buckets, present } = healthyProduction();
    delete buckets['footbag-env-archive'];
    const res = run('production', buckets, present, 'null');
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('SKIP: archive bucket not checked');
    expect(res.stdout).toContain('SKIPPED: archive');
    expect(res.stdout).not.toContain('every source\'s newest settled object');
    expect(calls()).not.toContain('archive');
  });

  it('fails, before any AWS call, when the archive output cannot be read', () => {
    // Defect caught: an unreadable output treated like a null one would skip an
    // archive that exists and may not be replicating.
    const { buckets, present } = healthyProduction();
    const res = run('production', buckets, present, false);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not read terraform/production output archive_bucket_name');
    expect(res.stdout).not.toContain('SKIP');
    expect(calls()).toBe('');
  });

  it('fails when the archive output is neither null nor a bucket name', () => {
    const { buckets, present } = healthyProduction();
    for (const bad of ['""', '"footbag-env-archive" junk']) {
      const res = run('production', buckets, present, bad);
      expect(res.status, bad).toBe(1);
      expect(res.stderr, bad).toContain('neither null nor a bucket name');
    }
  });

  it('writes nothing anywhere', () => {
    // A marker written into the source would replicate into the Object Lock DR
    // bucket, where its retention may stop anyone removing it.
    const { buckets, present } = healthyProduction();
    run('production', buckets, present);
    expect(calls()).not.toMatch(/put-object|delete-object|copy-object|s3 cp|s3 rm/);
  });

  it('judges the newest settled object, not one still in flight', () => {
    // Defect caught: judging an object written a minute ago fails a healthy
    // replication that simply has not caught up yet.
    const { buckets, present } = healthyProduction();
    buckets['footbag-env-media'].objects.push(['2026-10-07T07:58:00+00:00', 'photos/in-flight.jpg']);
    buckets['footbag-env-media'].status = { 'photos/in-flight.jpg': 'PENDING' };
    const res = run('production', buckets, present);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('photos/settled.jpg');
    expect(res.stdout).not.toContain('photos/in-flight.jpg');
  });

  it('draws the settled line at fifteen minutes, from both sides', () => {
    // A shorter window judges objects still replicating and fails a healthy
    // bucket; a longer one judges an older object and misses a recent failure.
    const { buckets, present } = healthyProduction();
    // An object exactly fifteen minutes old is settled; one at fourteen is not.
    buckets['footbag-env-media'].objects.push(
      ['2026-10-07T07:45:00+00:00', 'photos/settled-15m.jpg'],
      ['2026-10-07T07:46:00+00:00', 'photos/in-flight-14m.jpg'],
    );
    buckets['footbag-env-media'].status = { 'photos/in-flight-14m.jpg': 'PENDING' };
    present['footbag-env-media-dr'].push('photos/settled-15m.jpg');
    const res = run('production', buckets, present);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('photos/settled-15m.jpg');
    expect(res.stdout).not.toContain('photos/in-flight-14m.jpg');
  });

  it('fails when the settled object is missing from the DR bucket', () => {
    // Defect caught: the rule exists and the alarm is quiet, but nothing reaches
    // the recovery region; a regional loss would then find an empty DR bucket.
    const { buckets, present } = healthyProduction();
    present['footbag-env-media-dr'] = [];
    const res = run('production', buckets, present);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('missing from footbag-env-media-dr');
  });

  it('fails when the source reports the copy as anything but COMPLETED', () => {
    const { buckets, present } = healthyProduction();
    buckets['footbag-env-db-snapshots'].status = {
      'hourly/2026/10/07/footbag-20261007T070000Z.db.gz': 'FAILED',
    };
    const res = run('production', buckets, present);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("replication status 'FAILED'");
  });

  it('fails when a source has no enabled replication rule', () => {
    const { buckets, present } = healthyProduction();
    buckets['footbag-env-media'].dest = '';
    const res = run('production', buckets, present);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no enabled replication rule');
  });

  it('refuses to report success when no object is old enough to judge', () => {
    // A check with nothing to look at proves nothing, and reporting it as a pass
    // would be the quietest possible false assurance.
    const { buckets, present } = healthyProduction();
    buckets['footbag-env-media'].objects = [['2026-10-07T07:59:00+00:00', 'photos/new.jpg']];
    const res = run('production', buckets, present);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('nothing proves replication');
  });

  it('checks media and the archive on staging, which replicates no snapshot tier', () => {
    const { buckets, present } = healthyProduction();
    const res = run('staging', {
      'footbag-env-media': buckets['footbag-env-media'],
      'footbag-env-archive': buckets['footbag-env-archive'],
    }, present);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('present in footbag-env-media-dr');
    expect(res.stdout).toContain('present in footbag-env-archive-dr');
    expect(calls()).not.toContain('footbag-env-db-snapshots');
  });

  it('refuses a missing or unknown target', () => {
    const res = run('prod', {}, {});
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--target must be staging or production');
    expect(calls()).toBe('');
  });
});
