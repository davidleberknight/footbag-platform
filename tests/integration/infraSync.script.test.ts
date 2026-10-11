/**
 * scripts/lib/infra-sync.sh: a deploy ships only onto infrastructure that already
 * matches the Terraform in the tree it ships.
 *
 * The properties pinned here are the ones that make it a guard:
 *
 *   - with the values file present, the deploy proceeds only on an empty plan for
 *     its own environment, and a pending change stops it with the apply to run;
 *   - production is never deployed unchecked: a missing values file is a refusal
 *     there, never a pass;
 *   - staging without a values file, which is every dev-and-tester's machine,
 *     proceeds and says so, rather than either blocking them or skipping silently;
 *   - the plan never reads the deploy's stdin, which carries the host's sudo
 *     password in the leaves that call this.
 *
 * The plan itself runs through scripts/terraform-apply.sh --require-empty-plan,
 * whose own suite pins that it applies nothing; here it is a stand-in that
 * records how it was called and exits as the case needs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const LIB = join(REPO_ROOT, 'scripts/lib/infra-sync.sh');

let workDir: string;

beforeEach(() => {
  workDir = createScratchDir('infra-sync');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** A stand-in for terraform-apply.sh: records its arguments and its stdin, exits with `code`. */
function applyStub(code: number): string {
  const path = join(workDir, 'terraform-apply-stub.sh');
  writeFileSync(path, [
    '#!/usr/bin/env bash',
    `printf '%s\\n' "$*" > "${join(workDir, 'args')}"`,
    `cat > "${join(workDir, 'stdin')}"`,
    code === 0 ? 'echo "The plan is empty, as required. Nothing to apply."' : 'echo "ERROR: the plan was required to be empty" >&2',
    `exit ${code}`,
    '',
  ].join('\n'));
  chmodSync(path, 0o755);
  return path;
}

function valuesFile(): string {
  const path = join(workDir, 'terraform.tfvars');
  writeFileSync(path, 'environment = "test"\n');
  return path;
}

function run(env: string, opts: { applyCmd: string; values: string; stdin?: string }) {
  const res = spawnSync('bash', ['-c', `source "${LIB}"; infra_sync_require "${REPO_ROOT}" "$1"`, 'infra-sync', env], {
    ...SPAWN_GUARD,
    encoding: 'utf-8',
    input: opts.stdin ?? '',
    env: { ...process.env, INFRA_SYNC_APPLY_CMD: opts.applyCmd, INFRA_SYNC_VALUES_FILE: opts.values },
  });
  return { exitCode: res.status, stdout: res.stdout, stderr: res.stderr };
}

function stubCalledWith(): string | null {
  const path = join(workDir, 'args');
  return existsSync(path) ? readFileSync(path, 'utf-8').trim() : null;
}

describe('infra_sync_require', () => {
  it('lets a deploy proceed on an empty plan for its own environment', () => {
    for (const env of ['staging', 'production']) {
      const res = run(env, { applyCmd: applyStub(0), values: valuesFile() });
      expect(res.exitCode, `${env}: ${res.stderr}`).toBe(0);
      // A check pointed at the other environment would pass a deploy whose own tree is unapplied.
      expect(stubCalledWith()).toBe(`--target ${env} --require-empty-plan`);
    }
  });

  it('stops a deploy whose environment has a pending change, naming the apply to run', () => {
    for (const env of ['staging', 'production']) {
      const res = run(env, { applyCmd: applyStub(1), values: valuesFile() });
      expect(res.exitCode, env).toBe(1);
      expect(res.stderr).toContain(`bash scripts/terraform-apply.sh --target ${env}`);
    }
  });

  it('refuses production when it cannot plan, and never runs the plan', () => {
    const res = run('production', { applyCmd: applyStub(0), values: join(workDir, 'absent.tfvars') });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/cannot check that production's infrastructure matches/);
    expect(stubCalledWith()).toBeNull();
  });

  it('lets a staging deploy with no values file proceed, and says the check did not run', () => {
    const res = run('staging', { applyCmd: applyStub(1), values: join(workDir, 'absent.tfvars') });
    expect(res.exitCode).toBe(0);
    expect(res.stderr).toMatch(/infrastructure check not run/);
    expect(stubCalledWith()).toBeNull();
  });

  it('never hands the deploy\'s stdin to the plan', () => {
    const res = run('staging', { applyCmd: applyStub(0), values: valuesFile(), stdin: 'host-sudo-password\n' });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(readFileSync(join(workDir, 'stdin'), 'utf-8')).toBe('');
  });

  it('refuses an environment it does not know, before planning', () => {
    const res = run('shared', { applyCmd: applyStub(0), values: valuesFile() });
    expect(res.exitCode).toBe(1);
    expect(stubCalledWith()).toBeNull();
  });
});
