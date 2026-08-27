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
      }
    ]
  })
}

resource "aws_sns_topic_subscription" "alarm_email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
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
