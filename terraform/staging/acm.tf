# =============================================================================
# ACM Certificate — DEFERRED for initial test deployment.
#
# This file provisions a custom-domain TLS certificate in us-east-1 for use
# with CloudFront, validated via Route 53 DNS. It is commented out while the
# deployment uses the CloudFront default *.cloudfront.net URL.
#
# To activate:
#   1. Uncomment this file
#   2. Uncomment route53.tf
#   3. Uncomment the aliases block in cloudfront.tf
#   4. Replace viewer_certificate in cloudfront.tf with the ACM cert reference
#   5. Set domain_name and route53_zone_id in terraform.tfvars
# =============================================================================

# resource "aws_acm_certificate" "main" {
#   provider          = aws.us_east_1
#   domain_name       = var.domain_name
#   validation_method = "DNS"
#
#   subject_alternative_names = [
#     "www.${var.domain_name}",
#   ]
#
#   lifecycle {
#     create_before_destroy = true
#   }
# }
#
# resource "aws_route53_record" "acm_validation" {
#   for_each = {
#     for dvo in aws_acm_certificate.main.domain_validation_options :
#     dvo.domain_name => {
#       name  = dvo.resource_record_name
#       type  = dvo.resource_record_type
#       value = dvo.resource_record_value
#     }
#   }
#
#   zone_id = var.route53_zone_id
#   name    = each.value.name
#   type    = each.value.type
#   ttl     = 60
#   records = [each.value.value]
# }
#
# resource "aws_acm_certificate_validation" "main" {
#   provider                = aws.us_east_1
#   certificate_arn         = aws_acm_certificate.main.arn
#   validation_record_fqdns = [for record in aws_route53_record.acm_validation : record.fqdn]
# }
