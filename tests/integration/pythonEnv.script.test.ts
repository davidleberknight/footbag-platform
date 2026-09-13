/**
 * scripts/lib/python-env.sh — the one contract for choosing a Python interpreter.
 *
 * Every loader, verifier and suite in this repository needs an interpreter that
 * carries the pinned dependencies. When each caller decided for itself, the
 * spellings drifted: a candidate walk here, a single hardcoded path there, a
 * bare `python3` somewhere else. The same checkout could then run one script
 * under a virtualenv and the next under whatever the host shipped, and the
 * error that eventually surfaced named the loader that died rather than the
 * interpreter that ran it.
 *
 * What is pinned here is the contract every caller will depend on:
 *
 *   - one search order, and the operator's override outranking it;
 *   - a candidate is only a candidate when it actually holds an executable
 *     interpreter, so a leftover directory cannot shadow a working one;
 *   - the two environments resolve against their own roots and cannot satisfy
 *     each other;
 *   - a miss under the ordinary policy fails and names every path it tried,
 *     with no fallback to a system interpreter;
 *   - building an environment belongs to one script, and the refusal for
 *     everyone else does not depend on the environment happening to be absent.
 *
 * Every case builds the tree it resolves against, so nothing here depends on
 * which virtualenvs the machine running the suite happens to have.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/python-env.sh');

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'footbag-test-pythonenv-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * A directory shaped like a virtualenv. `interpreter` names the file created
 * under bin/, and `executable` decides whether it carries the execute bit, so a
 * test can build the near-miss shapes as well as the working one.
 */
function makeVenv(
  relativeDir: string,
  { interpreter = 'python', executable = true }: { interpreter?: string; executable?: boolean } = {},
): string {
  const dir = join(root, relativeDir);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  const bin = join(dir, 'bin', interpreter);
  writeFileSync(bin, '#!/usr/bin/env bash\necho stub\n');
  chmodSync(bin, executable ? 0o755 : 0o644);
  return dir;
}

/** A directory that looks like a virtualenv from the outside and holds nothing. */
function makeEmptyDir(relativeDir: string): string {
  const dir = join(root, relativeDir);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  return dir;
}

function run(
  args: string[],
  env: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('bash', [LIB, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, FOOTBAG_REPO_ROOT: root, VENV_DIR: '', ...env },
    ...SPAWN_GUARD,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: result.stderr ?? '',
  };
}

/** Sources the library from a caller with a chosen filename, which is how the
 *  builder-only policy is decided. */
