# =============================================================================
# Environment variables — staging
# Copy this file to terraform.tfvars and fill in all TODO values before apply.
# See terraform.tfvars.example for a template.
# =============================================================================

variable "environment" {
  description = "Environment name used in resource names and tags."
  type        = string
  default     = "staging"
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
  type    = string
  default = ""
}

variable "route53_zone_id" {
  description = <<-EOT
    Route 53 hosted zone ID for var.domain_name.
    DEFERRED: not used in test deployment mode (CloudFront default URL).
    Set when attaching a real domain (see acm.tf activation checklist).
  EOT
  type    = string
  default = ""
}

# ── Lightsail ─────────────────────────────────────────────────────────────────

variable "lightsail_bundle_id" {
  description = <<-EOT
    Lightsail instance bundle (size).
    # TODO: Choose based on expected traffic. Recommended starting points:
    #   staging:    "nano_3_0"    (1 vCPU, 512 MB RAM, $3.50/mo)
    #   production: "small_3_0"   (1 vCPU, 2 GB RAM,  $10/mo)
    Run: aws lightsail get-bundles --query 'bundles[*].[bundleId,price]'
  EOT
  type    = string
  default = "nano_3_0"
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
    Each operator needs a named account; see docs/DEVOPS_GUIDE_V0_1.md for posture.
  EOT
  type = string
}

# ── Notifications ─────────────────────────────────────────────────────────────

variable "alarm_email" {
  description = "Email address for CloudWatch alarm notifications. # TODO: fill in."
  type        = string
}

# ── State bucket ──────────────────────────────────────────────────────────────

variable "state_bucket_suffix" {
  description = "Unique suffix used in the state bucket name. Must match backend.tf."
  type        = string
}
