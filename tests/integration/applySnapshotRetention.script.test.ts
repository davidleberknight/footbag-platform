/**
 * scripts/apply-snapshot-retention.sh -- applying the snapshot retention generations,
 * and on production the generation-scoped cross-region replication, to one
 * environment.
 *
 * A real run plans and applies Terraform against a live account, which no test
 * can exercise. What is pinned here is everything that decides whether the run
 * is safe before any of that happens, and one thing above the rest: the gate
 * that refuses to apply until the promoted generations hold history.
 *
 * That gate is the reason the script exists. The routine/ rule in this change
 * expires at two days, so applying it while hourly/ and daily/ are still filling
 * deletes the fine-grained stream with nothing yet written to replace it, and
 * the recovery window collapses from a month to two days while every alarm stays
 * green. A gate that can be skipped, or that passes when a generation holds a single
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
 * What the stand-in AWS CLI should report, beyond the two generation counts.
 * Every field defaults to the healthy, fully-applied estate, so a test names only
 * the one thing it is putting wrong.
 */
interface AwsStubOptions {
  /** How old the newest object in each generation is. 0 = just now. */
  hourlyAgeHours: number;
  dailyAgeHours: number;
  /** The timestamp read comes back empty, as an unreadable listing would. */
  ageUnreadable: boolean;
  /** 'unfiltered' is the pre-change rule the apply was supposed to replace. */
  replication: 'scoped' | 'unfiltered' | 'none' | 'scoped-disabled';
  /** 'daily-disabled' is a rule that exists and expires nothing. */
  generationRules: 'all' | 'missing-daily' | 'daily-disabled';
  alarms: 'present' | 'none';
}

/**
 * A stand-in for the AWS CLI. The two generation counts stay positional because
 * every gate test turns on them; everything else arrives in the options above and
 * answers with the shape the real command returns.
 *
 * The age read and the count read are the same subcommand against the same prefix
 * and are told apart by the query: only the age read asks for LastModified. A stub
 * that answered both with the count would hand the script a bare integer where it
 * expects a timestamp, and GNU date parses a bare integer as a day of the current
 * month rather than refusing, which would make a stale-generation test pass for
 * the wrong reason.
 */
