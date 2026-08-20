# =============================================================================
# SES sender identity + domain authentication.
#
# Two layers of SES authentication, and two flags, because the records land on
# two different days:
#
# 1. Email identity (`aws_ses_email_identity.sender`).
#    Sufficient for SES sandbox sending. Operator supplies the verified
#    address in terraform.tfvars; SES emails a verification click-link to
#    that address after first apply. It exists only while
#    var.ses_enable_domain_auth is false: once the domain identity is in
#    play, sending happens under the domain and no verification link is sent
#    to an address that is deliberately never monitored.
#
# 2. Domain identity + DKIM (var.ses_enable_domain_auth) go in first. They
#    are invisible to whoever currently holds the domain's mail: nothing at
#    the apex changes, so SES domain verification and the production-access
#    request can complete well ahead of any mail move. Flip this while the
#    application still runs the stub mail adapter, so swapping the address
#    identity for the domain identity cannot interrupt live sending.
#
# 3. Apex SPF, DMARC, and the custom MAIL FROM records
#    (var.ses_enable_mail_records) go in on the day inbound mail moves. They
#    replace the apex SPF the previous mail host published, so publishing
#    them early would leave that host's own mail unauthorised while it is
#    still sending. This flag requires the domain-auth flag to be on.
#
# Without DKIM-aligned DMARC the platform's password-reset / claim / verify
# emails land in spam at Gmail / Outlook / iCloud.
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
    Set to true to provision the SES domain identity, its DNS verification
    token, and the DKIM CNAMEs. Required before exiting SES sandbox and
    before any meaningful deliverability. Touches no apex record, so it is
    safe to flip while another host still handles the domain's mail. Turning
    it on retires the single-address sender identity, so flip it before
    production sending goes live. Default FALSE: until the zone move
    completes, the records these resources create would not resolve; flip to
    true only when var.route53_zone_id names a zone Route 53 actually serves.
  EOT
  type        = bool
  default     = false
}

variable "ses_enable_mail_records" {
  description = <<-EOT
    Set to true to publish the apex SPF, the DMARC record, and the custom
    MAIL FROM subdomain records. These replace the apex SPF that the previous
    mail host published, so they belong to the day inbound mail moves, not to
    the earlier domain-auth step. Requires ses_enable_domain_auth to be true.
  EOT
  type        = bool
  default     = false
}

