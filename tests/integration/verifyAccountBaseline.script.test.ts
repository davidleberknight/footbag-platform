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
  /** Whether the IAM user footbag-operator still holds an active key. */
  superAdminKeyActive?: boolean;
  /** Whether each runtime role's trust policy still names it; null is unreadable. */
  trustsStaging?: boolean | null;
  trustsProduction?: boolean | null;
  /** The dormant Identity Center instance and its store; null is none at all. */
  ssoInstance?: string | null;
  /** How many permission sets the dormant instance carries. */
  ssoPermissionSets?: string;
  /** How many users its directory holds. */
  ssoUsers?: string;
  /**
   * The dormancy read itself does not answer: an access denial, a throttle, an
   * expired credential. Distinct from a count of zero, which is the estate's
   * intended state rather than a fault.
   */
  ssoPermissionSetsReadFails?: boolean;
  /** Whether the shared job role exists at all. */
  devTesterRole?: boolean;
  /** Whether each runtime trust policy names the job role. */
  stagingTrustsDevTester?: boolean;
  productionTrustsDevTester?: boolean;
}

const OPERATOR = 'footbag-operator';
/**
 * The job role's ARN, which unlike the thing that stood here before it is
 * predictable from the account id and the name this project chose. There is no
 * generated suffix to go stale, which is why the checks around it are about
 * the two trust documents rather than about reading the role's name back.
 */
