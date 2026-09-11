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

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'footbag-test-tfapply-'));
  tfStub = join(tmpDir, 'terraform-stub.sh');
  callLog = join(tmpDir, 'calls.log');
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * A stand-in for Terraform. `plan -out` writes the file the script then applies,
 * so the saved-plan handling runs for real against a throwaway file.
 */
function writeTerraformStub(opts: { planFails?: boolean; applyFails?: boolean } = {}): void {
  writeFileSync(
    tfStub,
    [
      '#!/usr/bin/env bash',
      `echo "terraform $*" >> "${callLog}"`,
      'for arg in "$@"; do',
      '  case "$arg" in',
      `    plan)  ${opts.planFails ? 'exit 1' : ':'} ;;`,
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

  it('refuses to apply with no terminal and no --yes, rather than applying unconfirmed', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging']);
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
