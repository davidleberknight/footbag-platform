/**
 * scripts/standup-identity-center.sh — applying the tree that declares the
 * human-operator permission sets.
 *
 * Two preconditions decide whether this tree can be applied at all, neither is
 * visible in a plan, and each produces a failure that names the wrong cause.
 *
 * The Identity Center instance is created by a console action with no supported
 * API behind it, so an apply attempted before that fails inside a data source
 * with a message about an empty list. And each permission set denies the operator
 * roles every write to their own definition, because in an organization of one the
 * only account is the management account and a service control policy never
 * applies there, so the role cannot apply the tree that declares it: a run under
 * the federated identity fails part-way with an access denial that reads like a
 * broken policy rather than like the design working.
 *
 * What is pinned here is that both refusals happen BEFORE anything is applied,
 * that neither can be skipped by resuming, that the confirmation is typed, and
 * that the verification afterwards asserts the outcome — the generated role
 * exists and somebody is assigned to it — rather than that a command was run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/standup-identity-center.sh');

const INSTANCE_ARN = 'arn:aws:sso:::instance/ssoins-1111111111111111';
const PERMISSION_SET_ARN = `arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-2222222222222222`;
/** The permission set this script stands up; every assertion about it reads from here. */
const PERMISSION_SET_NAME = 'FootbagSuperAdmin';
/** A second permission set on the same instance, belonging to some other job. */
const FOREIGN_PERMISSION_SET_ARN = `arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-3333333333333333`;
/** The narrower of the two sets the same tree declares: staging, and no host shell. */
const DEV_TESTER_SET_ARN = `arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-4444444444444444`;
const DEV_TESTER_NAME = 'FootbagDevTester';
const ROLE_ARN =
  'arn:aws:iam::111122223333:role/aws-reserved/sso.amazonaws.com/us-east-1/AWSReservedSSO_FootbagSuperAdmin_1111111111111111';
/**
 * The dev-and-tester's generated role. Deliberately a different suffix: the two
 * are told apart only by the name embedded in each, and a run that matched any
 * reserved-SSO role would write one of them into the wrong trust policy without
 * either name appearing in the mistake.
 */
const DEV_TESTER_ROLE_ARN =
  'arn:aws:iam::111122223333:role/aws-reserved/sso.amazonaws.com/us-east-1/AWSReservedSSO_FootbagDevTester_9999999999999999';

/** The identity a run authenticates as when it is NOT the directly authenticated one. */
const FEDERATED_ARN =
  'arn:aws:sts::111122223333:assumed-role/AWSReservedSSO_FootbagSuperAdmin_1111111111111111/david_leberknight';

interface Account {
  /** Instance ARNs the account answers with; empty means Identity Center is off. */
  instances?: string[];
  /**
   * The generated role(s) behind the permission set, as `--output text` returns
   * them: empty means none provisioned, and more than one means a recreated
   * permission set left an older one behind.
   */
  roleArn?: string | string[];
  /** The same, for the dev-and-tester set, which each answer is asked for by name. */
  devTesterRoleArn?: string | string[];
  /** Principal ids assigned the permission set; empty means nobody can assume it. */
  assigned?: string[];
  /**
   * Principal ids assigned the dev-and-tester set. Empty is a real state rather
   * than a fault: it is a roster with nobody on that tier, and no role is
   * generated behind an unassigned set.
   */
  devTesterAssigned?: string[];
  /**
   * Every permission set on the instance, in the order the listing returns them.
   * The listing answers with bare ARNs carrying no name, so the run has to ask
   * each one what it is called; a case that puts a foreign set first is what
   * distinguishes resolving by name from taking whichever came back first.
   */
  permissionSets?: Array<{ arn: string; name: string }>;
}

