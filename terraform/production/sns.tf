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

# Second delivery of the same alarms into the application, so an administrator
# reads and acknowledges them in the admin UI instead of only in a mailbox. The
# email subscription above stays: it reaches an operator when the application
# itself is the thing that is down. Empty URL means no subscription, so this is
# inert until the endpoint and its key are configured.
resource "aws_sns_topic_subscription" "alarm_webhook" {
  count                  = var.alarm_webhook_url == "" ? 0 : 1
  topic_arn              = aws_sns_topic.alarms.arn
  protocol               = "https"
  endpoint               = var.alarm_webhook_url
  endpoint_auto_confirms = false

  # Without this an undelivered alarm is destroyed. SNS retries an HTTPS
  # endpoint three times inside a one-hour ceiling and then discards the
  # message, and only 5xx and 429 count as retryable at all, so a deploy, a
  # restart, or the very outage the alarm is reporting loses it outright. The
  # dead-letter queue is AWS's documented remedy for exactly that, and it is what
  # lets an alarm raised while the application was down still be read afterwards.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.alarm_webhook_dlq[0].arn
  })
}

# Fourteen days is the SQS maximum and the right choice here: the queue only
# ever holds alarms the application failed to accept, so the retention window is
# how long an operator has to notice and redrive them.
resource "aws_sqs_queue" "alarm_webhook_dlq" {
  count                     = var.alarm_webhook_url == "" ? 0 : 1
  name                      = "${local.prefix}-alarm-webhook-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue_policy" "alarm_webhook_dlq" {
  count     = var.alarm_webhook_url == "" ? 0 : 1
  queue_url = aws_sqs_queue.alarm_webhook_dlq[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.alarm_webhook_dlq[0].arn
      Condition = {
        ArnEquals = { "aws:SourceArn" = aws_sns_topic.alarms.arn }
      }
    }]
  })
}
