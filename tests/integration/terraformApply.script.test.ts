/**
 * scripts/terraform-apply.sh -- the canonical apply path for every environment
 * change that needs nothing but a plan read and a confirmation.
 *
 * A real run plans and applies against a live account, which no test can
 * exercise. What is pinned here is the handling of the saved plan, which is the
 * reason this script exists at all.
 *
 * Typed by hand, the convention's four commands end in a shred that a failure
 * never reaches: a failed plan, a failed apply or an interrupt all skip it, and
 * what survives in /tmp is a zip carrying a full copy of state with every
 * resolved value in the clear. So the tests that matter most here are the ones
 * asserting the plan file is gone afterwards, including on the failure paths,
 * and that the file applied is the file that was planned rather than a fresh
 * one computed at apply time.
 *
 * The terraform binary is pointed at a stub that records its arguments, so the
 * whole sequence runs without an account.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  chmodSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/terraform-apply.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let tmpDir: string;
let tfStub: string;
let callLog: string;
// Dropped by the stub's force-unlock so a later plan stops reporting the lock.
let unlockMarker: string;
// Dropped by the stub's first `show`, so a second one can answer differently.
let showMarker: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'footbag-test-tfapply-'));
  tfStub = join(tmpDir, 'terraform-stub.sh');
  callLog = join(tmpDir, 'calls.log');
  unlockMarker = join(tmpDir, 'unlocked.marker');
  showMarker = join(tmpDir, 'shown.marker');
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * A stand-in for Terraform. `plan -out` writes the file the script then applies,
 * so the saved-plan handling runs for real against a throwaway file.
 */
function writeTerraformStub(
  opts: {
    planFails?: boolean;
    applyFails?: boolean;
    lockHeldBy?: string;
    lockOperation?: string;
    lockCreated?: string;
    lockClearsAfterUnlock?: boolean;
    /**
     * What `terraform show -json <plan>` answers, as the resource_changes array.
     * The DNS gate reads the saved plan through this, so a fixture here is the
     * only way to drive it: the gate refuses on what the plan CONTAINS, not on
     * which environment the run named.
     */
    planResourceChanges?: Array<{
      type: string;
      address: string;
      actions: string[];
      before?: unknown;
      after?: unknown;
    }>;
    /**
     * Make `terraform show -json <plan>` fail. The gate reads the plan through
     * that call, so this is the only way to reach the branch where it cannot
     * see the plan at all — which is the case it exists for, because the reads
     * used to swallow their own failure and yield an empty answer the gate
     * could not tell apart from "no DNS in this plan".
     */
    showFails?: boolean;
    /**
     * Make `terraform show -json <plan>` write a line to its error stream while
     * still succeeding and still emitting a valid plan. Terraform does this on
     * ordinary successful runs: a provider deprecation notice, or the
     * development-overrides warning that prints on every command when a
     * workstation carries a dev_overrides block. A warning is not a failure, and
     * a gate that treats it as one cannot be applied around.
     */
    showWarnsOnStderr?: string;
    /** The plan's input variables, as `show -json` reports them. */
    planVariables?: Record<string, { value: unknown }>;
    /**
     * What a SECOND `show -json` answers, for the run that plans again after
     * writing the firewall in place. Unset, every show answers the first plan.
     */
    secondPlanResourceChanges?: Array<{
      type: string;
      address: string;
      actions: string[];
      before?: unknown;
      after?: unknown;
    }>;
  } = {},
): void {
  const planJson = (changes: NonNullable<typeof opts.planResourceChanges>) =>
    JSON.stringify({
      variables: opts.planVariables ?? {},
      resource_changes: changes.map((rc) => ({
        address: rc.address,
        type: rc.type,
        change: {
          actions: rc.actions, before: rc.before ?? null, after: rc.after ?? null,
          after_unknown: (rc as { after_unknown?: unknown }).after_unknown ?? {},
        },
      })),
    });
  // A plan refused by the backend lock, reproduced as terraform emits it: the
  // 412 from the object store plus the Lock Info block, which carries the only
  // description of the holder the operator ever gets.
  //
  // The vertical bars matter and are not decoration. Terraform draws its errors
  // inside a box and every line of the block carries that prefix, so a fixture
  // written without it is a fixture the real output does not resemble. An
  // earlier version of this stub omitted them, the parser was anchored on
  // leading whitespace, and the whole block therefore parsed as empty against
  // real terraform while passing here: the mode reported a lock held by nobody
  // and refused to break the operator's own stale lock.
  const lockError = opts.lockHeldBy
    ? [
        '  printf "\\033[31m╷\\033[0m\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0m\\033[1mError: Error acquiring the state lock\\033[0m\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0m\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0mError message: operation error S3: PutObject, https response error\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0mapi error PreconditionFailed: At least one of the pre-conditions you specified did not hold\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0mLock Info:\\n" >&2',
        '  printf "\\033[31m│\\033[0m \\033[0m  ID:        db5207a9-4d80-8993-4c30-cdeb7e69020e\\n" >&2',
        `  printf "\\033[31m│\\033[0m \\033[0m  Operation: ${opts.lockOperation ?? 'OperationTypePlan'}\\n" >&2`,
        `  printf "\\033[31m│\\033[0m \\033[0m  Who:       ${opts.lockHeldBy}\\n" >&2`,
        `  printf "\\033[31m│\\033[0m \\033[0m  Created:   ${opts.lockCreated ?? '2026-09-11 23:58:55.754432017 +0000 UTC'}\\n" >&2`,
        '  printf "\\033[31m╵\\033[0m\\n" >&2',
        '  exit 1',
      ].join('\n')
    : '';
  // A held lock stays held until force-unlock drops the marker, so the mode's
  // verifying plan sees the same world its probing plan did unless the unlock
  // actually worked. That is the difference between proving the outcome and
  // trusting the exit status.
  const planArm = lockError
    ? [`if [ ! -e "${unlockMarker}" ]; then`, lockError, 'fi'].join('\n')
    : opts.planFails
      ? 'exit 1'
      : ':';
  writeFileSync(
    tfStub,
    [
      '#!/usr/bin/env bash',
      `echo "terraform $*" >> "${callLog}"`,
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    force-unlock)',
      opts.lockClearsAfterUnlock ? `      : > "${unlockMarker}"` : '      :',
      '      exit 0',
      '      ;;',
      '    plan)',
      planArm,
      '      ;;',
      `    apply) ${opts.applyFails ? 'exit 1' : ':'} ;;`,
      '  esac',
      'done',
      // `show -json <plan>` answers with the fixture. Emitted before the -out
      // handling below so a `show` invocation never also writes a plan file.
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    show)',
      ...(opts.showFails
        ? [
            '      echo "Error: Failed to read the given plan file" >&2',
            '      echo "the plan file was created by a different version" >&2',
            '      exit 1',
            '      ;;',
            '  esac',
            'done',
            'for arg in "$@"; do',
            '  case "$arg" in',
            '    show)',
          ]
        : []),
      ...(opts.showWarnsOnStderr
        ? [`      echo ${JSON.stringify(opts.showWarnsOnStderr)} >&2`]
        : []),
      ...(opts.secondPlanResourceChanges
        ? [
            `      if [ -e "${showMarker}" ]; then`,
            `        cat <<'PLANJSON2'`,
            planJson(opts.secondPlanResourceChanges),
            'PLANJSON2',
            '        exit 0',
            '      fi',
            `      : > "${showMarker}"`,
          ]
        : []),
      `      cat <<'PLANJSON'`,
      planJson(opts.planResourceChanges ?? []),
      'PLANJSON',
      '      exit 0',
      '      ;;',
      '  esac',
      'done',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    -out=*) printf "saved-plan-body" > "${arg#-out=}" ;;',
      '  esac',
      'done',
      'exit 0',
    ].join('\n') + '\n',
  );
  chmodSync(tfStub, 0o755);
}

