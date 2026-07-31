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
  description = "Route 53 hosted zone ID for domain_name. Required only when enable_platform_custom_domain is true."
  type        = string
  default     = ""

  # The certificate validates via a Route53 DNS record, so an empty or wrong
  # zone id makes that apply hang ~15 minutes on certificate validation before
  # failing. Fail fast instead. A distribution without the custom domain needs
  # no zone at all: it answers on its own cloudfront.net name.
  validation {
    condition     = !var.enable_platform_custom_domain || var.route53_zone_id != ""
    error_message = "route53_zone_id is required when enable_platform_custom_domain is true: the referenced Route 53 hosted zone must exist so the ACM validation records can be written, or the apply hangs on certificate validation. Delegation is not required pre-cutover; the webmaster mirrors the validation CNAMEs into the authoritative zone."
  }

  # The archive's custom-domain half (archive.tf) carries its own certificate
  # and its own alias records, and validates the same way, so it fails the same
  # way on an empty zone id even with enable_cloudfront off. The rest of the
  # archive stack serves on the distribution's own cloudfront.net name and needs
  # no zone at all.
  validation {
    condition     = !var.enable_archive_custom_domain || var.route53_zone_id != ""
    error_message = "route53_zone_id is required when enable_archive_custom_domain is true: the archive certificate validates through a Route 53 record and the archive alias records are written into the same zone, so an empty or wrong zone id hangs the apply on certificate validation before failing."
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
  description = "Email address for CloudWatch alarm SNS notifications. This is the AWS account's own operations mailbox, which doubles as the account-recovery identity, so it is vault-governed credential material rather than an ordinary contact address: it is set from the gitignored secrets file, never from a committed one, and never appears in plan output."
  type        = string
  sensitive   = true
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
    Creates the CloudFront distribution and the CloudFront-dependent alarms.
    On its own the distribution answers only on its own cloudfront.net name
    under CloudFront's default certificate, which needs no domain, no hosted
    zone and no certificate, so it can be applied as soon as a resolvable
    origin hostname exists. The custom domain is a separate flag below.
    False for the first apply pass (Lightsail plus base infra only).
  EOT
  type        = bool
  default     = false
}

variable "enable_platform_custom_domain" {
  description = <<-EOT
    Serves the platform at the apex, www and preview names: the ACM
    certificate and its validation records, the distribution's aliases, and
    the apex/www/preview DNS records. Requires enable_cloudfront,
    domain_name and route53_zone_id.

    Turn it on only once the zone is authoritative on Route 53, which follows
    the registrar handover. The certificate validates through a record in that
    zone, so enabling it earlier hangs the apply on validation for about
    fifteen minutes and then fails.

    Off, the distribution is reachable only at its unpublished cloudfront.net
    address. That is deliberate: it lets production exist and be exercised
    before the domain moves, and it keeps the platform out of search results,
    because the application marks itself indexable only when its configured
    base URL is the canonical www host.
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

# ── Production arming switches ────────────────────────────────────────────────
# Each switch is published as an SSM app/* parameter and synced into the host
# env by every deploy, which also derives the matching adapter on production
# hosts (armed -> live, dark -> stub). 'dark' keeps the side staging-like: the
# stub adapter runs the full flows with no real-world side effect. Flipping a
# switch is a tfvars change + apply + deploy; SSM parameter history is the
# audit trail.

variable "payments_armed" {
  description = "Payments arming switch. 'dark' = stub payment adapter (checkout flows clickable, no real money can move); 'armed' = live Stripe adapter with every strict config check."
  type        = string
  default     = "dark"

  validation {
    condition     = contains(["armed", "dark"], var.payments_armed)
    error_message = "payments_armed must be exactly 'armed' or 'dark'."
  }
}

variable "email_send_armed" {
  description = "Email arming switch. 'dark' = stub SES adapter (mail captured in memory, simulated-email card renders, nothing delivered); 'armed' = live SES adapter with every strict config check."
  type        = string
  default     = "dark"

  validation {
    condition     = contains(["armed", "dark"], var.email_send_armed)
    error_message = "email_send_armed must be exactly 'armed' or 'dark'."
  }
}
