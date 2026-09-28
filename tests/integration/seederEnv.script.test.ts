/**
 * scripts/lib/seeder-env.sh — the database seeder's Python environment.
 *
 * Four callers build scripts/.venv through this one function, which judges the
 * environment by whether it works rather than by whether its files exist: an
 * environment whose interpreter link came to resolve to a different Python
 * looked healthy to a file check and crashed at the next pip call.
 *
 * What is pinned:
 *
 *   - a working environment at the pinned version is left alone;
 *   - one on another Python, or without pip, is removed and rebuilt with the
 *     pinned interpreter;
 *   - the result must satisfy the hash-pinned requirements, or the call fails;
 *   - a failed creation leaves nothing half-built behind.
 *
 * The pinned interpreter is a stand-in on PATH, so nothing is installed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/seeder-env.sh');

/** A venv interpreter answering like a working one at the pinned version. */
const WORKING = '#!/bin/bash\nif [ "$1" = "-c" ]; then echo 3.12.12; exit 0; fi\nexit 0\n';

let root: string;
let stubs: string;
let log: string;

function write(path: string, body: string, mode = 0o755) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
  chmodSync(path, mode);
}

/** The pinned interpreter: `-m venv <dir>` builds a working environment there. */
function pinnedInterpreter(venvInterpreter = WORKING) {
  write(
    join(stubs, 'python3.12'),
    [
      '#!/bin/bash',
      `echo "python3.12 $*" >> ${log}`,
      'if [ "$1" = "-c" ]; then echo 3.12.12; exit 0; fi',
      'if [ "$1" = "-m" ] && [ "$2" = "venv" ]; then',
      '  mkdir -p "$3/bin"',
      `  cat > "$3/bin/python3" <<'EOF'\n${venvInterpreter}EOF`,
      '  chmod +x "$3/bin/python3"',
      '  exit 0',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
  );
}

function ensure() {
  const res = spawnSync('bash', ['-c', `source "${LIB}"; seeder_env_ensure "${root}"`], {
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${stubs}:${process.env.PATH ?? ''}`, FOOTBAG_REPO_ROOT: root },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function builds(): number {
  return existsSync(log) ? readFileSync(log, 'utf-8').split('\n').filter((l) => l.includes('-m venv')).length : 0;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'footbag-test-seeder-env-'));
  stubs = join(root, 'stubs');
  log = join(root, 'calls.log');
  mkdirSync(stubs, { recursive: true });
  writeFileSync(join(root, '.python-version'), '3.12.12\n');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'scripts', 'requirements.txt'), 'six==1.17.0 \\\n    --hash=sha256:00\n');
  pinnedInterpreter();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('seeder-env.sh — judged by whether the environment works', () => {
  it('leaves a working environment at the pinned version alone', () => {
    write(join(root, 'scripts', '.venv', 'bin', 'python3'), WORKING);
    const r = ensure();
    expect(r.status, r.stderr).toBe(0);
    expect(builds()).toBe(0);
  });

  it('rebuilds an environment whose interpreter is another Python', () => {
    write(
      join(root, 'scripts', '.venv', 'bin', 'python3'),
      '#!/bin/bash\nif [ "$1" = "-c" ]; then echo 3.10.12; exit 0; fi\nexit 0\n',
    );
    const r = ensure();
    expect(r.status, r.stderr).toBe(0);
    expect(builds()).toBe(1);
    expect(r.stdout).toContain('Building the seeder Python environment');
  });

  it('rebuilds an environment without pip', () => {
    write(
      join(root, 'scripts', '.venv', 'bin', 'python3'),
      '#!/bin/bash\nif [ "$1" = "-c" ]; then echo 3.12.12; exit 0; fi\nexit 1\n',
    );
    const r = ensure();
    expect(r.status, r.stderr).toBe(0);
    expect(builds()).toBe(1);
  });

  it('builds a missing environment with the pinned interpreter', () => {
    const r = ensure();
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(log, 'utf-8')).toContain(`python3.12 -m venv ${join(root, 'scripts', '.venv')}`);
  });

  it('fails when the environment still does not satisfy its pinned requirements', () => {
    pinnedInterpreter(
      '#!/bin/bash\nif [ "$1" = "-c" ]; then echo 3.12.12; exit 0; fi\n' +
        'case "$*" in *--dry-run*) echo "Would install six-1.17.0" ;; esac\nexit 0\n',
    );
    const r = ensure();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('does not satisfy scripts/requirements.txt at Python 3.12.12 after installing');
  });

  it('leaves nothing half-built when the pinned interpreter cannot create it', () => {
    write(
      join(stubs, 'python3.12'),
      '#!/bin/bash\nif [ "$1" = "-c" ]; then echo 3.12.12; exit 0; fi\nmkdir -p "$3/bin"\nexit 1\n',
    );
    const r = ensure();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not create');
    expect(existsSync(join(root, 'scripts', '.venv'))).toBe(false);
  });

  it('keeps the existing environment when the pinned interpreter is another patch release', () => {
    // Proved before anything is removed: a machine that cannot rebuild keeps
    // what it has rather than losing it.
    const old = join(root, 'scripts', '.venv', 'bin', 'python3');
    write(old, '#!/bin/bash\nif [ "$1" = "-c" ]; then echo 3.10.12; exit 0; fi\nexit 0\n');
    write(join(stubs, 'python3.12'), '#!/bin/bash\nif [ "$1" = "-c" ]; then echo 3.12.3; exit 0; fi\nexit 0\n');
    const r = ensure();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Python 3.12.12 is not available as python3.12');
    expect(existsSync(old)).toBe(true);
    expect(builds()).toBe(0);
  });
});
