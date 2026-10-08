/**
 * How the secret scan finds its scanner on a workstation.
 *
 * The scan runs the pinned gitleaks natively when that exact version is installed,
 * otherwise the pinned container through Docker. A machine with neither gets a
 * printed warning and the skip code, because continuous integration runs the same
 * scan on every push; on the runner, where the scanner is always provisioned, its
 * absence fails instead. Docker counts only when its daemon answers: a client with
 * no running daemon cannot run the container, and treating it as available turns a
 * workstation that merely has Docker installed into a failed scan.
 *
 * gitleaks and docker are stubs on PATH that record each call; nothing here runs a
 * container or scans the repository.
 *
 * The default mode also scans every uncommitted change a commit would carry, because
 * the history scan reads commits only and a credential in a new or modified file
 * otherwise passes the full local run and first fails at the push gate. Those cases
 * run a copy of the script inside a throwaway repository whose working tree the test
 * builds, so the verdict never depends on what this checkout happens to hold.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'ci', 'secret_scan.sh');

let tmp: string;
let binDir: string;
let callLog: string;

function stub(name: string, body: string[]): void {
  fs.writeFileSync(
    path.join(binDir, name),
    ['#!/bin/sh', `echo "${name} $*" >> "${callLog}"`, ...body].join('\n') + '\n',
    { mode: 0o755 },
  );
}

/** The version the workflow pins, which the script reads the same way. */
const PINNED = /GITLEAKS_VERSION:\s*"?([0-9.]+)/.exec(
  fs.readFileSync(path.resolve(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8'),
)?.[1] ?? '';

function scan(env: Record<string, string> = {}, args: string[] = []) {
  fs.rmSync(callLog, { force: true });
  // The inherited, isolated environment is kept; only the scanner lookup and the
  // runner markers are controlled, so the workstation case holds on a runner too.
  const spawnEnv: Record<string, string | undefined> = {
    ...process.env, PATH: `${binDir}:/usr/bin:/bin`, ...env,
  };
  if (!('CI' in env)) delete spawnEnv.CI;
  if (!('GITHUB_ACTIONS' in env)) delete spawnEnv.GITHUB_ACTIONS;
  const res = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env: spawnEnv, ...SPAWN_GUARD });
  const calls = fs.existsSync(callLog) ? fs.readFileSync(callLog, 'utf8') : '';
  return { status: res.status, stderr: res.stderr ?? '', calls };
}

beforeAll(() => {
  tmp = createScratchDir('secret-scan');
  binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  callLog = path.join(tmp, 'calls.log');
  // A gitleaks that reports no version is no usable native scanner.
  stub('gitleaks', ['exit 0']);
  // A Docker client whose daemon is not running: `info` fails, and a `run`
  // would fail the scan if it were ever attempted.
  stub('docker', ['[ "$1" = "info" ] && exit 1', 'exit 125']);
});

afterAll(() => removeScratch(tmp));

