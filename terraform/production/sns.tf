# =============================================================================
# SNS — alarm notification topic
# =============================================================================

resource "aws_sns_topic" "alarms" {
  name = "${local.prefix}-alarms"
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
