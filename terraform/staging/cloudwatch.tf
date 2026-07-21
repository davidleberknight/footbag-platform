# =============================================================================
# CloudWatch — Log groups, metric alarms, dashboard
# =============================================================================

# ── Log groups ────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "app" {
  name              = "/footbag/${var.environment}/app"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "nginx" {
  name              = "/footbag/${var.environment}/nginx"
  retention_in_days = 14
}

# ── Application error alarm ──────────────────────────────────────────────────
# logger.error() in src/config/logger.ts emits a JSON line with level="error".
# The metric filter increments AppErrorCount once per matching line; the alarm
# fires on any non-zero count within a 60s window and routes to the existing
# SNS topic, which has an email subscription to var.alarm_email. This is the
# only application-level operator alert today; any new operator-visible
# failure mode adds itself via logger.error() and is surfaced automatically.

resource "aws_cloudwatch_log_metric_filter" "app_errors" {
  name           = "${local.prefix}-app-errors"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.level = \"error\" }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}"
    name          = "AppErrorCount"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "app_errors" {
  alarm_name          = "${local.prefix}-app-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "AppErrorCount"
  namespace           = "Footbag/${var.environment}"
  statistic           = "Sum"
  period              = 60
  threshold           = 1
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"
  alarm_description   = "One or more logger.error() calls observed in the app log within the last minute."
}

# ── Alarms ────────────────────────────────────────────────────────────────────
# Lightsail does not natively push metrics to CloudWatch.
# TODO: Install the CloudWatch agent on the Lightsail instance (via
# scripts/install-cwagent-staging.sh) and configure it to push CPU, memory,
# and disk metrics to the namespace below. CloudWatch is this project's
# default monitoring substrate: logs, metrics, dashboards, alarms, and SNS
# notification fan-out all live here rather than in an external tool.

# Alarm dimensions match what amazon-cloudwatch-agent's telegraf inputs
# actually emit on this host. The JSON config's append_dimensions block is
# dropped by fetch-config's translator on this version; until that is fixed,
# alarms scope by the natural input dims (cpu, path, fstype) rather than a
# synthesized InstanceId. When a second environment publishes to namespace
# CWAgent, disambiguate via per-environment namespace, not via dim.
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  count               = var.enable_cwagent_alarms ? 1 : 0
  alarm_name          = "${local.prefix}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "cpu_usage_active"
  namespace           = "CWAgent"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_description   = "CPU utilization above 85% for 3 consecutive minutes"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    cpu = "cpu-total"
  }
}

resource "aws_cloudwatch_metric_alarm" "high_memory" {
  count               = var.enable_cwagent_alarms ? 1 : 0
  alarm_name          = "${local.prefix}-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "mem_used_percent"
  namespace           = "CWAgent"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_description   = "Memory utilization above 85% for 3 consecutive minutes"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# Disk used % on root filesystem. CWAgent config sets drop_device:true so the
# device dim does not appear; fstype is pinned to xfs (AL2023 default). A
# future filesystem change here is loud (alarm flips to INSUFFICIENT_DATA).
resource "aws_cloudwatch_metric_alarm" "high_disk" {
  count               = var.enable_cwagent_alarms ? 1 : 0
  alarm_name          = "${local.prefix}-high-disk"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "disk_used_percent"
  namespace           = "CWAgent"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_description   = "Root filesystem usage above 85% for 3 consecutive minutes"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    path   = "/"
    fstype = "xfs"
  }
}

resource "aws_cloudwatch_metric_alarm" "db_backup_age" {
  count               = var.enable_backup_alarm ? 1 : 0
  alarm_name          = "${local.prefix}-db-backup-stale"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BackupAgeMinutes"
  namespace           = "Footbag/${var.environment}"
  period              = 600 # 10 minutes
  statistic           = "Maximum"
  threshold           = 15 # Alert if no backup in 15 minutes
  treat_missing_data  = "breaching"
  alarm_description   = "SQLite backup has not completed in 15+ minutes"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "db_backup_failures" {
  count               = var.enable_backup_alarm ? 1 : 0
  alarm_name          = "${local.prefix}-db-backup-failing"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "BackupConsecutiveFailures"
  namespace           = "Footbag/${var.environment}"
  period              = 600 # 10 minutes (covers at least one backup cycle)
  statistic           = "Maximum"
  threshold           = 3              # Alert after three consecutive failed backups
  treat_missing_data  = "notBreaching" # silence is covered by the staleness alarm
  alarm_description   = "SQLite backup has failed three or more times in a row"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx" {
  count               = var.enable_cloudfront ? 1 : 0
  alarm_name          = "${local.prefix}-cloudfront-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5xxErrorRate"
  namespace           = "AWS/CloudFront"
  period              = 60
  statistic           = "Average"
  threshold           = 5 # Alert if >5% 5xx rate
  alarm_description   = "CloudFront 5xx error rate above 5%"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DistributionId = var.enable_cloudfront ? aws_cloudfront_distribution.main[0].id : ""
    Region         = "Global"
  }
}

# ── Outbox backlog ────────────────────────────────────────────────────────────
# The worker logs a structured `outbox.depth` line per polling cycle; the
# filter turns $.depth into the OutboxDepth metric. A sustained backlog means
# the worker is down or SES is failing while members wait for verify links.