function run(args: string[], withStub = true, extraEnv: NodeJS.ProcessEnv = {}): RunResult {
  rmSync(callLog, { force: true });
  rmSync(unlockMarker, { force: true });
  rmSync(showMarker, { force: true });
  // The script settles and proves its AWS identity before it touches the state
  // backend, so the run needs an identity to have one to prove.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...awsIdentityStubEnv(tmpDir),
    ...extraEnv,
  };
  if (withStub) env.TERRAFORM_APPLY_BIN = tfStub;
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env,
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function calls(): string {
  return existsSync(callLog) ? readFileSync(callLog, 'utf-8') : '';
}

/**
 * An identity that resolves to an assumed role rather than to a user.
 *
 * Written into a directory of its own, because the stub file is named after
 * the directory it is put in and the run helper writes the default one at the
 * same moment: sharing a directory means whichever call lands second decides
 * what the run sees, which is not a thing a test should depend on.
 */
function assumedRoleIdentity(): NodeJS.ProcessEnv {
  const dir = join(tmpDir, 'as-role');
  mkdirSync(dir, { recursive: true });
  return awsIdentityStubEnv(dir, {
    arn: 'arn:aws:sts::000000000000:assumed-role/FootbagDevTester/someone',
  });
}

/** A stand-in values file, so the job-role check passes whatever this machine has linked. */
function valuesPresent(): NodeJS.ProcessEnv {
  const file = join(tmpDir, 'terraform.tfvars');
  writeFileSync(file, 'operator_cidrs = []\n');
  return { TERRAFORM_APPLY_VALUES_FILE: file };
}

function plannedPath(): string {
  const line = calls().split('\n').find((l) => l.includes('-out='));
  expect(line, 'the run planned to a file').toBeTruthy();
  return line!.split('-out=')[1].trim();
}

