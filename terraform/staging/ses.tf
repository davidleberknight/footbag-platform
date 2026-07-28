# =============================================================================
# SES sender identity.
# LiveSesAdapter (src/adapters/sesAdapter.ts) sends outbound mail via SES
# with the From: header set to this verified address. Target production
# value: noreply@footbag.org (once the domain is acquired). Substitute
# values for staging use a Google Workspace alias on a project-controlled
# domain; literal value lives in terraform.tfvars (gitignored), not here.
#
# The runtime role's ses:SendEmail grant on this identity is declared in
# iam.tf alongside the kms:Sign grant for JWT signing.
# =============================================================================

variable "ses_sender_identity" {
  description = <<-EOT
    SES-verified sender email address used as the From: header for outbound
    mail. Target canonical value: noreply@footbag.org. If the footbag.org
    domain is not yet available, use a substitute address on a controlled
    domain (recorded in local operator notes, not committed).
  EOT
  type        = string

  # Reject a copied placeholder. Without this, an operator creates a SES
  # identity AWS will never verify, and the failure only surfaces when
  # outbound mail tries to use it.
  validation {
    condition     = !startswith(var.ses_sender_identity, "TODO-") && var.ses_sender_identity != ""
    error_message = "ses_sender_identity must be a real verified sender address; a TODO- placeholder is rejected."
  }
}

resource "aws_ses_email_identity" "sender" {
  email = var.ses_sender_identity
}

# =============================================================================
# SES feedback loop -- bounce/complaint notifications to the app webhook
# =============================================================================
# Bounces and complaints publish to an SNS topic subscribed to the app's
# public webhook (shared-secret query key in the endpoint URL). The app marks
# the matching member's email_status so transactional sends skip dead or
# complaining addresses. The HTTPS subscription requires an out-of-band
# confirmation: the app records the SubscribeURL in an audit row and the
# operator confirms it once.

resource "aws_sns_topic" "ses_feedback" {
  name = "${local.prefix}-ses-feedback"
}

resource "aws_ses_identity_notification_topic" "sender_bounce" {
  identity                 = aws_ses_email_identity.sender.arn
  notification_type        = "Bounce"
  topic_arn                = aws_sns_topic.ses_feedback.arn
  include_original_headers = false
}

resource "aws_ses_identity_notification_topic" "sender_complaint" {
  identity                 = aws_ses_email_identity.sender.arn
  notification_type        = "Complaint"
  topic_arn                = aws_sns_topic.ses_feedback.arn
  include_original_headers = false
}

resource "aws_sns_topic_subscription" "ses_feedback_webhook" {
  count                  = var.ses_feedback_webhook_url == "" ? 0 : 1
  topic_arn              = aws_sns_topic.ses_feedback.arn
  protocol               = "https"
  endpoint               = var.ses_feedback_webhook_url
  endpoint_auto_confirms = false
}
