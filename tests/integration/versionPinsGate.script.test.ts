/**
 * The gate that keeps every version pinned.
 *
 * A range, a floating tag or an unlocked install lets an upstream release reach a
 * build, a CI run or a workstation without anybody deciding it should, and two
 * machines built from one commit then run different code with nothing recording
 * which. The gate refuses each of those forms: a range in package.json, a pip
 * install that does not read a hash-pinned file, a CI runner named *-latest, a remote
 * image a script runs without a digest, and npx --yes without a version.
 *
 * Every case runs the real gate inside a throwaway repository, so a refused form
 * can be asserted without one ever existing here. The last case runs it against
 * this repository, which keeps the fixtures honest about the real parse.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const GATE = join(process.cwd(), 'scripts/ci/check_version_pins.sh');

interface RunResult { exitCode: number; stdout: string; stderr: string }

const PINNED_PACKAGE = JSON.stringify({
  dependencies: { express: '4.22.2' },
  devDependencies: { vitest: '4.1.11' },
  overrides: { qs: '6.16.0' },
});

/** A throwaway repository holding only the given files, with the gate run inside it. */
function inFixtureRepo(files: Record<string, string>): RunResult {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-version-pins-'));
  try {
    spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
    const base = { 'package.json': PINNED_PACKAGE, '.nvmrc': '22.22.1\n', '.python-version': '3.12.12\n' };
    for (const [name, body] of Object.entries({ ...base, ...files })) {
      mkdirSync(join(root, dirname(name)), { recursive: true });
      writeFileSync(join(root, name), body);
    }
    const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('the version-pin gate: what passes', () => {
  it('accepts exact versions, hash-locked installs, named runners, digests and versioned npx', () => {
    const res = inFixtureRepo({
      'scripts/a.sh': [
        'pip install --require-hashes -r scripts/requirements.txt',
        'IMAGE="ghcr.io/zaproxy/zaproxy@sha256:2ec1d5d5b44d55cfd02ba9b89cd26852f06d92b7fc0ce9f064b9463babc73074"',
        'docker run --rm "zricethezav/gitleaks:v8.24.3@${DIGEST}" detect',
        'npx --yes snyk@1.1307.4 test',
        '# pip install pandas   (a comment is not an install)',
        '',
      ].join('\n'),
      '.github/workflows/ci.yml': 'jobs:\n  a:\n    runs-on: ubuntu-24.04\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).toContain('[version-pins] pass');
  });
});

describe('the version-pin gate: what it refuses', () => {
  it('refuses a range in package.json', () => {
    const res = inFixtureRepo({
      'package.json': JSON.stringify({ devDependencies: { tsx: '^4.15.7' } }),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('package.json: tsx is "^4.15.7", not an exact version');
  });

  it('refuses a range in overrides too', () => {
    const res = inFixtureRepo({
      'package.json': JSON.stringify({ overrides: { qs: '~6.16.0' } }),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('package.json: qs is "~6.16.0"');
  });

  it('refuses a pip install of bare package names', () => {
    const res = inFixtureRepo({ 'scripts/a.sh': 'pip install pandas numpy\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/a.sh:1: pip install must read a hash-pinned requirements file');
  });

  it('refuses a pinned file read without --require-hashes', () => {
    const res = inFixtureRepo({
      '.github/workflows/ci.yml': 'steps:\n  - run: python3 -m pip install -r legacy_data/requirements.txt\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('.github/workflows/ci.yml:2: pip install must read a hash-pinned requirements file');
  });

  it('refuses a runner named latest', () => {
    const res = inFixtureRepo({ '.github/workflows/ci.yml': 'jobs:\n  a:\n    runs-on: ubuntu-latest\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('.github/workflows/ci.yml:3: runs-on names a moving image');
  });

  it('refuses a remote image assigned by tag', () => {
    const res = inFixtureRepo({ 'scripts/zap.sh': 'ZAP_IMAGE="ghcr.io/zaproxy/zaproxy:stable"\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/zap.sh:1: a remote image must be pinned by digest');
  });

  it('refuses a remote image run by tag', () => {
    const res = inFixtureRepo({ 'scripts/scan.sh': 'docker run --rm zricethezav/gitleaks:v8.24.3 detect\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/scan.sh:1: a remote image must be pinned by digest');
  });

  it('refuses a runtime pin file that git ignores, since CI would never see it', () => {
    const res = inFixtureRepo({ '.gitignore': '.python-version\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('.python-version is gitignored, so it never reaches CI or the clean room');
  });

  it('refuses pip3 as well as pip', () => {
    const res = inFixtureRepo({ 'scripts/a.sh': 'pip3 install pandas\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/a.sh:1: pip install must read a hash-pinned requirements file');
  });

  it('refuses npx --yes without a version', () => {
    const res = inFixtureRepo({ 'scripts/deps.sh': 'npx --yes snyk test\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/deps.sh:1: npx --yes must name an exact version');
  });
});

describe('the version-pin gate against this repository', () => {
  it('passes, so every pin the tree carries is exact', () => {
    const res = spawnSync('bash', [GATE], { encoding: 'utf8', ...SPAWN_GUARD });
    expect(res.status, res.stderr).toBe(0);
  });
});