describe('terraform-apply.sh: argument handling', () => {
  it('refuses to run without a target, rather than choosing an environment', () => {
    const res = run(['--dry-run'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--target is required/);
  });

  it('refuses an unknown environment name', () => {
    const res = run(['--target', 'prod', '--dry-run'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/must be 'staging', 'production', 'shared' or 'identity'/);
  });

  it('accepts the shared tree, which owns the state bucket', () => {
    const res = run(['--target', 'shared', '--dry-run'], false);
    expect(res.exitCode).toBe(0);
  });

  it('accepts the identity tree, which has one way in rather than a script of its own', () => {
    // It used to be refused here and applied by a separate script, so that the
    // one principal allowed to apply it could be asserted somewhere. That
    // invariant lives on this path now, which leaves one entry point carrying
    // the saved-plan, confirmation and cleanup discipline the other one had to
    // reimplement.
    const res = run(['--target', 'identity', '--dry-run'], false);
    expect(res.exitCode).toBe(0);
  });

  it('asks for the typed word on the identity tree', () => {
    // Its plan is what every dev-and-tester in the account may do, and it is
    // the one tree whose plan cannot be sanity-checked against a running
    // system afterwards: a policy that is too broad looks exactly like a
    // correct one until somebody uses it.
    const res = run(['--target', 'identity', '--dry-run'], false);
    expect(res.stdout).toMatch(/take a typed APPLY/);
  });

  it('no longer knows the roster tree, which is not a tree any more', () => {
    // Who the dev-and-testers are mints and revokes key material, and a secret must
    // never enter Terraform state, so that lifecycle belongs to a script.
    const res = run(['--target', 'operators', '--dry-run'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/must be 'staging', 'production', 'shared' or 'identity'/);
  });

  it('refuses a step number outside the two steps it has', () => {
    const res = run(['--target', 'staging', '--from-step', '7'], false);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/from-step takes a step number from 1 to 2/);
  });

  it('does not inherit the confirmation from the caller environment', () => {
    // An exported ASSUME_YES=yes must not stand in for the typed APPLY on a
    // production apply. The library assigns the variable unconditionally so no
    // caller can inherit it; this is the end-to-end proof through a real script.
    writeTerraformStub();
    const res = run(['--target', 'production'], true, { ASSUME_YES: 'yes' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    // Matched with surrounding whitespace: the plan file's own name carries
    // "apply", so a looser pattern hits the plan line and never fails.
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('refuses --yes on a production apply, because a flag is not a confirmation', () => {
    // The typed answer is what stands between a decision and replacing what the
    // public is served. A flag that supplies it in advance makes an unattended
    // production apply possible from a scheduled job, a wrapper or an agent
    // session, none of which can read the plan they are accepting.
    writeTerraformStub();
    const res = run(['--target', 'production', '--yes']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--yes does not carry a production apply/);
  });

  it('refuses it before planning, so no copy of state is written to disk at all', () => {
    // The saved plan is a zip holding every resolved value in the clear. A
    // refusal at the prompt would still have produced one; this one lands first.
    writeTerraformStub();
    run(['--target', 'production', '--yes']);
    expect(calls(), 'terraform was never invoked').toBe('');
  });

  it('still previews production with --yes, since a dry run applies nothing', () => {
    writeTerraformStub();
    const res = run(['--target', 'production', '--dry-run', '--yes']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toBe('');
  });

  it('keeps --yes working for staging, which is the deliberate half of the split', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging', '--yes']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toMatch(/apply /);
  });

  it('refuses the identity tree to an assumed role, before terraform runs', () => {
    // The job role is denied every write to its own definition, and that
    // denial lands mid-apply: terraform would create some resources, refuse on
    // the role itself, and leave the tree half applied with a state file
    // saying so. The invariant used to live in the separate script that owned
    // this tree, which is why it has to be here now that the tree does not
    // have one.
    writeTerraformStub();
    const res = run(['--target', 'identity'], true, assumedRoleIdentity());
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/is an assumed role/);
    expect(calls(), 'terraform was never invoked').toBe('');
  });

  it('lets the directly authenticated identity reach the plan', () => {
    writeTerraformStub();
    const res = run(['--target', 'identity'], true);
    expect(res.stderr).not.toMatch(/is an assumed role/);
    expect(calls()).toMatch(/plan/);
  });

  it('applies the caller rule to the identity tree alone', () => {
    // Every other tree is ordinary work for whoever the operator signed in as.
    writeTerraformStub();
    const res = run(['--target', 'staging', '--yes'], true, { ...assumedRoleIdentity(), ...valuesPresent() });
    expect(res.exitCode).toBe(0);
    expect(res.stderr).not.toMatch(/is an assumed role/);
  });

  it.each([['production'], ['shared'], ['identity']])(
    'refuses --yes when breaking the %s state lock, before any terraform runs',
    (target) => {
      // The refusal used to sit below the stale-lock block, which exits on its
      // own, so nothing under it was reachable from a lock-breaking run: the
      // typed word was asked for with the flag still set, the helper answered it,
      // and force-unlock ran against that tree's state with nothing typed.
      // Breaking a lock while a run is genuinely live lets two runs write state
      // at once, which is why this is refused rather than merely discouraged.
      //
      // The identity tree belongs in this list for the same reason it takes a
      // typed APPLY: its state is the record of what every dev-and-tester may
      // do, so two runs writing it at once can leave a grant standing that was
      // being removed. Staging is the only tree whose lock --yes still answers for,
      // because its data is disposable and its state is shared with nothing that
      // is not.
      writeTerraformStub();
      const res = run(['--target', target, '--break-stale-lock', '--i-killed-that-run', '--yes']);
      expect(res.exitCode).toBe(2);
      expect(res.stderr).toMatch(
        new RegExp(`--yes does not carry breaking the ${target} state lock`),
      );
      expect(calls(), 'terraform was never invoked').toBe('');
    },
  );
});

describe('terraform-apply.sh: a job-role session', () => {
  it('refuses before planning when the values link is missing, naming it', () => {
    // A dev-and-tester need not have the private checkout. Without the values
    // file terraform fails on a missing variable partway into a plan, in words
    // that do not name the file.
    writeTerraformStub();
    const res = run(['--target', 'staging'], true, {
      ...assumedRoleIdentity(),
      TERRAFORM_APPLY_VALUES_FILE: join(tmpDir, 'no-such.tfvars'),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/terraform\/staging\/terraform\.tfvars is missing or unreadable/);
    expect(res.stderr).toMatch(/setup_private_repo\.sh/);
    expect(calls(), 'terraform was never invoked').toBe('');
  });

  it('never lets terraform prompt, on the plan and on the apply', () => {
    // A prompt in a wrapped run reads as a hang; -input=false turns it into an
    // error naming the variable.
    writeTerraformStub();
    const res = run(['--target', 'staging'], true, { ...assumedRoleIdentity(), ...valuesPresent() });
    expect(res.exitCode, res.stderr).toBe(0);
    const lines = calls().split('\n').filter((l) => / (plan|apply) /.test(l));
    expect(lines.length).toBe(2);
    for (const l of lines) expect(l).toContain('-input=false');
  });

  it('refuses a plan that changes IAM, before applying anything', () => {
    // The role holds no IAM write, so AWS would refuse partway through, after
    // the changes ahead of it had landed.
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_iam_role_policy', address: 'aws_iam_role_policy.runtime', actions: ['update'] },
      ],
    });
    const res = run(['--target', 'staging'], true, { ...assumedRoleIdentity(), ...valuesPresent() });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/this plan changes what the job role may not apply/);
    expect(res.stderr).toContain('aws_iam_role_policy.runtime');
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('refuses a replication change, which needs a role passed that the job role is never granted', () => {
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_s3_bucket_replication_configuration', address: 'aws_s3_bucket_replication_configuration.media', actions: ['update'] },
      ],
    });
    const res = run(['--target', 'staging'], true, { ...assumedRoleIdentity(), ...valuesPresent() });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('aws_s3_bucket_replication_configuration.media');
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('refuses any change to the staging firewall, whose addresses are not a dev-and-tester\'s to decide', () => {
    // A stale or edited values file on a dev-and-tester's machine would
    // otherwise rewrite the administrators' SSH addresses.
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_lightsail_instance_public_ports', address: 'aws_lightsail_instance_public_ports.web', actions: ['delete', 'create'] },
      ],
    });
    const res = run(['--target', 'staging'], true, { ...assumedRoleIdentity(), ...valuesPresent() });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('aws_lightsail_instance_public_ports.web');
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('applies a plan whose IAM entries are all no-ops', () => {
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_iam_role', address: 'aws_iam_role.runtime', actions: ['no-op'] },
      ],
    });
    const res = run(['--target', 'staging'], true, { ...assumedRoleIdentity(), ...valuesPresent() });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(calls()).toMatch(/ apply /);
  });

  it('leaves the directly authenticated identity exactly as it was', () => {
    // No -input=false, no values check and no IAM refusal: the administrator's
    // own apply must not change shape because the job role gained guards.
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_iam_role_policy', address: 'aws_iam_role_policy.runtime', actions: ['update'] },
      ],
    });
    const res = run(['--target', 'staging'], true, {
      TERRAFORM_APPLY_VALUES_FILE: join(tmpDir, 'no-such.tfvars'),
    });
    expect(res.exitCode, res.stderr).toBe(0);
    const log = calls();
    expect(log).not.toContain('-input=false');
    expect(log).toMatch(/^terraform -chdir=\S+terraform\/staging plan -no-color -out=\S+$/m);
    expect(log).toMatch(/^terraform -chdir=\S+terraform\/staging apply \S+$/m);
  });
});

