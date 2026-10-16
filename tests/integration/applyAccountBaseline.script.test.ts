/**
 * scripts/apply-account-baseline.sh — the account baseline applied as one
 * proven operation.
 *
 * The script exists for two properties a generic apply cannot hold. The plan
 * may create the three baseline resources and nothing else, because the shared
 * tree holds every environment's state and anything else pending there is not
 * this change. And success is the account reporting the controls in place with
 * footbag-operator unchanged, not the apply exiting zero.
 *
 * Terraform and the verification script are both stubbed through the script's
 * own seams, and the identity through the shared identity stub, so these cases
 * need no AWS and no state. Each stub logs its calls, so a case can prove an
 * apply did or did not happen rather than inferring it from output.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/apply-account-baseline.sh');

let stubDir: string;

beforeEach(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'footbag-test-accountbaseline-'));
});

afterEach(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

const tfLog = () => join(stubDir, 'terraform-calls.log');
const verifierLog = () => join(stubDir, 'verifier-calls.log');
const readLog = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/** A terraform stub: `plan` writes the plan file, `show -json` emits the
 *  supplied document, `apply` succeeds. Every call is logged. */
function terraformStub(planJson: string): string {
  const jsonPath = join(stubDir, 'plan.json');
  writeFileSync(jsonPath, planJson, 'utf-8');
  const path = join(stubDir, 'terraform-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(tfLog())}`,
      'case "$*" in',
      '  *" plan "*)',
      '    for a in "$@"; do case "$a" in -out=*) : > "${a#-out=}";; esac; done',
      '    echo "stub plan"; exit 0 ;;',
      `  *" show "*) cat ${JSON.stringify(jsonPath)}; exit 0 ;;`,
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

interface VerifierOpts {
  /** Exit of the report run after the apply; the one before always finds. */
  afterRc?: number;
  compareRc?: number;
  saveRc?: number;
  /** `--save` reports success but names a file it never wrote. */
  saveWritesNothing?: boolean;
}

/** A verifier stub. The first plain report exits 1, as the real one does
 *  before the apply; the second exits `afterRc`. `--save` writes a baseline and
 *  prints the line the real script prints. Every call is logged. */
function verifierStub({
  afterRc = 0,
  compareRc = 0,
  saveRc = 0,
  saveWritesNothing = false,
}: VerifierOpts = {}): string {
  const counter = join(stubDir, 'report-count');
  const baseline = join(stubDir, 'baseline-stub.txt');
  const path = join(stubDir, 'verifier-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "report $*" >> ${JSON.stringify(verifierLog())}`,
      'case "${1:-}" in',
      '  --save)',
      `    [ ${saveRc} -eq 0 ] || { echo "ERROR: stub save refused" >&2; exit ${saveRc}; }`,
      saveWritesNothing ? '    :' : `    : > ${JSON.stringify(baseline)}`,
      `    echo "Saved 5 facts for account 000000000000 to ${baseline}"; exit 0 ;;`,
      `  --compare) exit ${compareRc} ;;`,
      'esac',
      `n=$(( $(cat ${JSON.stringify(counter)} 2>/dev/null || echo 0) + 1 ))`,
      `echo "$n" > ${JSON.stringify(counter)}`,
      `if [ "$n" -eq 1 ]; then echo "  FAIL  stub finding"; exit 1; fi`,
      `exit ${afterRc}`,
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(
  args: string[],
  planJson: string,
  verifier: VerifierOpts = {},
  arn?: string,
) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...awsIdentityStubEnv(stubDir, arn ? { arn } : {}),
    TERRAFORM_APPLY_BIN: terraformStub(planJson),
    ACCOUNT_BASELINE_VERIFIER: verifierStub(verifier),
  };
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env,
    ...SPAWN_GUARD,
  });
  return {
    exitCode: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    tf: readLog(tfLog()),
    verifier: readLog(verifierLog()),
  };
}

const change = (address: string, actions: string[]) => ({ address, change: { actions } });

const BASELINE_CREATES = [
  change('aws_s3_account_public_access_block.account', ['create']),
  change('aws_iam_account_password_policy.account', ['create']),
  change('aws_accessanalyzer_analyzer.account', ['create']),
];

const plan = (changes: object[]) => JSON.stringify({ resource_changes: changes });

/** The plan file the run wrote, read from terraform's own `-out=` argument. */
const planOutPath = (tf: string) => tf.match(/-out=(\S+)/)?.[1];

const ASSUMED_ROLE_ARN = 'arn:aws:sts::000000000000:assumed-role/FootbagDevTester/session';

describe('apply-account-baseline.sh — argument handling', () => {
  it('dry run states the sequence and reaches neither terraform nor the account', () => {
    // Run under an identity the real run refuses: a dry run that settled its
    // identity first would read the account, and would be refused here.
    const r = run(['--dry-run'], plan(BASELINE_CREATES), {}, ASSUMED_ROLE_ARN);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Nothing was planned, applied or read/);
    expect(r.tf).toBe('');
    expect(r.verifier).toBe('');
  });

  it('rejects an unknown flag rather than ignoring it', () => {
    const r = run(['--force'], plan(BASELINE_CREATES));
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/unknown argument/);
    expect(r.tf).toBe('');
  });
});

describe('apply-account-baseline.sh — identity', () => {
  // The shared tree's state is out of the job role's reach, so a run under it
  // would fail at the backend partway through. It must be refused at the door,
  // before the account is read or the tree planned.
  it('refuses an assumed role before reading the account or planning', () => {
    const r = run(['--yes'], plan(BASELINE_CREATES), {}, ASSUMED_ROLE_ARN);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/which is an assumed role/);
    expect(r.tf).toBe('');
    expect(r.verifier).toBe('');
  });
});

