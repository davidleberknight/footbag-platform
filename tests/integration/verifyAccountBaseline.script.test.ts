/**
 * scripts/verify-account-baseline.sh — reading the account-level controls that
 * nothing else re-asserts.
 *
 * Four of these are console steps with no Terraform behind them, so nothing
 * detects one being turned off and nothing notices one that was never turned on;
 * the lockdown checklist is the only record they were meant to exist. The
 * quarterly access review has the mirror problem: it told an operator to read
 * each key's last-used date in a console, so the review happened only if
 * somebody remembered where to look.
 *
 * Everything here is a read, so the whole script is drivable. What is pinned is
 * that each control is genuinely checked rather than assumed, that a partially
 * configured control counts as a failure, and that the script exits non-zero on
 * a finding so it can gate rather than only report.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/verify-account-baseline.sh');

interface Estate {
  publicAccessBlock?: string | null;
  passwordPolicy?: { min: number; reuse: number } | null;
  analyzers?: string | null;
  alternateContact?: string | null;
  rootMfa?: string;
  rootKeys?: string;
  users?: string | null;
  /** Whether the super-admin user still holds an active key. */
  superAdminKeyActive?: boolean;
  /** Whether each runtime role's trust policy still names it; null is unreadable. */
  trustsStaging?: boolean | null;
  trustsProduction?: boolean | null;
  /** The Identity Center instance and its identity store; null is not enabled. */
  ssoInstance?: string | null;
  /**
   * The live generated role behind the operator permission set; null is none
   * yet. An array stands for a permission set that has been recreated, leaving a
   * role behind under the old suffix, which `--output text` returns tab-joined
   * on one line.
   */
  ssoRole?: string | string[] | null;
  /**
   * The role read itself does not answer: an access denial, a throttle, an
   * expired credential. Distinct from there being no role, which is the estate's
   * current state rather than a fault.
   */
  ssoRoleReadFails?: boolean;
  /** The operator role ARN the two trust policies actually carry, if any. */
  trustedSsoRole?: string | null;
  /**
   * The live generated role behind the dev-and-tester permission set. Null is
   * none: either the tree has not been applied, or nobody on the roster holds
   * that job, and an unassigned permission set generates no role.
   */
  devTesterRole?: string | string[] | null;
  /** The dev-and-tester role ARN each trust policy actually carries, if any. */
  stagingTrustedDevTesterRole?: string | null;
  productionTrustedDevTesterRole?: string | null;
}

const OPERATOR = 'footbag-operator';
const SSO_ROLE =
  'arn:aws:iam::111122223333:role/aws-reserved/sso.amazonaws.com/us-east-1/AWSReservedSSO_FootbagSuperAdmin_1111111111111111';
/**
 * The dev-and-tester's generated role, with a different suffix from the
 * super-admin one. The two are told apart only by the name embedded in each, so a
 * check that matched any reserved-SSO role would report one under the other's
 * name and never say so.
 */
const DEV_TESTER_ROLE =
  'arn:aws:iam::111122223333:role/aws-reserved/sso.amazonaws.com/us-east-1/AWSReservedSSO_FootbagDevTester_9999999999999999';

/**
 * One `list-roles` answer. A real `--output text` list is tab-separated on one
 * line, and the tab has to be a real one: printf interprets escapes in its format
 * string, never in a %s argument, so joining in JavaScript would emit a literal
 * backslash-t and two roles would arrive as one word.
 */
function listRolesAnswer(roles: string | string[] | null): string {
  if (roles === null) return "printf ''";
  if (Array.isArray(roles)) {
    return `printf '%s\\t' ${roles.map((r) => JSON.stringify(r)).join(' ')}; printf '\\n'`;
  }
  return `printf '%s\\n' ${JSON.stringify(roles)}`;
}

