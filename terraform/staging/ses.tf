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
# The domain-authentication family is production-only for the same reason and one
# more: the SES domain identity, its verification, its DKIM records, its MAIL FROM
# subdomain and the two domain-level bounce and complaint settings all hang off a
# real domain in a hosted zone, and staging attaches no custom domain at all. It
# serves on its unpublished default CloudFront name, so there is no domain here to
# authenticate and no zone to publish the proving records into.
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
# Sending streams: transactional and bulk kept apart
# =============================================================================
# SES keeps reputation metrics per configuration set, so naming one on a send
# decides whose reputation a complaint lands on. Transactional mail is one
# member and one action they took, where non-delivery locks someone out; bulk
# mail is a newsletter or announcement to many addresses of mixed freshness,
# and is where complaints and hard bounces come from. Separating them stops a
# bad newsletter degrading password-reset delivery.
#
# The application picks the set per message: a copy addressed to a mailing list
# is bulk, everything else transactional. It passes no set until the two
# configuration-set environment variables are present, so these resources are
# safe to apply ahead of the app and change nothing on their own. Staging holds
# both sets at parity with production even though its adapter is stubbed, so
# the naming and the apply are rehearsed here first.

resource "aws_ses_configuration_set" "transactional" {
  name                       = "${local.prefix}-transactional"
  reputation_metrics_enabled = true
}

resource "aws_ses_configuration_set" "bulk" {
  name                       = "${local.prefix}-bulk"
  reputation_metrics_enabled = true
}

# =============================================================================
# SES feedback topic for this environment
# =============================================================================
# Bounces and complaints publish to an SNS topic, and a queue subscribed to that
# topic is polled by the worker. There is no public endpoint and no shared
# secret: the queue read is authorized by the host's own runtime role.

resource "aws_sns_topic" "ses_feedback" {
  name = "${local.prefix}-ses-feedback"

  # Encrypted to match production. Nothing publishes here today, as the note
  # below explains, so this protects hand-published rehearsal messages rather
  # than real member addresses; parity is the point, so that what is proved
  # against this topic is proved against the shape production runs.
  kms_master_key_id = aws_kms_key.main.arn
}

# Mirrors production's policy. Attaching any policy replaces the default one, so
# the owner statement is restated rather than inherited. The mail-service
# statement is inert in this environment, because the shared sender identity
# publishes to production's topic and not to this one, but it is kept so the two
# trees do not differ in a way nobody meant.
resource "aws_sns_topic_policy" "ses_feedback" {
  arn = aws_sns_topic.ses_feedback.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "OwnerFullAccess"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.aws_account_id}:root" }
        Action    = "SNS:*"
        Resource  = aws_sns_topic.ses_feedback.arn
      },
      {
        Sid       = "AllowSesPublish"
        Effect    = "Allow"
        Principal = { Service = "ses.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.ses_feedback.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = var.aws_account_id
          }
        }
      }
    ]
  })
}

# The bounce and complaint notification settings that would publish into this
# topic belong to the shared sender identity, so production declares them and
# staging does not; the detachment is recorded above. The topic itself is this
# environment's own, so it stays.
#
# The consequence is worth stating plainly, because it is easy to misread this
# environment as having a working feedback loop: nothing publishes to this
# topic. The shared identity points at production's. So staging's queue and
# subscription below exercise the polling mechanism against messages published
# by hand, and staging has never carried a real provider bounce end to end.
# That proof belongs to production.

# SES feedback loop -- bounce/complaint notifications to the worker's queue
# =============================================================================
# The queue transport is how the application is meant to read this feed. SNS
# gives an HTTPS endpoint three retries inside a one-hour ceiling and then
# discards the message; a queue subscription holds it for the queue's retention
# window instead, so a bounce arriving during a deploy waits rather than
# vanishing. Delivery is authorized by the runtime role's IAM grant, so the feed
# needs no shared secret and nothing lands in an access log.
#
# Raw message delivery stays off. The queue body is then the same SNS envelope
# an HTTPS endpoint receives, carrying MessageId and TopicArn, which is what the
# application claims for idempotency and checks against the configured topic.
#
# The sender identity's notification settings belong to production, as recorded
# above, so nothing publishes here on its own. This environment is where the
# queue path is rehearsed: a message published to the topic by hand exercises
# the whole poll, and that is the rehearsal production's first real bounce
# should not be.

resource "aws_sqs_queue" "ses_feedback_feed" {
  count                      = var.enable_feed_queues ? 1 : 0
  name                       = "${local.prefix}-ses-feedback-feed"
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 60
  sqs_managed_sse_enabled    = true

  # A message the worker keeps failing on must stop blocking the ones behind it.
  # Five attempts is enough to ride out a restart or a locked database and short
  # enough that a message the application cannot parse reaches the dead-letter
  # queue while an operator can still act on the retention window.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ses_feedback_feed_dlq[0].arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue" "ses_feedback_feed_dlq" {
  count                     = var.enable_feed_queues ? 1 : 0
  name                      = "${local.prefix}-ses-feedback-feed-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue_policy" "ses_feedback_feed" {
  count     = var.enable_feed_queues ? 1 : 0
  queue_url = aws_sqs_queue.ses_feedback_feed[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.ses_feedback_feed[0].arn
      Condition = {
        ArnEquals = { "aws:SourceArn" = aws_sns_topic.ses_feedback.arn }
      }
    }]
  })
}

resource "aws_sns_topic_subscription" "ses_feedback_feed" {
  count                = var.enable_feed_queues ? 1 : 0
  topic_arn            = aws_sns_topic.ses_feedback.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.ses_feedback_feed[0].arn
  raw_message_delivery = false
}
