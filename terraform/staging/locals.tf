locals {
  # Short prefix used in resource names: "footbag-staging" or "footbag-production"
  prefix = "footbag-${var.environment}"

  # The web instance's name: the original, or the one a restore recorded.
  web_instance_name = var.lightsail_instance_name != "" ? var.lightsail_instance_name : "${local.prefix}-web"

  # SSM parameter namespace: /footbag/staging/... or /footbag/production/...
  ssm_prefix = "/footbag/${var.environment}"

  # The owner grant every topic policy in this tree restates. Attaching any
  # policy to a topic replaces the default one, so without this statement the
  # account keeps access only through identity policies. It is the action set
  # that default policy grants, enumerated because SNS rejects a wildcard in a
  # topic policy: see the comment beside either use.
  sns_owner_actions = [
    "SNS:GetTopicAttributes",
    "SNS:SetTopicAttributes",
    "SNS:AddPermission",
    "SNS:RemovePermission",
    "SNS:DeleteTopic",
    "SNS:Subscribe",
    "SNS:ListSubscriptionsByTopic",
    "SNS:Publish",
  ]
}