resource "aws_cloudwatch_log_metric_filter" "outbox_depth" {
  name           = "${local.prefix}-outbox-depth"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.msg = \"outbox.depth\" }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}"
    name          = "OutboxDepth"
    value         = "$.depth"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "outbox_backlog" {
  alarm_name          = "${local.prefix}-outbox-backlog"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "OutboxDepth"
  namespace           = "Footbag/${var.environment}"
  period              = 300
  statistic           = "Maximum"
  threshold           = 50
  treat_missing_data  = "notBreaching"
  alarm_description   = "Email outbox backlog above 50 for 15+ minutes (worker down or SES failing)"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# ── Payment webhook delivery ──────────────────────────────────────────────────
# Both webhook rejection paths answer 400 and log webhook.delivery_failed at
# warn: a rejected signature (reason=signature) and a recoverable processing
# failure the provider should retry (reason=recoverable). Neither reaches
# logger.error, so the blanket AppErrorCount alarm does not cover either one.
# The failure this exists for is a signing secret rotated on one side only,
# which makes every delivery fail while staying invisible until the provider
# disables the endpoint days later. An occasional single failure is normal; a
# sustained run is not. Check the reason field on the logged lines to tell a
# secret mismatch apart from a burst of unsigned junk from the open internet.

resource "aws_cloudwatch_log_metric_filter" "webhook_delivery_failures" {
  name           = "${local.prefix}-webhook-delivery-failures"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.msg = \"webhook.delivery_failed\" }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}"
    name          = "WebhookDeliveryFailures"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "webhook_delivery_failures" {
  alarm_name          = "${local.prefix}-webhook-delivery-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "WebhookDeliveryFailures"
  namespace           = "Footbag/${var.environment}"
  # Five minutes rather than fifteen: a shorter period detects a secret mismatch
  # sooner and stops a stale data point from holding the alarm state once the
  # metric stops moving.
  period             = 300
  statistic          = "Sum"
  threshold          = 5
  treat_missing_data = "notBreaching"
  alarm_description  = "More than 5 payment webhook deliveries rejected in 5 minutes; check the reason field (signature = secret mismatch, recoverable = processing)"
  alarm_actions      = [aws_sns_topic.alarms.arn]
  ok_actions         = [aws_sns_topic.alarms.arn]
}

# ── SES reputation ────────────────────────────────────────────────────────────
# Account-level bounce/complaint rates. SES pauses sending around 10% bounce /
# 0.5% complaint; alarm early at half those levels.

resource "aws_cloudwatch_metric_alarm" "ses_bounce_rate" {
  alarm_name          = "${local.prefix}-ses-bounce-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Reputation.BounceRate"
  namespace           = "AWS/SES"
  period              = 3600
  statistic           = "Average"
  threshold           = 0.05
  treat_missing_data  = "notBreaching"
  alarm_description   = "SES account bounce rate above 5% (SES pauses sending near 10%)"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "ses_complaint_rate" {
  alarm_name          = "${local.prefix}-ses-complaint-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Reputation.ComplaintRate"
  namespace           = "AWS/SES"
  period              = 3600
  statistic           = "Average"
  threshold           = 0.0025
  treat_missing_data  = "notBreaching"
  alarm_description   = "SES account complaint rate above 0.25% (SES pauses sending near 0.5%)"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# ── Origin latency ────────────────────────────────────────────────────────────
# Gated on enable_cloudfront like the rest of staging's CloudFront wiring;
# OriginLatency requires the per-distribution additional-metrics subscription.

resource "aws_cloudfront_monitoring_subscription" "main" {
  count           = var.enable_cloudfront ? 1 : 0
  distribution_id = aws_cloudfront_distribution.main[0].id
  monitoring_subscription {
    realtime_metrics_subscription_config {
      realtime_metrics_subscription_status = "Enabled"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "origin_latency" {
  count               = var.enable_cloudfront ? 1 : 0
  alarm_name          = "${local.prefix}-origin-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "OriginLatency"
  namespace           = "AWS/CloudFront"
  period              = 300
  extended_statistic  = "p90"
  threshold           = 3000
  treat_missing_data  = "notBreaching"
  alarm_description   = "CloudFront p90 origin latency above 3s for 15+ minutes"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    DistributionId = aws_cloudfront_distribution.main[0].id
    Region         = "Global"
  }
}

# ── Dashboard ─────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = local.prefix

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "CloudFront Error Rates"
          region = "us-east-1"
          metrics = [
            ["AWS/CloudFront", "4xxErrorRate", "DistributionId", var.enable_cloudfront ? aws_cloudfront_distribution.main[0].id : "CLOUDFRONT-NOT-YET-ENABLED", "Region", "Global"],
            ["AWS/CloudFront", "5xxErrorRate", "DistributionId", var.enable_cloudfront ? aws_cloudfront_distribution.main[0].id : "CLOUDFRONT-NOT-YET-ENABLED", "Region", "Global"]
          ]
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "DB Backup Age"
          region = var.aws_region
          metrics = [
            ["Footbag/${var.environment}", "BackupAgeMinutes"]
          ]
          period = 300
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "CPU utilization (active %)"
          region = var.aws_region
          metrics = [
            ["CWAgent", "cpu_usage_active", "cpu", "cpu-total"]
          ]
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "Memory used %"
          region = var.aws_region
          metrics = [
            ["CWAgent", "mem_used_percent"]
          ]
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "Root disk used %"
          region = var.aws_region
          metrics = [
            ["CWAgent", "disk_used_percent", "path", "/", "fstype", "xfs"]
          ]
          period = 60
          view   = "timeSeries"
        }
      }
    ]
  })
}
