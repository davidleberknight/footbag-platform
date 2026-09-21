# =============================================================================
# Terraform State Bucket
# Bootstraps the S3 bucket used by staging and production as their remote
# backend. Apply this directory first, before any environment.
# =============================================================================

resource "aws_s3_bucket" "terraform_state" {
  bucket = "footbag-terraform-state-${var.state_bucket_suffix}"

  # Prevent accidental deletion of state
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Refuse plaintext ─────────────────────────────────────────────────────────
#
# Every bucket in the estate carries this statement; the Well-Architected
# encryption-in-transit practice names the bucket policy as the mechanism, and
# a posture of "we happen to use HTTPS" is not the same as one where plaintext
# is refused. It costs nothing: the S3 backend, the CLI and every SDK use TLS
# already, so nothing legitimate is denied.
#
# This bucket is the one to be careful with, and the hazard is self-reference
# rather than protocol. The shared tree keeps its own state in the bucket it
# manages, so this statement is applied by the very run that then writes its
# state back. A malformed condition — the test written as StringEquals, the
# value as a bare false rather than the string, a NotPrincipal — takes effect
# the instant PutBucketPolicy returns, and the run locks itself out. Recovery
# needs a principal outside the deny calling DeleteBucketPolicy, and
# prevent_destroy on the bucket does not help.
#
# A deny over Principal "*" reaches every IAM principal in the account,
# administrators included, so no IAM identity is a way back in. The principal
# that recovers is the account root user, which an S3 bucket policy cannot lock
# out of DeleteBucketPolicy. Do not generalise that: it is a property of S3, not
# of resource policies. A KMS key policy that omits root leaves the key
# unmanageable once its named principals are gone, and AWS documents the way
# back as contacting Support rather than anything you can do from the console.
#
# Root's credentials and second factor are in the vault. Emergency-access
# guidance expects exactly this: a break-glass path that bypasses the control,
# used rarely and deliberately. So before applying this one, confirm you can
# reach root -- that the password and the second factor are current and in your
# hands -- rather than opening a session and leaving it idle. Apply it alone and
# targeted.
data "aws_iam_policy_document" "terraform_state" {
  statement {
    sid    = "DenyPlaintextAccess"
    effect = "Deny"
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/*",
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  policy = data.aws_iam_policy_document.terraform_state.json
}
