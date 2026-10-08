# =============================================================================
# SES sender identity + domain authentication.
#
# Two layers of SES authentication, switched by four flags in order, because
# creating the domain identity, publishing its records, retiring the interim
# sender and moving inbound mail are four different moments, and only the
# third destroys anything:
#
# 1. Email identity (`aws_ses_email_identity.sender`).
#    Sufficient for sending on its own. Operator supplies the verified
#    address in terraform.tfvars; SES emails a verification click-link to
#    that address after first apply. It exists until
#    var.ses_sender_on_domain_identity retires it: from then on sending
#    happens under the domain and no verification link is sent to an address
#    that is deliberately never monitored.
#
# 2. Domain identity + DKIM, in two steps. var.ses_enable_domain_identity
#    creates the identity and its DKIM tokens and publishes nothing, so it
#    touches no record and no sender. var.ses_enable_domain_auth then writes
#    the verification TXT and the three DKIM CNAMEs into the zone and waits
#    for SES to verify, which only works once the registrar delegates to that
#    zone. Neither changes the apex, so both are invisible to whoever holds
#    the domain's mail, and verification completes ahead of the mail move
#    rather than waiting on it.
#
#    That is a statement about which records these flags write, not about
#    whether the mail move is required. It is: the site is not fully
#    functional until the apex mail records are IFPA's, because they gate
#    every address it publishes to receive on. The two are needed together
#    and changed separately, which is why they land on different days.
#
# 3. Retiring the interim sender (var.ses_sender_on_domain_identity) is the
#    one destructive step, so it has a flag of its own. It sets
#    aws_ses_email_identity.sender to count = 0, and the destroy is one-way:
#    recreating the interim address later needs a fresh click-link sent to an
#    address the design keeps unmonitored. The validation blocks refuse it
#    unless the domain-auth flag is on and ses_sender_identity moves to an
#    address at the domain in the same change, because the domain identity
#    does not authorise the interim address. What they cannot see is whether
#    SES has finished verifying the domain, because that is a fact about AWS
#    at one moment rather than about this configuration. That check belongs
#    to the sender cutover operation, which runs it before this apply: the
#    domain verified for sending in an earlier apply, the outbox paused, and
#    the host re-reading the sender from this configuration's outputs before
#    sending resumes. Kept out of every plan on purpose: a plan-time read of
#    the domain would also refuse the plan that repairs a deleted identity.
#
# 4. The mail-day records (var.ses_enable_mail_records): the apex SPF, the
#    DMARC record, the custom MAIL FROM subdomain records and the repoint of
#    the apex MX to Google, all in one apply. The MX repoint is what ties the
#    group to the day inbound mail moves, because it redirects live delivery.
#    The apex SPF is replaced rather than extended, which drops the previous
#    mail host's explicit authorisation, so that host stops being an
#    authorised sender at this apply. The Workspace signing key is not in
#    this group: it publishes ahead of it (var.google_dkim_txt). This flag
#    requires the domain-auth flag to be on.
#
# The order between the flags is enforced in their validation blocks, which
# always evaluate. A precondition on a counted resource would not do: it is
# checked only while the resource exists, and the sender identity ceases to
# exist at exactly the step that most needs the check.
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
    mail. Production canonical value: noreply@footbag.org, which is sent under
    the domain identity and accepted only with ses_sender_on_domain_identity
    on. Before that, an interim address off the domain, verified as an email
    identity of its own through the SES email loop after the resource is
    created.
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

variable "ses_permitted_from_addresses" {
  description = <<-EOT
    Every From address the runtime role may send as. Empty means the sender
    identity alone.

    IT MUST NOT BE LEFT EMPTY IN PRODUCTION. The community announce list is
    seeded with its own from address in database/schema.sql and the broadcast
    service passes it through to the send, so `announce@footbag.org` belongs in
    this list. Without it that condition permits only the environment's default
    sender and every community announcement is refused at the outbox drain,
    after the member has already been told the send succeeded. An earlier version
    of this description asserted that no mailing list sets its own from address;
    that was never true of the announce list.

    This exists because the send grant's resource cannot narrow far enough on
    its own. While a single verified address is the identity, naming it as the
    resource does bound the grant to that address. Once domain authentication is
    enabled the identity becomes the whole domain, and the same grant then
    authorises sending as any address at it, the officer and board addresses
    included. The condition built from this list keeps the bound where it was.

    A list rather than one value so the documented per-list from address stays
    reachable: a mailing list that needs its own sender is added here, and the
    failure if it is not is an apply-time absence rather than an unexplained
    authorisation denial in the middle of a send.
  EOT
  type        = list(string)
  default     = []
}

