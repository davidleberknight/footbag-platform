# =============================================================================
# IAM Identity Center — the operator roles' DEFINITION
#
# What an operator may do. Who the operators are is the roster, and it lives in
# terraform/operators, for the reason below.
#
# Every human operator signs in as themselves through Identity Center and
# assumes one of two shared roles, split by job: a super-admin role carrying the
# whole estate including production, and a dev-and-tester role carrying staging
# and no production resource. Attribution does not come from having a role each:
# Identity Center ties the role session to the signing-in user, so the trail
# answers "who did this" whichever role was assumed. Sharing a role rather than
# minting one per person is deliberate, because two roles holding the same policy
# drift apart the first time only one of them is updated; the split between these
# two is by job rather than by person.
#
# WHY THIS IS ITS OWN TREE, AND WHY THE ROSTER IS NOT IN IT.
#
# The policy denies the role every write to its own definition, so the role
# cannot apply the tree that declares it. In an organization of one the only
# account is the management account, and a service control policy never applies
# there, so the organization-level guardrail that would normally hold those
# denials is structurally unavailable and they have to live inside the policy
# itself. That makes this the one tree an operator cannot apply: it is applied
# by the directly authenticated identity, which is the actor here rather than
# anything this tree changes.
#
# That restriction is exactly why the roster is somewhere else. Who is an
# operator changes on hiring and firing, which is ordinary work; what an operator
# may do changes rarely and is privileged administration of the federation
# itself. Holding both here would make every hiring and every firing an act only
# the directly authenticated identity could perform — and would put that
# ceremony in front of revoking somebody's access, which is the one moment speed
# matters most. The trees divide by lifecycle and blast radius, the same way
# every other tree in this repository does.
#
# WHAT THIS TREE DOES NOT DO.
#
# It does not create, alter or retire the directly authenticated identity. That
# IAM user keeps its access key and keeps its ARN in both runtime-role trust
# policies, permanently, because the way back in must not depend on the identity
# provider: it is unavailable exactly when the provider is what failed.
# Adding the federated route beside it is the whole of this change.
#
# It does not enable the Identity Center instance either. There is no supported
# API for an organization instance — the create-instance call makes an account
# instance, which carries no permission sets at all — so the enable is a console
# action and this tree reads the result.
# =============================================================================

# Read rather than declared: the instance and its identity store are created by
# the console enable, and reading them here means no operator ever pastes an
# instance id into a values file where it could be wrong.
data "aws_ssoadmin_instances" "this" {}

# The one hosted zone this estate owns, looked up by name so the policy is
# scoped to the real zone rather than to an id somebody typed.
data "aws_route53_zone" "primary" {
  name         = var.domain_name
  private_zone = false
}

