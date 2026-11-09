# =============================================================================
# Container, host-warning, refusal-volume, edge-function and availability
# alarms. Mirrors production, which carries the reasoning; the differences are
# asserted beside each one with how production's behaviour is proved.
#
# Two severities. A warning publishes to the main alarm topic, which the
# account mailbox and the admin console receive. A critical alarm publishes to
# the critical topic as well, which the watch group receives too.
#
# The account's alternate contacts are an account-wide setting on production's
# working path, so they are declared in the production tree only; an apply of
# that tree sets them, and AWS's next billing, operations or security notice to
# the account proves them.
#
# The alarms on this host's two IAM user keys being used away from the host are
# declared in the production tree, beside the account-wide trail whose log group
# they read. A call signed by a staging key reaches that trail, so they are
# proved from staging: once production's enable_cloudtrail and
# enable_host_key_alarm are on, one call signed by a staging key from a
# workstation raises the staging key's alarm, and its return to OK clears it.
# =============================================================================

variable "enable_container_alarms" {
  description = <<-EOT
    Set to true only once the container monitor's readings have arrived for a
    few minutes: a deploy carrying it has run, its first reading succeeded, and
    container_monitor_heartbeat shows datapoints in the CWAgent namespace.
    scripts/set-terraform-gate.sh checks that before it flips this. The
    heartbeat alarm treats missing data as breaching, so enabling earlier raises
    it on apply.
  EOT
  type        = bool
  default     = false
}

variable "rate_limit_refusal_alarm_threshold" {
  description = "Rate-limit refusals in 15 minutes above which the refusal-volume warning fires. Production's figure is set from what staging shows under ordinary use."
  type        = number
  default     = 50
}

locals {
  # Every container is watched for crashes and health. Staging leaves the image
  # worker out of the memory and out-of-memory alarms: its limit is scaled down
  # to the small host, where an out-of-memory kill on a large photo is expected
  # and contained (docker-compose.prod.yml, the image service). Production
  # watches all four, and its image memory alarms are proved on production by
  # firing them with scripts/send-test-alarm.sh in the production sitting.
  container_services        = ["nginx", "web", "worker", "image"]
  container_memory_services = ["nginx", "web", "worker"]
}

