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
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  chmodSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

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
    /**
     * What `terraform show -json <plan>` answers, as the resource_changes array.
     * The DNS gate reads the saved plan through this, so a fixture here is the
     * only way to drive it: the gate refuses on what the plan CONTAINS, not on
     * which environment the run named.
     */
    planResourceChanges?: Array<{ type: string; address: string; actions: string[] }>;
    /**
     * Make `terraform show -json <plan>` fail. The gate reads the plan through
     * that call, so this is the only way to reach the branch where it cannot
     * see the plan at all — which is the case it exists for, because the reads
     * used to swallow their own failure and yield an empty answer the gate
     * could not tell apart from "no DNS in this plan".
     */
    showFails?: boolean;
    /**
     * Make `terraform show -json <plan>` write a line to its error stream while
     * still succeeding and still emitting a valid plan. Terraform does this on
     * ordinary successful runs: a provider deprecation notice, or the
     * development-overrides warning that prints on every command when a
     * workstation carries a dev_overrides block. A warning is not a failure, and
     * a gate that treats it as one cannot be applied around.
     */
    showWarnsOnStderr?: string;
  } = {},
): void {
  // A plan refused by the backend lock, reproduced as terraform emits it: the
  // 412 from the object store plus the Lock Info block, which carries the only
  // description of the holder the operator ever gets.
  //
  // The vertical bars matter and are not decoration. Terraform draws its errors
  // inside a box and every line of the block carries that prefix, so a fixture
  // written without it is a fixture the real output does not resemble. An
  // earlier version of this stub omitted them, the parser was anchored on
  // leading whitespace, and the whole block therefore parsed as empty against
  // real terraform while passing here: the mode reported a lock held by nobody
  // and refused to break the operator's own stale lock.
  const lockError = opts.lockHeldBy
    ? [
        '  printf "\\033[31m╷\\033[0m\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0m\\033[1mError: Error acquiring the state lock\\033[0m\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0m\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0mError message: operation error S3: PutObject, https response error\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0mapi error PreconditionFailed: At least one of the pre-conditions you specified did not hold\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0mLock Info:\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0m  ID:        db5207a9-4d80-8993-4c30-cdeb7e69020e\\n" >&2',
        `  printf "\\033[31m│\\033[0m \\033[0m  Operation: ${opts.lockOperation ?? 'OperationTypePlan'}\\n" >&2`,
        `  printf "\\033[31m│\\033[0m \\033[0m  Who:       ${opts.lockHeldBy}\\n" >&2`,
        `  printf "\\033[31m│\\033[0m \\033[0m  Created:   ${opts.lockCreated ?? '2026-09-11 23:58:55.754432017 +0000 UTC'}\\n" >&2`,
        '  printf "\\033[31m╵\\033[0m\\n" >&2',
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
      // `show -json <plan>` answers with the fixture. Emitted before the -out
      // handling below so a `show` invocation never also writes a plan file.
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    show)',
      ...(opts.showFails
        ? [
            '      echo "Error: Failed to read the given plan file" >&2',
            '      echo "the plan file was created by a different version" >&2',
            '      exit 1',
            '      ;;',
            '  esac',
            'done',
            'for arg in "$@"; do',
            '  case "$arg" in',
            '    show)',
          ]
        : []),
      ...(opts.showWarnsOnStderr
        ? [`      echo ${JSON.stringify(opts.showWarnsOnStderr)} >&2`]
        : []),
      `      cat <<'PLANJSON'`,
      JSON.stringify({
        resource_changes: (opts.planResourceChanges ?? []).map((rc) => ({
          address: rc.address,
          type: rc.type,
          change: { actions: rc.actions },
        })),
      }),
      'PLANJSON',
      '      exit 0',
      '      ;;',
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
  // The script settles and proves its AWS identity before it touches the state
  // backend, so the run needs an identity to have one to prove.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...awsIdentityStubEnv(tmpDir),
    ...extraEnv,
  };
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
    expect(res.stderr).toMatch(/must be 'staging', 'production', 'shared' or 'operators'/);
  });

  it('accepts the shared tree, which owns the state bucket', () => {
    const res = run(['--target', 'shared', '--dry-run'], false);
    expect(res.exitCode).toBe(0);
  });

  it('accepts the operators tree, because hiring and firing are ordinary work', () => {
    // The roster is applied by an operator as themselves. Routing it through a
    // privileged sign-in would put ceremony in front of revoking access, which
    // is the one moment speed matters most.
    const res = run(['--target', 'operators', '--dry-run'], false);
    expect(res.exitCode).toBe(0);
  });

  it('asks for the typed word on the operators tree', () => {
    // Its plan is a person gaining or losing access to the account. Short diff,
    // so reading it costs nothing, and neither direction should be skimmed past.
    const res = run(['--target', 'operators', '--dry-run'], false);
    expect(res.stdout).toMatch(/take a typed APPLY/);
  });

  it('refuses the identity tree by name, and says where to go instead', () => {
    // That tree declares what the operator roles may do, and a role is denied
    // every write to its own definition, so it cannot apply it. An operator who
    // reaches for it here has most likely come to hire or fire somebody, which
    // is the roster.
    const res = run(['--target', 'identity', '--dry-run'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/not applied through this wrapper/);
    expect(res.stderr).toMatch(/--target operators/);
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

  it.each([['production'], ['shared'], ['operators']])(
    'refuses --yes when breaking the %s state lock, before any terraform runs',
    (target) => {
      // The refusal used to sit below the stale-lock block, which exits on its
      // own, so nothing under it was reachable from a lock-breaking run: the
      // typed word was asked for with the flag still set, the helper answered it,
      // and force-unlock ran against that tree's state with nothing typed.
      // Breaking a lock while a run is genuinely live lets two runs write state
      // at once, which is why this is refused rather than merely discouraged.
      //
      // The roster tree belongs in this list for the same reason it takes a typed
      // APPLY: its state is the record of who can sign in to the account, so two
      // runs writing it at once can leave somebody admitted who was being
      // removed. Staging is the only tree whose lock --yes still answers for,
      // because its data is disposable and its state is shared with nothing that
      // is not.
      writeTerraformStub();
      const res = run(['--target', target, '--break-stale-lock', '--i-killed-that-run', '--yes']);
      expect(res.exitCode).toBe(2);
      expect(res.stderr).toMatch(
        new RegExp(`--yes does not carry breaking the ${target} state lock`),
      );
      expect(calls(), 'terraform was never invoked').toBe('');
    },
  );
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

  /**
   * The same, with the operator attesting they killed the holding run. Carries
   * --yes because the cases that get past the checks reach the typed word, which
   * no test can answer; the refusal cases never reach it and are unaffected.
   */
  const breakRunAttested = (
    opts: Parameters<typeof writeTerraformStub>[0],
    procCount = '0',
  ) => {
    writeTerraformStub({ lockClearsAfterUnlock: true, ...opts });
    return run(
      ['--target', 'staging', '--break-stale-lock', '--i-killed-that-run', '--yes'],
      true,
      { TERRAFORM_APPLY_PROC_COUNT: procCount },
    );
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

  it('names the waiver in the refusal, so the operator is not left guessing at it', () => {
    const justNow = new Date(Date.now() - 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '.000000000 +0000 UTC');
    const res = breakRun({ lockHeldBy: `someone@${thisHost}`, lockCreated: justNow });
    expect(res.stderr).toMatch(/--i-killed-that-run/);
    expect(res.stderr).toMatch(/waives the age floor only/);
  });

  it('waives the floor when the operator attests they killed the holding run', () => {
    // The waiver is sound only because the two stronger checks already passed:
    // the lock names this machine and nothing is running on it, so a live run
    // would have to be invisible to both. The operator supplies the one fact the
    // script cannot -- that the process is gone.
    const justNow = new Date(Date.now() - 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '.000000000 +0000 UTC');
    const res = breakRunAttested({ lockHeldBy: `someone@${thisHost}`, lockCreated: justNow });
    expect(res.exitCode, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toMatch(/Three checks pass/);
    expect(calls()).toMatch(/force-unlock/);
  });

  it('waives the floor and nothing else: another machine is still refused', () => {
    const res = breakRunAttested({ lockHeldBy: 'julie@HER-LAPTOP', lockCreated: OLD });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/not this machine/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('waives the floor and nothing else: a running terraform is still refused', () => {
    const justNow = new Date(Date.now() - 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '.000000000 +0000 UTC');
    const res = breakRunAttested({ lockHeldBy: `someone@${thisHost}`, lockCreated: justNow }, '1');
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/terraform process\(es\) are running on this machine/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('waives the floor and nothing else: an apply-held lock is still refused', () => {
    const justNow = new Date(Date.now() - 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '.000000000 +0000 UTC');
    const res = breakRunAttested({
      lockHeldBy: `someone@${thisHost}`,
      lockCreated: justNow,
      lockOperation: 'OperationTypeApply',
    });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/not a plan/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('still says four checks when the lock is genuinely old, not three', () => {
    const res = breakRunAttested({ lockHeldBy: `someone@${thisHost}`, lockCreated: OLD });
    expect(res.exitCode, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toMatch(/All four checks pass/);
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

/**
 * A DNS change is approved by a person, on every tree, every time.
 *
 * This gate is on the CHANGE rather than on the environment, which is what makes
 * it different from the confirmation beside it. Staging otherwise applies with no
 * typed word at all, and "staging's data is disposable" says nothing about a
 * record in a zone. A record applied early does not error: it succeeds, and what
 * surfaces later is visitors reaching the wrong place or mail going quiet, with
 * nothing in the run's output to connect it back.
 */
describe('terraform-apply.sh: the DNS approval gate', () => {
  const dnsChange = [
    { type: 'aws_route53_record', address: 'aws_route53_record.apex_a', actions: ['create'] },
  ];
  const noDnsChange = [
    { type: 'aws_lightsail_instance', address: 'aws_lightsail_instance.web', actions: ['update'] },
  ];

  it('stops a staging apply that changes a record, though staging otherwise needs no word', () => {
    writeTerraformStub({ planResourceChanges: dnsChange });
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toMatch(/THIS PLAN CHANGES DNS/);
    // Bounded by whitespace on both sides: the saved plan's own temp file is
    // named "...-apply.XXXXXX", so a looser pattern matches the `show` call
    // that reads it and reports an apply that never happened.
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('refuses when it cannot read the plan at all, rather than reading silence as no DNS', () => {
    // The defect this pins: both reads used to swallow their own failure and
    // hand back an empty answer, which is indistinguishable from a plan with no
    // DNS in it. So the gate skipped itself on exactly the plans it exists for,
    // and the apply went through.
    writeTerraformStub({ planResourceChanges: dnsChange, showFails: true });
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/could not read the saved plan/);
    expect(res.stderr).toMatch(/not fail open/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('refuses an unreadable plan even where the plan holds no DNS at all', () => {
    // The refusal is about what it could not see, not about what was there. A
    // gate that only refused when it happened to spot a record would be relying
    // on the read it just admitted failed.
    writeTerraformStub({ planResourceChanges: noDnsChange, showFails: true });
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/could not read the saved plan/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('treats a warning on the error stream as a warning, not as an unreadable plan', () => {
    // Failing closed cuts both ways, and this is the other edge. Terraform writes
    // to its error stream on runs that SUCCEED: a provider deprecation notice, or
    // the development-overrides warning that prints on every command when a
    // workstation carries a dev_overrides block. Capturing both streams into one
    // variable put that text into what was then parsed as JSON, so the parse
    // failed, the gate refused, and because it refuses rather than waves through,
    // the tree could not be applied AT ALL until whoever owned the warning removed
    // it. Resuming with --from-step 2 took the same path and failed the same way.
    writeTerraformStub({
      planResourceChanges: noDnsChange,
      showWarnsOnStderr:
        'Warning: Provider development overrides are in effect',
    });
    const res = run(['--target', 'staging']);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toMatch(/could not read the saved plan/);
    expect(calls()).toMatch(/\sapply\s/);
  });

  it('still sees the DNS change in a plan whose read also emitted a warning', () => {
    // The warning must not cost the gate its verdict either: it still has to
    // refuse a DNS change it can see, on a run that printed a warning alongside.
    writeTerraformStub({
      planResourceChanges: dnsChange,
      showWarnsOnStderr: 'Warning: Provider development overrides are in effect',
    });
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('distinguishes grep finding nothing from grep failing, in the no-jq fallback', () => {
    // The fallback's half of failing closed, which was never built: `grep` exits
    // 1 on no match and 2 when it could not read the file, and `|| true`
    // collapsed both into an empty answer that this block reads as "no DNS in
    // this plan". An unreadable or swept plan log therefore applied whatever the
    // plan held, on the gate whose own comment says it does not fail open.
    //
    // Asserted against the source rather than driven. Reaching the fallback needs
    // a PATH with no jq on it but every other tool the script uses still present,
    // and forcing grep's exit 2 needs the plan log to become unreadable between
    // the plan and the check. Both are machine surgery that would prove less than
    // it costs, and a test seam existing only to make a read fail is a seam in a
    // safety gate. What is pinned instead is that the swallow is gone and the
    // status is judged.
    const src = readFileSync(SCRIPT, 'utf-8');
    const fallback = src.slice(src.indexOf('Without jq, fall back'));
    expect(fallback).not.toMatch(/aws_route53' "\$TF_PLAN_LOG"\) \|\| true/);
    expect(fallback).toMatch(/\|\| DNS_GREP_STATUS=\$\?/);
    expect(fallback).toMatch(/if \(\( DNS_GREP_STATUS > 1 \)\); then/);
    expect(fallback).toMatch(/could not read the plan text/);
  });

  it('still removes the saved plan when shred is unavailable or fails', () => {
    // The cleanup trap shreds the plan and then removes it. A BARE shred in that
    // trap is fatal under strict mode: the handler aborts where it stands, the
    // rm never runs, and the plan file SURVIVES — which is the opposite of what
    // a cleanup trap is for, and the file is mode 600 precisely because its
    // contents are not for leaving around. The wrong exit status is the lesser
    // half of this.
    const binDir = mkdtempSync(join(tmpdir(), 'footbag-test-tfapply-nobin-'));
    try {
      const fakeShred = join(binDir, 'shred');
      writeFileSync(fakeShred, '#!/usr/bin/env bash\nexit 1\n', { encoding: 'utf-8', mode: 0o755 });
      // Pin what THIS run creates rather than asserting on a listing of a shared
      // directory: take the set before, take it after, and judge the difference.
      // The plan and its log are mktemp'd as /tmp/footbag-<target>-apply.XXXXXX
      // and -planlog.XXXXXX.
      const planFiles = (): string[] =>
        readdirSync('/tmp').filter(
          (n) => n.startsWith('footbag-shared-apply.') || n.startsWith('footbag-shared-planlog.'),
        );
      const before = new Set(planFiles());
      writeTerraformStub({ planResourceChanges: noDnsChange });
      const res = run(['--target', 'shared', '--yes'], true, {
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      });
      expect(res.exitCode, res.stderr).toBe(0);
      const survivors = planFiles().filter((n) => !before.has(n));
      expect(
        survivors,
        `plan files this run created survived the cleanup trap:\n${survivors.join('\n')}`,
      ).toEqual([]);
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it('writes the plan without colour, so the no-jq fallback can match its markers', () => {
    // Terraform colours its output even when it is not writing to a terminal,
    // and the escape sequence lands between the line start and the +/-/~ marker,
    // so an anchored pattern over a coloured plan matches nothing. That is an
    // under-match in a fallback whose own comment claims it over-matches, and
    // it reads as "no DNS in this plan".
    writeTerraformStub({ planResourceChanges: noDnsChange });
    run(['--target', 'shared', '--yes']);
    expect(calls()).toMatch(/plan[^\n]*-no-color/);
  });

  it('names the records it would change, rather than saying only that some exist', () => {
    writeTerraformStub({ planResourceChanges: dnsChange });
    const res = run(['--target', 'staging']);
    expect(res.stdout).toMatch(/aws_route53_record\.apex_a/);
    expect(res.stdout).toMatch(/create/);
  });

  it('is not satisfied by --yes, which every other confirmation here accepts', () => {
    // An approval a flag can supply in advance is not the human approval this
    // asks for. --yes still answers the ordinary production confirmation, which
    // is why the next case exists.
    writeTerraformStub({ planResourceChanges: dnsChange });
    const res = run(['--target', 'staging', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('leaves --yes working for the environment confirmation when no DNS changes', () => {
    // The guard against over-reach: a gate that blocked every unattended apply
    // would be turned off rather than obeyed. The shared tree is the one that
    // asks for the word AND accepts --yes; production refuses --yes outright,
    // for its own reasons, which is asserted elsewhere in this file.
    writeTerraformStub({ planResourceChanges: noDnsChange });
    const res = run(['--target', 'shared', '--yes']);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(calls()).toMatch(/\sapply\s/);
  });

  it('ignores a no-op route53 entry, which every plan carries for unchanged records', () => {
    // Every plan lists unchanged resources. Firing on those would mean the gate
    // fires on every apply, which teaches an operator to type APPLY without
    // reading -- the exact failure the confirmation doctrine warns about.
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_route53_record', address: 'aws_route53_record.apex_a', actions: ['no-op'] },
      ],
    });
    const res = run(['--target', 'staging']);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).not.toMatch(/THIS PLAN CHANGES DNS/);
    expect(calls()).toMatch(/terraform .*apply/);
  });

  it('fires on a delete as readily as on a create', () => {
    // Removing a record is the change most likely to be the one nobody meant.
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_route53_record', address: 'aws_route53_record.mx', actions: ['delete'] },
      ],
    });
    expect(run(['--target', 'staging']).exitCode).toBe(1);
  });

  it('fires on a zone change, not only on records', () => {
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_route53_zone', address: 'aws_route53_zone.primary', actions: ['create'] },
      ],
    });
    expect(run(['--target', 'staging']).exitCode).toBe(1);
  });

  it('applies normally when the plan touches no DNS at all', () => {
    writeTerraformStub({ planResourceChanges: noDnsChange });
    const res = run(['--target', 'staging']);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).not.toMatch(/THIS PLAN CHANGES DNS/);
  });
});
