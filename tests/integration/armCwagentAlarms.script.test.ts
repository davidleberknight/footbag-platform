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

function run(args: string[], input = 'yes\n') {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input,
    ...SPAWN_GUARD,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
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
    const r = run(['--target', 'production', '--tfvars', path]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('-enable_cwagent_alarms      = false');
    expect(r.stdout).toContain('+enable_cwagent_alarms      = true');
    expect(r.stdout).toContain('stopping before terraform');
    expect(readFileSync(path, 'utf-8')).toContain('enable_cwagent_alarms      = true');
  });

  it('leaves the other switches alone', () => {
    const path = tfvars('false');
    run(['--target', 'production', '--tfvars', path]);
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

  it('leaves the file exactly as found when the confirmation is declined', () => {
    const path = tfvars('false');
    const before = readFileSync(path, 'utf-8');
    const r = run(['--target', 'production', '--tfvars', path], 'no\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('tfvars not changed');
    expect(readFileSync(path, 'utf-8')).toBe(before);
  });
});
