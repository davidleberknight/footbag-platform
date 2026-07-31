# =============================================================================
# ACM Certificate — must live in us-east-1 for CloudFront
# =============================================================================

resource "aws_acm_certificate" "main" {
  count             = var.enable_platform_custom_domain ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  # preview.<domain> rides the certificate from first issuance: ACM replaces
  # the whole certificate when a SAN is added later, so the temporary
  # pre-cutover hostname is baked in even though its DNS record is gated off
  # until the zone move.
  subject_alternative_names = ["www.${var.domain_name}", "preview.${var.domain_name}"]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = var.enable_platform_custom_domain ? {
    for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "main" {
  count                   = var.enable_platform_custom_domain ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}