describe('terraform-apply.sh: a caller that knows what the plan may contain', () => {
  // The firewall's port list as the plan JSON carries it: the two SSH ports
  // admit the administrators' address, and the change adds one dev-and-tester.
  const ADMIN = '198.51.100.4/32';
  const ADDED = '203.0.113.7/32';
  const ports = (sshCidrs: string[]) => ({
    port_info: [
      { from_port: 22, to_port: 22, protocol: 'tcp', cidrs: sshCidrs },
      { from_port: 2222, to_port: 2222, protocol: 'tcp', cidrs: sshCidrs },
      { from_port: 80, to_port: 80, protocol: 'tcp', cidrs: [] },
    ],
  });
  const FIREWALL = {
    type: 'aws_lightsail_instance_public_ports',
    address: 'aws_lightsail_instance_public_ports.web',
    actions: ['delete', 'create'],
    before: ports([ADMIN]),
    after: ports([ADMIN, ADDED]),
  };
  const ADD = ['--target', 'staging', '--firewall-only', '--firewall-add', ADDED];

  it('applies a firewall-only plan outside the in-place guards, saying first that every staging port blinks', () => {
    writeTerraformStub({ planResourceChanges: [FIREWALL] });
    const res = run(ADD);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/Every staging port, SSH and the site alike, closes for a few seconds/);
    expect(calls()).toMatch(/ apply \//);
  });

  it('refuses a firewall-only apply that would drop an address it was not asked to', () => {
    // A stale values file on the onboarding machine plans the administrators'
    // list without an address another holder added. The resource is the whole
    // change, so only comparing the addresses catches it.
    writeTerraformStub({ planResourceChanges: [{ ...FIREWALL, after: ports([ADDED]) }] });
    const res = run(ADD);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/would change SSH addresses it was not asked to:\n\s+removed 198\.51\.100\.4\/32/);
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('refuses a firewall-only apply whose after-state the plan does not know, as every address lost', () => {
    writeTerraformStub({ planResourceChanges: [{ ...FIREWALL, after: undefined }] });
    const res = run(ADD);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/removed 198\.51\.100\.4\/32/);
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('applies a removal that takes out exactly the address it names', () => {
    writeTerraformStub({ planResourceChanges: [{ ...FIREWALL, before: ports([ADMIN, ADDED]), after: ports([ADMIN]) }] });
    const res = run(['--target', 'staging', '--firewall-only', '--firewall-remove', ADDED]);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(calls()).toMatch(/ apply \//);
  });

  it('refuses a firewall-only apply that names no address, before terraform runs', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging', '--firewall-only']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--firewall-only needs --firewall-add <cidr>, --firewall-remove <cidr>, or both/);
    expect(calls()).toBe('');
  });

  it('refuses a firewall-only apply that would carry other drift with it', () => {
    // An address change must not quietly apply whatever else is pending in the tree.
    writeTerraformStub({
      planResourceChanges: [FIREWALL, { type: 'aws_s3_bucket', address: 'aws_s3_bucket.media', actions: ['update'] }],
    });
    const res = run(ADD);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/would also change:\n\s+aws_s3_bucket\.media/);
    expect(res.stderr).not.toContain('  aws_lightsail_instance_public_ports.web');
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('applies nothing when the firewall already matches', () => {
    writeTerraformStub({ planResourceChanges: [{ ...FIREWALL, actions: ['no-op'] }] });
    const res = run(ADD);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/already admits exactly these addresses/);
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('accepts an empty plan when one is required, and applies nothing', () => {
    writeTerraformStub({ planResourceChanges: [{ type: 'aws_s3_bucket', address: 'aws_s3_bucket.media', actions: ['no-op'] }] });
    const res = run(['--target', 'staging', '--require-empty-plan']);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/The plan is empty, as required/);
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('refuses any change at all when the plan is required to be empty, the firewall included', () => {
    writeTerraformStub({ planResourceChanges: [FIREWALL] });
    const res = run(['--target', 'staging', '--require-empty-plan']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/required to be empty, and it changes:\n\s+aws_lightsail_instance_public_ports\.web/);
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('refuses either mode on any tree but staging, before terraform runs', () => {
    writeTerraformStub();
    for (const flag of ['--firewall-only', '--require-empty-plan']) {
      const res = run(['--target', 'production', flag]);
      expect(res.exitCode, flag).toBe(2);
      expect(res.stderr).toMatch(/apply to staging only/);
    }
    expect(calls()).toBe('');
  });
});

describe('terraform-apply.sh: breaking a stale state lock', () => {
  // Terraform's own force-unlock removes a lock unconditionally, which is the
  // wrong tool alone: a lock broken while a run is live lets two runs write state
  // at once, and the operator reaching for it has just been blocked and is least
  // placed to know which case they are in. So the four checks live in the script.
  const thisHost = spawnSync('hostname', { encoding: 'utf-8' }).stdout.trim();
  const OLD = '2026-09-11 23:58:55.754432017 +0000 UTC';

  const breakRun = (opts: Parameters<typeof writeTerraformStub>[0], procCount = '0') => {
    writeTerraformStub(opts);
    return run(['--target', 'staging', '--break-stale-lock'], true, {
      TERRAFORM_APPLY_PROC_COUNT: procCount,
    });
  };

  /**
   * The same, with the operator attesting they killed the holding run. Carries
   * --yes because the cases that get past the checks reach the typed word, which
   * no test can answer; the refusal cases never reach it and are unaffected.
   */
  const breakRunAttested = (
    opts: Parameters<typeof writeTerraformStub>[0],
    procCount = '0',
  ) => {
    writeTerraformStub({ lockClearsAfterUnlock: true, ...opts });
    return run(
      ['--target', 'staging', '--break-stale-lock', '--i-killed-that-run', '--yes'],
      true,
      { TERRAFORM_APPLY_PROC_COUNT: procCount },
    );
  };

  it('refuses when the state is not locked at all, rather than unlocking blind', () => {
    const res = breakRun({});
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/not locked, so there is nothing to break/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('refuses a lock held by another machine, and names the holder', () => {
    const res = breakRun({ lockHeldBy: 'robin@OTHER-LAPTOP', lockCreated: OLD });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/robin@OTHER-LAPTOP, not this machine/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('refuses a lock taken by an apply, since state may be partly written', () => {
    const res = breakRun({
      lockHeldBy: `someone@${thisHost}`,
      lockOperation: 'OperationTypeApply',
      lockCreated: OLD,
    });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/not a plan/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('refuses a lock younger than the staleness floor', () => {
    const justNow = new Date(Date.now() - 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '.000000000 +0000 UTC');
    const res = breakRun({ lockHeldBy: `someone@${thisHost}`, lockCreated: justNow });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/under the 30-minute floor/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('names the waiver in the refusal, so the operator is not left guessing at it', () => {
    const justNow = new Date(Date.now() - 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '.000000000 +0000 UTC');
    const res = breakRun({ lockHeldBy: `someone@${thisHost}`, lockCreated: justNow });
    expect(res.stderr).toMatch(/--i-killed-that-run/);
    expect(res.stderr).toMatch(/waives the age floor only/);
  });

  it('waives the floor when the operator attests they killed the holding run', () => {
    // The waiver is sound only because the two stronger checks already passed:
    // the lock names this machine and nothing is running on it, so a live run
    // would have to be invisible to both. The operator supplies the one fact the
    // script cannot -- that the process is gone.
    const justNow = new Date(Date.now() - 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '.000000000 +0000 UTC');
    const res = breakRunAttested({ lockHeldBy: `someone@${thisHost}`, lockCreated: justNow });
    expect(res.exitCode, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toMatch(/Three checks pass/);
    expect(calls()).toMatch(/force-unlock/);
  });

  it('waives the floor and nothing else: another machine is still refused', () => {
    const res = breakRunAttested({ lockHeldBy: 'robin@OTHER-LAPTOP', lockCreated: OLD });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/not this machine/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('waives the floor and nothing else: a running terraform is still refused', () => {
    const justNow = new Date(Date.now() - 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '.000000000 +0000 UTC');
    const res = breakRunAttested({ lockHeldBy: `someone@${thisHost}`, lockCreated: justNow }, '1');
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/terraform process\(es\) are running on this machine/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('waives the floor and nothing else: an apply-held lock is still refused', () => {
    const justNow = new Date(Date.now() - 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '.000000000 +0000 UTC');
    const res = breakRunAttested({
      lockHeldBy: `someone@${thisHost}`,
      lockCreated: justNow,
      lockOperation: 'OperationTypeApply',
    });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/not a plan/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('still says four checks when the lock is genuinely old, not three', () => {
    const res = breakRunAttested({ lockHeldBy: `someone@${thisHost}`, lockCreated: OLD });
    expect(res.exitCode, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toMatch(/All four checks pass/);
  });

  it('refuses while a terraform is running on this machine', () => {
    const res = breakRun({ lockHeldBy: `someone@${thisHost}`, lockCreated: OLD }, '1');
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/terraform process\(es\) are running on this machine/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('refuses an unreadable timestamp, because unknown is not old', () => {
    const res = breakRun({ lockHeldBy: `someone@${thisHost}`, lockCreated: 'not a date at all' });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/age is unknown/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('asks for the typed word even on staging, which applies without one', () => {
    // Staging's silence is about disposable data. A lock is not data, and what
    // this mode removes is not staging's to throw away.
    const res = breakRun({ lockHeldBy: `someone@${thisHost}`, lockCreated: OLD });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/force-unlock/);
  });

  it('reaches force-unlock only once every check passes and the word is given', () => {
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}`, lockCreated: OLD, lockClearsAfterUnlock: true });
    const res = run(['--target', 'staging', '--break-stale-lock', '--yes'], true, {
      TERRAFORM_APPLY_PROC_COUNT: '0',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(calls()).toMatch(/force-unlock -force db5207a9-4d80-8993-4c30-cdeb7e69020e/);
  });

  it('proves the lock is gone by planning again, not by the unlock exit status', () => {
    // force-unlock exiting zero is not the lock being gone. A stub that keeps
    // reporting the lock afterwards must fail the run.
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}`, lockCreated: OLD });
    const res = run(['--target', 'staging', '--break-stale-lock', '--yes'], true, {
      TERRAFORM_APPLY_PROC_COUNT: '0',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/still locked/);
  });
});

describe('terraform-apply.sh: the firewall written in place', () => {
  // The provider can only delete and recreate the instance firewall, so every
  // port-list change closed SSH and the site for several seconds. The wrapper
  // instead writes the reviewed list in one call after the confirmation, plans
  // again, and applies the second plan only if it is the reviewed plan less the
  // firewall. These pin the order, the guards that keep the write from ever
  // locking anyone out, and every failure stopping with nothing more applied.
  const OPERATOR = '198.51.100.4/32';
  const EDGE = '120.52.22.96/27';
  const ports = (ssh: string[], opts: { alias?: boolean; port80?: string[] } = {}) => ({
    instance_name: 'footbag-staging-web',
    port_info: [
      {
        from_port: 22, to_port: 22, protocol: 'tcp', cidrs: ssh,
        ...(opts.alias === false ? {} : { cidr_list_aliases: ['lightsail-connect'] }),
      },
      { from_port: 2222, to_port: 2222, protocol: 'tcp', cidrs: ssh },
      { from_port: 80, to_port: 80, protocol: 'tcp', cidrs: opts.port80 ?? [EDGE] },
    ],
  });
  const FIREWALL = {
    type: 'aws_lightsail_instance_public_ports',
    address: 'aws_lightsail_instance_public_ports.web',
    actions: ['delete', 'create'],
    before: ports([OPERATOR]),
    after: ports([OPERATOR, '203.0.113.7/32']),
  };
  const BUCKET_TAG = {
    type: 'aws_s3_bucket', address: 'aws_s3_bucket.media', actions: ['update'],
    before: { tags: {} }, after: { tags: { owner: 'ifpa' } },
  };
  const FIREWALL_SETTLED = { ...FIREWALL, actions: ['no-op'], before: FIREWALL.after };
  const VARIABLES = { aws_region: { value: 'us-east-1' } };

  /** A stand-in AWS CLI: put stores the list it was given, port-states reads it back. */
  function awsStub(opts: { putFails?: boolean; opStatus?: string; readBack?: string } = {}): NodeJS.ProcessEnv {
    const stored = join(tmpDir, 'fw-live.json');
    rmSync(stored, { force: true });
    const path = join(tmpDir, 'aws-fw-stub.sh');
    writeFileSync(path, [
      '#!/usr/bin/env bash',
      `echo "aws $*" >> "${callLog}"`,
      'prev=""; infos=""',
      'for a in "$@"; do [[ "$prev" == "--port-infos" ]] && infos="$a"; prev="$a"; done',
      'case "$2" in',
      `  put-instance-public-ports) ${opts.putFails ? 'exit 254' : `printf '%s' "$infos" > "${stored}"; echo op-1; exit 0`} ;;`,
      `  get-operation) echo ${JSON.stringify(opts.opStatus ?? 'Succeeded')}; exit 0 ;;`,
      '  get-instance-port-states)',
      opts.readBack
        ? `    printf '%s' ${JSON.stringify(opts.readBack)}; exit 0 ;;`
        : `    printf '{"portStates":'; cat "${stored}"; printf '}'; exit 0 ;;`,
      'esac',
      'exit 64',
    ].join('\n'));
    chmodSync(path, 0o755);
    return { TERRAFORM_APPLY_AWS_BIN: path };
  }

  type Change = { type: string; address: string; actions: string[]; before?: unknown; after?: unknown };
  function stubPlans(second: Change[] | null = [FIREWALL_SETTLED, BUCKET_TAG], first: Change[] = [FIREWALL, BUCKET_TAG]) {
    writeTerraformStub({
      planResourceChanges: first,
      planVariables: VARIABLES,
      ...(second ? { secondPlanResourceChanges: second } : {}),
    });
  }

  it('writes the reviewed list in place, plans again, and applies only the second plan', () => {
    stubPlans();
    const res = run(['--target', 'staging'], true, awsStub());
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).toContain('written in place after you');
    expect(res.stdout).not.toMatch(/closes for a few seconds/);
    const log = calls();
    const order = ['put-instance-public-ports', 'get-operation', 'get-instance-port-states', ' apply '];
    const at = order.map((s) => log.indexOf(s));
    expect(at.every((i) => i >= 0), log).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(log.match(/ plan /g)?.length, 'planned twice').toBe(2);
    expect(log).toContain('lightsail-connect');
  });

  it('still writes in place when only fields it never writes are unknown until apply', () => {
    // Defect caught: Terraform reports the new resource's id, and the optional
    // ipv6 and alias lists of a port that sets none, as unknown on every
    // replacement. A guard that treated any unknown as unsafe fell back to the
    // closing replacement every time, so the in-place path never ran at all.
    writeTerraformStub({
      planResourceChanges: [
        {
          ...FIREWALL,
          after_unknown: {
            id: true,
            port_info: [
              { cidr_list_aliases: [false], cidrs: [false], ipv6_cidrs: true },
              { cidr_list_aliases: true, cidrs: [false], ipv6_cidrs: true },
              { cidr_list_aliases: true, cidrs: [false], ipv6_cidrs: true },
            ],
          },
        } as Change,
        BUCKET_TAG,
      ],
      planVariables: VARIABLES,
      secondPlanResourceChanges: [FIREWALL_SETTLED, BUCKET_TAG],
    });
    const res = run(['--target', 'staging'], true, awsStub());
    expect(res.exitCode, res.stderr).toBe(0);
    expect(calls()).toContain('put-instance-public-ports');
    expect(res.stdout).not.toMatch(/replaced the ordinary way/);
  });

  it('writes nothing to production before the typed confirmation', () => {
    // Defect caught: a production firewall changed by a run nobody confirmed.
    stubPlans();
    const res = run(['--target', 'production'], true, awsStub());
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toContain('put-instance-public-ports');
  });

  // Each row is a list the in-place write must never send, because it could lock
  // someone out: the browser console's alias dropped, a port admitting nobody,
  // or a value the plan does not know yet. Each falls back to the ordinary
  // replacement, saying the ports will close, and writes nothing in place.
  it.each([
    ['the console alias is missing on port 22', { ...FIREWALL, after: ports([OPERATOR], { alias: false }) }],
    ['a port admits no source', { ...FIREWALL, after: ports([OPERATOR], { port80: [] }) }],
    ['part of the list is unknown until apply', { ...FIREWALL, after_unknown: { port_info: [{ cidrs: true }] } }],
  ])('falls back to the ordinary replacement when %s', (_label, change) => {
    writeTerraformStub({ planResourceChanges: [change], planVariables: VARIABLES });
    const res = run(['--target', 'staging'], true, awsStub());
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/replaced the ordinary way/);
    expect(calls()).not.toContain('put-instance-public-ports');
    expect(calls()).toMatch(/ apply \//);
  });

  it.each([
    ['the write is refused', { putFails: true }, 'was refused'],
    ['the write operation fails', { opStatus: 'Failed' }, "operation status 'Failed'"],
    ['the live firewall reads back differently', { readBack: '{"portStates":[]}' }, 'does not read back'],
  ])('stops with nothing else applied when %s', (_label, aws, message) => {
    stubPlans();
    const res = run(['--target', 'staging'], true, awsStub(aws));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain(message);
    expect(res.stderr).toContain('Re-run this script');
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('stops when the second plan differs from the reviewed one beyond the firewall', () => {
    // Defect caught: applying a plan nobody read, because something changed
    // between the review and the write.
    stubPlans([FIREWALL_SETTLED, { ...BUCKET_TAG, after: { tags: { owner: 'someone-else' } } }]);
    const res = run(['--target', 'staging'], true, awsStub());
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('differs from the one reviewed');
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('stops when the firewall still plans a change after the write', () => {
    stubPlans([FIREWALL, BUCKET_TAG]);
    const res = run(['--target', 'staging'], true, awsStub());
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('still plans a change');
    expect(calls()).not.toMatch(/ apply \//);
  });

  it('shreds both plan files, the reviewed one and the second', () => {
    stubPlans();
    run(['--target', 'staging'], true, awsStub());
    expect(existsSync(plannedPath())).toBe(false);
  });
});

describe('terraform-apply.sh: replacing one listed resource', () => {
  // The origin-verify secret rotates by destroying and recreating its random_id,
  // which used to be a hand-typed apply with no saved plan, no confirmation and
  // no shred. Routed through here it gets all three; the list is what stops the
  // flag becoming a way to destroy and recreate anything at all.

  it('plans the replacement through the saved plan and applies that same file', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging', '--replace', 'random_id.origin_verify_secret']);
    expect(res.exitCode, res.stderr).toBe(0);
    const plan = calls().split('\n').find((l) => / plan /.test(l) && l.includes('-out='));
    expect(plan).toContain('-replace=random_id.origin_verify_secret');
    expect(calls()).toContain(`apply ${plannedPath()}`);
    expect(existsSync(plannedPath()), 'the plan file was shredded').toBe(false);
  });

  it('replaces the JWT signing key, the other address on the list, the same way', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging', '--replace', 'aws_kms_key.jwt_signing']);
    expect(res.exitCode, res.stderr).toBe(0);
    const plan = calls().split('\n').find((l) => / plan /.test(l) && l.includes('-out='));
    expect(plan).toContain('-replace=aws_kms_key.jwt_signing');
    expect(plan).not.toContain('-replace=random_id.origin_verify_secret');
  });

  it('refuses any address not on the list, before terraform runs', () => {
    // Defect caught: a general passthrough lets one flag destroy and recreate
    // the instance, a bucket or a key pair.
    writeTerraformStub();
    const res = run(['--target', 'staging', '--replace', 'aws_lightsail_instance.web']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('--replace takes only');
    expect(calls()).not.toMatch(/ plan /);
  });

  it('refuses the shared and identity trees, before terraform runs', () => {
    writeTerraformStub();
    for (const target of ['shared', 'identity']) {
      const res = run(['--target', target, '--replace', 'random_id.origin_verify_secret']);
      expect(res.exitCode, target).toBe(2);
      expect(res.stderr, target).toContain('staging or production only');
    }
    expect(calls()).not.toMatch(/ plan /);
  });

  it('refuses to combine with a restricted plan shape or a lock break', () => {
    writeTerraformStub();
    for (const extra of [['--require-empty-plan'], ['--break-stale-lock']]) {
      const res = run(['--target', 'staging', '--replace', 'random_id.origin_verify_secret', ...extra]);
      expect(res.exitCode, extra.join(' ')).toBe(2);
      expect(res.stderr, extra.join(' ')).toContain('does not combine');
    }
  });

  it('still stops for the typed word on production', () => {
    writeTerraformStub();
    const res = run(['--target', 'production', '--replace', 'random_id.origin_verify_secret']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });
});

describe('terraform-apply.sh: which environments stop for a typed confirmation', () => {
  // Staging is the only one that does not. The typed word is not a receipt that a
  // plan was read; it is what stands between a decision and replacing what the
  // public is served. Asking for it on every staging iteration is what teaches an
  // operator to answer prompts without reading them, which spends the word on the
  // trees where it has to mean something. All three environments are asserted
  // here rather than two, so the split is pinned and not inferred.

  it('applies staging with no confirmation and no terminal attached', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toMatch(/apply /);
    expect(res.stdout).not.toMatch(/Type 'APPLY'/);
  });

  it('still prints the whole-environment warning on staging, since the reading is the point', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging']);
    expect(res.stdout).toMatch(/covers this whole environment/);
  });

  it('refuses a production apply with no terminal to type the word on', () => {
    writeTerraformStub();
    const res = run(['--target', 'production']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('refuses a shared apply too, because it holds every environment\'s state', () => {
    // The tree that owns the state bucket is not staging-shaped: the other two
    // trees need it to exist at all, so it falls on production's side of the line.
    writeTerraformStub();
    const res = run(['--target', 'shared']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });
});

describe('terraform-apply.sh: a state lock refusing the plan', () => {
  // A stranded lock reaches the operator as a 412 PreconditionFailed on a
  // PutObject, which names neither the lock nor the remedy, and the generic
  // "plan failed" line sends them hunting for a fault in their own change. The
  // report turns the holder, the operation and the age into a decision, and it
  // lands before any apply has been offered.
  const thisHost = spawnSync('hostname', { encoding: 'utf-8' }).stdout.trim();

  it('names the holder, the operation and how old the lock is', () => {
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}` });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/The state is locked/);
    expect(res.stderr).toMatch(new RegExp(`held by\\s+someone@${thisHost}`));
    expect(res.stderr).toMatch(/operation\s+OperationTypePlan/);
    expect(res.stderr).toMatch(/taken\s+2026-09-11 23:58:55/);
  });

  it('offers the remedy when this machine holds it and no terraform runs here', () => {
    // The remedy is the script's own checked mode, not a raw force-unlock: the
    // four things that decide whether breaking is safe belong in the script.
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}` });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(res.stderr).toMatch(/--break-stale-lock/);
    expect(res.stderr).toMatch(/--from-step 2/);
  });

  it('tells the operator to wait when a terraform is live on this machine', () => {
    // The lock naming this machine is not on its own a dead process. Advising a
    // break here would have the operator destroy their own running plan's lock.
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}` });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '1' });
    expect(res.stderr).toMatch(/do not break it/);
    expect(res.stderr).not.toMatch(/force-unlock/);
  });

  it('never offers to break a lock held by another machine', () => {
    // Whether breaking a lock is safe turns on the holding process being dead,
    // and only the holder's own machine can answer that.
    writeTerraformStub({ lockHeldBy: 'robin@OTHER-LAPTOP' });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(res.stderr).toMatch(/names another machine/);
    expect(res.stderr).not.toMatch(/force-unlock/);
  });

  it('warns that state may be part-written when the held operation is an apply', () => {
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}`, lockOperation: 'OperationTypeApply' });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(res.stderr).toMatch(/state may be part/);
  });

  it('applies nothing, and leaves no copy of the plan behind', () => {
    writeTerraformStub({ lockHeldBy: `someone@${thisHost}` });
    run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(calls()).not.toMatch(/\sapply\s/);
    expect(existsSync(plannedPath()), 'the saved plan was shredded').toBe(false);
  });

  it('keeps the generic message for a plan that failed for any other reason', () => {
    writeTerraformStub({ planFails: true });
    const res = run(['--target', 'staging'], true, { TERRAFORM_APPLY_PROC_COUNT: '0' });
    expect(res.stderr).toMatch(/terraform plan failed/);
    expect(res.stderr).not.toMatch(/The state is locked/);
  });
});

describe('terraform-apply.sh: the preview', () => {
  it('runs nothing at all', () => {
    const res = run(['--target', 'staging', '--dry-run']);
    expect(res.exitCode).toBe(0);
    expect(calls()).toBe('');
  });

  it('warns that the plan covers the whole environment, not just the change in hand', () => {
    const res = run(['--target', 'staging', '--dry-run']);
    expect(res.stdout).toMatch(/covers the whole environment/);
  });

  it('says how to ask for an init rather than silently skipping one', () => {
    expect(run(['--target', 'staging', '--dry-run']).stdout).toMatch(/pass --init/);
    expect(run(['--target', 'staging', '--dry-run', '--init']).stdout).toMatch(/init/);
  });
});

describe('terraform-apply.sh: the saved plan', () => {
  it('applies the file it planned, rather than replanning at apply time', () => {
    writeTerraformStub();
    const res = run(['--target', 'staging', '--yes']);
    expect(res.exitCode).toBe(0);
    const applyLine = calls().split('\n').find((l) => /apply \//.test(l));
    expect(applyLine, 'the run applied a file').toBeTruthy();
    expect(applyLine).toContain(plannedPath());
  });

  it('leaves no plan file behind on a clean run', () => {
    writeTerraformStub();
    run(['--target', 'staging', '--yes']);
    expect(existsSync(plannedPath()), 'the plan file was shredded').toBe(false);
  });

  it('leaves no plan file behind when the plan itself fails', () => {
    writeTerraformStub({ planFails: true });
    const res = run(['--target', 'staging', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/terraform plan failed. Nothing was applied/);
    expect(existsSync(plannedPath()), 'the trap shredded the plan').toBe(false);
  });

  it('leaves no plan file behind when the apply fails', () => {
    writeTerraformStub({ applyFails: true });
    const res = run(['--target', 'staging', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/terraform apply failed/);
    expect(existsSync(plannedPath()), 'the trap shredded the plan').toBe(false);
  });

  it('names the resume point on every failure, so a part-way run is recoverable', () => {
    writeTerraformStub({ planFails: true });
    expect(run(['--target', 'staging', '--yes']).stderr).toMatch(/--from-step 2/);
    writeTerraformStub({ applyFails: true });
    expect(run(['--target', 'staging', '--yes']).stderr).toMatch(/--from-step 2/);
  });

  it('refuses a production apply with no terminal, rather than applying unconfirmed', () => {
    // Production is where this property lives, and it cannot be satisfied by a
    // flag: no scheduled job, wrapper or agent session replaces what the public
    // is served without a person at a terminal.
    writeTerraformStub();
    const res = run(['--target', 'production']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    // Matched on the subcommand, not the word: the plan file is itself named
    // footbag-<env>-apply, so a looser pattern matches the plan line too.
    expect(calls()).not.toMatch(/ apply \//);
    expect(existsSync(plannedPath()), 'the plan file was shredded on the abort').toBe(false);
  });
});

describe('terraform-apply.sh: init', () => {
  it('does not init unless asked', () => {
    writeTerraformStub();
    run(['--target', 'staging', '--yes']);
    expect(calls()).not.toMatch(/terraform .*init/);
  });

  it('inits when asked, before planning', () => {
    writeTerraformStub();
    run(['--target', 'staging', '--init', '--yes']);
    const log = calls();
    expect(log).toMatch(/terraform .*init/);
    expect(log.indexOf('init')).toBeLessThan(log.indexOf('plan'));
  });

  it('passes -upgrade only for the upgrade form', () => {
    writeTerraformStub();
    run(['--target', 'staging', '--init', '--yes']);
    expect(calls()).not.toMatch(/-upgrade/);
    writeTerraformStub();
    run(['--target', 'staging', '--init-upgrade', '--yes']);
    expect(calls()).toMatch(/-upgrade/);
  });
});

describe('terraform-apply.sh: the test seam', () => {
  it('announces the stub, so a stubbed run is never mistaken for a real one', () => {
    writeTerraformStub();
    expect(run(['--target', 'staging', '--dry-run']).stderr)
      .toMatch(/SYNTHETIC:.*proves nothing about the estate/);
  });
});

/**
 * A DNS change is approved by a person, on every tree, every time.
 *
 * This gate is on the CHANGE rather than on the environment, which is what makes
 * it different from the confirmation beside it. Staging otherwise applies with no
 * typed word at all, and "staging's data is disposable" says nothing about a
 * record in a zone. A record applied early does not error: it succeeds, and what
 * surfaces later is visitors reaching the wrong place or mail going quiet, with
 * nothing in the run's output to connect it back.
 */
describe('terraform-apply.sh: the DNS approval gate', () => {
  const dnsChange = [
    { type: 'aws_route53_record', address: 'aws_route53_record.apex_a', actions: ['create'] },
  ];
  const noDnsChange = [
    { type: 'aws_lightsail_instance', address: 'aws_lightsail_instance.web', actions: ['update'] },
  ];

  it('stops a staging apply that changes a record, though staging otherwise needs no word', () => {
    writeTerraformStub({ planResourceChanges: dnsChange });
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toMatch(/THIS PLAN CHANGES DNS/);
    // Bounded by whitespace on both sides: the saved plan's own temp file is
    // named "...-apply.XXXXXX", so a looser pattern matches the `show` call
    // that reads it and reports an apply that never happened.
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('refuses when it cannot read the plan at all, rather than reading silence as no DNS', () => {
    // The defect this pins: both reads used to swallow their own failure and
    // hand back an empty answer, which is indistinguishable from a plan with no
    // DNS in it. So the gate skipped itself on exactly the plans it exists for,
    // and the apply went through.
    writeTerraformStub({ planResourceChanges: dnsChange, showFails: true });
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/could not read the saved plan/);
    expect(res.stderr).toMatch(/not fail open/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('refuses an unreadable plan even where the plan holds no DNS at all', () => {
    // The refusal is about what it could not see, not about what was there. A
    // gate that only refused when it happened to spot a record would be relying
    // on the read it just admitted failed.
    writeTerraformStub({ planResourceChanges: noDnsChange, showFails: true });
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/could not read the saved plan/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('treats a warning on the error stream as a warning, not as an unreadable plan', () => {
    // Failing closed cuts both ways, and this is the other edge. Terraform writes
    // to its error stream on runs that SUCCEED: a provider deprecation notice, or
    // the development-overrides warning that prints on every command when a
    // workstation carries a dev_overrides block. Capturing both streams into one
    // variable put that text into what was then parsed as JSON, so the parse
    // failed, the gate refused, and because it refuses rather than waves through,
    // the tree could not be applied AT ALL until whoever owned the warning removed
    // it. Resuming with --from-step 2 took the same path and failed the same way.
    writeTerraformStub({
      planResourceChanges: noDnsChange,
      showWarnsOnStderr:
        'Warning: Provider development overrides are in effect',
    });
    const res = run(['--target', 'staging']);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toMatch(/could not read the saved plan/);
    expect(calls()).toMatch(/\sapply\s/);
  });

  it('still sees the DNS change in a plan whose read also emitted a warning', () => {
    // The warning must not cost the gate its verdict either: it still has to
    // refuse a DNS change it can see, on a run that printed a warning alongside.
    writeTerraformStub({
      planResourceChanges: dnsChange,
      showWarnsOnStderr: 'Warning: Provider development overrides are in effect',
    });
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('distinguishes grep finding nothing from grep failing, in the no-jq fallback', () => {
    // The fallback's half of failing closed, which was never built: `grep` exits
    // 1 on no match and 2 when it could not read the file, and `|| true`
    // collapsed both into an empty answer that this block reads as "no DNS in
    // this plan". An unreadable or swept plan log therefore applied whatever the
    // plan held, on the gate whose own comment says it does not fail open.
    //
    // Asserted against the source rather than driven. Reaching the fallback needs
    // a PATH with no jq on it but every other tool the script uses still present,
    // and forcing grep's exit 2 needs the plan log to become unreadable between
    // the plan and the check. Both are machine surgery that would prove less than
    // it costs, and a test seam existing only to make a read fail is a seam in a
    // safety gate. What is pinned instead is that the swallow is gone and the
    // status is judged.
    const src = readFileSync(SCRIPT, 'utf-8');
    const fallback = src.slice(src.indexOf('Without jq, fall back'));
    expect(fallback).not.toMatch(/aws_route53' "\$TF_PLAN_LOG"\) \|\| true/);
    expect(fallback).toMatch(/\|\| DNS_GREP_STATUS=\$\?/);
    expect(fallback).toMatch(/if \(\( DNS_GREP_STATUS > 1 \)\); then/);
    expect(fallback).toMatch(/could not read the plan text/);
  });

  it('still removes the saved plan when shred is unavailable or fails', () => {
    // The cleanup trap shreds the plan and then removes it. A BARE shred in that
    // trap is fatal under strict mode: the handler aborts where it stands, the
    // rm never runs, and the plan file SURVIVES — which is the opposite of what
    // a cleanup trap is for, and the file is mode 600 precisely because its
    // contents are not for leaving around. The wrong exit status is the lesser
    // half of this.
    const binDir = mkdtempSync(join(tmpdir(), 'footbag-test-tfapply-nobin-'));
    try {
      const fakeShred = join(binDir, 'shred');
      writeFileSync(fakeShred, '#!/usr/bin/env bash\nexit 1\n', { encoding: 'utf-8', mode: 0o755 });
      // Pin what THIS run creates rather than asserting on a listing of a shared
      // directory: take the set before, take it after, and judge the difference.
      // The plan and its log are mktemp'd as /tmp/footbag-<target>-apply.XXXXXX
      // and -planlog.XXXXXX.
      const planFiles = (): string[] =>
        readdirSync('/tmp').filter(
          (n) => n.startsWith('footbag-shared-apply.') || n.startsWith('footbag-shared-planlog.'),
        );
      const before = new Set(planFiles());
      writeTerraformStub({ planResourceChanges: noDnsChange });
      const res = run(['--target', 'shared', '--yes'], true, {
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      });
      expect(res.exitCode, res.stderr).toBe(0);
      const survivors = planFiles().filter((n) => !before.has(n));
      expect(
        survivors,
        `plan files this run created survived the cleanup trap:\n${survivors.join('\n')}`,
      ).toEqual([]);
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it('writes the plan without colour, so the no-jq fallback can match its markers', () => {
    // Terraform colours its output even when it is not writing to a terminal,
    // and the escape sequence lands between the line start and the +/-/~ marker,
    // so an anchored pattern over a coloured plan matches nothing. That is an
    // under-match in a fallback whose own comment claims it over-matches, and
    // it reads as "no DNS in this plan".
    writeTerraformStub({ planResourceChanges: noDnsChange });
    run(['--target', 'shared', '--yes']);
    expect(calls()).toMatch(/plan[^\n]*-no-color/);
  });

  it('names the records it would change, rather than saying only that some exist', () => {
    writeTerraformStub({ planResourceChanges: dnsChange });
    const res = run(['--target', 'staging']);
    expect(res.stdout).toMatch(/aws_route53_record\.apex_a/);
    expect(res.stdout).toMatch(/create/);
  });

  it('is not satisfied by --yes, which every other confirmation here accepts', () => {
    // An approval a flag can supply in advance is not the human approval this
    // asks for. --yes still answers the ordinary production confirmation, which
    // is why the next case exists.
    writeTerraformStub({ planResourceChanges: dnsChange });
    const res = run(['--target', 'staging', '--yes']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).not.toMatch(/\sapply\s/);
  });

  it('leaves --yes working for the environment confirmation when no DNS changes', () => {
    // The guard against over-reach: a gate that blocked every unattended apply
    // would be turned off rather than obeyed. The shared tree is the one that
    // asks for the word AND accepts --yes; production refuses --yes outright,
    // for its own reasons, which is asserted elsewhere in this file.
    writeTerraformStub({ planResourceChanges: noDnsChange });
    const res = run(['--target', 'shared', '--yes']);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(calls()).toMatch(/\sapply\s/);
  });

  it('ignores a no-op route53 entry, which every plan carries for unchanged records', () => {
    // Every plan lists unchanged resources. Firing on those would mean the gate
    // fires on every apply, which teaches an operator to type APPLY without
    // reading -- the exact failure the confirmation doctrine warns about.
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_route53_record', address: 'aws_route53_record.apex_a', actions: ['no-op'] },
      ],
    });
    const res = run(['--target', 'staging']);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).not.toMatch(/THIS PLAN CHANGES DNS/);
    expect(calls()).toMatch(/terraform .*apply/);
  });

  it('fires on a delete as readily as on a create', () => {
    // Removing a record is the change most likely to be the one nobody meant.
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_route53_record', address: 'aws_route53_record.mx', actions: ['delete'] },
      ],
    });
    expect(run(['--target', 'staging']).exitCode).toBe(1);
  });

  it('fires on a zone change, not only on records', () => {
    writeTerraformStub({
      planResourceChanges: [
        { type: 'aws_route53_zone', address: 'aws_route53_zone.primary', actions: ['create'] },
      ],
    });
    expect(run(['--target', 'staging']).exitCode).toBe(1);
  });

  it('applies normally when the plan touches no DNS at all', () => {
    writeTerraformStub({ planResourceChanges: noDnsChange });
    const res = run(['--target', 'staging']);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).not.toMatch(/THIS PLAN CHANGES DNS/);
  });
});
