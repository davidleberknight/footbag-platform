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
#    by var.ses_enable_domain_auth, default true).
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
    before any meaningful deliverability. Default true on production; set
    false during the first apply pass if var.route53_zone_id is not yet
    populated (the records cannot be created without the hosted zone).
  EOT
  type        = bool
  default     = true
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

# ── SPF ──────────────────────────────────────────────────────────────────────
# Single TXT record at the apex listing every authorised sender. SES
# requires `include:amazonses.com`. ~all (softfail) is the conservative
# starting policy; tighten to -all (fail) once deliverability is verified
# across major receivers.

resource "aws_route53_record" "spf" {
  count   = var.ses_enable_domain_auth ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# ── DMARC ────────────────────────────────────────────────────────────────────
# Starts at p=quarantine with aggregate reports enabled so the platform
# learns about failures without instantly dropping legitimate mail.
# Tighten to p=reject after a week of clean reports.

resource "aws_route53_record" "dmarc" {
  count   = var.ses_enable_domain_auth ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [
    var.ses_dmarc_rua_email != ""
    ? "v=DMARC1; p=quarantine; rua=mailto:${var.ses_dmarc_rua_email}; adkim=s; aspf=s; pct=100"
    : "v=DMARC1; p=quarantine; adkim=s; aspf=s; pct=100"
  ]
}
