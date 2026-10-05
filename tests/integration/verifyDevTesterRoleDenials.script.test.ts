/**
 * scripts/verify-dev-tester-role-denials.sh — proving the job role is refused the
 * things it is meant to be refused.
 *
 * The role's policy denies the whole lifecycle of a dev-and-tester, every write
 * to its own definition and to the directly authenticated identity, and every
 * mutation of a production edge surface. Those denials are what make the
 * lifecycle script's refusal more than a convention. Until this script existed
 * an operator proved them by composing a simulator call at the keyboard, from
 * the statement set in the Terraform, in the middle of a walkthrough.
 *
 * Everything the script does is a simulation or a read, so the whole of it is
 * drivable. What is pinned here:
 *
 *   - the action lists come out of the Terraform rather than a copy, so a
 *     denial that gains an action is covered and one that quietly loses one is
 *     caught;
 *   - an `allowed` is a finding, and an `implicitDeny` is reported as the
 *     weaker fact it is rather than counted as the denial holding;
 *   - the positive controls fail loudly. A tag-conditioned denial has a failure
 *     mode in each direction, and the one that denies staging too shows up as
 *     a dev-and-tester who cannot work rather than as a security event, so a run
 *     that only checked the production direction would pass against a policy
 *     that had locked everybody out.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/verify-dev-tester-role-denials.sh');

/**
 * Every condition key the role's policy tests, read from the same Terraform the
 * script reads. A key is written `"service:Name" =` and an action never is, so
 * this cannot pick up an action.
 */
const CONDITION_KEYS = [
  ...new Set(
    [...readFileSync(join(process.cwd(), 'terraform/identity/dev-tester-role.tf'), 'utf-8').matchAll(/"([a-z0-9-]+:[A-Za-z0-9]+)"\s*=/g)].map(
      (m) => m[1],
    ),
  ),
];

interface Estate {
  /** Whether the identity tree has been applied at all. */
  roleExists?: boolean;
  /** A lifecycle action the policy fails to deny. */
  lifecycleAllowed?: string | null;
  /** A lifecycle action refused only because nothing grants it. */
  lifecycleImplicit?: string | null;
  /** The regression where the tag denial swallows staging too. */
  stagingEdgeDenied?: boolean;
  /** The regression where the Null guard is dropped and creation dies. */
  createDistributionDenied?: boolean;
  /** Whether the role can read another tree's terraform state. */
  sharedStateReadable?: boolean;
  /** Whether it can still read its own, which it must. */
  stagingStateReadable?: boolean;
  /** Whether it can still read the role definition, which it must. */
  roleReadable?: boolean;
  /** The simulator answering nothing at all. */
  simulatorSilent?: boolean;
  /** The simulator answering None, as the CLI prints an empty text answer. */
  simulatorNone?: boolean;
  /** The regression where the host-access certificate is granted on staging. */
  stagingHostAccessAllowed?: boolean;
  /** The regression where the firewall and delete calls reach production. */
  productionHostReachable?: boolean;
  /** The regression where their denial also takes staging's own apply. */
  stagingHostDenied?: boolean;
  /** The regression where detaching or releasing a static IP is granted again. */
  staticIpReleasable?: boolean;
  /** The regression where attaching a static IP is granted again. */
  staticIpAttachable?: boolean;
  /** The regression where leaving the organisation is no longer denied. */
  selfElevationAllowed?: boolean;
  /** The regression where the assumable runtime role can be rewritten. */
  runtimeRoleWritable?: boolean;
  /** The regression where an alias can be put on a production-tagged key. */
  productionAliasGraftable?: boolean;
  /** The regression where an alias can be put on a key carrying no tag. */
  untaggedAliasGraftable?: boolean;
  /** The regression where a production edge function can be rewritten. */
  productionFunctionWritable?: boolean;
  /** The regression where a role can be passed to budgets. */
  budgetsPassable?: boolean;
  /** The regression where IAM write over a staging-named user comes back. */
  stagingIamWritable?: boolean;
  /** The regression where a role other than the staging runtime is assumable. */
  otherRoleAssumable?: boolean;
  /** The regression where the chain into the staging runtime role is lost. */
  runtimeChainDenied?: boolean;
  /** The regression where an operator address can be written. */
  addressWritable?: boolean;
  /** The regression where the staging plan can no longer read the addresses. */
  addressesUnreadable?: boolean;
  /** A read a staging refresh makes that the role is denied. */
  refreshReadDenied?: string | null;
  /** Whether the job's three managed policies are attached to the role. */
  jobPoliciesAttached?: boolean;
  /** An inline policy on the role that is not a session revocation. */
  strayInline?: string | null;
  /** The regression where the role can rewrite its own managed policies. */
  ownPolicyWritable?: boolean;
  /** The regression where the alias guard also takes staging's own aliases. */
  stagingAliasDenied?: boolean;
  /** Whether the staging runtime role's trust names the job role. */
  runtimeTrustNamesJobRole?: boolean;
  /** The staging runtime role's trust cannot be read at all. */
  runtimeTrustUnreadable?: boolean;
  /** Listing the role's inline policies fails, as a throttled call does. */
  inlineUnlistable?: boolean;
}

