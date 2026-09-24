/**
 * The shared human-operator job role, and the properties of it whose failure
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
 * WHAT CHANGED, AND WHY THE ASSERTIONS ARE STRICTER NOW.
 *
 * There used to be two roles assembled from one set of statement definitions,
 * and the load-bearing property was that the narrower one was a strict subset
 * of the wider one: a grant added to a shared statement reached both and could
 * not be added to one alone. There is one role now, so that property is gone
 * and nothing replaces it. What replaces the SAFETY it bought is exactness:
 * every statement's action list is asserted whole rather than by substring, and
 * the set of statements the policy carries is asserted as an exact list. A
 * `toContain` check passes just as happily against a statement that has since
 * gained `iam:*` or lost a KMS action, which is precisely the drift that has no
 * other alarm.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROLE_TF = resolve(__dirname, '../../terraform/identity/human-operator-role.tf');
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

/** The statement names the role's inline policy actually assembles, in order. */
function assembled(): string[] {
  const head = source.indexOf('resource "aws_iam_role_policy" "dev_tester"');
  expect(head, 'no inline policy resource for the role').toBeGreaterThanOrEqual(0);
  const block = source.slice(head);
  return [...block.matchAll(/local\.statements\.(\w+)/g)].map((m) => m[1]);
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
  it('assembles one named list, and adding or dropping one is a change here too', () => {
    // The exact set, in order. A statement added to the locals block and wired
    // into the policy is a real widening of what every operator may do, and it
    // should not be possible to land one without this line changing.
    expect(assembled()).toEqual([
      'project_buckets',
      'state_bucket_listing',
      'project_scoped_services',
      'project_keys_by_alias',
      'calls_that_carry_no_resource',
      'publish_staging_metrics',
      'lightsail_staging_lifecycle',
      'cloudfront_project_surfaces',
      'ses_staging_configuration',
      'ses_account_read',
      'iam_read_everywhere',
      'iam_write_project',
      'chain_into_runtime_roles',
      'resolve_who_acted',
      'reads_the_operator_scripts_make',
      'no_self_elevation',
      'never_touch_super_admin_identity',
      'never_administer_a_human_operator',
      'never_touch_this_role',
      'never_rewrite_a_role_we_can_assume',
      'never_graft_an_alias_onto_production',
      'never_rewrite_a_production_edge_function',
      'never_touch_a_production_edge_surface',
      'never_pass_a_role_to_budgets',
      'never_mint_host_access',
      'never_reach_a_non_staging_host',
    ]);
  });

  it('declares no Identity Center resource of any kind', () => {
    // The tree this file replaced declared permission sets, account assignments
    // and a directory roster. A port that brought one back would grant through
    // a surface nothing else in this suite looks at.
    expect(source).not.toMatch(/aws_ssoadmin_/);
    expect(source).not.toMatch(/aws_identitystore_/);
    expect(source).not.toMatch(/AWSReservedSSO/);

    // The action ban here used to be absolute. It is now an exact allow-list of
    // three reads, because verify-account-baseline.sh asks Identity Center
    // whether the dormant instance is still dormant -- whether it carries any
    // permission set, and whether its directory holds any user -- and a role
    // that cannot ask cannot report. Reading that the surface is empty is the
    // opposite of granting through it. An exact set rather than a ban, so a
    // fourth action cannot arrive under cover of the three.
    const ssoActions = [...source.matchAll(/"((?:sso|identitystore):[A-Za-z*]+)"/g)].map(
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

describe('the job role grants what a terraform plan actually calls', () => {
  it('lists the CloudWatch actions whole, tag actions included', () => {
    // CloudWatch is the one service in its statement enumerated action by
    // action, so anything absent is ungranted. Both environments set
    // default_tags on every provider block, which puts tags on every alarm in
    // both trees, and reading an alarm back reads its tags: without these the
    // plan fails on the refresh rather than on the change.
    expect(actions('ProjectScopedServices')).toEqual([
      'ssm:*',
      'sqs:*',
      'sns:*',
      'logs:*',
      'events:*',
      'cloudwatch:PutMetricAlarm',
      'cloudwatch:DeleteAlarms',
      'cloudwatch:DescribeAlarms*',
      'cloudwatch:PutDashboard',
      'cloudwatch:DeleteDashboards',
      'cloudwatch:ListTagsForResource',
      'cloudwatch:TagResource',
      'cloudwatch:UntagResource',
    ]);
  });

  it('lists the unconditioned calls whole, so a widening cannot arrive unnoticed', () => {
    // Two opposite failures live in one list. The kms grant beside it is
    // conditioned on an alias a key does not carry until its own alias resource
    // exists, so the calls terraform makes in that window must be here —
    // rotation always is, since every key in both trees enables it. And
    // widening this far enough to cover a key's whole lifecycle would let an
    // operator seize or schedule the deletion of any key in the account,
    // including one this project never named.
    const list = actions('CallsThatCarryNoResource');
    expect(list).toEqual([
      'cloudwatch:GetMetricStatistics',
      'cloudwatch:ListMetrics',
      'kms:CreateKey',
      'kms:ListKeys',
      'kms:ListAliases',
      'kms:CreateAlias',
      'kms:DeleteAlias',
      'kms:DescribeKey',
      'kms:GetKeyPolicy',
      'kms:GetKeyRotationStatus',
      'kms:EnableKeyRotation',
      'kms:DisableKeyRotation',
      'kms:ListResourceTags',
      'kms:TagResource',
      'kms:UntagResource',
      'sts:GetCallerIdentity',
      'route53:ListHostedZones',
      'route53:GetChange',
    ]);
    expect(list).not.toContain('kms:PutKeyPolicy');
    expect(list).not.toContain('kms:ScheduleKeyDeletion');

    // No service wildcard survives here. Four of them did, on the reasoning
    // that an environment cannot be written into a Lightsail, CloudFront, ACM
    // or SES ARN. That much is true and it does not license the action set: a
    // service that cannot be scoped by resource is scoped by action instead.
    // Each is asserted separately so a regression names the service it restored.
    for (const wildcard of ['ses:*', 'acm:*', 'cloudfront:*', 'lightsail:*', 'budgets:*']) {
      expect(list).not.toContain(wildcard);
    }
    // Metric publication left this statement for one of its own, because the
    // namespace condition is the whole point of it and a condition cannot be
    // attached to one action inside a shared list.
    expect(list).not.toContain('cloudwatch:PutMetricData');
  });

  it('publishes metrics only into the staging namespace', () => {
    // Unconditioned, this was write access to every namespace in the account,
    // production's included. One injected zero suppresses the backup-promotion
    // alarm, which triggers on a minimum; a flood buries the trail-derived
    // security alarms. Both runtime principals in the estate already carry this
    // condition, so its absence here was the outlier.
    expect(actions('PublishStagingMetricsOnly')).toEqual(['cloudwatch:PutMetricData']);
    const s = statement('PublishStagingMetricsOnly');
    expect(s).toContain('"cloudwatch:namespace" = "Footbag/staging"');
    expect(s).not.toContain('Footbag/production');
  });

  it('reads IAM everywhere and writes it only where the project declares it', () => {
    expect(actions('IamReadEverywhere')).toEqual([
      'iam:Get*',
      'iam:List*',
      'iam:SimulatePrincipalPolicy',
    ]);
    expect(actions('IamWriteOnlyWhatThisProjectDeclares')).toEqual(['iam:*']);
  });

  it('names the staging configuration sets rather than wildcarding SES', () => {
    // Both trees name their sets `${local.prefix}-<kind>` and local.prefix
    // carries the environment, so unlike the rest of SES these ARNs scope
    // exactly. On a wildcard, ses:DeleteConfigurationSet reached production's
    // transactional and bulk sets, which carry the reputation tracking for
    // every message the membership receives.
    expect(actions('SesConfigurationSetsByName')).toEqual([
      'ses:CreateConfigurationSet',
      'ses:DescribeConfigurationSet',
      'ses:DeleteConfigurationSet',
    ]);
    expect(statement('SesConfigurationSetsByName')).toContain(
      'local.scope.ses_configuration_sets',
    );

    // Only the two that genuinely carry no resource stay unscoped, and neither
    // of them can change anything.
    expect(actions('SesListAndAccountRead')).toEqual([
      'ses:ListConfigurationSets',
      'ses:GetAccount',
    ]);
  });

  it('grants the reads the operator scripts make, and only the reads', () => {
    // Three scripts an operator runs through this role failed on these:
    // verify-account-baseline.sh on the account controls and the dormant
    // Identity Center instance, dns-ttl-preflight.sh and verify-zone-mirror.sh
    // on the zone's records. A refused read reads as a broken credential rather
    // than as a missing grant, which is the failure mode this policy's header
    // warns about at length.
    expect(actions('ReadsTheOperatorScriptsMake')).toEqual([
      's3:GetAccountPublicAccessBlock',
      'access-analyzer:ListAnalyzers',
      'access-analyzer:GetAnalyzer',
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
    // It used to read the directory too, which no longer exists. The trail
    // records the role session name, and the trust policy forces that name to
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
    // Inverted rather than enumerated: the Allow above carries iam:* over
    // user/footbag-staging-*, and an enumerated Deny protects only the actions
    // somebody thought to name. Reads stay because the baseline gate calls
    // ListAccessKeys against that user, and reading it is how the gate reports.
    const s = statement('NeverTouchTheSuperAdminIdentity');
    expect(s).toContain('Effect    = "Deny"');
    expect(actions('NeverTouchTheSuperAdminIdentity', 'NotAction')).toEqual([
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

  it('cannot administer a human operator, and the list is enumerated for a reason', () => {
    // Enumerated rather than inverted, unlike the two beside it, because an
    // operator legitimately reads and simulates against their own user and
    // their colleagues': the inverted form would deny the reads the workstation
    // check and the lifecycle verifier both depend on. That makes the exactness
    // of this list the whole of the protection, since anything not named here
    // is permitted by the iam:* Allow wherever the resource pattern reaches.
    expect(actions('NeverAdministerAHumanOperator')).toEqual([
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
    const s = statement('NeverAdministerAHumanOperator');
    expect(s).toContain('local.human_operator_arn_pattern');
    expect(s).toContain(':mfa/*"');
  });

  it('may not hand a role to the budget service, which would re-arm itself', () => {
    // A budget action applies an IAM policy on its own schedule, under a role
    // it is passed, after the person who created it is gone. The iam:* Allow is
    // scoped to footbag-staging-* names and carries PassRole with it, so the
    // role a departing operator created there is passable. The budgets wildcard
    // that made the action reachable is gone; this denial is what stops it
    // returning through the IAM grant.
    expect(actions('NeverPassARoleToBudgets')).toEqual(['iam:PassRole']);
    expect(statement('NeverPassARoleToBudgets')).toContain(
      '"iam:PassedToService" = "budgets.amazonaws.com"',
    );
  });

  it('may not widen the one role it is allowed to assume', () => {
    // Two Allows meet here: iam:* over role/footbag-staging-*, and AssumeRole
    // on footbag-staging-app-runtime, which is inside that name pattern. So the
    // role could attach AdministratorAccess to it and assume it — two calls to
    // administrator over the whole account, since both environments share one
    // account and the staging prefix is a naming convention rather than a
    // boundary. It leaves nothing for an offboard to find and shows no plan
    // diff, because the staging tree declares inline policies only.
    //
    // Inverted rather than enumerated, like the two denials it sits beside, so
    // an IAM action added later is denied by default. Reads stay, because a
    // policy simulation against the role is how a grant is checked.
    const s = statement('NeverRewriteARoleWeCanAssume');
    expect(s).toContain('Effect');
    expect(s).toContain('"Deny"');
    expect(s).toContain('NotAction = ["iam:Get*", "iam:List*", "iam:Simulate*"]');
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
    // key or password of the operator's own. The permission to mint it is the
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
    // the only control that exists. Allocating a new address touches nothing
    // that exists, so it stays.
    const granted = actions('LightsailWhatTheStagingTreeDeclares');
    expect(granted).toContain('lightsail:AllocateStaticIp');
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
    expect(scope).toContain('role/footbag-staging-*');
    expect(scope).toContain('configuration-set/footbag-staging-*');
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
});

describe('the trust policy is what makes attribution real on a shared role', () => {
  it('admits only IAM users under the operator path', () => {
    // The condition, not the principal, is what narrows this. The principal is
    // the account root, which on its own would admit every identity in the
    // account; the ArnLike is the whole of the restriction, so its absence
    // would be a silent opening of the role to anybody.
    const at = source.indexOf('Sid       = "NamedHumanOperatorsMayAssume"');
    expect(at).toBeGreaterThanOrEqual(0);
    const block = source.slice(at, at + 900);
    expect(block).toContain('"aws:PrincipalArn" = local.human_operator_arn_pattern');
    expect(block).toContain('ArnLike');
  });

  it('binds the session name to the assuming user, as a literal policy variable', () => {
    // Setting the session name in the workstation profile is client-side and
    // an operator can edit it. As a trust condition it is binding, and that is
    // the whole of what makes a shared role attributable to a person.
    //
    // The HCL escape matters as much as the condition: written with one dollar
    // sign, Terraform would interpolate it at plan time and emit an empty
    // string, which no session name can equal, and the role would admit nobody.
    const at = source.indexOf('Sid       = "NamedHumanOperatorsMayAssume"');
    const block = source.slice(at, at + 900);
    expect(block).toContain('"sts:RoleSessionName" = "$${aws:username}"');
    expect(block).toContain('StringEquals');
  });

  it('admits neither the directly authenticated identity nor any role', () => {
    // Neither `user/footbag-operator` nor any role ARN matches the operator
    // path pattern, so the break-glass identity reaches the estate as itself
    // rather than through this role, and no role can chain into it.
    const at = source.indexOf('Sid       = "NamedHumanOperatorsMayAssume"');
    const block = source.slice(at, at + 900);
    expect(block).not.toContain('local.super_admin_user_arn');
    expect(block).not.toMatch(/:role\//);
  });
});
