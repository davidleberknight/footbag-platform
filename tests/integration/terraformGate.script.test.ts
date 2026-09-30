/**
 * The terraform gate reaches AWS not at all, proved against what terraform is handed.
 *
 * `gate_terraform` in run_all_tests.sh used to run `terraform init -backend=false`,
 * believing the flag made the init offline. It does not. Terraform's own help says
 * it "disables backend initialization for this configuration and uses what was
 * previously initialized instead", so in a tree where an operator has run a real
 * `terraform init`, the .terraform left behind holds the S3 state backend and init
 * loads it and calls STS. The gate therefore made a live AWS call on every local
 * run from the day it was written, and nobody could tell, because a passing
 * credential check looks exactly like no credential check. It surfaced months later
 * as `FAILED gates (1): terraform` on the day the operator's access key was rotated:
 * a credential outage reported as a terraform verdict, against a configuration that
 * was valid the whole time.
 *
 * The fix runs every terraform invocation through `aws_isolated_run` and initializes
 * into a throwaway TF_DATA_DIR, so there is no previous initialization to reuse. This
 * suite pins the outcome rather than the spelling: a stub terraform on PATH records
 * the environment and arguments it was actually handed, and the cases assert what
 * reached it. That is deliberate — a grep for `aws_isolated_run` would pass on a gate
 * that called it with the isolation already broken, and the conventions gate covers
 * the structural half.
 *
 * The ambient environment each case runs under carries a plausible live credential,
 * because the assertion that matters is that the isolation OVERRIDES what the
 * operator's shell supplies. A test run with no credentials present would pass
 * against the unfixed gate and prove nothing.
 *
 * A stub also means these cases need no terraform binary, so they run on every
 * machine and on the runner rather than skipping into a silent green.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { committedFiles } from '../fixtures/committedFiles';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNNER = join(REPO_ROOT, 'run_all_tests.sh');

/** One recorded terraform invocation: what it was called with, and under what. */
interface Invocation {
  argv: string[];
  env: Record<string, string>;
}

let workdir: string;
let invocations: Invocation[];
let gateStatus: number | null;
let gateStdout: string;
const workdirs: string[] = [];

/** What one run of the gate produced. */
interface GateRun {
  status: number | null;
  stdout: string;
  stderr: string;
  invocations: Invocation[];
}

/**
 * Run the real `gate_terraform` out of run_all_tests.sh against a stub terraform.
 *
 * The function is extracted rather than reimplemented, and the real isolation
 * library is sourced, so the code under test is the shipped code. Everything the
 * gate needs from its host script is supplied here: LOG_DIR, which the runner
 * creates under the OS tmpdir, and a working directory of the repository root,
 * which the runner reaches with its own `cd`.
 *
 * It is called the way `run_gate` calls every gate, with errexit off, because
 * that is the condition under which a step's failure has to be collected by the
 * gate itself or is lost. `fail` names one step the stub fails: `fmt`, or
 * `validate:<tree>`.
 */
