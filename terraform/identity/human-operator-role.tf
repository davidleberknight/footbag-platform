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
      "arn:aws:s3:::footbag-terraform-state-*/staging/*",
    ]

    # The state bucket itself, listed separately because it takes reads and not
    # s3:*. Granting the bucket ARN the same wildcard as the objects carried
    # s3:PutBucketPolicy with it, and S3 takes the union of the identity policy
    # and the bucket policy for a principal in the same account, so the holder
    # could grant themselves the production, shared and identity state this
    # object scope exists to withhold -- every production secret in plaintext,
    # and the input to every later apply. DeleteBucketPolicy would also remove
    # the deny-plaintext baseline. The comment above always said listing was the
    # intent; the grant said otherwise.
    state_bucket = "arn:aws:s3:::footbag-terraform-state-*"
    project_resources = [
      "arn:aws:ssm:*:${var.aws_account_id}:parameter/footbag/staging/*",
      "arn:aws:sqs:*:${var.aws_account_id}:footbag-staging-*",
      "arn:aws:sns:*:${var.aws_account_id}:footbag-staging-*",
      "arn:aws:logs:*:${var.aws_account_id}:log-group:/footbag/staging/*",
      "arn:aws:logs:*:${var.aws_account_id}:log-group:/footbag/staging/*:*",
      # Log deliveries, split by their three ARN shapes rather than matched with
      # one `delivery*` prefix. That prefix read as "the delivery resources",
      # and an IAM wildcard crosses a colon, so it also matched
      # delivery-source:footbag-production-platform-access-logs. The role could
      # therefore delete production's CloudFront access logging, which the watch
      # window and any member-data investigation rest on, or repoint a
      # production source at a staging bucket it controls and take a continuous
      # copy of every request, with the viewer address on each one. Source and
      # destination carry names and are scoped to staging; the delivery itself
      # is identified by a generated id and cannot be name-scoped, so it stays
      # wildcarded and is reachable only through a source and destination that
      # are not.
      "arn:aws:logs:*:${var.aws_account_id}:delivery-source:footbag-staging-*",
      "arn:aws:logs:*:${var.aws_account_id}:delivery-destination:footbag-staging-*",
      "arn:aws:logs:*:${var.aws_account_id}:delivery:*",
      "arn:aws:events:*:${var.aws_account_id}:rule/footbag-staging-*",
      "arn:aws:cloudwatch:*:${var.aws_account_id}:alarm:footbag-staging-*",
    ]
    # No hyphen before the star. The staging tree names its main key
    # alias/footbag-staging with nothing after it, and alias/footbag-staging-*
    # does not match that, so the four SecureString parameters keyed on it were
    # unreadable and unwritable under this policy -- every `--with-decryption`
    # read, every secret write, and the smoke checks and arming steps that make
    # them. The jwt alias matched and the main one did not, which is the kind of
    # half-working grant that reads as a broken credential rather than as a
    # scope error.
    kms_alias = "alias/footbag-staging*"
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

    # The state bucket's own ARN, reads only. The S3 backend lists before it
    # reads and asks for the bucket's region and versioning on the way, and
    # those three calls are the whole of what it needs at bucket level; the
    # objects it actually reads and writes are covered by the staging key
    # prefix in the statement above.
    state_bucket_listing = {
      Sid    = "ListTheStateBucketWithoutOwningIt"
      Effect = "Allow"
      Action = ["s3:ListBucket", "s3:GetBucketLocation",
      "s3:GetBucketVersioning"]
      Resource = local.scope.state_bucket
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

    # The calls left here carry no resource of their own. What used to sit
    # beside them was a wildcard on four whole services, on the reasoning that
    # an environment cannot be expressed in a Lightsail, CloudFront, ACM or SES
    # ARN and that a partial scoping whose remainder fails silently is worse
    # than an honest wildcard.
    #
    # The first half of that is right and the conclusion did not follow. A
    # service whose ARNs cannot carry an environment can still be scoped by
    # ACTION, and the four wildcards were never narrowed that way, so this role
    # could clone the production host, rewrite the edge function on every live
    # request, send mail as the domain to the membership, and delete the
    # certificate serving it -- while its own description said it reaches no
    # production resource. The statements below enumerate what the staging tree
    # declares and what the scripts call, derived from both plus four weeks of
    # trail, and the ACM and budgets wildcards are gone outright because the
    # staging tree declares neither.
    #
    # The Access Analyzer reconciliation this policy plans for still stands; it
    # needs a month of real use and there has been none. This is the floor it
    # will be reconciled against, not a substitute for it.
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
        "kms:CreateKey", "kms:ListKeys",
        "kms:ListAliases", "kms:CreateAlias", "kms:DeleteAlias",
        "kms:DescribeKey", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus",
        "kms:EnableKeyRotation", "kms:DisableKeyRotation",
        "kms:ListResourceTags", "kms:TagResource", "kms:UntagResource",
        "sts:GetCallerIdentity", "route53:ListHostedZones",
      "route53:GetChange"]
      Resource = "*"
    }

    # Metric publication, separated from the calls above so it can carry the one
    # condition that scopes it. Without it this was PutMetricData on "*", which
    # is write access to every namespace including the one production's alarms
    # read. One injected zero suppresses the backup-promotion alarm outright,
    # because that alarm triggers on a minimum; flooding the namespace buries
    # the trail-derived security alarms in noise. Both runtime principals in the
    # estate already carry exactly this condition, so this is parity rather than
    # a new idea.
    publish_staging_metrics = {
      Sid      = "PublishStagingMetricsOnly"
      Effect   = "Allow"
      Action   = ["cloudwatch:PutMetricData"]
      Resource = "*"
      Condition = {
        StringEquals = { "cloudwatch:namespace" = "Footbag/staging" }
      }
    }

    # Lightsail, enumerated. The service supports resource-level permissions for
    # part of this set, but an instance ARN carries a generated id rather than
    # the instance name, so a footbag-staging-* pattern cannot exist and the
    # scoping here is by action. Every entry traces to a declared resource in
    # terraform/staging/lightsail.tf or to a call a script makes: the instance,
    # its static IP and attachment, its key pair, its public ports, and the
    # auto-snapshot add-on, plus the operation poll every mutating call returns
    # and the bundle and blueprint reads a create validates against.
    #
    # What is gone is the rest of the service: containers, managed databases,
    # its own CDN and buckets, load balancers, domains, and the instance
    # lifecycle calls -- stop, reboot, delete, snapshot, clone. Those appeared in
    # no declared resource, in no script, and in four weeks of trail only from
    # the browser console. They are also how a holder reached production, by
    # snapshotting the live host and booting the copy under a key pair of their
    # own, which no resource scope on this service could have prevented.
    lightsail_staging_lifecycle = {
      Sid    = "LightsailWhatTheStagingTreeDeclares"
      Effect = "Allow"
      Action = ["lightsail:CreateInstances", "lightsail:GetInstance",
        "lightsail:DeleteInstance", "lightsail:EnableAddOn",
        "lightsail:DisableAddOn", "lightsail:GetAutoSnapshots",
        "lightsail:AllocateStaticIp", "lightsail:GetStaticIp",
        "lightsail:ReleaseStaticIp", "lightsail:AttachStaticIp",
        "lightsail:DetachStaticIp", "lightsail:CreateKeyPair",
        "lightsail:GetKeyPair", "lightsail:DeleteKeyPair",
        "lightsail:ImportKeyPair", "lightsail:GetInstancePortStates",
        "lightsail:PutInstancePublicPorts", "lightsail:OpenInstancePublicPorts",
        "lightsail:CloseInstancePublicPorts", "lightsail:GetOperation",
        "lightsail:GetOperations", "lightsail:GetBundles",
        "lightsail:GetBlueprints", "lightsail:TagResource",
      "lightsail:UntagResource", "lightsail:GetInstanceAccessDetails"]
      Resource = "*"
    }

    # CloudFront, enumerated against the two distributions the staging tree
    # declares and everything they reference: functions, origin access controls,
    # cache and response-headers policies, the archive's key group and public
    # key, and the monitoring subscription. AllowVendedLogDeliveryForResource is
    # here because the log service evaluates it against the caller when a
    # delivery is created, which fails during an apply rather than before it.
    #
    # Removed: streaming distributions, tenants and connection groups,
    # field-level encryption, realtime logs, the key-value store, alias moves,
    # anycast lists, VPC origins, savings plans and the firewall associations.
    # None appears in a declared resource, a script, or the trail.
    cloudfront_project_surfaces = {
      Sid    = "CloudFrontWhatTheStagingTreeDeclares"
      Effect = "Allow"
      Action = ["cloudfront:CreateDistribution", "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig", "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution", "cloudfront:ListDistributions",
        "cloudfront:CreateInvalidation", "cloudfront:TagResource",
        "cloudfront:UntagResource", "cloudfront:ListTagsForResource",
        "cloudfront:CreateFunction", "cloudfront:DescribeFunction",
        "cloudfront:GetFunction", "cloudfront:UpdateFunction",
        "cloudfront:PublishFunction", "cloudfront:DeleteFunction",
        "cloudfront:ListFunctions", "cloudfront:TestFunction",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:UpdateOriginAccessControl",
        "cloudfront:DeleteOriginAccessControl",
        "cloudfront:ListOriginAccessControls", "cloudfront:CreateCachePolicy",
        "cloudfront:GetCachePolicy", "cloudfront:UpdateCachePolicy",
        "cloudfront:DeleteCachePolicy", "cloudfront:ListCachePolicies",
        "cloudfront:GetOriginRequestPolicy",
        "cloudfront:ListOriginRequestPolicies",
        "cloudfront:CreateResponseHeadersPolicy",
        "cloudfront:GetResponseHeadersPolicy",
        "cloudfront:UpdateResponseHeadersPolicy",
        "cloudfront:DeleteResponseHeadersPolicy",
        "cloudfront:ListResponseHeadersPolicies", "cloudfront:CreateKeyGroup",
        "cloudfront:GetKeyGroup", "cloudfront:UpdateKeyGroup",
        "cloudfront:DeleteKeyGroup", "cloudfront:ListKeyGroups",
        "cloudfront:CreatePublicKey", "cloudfront:GetPublicKey",
        "cloudfront:UpdatePublicKey", "cloudfront:DeletePublicKey",
        "cloudfront:ListPublicKeys", "cloudfront:CreateMonitoringSubscription",
        "cloudfront:GetMonitoringSubscription",
        "cloudfront:DeleteMonitoringSubscription",
      "cloudfront:AllowVendedLogDeliveryForResource"]
      Resource = "*"
    }

    # SES, down to what the staging tree actually declares: two configuration
    # sets, and the account read arming.sh makes to see whether production
    # access has been granted.
    #
    # ses:* is gone, and this is the largest single removal in the policy. Every
    # SES identity in the estate belongs to the production tree, so the wildcard
    # gave a dev-and-tester the verified production identity: mail to any
    # address, from any address at the domain once domain auth lands, passing
    # SPF and signed and aligned, which reaches the membership. It also carried
    # the identity policies that hand an outside account standing authority to
    # send as the domain and survive an offboard, the DKIM signing attributes,
    # and the account-level send switch. A staging send test, if one is ever
    # wanted, is a from-address condition rather than a wildcard.
    ses_staging_configuration = {
      Sid    = "SesConfigurationSetsAndAccountRead"
      Effect = "Allow"
      Action = ["ses:CreateConfigurationSet", "ses:DescribeConfigurationSet",
        "ses:DeleteConfigurationSet", "ses:ListConfigurationSets",
      "ses:GetAccount"]
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
        # Trailing star, because the live device is named footbag-operator-mfa
        # and IAM matches a resource ARN literally. Spelled without it, this
        # half of the denial matched no device at all. It is inert today only
        # because no Allow here reaches an MFA resource; it would have failed
        # silently the day one did.
        "arn:aws:iam::${var.aws_account_id}:mfa/footbag-operator*",
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

    # The role this one is allowed to assume is the one role it must not be able
    # to rewrite. Two statements above grant iam:* over role/footbag-staging-*
    # and sts:AssumeRole on footbag-staging-app-runtime, and that role is inside
    # that name pattern. Attaching AdministratorAccess to it and assuming it is
    # two calls to administrator over the whole account -- staging and
    # production share one account, so the staging name is a convention and not
    # a boundary -- and the holder lands as a principal none of the denials here
    # apply to, because they attach to this role rather than to that one.
    #
    # It leaves nothing behind for an offboard to find: no new user, no access
    # key, and no plan diff, because the staging tree declares inline policies
    # and sets no managed policy list, so an attached managed policy is not a
    # resource Terraform tracks.
    #
    # The cost is real and small. An apply that changes the runtime role's own
    # permissions is refused under this role, so it goes to the directly
    # authenticated identity. On the record that is a handful of occasions
    # across the project's life, each one a feature needing a new capability on
    # the host rather than anything routine. A permissions boundary on every
    # staging principal would keep that self-service, and it is the better
    # answer if this ever bites; it is not the answer today, because it spreads
    # the control across two trees and stops working the day a new staging
    # principal is declared without it.
    never_rewrite_a_role_we_can_assume = {
      Sid       = "NeverRewriteARoleWeCanAssume"
      Effect    = "Deny"
      NotAction = ["iam:Get*", "iam:List*", "iam:Simulate*"]
      Resource  = local.scope.runtime_roles
    }

    # An alias is a label, not a boundary. The key grant above matches on the
    # aliases a key already carries, and alias creation is a call that carries
    # no resource, so a holder could point a staging-shaped alias at a
    # production key and the condition would then match it: sign with the key
    # that signs session tokens, which is authentication bypass for any member
    # or administrator; decrypt every production secret; or schedule both keys
    # for deletion. The comment beside that grant said seizing an existing key
    # was beyond reach because those calls stay behind the alias. The alias was
    # the attacker's to create.
    #
    # Denied by tag rather than by ARN, because the alias call names the alias
    # rather than the key it targets. Stated in the negative, like the host
    # denial below and for the same reason: naming production leaves an untagged
    # key uncovered, while denying everything that is not staging covers
    # production, a later key, and a key carrying no tag at all. Both providers
    # set Environment through default_tags and a key carries its tags from the
    # create call, so the alias that follows is evaluated against a tagged key.
    # Verified against the live account rather than assumed, on all four keys.
    never_graft_an_alias_onto_production = {
      Sid      = "NeverGraftAnAliasOntoProduction"
      Effect   = "Deny"
      Action   = ["kms:CreateAlias", "kms:UpdateAlias", "kms:DeleteAlias"]
      Resource = "*"
      Condition = {
        StringNotEquals = { "aws:ResourceTag/Environment" = "staging" }
      }
    }

    # The production distribution's viewer-request function runs on every page
    # request the public makes. Publishing arbitrary code there needs no host
    # access, no deploy and no Terraform, and shows up only when somebody next
    # applies the production tree, which this role cannot do. Function ARNs
    # carry the function name, so unlike the rest of this service they scope
    # exactly, and staging's own functions are outside the pattern.
    never_rewrite_a_production_edge_function = {
      Sid    = "NeverRewriteAProductionEdgeFunction"
      Effect = "Deny"
      Action = ["cloudfront:UpdateFunction", "cloudfront:PublishFunction",
      "cloudfront:DeleteFunction"]
      Resource = "arn:aws:cloudfront::${var.aws_account_id}:function/footbag-production-*"
    }

    # A budget action applies an IAM policy on its own schedule, under a role it
    # is passed, after the person who created it has gone. The budgets wildcard
    # that made it reachable is removed above; this denial is what stops it
    # coming back through the IAM grant over staging-named roles, which carries
    # PassRole with it.
    never_pass_a_role_to_budgets = {
      Sid      = "NeverPassARoleToBudgets"
      Effect   = "Deny"
      Action   = ["iam:PassRole"]
      Resource = "*"
      Condition = {
        StringEquals = { "iam:PassedToService" = "budgets.amazonaws.com" }
      }
    }

    # This call mints the short-lived certificate that opens a shell on a host,
    # as the default login account, with passwordless sudo. Keeping this role
    # off the PRODUCTION host is what the denial is for, and the control lives
    # in the identity layer rather than in host configuration nobody can see.
    #
    # It used to deny the call outright, for every instance, on the premise that
    # Lightsail supports no resource-level permission. It supports one for this
    # action, and denying every instance had a cost nobody had met yet:
    # install-known-hosts.sh accepts staging as a target and makes exactly this
    # call, because the host-key pin is built from it and from nothing else -- a
    # key learned from the SSH port is the assumption the pin replaces. So a
    # dev-and-tester could not pin the host they are expected to deploy to, and
    # would have found out as an access denial partway through setting up.
    #
    # Keyed on the tag rather than on the instance, and stated in the negative
    # so it fails closed. Lightsail supports tag conditions, both providers set
    # Environment through default_tags, and both instances carry it. Denying
    # everything whose Environment is not staging covers production, covers any
    # instance added later, and covers an instance carrying no tag at all: an
    # absent condition key makes a negated match true, so the denial fires.
    #
    # The alternative was to name the staging instance by ARN, which would have
    # meant a generated id copied into a values file by hand and re-copied after
    # every rebuild. A control that depends on somebody remembering to re-read a
    # value is not a control, and the tag is already maintained by the apply
    # that creates the instance.
    #
    # The other four actions here are the rest of what reaches a live host, and
    # they are denied the same way for the same reason: the narrowed Lightsail
    # grant above still names no resource, so without this it reached the
    # production instance as readily as the staging one -- reopening its
    # firewall, or deleting the host whose database is on local disk. Only
    # instance-scoped actions belong in this list. Creating an instance is left
    # out because the resource does not exist when the call is authorised, and
    # the static IP and key pair actions are left out because they authorise
    # against their own resource types rather than the instance, so naming them
    # here would deny staging's own apply.
    never_reach_a_host_shell = {
      Sid    = "NeverMintHostAccessDetails"
      Effect = "Deny"
      Action = ["lightsail:GetInstanceAccessDetails",
        "lightsail:PutInstancePublicPorts",
        "lightsail:OpenInstancePublicPorts",
        "lightsail:CloseInstancePublicPorts",
      "lightsail:DeleteInstance"]
      Resource = "*"
      Condition = {
        StringNotEquals = { "aws:ResourceTag/Environment" = "staging" }
      }
    }
  }
}

