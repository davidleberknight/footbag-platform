# =============================================================================
# Remote state — S3 backend with native locking
#
# Same bucket as staging, production and shared, under its own key. The bucket
# is created by the shared tree, so there is no bootstrap two-step here: by the
# time anybody applies this tree the state store already exists.
#
# Bucket and key are literals, matching every other tree: supplying them at
# `terraform init` time instead would let an omitted or mistyped flag initialize
# against the wrong state silently.
# =============================================================================

terraform {
  backend "s3" {
    bucket       = "footbag-terraform-state-a1b2c3d4e5"
    key          = "identity/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true # Native S3 locking — no DynamoDB table required
    encrypt      = true
  }
}
