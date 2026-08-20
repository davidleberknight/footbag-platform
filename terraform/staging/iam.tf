# =============================================================================
# IAM — Runtime role for the application
#
# Lightsail does not support EC2 instance profiles natively. The runtime AWS
# principal is a source-profile IAM user plus an AssumeRole chain into
# `app-runtime`: the source-profile access keys live on the host at
# /root/.aws/credentials (root-owned, 0600) and the app runs under
# AWS_PROFILE=footbag-staging-runtime, which resolves via sts:AssumeRole.
# =============================================================================

resource "aws_iam_role" "app_runtime" {
  name = "${local.prefix}-app-runtime"

  # Trusts:
  #   - footbag-staging-source-profile (host runtime path; long-lived keys
  #     live on the staging Lightsail host at /root/.aws/credentials)
  #   - footbag-operator (operator-workstation chained-AssumeRole path used
  #     by tests/smoke/staging-readiness.test.ts via
  #     AWS_PROFILE=footbag-staging-runtime)
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "TrustHostAndOperator"
      Effect = "Allow"
      Principal = {
        AWS = [
          aws_iam_user.source_profile.arn,
          "arn:aws:iam::${var.aws_account_id}:user/footbag-operator"
        ]
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "app_ssm_read" {
  name = "ssm-read"
  role = aws_iam_role.app_runtime.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadSSMParameters"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter${local.ssm_prefix}/*"
      },
      {
        # The first-admin bootstrap token is single-use: the app deletes it the
        # moment the claim is consumed, so the claim endpoint cannot be reused.
        # Without delete permission the token survives and the endpoint stays open.
        Sid      = "DeleteBootstrapAdminToken"
        Effect   = "Allow"
        Action   = ["ssm:DeleteParameter"]
        Resource = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter${local.ssm_prefix}/app/bootstrap/admin_token"
      },
      {
        Sid    = "DecryptSSMParameters"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.main.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "app_s3_snapshots" {
  name = "s3-snapshots"
  role = aws_iam_role.app_runtime.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "WriteSnapshots"
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ]
      Resource = [
        aws_s3_bucket.snapshots.arn,
        "${aws_s3_bucket.snapshots.arn}/*"
      ]
    }]
  })
}

# Media bucket access for the app: PutObject (avatar upload) + DeleteObject
# (account erasure) + GetObject (required for HeadObject existence check, per
# AWS docs — there is no separate s3:HeadObject action). ListBucket retained
# so HEAD on missing keys returns 404 NoSuchKey rather than 403 AccessDenied
# (better error semantics for callers). Despite the GetObject grant, the app
# does NOT fetch object bytes — the only call site is adapter.exists() via
# HeadObject. CloudFront-OAC remains the sole serving read path; code review
# enforces this (no GetObjectCommand import in src/adapters/photoStorageAdapter.ts).
resource "aws_iam_role_policy" "app_s3_media" {
  name = "s3-media"
  role = aws_iam_role.app_runtime.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadWriteMediaObjects"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.media.arn}/*"
      },
      {
        Sid      = "HeadMediaObjects"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.media.arn
      }
    ]
  })
}

# JwtSigning grants here are redundant with the role-direct grant in the JWT
# key policy (aws_kms_key.jwt_signing). Kept for parity with the live IAM
# policy attached during the runtime AWS identity bring-up (AWS_OPERATIONS.md,
# private GitHub repo).
#
# PARITY DIVERGENCE, DELIBERATE. Production's copy of this policy carries a
# second statement granting ses:SendEmail on the sender identity. Staging
# carries none, because staging never sends: the deploy forces the stub SES
# adapter onto every non-production host and the host-env check fails the host
# if it reads anything else, so the only code path that reaches SendEmail is
# production-only. A grant here would authorise a call this environment cannot
# make, against an identity the production tree owns. The resource name keeps
# its jwt-ses form so the address matches production's; renaming it would
# replace the inline policy for nothing.
resource "aws_iam_role_policy" "app_jwt_ses" {
  name = "${local.prefix}-app-runtime-jwt-ses"
  role = aws_iam_role.app_runtime.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "JwtSigning"
        Effect = "Allow"
        Action = [
          "kms:Sign",
          "kms:GetPublicKey"
        ]
        Resource = aws_kms_key.jwt_signing.arn
      }
    ]
  })
}

resource "aws_iam_instance_profile" "app_runtime" {
  name = "${local.prefix}-app-runtime"
  role = aws_iam_role.app_runtime.name
}

