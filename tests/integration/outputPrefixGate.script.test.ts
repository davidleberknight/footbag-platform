/**
 * The gate that keeps operator output pasteable into a shell.
 *
 * An operator copies lines out of a run and pastes them back into a terminal. A
 * line starting with two equals signs, a greater-than sign and a space is read
 * there as a redirect into a file named after the next word, so the gate refuses
 * that prefix anywhere in the operator scripts.
 *
 * Every case runs the real gate inside a throwaway repository, so a refused
 * script can be asserted without one ever existing here. The last case runs it
 * against this repository.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const GATE = join(process.cwd(), 'scripts/ci/check_output_prefix.sh');
const REDIRECT_PREFIX = '==' + '> ';

interface RunResult { exitCode: number; stdout: string; stderr: string }

/** Stands up a throwaway repository holding the given files and runs the gate inside it. */
function inFixtureRepo(files: Record<string, string | Buffer>): RunResult {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-output-prefix-gate-'));
  try {
    spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
    for (const [name, body] of Object.entries(files)) {
      const full = join(root, name);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, body);
    }
    const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const script = (...lines: string[]) => ['#!/usr/bin/env bash', ...lines, ''].join('\n');

describe('output-prefix gate', () => {
  it.each([
    ['an echo under scripts/', 'scripts/a.sh', script(`echo "${REDIRECT_PREFIX}AWS identity: x"`)],
    ['a printf format in a library', 'scripts/lib/l.sh', script(`say() { printf '\\n${REDIRECT_PREFIX}%s\\n' "$*"; }`)],
    ['a remote half', 'scripts/internal/r-remote.sh', script(`echo "${REDIRECT_PREFIX}Restarting service..."`)],
    ['a comment showing the output', 'scripts/a.sh', script(`# prints "${REDIRECT_PREFIX}Done"`)],
    ['a non-shell script under scripts/', 'scripts/t.ts', `console.log('${REDIRECT_PREFIX}step');\n`],
    ['the root deploy entry point', 'deploy_to_aws.sh', script(`echo "${REDIRECT_PREFIX}Deploying"`)],
  ])('refuses %s', (_label, path, body) => {
    // Defect caught: an operator pastes a progress line back into a shell and it
    // creates a stray file in their working directory.
    const res = inFixtureRepo({ [path]: body });
    expect(res.exitCode, res.stdout).toBe(1);
    expect(res.stderr).toContain(`${path}:`);
  });

  it.each([
    ['the two-equals prefix', 'scripts/a.sh', script('echo "== AWS identity: x"')],
    ['a closing-report banner', 'scripts/a.sh', script('echo "==== Closing report: a.sh ===="')],
    ['a comparison', 'scripts/a.sh', script('[[ "$a" == "$b" ]] && echo same')],
    ['the prefix inside a virtual environment', 'scripts/.venv/bin/activate', `echo "${REDIRECT_PREFIX}x"\n`],
    ['a binary file', 'scripts/blob.bin', Buffer.from([0xff, 0xfe, 0x3d, 0x3d, 0x3e, 0x20])],
  ])('accepts %s', (_label, path, body) => {
    // Defect caught: a gate that refuses correct output, or reads files it was
    // never meant to scan, and so gets switched off.
    const res = inFixtureRepo({ [path]: body, 'scripts/ok.sh': script('echo "== ok"') });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('fails rather than passes when there is nothing to scan', () => {
    // Defect caught: a scope that has shrunk to nothing reporting a clean pass.
    const res = inFixtureRepo({ 'README.md': 'nothing here\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('matched no files');
  });

  it('passes on this repository', () => {
    // Defect caught: an operator script in this tree printing the redirect
    // prefix, or a scan that quietly reads far less of the tree than it should.
    const res = spawnSync('bash', [GATE], { encoding: 'utf8', ...SPAWN_GUARD });
    expect(res.status, res.stderr).toBe(0);
    const scanned = Number(res.stdout.match(/(\d+) files scanned/)?.[1] ?? 0);
    expect(scanned).toBeGreaterThan(100);
  });
});
