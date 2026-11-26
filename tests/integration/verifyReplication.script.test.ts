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
  /** Destination bucket ARN of the first enabled rule S3 lists, or '' for none. */
  dest: string;
  /**
   * Destination ARN of the enabled rule whose filter names each prefix, for a
   * bucket replicating through one rule per prefix; a prefix not named has no
   * such rule.
   */
  destByPrefix?: Record<string, string>;
  /** Objects as [LastModified, Key]. */
  objects: Array<[string, string]>;
  /** ReplicationStatus each key reports at the source; COMPLETED unless named. */
  status?: Record<string, string>;
}

/** The archive's bucket name as `terraform output -json` prints it. */
const ARCHIVE_OUTPUT = '"footbag-env-archive"';
/** The archive stack off: Terraform leaves the null output out of its state. */
const ABSENT = 'absent';
/** A state read that exits 0 but prints no JSON object of outputs. */
const NOT_JSON = 'not-json';

const HOURLY_KEY = 'hourly/2026/10/07/footbag-20261007T070000Z.db.gz';
const DAILY_KEY = 'daily/2026/10/07/footbag-20261007T000000Z.db.gz';
const ROUTINE_KEY = 'routine/2026/10/07/footbag-20261007T074000Z.db.gz';

/** Each newest database copy locked for the bucket's 90-day default from NOW. */
const LOCKED: Record<string, string> = {
  [HOURLY_KEY]: 'GOVERNANCE\t2027-01-05T07:00:00+00:00',
  [DAILY_KEY]: 'GOVERNANCE\t2027-01-05T00:00:00+00:00',
};

interface Versions {
  /** Delete markers per bucket, as [Key, LastModified]. */
  markers?: Record<string, Array<[string, string]>>;
  /** Enabled expiry rules per bucket, as [prefix, days]. */
  lifecycle?: Record<string, Array<[string, number]>>;
  /** Switches for the stand-in CLI's refusals. */
  env?: NodeJS.ProcessEnv;
}

/** The expiry rules the snapshot buckets carry: thinning by age on the primary,
 * the 90-day lock window on the DR copy. */
const SNAPSHOT_LIFECYCLE: Record<string, Array<[string, number]>> = {
  'footbag-env-db-snapshots': [['routine/', 2], ['hourly/', 30], ['daily/', 400]],
  'footbag-env-db-snapshots-dr': [['routine/', 90], ['hourly/', 90], ['daily/', 90]],
  'footbag-env-db-snapshots-routine-dr': [['routine/', 2]],
};

