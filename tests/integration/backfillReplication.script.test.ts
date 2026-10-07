/**
 * Backfilling a replicated bucket's existing objects into its recovery bucket.
 *
 * Live replication copies only objects written after the rule exists, so a
 * bucket loaded first has an incomplete second-region copy until a Batch
 * Replication job fills it. What these pin: the job runs under the role the
 * live rule uses and only when that rule names the expected destination and
 * the role trusts S3 Batch Operations; S3 generates the manifest, limited to
 * objects never replicated or failed, and writes it and the report under the
 * prefix the role may write; only the directly authenticated operator user in
 * this account creates a job; production takes a typed confirmation and is
 * refused with no terminal; an unfinished job is resumed rather than doubled;
 * the run is judged on the job's end state and on sampled keys being present in
 * the destination; and nothing is created in the dry-run and status modes.
 *
 * AWS and Terraform are stand-ins answering from files in a per-test scratch
 * directory; every AWS call is logged so a case can assert what was, and was
 * not, asked for.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/backfill-replication.sh');
// The project's account id is fixed in the identity library, not configurable,
// so the stand-in answers in that account.
const ACCOUNT = '041904915126';
const OPERATOR = `arn:aws:iam::${ACCOUNT}:user/footbag-operator`;
const ROLE = `arn:aws:iam::${ACCOUNT}:role/footbag-env-s3-replication`;
const SRC = 'footbag-env-archive';
const DEST = 'footbag-env-archive-dr';
const LOGS = 'footbag-env-archive-logs';

let dir: string;

beforeEach(() => {
  dir = createScratchDir('backfill-replication');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface World {
  archiveOutput: string;
  destOutput: string;
  replication: unknown | null;
  trustServices: string[];
  caller: string;
  jobs: Array<{ JobId: string; Description: string }>;
  /** Successive describe-job rows: Status, total, succeeded, failed. */
  describe: string[];
  reasons: string;
  keys: string[];
  /** Replication status each source key reports; COMPLETED unless named. */
  status: Record<string, string>;
  /** Keys present in the destination bucket. */
  present: string[];
}

function healthy(): World {
  const keys = ['_gate/denied.html', 'index.html', 'members/a b.html'];
  return {
    archiveOutput: JSON.stringify(SRC),
    destOutput: JSON.stringify(DEST),
    replication: {
      ReplicationConfiguration: {
        Role: ROLE,
        Rules: [{ ID: 'replicate-all-to-archive-dr', Status: 'Enabled', Destination: { Bucket: `arn:aws:s3:::${DEST}` } }],
      },
    },
    trustServices: ['s3.amazonaws.com', 'batchoperations.s3.amazonaws.com'],
    caller: OPERATOR,
    jobs: [],
    describe: ['Active\t3\t1\t0', 'Complete\t3\t3\t0'],
    reasons: '',
    keys,
    status: {},
    present: [...keys],
  };
}

