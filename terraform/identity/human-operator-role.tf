# =============================================================================
# The human operator job role — its DEFINITION
#
# What a human operator may do. Who the operators are is not here, and not in
# Terraform at all: onboarding mints an access key, and a secret Terraform
# creates is a secret held in its state, so the named users are created and
# retired by scripts/manage-human-operator.sh instead.
#
# Each human operator has a named IAM user under one IAM path, carrying no
# service permission of its own beyond the right to assume this one role. The
# role models the job rather than the person, so operators doing the same job
# assume the same role and one policy governs them all; two roles carrying the
# same policy drift apart the first time only one of them is updated. Sharing it
# costs no attribution, because the trust policy requires the role session to be
# named for the user assuming it, so the trail records who acted rather than
# only that the job was done.
#
# WHY THIS IS ITS OWN TREE.
#
# The policy denies the role every write to its own definition, so the role
# cannot apply the tree that declares it. In an organization of one the only
# account is the management account, and a service control policy never applies
# there, so the guardrail that would normally hold those denials is structurally
# unavailable and they have to live inside the policy itself. That makes this the
# one tree an operator cannot apply: it is applied by the directly authenticated
# identity, which is the actor here rather than anything this tree changes.
#
# WHAT THIS TREE DOES NOT DO.
#
# It does not create, alter or retire the directly authenticated identity. That
# IAM user keeps its access key and keeps its ARN in both runtime-role trust
# policies, permanently, because the way back in must not depend on this role
# being assumable: it is unavailable exactly when that is what failed.
#
# It declares no second, wider human role. The directly authenticated identity
# already carries the whole estate, and a role duplicating it would be a second
# way to the same place with a second policy to keep in step.
# =============================================================================