const HEALTHY: Required<Estate> = {
  roleExists: true,
  lifecycleAllowed: null,
  lifecycleImplicit: null,
  stagingEdgeDenied: false,
  createDistributionDenied: false,
  sharedStateReadable: false,
  stagingStateReadable: true,
  roleReadable: true,
  simulatorSilent: false,
  simulatorNone: false,
  stagingHostAccessAllowed: false,
  productionHostReachable: false,
  stagingHostDenied: false,
  staticIpReleasable: false,
  staticIpAttachable: false,
  selfElevationAllowed: false,
  runtimeRoleWritable: false,
  productionAliasGraftable: false,
  untaggedAliasGraftable: false,
  productionFunctionWritable: false,
  budgetsPassable: false,
  stagingIamWritable: false,
  otherRoleAssumable: false,
  runtimeChainDenied: false,
  addressWritable: false,
  addressesUnreadable: false,
  refreshReadDenied: null,
  jobPoliciesAttached: true,
  strayInline: null,
  ownPolicyWritable: false,
  stagingAliasDenied: false,
  runtimeTrustNamesJobRole: true,
  runtimeTrustUnreadable: false,
  inlineUnlistable: false,
};

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-denials-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * A fake `aws` that answers the simulator.
 *
 * It parses the real flags rather than matching on the whole argv, because the
 * script asks two differently shaped questions -- a batch of actions against
 * one resource, and a single action expected to be allowed -- and a stub that
 * could not tell them apart would answer one with the other's shape and the
 * script would read an empty result as a finding.
 */
