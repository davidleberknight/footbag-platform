# =============================================================================
# Container, host-warning, refusal-volume, edge-function and availability
# alarms, and the account's alternate contacts.
#
# Two severities. A warning publishes to the main alarm topic, which the
# account mailbox and the admin console receive. A critical alarm publishes to
# the critical topic as well, which the watch group receives too. Warnings use
# 5 to 10 minute windows so a passing spike does not flap them; critical alarms
# use 1 to 5 minute windows so the group hears quickly.
# =============================================================================

variable "enable_container_alarms" {
  description = <<-EOT
    Set to true only once the container monitor's readings have arrived for a
    few minutes: a deploy carrying it has run, its first reading succeeded, and
    container_monitor_heartbeat shows datapoints in this environment's agent
    namespace. scripts/set-terraform-gate.sh checks that before it flips this.
    The heartbeat alarm treats missing data as breaching, so enabling earlier
    raises it on apply.
  EOT
  type        = bool
  default     = false
}

variable "rate_limit_refusal_alarm_threshold" {
  description = "Rate-limit refusals in 15 minutes above which the refusal-volume warning fires. Set from what staging shows under ordinary use, so it fires on a campaign of refused attempts and not on one person mistyping a password."
  type        = number
  default     = 50
}

locals {
  # The compose services the container monitor reports on. Every one is watched
  # for crashes and health; memory and out-of-memory kills are watched on each
  # service that carries a memory limit, which in production is all four.
  container_services        = ["nginx", "web", "worker", "image"]
  container_memory_services = local.container_services
}

# ── Containers ──────────────────────────────────────────────────────────────
# Readings come from scripts/container-monitor.sh through the CloudWatch agent's
# StatsD input, one per container per minute, with the compose service name as
# the `container` dimension. Zeros are published, so a missing point means the
# monitor did not run, which the heartbeat alarm alone reports; the rest treat
# missing data as normal rather than raising one alarm per container.

resource "aws_cloudwatch_metric_alarm" "container_memory_warning" {
  for_each                  = var.enable_container_alarms ? toset(local.container_memory_services) : toset([])
  alarm_name                = "${local.prefix}-container-memory-warning-${each.key}"
  comparison_operator       = "GreaterThanOrEqualToThreshold"
  evaluation_periods        = 10
  metric_name               = "container_memory_percent"
  namespace                 = local.cwagent_namespace
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
  namespace                 = local.cwagent_namespace
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
  namespace                 = local.cwagent_namespace
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
  namespace                 = local.cwagent_namespace
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
  namespace                 = local.cwagent_namespace
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

# The monitor sends its heartbeat last, and only from a run that met no error,
# so this one alarm covers a stopped timer, a run that cannot read Docker, and a
# CloudWatch agent that is not taking readings. Missing data is the signal.
resource "aws_cloudwatch_metric_alarm" "container_monitor_heartbeat" {
  count                     = var.enable_container_alarms ? 1 : 0
  alarm_name                = "${local.prefix}-container-monitor-heartbeat"
  comparison_operator       = "LessThanThreshold"
  evaluation_periods        = 5
  metric_name               = "container_monitor_heartbeat"
  namespace                 = local.cwagent_namespace
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
# Beneath the 85%-for-3-minutes critical alarms: sustained load worth a look
# before it becomes an outage. Same dimensions as the critical pair.

resource "aws_cloudwatch_metric_alarm" "high_cpu_warning" {
  count                     = var.enable_cwagent_alarms ? 1 : 0
  alarm_name                = "${local.prefix}-high-cpu-warning"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = 10
  metric_name               = "cpu_usage_active"
  namespace                 = local.cwagent_namespace
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
  namespace                 = local.cwagent_namespace
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
# The application logs one line per refused attempt, naming only the action.
# A sustained burst is a campaign against a form (most often the login form's
# per-address lockout), worth a look even while the limit holds.

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

# ── Archive edge function ───────────────────────────────────────────────────
# Same pair and reasoning as the platform's edge-function alarms in
# cloudwatch.tf: zero is the threshold, because the function runs on every
# archive request, so an error is the deployed code broken for everyone.

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
# Every other alarm here reads the host or its traffic; this one asks the site
# from outside, through the distribution exactly as a visitor reaches it, so a
# dead host, a stopped stack or a broken edge is seen even while nobody is
# visiting. The readiness path is uncached at the edge and answers 503 when the
# app cannot serve. Conditioned off the cutover notice for the same reason as
# the 5xx alarm: the notice's deliberate 503s would hold it in alarm.
resource "aws_route53_health_check" "site_ready" {
  count             = var.enable_cloudfront && !var.enable_cutover_notice ? 1 : 0
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
  count                     = var.enable_cloudfront && !var.enable_cutover_notice ? 1 : 0
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
