# =============================================================================
# SNS — alarm notification topic
# =============================================================================

resource "aws_sns_topic" "alarms" {
  name = "${local.prefix}-alarms"

  # Encrypted for the same reason as the feedback topic: the provider's security
  # baseline fails an unencrypted topic, and alarm bodies quote log lines and
  # metric context that are not meant to be readable at rest by anything but
  # this account. The monitoring service is granted use of the key in kms.tf.
  kms_master_key_id = aws_kms_key.main.arn
}

# See the equivalent policy on the mail feedback topic for why the owner
# statement is restated. Here the publisher is the monitoring service, which is
# what raises every alarm that reaches this topic; budgets notify by email
# directly and never publish here.
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
        # EventBridge, for AWS Health events. Nothing else tells the operator
        # when AWS itself is having the incident: the account is on Basic
        # support, so the Health API is unavailable and no support case can be
        # opened at any severity. What Basic does include is EventBridge
        # delivery of Health events at no cost, which is the whole opportunity
        # here -- the detection is free, and the absence of a support path makes
        # early warning worth more rather than less, since watching and
        # stabilising is the only available response.
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
# Two rules, because every other alerting path lives in us-east-1, the primary
# region, and an impairment there would take the site and its alarms down
# together with nothing to say so.
#
# The primary rule stays: events for global services publish to us-east-1 only.
# The second rule sits in us-west-2, which AWS designates the backup region for
# every other standard region and delivers each us-east-1 event to as well, so
# the warning still arrives while us-east-1 is impaired. An EventBridge rule
# reaches another region only through an event bus, so it publishes to its own
# topic there, emailing the same destinations as the primary topic. Like the
# us-east-1 certificate topic, it uses no customer-managed key: it carries only
# notices AWS generates.
#
# Each us-east-1 regional event therefore emails twice. AWS's answer is to
# de-duplicate on the event's communication id, which an email subscription
# cannot do, and a duplicate warning is the right side to err on.
#
# Ungated: nothing here depends on an earlier apply, and a rule matching nothing
# costs nothing. Each new email subscription sends a confirmation that must be
# clicked before it delivers.

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

# The owner statement is restated for the same reason as on the primary topic:
# attaching a policy replaces the default one.
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
# make their findings reach a person. GuardDuty findings of severity 7 or more
# (high and critical) only, so routine low-severity reconnaissance noise stays
# in the console. Every active Access Analyzer finding, because each one is a
# resource policy granting access outside the account. Neither rule is gated: a
# rule matching nothing costs nothing, and declaring it before the detector
# exists means the first finding already has somewhere to go.

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

# A second destination, beside the account's own mailbox rather than instead of
# it: a group whose members are everyone on the watch. The account mailbox stays
# the one destination that does not depend on this domain's own mail.
resource "aws_sns_topic_subscription" "alarm_ops_alert" {
  count     = var.ops_alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alarms.arn
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
        ArnEquals = { "aws:SourceArn" = aws_sns_topic.alarms.arn }
      }
    }]
  })
}

resource "aws_sns_topic_subscription" "alarm_feed" {
  count                = var.enable_feed_queues ? 1 : 0
  topic_arn            = aws_sns_topic.alarms.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.alarm_feed[0].arn
  raw_message_delivery = false
}