# ── Containers ──────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "container_memory_warning" {
  for_each                  = var.enable_container_alarms ? toset(local.container_memory_services) : toset([])
  alarm_name                = "${local.prefix}-container-memory-warning-${each.key}"
  comparison_operator       = "GreaterThanOrEqualToThreshold"
  evaluation_periods        = 10
  metric_name               = "container_memory_percent"
  namespace                 = "CWAgent"
  period                    = 60
  statistic                 = "Maximum"
  threshold                 = 80
  treat_missing_data        = "notBreaching"
  alarm_description         = "The ${each.key} container's working-set memory has been at or above 80% of its limit for 10 minutes."
  alarm_actions             = local.warning_alarm_actions
  ok_actions                = local.warning_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    container = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "container_memory_critical" {
  for_each                  = var.enable_container_alarms ? toset(local.container_memory_services) : toset([])
  alarm_name                = "${local.prefix}-container-memory-critical-${each.key}"
  comparison_operator       = "GreaterThanOrEqualToThreshold"
  evaluation_periods        = 3
  metric_name               = "container_memory_percent"
  namespace                 = "CWAgent"
  period                    = 60
  statistic                 = "Maximum"
  threshold                 = 90
  treat_missing_data        = "notBreaching"
  alarm_description         = "The ${each.key} container's working-set memory has been at or above 90% of its limit for 3 minutes; it is close to being killed for memory."
  alarm_actions             = local.critical_alarm_actions
  ok_actions                = local.critical_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    container = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "container_oom_kills" {
  for_each                  = var.enable_container_alarms ? toset(local.container_memory_services) : toset([])
  alarm_name                = "${local.prefix}-container-oom-${each.key}"
  comparison_operator       = "GreaterThanOrEqualToThreshold"
  evaluation_periods        = 1
  metric_name               = "container_oom_kills"
  namespace                 = "CWAgent"
  period                    = 300
  statistic                 = "Sum"
  threshold                 = 1
  treat_missing_data        = "notBreaching"
  alarm_description         = "The kernel killed the ${each.key} container for exceeding its memory limit in the last 5 minutes; Docker restarted it."
  alarm_actions             = local.critical_alarm_actions
  ok_actions                = local.critical_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    container = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "container_crashes" {
  for_each                  = var.enable_container_alarms ? toset(local.container_services) : toset([])
  alarm_name                = "${local.prefix}-container-crash-${each.key}"
  comparison_operator       = "GreaterThanOrEqualToThreshold"
  evaluation_periods        = 1
  metric_name               = "container_crashes"
  namespace                 = "CWAgent"
  period                    = 300
  statistic                 = "Sum"
  threshold                 = 1
  treat_missing_data        = "notBreaching"
  alarm_description         = "The ${each.key} container exited with an error in the last 5 minutes; Docker restarted it."
  alarm_actions             = local.critical_alarm_actions
  ok_actions                = local.critical_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    container = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "container_unhealthy" {
  for_each                  = var.enable_container_alarms ? toset(local.container_services) : toset([])
  alarm_name                = "${local.prefix}-container-unhealthy-${each.key}"
  comparison_operator       = "GreaterThanOrEqualToThreshold"
  evaluation_periods        = 3
  metric_name               = "container_unhealthy"
  namespace                 = "CWAgent"
  period                    = 60
  statistic                 = "Maximum"
  threshold                 = 1
  treat_missing_data        = "notBreaching"
  alarm_description         = "The ${each.key} container has not been running and healthy for 3 minutes: absent, restarting, stopped, or failing its healthcheck."
  alarm_actions             = local.critical_alarm_actions
  ok_actions                = local.critical_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    container = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "container_monitor_heartbeat" {
  count                     = var.enable_container_alarms ? 1 : 0
  alarm_name                = "${local.prefix}-container-monitor-heartbeat"
  comparison_operator       = "LessThanThreshold"
  evaluation_periods        = 5
  metric_name               = "container_monitor_heartbeat"
  namespace                 = "CWAgent"
  period                    = 60
  statistic                 = "Sum"
  threshold                 = 1
  treat_missing_data        = "breaching"
  alarm_description         = "No container monitor reading for 5 minutes: the per-container alarms are blind until it returns."
  alarm_actions             = local.warning_alarm_actions
  ok_actions                = local.warning_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions
}

# ── Host warning tier ───────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "high_cpu_warning" {
  count                     = var.enable_cwagent_alarms ? 1 : 0
  alarm_name                = "${local.prefix}-high-cpu-warning"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = 10
  metric_name               = "cpu_usage_active"
  namespace                 = "CWAgent"
  period                    = 60
  statistic                 = "Average"
  threshold                 = 80
  treat_missing_data        = "missing"
  alarm_description         = "CPU utilization above 80% for 10 consecutive minutes"
  alarm_actions             = local.warning_alarm_actions
  ok_actions                = local.warning_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    cpu = "cpu-total"
  }
}

resource "aws_cloudwatch_metric_alarm" "high_memory_warning" {
  count                     = var.enable_cwagent_alarms ? 1 : 0
  alarm_name                = "${local.prefix}-high-memory-warning"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = 10
  metric_name               = "mem_used_percent"
  namespace                 = "CWAgent"
  period                    = 60
  statistic                 = "Average"
  threshold                 = 80
  treat_missing_data        = "missing"
  alarm_description         = "Memory utilization above 80% for 10 consecutive minutes"
  alarm_actions             = local.warning_alarm_actions
  ok_actions                = local.warning_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions
}

# ── Rate-limit refusals ─────────────────────────────────────────────────────

resource "aws_cloudwatch_log_metric_filter" "rate_limit_refused" {
  name           = "${local.prefix}-rate-limit-refused"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.msg = \"rate_limit.refused\" }"
  metric_transformation {
    namespace     = "Footbag/${var.environment}"
    name          = "RateLimitRefusals"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "rate_limit_refusals" {
  alarm_name                = "${local.prefix}-rate-limit-refusals"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = 1
  metric_name               = "RateLimitRefusals"
  namespace                 = "Footbag/${var.environment}"
  period                    = 900
  statistic                 = "Sum"
  threshold                 = var.rate_limit_refusal_alarm_threshold
  treat_missing_data        = "notBreaching"
  alarm_description         = "More than ${var.rate_limit_refusal_alarm_threshold} rate-limit refusals in 15 minutes; the app log's rate_limit.refused lines name the action."
  alarm_actions             = local.warning_alarm_actions
  ok_actions                = local.warning_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions
}

# ── Edge functions ──────────────────────────────────────────────────────────
# The media-prefix and archive edge functions, the same pair per function as
# production. Staging carries no apex-redirect function, because it serves on
# its default CloudFront name with no apex to redirect.

resource "aws_cloudwatch_metric_alarm" "cf_function_validation_errors_media" {
  count                     = var.enable_cloudfront ? 1 : 0
  alarm_name                = "${local.prefix}-cf-function-validation-errors-media-prefix"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = 1
  metric_name               = "FunctionValidationErrors"
  namespace                 = "AWS/CloudFront"
  period                    = 60
  statistic                 = "Sum"
  threshold                 = 0
  treat_missing_data        = "notBreaching"
  alarm_description         = "The media-prefix edge function returned an invalid response; member photo URLs are returning 502."
  alarm_actions             = local.critical_alarm_actions
  ok_actions                = local.critical_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    FunctionName = aws_cloudfront_function.strip_media_store_prefix[0].name
    Region       = "Global"
  }
}

resource "aws_cloudwatch_metric_alarm" "cf_function_execution_errors_media" {
  count                     = var.enable_cloudfront ? 1 : 0
  alarm_name                = "${local.prefix}-cf-function-execution-errors-media-prefix"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = 1
  metric_name               = "FunctionExecutionErrors"
  namespace                 = "AWS/CloudFront"
  period                    = 60
  statistic                 = "Sum"
  threshold                 = 0
  treat_missing_data        = "notBreaching"
  alarm_description         = "The media-prefix edge function failed to complete; the media origin is never reached."
  alarm_actions             = local.critical_alarm_actions
  ok_actions                = local.critical_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    FunctionName = aws_cloudfront_function.strip_media_store_prefix[0].name
    Region       = "Global"
  }
}

resource "aws_cloudwatch_metric_alarm" "cf_function_validation_errors_archive" {
  count                     = var.enable_archive ? 1 : 0
  alarm_name                = "${local.prefix}-cf-function-validation-errors-archive-edge"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = 1
  metric_name               = "FunctionValidationErrors"
  namespace                 = "AWS/CloudFront"
  period                    = 60
  statistic                 = "Sum"
  threshold                 = 0
  treat_missing_data        = "notBreaching"
  alarm_description         = "The archive edge function returned an invalid response; archive viewers are getting 502."
  alarm_actions             = local.critical_alarm_actions
  ok_actions                = local.critical_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    FunctionName = aws_cloudfront_function.archive_edge[0].name
    Region       = "Global"
  }
}

resource "aws_cloudwatch_metric_alarm" "cf_function_execution_errors_archive" {
  count                     = var.enable_archive ? 1 : 0
  alarm_name                = "${local.prefix}-cf-function-execution-errors-archive-edge"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = 1
  metric_name               = "FunctionExecutionErrors"
  namespace                 = "AWS/CloudFront"
  period                    = 60
  statistic                 = "Sum"
  threshold                 = 0
  treat_missing_data        = "notBreaching"
  alarm_description         = "The archive edge function failed to complete; the archive origin is never reached."
  alarm_actions             = local.critical_alarm_actions
  ok_actions                = local.critical_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    FunctionName = aws_cloudfront_function.archive_edge[0].name
    Region       = "Global"
  }
}

