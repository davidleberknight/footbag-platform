# =============================================================================
# Route 53 DNS Records
# A/AAAA alias records pointing the domain at CloudFront.
# The hosted zone must exist before apply (import it; Console edits are not
# the canonical path).
#
# Gated default-off, but the gate is timing, not ownership. The zone moves to
# Route 53 early as advance preparation and the operator applies every record
# here; nothing is hand-applied on the legacy nameservers. The flag stays off
# through the move so Route 53 first serves the zone's existing records
# faithfully, then flips to point apex and www at CloudFront. Both are ALIAS
# records to the one distribution, which 301s the apex to www, so there is no
# separate apex redirector.
# =============================================================================

variable "enable_apex_alias_records" {
  description = "Create the apex/www alias records to CloudFront. Both are Route 53 ALIAS records to the distribution, and the apex redirects to www through it, so no separate redirector exists. Off until the switch itself: Route 53 first serves the zone's existing records faithfully after the zone move, and this flag flips at go-live."
  type        = bool
  default     = false
}

resource "aws_route53_record" "apex_a" {
  count   = var.enable_cloudfront && var.enable_apex_alias_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "apex_aaaa" {
  count   = var.enable_cloudfront && var.enable_apex_alias_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_a" {
  count   = var.enable_cloudfront && var.enable_apex_alias_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_aaaa" {
  count   = var.enable_cloudfront && var.enable_apex_alias_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "www.${var.domain_name}"
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
  count   = var.enable_apex_alias_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "CAA"
  ttl     = 300
  records = [
    "0 issue \"amazon.com\"",
    "0 issuewild \"amazon.com\"",
  ]
}
