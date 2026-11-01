/**
 * Every tool version has one home, the version list.
 *
 * A second copy of a pin does not move when the list moves, so a bump reaches
 * some machines and not others. The gate refuses a copy of a listed version on
 * a line naming the tool, and any version assigned to a variable named for a
 * listed tool, on the deploy and build surfaces; the copies the gate's header
 * records as owned elsewhere stay. Driven here against a stand-in tree.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createScratchDir } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const GATE = join(process.cwd(), 'scripts/ci/check_tool_versions_single_home.sh');

let root: string;

function put(rel: string, body: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
}

beforeEach(() => {
  root = createScratchDir('tool-versions-home');
  put('ops/tool-versions.env', [
    '# the list',
    'JQ_VERSION=1.7.1',
    'TERRAFORM_VERSION=1.14.7',
    'AGE_VERSION=REPLACE_WITH_VERSION',
  ].join('\n'));
  put('scripts/setup.sh', 'tool_pin JQ_VERSION\n');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function gate() {
  const res = spawnSync('bash', [GATE], {
    env: { ...process.env, CHECK_TOOL_VERSIONS_ROOT: root },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stderr: res.stderr ?? '', stdout: res.stdout ?? '' };
}

describe('one home for every tool version', () => {
  // Defect caught: the gate refuses a tree whose pins all live in the list, so
  // nobody can satisfy it and it gets switched off.
  it('passes a tree that reads every version from the list', () => {
    const res = gate();
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('pass');
  });

  // Defect caught: a script carries its own jq version, and a bump of the list
  // never reaches the machines that script installs.
  it('refuses a script assigning its own version for a listed tool', () => {
    put('scripts/install.sh', 'JQ_VERSION=1.6\n');
    const res = gate();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('scripts/install.sh:1 pins jq');
  });

  // Defect caught: the CI workflow keeps the soft prefix pin it had before the
  // list existed, so CI tests one jq and the workstations another.
  it('refuses a workflow version key for a listed tool', () => {
    put('.github/workflows/ci.yml', 'env:\n  TOOL_JQ_VERSION: "1.7"\n');
    const res = gate();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('.github/workflows/ci.yml:2 pins jq');
  });

  // Defect caught: a hand-copied download address carries the listed version,
  // and the next bump leaves it behind.
  it('refuses a copy of the listed version on a line naming the tool', () => {
    put('docker/tools/Dockerfile', 'RUN curl -fsSLO https://example.invalid/jq-1.7.1/jq-linux-amd64\n');
    const res = gate();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('docker/tools/Dockerfile:1 pins jq');
  });

  // Defect caught: the gate fires on a comment or on a copy its header records as
  // owned elsewhere, and the owners' own files become unwritable.
  it('reads no comment and keeps the copies owned elsewhere', () => {
    put('scripts/notes.sh', '# jq 1.7.1 is pinned in the list\n');
    put('.github/workflows/ci.yml', 'jobs:\n  t:\n    with:\n      terraform_version: 1.14.7\n');
    put('terraform/staging/providers.tf', 'terraform {\n  required_version = "1.14.7"\n}\n');
    const res = gate();
    expect(res.stderr).not.toContain('FAIL');
    expect(res.status).toBe(0);
  });

  // Defect caught: a placeholder in the list matches every line that merely
  // names the tool, refusing the whole tree.
  it('skips a key whose pin is still a placeholder', () => {
    put('scripts/age.sh', 'age --version\n');
    expect(gate().status).toBe(0);
  });
});