function runAsCaller(
  callerFilename: string,
  body: string,
  env: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  const caller = join(root, callerFilename);
  writeFileSync(caller, `#!/usr/bin/env bash\nset -euo pipefail\nsource "${LIB}"\n${body}\n`);
  chmodSync(caller, 0o755);
  const result = spawnSync('bash', [caller], {
    encoding: 'utf-8',
    env: { ...process.env, FOOTBAG_REPO_ROOT: root, VENV_DIR: '', ...env },
    ...SPAWN_GUARD,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: result.stderr ?? '',
  };
}

describe('python-env.sh: the search order', () => {
  it('resolves the conventional virtualenv name', () => {
    const venv = makeVenv('legacy_data/.venv');
    const res = run(['--print', 'pipeline', 'fail']);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(join(venv, 'bin', 'python'));
  });

  it('prefers the first candidate when several are present', () => {
    const first = makeVenv('legacy_data/.venv');
    makeVenv('legacy_data/footbag_venv');
    makeVenv('legacy_data/venv');
    expect(run(['--print-dir', 'pipeline', 'fail']).stdout).toBe(first);
  });

  it('falls through to the second candidate when the first is absent', () => {
    const second = makeVenv('legacy_data/footbag_venv');
    expect(run(['--print-dir', 'pipeline', 'fail']).stdout).toBe(second);
  });

  it('falls through to the last candidate when the first two are absent', () => {
    const third = makeVenv('legacy_data/venv');
    expect(run(['--print-dir', 'pipeline', 'fail']).stdout).toBe(third);
  });

  it('lets the operator override outrank every candidate', () => {
    makeVenv('legacy_data/.venv');
    const override = makeVenv('legacy_data/chosen');
    const res = run(['--print-dir', 'pipeline', 'fail'], { VENV_DIR: 'chosen' });
    expect(res.stdout).toBe(override);
  });

  it('accepts an override given as an absolute path outside the environment root', () => {
    const elsewhere = makeVenv('somewhere-else');
    const res = run(['--print-dir', 'pipeline', 'fail'], { VENV_DIR: elsewhere });
    expect(res.stdout).toBe(elsewhere);
  });
});

describe('python-env.sh: what counts as a virtualenv', () => {
  it('skips a candidate that holds no interpreter and keeps searching', () => {
    makeEmptyDir('legacy_data/.venv');
    const real = makeVenv('legacy_data/footbag_venv');
    expect(run(['--print-dir', 'pipeline', 'fail']).stdout).toBe(real);
  });

  it('skips a candidate whose interpreter is not executable', () => {
    makeVenv('legacy_data/.venv', { executable: false });
    const real = makeVenv('legacy_data/footbag_venv');
    expect(run(['--print-dir', 'pipeline', 'fail']).stdout).toBe(real);
  });

  it('accepts the python3 spelling when the plain name is absent', () => {
    const venv = makeVenv('legacy_data/.venv', { interpreter: 'python3' });
    const res = run(['--print', 'pipeline', 'fail']);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(join(venv, 'bin', 'python3'));
  });

  it('prefers the plain name when both spellings are present', () => {
    const venv = makeVenv('legacy_data/.venv');
    makeVenv('legacy_data/.venv', { interpreter: 'python3' });
    expect(run(['--print', 'pipeline', 'fail']).stdout).toBe(join(venv, 'bin', 'python'));
  });
});

describe('python-env.sh: the two environments', () => {
  it('resolves each environment against its own root', () => {
    const pipeline = makeVenv('legacy_data/.venv');
    const seeder = makeVenv('scripts/.venv');
    expect(run(['--print-dir', 'pipeline', 'fail']).stdout).toBe(pipeline);
    expect(run(['--print-dir', 'seeder', 'fail']).stdout).toBe(seeder);
  });

  it('does not let one environment satisfy a request for the other', () => {
    makeVenv('scripts/.venv');
    const res = run(['--print', 'pipeline', 'fail']);
    expect(res.status).not.toBe(0);
    expect(res.stdout).toBe('');
  });

  it('refuses an environment name it does not know', () => {
    const res = run(['--print', 'staging', 'fail']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown environment 'staging'");
  });

  it('refuses a policy it does not know', () => {
    makeVenv('legacy_data/.venv');
    const res = run(['--print', 'pipeline', 'maybe']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown policy 'maybe'");
  });
});

describe('python-env.sh: a miss is a refusal, never a fallback', () => {
  it('exits non-zero and names the environment and its root', () => {
    const res = run(['--print', 'pipeline', 'fail']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("'pipeline' environment");
    expect(res.stderr).toContain(join(root, 'legacy_data'));
  });

  it('names every path it tried, in order', () => {
    const res = run(['--print', 'pipeline', 'fail']);
    for (const candidate of ['.venv', 'footbag_venv', 'venv']) {
      expect(res.stderr).toContain(join(root, 'legacy_data', candidate, 'bin', 'python'));
    }
    const positions = ['.venv', 'footbag_venv', 'venv'].map((c) =>
      res.stderr.indexOf(join(root, 'legacy_data', c, 'bin', 'python')),
    );
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);
  });

  it('offers no interpreter on stdout, so a caller cannot consume a fallback', () => {
    const res = run(['--print', 'pipeline', 'fail']);
    expect(res.stdout).toBe('');
    expect(res.stdout).not.toContain('python');
  });

  it('says that the absence of a fallback is deliberate', () => {
    const res = run(['--print', 'pipeline', 'fail']);
    expect(res.stderr).toContain('no fallback to a system interpreter');
  });
});

describe('python-env.sh: building an environment belongs to one caller', () => {
  it('refuses the create policy from a caller that is not the builder', () => {
    const res = run(['--print', 'pipeline', 'create']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('run_pipeline.sh');
  });

  it('refuses it even when the environment is already there, because the caller is still wrong', () => {
    makeVenv('legacy_data/.venv');
    const res = run(['--print', 'pipeline', 'create']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("belongs to run_pipeline.sh");
  });

  it('accepts the create policy from the builder', () => {
    const venv = makeVenv('legacy_data/.venv');
    const res = runAsCaller('run_pipeline.sh', 'footbag_venv_dir pipeline create');
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(venv);
  });

  it('still refuses a caller whose name merely resembles the builder', () => {
    makeVenv('legacy_data/.venv');
    const res = runAsCaller('not_run_pipeline.sh', 'footbag_venv_dir pipeline create');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('is not it');
  });
});

describe('python-env.sh: the two printing forms', () => {
  it('prints the directory and the interpreter consistently', () => {
    const venv = makeVenv('legacy_data/.venv');
    expect(run(['--print-dir', 'pipeline', 'fail']).stdout).toBe(venv);
    expect(run(['--print', 'pipeline', 'fail']).stdout).toBe(join(venv, 'bin', 'python'));
  });

  it('puts the path on stdout and everything else on stderr, so a caller can consume it directly', () => {
    const venv = makeVenv('legacy_data/.venv');
    const res = run(['--print', 'pipeline', 'fail']);
    expect(res.stdout.split('\n')).toHaveLength(1);
    expect(res.stdout).toBe(join(venv, 'bin', 'python'));
    expect(res.stderr).toContain('FOOTBAG_REPO_ROOT is set');
  });

  it('refuses a command form it does not recognise', () => {
    const res = run(['--resolve', 'pipeline', 'fail']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('usage');
  });

  it('serves a sourcing caller through both functions', () => {
    const venv = makeVenv('legacy_data/.venv');
    const res = runAsCaller(
      'caller.sh',
      'footbag_venv_dir pipeline fail\nfootbag_python pipeline fail',
    );
    expect(res.status).toBe(0);
    expect(res.stdout.split('\n')).toEqual([venv, join(venv, 'bin', 'python')]);
  });
});