const DEV_TESTER_ROLE_ARN = 'arn:aws:iam::111122223333:role/FootbagDevTester';

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
  // The dormant instance is PRESENT on the healthy sheet, because it is present
  // in the account and being present is not the fault. Empty is the healthy
  // state, and the counts below are what say so.
  ssoInstance: 'arn:aws:sso:::instance/ssoins-abc\td-123456',
  ssoPermissionSets: '0',
  ssoUsers: '0',
  ssoPermissionSetsReadFails: false,
  // The identity tree has not been applied, so there is no job role yet and
  // nothing to compare against either trust document. That is the estate as it
  // stands rather than a finding.
  devTesterRole: false,
  stagingTrustsDevTester: false,
  productionTrustsDevTester: false,
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
      // Two services answer to this subcommand, and they are different
      // questions: `iam list-users` is the account's IAM user inventory, and
      // `identitystore list-users` is the dormancy check on the directory. A
      // stub keyed on the subcommand alone would answer one with the other.
      '  list-users)',
      '    if [[ "$1" == "identitystore" ]]; then',
      `      printf '%s\\n' ${JSON.stringify(e.ssoUsers)}`,
      '    else',
      `      ${e.users === null ? 'exit 1' : `printf '%s\\n' ${JSON.stringify(e.users)}`}`,
      '    fi',
      '    ;;',
      // Two different calls land on this arm. The per-user inventory asks for
      // every key with its dates; the footbag-operator check asks only for the Active
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
      // The job role itself, asked for by name. A non-zero exit is how the
      // script learns it does not exist, which is the pre-apply state.
      `    if [[ "$*" == *FootbagDevTester* ]]; then ${
        e.devTesterRole ? "printf '{}\\n'" : 'exit 254'
      }; fi`,
      `    if [[ "$*" == *footbag-staging-app-runtime* ]]; then ${
        e.trustsStaging === null
          ? 'exit 1'
          : `printf '%s' ${JSON.stringify(
              trustDocument(e.trustsStaging !== false, [
                e.stagingTrustsDevTester ? DEV_TESTER_ROLE_ARN : null,
              ]),
            )}`
      }; fi`,
      `    if [[ "$*" == *footbag-production-app-runtime* ]]; then ${
        e.trustsProduction === null
          ? 'exit 1'
          : `printf '%s' ${JSON.stringify(
              trustDocument(e.trustsProduction !== false, [
                e.productionTrustsDevTester ? DEV_TESTER_ROLE_ARN : null,
              ]),
            )}`
      }; fi`,
      '    ;;',
      // The dormant instance and the two counts that say it is still dormant.
      // A real `--output text` pair is tab-separated on one line, and the tab
      // has to be a real one: printf interprets escapes in its format string,
      // never in a %s argument, so joining in JavaScript would emit a literal
      // backslash-t and the instance ARN and store id would arrive as one word,
      // which is the difference between the store being read and being skipped.
      `  list-instances) ${
        e.ssoInstance === null
          ? "printf ''"
          : `printf '%s\\t%s\\n' ${e.ssoInstance
              .split('\t')
              .map((v) => JSON.stringify(v))
              .join(' ')}`
      } ;;`,
      `  list-permission-sets) ${
        e.ssoPermissionSetsReadFails ? 'exit 254' : `printf '%s\\n' ${JSON.stringify(e.ssoPermissionSets)}`
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

  it('reports each unset alternate contact separately, and as gated', () => {
    // Unset means a notice of that kind reaches only the root mailbox, and
    // nobody is told if it goes unread. It is still not a fault: the three sit
    // behind a flag that stays off until their identities are decided, so the
    // declared state and the actual state agree.
    const r = run({ alternateContact: 'None' });
    expect(r.stderr).toMatch(/GATED.*alternate contact BILLING is unset/);
    expect(r.stderr).toMatch(/GATED.*alternate contact OPERATIONS is unset/);
    expect(r.stderr).toMatch(/GATED.*alternate contact SECURITY is unset/);
  });

  it('does not let a gated control decide the run', () => {
    // The defect this replaces: counting them made the exit status non-zero
    // before an apply and non-zero after a completely successful one, so it
    // could not tell an operator which had happened and the walk asked them to
    // count failure lines by eye instead.
    const r = run({ alternateContact: 'None' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('No findings.');
  });

  it('says how many are deliberately off, so silence does not read as passing', () => {
    const r = run({ alternateContact: 'None' });
    expect(r.stderr).toMatch(/3 control\(s\) deliberately off/);
    expect(r.stderr).toMatch(/enable_account_alternate_contacts/);
    expect(r.stderr).toMatch(/do not decide this run/);
  });

  it('still fails a real control while a gated one is outstanding', () => {
    // The two counts are independent. A genuine fault must not be masked by
    // the gate, which is the mirror of the defect above.
    const r = run({ alternateContact: 'None', rootMfa: '0' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/GATED.*alternate contact BILLING/);
    expect(r.stderr).toMatch(/1 finding\(s\)/);
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

  it('names the file the four controls are declared in, and who may apply it', () => {
    // A findings report that says a control is missing without saying where it
    // is declared sends the reader to the console, which is the second writer
    // this file exists to keep out. All four are Terraform now; what separates
    // them is that the contacts carry values and so sit behind a gate.
    const r = run({ rootMfa: '0' });
    expect(r.stderr).toMatch(/terraform\/shared\/account-baseline\.tf/);
    // And the part an operator gets wrong at the keyboard: the job role cannot
    // read the shared tree's state, so this apply is footbag-operator's.
    expect(r.stderr).toMatch(/directly authenticated identity/);
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
 * The IAM user footbag-operator, and the two trust policies the current operator
 * path runs through.
 *
 * These read the opposite way round from every check above: what is asserted is
 * that something is still THERE. The IAM user is retained permanently as the
 * directly authenticated identity, reached without assuming anything so that whatever
 * breaks the shared job role cannot take the normal route and the way back in
 * down with it, and every named operator's path is added beside it rather than
 * in place of it. So its absence is the finding.
 *
 * The trust policies are the pair that strands everyone. Both name that user by
 * literal ARN and the chained runtime profiles resolve through them, and a
 * recreated user is a different principal, so removing an entry is not undone by
 * putting the user back. Nothing else in this tree reads them, which is why they
 * are checked here rather than left to surface as a deploy failing weeks later.
 */
describe('verify-account-baseline.sh — the directly authenticated IAM user footbag-operator', () => {
  it('passes when the key is active and both policies still name it', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/footbag-operator holds an active access key/);
    expect(r.stdout).toMatch(/footbag-staging-app-runtime still trusts/);
    expect(r.stdout).toMatch(/footbag-production-app-runtime still trusts/);
  });

  it('fails when the IAM user footbag-operator holds no active key', () => {
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
 * The shared job role every named human operator assumes, checked against the
 * same two runtime trust policies for opposite answers.
 *
 * Staging must name it, because the reads a deploy makes are that job.
 * Production must not, and nothing else in the estate would ever say so:
 * production's tree declares no variable that could put it there, so a plan of
 * that tree shows nothing, and an ARN sitting in that trust document grants
 * the one thing the boundary between the two environments exists to prevent.
 */
describe('verify-account-baseline.sh — the human operator job role', () => {
  it('reports the role once it exists, with the ARN it actually has', () => {
    const r = run({ devTesterRole: true, stagingTrustsDevTester: true });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/FootbagDevTester: arn:aws:iam::111122223333:role\/FootbagDevTester/);
  });

  it('says nothing is owed before the identity tree has been applied', () => {
    // An absent role is the state of the estate rather than a finding. Failing
    // on it would leave a standing gate permanently red for something nobody
    // has done yet, which is how a gate stops being read.
    const r = run({ devTesterRole: false });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/no FootbagDevTester role yet/);
    expect(r.stdout + r.stderr).not.toMatch(/does not name arn:aws:iam/);
  });

  it('passes when staging names it and production does not', () => {
    const r = run({ devTesterRole: true, stagingTrustsDevTester: true });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/footbag-staging-app-runtime trusts FootbagDevTester/);
    expect(r.stdout).toMatch(/footbag-production-app-runtime does not name FootbagDevTester/);
  });

  it('fails when production trusts it, which no apply of that tree can produce', () => {
    // The finding this whole section exists for. The grant reaches the
    // production runtime role, the tree that owns production carries no
    // variable that could have written it, and nothing else looks at it.
    const r = run({
      devTesterRole: true,
      stagingTrustsDevTester: true,
      productionTrustsDevTester: true,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/footbag-production-app-runtime names FootbagDevTester/);
    expect(r.stdout + r.stderr).toMatch(/added by hand/);
  });

  it('fails when staging does not name it, and says which value sets it', () => {
    // A named operator can then authenticate and reach nothing a deploy needs,
    // which reads as a broken account rather than as a missing principal.
    const r = run({ devTesterRole: true, stagingTrustsDevTester: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/footbag-staging-app-runtime does not name arn:aws:iam/);
    expect(r.stdout + r.stderr).toMatch(/dev_tester_role_arn/);
  });

  it('fails rather than passes when a trust policy cannot be read', () => {
    // An unreadable trust policy is not evidence that the role is named in it.
    const r = run({ devTesterRole: true, trustsProduction: null });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read the trust policy to check the job role is absent/);
  });

  it('keeps the directly authenticated identity a separate assertion', () => {
    // The two checks answer different questions and one passing says nothing
    // about the other: the job role being trusted does not make the way back in
    // present, and that route is what the design turns on.
    const r = run({ devTesterRole: true, stagingTrustsDevTester: true, trustsStaging: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/footbag-staging-app-runtime no longer names footbag-operator/);
  });
});

/**
 * The dormant Identity Center instance, and the standing assertion that it
 * stays dormant.
 *
 * An instance and an organization exist in this account. They were created by
 * hand while a federated operator model was being evaluated, Terraform was
 * never applied against them, and the model was abandoned. They are kept
 * rather than deleted: both are inert, both are free, both are prerequisites
 * if federation is revisited, and the organization is the prerequisite for the
 * separate emergency-access account AWS break-glass guidance recommends.
 *
 * Kept is not unwatched. An instance that grows a permission set or a
 * directory user is a second way into this account that no Terraform plan
 * shows a diff for and no operator has reason to check.
 */
describe('verify-account-baseline.sh — Identity Center dormancy', () => {
  it('reports the dormant instance as expected rather than as a finding', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/the dormant instance is present, which is expected/);
    expect(r.stdout).toMatch(/it carries no permission sets/);
    expect(r.stdout).toMatch(/its directory holds no users/);
  });

  it('passes when the account has no instance at all', () => {
    const r = run({ ssoInstance: null });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/no Identity Center instance in this account/);
  });

  it('fails when the dormant instance has grown a permission set', () => {
    // Nothing in this repository creates one, so it was made by hand, and it
    // is a way into the account that no other check here looks at.
    const r = run({ ssoPermissionSets: '2' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/the dormant instance carries 2 permission set\(s\)/);
    expect(r.stdout + r.stderr).toMatch(/no Terraform plan shows/);
  });

  it('fails when the dormant directory has grown a user', () => {
    const r = run({ ssoUsers: '1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/the dormant directory holds 1 user\(s\)/);
  });

  it('fails when the dormancy read itself does not answer', () => {
    // An access denial, a throttle and an expired credential all come back the
    // same way an empty instance does. Reporting the first as the second lets
    // this gate exit green having checked nothing, which is the one outcome a
    // standing check must never produce.
    const r = run({ ssoPermissionSetsReadFails: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read the permission sets of the dormant instance/);
    expect(r.stdout + r.stderr).toMatch(/not the same as there being none/);
  });
});
