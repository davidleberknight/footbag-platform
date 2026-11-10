# =============================================================================
# SNS — Alarm notification topic
# CloudWatch alarms publish here; operators subscribe via email.
# =============================================================================

resource "aws_sns_topic" "alarms" {
  name = "${local.prefix}-alarms"

  # Encrypted to match production; the monitoring service is granted use of the
  # key in kms.tf.
  kms_master_key_id = aws_kms_key.main.arn
}

# Mirrors production. See the mail feedback topic's policy for why the owner
# statement is restated rather than inherited.
resource "aws_sns_topic_policy" "alarms" {
  arn = aws_sns_topic.alarms.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "OwnerFullAccess"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.aws_account_id}:root" }
        # Enumerated rather than a wildcard: SNS validates every action in a
        # topic policy against its own list and rejects `SNS:*` outright with
        # "Policy statement action out of service scope", so a wildcard here
        # fails the apply rather than granting broadly. This is the same set the
        # default topic policy grants the owner, which is what this statement
        # restores after attaching a policy replaces that default.
        Action   = local.sns_owner_actions
        Resource = aws_sns_topic.alarms.arn
      },
      {
        Sid       = "AllowCloudWatchPublish"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alarms.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = var.aws_account_id
          }
        }
      },
      {
        # EventBridge, for AWS Health events. See the production twin for why
        # this is worth wiring on a Basic-support account: the Health API is
        # unavailable and no support case can be opened, but EventBridge
        # delivery of Health events is included at no cost.
        Sid       = "AllowEventBridgePublish"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alarms.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = var.aws_account_id
          }
        }
      }
    ]
  })
}

# ── AWS Health events ────────────────────────────────────────────────────────
# Mirrors production, which carries the reasoning. Two rules: the primary one in
# us-east-1, the only region that receives global-service events, and a second
# in us-west-2, the backup region AWS also delivers every us-east-1 event to, on
# its own topic so the alert still reaches a person while us-east-1 is impaired.

resource "aws_cloudwatch_event_rule" "aws_health" {
  name        = "${local.prefix}-aws-health"
  description = "AWS Health events for this account, delivered to the alarm topic"

  event_pattern = jsonencode({
    source = ["aws.health"]
  })
}

resource "aws_cloudwatch_event_target" "aws_health_to_alarms" {
  rule      = aws_cloudwatch_event_rule.aws_health.name
  target_id = "alarms-topic"
  arn       = aws_sns_topic.alarms.arn
}

resource "aws_sns_topic" "alarms_us_west_2" {
  provider = aws.us_west_2
  name     = "${local.prefix}-alarms-usw2"
}

resource "aws_sns_topic_policy" "alarms_us_west_2" {
  provider = aws.us_west_2
  arn      = aws_sns_topic.alarms_us_west_2.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "OwnerFullAccess"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.aws_account_id}:root" }
        Action    = local.sns_owner_actions
        Resource  = aws_sns_topic.alarms_us_west_2.arn
      },
      {
        # The alarm on a metric AWS publishes only in this region (the
        # replication backlog) notifies through this topic, and a topic policy
        # grants no service anything by default.
        Sid       = "AllowCloudWatchPublish"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alarms_us_west_2.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = var.aws_account_id
          }
        }
      },
      {
        Sid       = "AllowEventBridgePublish"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alarms_us_west_2.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = var.aws_account_id
          }
        }
      }
    ]
  })
}

resource "aws_cloudwatch_event_rule" "aws_health_us_west_2" {
  provider    = aws.us_west_2
  name        = "${local.prefix}-aws-health-usw2"
  description = "AWS Health events delivered to the backup region, emailed from there"

  event_pattern = jsonencode({
    source = ["aws.health"]
  })
}

resource "aws_cloudwatch_event_target" "aws_health_us_west_2_to_alarms" {
  provider  = aws.us_west_2
  rule      = aws_cloudwatch_event_rule.aws_health_us_west_2.name
  target_id = "alarms-usw2-topic"
  arn       = aws_sns_topic.alarms_us_west_2.arn
}

