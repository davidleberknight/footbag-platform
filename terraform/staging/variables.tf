# =============================================================================
# Environment variables — staging
# Copy this file to terraform.tfvars and fill in all TODO values before apply.
# See terraform.tfvars.example for a template.
# =============================================================================

variable "environment" {
  description = "Environment name used in resource names and tags. Pinned by the validation below: this tree describes staging and nothing else."
  type        = string
  default     = "staging"

  # The mirror of the production guard, and the direction that actually matters:
  # both trees share one AWS account, so a staging tfvars carrying
  # environment = "production" would not fail, it would succeed against
  # production's namespace from staging's state file. Every resource name, SSM
  # path, log group and IAM role here derives from this one value.
  validation {
    condition     = var.environment == "staging"
    error_message = "This is the staging tree: environment must be \"staging\". Both environments share one AWS account, so another environment's name here would have this state file create and manage that environment's resources — including its arming switches."
  }
}

variable "aws_region" {
  description = "Primary AWS region for this environment."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "12-digit AWS account ID. # TODO: fill in."
  type        = string
}

# ── Domain ────────────────────────────────────────────────────────────────────

variable "domain_name" {
  description = <<-EOT
    Primary domain name for this environment.
    DEFERRED: not used in test deployment mode (CloudFront default URL).
    Set to e.g. "staging.footbag.org" when attaching a real domain.
  EOT
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = <<-EOT
    Route 53 hosted zone ID for var.domain_name.
    DEFERRED: not used in test deployment mode (CloudFront default URL).
    Set when attaching a real domain (see acm.tf activation checklist).
  EOT
  type        = string
  default     = ""

  # The archive's custom-domain half (archive.tf) validates its certificate
  # through a Route 53 record, so an empty or wrong zone id hangs the apply
  # ~15 minutes on certificate validation before failing. Fail fast instead.
  # Inert while enable_archive_custom_domain stays off, which in staging is
  # always.
  validation {
    condition     = !var.enable_archive_custom_domain || var.route53_zone_id != ""
    error_message = "route53_zone_id is required when enable_archive_custom_domain is true: the archive certificate validates through a Route 53 record and the archive alias records are written into the same zone, so an empty or wrong zone id hangs the apply on certificate validation before failing."
  }
}

# ── Lightsail ─────────────────────────────────────────────────────────────────

variable "lightsail_bundle_id" {
  description = <<-EOT
    Lightsail instance bundle (size).
    # TODO: Choose based on expected traffic. Recommended starting points:
    #   staging:    "nano_3_0"    (2 vCPU, 512 MB RAM, ~$5/mo dualstack)
    #   production: "medium_3_0"  (2 vCPU, 4 GB RAM,   ~$24/mo dualstack)
    Run: aws lightsail get-bundles --query 'bundles[*].[bundleId,price]'
  EOT
  type        = string
  default     = "nano_3_0"
}

variable "lightsail_blueprint_id" {
  description = "Lightsail OS blueprint. Amazon Linux 2023 recommended."
  type        = string
  default     = "amazon_linux_2023"
}

variable "ssh_public_key" {
  description = <<-EOT
    SSH public key for operator access to the Lightsail instance.
    # TODO: Paste the contents of your operator's ~/.ssh/id_ed25519.pub (or similar).
    Each operator needs a named account.
  EOT
  type        = string
}

# ── Notifications ─────────────────────────────────────────────────────────────

variable "alarm_email" {
  description = "Email address for CloudWatch alarm SNS notifications. This is the AWS account's own operations mailbox, which doubles as the account-recovery identity, so it is vault-governed credential material rather than an ordinary contact address: it is set from the gitignored secrets file, never from a committed one, and never appears in plan output."
  type        = string
  sensitive   = true
}

# ── Operator access ───────────────────────────────────────────────────────────

variable "operator_cidrs" {
  description = <<-EOT
    List of CIDR ranges permitted to SSH into the Lightsail instance.
    Must be set before first apply. Do not leave as 0.0.0.0/0.
    Example: ["1.2.3.4/32"]
    To find your current public IP: curl -s https://checkip.amazonaws.com
  EOT
  type        = list(string)

  validation {
    condition     = length(var.operator_cidrs) > 0 && alltrue([for c in var.operator_cidrs : c != ""])
    error_message = "operator_cidrs must list at least one non-empty CIDR; an empty entry produces an invalid Lightsail firewall rule that fails at apply."
  }
}

