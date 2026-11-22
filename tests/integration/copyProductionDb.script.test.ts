/**
 * The production copy script replaces a host's copy only after a clean build,
 * and leaves nothing holding member data or credentials behind otherwise.
 *
 * The host half is driven directly, as its wrapper sends it, with the host root
 * moved to a scratch directory and docker replaced by a stand-in that plays the
 * copy builder: it records how it was run and ends the way a case asks, a clean
 * build, a refusal, or a reported success that left no file. What decides the
 * outcome, the builder's own last line and the file it left, comes from a real
 * run of the half. The wrapper's own refusals are driven through the wrapper.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WRAPPER = 'scripts/copy-production-db.sh';
const HALF = path.join(REPO_ROOT, 'scripts/internal/copy-production-db-remote.sh');
const REPORT_LIB = path.join(REPO_ROOT, 'scripts/lib/closing-report-remote.sh');

const scratch = createScratchDir('copy-production-db');
const srv = path.join(scratch, 'srv');
const dbDir = path.join(srv, 'db');
const copyDir = path.join(dbDir, 'production-copy');
const copyFile = path.join(copyDir, 'footbag-copy.db');
const buildFile = path.join(copyDir, 'build.db');
const argsLog = path.join(scratch, 'compose-args.txt');
const stub = path.join(scratch, 'docker-stub.sh');

// The stand-in for docker: logs its arguments, then acts as the builder would
// for the mode the case sets.
fs.writeFileSync(stub, `#!/usr/bin/env bash
printf '%s\\n' "$@" > ${JSON.stringify(argsLog)}
case "$STUB_MODE" in
  ok)
    printf 'new copy' > ${JSON.stringify(buildFile)}
    echo 'production-copy: copied members 3'
    echo 'production-copy: ok' ;;
  refused)
    printf 'half built' > ${JSON.stringify(buildFile)}
    printf 'credentials' > ${JSON.stringify(path.join(copyDir, 'snapshot-4242.db'))}
    echo 'production-copy: refused: column members.recovery_code is not in the register' >&2
    exit 1 ;;
  ok-no-file)
    echo 'production-copy: ok' ;;
esac
`, { mode: 0o755 });

function runHalf(mode: string) {
  return spawnSync('bash', ['-c', `cat "$0" "$1" | bash`, REPORT_LIB, HALF], {
    cwd: REPO_ROOT,
    env: { ...process.env, COPY_SRV_DIR: srv, COPY_COMPOSE_BIN: stub, STUB_MODE: mode },
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
}

beforeEach(() => {
  fs.rmSync(srv, { recursive: true, force: true });
  fs.rmSync(argsLog, { force: true });
  fs.mkdirSync(copyDir, { recursive: true });
  fs.writeFileSync(path.join(dbDir, 'footbag.db'), 'live database');
  fs.writeFileSync(copyFile, 'previous copy');
});

afterAll(() => removeScratch(scratch));

describe('copy-production-db host half', () => {
  // Defect caught: a finished copy never replaces the previous one, or lands
  // readable by other accounts on the host.
  it('replaces the previous copy with a clean build, private to its owner', () => {
    // A snapshot an interrupted earlier run left behind.
    fs.writeFileSync(path.join(copyDir, 'snapshot-1111.db'), 'stale credentials');
    const res = runHalf('ok');
    expect(res.status, res.stderr).toBe(0);
    expect(fs.readFileSync(copyFile, 'utf-8')).toBe('new copy');
    expect(fs.statSync(copyFile).mode & 0o777).toBe(0o600);
    expect(fs.statSync(copyDir).mode & 0o777).toBe(0o700);
    expect(fs.readdirSync(copyDir)).toEqual(['footbag-copy.db']);
    expect(res.stdout).toContain(`COPY_PATH=${copyFile}`);
  });

  // Defect caught: the builder is run against the live database as its own
  // database, or built from an image the host fetches or builds on the spot.
  it('runs the builder into the build file, from the live database, with the deployed image only', () => {
    runHalf('ok');
    const args = fs.readFileSync(argsLog, 'utf-8').split('\n');
    expect(args).toContain('FOOTBAG_DB_PATH=/app/db/production-copy/build.db');
    expect(args.slice(args.indexOf('--source'), args.indexOf('--source') + 2)).toEqual(['--source', '/app/db/footbag.db']);
    expect(args.slice(args.indexOf('--pull'), args.indexOf('--pull') + 2)).toEqual(['--pull', 'never']);
    expect(args).toContain('--no-deps');
  });

  // Defect caught: a refused build replaces the copy, or leaves its half-built
  // file and the unstripped snapshot on the host.
  it('keeps the previous copy on a refused build and removes the build and the snapshot', () => {
    const res = runHalf('refused');
    expect(res.status).not.toBe(0);
    expect(fs.readFileSync(copyFile, 'utf-8')).toBe('previous copy');
    expect(fs.readdirSync(copyDir)).toEqual(['footbag-copy.db']);
    expect(res.stderr).toContain('column members.recovery_code is not in the register');
  });

  // Defect caught: a builder that says ok but wrote nothing is taken at its
  // word, and the previous copy is moved aside for nothing.
  it('refuses a reported success that left no file, keeping the previous copy', () => {
    const res = runHalf('ok-no-file');
    expect(res.status).not.toBe(0);
    expect(fs.readFileSync(copyFile, 'utf-8')).toBe('previous copy');
  });

  // Defect caught: a host with no database runs the builder anyway.
  it('refuses a host with no live database before running the builder', () => {
    fs.rmSync(path.join(dbDir, 'footbag.db'));
    const res = runHalf('ok');
    expect(res.status).not.toBe(0);
    expect(fs.existsSync(argsLog)).toBe(false);
    expect(fs.readFileSync(copyFile, 'utf-8')).toBe('previous copy');
  });
});

describe('copy-production-db wrapper', () => {
  function runWrapper(args: string[]) {
    return spawnSync('bash', [WRAPPER, ...args], {
      cwd: REPO_ROOT, input: '', encoding: 'utf-8', ...SPAWN_GUARD,
    });
  }

  // Defect caught: a run with no environment named, or a misspelt one, reaches
  // a host at all.
  it('refuses a missing or unknown target before reaching any host', () => {
    expect(runWrapper([]).status).toBe(2);
    expect(runWrapper(['--target', 'prod']).status).toBe(2);
  });

  // Defect caught: the target guard refuses the real environments too.
  it('accepts staging past the target guard, stopping later for want of a host', () => {
    const res = runWrapper(['--target', 'staging']);
    expect(res.status).not.toBe(2);
    expect(res.stderr).not.toMatch(/--target/);
  });
});
