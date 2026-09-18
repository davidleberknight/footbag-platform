# =============================================================================
# Variables — identity
# Fill in terraform.tfvars (never commit the real values file).
# =============================================================================

variable "aws_region" {
  description = "Region the IAM Identity Center instance runs in. An organization runs Identity Center in exactly one Region and changing it means deleting the instance and creating another, so this must match the Region the instance was enabled in."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID (used in the operator policy's resource ARNs)"
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be the twelve-digit account number. The operator policy scopes IAM, SSM, SQS, SNS, CloudWatch and STS by ARN, and every one of those ARNs embeds it, so a placeholder here produces a policy that grants nothing and fails mid-task."
  }
}

variable "domain_name" {
  description = "Apex domain whose Route 53 hosted zone the operator policy is scoped to. Looked up by name rather than supplied as a zone id, so this tree cannot point at a zone the estate does not own."
  type        = string
  default     = "footbag.org"
}

# The roster — who the operators are — is deliberately not declared here. It is
# `var.operators` in terraform/operators, because hiring and firing are ordinary
# work and this tree is the one an operator cannot apply.