locals {
  instance_arn      = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  identity_store_id = tolist(data.aws_ssoadmin_instances.this.identity_store_ids)[0]

  # The directly authenticated super-admin identity, which is also what survives
  # a failure of the identity provider. Named here only so the policy can deny
  # the operator roles every mutation of it: rotating its credentials is done BY
  # that identity, never by a role it grants.
  super_admin_user_arn = "arn:aws:iam::${var.aws_account_id}:user/footbag-operator"

  runtime_role_arns = [
    "arn:aws:iam::${var.aws_account_id}:role/footbag-staging-app-runtime",
    "arn:aws:iam::${var.aws_account_id}:role/footbag-production-app-runtime",
  ]

  # ── What each role may reach ────────────────────────────────────────────────
  #
  # The two roles differ in reach, never in the shape of a grant, and this map is
  # the whole of that difference. Every statement below is built once per role
  # from these values, so the narrower role is the wider one with smaller
  # resource scopes and fewer statements, rather than a second policy written
  # beside it that drifts the first time only one is updated.
  #
  # The scoping is possible at all because everything this project owns is named
  # `footbag-*` or `/footbag/*`, and everything belonging to one environment
  # carries that environment in the same position.
  role_scopes = {
    # The whole estate, both environments, plus the account-level controls and
    # the roster that hires and fires.
    super_admin = {
      buckets = ["arn:aws:s3:::footbag-*", "arn:aws:s3:::footbag-*/*"]
      project_resources = [
        "arn:aws:ssm:*:${var.aws_account_id}:parameter/footbag/*",
        "arn:aws:sqs:*:${var.aws_account_id}:footbag-*",
        "arn:aws:sns:*:${var.aws_account_id}:footbag-*",
        "arn:aws:logs:*:${var.aws_account_id}:log-group:/footbag/*",
        "arn:aws:logs:*:${var.aws_account_id}:log-group:/footbag/*:*",
        "arn:aws:logs:*:${var.aws_account_id}:delivery*",
        "arn:aws:events:*:${var.aws_account_id}:rule/footbag-*",
        "arn:aws:cloudwatch:*:${var.aws_account_id}:alarm:footbag-*",
      ]
      kms_alias = "alias/footbag-*"
      iam_write_resources = [
        "arn:aws:iam::${var.aws_account_id}:role/footbag-*",
        "arn:aws:iam::${var.aws_account_id}:user/footbag-*",
        "arn:aws:iam::${var.aws_account_id}:policy/footbag-*",
        "arn:aws:iam::${var.aws_account_id}:instance-profile/footbag-*",
      ]
      runtime_roles = local.runtime_role_arns
    }

    # Staging, and the reads a deploy makes. No production resource, because
    # deploying to production is a closely guarded operation and somebody who
    # develops and tests does not need it.
    #
    # The Terraform state bucket is the one resource that cannot be reached by
    # the name pattern, since it belongs to no environment. Its object scope is
    # narrowed to the staging key instead, and the bucket itself is listable
    # because the S3 backend lists before it reads.
    dev_tester = {
      buckets = [
        "arn:aws:s3:::footbag-staging-*",
        "arn:aws:s3:::footbag-staging-*/*",
        "arn:aws:s3:::footbag-terraform-state-*",
        "arn:aws:s3:::footbag-terraform-state-*/staging/*",
      ]
      project_resources = [
        "arn:aws:ssm:*:${var.aws_account_id}:parameter/footbag/staging/*",
        "arn:aws:sqs:*:${var.aws_account_id}:footbag-staging-*",
        "arn:aws:sns:*:${var.aws_account_id}:footbag-staging-*",
        "arn:aws:logs:*:${var.aws_account_id}:log-group:/footbag/staging/*",
        "arn:aws:logs:*:${var.aws_account_id}:log-group:/footbag/staging/*:*",
        "arn:aws:logs:*:${var.aws_account_id}:delivery*",
        "arn:aws:events:*:${var.aws_account_id}:rule/footbag-staging-*",
        "arn:aws:cloudwatch:*:${var.aws_account_id}:alarm:footbag-staging-*",
      ]
      kms_alias = "alias/footbag-staging-*"
      iam_write_resources = [
        "arn:aws:iam::${var.aws_account_id}:role/footbag-staging-*",
        "arn:aws:iam::${var.aws_account_id}:user/footbag-staging-*",
        "arn:aws:iam::${var.aws_account_id}:policy/footbag-staging-*",
        "arn:aws:iam::${var.aws_account_id}:instance-profile/footbag-staging-*",
      ]
      runtime_roles = ["arn:aws:iam::${var.aws_account_id}:role/footbag-staging-app-runtime"]
    }
  }

  # ── The statements, built once per role ─────────────────────────────────────
  #
  # Each policy below is assembled by naming which of these it carries. A grant
  # added to a statement here therefore reaches both roles by construction, and
  # the only thing a reader has to check is membership, which is short enough to
  # read at a glance in each policy.
  #
  # The policy as a whole is a STARTING policy, derived statically from every
  # resource type in the Terraform trees and every AWS call in the scripts tree,
  # which is the closest thing to an observed-usage input available before either
  # role has been used. The long-run rule is that it is derived from the observed
  # usage of EVERY operator who assumes it, never from one person's history: a
  # policy derived from one operator under-grants the others and surfaces as a
  # permission error mid-task, usually during something time-critical. Reconcile
  # it against an Access Analyzer generation once it has a month of real use.
  role_statements = {
    for role, scope in local.role_scopes : role => {

      project_buckets = {
        Sid      = "ProjectBucketsIncludingTerraformState"
        Effect   = "Allow"
        Action   = "s3:*"
        Resource = scope.buckets
      }

      # CloudWatch is the only service here enumerated action by action, so
      # anything absent from the list is ungranted, where every wildcard beside
      # it carries tagging for free. Both environment providers set default_tags,
      # which puts three tags on every alarm in both trees, so reading an alarm
      # back reads its tags too: without the tag actions a plan fails on the
      # refresh rather than on the change, which reads as a broken credential.
      project_scoped_services = {
        Sid    = "ProjectScopedServices"
        Effect = "Allow"
        Action = ["ssm:*", "sqs:*", "sns:*", "logs:*", "events:*",
          "cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms",
          "cloudwatch:DescribeAlarms*", "cloudwatch:PutDashboard",
          "cloudwatch:DeleteDashboards", "cloudwatch:ListTagsForResource",
        "cloudwatch:TagResource", "cloudwatch:UntagResource"]
        Resource = scope.project_resources
      }

      project_keys_by_alias = {
        Sid      = "ProjectKeysByAlias"
        Effect   = "Allow"
        Action   = "kms:*"
        Resource = "*"
        Condition = {
          "ForAnyValue:StringLike" = { "kms:ResourceAliases" = scope.kms_alias }
        }
      }

      # Four services support no resource-level permission for the calls this
      # project makes, or support them for only part of the action set. Lightsail
      # supports none at all. CloudFront and ACM support them for part of theirs,
      # and a partial scoping whose remainder fails silently is worse than an
      # honest wildcard. SES scoping reaches identities and configuration sets but
      # not the send-quota and suppression reads the scripts make. The trigger to
      # narrow all four is the same one as for the rest of this policy: an Access
      # Analyzer generation with real history behind it.
      #
      # This statement is identical for both roles, and that is where the
      # narrower role's scoping genuinely stops: an environment cannot be
      # expressed in a Lightsail, CloudFront, ACM or SES ARN, so what keeps the
      # dev-and-tester role off the production host is the denial below rather
      # than a resource scope. Stated here rather than left to be discovered,
      # because it is the one place the subset relationship is by action and not
      # by resource.
      #
      # The KMS entries here are also what covers the gap between creating a key
      # and naming it. The alias condition above matches on the aliases a key
      # already carries, and a key has none until its alias resource is created,
      # so every call in between is denied: rotation is enabled on a key that is
      # still anonymous, and a later refresh reads its policy, its rotation state
      # and its tags the same way. Each of those is listed here. Seizing or
      # destroying an existing key is not: PutKeyPolicy and ScheduleKeyDeletion
      # stay behind the alias, so a key this project never named is beyond an
      # operator's reach, and an orphan left by an interrupted apply is cleaned
      # up by the directly authenticated identity rather than by a role.
      calls_that_carry_no_resource = {
        Sid    = "CallsThatCarryNoResource"
        Effect = "Allow"
        Action = ["cloudwatch:GetMetricStatistics", "cloudwatch:ListMetrics",
          "cloudwatch:PutMetricData", "kms:CreateKey", "kms:ListKeys",
          "kms:ListAliases", "kms:CreateAlias", "kms:DeleteAlias",
          "kms:DescribeKey", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus",
          "kms:EnableKeyRotation", "kms:DisableKeyRotation",
          "kms:ListResourceTags", "kms:TagResource", "kms:UntagResource",
          "sts:GetCallerIdentity", "route53:ListHostedZones",
          "route53:GetChange", "ses:*", "acm:*", "cloudfront:*",
        "lightsail:*", "budgets:*"]
        Resource = "*"
      }

      the_one_hosted_zone = {
        Sid      = "TheOneHostedZone"
        Effect   = "Allow"
        Action   = "route53:*"
        Resource = "arn:aws:route53:::hostedzone/${data.aws_route53_zone.primary.zone_id}"
      }

      account_baseline_controls = {
        Sid    = "AccountBaselineControls"
        Effect = "Allow"
        Action = ["iam:GetAccountPasswordPolicy", "iam:UpdateAccountPasswordPolicy",
          "iam:GenerateCredentialReport", "iam:GetCredentialReport",
          "iam:GetAccountSummary", "s3:GetAccountPublicAccessBlock",
          "s3:PutAccountPublicAccessBlock", "access-analyzer:*",
          "account:GetAlternateContact", "account:PutAlternateContact",
        "account:GetContactInformation", "cloudtrail:*"]
        Resource = "*"
      }

      iam_read_everywhere = {
        Sid      = "IamReadEverywhere"
        Effect   = "Allow"
        Action   = ["iam:Get*", "iam:List*", "iam:SimulatePrincipalPolicy"]
        Resource = "*"
      }

      # An operator who applies Terraform that manages IAM necessarily holds IAM
      # write, which is most of the distance to administrator. Scoping it by
      # resource name to this project's own roles, users, policies and instance
      # profiles is a real narrowing rather than a complete one, and the denials
      # below are what stop it closing the remaining distance.
      iam_write_project = {
        Sid      = "IamWriteOnlyWhatThisProjectDeclares"
        Effect   = "Allow"
        Action   = "iam:*"
        Resource = scope.iam_write_resources
      }

      chain_into_runtime_roles = {
        Sid      = "ChainIntoTheRuntimeRoles"
        Effect   = "Allow"
        Action   = "sts:AssumeRole"
        Resource = scope.runtime_roles
      }

      # The trail records the Identity Center user id with every action the role
      # takes; the readable name is emitted once per successful sign-in. So
      # answering "who did this" is a two-step, and without these an operator can
      # see that somebody acted and has to leave the role to find out who. Both
      # roles carry it, because answering that question must never require
      # leaving the role or opening a second identity.
      resolve_who_acted = {
        Sid    = "ResolveWhoActed"
        Effect = "Allow"
        Action = ["identitystore:DescribeUser", "identitystore:ListUsers",
          "identitystore:GetUserId", "sso:ListInstances",
        "sso:ListAccountAssignments", "cloudtrail:LookupEvents"]
        Resource = "*"
      }

      # Hiring and firing are ordinary work, and this is the grant that makes
      # them so: assignment and directory writes are allowed while every
      # permission-set write is denied below, and the grant names the permission
      # sets themselves, so handing somebody a role that already exists mints no
      # privilege that did not. It is what terraform/operators is applied with.
      # The delete actions matter as much as the create ones: revoking access
      # must never be the slower half.
      #
      # It names both permission sets because a super admin hires into either
      # job. Only the super-admin role carries this statement at all.
      onboard_an_operator = {
        Sid    = "OnboardAnOperatorWithoutMintingPrivilege"
        Effect = "Allow"
        Action = ["sso:CreateAccountAssignment", "sso:DeleteAccountAssignment",
          "sso:DescribeAccountAssignmentCreationStatus",
          # The provider deletes an assignment and then polls deletion status.
          # Without this a firing errors after the delete has been issued, so the
          # apply fails with the revocation in flight and nobody able to say
          # whether access is gone. Revoking must never be the slower half.
          "sso:DescribeAccountAssignmentDeletionStatus",
          "identitystore:CreateUser", "identitystore:UpdateUser",
          "identitystore:DeleteUser",
          "identitystore:CreateGroupMembership",
        "identitystore:DeleteGroupMembership"]
        Resource = [
          local.instance_arn,
          aws_ssoadmin_permission_set.super_admin.arn,
          aws_ssoadmin_permission_set.dev_tester.arn,
          "arn:aws:sso:::account/${var.aws_account_id}",
          "arn:aws:identitystore::${var.aws_account_id}:identitystore/${local.identity_store_id}",
          "arn:aws:identitystore:::user/*",
        ]
      }

      # Each denial below is a way least privilege quietly becomes administrator
      # again. Stopping or deleting the trail is denied; updating it is allowed,
      # because Terraform manages it, so that remaining exposure is answered by
      # code review rather than by permissions.
      no_self_elevation = {
        Sid    = "NoSelfElevation"
        Effect = "Deny"
        Action = ["sso:CreatePermissionSet", "sso:UpdatePermissionSet",
          "sso:DeletePermissionSet", "sso:PutInlinePolicyToPermissionSet",
          "sso:DeleteInlinePolicyFromPermissionSet",
          "sso:AttachManagedPolicyToPermissionSet",
          "sso:AttachCustomerManagedPolicyReferenceToPermissionSet",
          "sso:PutPermissionsBoundaryToPermissionSet",
          "sso:DeletePermissionsBoundaryFromPermissionSet",
          "sso:CreateInstance", "sso:DeleteInstance", "sso-directory:*",
          "organizations:LeaveOrganization", "organizations:DeleteOrganization",
          "organizations:CreateAccount", "organizations:CloseAccount",
          "organizations:InviteAccountToOrganization",
          "organizations:RemoveAccountFromOrganization",
          "organizations:AttachPolicy", "organizations:DetachPolicy",
          "organizations:CreatePolicy", "organizations:UpdatePolicy",
          "organizations:RegisterDelegatedAdministrator",
          "account:CloseAccount", "account:DisableRegion", "payments:*",
        "cloudtrail:StopLogging", "cloudtrail:DeleteTrail"]
        Resource = "*"
      }

      # Everything except reads, rather than a list of forbidden actions. The Allow
      # above carries iam:* over user/footbag-*, which matches this identity, so an
      # enumerated Deny protects only the actions somebody thought to name and
      # permits the rest. A permissions boundary was the gap: it caps what this
      # identity may do without touching its policies, its keys or its MFA, and an
      # identity that cannot resolve the failure is no use as the way back in.
      # Inverting the match denies each IAM action added later by default. Reads
      # stay because verify-account-baseline.sh calls ListAccessKeys and
      # GetAccessKeyLastUsed against this user, and reading the identity is how the
      # baseline gate reports on it.
      never_touch_super_admin_identity = {
        Sid       = "NeverTouchTheSuperAdminIdentity"
        Effect    = "Deny"
        NotAction = ["iam:Get*", "iam:List*", "iam:Simulate*"]
        Resource = [
          local.super_admin_user_arn,
          "arn:aws:iam::${var.aws_account_id}:mfa/footbag-operator",
        ]
      }

      # Reads are preserved here for the same reason as the denial above it, and
      # the shape is deliberately the same so the two are read as one rule rather
      # than as two that happen to differ. The generated role must not be edited
      # by the role it generates, but it does have to be readable: the ARN cannot
      # be predicted, so the baseline gate reads it back and compares it against
      # what each runtime trust policy actually carries, and a policy simulation
      # against the role is how a grant is checked without exercising it.
      never_touch_generated_sso_roles = {
        Sid       = "NeverTouchTheGeneratedSsoRoles"
        Effect    = "Deny"
        NotAction = ["iam:Get*", "iam:List*", "iam:Simulate*"]
        Resource  = "arn:aws:iam::${var.aws_account_id}:role/aws-reserved/sso.amazonaws.com/*"
      }

      # Lightsail supports no resource-level permission at all, so the production
      # host cannot be put out of this role's reach by scoping. This one call is
      # what mints the short-lived certificate that opens a shell on a host, as
      # the default login account, with passwordless sudo. Denying it is what
      # keeps a non-super-admin off the production host, and it is the reason the
      # control lives in the identity layer rather than in host configuration
      # nobody can see.
      never_reach_a_host_shell = {
        Sid      = "NeverMintHostAccessDetails"
        Effect   = "Deny"
        Action   = ["lightsail:GetInstanceAccessDetails"]
        Resource = "*"
      }
    }
  }
}