function awsStub(estate: Estate): string {
  const e = { ...HEALTHY, ...estate };
  const path = join(workDir, 'aws-stub.sh');
  const q = (v: string | null) => JSON.stringify(v ?? '');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'sub="$2"; shift 2',
      'case "$sub" in',
      '  get-caller-identity) echo 111122223333; exit 0 ;;',
      // The job role's existence check, and the staging runtime role's trust,
      // told apart by the role asked for.
      '  get-role)',
      '    if [[ " $* " == *" footbag-staging-app-runtime "* ]]; then',
      `      ${e.runtimeTrustUnreadable ? 'exit 254' : `printf '%s\\n' ${JSON.stringify(JSON.stringify(e.runtimeTrustNamesJobRole ? { Statement: [{ Effect: 'Allow', Action: 'sts:AssumeRole', Principal: { AWS: ['arn:aws:iam::111122223333:user/footbag-operator', 'arn:aws:iam::111122223333:role/FootbagDevTester'] } }] } : { Statement: [{ Effect: 'Allow', Action: 'sts:AssumeRole', Principal: { AWS: ['arn:aws:iam::111122223333:user/footbag-operator'] } }] }))}; exit 0`}`,
      '    fi',
      `    ${e.roleExists ? "printf '{}\\n'; exit 0" : 'exit 254'} ;;`,
      '  simulate-principal-policy) ;;',
      e.jobPoliciesAttached
        ? `  list-attached-role-policies) printf 'FootbagDevTester-StagingServices\\tFootbagDevTester-EdgeAndIdentity\\tFootbagDevTester-Guardrails\\n'; exit 0 ;;`
        : `  list-attached-role-policies) printf 'FootbagDevTester-StagingServices\\n'; exit 0 ;;`,
      e.inlineUnlistable
        ? '  list-role-policies) echo "An error occurred (Throttling) when calling the ListRolePolicies operation: Rate exceeded" >&2; exit 254 ;;'
        : `  list-role-policies) printf 'revoke-sessions-someone_gone%s\\n'; exit 0 ;;`.replace(
            '%s',
            e.strayInline ? `\\t${e.strayInline}` : '',
          ),
      '  *) exit 0 ;;',
      'esac',
      '',
      e.simulatorSilent ? 'exit 0' : '',
      // The CLI's text form prints None for an empty answer.
      e.simulatorNone ? 'echo None; exit 0' : '',
      '',
      'actions=(); resource=""; ctx=""; single=0',
      'while (( $# )); do',
      '  case "$1" in',
      '    --action-names)',
      '      shift',
      '      while (( $# )) && [[ "$1" != --* ]]; do actions+=("$1"); shift; done',
      '      ;;',
      '    --resource-arns) shift; resource="${1:-}"; shift || true ;;',
      '    --context-entries) shift; ctx="${1:-}"; shift || true ;;',
      '    --query) shift; [[ "${1:-}" == *"[0]"* ]] && single=1; shift || true ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      '',
      // As AWS does: a condition key asked about as though it were an action
      // fails the whole call, with no results, rather than being answered.
      `for a in "\${actions[@]}"; do case " ${CONDITION_KEYS.join(' ')} " in *" $a "*)`,
      '  echo "An error occurred (InvalidInput) when calling the SimulatePrincipalPolicy operation: Invalid action name" >&2',
      '  exit 254 ;; esac; done',
      '',
      'decide() {',
      '  local a="$1"',
      `  if [[ -n ${q(e.refreshReadDenied)} && "$a" == ${q(e.refreshReadDenied)} ]]; then echo implicitDeny; return; fi`,
      '  case "$a" in',
      '    cloudwatch:GetDashboard|ssm:DescribeParameters|logs:DescribeLogGroups|ses:DescribeConfigurationSet|cloudwatch:DescribeAlarms|sqs:GetQueueAttributes|sns:GetTopicAttributes|s3:GetBucketPolicy|lightsail:GetInstance)',
      '      echo allowed; return ;;',
      '    iam:CreatePolicyVersion|iam:SetDefaultPolicyVersion|iam:DeletePolicyVersion|iam:DeletePolicy)',
      '      if [[ "$resource" == *:policy/FootbagDevTester-* ]]; then',
      `        ${e.ownPolicyWritable ? 'echo allowed' : 'echo implicitDeny'}`,
      '      else',
      '        echo implicitDeny',
      '      fi',
      '      return ;;',
      '    s3:GetObject)',
      '      if [[ "$resource" == */staging/* ]]; then',
      `        ${e.stagingStateReadable ? 'echo allowed' : 'echo implicitDeny'}`,
      '      else',
      `        ${e.sharedStateReadable ? 'echo allowed' : 'echo implicitDeny'}`,
      '      fi',
      '      return ;;',
      `    iam:GetRole) ${e.roleReadable ? 'echo allowed' : 'echo explicitDeny'}; return ;;`,
      '    lightsail:GetInstanceAccessDetails)',
      '      if [[ "$ctx" == *staging* ]]; then',
      `        ${e.stagingHostAccessAllowed ? 'echo allowed' : 'echo explicitDeny'}`,
      '      else',
      '        echo explicitDeny',
      '      fi',
      '      return ;;',
      '    lightsail:PutInstancePublicPorts|lightsail:OpenInstancePublicPorts|lightsail:CloseInstancePublicPorts|lightsail:DeleteInstance)',
      '      if [[ "$ctx" == *staging* ]]; then',
      `        ${e.stagingHostDenied ? 'echo explicitDeny' : 'echo allowed'}`,
      '      else',
      `        ${e.productionHostReachable ? 'echo allowed' : 'echo explicitDeny'}`,
      '      fi',
      '      return ;;',
      `    lightsail:DetachStaticIp|lightsail:ReleaseStaticIp) ${e.staticIpReleasable ? 'echo allowed' : 'echo implicitDeny'}; return ;;`,
      `    lightsail:AttachStaticIp) ${e.staticIpAttachable ? 'echo allowed' : 'echo implicitDeny'}; return ;;`,
      `    organizations:LeaveOrganization) ${e.selfElevationAllowed ? 'echo allowed' : 'echo explicitDeny'}; return ;;`,
      '    iam:PutRolePolicy)',
      '      if [[ "$resource" == */footbag-staging-app-runtime ]]; then',
      `        ${e.runtimeRoleWritable ? 'echo allowed' : 'echo explicitDeny'}`,
      '      else',
      '        echo explicitDeny',
      '      fi',
      '      return ;;',
      '    kms:CreateAlias|kms:DeleteAlias|kms:UpdateAlias)',
      // The alias side carries no condition key, so it answers on the grant alone.
      '      if [[ "$resource" == *:alias/* ]]; then',
      `        ${e.stagingAliasDenied ? 'echo explicitDeny' : 'echo allowed'}`,
      '      elif [[ "$ctx" == *production* ]]; then',
      `        ${e.productionAliasGraftable ? 'echo allowed' : 'echo explicitDeny'}`,
      '      elif [[ -z "$ctx" ]]; then',
      `        ${e.untaggedAliasGraftable ? 'echo allowed' : 'echo explicitDeny'}`,
      '      else',
      `        ${e.stagingAliasDenied ? 'echo explicitDeny' : 'echo allowed'}`,
      '      fi',
      '      return ;;',
      `    iam:PassRole) ${e.budgetsPassable ? 'echo allowed' : 'echo explicitDeny'}; return ;;`,
      '    iam:CreateAccessKey)',
      '      if [[ "$resource" == */footbag-staging-probe ]]; then',
      `        ${e.stagingIamWritable ? 'echo allowed' : 'echo implicitDeny'}`,
      '        return',
      '      fi',
      '      ;;',
      '    sts:AssumeRole)',
      '      if [[ "$resource" == */footbag-staging-app-runtime ]]; then',
      `        ${e.runtimeChainDenied ? 'echo explicitDeny' : 'echo allowed'}`,
      '      else',
      `        ${e.otherRoleAssumable ? 'echo allowed' : 'echo explicitDeny'}`,
      '      fi',
      '      return ;;',
      `    ssm:GetParametersByPath|ssm:GetParameter) ${e.addressesUnreadable ? 'echo implicitDeny' : 'echo allowed'}; return ;;`,
      `    ssm:PutParameter) ${e.addressWritable ? 'echo allowed' : 'echo explicitDeny'}; return ;;`,
      '    cloudfront:UpdateFunction|cloudfront:PublishFunction|cloudfront:DeleteFunction)',
      '      if [[ "$resource" == *function/footbag-production-* ]]; then',
      `        ${e.productionFunctionWritable ? 'echo allowed' : 'echo explicitDeny'}`,
      '        return',
      '      fi',
      '      ;;',
      '  esac',
      '  case "$a" in',
      '    cloudfront:*)',
      '      if [[ "$ctx" == *staging* ]]; then',
      `        ${e.stagingEdgeDenied ? 'echo explicitDeny' : 'echo allowed'}`,
      '      elif [[ -z "$ctx" ]]; then',
      `        ${e.createDistributionDenied ? 'echo explicitDeny' : 'echo allowed'}`,
      '      else',
      '        echo explicitDeny',
      '      fi',
      '      return ;;',
      '  esac',
      `  if [[ -n ${q(e.lifecycleAllowed)} && "$a" == ${q(e.lifecycleAllowed)} ]]; then`,
      '    echo allowed; return',
      '  fi',
      `  if [[ -n ${q(e.lifecycleImplicit)} && "$a" == ${q(e.lifecycleImplicit)} ]]; then`,
      '    echo implicitDeny; return',
      '  fi',
      '  echo explicitDeny',
      '}',
      '',
      'if (( single )); then',
      '  decide "${actions[0]}"',
      'else',
      '  for a in "${actions[@]}"; do printf "%s\\t%s\\n" "$a" "$(decide "$a")"; done',
      'fi',
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
      ...awsIdentityStubEnv(workDir),
      VERIFY_ROLE_DENIALS_AWS_BIN: awsStub(estate),
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('verify-dev-tester-role-denials.sh — before the identity tree is applied', () => {
  it('refuses by name rather than reporting an empty pass', () => {
    // The pre-apply state is the one every operator meets first. A run that
    // printed "no findings" here would be reporting that denials hold against a
    // role that does not exist.
    const r = run({ roleExists: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no FootbagDevTester role/);
    expect(r.stderr).toMatch(/Nothing checked/);
  });

  it('names the command that fixes it, including the init the tree has never had', () => {
    // terraform/identity has a provider lock file and no .terraform directory,
    // and terraform-apply.sh inits only when asked, so the bare command fails
    // at plan on an uninitialized backend.
    const r = run({ roleExists: false });
    expect(r.stderr).toMatch(/terraform-apply\.sh --target identity --init/);
  });
});

describe('verify-dev-tester-role-denials.sh — the denials hold', () => {
  it('passes with no findings', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/No findings/);
  });

  it('reads the lifecycle action list out of the Terraform, not a copy', () => {
    // The count comes from the HCL. Asserting a floor rather than an exact
    // number, because the list is meant to grow and this test should not be the
    // reason somebody hesitates to add a denial.
    const r = run();
    const m = r.stdout.match(/(\d+) action\(s\) drawn from NeverAdministerADevTester/);
    expect(m, r.stdout).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(34);
  });

  it('says out loud that the inverted denials are probed representatively', () => {
    // Two statements are NotAction-shaped, so there is no list to read and the
    // coverage cannot be exhaustive. A report that did not say so would be
    // claiming more than it proved.
    const r = run();
    expect(r.stdout).toMatch(/representative rather than exhaustive/);
  });
});

