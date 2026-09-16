/**
 * The workstation cleanup collects abandoned artifacts, and under --stale-only
 * it leaves alone what a run still in progress is using.
 *
 * Why the distinction is load-bearing: the temp-directory targets are shared
 * with every vitest and Playwright session on the machine, not owned by the
 * checkout the script runs in. The runner sweeps automatically at startup, so
 * starting a second run while one is going deleted the live run's databases
 * mid-suite. That damage does not announce itself as a deletion. An already-open
 * SQLite handle keeps working on the unlinked file, so only a suite that opens a
 * fresh connection afterwards notices, and what it reports is a missing table,
 * in whichever suite happened to be between tests. The cause reads as a schema
 * fault with nothing pointing back at the sweep.
 *
 * Both halves are pinned here: the flag spares what is young, the bare
 * invocation still empties the directory now, because that is what an operator
 * reaching for this script by hand is asking for.
 *
 * Every case runs against a throwaway project root and a throwaway temp
 * directory, so no case can delete an artifact belonging to the suite running
 * it. The temp directory is supplied through the environment, which is also how
 * the script and the test tiers agree on which directory they are both talking
 * about.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'clean_up_rubbish.sh');

/** Comfortably past the two-hour window the script treats as possibly live. */
const ABANDONED_AGE_MS = 3 * 60 * 60 * 1000;

let projectRoot: string;
let tmpRoot: string;

/** A file under the throwaway temp directory, aged to taste. */
function makeArtifact(name: string, ageMs: number): string {
  const full = join(tmpRoot, name);
  closeSync(openSync(full, 'w'));
  const seconds = (Date.now() - ageMs) / 1000;
  utimesSync(full, seconds, seconds);
  return full;
}

function run(args: string[] = []): { status: number; stdout: string; stderr: string } {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    cwd: projectRoot,
    // The temp directory is the one thing these cases substitute. PATH is passed
    // because the script reaches for find, du and numfmt.
    env: { PATH: process.env.PATH ?? '', TMPDIR: tmpRoot },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

beforeEach(() => {
  // The script refuses to delete anywhere that is not this project, so the
  // throwaway root carries the marks it checks for.
  projectRoot = createScratchDir('rubbish-project-root');
  for (const dir of ['scripts', 'tests', 'src']) {
    mkdirSync(join(projectRoot, dir), { recursive: true });
  }
  writeFileSync(join(projectRoot, 'package.json'), '{\n  "name": "footbag-platform"\n}\n');
  tmpRoot = createScratchDir('rubbish-tmp-root');
});

afterEach(() => {
  removeScratch(projectRoot);
  removeScratch(tmpRoot);
});

describe('the sweep with --stale-only', () => {
  it('spares a test database a live run could still be writing to', () => {
    const live = makeArtifact('footbag-test-3093-live.db', 0);

    const res = run(['--stale-only']);

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(live)).toBe(true);
  });

  it('still collects a test database no run can still own', () => {
    const abandoned = makeArtifact('footbag-test-3093-abandoned.db', ABANDONED_AGE_MS);

    const res = run(['--stale-only']);

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(abandoned)).toBe(false);
  });

  it('applies the same split to the browser tier artifacts', () => {
    const live = makeArtifact('footbag-e2e-live.db', 0);
    const abandoned = makeArtifact('footbag-e2e-abandoned.db', ABANDONED_AGE_MS);

    const res = run(['--stale-only']);

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(live)).toBe(true);
    expect(existsSync(abandoned)).toBe(false);
  });

  it('says what it spared, so a short total is not read as nothing to do', () => {
    makeArtifact('footbag-test-3093-live.db', 0);

    const res = run(['--stale-only']);

    expect(res.stdout).toMatch(/1 spared, a live run may own them/);
  });

  it('leaves this checkout\'s own build output to be collected whatever its age', () => {
    // The guard is about artifacts another run owns. A stale build directory in
    // the checkout the run is about to use is exactly what the sweep is for, and
    // sparing it would leave the next build reading the previous one's output.
    const dist = join(projectRoot, 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'app.js'), 'export {};\n');

    const res = run(['--stale-only']);

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(dist)).toBe(false);
  });

  it('removes nothing at all when the preview flag is on as well', () => {
    const abandoned = makeArtifact('footbag-test-3093-abandoned.db', ABANDONED_AGE_MS);

    const res = run(['--stale-only', '--dry-run']);

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(abandoned)).toBe(true);
  });
});

describe('the sweep an operator runs by hand', () => {
  it('empties the temp directory now, including what a run may still own', () => {
    const live = makeArtifact('footbag-test-3093-live.db', 0);
    const abandoned = makeArtifact('footbag-test-3093-abandoned.db', ABANDONED_AGE_MS);

    const res = run();

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(live)).toBe(false);
    expect(existsSync(abandoned)).toBe(false);
  });

  it('refuses an argument it does not know rather than guessing', () => {
    const res = run(['--stale']);

    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/unknown argument/);
  });
});

describe('the runner never sweeps what another run is using', () => {
  it('passes the sparing flag on its automatic startup sweep', () => {
    // This is the pin that matters: the defect was not in the script, it was a
    // bare invocation from a runner that starts whenever an operator asks for a
    // second run.
    const runner = readFileSync(join(REPO_ROOT, 'run_all_tests.sh'), 'utf8');
    const invocations = runner
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .filter((line) => line.includes('clean_up_rubbish.sh'));

    expect(invocations.length).toBe(1);
    expect(invocations[0]).toMatch(/clean_up_rubbish\.sh --stale-only/);
  });
});