# ── The super-admin role ──────────────────────────────────────────────────────
#
# The permission set is what you name; Identity Center generates the IAM role
# from it as AWSReservedSSO_<name>_<suffix>, and the suffix cannot be predicted.
# The name carries no hyphen and no environment: the project's
# `footbag-<env>-<role>` convention applies to roles this project names, and this
# is not one of those. It is also env-agnostic — which environment a run lands on
# is chosen by --target, never by which credential is loaded.
#
# The name deliberately does not resemble the IAM user `footbag-operator`. They
# are different things: that one is directly authenticated and nobody assumes it,
# this one is federated and every super admin does. Names that differ only by
# case or punctuation are one sound when a sentence is spoken or dictated, and
# the difference here decides whether the subject is a long-lived key or a
# federated role, so the two are kept far enough apart to survive being said out
# loud.
resource "aws_ssoadmin_permission_set" "super_admin" {
  name         = "FootbagSuperAdmin"
  description  = "The super-admin operator role: the whole estate, including production deploys and the operator roster. Terraform plans and applies, deploys, diagnostics."
  instance_arn = local.instance_arn

  # Long enough that a Terraform apply followed by a deploy never expires
  # mid-run, short enough that a walked-away-from laptop is not a standing
  # credential. The permitted range is one to twelve hours, and twelve gives away
  # most of what short-lived credentials buy.
  session_duration = "PT4H"
}