variable "ses_enable_domain_identity" {
  description = <<-EOT
    Set to true to create the SES domain identity and its three DKIM tokens.
    Publishes no record and leaves the interim sender identity alone, so it is
    safe at any time; the verification token and the DKIM name/value pairs
    become readable as outputs. Flip it close to the zone move rather than
    weeks ahead: SES gives up on a domain that stays unverified for about 72
    hours, and the verification wait never accepts an identity SES has marked
    failed, so the domain-auth apply then fails after its 45-minute wait. If
    that happens, turn this flag and ses_enable_domain_auth off in one apply,
    which destroys the unused identity, its tokens and their records, and both
    on again in the next, so a fresh identity verifies against records
    published at once.
  EOT
  type        = bool
  default     = false
}

variable "ses_enable_domain_auth" {
  description = <<-EOT
    Set to true to publish the domain identity's verification TXT and DKIM
    CNAMEs into the zone, wait for SES to verify the domain, and attach the
    bounce and complaint notifications to it. Not required for production
    sending access, which this account already holds without a domain
    identity; what it buys is signing under the domain, which is what lets the
    reporting policy tighten past monitor-only. Touches no apex record and no
    sender, so it is safe while another host still handles the domain's mail.
    Flip it at the zone move, once the registrar delegates the domain to the
    zone this configuration creates: before that the records do not resolve,
    and the verification wait holds the apply for up to 45 minutes and fails.
    Requires ses_enable_domain_identity.
  EOT
  type        = bool
  default     = false

  validation {
    condition     = !var.ses_enable_domain_auth || var.ses_enable_domain_identity
    error_message = "ses_enable_domain_auth requires ses_enable_domain_identity: the records it publishes carry that identity's verification token and DKIM tokens."
  }
}

variable "ses_sender_on_domain_identity" {
  description = <<-EOT
    Set to true to retire the single-address sender identity and send under
    the domain identity. This is the one-way step: the interim identity is
    destroyed, and recreating it needs a click-link sent to an address the
    design keeps unmonitored. Flip it in the same change that moves
    ses_sender_identity and ses_permitted_from_addresses to the domain, with
    the outbox paused, and only once SES reports the domain verified for
    sending after an earlier domain-auth apply: never in the same apply as
    ses_enable_domain_auth, whose verification wait can fail after this
    apply has already destroyed the interim identity. Requires
    ses_enable_domain_auth.
  EOT
  type        = bool
  default     = false

  validation {
    condition     = !var.ses_sender_on_domain_identity || var.ses_enable_domain_auth
    error_message = "ses_sender_on_domain_identity requires ses_enable_domain_auth: retiring the interim sender before the domain identity is published and verified leaves no identity that authorises sending."
  }

  validation {
    condition     = !var.ses_sender_on_domain_identity || endswith(lower(var.ses_sender_identity), "@${lower(var.domain_name)}")
    error_message = "ses_sender_on_domain_identity is on, so ses_sender_identity must be an address at ${var.domain_name}: the domain identity does not authorise the interim sender, and this apply destroys that interim identity one-way. Move the sender in the same change that sets the flag."
  }

  # The other direction. Changing the address alone replaces the email
  # identity: the verified one is destroyed and a new one is created that
  # nobody can verify, because the canonical address is never monitored. An
  # address at the domain belongs to the domain identity, so it moves only with
  # this flag, which retires the email identity instead of replacing it. Both
  # directions sit on this variable because Terraform refuses two validations
  # that each read the other's variable.
  validation {
    condition     = var.ses_sender_on_domain_identity || !endswith(lower(var.ses_sender_identity), "@${lower(var.domain_name)}")
    error_message = "ses_sender_identity is an address at ${var.domain_name}, but ses_sender_on_domain_identity is off, so it would become an email identity of its own that nobody can verify, replacing any verified interim identity. Until the domain identity has verified, keep the sender on an interim address off the domain; afterwards, move it in the same change that sets ses_sender_on_domain_identity."
  }
}