describe('the secret scan with Docker installed but not running', () => {
  // Defect caught: a workstation with a stopped Docker daemon fails the scan
  // (and the local gate) instead of warning and skipping like one without Docker.
  it('warns and skips on a workstation without attempting the container', () => {
    const res = scan();
    expect(res.status, res.stderr).toBe(77);
    expect(res.stderr).toContain('secret scan SKIPPED');
    expect(res.calls).not.toMatch(/^docker run/m);
  });

  // Defect caught: a workstation with a different gitleaks version and no running
  // daemon fails the local gate over version drift, which only warns.
  it('warns and skips on a workstation holding a different gitleaks version', () => {
    stub('gitleaks', ['[ "$1" = "version" ] && echo "v0.0.1"', 'exit 0']);
    try {
      const res = scan();
      expect(res.status, res.stderr).toBe(77);
      expect(res.stderr).toContain('gitleaks 0.0.1 is installed');
      expect(res.calls).not.toMatch(/^gitleaks (detect|git)/m);
    } finally {
      stub('gitleaks', ['exit 0']);
    }
  });

  // Defect caught: the relaxed workstation path leaks onto the runner, where a
  // missing scanner means a broken job and must fail.
  it('fails on the continuous-integration runner', () => {
    const res = scan({ CI: 'true' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('cannot be skipped here');
  });

  // Defect caught: a runner that sets only the GitHub Actions marker, and not
  // CI, takes the workstation path and skips the scan the push gate depends on.
  it('fails on a runner that sets only the GitHub Actions marker', () => {
    const res = scan({ GITHUB_ACTIONS: 'true' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('cannot be skipped here');
  });

  // Defect caught: the fast loop, which cannot report a skip, blocks a commit on
  // a machine without a scanner, or skips without saying so.
  it('passes with --skip-ok on a workstation, still printing the warning', () => {
    const res = scan({}, ['--skip-ok']);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stderr).toContain('secret scan SKIPPED');
  });
});

describe('the secret scan with a usable scanner', () => {
  // Defect caught: the pinned native binary is passed over, or its findings are
  // swallowed, so a leak passes the scan.
  it('runs the native gitleaks at the pinned version, and fails on its findings', () => {
    expect(PINNED).toMatch(/^\d+\.\d+\.\d+$/);
    stub('gitleaks', [`[ "$1" = "version" ] && echo "v${PINNED}" && exit 0`, 'exit 1']);
    try {
      const res = scan();
      expect(res.status, res.stderr).toBe(1);
      expect(res.calls).toMatch(/^gitleaks detect /m);
      expect(res.calls).not.toMatch(/^docker run/m);
    } finally {
      stub('gitleaks', ['exit 0']);
    }
  });

  // Defect caught: with no native scanner but a running daemon, the pinned
  // container is not used, or its findings are swallowed. This case and the one
  // above run against this checkout, so the working-tree pass may also run here;
  // the stubs fail both passes alike, so the verdict does not depend on it.
  it('runs the pinned container when Docker answers, and fails on its findings', () => {
    stub('docker', ['[ "$1" = "info" ] && exit 0', '[ "$1" = "run" ] && exit 1', 'exit 0']);
    try {
      const res = scan();
      expect(res.status, res.stderr).toBe(1);
      expect(res.calls).toMatch(new RegExp(`^docker run .*zricethezav/gitleaks:v${PINNED.replace(/\./g, '\\.')}@sha256:`, 'm'));
    } finally {
      stub('docker', ['[ "$1" = "info" ] && exit 1', 'exit 125']);
    }
  });
});

const REAL_ROOT = path.resolve(__dirname, '..', '..');

interface ScanRepo { root: string; bin: string; log: string; list: string }

/**
 * A throwaway repository carrying a copy of the scan script and the files it reads,
 * one commit deep, then a working tree the case shapes: one tracked file changed,
 * one deleted, one left alone, one new file, and one new file git ignores.
 */
function scanRepo({ dirty = true }: { dirty?: boolean } = {}): ScanRepo {
  const root = createScratchDir('secret-scan-repo');
  const git = (...args: string[]) =>
    spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid',
      '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', ...SPAWN_GUARD });
  const put = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  for (const rel of ['scripts/ci/secret_scan.sh', '.github/workflows/ci.yml', '.gitleaks.toml', '.gitleaksignore']) {
    put(rel, fs.readFileSync(path.join(REAL_ROOT, rel), 'utf8'));
  }
  put('.gitignore', 'ignored/\nbin/\nscan.log\nscanned.txt\ntmp/\n');
  put('src/kept.ts', 'export const a = 1;\n');
  put('src/changed.ts', 'export const b = 1;\n');
  put('src/removed.ts', 'export const c = 1;\n');
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  if (dirty) {
    put('src/changed.ts', 'export const b = 2;\n');
    fs.rmSync(path.join(root, 'src/removed.ts'));
    put('src/new.ts', 'export const d = 1;\n');
    put('ignored/local.env', 'NOT_SCANNED=1\n');
  }
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(root, 'tmp'));
  return { root, bin, log: path.join(root, 'scan.log'), list: path.join(root, 'scanned.txt') };
}