function run(args: string[], w: World) {
  const f = (name: string) => join(dir, name);
  writeFileSync(f('archive'), w.archiveOutput);
  writeFileSync(f('dest'), w.destOutput);
  writeFileSync(f('report'), JSON.stringify({ bucket: LOGS, prefix: 'batch-replication' }));
  if (w.replication) writeFileSync(f('replication.json'), JSON.stringify(w.replication));
  writeFileSync(f('trust.json'), JSON.stringify({
    Version: '2012-10-17',
    Statement: w.trustServices.map((s) => ({ Effect: 'Allow', Principal: { Service: s }, Action: 'sts:AssumeRole' })),
  }));
  writeFileSync(f('caller'), `${w.caller}\n`);
  writeFileSync(f('jobs.json'), JSON.stringify({ Jobs: w.jobs }));
  writeFileSync(f('describe'), `${w.describe.join('\n')}\n`);
  writeFileSync(f('reasons'), `${w.reasons}\n`);
  writeFileSync(f('keys.json'), JSON.stringify(w.keys));
  writeFileSync(f('status.tsv'), w.keys.map((k) => `${k}\t${w.status[k] ?? 'COMPLETED'}`).join('\n') + '\n');
  writeFileSync(f('present'), w.present.join('\n') + '\n');

  const aws = f('aws');
  writeFileSync(aws, [
    '#!/usr/bin/env bash',
    `F=${JSON.stringify(dir)}`,
    'printf "%s\\n" "aws $*" >> "$F/calls.log"',
    'bucket=""; key=""; query=""; prev=""',
    'for a in "$@"; do case "$prev" in --bucket) bucket="$a" ;; --key) key="$a" ;; --query) query="$a" ;; esac; prev="$a"; done',
    'case "$1 $2" in',
    '  "sts get-caller-identity") cat "$F/caller" ;;',
    '  "s3api get-bucket-replication") [[ -f "$F/replication.json" ]] || exit 254; cat "$F/replication.json" ;;',
    '  "iam get-role") jq . "$F/trust.json" ;;',
    '  "s3control list-jobs") cat "$F/jobs.json" ;;',
    '  "s3control create-job") printf "%s\\n" "$@" > "$F/create-args"; echo job-new-0001 ;;',
    '  "s3control describe-job")',
    '    if [[ "$query" == *FailureReasons* ]]; then cat "$F/reasons"; exit 0; fi',
    '    n=$(( $(cat "$F/polls" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$F/polls"',
    '    line="$(sed -n "${n}p" "$F/describe")"; [[ -n "$line" ]] || line="$(tail -n 1 "$F/describe")"',
    '    printf "%s\\n" "$line" ;;',
    '  "s3api list-objects-v2") cat "$F/keys.json" ;;',
    '  "s3api head-object")',
    `    if [[ "$bucket" == ${JSON.stringify(SRC)} ]]; then awk -F'\\t' -v k="$key" '$1==k{print $2; found=1} END{exit !found}' "$F/status.tsv"; exit $?; fi`,
    '    grep -qxF -- "$key" "$F/present" && echo "{}" && exit 0',
    '    exit 254 ;;',
    '  *) exit 64 ;;',
    'esac',
  ].join('\n'));
  chmodSync(aws, 0o755);

  const tf = f('terraform');
  writeFileSync(tf, [
    '#!/usr/bin/env bash',
    `F=${JSON.stringify(dir)}`,
    'case "$*" in',
    '  *"-json archive_bucket_name"*) cat "$F/archive" ;;',
    '  *"-json archive_dr_bucket_name"*) cat "$F/dest" ;;',
    '  *"-json archive_batch_replication_report"*) cat "$F/report" ;;',
    '  *) exit 1 ;;',
    'esac',
  ].join('\n'));
  chmodSync(tf, 0o755);

  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BACKFILL_REPLICATION_AWS_BIN: aws,
      BACKFILL_REPLICATION_TERRAFORM_BIN: tf,
      BACKFILL_REPLICATION_POLL_SECONDS: '0',
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function calls(): string {
  const p = join(dir, 'calls.log');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

/** The create-job arguments, flag to value. */
function createArgs(): Record<string, string> {
  const lines = readFileSync(join(dir, 'create-args'), 'utf8').split('\n');
  const out: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('--')) out[lines[i]] = lines[i + 1]?.startsWith('--') ? '' : lines[i + 1];
  }
  return out;
}

const STAGING = ['--target', 'staging', '--source', 'archive'];
const PRODUCTION = ['--target', 'production', '--source', 'archive'];

