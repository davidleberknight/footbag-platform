# =============================================================================
# Billing — monthly cost budget
# =============================================================================
#
# Nothing else watches spend. Every other alarm in this stack is about the
# application's health; none of them notice a cost anomaly, so a misconfigured
# resource or a compromised credential would run for a full billing cycle before
# anyone saw it on an invoice.
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
  limit_amount = "60"
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