locals {
  # The directly authenticated identity, named here only so the policy can deny
  # this role every write to it.
  super_admin_user_arn = "arn:aws:iam::${var.aws_account_id}:user/footbag-operator"

  # Every named human operator lives under one IAM path, and the trust policy
  # admits the path rather than a list of people. Onboarding therefore never
  # edits this role's trust policy, which is the one part of the lifecycle that
  # would otherwise need the tree an operator cannot apply.
  human_operator_path        = "/footbag-operators/"
  human_operator_arn_pattern = "arn:aws:iam::${var.aws_account_id}:user${local.human_operator_path}*"

  # Written out rather than read from the resource below, so the policy that
  # denies writes to this role does not depend on the role it is attached to.
  dev_tester_role_arn = "arn:aws:iam::${var.aws_account_id}:role/FootbagDevTester"

  # Staging, and the reads a deploy makes. No production resource, because
  # deploying to production is a closely guarded operation and somebody who
  # develops and tests does not need it.
  #
  # The Terraform state bucket is the one resource that cannot be reached by
  # the name pattern, since it belongs to no environment. Its object scope is
  # narrowed to the staging key instead, and the bucket itself is listable
  # because the S3 backend lists before it reads.
  scope = {
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

  # ── The statements ──────────────────────────────────────────────────────────
  #
  # The policy as a whole is a STARTING policy, derived statically from every
  # resource type in the Terraform trees and every AWS call in the scripts tree,
  # which is the closest thing to an observed-usage input available before the
  # role has been used. The long-run rule is that it is derived from the observed
  # usage of EVERY operator who assumes it, never from one person's history: a
  # policy derived from one operator under-grants the others and surfaces as a
  # permission error mid-task, usually during something time-critical. Reconcile
  # it against an Access Analyzer generation once it has a month of real use.
  statements = {

    project_buckets = {
      Sid      = "ProjectBucketsIncludingTerraformState"
      Effect   = "Allow"
      Action   = "s3:*"
      Resource = local.scope.buckets
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
      Resource = local.scope.project_resources
    }

    project_keys_by_alias = {
      Sid      = "ProjectKeysByAlias"
      Effect   = "Allow"
      Action   = "kms:*"
      Resource = "*"
      Condition = {
        "ForAnyValue:StringLike" = { "kms:ResourceAliases" = local.scope.kms_alias }
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
    # This is where this role's scoping genuinely stops: an environment cannot
    # be expressed in a Lightsail, CloudFront, ACM or SES ARN, so what keeps it
    # off the production host is the denial below rather than a resource scope.
    # Stated here rather than left to be discovered, because it is the one place
    # the boundary is by action and not by resource.
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

    iam_read_everywhere = {
      Sid      = "IamReadEverywhere"
      Effect   = "Allow"
      Action   = ["iam:Get*", "iam:List*", "iam:SimulatePrincipalPolicy"]
      Resource = "*"
    }

    # An operator who applies Terraform that manages IAM necessarily holds IAM
    # write, which is most of the distance to administrator. Scoping it by
    # resource name to this project's own staging roles, users, policies and
    # instance profiles is a real narrowing rather than a complete one, and the
    # denials below are what stop it closing the remaining distance.
    iam_write_project = {
      Sid      = "IamWriteOnlyWhatThisProjectDeclares"
      Effect   = "Allow"
      Action   = "iam:*"
      Resource = local.scope.iam_write_resources
    }

    chain_into_runtime_roles = {
      Sid      = "ChainIntoTheRuntimeRoles"
      Effect   = "Allow"
      Action   = "sts:AssumeRole"
      Resource = local.scope.runtime_roles
    }

    # The trail records the role session name with every action this role takes,
    # and the trust policy requires that name to be the assuming user's own, so
    # the session identifies the person rather than only the job. Reading the
    # trail back is how an operator answers "who did this" without leaving the
    # role or opening a second identity.
    resolve_who_acted = {
      Sid      = "ResolveWhoActed"
      Effect   = "Allow"
      Action   = ["cloudtrail:LookupEvents"]
      Resource = "*"
    }

    # Each denial below is a way least privilege quietly becomes administrator
    # again. Stopping or deleting the trail is denied; updating it is allowed,
    # because Terraform manages it, so that remaining exposure is answered by
    # code review rather than by permissions.
    no_self_elevation = {
      Sid    = "NoSelfElevation"
      Effect = "Deny"
      Action = ["organizations:LeaveOrganization", "organizations:DeleteOrganization",
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
    # above carries iam:* over user/footbag-staging-*, and an enumerated Deny
    # protects only the actions somebody thought to name while permitting the
    # rest. Inverting the match denies each IAM action added later by default.
    # Reads stay because verify-account-baseline.sh calls ListAccessKeys and
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

    # Onboarding and offboarding a person are the directly authenticated
    # identity's work and nobody else's. The lifecycle script refuses to run
    # under this role, and this denial is what makes that refusal more than a
    # convention: an operator who bypasses the wrapper and calls IAM directly is
    # refused by AWS rather than by a script they chose not to use. Both halves
    # matter equally, because revoking access must never be the slower half.
    #
    # Enumerated rather than inverted, unlike the two denials beside it, because
    # an operator legitimately reads and simulates against their own user and
    # against their colleagues': the inverted form would deny the reads the
    # workstation check and the lifecycle verifier both depend on.
    never_administer_a_human_operator = {
      Sid    = "NeverAdministerAHumanOperator"
      Effect = "Deny"
      Action = ["iam:CreateUser", "iam:DeleteUser", "iam:UpdateUser",
        "iam:CreateAccessKey", "iam:UpdateAccessKey", "iam:DeleteAccessKey",
        "iam:PutUserPolicy", "iam:DeleteUserPolicy", "iam:AttachUserPolicy",
        "iam:DetachUserPolicy", "iam:AddUserToGroup", "iam:RemoveUserFromGroup",
        "iam:CreateLoginProfile", "iam:UpdateLoginProfile",
        "iam:DeleteLoginProfile", "iam:PutUserPermissionsBoundary",
        "iam:DeleteUserPermissionsBoundary", "iam:EnableMFADevice",
      "iam:DeactivateMFADevice", "iam:ResyncMFADevice"]
      Resource = [
        local.human_operator_arn_pattern,
        "arn:aws:iam::${var.aws_account_id}:mfa/*",
      ]
    }

    # Reads are preserved here for the same reason as the super-admin denial
    # above, and the shape is deliberately the same so the two are read as one
    # rule rather than as two that happen to differ. This role must not edit its
    # own definition or its trust policy — that is what makes this the one tree
    # an operator cannot apply — but it does have to be readable, because a
    # policy simulation against the role is how a grant is checked without
    # exercising it.
    never_touch_this_role = {
      Sid       = "NeverTouchThisRole"
      Effect    = "Deny"
      NotAction = ["iam:Get*", "iam:List*", "iam:Simulate*"]
      Resource  = local.dev_tester_role_arn
    }

    # Lightsail supports no resource-level permission at all, so the production
    # host cannot be put out of this role's reach by scoping. This one call is
    # what mints the short-lived certificate that opens a shell on a host, as
    # the default login account, with passwordless sudo. Denying it is what
    # keeps this role off the production host, and it is the reason the control
    # lives in the identity layer rather than in host configuration nobody can
    # see.
    never_reach_a_host_shell = {
      Sid      = "NeverMintHostAccessDetails"
      Effect   = "Deny"
      Action   = ["lightsail:GetInstanceAccessDetails"]
      Resource = "*"
    }
  }
}

resource "aws_iam_role" "dev_tester" {
  name        = "FootbagDevTester"
  description = "The dev-and-tester operator job: staging, and the reads a deploy makes. Reaches no production resource, may not mint host access, and may not administer another operator."

  # Long enough that a deploy and the verification after it do not expire
  # mid-run, short enough that a session left open on a workstation is not a
  # standing credential.
  max_session_duration = 14400

  # The account itself is the principal, narrowed by condition to the one IAM
  # path named human operators live under. Naming the account rather than each
  # person is what keeps onboarding out of this tree: adding somebody is
  # creating a user under that path and granting them sts:AssumeRole, and
  # neither touches this policy. The condition is what stops the root principal
  # meaning "anybody in the account", which is what it would mean alone.
  #
  # The session name is required to be the assuming user's own user name. The
  # role is shared because it models a job, so without this the trail would
  # record whatever session name the caller chose, and sharing the role would
  # cost exactly the attribution that makes sharing it safe. It also means a
  # misconfigured workstation profile fails at AssumeRole rather than quietly
  # logging somebody else's name.
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "NamedHumanOperatorsMayAssume"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${var.aws_account_id}:root" }
      Action    = "sts:AssumeRole"
      Condition = {
        ArnLike      = { "aws:PrincipalArn" = local.human_operator_arn_pattern }
        StringEquals = { "sts:RoleSessionName" = "$${aws:username}" }
      }
    }]
  })
}

resource "aws_iam_role_policy" "dev_tester" {
  name = "dev-tester-job"
  role = aws_iam_role.dev_tester.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.statements.project_buckets,
      local.statements.project_scoped_services,
      local.statements.project_keys_by_alias,
      local.statements.calls_that_carry_no_resource,
      local.statements.iam_read_everywhere,
      local.statements.iam_write_project,
      local.statements.chain_into_runtime_roles,
      local.statements.resolve_who_acted,
      local.statements.no_self_elevation,
      local.statements.never_touch_super_admin_identity,
      local.statements.never_administer_a_human_operator,
      local.statements.never_touch_this_role,
      local.statements.never_reach_a_host_shell,
    ]
  })
}