describe('backfilling replication', () => {
  it('creates one job that S3 can run and that copies only what is missing, then proves the copy', () => {
    // Defects caught: a job under a role the rule does not use, a manifest
    // that re-copies everything or nothing, or a report the role cannot write
    // would each fail inside S3 with the run reporting success.
    const res = run(STAGING, healthy());
    expect(res.status, res.stderr).toBe(0);
    const a = createArgs();
    expect(a['--role-arn']).toBe(ROLE);
    expect(a['--region']).toBe('us-east-1');
    expect(a['--account-id']).toBe(ACCOUNT);
    expect(JSON.parse(a['--operation'])).toEqual({ S3ReplicateObject: {} });
    const gen = JSON.parse(a['--manifest-generator']).S3JobManifestGenerator;
    expect(gen.SourceBucket).toBe(`arn:aws:s3:::${SRC}`);
    expect(gen.Filter).toEqual({ EligibleForReplication: true, ObjectReplicationStatuses: ['NONE', 'FAILED'] });
    expect(gen.EnableManifestOutput).toBe(true);
    expect(gen.ManifestOutputLocation.Bucket).toBe(`arn:aws:s3:::${LOGS}`);
    expect(gen.ManifestOutputLocation.ManifestPrefix).toMatch(/^batch-replication\//);
    const report = JSON.parse(a['--report']);
    expect(report.Bucket).toBe(`arn:aws:s3:::${LOGS}`);
    expect(report.Prefix).toMatch(/^batch-replication\//);
    expect(report.ReportScope).toBe('AllTasks');
    expect(report.Enabled).toBe(true);
    expect(report.Format).toBe('Report_CSV_20180820');
    expect(gen.ExpectedBucketOwner).toBe(ACCOUNT);
    expect(gen.ManifestOutputLocation.ExpectedManifestBucketOwner).toBe(ACCOUNT);
    expect(gen.ManifestOutputLocation.ManifestFormat).toBe('S3InventoryReport_CSV_20211130');
    // The description is how a re-run finds this job to resume it.
    expect(a['--description']).toBe('backfill-replication archive staging');
    expect(a).toHaveProperty('--no-confirmation-required');
    expect(res.stdout).toContain('Complete: 3 of 3 task(s) succeeded');
    expect(res.stdout).toContain(`3 sampled key(s) from ${SRC} are in ${DEST}`);
  });

  it('fails when a sampled key never reached the destination, even after a clean job', () => {
    // Defect caught: trusting the job's status alone would report a backfill
    // that left the recovery copy incomplete.
    const w = healthy();
    w.present = w.present.filter((k) => k !== 'members/a b.html');
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(`members/a b.html is missing from ${DEST}`);
  });

  it('fails when a sampled key reports anything but COMPLETED at the source', () => {
    // Defect caught: a key present in the destination as an older version while
    // its current version failed to replicate would pass a presence-only check.
    const w = healthy();
    w.status = { 'index.html': 'FAILED' };
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("index.html in footbag-env-archive reports replication status 'FAILED'");
  });

  it('samples across a large bucket rather than only its first keys', () => {
    // Defect caught: on a bucket of thousands of objects, sampling only the
    // first keys would miss a gap anywhere past them.
    const w = healthy();
    w.keys = Array.from({ length: 200 }, (_, i) => `page-${String(i).padStart(3, '0')}.html`);
    w.present = w.keys.filter((k) => k !== 'page-190.html');
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('page-190.html is missing from');
  });

  it('fails when the job was cancelled before it finished', () => {
    const w = healthy();
    w.describe = ['Cancelled\t3\t1\t0'];
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('was cancelled');
  });

  it('fails when the job completes with failed tasks, and says where the report is', () => {
    const w = healthy();
    w.describe = ['Complete\t3\t2\t1'];
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('completed with 1 failed task(s)');
    expect(res.stderr).toContain(`s3://${LOGS}/batch-replication/`);
  });

  it('treats a job S3 failed for finding nothing to copy as nothing left, judged on the sample', () => {
    // Defect caught: a re-run after a finished backfill would fail forever on
    // S3's empty-manifest refusal, or pass without looking at the copy.
    const w = healthy();
    w.describe = ['Failed\t0\t0\t0'];
    w.reasons = 'Manifest generation found no keys matching the filter criteria.';
    const ok = run(STAGING, w);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('nothing was missing');
    expect(ok.stdout).toContain('sampled key(s)');

    w.present = [];
    rmSync(join(dir, 'polls'), { force: true });
    const missing = run(STAGING, w);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('missing from');
  });

  it('fails on any other job failure, naming the reason', () => {
    const w = healthy();
    w.describe = ['Failed\t0\t0\t0'];
    w.reasons = 'The job report could not be written to your report bucket.';
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not be written to your report bucket');
  });

  it('refuses production with no terminal to type APPLY on, before creating anything', () => {
    // Defect caught: an unattended run creating a production job nobody confirmed.
    const res = run(PRODUCTION, healthy());
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no terminal to confirm on');
    expect(calls()).not.toContain('create-job');
  });

  it('refuses every identity but the operator user in this account, before creating anything', () => {
    // Defect caught: a dev-and-tester session, or the same user name in another
    // account, reaching the create call and failing there, or succeeding there.
    const assumed = healthy();
    assumed.caller = `arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/someone`;
    const r1 = run(STAGING, assumed);
    expect(r1.status).toBe(1);
    expect(r1.stderr).toContain('not the footbag-operator IAM user');
    expect(calls()).not.toContain('create-job');

    const otherAccount = healthy();
    otherAccount.caller = 'arn:aws:iam::111122223333:user/footbag-operator';
    const r2 = run(STAGING, otherAccount);
    expect(r2.status).toBe(1);
    expect(calls()).not.toContain('create-job');
  });

  it('refuses when the live rule replicates somewhere else', () => {
    // Defect caught: a batch job copies to whatever the rule names, so a rule
    // pointing elsewhere would fill the wrong bucket.
    const w = healthy();
    (w.replication as { ReplicationConfiguration: { Rules: Array<{ Destination: { Bucket: string } }> } })
      .ReplicationConfiguration.Rules[0].Destination.Bucket = 'arn:aws:s3:::somewhere-else';
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("replicates to 'arn:aws:s3:::somewhere-else'");
    expect(calls()).not.toContain('create-job');
  });

  it('judges the enabled rule, not a disabled one naming the right bucket', () => {
    const w = healthy();
    w.replication = {
      ReplicationConfiguration: {
        Role: ROLE,
        Rules: [
          { ID: 'old', Status: 'Disabled', Destination: { Bucket: `arn:aws:s3:::${DEST}` } },
          { ID: 'live', Status: 'Enabled', Destination: { Bucket: 'arn:aws:s3:::somewhere-else' } },
        ],
      },
    };
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(calls()).not.toContain('create-job');
  });

  it('refuses a source with no replication configuration', () => {
    const w = healthy();
    w.replication = null;
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('has no replication configuration');
    expect(calls()).not.toContain('create-job');
  });

  it('refuses when the role does not trust S3 Batch Operations', () => {
    // Defect caught: a job S3 accepts and then fails to start, because it
    // cannot assume the role, after the operator has walked away.
    const w = healthy();
    w.trustServices = ['s3.amazonaws.com'];
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not trust batchoperations.s3.amazonaws.com');
    expect(calls()).not.toContain('create-job');
  });

  it('refuses, without touching AWS, when the archive stack is off', () => {
    const w = healthy();
    w.archiveOutput = 'null';
    const res = run(STAGING, w);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('archive stack is off');
    expect(calls()).toBe('');
  });

  it('resumes an earlier run\'s unfinished job instead of starting a second', () => {
    // Defect caught: a re-run after an interrupt doubling the work and the
    // reports over the same objects.
    const w = healthy();
    w.jobs = [
      { JobId: 'job-other-0001', Description: 'something else' },
      { JobId: 'job-old-0001', Description: 'backfill-replication archive staging' },
    ];
    const res = run(STAGING, w);
    expect(res.status, res.stderr).toBe(0);
    expect(calls()).not.toContain('create-job');
    expect(calls()).toContain('describe-job --region us-east-1 --account-id 041904915126 --job-id job-old-0001');
  });

  it('creates nothing in a dry run, after every precondition has been checked', () => {
    const res = run(PRODUCTION.concat('--dry-run'), healthy());
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('every precondition holds; nothing created');
    expect(calls()).toContain('sts get-caller-identity');
    expect(calls()).not.toContain('create-job');
  });

  it('watches a named job and verifies it in status mode, creating nothing', () => {
    const res = run(STAGING.concat('--status', 'job-old-0001'), healthy());
    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toContain('--job-id job-old-0001');
    expect(calls()).not.toContain('create-job');
    expect(res.stdout).toContain('sampled key(s)');
  });

  it('refuses a missing target or an unknown source before any call, and announces the seams', () => {
    const noTarget = run(['--source', 'archive'], healthy());
    expect(noTarget.status).toBe(2);
    expect(noTarget.stderr).toContain('--target is required');

    const media = run(['--target', 'staging', '--source', 'media'], healthy());
    expect(media.status).toBe(2);
    expect(media.stderr).toContain("--source must be 'archive'");
    expect(calls()).toBe('');

    const res = run(STAGING.concat('--dry-run'), healthy());
    expect(res.stderr).toContain('TEST SEAM BACKFILL_REPLICATION_AWS_BIN is set');
  });
});
