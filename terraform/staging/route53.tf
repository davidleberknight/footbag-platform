# =============================================================================
# Route 53 DNS Records — DEFERRED for initial test deployment.
#
# These records point the custom domain at the CloudFront distribution.
# Commented out while the deployment uses the CloudFront default
# *.cloudfront.net URL with no custom domain.
#
# To activate: see activation checklist in acm.tf.
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