function runIn(repo: ScanRepo) {
  const env: Record<string, string | undefined> = {
    ...process.env, PATH: `${repo.bin}:/usr/bin:/bin`, TMPDIR: path.join(repo.root, 'tmp'),
  };
  delete env.CI;
  delete env.GITHUB_ACTIONS;
  const res = spawnSync('bash', [path.join(repo.root, 'scripts/ci/secret_scan.sh')], {
    cwd: repo.root, encoding: 'utf8', env, ...SPAWN_GUARD,
  });
  const calls = fs.existsSync(repo.log) ? fs.readFileSync(repo.log, 'utf8') : '';
  return { status: res.status, stderr: res.stderr ?? '', calls };
}

/** A native gitleaks at the pinned version that records what a working-tree pass saw. */
function nativeScanner(repo: ScanRepo, dirExit: number): void {
  fs.writeFileSync(path.join(repo.bin, 'gitleaks'), [
    '#!/bin/sh',
    `echo "gitleaks $*" >> "${repo.log}"`,
    `[ "$1" = "version" ] && echo "v${PINNED}" && exit 0`,
    `if [ "$1" = "dir" ]; then find . -type f | sort > "${repo.list}"; exit ${dirExit}; fi`,
    'exit 0',
  ].join('\n') + '\n', { mode: 0o755 });
}

describe('the secret scan judges uncommitted changes, not only history', () => {
  // Defect caught: a credential in a new or modified file passes the full local run
  // because only committed history is scanned; or ignored trees, deleted files and
  // unchanged files are swept in; or the copy is left behind in the temp directory.
  it('scans exactly the changed and new files a commit would carry, and cleans up', () => {
    const repo = scanRepo();
    try {
      nativeScanner(repo, 0);
      const res = runIn(repo);
      expect(res.status, res.stderr).toBe(0);
      expect(fs.readFileSync(repo.list, 'utf8').trim().split('\n')).toEqual(['./src/changed.ts', './src/new.ts']);
      expect(fs.readdirSync(path.join(repo.root, 'tmp'))).toEqual([]);
    } finally {
      removeScratch(repo.root);
    }
  });

  // Defect caught: a finding in an uncommitted file is reported but the run still
  // passes, so the full local gate stays green over a leak the push gate refuses.
  it('fails the run on a finding in an uncommitted file while history is clean', () => {
    const repo = scanRepo();
    try {
      nativeScanner(repo, 1);
      const res = runIn(repo);
      expect(res.status, res.stderr).toBe(1);
      expect(res.stderr).toContain('SECRET SCAN FAILED on uncommitted changes');
    } finally {
      removeScratch(repo.root);
    }
  });

  // Defect caught: the container path skips the working-tree pass or swallows its
  // finding, so a workstation without the native binary keeps the blind spot.
  it('runs the working-tree pass in the pinned container and fails on its finding', () => {
    const repo = scanRepo();
    try {
      fs.writeFileSync(path.join(repo.bin, 'docker'), [
        '#!/bin/sh',
        `echo "docker $*" >> "${repo.log}"`,
        '[ "$1" = "info" ] && exit 0',
        'case "$*" in *" dir ."*) exit 1 ;; esac',
        'exit 0',
      ].join('\n') + '\n', { mode: 0o755 });
      const res = runIn(repo);
      expect(res.status, res.stderr).toBe(1);
      expect(res.calls).toMatch(/^docker run .*:\/scan:ro .*@sha256:\S+ dir \. /m);
    } finally {
      removeScratch(repo.root);
    }
  });

  // Defect caught: a clean tree starts a pointless scan of an empty directory, or
  // says nothing, so a reader cannot tell the pass was considered.
  it('says there is nothing to scan when the tree matches the last commit', () => {
    const repo = scanRepo({ dirty: false });
    try {
      nativeScanner(repo, 1);
      const res = runIn(repo);
      expect(res.status, res.stderr).toBe(0);
      expect(res.stderr).toContain('no uncommitted changes to scan');
      expect(res.calls).not.toMatch(/^gitleaks dir/m);
    } finally {
      removeScratch(repo.root);
    }
  });
});