const HEALTHY: Required<Account> = {
  instances: [INSTANCE_ARN],
  roleArn: ROLE_ARN,
  devTesterRoleArn: DEV_TESTER_ROLE_ARN,
  assigned: ['1111-aaaa', '2222-bbbb'],
  devTesterAssigned: ['3333-cccc'],
  permissionSets: [
    { arn: PERMISSION_SET_ARN, name: PERMISSION_SET_NAME },
    { arn: DEV_TESTER_SET_ARN, name: DEV_TESTER_NAME },
  ],
};

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-standup-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * `--output text` separates several values on one line with tabs, and the tab
 * has to be a real one: printf interprets escapes in its format string, never in
 * a `%s` argument, so joining the values in JavaScript would emit a literal
 * backslash-t and every multi-value answer would arrive as one word. That is the
 * difference between this stub exercising the too-many-instances refusal and
 * silently agreeing there is one.
 */
function textOutput(values: string[]): string {
  if (values.length === 0) return "printf '\\n'";
  return `printf '%s\\t' ${values.map((v) => JSON.stringify(v)).join(' ')}; printf '\\n'`;
}

/** One answer or several, as `--output text` returns them, with '' meaning none. */
function asList(value: string | string[]): string[] {
  if (Array.isArray(value)) return value;
  return value === '' ? [] : [value];
}

