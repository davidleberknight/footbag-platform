# =============================================================================
# SES sender identity.
# The staging app (src/adapters/sesAdapter.ts LiveSesAdapter) sends outbound
# mail via SES with the From identity set to this verified address. Per DD
# §5.4-5.5 and IMPLEMENTATION_PLAN active-slice notes:
#
#   - Target production identity: noreply@footbag.org (once the domain is
#     acquired by IFPA).
#   - Current staging substitute: a Google Workspace alias on an
#     institutional domain the project controls; recorded in local operator
#     notes, not committed.
#
# The identity is driven by var.ses_sender_identity so the canonical vs
# substitute decision lives in terraform.tfvars, not in this file.
#
# This identity was originally verified by hand via the AWS Console during
# Path H §8.8 of DEV_ONBOARDING.md. Declaring it here closes finding 7.2 of
# code_doc_review.md (IaC drift). To reconcile existing state on first apply:
#
#   terraform import aws_ses_email_identity.sender <email-address-from-console>
#
# If the identity does not yet exist in SES, Terraform will create it and
# AWS will email the address a verification link that must be clicked
# before sends succeed.
#
# The runtime role's SES permission for this identity is declared in
# iam.tf as part of the OutboundEmail inline policy (added via Console in
# Path H §8.9 step 4b; Terraform reconciliation pending per iam.tf comment).
# =============================================================================

variable "ses_sender_identity" {
  description = <<-EOT
    SES-verified sender email address used as the From: header for outbound
    mail. Target canonical value: noreply@footbag.org. If the footbag.org
    domain is not yet available, use a substitute address on a controlled
    domain (recorded in local operator notes, not committed).
  EOT
  type        = string
}

resource "aws_ses_email_identity" "sender" {
  email = var.ses_sender_identity
}
