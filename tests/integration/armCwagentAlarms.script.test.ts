/**
 * scripts/arm-cwagent-alarms.sh — the refusals around arming the host alarms.
 *
 * Arming is three things that must all happen and must happen in order: the
 * metric proof, the values-file flag, and the apply. The hazard is the first
 * being skipped, because an alarm bound to a metric-and-dimension combination
 * the host does not publish cannot leave insufficient data, and before the
 * missing-data treatment was corrected it read OK forever while measuring
 * nothing.
 *
 * What is pinned here is everything that happens before terraform: the argument
 * guards, the rewrite of the flag, the refusal to invent a line that is not
 * there, the confirmation that must be typed, and the property that a declined
 * confirmation leaves the file exactly as it was found. The apply itself is the
 * operator's and is not exercised.
 *
 * The script's own --tfvars seam points it at a scratch values file and stops it
 * before terraform, so nothing here reaches an estate.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/arm-cwagent-alarms.sh');

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-armcwagent-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** A scratch values file shaped like the real one: aligned assignments, other
 *  switches present, so the rewrite has to find its own line among them. */
function tfvars(value: string | null): string {
  const path = join(workDir, 'terraform.tfvars');
  const lines = [
    'environment                = "production"',
    'alarm_email                = "ops@example.invalid"',
    ...(value === null ? [] : [`enable_cwagent_alarms      = ${value}`]),
    'enable_backup_alarm        = false',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
  return path;
}

function run(args: string[], env: Record<string, string> = {}, input = '') {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    input,
    ...SPAWN_GUARD,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** A stand-in for the terraform apply wrapper, so the outcome of the apply is
 *  the test's to choose. A failing one is the only way to reach the branch that
 *  decides whether the values file is put back. */
function terraformStub(exitCode: number): string {
  const path = join(workDir, `terraform-stub-${exitCode}.sh`);
  writeFileSync(path, `#!/usr/bin/env bash\necho "stub apply: $*"\nexit ${exitCode}\n`, {
    encoding: 'utf-8',
    mode: 0o755,
  });
  return path;
}

describe('arm-cwagent-alarms.sh argument guards', () => {
  it('refuses without a target, because which environment gets armed is not guessable', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--target is required');
  });

  it('refuses an unknown environment', () => {
    const r = run(['--target', 'prod']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("must be 'staging' or 'production'");
  });

  it('refuses an unknown flag rather than ignoring it', () => {
    const r = run(['--target', 'production', '--force']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--force'");
  });

  it('refuses a values file it cannot read, and never invents one', () => {
    const r = run(['--target', 'production', '--tfvars', join(workDir, 'absent.tfvars')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('cannot read');
    expect(r.stderr).toContain('never invents one');
  });
});

describe('arm-cwagent-alarms.sh values-file rewrite', () => {
  it('says on stderr when it is running against a scratch file', () => {
    const path = tfvars('false');
    const r = run(['--target', 'production', '--tfvars', path]);
    expect(r.stderr).toContain('SYNTHETIC');
  });

  it('flips the flag, shows the diff, and stops before terraform', () => {
    const path = tfvars('false');
    const r = run(['--target', 'production', '--tfvars', path, '--yes']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('-enable_cwagent_alarms      = false');
    expect(r.stdout).toContain('+enable_cwagent_alarms      = true');
    expect(r.stdout).toContain('stopping before terraform');
    expect(readFileSync(path, 'utf-8')).toContain('enable_cwagent_alarms      = true');
  });

  it('leaves the other switches alone', () => {
    const path = tfvars('false');
    run(['--target', 'production', '--tfvars', path, '--yes']);
    const after = readFileSync(path, 'utf-8');
    expect(after).toContain('enable_backup_alarm        = false');
    expect(after).toContain('alarm_email                = "ops@example.invalid"');
  });

  it('reports an already-armed environment without touching the file', () => {
    const path = tfvars('true');
    const before = readFileSync(path, 'utf-8');
    const r = run(['--target', 'production', '--tfvars', path]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('already true');
    expect(readFileSync(path, 'utf-8')).toBe(before);
  });

  it('refuses to invent an assignment that is not in the file', () => {
    const path = tfvars(null);
    const r = run(['--target', 'production', '--tfvars', path]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no enable_cwagent_alarms assignment found');
  });

  it('leaves the file exactly as found when there is no terminal and no --yes', () => {
    const path = tfvars('false');
    const before = readFileSync(path, 'utf-8');
    const r = run(['--target', 'production', '--tfvars', path]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('tfvars not changed');
    expect(readFileSync(path, 'utf-8')).toBe(before);
  });

  it('cannot have its confirmation answered by whatever is piped at it', () => {
    // The confirmation is read from the terminal, never stdin, so a redirected
    // credential file cannot become the answer and be echoed on the compare.
    // Piping the affirmative answer is the discriminating case: a prompt reading
    // stdin would take it and flip the flag.
    const path = tfvars('false');
    const before = readFileSync(path, 'utf-8');
    const r = run(['--target', 'production', '--tfvars', path], {}, 'APPLY\nyes\n');
    expect(r.status).toBe(1);
    expect(readFileSync(path, 'utf-8')).toBe(before);
  });

  it('cannot have its confirmation supplied by an exported variable', () => {
    // A guard an environment variable can satisfy is not a guard: the shared
    // library assigns the accept-in-advance value unconditionally, so only the
    // flag reaches it.
    const path = tfvars('false');
    const before = readFileSync(path, 'utf-8');
    const r = run(['--target', 'production', '--tfvars', path], { ASSUME_YES: 'yes' });
    expect(r.status).toBe(1);
    expect(readFileSync(path, 'utf-8')).toBe(before);
  });
});

describe('arm-cwagent-alarms.sh when the apply does not succeed', () => {
  // The values file is put back only where this run is the whole story. Once
  // terraform has been invoked the estate may already hold some of the alarms,
  // and writing "unarmed" over them is the same invisible half-state the script
  // exists to prevent, reached from the other side.

  it('puts the file back when it stops before terraform is ever invoked', () => {
    const path = tfvars('false');
    const before = readFileSync(path, 'utf-8');
    const r = run(['--target', 'production', '--tfvars', path]);
    expect(r.status).toBe(1);
    expect(readFileSync(path, 'utf-8')).toBe(before);
  });

  it('LEAVES the flag set when the apply itself fails, and says why', () => {
    const path = tfvars('false');
    const r = run(['--target', 'production', '--tfvars', path, '--yes'], {
      ARM_CWAGENT_TERRAFORM: terraformStub(1),
    });
    expect(r.status).not.toBe(0);
    expect(readFileSync(path, 'utf-8')).toContain('enable_cwagent_alarms      = true');
    expect(r.stderr).toContain('may hold some of the alarms already');
    expect(r.stderr).toContain('LEFT saying');
    expect(r.stderr).toContain('describe-alarms');
  });

  it('keeps the flag set when the apply succeeds', () => {
    const path = tfvars('false');
    const r = run(['--target', 'production', '--tfvars', path, '--yes'], {
      ARM_CWAGENT_TERRAFORM: terraformStub(0),
    });
    expect(r.status).toBe(0);
    expect(readFileSync(path, 'utf-8')).toContain('enable_cwagent_alarms      = true');
    expect(r.stderr).not.toContain('may hold some of the alarms already');
  });

  it('says on stderr that the terraform seam is in use, so a stubbed run is never read as a real one', () => {
    const path = tfvars('false');
    const r = run(['--target', 'production', '--tfvars', path, '--yes'], {
      ARM_CWAGENT_TERRAFORM: terraformStub(0),
    });
    expect(r.stderr).toContain('terraform seam');
    expect(r.stderr).toContain('no estate is reached');
  });
});
