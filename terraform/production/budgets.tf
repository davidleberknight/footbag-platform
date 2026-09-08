# =============================================================================
# Billing — monthly cost budget
# =============================================================================
#
# Spend is watched by the two resources in this file and by nothing else. Every
# other alarm in this stack is about the application's health; none of them
# notice a cost anomaly, so a misconfigured resource or a compromised credential
# would run for a full billing cycle before anyone saw it on an invoice.
#
# The two halves do different jobs. The budget mails the operator directly, and
# is the only one of the two that can warn on a forecast, before the money is
# spent. The alarm raises inside the application, where an administrator
# acknowledges it on record with a note and it clears when the month rolls over
# and charges reset; the budget has no state and can raise nothing there.
#
# Steady state is roughly USD 35 a month, dominated by two Lightsail instances
# at a flat rate. The limit is set above that with room for ordinary variation,
# so the alert means "something changed" rather than "the month was busy".
#
# Notifications go to the same address as the CloudWatch alarms, which already
# carries a confirmed subscription, rather than introducing a second recipient
# to keep current. AWS Budgets delivers to the address directly instead of
# through the alarms SNS topic: routing it through the topic would require
# widening that topic's access policy for the budgets service, which is a larger
# change than the notification is worth.
#
# Budgets is a global service whose data lives in us-east-1, which this stack
# already targets, so no separate provider alias is needed.

resource "aws_budgets_budget" "monthly_cost" {
  name         = "${local.prefix}-monthly-cost"
  budget_type  = "COST"
  limit_amount = tostring(local.monthly_cost_ceiling_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Actual spend crossing most of the limit: something is already different from
  # a normal month and is worth looking at while the cycle is still running.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alarm_email]
  }

  # Forecast crossing the whole limit catches a runaway early in the month,
  # while actual spend is still small. This is the one that gives useful warning
  # rather than confirmation after the fact.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alarm_email]
  }
}

# The application's alarm intake parses the monitoring service's payload shape:
# an alarm name and a state. A budget notification is human-readable text and is
# discarded as malformed, which is the concrete reason this alarm exists rather
# than the budget simply being pointed at the topic.
#
# Estimated charges are month-to-date and reset at each month boundary, so the
# alarm returns to OK on its own and the recorded alarm clears without anyone
# touching it. Missing data is treated as missing so a late metric refresh holds
# the current state instead of moving it.
#
# The metric is published only in us-east-1, which is this stack's primary
# region, so no provider alias is needed here.

resource "aws_cloudwatch_metric_alarm" "estimated_charges" {
  count               = var.enable_billing_alarm ? 1 : 0
  alarm_name          = "${local.prefix}-monthly-cost-exceeded"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 21600 # 6 hours; AWS refreshes the metric a few times a day
  statistic           = "Maximum"
  threshold           = local.monthly_cost_ceiling_usd
  treat_missing_data  = "missing"
  dimensions          = { Currency = "USD" }
  alarm_description   = "Month-to-date AWS charges have passed the monthly ceiling."
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}