resource "aws_ssoadmin_permission_set_inline_policy" "super_admin" {
  instance_arn       = local.instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.super_admin.arn

  inline_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.role_statements.super_admin.project_buckets,
      local.role_statements.super_admin.project_scoped_services,
      local.role_statements.super_admin.project_keys_by_alias,
      local.role_statements.super_admin.calls_that_carry_no_resource,
      local.role_statements.super_admin.the_one_hosted_zone,
      local.role_statements.super_admin.account_baseline_controls,
      local.role_statements.super_admin.iam_read_everywhere,
      local.role_statements.super_admin.iam_write_project,
      local.role_statements.super_admin.chain_into_runtime_roles,
      local.role_statements.super_admin.resolve_who_acted,
      local.role_statements.super_admin.onboard_an_operator,
      local.role_statements.super_admin.no_self_elevation,
      local.role_statements.super_admin.never_touch_super_admin_identity,
      local.role_statements.super_admin.never_touch_generated_sso_roles,
    ]
  })
}

# ── The dev-and-tester role ───────────────────────────────────────────────────
#
# The same list as above with four entries gone and one added, which is the whole
# of the difference and is meant to be read that way.
#
# Gone: the hosted zone, because staging serves on its default CloudFront name
# and attaches no custom domain, so nothing in its tree touches DNS. The account
# baseline controls, because the password policy, the credential report, the
# account contacts and the trail are the account's own posture rather than an
# environment's. The roster grant, because hiring and firing belong to the job
# that carries the whole estate.
#
# Added: the denial of the one call that opens a host shell. Everything else that
# narrows this role is a resource scope in local.role_scopes, and that denial
# exists because Lightsail is the one service where a scope cannot express it.
resource "aws_ssoadmin_permission_set" "dev_tester" {
  name         = "FootbagDevTester"
  description  = "The dev-and-tester operator role: staging, and the reads a deploy makes. Reaches no production resource, and may not mint host access."
  instance_arn = local.instance_arn

  session_duration = "PT4H"
}

resource "aws_ssoadmin_permission_set_inline_policy" "dev_tester" {
  instance_arn       = local.instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.dev_tester.arn

  inline_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.role_statements.dev_tester.project_buckets,
      local.role_statements.dev_tester.project_scoped_services,
      local.role_statements.dev_tester.project_keys_by_alias,
      local.role_statements.dev_tester.calls_that_carry_no_resource,
      local.role_statements.dev_tester.iam_read_everywhere,
      local.role_statements.dev_tester.iam_write_project,
      local.role_statements.dev_tester.chain_into_runtime_roles,
      local.role_statements.dev_tester.resolve_who_acted,
      local.role_statements.dev_tester.no_self_elevation,
      local.role_statements.dev_tester.never_touch_super_admin_identity,
      local.role_statements.dev_tester.never_touch_generated_sso_roles,
      local.role_statements.dev_tester.never_reach_a_host_shell,
    ]
  })
}

# The directory records and their assignments are deliberately NOT here. They are
# the roster, they change on hiring and firing, and they live in
# terraform/operators so that an ordinary operator can apply them.
