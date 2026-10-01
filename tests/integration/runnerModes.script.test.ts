/**
 * What each mode of the local runner schedules, and where each row points.
 *
 * Contract: the runner has two local modes and one additive switch. The bare
 * command and --full are the same thorough run, and it reaches no deployed
 * environment at all: no staging row, no staging or production target. --quick is
 * exactly the fast pre-commit loop, and `npm run test:quick` is that mode, so the
 * list has one home. --staging adds exactly four read-only rows, every one of them
 * pointed at staging, whatever the operator's shell exports.
 *
 * Driven through --plan, which prints each row the run would schedule with its
 * target and exits before anything else happens, so the cases read what the
 * runner would actually do rather than grepping its source.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNNER = join(REPO_ROOT, 'run_all_tests.sh');
const scratch = createScratchDir('runner-modes');
afterAll(() => removeScratch(scratch));

const STAGING_ROWS = ['staging-aws-smoke', 'staging-realdata-invariants', 'staging-route-smoke', 'staging-browser'];
const QUICK_ROWS = ['build', 'lint', 'conventions', 'harness', 'generated-content', 'secret-scan', 'unit', 'integration'];

interface Plan { status: number | null; out: string; rows: Array<{ name: string; target: string }> }

function plan(args: string[], extraEnv: Record<string, string> = {}): Plan {
  const res = spawnSync('bash', [RUNNER, ...args, '--plan'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: scratch, ...extraEnv },
    ...SPAWN_GUARD,
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  const body = out.slice(out.indexOf('--plan'));
  const rows = body
    .split('\n')
    .map((l) => /^ {2}([a-z0-9-]+)\s{2,}(\S.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ name: m[1], target: m[2] }));
  return { status: res.status, out, rows };
}

describe('the default run and --full', () => {
  // Defect caught: a developer's thorough local run contacts staging, reading
  // from or writing to a deployed host, or the bare command quietly runs
  // something other than --full.
  it('schedule the same rows, none of them a staging row or a deployed target', () => {
    const bare = plan([]);
    const full = plan(['--full']);
    expect(bare.status, bare.out).toBe(0);
    expect(full.status, full.out).toBe(0);
    expect(bare.rows.length).toBeGreaterThan(10);
    expect(bare.rows).toEqual(full.rows);
    for (const row of full.rows) {
      expect(row.name.startsWith('staging-'), row.name).toBe(false);
      expect(row.target, row.name).not.toMatch(/staging|production/);
    }
    expect(full.rows.map((r) => r.name)).toEqual(expect.arrayContaining(['e2e', 'terraform', 'security-probes', 'clean-room']));
  });

  // Defect caught: --plan does its planning after the runner has already
  // installed hooks, swept artifacts and wiped the last run's logs.
  it('prints the plan before any side effect, leaving the last run’s logs where they were', () => {
    const lastRun = join(scratch, 'footbag-run-all-last');
    mkdirSync(lastRun, { recursive: true });
    writeFileSync(join(lastRun, 'marker.log'), 'from the previous run\n');
    const res = plan(['--full']);
    expect(res.status, res.out).toBe(0);
    expect(existsSync(join(lastRun, 'marker.log'))).toBe(true);
    expect(res.out).not.toContain('preflight');
  });
});

describe('--quick', () => {
  // Defect caught: the fast loop and the pre-commit script drift apart, so a
  // secret or a harness break that one of them catches the other lets through.
  it('schedules exactly the fast pre-commit set, which is what npm run test:quick runs', () => {
    const quick = plan(['--quick']);
    expect(quick.status, quick.out).toBe(0);
    expect(quick.rows.map((r) => r.name)).toEqual(QUICK_ROWS);
    for (const row of quick.rows) expect(row.target, row.name).toBe('local');
    const scripts = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts as Record<string, string>;
    expect(scripts['test:quick']).toBe('./run_all_tests.sh --quick');
  });
});

describe('the mode the run announces', () => {
  // Defect caught: a quick run, or a plain run, announces itself as a mode it is
  // not, so the reader trusts a verdict for checks that never ran.
  it('names the mode each switch selects', () => {
    expect(plan([]).out).toContain('mode: full)');
    expect(plan(['--quick']).out).toContain('mode: quick)');
    expect(plan(['--quick', '--staging']).out).toContain('mode: quick+staging)');
  });
});

describe('the dependency audit', () => {
  // Defect caught: every full run spends time on a report-only check that can
  // never fail it and that CI already reports on every push, or the switch meant
  // for a production deploy no longer schedules it.
  it('runs only when --audit asks for it', () => {
    expect(plan([]).rows.map((r) => r.name)).not.toContain('audit');
    expect(plan(['--quick']).rows.map((r) => r.name)).not.toContain('audit');
    expect(plan(['--audit']).rows.map((r) => r.name)).toContain('audit');
  });
});

describe('the ZAP scan', () => {
  /** gate_pentest from the runner, with an npm on PATH that records its arguments. */
  function pentestArgs(zap: 0 | 1): string {
    const dir = join(scratch, `zap-${zap}`);
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    const log = join(dir, 'npm.log');
    writeFileSync(join(bin, 'npm'), `#!/usr/bin/env bash\necho "$*" >> ${JSON.stringify(log)}\n`, { mode: 0o755 });
    const fn = spawnSync('sed', ['-n', '/^gate_pentest() {/,/^}/p', RUNNER], { encoding: 'utf8', ...SPAWN_GUARD }).stdout;
    const res = spawnSync('bash', ['-c', `reclaim_port() { :; }\nZAP=${zap}\n${fn}\ngate_pentest`], {
      encoding: 'utf8', env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` }, ...SPAWN_GUARD,
    });
    expect(res.status, res.stderr).toBe(0);
    return existsSync(log) ? readFileSync(log, 'utf8').trim() : '';
  }

  // Defect caught: every full run spends its longest stretch on a report-only
  // scan that decides nothing, or the switch meant for a production deploy stops
  // running the scan at all.
  it('leaves the ZAP scan out of the pentest row unless --zap asks for it', () => {
    expect(pentestArgs(0)).toBe('run test:pentest:heavy -- --no-zap');
    expect(pentestArgs(1)).toBe('run test:pentest:heavy');
  });

  // Defect caught: the scan a production deploy needs has no switch to run it by.
  it('offers the scan as a switch of its own', () => {
    const helpText = spawnSync('bash', [RUNNER, '--help'], { encoding: 'utf8', ...SPAWN_GUARD }).stdout;
    expect(helpText).toMatch(/--zap\s+The OWASP ZAP scan/);
  });
});

describe('--skip-py', () => {
  // Defect caught: the switch drops rows from --full beyond the Python gates,
  // or never reaches the clean room, where every Python gate of a full run lives.
  it('keeps every --full row and hands the switch to the clean room', () => {
    const full = plan(['--full']);
    const noPy = plan(['--full', '--skip-py']);
    expect(noPy.status, noPy.out).toBe(0);
    expect(noPy.rows.map((r) => r.name)).toEqual(full.rows.map((r) => r.name));
    expect(noPy.rows.find((r) => r.name === 'clean-room')?.target).toContain('--skip-py');
    expect(full.rows.find((r) => r.name === 'clean-room')?.target).not.toContain('--skip-py');
    const runner = readFileSync(RUNNER, 'utf8');
    expect(runner).toMatch(/\(\( SKIP_PY == 1 \)\) && room_args\+=\(--skip-py\)/);
  });

  // Defect caught: the switch is accepted where it means nothing, or alongside
  // a suite that is nothing but Python, and the run reports on what it skipped.
  it('refuses --quick and --with-legacy-mirror', () => {
    for (const other of ['--quick', '--with-legacy-mirror']) {
      const res = plan(['--skip-py', other]);
      expect(res.status, res.out).toBe(1);
      expect(res.out).toContain('--skip-py is a --full switch');
    }
  });
});

describe('--staging', () => {
  // Defect caught: the staging switch adds a row that writes, points one at a
  // different environment, or changes what the local rows do.
  it('adds exactly the four read-only staging rows, every one pointed at staging', () => {
    const full = plan(['--full']);
    const staged = plan(['--full', '--staging']);
    expect(staged.status, staged.out).toBe(0);
    const added = staged.rows.filter((r) => !full.rows.some((f) => f.name === r.name));
    expect(added.map((r) => r.name).sort()).toEqual([...STAGING_ROWS].sort());
    for (const row of added) expect(row.target, row.name).toMatch(/^staging\b/);
    expect(staged.rows.filter((r) => !STAGING_ROWS.includes(r.name))).toEqual(full.rows);
  });

  // Defect caught: a production value left exported in the operator's shell
  // sends the staging smoke at the production account.
  it('still targets staging when the shell exports a production smoke target', () => {
    const staged = plan(['--staging'], { SMOKE_TARGET_ENV: 'production', SMOKE_ENV: 'production' });
    expect(staged.status, staged.out).toBe(0);
    const stagingRows = staged.rows.filter((r) => STAGING_ROWS.includes(r.name));
    expect(stagingRows.length).toBe(4);
    for (const row of stagingRows) {
      expect(row.target, row.name).toMatch(/^staging\b/);
      expect(row.target, row.name).not.toContain('production');
    }
  });
});