# =============================================================================
# Source-profile IAM user.
# Long-lived keys live on the staging Lightsail host at /root/.aws/credentials
# (root-owned, 0600); the host SDK uses them as the source profile of the
# AssumeRole chain into app_runtime. Console access disabled. Permission is
# scoped to sts:AssumeRole on app_runtime via the inline policy below.
#
# Do not delete-and-recreate this user as a rotation strategy. AWS resolves
# the runtime role's trust principal to this user's internal unique ID at
# trust-policy save time; recreation produces a different unique ID and
# silently breaks AssumeRole. Rotate via "second access key under the same
# user".
# =============================================================================

resource "aws_iam_user" "source_profile" {
  name          = "${local.prefix}-source-profile"
  force_destroy = false
}

resource "aws_iam_user_policy" "source_profile_assume_role" {
  name = "${local.prefix}-source-profile-assume-role"
  user = aws_iam_user.source_profile.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AssumeRuntimeRole"
      Effect = "Allow"
      Action = "sts:AssumeRole"
      Resource = [
        aws_iam_role.app_runtime.arn,
        aws_iam_role.logs_publisher.arn,
      ]
    }]
  })
}

# =============================================================================
# Container-log publisher role (awslogs driver).
# The prod compose overlay routes nginx/web/worker stdout to CloudWatch via the
# awslogs driver, which authenticates with the Docker daemon's own credential
# chain. The daemon assumes this role through a source-profile -> AssumeRole
# chain (the footbag-<env>-logs profile in /root/.aws/config), reusing the
# existing static-key-free pattern. Scoped to writing the three app log groups
# only; app_runtime is intentionally NOT widened, so the daemon never inherits
# the application's SSM/S3/KMS/SES permissions.
# =============================================================================

resource "aws_iam_role" "logs_publisher" {
  name = "${local.prefix}-logs-publisher"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TrustSourceProfile"
      Effect    = "Allow"
      Principal = { AWS = aws_iam_user.source_profile.arn }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "logs_publisher_write" {
  name = "logs-write"
  role = aws_iam_role.logs_publisher.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "ShipContainerLogs"
      Effect = "Allow"
      Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = [
        "${aws_cloudwatch_log_group.app.arn}:*",
        "${aws_cloudwatch_log_group.nginx.arn}:*",
      ]
    }]
  })
}

# =============================================================================
# CWAgent publisher IAM user (long-lived static keys).
# Lightsail does not support EC2 instance profiles, and CWAgent's
# common-config.toml does not honor source_profile chaining: the agent reads
# only the static credentials file, not config-file profile chains. This user
# provides static credentials for CWAgent only, scoped to PutMetricData on
# the CWAgent namespace.
#
# Key creation is out-of-band (aws iam create-access-key) per the source-
# profile pattern; secret stored in the operator vault and dropped into
# /root/.aws/credentials on the host. Rotate via "second access key under
# the same user", never delete-and-recreate.
# =============================================================================

resource "aws_iam_user" "cwagent_publisher" {
  name          = "${local.prefix}-cwagent-publisher"
  force_destroy = false
}

resource "aws_iam_user_policy" "cwagent_publisher_putmetric" {
  name = "${local.prefix}-cwagent-publisher-putmetric"
  user = aws_iam_user.cwagent_publisher.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "CWAgentMetrics"
      Effect   = "Allow"
      Action   = "cloudwatch:PutMetricData"
      Resource = "*"
      Condition = {
        StringEquals = {
          "cloudwatch:namespace" = "CWAgent"
        }
      }
    }]
  })
}

# =============================================================================
# S3 cross-region replication role for the media bucket.
# Separate from app_runtime: the principal of trust is s3.amazonaws.com,
# not the application. Combining would muddy each role's purpose.
# =============================================================================

resource "aws_iam_role" "s3_replication" {
  name = "${local.prefix}-s3-replication"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TrustS3"
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "s3_replication" {
  name = "media-replication"
  role = aws_iam_role.s3_replication.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SourceBucketRead"
        Effect = "Allow"
        Action = [
          "s3:GetReplicationConfiguration",
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.media.arn
      },
      {
        Sid    = "SourceObjectRead"
        Effect = "Allow"
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ]
        Resource = "${aws_s3_bucket.media.arn}/*"
      },
      {
        Sid    = "DestinationObjectWrite"
        Effect = "Allow"
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ]
        Resource = "${aws_s3_bucket.media_dr.arn}/*"
      }
    ]
  })
}