variable "ses_enable_mail_records" {
  description = <<-EOT
    Set to true on the day inbound mail moves: publishes the apex SPF, the
    DMARC record and the custom MAIL FROM subdomain records, and repoints the
    apex MX to Google in the same apply. Flip it only once every published
    address is provisioned on Google, because the repoint sends live inbound
    delivery there immediately, and only once the Workspace signing key
    published through google_dkim_txt is authenticating, so mail sent from
    Google-hosted addresses is signed before this apply replaces the apex
    sender policy. Requires ses_enable_domain_auth to be true.
  EOT
  type        = bool
  default     = false

  validation {
    condition     = !var.ses_enable_mail_records || (var.ses_enable_domain_identity && var.ses_enable_domain_auth)
    error_message = "ses_enable_mail_records requires ses_enable_domain_identity and ses_enable_domain_auth: the MAIL FROM subdomain hangs off the SES domain identity, and the apex SPF without the DKIM records leaves outbound mail authorised by SPF alone."
  }
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
    reject. Where a DMARC record was already published by hand on the zone
    before it moved here, set this to the stage that record had reached, so
    Terraform reconciles onto it without regressing the policy.
  EOT
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.ses_dmarc_policy)
    error_message = "ses_dmarc_policy must be one of: none, quarantine, reject."
  }
}

locals {
  # The validation blocks already refuse domain auth without the identity, so
  # in a valid configuration this equals ses_enable_domain_auth. Written as the
  # conjunction so that every resource indexing the identity is counted on the
  # identity existing, and an invalid combination fails on its validation
  # message rather than on an index error.
  ses_domain_auth_on = var.ses_enable_domain_identity && var.ses_enable_domain_auth
}

# The single-address identity covers sending before the domain identity
# exists. AWS verifies it by emailing a click-link to the address itself, so
# it is retired once sending moves under the domain: the canonical design keeps
# that address unmonitored, and a domain identity authorises the same From
# address without any inbound route.
resource "aws_ses_email_identity" "sender" {
  count = var.ses_sender_on_domain_identity ? 0 : 1
  email = var.ses_sender_identity
}

# ── Domain identity ──────────────────────────────────────────────────────────
# SES needs an `aws_ses_domain_identity` to issue domain-scoped DKIM tokens.
# The verification token is a TXT record at _amazonses.<domain>.

resource "aws_ses_domain_identity" "main" {
  count  = var.ses_enable_domain_identity ? 1 : 0
  domain = var.domain_name
}

resource "aws_route53_record" "ses_domain_verification" {
  count   = local.ses_domain_auth_on ? 1 : 0
  zone_id = local.zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main[0].verification_token]
}

resource "aws_ses_domain_identity_verification" "main" {
  count      = local.ses_domain_auth_on ? 1 : 0
  domain     = aws_ses_domain_identity.main[0].id
  depends_on = [aws_route53_record.ses_domain_verification]
}

# ── DKIM ─────────────────────────────────────────────────────────────────────
# SES issues three CNAME tokens for domain-keys-signing. They are
# domain-scoped subdomain CNAMEs under <token>._domainkey.<domain> that
# resolve to <token>.dkim.amazonses.com.

resource "aws_ses_domain_dkim" "main" {
  count  = var.ses_enable_domain_identity ? 1 : 0
  domain = aws_ses_domain_identity.main[0].domain
}

resource "aws_route53_record" "ses_dkim" {
  count   = local.ses_domain_auth_on ? 3 : 0
  zone_id = local.zone_id
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
      error_message = "ses_enable_mail_records requires ses_enable_domain_auth: the MAIL FROM subdomain hangs off the SES domain identity, whose records the domain-auth flag publishes."
    }
  }
}

resource "aws_route53_record" "ses_mail_from_mx" {
  count   = var.ses_enable_mail_records ? 1 : 0
  zone_id = local.zone_id
  name    = aws_ses_domain_mail_from.main[0].mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  count   = var.ses_enable_mail_records ? 1 : 0
  zone_id = local.zone_id
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
  zone_id = local.zone_id
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
  zone_id = local.zone_id
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
      error_message = "ses_dmarc_rua_email must be set to a real mailbox before enabling ses_enable_mail_records, which is the flag that publishes this DMARC record, so aggregate reports have a destination."
    }
  }
}

# ── Inbound mail: Google Workspace ───────────────────────────────────────────
# The apex MX is not an SES record, but it lands on the same day as the apex
# SPF and DMARC and shares their flag: publishing it earlier would divert
# inbound mail before every active address is provisioned on Google, and
# inbound arriving at a mailbox that does not exist is lost silently. The
# Workspace DKIM key diverts nothing, so it is not on this flag. A single MX is
# deliberate -- no backup pointing at the retiring host, which stops accepting
# mail when its operator powers it down.

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
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 3600
  records = var.ses_enable_mail_records ? ["1 smtp.google.com"] : var.legacy_mx_records

  lifecycle {
    precondition {
      condition     = var.ses_enable_mail_records || length(var.legacy_mx_records) > 0
      error_message = "legacy_mx_records must be set from the fresh zone snapshot while the legacy host still receives mail, or inbound mail stops the moment delegation moves to Route 53."
    }

    # The mail apply replaces the apex sender policy, after which mail sent from
    # Google-hosted addresses relies on Google's signature; it must already be
    # published and signing.
    precondition {
      condition     = !var.ses_enable_mail_records || var.google_dkim_txt != ""
      error_message = "ses_enable_mail_records requires google_dkim_txt: the Google signing key must be published and authenticating before the mail apply, or Workspace mail, including the legacy webmaster's brat@ mail, goes out unsigned once the apex sender policy changes."
    }
  }
}