function run(
  target: string,
  buckets: Record<string, Bucket>,
  /** Keys present in each destination bucket. */
  present: Record<string, string[]>,
  /**
   * The archive's value in what `terraform output -json` prints: the bucket
   * name as a JSON string, `ABSENT` while the archive stack is off (Terraform
   * stores no null output), any other JSON text as its value, or `false` for a
   * state read that fails.
   */
  archiveOutput: string | false = ARCHIVE_OUTPUT,
  /**
   * What `get-object-retention` reports for a destination key, as
   * "<Mode>\t<RetainUntilDate>"; a key not named carries no retention.
   */
  retention: Record<string, string> = LOCKED,
  /** What the replication-stopped alarm's StateValue reads; 'None' is no alarm. */
  alarmState = 'OK',
  /** Delete markers and lifecycle rules of the snapshot buckets. */
  versions: Versions = {},
) {
  const markers = versions.markers ?? {};
  const lifecycle = versions.lifecycle ?? SNAPSHOT_LIFECYCLE;
  const fixtures = join(workDir, 'fixtures');
  const lines: string[] = [
    '#!/usr/bin/env bash',
    `echo "aws $*" >> ${JSON.stringify(callLog)}`,
    'bucket=""; key=""; prefix=""; prev=""',
    'for a in "$@"; do case "$prev" in --bucket) bucket="$a" ;; --key) key="$a" ;; --prefix) prefix="$a" ;; esac; prev="$a"; done',
    'case "$2" in',
  ];
  // A --query filtering the rules on Filter.Prefix is answered from that
  // prefix's rule, as S3 evaluates the JMESPath; an unfiltered one from the
  // first rule listed.
  lines.push('  get-bucket-replication)');
  lines.push('    query=""; prev=""; for a in "$@"; do [[ "$prev" == --query ]] && query="$a"; prev="$a"; done');
  for (const [name, b] of Object.entries(buckets)) {
    for (const [p, d] of Object.entries(b.destByPrefix ?? {})) {
      lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} && "$query" == *"Filter.Prefix=='${p}'"* ]] && { echo ${JSON.stringify(d || 'None')}; exit 0; }`);
    }
    lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} && "$query" == *"Filter.Prefix=="* ]] && { echo None; exit 0; }`);
    lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} ]] && { echo ${JSON.stringify(b.dest || 'None')}; exit 0; }`);
  }
  lines.push('    exit 254 ;;');
  // Filtered by --prefix, as S3 does, so the hourly and daily checks each see
  // only their own tier.
  lines.push('  list-objects-v2)');
  for (const [name, b] of Object.entries(buckets)) {
    for (const [m, k] of b.objects) {
      lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} && ${JSON.stringify(k)} == "$prefix"* ]] && printf '%s\\t%s\\n' ${JSON.stringify(m)} ${JSON.stringify(k)}`);
    }
  }
  lines.push('    exit 0 ;;');
  // Every backup bucket lives in us-west-2; FAKE_NO_LOCATION makes the
  // location read fail.
  lines.push('  get-bucket-location) [[ -n "${FAKE_NO_LOCATION:-}" ]] && exit 254; echo us-west-2; exit 0 ;;');
  lines.push('  get-object-retention)');
  for (const [k, r] of Object.entries(retention)) {
    const [mode, until] = r.split('\t');
    lines.push(`    [[ "$key" == ${JSON.stringify(k)} && " $* " == *" --region us-west-2 "* ]] && { printf '%s\\t%s\\n' ${JSON.stringify(mode)} ${JSON.stringify(until)}; exit 0; }`);
  }
  lines.push('    echo "An error occurred (NoSuchObjectLockConfiguration)" >&2; exit 254 ;;');
  lines.push('  head-object)');
  for (const [name, b] of Object.entries(buckets)) {
    for (const [, k] of b.objects) {
      const s = b.status?.[k] ?? 'COMPLETED';
      lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} && "$key" == ${JSON.stringify(k)} ]] && { echo ${JSON.stringify(s)}; exit 0; }`);
    }
  }
  for (const [name, keys] of Object.entries(present)) {
    for (const k of keys) {
      // A copy answers only in its bucket's region, us-west-2 for every
      // backup bucket.
      lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} && "$key" == ${JSON.stringify(k)} && " $* " == *" --region us-west-2 "* ]] && { echo "{}"; exit 0; }`);
    }
  }
  lines.push('    exit 254 ;;');
  // The stopped alarm lives in the backup region, where S3 publishes the
  // latency metric it watches; asked for anywhere else, AWS has no such alarm.
  lines.push(`  describe-alarms) [[ " $* " == *" --region us-west-2 "* ]] || { echo None; exit 0; }; echo ${JSON.stringify(alarmState)}; exit 0 ;;`);
  // A list query with text output prints one row per element, tab-separated,
  // and the literal None when the list is empty or absent.
  lines.push('  get-bucket-lifecycle-configuration)');
  lines.push('    [[ -n "${FAKE_NO_LIFECYCLE:-}" ]] && { echo "An error occurred (AccessDenied)" >&2; exit 254; }');
  for (const [name, rules] of Object.entries(lifecycle)) {
    const rows = rules.map(([p, d]) => `${p}\\t${d}`).join('\\n');
    lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} ]] && { printf '${rows}\\n'; exit 0; }`);
  }
  lines.push('    echo None; exit 0 ;;');
  lines.push('  list-object-versions)');
  lines.push('    [[ -n "${FAKE_NO_VERSIONS:-}" ]] && { echo "An error occurred (AccessDenied) when calling the ListObjectVersions operation" >&2; exit 254; }');
  for (const [name, list] of Object.entries(markers)) {
    for (const [k, m] of list) {
      lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} ]] && printf '%s\\t%s\\n' ${JSON.stringify(k)} ${JSON.stringify(m)}`);
    }
    lines.push(`    [[ "$bucket" == ${JSON.stringify(name)} ]] && exit 0`);
  }
  lines.push('    echo None; exit 0 ;;');
  lines.push('esac', 'exit 64');
  writeFileSync(fixtures, lines.join('\n'));
  chmodSync(fixtures, 0o755);

  const tf = join(workDir, 'terraform');
  writeFileSync(tf, [
    '#!/usr/bin/env bash',
    'case "$*" in',
    '  *media_bucket_name*) echo footbag-env-media ;;',
    '  *snapshots_bucket_name*) echo footbag-env-db-snapshots ;;',
    '  *routine_dr_bucket_name*) echo footbag-env-db-snapshots-routine-dr ;;',
    '  *dr_bucket_name*) echo footbag-env-db-snapshots-dr ;;',
    // Live Terraform keeps no null output in its state, so the archive off is
    // a name absent from the map, and asking for the name alone fails.
    '  *"-json archive_bucket_name"*) echo "Error: Output \\"archive_bucket_name\\" not found" >&2; exit 1 ;;',
    archiveOutput === false
      ? '  *"output -json") echo "Error: Failed to load state" >&2; exit 1 ;;'
      : `  *"output -json") echo ${JSON.stringify(
        archiveOutput === NOT_JSON ? 'Warning: state is outdated' : archiveOutput === ABSENT
          ? '{"media_bucket_name":{"sensitive":false,"type":"string","value":"footbag-env-media"}}'
          : `{"media_bucket_name":{"sensitive":false,"type":"string","value":"footbag-env-media"},"archive_bucket_name":{"sensitive":false,"type":"string","value":${archiveOutput}}}`,
      )} ;;`,
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
      ...(versions.env ?? {}),
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
const ROUTINE_DR = 'arn:aws:s3:::footbag-env-db-snapshots-routine-dr';
const ARCHIVE_DR = 'arn:aws:s3:::footbag-env-archive-dr';

function healthyProduction(): { buckets: Record<string, Bucket>; present: Record<string, string[]> } {
  return {
    buckets: {
      'footbag-env-media': {
        dest: MEDIA_DR,
        objects: [['2026-10-07T06:00:00+00:00', 'photos/old.jpg'], ['2026-10-07T07:00:00+00:00', 'photos/settled.jpg']],
      },
      'footbag-env-db-snapshots': {
        // S3 lists the routine rule first here, so a check reading the first
        // rule for every prefix would look for hourly copies in the wrong bucket.
        dest: ROUTINE_DR,
        destByPrefix: { 'routine/': ROUTINE_DR, 'hourly/': SNAP_DR, 'daily/': SNAP_DR },
        objects: [
          ['2026-10-07T00:00:00+00:00', DAILY_KEY],
          ['2026-10-07T07:00:00+00:00', HOURLY_KEY],
          ['2026-10-07T07:40:00+00:00', ROUTINE_KEY],
        ],
      },
      'footbag-env-archive': {
        dest: ARCHIVE_DR,
        objects: [['2026-10-07T07:10:00+00:00', 'members/roster.html']],
      },
    },
    present: {
      'footbag-env-media-dr': ['photos/settled.jpg'],
      'footbag-env-db-snapshots-dr': [HOURLY_KEY, DAILY_KEY],
      'footbag-env-db-snapshots-routine-dr': [ROUTINE_KEY],
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

  it('checks the daily tier too, so a stopped daily rule cannot pass behind a healthy hourly one', () => {
    // Defect caught: the daily points are the longest-lived backups; with only
    // hourly/ checked, a daily rule that stopped would leave them with no
    // recovery-region copy and the run would still report replication proven.
    const { buckets, present } = healthyProduction();
    present['footbag-env-db-snapshots-dr'] = [HOURLY_KEY];
    const res = run('production', buckets, present);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(`${DAILY_KEY} is missing from footbag-env-db-snapshots-dr`);
  });

  it('reads the lock on each newest database copy and reports it', () => {
    // Defect caught: a lock configured on the bucket but absent from the copy
    // protects nothing, and only reading the copy's own retention shows it.
    const { buckets, present } = healthyProduction();
    const res = run('production', buckets, present);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('locked (GOVERNANCE) until 2027-01-05T07:00:00+00:00');
    expect(res.stdout).toContain('locked (GOVERNANCE) until 2027-01-05T00:00:00+00:00');
  });

  it('fails on production while the replication-stopped alarm fires or is missing', () => {
    // Defect caught: a copy check passes on an object replicated before the
    // rule stopped, so only the alarm's own state shows replication has gone
    // silent; a missing alarm means the production tree was never applied.
    const { buckets, present } = healthyProduction();
    for (const [state, message] of [
      ['ALARM', 'is in ALARM: no hourly snapshot has replicated for three hours'],
      ['None', 'does not exist; apply the production tree'],
    ] as const) {
      const res = run('production', buckets, present, ARCHIVE_OUTPUT, LOCKED, state);
      expect(res.status, state).toBe(1);
      expect(res.stderr, state).toContain(`footbag-production-snapshots-hourly-replication-stopped ${message}`);
    }
    // A fresh alarm with no data yet is not a failure.
    const fresh = run('production', buckets, present, ARCHIVE_OUTPUT, LOCKED, 'INSUFFICIENT_DATA');
    expect(fresh.status, fresh.stderr).toBe(0);
    expect(fresh.stdout).toContain('state INSUFFICIENT_DATA');
  });

  it('fails a database copy that carries no lock, or one ending under 60 days ahead', () => {
    // Defect caught: an unlocked or nearly expired copy can be deleted early,
    // which is the loss the recovery-region copy exists to prevent.
    const { buckets, present } = healthyProduction();
    for (const [retention, message] of [
      [{ [DAILY_KEY]: LOCKED[DAILY_KEY] }, `${HOURLY_KEY} in footbag-env-db-snapshots-dr carries no Object Lock retention`],
      [{ ...LOCKED, [HOURLY_KEY]: 'GOVERNANCE\t2026-12-05T07:59:59+00:00' }, `${HOURLY_KEY} in footbag-env-db-snapshots-dr is locked only until 2026-12-05T07:59:59+00:00`],
    ] as const) {
      const res = run('production', buckets, present, ARCHIVE_OUTPUT, retention);
      expect(res.status, message).toBe(1);
      expect(res.stderr, message).toContain(message);
    }
    // Exactly 60 days ahead is accepted, so the floor is pinned from both sides.
    const atFloor = run('production', buckets, present, ARCHIVE_OUTPUT, {
      ...LOCKED,
      [HOURLY_KEY]: 'GOVERNANCE\t2026-12-06T08:00:00+00:00',
    });
    expect(atFloor.status, atFloor.stderr).toBe(0);
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
    // Live Terraform records the null output by leaving it out of the state,
    // so the stack off is the name absent; asking for that name alone fails
    // (the stand-in refuses it as live Terraform does), which is the defect
    // this case also catches.
    const { buckets, present } = healthyProduction();
    delete buckets['footbag-env-archive'];
    const res = run('production', buckets, present, ABSENT);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('SKIP: archive bucket not checked');
    expect(res.stdout).toContain('SKIPPED: archive');
    expect(res.stdout).not.toContain('every source\'s newest settled object');
    expect(calls()).not.toContain('archive');
  });

  it('fails, before any AWS call, when the state\'s outputs cannot be read', () => {
    // Defect caught: an unreadable state treated like an absent output would
    // skip an archive that exists and may not be replicating.
    const { buckets, present } = healthyProduction();
    const res = run('production', buckets, present, false);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not read terraform/production outputs');
    expect(res.stdout).not.toContain('SKIP');
    expect(calls()).toBe('');
  });

  it('fails, before any AWS call, when the state read prints no object of outputs', () => {
    // Defect caught: text that is not an object of outputs, read as one with
    // no archive in it, would skip an archive that may exist.
    const { buckets, present } = healthyProduction();
    const res = run('production', buckets, present, NOT_JSON);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('outputs are not a JSON object of outputs');
    expect(res.stdout).not.toContain('SKIP');
    expect(calls()).toBe('');
  });

  it('fails, rather than reading the copy elsewhere, when its bucket\'s region cannot be read', () => {
    // Defect caught: a copy read in a guessed region rides the source region,
    // the one a regional outage takes away, or is reported missing for the
    // wrong reason.
    const { buckets, present } = healthyProduction();
    process.env.FAKE_NO_LOCATION = '1';
    try {
      const res = run('production', buckets, present);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('the region of footbag-env-media-dr could not be read');
      expect(res.stderr).not.toContain('is missing from');
    } finally {
      delete process.env.FAKE_NO_LOCATION;
    }
  });

  it('fails when the archive output is neither null nor a bucket name', () => {
    const { buckets, present } = healthyProduction();
    for (const bad of ['""', '42']) {
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

  /** Staging's estate: no locked tier, so its snapshot bucket has the routine rule alone. */
  function healthyStaging(): { buckets: Record<string, Bucket>; present: Record<string, string[]> } {
    const { buckets, present } = healthyProduction();
    return {
      buckets: {
        'footbag-env-media': buckets['footbag-env-media'],
        'footbag-env-archive': buckets['footbag-env-archive'],
        'footbag-env-db-snapshots': {
          dest: ROUTINE_DR,
          destByPrefix: { 'routine/': ROUTINE_DR },
          objects: [['2026-10-07T07:40:00+00:00', ROUTINE_KEY]],
        },
      },
      present,
    };
  }

  it('checks media, the archive and the routine snapshot stream on staging, which has no locked tier', () => {
    // Defect caught: staging rehearses the routine copy, so a staging check
    // that skipped it would let a broken routine rule reach production unseen;
    // one that judged hourly/ or daily/ there would fail a tier staging never
    // replicates.
    const { buckets, present } = healthyStaging();
    const res = run('staging', buckets, present);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('present in footbag-env-media-dr');
    expect(res.stdout).toContain('present in footbag-env-archive-dr');
    expect(res.stdout).toContain('present in footbag-env-db-snapshots-routine-dr');
    expect(calls()).not.toMatch(/list-objects-v2 --bucket footbag-env-db-snapshots --prefix (hourly|daily)\//);
    expect(calls()).not.toContain('footbag-env-db-snapshots-dr ');
    expect(calls()).not.toMatch(/footbag-env-db-snapshots-dr$/m);
  });

  it('fails when the newest settled routine snapshot is missing from the routine DR bucket', () => {
    // Defect caught: the routine rule configured but delivering nothing, so a
    // regional loss falls back an hour to the locked bucket's last point while
    // every alarm reads healthy.
    for (const target of ['production', 'staging'] as const) {
      const { buckets, present } = target === 'production' ? healthyProduction() : healthyStaging();
      present['footbag-env-db-snapshots-routine-dr'] = [];
      const res = run(target, buckets, present);
      expect(res.status, target).toBe(1);
      expect(res.stderr, target).toContain(`${ROUTINE_KEY} is missing from footbag-env-db-snapshots-routine-dr`);
    }
  });

  it('fails when a snapshot generation replicates into the wrong DR bucket', () => {
    // Defect caught: a routine rule pointed at the locked bucket holds every
    // five-minute copy for 90 days, and an hourly rule pointed at the routine
    // bucket loses the long history after two days; both copies exist, so a
    // check that only looked for the key would pass.
    const { buckets, present } = healthyProduction();
    buckets['footbag-env-db-snapshots'].destByPrefix = { 'routine/': SNAP_DR, 'hourly/': ROUTINE_DR, 'daily/': SNAP_DR };
    present['footbag-env-db-snapshots-dr'].push(ROUTINE_KEY);
    present['footbag-env-db-snapshots-routine-dr'].push(HOURLY_KEY);
    const res = run('production', buckets, present);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('footbag-env-db-snapshots/routine/ replicates to footbag-env-db-snapshots-dr, not footbag-env-db-snapshots-routine-dr');
    expect(res.stderr).toContain('footbag-env-db-snapshots/hourly/ replicates to footbag-env-db-snapshots-routine-dr, not footbag-env-db-snapshots-dr');
    expect(res.stderr).not.toContain('footbag-env-db-snapshots/daily/ replicates');
  });

  it('fails when the snapshot bucket has no enabled rule for the routine stream', () => {
    // Defect caught: the routine rule removed or disabled while the hourly and
    // daily rules still answer, so an unfiltered look at the rules passes.
    const { buckets, present } = healthyProduction();
    buckets['footbag-env-db-snapshots'].dest = SNAP_DR;
    buckets['footbag-env-db-snapshots'].destByPrefix = { 'hourly/': SNAP_DR, 'daily/': SNAP_DR };
    const res = run('production', buckets, present);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('footbag-env-db-snapshots has no enabled replication rule for routine/');
    expect(res.stderr).not.toContain('rule for hourly/');
  });

  it('refuses a missing or unknown target', () => {
    const res = run('prod', {}, {});
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--target must be staging or production');
    expect(calls()).toBe('');
  });
});

describe('delete markers in the snapshot buckets', () => {
  // Lifecycle expiry writes these every day in a versioned bucket: a routine
  // snapshot of 1 October expired after its 2 days, and an hourly copy in the DR
  // bucket expired after the lock window's 90.
  const LIFECYCLE_MARKERS: Record<string, Array<[string, string]>> = {
    'footbag-env-db-snapshots': [
      ['routine/2026/10/01/footbag-20261001T120000Z.db.gz', '2026-10-04T00:00:00+00:00'],
    ],
    'footbag-env-db-snapshots-dr': [
      ['hourly/2026/06/01/footbag-20260601T010000Z.db.gz', '2026-08-31T00:00:00+00:00'],
    ],
  };

  function production(markers: Record<string, Array<[string, string]>>, env: NodeJS.ProcessEnv = {}) {
    const { buckets, present } = healthyProduction();
    return run('production', buckets, present, ARCHIVE_OUTPUT, LOCKED, 'OK', { markers, env });
  }

  // Defect caught: the check fails permanently on a healthy bucket, because
  // every lifecycle expiry in a versioned bucket leaves a marker.
  it('passes markers that lifecycle expiry wrote, in both buckets', () => {
    const res = production(LIFECYCLE_MARKERS);

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toContain('list-object-versions --region us-west-2 --bucket footbag-env-db-snapshots ');
    expect(calls()).toContain('list-object-versions --region us-west-2 --bucket footbag-env-db-snapshots-dr ');
    expect(res.stdout).toMatch(/1 delete marker\(s\) checked/);
  });

  // Defect caught: the newest off-region copies, in the routine DR bucket,
  // deleted with nobody told, because its markers were never read; or each of
  // its daily two-day expiries misread as a deletion.
  it('reads the routine DR bucket\'s markers too, explained by its own two-day expiry', () => {
    const expired = production({
      ...LIFECYCLE_MARKERS,
      'footbag-env-db-snapshots-routine-dr': [
        ['routine/2026/10/01/footbag-20261001T120000Z.db.gz', '2026-10-04T00:00:00+00:00'],
      ],
    });
    expect(expired.status, expired.stderr).toBe(0);
    expect(calls()).toContain('list-object-versions --region us-west-2 --bucket footbag-env-db-snapshots-routine-dr');

    const deleted = production({
      ...LIFECYCLE_MARKERS,
      'footbag-env-db-snapshots-routine-dr': [
        ['routine/2026/10/07/footbag-20261007T070000Z.db.gz', '2026-10-07T07:30:00+00:00'],
      ],
    });
    expect(deleted.status).toBe(1);
    expect(deleted.stderr).toMatch(/delete marker on routine\/2026\/10\/07\/footbag-20261007T070000Z\.db\.gz in footbag-env-db-snapshots-routine-dr .*2-day/);
  });

  // Defect caught: someone deletes a backup (the newest daily point, long
  // before its 400 days), both regions read without it, and every alarm stays
  // healthy, because nothing looked at the markers.
  it('fails a marker that came sooner than its generation\'s expiry', () => {
    const res = production({
      ...LIFECYCLE_MARKERS,
      'footbag-env-db-snapshots': [
        ...LIFECYCLE_MARKERS['footbag-env-db-snapshots'],
        ['daily/2026/10/01/footbag-20261001T000000Z.db.gz', '2026-10-02T00:00:00+00:00'],
      ],
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/FAIL: delete marker on daily\/2026\/10\/01\/footbag-20261001T000000Z\.db\.gz in footbag-env-db-snapshots .*400-day/);
  });

  // Defect caught: a deleted cutover rollback artifact, under a prefix no
  // expiry rule covers, passes as if lifecycle had removed it.
  it('fails a marker under a prefix no expiry rule covers', () => {
    const res = production({
      ...LIFECYCLE_MARKERS,
      'footbag-env-db-snapshots-dr': [['pre-flip/abc/abc.db.gz', '2026-10-06T00:00:00+00:00']],
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('FAIL: delete marker on pre-flip/abc/abc.db.gz in footbag-env-db-snapshots-dr');
    expect(res.stderr).toContain('no lifecycle expiry rule');
  });

  // Defect caught: a version listing the role cannot read reads as "no
  // markers", so the one check that sees deleted backups passes blind.
  it('fails when the versions cannot be listed, with the CLI\'s reason', () => {
    const res = production(LIFECYCLE_MARKERS, { FAKE_NO_VERSIONS: '1' });

    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/FAIL: could not list the versions of footbag-env-db-snapshots.*ListObjectVersions/);
  });

  // Defect caught: unreadable lifecycle rules make every marker look
  // unexplained, or worse, explained.
  it('fails when the lifecycle rules cannot be read', () => {
    const res = production(LIFECYCLE_MARKERS, { FAKE_NO_LIFECYCLE: '1' });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not read the lifecycle rules of footbag-env-db-snapshots');
  });

  // Defect caught: staging's backups are deleted unnoticed, because only
  // production's buckets were read.
  it('checks staging\'s snapshot buckets too', () => {
    const { buckets, present } = healthyProduction();
    const staging = {
      'footbag-env-media': buckets['footbag-env-media'],
      'footbag-env-archive': buckets['footbag-env-archive'],
      'footbag-env-db-snapshots': {
        dest: ROUTINE_DR, destByPrefix: { 'routine/': ROUTINE_DR }, objects: [['2026-10-07T07:40:00+00:00', ROUTINE_KEY]] as Array<[string, string]>,
      },
    };
    const res = run('staging', staging, present, ARCHIVE_OUTPUT, LOCKED, 'OK', {
      markers: { 'footbag-env-db-snapshots': [['hourly/2026/10/06/footbag-20261006T010000Z.db.gz', '2026-10-06T02:00:00+00:00']] },
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('FAIL: delete marker on hourly/2026/10/06/footbag-20261006T010000Z.db.gz in footbag-env-db-snapshots');
    expect(res.stderr).not.toContain('replication rule');
    expect(calls()).toContain('list-object-versions --region us-west-2 --bucket footbag-env-db-snapshots-routine-dr');
  });
});
