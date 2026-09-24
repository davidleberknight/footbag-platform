/**
 * scripts/wire-staging-runtime-trust.sh — telling staging's runtime role to
 * trust the shared job role, and proving afterwards that it does.
 *
 * Until this has run, onboarding a named operator writes them a staging runtime
 * profile whose chain cannot resolve. The failure is quiet: the profile exists,
 * it looks correct, and what is missing sits in an account-level trust policy.
 *
 * The properties pinned here are the ones a values edit plus a hand-run apply
 * could not have:
 *
 *   - the live trust policy decides whether there is anything to do, not the
 *     values file, because a file records what was last written into it and an
 *     edit that was never applied leaves the two disagreeing;
 *   - a principal that does not exist yet is refused before anything is
 *     written, because AWS rejects a trust policy naming an absent principal
 *     and the value would then break every staging apply until removed;
 *   - the policy is read back after the apply, and an apply that reported
 *     success while applying something else is caught there rather than by the
 *     next person to use the chain.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { createScratchDir } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/wire-staging-runtime-trust.sh');

const ACCOUNT = '111122223333';
const SUPER_ADMIN_ARN = `arn:aws:iam::${ACCOUNT}:user/footbag-operator`;
const JOB_ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/FootbagDevTester`;
const SOURCE_PROFILE_ARN = `arn:aws:iam::${ACCOUNT}:user/footbag-staging-source-profile`;

let workDir: string;
let tfvarsTarget: string;
let tfvarsLink: string;
let appliedMarker: string;

/** The values file as it ships: the assignment present, commented out. */
const TFVARS_BEFORE = [
  'aws_account_id = "111122223333"',
  '',
  '# Uncomment once the identity tree has been applied.',
  '# dev_tester_role_arn = "arn:aws:iam::111122223333:role/FootbagDevTester"',
  '',
  'operator_cidrs = ["203.0.113.1/32"]',
  '',
].join('\n');

