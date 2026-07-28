# =============================================================================
# Route 53 DNS Records
#
# Terraform owns the apex and www answers across the whole transition, not only
# after the switch. The zone moves to Route 53 early as advance preparation, and
# from that moment these records carry the legacy host's values so resolution is
# unchanged; at the freeze they become ALIAS records to the distribution.
#
# Declaring both states in one resource is what makes the switch a planned
# change. A record created by hand and later created again by Terraform collides
# instead, because allow_overwrite is deliberately left at its default so an
# unimported record fails loudly rather than being silently replaced. www also
# changes type at the switch (CNAME to A), and Route 53 will not hold a CNAME and
# an A for the same name at once, so the old record has to be gone before the new
# one is written -- which is exactly what a type change on one resource does.
#
# The hosted zone must exist before apply (import it; Console edits are not
# the canonical path).
# =============================================================================

locals {
  # True once the apex and www point at the distribution; false through the
  # zone-move window, while they still answer with the legacy host's values.
  apex_alias_mode = var.enable_cloudfront && var.enable_apex_alias_records
}

variable "enable_apex_alias_records" {
  description = "Point the apex/www records at CloudFront. Both are Route 53 ALIAS records to the distribution, and the apex redirects to www through it, so no separate redirector exists. Off until the switch itself: through the zone move these names keep answering with the legacy host's values, and this flag flips at the write-freeze."
  type        = bool
  default     = false
}

variable "enable_legacy_mirror_records" {
  description = "Carry the legacy host's answers in Terraform through the transition, so the zone serves them faithfully from the moment delegation lands and each switch is a Terraform change rather than a console edit. Covers the apex address and www here, and the apex MX and apex SPF in the mail records. On from the zone move until the legacy records are removed at post-cutover cleanup, NOT merely until the alias flip: the mail records count on this flag too, so turning it off while legacy mail can still be rolled back to means reverting the mail flag deletes the MX and apex TXT outright instead of restoring the legacy values."
  type        = bool
  default     = false
}

variable "legacy_apex_ipv4" {
  description = "IPv4 address the legacy host answers on for the apex, read from the fresh zone snapshot taken before the move. Set in tfvars while enable_legacy_mirror_records is on."
  type        = string
  default     = ""
}

# The apex answers with the legacy host through the zone-move window and with the
# distribution from the freeze. The TTL is 60 in both states: the switch needs a
# low TTL to converge in minutes, and setting it at the move rather than 48 hours
# beforehand means there is no separate TTL-drop step to forget.
resource "aws_route53_record" "apex_a" {
  count   = local.apex_alias_mode || var.enable_legacy_mirror_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  # records/ttl and alias are mutually exclusive on this resource, so each state
  # nulls the other's arguments.
  ttl     = local.apex_alias_mode ? null : 60
  records = local.apex_alias_mode ? null : [var.legacy_apex_ipv4]

  dynamic "alias" {
    for_each = local.apex_alias_mode ? [1] : []
    content {
      name                   = aws_cloudfront_distribution.main[0].domain_name
      zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
      evaluate_target_health = false
    }
  }

  lifecycle {
    precondition {
      condition     = local.apex_alias_mode || var.legacy_apex_ipv4 != ""
      error_message = "legacy_apex_ipv4 must be set from the fresh zone snapshot while the apex still answers with the legacy host, or the apex answer is lost the moment delegation moves to Route 53."
    }
  }
}

# www is a CNAME to the apex on the legacy zone and an A ALIAS to the
# distribution afterwards. type is ForceNew, so the flip destroys the CNAME and
# creates the A within one plan, in the order Route 53 requires.
resource "aws_route53_record" "www" {
  count   = local.apex_alias_mode || var.enable_legacy_mirror_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "www.${var.domain_name}"
  type    = local.apex_alias_mode ? "A" : "CNAME"

  ttl     = local.apex_alias_mode ? null : 60
  records = local.apex_alias_mode ? null : [var.domain_name]

  dynamic "alias" {
    for_each = local.apex_alias_mode ? [1] : []
    content {
      name                   = aws_cloudfront_distribution.main[0].domain_name
      zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
      evaluate_target_health = false
    }
  }
}

# The legacy zone carries no AAAA at either name, so the v6 records exist only in
# alias mode; there is nothing to mirror for them.
resource "aws_route53_record" "apex_aaaa" {
  count   = local.apex_alias_mode ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_aaaa" {
  count   = local.apex_alias_mode ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "www.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# preview.<domain> is the temporary pre-cutover platform hostname: it points
# the operator at the real distribution for the pre-cutover exercises while
# the apex and www still serve the legacy site. Verified against the live
# zone before creation (the name must have no record of any type there) and
# removed at cutover. Gated separately from the apex flip so it can exist
# through the whole pre-cutover window.
variable "enable_preview_record" {
  description = "Create the preview.<domain> alias records to CloudFront for the pre-cutover exercises. On after the zone move once the name is re-verified absent from the zone snapshot; removed at cutover."
  type        = bool
  default     = false
}

resource "aws_route53_record" "preview_a" {
  count   = var.enable_cloudfront && var.enable_preview_record ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "preview.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "preview_aaaa" {
  count   = var.enable_cloudfront && var.enable_preview_record ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "preview.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# CAA constrains TLS certificate issuance to Amazon's certificate authority (the
# one ACM uses), so no other CA can issue a certificate for footbag.org or its
# subdomains. A CAA at the apex is inherited by www and archive. It lands with
# the alias flip rather than at the zone move, so the window in which ACM issues
# has no CAA at all, which permits issuance rather than blocking it.
resource "aws_route53_record" "caa" {
  count   = local.apex_alias_mode ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "CAA"
  ttl     = 300
  records = [
    "0 issue \"amazon.com\"",
    "0 issuewild \"amazon.com\"",
  ]
}
