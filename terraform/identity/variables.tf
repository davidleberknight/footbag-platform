# =============================================================================
# Variables — identity
# Fill in terraform.tfvars (never commit the real values file).
# =============================================================================

variable "aws_region" {
  description = "Region this tree's provider runs in. IAM is global, so the job role and its policy are the same whichever Region applies them; this exists so the provider has one and matches the rest of the estate."
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

# Which instance and which key the job role may reach is not a variable either.
# Both are decided by the Environment tag the environment's own provider puts on
# them, so the policy denies everything not tagged staging rather than naming a
# resource whose id is generated. A value copied in by hand after every rebuild
# would be a control that depends on somebody remembering to re-copy it.

# Who the operators are is deliberately not declared here, and not in Terraform
# at all. Onboarding mints an access key, and a secret Terraform creates is a
# secret held in its state, so the named human users are created and retired by
# scripts/manage-human-operator.sh instead. This tree declares only what the job
# role may do.