beforeEach(() => {
  workDir = createScratchDir('wire-trust');
  tfvarsTarget = join(workDir, 'private-checkout-staging.tfvars');
  tfvarsLink = join(workDir, 'terraform.tfvars');
  appliedMarker = join(workDir, 'apply-ran');
  writeFileSync(tfvarsTarget, TFVARS_BEFORE, 'utf-8');
  symlinkSync(tfvarsTarget, tfvarsLink);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface Estate {
  /** Whether the identity tree has been applied, so the principal exists. */
  jobRoleExists?: boolean;
  /** Whether the runtime role already trusts the job role before any apply. */
  trustedBefore?: boolean;
  /** Whether the apply is the thing that adds the trust. */
  applyAddsTrust?: boolean;
  /** What the caller resolves to. */
  callerArn?: string;
}

const HEALTHY: Required<Estate> = {
  jobRoleExists: true,
  trustedBefore: false,
  applyAddsTrust: true,
  callerArn: SUPER_ADMIN_ARN,
};

/**
 * One stub answering everything the script asks the CLI: which profiles this
 * machine has, who the caller is, whether the job role exists, and the runtime
 * role's trusted principals.
 *
 * The trusted set is read from the filesystem rather than baked in, because the
 * sequencing is the thing under test: the script asks before the apply and again
 * afterwards, and a stub that answered identically both times could not tell a
 * run that wired something from one that merely said it had.
 */
/**
 * A `printf` emitting the values tab-separated, the way `aws --output text`
 * returns a list. The tabs go in the format string: printf expands escapes
 * there and not inside a `%s` argument, so spelling them in the value yields a
 * literal backslash and a t, and a stub that did that would be describing an
 * output format the CLI does not produce.
 */
function textList(values: string[]): string {
  const format = values.map(() => '%s').join('\\t');
  const args = values.map((v) => JSON.stringify(v)).join(' ');
  return `printf '${format}\\n' ${args}`;
}

function awsStub(estate: Estate): string {
  const e = { ...HEALTHY, ...estate };
  const path = join(workDir, 'aws-stub.sh');
  const before = e.trustedBefore
    ? [SOURCE_PROFILE_ARN, SUPER_ADMIN_ARN, JOB_ROLE_ARN]
    : [SOURCE_PROFILE_ARN, SUPER_ADMIN_ARN];
  const after = e.applyAddsTrust ? [SOURCE_PROFILE_ARN, SUPER_ADMIN_ARN, JOB_ROLE_ARN] : before;
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then',
      "  printf '%s\\n' footbag-operator FootbagDevTester",
      '  exit 0',
      'fi',
      'if [[ "$1" == "sts" && "$2" == "get-caller-identity" ]]; then',
      `  printf '%s\\n' ${JSON.stringify(e.callerArn)}`,
      '  exit 0',
      'fi',
      'role=""',
      'prev=""',
      'for a in "$@"; do',
      '  if [[ "$prev" == "--role-name" ]]; then role="$a"; fi',
      '  prev="$a"',
      'done',
      'if [[ "$1" == "iam" && "$2" == "get-role" ]]; then',
      '  case "$role" in',
      `    FootbagDevTester) ${e.jobRoleExists ? "printf '{}\\n'; exit 0" : 'exit 254'} ;;`,
      '    footbag-staging-app-runtime)',
      `      if [[ -e ${JSON.stringify(appliedMarker)} ]]; then`,
      `        ${textList(after)}`,
      '      else',
      `        ${textList(before)}`,
      '      fi',
      '      exit 0 ;;',
      '  esac',
      '  exit 254',
      'fi',
      'echo "unexpected aws invocation: $*" >&2',
      'exit 64',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/** A stand-in for the apply, recording that it ran and with what arguments. */
function applyStub(exitCode = 0): string {
  const path = join(workDir, 'apply-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" > ${JSON.stringify(appliedMarker)}`,
      `exit ${exitCode}`,
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

interface RunOptions extends Estate {
  applyExit?: number;
  tfvars?: string;
  args?: string[];
}

function run(options: RunOptions = {}) {
  const { applyExit = 0, tfvars = tfvarsLink, args = ['--yes'], ...estate } = options;
  const stub = awsStub(estate);
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      AWS_PROFILE_BIN: stub,
      WIRE_TRUST_AWS_BIN: stub,
      WIRE_TRUST_APPLY_CMD: applyStub(applyExit),
      TFVARS_OVERRIDE: tfvars,
    },
    ...SPAWN_GUARD,
  });
}

const applyRan = () => existsSync(appliedMarker);
const tfvarsNow = () => readFileSync(tfvarsTarget, 'utf-8');

describe('wire-staging-runtime-trust refuses the wrong caller', () => {
  it('refuses an assumed role, which is denied every write to the runtime role', () => {
    const r = run({ callerArn: `arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/dave` });
    expect(r.status).toBe(1);
    expect(applyRan()).toBe(false);
    expect(tfvarsNow()).toBe(TFVARS_BEFORE);
    expect(r.stderr).toMatch(/assumed role/);
  });

  it('refuses some other directly authenticated user', () => {
    const r = run({ callerArn: `arn:aws:iam::${ACCOUNT}:user/somebody-else` });
    expect(r.status).toBe(1);
    expect(applyRan()).toBe(false);
  });

  it('exits 2 on an unknown flag', () => {
    const r = run({ args: ['--target', 'staging'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown argument: --target');
  });
});

describe('wire-staging-runtime-trust asks AWS, not the values file, whether there is work', () => {
  it('does nothing at all when the trust policy already names the job role', () => {
    const r = run({ trustedBefore: true });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Already wired');
    expect(applyRan()).toBe(false);
    expect(tfvarsNow()).toBe(TFVARS_BEFORE);
  });

  it('applies even where the values file already carries the ARN, since that is not the estate', () => {
    // The state this script exists to end: an edit that was made and never
    // applied, so the file says yes and the account says no.
    writeFileSync(
      tfvarsTarget,
      TFVARS_BEFORE.replace(`# dev_tester_role_arn = "${JOB_ROLE_ARN}"`, `dev_tester_role_arn = "${JOB_ROLE_ARN}"`),
      'utf-8',
    );
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/has not been applied yet/);
    expect(applyRan()).toBe(true);
  });
});

describe('wire-staging-runtime-trust refuses to name a principal that does not exist', () => {
  it('stops before writing anything when the job role is absent', () => {
    const r = run({ jobRoleExists: false });
    expect(r.status).toBe(1);
    expect(tfvarsNow()).toBe(TFVARS_BEFORE);
    expect(applyRan()).toBe(false);
    expect(r.stderr).toMatch(/no IAM role named FootbagDevTester/);
    expect(r.stderr).toContain('--target identity');
  });

  it('refuses when the values file carries no assignment to change', () => {
    writeFileSync(tfvarsTarget, 'aws_account_id = "111122223333"\n', 'utf-8');
    const r = run();
    expect(r.status).toBe(1);
    expect(applyRan()).toBe(false);
    expect(r.stderr).toMatch(/rather than letting this script invent the line/);
  });

  it('refuses a dangling values symlink rather than creating the target', () => {
    rmSync(tfvarsTarget);
    const r = run();
    expect(r.status).toBe(1);
    expect(existsSync(tfvarsTarget)).toBe(false);
    expect(applyRan()).toBe(false);
  });

  it('refuses a values path inside this repository that git does not ignore', () => {
    // The values file carries operator address ranges; writing one where git
    // can pick it up is how those get committed.
    const tracked = join(process.cwd(), 'terraform/staging/variables.tf');
    const before = readFileSync(tracked, 'utf-8');
    const r = run({ tfvars: tracked });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/git does not ignore it/);
    expect(readFileSync(tracked, 'utf-8')).toBe(before);
    expect(applyRan()).toBe(false);
  });
});

describe('wire-staging-runtime-trust wires it and proves the outcome', () => {
  it('uncomments the assignment, applies staging, and reads the policy back', () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(tfvarsNow()).toContain(`dev_tester_role_arn = "${JOB_ROLE_ARN}"`);
    expect(tfvarsNow()).not.toContain(`# dev_tester_role_arn`);
    expect(readFileSync(appliedMarker, 'utf-8')).toContain('--target staging');
    expect(r.stdout).toContain(`trusts ${JOB_ROLE_ARN}`);
  });

  it('writes through the symlink so the link into the private checkout survives', () => {
    run();
    expect(lstatSync(tfvarsLink).isSymbolicLink()).toBe(true);
    expect(readFileSync(tfvarsTarget, 'utf-8')).toContain(`dev_tester_role_arn = "${JOB_ROLE_ARN}"`);
  });

  it('leaves every other line of the values file alone', () => {
    run();
    expect(tfvarsNow()).toContain('operator_cidrs = ["203.0.113.1/32"]');
    expect(tfvarsNow()).toContain('aws_account_id = "111122223333"');
  });

  it('fails when the apply reported success but the policy does not name the role', () => {
    // An apply satisfied with its own plan is a different claim from this role
    // now trusting that one, and the gap is what a values edit could not catch.
    const r = run({ applyAddsTrust: false });
    expect(r.status).toBe(1);
    expect(applyRan()).toBe(true);
    expect(r.stderr).toMatch(/still does not trust/);
    // It says what the policy does carry, so the operator is not left guessing.
    expect(r.stderr).toContain(SOURCE_PROFILE_ARN);
  });

  it('reports a failed apply as unfinished rather than as unproven', () => {
    const r = run({ applyExit: 3 });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/did not complete/);
    expect(r.stderr).toMatch(/re-run this to/);
  });
});