# ── Availability from outside ───────────────────────────────────────────────
# Staging has no cutover notice, so the check follows the distribution alone.

resource "aws_route53_health_check" "site_ready" {
  count             = var.enable_cloudfront ? 1 : 0
  fqdn              = aws_cloudfront_distribution.main[0].domain_name
  type              = "HTTPS"
  port              = 443
  resource_path     = "/health/ready"
  request_interval  = 30
  failure_threshold = 3
  enable_sni        = true

  tags = {
    Name = "${local.prefix}-site-ready"
  }
}

resource "aws_cloudwatch_metric_alarm" "site_unavailable" {
  count                     = var.enable_cloudfront ? 1 : 0
  alarm_name                = "${local.prefix}-site-unavailable"
  comparison_operator       = "LessThanThreshold"
  evaluation_periods        = 2
  metric_name               = "HealthCheckStatus"
  namespace                 = "AWS/Route53"
  period                    = 60
  statistic                 = "Minimum"
  threshold                 = 1
  treat_missing_data        = "breaching"
  alarm_description         = "The site's readiness check has failed from outside for 2 minutes: visitors cannot use the site."
  alarm_actions             = local.critical_alarm_actions
  ok_actions                = local.critical_alarm_actions
  insufficient_data_actions = local.warning_alarm_actions

  dimensions = {
    HealthCheckId = aws_route53_health_check.site_ready[0].id
  }
}
