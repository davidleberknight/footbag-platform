/**
 * scripts/lib/tool-report.sh — the workstation tools the local runners need.
 *
 * A missing tool used to surface one gate at a time, deep into a run: a skipped
 * secret scan, a Terraform gate that could not start, a clean-room gate failing
 * on a missing encoder. The report names every problem up front, and where the
 * push gate pins a version it reads that pin from the workflow rather than
 * holding a copy that can drift.
 *
 * What is pinned here:
 *
 *   - versions come from the workflow file, so changing the pin there changes
 *     what counts as correct;
 *   - a tool at the wrong version is reported with both versions named;
 *   - the secret scanner counts as present when a matching gitleaks or a
 *     running docker can supply it, and is reported when neither can;
 *   - the report never fails the caller.
 *
 * Every tool is a stub on a PATH this suite builds, so the verdict never depends
 * on what the machine running it has installed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/tool-report.sh');

// The utilities the library itself runs, linked in so nothing else on the
// machine's PATH is visible to it.
const UTILITIES = ['bash', 'grep', 'tr', 'cut', 'sed', 'timeout', 'dirname', 'cat'];

let root: string;
let bin: string;
let workflow: string;

function stub(name: string, body: string) {
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/bash\n${body}\n`);
  chmodSync(path, 0o755);
}

function writeWorkflow({ node = '22.22.1', python = '3.12.12', gitleaks = '8.24.3', terraform = '1.14.7' } = {}) {
  writeFileSync(join(root, '.nvmrc'), `${node}\n`);
  writeFileSync(join(root, '.python-version'), `${python}\n`);
  writeFileSync(
    workflow,
    [
      `          GITLEAKS_VERSION: "${gitleaks}"`,
      `          terraform_version: ${terraform}`,
      '',
    ].join('\n'),
  );
}

function report(tools: string[]) {
  const res = spawnSync('bash', ['-c', `source "${LIB}"; tool_report ${tools.join(' ')}`], {
    encoding: 'utf-8',
    env: { ...process.env, PATH: bin, TOOL_REPORT_ROOT: root },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'footbag-test-toolreport-'));
  bin = join(root, 'bin');
  mkdirSync(bin);
  for (const utility of UTILITIES) {
    const found = spawnSync('bash', ['-c', `command -v ${utility}`], { encoding: 'utf-8', ...SPAWN_GUARD });
    symlinkSync((found.stdout ?? '').trim(), join(bin, utility));
  }
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  workflow = join(root, '.github', 'workflows', 'ci.yml');
  writeWorkflow();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('tool-report.sh — versions come from the workflow', () => {
  it('reports nothing wrong when every tool matches the pins', () => {
    stub('node', 'echo v22.22.1');
    stub('python3.12', 'echo 3.12.12');
    stub('gitleaks', 'echo 8.24.3');
    stub('terraform', 'echo "Terraform v1.14.7"; echo "on linux_amd64"');
    const r = report(['node', 'python', 'gitleaks', 'terraform']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('all 4 tools present at the expected versions');
    expect(r.stdout).not.toContain('[missing]');
  });

  it('names both versions when node differs from .nvmrc, down to the patch', () => {
    stub('node', 'echo v22.23.2');
    const r = report(['node']);
    expect(r.stdout).toContain('[missing] node 22.23.2 is installed; the push gate runs Node 22.22.1 (.nvmrc).');
  });

  it('follows .python-version when its pin changes, rather than holding a copy', () => {
    writeWorkflow({ python: '3.13.1' });
    stub('python3.12', 'echo 3.12.12');
    const r = report(['python']);
    expect(r.stdout).toContain('[missing] python3.13 is not installed; the push gate runs Python 3.13.1 (.python-version)');
  });

  it('reports an interpreter of the pinned minor but another patch', () => {
    stub('python3.12', 'echo 3.12.3');
    const r = report(['python']);
    expect(r.stdout).toContain('[missing] python3.12 is 3.12.3; the push gate runs Python 3.12.12 (.python-version)');
  });

  it('reports a terraform whose version differs from the pin', () => {
    stub('terraform', 'echo "Terraform v1.16.2"');
    const r = report(['terraform']);
    expect(r.stdout).toContain('[missing] terraform 1.16.2 is installed; the push gate runs 1.14.7');
  });

  it('says on stderr that the pin source was overridden', () => {
    const r = report(['jq']);
    expect(r.stderr).toContain('TOOL_REPORT_ROOT is set');
  });
});

describe('tool-report.sh — the secret scanner', () => {
  it('counts a gitleaks at the pinned version as a scanner', () => {
    stub('gitleaks', 'echo v8.24.3');
    const r = report(['gitleaks']);
    expect(r.stdout).not.toContain('[missing]');
  });

  it('counts a running docker as a scanner when gitleaks is absent', () => {
    stub('docker', 'exit 0');
    const r = report(['gitleaks']);
    expect(r.stdout).not.toContain('[missing]');
  });

  it('reports no scanner when gitleaks is absent and docker is not answering', () => {
    stub('docker', 'exit 1');
    const r = report(['gitleaks']);
    expect(r.stdout).toContain('[missing] no secret scanner: gitleaks 8.24.3 is not installed and docker is not running');
  });

  it('reports a wrong-version gitleaks when docker cannot supply the pinned one', () => {
    stub('gitleaks', 'echo 8.30.1');
    const r = report(['gitleaks']);
    expect(r.stdout).toContain('[missing] gitleaks 8.30.1 is installed but the push gate runs 8.24.3');
  });
});

describe('tool-report.sh — it informs, it does not gate', () => {
  it('lists every problem and still returns success', () => {
    const r = report(['node', 'sqlite3', 'jq', 'age']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('node is not installed');
    expect(r.stdout).toContain('sqlite3 is not installed');
    expect(r.stdout).toContain('jq is not installed');
    expect(r.stdout).toContain('age is not installed');
    expect(r.stdout).toContain('4 tool problem(s) above');
  });
});
