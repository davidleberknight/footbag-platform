/**
 * scripts/terraform-apply.sh -- the canonical apply path for every environment
 * change that needs nothing but a plan read and a confirmation.
 *
 * A real run plans and applies against a live account, which no test can
 * exercise. What is pinned here is the handling of the saved plan, which is the
 * reason this script exists at all.
 *
 * Typed by hand, the convention's four commands end in a shred that a failure
 * never reaches: a failed plan, a failed apply or an interrupt all skip it, and
 * what survives in /tmp is a zip carrying a full copy of state with every
 * resolved value in the clear. So the tests that matter most here are the ones
 * asserting the plan file is gone afterwards, including on the failure paths,
 * and that the file applied is the file that was planned rather than a fresh
 * one computed at apply time.
 *
 * The terraform binary is pointed at a stub that records its arguments, so the
 * whole sequence runs without an account.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/terraform-apply.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let tmpDir: string;
let tfStub: string;
let callLog: string;
// Dropped by the stub's force-unlock so a later plan stops reporting the lock.
let unlockMarker: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'footbag-test-tfapply-'));
  tfStub = join(tmpDir, 'terraform-stub.sh');
  callLog = join(tmpDir, 'calls.log');
  unlockMarker = join(tmpDir, 'unlocked.marker');
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * A stand-in for Terraform. `plan -out` writes the file the script then applies,
 * so the saved-plan handling runs for real against a throwaway file.
 */
