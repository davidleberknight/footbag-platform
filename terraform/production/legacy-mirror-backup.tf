# =============================================================================
# Legacy mirror cold copy (us-west-2)
#
# The crawl of the legacy footbag.org site is the only surviving copy of that
# site once the legacy host is gone. The served archive bucket holds only the
# published www subtree, and its replica follows every publish, deletions
# included, so neither is a backup of the whole capture: the crawl's own
# manifests never reach them, and a publish that drops a page drops it from
# both. This bucket holds two things. The whole crawl, under mirror/ and
# manifests/, written by scripts/backup-legacy-mirror.sh and frozen at the last
# crawl. And every object the archive bucket holds, at this bucket's root,
# written by the archive's replication rule to this bucket, which carries every
# write and never a delete marker; replication cannot rewrite a key, so those
# objects keep the archive's own keys.
#
# Once the crawl is published the archive bucket is the source of truth and is
# edited in place, so this copy has to let an edit be rolled back: versioning
# keeps every earlier object, and neither writer ever deletes, so a page removed
# from the archive or from the crawl stays here as it was. Objects are written
# straight into the Deep Archive storage class, by the upload and by the
# replication rule alike, rather than moved there by a lifecycle transition,
# which would first bill every object at the standard rate and then charge a
# transition request for each one.
#
# In us-west-2, apart from the archive's own us-east-1 bucket, so losing the
# primary region does not take both copies. Nothing grants on the bucket: an
# administrator writes and reads it through IAM, and replication writes through
# the replication role's own IAM.
# =============================================================================

variable "enable_legacy_mirror_backup" {
  description = "Create the private us-west-2 bucket holding the cold copy of the whole legacy site crawl and, while enable_archive is also on, the archive bucket's replication rule into it. Turn on once the crawl is complete on the operator workstation and ready to be copied, then run scripts/backup-legacy-mirror.sh --target production, and scripts/backfill-replication.sh --target production --source archive-cold-copy for whatever the archive held before the rule; the bucket is protected against destruction, so turning this back off makes the plan fail rather than remove it."
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
# as an administrator through IAM, replication writes through the replication
# role's own IAM in the same account, which is an S3-internal TLS path, and no
# client reads it. Adding a deny where no allow exists cannot subtract anything.
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
# A superseded version is kept for a year, at the root as under mirror/. That
# is the rollback window for an edit to the archive, which replication brings
# here: long enough for a bad edit to be noticed through ordinary use of the
# archive, which is read rarely, rather than only by whoever made it. Deep Archive bills every object for at
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
