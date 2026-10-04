/**
 * The AWS half of the machine-isolation declaration, asserted from inside a
 * worker rather than trusted.
 *
 * Without it, a script a suite spawns found whatever AWS CLI this machine had:
 * on one machine the CLI started, found nothing to sign with and refused after a
 * second, and on another no CLI existed and the script took its "not installed"
 * branch instead. The verdict depended on the machine, and the suite paid a
 * second for every start. The stub answers the way a machine with no AWS
 * configuration answers, the same on every machine.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

function run(script: string): { status: number; stdout: string; stderr: string } {
  const res = spawnSync('bash', ['-c', script], { encoding: 'utf-8', ...SPAWN_GUARD });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('machine isolation: the AWS CLI', () => {
  it('puts an executable stub aws at the front of the worker PATH', () => {
    const first = (process.env.PATH ?? '').split(':')[0];
    expect(first).toContain('footbag-test-home-');
    expect(() => accessSync(join(first, 'aws'), constants.X_OK)).not.toThrow();
    expect(run('command -v aws').stdout.trim()).toBe(join(first, 'aws'));
  });

  it('lists no profiles, as a machine with no AWS configuration does', () => {
    const res = run('aws configure list-profiles');
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('');
  });

  it('refuses every request for want of credentials, and says where the refusal came from', () => {
    const res = run('aws sts get-caller-identity --profile footbag-operator');
    expect(res.status).toBe(253);
    expect(res.stderr).toMatch(/Unable to locate credentials/);
    expect(res.stderr).toMatch(/machineIsolation\.ts/);
  });
});
