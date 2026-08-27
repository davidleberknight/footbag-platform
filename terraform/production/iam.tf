# =============================================================================
# IAM — Runtime role for the application
#
# Lightsail does not support EC2 instance profiles natively. The runtime AWS
# principal is a source-profile IAM user plus an AssumeRole chain to
# `app-runtime`: the source-profile access keys live at
# /root/.aws/credentials on the host (root-owned, 0600) and the app runs
# under AWS_PROFILE=<env>-runtime which resolves via sts:AssumeRole.
# =============================================================================

resource "aws_iam_role" "app_runtime" {
  name = "${local.prefix}-app-runtime"

  # Trusts:
  #   - footbag-production-source-profile (host runtime path; long-lived keys
  #     live on the production Lightsail host at /root/.aws/credentials)
  #   - footbag-operator (operator-workstation chained-AssumeRole path used
  #     by tests/smoke/staging-readiness.test.ts via
  #     AWS_PROFILE=footbag-production-runtime)
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
        # Reading a SecureString parameter needs Decrypt and nothing else. The
        # application never encrypts under this key: it writes no parameters, and
        # ballot envelope encryption uses its own dedicated key rather than this
        # one. GenerateDataKey was granted here and never called, which is a
        # standing grant to produce key material under the key that protects
        # every secret this platform holds.
        Sid      = "DecryptSSMParameters"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
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

# Mirror of the staging media policy. Web Put/Delete writes processed photo and
# video assets plus pending/ presigned-PUT keys (DD §6.8). GetObject reads
# pending source bytes back during transcode finalize. ListBucket lets HEAD on
# missing keys return 404 NoSuchKey rather than 403. CloudFront-OAC remains the
# sole serving read path for finalized media.
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

resource "aws_iam_instance_profile" "app_runtime" {
  name = "${local.prefix}-app-runtime"
  role = aws_iam_role.app_runtime.name
}

# JwtSigning grants here are redundant with the role-direct grant in the JWT
# key policy (aws_kms_key.jwt_signing). Kept for parity with the live IAM
# policy attached during host bootstrap and to keep SES Send authorization
# alongside the JWT signing grants in one statement set.
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
      },
      {
        Sid    = "OutboundEmail"
        Effect = "Allow"
        # Both send calls, because the platform makes both. Transactional mail
        # uses the simple SendEmail call; bulk mail carries the one-click
        # unsubscribe headers, which that call has nowhere to put, so it is
        # assembled as raw MIME and sent with SendRawEmail. SES authorises the
        # two actions separately, so granting only the first fails every bulk
        # send with AccessDenied while transactional mail keeps working -- a
        # split failure that would first appear on the first broadcast.
        Action = ["ses:SendEmail", "ses:SendRawEmail"]
        # Every identity in the account, with the From-address condition below
        # carrying the whole bound. This matches staging, which has always been
        # written this way, and naming the sender identity here instead is a
        # divergence that breaks sending rather than tightening it.
        #
        # Two reasons, and the second is the one that bites today. Which identity
        # object covers the sender address changes when domain authentication is
        # enabled, so a grant naming the address identity silently stops
        # authorising the moment sending moves under the domain identity, at send
        # time rather than at apply time. And while the account is still in the
        # SES sandbox, SES authorises every send against the DESTINATION identity
        # as well as the sender: a resource pinned to the sender can never satisfy
        # that, so each message to a real verified address is refused as
        # unauthorised on the recipient's identity ARN while the simulator
        # addresses succeed. The wildcard does not bypass the sandbox check, which
        # still requires each recipient to be verified; it only lets the role
        # reach identities in this account. Once production access is granted the
        # recipient check disappears and this may be narrowed to the sender.
        Resource = "*"
        # And the address, not only the identity that covers it. While the
        # identity is a single verified address the resource above already
        # bounds this to that address; the moment domain auth is enabled the
        # resource becomes the whole domain and the same grant would authorise
        # sending as any address at it, the officer and board addresses
        # included. That flip is exactly when nobody is looking at this file, so
        # the bound is written here rather than left to follow from which
        # identity object happens to exist.
        #
        # Staging pins the same way; this makes the two trees agree.
        Condition = {
          StringEquals = {
            "ses:FromAddress" = local.ses_from_addresses
          }
        }
      }
    ]
  })
}

