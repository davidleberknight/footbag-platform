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

const tfvarsPath = () => join(stubDir, 'shared.tfvars');

/** An aws stub answering `events describe-rule` with each named rule's State;
 *  a rule not in the map is not found. */
function awsStub(rules: Record<string, string>): string {
  const path = join(stubDir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'name=""; prev=""',
      'for a in "$@"; do [[ "$prev" == "--name" ]] && name="$a"; prev="$a"; done',
      'case "$name" in',
      ...Object.entries(rules).map(([n, s]) => `  ${JSON.stringify(n)}) echo ${JSON.stringify(s)}; exit 0 ;;`),
      'esac',
      'echo "An error occurred (ResourceNotFoundException) when calling the DescribeRule operation: stub" >&2',
      'exit 254',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

const BOTH_ROUTES = {
  'footbag-staging-guardduty-findings': 'ENABLED',
  'footbag-production-guardduty-findings': 'ENABLED',
};

function run(
  args: string[],
  planJson: string,
  verifier: VerifierOpts = {},
  arn?: string,
  rules: Record<string, string> = BOTH_ROUTES,
) {
  if (!existsSync(tfvarsPath())) {
    writeFileSync(tfvarsPath(), 'aws_region = "us-east-1"\nenable_account_alternate_contacts = false\n', 'utf-8');
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...awsIdentityStubEnv(stubDir, arn ? { arn } : {}),
    TERRAFORM_APPLY_BIN: terraformStub(planJson),
    ACCOUNT_BASELINE_VERIFIER: verifierStub(verifier),
    ACCOUNT_BASELINE_AWS_BIN: awsStub(rules),
    ACCOUNT_BASELINE_TFVARS: tfvarsPath(),
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

const GUARDDUTY_CREATES = [
  change('aws_guardduty_detector.account[0]', ['create']),
  ...['S3_DATA_EVENTS', 'EKS_AUDIT_LOGS', 'EBS_MALWARE_PROTECTION', 'RDS_LOGIN_EVENTS', 'LAMBDA_NETWORK_LOGS', 'RUNTIME_MONITORING'].map(
    (f) => change(`aws_guardduty_detector_feature.account["${f}"]`, ['create']),
  ),
];

describe('apply-account-baseline.sh — turning on GuardDuty', () => {
  // The values line and the apply are one operation: typed by hand they drift,
  // and a detector with no finding route raises findings nobody receives.
  it('plans with the gate on, applies the detector, and writes the values line', () => {
    const r = run(['--enable-guardduty', '--yes'], plan(GUARDDUTY_CREATES));
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.tf).toMatch(/plan -input=false -var enable_guardduty=true -out=/);
    expect(r.stdout).toMatch(/\+enable_guardduty = true/);
    const tfvars = readFileSync(tfvarsPath(), 'utf8');
    expect(tfvars).toMatch(/^enable_guardduty = true$/m);
    // The rest of the operator's file is kept, not replaced.
    expect(tfvars).toMatch(/^enable_account_alternate_contacts = false$/m);
  });

  it('replaces an existing false line rather than adding a second one', () => {
    // Two lines for one variable is a Terraform error on the next plan.
    writeFileSync(tfvarsPath(), 'enable_guardduty = false\n', 'utf-8');
    const r = run(['--enable-guardduty', '--yes'], plan(GUARDDUTY_CREATES));
    expect(r.exitCode, r.stderr).toBe(0);
    expect(readFileSync(tfvarsPath(), 'utf8')).toBe('enable_guardduty = true\n');
  });

  it('refuses before planning when either environment has no finding route', () => {
    // Staging is applied first; a detector before production's route would
    // send production findings nowhere.
    for (const rules of [
      { 'footbag-staging-guardduty-findings': 'ENABLED' },
      { ...BOTH_ROUTES, 'footbag-production-guardduty-findings': 'DISABLED' },
    ]) {
      rmSync(tfLog(), { force: true });
      const r = run(['--enable-guardduty', '--yes'], plan(GUARDDUTY_CREATES), {}, undefined, rules);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/REFUSING: .*footbag-production-guardduty-findings/);
      expect(r.tf).toBe('');
      expect(readFileSync(tfvarsPath(), 'utf8')).not.toMatch(/enable_guardduty/);
    }
  });

  it('leaves the values file untouched when the APPLY is not typed', () => {
    // An aborted run must not leave a gate line that no apply carried out.
    const r = spawnSync('bash', [SCRIPT, '--enable-guardduty'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: 'no\n',
      env: {
        ...process.env,
        ...awsIdentityStubEnv(stubDir),
        TERRAFORM_APPLY_BIN: terraformStub(plan(GUARDDUTY_CREATES)),
        ACCOUNT_BASELINE_VERIFIER: verifierStub(),
        ACCOUNT_BASELINE_AWS_BIN: awsStub(BOTH_ROUTES),
        ACCOUNT_BASELINE_TFVARS: (writeFileSync(tfvarsPath(), 'aws_region = "us-east-1"\n', 'utf-8'), tfvarsPath()),
      },
      ...SPAWN_GUARD,
    });
    expect(r.status).not.toBe(0);
    expect(readLog(tfLog())).not.toMatch(/\bapply\b/);
    expect(readFileSync(tfvarsPath(), 'utf8')).toBe('aws_region = "us-east-1"\n');
  });

  it('writes the line when the detector is already in state, so a later plan keeps it', () => {
    // A run whose apply landed but whose line was lost would otherwise leave a
    // file that plans the detector's removal.
    const r = run(['--enable-guardduty', '--yes'], plan([]));
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Nothing to apply/);
    expect(readFileSync(tfvarsPath(), 'utf8')).toMatch(/^enable_guardduty = true$/m);
  });

  it('plans without the gate variable when the flag is not given', () => {
    // Without the flag the file decides, so a re-run after a failed apply
    // reads the line the first run wrote.
    const r = run(['--yes'], plan(BASELINE_CREATES));
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.tf).not.toMatch(/enable_guardduty/);
    expect(readFileSync(tfvarsPath(), 'utf8')).not.toMatch(/enable_guardduty/);
  });
});