function writeTerraformStub(
  opts: {
    planFails?: boolean;
    applyFails?: boolean;
    lockHeldBy?: string;
    lockOperation?: string;
    lockCreated?: string;
    lockClearsAfterUnlock?: boolean;
  } = {},
): void {
  // A plan refused by the backend lock, reproduced as terraform emits it: the
  // 412 from the object store plus the Lock Info block, which carries the only
  // description of the holder the operator ever gets.
  const lockError = opts.lockHeldBy
    ? [
        '  echo "Error: Error acquiring the state lock" >&2',
        '  echo "api error PreconditionFailed: At least one of the pre-conditions you specified did not hold" >&2',
        '  echo "Lock Info:" >&2',
        '  echo "  ID:        db5207a9-4d80-8993-4c30-cdeb7e69020e" >&2',
        `  echo "  Operation: ${opts.lockOperation ?? 'OperationTypePlan'}" >&2`,
        `  echo "  Who:       ${opts.lockHeldBy}" >&2`,
        `  echo "  Created:   ${opts.lockCreated ?? '2026-09-11 23:58:55.754432017 +0000 UTC'}" >&2`,
        '  exit 1',
      ].join('\n')
    : '';
  // A held lock stays held until force-unlock drops the marker, so the mode's
  // verifying plan sees the same world its probing plan did unless the unlock
  // actually worked. That is the difference between proving the outcome and
  // trusting the exit status.
  const planArm = lockError
    ? [`if [ ! -e "${unlockMarker}" ]; then`, lockError, 'fi'].join('\n')
    : opts.planFails
      ? 'exit 1'
      : ':';
  writeFileSync(
    tfStub,
    [
      '#!/usr/bin/env bash',
      `echo "terraform $*" >> "${callLog}"`,
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    force-unlock)',
      opts.lockClearsAfterUnlock ? `      : > "${unlockMarker}"` : '      :',
      '      exit 0',
      '      ;;',
      '    plan)',
      planArm,
      '      ;;',
      `    apply) ${opts.applyFails ? 'exit 1' : ':'} ;;`,
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

function run(args: string[], withStub = true, extraEnv: NodeJS.ProcessEnv = {}): RunResult {
  rmSync(callLog, { force: true });
  rmSync(unlockMarker, { force: true });
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  if (withStub) env.TERRAFORM_APPLY_BIN = tfStub;
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

function plannedPath(): string {
  const line = calls().split('\n').find((l) => l.includes('-out='));
  expect(line, 'the run planned to a file').toBeTruthy();
  return line!.split('-out=')[1].trim();
}

describe('terraform-apply.sh: argument handling', () => {
  it('refuses to run without a target, rather than choosing an environment', () => {
    const res = run(['--dry-run'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--target is required/);
  });

  it('refuses an unknown environment name', () => {
    const res = run(['--target', 'prod', '--dry-run'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/must be 'staging', 'production' or 'shared'/);
  });

  it('accepts the shared tree, which owns the state bucket', () => {
    const res = run(['--target', 'shared', '--dry-run'], false);
    expect(res.exitCode).toBe(0);
  });

  it('refuses a step number outside the two steps it has', () => {
    const res = run(['--target', 'staging', '--from-step', '7'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/from-step takes a step number from 1 to 2/);
  });

  it('does not inherit the confirmation from the caller environment', () => {
    // An exported ASSUME_YES=yes must not stand in for the typed APPLY on a
    // production apply. The library assigns the variable unconditionally so no
    // caller can inherit it; this is the end-to-end proof through a real script.
    writeTerraformStub();
    const res = run(['--target', 'production'], true, { ASSUME_YES: 'yes' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    // Matched with surrounding whitespace: the plan file's own name carries
    // "apply", so a looser pattern hits the plan line and never fails.
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('refuses --yes on a production apply, because a flag is not a confirmation', () => {
    // The typed answer is what stands between a decision and replacing what the
    // public is served. A flag that supplies it in advance makes an unattended
    // production apply possible from a scheduled job, a wrapper or an agent
    // session, none of which can read the plan they are accepting.
    writeTerraformStub();
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--yes does not carry a production apply/);
  });

  it('refuses it before planning, so no copy of state is written to disk at all', () => {
    // The saved plan is a zip holding every resolved value in the clear. A
    // refusal at the prompt would still have produced one; this one lands first.
    writeTerraformStub();
    run(['--target', 'production', '--yes']);
    expect(calls(), 'terraform was never invoked').toBe('');
  });

  it('still previews production with --yes, since a dry run applies nothing', () => {
    writeTerraformStub();
    const res = run(['--target', 'production', '--dry-run', '--yes']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toBe('');
  });

  it('keeps --yes working for staging, which is the deliberate half of the split', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging', '--yes']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toMatch(/apply /);
  });
});

describe('terraform-apply.sh: breaking a stale state lock', () => {
  // Terraform's own force-unlock removes a lock unconditionally, which is the
  // wrong tool alone: a lock broken while a run is live lets two runs write state
  // at once, and the operator reaching for it has just been blocked and is least
  // placed to know which case they are in. So the four checks live in the script.
  const thisHost = spawnSync('hostname', { encoding: 'utf-8' }).stdout.trim();
  const OLD = '2026-09-11 23:58:55.754432017 +0000 UTC';

  const breakRun = (opts: Parameters<typeof writeTerraformStub>[0], procCount = '0') => {
    writeTerraformStub(opts);
    return run(['--target', 'staging', '--break-stale-lock'], true, {
      TERRAFORM_APPLY_PROC_COUNT: procCount,
    });
  };

  it('refuses when the state is not locked at all, rather than unlocking blind', () => {
    const res = breakRun({});
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/not locked, so there is nothing to break/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('refuses a lock held by another machine, and names the holder', () => {
    const res = breakRun({ lockHeldBy: 'julie@HER-LAPTOP', lockCreated: OLD });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/julie@HER-LAPTOP, not this machine/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('refuses a lock taken by an apply, since state may be partly written', () => {
    const res = breakRun({
      lockHeldBy: `someone@${thisHost}`,
      lockOperation: 'OperationTypeApply',
      lockCreated: OLD,
    });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/not a plan/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('refuses a lock younger than the staleness floor', () => {
    const justNow = new Date(Date.now() - 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '.000000000 +0000 UTC');
    const res = breakRun({ lockHeldBy: `someone@${thisHost}`, lockCreated: justNow });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/under the 30-minute floor/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('refuses while a terraform is running on this machine', () => {
    const res = breakRun({ lockHeldBy: `someone@${thisHost}`, lockCreated: OLD }, '1');
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/terraform process\(es\) are running on this machine/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('refuses an unreadable timestamp, because unknown is not old', () => {
    const res = breakRun({ lockHeldBy: `someone@${thisHost}`, lockCreated: 'not a date at all' });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/age is unknown/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('asks for the typed word even on staging, which applies without one', () => {
    // Staging's silence is about disposable data. A lock is not data, and what
    // this mode removes is not staging's to throw away.
    const res = breakRun({ lockHeldBy: `someone@${thisHost}`, lockCreated: OLD });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('reaches force-unlock only once every check passes and the word is given', () => {
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}`, lockCreated: OLD, lockClearsAfterUnlock: true });
    const res = run(['--target', 'staging', '--break-stale-lock', '--yes'], true, {
      TERRAFORM_APPLY_PROC_COUNT: '0',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(calls()).toMatch(/force-unlock -force db5207a9-4d80-8993-4c30-cdeb7e69020e/);
  });

  it('proves the lock is gone by planning again, not by the unlock exit status', () => {
    // force-unlock exiting zero is not the lock being gone. A stub that keeps
    // reporting the lock afterwards must fail the run.
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}`, lockCreated: OLD });
    const res = run(['--target', 'staging', '--break-stale-lock', '--yes'], true, {
      TERRAFORM_APPLY_PROC_COUNT: '0',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/still locked/);
  });
});

describe('terraform-apply.sh: which environments stop for a typed confirmation', () => {
  // Staging is the only one that does not. The typed word is not a receipt that a
  // plan was read; it is what stands between a decision and replacing what the
  // public is served. Asking for it on every staging iteration is what teaches an
  // operator to answer prompts without reading them, which spends the word on the
  // trees where it has to mean something. All three environments are asserted
  // here rather than two, so the split is pinned and not inferred.

  it('applies staging with no confirmation and no terminal attached', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toMatch(/apply /);
    expect(res.stdout).not.toMatch(/Type 'APPLY'/);
  });

  it('still prints the whole-environment warning on staging, since the reading is the point', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging']);
    expect(res.stdout).toMatch(/covers this whole environment/);
  });

  it('refuses a production apply with no terminal to type the word on', () => {
    writeTerraformStub();
    const res = run(['--target', 'production']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('refuses a shared apply too, because it holds every environment\'s state', () => {
    // The tree that owns the state bucket is not staging-shaped: the other two
    // trees need it to exist at all, so it falls on production's side of the line.
    writeTerraformStub();
    const res = run(['--target', 'shared']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });
});

describe('terraform-apply.sh: a state lock refusing the plan', () => {
  // A stranded lock reaches the operator as a 412 PreconditionFailed on a
  // PutObject, which names neither the lock nor the remedy, and the generic
  // "plan failed" line sends them hunting for a fault in their own change. The
  // report turns the holder, the operation and the age into a decision, and it
  // lands before any apply has been offered.
  const thisHost = spawnSync('hostname', { encoding: 'utf-8' }).stdout.trim();

  it('names the holder, the operation and how old the lock is', () => {
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}` });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/The state is locked/);
    expect(res.stderr).toMatch(new RegExp(`held by\\s+someone@${thisHost}`));
    expect(res.stderr).toMatch(/operation\s+OperationTypePlan/);
    expect(res.stderr).toMatch(/taken\s+2026-09-11 23:58:55/);
  });

  it('offers the remedy when this machine holds it and no terraform runs here', () => {
    // The remedy is the script's own checked mode, not a raw force-unlock: the
    // four things that decide whether breaking is safe belong in the script.
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}` });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(res.stderr).toMatch(/--break-stale-lock/);
    expect(res.stderr).toMatch(/--from-step 2/);
  });

  it('tells the operator to wait when a terraform is live on this machine', () => {
    // The lock naming this machine is not on its own a dead process. Advising a
    // break here would have the operator destroy their own running plan's lock.
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}` });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '1' });
    expect(res.stderr).toMatch(/do not break it/);
    expect(res.stderr).not.toMatch(/force-unlock/);
  });

  it('never offers to break a lock held by another machine', () => {
    // Whether breaking a lock is safe turns on the holding process being dead,
    // and only the holder's own machine can answer that.
    writeTerraformStub({ lockHeldBy: 'julie@HER-LAPTOP' });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(res.stderr).toMatch(/names another machine/);
    expect(res.stderr).not.toMatch(/force-unlock/);
  });

  it('warns that state may be part-written when the held operation is an apply', () => {
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}`, lockOperation: 'OperationTypeApply' });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(res.stderr).toMatch(/state may be part/);
  });

  it('applies nothing, and leaves no copy of the plan behind', () => {
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}` });
    run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(calls()).not.toMatch(/\sapply\s/);
    expect(existsSync(plannedPath()), 'the saved plan was shredded').toBe(false);
  });

  it('keeps the generic message for a plan that failed for any other reason', () => {
    writeTerraformStub({ planFails: true });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(res.stderr).toMatch(/terraform plan failed/);
    expect(res.stderr).not.toMatch(/The state is locked/);
  });
});

describe('terraform-apply.sh: the preview', () => {
  it('runs nothing at all', () => {
    const res = run(['--target', 'staging', '--dry-run']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toBe('');
  });

  it('warns that the plan covers the whole environment, not just the change in hand', () => {
    const res = run(['--target', 'staging', '--dry-run']);
    expect(res.stdout).toMatch(/covers the whole environment/);
  });

  it('says how to ask for an init rather than silently skipping one', () => {
    expect(run(['--target', 'staging', '--dry-run']).stdout).toMatch(/pass --init/);
    expect(run(['--target', 'staging', '--dry-run', '--init']).stdout).toMatch(/init/);
  });
});

describe('terraform-apply.sh: the saved plan', () => {
  it('applies the file it planned, rather than replanning at apply time', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging', '--yes']);
    expect(res.exitCode).toBe(0);
    const applyLine = calls().split('\n').find((l) => /apply \//.test(l));
    expect(applyLine, 'the run applied a file').toBeTruthy();
    expect(applyLine).toContain(plannedPath());
  });

  it('leaves no plan file behind on a clean run', () => {
    writeTerraformStub();
    run(['--target', 'staging', '--yes']);
    expect(existsSync(plannedPath()), 'the plan file was shredded').toBe(false);
  });

  it('leaves no plan file behind when the plan itself fails', () => {
    writeTerraformStub({ planFails: true });
    const res = run(['--target', 'staging', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/terraform plan failed. Nothing was applied/);
    expect(existsSync(plannedPath()), 'the trap shredded the plan').toBe(false);
  });

  it('leaves no plan file behind when the apply fails', () => {
    writeTerraformStub({ applyFails: true });
    const res = run(['--target', 'staging', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/terraform apply failed/);
    expect(existsSync(plannedPath()), 'the trap shredded the plan').toBe(false);
  });

  it('names the resume point on every failure, so a part-way run is recoverable', () => {
    writeTerraformStub({ planFails: true });
    expect(run(['--target', 'staging', '--yes']).stderr).toMatch(/--from-step 2/);
    writeTerraformStub({ applyFails: true });
    expect(run(['--target', 'staging', '--yes']).stderr).toMatch(/--from-step 2/);
  });

  it('refuses a production apply with no terminal, rather than applying unconfirmed', () => {
    // Production is where this property lives, and it cannot be satisfied by a
    // flag: no scheduled job, wrapper or agent session replaces what the public
    // is served without a person at a terminal.
    writeTerraformStub();
    const res = run(['--target', 'production']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    // Matched on the subcommand, not the word: the plan file is itself named
    // footbag-<env>-apply, so a looser pattern matches the plan line too.
    expect(calls()).not.toMatch(/ apply \//);
    expect(existsSync(plannedPath()), 'the plan file was shredded on the abort').toBe(false);
  });
});

describe('terraform-apply.sh: init', () => {
  it('does not init unless asked', () => {
    writeTerraformStub();
    run(['--target', 'staging', '--yes']);
    expect(calls()).not.toMatch(/terraform .*init/);
  });

  it('inits when asked, before planning', () => {
    writeTerraformStub();
    run(['--target', 'staging', '--init', '--yes']);
    const log = calls();
    expect(log).toMatch(/terraform .*init/);
    expect(log.indexOf('init')).toBeLessThan(log.indexOf('plan'));
  });

  it('passes -upgrade only for the upgrade form', () => {
    writeTerraformStub();
    run(['--target', 'staging', '--init', '--yes']);
    expect(calls()).not.toMatch(/-upgrade/);
    writeTerraformStub();
    run(['--target', 'staging', '--init-upgrade', '--yes']);
    expect(calls()).toMatch(/-upgrade/);
  });
});

describe('terraform-apply.sh: the test seam', () => {
  it('announces the stub, so a stubbed run is never mistaken for a real one', () => {
    writeTerraformStub();
    expect(run(['--target', 'staging', '--dry-run']).stderr)
      .toMatch(/SYNTHETIC:.*proves nothing about the estate/);
  });
});
