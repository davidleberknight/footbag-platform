variable "aws_region" {
  description = "AWS region for shared resources."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_suffix" {
  description = <<-EOT
    Globally unique suffix appended to the Terraform state bucket name.
    # TODO: Set to a short random string (e.g. the last 8 chars of your AWS account ID).
    Example: "a1b2c3d4"
  EOT
  type        = string
  default     = "TODO-set-unique-suffix"
}
