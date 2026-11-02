/**
 * The gate that keeps every operator script on the shared closing-report
 * library, against a baseline of not-yet-moved scripts that only shrinks.
 *
 * Every case runs the real gate inside a throwaway repository, so a refused
 * script can be asserted without one ever existing here. The last case runs it
 * against this repository.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const GATE = join(process.cwd(), 'scripts/ci/check_closing_report.sh');
const BASELINE = 'scripts/ci/closing-report-baseline.txt';

interface RunResult { exitCode: number; stdout: string; stderr: string }

let root: string;

beforeEach(() => {
  root = createScratchDir('closing-report-gate');
  spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
});

afterEach(() => {
  removeScratch(root);
});

function inFixtureRepo(files: Record<string, string>): RunResult {
  for (const [name, body] of Object.entries(files)) {
    const full = join(root, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
  return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const script = (...lines: string[]) => ['#!/usr/bin/env bash', ...lines, ''].join('\n');
const baseline = (...paths: string[]) => ['# header', ...paths, ''].join('\n');
const USES_LIB = script('source "$(dirname "$0")/lib/closing-report.sh"', 'cr_finish');

describe('closing-report gate', () => {
  it.each([
    ['an operator script', 'scripts/a.sh'],
    ['a remote half', 'scripts/internal/a-remote.sh'],
    ['a root-level script', 'deploy.sh'],
    ['a legacy-data driver', 'legacy_data/run.sh'],
    ['a freestyle driver', 'freestyle/run.sh'],
  ])('refuses %s that ends with no closing report', (_label, path) => {
    // Defect caught: a new script that can print a warning and finish on a
    // success line reaching an operator without the gate saying so.
    const res = inFixtureRepo({ [path]: script('echo "WARNING: x"', 'echo done') });
    expect(res.exitCode, res.stdout).toBe(1);
    expect(res.stderr).toContain(`${path}:`);
  });

  it('refuses a script that only names the library in a comment', () => {
    // Defect caught: a comment satisfying the gate in place of the mechanism.
    const res = inFixtureRepo({ 'scripts/a.sh': script('# source lib/closing-report.sh', 'echo done') });
    expect(res.exitCode).toBe(1);
  });

  it.each([
    ['a script sourcing the library', 'scripts/a.sh', USES_LIB],
    ['a script sourcing it with a dot', 'scripts/a.sh', script('. scripts/lib/closing-report.sh', 'cr_finish')],
    ['a remote half ending with crr_finish', 'scripts/internal/a-remote.sh', script('crr_warn x', 'crr_finish')],
    ['a test runner on the verdict banner', 'run_tests.sh', script('source scripts/lib/verdict-banner.sh')],
    ['a sourced library under scripts/internal', 'scripts/internal/steps.sh', '# shellcheck shell=bash\necho x\n'],
    ['a shared library', 'scripts/lib/x.sh', script('echo x')],
    ['a CI gate', 'scripts/ci/x.sh', script('echo x')],
  ])('accepts %s', (_label, path, body) => {
    // Defect caught: a gate that refuses a compliant or exempt file and so gets
    // switched off. The compliant script beside it keeps the scope non-empty.
    const res = inFixtureRepo({ [path]: body, 'scripts/ok.sh': USES_LIB });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('accepts a script the baseline lists', () => {
    // Defect caught: the gate failing every existing script on the day it lands.
    const res = inFixtureRepo({ 'scripts/a.sh': script('echo done'), [BASELINE]: baseline('scripts/a.sh') });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('refuses a baselined script that now uses the library until its line is deleted', () => {
    // Defect caught: a baseline that keeps claiming scripts are unmoved, so it
    // never shrinks and a later regression in that script goes unnoticed.
    const res = inFixtureRepo({ 'scripts/a.sh': USES_LIB, [BASELINE]: baseline('scripts/a.sh') });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/a.sh');
    expect(res.stderr).toContain(BASELINE);
  });

  it('refuses a baseline line naming a script that does not exist', () => {
    // Defect caught: a stale line that would let a future file of that name in
    // unchecked.
    const res = inFixtureRepo({ 'scripts/ok.sh': USES_LIB, [BASELINE]: baseline('scripts/gone.sh') });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/gone.sh');
  });

  it('fails rather than passes when there is no shell script to scan', () => {
    // Defect caught: a scope that has shrunk to nothing reporting a clean pass.
    const res = inFixtureRepo({ 'README.md': 'nothing here\n' });
    expect(res.exitCode).toBe(1);
  });

  it('passes on this repository', () => {
    // Defect caught: the committed baseline and the scripts disagreeing.
    const res = spawnSync('bash', [GATE], { cwd: process.cwd(), encoding: 'utf8', ...SPAWN_GUARD });
    expect(res.status, res.stderr).toBe(0);
  });
});
