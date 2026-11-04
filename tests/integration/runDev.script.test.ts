/**
 * run_dev.sh — the local dev launcher.
 *
 * The launcher prepares the machine and the database, then hands the terminal to
 * the dev stack by replacing itself with it. A replaced process runs no exit
 * trap, so the closing report has to be printed before the hand-off: every error
 * and warning the preparation met is listed, an error stops the launch, and
 * warnings are listed and the stack still launches.
 *
 * The launcher runs from a scratch tree holding a copy of itself and the
 * closing-report library. Everything else it reaches is a stand-in: the shared
 * environment checks pass, the git-hook installer, the legacy pipeline and the
 * persona manager answer as the case says, and the dev stack only records that
 * it was launched. lsof is a stand-in that reports every port free, so no case
 * signals a process on the machine running the suite.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO = process.cwd();

let scratch: string;
let tree: string;
let bin: string;

function file(rel: string, body: string, mode = 0o755) {
  const path = join(tree, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  chmodSync(path, mode);
}

beforeEach(() => {
  scratch = createScratchDir('run-dev');
  tree = join(scratch, 'tree');
  bin = join(scratch, 'bin');
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(tree, 'scripts', 'lib'), { recursive: true });
  copyFileSync(join(REPO, 'run_dev.sh'), join(tree, 'run_dev.sh'));
  for (const lib of ['closing-report.sh', 'closing-report-remote.sh', 'verdict-banner.sh']) {
    copyFileSync(join(REPO, 'scripts', 'lib', lib), join(tree, 'scripts', 'lib', lib));
  }
  file('scripts/lib/npm-deps.sh', 'npm_deps_current() { return 0; }\n', 0o644);
  file('scripts/lib/tool-report.sh', 'tool_report() { return 0; }\n', 0o644);
  file('scripts/lib/seeder-env.sh', 'seeder_env_ensure() { return "${STUB_SEEDER_EXIT:-0}"; }\n', 0o644);
  file('scripts/install-git-hooks.sh', 'exit 0\n');
  file(
    'legacy_data/run_pipeline.sh',
    'if [ -n "${STUB_VENV_FAILS:-}" ]; then echo "python 3.12.12 not found" >&2; exit 1; fi\nexit 0\n',
  );
  file('scripts/manage-test-personas.sh', 'echo "personas $*"\n');
  file('scripts/dev.sh', `echo "DEV STACK LAUNCHED" >&2\ntouch "${join(scratch, 'launched')}"\n`);
  file('database/footbag.db', '', 0o644);
  writeFileSync(join(bin, 'lsof'), '#!/usr/bin/env bash\nexit 1\n');
  chmodSync(join(bin, 'lsof'), 0o755);
});

afterEach(() => {
  removeScratch(scratch);
});

function run(args: string[] = [], env: Record<string, string> = {}) {
  const res = spawnSync('bash', [join(tree, 'run_dev.sh'), ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK: '1',
      ...env,
    },
    ...SPAWN_GUARD,
  });
  const stderr = res.stderr ?? '';
  const at = stderr.indexOf('==== Closing report');
  return {
    status: res.status,
    stdout: res.stdout ?? '',
    stderr,
    report: at < 0 ? '' : stderr.slice(at),
    reportAt: at,
    launchAt: stderr.indexOf('DEV STACK LAUNCHED'),
    launched: existsSync(join(scratch, 'launched')),
  };
}

describe('run_dev.sh — the closing report comes before the hand-off', () => {
  // Defect caught: the launcher replaced itself with the stack and no report was
  // ever printed, so nothing at the end of the preparation said what it met.
  it('prints its report, then launches the stack', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.launched).toBe(true);
    expect(r.reportAt, 'no closing report before the launch').toBeGreaterThan(-1);
    expect(r.launchAt).toBeGreaterThan(r.reportAt);
    expect(r.report).toContain('No errors or warnings.');
  });

  // Defect caught: a legacy environment that could not be built was a warning
  // printed mid-stream, then lost under the stack's own output.
  it('lists a warning the preparation met, and still launches', () => {
    const r = run([], { STUB_VENV_FAILS: '1' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.launched).toBe(true);
    expect(r.report).toMatch(/Warnings \(1\):\n {2}- the legacy pipeline's Python environment .*: exit 1: python 3\.12\.12 not found/);
    expect(r.launchAt).toBeGreaterThan(r.reportAt);
  });

  it('stops before the launch on an error, and lists it', () => {
    const r = run([], { STUB_SEEDER_EXIT: '1' });
    expect(r.status).not.toBe(0);
    expect(r.launched).toBe(false);
    expect(r.report).toMatch(/Errors \(\d+\):\n {2}- the seeder Python environment could not be built/);
  });

  it('refuses an unknown argument without launching', () => {
    const r = run(['--bogus']);
    expect(r.status).toBe(1);
    expect(r.launched).toBe(false);
    expect(r.report).toMatch(/- unknown arg: --bogus/);
  });

  it('prints the usage under --help and launches nothing', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^Usage: \.\/run_dev\.sh/m);
    expect(r.launched).toBe(false);
  });
});