describe('verify-dev-tester-role-denials.sh — a denial that has stopped holding', () => {
  it('fails when a lifecycle action comes back allowed, and names it', () => {
    const r = run({ lifecycleAllowed: 'iam:CreateAccessKey' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/iam:CreateAccessKey came back allowed/);
  });

  it('reports an implicit deny as weaker rather than counting it as the denial', () => {
    // Refused because nothing grants it is not the same fact as refused because
    // the policy says no: the first evaporates the day somebody widens a grant.
    // Not a finding today, so the exit stays 0 and the run still says so.
    const r = run({ lifecycleImplicit: 'iam:TagUser' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/iam:TagUser is implicitDeny, not explicitDeny/);
    expect(r.stderr).toMatch(/weaker-than-intended/);
  });

  it('fails when the simulator answers nothing, rather than reading silence as a pass', () => {
    const r = run({ simulatorSilent: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/simulator returned nothing/);
  });

  it('fails when the simulator answers None, which is no answer, at the absence checks', () => {
    // Read as a decision, None passed the state-boundary, static-IP and IAM-write
    // checks as "not granted".
    const r = run({ simulatorNone: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/state boundary: the simulator returned nothing/);
    expect(r.stderr).toMatch(/static IP: the simulator returned nothing/);
    expect(r.stderr).toMatch(/IAM write: the simulator returned nothing/);
    expect(r.stdout).not.toMatch(/not granted \(None\)|out of reach \(None\)/);
  });
});

describe('verify-dev-tester-role-denials.sh — the tag denial in both directions', () => {
  it('fails when the denial swallows staging too, which is the naive guard', () => {
    // Without the Null existence guard a negated tag match denies every call
    // whose resource tag is absent or unreadable. That locks the dev-and-tester out
    // of staging, and it surfaces as a broken credential rather than as a
    // policy error, which is why it has its own case.
    const r = run({ stagingEdgeDenied: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/staging edge: cloudfront:UpdateDistribution came back explicitDeny/);
    expect(r.stderr).toMatch(/cannot do its job/);
  });

  it('fails when creation is denied, which is the same guard seen from the other side', () => {
    // A create carries no resource to tag at all, so it is the purest test of
    // the guard: denied here means the guard is gone.
    const r = run({ createDistributionDenied: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cloudfront:CreateDistribution came back explicitDeny/);
  });

  it('passes the production direction, which is the control itself', () => {
    const r = run();
    expect(r.stdout).toMatch(/action\(s\) denied on a production tag/);
  });
});

describe('verify-dev-tester-role-denials.sh — the host-access certificate', () => {
  it('proves the denial on a staging-tagged instance as well as a production one', () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/host access \(staging\): lightsail:GetInstanceAccessDetails explicitly denied/);
    expect(r.stdout).toMatch(/host access \(production\): lightsail:GetInstanceAccessDetails explicitly denied/);
  });

  it('fails when staging is granted the certificate, which a tag-conditioned denial would allow', () => {
    // The production check alone would pass against a denial that exempts
    // staging, and that exemption is a root shell on staging for every holder
    // of the job role.
    const r = run({ stagingHostAccessAllowed: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/host access \(staging\): lightsail:GetInstanceAccessDetails came back allowed/);
  });
});

describe('verify-dev-tester-role-denials.sh — a host that is not staging', () => {
  it('proves the firewall and delete calls denied on production and allowed on staging', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/production host: lightsail:PutInstancePublicPorts explicitly denied/);
    expect(r.stdout).toMatch(/production host: lightsail:DeleteInstance explicitly denied/);
    expect(r.stdout).toMatch(/staging host: lightsail:DeleteInstance is allowed, as it must be/);
  });

  it('fails when production can be reopened or deleted', () => {
    const r = run({ productionHostReachable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/production host: lightsail:OpenInstancePublicPorts came back allowed/);
  });

  it('fails when the denial also takes staging, which would break its own apply', () => {
    const r = run({ stagingHostDenied: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/staging host: lightsail:CloseInstancePublicPorts came back explicitDeny/);
  });
});

describe('verify-dev-tester-role-denials.sh — the static IP', () => {
  it('proves attaching, detaching and releasing a static IP are not granted', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/static IP: lightsail:AttachStaticIp is not granted/);
    expect(r.stdout).toMatch(/static IP: lightsail:DetachStaticIp is not granted/);
    expect(r.stdout).toMatch(/static IP: lightsail:ReleaseStaticIp is not granted/);
  });

  it('fails when detaching or releasing is granted again, which would reach production at once', () => {
    const r = run({ staticIpReleasable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/static IP: lightsail:ReleaseStaticIp is granted/);
  });

  it('fails when attaching is granted again', () => {
    const r = run({ staticIpAttachable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/static IP: lightsail:AttachStaticIp is granted/);
  });
});

describe('verify-dev-tester-role-denials.sh — the account, the assumable role, aliases, functions, budgets', () => {
  it('proves each of the five denials on a healthy role', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/self-elevation: \d+ action\(s\) explicitly denied/);
    expect(r.stdout).toMatch(/rewriting the runtime role: \d+ action\(s\) explicitly denied/);
    expect(r.stdout).toMatch(/reading the runtime role: iam:GetRole is allowed/);
    expect(r.stdout).toMatch(/key alias on a production-tagged key: \d+ action\(s\) explicitly denied/);
    expect(r.stdout).toMatch(/key alias on an untagged key: \d+ action\(s\) explicitly denied/);
    expect(r.stdout).toMatch(/production edge function: \d+ action\(s\) explicitly denied/);
    expect(r.stdout).toMatch(/passing a role to budgets: \d+ action\(s\) explicitly denied/);
  });

  it('fails when leaving the organisation is no longer denied', () => {
    const r = run({ selfElevationAllowed: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/self-elevation: organizations:LeaveOrganization came back allowed/);
  });

  it('fails when the runtime role it may assume can be rewritten', () => {
    const r = run({ runtimeRoleWritable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/rewriting the runtime role: iam:PutRolePolicy came back allowed/);
  });

  it('fails when an alias can be put on a production-tagged key', () => {
    const r = run({ productionAliasGraftable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/key alias on a production-tagged key: kms:CreateAlias came back allowed/);
  });

  it('fails when an alias can be put on a key carrying no tag', () => {
    const r = run({ untaggedAliasGraftable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/key alias on an untagged key: kms:CreateAlias came back allowed/);
  });

  it('fails when a production edge function can be rewritten', () => {
    const r = run({ productionFunctionWritable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/production edge function: cloudfront:UpdateFunction came back allowed/);
  });

  it('fails when a role can be passed to budgets', () => {
    const r = run({ budgetsPassable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/passing a role to budgets: iam:PassRole came back allowed/);
  });
});

describe('verify-dev-tester-role-denials.sh — IAM write, other roles, operator addresses', () => {
  it('proves every route from a staging-named principal to administrator is ungranted', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    for (const action of ['iam:CreateUser', 'iam:CreateAccessKey', 'iam:AttachUserPolicy', 'iam:PassRole', 'iam:UpdateAssumeRolePolicy', 'iam:CreatePolicyVersion']) {
      expect(r.stdout, action).toMatch(new RegExp(`IAM write: ${action} on \\S+ is not granted`));
    }
  });

  it('fails when IAM write over a staging-named user is granted again', () => {
    // That grant is the first step of making a user, giving it administrator
    // and a key, and from there changing footbag-operator.
    const r = run({ stagingIamWritable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/IAM write: iam:CreateAccessKey on user\/footbag-staging-probe is granted/);
  });

  it('fails when a role other than the staging runtime role can be assumed', () => {
    const r = run({ otherRoleAssumable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/assuming the production runtime role: sts:AssumeRole came back allowed/);
  });

  it('fails when the chain into the staging runtime role is denied too', () => {
    // A deny that also caught the runtime role would break every deploy and
    // smoke check the role exists to run, and read as a broken credential.
    const r = run({ runtimeChainDenied: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/chaining into the staging runtime role: sts:AssumeRole came back explicitDeny/);
  });

  it('fails when the runtime role\'s own trust does not name the job role', () => {
    // The simulation reads only the job role's policy; a trust that does not
    // admit it refuses the chain however that policy reads.
    const r = run({ runtimeTrustNamesJobRole: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/trust does not name FootbagDevTester/);
  });

  it('fails, rather than passing, when the runtime role\'s trust cannot be read', () => {
    const r = run({ runtimeTrustUnreadable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/trust could not be read, so the chain is unproven/);
  });

  it('fails when the alias guard also refuses staging\'s own alias changes', () => {
    // KMS evaluates no condition key on the alias side, so a guard over every
    // resource denies staging's aliases and a role-run apply stops with an
    // unnamed key behind it.
    const r = run({ stagingAliasDenied: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/staging alias, alias side: kms:CreateAlias came back explicitDeny/);
  });

  it('fails, naming what AWS said, when the inline policies cannot be listed', () => {
    // An unreadable listing read as empty passed the very check it exists for.
    const r = run({ inlineUnlistable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/inline policies could not be listed, so what they hold is unproven \(AWS said: .*Throttling/);
  });

  it('fails when an operator address can be written', () => {
    // A holder who could write one could admit any address to staging SSH, or
    // drop a colleague's.
    const r = run({ addressWritable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/writing a dev-and-tester address: ssm:PutParameter came back allowed/);
  });

  it('fails when the addresses can no longer be read, which breaks the staging plan', () => {
    const r = run({ addressesUnreadable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/reading the dev-and-tester addresses: ssm:GetParametersByPath came back implicitDeny/);
  });
});

describe('verify-dev-tester-role-denials.sh — the terraform state boundary', () => {
  it('fails when the role can read another tree state', () => {
    const r = run({ sharedStateReadable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/can read shared\/terraform\.tfstate/);
  });

  it('fails when it can no longer read its own', () => {
    // The boundary is two-sided. A role that cannot read the staging state
    // cannot apply the one tree it exists to apply.
    const r = run({ stagingStateReadable: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/state boundary: s3:GetObject came back implicitDeny/);
  });

  it('reports the boundary as reached by design rather than as an absence', () => {
    const r = run();
    expect(r.stdout).toMatch(/shared state is out of reach/);
    expect(r.stdout).toMatch(/production state is out of reach/);
    expect(r.stdout).toMatch(/identity state is out of reach/);
  });
});

describe('verify-dev-tester-role-denials.sh — the reads that must survive', () => {
  it('fails when the role can no longer read its own definition', () => {
    // A policy simulation against the role is how a grant is checked without
    // exercising it, and this script is that simulation. Denying the read
    // breaks the tool that proves the denials.
    const r = run({ roleReadable: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/iam:GetRole came back explicitDeny/);
  });
});

describe('verify-dev-tester-role-denials.sh — the job policies and the staging plan', () => {
  it('fails when a read a staging refresh makes is denied, naming it', () => {
    // One denied read fails the whole plan, so each is its own finding. These
    // four are the reads that are authorized on no resource or on a region-less
    // ARN, which a staging-scoped grant never matched.
    for (const action of [
      'cloudwatch:GetDashboard',
      'ssm:DescribeParameters',
      'logs:DescribeLogGroups',
      'ses:DescribeConfigurationSet',
    ]) {
      const r = run({ refreshReadDenied: action });
      expect(r.status, action).toBe(1);
      expect(r.stderr, action).toMatch(new RegExp(`staging refresh: ${action} came back implicitDeny`));
    }
  });

  it('fails when the role could rewrite its own managed policies', () => {
    const r = run({ ownPolicyWritable: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/IAM write: iam:CreatePolicyVersion on policy\/FootbagDevTester-StagingServices is granted/);
  });

  it('fails when a job policy is not attached', () => {
    const r = run({ jobPoliciesAttached: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/policy FootbagDevTester-Guardrails is not attached/);
    expect(r.stdout).toMatch(/policy FootbagDevTester-StagingServices is attached/);
  });

  it('fails when anything but a session revocation is inline, since it takes their room', () => {
    const r = run({ strayInline: 'dev-tester-job' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/inline policies other than session revocations: dev-tester-job/);
    expect(run().stdout).toMatch(/the role's inline policies hold only session revocations/);
  });
});

describe('verify-dev-tester-role-denials.sh — the operating contract', () => {
  it('prints only failures under --quiet', () => {
    const r = run({ lifecycleAllowed: 'iam:DeleteUser' }, ['--quiet']);
    expect(r.stdout).not.toMatch(/PASS/);
    expect(r.stderr).toMatch(/FAIL/);
  });

  it('announces the stub, because stubbed evidence is worth nothing', () => {
    expect(run().stderr).toMatch(/SYNTHETIC:.*proves nothing about the account/);
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run({}, ['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown argument/);
  });

  it('refuses --dev-tester with no value', () => {
    const r = run({}, ['--dev-tester']);
    expect(r.status).toBe(2);
  });
});
