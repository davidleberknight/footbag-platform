# =============================================================================
# Legacy mirror cold copy (us-west-2)
#
# The crawl of the legacy footbag.org site is the only surviving copy of that
# site once the legacy host is gone. The served archive bucket holds only the
# published www subtree, and its replica follows every publish, deletions
# included, so neither is a backup of the whole capture: the crawl's own
# manifests never reach them, and a publish that drops a page drops it from
# both. This bucket holds the whole crawl, written by
# scripts/backup-legacy-mirror.sh and never by a publish.
#
# The archive changes when the platform's next major version edits it, so this
# copy has to let such a change be rolled back: versioning keeps every earlier
# object, and the upload never deletes, so a file removed locally stays here as
# it was. Objects are written straight into the Deep Archive storage class by
# the upload itself rather than moved there by a lifecycle transition, which
# would first bill every object at the standard rate and then charge a
# transition request for each one.
#
# In us-west-2, apart from the archive's own us-east-1 bucket, so losing the
# primary region does not take both copies. Nothing grants on the bucket: only
# an administrator, through IAM, can write or read it.
# =============================================================================

variable "enable_legacy_mirror_backup" {
  description = "Create the private us-west-2 bucket holding the cold copy of the whole legacy site crawl. Turn on once the crawl is complete on the operator workstation and ready to be copied, then run scripts/backup-legacy-mirror.sh --target production; the bucket is protected against destruction, so turning this back off makes the plan fail rather than remove it."
  type        = bool
  default     = false
}

resource "aws_s3_bucket" "legacy_mirror_backup" {
  count    = var.enable_legacy_mirror_backup ? 1 : 0
  provider = aws.us_west_2
  bucket   = "${local.prefix}-legacy-mirror-backup"
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "legacy_mirror_backup" {
  count    = var.enable_legacy_mirror_backup ? 1 : 0
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.legacy_mirror_backup[0].id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "legacy_mirror_backup" {
  count    = var.enable_legacy_mirror_backup ? 1 : 0
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.legacy_mirror_backup[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "legacy_mirror_backup" {
  count                   = var.enable_legacy_mirror_backup ? 1 : 0
  provider                = aws.us_west_2
  bucket                  = aws_s3_bucket.legacy_mirror_backup[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Deny-only policy. Nothing else grants on this bucket: the backup script writes
# as an administrator through IAM, and no service or client reads it. Adding a
# deny where no allow exists cannot subtract anything.
data "aws_iam_policy_document" "legacy_mirror_backup" {
  count = var.enable_legacy_mirror_backup ? 1 : 0

  statement {
    sid    = "DenyPlaintextAccess"
    effect = "Deny"
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.legacy_mirror_backup[0].arn,
      "${aws_s3_bucket.legacy_mirror_backup[0].arn}/*",
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "legacy_mirror_backup" {
  count    = var.enable_legacy_mirror_backup ? 1 : 0
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.legacy_mirror_backup[0].id
  policy   = data.aws_iam_policy_document.legacy_mirror_backup[0].json
}

# No rule expires a current object: the current versions are the backup.
#
# A superseded version is kept for a year. That is the rollback window for a
# change the next major version makes to the archive: long enough for a bad
# edit to be noticed through ordinary use of the archive, which is read rarely,
# rather than only by whoever made it. Deep Archive bills every object for at
# least 180 days whenever it is removed, so a shorter window would cost the same
# and protect less; a longer one keeps paying for versions nobody has reached
# for in a year.
#
# An upload interrupted part way leaves its parts billed and invisible. The
# crawl holds large video files, which the CLI uploads in parts, so those are
# cleared after a week.
resource "aws_s3_bucket_lifecycle_configuration" "legacy_mirror_backup" {
  count    = var.enable_legacy_mirror_backup ? 1 : 0
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.legacy_mirror_backup[0].id

  rule {
    id     = "expire-superseded-mirror-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }

  rule {
    id     = "abort-incomplete-mirror-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

output "legacy_mirror_backup_bucket_name" {
  description = "us-west-2 bucket holding the cold copy of the whole legacy site crawl. Read by scripts/backup-legacy-mirror.sh. Null while enable_legacy_mirror_backup is off."
  value       = var.enable_legacy_mirror_backup ? aws_s3_bucket.legacy_mirror_backup[0].bucket : null
}