resource "aws_sns_topic_subscription" "alarm_email_us_west_2" {
  provider  = aws.us_west_2
  topic_arn = aws_sns_topic.alarms_us_west_2.arn
  protocol  = "email"
  endpoint  = var.alarm_email

  lifecycle {
    replace_triggered_by = [terraform_data.alarm_email_generation]
  }
}

resource "aws_sns_topic_subscription" "alarm_ops_alert_us_west_2" {
  count     = var.ops_alert_email != "" ? 1 : 0
  provider  = aws.us_west_2
  topic_arn = aws_sns_topic.alarms_us_west_2.arn
  protocol  = "email"
  endpoint  = var.ops_alert_email

  lifecycle {
    replace_triggered_by = [terraform_data.alarm_email_generation]
  }
}

# ── Account detector and analyzer findings ───────────────────────────────────
# The GuardDuty detector and the Access Analyzer are account properties declared
# in the shared tree, which holds no notification path; these rules are what
# make their findings reach a person. Both environments receive every
# account-wide finding, and staging's copy is applied first, so a sample finding
# or a deliberately public staging resource proves the route before production
# carries it. GuardDuty findings of severity 7 or more only; every active Access
# Analyzer finding. Neither rule is gated: a rule matching nothing costs nothing.

resource "aws_cloudwatch_event_rule" "guardduty_findings" {
  name        = "${local.prefix}-guardduty-findings"
  description = "High and critical GuardDuty findings, delivered to the alarm topic"

  event_pattern = jsonencode({
    source        = ["aws.guardduty"]
    "detail-type" = ["GuardDuty Finding"]
    detail        = { severity = [{ numeric = [">=", 7] }] }
  })
}

resource "aws_cloudwatch_event_target" "guardduty_findings_to_alarms" {
  rule      = aws_cloudwatch_event_rule.guardduty_findings.name
  target_id = "alarms-topic"
  arn       = aws_sns_topic.alarms.arn
}

resource "aws_cloudwatch_event_rule" "access_analyzer_findings" {
  name        = "${local.prefix}-access-analyzer-findings"
  description = "Active Access Analyzer findings, delivered to the alarm topic"

  event_pattern = jsonencode({
    source        = ["aws.access-analyzer"]
    "detail-type" = ["Access Analyzer Finding"]
    detail        = { status = ["ACTIVE"] }
  })
}

resource "aws_cloudwatch_event_target" "access_analyzer_findings_to_alarms" {
  rule      = aws_cloudwatch_event_rule.access_analyzer_findings.name
  target_id = "alarms-topic"
  arn       = aws_sns_topic.alarms.arn
}

# The backup region's analyzer publishes its findings to that region's event
# bus only, so its rule sits there and delivers to that region's topic.
resource "aws_cloudwatch_event_rule" "access_analyzer_findings_us_west_2" {
  provider    = aws.us_west_2
  name        = "${local.prefix}-access-analyzer-findings-usw2"
  description = "Active Access Analyzer findings in the backup region, delivered to its alarm topic"

  event_pattern = jsonencode({
    source        = ["aws.access-analyzer"]
    "detail-type" = ["Access Analyzer Finding"]
    detail        = { status = ["ACTIVE"] }
  })
}

resource "aws_cloudwatch_event_target" "access_analyzer_findings_us_west_2_to_alarms" {
  provider  = aws.us_west_2
  rule      = aws_cloudwatch_event_rule.access_analyzer_findings_us_west_2.name
  target_id = "alarms-usw2-topic"
  arn       = aws_sns_topic.alarms_us_west_2.arn
}

resource "aws_sns_topic_subscription" "alarm_email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email

  lifecycle {
    replace_triggered_by = [terraform_data.alarm_email_generation]
  }
}

