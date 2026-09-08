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
# prevent_destroy on the bucket does not help. Apply this one alone and
# targeted, with a break-glass session already open.
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
