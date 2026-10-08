/**
 * The gate that keeps every EXIT-trap cleanup out of bash's fatal-signal default.
 *
 * A script that cleans up on an EXIT trap and has no trap of its own on INT or
 * TERM is ended by bash's default handling of that signal, which runs the
 * cleanup from inside the signal handling; under bash 5.2 a second signal there
 * can end the shell with the cleanup half done. The race is too rare to catch by
 * running the scripts, so the gate refuses the shape instead.
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

const GATE = join(process.cwd(), 'scripts/ci/check_signal_traps.sh');

interface RunResult { exitCode: number; stdout: string; stderr: string }

/** Stands up a throwaway repository holding the given files and runs the gate inside it. */
function inFixtureRepo(files: Record<string, string>): RunResult {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-signal-trap-gate-'));
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

describe('signal-trap gate', () => {
  it.each([
    ['a bare EXIT trap', 'scripts/a.sh', script('trap cleanup EXIT')],
    ['an EXIT trap with INT only', 'scripts/a.sh', script('trap cleanup EXIT', "trap 'exit 130' INT")],
    ['an EXIT trap with TERM only', 'scripts/a.sh', script('trap cleanup EXIT', "trap 'exit 143' TERM")],
    ['an EXIT trap given as signal 0', 'scripts/a.sh', script("trap 'rm -rf \"$d\"' 0")],
    ['a function-local EXIT trap', 'scripts/a.sh', script('f() {', '  trap "rm -f x" EXIT', '}')],
    ['an INT trap that is only a reset', 'scripts/a.sh', script('trap cleanup EXIT', 'trap - INT TERM')],
    ['a root-level script', 'deploy.sh', script('trap cleanup EXIT')],
    ['a legacy tool', 'legacy_data/tools/t.sh', script('trap cleanup EXIT')],
  ])('refuses %s', (_label, path, body) => {
    // Defect caught: a script whose cleanup an interrupt can cut short reaching
    // a host or a workstation without the gate saying so.
    const res = inFixtureRepo({ [path]: body });
    expect(res.exitCode, res.stdout).toBe(1);
    expect(res.stderr).toContain(`${path}:`);
  });

  it.each([
    ['EXIT, INT and TERM on one trap', script('trap cleanup EXIT INT TERM')],
    ['separate handlers', script('trap cleanup EXIT', "trap \"trap '' HUP INT TERM; exit 130\" INT", "trap \"trap '' HUP INT TERM; exit 143\" TERM")],
    ['SIG-prefixed and numbered signals', script('trap cleanup EXIT', 'trap "exit 130" SIGINT', 'trap "exit 143" 15')],
    ['INT and TERM explicitly ignored', script('trap cleanup EXIT', "trap '' INT TERM")],
    ['no EXIT trap at all', script("trap 'exit 130' INT")],
    ['only a reset of EXIT', script('trap - EXIT')],
    ['a trap mentioned in a comment or a string', script('# trap cleanup EXIT', 'echo "trap cleanup EXIT"')],
  ])('accepts %s', (_label, body) => {
    // Defect caught: a gate that refuses correct handling, or a mention that is
    // not a trap, and so gets switched off.
    const res = inFixtureRepo({ 'scripts/a.sh': body });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('fails rather than passes when there is no shell script to scan', () => {
    // Defect caught: a scope that has shrunk to nothing reporting a clean pass.
    const res = inFixtureRepo({ 'README.md': 'nothing here\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('matched no shell scripts');
  });

  it('passes on this repository', () => {
    // Defect caught: a script in this tree that the gate refuses, or a scan that
    // quietly reads far less of the tree than it should.
    const res = spawnSync('bash', [GATE], { encoding: 'utf8', ...SPAWN_GUARD });
    expect(res.status, res.stderr).toBe(0);
    const scanned = Number(res.stdout.match(/(\d+) shell scripts scanned/)?.[1] ?? 0);
    expect(scanned).toBeGreaterThan(100);
  });
});
