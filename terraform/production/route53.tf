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

# The zone id, for the record-for-record verification that releases the registrar
# change. That comparison runs in both directions, and DNS cannot answer "what
# names exist" -- Route 53 refuses a zone transfer -- so the only way to see a
# name the mirror serves and the capture lacks is to list the record sets, which
# needs this id. Read from here for the same reason as the nameservers above: a
# value transcribed from a console screen is a transcription error waiting to
# happen at the step where one costs the domain.
output "route53_zone_id" {
  description = "The production hosted zone id. Pass it to scripts/verify-zone-mirror.sh, which lists the record sets to compare the mirror against the committed capture in both directions."
  value       = aws_route53_zone.primary.zone_id
}

# The zone's own apex NS set, declared here for one reason: to lower its TTL.
#
# Route 53 creates this record set together with the hosted zone, at a TTL of
# 172800 -- two days -- and that TTL is what bounds a reversal of the delegation
# change. Arriving at Route 53 converges in about 75 minutes, bounded by the
# registry's 3600 and the legacy zone's 720. Leaving again is bounded by this
# record instead: a resolver that took the nameserver set from this zone rather
# than from the registry holds it for two days, so a revert made shortly after
# the move would take that long to reach everyone. Lowering it ahead of the move
# takes this zone's own half of that window down to five minutes, leaving the
# .org registry's 3600-second delegation lifetime as the bound, so a revert
# reaches resolvers in about an hour rather than two days. The whole of its
# effect lands after delegation arrives, so applying it early costs nothing.
#
# allow_overwrite is true here, and this is the one record in the tree where it
# belongs. Everywhere else the flag would hide a collision with a record applied
# by hand, which is why the infrastructure rule forbids it. No such collision is
# possible here: Route 53 creates this set itself with the zone, it always
# exists, and Terraform cannot declare it any other way. The values written back
# are the zone's own assigned nameservers, so an apply changes the TTL and
# nothing else -- confirm that in the plan before applying.
resource "aws_route53_record" "apex_ns" {
  zone_id         = aws_route53_zone.primary.zone_id
  name            = var.domain_name
  type            = "NS"
  ttl             = 300
  records         = aws_route53_zone.primary.name_servers
  allow_overwrite = true
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

    # apex_alias_mode needs BOTH flags, so setting the flip alone leaves this
    # record quietly in mirror mode: the apply succeeds, reports no relevant
    # change, and the apex still answers with the legacy host. That is the most
    # expensive step in the sequence to have silently not happen, and it happens
    # inside the write-freeze, so it fails loudly here instead.
    precondition {
      condition     = !var.enable_apex_alias_records || var.enable_platform_custom_domain
      error_message = "enable_apex_alias_records is on but enable_platform_custom_domain is off, so the apex and www would stay on the mirrored legacy values and the flip would do nothing. Turn on enable_platform_custom_domain in the same change, or leave both off."
    }
  }
}

# www is an ALIAS in both states: to the apex record in this same zone through
# the zone-move window, and to the distribution from the freeze. Only the target
# changes, so the flip and its revert are each a single in-place update.
#
# The legacy zone reaches www by a CNAME onto the apex, and copying that shape
# here would make the flip a type change, because Route 53 will not hold a CNAME
# and an address record at one name at the same time. The provider submits that
# as a delete and a create in ONE transactional change batch, so no resolver sees
# a gap in the ordinary case, and a comment claiming otherwise overstates it.
#
# What it does cost is the failure case, and that is reason enough. An apply that
# fails partway leaves the canonical hostname absent until someone notices and
# re-applies, and a resolver asking in that gap caches the no-such-name answer for
# the shorter of the zone's SOA record TTL and its minimum field -- 900 seconds on
# a Route 53 zone, fifteen minutes, an order of magnitude longer than the record
# TTL, so the gap outlives the change that caused it. The rollback is the same
# change in reverse, so the same exposure lands again during an incident, which is
# when it is least affordable.
#
# An alias avoids both outright, and Route 53 recommends an alias over a CNAME for
# a name pointing at another record in the same zone anyway. The runbook's own
# rule forbids replacing a record by deleting and recreating it, so this shape was
# the one place the tree contradicted it.
#
# What it costs, and only until the freeze: a CNAME answers a query of any type
# by chasing it to the target, while an alias answers only its own type. A mail
# lookup against www currently reaches the apex MX and afterwards gets an empty
# answer.
#
# Four names change behaviour, not one. v, worlds and worldchampionships are
# CNAMEs onto www, so today they chase www to the apex and reach the apex mail
# pair the same way, and afterwards they reach nothing. fi and ftp point straight
# at the apex and are unaffected, which is why the count is four rather than the
# five that ride the apex and www between them. Their own records are identical
# in both zones, so a record-by-record comparison of the mirror reports nothing
# for them: what changes is what a chased query returns.
#
# Every name that publishes its own mail routing in the zone snapshot is
# elsewhere, and from the freeze both shapes behave identically because www
# points at the distribution either way.
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

