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
  description = "Route 53 hosted zone ID for domain_name. Required only when enable_cloudfront is true."
  type        = string
  default     = ""

  # When enable_cloudfront is true the ACM certificate (acm.tf) validates via a
  # Route53 DNS record, so an empty or wrong zone id makes that apply hang ~15
  # minutes on certificate validation before failing. Fail fast instead. In the
  # first pass (enable_cloudfront = false) no zone is created or needed.
  validation {
    condition     = !var.enable_cloudfront || var.route53_zone_id != ""
    error_message = "route53_zone_id is required when enable_cloudfront is true: the referenced Route 53 hosted zone must exist so the ACM validation records can be written, or the apply hangs on certificate validation. Delegation is not required pre-cutover; the webmaster mirrors the validation CNAMEs into the authoritative zone."
  }
}

variable "lightsail_bundle_id" {
  description = "Lightsail instance bundle (size)"
  type        = string
  default     = "medium_3_0" # 2 vCPU / 4GB RAM / 80GB SSD / 4TB transfer, ~$24/mo dualstack — production size
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

  validation {
    condition     = length(var.operator_cidrs) > 0 && alltrue([for c in var.operator_cidrs : c != ""])
    error_message = "operator_cidrs must list at least one non-empty CIDR; an empty entry produces an invalid Lightsail firewall rule that fails at apply."
  }
}

variable "lightsail_origin_dns" {
  description = "Resolvable DNS hostname used as the CloudFront custom origin. Required only when enable_cloudfront is true. Production must use a real A record (e.g. origin.footbag.org); CloudFront does not accept raw IPs."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_cloudfront || (var.lightsail_origin_dns != "" && !startswith(var.lightsail_origin_dns, "TODO"))
    error_message = "lightsail_origin_dns must be a real resolvable hostname for the CloudFront custom origin when enable_cloudfront is true; the terraform.tfvars.example placeholder (TODO-...) is rejected."
  }
}

# ── Phased-apply feature gates ───────────────────────────────────────────────
# Production mirrors the staging gates so apply can land in phases:
#   pass 1: infra-only, CloudFront/ACM/DNS and alarms/dashboard/backup-alarm off
#   pass 2: enable CloudFront once the zone is delegated and an origin A record exists
#   pass 3: enable CW agent alarms once the agent is installed and emitting
#   pass 4: enable backup alarm once the snapshot job emits BackupAgeMinutes
# Without these gates, alarms fire INSUFFICIENT_DATA or breaching from the
# first apply and train operators to ignore monitoring.

variable "enable_cloudfront" {
  description = <<-EOT
    Controls whether the CloudFront distribution, its ACM certificate, the
    Route53 apex/www alias records, and the CloudFront-dependent alarms are
    created. Set to false for the first apply pass (Lightsail plus base infra
    only, with no domain, delegated zone, or ACM dependency). After the
    footbag.org zone is delegated to this account and a real origin A record
    exists, set route53_zone_id and lightsail_origin_dns and set this to true
    for the second apply pass.
  EOT
  type        = bool
  default     = false
}

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
