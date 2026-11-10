# =============================================================================
# CloudTrail — the account's durable audit record.
#
# WHY THIS EXISTS. Two documents already assert it does. The System
# Administrator stories say "All System Administrator AWS actions are logged via
# CloudTrail", and the secrets design says parameter-store reads "are recorded in
# CloudTrail" and that unusual access patterns "are alarmable". Neither was true:
# no trail was declared anywhere, so the account had only the console's 90-day
# event history — not a permanent record, not queryable by a metric filter, and
# not something an alarm can read.
#
# The host assumes its runtime role from a source-profile IAM user key, because
# Lightsail has no instance profile; the trail is the durable record of every
# call made with it.
#
# WHY IN THE PRODUCTION TREE. A multi-region management-events trail is
# account-global, and both environments share one account. The established
# precedent for an account-global resource is that production owns it and staging
# declares none of it — the same arrangement as the SES sender identity, where
# two trees describing one account-global resource meant whichever applied last
# repointed the other's configuration.
#
# COST. The first copy of management events delivered to S3 is free; the residual
# is S3 storage of small compressed files, which at this account's activity is
# cents a month. Delivery to CloudWatch Logs, which the metric filters below
# need, is charged at ingestion — also small here, and it is what turns the trail
# from a record nobody reads into alarms that reach a person.
#
# The log bucket is protected by object versioning, the deny-delete bucket
# policy and CloudTrail's own log-file validation digests. MFA delete is not
# used, because it is incompatible with lifecycle expiry.
# =============================================================================

variable "enable_cloudtrail" {
  description = "Create the account's CloudTrail trail, its hardened log bucket and the CloudWatch Logs delivery the security metric filters read. Flip once, early: a trail records nothing retroactively, so every day it is off is a day with no durable record of who did what in this account."
  type        = bool
  default     = false
}

variable "cloudtrail_retention_days" {
  description = "Days to retain CloudTrail log objects in S3 before expiry. One year covers an incident investigation opened well after the fact without accruing storage indefinitely."
  type        = number
  default     = 365

  validation {
    condition     = var.cloudtrail_retention_days >= 90
    error_message = "cloudtrail_retention_days must be at least 90: below that the trail retains less than the console's own free event history, which would make the trail pointless."
  }
}

