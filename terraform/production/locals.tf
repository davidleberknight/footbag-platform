# =============================================================================
# Locals — production
# =============================================================================

locals {
  prefix     = "footbag-${var.environment}"
  ssm_prefix = "/footbag/${var.environment}"

  # The From addresses the runtime role may send as. Empty list means the sender
  # identity alone, which is every send the platform makes today; see the
  # ses_permitted_from_addresses variable for why the grant needs this rather
  # than relying on the identity it names as its resource.
  ses_from_addresses = length(var.ses_permitted_from_addresses) > 0 ? var.ses_permitted_from_addresses : [var.ses_sender_identity]

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
