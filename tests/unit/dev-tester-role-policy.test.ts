/**
 * The shared dev-and-tester job role, and the properties of it whose failure
 * mode is silence.
 *
 * Every defect here surfaces for the first time as an AccessDenied partway
 * through an apply that has already changed part of the estate, in the words of
 * whichever tool hit it first. A terraform plan that dies on a refresh reads as
 * a broken credential; a rotation call refused on a key created seconds earlier
 * reads as an eventual-consistency fault. Neither points at the policy, which is
 * why these are asserted from the source rather than discovered.
 *
 * The statements are read out of the HCL as text. That is deliberate: this file
 * is the project's own, its shape is chosen here rather than by any external
 * tool, and rendering the policy for real would need an initialized tree and a
 * credential, which the suite is built to have neither of.
 *
 * WHY THE ASSERTIONS ARE EXACT.
 *
 * There is one role, so no second role bounds what a grant can reach. The
 * safety comes from exactness instead:
 * every statement's action list is asserted whole rather than by substring, and
 * the set of statements the policy carries is asserted as an exact list. A
 * `toContain` check passes just as happily against a statement that has since
 * gained `iam:*` or lost a KMS action, which is precisely the drift that has no
 * other alarm.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROLE_TF = resolve(__dirname, '../../terraform/identity/dev-tester-role.tf');
const source = readFileSync(ROLE_TF, 'utf-8');

/**
 * One statement's text, from its Sid to the brace that closes it. Reading a
 * statement whole rather than grepping the file keeps an assertion about one
 * statement from being satisfied by a grant that lives in another.
 */
function statement(sid: string): string {
  // terraform fmt aligns `=` within a block, so the run of spaces after `Sid`
  // varies with the longest key in that statement. Matching on the value is what
  // survives a statement gaining or losing a key.
  const at = source.search(new RegExp(`Sid\\s+= "${sid}"`));
  expect(at, `no statement carries the Sid ${sid}`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(at);
  const end = rest.search(/\n {4}\}/);
  expect(end, `the ${sid} statement is never closed`).toBeGreaterThan(0);
  return rest.slice(0, end);
}

/**
 * Every action a statement lists, in order, as an exact array.
 *
 * This is the assertion shape the whole file turns on. A statement's grant is
 * the WHOLE list, so a test that asks whether one action is present says
 * nothing about the other twenty, and the twenty are where a widening hides.
 */
