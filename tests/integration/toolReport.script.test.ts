/**
 * scripts/lib/tool-report.sh — the workstation tools the local runners need.
 *
 * Without it, a missing tool surfaces one gate at a time, deep into a run: a
 * skipped secret scan, a Terraform gate that cannot start, a clean-room gate
 * failing on a missing encoder. The report names every problem up front, and where the
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

// The versions the runner's package index serves for the recorded pins, and the
// ones an Ubuntu 22.04 workstation ships, in each tool's own output format.
/**
 * sqlite3, jq, age and ffmpeg either at the versions the stand-in tool-version
 * list pins (ffmpeg's as production's image reports it), or at an older
 * distribution's.
 */
function stubPackagedTools(kind: 'pinned' | 'older') {
  const pinned = kind === 'pinned';
  stub('sqlite3', `echo "${pinned ? '3.51.2' : '3.37.2'} 2026-01-09 17:27:48 abc"`);
  stub('ffmpeg', `echo "ffmpeg version ${pinned ? '8.1.3' : '4.4.2-0ubuntu0.22.04.1'} Copyright (c) 2000-2026"`);
  stub('jq', `echo "jq-${pinned ? '1.7.1' : '1.6'}"`);
  stub('age', `echo "${pinned ? 'v1.1.1' : 'v1.0.0'}"`);
}

function writeToolVersions() {
  mkdirSync(join(root, 'ops'), { recursive: true });
  writeFileSync(join(root, 'ops', 'tool-versions.env'),
    'SQLITE_VERSION=3.51.2\nJQ_VERSION=1.7.1\nAGE_VERSION=1.1.1\nFFMPEG_VERSION=8.1.3-r0\n'
    + 'DOCKER_ENGINE_WORKSTATION=5:29.3.0-1~ubuntu.22.04~jammy\n');
}

function run(fn: 'tool_report' | 'tool_report_require', tools: string[]) {
  const res = spawnSync('bash', ['-c', `source "${LIB}"; ${fn} ${tools.join(' ')}`], {
    encoding: 'utf-8',
    env: { ...process.env, PATH: bin, TOOL_REPORT_ROOT: root },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
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
    expect(r.stdout).toContain('all 4 tools present');
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

describe('tool-report.sh — the docker engine must be the pinned workstation engine', () => {
  beforeEach(() => writeToolVersions());

  it('passes an engine at the pinned version', () => {
    stub('docker', '[ "$1" = version ] && echo 29.3.0; exit 0');
    const r = report(['docker']);
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).not.toContain('[missing]');
  });

  // Defect caught: a workstation on another Docker engine runs the dev stack and
  // the suites, so local container runs are trusted as the pinned environment.
  it('refuses an engine at another version, naming the pin', () => {
    stub('docker', '[ "$1" = version ] && echo 28.0.0; exit 0');
    const r = report(['docker']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('[missing] the docker engine is 28.0.0; the pinned workstation engine is 29.3.0');
  });
});

describe('tool-report.sh — it lists every problem at once, then refuses', () => {
  // Defect caught: a runner went ahead on missing tools and failed one gate at
  // a time, far from the cause; or the report stopped at the first problem, so
  // fixing a machine took one run per missing tool.
  it('lists every problem in one pass and returns failure', () => {
    writeToolVersions();
    const r = report(['node', 'sqlite3', 'jq', 'age']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('node is not installed');
    expect(r.stdout).toContain('sqlite3 is not installed');
    expect(r.stdout).toContain('jq is not installed');
    expect(r.stdout).toContain('age is not installed');
    expect(r.stdout).toContain('4 tool problem(s) above');
  });
});

describe('tool-report.sh — sqlite3, jq and age must be at their pinned versions', () => {
  beforeEach(() => writeToolVersions());

  it('passes when sqlite3, jq and age are at their pins', () => {
    stubPackagedTools('pinned');
    const r = run('tool_report', ['sqlite3', 'ffmpeg', 'jq', 'age']);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('[missing]');
    expect(r.stdout).not.toContain('[note]');
    expect(r.stdout).toContain('all 4 tools present');
  });

  // Defect caught: a workstation running its distribution's older sqlite3, jq
  // or age went on to run the suites, so a test could pass there against output
  // the hosts and CI never produce, or fail there for a reason they never meet.
  it('refuses a workstation whose sqlite3, jq or age is not the pinned version', () => {
    stubPackagedTools('older');
    const r = run('tool_report', ['sqlite3', 'ffmpeg', 'jq', 'age']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('[missing] sqlite3 3.37.2 is installed; the pinned version is 3.51.2 (SQLITE_VERSION');
    expect(r.stdout).toContain('[missing] jq 1.6 is installed; the pinned version is 1.7.1 (JQ_VERSION');
    expect(r.stdout).toContain('[missing] age 1.0.0 is installed; the pinned version is 1.1.1 (AGE_VERSION');
    // Defect caught: a workstation encoding with its distribution's ffmpeg runs
    // the suites, so a transcode is proven against an encoder production never runs.
    expect(r.stdout).toContain('[missing] ffmpeg 4.4.2 is installed; production runs 8.1.3 (FFMPEG_VERSION');
  });

  // Defect caught: CI ran on the runner image's own sqlite3, jq or age, so the
  // push gate proved a different version from the one the hosts run.
  it('in CI, fails when sqlite3, jq or age is not the pinned version', () => {
    stubPackagedTools('older');
    const r = run('tool_report_require', ['sqlite3', 'ffmpeg', 'jq', 'age']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[missing] sqlite3 3.37.2 is installed; the pinned version is 3.51.2');
    expect(r.stderr).toContain('[missing] ffmpeg 4.4.2 is installed; production runs 8.1.3');
  });

  it('in CI, passes silently when every tool is at its pin', () => {
    stubPackagedTools('pinned');
    const r = run('tool_report_require', ['sqlite3', 'ffmpeg', 'jq', 'age']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('::warning');
  });

  // Defect caught: a deleted provisioning step lets the tool-gated suites skip
  // their cases on the runner and report green.
  it('in CI, fails on a missing tool', () => {
    stubPackagedTools('pinned');
    rmSync(join(bin, 'jq'));
    const r = run('tool_report_require', ['sqlite3', 'jq']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[missing] jq is not installed');
  });
});
