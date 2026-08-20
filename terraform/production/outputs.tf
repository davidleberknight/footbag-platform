# =============================================================================
# Outputs — production
# =============================================================================

output "lightsail_static_ip" {
  description = "Static IP address of the Lightsail web instance"
  value       = aws_lightsail_static_ip.web.ip_address
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.main[0].domain_name : null
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (used for cache invalidations)"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.main[0].id : null
}

output "acm_certificate_arn" {
  description = "ARN of the ACM certificate attached to CloudFront; null until the custom domain is enabled, since a distribution on its own cloudfront.net name uses CloudFront's certificate and issues none."
  value       = var.enable_platform_custom_domain ? aws_acm_certificate_validation.main[0].certificate_arn : null
}

output "snapshots_bucket_name" {
  description = "S3 bucket for SQLite DB snapshots"
  value       = aws_s3_bucket.snapshots.bucket
}

output "dr_bucket_name" {
  description = "Cross-region DR bucket for SQLite DB snapshots"
  value       = aws_s3_bucket.dr.bucket
}

output "maintenance_bucket_name" {
  description = "S3 bucket hosting the static maintenance page"
  value       = aws_s3_bucket.maintenance.bucket
}

output "media_bucket_name" {
  description = "S3 bucket for processed photo objects (CloudFront /media-store/* origin via OAC)"
  value       = aws_s3_bucket.media.bucket
}

output "media_dr_bucket_name" {
  description = "us-west-2 cross-region replication target for the media bucket"
  value       = aws_s3_bucket.media_dr.bucket
}

output "archive_bucket_name" {
  description = "S3 bucket holding the legacy archive mirror. The content publisher syncs into it."
  value       = var.enable_archive ? aws_s3_bucket.archive[0].bucket : null
}

output "archive_distribution_id" {
  description = "CloudFront distribution ID for archive.footbag.org. Every publish ends with an invalidation against it, because the edge TTL is a year."
  value       = var.enable_archive ? aws_cloudfront_distribution.archive[0].id : null
}

output "archive_domain" {
  description = "Hostname the archive is served at: the custom domain once its flag is on, otherwise the distribution's own cloudfront.net name, which is the host the pre-DNS edge proof runs against."
  value       = var.enable_archive ? (var.enable_archive_custom_domain ? local.archive_domain : aws_cloudfront_distribution.archive[0].domain_name) : null
}

output "archive_key_pair_id" {
  description = "CloudFront public key ID the application names as CloudFront-Key-Pair-Id when it signs archive cookies. Only Terraform knows this value."
  value       = var.enable_archive ? aws_cloudfront_public_key.archive[0].id : null
}

output "archive_requires_signed_cookies" {
  description = "Whether archive content is gated on a signed cookie here. The edge proof reads this to know which answer a cookie-less request should draw: a refusal where the gate is on, the content itself where it is off. Declared intent rather than the distribution's live state, so an environment that loses its gate fails the proof instead of being marked open and passing."
  value       = var.enable_archive ? var.archive_require_signed_cookies : null
}

output "kms_key_arn" {
  description = "ARN of the KMS key used for SSM parameter encryption"
  value       = aws_kms_key.main.arn
}

output "jwt_signing_key_arn" {
  description = "ARN of the KMS asymmetric signing key used for session JWT signing. Read by scripts/test-smoke.sh."
  value       = aws_kms_key.jwt_signing.arn
}

output "ses_sender_identity" {
  description = "SES verified sender identity used as the From: header for outbound mail. Read by scripts/test-smoke.sh."
  value       = var.ses_sender_identity
}

output "lightsail_instance_name" {
  description = "Name of the Lightsail web instance. Used by operator scripts to look up the instance."
  value       = aws_lightsail_instance.web.name
}

output "alarm_topic_arn" {
  description = "ARN of the SNS alarm notification topic"
  value       = aws_sns_topic.alarms.arn
}

output "ses_feedback_topic_arn" {
  description = "ARN of the SNS topic carrying SES bounce and complaint notifications. The app checks an inbound notification's publishing topic against this value, so it is set on the host by scripts/set-host-env.sh."
  value       = aws_sns_topic.ses_feedback.arn
}