function trustDocument(names: boolean, extras: Array<string | null>): string {
  const principals = names
    ? [`arn:aws:iam::111122223333:user/${OPERATOR}`, 'arn:aws:iam::111122223333:user/src']
    : ['arn:aws:iam::111122223333:user/src'];
  const federated = extras.filter((arn): arn is string => arn !== null);
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: [...principals, ...federated] },
        Action: 'sts:AssumeRole',
      },
    ],
  });
}

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-baseline-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** A healthy account, which each case then spoils in exactly one way. */
const HEALTHY: Required<Estate> = {
  publicAccessBlock: 'True\tTrue\tTrue\tTrue',
  passwordPolicy: { min: 14, reuse: 5 },
  analyzers: 'footbag-account-analyzer',
  alternateContact: 'ops@example.invalid',
  rootMfa: '1',
  rootKeys: '0',
  users: 'footbag-operator',
  superAdminKeyActive: true,
  trustsStaging: true,
  trustsProduction: true,
  // No federated path yet, which is the account as it stands: operators still
  // authenticate as the super-admin identity. Its absence is the current state of
  // the estate rather than a finding, so the healthy sheet carries it.
  ssoInstance: null,
  ssoRole: null,
  ssoRoleReadFails: false,
  trustedSsoRole: null,
  devTesterRole: null,
  stagingTrustedDevTesterRole: null,
  productionTrustedDevTesterRole: null,
};

function awsStub(estate: Estate): string {
  const e = { ...HEALTHY, ...estate };
  const path = join(workDir, 'aws-stub.sh');
  const pwPolicy =
    e.passwordPolicy === null
      ? '    exit 1'
      : `    printf '%s' ${JSON.stringify(
          JSON.stringify({
            PasswordPolicy: {
              MinimumPasswordLength: e.passwordPolicy.min,
              PasswordReusePrevention: e.passwordPolicy.reuse,
            },
          }),
        )}`;
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'case "$2" in',
      '  get-caller-identity) echo 111122223333 ;;',
      `  get-public-access-block) ${
        e.publicAccessBlock === null ? 'exit 1' : `printf '%s\\n' ${JSON.stringify(e.publicAccessBlock)}`
      } ;;`,
      '  get-account-password-policy)',
      pwPolicy,
      '    ;;',
      `  list-analyzers) ${
        e.analyzers === null ? 'exit 1' : `printf '%s\\n' ${JSON.stringify(e.analyzers)}`
      } ;;`,
      `  get-alternate-contact) ${
        e.alternateContact === null ? 'exit 1' : `printf '%s\\n' ${JSON.stringify(e.alternateContact)}`
      } ;;`,
      '  get-account-summary)',
      `    printf '%s' ${JSON.stringify(
        JSON.stringify({
          SummaryMap: { AccountMFAEnabled: Number(e.rootMfa), AccountAccessKeysPresent: Number(e.rootKeys) },
        }),
      )}`,
      '    ;;',
      `  list-users) ${e.users === null ? 'exit 1' : `printf '%s\\n' ${JSON.stringify(e.users)}`} ;;`,
      // Two different calls land on this arm. The per-user inventory asks for
      // every key with its dates; the super-admin check asks only for the Active
      // ones, and is told apart by `Active` appearing in its query.
      '  list-access-keys)',
      '    if [[ "$*" == *Active* ]]; then',
      `      ${e.superAdminKeyActive === false ? "printf ''" : "printf 'AKIAEXAMPLE\\n'"}`,
      '    else',
      "      printf 'AKIAEXAMPLE\\tActive\\t2026-03-13T00:00:00Z\\n'",
      '    fi',
      '    ;;',
      '  get-access-key-last-used) printf \'2026-09-16T00:00:00Z\\n\' ;;',
      '  get-role)',
      `    if [[ "$*" == *footbag-staging-app-runtime* ]]; then ${
        e.trustsStaging === null
          ? 'exit 1'
          : `printf '%s' ${JSON.stringify(
              trustDocument(e.trustsStaging !== false, [
                e.trustedSsoRole,
                e.stagingTrustedDevTesterRole,
              ]),
            )}`
      }; fi`,
      `    if [[ "$*" == *footbag-production-app-runtime* ]]; then ${
        e.trustsProduction === null
          ? 'exit 1'
          : `printf '%s' ${JSON.stringify(
              trustDocument(e.trustsProduction !== false, [
                e.trustedSsoRole,
                e.productionTrustedDevTesterRole,
              ]),
            )}`
      }; fi`,
      '    ;;',
      // The generated role behind the operator permission set, whose name suffix
      // nobody chooses. Absent before the federated path is stood up.
      // A real `--output text` list is tab-separated on one line, and the tab has
      // to be a real one: printf interprets escapes in its format string, never
      // in a %s argument, so joining in JavaScript would emit a literal
      // backslash-t and two roles would arrive as one word.
      // Each permission set is asked about by name, one call each, so the answer
      // depends on which name the query carries. A stub answering the same list
      // either way would let a check that matched any reserved-SSO role pass
      // while reporting one role's ARN under the other's name.
      '  list-roles)',
      '    if [[ "$*" == *AWSReservedSSO_FootbagDevTester_* ]]; then',
      `      ${listRolesAnswer(e.devTesterRole)}`,
      '    else',
      `      ${e.ssoRoleReadFails ? 'exit 254' : listRolesAnswer(e.ssoRole)}`,
      '    fi',
      '    ;;',
      // The instance the console enable produced, reported so nobody has to ask
      // the CLI by hand whether it took.
      `  list-instances) ${
        e.ssoInstance === null ? "printf ''" : `printf '%s\\n' ${JSON.stringify(e.ssoInstance)}`
      } ;;`,
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(estate: Estate = {}, args: string[] = []) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      // The run settles and proves its identity before reading the account.
      ...awsIdentityStubEnv(workDir),
      ACCOUNT_BASELINE_AWS_BIN: awsStub(estate),
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('verify-account-baseline.sh — a healthy account', () => {
  it('passes with no findings', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/No findings/);
  });

  it('reports every key with its age and last use, which is the review evidence', () => {
    const r = run();
    expect(r.stdout).toMatch(/AKIAEXAMPLE/);
    expect(r.stdout).toMatch(/age \d+d/);
    expect(r.stdout).toMatch(/last 2026-09-16/);
  });

  it('reports rather than judges whether a key should be rotated', () => {
    // The rotation rule is evidence-driven and the trigger is a human's call. A
    // script that failed on key age would be reintroducing the calendar rule
    // the project deliberately does not use.
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/rotation triggers/);
  });
});

