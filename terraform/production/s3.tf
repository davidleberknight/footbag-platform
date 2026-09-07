# =============================================================================
# S3 Buckets
#   - media:       user-facing media (future use)
#   - snapshots:   SQLite DB snapshots (primary)
#   - dr:          cross-region DR copy of snapshots
#   - maintenance: static maintenance page served by CloudFront on 5xx
# =============================================================================

# ── Media ─────────────────────────────────────────────────────────────────────
# Production media bucket. Mirrors the staging shape: versioning enabled,
# AES256 SSE, OAC-only read via aws_s3_bucket_policy.media, noncurrent-
# version + pending-upload lifecycle rules, CORS for browser-direct PUT,
# and cross-region replication to media_dr in us-west-2.

resource "aws_s3_bucket" "media" {
  bucket = "${local.prefix}-media"
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Media lifecycle ──────────────────────────────────────────────────────────
# Two rules:
#   - expire-old-media-versions: noncurrent versions cleaned after 30 days.
#     Avatar keys are stable per member, so replacement uploads overwrite
#     in place under versioning. Without expiration, every replacement
#     accumulates old bytes forever. 30 days gives operator headroom.
#   - expire-pending-uploads: objects under the pending/ prefix are
#     hard-deleted after 24 hours. Defense in depth for the async curator
#     video upload flow (DD §6.8): the worker deletes pending sources on
#     finalize-success, but if the browser PUT lands and the admin never
#     POSTs /finalize, lifecycle still reclaims the bytes.

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "expire-old-media-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  rule {
    id     = "expire-pending-uploads"
    status = "Enabled"
    filter {
      prefix = "pending/"
    }
    expiration {
      days = 1
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# ── CloudFront OAC read access on the media bucket ───────────────────────────
# Grants the production CloudFront distribution s3:GetObject scoped via
# aws:SourceArn so the bucket cannot be read through any other CloudFront
# distribution. The web role (app_runtime, declared in iam.tf) holds
# Put/Delete/Head only; CloudFront-OAC is the sole read path for clients.

data "aws_iam_policy_document" "media_cloudfront_oac" {
  count = var.enable_cloudfront ? 1 : 0
  statement {
    sid       = "AllowCloudFrontServicePrincipalRead"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_cloudfront_oac[0].json
}

# ── Media DR (cross-region replication target, us-west-2) ────────────────────
# Object Lock intentionally NOT applied: photo deletion must propagate to the
# DR side to honor member-account-erasure (DD §1.5 "When member deletes
# account: member's photos automatically hard-deleted"). Operator-recovery
# headroom comes from versioning + 30-day noncurrent expiration on both
# source and destination. Backup region: us-west-2.

resource "aws_s3_bucket" "media_dr" {
  provider = aws.us_west_2
  bucket   = "${local.prefix}-media-dr"
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "media_dr" {
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.media_dr.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media_dr" {
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.media_dr.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media_dr" {
  provider                = aws.us_west_2
  bucket                  = aws_s3_bucket.media_dr.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "media_dr" {
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.media_dr.id

  rule {
    id     = "expire-old-media-dr-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# Cross-region replication: media → media_dr. Continuous, RPO < 15 min.
# Delete markers replicated so account-erasure deletions propagate.
# The s3_replication role's policy (iam.tf) covers BOTH snapshots and media
# replication; see the role declaration for the combined resource list.

resource "aws_s3_bucket_replication_configuration" "media" {
  depends_on = [
    aws_s3_bucket_versioning.media,
    aws_s3_bucket_versioning.media_dr,
  ]

  role   = aws_iam_role.s3_replication.arn
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "replicate-all-to-media-dr"
    status = "Enabled"
    filter {}
    delete_marker_replication { status = "Enabled" }

    destination {
      bucket        = aws_s3_bucket.media_dr.arn
      storage_class = "ONEZONE_IA"

      # Same flag as the snapshot rule: the metrics the alarms read exist only
      # while the rule publishes them.
      dynamic "metrics" {
        for_each = var.enable_replication_alarm ? [1] : []
        content {
          status = "Enabled"
        }
      }
    }
  }
}

# ── CORS for direct browser PUT (DD §6.8) ────────────────────────────────────
# Admin browser loaded from the CloudFront URL PUTs source video and poster
# bytes directly to this bucket via presigned URLs. AllowedHeaders=* covers
# Content-Type (signed) plus AWS-SDK-emitted x-amz-* headers. Gated on
# enable_cloudfront exactly like staging: before the distribution exists
# there is no public origin to cross from.
#
# The list is every address the admin page is actually served from, because a
# browser sends the origin it loaded the page from and S3 compares it literally.
# The distribution's own generated name is first and is always allowed: it is how
# the platform is reached until the custom domain is enabled, and it stays
# reachable afterwards. The preview subdomain follows it while that name exists.
# The canonical host joins them once the custom domain is on -- www, not the bare
# apex, because the apex only redirects and no page is ever served under it, so
# no browser ever presents it as an origin.

resource "aws_s3_bucket_cors_configuration" "media" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = concat(
      ["https://${aws_cloudfront_distribution.main[0].domain_name}"],
      var.enable_platform_custom_domain ? ["https://www.${var.domain_name}"] : [],
      var.enable_platform_custom_domain && var.enable_preview_record ? ["https://preview.${var.domain_name}"] : [],
    )
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# ── Snapshots (primary) ───────────────────────────────────────────────────────

resource "aws_s3_bucket" "snapshots" {
  bucket = "${local.prefix}-db-snapshots"
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "snapshots" {
  bucket                  = aws_s3_bucket.snapshots.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id
  rule {
    id     = "expire-noncurrent"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
  # Three retention tiers, written by the backup producer. Every run lands in
  # routine/; the first run of each hour is also copied to hourly/ and the first
  # of each day to daily/, so the history thins as it ages instead of holding
  # every full copy at full grain and then stopping dead.
  #
  # Measured inputs: a snapshot is ~13.7 MB and the timer yields ~240 a day, so
  # an undifferentiated 30-day routine window is ~7,200 objects and ~98 GB, and
  # nothing at all survives day 31. These windows hold ~1,600 objects and ~22 GB
  # while adding a year of daily restore points that did not exist before.
  #
  # What this costs in recovery terms: a corruption found within two days still
  # restores to within six minutes of it, one found inside a month to within an
  # hour, and one found inside a year to within a day. Only the fine grain ages
  # out, never the most recent snapshot, so the recovery point objective for an
  # ordinary failure is unchanged.
  #
  # The pre-cutover snapshot lands in the DR bucket under pre-flip/, never under
  # any of these prefixes, so none of these rules can age it out.
  rule {
    id     = "expire-routine-stream"
    status = "Enabled"
    filter { prefix = "routine/" }
    expiration { days = 2 }
  }

  rule {
    id     = "expire-hourly-tier"
    status = "Enabled"
    filter { prefix = "hourly/" }
    expiration { days = 30 }
  }

  # Just over a year, so a restore point exists for the same month last year
  # when an annual reconciliation turns something up.
  rule {
    id     = "expire-daily-tier"
    status = "Enabled"
    filter { prefix = "daily/" }
    expiration { days = 400 }
  }
}

# ── DR bucket (cross-region snapshots backup) ────────────────────────────────
# Lives in us-west-2 (backup region). Object Lock is enabled at creation
# (it cannot be retrofitted): the pre-flip cutover snapshot and replicated
# routine backups become undeletable for the default retention window, which
# covers the 48h rollback window plus disaster-recovery restore headroom. The
# 90-day window keeps snapshots recoverable well past the rollback window.
# GOVERNANCE mode (not COMPLIANCE) so an operator with
# s3:BypassGovernanceRetention can still recover from a mistaken upload and can
# honor a lawful erasure request; COMPLIANCE would make both impossible for the
# full window. If this bucket already exists without
# Object Lock, it must be recreated (import will not add the flag).

resource "aws_s3_bucket" "dr" {
  provider            = aws.us_west_2
  bucket              = "${local.prefix}-db-snapshots-dr"
  object_lock_enabled = true
  # Object Lock makes the snapshot objects undeletable for the retention window;
  # prevent_destroy is the orthogonal guard against a terraform run removing the
  # bucket resource itself. Both apply, matching the other durable buckets.
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_object_lock_configuration" "dr" {
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.dr.id
  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = 90
    }
  }
}

resource "aws_s3_bucket_versioning" "dr" {
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.dr.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "dr" {
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.dr.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "dr" {
  provider                = aws.us_west_2
  bucket                  = aws_s3_bucket.dr.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Replication carries the promoted hourly and daily tiers here, not the routine
# stream, so this bucket holds roughly one point an hour rather than one every
# six minutes. Without expiry rules those still accumulate with no end, and the
# routine rule below remains because copies replicated under the earlier
# every-object scope have to age out; nothing new arrives under that prefix.
#
# 90 days, matching the Object Lock window above, so a copy expires at the
# moment it first becomes deletable. A shorter window would not delete anything
# sooner, because the lock refuses until it lapses; it would only put the rule
# and the lock into disagreement.
#
# Scoped to routine/ deliberately. The pre-cutover snapshot lands under
# pre-flip/ in this bucket precisely so routine retention cannot age it out,
# and that is the copy whose whole purpose is to outlive everything else.
resource "aws_s3_bucket_lifecycle_configuration" "dr" {
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.dr.id
  rule {
    id     = "expire-dr-routine-stream"
    status = "Enabled"
    filter { prefix = "routine/" }
    expiration { days = 90 }
  }

  # The hourly tier is the off-region recovery grain. 90 days rather than the
  # primary's 30, because Object Lock refuses a delete before the lock lapses
  # and a shorter window would only put the rule and the lock into disagreement.
  rule {
    id     = "expire-dr-hourly-tier"
    status = "Enabled"
    filter { prefix = "hourly/" }
    expiration { days = 90 }
  }

  # 90 days, matching the Object Lock, not the primary's 400-day daily window.
  # The design fixes one cross-region retention for this bucket and requires the
  # lifecycle rules to match the lock, so a copy stays immutable for as long as
  # it is kept. Matching the primary instead would leave a daily copy sitting
  # for 310 days after its lock lapsed, protected by access control alone in the
  # account whose credentials the lock exists to defend against. The long daily
  # history stays in the primary region; the off-region copy is a disaster hedge
  # for continuity, not an archive.
  rule {
    id     = "expire-dr-daily-tier"
    status = "Enabled"
    filter { prefix = "daily/" }
    expiration { days = 90 }
  }

  # The rule above only writes a delete marker, because this bucket is versioned.
  # Without this second rule the superseded versions sit behind those markers
  # forever, so "expires after 90 days" was true of visibility and false of
  # storage, and the bucket grew without bound at roughly 3.5 GB a day. The
  # primary snapshots bucket has carried the equivalent rule all along; this one
  # did not, which is why the two diverged silently.
  #
  # 90 days matches the Object Lock retention on this bucket: a version cannot be
  # removed before the lock lapses anyway, so a shorter window here would only
  # put the rule and the lock into disagreement.
  rule {
    id     = "expire-dr-noncurrent-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

# ── Snapshots cross-region replication ───────────────────────────────────────
# Replicates the promoted retention tiers (including delete markers) from
# snapshots (us-east-1) to dr (us-west-2) using the s3_replication IAM role
# declared in iam.tf, at ONEZONE_IA on the destination.
#
# Deliberately not every object. Replicating the six-minute routine stream moved
# roughly 98 GB a month between regions to build an off-region copy that cannot
# be thinned, because Object Lock refuses to delete anything for 90 days: the
# transfer and the destination storage were together the largest line in the
# backup bill, and the copy they bought was 90 days of near-identical snapshots.
# Carrying the hourly and daily tiers instead costs about a tenth of that.
#
# The trade is stated plainly: losing the whole region costs up to an hour of
# writes rather than up to six minutes. That is the rarest failure on the list
# and the one where an hour of member edits is the smallest part of the problem.
# Every other failure mode restores from the primary bucket and is unaffected.
#
# Two rules because a replication filter takes a single prefix. The priorities
# are distinct as S3 requires; the prefixes cannot overlap, so their order
# carries no meaning.

resource "aws_s3_bucket_replication_configuration" "snapshots" {
  depends_on = [
    aws_s3_bucket_versioning.snapshots,
    aws_s3_bucket_versioning.dr,
  ]

  role   = aws_iam_role.s3_replication.arn
  bucket = aws_s3_bucket.snapshots.id

  rule {
    id       = "replicate-hourly-tier-to-dr"
    status   = "Enabled"
    priority = 10
    filter { prefix = "hourly/" }
    delete_marker_replication { status = "Enabled" }

    destination {
      bucket        = aws_s3_bucket.dr.arn
      storage_class = "ONEZONE_IA"

      # S3 publishes the replication metrics the alarms read only when the rule
      # asks for them, so the metrics and the alarms share one flag: arming the
      # alarms without the metrics would watch a stream that does not exist.
      dynamic "metrics" {
        for_each = var.enable_replication_alarm ? [1] : []
        content {
          status = "Enabled"
        }
      }
    }
  }

  rule {
    id       = "replicate-daily-tier-to-dr"
    status   = "Enabled"
    priority = 20
    filter { prefix = "daily/" }
    delete_marker_replication { status = "Enabled" }

    destination {
      bucket        = aws_s3_bucket.dr.arn
      storage_class = "ONEZONE_IA"

      dynamic "metrics" {
        for_each = var.enable_replication_alarm ? [1] : []
        content {
          status = "Enabled"
        }
      }
    }
  }
}

# ── Maintenance page ──────────────────────────────────────────────────────────

resource "aws_s3_bucket" "maintenance" {
  bucket = "${local.prefix}-maintenance"
}

resource "aws_s3_bucket_public_access_block" "maintenance" {
  bucket                  = aws_s3_bucket.maintenance.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront OAC read access on the maintenance bucket. Grants the production
# distribution s3:GetObject scoped via aws:SourceArn so the bucket cannot be
# read through any other CloudFront distribution.

data "aws_iam_policy_document" "maintenance_cloudfront_oac" {
  count = var.enable_cloudfront ? 1 : 0
  statement {
    sid       = "AllowCloudFrontServicePrincipalRead"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.maintenance.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "maintenance" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.maintenance.id
  policy = data.aws_iam_policy_document.maintenance_cloudfront_oac[0].json
}
