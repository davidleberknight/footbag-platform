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
  // Where verify-account-baseline.sh --save writes, derived from TMPDIR, which
  // the run helper points at this test's own directory.
  mkdirSync(join(dir, `footbag-baseline-${process.getuid!()}`), { mode: 0o700 });
  baseline = join(dir, `footbag-baseline-${process.getuid!()}`, 'baseline-2026-10-04.txt');
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

/**
 * The aws CLI the chain is proved with: answers the account, and an assume-role
 * of the staging runtime role with the session it was asked for, or lands on
 * `chainLandsOn` instead, or is refused when `chainRefused` is set.
 */
function aws(opts: { chainLandsOn?: string; chainRefused?: boolean } = {}): string {
  // Named for its answers, so a variant is never overwritten by the default the
  // run helper writes alongside it.
  const path = join(dir, `aws-${opts.chainRefused ? 'refused' : (opts.chainLandsOn ?? 'runtime')}`);
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf 'aws %s %s\\n' "$1" "$2" >> ${JSON.stringify(join(dir, 'calls.log'))}`,
      '[[ "$2" == get-caller-identity ]] && { echo 000000000000; exit 0; }',
      'session=""; role=""; prev=""',
      'for a in "$@"; do [[ "$prev" == --role-session-name ]] && session="$a"; [[ "$prev" == --role-arn ]] && role="${a##*/}"; prev="$a"; done',
      opts.chainRefused ? 'echo "An error occurred (AccessDenied) when calling the AssumeRole operation" >&2; exit 254' : '',
      `echo "arn:aws:sts::000000000000:assumed-role/${opts.chainLandsOn ?? '${role}'}/\${session}"`,
    ].join('\n'),
    { mode: 0o755 },
  );
  return path;
}

function env(exits: Partial<Record<string, number>> = {}): Record<string, string> {
  return {
    ...NO_AWS_CREDENTIALS,
    HOME: home,
    TMPDIR: dir,
    PROVE_WRAP_CMD: wrap(),
    PROVE_AWS_BIN: aws(),
    PROVE_APPLY_CMD: step('apply', exits.apply),
    PROVE_DEPLOY_CMD: step('deploy', exits.deploy),
    PROVE_RUNNER_CMD: step('runner', exits.runner),
    PROVE_DENIALS_CMD: step('denials', exits.denials),
    PROVE_BASELINE_CMD: step('baseline', exits.baseline),
    PROVE_VERIFY_CMD: step('verify', exits.verify),
  };
}

function run(
  terminal: string,
  argv: string[] = ['--account', ACCOUNT],
  exits: Partial<Record<string, number>> = {},
  extra: Record<string, string> = {},
) {
  const cred = join(dir, 'cred');
  writeFileSync(cred, `${PASSWORD}\n`, { mode: 0o600 });
  const inner = ['bash', JSON.stringify(SCRIPT), ...argv.map((a) => JSON.stringify(a)), '<', JSON.stringify(cred)].join(' ');
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: terminal,
    env: { ...process.env, ...env(exits), ...extra },
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
      env: { ...process.env, ...env(), TMPDIR: join(dir, 'empty-tmp') },
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
    expect(r.out).toContain(`chained into arn:aws:sts::000000000000:assumed-role/footbag-staging-app-runtime/${ACCOUNT}`);
    const lines = log().split('\n').filter(Boolean);
    expect(lines).toEqual([
      `wrap --account ${ACCOUNT}`,
      'aws sts get-caller-identity',
      `wrap --account ${ACCOUNT}`,
      'aws sts assume-role',
      `wrap --account ${ACCOUNT}`,
      'apply --target staging --require-empty-plan | stdin=',
      `wrap --account ${ACCOUNT}`,
      'deploy --target staging -n | stdin=',
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
    const newer = join(dir, `footbag-baseline-${process.getuid!()}`, 'baseline-2026-10-04-2.txt');
    writeFileSync(newer, 'operator.id\tAIDAFIXTURE\n', { mode: 0o600 });
    utimesSync(baseline, new Date('2026-10-04T08:00:00Z'), new Date('2026-10-04T08:00:00Z'));
    utimesSync(newer, new Date('2026-10-04T09:00:00Z'), new Date('2026-10-04T09:00:00Z'));
    const r = run('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(log()).toContain(`baseline --compare ${newer} `);
  });

  it('proves the job role\'s own chain into the runtime role, and stops when it is refused', () => {
    // On a machine that also holds footbag-operator, the workstation's runtime
    // profile chains from footbag-operator, so only a direct assume-role from
    // the job-role session proves the job role's chain.
    const r = run('APPLY\n', ['--account', ACCOUNT], {}, { PROVE_AWS_BIN: aws({ chainRefused: true }) });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/FAILED at step 1: the job role could not assume the staging runtime role/);
    expect(log()).not.toMatch(/^apply/m);
  });

  it('stops when the chain lands on any role but the staging runtime role', () => {
    const r = run('APPLY\n', ['--account', ACCOUNT], {}, { PROVE_AWS_BIN: aws({ chainLandsOn: 'footbag-production-app-runtime' }) });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/the chain landed on \S+footbag-production-app-runtime\S*, not footbag-staging-app-runtime/);
    expect(log()).not.toMatch(/^apply/m);
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

describe('prove-dev-tester-role.sh --checks-only — the denials and the baseline alone', () => {
  /** No terminal and nothing on stdin: the checks are reads and need neither. */
  function checks(argv: string[], exits: Partial<Record<string, number>> = {}, extra: Record<string, string> = {}) {
    const r = spawnSync('bash', [SCRIPT, '--checks-only', ...argv], {
      encoding: 'utf-8',
      input: '',
      env: { ...process.env, ...env(exits), ...extra },
      ...SPAWN_GUARD,
    });
    return { status: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
  }

  it('with no account, runs only the two read-only checks and leaves no user\'s key out', () => {
    const r = checks([]);
    expect(r.status, r.out + r.err).toBe(0);
    expect(r.out).toMatch(/CHECKED/);
    expect(log().split('\n').filter(Boolean)).toEqual(['denials  | stdin=', `baseline --compare ${baseline} | stdin=`]);
  });

  it('with an account, leaves out that account\'s own key and nothing else', () => {
    const r = checks(['--account', ACCOUNT]);
    expect(r.status, r.out + r.err).toBe(0);
    expect(log().split('\n').filter(Boolean)).toEqual(['denials  | stdin=', `baseline --compare ${baseline} --ignore-user ${ACCOUNT} | stdin=`]);
  });

  it('fails when a denial does not hold, comparing nothing after it', () => {
    const r = checks([], { denials: 1 });
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/a denial the role must carry did not hold/);
    expect(log()).not.toMatch(/^baseline/m);
  });

  it('fails and says so when something administrative changed since the baseline', () => {
    const r = checks([], { baseline: 3 });
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/something administrative CHANGED since the baseline/);
    expect(r.out).not.toMatch(/CHECKED/);
  });

  it('refuses a resume point, a malformed account and a missing baseline, running nothing', () => {
    expect(checks(['--from-step', '4']).status).toBe(2);
    expect(checks(['--account', 'David']).status).toBe(2);
    expect(checks(['--account', 'footbag-operator']).status).toBe(2);
    const none = checks([], {}, { TMPDIR: join(dir, 'empty-tmp') });
    expect(none.status).toBe(2);
    expect(none.err).toMatch(/verify-account-baseline\.sh --save/);
    expect(log()).toBe('');
  });
});
