/**
 * scripts/lock-python-deps.sh — regenerating the hash-locked Python requirements.
 *
 * The full run resolves against the package index and hashes every published
 * file, so it is not driven here. What is pinned is the part that decides what a
 * run may do before it reaches the network: it refuses an argument it does not
 * know and an upgrade that names no package, and its help says that versions move
 * only when named. The committed compiled files are checked below, and the
 * version-pin gate refuses any pip install that does not read one with hashes.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/lock-python-deps.sh');

function run(args: string[]) {
  const res = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', ...SPAWN_GUARD });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('lock-python-deps.sh — argument guards', () => {
  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });

  it('refuses an upgrade that names no package', () => {
    const r = run(['--upgrade-package']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--upgrade-package needs a package name');
  });

  it('says in its help that a version moves only when named', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Keeps every version already in a lock');
    expect(r.stdout).toContain('--upgrade-package');
  });
});

describe('the committed compiled requirement files', () => {
  it.each(['legacy_data/requirements.txt', 'scripts/requirements.txt', 'scripts/requirements-tools.txt'])(
    '%s pins every package exactly and hashes each one',
    (lock) => {
      const lines = readFileSync(join(process.cwd(), lock), 'utf8').split('\n');
      const requirements = lines.filter((l) => /^[A-Za-z0-9]/.test(l));
      expect(requirements.length).toBeGreaterThan(0);
      for (const line of requirements) {
        expect(line, `${lock}: ${line}`).toMatch(/^[A-Za-z0-9._-]+==[^ ]+/);
        expect(line.trimEnd().endsWith('\\'), `${lock}: ${line} has no hashes`).toBe(true);
      }
    },
  );
});
