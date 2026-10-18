# =============================================================================
# Remote state — S3 backend with native locking
#
# This tree creates the very bucket named below, which reads circular and is
# not. The bucket is created under local state first; this backend moves that
# state into it afterwards, which is the ordinary bootstrap two-step. A
# fresh account is bootstrapped by scripts/bootstrap-shared-state.sh, which
# applies this tree without this file on local state to create the bucket, then
# restores it and migrates the state in, proving the object is there before it
# removes the local copy.
#
# Why the state lives here:
#
#   1. The design requires the shared workspace's state to live outside the
#      repo working tree, so it cannot be committed by an accidental
#      `git add -A`. With the state here there is no state file in the tree at
#      all, so the requirement is met by absence rather than by an ignore rule
#      and the convention gate's magic-byte check catching the mistake.
#   2. Local state is one file on one workstation, in neither version control
#      nor any documented backup. Losing it does not break staging or
#      production, which read this bucket rather than this state, but it would
#      cost a `terraform import` of the bucket and its four associated resources
#      at whatever moment the laptop died.
#
# Deleting this bucket would now require migrating this state back to local
# first. That is the documented cost of self-referential state and it is an
# ergonomics cost rather than a risk; `prevent_destroy` on the bucket in s3.tf
# is the guard that matters.
#
# Bucket and key are literals, matching staging and production: supplying them
# at `terraform init` time instead would let an omitted or mistyped flag
# initialize against the wrong state silently.
# =============================================================================

terraform {
  backend "s3" {
    bucket       = "footbag-terraform-state-a1b2c3d4e5"
    key          = "shared/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true # Native S3 locking — no DynamoDB table required
    encrypt      = true
  }
}
