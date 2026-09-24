/**
 * scripts/verify-operator-role-denials.sh — proving the job role is refused the
 * things it is meant to be refused.
 *
 * The role's policy denies the whole lifecycle of a human operator, every write
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
 *     an operator who cannot work rather than as a security event, so a run
 *     that only checked the production direction would pass against a policy
 *     that had locked everybody out.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/verify-operator-role-denials.sh');

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
      `  get-role) ${e.roleExists ? "printf '{}\\n'; exit 0" : 'exit 254'} ;;`,
      '  simulate-principal-policy) ;;',
      '  *) exit 0 ;;',
      'esac',
      '',
      e.simulatorSilent ? 'exit 0' : '',
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
      'decide() {',
      '  local a="$1"',
      '  case "$a" in',
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
      '    kms:CreateAlias)',
      '      if [[ "$ctx" == *production* ]]; then',
      `        ${e.productionAliasGraftable ? 'echo allowed' : 'echo explicitDeny'}`,
      '      elif [[ -z "$ctx" ]]; then',
      `        ${e.untaggedAliasGraftable ? 'echo allowed' : 'echo explicitDeny'}`,
      '      else',
      '        echo implicitDeny',
      '      fi',
      '      return ;;',
      `    iam:PassRole) ${e.budgetsPassable ? 'echo allowed' : 'echo explicitDeny'}; return ;;`,
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

describe('verify-operator-role-denials.sh — before the identity tree is applied', () => {
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

describe('verify-operator-role-denials.sh — the denials hold', () => {
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
    const m = r.stdout.match(/(\d+) action\(s\) drawn from NeverAdministerAHumanOperator/);
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

describe('verify-operator-role-denials.sh — a denial that has stopped holding', () => {
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
});

describe('verify-operator-role-denials.sh — the tag denial in both directions', () => {
  it('fails when the denial swallows staging too, which is the naive guard', () => {
    // Without the Null existence guard a negated tag match denies every call
    // whose resource tag is absent or unreadable. That locks the operator out
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

describe('verify-operator-role-denials.sh — the host-access certificate', () => {
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

describe('verify-operator-role-denials.sh — a host that is not staging', () => {
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

describe('verify-operator-role-denials.sh — the static IP', () => {
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

describe('verify-operator-role-denials.sh — the account, the assumable role, aliases, functions, budgets', () => {
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

describe('verify-operator-role-denials.sh — the terraform state boundary', () => {
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

describe('verify-operator-role-denials.sh — the reads that must survive', () => {
  it('fails when the role can no longer read its own definition', () => {
    // A policy simulation against the role is how a grant is checked without
    // exercising it, and this script is that simulation. Denying the read
    // breaks the tool that proves the denials.
    const r = run({ roleReadable: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/iam:GetRole came back explicitDeny/);
  });
});

describe('verify-operator-role-denials.sh — the operating contract', () => {
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

  it('refuses --operator with no value', () => {
    const r = run({}, ['--operator']);
    expect(r.status).toBe(2);
  });
});
