# =============================================================================
# Variables — production
# Fill in terraform.tfvars (never commit the real values file).
# =============================================================================

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "Primary AWS region. us-east-1: the SES sender identity and the CloudFront ACM certificate are region-bound there."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID (used in IAM resource ARNs)"
  type        = string
  # TODO: Fill in before apply
}

variable "domain_name" {
  description = "Apex domain served by CloudFront"
  type        = string
  default     = "footbag.org" # TODO: Confirm apex domain
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for domain_name"
  type        = string
  # TODO: Import or create the hosted zone, then fill in
}

variable "lightsail_bundle_id" {
  description = "Lightsail instance bundle (size)"
  type        = string
  default     = "small_3_0" # $10/mo — appropriate for production
}

variable "lightsail_blueprint_id" {
  description = "Lightsail OS blueprint"
  type        = string
  default     = "amazon_linux_2023"
}

variable "ssh_public_key" {
  description = "SSH public key to inject into the Lightsail instance"
  type        = string
  # TODO: Paste the contents of your production deploy key (~/.ssh/id_ed25519.pub)
}

variable "alarm_email" {
  description = "Email address for CloudWatch alarm SNS notifications"
  type        = string
  # TODO: Set to ops alert address
}

variable "state_bucket_suffix" {
  description = "Unique suffix appended to the Terraform state bucket name"
  type        = string
  # TODO: Must match the suffix used when provisioning terraform/shared
}

variable "operator_cidrs" {
  description = "CIDR ranges permitted to SSH into the Lightsail instance. Set in tfvars; do not leave empty."
  type        = list(string)
}

variable "lightsail_origin_dns" {
  description = "Resolvable DNS hostname used as the CloudFront custom origin. Production must use a real A record (e.g. origin.footbag.org); CloudFront does not accept raw IPs."
  type        = string
}

# ── Phased-apply feature gates ───────────────────────────────────────────────
# Production mirrors the staging gates so apply can land in phases:
#   pass 1: infra-only, alarms/dashboard/backup-alarm off
#   pass 2: enable CW agent alarms once the agent is installed and emitting
#   pass 3: enable backup alarm once the snapshot job emits BackupAgeMinutes
# Without these gates, alarms fire INSUFFICIENT_DATA or breaching from the
# first apply and train operators to ignore monitoring.

variable "enable_cwagent_alarms" {
  description = <<-EOT
    Set to true only after the CloudWatch agent is installed on the
    Lightsail host and is confirmed to be emitting cpu_usage_active and
    mem_used_percent metrics under the CWAgent namespace. Enabling earlier
    creates alarms that immediately enter INSUFFICIENT_DATA.
  EOT
  type        = bool
  default     = false
}

variable "enable_backup_alarm" {
  description = <<-EOT
    Set to true only after the SQLite backup job runs on schedule and emits
    BackupAgeMinutes to the Footbag/{environment} namespace. The alarm uses
    treat_missing_data = "breaching"; enabling before metric data exists
    fires the alarm on apply.
  EOT
  type        = bool
  default     = false
}

variable "ses_feedback_webhook_url" {
  description = "Full HTTPS URL of the app's SES-feedback webhook, including the shared-secret query key (e.g. https://<host>/webhooks/ses-feedback?key=...). Empty disables the subscription."
  type        = string
  default     = ""
  sensitive   = true
}
