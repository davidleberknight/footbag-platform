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
      'project_scoped_services',
      'project_keys_by_alias',
      'calls_that_carry_no_resource',
      'iam_read_everywhere',
      'iam_write_project',
      'chain_into_runtime_roles',
      'resolve_who_acted',
      'no_self_elevation',
      'never_touch_super_admin_identity',
      'never_administer_a_human_operator',
      'never_touch_this_role',
      'never_reach_a_host_shell',
    ]);
  });

  it('declares no Identity Center resource of any kind', () => {
    // The tree this file replaced declared permission sets, account assignments
    // and a directory roster. A port that brought one back would grant through
    // a surface nothing else in this suite looks at.
    expect(source).not.toMatch(/aws_ssoadmin_/);
    expect(source).not.toMatch(/aws_identitystore_/);
    expect(source).not.toMatch(/AWSReservedSSO/);
    expect(source).not.toMatch(/"sso:/);
    expect(source).not.toMatch(/"identitystore:/);
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
      'cloudwatch:PutMetricData',
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
      'ses:*',
      'acm:*',
      'cloudfront:*',
      'lightsail:*',
      'budgets:*',
    ]);
    expect(list).not.toContain('kms:PutKeyPolicy');
    expect(list).not.toContain('kms:ScheduleKeyDeletion');
  });

  it('reads IAM everywhere and writes it only where the project declares it', () => {
    expect(actions('IamReadEverywhere')).toEqual([
      'iam:Get*',
      'iam:List*',
      'iam:SimulatePrincipalPolicy',
    ]);
    expect(actions('IamWriteOnlyWhatThisProjectDeclares')).toEqual(['iam:*']);
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
    ]);
    const s = statement('NeverAdministerAHumanOperator');
    expect(s).toContain('local.human_operator_arn_pattern');
    expect(s).toContain(':mfa/*"');
  });

  it('is never allowed to pass a role, which is denied by absence rather than by a rule', () => {
    // iam:PassRole is how a principal hands a service a role it could not
    // assume itself, and it is the standard way an IAM write grant becomes
    // administrator. There is no Deny for it because there is no Allow: the
    // iam:* Allow is scoped to footbag-staging-* names, so a PassRole against
    // anything else is refused by default. Asserted as absence, because a rule
    // that appeared later would be the thing to notice.
    expect(source).not.toMatch(/iam:PassRole/);
  });

  it('is denied the one call that opens a shell on a host', () => {
    // Lightsail supports no resource-level permission, so the production host
    // cannot be put out of this role's reach by scoping. This call mints the
    // short-lived certificate that lands on the default login account, which
    // has passwordless sudo, so denying it is what keeps this role off the
    // production host.
    const s = statement('NeverMintHostAccessDetails');
    expect(s).toContain('Effect   = "Deny"');
    expect(actions('NeverMintHostAccessDetails')).toEqual([
      'lightsail:GetInstanceAccessDetails',
    ]);
  });
});

describe('the job role reaches staging and nothing else', () => {
  it('names only staging resources, and only the staging runtime role', () => {
    const scope = scopeBlock();
    expect(scope).toContain('arn:aws:s3:::footbag-staging-*');
    expect(scope).toContain('parameter/footbag/staging/*');
    expect(scope).toContain('alias/footbag-staging-*');
    expect(scope).toContain('role/footbag-staging-*');
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
