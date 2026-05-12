# =============================================================================
# CloudWatch — Log groups, metric alarms, dashboard
# =============================================================================

# ── Log groups ────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "app" {
  name              = "/footbag/${var.environment}/app"
  retention_in_days = 90
}

resource "aws_cloudwatch_log_group" "nginx" {
  name              = "/footbag/${var.environment}/nginx"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/footbag/${var.environment}/worker"
  retention_in_days = 90
}

# ── Alarms ────────────────────────────────────────────────────────────────────
# Lightsail does not natively push metrics to CloudWatch. The CloudWatch
# agent runs on the Lightsail host (install via scripts/install-cwagent-*).
# Alarm dimensions match what the agent's telegraf inputs actually emit:
# CWAgent namespace, cpu_usage_active / mem_used_percent / disk_used_percent,
# with cpu/path/fstype dimensions. InstanceId is NOT a dimension on these
# metrics because the agent's fetch-config translator drops append_dimensions.
# When a second environment publishes to namespace CWAgent, disambiguate via
# per-environment namespace, not via dim.
#
# Reference: docs/DEVOPS_GUIDE.md §4.4
#
# Alarms are count-gated by enable_cwagent_alarms (default false): enable
# only after the agent is installed and confirmed to be emitting the
# metrics referenced below. Enabling before the agent exists creates
# alarms that immediately enter INSUFFICIENT_DATA and train operators to
# ignore monitoring.

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

# Disk used % on root filesystem. CWAgent config sets drop_device:true so
# the device dim does not appear; fstype is pinned to xfs (AL2023 default).
# A future filesystem change is loud (alarm flips to INSUFFICIENT_DATA).
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

resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx" {
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
    DistributionId = aws_cloudfront_distribution.main.id
    Region         = "Global"
  }
}

# ── Dashboard ─────────────────────────────────────────────────────────────────
# Five widgets mirror staging: CloudFront error rates, DB backup age, CPU,
# memory, root disk. CPU/memory/disk widgets render no-data until the
# CWAgent is installed and emitting; that is acceptable for at-a-glance
# operator visibility once the agent comes online.

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
            ["AWS/CloudFront", "4xxErrorRate", "DistributionId", aws_cloudfront_distribution.main.id, "Region", "Global"],
            ["AWS/CloudFront", "5xxErrorRate", "DistributionId", aws_cloudfront_distribution.main.id, "Region", "Global"]
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