variable "apex_txt_records" {
  description = <<-EOT
    Every apex TXT string OTHER than the SPF record this file builds. Route 53
    stores one record set per name and type, so all apex TXT strings live in
    one record and Terraform must declare all of them: any string left out of
    this list is destroyed when the apex TXT record applies. Provider
    verification strings (for example a Google Workspace site-verification
    token) belong here. Operator supplies the current values in
    terraform.tfvars, read from the live zone.
  EOT
  type        = list(string)
  default     = []
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

# The single-address identity covers sending before the domain identity
# exists. AWS verifies it by emailing a click-link to the address itself, so
# it is retired the moment domain auth is on: the canonical design keeps that
# address unmonitored, and a domain identity authorises the same From address
# without any inbound route.
resource "aws_ses_email_identity" "sender" {
  count = var.ses_enable_domain_auth ? 0 : 1
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
  count            = var.ses_enable_mail_records ? 1 : 0
  domain           = aws_ses_domain_identity.main[0].domain
  mail_from_domain = "mail.${var.domain_name}"

  lifecycle {
    precondition {
      condition     = var.ses_enable_domain_auth
      error_message = "ses_enable_mail_records requires ses_enable_domain_auth: the MAIL FROM subdomain hangs off the SES domain identity, which the domain-auth flag creates."
    }
  }
}

resource "aws_route53_record" "ses_mail_from_mx" {
  count   = var.ses_enable_mail_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = aws_ses_domain_mail_from.main[0].mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  count   = var.ses_enable_mail_records ? 1 : 0
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
# `include:_spf.google.com`, which also covers a person replying from a
# Google-hosted role mailbox. No raw ip4 sender is listed: every canonical
# @footbag.org address sends through SES or Google, and the legacy host's own
# sending addresses live on the pre-migration zone and are not carried over.
# ~all (softfail) is the conservative starting policy; tighten to -all (fail)
# once deliverability is verified across major receivers.
#
# This resource owns the whole apex TXT record set, because Route 53 stores one
# set per name and type. Every other apex TXT string in the zone must therefore
# be listed in var.apex_txt_records, or applying this record destroys it. Those
# strings are not decoration: a provider's domain-verification token lives there,
# and destroying it withdraws the proof of ownership the provider's own account
# recovery rests on. That is why an empty list is rejected below rather than
# treated as "no extra strings".
#
# Like the apex address and the MX, this record owns both of its states: the
# legacy host's SPF from the zone move, the platform's from email day. Declaring
# only the second means the first is applied by hand, and the flip then collides
# with it, because allow_overwrite stays at its default so an unimported record
# fails the apply loudly instead of being silently replaced. That collision would
# land inside the mail-cutover window, which is the worst place to discover it.

variable "legacy_apex_spf" {
  description = "Apex SPF string the previous mail host published, read from the fresh zone snapshot and carried through the zone-move window so outbound authorisation is unchanged until email day. Set in tfvars while enable_legacy_mirror_records is on."
  type        = string
  default     = ""
}

resource "aws_route53_record" "spf" {
  count   = var.ses_enable_mail_records || var.enable_legacy_mirror_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 600
  records = concat(
    [var.ses_enable_mail_records ? "v=spf1 include:amazonses.com include:_spf.google.com ~all" : var.legacy_apex_spf],
    var.apex_txt_records,
  )

  lifecycle {
    # Guarded by the mail-records flag: through the zone-move window this record
    # carries the legacy SPF, which needs no SES domain identity behind it.
    precondition {
      condition     = !var.ses_enable_mail_records || var.ses_enable_domain_auth
      error_message = "ses_enable_mail_records requires ses_enable_domain_auth: publishing the apex SPF without the DKIM records leaves outbound mail authorised by SPF alone."
    }

    precondition {
      condition     = var.ses_enable_mail_records || var.legacy_apex_spf != ""
      error_message = "legacy_apex_spf must be set from the fresh zone snapshot while the previous host still sends for the domain, or its senders lose SPF authorisation the moment delegation moves to Route 53."
    }

    precondition {
      condition     = length(var.apex_txt_records) > 0
      error_message = "apex_txt_records must list every apex TXT string other than the SPF record this file builds, read from the fresh zone snapshot. An empty list destroys the provider domain-verification tokens that share the apex TXT record set."
    }
  }
}

# ── DMARC ────────────────────────────────────────────────────────────────────
# Staged rollout: monitor-only (p=none) with aggregate reports first, so the
# platform learns about failures without dropping legitimate mail; quarantine
# once the sender list is confirmed and the reports run clean; reject last.
# var.ses_dmarc_policy carries the current stage. aspf=r (relaxed) so the
# custom MAIL FROM subdomain (mail.<domain>) Return-Path aligns; adkim=s stays
# strict because the domain DKIM signs d=<domain>, matching the From: domain.

resource "aws_route53_record" "dmarc" {
  count   = var.ses_enable_mail_records ? 1 : 0
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

# ── Inbound mail: Google Workspace ───────────────────────────────────────────
# The apex MX and the Workspace DKIM key are not SES records, but they land on
# the same day as the apex SPF and DMARC and share their flag: publishing them
# earlier would divert inbound mail before every active address is provisioned
# on Google, and inbound arriving at a mailbox that does not exist is lost
# silently. A single MX is deliberate -- no backup pointing at the retiring host,
# which stops accepting mail at cutover.

variable "legacy_mx_records" {
  description = "MX set the legacy mail host answers with, read from the fresh zone snapshot and carried through the zone-move window so inbound mail is unchanged until email day. Set in tfvars while enable_legacy_mirror_records is on."
  type        = list(string)
  default     = []
}

# Like the apex and www records, this one owns both states: the legacy host's MX
# from the zone move, the Google MX from email day. Declaring only the second
# would collide with the mirrored legacy record on the day inbound moves, since
# allow_overwrite stays at its default.
resource "aws_route53_record" "mx" {
  count   = var.ses_enable_mail_records || var.enable_legacy_mirror_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 3600
  records = var.ses_enable_mail_records ? ["1 smtp.google.com"] : var.legacy_mx_records

  lifecycle {
    precondition {
      condition     = var.ses_enable_mail_records || length(var.legacy_mx_records) > 0
      error_message = "legacy_mx_records must be set from the fresh zone snapshot while the legacy host still receives mail, or inbound mail stops the moment delegation moves to Route 53."
    }
  }
}

variable "google_dkim_txt" {
  description = "Workspace DKIM public key for the google selector, generated in the Workspace admin console. The key cannot be generated until Gmail has served the domain for 24 to 72 hours, so this stays empty when the MX first moves and is filled in afterwards. A 2048-bit key exceeds the 255-character limit on one TXT string, so supply it pre-split in quoted segments (\"v=DKIM1; k=rsa; p=first\" \"rest\")."
  type        = string
  default     = ""
}

# Gated on a non-empty key as well as the flag, because the key only exists once
# Gmail has been serving the domain for a day or more: mail day publishes the MX
# with no signature, and this record follows when the console can generate it.
resource "aws_route53_record" "google_dkim" {
  count   = var.ses_enable_mail_records && var.google_dkim_txt != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "google._domainkey.${var.domain_name}"
  type    = "TXT"
  ttl     = 3600
  records = [var.google_dkim_txt]
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
  count                    = var.ses_enable_domain_auth ? 0 : 1
  identity                 = aws_ses_email_identity.sender[0].arn
  notification_type        = "Bounce"
  topic_arn                = aws_sns_topic.ses_feedback.arn
  include_original_headers = false
}

resource "aws_ses_identity_notification_topic" "sender_complaint" {
  count                    = var.ses_enable_domain_auth ? 0 : 1
  identity                 = aws_ses_email_identity.sender[0].arn
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