function actions(sid: string, key: 'Action' | 'NotAction' = 'Action'): string[] {
  const s = statement(sid);
  const at = s.search(new RegExp(`\\n\\s+${key}\\s+=`));
  expect(at, `the ${sid} statement has no ${key}`).toBeGreaterThanOrEqual(0);
  const rest = s.slice(at);
  // A single action is written bare; several are written as a list that
  // terraform fmt may wrap over any number of lines.
  const single = rest.match(new RegExp(`^\\n\\s+${key}\\s+= "([^"]+)"`));
  if (single) return [single[1]];
  const list = rest.match(/\[([\s\S]*?)\]/);
  expect(list, `the ${sid} ${key} is neither a string nor a list`).toBeTruthy();
  return [...list![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * The statement names each of the role's managed policies assembles, in order,
 * keyed by the policy's name suffix.
 */
function assembled(): Record<string, string[]> {
  const head = source.search(/^ {2}dev_tester_policies = \{/m);
  expect(head, 'no dev_tester_policies map for the role').toBeGreaterThanOrEqual(0);
  const rest = source.slice(head);
  const block = rest.slice(0, rest.search(/\n {2}\}/));
  const out: Record<string, string[]> = {};
  for (const m of block.matchAll(/\n {4}(\w+) = \[([\s\S]*?)\n {4}\]/g)) {
    out[m[1]] = [...m[2].matchAll(/local\.statements\.(\w+)/g)].map((s) => s[1]);
  }
  return out;
}

/** Every statement the locals block defines, with its Effect. */
function definedEffects(): Record<string, string> {
  const block = source.slice(source.indexOf('statements = {'));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/\n {4}(\w+) = \{\s*\n\s+Sid\s+= "\w+"\s*\n\s+Effect\s+= "(\w+)"/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/** The scope map, which is the whole of what this role may reach by name. */
function scopeBlock(): string {
  const at = source.search(/^ {2}scope = \{/m);
  expect(at, 'no scope block').toBeGreaterThanOrEqual(0);
  const rest = source.slice(at);
  const end = rest.search(/\n {2}\}/);
  expect(end, 'the scope block is never closed').toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe('the job role carries exactly the statements it is meant to', () => {
  it('assembles three named lists, and adding or dropping one is a change here too', () => {
    // The exact sets, in order. A statement added to the locals block and wired
    // into a policy is a real widening of what every dev-and-tester may do, and it
    // should not be possible to land one without this line changing.
    expect(assembled()).toEqual({
      StagingServices: [
        'project_buckets',
        'state_bucket_listing',
        'take_the_staging_plan_lock',
        'project_scoped_services',
        'staging_dashboard',
        'project_keys_by_alias',
        'calls_that_carry_no_resource',
        'lightsail_staging_lifecycle',
        'ses_account_read',
      ],
      EdgeAndIdentity: [
        'cloudfront_project_surfaces',
        'iam_read_everywhere',
        'chain_into_runtime_roles',
        'read_dev_tester_addresses',
        'resolve_who_acted',
        'reads_the_operator_scripts_make',
      ],
      Guardrails: [
        'never_write_infrastructure',
        'no_self_elevation',
        'never_touch_operator_identity',
        'never_administer_a_dev_tester',
        'never_touch_this_role',
        'never_rewrite_a_role_we_can_assume',
        'never_graft_an_alias_onto_production',
        'never_rewrite_a_production_edge_function',
        'never_touch_a_production_edge_surface',
        'never_pass_a_role_to_budgets',
        'never_mint_host_access',
        'never_reach_a_non_staging_host',
        'never_assume_another_role',
        'never_write_operator_addresses',
      ],
    });
  });

  it('wires every defined statement into exactly one policy, every deny into the guardrails', () => {
    // A statement defined and wired nowhere is a deny the role silently lacks;
    // one wired twice is a grant that survives removal from either policy.
    const effects = definedEffects();
    expect(Object.keys(effects).length, 'no statements were found to check').toBeGreaterThan(20);
    const wired = Object.values(assembled()).flat();
    expect([...wired].sort()).toEqual(Object.keys(effects).sort());
    const policies = assembled();
    for (const [name, keys] of Object.entries(policies)) {
      for (const key of keys) {
        expect(effects[key], `${key} in ${name}`).toBe(name === 'Guardrails' ? 'Deny' : 'Allow');
      }
    }
  });

  it('keeps the job out of the role inline budget, which the session revocations need', () => {
    // A role's inline policies share 10,240 characters. Offboarding writes each
    // session revocation as an inline policy, so a job policy held inline left
    // room for one and refused the next offboard with that person's sessions
    // still live.
    expect(source).not.toMatch(/resource "aws_iam_role_policy" /);
    expect(source).toMatch(/resource "aws_iam_policy" "dev_tester" \{\s*\n\s+for_each = local\.dev_tester_policies/);
    expect(source).toMatch(
      /resource "aws_iam_role_policy_attachment" "dev_tester" \{\s*\n\s+for_each = aws_iam_policy\.dev_tester/,
    );
    // Each policy is refused at plan time above the managed-policy limit.
    expect(source).toMatch(/precondition \{\s*\n\s+condition\s+= length\(jsonencode\(\{[^}]*Statement = each\.value \}\)\) <= 6144/);
  });

  it('declares no Identity Center resource of any kind', () => {
    // The tree this file replaced declared permission sets, account assignments
    // and a directory roster. A port that brought one back would grant through
    // a surface nothing else in this suite looks at.
    expect(source).not.toMatch(/aws_ssoadmin_/);
    expect(source).not.toMatch(/aws_identitystore_/);
    expect(source).not.toMatch(/AWSReservedSSO/);

    // Not an absolute ban but an exact allow-list of three reads, because
    // verify-account-baseline.sh asks Identity Center
    // whether the dormant instance is still dormant -- whether it carries any
    // permission set, and whether its directory holds any user -- and a role
    // that cannot ask cannot report. Reading that the surface is empty is the
    // opposite of granting through it. An exact set rather than a ban, so a
    // fourth action cannot arrive under cover of the three.
    // The write denial names the same three reads, as what it lets through
    // rather than what it grants, so its text is left out.
    const grants = source.replace(statement('NeverWriteInfrastructure'), '');
    const ssoActions = [...grants.matchAll(/"((?:sso|identitystore):[A-Za-z*]+)"/g)].map(
      (m) => m[1],
    );
    expect(ssoActions).toEqual([
      'sso:ListInstances',
      'sso:ListPermissionSets',
      'identitystore:ListUsers',
    ]);
  });

  it('declares one ordinary role, not a permission set', () => {
    expect(source).toMatch(/resource "aws_iam_role" "dev_tester"/);
    expect(source).toMatch(/name\s+= "FootbagDevTester"/);
  });
});

/**
 * The reads, and the few named non-read calls, the infrastructure-write denial
 * leaves through. Written out here by hand rather than read from the policy,
 * because this list is the claim "the role writes no infrastructure" and the
 * policy is what is being checked against it.
 */
const PERMITTED_THROUGH_THE_WRITE_DENIAL = [
  's3:Get*',
  's3:List*',
  's3:PutObject',
  's3:DeleteObject',
  'ssm:Get*',
  'ssm:Describe*',
  'ssm:List*',
  'sqs:Get*',
  'sqs:List*',
  'sns:Get*',
  'sns:List*',
  'logs:Describe*',
  'logs:Get*',
  'logs:List*',
  'logs:FilterLogEvents',
  'events:Describe*',
  'events:List*',
  'cloudwatch:Describe*',
  'cloudwatch:Get*',
  'cloudwatch:List*',
  'kms:Decrypt',
  'kms:Describe*',
  'kms:Get*',
  'kms:List*',
  'lightsail:Get*',
  'cloudfront:Get*',
  'cloudfront:List*',
  'cloudfront:Describe*',
  'ses:Get*',
  'ses:List*',
  'ses:Describe*',
  'iam:Get*',
  'iam:List*',
  'iam:Simulate*',
  'sts:AssumeRole',
  'sts:GetCallerIdentity',
  'cloudtrail:LookupEvents',
  'cloudtrail:Get*',
  'cloudtrail:Describe*',
  'route53:Get*',
  'route53:List*',
  'access-analyzer:Get*',
  'access-analyzer:List*',
  'guardduty:Get*',
  'guardduty:List*',
  'account:Get*',
  'sso:ListInstances',
  'sso:ListPermissionSets',
  'identitystore:ListUsers',
];

describe('the job role writes no infrastructure', () => {
  it('denies everything but reads and the named calls, on every resource', () => {
    // The tag denials below cannot reach the CloudFront types that carry no
    // tag (key groups, public keys, origin access controls, cache and
    // response-headers policies), so a write grant over CloudFront reached
    // production's copies of them. Inverted over every resource, the denial
    // refuses each of them explicitly, and refuses any write a later grant
    // adds before anyone notices it was added.
    const s = statement('NeverWriteInfrastructure');
    expect(s).toMatch(/Effect\s+= "Deny"/);
    expect(s).toMatch(/\n\s+Resource\s+= "\*"/);
    expect(s).not.toContain('Condition');
    expect(actions('NeverWriteInfrastructure', 'NotAction')).toEqual(PERMITTED_THROUGH_THE_WRITE_DENIAL);
  });

  it('grants nothing the denial refuses, so no grant is a dead letter or a write', () => {
    // Every action every Allow grants must pass the denial. One that does not
    // is either a write the policy still claims to grant, or a read the
    // denial silently cancels, which a dev-and-tester meets as a staging plan
    // dying on its refresh.
    const exempt = PERMITTED_THROUGH_THE_WRITE_DENIAL.map(globToRegex);
    const policy = source.slice(source.indexOf('statements = {'));
    const allows = [...policy.matchAll(/Sid\s+= "(\w+)"\s*\n\s+Effect\s+= "Allow"/g)].map((m) => m[1]);
    expect(allows.length, 'no Allow statements were found to check').toBeGreaterThan(8);
    const blocked = allows.flatMap((sid) =>
      actions(sid)
        .filter((a) => !exempt.some((e) => e.test(a)))
        .map((a) => `${sid} grants ${a}`),
    );
    expect(blocked).toEqual([]);
  });

  it('writes only the staging plan lock, and no other object', () => {
    // A plan takes Terraform's lock by writing an object beside the state and
    // deleting it afterwards. That object is the role's only write, so the
    // grant names it alone: the staging state itself, the media and backup
    // buckets, and production's state stay unwritable.
    expect(actions('TakeTheStagingPlanLock')).toEqual(['s3:PutObject', 's3:DeleteObject']);
    expect(resourcePatterns('TakeTheStagingPlanLock')).toEqual([
      'arn:aws:s3:::footbag-terraform-state-*/staging/terraform.tfstate.tflock',
    ]);
    const policy = source.slice(source.indexOf('statements = {'));
    const allows = [...policy.matchAll(/Sid\s+= "(\w+)"\s*\n\s+Effect\s+= "Allow"/g)].map((m) => m[1]);
    for (const sid of allows.filter((x) => x !== 'TakeTheStagingPlanLock')) {
      const objectWrites = actions(sid).filter((a) => /^s3:(Put|Delete)/.test(a));
      expect(objectWrites, `${sid} writes S3`).toEqual([]);
    }
  });

  it('reads the staging buckets and the staging state, and writes neither', () => {
    expect(actions('ProjectBucketsIncludingTerraformState')).toEqual(['s3:Get*', 's3:List*']);
  });

  it('reads the edge a staging plan refreshes, and changes none of it', () => {
    // CloudFront ARNs carry a generated id, so this grant is Resource "*" and
    // reaches production's edge as readily as staging's. Reads only, so that
    // reach changes nothing.
    expect(actions('CloudFrontWhatTheStagingTreeDeclares')).toEqual([
      'cloudfront:GetDistribution',
      'cloudfront:GetDistributionConfig',
      'cloudfront:ListDistributions',
      'cloudfront:ListTagsForResource',
      'cloudfront:DescribeFunction',
      'cloudfront:GetFunction',
      'cloudfront:ListFunctions',
      'cloudfront:GetOriginAccessControl',
      'cloudfront:ListOriginAccessControls',
      'cloudfront:GetCachePolicy',
      'cloudfront:ListCachePolicies',
      'cloudfront:GetOriginRequestPolicy',
      'cloudfront:ListOriginRequestPolicies',
      'cloudfront:GetResponseHeadersPolicy',
      'cloudfront:ListResponseHeadersPolicies',
      'cloudfront:GetKeyGroup',
      'cloudfront:ListKeyGroups',
      'cloudfront:GetPublicKey',
      'cloudfront:ListPublicKeys',
      'cloudfront:GetMonitoringSubscription',
    ]);
  });

  it('reads the host a staging plan refreshes, and changes none of it', () => {
    // A Lightsail ARN carries a generated id too, so this grant reaches the
    // production host. Reads only, and never the host-access certificate.
    expect(actions('LightsailWhatTheStagingTreeDeclares')).toEqual([
      'lightsail:GetInstance',
      'lightsail:GetAutoSnapshots',
      'lightsail:GetStaticIp',
      'lightsail:GetKeyPair',
      'lightsail:GetInstancePortStates',
      'lightsail:GetOperation',
      'lightsail:GetOperations',
      'lightsail:GetBundles',
      'lightsail:GetBlueprints',
    ]);
  });

  it('carries no grant that only an apply would use', () => {
    // Configuration sets and metric publication were granted for applying the
    // staging tree and for nothing a dev-and-tester runs.
    expect(source).not.toMatch(/Sid\s+= "SesConfigurationSetsByName"/);
    expect(source).not.toMatch(/Sid\s+= "PublishStagingMetricsOnly"/);
    expect(source).not.toContain('"cloudwatch:PutMetricData"');
  });
});

describe('the job role grants what a terraform plan actually calls', () => {
  it('lists the scoped service reads whole, the alarm tag read included', () => {
    // Both environments set default_tags on every provider block, which puts
    // tags on every alarm in both trees, and reading an alarm back reads its
    // tags: without the tag read the plan fails on the refresh rather than on
    // the change.
    expect(actions('ProjectScopedServices')).toEqual([
      'ssm:Get*',
      'ssm:Describe*',
      'ssm:List*',
      'sqs:Get*',
      'sqs:List*',
      'sns:Get*',
      'sns:List*',
      'logs:Describe*',
      'logs:Get*',
      'logs:List*',
      'logs:FilterLogEvents',
      'events:Describe*',
      'events:List*',
      'cloudwatch:DescribeAlarms*',
      'cloudwatch:ListTagsForResource',
    ]);
  });

  it('reads the staging keys by alias, and decrypts with them for the parameter refresh', () => {
    // A staging plan reads each SecureString parameter back decrypted, so
    // without Decrypt every plan by this role fails on its first secret.
    expect(actions('ProjectKeysByAlias')).toEqual([
      'kms:Decrypt',
      'kms:Describe*',
      'kms:Get*',
      'kms:List*',
    ]);
    expect(statement('ProjectKeysByAlias')).toContain('"kms:ResourceAliases" = local.scope.kms_alias');
  });

  it('reaches the staging dashboard by its region-less ARN', () => {
    // A dashboard ARN carries no region, so the alarm pattern never matched it:
    // the refresh was denied and every staging plan by this role failed there.
    expect(actions('StagingDashboard')).toEqual(['cloudwatch:GetDashboard']);
    expect(statement('StagingDashboard')).toContain('local.scope.staging_dashboard');
    expect(scopeBlock()).toMatch(
      /staging_dashboard = "arn:aws:cloudwatch::\$\{var\.aws_account_id\}:dashboard\/footbag-staging"/,
    );
  });

  it('lists the unconditioned calls whole, so a widening cannot arrive unnoticed', () => {
    // Reads AWS authorizes on no resource, made on a staging refresh: scoped to
    // staging ARNs, each was denied and no plan by this role completed. On "*"
    // they reach production too, which is why the list holds reads alone.
    const list = actions('CallsThatCarryNoResource');
    expect(list).toEqual([
      'ssm:DescribeParameters',
      'logs:DescribeLogGroups',
      'cloudwatch:GetMetricStatistics',
      'cloudwatch:ListMetrics',
      'kms:ListKeys',
      'kms:ListAliases',
      'kms:DescribeKey',
      'kms:GetKeyPolicy',
      'kms:GetKeyRotationStatus',
      'kms:ListResourceTags',
      'sts:GetCallerIdentity',
      'route53:ListHostedZones',
      'route53:GetChange',
    ]);

    // No service wildcard survives here. Four of them did, on the reasoning
    // that an environment cannot be written into a Lightsail, CloudFront, ACM
    // or SES ARN. That much is true and it does not license the action set: a
    // service that cannot be scoped by resource is scoped by action instead.
    // Each is asserted separately so a regression names the service it restored.
    for (const wildcard of ['ses:*', 'acm:*', 'cloudfront:*', 'lightsail:*', 'budgets:*']) {
      expect(list).not.toContain(wildcard);
    }
  });

  it('reads IAM everywhere and writes it nowhere', () => {
    // IAM write over staging-named principals is a path to administrator:
    // create a footbag-staging user, attach AdministratorAccess, mint it a key,
    // then change footbag-operator and both runtime trusts. So no Allow in the
    // policy may grant an IAM action beyond the reads.
    expect(actions('IamReadEverywhere')).toEqual([
      'iam:Get*',
      'iam:List*',
      'iam:SimulatePrincipalPolicy',
    ]);
    const policy = source.slice(source.indexOf('statements = {'));
    const allows = [...policy.matchAll(/Sid\s+= "(\w+)"\s*\n\s+Effect\s+= "Allow"/g)].map((m) => m[1]);
    expect(allows.length, 'no Allow statements were found to check').toBeGreaterThan(10);
    for (const sid of allows) {
      const iamWrites = actions(sid).filter(
        (a) => a.startsWith('iam:') && !/^iam:(Get|List|Simulate)/.test(a),
      );
      expect(iamWrites, `${sid} grants IAM write`).toEqual([]);
    }
  });

  it('reads SES configuration and the account, and nothing more', () => {
    // Every SES identity in the estate is production's, so any SES grant
    // beyond these reads reaches the identity the membership's mail is sent
    // as. Describing a set takes no resource in the SES v1 API a refresh
    // calls, so scoped by ARN it was denied.
    expect(actions('SesListAndAccountRead')).toEqual([
      'ses:ListConfigurationSets',
      'ses:DescribeConfigurationSet',
      'ses:GetAccount',
    ]);
  });

  it('grants the reads the operator scripts make, and only the reads', () => {
    // Three scripts a dev-and-tester runs through this role failed on these:
    // verify-account-baseline.sh on the account controls and the dormant
    // Identity Center instance, dns-ttl-preflight.sh and verify-zone-mirror.sh
    // on the zone's records. A refused read reads as a broken credential rather
    // than as a missing grant, which is the failure mode this policy's header
    // warns about at length.
    expect(actions('ReadsTheOperatorScriptsMake')).toEqual([
      's3:GetAccountPublicAccessBlock',
      'access-analyzer:ListAnalyzers',
      'access-analyzer:GetAnalyzer',
      'access-analyzer:ListFindings',
      'guardduty:ListDetectors',
      'guardduty:GetDetector',
      'guardduty:GetUsageStatistics',
      'cloudtrail:GetTrailStatus',
      'cloudtrail:DescribeTrails',
      'account:GetAlternateContact',
      'sso:ListInstances',
      'sso:ListPermissionSets',
      'identitystore:ListUsers',
      'route53:ListResourceRecordSets',
      'route53:GetHostedZone',
    ]);

    // The write halves are the point of the list being exact. The account
    // controls are declared in the shared tree, which this role cannot reach,
    // and one zone serves the estate, so a record write is a write over
    // production's DNS.
    const s = statement('ReadsTheOperatorScriptsMake');
    expect(s).not.toContain('route53:ChangeResourceRecordSets');
    expect(s).not.toContain('s3:PutAccountPublicAccessBlock');
    expect(s).not.toContain('iam:UpdateAccountPasswordPolicy');
    expect(s).not.toContain('access-analyzer:CreateAnalyzer');
    expect(s).not.toContain('access-analyzer:DeleteAnalyzer');
  });

  it('resolves who acted from the trail alone', () => {
    // No directory read is needed. The trail records the role session name, and the trust policy forces that name to
    // be the assuming user's own, so the trail answers the question by itself.
    expect(actions('ResolveWhoActed')).toEqual(['cloudtrail:LookupEvents']);
  });
});

describe('the job role cannot become an administrator', () => {
  it('denies the self-elevation calls whole', () => {
    expect(actions('NoSelfElevation')).toEqual([
      'organizations:LeaveOrganization',
      'organizations:DeleteOrganization',
      'organizations:CreateAccount',
      'organizations:CloseAccount',
      'organizations:InviteAccountToOrganization',
      'organizations:RemoveAccountFromOrganization',
      'organizations:AttachPolicy',
      'organizations:DetachPolicy',
      'organizations:CreatePolicy',
      'organizations:UpdatePolicy',
      'organizations:RegisterDelegatedAdministrator',
      'account:CloseAccount',
      'account:DisableRegion',
      'payments:*',
      'cloudtrail:StopLogging',
      'cloudtrail:DeleteTrail',
    ]);
  });

  it('leaves the directly authenticated identity readable while denying every write', () => {
    // Inverted rather than enumerated, so any IAM grant added to the role later
    // still cannot reach this user: an enumerated Deny protects only the actions
    // somebody thought to name. Reads stay because the baseline gate calls
    // ListAccessKeys against that user, and reading it is how the gate reports.
    const s = statement('NeverTouchTheOperatorIdentity');
    expect(s).toContain('Effect    = "Deny"');
    expect(actions('NeverTouchTheOperatorIdentity', 'NotAction')).toEqual([
      'iam:Get*',
      'iam:List*',
      'iam:Simulate*',
    ]);
    expect(s).not.toMatch(/Action\s+=\s+"iam:\*"/);
  });

  it('cannot edit its own definition, which is what makes this tree unappliable by it', () => {
    // Same shape as the denial above, deliberately, so the two read as one rule
    // rather than as two that happen to differ. Simulation stays readable
    // because simulating against the role is how a grant is checked without
    // exercising it.
    const s = statement('NeverTouchThisRole');
    expect(s).toContain('Effect    = "Deny"');
    expect(actions('NeverTouchThisRole', 'NotAction')).toEqual([
      'iam:Get*',
      'iam:List*',
      'iam:Simulate*',
    ]);
    expect(s).toContain('Resource  = local.dev_tester_role_arn');
  });

  it('cannot administer a dev-and-tester, and the list is enumerated for a reason', () => {
    // Enumerated rather than inverted, unlike the two beside it, because a
    // dev-and-tester legitimately reads and simulates against their own user and
    // their colleagues': the inverted form would deny the reads the workstation
    // check and the lifecycle verifier both depend on. That makes the exactness
    // of this list the whole of the protection against any IAM grant the role
    // gains later, since anything not named here would then be permitted.
    expect(actions('NeverAdministerADevTester')).toEqual([
      'iam:CreateUser',
      'iam:DeleteUser',
      'iam:UpdateUser',
      'iam:CreateAccessKey',
      'iam:UpdateAccessKey',
      'iam:DeleteAccessKey',
      'iam:PutUserPolicy',
      'iam:DeleteUserPolicy',
      'iam:AttachUserPolicy',
      'iam:DetachUserPolicy',
      'iam:AddUserToGroup',
      'iam:RemoveUserFromGroup',
      'iam:CreateLoginProfile',
      'iam:UpdateLoginProfile',
      'iam:DeleteLoginProfile',
      'iam:PutUserPermissionsBoundary',
      'iam:DeleteUserPermissionsBoundary',
      'iam:EnableMFADevice',
      'iam:DeactivateMFADevice',
      'iam:ResyncMFADevice',
      // Every other way a credential or an identifying attribute reaches one of
      // these users. Each of these came back implicitDeny before it was named
      // here, which is the difference this statement exists to make: an
      // enumerated list that trails the API is how least privilege stops
      // holding. The tags are here because the lifecycle script proves a
      // pre-existing user is one of ours by reading them before it modifies
      // anything, so rewriting a tag is how that check is defeated.
      'iam:TagUser',
      'iam:UntagUser',
      'iam:CreateVirtualMFADevice',
      'iam:DeleteVirtualMFADevice',
      'iam:UploadSSHPublicKey',
      'iam:UpdateSSHPublicKey',
      'iam:DeleteSSHPublicKey',
      'iam:UploadSigningCertificate',
      'iam:UpdateSigningCertificate',
      'iam:DeleteSigningCertificate',
      'iam:CreateServiceSpecificCredential',
      'iam:UpdateServiceSpecificCredential',
      'iam:DeleteServiceSpecificCredential',
      'iam:ResetServiceSpecificCredential',
    ]);
    const s = statement('NeverAdministerADevTester');
    expect(s).toContain('local.dev_tester_arn_pattern');
    expect(s).toContain(':mfa/*"');
  });

  it('may not hand a role to the budget service, which would re-arm itself', () => {
    // A budget action applies an IAM policy on its own schedule, under a role
    // it is passed, after the person who created it is gone. The role holds no
    // budgets wildcard and no PassRole; this denial is what stops the action
    // returning through any IAM grant added later.
    expect(actions('NeverPassARoleToBudgets')).toEqual(['iam:PassRole']);
    expect(statement('NeverPassARoleToBudgets')).toContain(
      '"iam:PassedToService" = "budgets.amazonaws.com"',
    );
  });

  it('may not widen the one role it is allowed to assume', () => {
    // The role may assume footbag-staging-app-runtime, so if any IAM grant ever
    // reached that role, the holder could attach AdministratorAccess to it and
    // assume it — two calls to
    // administrator over the whole account, since both environments share one
    // account and the staging prefix is a naming convention rather than a
    // boundary. It leaves nothing for an offboard to find and shows no plan
    // diff, because the staging tree declares inline policies only.
    //
    // Inverted rather than enumerated, like the two denials it sits beside, so
    // an IAM action added later is denied by default. Reads stay, because a
    // policy simulation against the role is how a grant is checked.
    //
    // sts:AssumeRole is exempt too: the inversion matches every action on the
    // runtime role's ARN, so leaving it out denies the chain into that role and
    // every staging deploy and check run as a dev-and-tester fails.
    const s = statement('NeverRewriteARoleWeCanAssume');
    expect(s).toContain('Effect');
    expect(s).toContain('"Deny"');
    expect(actions('NeverRewriteARoleWeCanAssume', 'NotAction')).toEqual([
      'iam:Get*',
      'iam:List*',
      'iam:Simulate*',
      'sts:AssumeRole',
    ]);
    expect(s).toContain('local.scope.runtime_roles');
  });

  it('may not graft a staging-shaped alias onto a production key', () => {
    // The key grant matches on the aliases a key already carries, and alias
    // creation carries no resource of its own, so a staging-shaped alias could
    // be pointed at a production key and the condition would then match it:
    // signing with the key that signs session tokens, decrypting every
    // production secret, or scheduling both for deletion. Denied by tag rather
    // than by ARN, because the call names the alias and not the key it targets.
    expect(actions('NeverGraftAnAliasOntoProduction')).toEqual([
      'kms:CreateAlias',
      'kms:UpdateAlias',
      'kms:DeleteAlias',
    ]);
    // Stated in the negative, so an untagged key is denied too. A denial naming
    // production covers only what is already labelled production.
    expect(statement('NeverGraftAnAliasOntoProduction')).toContain(
      'StringNotEquals = { "aws:ResourceTag/Environment" = "staging" }',
    );
    // Scoped to key ARNs. KMS authorises an alias call against the alias as
    // well as the key, and evaluates no condition key where the resource is
    // the alias, so over "*" the absent tag satisfies the negated match and
    // staging's own alias changes are denied partway through an apply.
    expect(statement('NeverGraftAnAliasOntoProduction')).toMatch(
      /\n\s+Resource\s+= "arn:aws:kms:\*:\$\{var\.aws_account_id\}:key\/\*"/,
    );
  });

  it('may not rewrite the edge function on the live distribution', () => {
    // The production viewer-request function runs on every page request the
    // public makes. Publishing code there needs no host access, no deploy and
    // no Terraform, and surfaces only when somebody next applies the production
    // tree, which this role cannot do. Function ARNs carry the name, so unlike
    // the rest of the service this scopes exactly.
    expect(actions('NeverRewriteAProductionEdgeFunction')).toEqual([
      'cloudfront:UpdateFunction',
      'cloudfront:PublishFunction',
      'cloudfront:DeleteFunction',
    ]);
    expect(statement('NeverRewriteAProductionEdgeFunction')).toContain(
      'function/footbag-production-*',
    );
  });

  it('may not touch a production distribution, and keeps the guard that lets staging work', () => {
    // A distribution ARN carries a generated id, not a name, so the grant above
    // is Resource "*" and cannot be otherwise. It reached the production
    // distribution serving the public site, with UpdateDistribution and
    // DeleteDistribution among its actions. Tags are what CloudFront does
    // carry, so this matches on the tag the way the KMS and Lightsail denials
    // do. The tagging actions are in the list because they are how the control
    // would switch itself off.
    expect(actions('NeverTouchAProductionEdgeSurface')).toEqual([
      'cloudfront:UpdateDistribution',
      'cloudfront:DeleteDistribution',
      'cloudfront:UpdateFunction',
      'cloudfront:PublishFunction',
      'cloudfront:DeleteFunction',
      'cloudfront:TagResource',
      'cloudfront:UntagResource',
    ]);

    const s = statement('NeverTouchAProductionEdgeSurface');
    expect(s).toMatch(/StringNotEquals\s*=\s*\{\s*"aws:ResourceTag\/Environment"\s*=\s*"staging"/);

    // The load-bearing half, and the one whose loss is silent. A negated match
    // against a condition key ABSENT from the request evaluates true, so
    // without the Null guard this statement denies every CreateDistribution --
    // which has no resource to carry a tag -- and every call against a resource
    // whose tag could not be read, staging included. Confirmed with
    // iam simulate-custom-policy: unguarded, CreateDistribution came back
    // explicitDeny; guarded, allowed. Deleting this line does not fail any
    // other assertion in this file, which is exactly why it has its own.
    expect(s).toMatch(/Null\s*=\s*\{\s*"aws:ResourceTag\/Environment"\s*=\s*"false"/);
  });

  it('is denied the host-access certificate on every instance, staging included', () => {
    // The certificate opens a root shell as the default login account with no
    // key or password of the caller's own. The permission to mint it is the
    // whole control over that path, and nothing a job-role holder does needs
    // it: a dev-and-tester's sudo comes through their own named account.
    const s = statement('NeverMintHostAccessDetails');
    expect(s).toContain('"Deny"');
    expect(actions('NeverMintHostAccessDetails')).toEqual(['lightsail:GetInstanceAccessDetails']);
    expect(s).toContain('Resource = "*"');
    expect(s).not.toContain('Condition');
    // Nor may any allow grant it: a denial is what makes this a guarantee, and
    // an allow sitting beside it is a grant waiting for the denial to be edited.
    expect(actions('LightsailWhatTheStagingTreeDeclares')).not.toContain(
      'lightsail:GetInstanceAccessDetails',
    );
  });

  it('is never granted attaching, detaching or releasing a static IP', () => {
    // Lightsail cannot tag a static IP and its ARN carries a generated id, so
    // no condition could keep these calls off production's address: detaching
    // or releasing it loses the address, and whether attaching can move an
    // address already attached elsewhere is not documented. Withholding them is
    // the only control that exists.
    const granted = actions('LightsailWhatTheStagingTreeDeclares');
    expect(granted).not.toContain('lightsail:AttachStaticIp');
    expect(granted).not.toContain('lightsail:DetachStaticIp');
    expect(granted).not.toContain('lightsail:ReleaseStaticIp');
  });

  it('is denied the other calls that reach a live host, on every instance but staging', () => {
    // This set reopens the firewall and deletes the host whose database is on
    // local disk. Keyed on the Environment tag and stated in the negative, so
    // it fails closed: production, any instance added later, and an instance
    // carrying no tag at all are all denied, because an absent condition key
    // makes a negated match true. Naming the staging instance by ARN would mean
    // a generated id copied into a values file by hand and re-copied after
    // every rebuild, which is a control that depends on somebody remembering.
    const s = statement('NeverReachANonStagingHost');
    expect(s).toContain('"Deny"');
    expect(actions('NeverReachANonStagingHost')).toEqual([
      'lightsail:PutInstancePublicPorts',
      'lightsail:OpenInstancePublicPorts',
      'lightsail:CloseInstancePublicPorts',
      'lightsail:DeleteInstance',
    ]);
    expect(s).toContain('StringNotEquals = { "aws:ResourceTag/Environment" = "staging" }');
    // Never a denial that names production, which covers nothing the day an
    // untagged instance appears, and never an unconditioned wildcard, which
    // would take staging down with it.
    expect(s).not.toContain('footbag-production');
    expect(s).not.toContain('"Environment" = "production"');
    // No hand-maintained resource id anywhere in the policy: an identifier
    // copied in after a rebuild is a control nobody re-runs.
    expect(source).not.toMatch(/Instance\/[0-9a-f]{8}-/);
    expect(source).not.toContain('staging_lightsail_instance_arn');
  });
});

describe('the job role reaches staging and nothing else', () => {
  it('names only staging resources, and only the staging runtime role', () => {
    const scope = scopeBlock();
    expect(scope).toContain('arn:aws:s3:::footbag-staging-*');
    expect(scope).toContain('parameter/footbag/staging/*');
    // Asserted as the assignment rather than as the string, because the string
    // appears in the comment above it explaining why the hyphen came out, and a
    // substring check is satisfied by prose. The staging tree names its main
    // key alias/footbag-staging with nothing after it, so a hyphen here leaves
    // every SecureString keyed on that alias unreadable under this policy.
    expect(scope).toMatch(/kms_alias\s*=\s*"alias\/footbag-staging\*"/);
    // No IAM name pattern at all: a staging-wide role or user glob in the scope
    // is the shape IAM write came back through.
    expect(scope).not.toMatch(/:(role|user|policy|instance-profile)\/footbag-staging-\*/);
    expect(scope).toContain('footbag-staging-app-runtime');
    expect(scope).not.toContain('footbag-production-app-runtime');
    // The estate-wide globs belong to nobody now. A bare `footbag-*` here would
    // quietly restore production reach through every scoped statement at once,
    // and nothing else in this file would look different.
    expect(scope).not.toContain('arn:aws:s3:::footbag-*');
    expect(scope).not.toContain('parameter/footbag/*');
    expect(scope).not.toContain('alias/footbag-*"');
  });

  it('reaches the terraform state bucket only under the staging key', () => {
    // The state bucket belongs to no environment, so it is the one resource the
    // name pattern cannot narrow. Listing is allowed because the S3 backend
    // lists before it reads; the objects are scoped to the staging prefix.
    const scope = scopeBlock();
    expect(scope).toContain('arn:aws:s3:::footbag-terraform-state-*/staging/*');
    expect(scope).not.toContain('arn:aws:s3:::footbag-terraform-state-*/*"');
  });

  it('chains only into the staging runtime role', () => {
    expect(actions('ChainIntoTheRuntimeRoles')).toEqual(['sts:AssumeRole']);
    expect(statement('ChainIntoTheRuntimeRoles')).toContain('local.scope.runtime_roles');
  });

  it('is denied assuming any other role, whatever trust a role created later carries', () => {
    // An Allow alone leaves any role whose trust names this one assumable; the
    // Deny over everything but the runtime role is what makes the bound hold
    // without relying on nobody ever writing such a trust.
    const s = statement('NeverAssumeAnyRoleButTheStagingRuntime');
    expect(s).toMatch(/Effect\s+= "Deny"/);
    expect(actions('NeverAssumeAnyRoleButTheStagingRuntime')).toEqual(['sts:AssumeRole']);
    expect(s).toMatch(/NotResource\s+= local\.scope\.runtime_roles/);
  });

  it('reads the dev-and-tester addresses and may write no operator address', () => {
    // The staging plan reads each person's address to build the SSH allow-list.
    // Those addresses decide who reaches staging SSH, so writes are denied by
    // inversion: only the three reads pass.
    expect(actions('ReadTheDevTesterAddresses')).toEqual([
      'ssm:GetParametersByPath',
      'ssm:GetParameter',
      'ssm:GetParameters',
    ]);
    expect(statement('ReadTheDevTesterAddresses')).toContain('local.scope.dev_tester_addresses');
    const deny = statement('NeverWriteOperatorAddresses');
    expect(deny).toMatch(/Effect\s+= "Deny"/);
    expect(actions('NeverWriteOperatorAddresses', 'NotAction')).toEqual([
      'ssm:GetParametersByPath',
      'ssm:GetParameter',
      'ssm:GetParameters',
    ]);
    expect(deny).toContain('local.scope.operator_parameters');
    const scope = scopeBlock();
    expect(scope).toContain('parameter/footbag-ops/staging/dev-testers"');
    expect(scope).toContain('parameter/footbag-ops/staging/dev-testers/*"');
    expect(scope).toMatch(/operator_parameters\s+= "arn:aws:ssm:\*:\$\{var\.aws_account_id\}:parameter\/footbag-ops\/\*"/);
    // Outside the application's prefix, which both runtime roles read whole.
    expect(scope).not.toContain('parameter/footbag/staging/dev-testers');
  });
});

describe('the trust policy is what makes attribution real on a shared role', () => {
  it('admits only IAM users under the dev-tester path', () => {
    // The condition, not the principal, is what narrows this. The principal is
    // the account root, which on its own would admit every identity in the
    // account; the ArnLike is the whole of the restriction, so its absence
    // would be a silent opening of the role to anybody.
    const at = source.indexOf('Sid       = "NamedDevTestersMayAssume"');
    expect(at).toBeGreaterThanOrEqual(0);
    const block = source.slice(at, at + 900);
    expect(block).toContain('"aws:PrincipalArn" = local.dev_tester_arn_pattern');
    expect(block).toContain('ArnLike');
  });

  it('binds the session name to the assuming user, as a literal policy variable', () => {
    // Setting the session name in the workstation profile is client-side and
    // a dev-and-tester can edit it. As a trust condition it is binding, and that is
    // the whole of what makes a shared role attributable to a person.
    //
    // The HCL escape matters as much as the condition: written with one dollar
    // sign, Terraform would interpolate it at plan time and emit an empty
    // string, which no session name can equal, and the role would admit nobody.
    const at = source.indexOf('Sid       = "NamedDevTestersMayAssume"');
    const block = source.slice(at, at + 900);
    expect(block).toContain('"sts:RoleSessionName" = "$${aws:username}"');
    expect(block).toContain('StringEquals');
  });

  it('admits neither the directly authenticated identity nor any role', () => {
    // Neither `user/footbag-operator` nor any role ARN matches the dev-tester
    // path pattern, so the break-glass identity reaches the estate as itself
    // rather than through this role, and no role can chain into it.
    const at = source.indexOf('Sid       = "NamedDevTestersMayAssume"');
    const block = source.slice(at, at + 900);
    expect(block).not.toContain('local.operator_user_arn');
    expect(block).not.toMatch(/:role\//);
  });
});

/**
 * The ARN patterns a statement's Resource expression names, with the account
 * id left as written. Only the shapes the role file uses are resolved: a quoted
 * ARN, a `local.scope.<key>` entry, or a top-level `local.<name>`. A list
 * resource returns whichever of its entries resolve.
 */
function resourcePatterns(sid: string): string[] {
  const s = statement(sid);
  const at = s.search(/\n\s+Resource\s+=/);
  if (at < 0) return [];
  const rest = s.slice(at).replace(/^\n\s+Resource\s+=\s*/, '');
  const expr = rest.startsWith('[') ? rest.slice(1, rest.search(/\n\s*\]/)) : rest.split('\n')[0];
  const scope = scopeBlock();
  const out: string[] = [];
  for (const m of expr.matchAll(/"([^"]+)"|local\.scope\.(\w+)|local\.(\w+)/g)) {
    if (m[1]) out.push(m[1]);
    else if (m[2]) {
      const entry = scope.match(new RegExp(`\\n\\s+${m[2]}\\s+= (\\[[\\s\\S]*?\\]|"[^"]+")`));
      expect(entry, `scope has no ${m[2]}`).toBeTruthy();
      out.push(...[...entry![1].matchAll(/"([^"]+)"/g)].map((e) => e[1]));
    } else if (m[3]) {
      const def = source.match(new RegExp(`\\n\\s+${m[3]}\\s+= "([^"]+)"`));
      expect(def, `no local ${m[3]}`).toBeTruthy();
      out.push(def![1]);
    }
  }
  return out;
}

/** An IAM wildcard pattern as an anchored regex: `*` spans anything, colons included. */
function globToRegex(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
}

describe('no deny silently cancels a grant the job role holds', () => {
  it('exempts from every inverted deny each action an allow grants inside its scope', () => {
    // An inverted deny (NotAction) matches every action of every service on its
    // resource except the ones it lists, so an allow aimed inside that resource
    // is cancelled unless each of its actions is listed. That is how the deny
    // guarding the staging runtime role against rewrites also refused
    // sts:AssumeRole on it, and no dev-and-tester could chain into the runtime
    // role at all. Checked across every pair rather than per statement, so an
    // action added to an allow, or a new inverted deny, is caught here.
    const sids = [...source.matchAll(/\n\s+Sid\s+= "(\w+)"/g)].map((m) => m[1]);
    const effect = (sid: string) => statement(sid).match(/\n\s+Effect\s+= "(\w+)"/)![1];
    const inverted = sids.filter(
      (sid) => effect(sid) === 'Deny' && /\n\s+NotAction\s+=/.test(statement(sid)),
    );
    const allows = sids.filter((sid) => effect(sid) === 'Allow');
    expect(inverted.length, 'no inverted deny found, so the check is reading nothing').toBeGreaterThan(2);

    const cancelled: string[] = [];
    let pairs = 0;
    for (const deny of inverted) {
      const denyScope = resourcePatterns(deny).map(globToRegex);
      const exempt = actions(deny, 'NotAction').map(globToRegex);
      for (const allow of allows) {
        const inside = resourcePatterns(allow).filter((r) => r !== '*' && denyScope.some((d) => d.test(r)));
        if (inside.length === 0) continue;
        pairs += 1;
        for (const action of actions(allow)) {
          if (!exempt.some((e) => e.test(action))) {
            cancelled.push(`${deny} cancels ${action} granted by ${allow} on ${inside.join(', ')}`);
          }
        }
      }
    }
    // The two pairs the role depends on: the chain into the runtime role, and
    // the read of the dev-and-tester addresses the staging plan makes.
    expect(pairs, 'no allow falls inside an inverted deny, so nothing was compared').toBeGreaterThanOrEqual(2);
    expect(cancelled).toEqual([]);
  });
});