variable "google_dkim_txt" {
  description = "Workspace DKIM public key for the google selector on footbag.org, generated in the Workspace admin console, never for the tenant's prefix domain, because the reporting policy uses strict signature alignment. Publishes as soon as it is set, independent of the mail-day flag, because the record diverts no mail. Before the zone move the legacy zone may serve an identical copy; either way this variable is the record's only declaration, never also the mirrored legacy text records, or the apply fails on a duplicate. Two clocks run before Workspace mail is signed: Google issues the key 24 to 72 hours after Gmail is turned on, and begins signing up to 48 hours after the record is published and authentication is started. Publishing it at least four days before the mail-day apply means Workspace outbound, including the legacy webmaster's brat@ mail, already carries an aligned signature when the apex sender policy changes. A 2048-bit key exceeds the 255-character limit on one TXT string, so write it as one value with an escaped empty-quote pair after the first 255 characters (v=DKIM1; k=rsa; p=first255characters\"\"rest), with no outer quotes: the provider adds those, and splits the value there."
  type        = string
  default     = ""
}

# Gated only on a non-empty key. It publishes ahead of mail day so Google is
# signing before the apex sender policy changes, and a mail-day rollback leaves
# it in place, since Google keeps signing whichever policy is live.
resource "aws_route53_record" "google_dkim" {
  count   = var.google_dkim_txt != "" ? 1 : 0
  zone_id = local.zone_id
  name    = "google._domainkey.${var.domain_name}"
  type    = "TXT"
  ttl     = 3600
  records = [var.google_dkim_txt]
}

# =============================================================================
# Sending streams: transactional and bulk kept apart
# =============================================================================
# SES keeps reputation metrics per configuration set, so naming one on a send
# is what decides whose reputation a complaint lands on. The platform sends two
# kinds of mail with opposite risk profiles: transactional mail is one member,
# one action they took, and non-delivery of a password reset locks someone out;
# bulk mail is a newsletter or an announcement to hundreds of addresses of
# mixed freshness, and it is where complaints and hard bounces come from.
# Sharing one stream means a bad newsletter degrades password resets, so the
# two are separated before the first staged bulk send goes out.
#
# The application picks the set per message: a copy addressed to a mailing list
# is bulk, everything else is transactional. It passes no set at all until
# SES_CONFIGURATION_SET_TRANSACTIONAL and SES_CONFIGURATION_SET_BULK are in the
# runtime environment, so these resources are safe to apply before the app
# knows about them, and applying them changes nothing on its own.
#
# Bounce and complaint feedback continues to arrive through the identity
# notification topics below, which are identity-scoped and unaffected by this
# split; what changes is only which reputation the event is counted against.

resource "aws_ses_configuration_set" "transactional" {
  name                       = "${local.prefix}-transactional"
  reputation_metrics_enabled = true
}

resource "aws_ses_configuration_set" "bulk" {
  name                       = "${local.prefix}-bulk"
  reputation_metrics_enabled = true
}

# =============================================================================
# SES feedback loop -- bounce/complaint notifications to the worker's queue
# =============================================================================
# Bounces and complaints publish to an SNS topic, and a queue subscribed to
# that topic is polled by the worker. The app marks the matching member's
# email_status so later sends skip dead or complaining addresses. There is no
# public endpoint and no shared secret: the queue read is authorized by the
# host's own runtime role, and a queue subscription needs no out-of-band
# confirmation.
#
# The flag does NOT gate this whole section, and the difference matters. The
# topic below and the identity notification settings that publish into it stand
# unconditionally (each pair of notification settings follows whether its own
# identity exists, which decides which identity they attach to, not whether any
# feedback is published). Only the
# queue, its dead-letter queue, their policies and the subscription are counted
# on enable_feed_queues.
#
# So turning the flag off, or never turning it on, leaves the provider still
# publishing bounces and complaints into a topic with nothing subscribed, and
# the provider discards them. Mail goes out, dead mailboxes are never recorded,
# and the bulk stream's feedback halt reads an empty table and reports a healthy
# send throughout a bounce storm. Nothing here refuses that combination: the
# ordering is deliberately enforced by the operator activation sequence rather
# than at apply time, so that standing the queues up and arming the sender stay
# independent steps.

