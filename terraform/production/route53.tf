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
# unimported record fails loudly rather than being silently replaced.
#
# Both names keep their type across the switch, so neither is ever deleted and
# recreated: the apex is an address record throughout, and www is an alias
# throughout, pointed at the apex in this zone before the freeze and at the
# distribution after it. Only an alias target changes, which Route 53 applies as
# one in-place update, so no interim window exists in which either name fails to
# resolve -- in that direction or on the way back.
#
# The hosted zone must exist before apply (import it; Console edits are not
# the canonical path).
# =============================================================================

locals {
  # True once the apex and www point at the distribution; false through the
  # zone-move window, while they still answer with the legacy host's values.
  apex_alias_mode = var.enable_platform_custom_domain && var.enable_apex_alias_records
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

# www is an ALIAS in both states: to the apex record in this same zone through
# the zone-move window, and to the distribution from the freeze. Only the target
# changes, so the flip and its revert are each a single in-place update.
#
# The legacy zone reaches www by a CNAME onto the apex, and copying that shape
# here would make the flip a type change. Type is ForceNew, so Route 53 would
# have to delete the CNAME and then create the address record as two separate
# calls -- Route 53 will not hold a CNAME and an address record at one name at
# the same time -- and between them www does not exist.
#
# Two exposures, and the second is the serious one. A resolver asking in that gap
# caches the no-such-name answer for the zone's SOA minimum, which on Route 53 is
# 60 seconds by default: the same order as the record TTL, so bad but bounded.
# The unbounded case is an apply that fails between the delete and the create,
# which leaves the canonical hostname absent until someone notices and re-applies.
# The rollback is the same change in reverse, so both exposures would land again
# during an incident, which is when they are least affordable.
#
# An alias avoids both outright, and Route 53 recommends an alias over a CNAME for
# a name pointing at another record in the same zone anyway. The runbook's own
# rule forbids replacing a record by deleting and recreating it, so this shape was
# the one place the tree contradicted it.
#
# What it costs, and only until the freeze: a CNAME answers a query of any type
# by chasing it to the target, while an alias answers only its own type. A mail
# lookup against www currently reaches the apex MX and afterwards gets an empty
# answer. Every mail-carrying name in the zone snapshot is elsewhere, and from
# the freeze both shapes behave identically because www points at the
# distribution either way.
resource "aws_route53_record" "www" {
  count   = local.apex_alias_mode || var.enable_legacy_mirror_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name    = local.apex_alias_mode ? aws_cloudfront_distribution.main[0].domain_name : var.domain_name
    zone_id = local.apex_alias_mode ? aws_cloudfront_distribution.main[0].hosted_zone_id : var.route53_zone_id

    # An in-zone alias inherits the target's TTL and answer, so the apex's 60s
    # carries to www without being restated.
    evaluate_target_health = false
  }

  # The in-zone target is a bare name, which creates no implicit dependency, so
  # nothing would otherwise stop Terraform creating www before the apex exists.
  depends_on = [aws_route53_record.apex_a]
}

variable "legacy_apex_cname_records" {
  description = "Legacy names that are CNAMEs onto the apex or www, as name => target, read from the fresh zone snapshot. Set in tfvars while enable_legacy_mirror_records is on. The zone transfer found five (fi, ftp, v, worlds, worldchampionships); take the set from the capture rather than from that list. Anything left out of this map is not carried through the zone move at all, and anything left in it after the flip resolves to a distribution that refuses it."
  type        = map(string)
  default     = {}
}

# The names that ride the apex and www, and therefore have to leave with them.
#
# Because each is a CNAME onto one of the two names being switched, the instant
# the flip lands they follow it to the distribution -- which answers a hostname
# its certificate does not cover with a refusal rather than a page. So they
# cannot be deferred to a later cleanup pass: deferring by even an hour means an
# hour of visitors reaching an error on names that served a page a moment
# earlier. The gate for their removal is therefore the flip itself, not the
# mirror flag, which stays on past the flip because the mail records count on it.
# Removed in the same apply that switches the alias, which is what the cutover
# runbook requires and what nothing previously implemented: these names had no
# Terraform resource, so no apply could remove them.
#
# The rest of the mirrored zone is not here. The transfer returns 51 names and
# the capture that enumerates them is taken immediately before the move, so the
# values are not knowable now; these five are, because the design names them
# explicitly and their disposition is fixed by their shape.
resource "aws_route53_record" "legacy_apex_cnames" {
  for_each = var.enable_legacy_mirror_records && !local.apex_alias_mode ? var.legacy_apex_cname_records : {}

  zone_id = var.route53_zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "CNAME"
  ttl     = 60
  records = [each.value]
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
  count   = var.enable_platform_custom_domain && var.enable_preview_record ? 1 : 0
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
  count   = var.enable_platform_custom_domain && var.enable_preview_record ? 1 : 0
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