describe('verify-account-baseline.sh — each control is genuinely checked', () => {
  it('fails when the account public-access block is absent', () => {
    const r = run({ publicAccessBlock: null });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/public access block is not configured/);
  });

  it('fails when the public-access block is only partly on', () => {
    // Three of four is not a backstop. A bucket created later inherits
    // whatever this says, which is the case the control exists for.
    const r = run({ publicAccessBlock: 'True\tTrue\tFalse\tTrue' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/settings switched off/);
  });

  it('fails when there is no password policy at all', () => {
    const r = run({ passwordPolicy: null });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no IAM account password policy/);
  });

  it('fails a password policy that is set but too weak', () => {
    const r = run({ passwordPolicy: { min: 8, reuse: 0 } });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/minimum length is 8/);
    expect(r.stderr).toMatch(/does not prevent password reuse/);
  });

  it('fails when no Access Analyzer is active', () => {
    const r = run({ analyzers: '' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no active IAM Access Analyzer/);
  });

  it('filters on analyzer type, not just on status', () => {
    // The console offers two kinds and only one answers this question. An
    // unused-access analyzer reports unused roles and permissions, which is
    // useful and is not external access; passing on it would report the
    // control as in place while the mistake it exists to catch went unwatched.
    const script = readFileSync(join(process.cwd(), 'scripts/verify-account-baseline.sh'), 'utf-8');
    expect(script).toMatch(/type==`ACCOUNT`/);
    expect(script).toMatch(/type==`ORGANIZATION`/);
    expect(script).not.toMatch(/analyzers\[\?status==`ACTIVE`\]\.name/);
  });

  it('fails each unset alternate contact separately', () => {
    // Unset means a notice of that kind reaches only the root mailbox, and
    // nobody is told if it goes unread.
    const r = run({ alternateContact: 'None' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/alternate contact BILLING is unset/);
    expect(r.stderr).toMatch(/alternate contact OPERATIONS is unset/);
    expect(r.stderr).toMatch(/alternate contact SECURITY is unset/);
  });

  it('fails when root has no MFA', () => {
    const r = run({ rootMfa: '0' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/root has NO MFA/);
  });

  it('fails when root holds an access key', () => {
    // A root access key bypasses every guard rail in the account.
    const r = run({ rootKeys: '1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/root holds 1 access key/);
  });
});

describe('verify-account-baseline.sh — how it behaves', () => {
  it('refuses when no identity resolves, rather than reporting everything absent', () => {
    // Otherwise a dead credential produces a full sheet of failures and sends
    // the operator to fix controls that are perfectly fine.
    const stub = join(workDir, 'dead.sh');
    writeFileSync(stub, '#!/usr/bin/env bash\nexit 1\n', 'utf-8');
    chmodSync(stub, 0o755);
    const res = spawnSync('bash', [SCRIPT], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        ...awsIdentityStubEnv(workDir),
        ACCOUNT_BASELINE_AWS_BIN: stub,
      },
      ...SPAWN_GUARD,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/could not resolve an identity/);
  });

  it('names where three of the four controls actually belong', () => {
    const r = run({ rootMfa: '0' });
    expect(r.stderr).toMatch(/shared Terraform tree/);
    expect(r.stderr).toMatch(/alternate contacts are the genuine exception/);
  });

  it('prints only failures under --quiet', () => {
    const r = run({ rootMfa: '0' }, ['--quiet']);
    expect(r.stdout).not.toMatch(/PASS/);
    expect(r.stderr).toMatch(/FAIL/);
  });

  it('announces the stub, because stubbed evidence is worth nothing', () => {
    expect(run().stderr).toMatch(/SYNTHETIC:.*proves nothing about the account/);
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run({}, ['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });
});

/**
 * The super-admin identity, and the two trust policies the current operator path
 * runs through.
 *
 * These read the opposite way round from every check above: what is asserted is
 * that something is still THERE. The IAM user is retained permanently as the
 * super-admin identity, kept unfederated so that a failure of the identity
 * provider cannot take the normal route and the way back in down with it, and
 * federation is added beside it rather than in place of it. So its absence is
 * the finding.
 *
 * The trust policies are the pair that strands everyone. Both name that user by
 * literal ARN and the chained runtime profiles resolve through them, and a
 * recreated user is a different principal, so removing an entry is not undone by
 * putting the user back. Nothing else in this tree reads them, which is why they
 * are checked here rather than left to surface as a deploy failing weeks later.
 */
describe('verify-account-baseline.sh — the super-admin identity', () => {
  it('passes when the key is active and both policies still name it', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/footbag-operator holds an active access key/);
    expect(r.stdout).toMatch(/footbag-staging-app-runtime still trusts/);
    expect(r.stdout).toMatch(/footbag-production-app-runtime still trusts/);
  });

  it('fails when the super-admin user holds no active key', () => {
    // A deactivated key is not a way back in, and it reads as present to
    // anything that only counts rows.
    const r = run({ superAdminKeyActive: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/holds no active access key/);
  });

  it('fails when the staging runtime role no longer names it', () => {
    const r = run({ trustsStaging: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/footbag-staging-app-runtime no longer names/);
  });

  it('fails when the production runtime role no longer names it', () => {
    // Checked separately from staging: the operator path runs through both, and
    // one of them passing says nothing about the other.
    const r = run({ trustsProduction: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/footbag-production-app-runtime no longer names/);
  });

  it('fails when a trust policy cannot be read at all, rather than assuming it', () => {
    const r = run({ trustsProduction: null });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read the trust policy/);
  });

  it('says a recreated user does not restore a removed trust entry', () => {
    // The fact that decides whether this is a five-minute fix or an outage, and
    // the one a reader is most likely to get wrong under pressure.
    const r = run({ trustsStaging: false });
    expect(r.stdout + r.stderr).toMatch(/recreated\s*\n?\s*user is a different principal/);
  });
});

/**
 * The federated operator role, and the generated suffix that silently
 * invalidates the two trust policies naming it.
 *
 * Identity Center generates the IAM role behind the super-admin
 * permission set with a suffix nobody chooses, and both runtime trust policies
 * name that role by literal ARN. Delete and recreate the permission set and the
 * suffix changes: the old ARN keeps reading as a valid trust, terraform reports
 * no diff because the configuration still holds the old string, and the failure
 * surfaces weeks later as an AssumeRole that refuses. Comparing the live ARN
 * against what each policy carries is the only thing that catches it early.
 */
describe('verify-account-baseline.sh — the federated operator role', () => {
  it('reports the Identity Center instance, so nobody asks the CLI by hand', () => {
    // The console enable happens once and nothing else in the tree reads its
    // result. Without this the only answer to "did the enable take" is a
    // hand-typed AWS call, which is the shape every operator script replaces.
    const r = run({ ssoInstance: 'arn:aws:sso:::instance/ssoins-abc\td-123456' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Identity Center instance: .*ssoins-abc/);
    expect(r.stdout).toMatch(/d-123456/);
  });

  it('says the federated path is not stood up when no instance exists', () => {
    const r = run({ ssoInstance: null });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/no IAM Identity Center instance/);
    expect(r.stdout).toMatch(/still attributed to footbag-operator/);
  });

  it('says nothing is owed while the federated path does not exist yet', () => {
    // Operators still authenticate as the super-admin identity, which keeps the
    // super-admin work the roles do not carry. An absent role here is
    // the state of the estate, not a finding, and failing on it would leave a
    // permanently red check for something nobody has done yet.
    const r = run({ ssoRole: null });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/no FootbagSuperAdmin role yet/);
  });

  it('raises a finding when the role read itself does not answer', () => {
    // An access denial, a throttle and an expired credential all return nothing,
    // exactly as an absent role does. Reporting them as the absent role silences
    // the comparison below and lets the whole gate exit green having checked
    // nothing, which is the one outcome a standing gate must not produce.
    const r = run({ ssoRoleReadFails: true });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/could not read the generated FootbagSuperAdmin role/);
    expect(r.stdout + r.stderr).toMatch(/not the same as the role being absent/);
  });

  it('refuses to compare when a recreated permission set leaves two matching roles', () => {
    // The two ARNs arrive tab-joined on one line. Used whole, that string is a
    // needle no trust document can contain, so both runtime roles fail the
    // comparison even when their trust is correct, and the report blames the
    // trust policies for a permission set that was recreated.
    const stale = SSO_ROLE.replace('_1111111111111111', '_9999999999999999');
    const r = run({ ssoRole: [stale, SSO_ROLE], trustedSsoRole: SSO_ROLE });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/2 roles match AWSReservedSSO_FootbagSuperAdmin_\*/);
    expect(r.stdout + r.stderr).not.toMatch(/does not name the live FootbagSuperAdmin role/);
  });

  it('passes when both trust policies name the live role', () => {
    const r = run({ ssoRole: SSO_ROLE, trustedSsoRole: SSO_ROLE });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/footbag-staging-app-runtime trusts the live FootbagSuperAdmin role/);
    expect(r.stdout).toMatch(/footbag-production-app-runtime trusts the live FootbagSuperAdmin role/);
  });

  it('fails when a trust policy carries a stale generated ARN', () => {
    // The recreated-permission-set case, and the whole reason this check exists:
    // a well-formed ARN for a principal that no longer exists.
    const stale = SSO_ROLE.replace('_1111111111111111', '_2222222222222222');
    const r = run({ ssoRole: SSO_ROLE, trustedSsoRole: stale });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/footbag-staging-app-runtime does not name the live FootbagSuperAdmin role/);
    expect(r.stderr).toMatch(/footbag-production-app-runtime does not name the live FootbagSuperAdmin role/);
  });

  it('names the suffix as the cause, so the fix is not guessed at', () => {
    const r = run({ ssoRole: SSO_ROLE, trustedSsoRole: null });
    expect(r.stdout + r.stderr).toMatch(/generated suffix changes whenever the permission set is recreated/);
    expect(r.stdout + r.stderr).toMatch(/super_admin_sso_role_arn/);
  });

  it('fails rather than passes when the comparison cannot be made', () => {
    // An unreadable trust policy is not evidence that the role is named in it.
    const r = run({ ssoRole: SSO_ROLE, trustsProduction: null });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read the trust policy to compare the operator role/);
  });

  it('keeps the super-admin identity trust entry a separate assertion', () => {
    // The two checks answer different questions and one passing says nothing
    // about the other: the federated role being present does not make the
    // way back in present, and that route is what the design turns on.
    const r = run({ ssoRole: SSO_ROLE, trustedSsoRole: SSO_ROLE, trustsStaging: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/footbag-staging-app-runtime no longer names footbag-operator/);
  });
});

/**
 * The dev-and-tester role, which is checked against the same two trust policies
 * for opposite answers.
 *
 * Staging must name it, because the reads a deploy makes are that job. Production
 * must not, and nothing else in the estate would ever say so: production's tree
 * declares no variable that could put it there, so a plan of that tree shows
 * nothing, and an ARN sitting in that trust document grants the one thing the
 * split into two roles exists to prevent.
 */
describe('verify-account-baseline.sh — the dev-and-tester role', () => {
  it('tells the two generated roles apart by the name in each', () => {
    // The suffixes are unpredictable and both roles sit under the same reserved
    // path, so the embedded permission-set name is the only thing distinguishing
    // them. Matching loosely would report one under the other's name.
    const r = run({
      ssoRole: SSO_ROLE,
      trustedSsoRole: SSO_ROLE,
      devTesterRole: DEV_TESTER_ROLE,
      stagingTrustedDevTesterRole: DEV_TESTER_ROLE,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/FootbagSuperAdmin role: .*AWSReservedSSO_FootbagSuperAdmin_/);
    expect(r.stdout).toMatch(/FootbagDevTester role: .*AWSReservedSSO_FootbagDevTester_/);
  });

  it('passes when staging names it and production does not', () => {
    const r = run({
      ssoRole: SSO_ROLE,
      trustedSsoRole: SSO_ROLE,
      devTesterRole: DEV_TESTER_ROLE,
      stagingTrustedDevTesterRole: DEV_TESTER_ROLE,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/footbag-staging-app-runtime trusts the live FootbagDevTester role/);
    expect(r.stdout).toMatch(/footbag-production-app-runtime does not name the FootbagDevTester role/);
  });

  it('fails when production trusts it, which no apply of that tree can produce', () => {
    // This is the finding the whole section exists for. The grant reaches the
    // production runtime role, the tree that owns production carries no variable
    // that could have written it, and nothing else in the estate looks at it.
    const r = run({
      ssoRole: SSO_ROLE,
      trustedSsoRole: SSO_ROLE,
      devTesterRole: DEV_TESTER_ROLE,
      stagingTrustedDevTesterRole: DEV_TESTER_ROLE,
      productionTrustedDevTesterRole: DEV_TESTER_ROLE,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/footbag-production-app-runtime names the FootbagDevTester role/);
    expect(r.stdout + r.stderr).toMatch(/added by hand/);
  });

  it('fails when staging does not name it, and says which value sets it', () => {
    // A dev-and-tester can then sign in and reach nothing a deploy needs, which
    // reads as a broken account rather than as a missing principal.
    const r = run({
      ssoRole: SSO_ROLE,
      trustedSsoRole: SSO_ROLE,
      devTesterRole: DEV_TESTER_ROLE,
      stagingTrustedDevTesterRole: null,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(
      /footbag-staging-app-runtime does not name the live FootbagDevTester role/,
    );
    expect(r.stdout + r.stderr).toMatch(/dev_tester_sso_role_arn/);
  });

  it('says nothing is owed when nobody holds the dev-and-tester role', () => {
    // An unassigned permission set generates no role, so an absent one here is a
    // roster with nobody on that tier rather than a fault. Failing on it would
    // leave a standing gate red for a state the design allows.
    const r = run({ ssoRole: SSO_ROLE, trustedSsoRole: SSO_ROLE, devTesterRole: null });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/no FootbagDevTester role yet/);
    expect(r.stdout + r.stderr).not.toMatch(/does not name the live FootbagDevTester role/);
  });
});