# ── Google Workspace tenant names ────────────────────────────────────────────
# The Workspace tenant's own domains and their site aliases are IFPA's
# infrastructure rather than the legacy operator's, so they are not part of the
# legacy mirror and the post-cutover cleanup that clears the mirror leaves them.
# Clearing them with it would stop every mailbox and group still addressed at
# them. Each retires only by removing its entry from these maps, after the
# Workspace itself has let that domain go: console first, records after.

variable "workspace_mx_records" {
  description = "Google Workspace tenant names carrying mail routing, as name => list of MX strings. Not gated on the legacy mirror: these outlive the post-cutover cleanup and retire only by removing the entry, after the Workspace has released the domain."
  type        = map(list(string))
  default     = {}
}

variable "workspace_txt_records" {
  description = "Google Workspace tenant names carrying their own TXT strings, as name => list of strings. Route 53 keeps one TXT set per name, so each list carries every string that name publishes."
  type        = map(list(string))
  default     = {}
}

variable "workspace_cname_records" {
  description = "Google Workspace tenant site aliases, as name => target."
  type        = map(string)
  default     = {}
}

resource "aws_route53_record" "workspace_mx" {
  for_each = var.workspace_mx_records

  zone_id = local.zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "MX"
  ttl     = 60
  records = each.value

  lifecycle {
    precondition {
      condition     = length(each.value) > 0
      error_message = "A Workspace name was listed with no mail records, which would stop inbound mail for every mailbox and group at it. Remove the name from the map only after the Workspace has released the domain."
    }
  }
}

resource "aws_route53_record" "workspace_txt" {
  for_each = var.workspace_txt_records

  zone_id = local.zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "TXT"
  ttl     = 60
  records = each.value

  lifecycle {
    precondition {
      condition     = length(each.value) > 0
      error_message = "A Workspace name was listed with an empty TXT set, which would withdraw every string that name publishes."
    }
  }
}

resource "aws_route53_record" "workspace_cname" {
  for_each = var.workspace_cname_records

  zone_id = local.zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "CNAME"
  ttl     = 60
  records = [each.value]
}

# The Workspace names were first served from the legacy-mirror maps. These moves
# carry their existing records across, so the change is a rename in state with no
# record deleted and recreated.
moved {
  from = aws_route53_record.legacy_mirror_mx["my"]
  to   = aws_route53_record.workspace_mx["my"]
}

moved {
  from = aws_route53_record.legacy_mirror_mx["g"]
  to   = aws_route53_record.workspace_mx["g"]
}

moved {
  from = aws_route53_record.legacy_mirror_txt["my"]
  to   = aws_route53_record.workspace_txt["my"]
}

moved {
  from = aws_route53_record.legacy_mirror_cname["docs.my"]
  to   = aws_route53_record.workspace_cname["docs.my"]
}

moved {
  from = aws_route53_record.legacy_mirror_cname["groups.my"]
  to   = aws_route53_record.workspace_cname["groups.my"]
}

moved {
  from = aws_route53_record.legacy_mirror_cname["start.my"]
  to   = aws_route53_record.workspace_cname["start.my"]
}

