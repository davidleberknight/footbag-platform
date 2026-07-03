# =============================================================================
# SES sender identity + domain authentication.
#
# Two layers of SES authentication:
#
# 1. Email identity (`aws_ses_email_identity.sender`).
#    Sufficient for SES sandbox sending. Operator supplies the verified
#    address in terraform.tfvars; SES emails a verification click-link to
#    that address after first apply.
#
# 2. Domain identity + DKIM + Route53 records (resources below, count-gated
#    by var.ses_enable_domain_auth, default false until the DNS handover).
#    Domain identity verification via DNS, DKIM CNAMEs, and SPF + DMARC TXT
#    records are required for SES production access (out of sandbox) and
#    for deliverability against major mail providers. Without DKIM-aligned
#    DMARC the platform's password-reset / claim / verify emails land in
#    spam at Gmail / Outlook / iCloud.
#
# LiveSesAdapter (src/adapters/sesAdapter.ts) sends outbound mail via SES
# with the From: header set to var.ses_sender_identity. The runtime role's
# ses:SendEmail grant on this identity is declared in iam.tf alongside the
# kms:Sign grant for JWT signing.
# =============================================================================

variable "ses_sender_identity" {
  description = <<-EOT
    SES-verified sender email address used as the From: header for outbound
    mail. Production canonical value: noreply@footbag.org. Operator supplies
    the verified identity in terraform.tfvars; verification happens via the
    SES email loop after the resource is created.
  EOT
  type        = string

  # Reject the terraform.tfvars.example placeholder. Without this, an
  # operator who copies the example verbatim creates a SES identity for
  # "TODO-noreply@footbag.org" that AWS will never verify, and the
  # failure only surfaces when outbound mail tries to use the identity.
  validation {
    condition     = !startswith(var.ses_sender_identity, "TODO-") && var.ses_sender_identity != ""
    error_message = "ses_sender_identity must be a real verified sender address; the terraform.tfvars.example placeholder (TODO-...) is rejected."
  }
}

variable "ses_enable_domain_auth" {
  description = <<-EOT
    Set to true to provision the SES domain identity, DKIM verification,
    and SPF/DMARC TXT records. Required before exiting SES sandbox and
    before any meaningful deliverability. Default FALSE: the webmaster holds
    the authoritative zone until the DNS-handover milestone, so the Route 53
    records these resources create would not resolve; flip to true only when
    var.route53_zone_id names a zone Route 53 actually serves.
  EOT
  type        = bool
  default     = false
}

variable "ses_dmarc_rua_email" {
  description = <<-EOT
    Aggregate-report mailbox for DMARC reports. Receives daily XML reports
    summarising SPF/DKIM pass/fail rates per sending IP. Typical pattern:
    dmarc-reports@<domain> with a forwarder to the operator inbox. Mailbox
    must be able to receive ~1 MB attachments; some mail receivers also
    require the address to belong to the policy domain or a related
    domain. Operator supplies in terraform.tfvars.
  EOT
  type        = string
  default     = ""
}

variable "ses_dmarc_policy" {
  description = <<-EOT
    DMARC policy stage for the _dmarc TXT record. The rollout is staged:
    monitor-only (none) with the report mailbox first, then quarantine once
    the sender list is confirmed and the aggregate reports run clean, then
    reject. At the optional Route 53 handover, set this to the stage the
    hand-applied zone record has already reached so Terraform reconciles
    without regressing the policy.
  EOT
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.ses_dmarc_policy)
    error_message = "ses_dmarc_policy must be one of: none, quarantine, reject."
  }
}

resource "aws_ses_email_identity" "sender" {
  email = var.ses_sender_identity
}

# ── Domain identity ──────────────────────────────────────────────────────────
# SES needs an `aws_ses_domain_identity` to issue domain-scoped DKIM tokens.
# The verification token is a TXT record at _amazonses.<domain>.

resource "aws_ses_domain_identity" "main" {
  count  = var.ses_enable_domain_auth ? 1 : 0
  domain = var.domain_name
}

resource "aws_route53_record" "ses_domain_verification" {
  count   = var.ses_enable_domain_auth ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main[0].verification_token]
}

resource "aws_ses_domain_identity_verification" "main" {
  count      = var.ses_enable_domain_auth ? 1 : 0
  domain     = aws_ses_domain_identity.main[0].id
  depends_on = [aws_route53_record.ses_domain_verification]
}

