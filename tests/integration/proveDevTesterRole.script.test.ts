/**
 * scripts/prove-dev-tester-role.sh — one run proving a named dev-and-tester can
 * do the staging job through the job role, and that nothing administrative moved.
 *
 * Every step is a stub that records how it was called and what reached its
 * standard input. What is pinned: the order, that the three staging steps run
 * through the wrapper as the account, that only the read-back is given the
 * shared sudo password, that the comparison leaves out this account's key and
 * nothing else, and that a failing step stops the run and names where to resume.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/prove-dev-tester-role.sh');
const ACCOUNT = 'david_leberknight';
const PASSWORD = 'fixture-shared-sudo-password';

let dir: string;
let home: string;
let baseline: string;

beforeEach(() => {
  dir = createScratchDir('prove-dev-tester');
  home = join(dir, 'home');
  mkdirSync(join(home, 'AWS'), { recursive: true });
  baseline = join(home, 'AWS', 'baseline-2026-10-04.txt');
  writeFileSync(baseline, 'operator.id\tAIDAFIXTURE\n', { mode: 0o600 });
});

afterEach(() => {
  removeScratch(dir);
});

const log = () => (existsSync(join(dir, 'calls.log')) ? readFileSync(join(dir, 'calls.log'), 'utf-8') : '');

/** A step that records its name, its arguments and its stdin, and exits as told. */
function step(name: string, exit = 0): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `in="$(cat)"`,
      `printf '%s %s | stdin=%s\\n' ${JSON.stringify(name)} "$*" "$in" >> ${JSON.stringify(join(dir, 'calls.log'))}`,
      `exit ${exit}`,
    ].join('\n'),
    { mode: 0o755 },
  );
  return path;
}

/** The wrapper: records the account, then runs the wrapped command as given. */
function wrap(): string {
  const path = join(dir, 'wrap');
  writeFileSync(
    path,
    ['#!/usr/bin/env bash', `printf 'wrap %s %s\\n' "$1" "$2" >> ${JSON.stringify(join(dir, 'calls.log'))}`, 'shift 2', 'exec "$@"'].join('\n'),
    { mode: 0o755 },
  );
  return path;
}

function env(exits: Partial<Record<string, number>> = {}): Record<string, string> {
  return {
    ...NO_AWS_CREDENTIALS,
    HOME: home,
    PROVE_WRAP_CMD: wrap(),
    PROVE_APPLY_CMD: step('apply', exits.apply),
    PROVE_DEPLOY_CMD: step('deploy', exits.deploy),
    PROVE_RUNNER_CMD: step('runner', exits.runner),
    PROVE_DENIALS_CMD: step('denials', exits.denials),
    PROVE_BASELINE_CMD: step('baseline', exits.baseline),
    PROVE_VERIFY_CMD: step('verify', exits.verify),
  };
}

function run(terminal: string, argv: string[] = ['--account', ACCOUNT], exits: Partial<Record<string, number>> = {}) {
  const cred = join(dir, 'cred');
  writeFileSync(cred, `${PASSWORD}\n`, { mode: 0o600 });
  const inner = ['bash', JSON.stringify(SCRIPT), ...argv.map((a) => JSON.stringify(a)), '<', JSON.stringify(cred)].join(' ');
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: terminal,
    env: { ...process.env, ...env(exits) },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: r.stdout ?? '' };
}

describe('prove-dev-tester-role.sh — refused before anything runs', () => {
  it('refuses footbag-operator and the shared account, which are not named identities', () => {
    for (const name of ['footbag-operator', 'footbag']) {
      const r = spawnSync('bash', [SCRIPT, '--account', name], { encoding: 'utf-8', input: '', env: { ...process.env, ...env() }, ...SPAWN_GUARD });
      expect(r.status, name).toBe(2);
    }
    expect(log()).toBe('');
  });

  it('refuses without a saved baseline, rather than claiming an invariant it never checked', () => {
    const r = spawnSync('bash', [SCRIPT, '--account', ACCOUNT], {
      encoding: 'utf-8',
      input: '',
      env: { ...process.env, ...env(), HOME: join(dir, 'empty-home') },
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/verify-account-baseline\.sh --save/);
    expect(log()).toBe('');
  });

  it('refuses with no terminal, since the deploy is confirmed by a typed word', () => {
    const r = spawnSync('bash', [SCRIPT, '--account', ACCOUNT], { encoding: 'utf-8', input: `${PASSWORD}\n`, env: { ...process.env, ...env() }, ...SPAWN_GUARD });
    expect(r.status).toBe(1);
    expect(log()).toBe('');
  });

  it('runs nothing without the typed APPLY', () => {
    const r = run('no\n');
    expect(r.status).toBe(1);
    expect(log()).toBe('');
  });
});

describe('prove-dev-tester-role.sh — a whole run', () => {
  it('runs the six steps in order, the staging three as the account, and only the read-back gets the password', () => {
    const r = run('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/PROVED/);
    const lines = log().split('\n').filter(Boolean);
    expect(lines).toEqual([
      `wrap --account ${ACCOUNT}`,
      'apply --target staging --require-empty-plan | stdin=',
      `wrap --account ${ACCOUNT}`,
      'deploy --target staging | stdin=',
      `wrap --account ${ACCOUNT}`,
      'runner --quick --staging | stdin=',
      'denials  | stdin=',
      `baseline --compare ${baseline} --ignore-user ${ACCOUNT} | stdin=`,
      `verify --verify --target staging --account ${ACCOUNT} | stdin=${PASSWORD}`,
    ]);
  });

  it('compares against the most recently saved baseline, not the last by name', () => {
    // A second save on one day is named with a counter, which sorts before the
    // first; the time it was written is what says which is newer.
    const newer = join(home, 'AWS', 'baseline-2026-10-04-2.txt');
    writeFileSync(newer, 'operator.id\tAIDAFIXTURE\n', { mode: 0o600 });
    utimesSync(baseline, new Date('2026-10-04T08:00:00Z'), new Date('2026-10-04T08:00:00Z'));
    utimesSync(newer, new Date('2026-10-04T09:00:00Z'), new Date('2026-10-04T09:00:00Z'));
    const r = run('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(log()).toContain(`baseline --compare ${newer} `);
  });

  it('stops at a failing step, runs nothing after it, and names where to resume', () => {
    const r = run('APPLY\n', ['--account', ACCOUNT], { runner: 1 });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/FAILED at step 3/);
    expect(r.out).toMatch(/--from-step 3/);
    expect(log()).not.toMatch(/^denials|^baseline|^verify/m);
  });

  it('fails and says so when something administrative changed since the baseline', () => {
    const r = run('APPLY\n', ['--account', ACCOUNT], { baseline: 3 });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/something administrative CHANGED since the baseline/);
    expect(log()).not.toMatch(/^verify/m);
  });

  it('reports pending, with the step to re-run, when the acceptance is not yet in the trail', () => {
    const r = run('APPLY\n', ['--account', ACCOUNT], { verify: 3 });
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/--from-step 6/);
  });

  it('resumes from the step named, running nothing before it', () => {
    const r = run('APPLY\n', ['--account', ACCOUNT, '--from-step', '6']);
    expect(r.status, r.out).toBe(0);
    expect(log().split('\n').filter(Boolean)).toEqual([`verify --verify --target staging --account ${ACCOUNT} | stdin=${PASSWORD}`]);
  });
});
