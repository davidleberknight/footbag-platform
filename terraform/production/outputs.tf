# =============================================================================
# Outputs — production
# =============================================================================

output "lightsail_static_ip" {
  description = "Static IP address of the Lightsail web instance"
  value       = aws_lightsail_static_ip.web.ip_address
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (used for cache invalidations)"
  value       = aws_cloudfront_distribution.main.id
}

output "acm_certificate_arn" {
  description = "ARN of the ACM certificate attached to CloudFront"
  value       = aws_acm_certificate_validation.main.certificate_arn
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
