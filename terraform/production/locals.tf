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
}