# =============================================================================
# Source-profile IAM user.
# Long-lived keys live on the production Lightsail host at
# /root/.aws/credentials (root-owned, 0600); the host SDK uses them as the
# source profile of the AssumeRole chain into app_runtime. Console access
# disabled. Permission is scoped to sts:AssumeRole on app_runtime and the
# logs-publisher role via the inline policy below.
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

# The backup script publishes BackupAgeMinutes and BackupConsecutiveFailures
# under the host's runtime role, in the platform's own metric namespace rather
# than the CWAgent one. Without this grant the put fails with AccessDenied and
# the script swallows it, so the metric is never emitted, the backup alarm can
# never satisfy its documented "confirmed to emit" precondition, and a backup
# pipeline that has stopped looks exactly like one that is healthy. Scoped by
# namespace for the same reason the CWAgent grant is: PutMetricData takes no
# resource ARN, so the namespace condition is the only bound available.
resource "aws_iam_role_policy" "app_backup_metrics" {
  name = "${local.prefix}-app-runtime-backup-metrics"
  role = aws_iam_role.app_runtime.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "BackupMetrics"
      Effect   = "Allow"
      Action   = "cloudwatch:PutMetricData"
      Resource = "*"
      Condition = {
        StringEquals = {
          "cloudwatch:namespace" = "Footbag/production"
        }
      }
    }]
  })
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
# S3 cross-region replication role.
# Used by aws_s3_bucket_replication_configuration.snapshots to replicate
# SQLite snapshot objects from snapshots (us-east-1) to dr (us-west-2).
# Separate from app_runtime: the principal of trust is s3.amazonaws.com,
# not the application.
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
  name = "s3-replication"
  role = aws_iam_role.s3_replication.id

  # Single policy covering both replication pairs:
  #   snapshots (us-east-1) → dr (us-west-2)
  #   media     (us-east-1) → media_dr (us-west-2)
  # AWS S3 replication needs Get* on the source bucket and ReplicateObject
  # on the destination; combining both pairs into one policy keeps the role
  # singular and avoids attaching a second policy by hand.
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
        Resource = [
          aws_s3_bucket.snapshots.arn,
          aws_s3_bucket.media.arn,
        ]
      },
      {
        Sid    = "SourceObjectRead"
        Effect = "Allow"
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ]
        Resource = [
          "${aws_s3_bucket.snapshots.arn}/*",
          "${aws_s3_bucket.media.arn}/*",
        ]
      },
      {
        Sid    = "DestinationObjectWrite"
        Effect = "Allow"
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ]
        Resource = [
          "${aws_s3_bucket.dr.arn}/*",
          "${aws_s3_bucket.media_dr.arn}/*",
        ]
      }
    ]
  })
}

# The worker reads both notification feeds from queues rather than being pushed
# to over HTTPS, so this grant is what authorizes the feed at all: with it the
# poll needs no shared secret in a URL, and without it the feed is silent.
# GetQueueAttributes is what lets the worker report queue depth; receive and
# delete are the poll itself.
resource "aws_iam_role_policy" "app_sqs_feeds" {
  count = var.enable_feed_queues ? 1 : 0
  name  = "sqs-feeds"
  role  = aws_iam_role.app_runtime.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "PollNotificationFeeds"
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ]
      Resource = [
        aws_sqs_queue.ses_feedback_feed[0].arn,
        aws_sqs_queue.alarm_feed[0].arn
      ]
    }]
  })
}