resource "aws_sns_topic" "ses_feedback" {
  name = "${local.prefix}-ses-feedback"

  # Bounce and complaint notifications carry the recipient's address, so they
  # are member data at rest here as much as anywhere else in this tree. The
  # provider's own security baseline treats an unencrypted topic as a failing
  # control. The queue leg is already encrypted; this closes the hop before it.
  #
  # The main key rather than the managed one, because the mail service can only
  # be granted use of a customer-managed key, and it needs that use to publish
  # into an encrypted topic at all. The grant lives in kms.tf beside the
  # equivalent one for parameter store.
  kms_master_key_id = aws_kms_key.main.arn
}

# Attaching any policy replaces the default one, so the owner statement is
# restated here rather than inherited: without it this account keeps access only
# through identity policies, and a topic whose resource policy names nobody is a
# trap for the next person to touch it.
#
# The publish statement is the point. The default policy blocks other accounts
# but says nothing about which service may publish, so the mail service's own
# setup documentation supplies this shape: the service principal, pinned to this
# account and to the identity the notifications belong to. Without the pin, any
# principal that can publish here could inject a bounce that arrives wrapped in
# the genuine topic identity the application checks before acting on it.
resource "aws_sns_topic_policy" "ses_feedback" {
  arn = aws_sns_topic.ses_feedback.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "OwnerFullAccess"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.aws_account_id}:root" }
        # Enumerated rather than a wildcard: SNS validates every action in a
        # topic policy against its own list and rejects `SNS:*` outright with
        # "Policy statement action out of service scope", so a wildcard here
        # fails the apply rather than granting broadly.
        Action   = local.sns_owner_actions
        Resource = aws_sns_topic.ses_feedback.arn
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

# Each identity carries its own pair, counted on that identity existing, so the
# two pairs coexist while both identities do: the interim sender keeps
# reporting its bounces while the domain identity verifies, and mail sent from
# a domain address before the sender moves reports through the domain pair.
resource "aws_ses_identity_notification_topic" "sender_bounce" {
  count                    = var.ses_sender_on_domain_identity ? 0 : 1
  identity                 = aws_ses_email_identity.sender[0].arn
  notification_type        = "Bounce"
  topic_arn                = aws_sns_topic.ses_feedback.arn
  include_original_headers = false
}

resource "aws_ses_identity_notification_topic" "sender_complaint" {
  count                    = var.ses_sender_on_domain_identity ? 0 : 1
  identity                 = aws_ses_email_identity.sender[0].arn
  notification_type        = "Complaint"
  topic_arn                = aws_sns_topic.ses_feedback.arn
  include_original_headers = false
}

# Mail sent under the domain identity reports to the same topic. SES refuses a
# notification topic on an identity that has not verified, so these name the
# identity through the verification resource: that orders them after the
# verification wait, and keeps them off while the identity merely exists.
resource "aws_ses_identity_notification_topic" "domain_bounce" {
  count                    = local.ses_domain_auth_on ? 1 : 0
  identity                 = aws_ses_domain_identity_verification.main[0].arn
  notification_type        = "Bounce"
  topic_arn                = aws_sns_topic.ses_feedback.arn
  include_original_headers = false
}

resource "aws_ses_identity_notification_topic" "domain_complaint" {
  count                    = local.ses_domain_auth_on ? 1 : 0
  identity                 = aws_ses_domain_identity_verification.main[0].arn
  notification_type        = "Complaint"
  topic_arn                = aws_sns_topic.ses_feedback.arn
  include_original_headers = false
}

# A new identity also mails every bounce and complaint to the sending address,
# which here is an address nobody reads, so the topics above are the only feedback
# path and forwarding is turned off. SES refuses that until both topics are
# attached, hence the ordering. Declared here rather than left as a console step,
# because a step done by hand is the one done out of order or not at all.
resource "aws_sesv2_email_identity_feedback_attributes" "domain" {
  count                    = local.ses_domain_auth_on ? 1 : 0
  email_identity           = aws_ses_domain_identity_verification.main[0].domain
  email_forwarding_enabled = false

  depends_on = [
    aws_ses_identity_notification_topic.domain_bounce,
    aws_ses_identity_notification_topic.domain_complaint,
  ]
}

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