# ── Log bucket ───────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = "${local.prefix}-cloudtrail"

  # Audit evidence cannot be regenerated. Per the lifecycle convention, a bucket
  # holding data that cannot be recreated carries prevent_destroy: the record of
  # what happened in this account is exactly that.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  count                   = var.enable_cloudtrail ? 1 : 0
  bucket                  = aws_s3_bucket.cloudtrail[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  rule {
    id     = "expire-trail-objects"
    status = "Enabled"
    filter {}
    expiration {
      days = var.cloudtrail_retention_days
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# The bucket policy CloudTrail requires, with the source-ARN condition so only
# this account's own trail may write here. Without that condition the policy
# would admit any CloudTrail in any account that happened to know the bucket
# name.
data "aws_iam_policy_document" "cloudtrail_bucket" {
  count = var.enable_cloudtrail ? 1 : 0

  statement {
    sid    = "AWSCloudTrailAclCheck"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.cloudtrail[0].arn]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudtrail:${var.aws_region}:${var.aws_account_id}:trail/${local.prefix}-trail"]
    }
  }

  statement {
    sid    = "AWSCloudTrailWrite"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.cloudtrail[0].arn}/AWSLogs/${var.aws_account_id}/*"]
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudtrail:${var.aws_region}:${var.aws_account_id}:trail/${local.prefix}-trail"]
    }
  }

  # Tamper resistance without MFA delete: nobody, including the operator's own
  # role, deletes trail objects or versions through the data path; lifecycle
  # expiry above is the only sanctioned way objects leave.
  statement {
    sid    = "DenyObjectDeletion"
    effect = "Deny"
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    actions = ["s3:DeleteObject", "s3:DeleteObjectVersion"]
    resources = [
      "${aws_s3_bucket.cloudtrail[0].arn}/*",
    ]
  }

  # Plaintext is refused here as on every other bucket. CloudTrail delivers over
  # HTTPS, so nothing legitimate is denied; what this closes is the gap between
  # happening to use TLS and requiring it.
  statement {
    sid    = "DenyPlaintextAccess"
    effect = "Deny"
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.cloudtrail[0].arn,
      "${aws_s3_bucket.cloudtrail[0].arn}/*",
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id
  policy = data.aws_iam_policy_document.cloudtrail_bucket[0].json
}

# ── CloudWatch Logs delivery ─────────────────────────────────────────────────
#
# S3 holds the durable record; CloudWatch Logs is what a metric filter can read.
# Without this half the trail exists and nothing watches it, which is the state
# the design decisions already describe as insufficient.

resource "aws_cloudwatch_log_group" "cloudtrail" {
  count             = var.enable_cloudtrail ? 1 : 0
  name              = "/footbag/${var.environment}/cloudtrail"
  retention_in_days = 90
}

resource "aws_iam_role" "cloudtrail_logs" {
  count = var.enable_cloudtrail ? 1 : 0
  name  = "${local.prefix}-cloudtrail-logs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "cloudtrail_logs" {
  count = var.enable_cloudtrail ? 1 : 0
  name  = "deliver-to-logs"
  role  = aws_iam_role.cloudtrail_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.cloudtrail[0].arn}:*"
    }]
  })
}

# ── The trail ────────────────────────────────────────────────────────────────

resource "aws_cloudtrail" "main" {
  count          = var.enable_cloudtrail ? 1 : 0
  name           = "${local.prefix}-trail"
  s3_bucket_name = aws_s3_bucket.cloudtrail[0].id

  # Multi-region so global-service events land too: IAM, CloudFront and Route 53
  # are recorded in us-east-1 regardless of where the rest of the account runs,
  # and those are precisely the actions worth having a record of.
  is_multi_region_trail = true

  include_global_service_events = true

  # No event_selector block, so the trail records read and write management
  # events and no data events. Per-object S3 events would be charged per event
  # and dominated by the five-minute backup uploads, and a second log nothing
  # queries adds cost without detection: GuardDuty's S3 protection reads those
  # events itself and raises a finding on an anomalous read, write or delete.

  # Digest files signed by AWS, so log-file integrity can be validated.
  enable_log_file_validation = true

  cloud_watch_logs_group_arn = "${aws_cloudwatch_log_group.cloudtrail[0].arn}:*"
  cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail_logs[0].arn

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}

# ── Security metric filters and alarms ───────────────────────────────────────
#
# These are the alarms the design decisions already promise and Terraform did
# not carry. Each reads the trail's CloudWatch Logs stream, so all of them are
# gated on the trail existing: an alarm on a metric nothing publishes sits in
# INSUFFICIENT_DATA forever, which is the failure the whole gate convention
# exists to prevent.

# Root credential use. The account root should be used for nothing in normal
# operation, so any use of it raises an alarm.
resource "aws_cloudwatch_log_metric_filter" "root_account_used" {
  count          = var.enable_cloudtrail ? 1 : 0
  name           = "${local.prefix}-root-account-used"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  pattern        = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}/Audit"
    name          = "RootAccountUsed"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "root_account_used" {
  count               = var.enable_cloudtrail ? 1 : 0
  alarm_name          = "${local.prefix}-root-account-used"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "RootAccountUsed"
  namespace           = "Footbag/${var.environment}/Audit"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "The AWS account root credential was used. Expected to be zero in normal operation; investigate unless this was a deliberate operator action."
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# Host access details minted. GetInstanceAccessDetails issues a short-lived
# certificate for the host's default account, which carries passwordless sudo.
# The same call is also the only authenticated source of a host's SSH host
# keys. Every call, allowed or denied, is listed and attributed by
# scripts/list-host-access-mints.sh, from the application id each minting
# script carries in its user agent; any call it cannot attribute is
# investigated. The trail is multi-region and records
# management events, so this one filter counts calls against both hosts.
resource "aws_cloudwatch_log_metric_filter" "break_glass_host_access" {
  count          = var.enable_cloudtrail ? 1 : 0
  name           = "${local.prefix}-break-glass-host-access"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  pattern        = "{ ($.eventSource = \"lightsail.amazonaws.com\") && ($.eventName = \"GetInstanceAccessDetails\") }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}/Audit"
    name          = "BreakGlassHostAccess"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "break_glass_host_access" {
  count               = var.enable_cloudtrail ? 1 : 0
  alarm_name          = "${local.prefix}-break-glass-host-access"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BreakGlassHostAccess"
  namespace           = "Footbag/${var.environment}/Audit"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "Lightsail access details were minted for a host (staging or production): a short-lived certificate for the default account, which has passwordless sudo. Every call, allowed or denied, is listed and attributed by scripts/list-host-access-mints.sh; investigate any call it cannot attribute."
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# Denied calls to the parameter store. The design says unusual parameter-store
# access is alarmable, and a burst of AccessDenied is the shape that matters.
#
# The wildcard covers both codes the parameter store actually returns for an IAM
# refusal, AccessDenied and AccessDeniedException. UnauthorizedOperation is an
# EC2-family code this service never returns, so matching it added nothing and
# suggested a coverage the filter did not have.
resource "aws_cloudwatch_log_metric_filter" "ssm_access_denied" {
  count          = var.enable_cloudtrail ? 1 : 0
  name           = "${local.prefix}-ssm-access-denied"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  pattern        = "{ ($.eventSource = \"ssm.amazonaws.com\") && ($.errorCode = \"AccessDenied*\") }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}/Audit"
    name          = "ParameterStoreAccessDenied"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "ssm_access_denied" {
  count               = var.enable_cloudtrail ? 1 : 0
  alarm_name          = "${local.prefix}-ssm-access-denied"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ParameterStoreAccessDenied"
  namespace           = "Footbag/${var.environment}/Audit"
  period              = 300
  statistic           = "Sum"
  # A handful can be ordinary (a script reaching for a parameter that does not
  # exist yet), so the alarm fires only above five.
  threshold          = 5
  treat_missing_data = "notBreaching"
  alarm_description  = "More than five denied Parameter Store calls in five minutes; investigate the caller."
  alarm_actions      = [aws_sns_topic.alarms.arn]
  ok_actions         = [aws_sns_topic.alarms.arn]
}

# Denied or failed KMS calls. The design commits to KMS error alarming, and this
# is the reachable form of it: KMS publishes no per-key error metric of its own,
# so the trail is where an error rate becomes visible. Session signing runs
# through KMS on the login path, so a sustained failure here is an outage of
# authentication rather than a background curiosity.
resource "aws_cloudwatch_log_metric_filter" "kms_errors" {
  count          = var.enable_cloudtrail ? 1 : 0
  name           = "${local.prefix}-kms-errors"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  # A wildcard match on the field, not a bare EXISTS: CloudWatch Logs filter
  # syntax has NOT EXISTS but no positive EXISTS, and rejects the pattern
  # outright rather than matching nothing. `= "*"` is how the same question is
  # asked, and it matches a KMS call carrying any errorCode while ignoring both
  # a clean KMS call and another service's error.
  pattern = "{ ($.eventSource = \"kms.amazonaws.com\") && ($.errorCode = \"*\") }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}/Audit"
    name          = "KmsCallErrors"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "kms_errors" {
  count               = var.enable_cloudtrail ? 1 : 0
  alarm_name          = "${local.prefix}-kms-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "KmsCallErrors"
  namespace           = "Footbag/${var.environment}/Audit"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_description   = "More than five failed KMS calls in five minutes. Session signing runs through KMS, so a sustained failure is a login outage; a disabled or deleted key looks like this."
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# Console sign-in failures against the AWS account itself, as distinct from
# failures on the application's own sign-in form.
resource "aws_cloudwatch_log_metric_filter" "console_auth_failure" {
  count          = var.enable_cloudtrail ? 1 : 0
  name           = "${local.prefix}-console-auth-failure"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  pattern        = "{ ($.eventName = \"ConsoleLogin\") && ($.errorMessage = \"Failed authentication\") }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}/Audit"
    name          = "ConsoleAuthFailures"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "console_auth_failure" {
  count               = var.enable_cloudtrail ? 1 : 0
  alarm_name          = "${local.prefix}-console-auth-failure"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ConsoleAuthFailures"
  namespace           = "Footbag/${var.environment}/Audit"
  period              = 300
  statistic           = "Sum"
  threshold           = 3
  treat_missing_data  = "notBreaching"
  alarm_description   = "More than three failed console sign-ins in five minutes against this AWS account."
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# ── Watching the watcher ─────────────────────────────────────────────────────
#
# Changes to the trail, its bucket, its log group and the alarm path each raise
# an alarm on the first matching call, denied attempts included, and the email
# reaches a mailbox outside AWS. Matching denied attempts is what lets a denied
# call from a staging principal prove each alarm. All of them are threshold zero
# and share one shape, so they are declared from one map.
#
# The backup buckets are watched the same way, the legacy-mirror backup among
# them once its gate is on. A mistaken lifecycle rule, policy, ACL, encryption,
# versioning change or replication change, or a bucket deletion, on a
# disaster-recovery bucket or on the bucket it copies could quietly empty the
# backup or stop it filling,
# and nothing else would say so until a restore found it missing. Each of those
# is a management event the multi-region trail already records, in us-west-2 as
# in us-east-1, so one filter over this log group sees every one. The names are
# CloudTrail's event names, which differ from some API names:
# PutBucketLifecycleConfiguration is recorded as PutBucketLifecycle,
# PutObjectLockConfiguration as PutBucketObjectLockConfiguration, and
# DeletePublicAccessBlock as DeleteBucketPublicAccessBlock. A filter pattern is
# held to 1024 characters, which the metric filter's precondition checks.
locals {
  backup_protection_buckets = concat(
    [
      aws_s3_bucket.snapshots.bucket,
      aws_s3_bucket.dr.bucket,
      aws_s3_bucket.media.bucket,
      aws_s3_bucket.media_dr.bucket,
    ],
    var.enable_archive ? [aws_s3_bucket.archive[0].bucket, aws_s3_bucket.archive_dr[0].bucket] : [],
    var.enable_legacy_mirror_backup ? [aws_s3_bucket.legacy_mirror_backup[0].bucket] : [],
  )
  # Two lists, two alarms of one shape: every bucket against every event in one
  # pattern renders past the 1024-character limit.
  # What keeps a backup's copies: retention and replication.
  backup_protection_events = [
    "PutBucketLifecycle",
    "DeleteBucketLifecycle",
    "PutBucketVersioning",
    "PutBucketObjectLockConfiguration",
    "PutBucketReplication",
    "DeleteBucketReplication",
  ]
  # Who may reach a backup and whether it exists: policy, ACL, public access
  # block, encryption and the bucket itself.
  backup_access_events = [
    "PutBucketPolicy",
    "DeleteBucketPolicy",
    "PutBucketAcl",
    "PutBucketPublicAccessBlock",
    "DeleteBucketPublicAccessBlock",
    "PutBucketEncryption",
    "DeleteBucket",
  ]
}

locals {
  audit_alarms = {
    audit-trail-tampered = {
      metric = "AuditTrailTampered"
      pattern = join("", [
        "{ ($.eventSource = \"cloudtrail.amazonaws.com\" && ($.eventName = \"CreateTrail\" || $.eventName = \"UpdateTrail\" || $.eventName = \"DeleteTrail\" || $.eventName = \"StopLogging\" || $.eventName = \"PutEventSelectors\"))",
        " || ($.eventSource = \"s3.amazonaws.com\" && $.requestParameters.bucketName = \"${local.prefix}-cloudtrail\" && ($.eventName = \"PutBucketPolicy\" || $.eventName = \"DeleteBucketPolicy\" || $.eventName = \"PutBucketLifecycle\" || $.eventName = \"DeleteBucketLifecycle\" || $.eventName = \"PutBucketVersioning\"))",
        " || ($.eventSource = \"logs.amazonaws.com\" && $.requestParameters.logGroupName = \"/footbag/${var.environment}/cloudtrail\" && ($.eventName = \"DeleteLogGroup\" || $.eventName = \"PutRetentionPolicy\" || $.eventName = \"DeleteMetricFilter\")) }",
      ])
      description = "The audit trail, its bucket or its log group was changed or a change was attempted: a trail created, updated, deleted or stopped, its event selectors replaced, the bucket's policy, lifecycle or versioning changed, or the log group deleted, its retention changed or a metric filter removed. Expected only during a deliberate Terraform apply of the trail."
    }
    alerting-disabled = {
      metric      = "AlertingDisabled"
      pattern     = "{ ($.eventSource = \"monitoring.amazonaws.com\" && ($.eventName = \"DeleteAlarms\" || $.eventName = \"DisableAlarmActions\")) || ($.eventSource = \"sns.amazonaws.com\" && ($.eventName = \"DeleteTopic\" || $.eventName = \"Unsubscribe\")) || ($.eventSource = \"guardduty.amazonaws.com\" && ($.eventName = \"DeleteDetector\" || $.eventName = \"UpdateDetector\")) || ($.eventSource = \"access-analyzer.amazonaws.com\" && $.eventName = \"DeleteAnalyzer\") }"
      description = "The alarm path was changed or a change was attempted: alarms deleted or their actions disabled, a topic deleted or unsubscribed, the GuardDuty detector deleted or updated, or an Access Analyzer deleted in either region. Expected only during a deliberate Terraform apply that replaces an alarm or topic."
    }
    backup-protection-changed = {
      metric      = "BackupProtectionChanged"
      pattern     = "{ $.eventSource = \"s3.amazonaws.com\" && (${join(" || ", [for b in local.backup_protection_buckets : "$.requestParameters.bucketName = \"${b}\""])}) && (${join(" || ", [for e in local.backup_protection_events : "$.eventName = \"${e}\""])}) }"
      description = "The lifecycle, versioning, object lock or replication of a backup bucket or the bucket it copies was changed, or a change was attempted. A mistaken change there could quietly empty a backup or stop it filling. Expected only during a deliberate Terraform apply of those buckets."
    }
    backup-access-changed = {
      metric      = "BackupAccessChanged"
      pattern     = "{ $.eventSource = \"s3.amazonaws.com\" && (${join(" || ", [for b in local.backup_protection_buckets : "$.requestParameters.bucketName = \"${b}\""])}) && (${join(" || ", [for e in local.backup_access_events : "$.eventName = \"${e}\""])}) }"
      description = "The policy, ACL, public access block or encryption of a backup bucket or the bucket it copies was changed, or the bucket deleted, or one of those was attempted. A mistaken change there could expose a backup, lock its owner out of it or remove it. Expected only during a deliberate Terraform apply of those buckets."
    }
    iam-write = {
      metric      = "IamWrite"
      pattern     = "{ $.eventSource = \"iam.amazonaws.com\" && $.readOnly IS FALSE }"
      description = "An IAM write call was made or attempted in this AWS account. Every staging or production Terraform apply that changes a role or policy fires this; match each firing to an apply, as host-access mints are matched to their scripts."
    }
    kms-key-disabled = {
      metric      = "KmsKeyDisabled"
      pattern     = "{ $.eventSource = \"kms.amazonaws.com\" && ($.eventName = \"DisableKey\" || $.eventName = \"ScheduleKeyDeletion\" || $.eventName = \"PutKeyPolicy\") }"
      description = "A KMS key was disabled, scheduled for deletion or had its key policy replaced, or one of those was attempted. Session signing runs through KMS, so a disabled signing key is a login outage once it takes effect."
    }
    console-login-without-mfa = {
      metric      = "ConsoleLoginWithoutMfa"
      pattern     = "{ ($.eventName = \"ConsoleLogin\") && ($.additionalEventData.MFAUsed != \"Yes\") && ($.userIdentity.type = \"IAMUser\") && ($.responseElements.ConsoleLogin = \"Success\") }"
      description = "An IAM user signed in to the AWS console without MFA. Every console user is expected to have MFA; investigate the user and enforce it."
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "audit" {
  for_each       = var.enable_cloudtrail ? local.audit_alarms : {}
  name           = "${local.prefix}-${each.key}"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  pattern        = each.value.pattern
  metric_transformation {
    namespace     = "Footbag/${var.environment}/Audit"
    name          = each.value.metric
    value         = "1"
    default_value = "0"
  }

  lifecycle {
    precondition {
      condition     = length(each.value.pattern) <= 1024
      error_message = "The ${each.key} filter pattern is longer than the 1024 characters CloudWatch Logs accepts; split it into two alarms."
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "audit" {
  for_each            = var.enable_cloudtrail ? local.audit_alarms : {}
  alarm_name          = "${local.prefix}-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = each.value.metric
  namespace           = "Footbag/${var.environment}/Audit"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = each.value.description
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# ── Host keys used from their own host only ──────────────────────────────────
#
# Each host holds two long-lived IAM user keys: the source profile its runtime
# role is assumed from, and the CloudWatch agent's publisher. Both are used from
# that host's static address and nowhere else, so a call signed by either from
# any other address raises an alarm. Calls AWS services make on the user's
# behalf carry the service rather than an address and are excluded. Declared
# here, beside the trail, for both hosts: the trail is account-wide, so a call
# by a staging key is recorded in this log group too.

variable "enable_host_key_alarm" {
  description = <<-EOT
    Set to true only once the trail's history shows every call by each host key
    coming from that host's static IPv4 address: scripts/set-terraform-gate.sh
    reads the last week of CloudTrail events for each user and refuses to flip
    this while any came from elsewhere, because an address the host really uses
    but this filter does not expect would hold the alarm in ALARM. Requires
    enable_cloudtrail and a real staging_web_static_ip.
  EOT
  type        = bool
  default     = false
}

variable "staging_web_static_ip" {
  description = "The staging web host's static IPv4 address (the staging tree's lightsail_static_ip output). This tree watches the staging host's keys as well as its own, and cannot read the staging tree's state. Required when enable_host_key_alarm is true."
  type        = string
  default     = ""

  validation {
    condition     = var.staging_web_static_ip == "" || can(regex("^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$", var.staging_web_static_ip))
    error_message = "staging_web_static_ip must be empty or an IPv4 address; the terraform.tfvars.example placeholder (TODO-...) is rejected."
  }
}

locals {
  host_keys = {
    production-source-profile = {
      user = aws_iam_user.source_profile.name
      ip   = aws_lightsail_static_ip.web.ip_address
    }
    production-cwagent-publisher = {
      user = aws_iam_user.cwagent_publisher.name
      ip   = aws_lightsail_static_ip.web.ip_address
    }
    staging-source-profile = {
      user = "footbag-staging-source-profile"
      ip   = var.staging_web_static_ip
    }
    staging-cwagent-publisher = {
      user = "footbag-staging-cwagent-publisher"
      ip   = var.staging_web_static_ip
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "host_key_off_host" {
  for_each       = var.enable_cloudtrail && var.enable_host_key_alarm ? local.host_keys : {}
  name           = "${local.prefix}-host-key-off-host-${each.key}"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  pattern        = "{ ($.userIdentity.type = \"IAMUser\") && ($.userIdentity.userName = \"${each.value.user}\") && ($.userIdentity.invokedBy NOT EXISTS) && ($.sourceIPAddress != \"${each.value.ip}\") }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}/Audit"
    name          = "HostKeyOffHost-${each.key}"
    value         = "1"
    default_value = "0"
  }

  lifecycle {
    precondition {
      condition     = each.value.ip != ""
      error_message = "enable_host_key_alarm needs staging_web_static_ip set to the staging host's static address."
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "host_key_off_host" {
  for_each                  = var.enable_cloudtrail && var.enable_host_key_alarm ? local.host_keys : {}
  alarm_name                = "${local.prefix}-host-key-off-host-${each.key}"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = 1
  metric_name               = "HostKeyOffHost-${each.key}"
  namespace                 = "Footbag/${var.environment}/Audit"
  period                    = 300
  statistic                 = "Sum"
  threshold                 = 0
  treat_missing_data        = "notBreaching"
  alarm_description         = "The ${each.value.user} key signed a call from an address other than its host's (${each.value.ip}); it is used from that host only. Find the call in the trail and follow the first-checks row for this alarm."
  alarm_actions             = local.critical_alarm_actions
  ok_actions                = local.critical_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions
}