# ── CloudFront bootstrap ──────────────────────────────────────────────────────

variable "lightsail_origin_dns" {
  description = <<-EOT
    Resolvable DNS hostname used as the CloudFront custom origin domain_name.
    CloudFront requires a DNS hostname — a raw IP address is not supported.
    Lightsail does not provide public DNS hostnames (unlike EC2). The
    publicDnsName field in the Lightsail API always returns None.
    For staging: construct from the static IP Terraform output using nip.io:
      lightsail_origin_dns = "<static_ip>.nip.io"
      e.g. lightsail_origin_dns = "203.0.113.20.nip.io"   (203.0.113.x is a placeholder per RFC 5737; substitute your real static IP)
    For production: use a real DNS A record pointing to the static IP,
    e.g. origin.staging.footbag.org. Do not use nip.io in production.
    Set this value and enable_cloudfront = true for the second apply pass.
    Leave as empty string for the first apply pass (set enable_cloudfront = false).
  EOT
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_cloudfront || (var.lightsail_origin_dns != "" && !startswith(var.lightsail_origin_dns, "TODO"))
    error_message = "lightsail_origin_dns must be a real resolvable hostname for the CloudFront custom origin when enable_cloudfront is true; a TODO- placeholder is rejected."
  }
}

variable "enable_cloudfront" {
  description = <<-EOT
    Controls whether the CloudFront distribution is created.
    Set to false for the first apply pass (creates Lightsail only).
    After constructing the nip.io hostname from the static IP Terraform output
    (staging) or creating a real DNS A record (production), set
    lightsail_origin_dns and set this to true for the second apply pass.
  EOT
  type        = bool
  default     = false
}

# ── Monitoring gates ──────────────────────────────────────────────────────────

variable "enable_cwagent_alarms" {
  description = <<-EOT
    Set to true only after the CloudWatch agent is installed and running on
    the Lightsail host and is confirmed to be emitting CPUUtilization and
    mem_used_percent metrics to the CWAgent namespace.
    Enabling before the agent exists creates alarms that immediately enter
    INSUFFICIENT_DATA and train operators to ignore monitoring.
  EOT
  type        = bool
  default     = false
}

variable "enable_replication_alarm" {
  description = <<-EOT
    Watch the cross-region replication that carries the media bucket to its DR
    copy. Off by default and off until the rule has replicated at least once,
    because the same flag turns on the S3 replication metrics the alarms read.

    Staging replicates media only: its snapshot bucket has no DR copy, so unlike
    production there is no snapshot replication here to watch.

    A failed replication is not retried by S3. Recovery is re-uploading the
    object or running S3 Batch Replication to clear the backlog.
  EOT
  type        = bool
  default     = false
}

variable "enable_backup_alarm" {
  description = <<-EOT
    Set to true only after the SQLite backup job exists, runs on schedule,
    and is confirmed to emit BackupAgeMinutes to the
    Footbag/{environment} CloudWatch namespace after each run.
    Enabling before the job exists causes the alarm to immediately enter
    ALARM state (treat_missing_data = "breaching") and fire constantly.
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

variable "alarm_webhook_url" {
  description = "Full HTTPS URL of the app's platform-alarm webhook, including the shared-secret query key (e.g. https://<host>/webhooks/platform-alarm?key=...). Set it once the app is serving that endpoint and its key is on the host; empty disables the subscription and alarms reach the operator mailbox only."
  type        = string
  default     = ""
  sensitive   = true
}

# ── Arming switches (inert on staging) ────────────────────────────────────────
# Staging adapters stay stubbed below production regardless of these values;
# the variables exist so both trees publish the same app/* parameter set and
# the deploy sync reads one uniform contract. Production is where the switches
# bite (armed -> live adapter, dark -> stub adapter, derived at deploy).

variable "payments_armed" {
  description = "Payments arming switch, published as SSM app/payments_armed. Inert on staging: the payment adapter is stubbed below production regardless."
  type        = string
  default     = "armed"

  validation {
    condition     = contains(["armed", "dark"], var.payments_armed)
    error_message = "payments_armed must be exactly 'armed' or 'dark'."
  }
}

variable "email_send_armed" {
  description = "Email arming switch, published as SSM app/email_send_armed. Inert on staging: the SES adapter is stubbed below production regardless."
  type        = string
  default     = "armed"

  validation {
    condition     = contains(["armed", "dark"], var.email_send_armed)
    error_message = "email_send_armed must be exactly 'armed' or 'dark'."
  }
}
