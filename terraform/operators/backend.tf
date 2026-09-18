# =============================================================================
# Remote state — S3 backend with native locking
#
# Same bucket as every other tree, under its own key. Its own state rather than
# a corner of the identity tree's, because the two are applied by different
# principals: an operator applying the roster must not need read or write on the
# state that holds the role's own definition.
#
# Bucket and key are literals, matching every other tree: supplying them at
# `terraform init` time instead would let an omitted or mistyped flag initialize
# against the wrong state silently.
# =============================================================================

terraform {
  backend "s3" {
    bucket       = "footbag-terraform-state-a1b2c3d4e5"
    key          = "operators/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true # Native S3 locking — no DynamoDB table required
    encrypt      = true
  }
}