# ── DKIM ─────────────────────────────────────────────────────────────────────
# SES issues three CNAME tokens for domain-keys-signing. They are
# domain-scoped subdomain CNAMEs under <token>._domainkey.<domain> that
# resolve to <token>.dkim.amazonses.com.

resource "aws_ses_domain_dkim" "main" {
  count  = var.ses_enable_domain_auth ? 1 : 0
  domain = aws_ses_domain_identity.main[0].domain
}

resource "aws_route53_record" "ses_dkim" {
  count   = var.ses_enable_domain_auth ? 3 : 0
  zone_id = var.route53_zone_id
  name    = "${aws_ses_domain_dkim.main[0].dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main[0].dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# ── Custom MAIL FROM domain ──────────────────────────────────────────────────
# Without a custom MAIL FROM, SES uses <region>.amazonses.com as the envelope
# Return-Path, so SPF can never DMARC-align with the From: domain and
# deliverability leans solely on DKIM. A MAIL FROM subdomain (mail.<domain>)
# gives a Return-Path under the org domain that aligns under relaxed SPF (see
# the DMARC aspf=r below) and improves sender reputation at major receivers. It
# needs its own MX (to the SES feedback endpoint) and SPF TXT record.

resource "aws_ses_domain_mail_from" "main" {
  count            = var.ses_enable_domain_auth ? 1 : 0
  domain           = aws_ses_domain_identity.main[0].domain
  mail_from_domain = "mail.${var.domain_name}"
}

resource "aws_route53_record" "ses_mail_from_mx" {
  count   = var.ses_enable_domain_auth ? 1 : 0
  zone_id = var.route53_zone_id
  name    = aws_ses_domain_mail_from.main[0].mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  count   = var.ses_enable_domain_auth ? 1 : 0
  zone_id = var.route53_zone_id
  name    = aws_ses_domain_mail_from.main[0].mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# ── SPF ──────────────────────────────────────────────────────────────────────
# Single TXT record at the apex listing every authorised sender. The platform
# app is outbound-only through SES (`include:amazonses.com`). The domain is not
# SES-only: Google Workspace outbound for @footbag.org is authorised broadly via
# `include:_spf.google.com`, and the webmaster's `brat@` sending host is added
# here once the mail-sender scope is settled. ~all (softfail) is the conservative
# starting policy; tighten to -all (fail) once deliverability is verified across
# major receivers.

resource "aws_route53_record" "spf" {
  count   = var.ses_enable_domain_auth ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com include:_spf.google.com ~all"]
}

# ── DMARC ────────────────────────────────────────────────────────────────────
# Staged rollout: monitor-only (p=none) with aggregate reports first, so the
# platform learns about failures without dropping legitimate mail; quarantine
# once the sender list is confirmed and the reports run clean; reject last.
# var.ses_dmarc_policy carries the current stage. aspf=r (relaxed) so the
# custom MAIL FROM subdomain (mail.<domain>) Return-Path aligns; adkim=s stays
# strict because the domain DKIM signs d=<domain>, matching the From: domain.

resource "aws_route53_record" "dmarc" {
  count   = var.ses_enable_domain_auth ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [
    "v=DMARC1; p=${var.ses_dmarc_policy}; rua=mailto:${var.ses_dmarc_rua_email}; adkim=s; aspf=r; pct=100"
  ]

  # DMARC aggregate reports are useless without a destination, so the reporting
  # mailbox must be a real address before SES domain auth goes live.
  lifecycle {
    precondition {
      condition     = var.ses_dmarc_rua_email != ""
      error_message = "ses_dmarc_rua_email must be set to a real mailbox before enabling SES domain auth, so DMARC aggregate reports have a destination."
    }
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

# When domain-level auth is enabled, mail sends under the domain identity;
# its feedback must reach the same topic.
resource "aws_ses_identity_notification_topic" "domain_bounce" {
  count                    = var.ses_enable_domain_auth ? 1 : 0
  identity                 = aws_ses_domain_identity.main[0].arn
  notification_type        = "Bounce"
  topic_arn                = aws_sns_topic.ses_feedback.arn
  include_original_headers = false
}

resource "aws_ses_identity_notification_topic" "domain_complaint" {
  count                    = var.ses_enable_domain_auth ? 1 : 0
  identity                 = aws_ses_domain_identity.main[0].arn
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
