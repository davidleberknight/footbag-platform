/**
 * The SSH half of the machine-isolation declaration, asserted from inside a
 * worker rather than trusted.
 *
 * It exists because of a specific failure. Fifteen operator scripts refuse to
 * run unless the deploy alias resolves, and `require_ssh_alias` asks by running
 * `ssh -G`. That reads the system-wide configuration as well as the one under
 * `HOME`, so pointing `HOME` at an empty directory does not deny it and the
 * clean-room gate could not have caught it either: on a maintainer's machine the
 * alias resolves and the script runs on, on a runner it does not and the script
 * stops at the guard. Two cases asserting what a script printed after that point
 * passed here and failed there, three pushes running.
 *
 * The two cases that matter are the spawned ones, because the declaration is
 * only worth what a child process sees. They assert the runner's condition:
 * the alias does not resolve, and the guard says so. Before the stub existed
 * both passed for the opposite reason on any machine carrying the alias, which
 * is the whole defect in one sentence.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

/** The alias the deploy scripts use, and the one a maintainer has configured. */
const ALIAS = 'footbag-staging';

const LIB = join(process.cwd(), 'scripts/lib/host-env-remote.sh');

function run(script: string): { status: number; stdout: string; stderr: string } {
  const res = spawnSync('bash', ['-c', script], {
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('machine isolation: the SSH client', () => {
  it('leads the worker PATH with an executable stub ssh', () => {
    const first = (process.env.PATH ?? '').split(':')[0];
    expect(first).toContain('footbag-test-home-');
    expect(() => accessSync(join(first, 'ssh'), constants.X_OK)).not.toThrow();
  });

  it('answers -G the way a machine with no stanza for the name answers', () => {
    // Exit 0 with the name echoed back as its own hostname. Refusing instead
    // would send every caller down a branch a real runner never takes.
    const res = run(`ssh -G ${ALIAS}`);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(new RegExp(`^hostname ${ALIAS}$`, 'm'));
  });

  it('makes the operator scripts refuse the alias, as they do on a runner', () => {
    const res = run(`source ${LIB}; require_ssh_alias ${ALIAS}`);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/is not configured/);
  });

  it('refuses a connection and names the declaration that refused it', () => {
    const res = run(`ssh ${ALIAS} true`);
    expect(res.status).toBe(255);
    expect(res.stderr).toMatch(/machineIsolation/);
  });
});
