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

# PARITY DIVERGENCE, DELIBERATE. Both environments live in one AWS account and
# both name the same sender address, and an SES identity plus its bounce and
# complaint notification settings are per-identity and account-global. So these
# are not two resources, they are one resource declared in two trees, and
# whichever tree applies last silently wins. That is how staging came to be
# planning a change of production's feedback topic to staging's own.
#
# Production owns the identity and both notification settings, because production
# is what actually sends. Staging declares none of them.
#
# Detaching them is what the blocks below do, and it is deliberately not the same
# as declaring them and switching them off: a declared-but-off resource plans a
# destroy, and destroying this identity would take away the verified address
# production sends through, which cannot be restored without someone opening a
# fresh confirmation link. These blocks drop whatever a previous staging apply
# recorded while leaving the real resources untouched, and stay afterwards as the
# standing record of that handover. Should staging ever be given a sender address
# of its own, the collision disappears and these come back as ordinary
# declarations.
removed {
  from = aws_ses_email_identity.sender

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_ses_identity_notification_topic.sender_bounce

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_ses_identity_notification_topic.sender_complaint

  lifecycle {
    destroy = false
  }
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

# The bounce and complaint notification settings that would publish into this
# topic belong to the shared sender identity, so production declares them and
# staging does not; the detachment is recorded above. The topic itself is this
# environment's own, so it stays: the webhook subscription below is what staging
# exercises.

resource "aws_sns_topic_subscription" "ses_feedback_webhook" {
  count                  = var.ses_feedback_webhook_url == "" ? 0 : 1
  topic_arn              = aws_sns_topic.ses_feedback.arn
  protocol               = "https"
  endpoint               = var.ses_feedback_webhook_url
  endpoint_auto_confirms = false

  # SNS retries an HTTPS endpoint three times inside a one-hour ceiling and then
  # discards the message, so without this a bounce arriving during a deploy is
  # lost. The account-level suppression list still stops SES sending to a
  # hard-bounced address, so the loss here is the platform's own record of which
  # member bounced rather than a sending risk, but that record is what the admin
  # surfaces read.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ses_feedback_webhook_dlq[0].arn
  })
}

resource "aws_sqs_queue" "ses_feedback_webhook_dlq" {
  count                     = var.ses_feedback_webhook_url == "" ? 0 : 1
  name                      = "${local.prefix}-ses-feedback-webhook-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue_policy" "ses_feedback_webhook_dlq" {
  count     = var.ses_feedback_webhook_url == "" ? 0 : 1
  queue_url = aws_sqs_queue.ses_feedback_webhook_dlq[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.ses_feedback_webhook_dlq[0].arn
      Condition = {
        ArnEquals = { "aws:SourceArn" = aws_sns_topic.ses_feedback.arn }
      }
    }]
  })
}
