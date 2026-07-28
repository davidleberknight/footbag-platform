# =============================================================================
# Route 53 DNS Records — permanently unused on staging, by design.
#
# Staging serves on its unpublished default *.cloudfront.net URL and never
# attaches a custom domain; the production tree owns the real records. This
# file stays as the commented reference shape only (see acm.tf).
# =============================================================================

# resource "aws_route53_record" "apex_a" {
#   zone_id = var.route53_zone_id
#   name    = var.domain_name
#   type    = "A"
#
#   alias {
#     name                   = aws_cloudfront_distribution.main.domain_name
#     zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
#     evaluate_target_health = false
#   }
# }
#
# resource "aws_route53_record" "apex_aaaa" {
#   zone_id = var.route53_zone_id
#   name    = var.domain_name
#   type    = "AAAA"
#
#   alias {
#     name                   = aws_cloudfront_distribution.main.domain_name
#     zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
#     evaluate_target_health = false
#   }
# }
#
# resource "aws_route53_record" "www_a" {
#   zone_id = var.route53_zone_id
#   name    = "www.${var.domain_name}"
#   type    = "A"
#
#   alias {
#     name                   = aws_cloudfront_distribution.main.domain_name
#     zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
#     evaluate_target_health = false
#   }
# }
