/**
 * scripts/apply-snapshot-retention.sh -- applying the snapshot retention tiers,
 * and on production the tier-scoped cross-region replication, to one
 * environment.
 *
 * A real run plans and applies Terraform against a live account, which no test
 * can exercise. What is pinned here is everything that decides whether the run
 * is safe before any of that happens, and one thing above the rest: the gate
 * that refuses to apply until the promoted tiers hold history.
 *
 * That gate is the reason the script exists. The routine/ rule in this change
 * expires at two days, so applying it while hourly/ and daily/ are still filling
 * deletes the fine-grained stream with nothing yet written to replace it, and
 * the recovery window collapses from a month to two days while every alarm stays
 * green. A gate that can be skipped, or that passes when a tier holds a single
 * point, is the same as no gate, so both directions are asserted here.
 *
 * The two external commands are pointed at stubs so the whole sequence runs
 * without an account. The stubs also record their arguments, which is how the
 * ordering assertions know the gate was consulted before the plan rather than
 * beside it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/apply-snapshot-retention.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let tmpDir: string;
let awsStub: string;
let tfStub: string;
let callLog: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'footbag-test-retention-'));
  awsStub = join(tmpDir, 'aws-stub.sh');
  tfStub = join(tmpDir, 'terraform-stub.sh');
  callLog = join(tmpDir, 'calls.log');
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * A stand-in for the AWS CLI. The two tier counts are injected, so a test can
 * put the bucket in the state it wants to assert against; everything else
 * answers with the shape the real command returns.
 */
function writeAwsStub(hourly: number, daily: number): void {
  writeFileSync(
    awsStub,
    [
      '#!/usr/bin/env bash',
      `echo "aws $*" >> "${callLog}"`,
      'case "$*" in',
      `  *list-objects-v2*hourly/*) echo "${hourly}" ;;`,
      `  *list-objects-v2*daily/*)  echo "${daily}" ;;`,
      '  *get-bucket-lifecycle-configuration*-dr*|*-dr*get-bucket-lifecycle-configuration*)',
      '    printf "expire-dr-routine-stream\\tEnabled\\troutine/\\t90\\n"',
      '    printf "expire-dr-hourly-tier\\tEnabled\\thourly/\\t90\\n"',
      '    printf "expire-dr-daily-tier\\tEnabled\\tdaily/\\t90\\n" ;;',
      '  *get-bucket-lifecycle-configuration*)',
      '    printf "expire-routine-stream\\tEnabled\\troutine/\\t2\\n"',
      '    printf "expire-hourly-tier\\tEnabled\\thourly/\\t30\\n"',
      '    printf "expire-daily-tier\\tEnabled\\tdaily/\\t400\\n" ;;',
      '  *get-bucket-replication*)',
      '    printf "replicate-hourly-tier-to-dr\\tEnabled\\thourly/\\n"',
      '    printf "replicate-daily-tier-to-dr\\tEnabled\\tdaily/\\n" ;;',
      '  *describe-alarms*)',
      '    printf "footbag-production-snapshots-replication-failed\\tINSUFFICIENT_DATA\\n" ;;',
      '  *) echo "" ;;',
      'esac',
      'exit 0',
    ].join('\n') + '\n',
  );
  chmodSync(awsStub, 0o755);
}

/**
 * A stand-in for Terraform. `plan -out` writes the file the script then applies,
 * so the saved-plan handling (create, apply that exact file, shred it) runs for
 * real against a throwaway file.
 */
function writeTerraformStub(planShouldFail = false): void {
  writeFileSync(
    tfStub,
    [
      '#!/usr/bin/env bash',
      `echo "terraform $*" >> "${callLog}"`,
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    dr_bucket_name)        echo "footbag-test-snapshots-dr"; exit 0 ;;',
      '    snapshots_bucket_name) echo "footbag-test-snapshots";    exit 0 ;;',
      `    plan)   ${planShouldFail ? 'exit 1' : ':'} ;;`,
      '  esac',
      'done',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    -out=*) printf "saved-plan-body" > "${arg#-out=}" ;;',
      '  esac',
      'done',
      'exit 0',
    ].join('\n') + '\n',
  );
  chmodSync(tfStub, 0o755);
}