# Holds alarm_email_subscription_generation, so raising it recreates every alarm
# email subscription and a fresh confirmation can be made through the API.
resource "terraform_data" "alarm_email_generation" {
  input = var.alarm_email_subscription_generation
}

# ── Critical alarms ──────────────────────────────────────────────────────────
# Mirrors production, which carries the reasoning: the main topic and the admin
# console receive every alarm; the watch group receives only the alarms that
# need someone to act now, which publish here as well.
resource "aws_sns_topic" "alarms_critical" {
  name              = "${local.prefix}-alarms-critical"
  kms_master_key_id = aws_kms_key.main.arn
}

resource "aws_sns_topic_policy" "alarms_critical" {
  arn = aws_sns_topic.alarms_critical.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "OwnerFullAccess"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.aws_account_id}:root" }
        Action    = local.sns_owner_actions
        Resource  = aws_sns_topic.alarms_critical.arn
      },
      {
        Sid       = "AllowCloudWatchPublish"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alarms_critical.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = var.aws_account_id
          }
        }
      }
    ]
  })
}

locals {
  warning_alarm_actions  = [aws_sns_topic.alarms.arn]
  critical_alarm_actions = [aws_sns_topic.alarms.arn, aws_sns_topic.alarms_critical.arn]
}

# A second destination, beside the account's own mailbox rather than instead of
# it: a group whose members are everyone on the watch, subscribed to the
# critical alarms. The account mailbox stays the one destination that does not
# depend on this domain's own mail, and receives every alarm.
resource "aws_sns_topic_subscription" "alarm_ops_alert" {
  count     = var.ops_alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alarms_critical.arn
  protocol  = "email"
  endpoint  = var.ops_alert_email

  lifecycle {
    replace_triggered_by = [terraform_data.alarm_email_generation]
  }
}

# Alarm delivery into the application over a queue the worker polls. The email
# subscription above is the path that survives the application being down; this
# is the path that puts an alarm in front of an administrator to acknowledge.
#
# A queue rather than an HTTPS push for the reason this feed feels most sharply:
# the alarm most worth reading is the one raised while the application could not
# accept it, and SNS discards an undelivered HTTPS message once its one-hour
# retry ceiling passes. A queue holds it until the worker is back.
#
# Raw message delivery stays off, so the body carries the MessageId the
# application claims for idempotency and the TopicArn it checks.

resource "aws_sqs_queue" "alarm_feed" {
  count                      = var.enable_feed_queues ? 1 : 0
  name                       = "${local.prefix}-alarm-feed"
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 60
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.alarm_feed_dlq[0].arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue" "alarm_feed_dlq" {
  count                     = var.enable_feed_queues ? 1 : 0
  name                      = "${local.prefix}-alarm-feed-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue_policy" "alarm_feed" {
  count     = var.enable_feed_queues ? 1 : 0
  queue_url = aws_sqs_queue.alarm_feed[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.alarm_feed[0].arn
      Condition = {
        ArnEquals = { "aws:SourceArn" = local.alarm_feed_topic_arns }
      }
    }]
  })
}

# Mirrors production: the feed reads the main topic and the us-west-2 topic AWS
# Health's backup copy publishes to.
locals {
  alarm_feed_topic_arns = [aws_sns_topic.alarms.arn, aws_sns_topic.alarms_us_west_2.arn]
}

resource "aws_sns_topic_subscription" "alarm_feed" {
  count                = var.enable_feed_queues ? 1 : 0
  topic_arn            = aws_sns_topic.alarms.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.alarm_feed[0].arn
  raw_message_delivery = false
}

resource "aws_sns_topic_subscription" "alarm_feed_us_west_2" {
  count                = var.enable_feed_queues ? 1 : 0
  provider             = aws.us_west_2
  topic_arn            = aws_sns_topic.alarms_us_west_2.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.alarm_feed[0].arn
  raw_message_delivery = false
}
