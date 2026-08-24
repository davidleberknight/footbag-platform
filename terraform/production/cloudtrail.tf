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
# The gap matters most for the one credential this design concedes: the host
# holds a long-lived IAM user key as the source profile for its assumed role,
# because Lightsail has no instance profile. If that key leaks, this trail is the
# only thing that says what was done with it. Without a trail, after ninety days
# the answer is nothing at all.
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
# MFA delete on the log bucket is declined deliberately: it is incompatible with
# lifecycle rules and impractical for a single maintainer. Object versioning plus
# the deny-delete bucket policy carry the tamper-resistance instead, alongside
# CloudTrail's own log-file validation digests.
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
  # role, deletes trail objects or versions through the data path. Removing the
  # record of an action is the first thing an attacker with credentials would
  # try, and lifecycle expiry above is the only sanctioned way objects leave.
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

  # Management events only. Data events (per-object S3, per-function Lambda) are
  # charged per event and would be dominated by the five-minute backup uploads,
  # which the backup metrics already cover from the other direction.
  include_global_service_events = true

  # Digest files signed by AWS, so deletion or modification of a log file is
  # detectable rather than merely unlikely.
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
# operation, so any use of it is either the operator doing something deliberate
# and rare, or somebody else.
resource "aws_cloudwatch_log_metric_filter" "root_account_used" {
  count          = var.enable_cloudtrail ? 1 : 0
  name           = "${local.prefix}-root-account-used"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  pattern        = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}"
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
  namespace           = "Footbag/${var.environment}"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "The AWS account root credential was used. Expected to be zero in normal operation; investigate unless this was a deliberate operator action."
  alarm_actions       = [aws_sns_topic.alarms.arn]
}

# Denied calls to the parameter store. The design says unusual parameter-store
# access is alarmable; a burst of AccessDenied is the shape that matters, because
# it is what credential probing looks like from the inside.
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
    namespace     = "Footbag/${var.environment}"
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
  namespace           = "Footbag/${var.environment}"
  period              = 300
  statistic           = "Sum"
  # A handful can be ordinary (a script reaching for a parameter that does not
  # exist yet). A run of them is something reading for what it cannot have.
  threshold          = 5
  treat_missing_data = "notBreaching"
  alarm_description  = "More than five denied parameter-store calls in five minutes. Either a misconfigured caller or something enumerating secrets it cannot read."
  alarm_actions      = [aws_sns_topic.alarms.arn]
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
    namespace     = "Footbag/${var.environment}"
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
  namespace           = "Footbag/${var.environment}"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_description   = "More than five failed KMS calls in five minutes. Session signing runs through KMS, so a sustained failure is a login outage; a disabled or deleted key looks like this."
  alarm_actions       = [aws_sns_topic.alarms.arn]
}

# Console sign-in failures. Cheap to watch and the clearest signal that someone
# is trying credentials against the account itself rather than the application.
resource "aws_cloudwatch_log_metric_filter" "console_auth_failure" {
  count          = var.enable_cloudtrail ? 1 : 0
  name           = "${local.prefix}-console-auth-failure"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  pattern        = "{ ($.eventName = \"ConsoleLogin\") && ($.errorMessage = \"Failed authentication\") }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}"
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
  namespace           = "Footbag/${var.environment}"
  period              = 300
  statistic           = "Sum"
  threshold           = 3
  treat_missing_data  = "notBreaching"
  alarm_description   = "More than three failed console sign-ins in five minutes against this AWS account."
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
