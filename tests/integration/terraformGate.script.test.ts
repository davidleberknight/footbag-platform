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

/**
 * Run the real `gate_terraform` out of run_all_tests.sh against a stub terraform.
 *
 * The function is extracted rather than reimplemented, and the real isolation
 * library is sourced, so the code under test is the shipped code. Everything the
 * gate needs from its host script is supplied here: LOG_DIR, which the runner
 * creates under the OS tmpdir, and a working directory of the repository root,
 * which the runner reaches with its own `cd`.
 */
function runGate(): void {
  workdir = mkdtempSync(join(tmpdir(), 'footbag-test-terraform-gate-'));
  const stubDir = join(workdir, 'bin');
  const logDir = join(workdir, 'log');
  const record = join(workdir, 'invocations.jsonl');
  mkdirSync(stubDir);
  mkdirSync(logDir);

  // The stub answers `command -v`, records what it was handed, and succeeds. It
  // writes the environment as JSON so a case can assert on any variable without
  // the stub deciding in advance which ones matter.
  writeFileSync(
    join(stubDir, 'terraform'),
    '#!/usr/bin/env bash\n'
      + 'python3 -c \'import json,os,sys;'
      + 'open(os.environ["TF_STUB_RECORD"],"a").write('
      + 'json.dumps({"argv":sys.argv[1:],"env":dict(os.environ)})+"\\n")\' "$@"\n'
      + 'exit 0\n',
    { mode: 0o755 },
  );

  const driver = join(workdir, 'driver.sh');
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
      + 'gate_terraform\n',
  );

  const res = spawnSync('bash', [driver], {
    encoding: 'utf8',
    env: {
      PATH: `${stubDir}:${process.env.PATH ?? ''}`,
      HOME: workdir,
      TF_STUB_RECORD: record,
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

  gateStatus = res.status;
  invocations = existsSync(record)
    ? readFileSync(record, 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as Invocation)
    : [];
}

beforeAll(() => {
  runGate();
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

/**
 * Every Terraform tree in the repository, read from disk rather than listed
 * here. The gate names its trees in a loop, so a tree added without being added
 * to that loop is never validated and nothing says so — the run stays green
 * because the gate simply does less. Counting what is actually on disk is what
 * makes that visible.
 */
const TREES = readdirSync(join(REPO_ROOT, 'terraform'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(REPO_ROOT, 'terraform', e.name, 'providers.tf')))
  .map((e) => e.name);

describe('gate_terraform', () => {
  it('runs and invokes terraform for fmt and for every tree on disk', () => {
    expect(gateStatus).toBe(0);
    expect(TREES.length).toBeGreaterThanOrEqual(3);
    // fmt once, then init + validate for each tree.
    expect(invocations.length).toBe(1 + TREES.length * 2);
    expect(invocations.filter((i) => i.argv.includes('validate')).length).toBe(TREES.length);
    expect(invocations.filter((i) => i.argv.includes('init')).length).toBe(TREES.length);
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

  it('leaves the operator’s own initialized trees untouched', () => {
    // gate_smoke reads outputs from terraform/staging/.terraform, so the gate must
    // not re-initialize or remove it. Anything the gate writes goes under LOG_DIR.
    for (const stack of TREES) {
      const dataDir = join(REPO_ROOT, 'terraform', stack, '.terraform');
      if (!existsSync(dataDir)) continue;
      const touched = invocations.some((i) => i.env.TF_DATA_DIR === dataDir);
      expect(touched, `${stack} must not be the gate's data directory`).toBe(false);
    }
  });
});
