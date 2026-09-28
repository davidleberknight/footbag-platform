/**
 * scripts/install-git-hooks.sh — activating the repository's git hooks.
 *
 * The hooks are committed, but git runs none of them until the checkout points
 * at their directory, and an inactive commit hook is silent: commits simply go
 * unscanned. npm runs this on every install, and the local runners run it on
 * every start, so it is reached from places where there is no checkout to
 * activate, or where activating would write into somebody else's.
 *
 * What is pinned here:
 *
 *   - a main checkout is pointed at its hooks directory, and a second run is the
 *     same as the first;
 *   - outside a git checkout, as in an image build or an unpacked archive, it
 *     does nothing and succeeds;
 *   - inside a linked worktree, as in the clean room, it does nothing and
 *     succeeds, and the main checkout's settings are left exactly as they were.
 *
 * Every case builds its own repository in a temp directory, so nothing depends
 * on how the machine running the suite has its own checkout configured.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/install-git-hooks.sh');

let root: string;

// A git with no user or system configuration of its own, so the verdict never
// depends on the developer's global settings.
const GIT_ENV = {
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
};

function env(): NodeJS.ProcessEnv {
  return { ...process.env, HOME: root, ...GIT_ENV };
}

function git(cwd: string, args: string[]) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf-8', env: env(), ...SPAWN_GUARD });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return (res.stdout ?? '').trim();
}

function hooksPath(cwd: string): string {
  const res = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
    cwd,
    encoding: 'utf-8',
    env: env(),
    ...SPAWN_GUARD,
  });
  return (res.stdout ?? '').trim();
}

/** A directory laid out like the repository, holding the installer and a hook. */
function layOut(dir: string) {
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, '.githooks'), { recursive: true });
  copyFileSync(SCRIPT, join(dir, 'scripts', 'install-git-hooks.sh'));
  writeFileSync(join(dir, '.githooks', 'pre-commit'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(join(dir, '.githooks', 'pre-commit'), 0o755);
}

function install(dir: string) {
  const res = spawnSync('bash', [join(dir, 'scripts', 'install-git-hooks.sh')], {
    encoding: 'utf-8',
    env: env(),
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'footbag-test-githooks-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('install-git-hooks.sh — a main checkout', () => {
  it('points the checkout at its hooks directory and verifies it', () => {
    const repo = join(root, 'repo');
    layOut(repo);
    git(repo, ['init', '-q']);
    const r = install(repo);
    expect(r.status, r.stderr).toBe(0);
    expect(hooksPath(repo)).toBe('.githooks');
    expect(r.stdout).toContain('hooks path set to .githooks');
  });

  it('is idempotent: a second run leaves it set and says so', () => {
    const repo = join(root, 'repo');
    layOut(repo);
    git(repo, ['init', '-q']);
    install(repo);
    const again = install(repo);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain('hooks path already points at .githooks');
    expect(hooksPath(repo)).toBe('.githooks');
  });

  it('replaces a hooks path set somewhere else', () => {
    const repo = join(root, 'repo');
    layOut(repo);
    git(repo, ['init', '-q']);
    git(repo, ['config', 'core.hooksPath', join(repo, '.git', 'hooks')]);
    const r = install(repo);
    expect(r.status, r.stderr).toBe(0);
    expect(hooksPath(repo)).toBe('.githooks');
  });
});

describe('install-git-hooks.sh — where there is nothing to activate', () => {
  it('does nothing and succeeds outside a git checkout', () => {
    const tree = join(root, 'unpacked');
    layOut(tree);
    const r = install(tree);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Not a git checkout; no hooks to activate.');
  });

  it('does nothing inside a linked worktree, and leaves the main checkout as it found it', () => {
    const repo = join(root, 'repo');
    layOut(repo);
    git(repo, ['init', '-q']);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'fixture']);
    const tree = join(root, 'worktree');
    git(repo, ['worktree', 'add', '-q', tree]);

    const r = install(tree);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Linked worktree; hooks are activated by the main checkout.');
    // The worktree shares the main checkout's configuration, so this is the
    // setting the clean room must not write.
    expect(hooksPath(repo)).toBe('');
  });
});
