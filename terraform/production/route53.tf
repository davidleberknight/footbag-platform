# =============================================================================
# Route 53 DNS Records
# A/AAAA alias records pointing the domain at CloudFront.
# The hosted zone must exist before apply (import it; Console edits are not
# the canonical path).
#
# Gated default-off: under the front-door arrangement the legacy server
# proxies the apex and the webmaster holds DNS; these alias records apply
# only at the DNS-handover milestone. Flip var.enable_apex_alias_records
# then.
# =============================================================================

variable "enable_apex_alias_records" {
  description = "Create the apex/www alias records to CloudFront. Off until the DNS-handover milestone (the webmaster's proxy fronts the apex before then)."
  type        = bool
  default     = false
}

resource "aws_route53_record" "apex_a" {
  count   = var.enable_apex_alias_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "apex_aaaa" {
  count   = var.enable_apex_alias_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_a" {
  count   = var.enable_apex_alias_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
