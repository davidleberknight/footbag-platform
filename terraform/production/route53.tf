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
# Terraform owns the hosted zone itself, so there is nothing to create by hand
# and nothing to import before the first apply. Every record below writes into
# it directly.
# =============================================================================

# The zone is created empty and is inert until the registrar delegates to it, so
# it can be stood up and filled long before anything switches. Creating it here
# rather than by hand also means the four nameservers the registrar needs are an
# output of this configuration instead of values read off a console screen and
# dictated over a phone call, which is the step where a transcription error costs
# the domain.
#
# prevent_destroy is a durability guarantee, not decoration. Route 53 assigns a
# zone's nameservers when it is created, so a destroyed and recreated zone comes
# back with four different ones. The registrar would still be pointing at the old
# four, and the domain would stop resolving with nothing in the diff to explain
# it.
resource "aws_route53_zone" "primary" {
  name    = var.domain_name
  comment = "footbag.org production zone, moved from the legacy nameservers as go-live preparation"

  lifecycle {
    prevent_destroy = true
  }
}

output "route53_name_servers" {
  description = "The four nameservers to enter at the registrar. Read them from here rather than from the console, and hand them to whoever makes the registrar change."
  value       = aws_route53_zone.primary.name_servers
}

locals {
  zone_id = aws_route53_zone.primary.zone_id

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
  zone_id = local.zone_id
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
# caches the no-such-name answer for the shorter of the zone's SOA record TTL and
# its minimum field, which on a Route 53 zone left at its defaults is 900 seconds:
# fifteen minutes, an order of magnitude longer than the record TTL, so the gap
# outlives the change that caused it.
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
  zone_id = local.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name    = local.apex_alias_mode ? aws_cloudfront_distribution.main[0].domain_name : var.domain_name
    zone_id = local.apex_alias_mode ? aws_cloudfront_distribution.main[0].hosted_zone_id : local.zone_id

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
# These five are separated from the rest of the mirrored zone because their
# disposition is fixed by their shape rather than by the cleanup schedule: they
# ride the apex and www, so they leave with them. Every other legacy name is
# carried by the general mirror below and retires in the later cleanup pass.
resource "aws_route53_record" "legacy_apex_cnames" {
  for_each = var.enable_legacy_mirror_records && !local.apex_alias_mode ? var.legacy_apex_cname_records : {}

  zone_id = local.zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "CNAME"
  ttl     = 60
  records = [each.value]
}

# -----------------------------------------------------------------------------
# The rest of the legacy zone.
#
# The design requires the zone move to mirror every existing record faithfully,
# so that changing which servers answer changes nothing about what they answer.
# The apex, www and the five names that ride them are declared above because each
# has its own switch behaviour. Everything else in the zone is carried here, as
# values read from the zone snapshot and set in the private values file.
#
# Two of these names are load-bearing rather than legacy debris, which is why
# omitting them is not a cosmetic gap. The apex mail records name a host inside
# this zone as their primary destination, so without that host's address record
# the apex would advertise a mail destination that does not resolve. And the
# Workspace's own domain is served from this zone rather than delegated, so
# without its mail records the mailboxes and groups on it stop receiving the
# moment delegation lands -- including the account needed to recover
# administrative control of that Workspace.
#
# These names retire in the post-cutover cleanup pass rather than at the alias
# flip, so they are gated on the mirror flag alone. The mail-carrying ones among
# them are removed only after inbound mail has moved, never before, or an address
# is left with no delivery path.
#
# One deliberate and harmless departure from "every record": the zone publishes
# four records of the obsolete SPF resource type alongside identical TXT records
# at the same names. Route 53 no longer offers that type, receivers ignore it, and
# the TXT twin of each is carried here, so nothing is lost by dropping them.
# -----------------------------------------------------------------------------

variable "legacy_mirror_a_records" {
  description = "Legacy names answering with an address record, as name => IPv4, read from the zone snapshot. Set in tfvars while enable_legacy_mirror_records is on. Anything left out of this map is not carried through the zone move and stops resolving the moment delegation lands, with no error anywhere."
  type        = map(string)
  default     = {}
}

variable "legacy_mirror_cname_records" {
  description = "Legacy names that are aliases onto some other host, as name => target, read from the zone snapshot. Excludes www and the five names pointing at the apex or www, which are declared separately because they switch with the alias flip. Set in tfvars while enable_legacy_mirror_records is on."
  type        = map(string)
  default     = {}
}

variable "legacy_mirror_mx_records" {
  description = "Legacy names carrying their own mail routing, as name => list of records, read from the zone snapshot. The apex set is declared with the mail records rather than here, because it flips to Google on email day. Set in tfvars while enable_legacy_mirror_records is on. Omitting a name here silently stops inbound mail for every address at it."
  type        = map(list(string))
  default     = {}
}

variable "legacy_mirror_txt_records" {
  description = "Legacy names carrying their own TXT strings, as name => list of strings, read from the zone snapshot. Route 53 keeps one TXT set per name, so each list carries every string that name publishes, not only the sender policy. The apex set is declared with the mail records rather than here. Set in tfvars while enable_legacy_mirror_records is on."
  type        = map(list(string))
  default     = {}
}

resource "aws_route53_record" "legacy_mirror_a" {
  for_each = var.enable_legacy_mirror_records ? var.legacy_mirror_a_records : {}

  zone_id = local.zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "A"
  ttl     = 60
  records = [each.value]
}

resource "aws_route53_record" "legacy_mirror_cname" {
  for_each = var.enable_legacy_mirror_records ? var.legacy_mirror_cname_records : {}

  zone_id = local.zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "CNAME"
  ttl     = 60
  records = [each.value]
}

resource "aws_route53_record" "legacy_mirror_mx" {
  for_each = var.enable_legacy_mirror_records ? var.legacy_mirror_mx_records : {}

  zone_id = local.zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "MX"
  ttl     = 60
  records = each.value

  lifecycle {
    precondition {
      condition     = length(each.value) > 0
      error_message = "A mail-carrying legacy name was listed with no records. An empty set publishes no mail routing for that name, which stops inbound mail for every address at it the moment delegation lands, with no error anywhere. Take the values from the zone snapshot or remove the name from the map."
    }
  }
}

resource "aws_route53_record" "legacy_mirror_txt" {
  for_each = var.enable_legacy_mirror_records ? var.legacy_mirror_txt_records : {}

  zone_id = local.zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "TXT"
  ttl     = 60
  records = each.value

  lifecycle {
    precondition {
      condition     = length(each.value) > 0
      error_message = "A legacy name was listed with an empty TXT set. Route 53 keeps one TXT set per name, so an empty list withdraws every string that name publishes, including any domain-verification token a provider's account recovery rests on. Take the values from the zone snapshot or remove the name from the map."
    }
  }
}

# The legacy zone carries no AAAA at either name, so the v6 records exist only in
# alias mode; there is nothing to mirror for them.
resource "aws_route53_record" "apex_aaaa" {
  count   = local.apex_alias_mode ? 1 : 0
  zone_id = local.zone_id
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
  zone_id = local.zone_id
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
  zone_id = local.zone_id
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
  zone_id = local.zone_id
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
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "CAA"
  ttl     = 300
  records = [
    "0 issue \"amazon.com\"",
    "0 issuewild \"amazon.com\"",
  ]
}