function runGate(fail = ''): GateRun {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-terraform-gate-'));
  workdirs.push(dir);
  const stubDir = join(dir, 'bin');
  const logDir = join(dir, 'log');
  const record = join(dir, 'invocations.jsonl');
  mkdirSync(stubDir);
  mkdirSync(logDir);

  // The stub answers `command -v`, records what it was handed, and succeeds
  // unless this run names it as the step to fail. It writes the environment as
  // JSON so a case can assert on any variable without the stub deciding in
  // advance which ones matter.
  writeFileSync(
    join(stubDir, 'terraform'),
    '#!/usr/bin/env bash\n'
      + 'python3 -c \'import json,os,sys;'
      + 'open(os.environ["TF_STUB_RECORD"],"a").write('
      + 'json.dumps({"argv":sys.argv[1:],"env":dict(os.environ)})+"\\n")\' "$@"\n'
      + 'case "${TF_STUB_FAIL:-}" in\n'
      + '  fmt) [[ " $* " == *" fmt "* ]] && { echo "stub: fmt found unformatted files" >&2; exit 3; } ;;\n'
      + '  validate:*) [[ " $* " == *" validate "* && "$PWD" == */"${TF_STUB_FAIL#validate:}" ]] '
      + '&& { echo "stub: Error: invalid configuration" >&2; exit 1; } ;;\n'
      + 'esac\n'
      + 'exit 0\n',
    { mode: 0o755 },
  );

  const driver = join(dir, 'driver.sh');
  const gateBody = spawnSync(
    'sed',
    ['-n', '/^gate_terraform()/,/^}/p', RUNNER],
    { encoding: 'utf8', ...SPAWN_GUARD },
  ).stdout;

  writeFileSync(
    driver,
    'set -euo pipefail\n'
      + `cd ${JSON.stringify(REPO_ROOT)}\n`
      + 'source scripts/lib/aws-isolation.sh\n'
      + gateBody
      + `LOG_DIR=${JSON.stringify(logDir)}\n`
      // As run_gate calls it: errexit off, the gate's own status is the verdict.
      + 'set +e\n'
      + 'gate_terraform\n'
      + 'exit $?\n',
  );

  const res = spawnSync('bash', [driver], {
    encoding: 'utf8',
    env: {
      PATH: `${stubDir}:${process.env.PATH ?? ''}`,
      HOME: dir,
      TF_STUB_RECORD: record,
      TF_STUB_FAIL: fail,
      // A plausible live operator credential in the ambient shell. The isolation
      // has to overwrite every one of these; the unfixed gate would pass them
      // straight through to terraform.
      AWS_PROFILE: 'footbag-operator',
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI-K7MDENG-bPxRfiCYEXAMPLEKEY',
      AWS_SESSION_TOKEN: 'FwoGZXIvYXdzEXAMPLESESSIONTOKEN',
      AWS_EC2_METADATA_DISABLED: 'false',
    },
    ...SPAWN_GUARD,
  });

  return {
    status: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    invocations: existsSync(record)
      ? readFileSync(record, 'utf8')
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => JSON.parse(line) as Invocation)
      : [],
  };
}

beforeAll(() => {
  const run = runGate();
  workdir = workdirs[0];
  gateStatus = run.status;
  gateStdout = run.stdout;
  invocations = run.invocations;
});