moved {
  from = aws_route53_record.legacy_mirror_cname["www.my"]
  to   = aws_route53_record.workspace_cname["www.my"]
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
# the apex and www still serve the legacy site. Not every exercise: this name
# makes the platform reachable, which is the zone's half of what production
# needs. Anything depending on a published receiving address -- a reply path,
# the reporting mailbox, the alarm channel -- waits on the apex mail records
# instead, and those are a separate change on a separate day. Both are required
# before the site is fully exercisable. Verified against the live
# zone before creation (the name must have no record of any type there) and
# retired in a separate later apply, NOT at cutover. Gated separately from the
# apex flip so it can exist through the whole pre-cutover window and past it:
# once the apex and www serve the migration notice, this name is the only route
# an operator has to the platform, so it is what a reversal depends on. Removing
# it in the launch apply would delete the reversal path at the moment the watch
# window begins. It retires once the launch is settled and the watch has run.
variable "enable_preview_record" {
  description = "Create the preview.<domain> alias records to CloudFront for the pre-cutover exercises. On after the zone move once the name is re-verified absent from the zone snapshot. It stays on past the cutover: while the public names serve the migration notice this is the only hostname reaching the platform, so it is the reversal path. Retired in a separate later apply once the launch is settled and the watch window has run, never in the launch apply itself."
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

# The origin name and the certificate-authority record scoped to it.
#
# CloudFront rejects a raw IP, so the custom origin needs a resolvable name, and
# a certificate cannot be issued for a name that does not exist. Both are
# declared here rather than applied by hand: a hand-made record collides the
# moment Terraform declares it, because allow_overwrite is left at its default.
#
# The two are deliberately on ONE flag. The apex certificate-authority record
# below authorises Amazon only and is inherited by every subdomain, so an origin
# certificate from any other authority is refused unless this name carries its
# own record. A certificate-authority lookup uses the closest ancestor that has
# one, so the record below stops the apex's from applying here. Splitting them
# across two flags would allow a state where the name resolves and issuance is
# silently refused, and the refusal surfaces at renewal rather than at issuance,
# roughly sixty days after anyone last looked.
#
# The origin hop is http-only today, so nothing depends on this yet. It is
# declared now so that the ordering cannot be got wrong later, which is what the
# go-live gate requires: the address record and the scoped authority record both
# exist in Terraform, created together, so no ordering can separate them.
variable "enable_origin_record" {
  description = "Create origin.<domain> and the certificate-authority record scoped to it. On once the zone is authoritative on Route 53; independent of the viewer-facing cutover. Both records ride this one flag so no ordering can separate the name from the authority that may issue for it."
  type        = bool
  default     = false
}

resource "aws_route53_record" "origin_a" {
  count   = var.enable_origin_record ? 1 : 0
  zone_id = local.zone_id
  name    = "origin.${var.domain_name}"
  type    = "A"
  ttl     = 300
  records = [aws_lightsail_static_ip.web.ip_address]
}

resource "aws_route53_record" "origin_caa" {
  count   = var.enable_origin_record ? 1 : 0
  zone_id = local.zone_id
  name    = "origin.${var.domain_name}"
  type    = "CAA"
  ttl     = 300

  # Let's Encrypt only, and an explicit wildcard refusal beside it.
  #
  # The refusal has to be written. Omitting issuewild does not withhold wildcard
  # issuance: RFC 8659 says that when no issuewild set is present, the issue set
  # governs wildcard requests too, so a record carrying only the issue line
  # authorises *.origin.<domain> as readily as the name itself. The comment here
  # previously claimed the opposite, which is the kind of mistake that survives
  # because the record looks narrower than it is.
  #
  # This name takes a single-name certificate by DNS-01, so nothing is lost.
  records = [
    "0 issue \"letsencrypt.org\"",
    "0 issuewild \";\"",
  ]
}

# CAA constrains TLS certificate issuance to Amazon's certificate authority (the
# one ACM uses), so no other CA can issue a certificate for footbag.org or its
# subdomains. A CAA at the apex is inherited by www and archive, and by any
# subdomain that does not carry its own; origin carries its own, above.
#
# What it does NOT do, and the whole namespace argument turns on the difference:
# it constrains WHICH authority may issue, not WHO may prove control to that
# authority. The permitted authority accepts proof by mail to five fixed system
# addresses at the domain -- administrator@, hostmaster@, postmaster@, webmaster@
# and admin@ -- and strips a leading www, so a request for the canonical host is
# proved at the apex set. It re-solicits them at renewal as well as at issuance,
# so control of those mailboxes is a standing capability rather than a one-off.
# The bound is therefore a PAIR: this record, and IFPA receiving all five of those
# addresses. Whoever receives one of them can obtain a certificate this record
# permits, for any name under the domain, and a certificate issued since June 2025
# exports with its private key. Our own certificates are unaffected: they are
# issued by DNS validation, which this tree performs in Terraform.
#
# That inheritance holds only while no child zone exists. A CA reads the CAA
# record set at the closest node, so a delegated subzone publishing its own CAA
# overrides this one entirely and its operator can obtain a publicly trusted
# certificate for a footbag.org name from any authority. This apex record is
# therefore authoritative for the whole domain only because the namespace is
# closed: see the Closed Namespace decision in DESIGN_DECISIONS, which rules that
# from go-live every name under footbag.org is operated by IFPA and no subzone is
# delegated. Do not add an NS record set for a child of this zone. There is none
# today, the committed zone capture confirms no child delegation exists, and
# scripts/ci/check_closed_namespace.sh refuses one in this tree rather than
# leaving the absence to convention.
#
# It lands WITH THE ZONE, ungated, like the apex NS set above and for the same
# reason: the zone is inert until the registrar delegates to it, so a record
# declared here changes nothing a resolver sees until the move, and from the move
# it is in force.
#
# Landing it with the zone rather than at the alias flip costs nothing and is not
# a trade. An Amazon-only policy at the apex cannot block the origin name's own
# issuance from a different authority, because origin.<domain> carries its own CAA
# on the same flag as the name itself, and a CAA set at a child node replaces its
# ancestor's rather than adding to it.
#
# What it buys across that window: the mirrored legacy names resolve to hosts IFPA
# does not control and stand until the post-cutover cleanup, which is AFTER the
# flip. This record stops any authority but Amazon's issuing for them, and
# certificate transparency shows one of them, rimu2.footbag.org, held a
# certificate from another authority in 2015 and 2016. A certificate obtained
# before this record lands stays valid for its full life, up to 200 days under the
# current maximum, so publishing it early closes an opportunity window that
# publishing it late would not shorten.
#
# What it does not buy across that window is the other half of the pair. The five
# validation addresses reach the legacy host until the apex mail records move, so
# an issuance proved through one of them is permitted by this record throughout.
# That half closes at the mail apply, which the cutover sequence runs straight
# after the alias flip.
#
# Checked rather than assumed: nothing under the domain holds
# a working certificate today, the apex and www refuse port 443 outright, and the
# four Workspace-served names abort the handshake rather than presenting a
# Google-issued certificate that this record would refuse to authorise. ACM
# issues from this authority, and AWS documents the four accepted values of which
# "amazon.com" is one.
resource "aws_route53_record" "caa" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "CAA"
  ttl     = 300
  records = [
    "0 issue \"amazon.com\"",
    # A refusal, not a grant. `issuewild ";"` authorises no authority at all to
    # issue a wildcard, and nothing in this estate needs one: every certificate
    # here names its hosts. Written as `issuewild "amazon.com"` it was inert
    # beside the issue line above, granting exactly what was already granted,
    # which is a line that reads like a control and is not one.
    "0 issuewild \";\"",
  ]
}

# NO CHILD ZONE IS DELEGATED UNDER footbag.org, and nothing in this file creates
# one. The mirrored record maps carry A, CNAME, MX and TXT types only, so a
# delegation cannot arrive through them: it would take a deliberate new
# aws_route53_record of type NS. The Closed Namespace decision permits one before
# go-live, as a bridge while an outgoing operator relocates what they run, so
# adding it for that window is a reviewed change to the closed-namespace gate,
# recorded there with the name, the reason and the end date; one surviving past
# go-live needs a reason given in writing, with technical merit, that IFPA
# accepts, and the acceptance is what the decision weighs rather than this file.
#
# What it would cost, so the next person does not have to rediscover it: a
# delegated child publishes its own CAA, which overrides the apex record above and
# lets its operator obtain a footbag.org certificate from ANY authority, rather
# than only from the one the apex record names. It publishes its own SPF, DKIM
# and DMARC, which take precedence over the apex policy, so it can send mail that
# authenticates as the domain. Browsers offer saved footbag.org credentials on any
# name under the domain. And the archive's access cookies must carry the
# parent-domain scope, so any delegated name answering over HTTPS receives a
# signed-in member's archive credentials. None of that is preventable by
# agreement with whoever runs it.
#
# The governing rule is the Closed Namespace decision in DESIGN_DECISIONS.