function awsStub(account: Account): string {
  const a = { ...HEALTHY, ...account };
  const path = join(workDir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'case "$2" in',
      `  list-instances) ${textOutput(a.instances)} ;;`,
      // The run asks for one permission set's generated role at a time, by
      // putting that set's name in the query, so the stub answers per name. A
      // stub that returned every reserved-SSO role whatever it was asked would
      // let a run that matched loosely pass while writing one role's ARN into the
      // other's trust policy.
      '  list-roles)',
      '    want=""',
      '    for arg in "$@"; do',
      `      if [[ "$arg" == *AWSReservedSSO_${PERMISSION_SET_NAME}_* ]]; then want="super_admin"; fi`,
      `      if [[ "$arg" == *AWSReservedSSO_${DEV_TESTER_NAME}_* ]]; then want="dev_tester"; fi`,
      '    done',
      '    case "$want" in',
      `      super_admin) ${textOutput(asList(a.roleArn))} ;;`,
      `      dev_tester) ${textOutput(asList(a.devTesterRoleArn))} ;;`,
      `      *) ${textOutput([])} ;;`,
      '    esac',
      '    ;;',
      `  list-permission-sets) ${textOutput(a.permissionSets.map((p) => p.arn))} ;;`,
      // The run passes the ARN it is asking about as --permission-set-arn, so the
      // stub answers per ARN rather than with one fixed name. An ARN nobody
      // declared prints nothing, which is how a set that has been deleted between
      // the listing and the describe behaves.
      '  describe-permission-set)',
      '    want=""; prev=""',
      '    for arg in "$@"; do',
      '      if [[ "$prev" == "--permission-set-arn" ]]; then want="$arg"; fi',
      '      prev="$arg"',
      '    done',
      '    case "$want" in',
      ...a.permissionSets.map(
        (p) => `      ${JSON.stringify(p.arn)}) printf '%s\\n' ${JSON.stringify(p.name)} ;;`,
      ),
      '    esac',
      '    ;;',
      // Assignments belong to one permission set, so the stub answers per ARN.
      // Answering the same list whatever it is asked about would hide the whole
      // class of defect where the run reads one set and reports on another.
      '  list-account-assignments)',
      '    want=""; prev=""',
      '    for arg in "$@"; do',
      '      if [[ "$prev" == "--permission-set-arn" ]]; then want="$arg"; fi',
      '      prev="$arg"',
      '    done',
      '    case "$want" in',
      `      ${JSON.stringify(PERMISSION_SET_ARN)}) ${textOutput(a.assigned)} ;;`,
      `      ${JSON.stringify(DEV_TESTER_SET_ARN)}) ${textOutput(a.devTesterAssigned)} ;;`,
      `      *) ${textOutput([])} ;;`,
      '    esac',
      '    ;;',
      "  get-caller-identity) printf '111122223333\\n' ;;",
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/**
 * A terraform stub that records each subcommand it was asked for, so a case can
 * assert that a refusal happened before the apply rather than after it.
 */
function terraformStub(opts: { planFails?: boolean } = {}): { path: string; log: string } {
  const path = join(workDir, 'terraform-stub.sh');
  const log = join(workDir, 'terraform-calls.log');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      // -chdir=<dir> is always first, so the subcommand is the second argument.
      `printf '%s\\n' "$2" >> ${JSON.stringify(log)}`,
      opts.planFails ? 'if [[ "$2" == "plan" ]]; then exit 1; fi' : '',
      // A real plan writes the saved-plan file the apply then consumes.
      'if [[ "$2" == "plan" ]]; then',
      '  for arg in "$@"; do',
      '    if [[ "$arg" == -out=* ]]; then printf \'plan\\n\' > "${arg#-out=}"; fi',
      '  done',
      'fi',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return { path, log };
}

/**
 * Stand-in values files for the two environments, so a case never reaches the
 * real ones. Those are gitignored symlinks into the maintainers' private
 * operations checkout: a suite that wrote through them would edit a second
 * repository from a test run.
 */
function tfvarsDir(existingArn?: string): string {
  const dir = join(workDir, 'tfvars');
  for (const stack of ['staging', 'production']) {
    mkdirSync(join(dir, stack), { recursive: true });
    writeFileSync(
      join(dir, stack, 'terraform.tfvars'),
      [
        `environment = "${stack}"`,
        'aws_account_id = "111122223333"',
        ...(existingArn ? [`super_admin_sso_role_arn = "${existingArn}"`] : []),
        '',
      ].join('\n'),
      'utf-8',
    );
  }
  return dir;
}

function readTfvars(dir: string, stack: string): string {
  return readFileSync(join(dir, stack, 'terraform.tfvars'), 'utf-8');
}

/** A stand-in apply wrapper that records the arguments it was handed. */
function applyStub(opts: { failOn?: string } = {}): { path: string; log: string } {
  const path = join(workDir, 'apply-stub.sh');
  const log = join(workDir, 'apply-calls.log');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(log)}`,
      opts.failOn ? `if [[ "$*" == *${opts.failOn}* ]]; then exit 1; fi` : '',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return { path, log };
}

function applyCalls(log: string): string[] {
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf-8')
    .split('\n')
    .filter((l) => l.trim() !== '');
}

interface RunOptions {
  account?: Account;
  /** The ARN the run authenticates as; defaults to the directly authenticated identity. */
  arn?: string;
  terraform?: { path: string; log: string };
  apply?: { path: string; log: string };
  /** Directory holding the two stand-in values files. */
  tfvars?: string;
}

function run(
  args: string[] = [],
  { account = {}, arn, terraform, apply, tfvars }: RunOptions = {},
) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      ...awsIdentityStubEnv(workDir, arn ? { arn } : {}),
      STANDUP_IDENTITY_AWS_BIN: awsStub(account),
      STANDUP_IDENTITY_TERRAFORM_BIN: (terraform ?? terraformStub()).path,
      STANDUP_IDENTITY_APPLY_SCRIPT: (apply ?? applyStub()).path,
      STANDUP_IDENTITY_TFVARS_DIR: tfvars ?? tfvarsDir(),
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('standup-identity-center.sh — the argument guards', () => {
  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });

  it('refuses a step number outside the sequence', () => {
    const r = run(['--from-step', '9']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--from-step takes a step number from 1 to 5/);
  });

  it('refuses --dry-run and --verify together, because they do different things', () => {
    const r = run(['--dry-run', '--verify']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/pass one or the other/);
  });

  it('takes no --target, because this tree is account-level', () => {
    // Staging and production share one AWS account and one set of human
    // operators, so there is no environment to choose here. An operator passing
    // one has misunderstood the tree and should be told so.
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--target'");
  });
});

describe('standup-identity-center.sh — the dry run', () => {
  it('states the whole sequence and applies nothing', () => {
    const tf = terraformStub();
    const r = run(['--dry-run'], { terraform: tf });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Would run, in order/);
    expect(() => readdirSync(workDir)).not.toThrow();
    expect(readdirSync(workDir)).not.toContain('terraform-calls.log');
  });

  it('says the super-admin identity is untouched, which is the fact most likely to be got wrong', () => {
    const r = run(['--dry-run']);
    expect(r.stdout).toMatch(/Its access key stays and its ARN/);
    expect(r.stdout).toMatch(/recreating the user/);
  });

  it('announces the stub, because a stubbed run proves nothing about the account', () => {
    expect(run(['--dry-run']).stderr).toMatch(/SYNTHETIC:.*proves nothing about the account/);
  });
});

describe('standup-identity-center.sh — only the directly authenticated identity applies it', () => {
  it('refuses a run authenticated as the federated role', () => {
    const tf = terraformStub();
    const r = run([], { arn: FEDERATED_ARN, terraform: tf });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/applied by the directly authenticated identity alone/);
  });

  it('explains that the denial is the design rather than a missing permission', () => {
    // The sentence that stops the next operator widening the policy to "fix" it.
    const r = run([], { arn: FEDERATED_ARN });
    expect(r.stderr).toMatch(/is the design working, not a/);
    expect(r.stderr).toMatch(/cannot\s*\n?\s*apply the tree that declares it/);
  });

  it('refuses before terraform is invoked at all', () => {
    const tf = terraformStub();
    run([], { arn: FEDERATED_ARN, terraform: tf });
    expect(readdirSync(workDir)).not.toContain('terraform-calls.log');
  });

  it('cannot be skipped by resuming at a later step', () => {
    // --from-step is a value the argument validator accepts and the resume hints
    // actively recommend, so a precondition guarded by it is a precondition with
    // a documented bypass.
    const tf = terraformStub();
    const r = run(['--from-step', '3'], { arn: FEDERATED_ARN, terraform: tf });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/applied by the directly authenticated identity/);
    expect(readdirSync(workDir)).not.toContain('terraform-calls.log');
  });

  it('cannot be skipped by --verify either', () => {
    const r = run(['--verify'], { arn: FEDERATED_ARN });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/applied by the directly authenticated identity/);
  });
});

describe('standup-identity-center.sh — the Identity Center instance', () => {
  it('refuses when no instance exists, and names the console step', () => {
    const r = run([], { account: { instances: [] } });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no IAM Identity Center instance in this account/);
    expect(r.stderr).toMatch(/console action/);
  });

  it('names all three permanent choices in that flow', () => {
    // Each is either irreversible or invisible until it is too late: the Region
    // can only be changed by deleting the instance, an account instance carries
    // no permission sets, and multi-account permissions off means none appears.
    const r = run([], { account: { instances: [] } });
    expect(r.stderr).toMatch(/Region/);
    expect(r.stderr).toMatch(/ACCOUNT instance/);
    expect(r.stderr).toMatch(/multi-account/);
  });

  it('refuses when more than one instance answers, rather than taking the first', () => {
    // An account instance alongside the organization instance is how this
    // happens, and picking the wrong one creates directory records with nothing
    // to assign them to.
    const r = run([], {
      account: { instances: [INSTANCE_ARN, 'arn:aws:sso:::instance/ssoins-3333333333333333'] },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/2 Identity Center instances answered/);
  });

  it('refuses before terraform is invoked', () => {
    const tf = terraformStub();
    run([], { account: { instances: [] }, terraform: tf });
    expect(readdirSync(workDir)).not.toContain('terraform-calls.log');
  });
});

describe('standup-identity-center.sh — the apply', () => {
  it('refuses to apply with no terminal to confirm on and no --yes', () => {
    // The spawned run has no terminal, which is exactly the case the shared
    // confirmation helper exists to refuse rather than wave through.
    const tf = terraformStub();
    const r = run([], { terraform: tf });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no terminal to confirm on/);
    expect(r.stdout + r.stderr).toMatch(/Aborted before terraform apply/);
  });

  it('plans before it asks, so the answer is given against a diff', () => {
    const tf = terraformStub();
    run([], { terraform: tf });
    expect(readdirSync(workDir)).toContain('terraform-calls.log');
  });

  it('leaves no saved plan behind when the confirmation is refused', () => {
    // A saved plan is a zip carrying a full copy of state, so it holds every
    // resolved value in the clear. The shred is on a trap for exactly this path.
    const tf = terraformStub();
    run([], { terraform: tf });
    const leftovers = readdirSync('/tmp').filter((n) => n.startsWith('footbag-identity-plan.'));
    expect(leftovers).toEqual([]);
  });

  it('reports a failed plan as having applied nothing', () => {
    const tf = terraformStub({ planFails: true });
    const r = run([], { terraform: tf });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/terraform plan failed\. Nothing was applied/);
  });
});

describe('standup-identity-center.sh — the verification asserts the outcome', () => {
  it('fails when no role was generated for the permission set', () => {
    // Identity Center provisions the role when the permission set is first
    // assigned, so its absence means the apply did not land or nothing was
    // assigned. Either way there is nothing for a trust policy to name.
    const r = run(['--verify'], { account: { roleArn: '' } });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/NO generated role/);
  });

  it('fails when nobody is assigned the permission set', () => {
    // A permission set assigned to nobody reads as landed in every plan and
    // admits no operator at all.
    const r = run(['--verify'], { account: { assigned: [] } });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/NO operator is assigned/);
  });

  it('reads the assignments of the permission set it names, not whichever is listed first', () => {
    // The listing returns bare ARNs, which carry no name, and the instance holds
    // more than one permission set. Answering from the first one reports some
    // other job's assignments under this name, and the verdict then describes a
    // role nobody looked at while reading exactly as a healthy run does.
    const r = run(['--verify'], {
      account: {
        permissionSets: [
          { arn: FOREIGN_PERMISSION_SET_ARN, name: 'SomeOtherJob' },
          { arn: PERMISSION_SET_ARN, name: PERMISSION_SET_NAME },
          { arn: DEV_TESTER_SET_ARN, name: DEV_TESTER_NAME },
        ],
      },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/operators assigned: 2/);
  });

  it('fails when no permission set on the instance carries the name it is standing up', () => {
    // Distinct from nobody being assigned: the set itself is absent, so the apply
    // that declares it did not land and there is nothing to assign anyone to.
    const r = run(['--verify'], {
      account: {
        permissionSets: [{ arn: FOREIGN_PERMISSION_SET_ARN, name: 'SomeOtherJob' }],
      },
    });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(
      /FootbagSuperAdmin\s+NO permission set of that name exists/,
    );
  });

  it('prints the generated role ARN, which cannot be predicted', () => {
    const r = run(['--verify']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(ROLE_ARN);
  });

  it('reads both permission sets back, each by its own name', () => {
    // One tree declares both, so a run that checked only the wider one would
    // report a healthy standup while the narrower job had no role at all. The two
    // generated roles differ only in the name embedded in each.
    const r = run(['--verify']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(ROLE_ARN);
    expect(r.stdout).toContain(DEV_TESTER_ROLE_ARN);
  });

  it('fails when only one of the two permission sets is on the instance', () => {
    // Both come from one apply, so one of them missing means that apply landed
    // partially or landed from a revision carrying only the other. Reported as a
    // failure because it is not a state any roster produces.
    const r = run(['--verify'], {
      account: {
        permissionSets: [{ arn: PERMISSION_SET_ARN, name: PERMISSION_SET_NAME }],
      },
    });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/FootbagDevTester\s+NO permission set of that name exists/);
  });

  it('passes with nobody holding the dev-and-tester role, and says what that means', () => {
    // A roster with no dev-and-tester on it is a real state, not a fault: nothing
    // is assigned, so Identity Center generates no role, and staging's trust
    // policy correctly carries no dev-and-tester principal. Failing here would
    // stop a standup over a roster that is exactly as intended.
    const r = run(['--verify'], {
      account: { devTesterAssigned: [], devTesterRoleArn: '' },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/nobody is assigned it/);
    expect(r.stdout).not.toContain(DEV_TESTER_ROLE_ARN);
  });

  it('hands over only what it does not do itself', () => {
    // The trust-policy work is steps 4 and 5 of this same run, so printing it as
    // an instruction would be telling the operator to redo what just happened.
    // What is genuinely left is writing the federated profile and proving it.
    const r = run(['--verify']);
    expect(r.stdout).toMatch(/bash scripts\/install-operator-sso-profile\.sh/);
    expect(r.stdout).not.toMatch(/terraform-apply\.sh --target/);
  });

  it('hands over a script rather than a command to compose by hand', () => {
    // Configuring that profile by hand means answering six questions, four of
    // which have one right answer nobody can guess, and a stanza that is nearly
    // right fails later in some other tool with a message about credentials.
    const r = run(['--verify']);
    expect(r.stdout).not.toMatch(/aws configure sso/);
  });

  it('says the profile refuses to be written over a static key', () => {
    // The shadowing is the failure worth naming here: a key under that name is
    // preferred over the sign-in silently, so the profile would be written,
    // look right, and never once be used.
    const r = run(['--verify']);
    expect(r.stdout).toMatch(/refuses while a static key still occupies that profile name/);
  });

  it('keeps the profile name it already has, so nothing learns a second one', () => {
    const r = run(['--verify']);
    expect(r.stdout).toMatch(/no script, runbook step or\s*\n?\s*workstation learns a second one/);
  });

  it('names what a deploy would not prove', () => {
    // A staging code-only deploy never chain-assumes a runtime role, so a green
    // deploy says nothing about whether the new principal was added.
    const r = run(['--verify']);
    expect(r.stdout).toMatch(/never chain-assumes a runtime role/);
  });

  it('says the super-admin identity is unchanged, which is what the design turns on', () => {
    const r = run(['--verify']);
    expect(r.stdout).toMatch(/super-admin identity is unchanged/);
  });
});

/**
 * Writing the generated role ARN into both environments, and applying them.
 *
 * These two steps live in this script rather than in a second one because the
 * ARN is read one step above them. Handed to an operator to paste, a stale or
 * mistyped reserved-SSO ARN produces a trust policy that reads correctly, shows
 * no plan diff, and refuses every AssumeRole — which is the failure mode this
 * whole script exists to remove.
 *
 * The values files here are stand-ins. The real ones are gitignored symlinks
 * into the maintainers' private operations checkout, and a suite that wrote
 * through them would be editing a second repository from a test run.
 */
describe('standup-identity-center.sh — the ARN into both environments', () => {
  it('writes the ARN with no trailing whitespace from the CLI text output', () => {
    // `--output text` separates a list with tabs. Taken whole, the answer
    // carries one into the values file, and a Terraform string holding an ARN
    // plus whitespace names a principal that does not exist: the trust policy
    // reads correctly and refuses every AssumeRole, with no plan diff to
    // explain it.
    const dir = tfvarsDir();
    run(['--from-step', '4', '--yes'], { tfvars: dir });
    expect(readTfvars(dir, 'staging')).toContain(`= "${ROLE_ARN}"`);
    expect(readTfvars(dir, 'staging')).not.toMatch(/[ \t]"\s*$/m);
  });

  it('refuses when two roles match, rather than picking one', () => {
    // A permission set deleted and recreated leaves a role behind under the old
    // generated suffix. Only one is the role the operators assume, this run
    // cannot tell which, and writing either would show no symptom until an
    // AssumeRole refuses.
    const second = ROLE_ARN.replace('_1111111111111111', '_2222222222222222');
    const dir = tfvarsDir();
    const apply = applyStub();
    const r = run(['--from-step', '4', '--yes'], {
      account: { roleArn: [ROLE_ARN, second] },
      tfvars: dir,
      apply,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/2 roles match AWSReservedSSO_FootbagSuperAdmin_/);
    expect(readTfvars(dir, 'staging')).not.toContain('super_admin_sso_role_arn');
    expect(applyCalls(apply.log)).toEqual([]);
  });

  it('writes it into staging and production alike', () => {
    const dir = tfvarsDir();
    const r = run(['--from-step', '4', '--yes'], { tfvars: dir });
    expect(r.status, r.stderr).toBe(0);
    expect(readTfvars(dir, 'staging')).toContain(`super_admin_sso_role_arn = "${ROLE_ARN}"`);
    expect(readTfvars(dir, 'production')).toContain(`super_admin_sso_role_arn = "${ROLE_ARN}"`);
  });

  it('writes the dev-and-tester ARN into staging and never into production', () => {
    // Production's tree declares no dev-and-tester variable at all, and that
    // absence is the whole of what keeps that job off production. Writing the
    // value there anyway would set a variable nothing reads, and would read to
    // the next person as though production trusted that role.
    const dir = tfvarsDir();
    const r = run(['--from-step', '4', '--yes'], { tfvars: dir });
    expect(r.status, r.stderr).toBe(0);
    expect(readTfvars(dir, 'staging')).toContain(
      `dev_tester_sso_role_arn = "${DEV_TESTER_ROLE_ARN}"`,
    );
    expect(readTfvars(dir, 'production')).not.toContain('dev_tester_sso_role_arn');
    expect(readTfvars(dir, 'production')).not.toContain(DEV_TESTER_ROLE_ARN);
  });

  it('keeps the two ARNs in their own variables', () => {
    // The generated suffixes are unpredictable and the names are the only thing
    // telling the roles apart, so crossing them produces two trust policies that
    // read correctly, show no plan diff, and admit the wrong job to staging.
    const dir = tfvarsDir();
    run(['--from-step', '4', '--yes'], { tfvars: dir });
    const staging = readTfvars(dir, 'staging');
    expect(staging).toContain(`super_admin_sso_role_arn = "${ROLE_ARN}"`);
    expect(staging).not.toContain(`super_admin_sso_role_arn = "${DEV_TESTER_ROLE_ARN}"`);
    expect(staging).not.toContain(`dev_tester_sso_role_arn = "${ROLE_ARN}"`);
  });

  it('writes no dev-and-tester ARN when nobody holds that role', () => {
    // Nothing is assigned, so no role exists to name. Staging's variable stays
    // unset, which its tree already treats as "no such principal" rather than as
    // a missing value.
    const dir = tfvarsDir();
    const r = run(['--from-step', '4', '--yes'], {
      account: { devTesterAssigned: [], devTesterRoleArn: '' },
      tfvars: dir,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(readTfvars(dir, 'staging')).toContain(`super_admin_sso_role_arn = "${ROLE_ARN}"`);
    expect(readTfvars(dir, 'staging')).not.toContain('dev_tester_sso_role_arn');
  });

  it('leaves the rest of each values file alone', () => {
    // It is one assignment in a file carrying every other setting for that
    // environment. Rewriting more than the one line is how an unrelated value
    // gets lost in a step nobody was reviewing for that.
    const dir = tfvarsDir();
    run(['--from-step', '4', '--yes'], { tfvars: dir });
    expect(readTfvars(dir, 'staging')).toContain('environment = "staging"');
    expect(readTfvars(dir, 'staging')).toContain('aws_account_id = "111122223333"');
  });

  it('says so and rewrites nothing when the ARN is already there', () => {
    // A resume after a part-way failure should not show a diff with nothing in
    // it and ask for a confirmation that changes nothing.
    const dir = tfvarsDir(ROLE_ARN);
    const r = run(['--from-step', '4', '--yes'], { tfvars: dir });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/staging: already carries this super_admin_sso_role_arn/);
    expect(r.stdout).toMatch(/production: already carries this super_admin_sso_role_arn/);
  });

  it('replaces a stale ARN rather than appending a second assignment', () => {
    // Terraform takes the last assignment, so a stale duplicate below the
    // rewritten line would win over the value the operator was shown.
    const stale = ROLE_ARN.replace('_1111111111111111', '_2222222222222222');
    const dir = tfvarsDir(stale);
    run(['--from-step', '4', '--yes'], { tfvars: dir });
    const written = readTfvars(dir, 'staging');
    expect(written).toContain(ROLE_ARN);
    expect(written).not.toContain(stale);
    expect(written.match(/super_admin_sso_role_arn/g)?.length).toBe(1);
  });

  it('writes nothing and applies nothing when the confirmation is refused', () => {
    // No terminal and no --yes is a refusal, which must leave both the values
    // files and both environments exactly as they were.
    const dir = tfvarsDir();
    const apply = applyStub();
    const r = run(['--from-step', '4'], { tfvars: dir, apply });
    expect(r.status).toBe(1);
    expect(readTfvars(dir, 'staging')).not.toContain('super_admin_sso_role_arn');
    expect(applyCalls(apply.log)).toEqual([]);
  });

  it('refuses when a values file cannot be resolved, naming the private checkout', () => {
    const r = run(['--from-step', '4', '--yes'], { tfvars: join(workDir, 'no-such-dir') });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/private operations checkout/);
  });

  it('still runs the step 1 preconditions when resumed at step 4', () => {
    const apply = applyStub();
    const r = run(['--from-step', '4', '--yes'], { arn: FEDERATED_ARN, apply });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/applied by the directly authenticated identity/);
    expect(applyCalls(apply.log)).toEqual([]);
  });
});

/**
 * The roster, and the reason it is applied through the ordinary wrapper.
 *
 * Who the operators are is a separate tree from what the operator roles may do,
 * because hiring and firing are ordinary work and the role-definition tree is
 * the one tree an operator cannot apply. The bootstrap still has to create the
 * first roster — a joiner is granted access by an existing operator, and the
 * first ones have nobody to grant it — but it does so through exactly the
 * command a later hiring runs, so that path is exercised once before anyone
 * depends on it.
 */
describe('standup-identity-center.sh — the roster', () => {
  it('applies it through the wrapper, before reading the generated role back', () => {
    // Identity Center provisions the IAM role behind a permission set only when
    // that set is first assigned to an account, so a read-back before the roster
    // exists finds nothing and reports a failure that is really an ordering bug.
    const apply = applyStub();
    const r = run(['--yes'], { apply });
    expect(r.status, r.stderr).toBe(0);
    expect(applyCalls(apply.log)[0]).toBe('--target operators');
  });

  it('stops when the roster apply fails, rather than reading a role back', () => {
    const apply = applyStub({ failOn: 'operators' });
    const r = run(['--yes'], { apply });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/roster apply failed/);
    expect(r.stderr).toMatch(/nobody is assigned the permission set/);
  });

  it('sends a would-be hiring to the roster instead of this script', () => {
    // The refusal an operator hits if they reach for the bootstrap to add or
    // remove somebody. Naming the right command is the whole point: the wrong
    // one would put a privileged sign-in in front of revoking access.
    const r = run([], { arn: FEDERATED_ARN });
    expect(r.stderr).toMatch(/hire or fire somebody, this is the wrong script/);
    expect(r.stderr).toMatch(/terraform-apply\.sh --target operators/);
  });
});

describe('standup-identity-center.sh — applying both environment trees', () => {
  it('applies staging before production', () => {
    // Staging first so a mistake lands on the environment whose data is
    // disposable.
    const apply = applyStub();
    const r = run(['--from-step', '4', '--yes'], { apply });
    expect(r.status, r.stderr).toBe(0);
    expect(applyCalls(apply.log)).toEqual(['--target staging', '--target production']);
  });

  it('never passes --yes through to an apply', () => {
    // The production apply reads its confirmation from the terminal every time
    // and the wrapper refuses the flag there outright, because what that apply
    // replaces is what the public is served. Routing around a guard this script
    // does not own would defeat it from the outside.
    const apply = applyStub();
    run(['--from-step', '4', '--yes'], { apply });
    for (const call of applyCalls(apply.log)) {
      expect(call).not.toContain('--yes');
    }
  });

  it('stops at the first failing environment rather than carrying on', () => {
    const apply = applyStub({ failOn: 'staging' });
    const r = run(['--from-step', '4', '--yes'], { apply });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/staging apply failed/);
    expect(r.stderr).toMatch(/--from-step 5/);
    expect(applyCalls(apply.log)).toEqual(['--target staging']);
  });

  it('applies nothing under --verify, and says the trees were left alone', () => {
    const dir = tfvarsDir();
    const apply = applyStub();
    const r = run(['--verify'], { tfvars: dir, apply });
    expect(r.status, r.stderr).toBe(0);
    expect(applyCalls(apply.log)).toEqual([]);
    expect(readTfvars(dir, 'staging')).not.toContain('super_admin_sso_role_arn');
    expect(r.stdout).toMatch(/left alone/);
  });
});