afterAll(() => {
  for (const dir of workdirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * Every Terraform tree in the repository, enumerated rather than listed here.
 * The gate names its trees in a loop, so a tree added without being added to
 * that loop is never validated and nothing says so — the run stays green
 * because the gate simply does less. Counting the trees that exist is what
 * makes that visible.
 *
 * Counted from git rather than from the directory. The expectation below is an
 * exact arithmetic count, so an untracked experiment carrying its own
 * providers.tf would change the answer and fail a gate that had behaved
 * perfectly. A tree is part of this repository when it is committed, which is
 * also exactly the condition under which the gate's loop should have grown to
 * cover it.
 */
const TREES = committedFiles('terraform/*/providers.tf').map((rel) => rel.split('/')[1]);

describe('gate_terraform', () => {
  it('runs and invokes terraform for fmt and for every tree on disk', () => {
    expect(gateStatus).toBe(0);
    expect(TREES.length).toBeGreaterThanOrEqual(3);
    // fmt once, then init + validate for each tree.
    expect(invocations.length).toBe(1 + TREES.length * 2);
    expect(invocations.filter((i) => i.argv.includes('validate')).length).toBe(TREES.length);
    expect(invocations.filter((i) => i.argv.includes('init')).length).toBe(TREES.length);
  });

  // Defect caught: a passing gate leaves an empty log, so nobody reading it can
  // tell which stacks were covered or whether the loop ran at all.
  it('names every stack it validated in its log', () => {
    for (const tree of TREES) {
      expect(gateStdout, `no log line for ${tree}`).toContain(`terraform: ${tree} initialised and validated`);
    }
  });

  it('does not claim a stack whose validation failed', () => {
    const run = runGate(`validate:${TREES[0]}`);
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toContain(`terraform: ${TREES[0]} initialised and validated`);
  });

  it.each([
    ['AWS_PROFILE', 'footbag-test-nonexistent-profile'],
    ['AWS_CONFIG_FILE', '/dev/null'],
    ['AWS_SHARED_CREDENTIALS_FILE', '/dev/null'],
    ['AWS_ACCESS_KEY_ID', ''],
    ['AWS_SECRET_ACCESS_KEY', ''],
    ['AWS_SESSION_TOKEN', ''],
    ['AWS_EC2_METADATA_DISABLED', 'true'],
  ])('hands terraform %s=%j, overriding the operator credential in the shell', (key, value) => {
    expect(invocations.length).toBeGreaterThan(0);
    for (const invocation of invocations) {
      expect(invocation.env[key], `${invocation.argv.join(' ')} received ${key}`).toBe(value);
    }
  });

  // Defect caught: every run downloads every provider again for every stack,
  // hundreds of megabytes each time, because the only copy lived in a data
  // directory the run throws away; or the shared cache lands inside the
  // repository or the throwaway directory, where it is lost or tracked.
  it('shares one persistent provider cache outside the repository across every stack', () => {
    const inits = invocations.filter((i) => i.argv.includes('init'));
    expect(inits.length).toBe(TREES.length);
    const caches = new Set(inits.map((i) => i.env.TF_PLUGIN_CACHE_DIR));
    expect(caches.size, 'every stack uses the same cache').toBe(1);
    const cache = [...caches][0];
    expect(cache, 'the cache is set').toBeTruthy();
    expect(cache).toBe(join(workdir, '.terraform.d', 'plugin-cache'));
    expect(cache.startsWith(REPO_ROOT)).toBe(false);
    expect(cache.startsWith(join(workdir, 'log')), 'the cache sits in the throwaway directory').toBe(false);
    expect(existsSync(cache), 'the cache directory exists for terraform to fill').toBe(true);
  });

  it('initializes into a throwaway data directory, never the operator’s .terraform', () => {
    const inits = invocations.filter((i) => i.argv.includes('init'));
    expect(inits.length).toBe(TREES.length);
    for (const init of inits) {
      // Without this, `-backend=false` reuses whatever the operator initialized,
      // which is the entire defect: the S3 backend, and an STS call with it.
      expect(init.env.TF_DATA_DIR, 'init must redirect the data directory').toBeTruthy();
      expect(init.env.TF_DATA_DIR.startsWith(join(REPO_ROOT, 'terraform'))).toBe(false);
      expect(init.argv).toContain('-backend=false');
    }
  });

  // The gate runs with errexit off, so a step's failure is either collected by
  // the gate or lost, and the gate's status becomes the last tree's alone. That
  // is how a broken format check or a broken earlier tree reported PASS locally
  // while the push gate's terraform job went red.
  it('fails, naming the step, when the format check fails and every tree still passes', () => {
    const run = runGate('fmt');
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('fmt -check');
    // Every tree was still validated, so one run reports every failure.
    expect(run.invocations.filter((i) => i.argv.includes('validate')).length).toBe(TREES.length);
  });

  it('fails, naming the tree, when a tree other than the last one fails to validate', () => {
    const first = TREES.includes('staging') ? 'staging' : TREES[0];
    const run = runGate(`validate:${first}`);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(new RegExp(`terraform failed:.*\\b${first}\\b`));
    expect(run.invocations.filter((i) => i.argv.includes('validate')).length).toBe(TREES.length);
  });

  it('leaves the operator’s own initialized trees untouched', () => {
    // The staging smoke reads outputs from terraform/staging/.terraform, so the gate must
    // not re-initialize or remove it. Anything the gate writes goes under LOG_DIR.
    for (const stack of TREES) {
      const dataDir = join(REPO_ROOT, 'terraform', stack, '.terraform');
      if (!existsSync(dataDir)) continue;
      const touched = invocations.some((i) => i.env.TF_DATA_DIR === dataDir);
      expect(touched, `${stack} must not be the gate's data directory`).toBe(false);
    }
  });
});