describe('apply-account-baseline.sh — the plan scope gate', () => {
  // The reason the script exists. The shared tree holds every environment's
  // state; a change pending there beside the baseline must stop the run before
  // the confirmation, never ride along with it.
  it('refuses a plan carrying a change to another resource, and applies nothing', () => {
    const r = run(
      ['--yes'],
      plan([...BASELINE_CREATES, change('aws_s3_bucket_policy.state', ['update'])]),
    );
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/carries changes beyond the account baseline/);
    expect(r.stderr).toMatch(/aws_s3_bucket_policy\.state \(update\)/);
    expect(r.tf).not.toMatch(/\bapply\b/);
  });

  // A create is not enough either: a new resource added to the shared tree
  // beside the baseline is not this change, and matching on the action alone
  // would apply it.
  it('refuses a create of any resource outside the three', () => {
    const r = run(['--yes'], plan([...BASELINE_CREATES, change('aws_s3_bucket.other', ['create'])]));
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/aws_s3_bucket\.other \(create\)/);
    expect(r.tf).not.toMatch(/\bapply\b/);
  });

  // An allowed address is not enough: a destroy or a replacement of one of the
  // three is not this change, and matching on the name alone would let it through.
  it('refuses a baseline resource planned for anything but a create', () => {
    const r = run(
      ['--yes'],
      plan([
        BASELINE_CREATES[0],
        BASELINE_CREATES[1],
        change('aws_accessanalyzer_analyzer.account', ['delete', 'create']),
      ]),
    );
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/aws_accessanalyzer_analyzer\.account \(delete,create\)/);
    expect(r.tf).not.toMatch(/\bapply\b/);
  });

  // An unreadable plan must not read as an empty one: empty means "already
  // applied, go to the proof", and that is not what an unparsed plan tells us.
  it('refuses a plan it cannot parse rather than treating it as empty', () => {
    const r = run(['--yes'], 'this is not JSON, it is a truncated plan');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/REFUSING: the plan JSON could not be parsed/);
    expect(r.stdout).not.toMatch(/Nothing to apply/);
    expect(r.tf).not.toMatch(/\bapply\b/);
  });
});

describe('apply-account-baseline.sh — the proof', () => {
  it('applies the three creates and proves them with the report and the baseline compare', () => {
    const r = run(['--yes'], plan(BASELINE_CREATES));
    expect(r.exitCode).toBe(0);
    // The apply is of the exact plan the run wrote and gated, not a fresh one.
    const planned = planOutPath(r.tf);
    expect(planned).toMatch(/^\/tmp\/footbag-account-baseline-plan\./);
    expect(r.tf).toContain(`apply -input=false ${planned}`);
    // A saved plan carries a full copy of state, so it must not outlive the run.
    expect(existsSync(planned!)).toBe(false);
    // Saved before the plan, compared after the apply, against the same file.
    const calls = r.verifier.trim().split('\n');
    expect(calls).toEqual([
      'report ',
      'report --save',
      'report ',
      `report --compare ${join(stubDir, 'baseline-stub.txt')}`,
    ]);
    expect(r.stdout).toMatch(/^Done\./m);
  });

  // Re-running after a completed apply must finish the job, not apply again.
  it('skips the apply when the plan has nothing to do, and still runs the proof', () => {
    const r = run(
      ['--yes'],
      plan([
        change('aws_s3_account_public_access_block.account', ['no-op']),
        change('data.aws_caller_identity.current', ['read']),
      ]),
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Nothing to apply/);
    expect(r.tf).not.toMatch(/\bapply\b/);
    expect(r.verifier).toMatch(/report --compare /);
  });

  // The apply exiting zero is not the outcome: an account still reporting a
  // finding afterwards must fail the run.
  it('fails the run when the account still reports findings after the apply', () => {
    const r = run(['--yes'], plan(BASELINE_CREATES), { afterRc: 1 });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/still reports findings after the apply/);
    expect(r.verifier).not.toMatch(/--compare/);
    expect(r.stdout).not.toMatch(/^Done\./m);
  });

  it('fails the run when footbag-operator or a trust moved', () => {
    const r = run(['--yes'], plan(BASELINE_CREATES), { compareRc: 3 });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/differs from the baseline\s+saved before the apply/);
    expect(r.stdout).not.toMatch(/^Done\./m);
  });

  // The typed word is the operator's decision. With no terminal and no --yes
  // there is nobody to give it, so the run must stop short of the apply.
  it('applies nothing without a typed confirmation', () => {
    const r = run([], plan(BASELINE_CREATES));
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/Aborted before terraform apply/);
    expect(r.tf).not.toMatch(/\bapply\b/);
    // Stopping at the prompt still removes the plan it wrote.
    expect(existsSync(planOutPath(r.tf)!)).toBe(false);
  });

  // A save that names a file which is not there leaves nothing to compare
  // against, which is the same as no baseline at all.
  it('plans nothing when the saved baseline file is not readable', () => {
    const r = run(['--yes'], plan(BASELINE_CREATES), { saveWritesNothing: true });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/reported no readable baseline file/);
    expect(r.tf).toBe('');
  });

  // Without a saved baseline the run could not prove the operator unchanged,
  // so it must not plan or apply at all.
  it('plans nothing when the baseline cannot be saved', () => {
    const r = run(['--yes'], plan(BASELINE_CREATES), { saveRc: 1 });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/could not save the baseline/);
    expect(r.tf).toBe('');
  });
});