resource "aws_iam_role" "dev_tester" {
  name        = "FootbagDevTester"
  description = "The dev-and-tester operator job: staging, and the reads a deploy makes. Mints a host shell on the staging instance only, may not reach the production host, its keys, its edge functions or its mail identity, may not widen a role it can assume, and may not administer another operator."

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
      local.statements.state_bucket_listing,
      local.statements.project_scoped_services,
      local.statements.project_keys_by_alias,
      local.statements.calls_that_carry_no_resource,
      local.statements.publish_staging_metrics,
      local.statements.lightsail_staging_lifecycle,
      local.statements.cloudfront_project_surfaces,
      local.statements.ses_staging_configuration,
      local.statements.iam_read_everywhere,
      local.statements.iam_write_project,
      local.statements.chain_into_runtime_roles,
      local.statements.resolve_who_acted,
      local.statements.no_self_elevation,
      local.statements.never_touch_super_admin_identity,
      local.statements.never_administer_a_human_operator,
      local.statements.never_touch_this_role,
      local.statements.never_rewrite_a_role_we_can_assume,
      local.statements.never_graft_an_alias_onto_production,
      local.statements.never_rewrite_a_production_edge_function,
      local.statements.never_pass_a_role_to_budgets,
      local.statements.never_reach_a_host_shell,
    ]
  })
}