function run(args: string[], withStubs = true): RunResult {
  rmSync(callLog, { force: true });
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (withStubs) {
    env.RETENTION_AWS_BIN = awsStub;
    env.RETENTION_TERRAFORM_BIN = tfStub;
  }
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env,
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function calls(): string {
  return existsSync(callLog) ? readFileSync(callLog, 'utf-8') : '';
}

describe('apply-snapshot-retention.sh: argument handling', () => {
  it('refuses to run without a target, rather than choosing an environment', () => {
    const res = run(['--dry-run'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--target is required/);
  });

  it('refuses an unknown environment name', () => {
    const res = run(['--target', 'prod', '--dry-run'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/must be 'staging' or 'production'/);
  });

  it('refuses a step number outside the three steps it has', () => {
    const res = run(['--target', 'staging', '--from-step', '9'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/from-step takes a step number from 1 to 3/);
  });

  it('refuses --dry-run and --verify together, naming what each does', () => {
    const res = run(['--target', 'staging', '--dry-run', '--verify'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--dry-run states what a run would do/);
    expect(res.stderr).toMatch(/--verify reads the deployed state/);
  });
});

describe('apply-snapshot-retention.sh: the preview', () => {
  it('reads nothing and applies nothing', () => {
    const res = run(['--target', 'production', '--dry-run']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toBe('');
  });

  it('states the tier gate first, with the loss it prevents', () => {
    const res = run(['--target', 'production', '--dry-run']);
    expect(res.stdout).toMatch(/1\..*hourly\/ and daily\/ each hold more than one object/s);
    expect(res.stdout).toMatch(/two-day routine\/ rule deletes the fine-grained/);
  });

  it('describes replication on production and its absence on staging', () => {
    expect(run(['--target', 'production', '--dry-run']).stdout)
      .toMatch(/scoped to hourly\/ and daily\//);
    expect(run(['--target', 'staging', '--dry-run']).stdout)
      .toMatch(/Staging has no snapshot/);
  });
});

describe('apply-snapshot-retention.sh: the tier-history gate', () => {
  beforeAll(() => writeTerraformStub());

  it('refuses when the daily tier holds a single point, and never reaches the plan', () => {
    writeAwsStub(5, 1);
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/REFUSING: the promoted tiers do not hold history yet/);
    expect(res.stderr).toMatch(/collapse from a month to two days/);
    expect(calls()).not.toMatch(/terraform .*plan/);
  });

  it('refuses when the hourly tier is empty', () => {
    writeAwsStub(0, 5);
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(calls()).not.toMatch(/terraform .*plan/);
  });

  it('says a stalled producer looks the same, so the wait is not assumed to end', () => {
    writeAwsStub(1, 1);
    expect(run(['--target', 'production', '--yes']).stderr)
      .toMatch(/stalled producer looks exactly like this/);
  });

  it('proceeds to the plan once both tiers hold history', () => {
    writeAwsStub(2, 2);
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toMatch(/terraform .*plan/);
  });

  it('consults both tiers before planning, not one', () => {
    writeAwsStub(2, 2);
    run(['--target', 'production', '--yes']);
    const log = calls();
    const planAt = log.indexOf('terraform -chdir');
    expect(log).toMatch(/hourly\//);
    expect(log).toMatch(/daily\//);
    expect(log.indexOf('hourly/')).toBeLessThan(log.lastIndexOf('plan'));
    expect(planAt).toBeGreaterThan(-1);
  });
});

describe('apply-snapshot-retention.sh: the saved plan', () => {
  it('applies the plan file it wrote, rather than replanning at apply time', () => {
    writeAwsStub(2, 2);
    writeTerraformStub();
    run(['--target', 'production', '--yes']);
    const log = calls();
    const planLine = log.split('\n').find((l) => l.includes('plan -out='));
    const applyLine = log.split('\n').find((l) => /terraform .*apply \//.test(l));
    expect(planLine, 'the run planned to a file').toBeTruthy();
    const planPath = planLine!.split('-out=')[1].trim();
    expect(applyLine, 'the run applied a file').toBeTruthy();
    expect(applyLine).toContain(planPath);
  });

  it('leaves no plan file behind, including when the plan itself fails', () => {
    writeAwsStub(2, 2);
    writeTerraformStub(true);
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/terraform plan failed. Nothing was applied/);
    const planLine = calls().split('\n').find((l) => l.includes('plan -out='));
    const planPath = planLine!.split('-out=')[1].trim();
    expect(existsSync(planPath), 'the plan file was shredded by the trap').toBe(false);
  });
});

describe('apply-snapshot-retention.sh: verification', () => {
  beforeAll(() => {
    writeAwsStub(2, 2);
    writeTerraformStub();
  });

  it('applies nothing under --verify', () => {
    const res = run(['--target', 'production', '--verify']);
    expect(res.exitCode).toBe(0);
    expect(calls()).not.toMatch(/terraform .*apply/);
  });

  it('reports the three tier rules as present', () => {
    const res = run(['--target', 'production', '--verify']);
    expect(res.stdout).toMatch(/All three tier rules are present/);
  });

  it('reads insufficient-data as expected straight after an apply, not as a pass', () => {
    const res = run(['--target', 'production', '--verify']);
    expect(res.stdout).toMatch(/INSUFFICIENT_DATA/);
    expect(res.stdout).toMatch(/dimensions that never matched/);
  });

  it('reads the disaster-recovery bucket, not only the primary', () => {
    const res = run(['--target', 'production', '--verify']);
    // The windows that have to match the Object Lock live on the replica, so a
    // verification that reads only the primary cannot see the rule that matters.
    expect(res.stdout).toMatch(/footbag-test-snapshots-dr/);
    expect(res.stdout).toMatch(/expire-dr-daily-tier/);
    expect(res.stdout).toMatch(/same window as the lock/);
  });

  it('does not look for snapshot replication on staging', () => {
    const res = run(['--target', 'staging', '--verify']);
    expect(res.exitCode).toBe(0);
    expect(calls()).not.toMatch(/get-bucket-replication/);
  });
});

describe('apply-snapshot-retention.sh: the test seams', () => {
  it('announces the stubs, so a stubbed run is never mistaken for a real one', () => {
    writeAwsStub(2, 2);
    writeTerraformStub();
    expect(run(['--target', 'production', '--verify']).stderr)
      .toMatch(/SYNTHETIC:.*proves nothing about the estate/);
  });
});