function writeAwsStub(hourly: number, daily: number, opts: Partial<AwsStubOptions> = {}): void {
  const o: AwsStubOptions = {
    hourlyAgeHours: 0,
    dailyAgeHours: 0,
    ageUnreadable: false,
    replication: 'scoped',
    generationRules: 'all',
    alarms: 'present',
    ...opts,
  };
  const stamp = (ageHours: number): string =>
    o.ageUnreadable ? 'echo ""' : `date -u -d "-${ageHours} hours" +%Y-%m-%dT%H:%M:%S+00:00`;
  const replicationCase =
    o.replication === 'none'
      ? ['    echo "" ;;']
      : o.replication === 'unfiltered'
        ? ['    printf "replicate-snapshots-to-dr\\tEnabled\\tNone\\n" ;;']
        : o.replication === 'scoped-disabled'
          ? [
              '    printf "replicate-hourly-tier-to-dr\\tDisabled\\thourly/\\n"',
              '    printf "replicate-daily-tier-to-dr\\tDisabled\\tdaily/\\n" ;;',
            ]
          : [
              '    printf "replicate-hourly-tier-to-dr\\tEnabled\\thourly/\\n"',
              '    printf "replicate-daily-tier-to-dr\\tEnabled\\tdaily/\\n" ;;',
            ];
  writeFileSync(
    awsStub,
    [
      '#!/usr/bin/env bash',
      `echo "aws $*" >> "${callLog}"`,
      'case "$*" in',
      // The age reads first: they carry the prefix too, so the count patterns
      // below would otherwise swallow them.
      `  *hourly/*LastModified*|*LastModified*hourly/*) ${stamp(o.hourlyAgeHours)} ;;`,
      `  *daily/*LastModified*|*LastModified*daily/*)   ${stamp(o.dailyAgeHours)} ;;`,
      `  *list-objects-v2*hourly/*) echo "${hourly}" ;;`,
      `  *list-objects-v2*daily/*)  echo "${daily}" ;;`,
      '  *get-bucket-lifecycle-configuration*-dr*|*-dr*get-bucket-lifecycle-configuration*)',
      '    printf "expire-dr-routine-stream\\tEnabled\\troutine/\\t90\\n"',
      '    printf "expire-dr-hourly-tier\\tEnabled\\thourly/\\t90\\n"',
      '    printf "expire-dr-daily-tier\\tEnabled\\tdaily/\\t90\\n" ;;',
      '  *get-bucket-lifecycle-configuration*)',
      '    printf "expire-routine-stream\\tEnabled\\troutine/\\t2\\n"',
      '    printf "expire-hourly-tier\\tEnabled\\thourly/\\t30\\n"',
      ...(o.generationRules === 'all'
        ? ['    printf "expire-daily-tier\\tEnabled\\tdaily/\\t400\\n" ;;']
        : o.generationRules === 'daily-disabled'
          ? ['    printf "expire-daily-tier\\tDisabled\\tdaily/\\t400\\n" ;;']
          : ['    ;;']),
      '  *get-bucket-replication*)',
      ...replicationCase,
      '  *describe-alarms*)',
      ...(o.alarms === 'present'
        ? ['    printf "footbag-production-snapshots-replication-failed\\tINSUFFICIENT_DATA\\n" ;;']
        : ['    echo "" ;;']),
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
 *
 * It also answers the outputs the script reads, including whether this
 * environment arms the replication alarms. That answer belongs here rather than
 * in a file on disk: the environment's real values are not committed, so a run
 * that read them would answer one way on a maintainer's workstation and another
 * on a clean checkout, and every assertion below would hold in one place and not
 * the other. `unpublished` is the tree that has not been applied since the output
 * was added, which is the case the script must refuse rather than pass.
 */
function writeTerraformStub(
  planShouldFail = false,
  replicationAlarm: boolean | 'unpublished' = true,
): void {
  const alarmOutput =
    replicationAlarm === 'unpublished'
      ? '    replication_alarm_enabled) exit 1 ;;'
      : `    replication_alarm_enabled) echo "${replicationAlarm}"; exit 0 ;;`;
  writeFileSync(
    tfStub,
    [
      '#!/usr/bin/env bash',
      `echo "terraform $*" >> "${callLog}"`,
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    dr_bucket_name)        echo "footbag-test-snapshots-dr"; exit 0 ;;',
      '    snapshots_bucket_name) echo "footbag-test-snapshots";    exit 0 ;;',
      alarmOutput,
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

  it('states the generation gate first, with the loss it prevents', () => {
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

describe('apply-snapshot-retention.sh: the generation-history gate', () => {
  beforeAll(() => writeTerraformStub());

  it('refuses when the daily generation holds a single point, and never reaches the plan', () => {
    writeAwsStub(5, 1);
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/REFUSING: the promoted generations do not hold history yet/);
    expect(res.stderr).toMatch(/collapse from a month to two days/);
    expect(calls()).not.toMatch(/terraform .*plan/);
  });

  it('refuses when the hourly generation is empty', () => {
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

  it('still runs the gate when the operator resumes at the apply step', () => {
    // The header says there is no flag to skip this gate, and there was one:
    // --from-step 2 is accepted by the argument validator and recommended by
    // the script's own resume hint after a failed plan, and it went straight to
    // the apply. Skipping it applies the two-day routine rule with no fallback
    // history, which is the one irreversible mistake available here.
    writeAwsStub(1, 1);
    const res = run(['--target', 'production', '--from-step', '2', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/REFUSING: the promoted generations do not hold history yet/);
    expect(calls()).not.toMatch(/terraform .*plan/);
  });

  it('proceeds to the plan once both generations hold history', () => {
    writeAwsStub(2, 2);
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toMatch(/terraform .*plan/);
  });

  it('refuses a populated hourly/ whose newest promotion is older than the cadence', () => {
    // Counting alone cleared this: two objects promoted by a producer that
    // stopped satisfy the count and describe a host where the two-day routine/
    // rule still collapses the recovery window.
    writeAwsStub(2, 2, { hourlyAgeHours: 9 });
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/REFUSING: both generations hold history, but it has stopped being added to/);
    expect(res.stderr).toMatch(/newest hourly\/ object: 9h old \(allowed: 3h\)/);
    expect(calls()).not.toMatch(/terraform .*plan/);
  });

  it('refuses a stale daily/ as well, not only a stale hourly/', () => {
    writeAwsStub(2, 2, { dailyAgeHours: 100 });
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/newest daily\/  object: 100h old \(allowed: 48h\)/);
    expect(calls()).not.toMatch(/terraform .*plan/);
  });

  it('tolerates one missed promotion in each generation, so a late run is not a stall', () => {
    // 3h and 48h are one missed hourly promotion and one missed daily one. The
    // gate refuses a stall, not a producer that ran late.
    writeAwsStub(2, 2, { hourlyAgeHours: 3, dailyAgeHours: 48 });
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toMatch(/terraform .*plan/);
  });

  it('refuses rather than guesses when the promotion timestamps cannot be read', () => {
    writeAwsStub(2, 2, { ageUnreadable: true });
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/could not establish how old the newest promoted snapshots are/);
    expect(calls()).not.toMatch(/terraform .*plan/);
  });

  it('reads the age from the whole prefix, not from the two keys the count caps at', () => {
    // --max-keys 2 returns the lexicographically first two keys, so the newest
    // object is not in that listing. The age read must be its own unbounded call.
    writeAwsStub(2, 2);
    run(['--target', 'production', '--yes']);
    const ageCalls = calls()
      .split('\n')
      .filter((l) => l.includes('LastModified'));
    expect(ageCalls.length, 'one age read per generation').toBe(2);
    for (const line of ageCalls) {
      expect(line).not.toMatch(/--max-keys/);
    }
  });

  it('consults both generations before planning, not one', () => {
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

  it('reports the three generation rules as present', () => {
    const res = run(['--target', 'production', '--verify']);
    expect(res.stdout).toMatch(/All three generation rules are present/);
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

  it('fails the run on an unfiltered replication rule, rather than describing one', () => {
    // The step used to print "the change did not land" and exit 0. An unfiltered
    // rule keeps replicating the two-day routine/ stream this change narrows away,
    // so the verdict has to be carried by the exit status.
    writeAwsStub(2, 2, { replication: 'unfiltered' });
    const res = run(['--target', 'production', '--verify']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toMatch(/UNFILTERED replication rule still in place:\s+replicate-snapshots-to-dr/);
    expect(res.stderr).toMatch(/VERIFICATION FAILED on production/);
  });

  it('fails the run when a generation rule is missing', () => {
    writeAwsStub(2, 2, { generationRules: 'missing-daily' });
    const res = run(['--target', 'production', '--verify']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toMatch(/MISSING generation rules:\s+expire-daily-tier/);
  });

  it('fails the run when a generation rule is present but Disabled', () => {
    // Present is not in effect. The id check read the listing's first column and
    // never the Status beside it, so a rule that expires nothing reported as
    // landed and the run exited 0.
    writeAwsStub(2, 2, { generationRules: 'daily-disabled' });
    const res = run(['--target', 'production', '--verify']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toMatch(/NOT ENABLED generation rules:\s+expire-daily-tier/);
    expect(res.stdout).toMatch(/A Disabled rule expires nothing/);
    expect(res.stderr).toMatch(/VERIFICATION FAILED on production/);
  });

  it('fails the run when the scoped replication rules are present but Disabled', () => {
    // The loop printed NOT ENABLED and carried on, so the operator was told to
    // look for a problem the exit code denied.
    writeAwsStub(2, 2, { replication: 'scoped-disabled' });
    const res = run(['--target', 'production', '--verify']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toMatch(/NOT ENABLED: rule 'replicate-hourly-tier-to-dr' is 'Disabled'/);
    expect(res.stderr).toMatch(/VERIFICATION FAILED on production/);
  });

  it('fails the run when production reports no replication configuration at all', () => {
    writeAwsStub(2, 2, { replication: 'none' });
    const res = run(['--target', 'production', '--verify']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toMatch(/this run cannot prove the scope/);
  });

  it('fails the run when production declares the replication alarm and none exists', () => {
    writeAwsStub(2, 2, { alarms: 'none' });
    writeTerraformStub(false, true);
    const res = run(['--target', 'production', '--verify']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toMatch(/enable_replication_alarm = true, so an alarm should/);
  });

  it('passes when no alarm exists and the environment declares none', () => {
    // The flag is the whole reason a missing alarm can be read either way. With it
    // off, the absence is the intended estate and there is nothing to prove.
    writeAwsStub(2, 2, { alarms: 'none' });
    writeTerraformStub(false, false);
    const res = run(['--target', 'production', '--verify']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/enable_replication_alarm = false, so no alarm is/);
  });

  it('fails the run when the tree does not publish the flag, rather than passing on its behalf', () => {
    // A verification that cannot read what it is checking against has proved
    // nothing, and nothing is not a pass. The remedy is named so the operator is
    // not left to work out why the run refused.
    writeAwsStub(2, 2, { alarms: 'none' });
    writeTerraformStub(false, 'unpublished');
    const res = run(['--target', 'production', '--verify']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toMatch(/does not publish replication_alarm_enabled/);
    expect(res.stdout).toMatch(/Apply that tree so the output lands in state/);
    expect(res.stderr).toMatch(/VERIFICATION FAILED on production/);
    writeTerraformStub();
  });

  it('never fails on an alarm state, because insufficient data after an apply is correct', () => {
    // The whole alarm section is a read-out. A run whose only unusual reading is
    // INSUFFICIENT_DATA passes, and says so.
    writeAwsStub(2, 2);
    const res = run(['--target', 'production', '--verify']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/INSUFFICIENT_DATA/);
    expect(res.stdout).toMatch(/read-out and are not part of that verdict/);
  });

  it('does not hold staging to the alarm assertion, whose subject is not this change', () => {
    // Staging has no snapshot disaster-recovery bucket, so the alarms its flag
    // governs belong to other replication and are not this script's to fail on.
    writeAwsStub(2, 2, { alarms: 'none' });
    const res = run(['--target', 'staging', '--verify']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/this change arms no alarm here; nothing is wrong/);
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
