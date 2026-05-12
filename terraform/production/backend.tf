# =============================================================================
# Remote state — S3 backend with native locking
# Requires AWS provider >= 5.x; bucket must exist before init.
# Run terraform/shared first to create the state bucket.
#
# The state bucket is shared with staging (see terraform/staging/backend.tf);
# the key path scopes production state to its own object in the bucket.
# The state bucket itself lives in us-east-1 (created by terraform/shared/s3.tf);
# this region is independent of var.aws_region used for production AWS
# resources.
# =============================================================================

terraform {
  backend "s3" {
    bucket       = "footbag-terraform-state-a1b2c3d4e5"
    key          = "production/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true # Native S3 locking — no DynamoDB table required
    encrypt      = true
  }
}
