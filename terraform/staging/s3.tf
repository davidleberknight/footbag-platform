# =============================================================================
# S3 Buckets
# - media:        processed photo objects and media assets
# - snapshots:    5-minute SQLite WAL snapshots (primary backup)
# - media_dr:     cross-region replication target for media (us-west-2)
# - maintenance:  static maintenance page served by CloudFront during outages
#
# PARITY DIVERGENCE, DELIBERATE. Production carries a fourth durable bucket, a
# snapshot DR target in the backup region with Object Lock enabled at creation,
# together with the replication that fills it. Staging has none of the three,
# because staging is reset-tolerant: its database can be rebuilt from a seed at
# any time, so there is nothing here whose loss a second region would prevent,
# and a same-region unlocked copy would rehearse none of what production's DR
# actually does. Media replication is a different case and is at parity: it
# exercises the media pipeline itself, so both trees replicate media to a
# second region.
# =============================================================================

locals {
  buckets = {
    media       = "${local.prefix}-media"
    snapshots   = "${local.prefix}-snapshots"
    maintenance = "${local.prefix}-maintenance"
  }
}

# ── Helper: private bucket baseline ──────────────────────────────────────────
# Applied to every bucket, maintenance included. OAC reads through a bucket
# policy scoped to the distribution's ARN, which a public-access block does not
# interfere with, so serving a bucket through CloudFront is no reason to leave
# it unblocked.

resource "aws_s3_bucket" "media" {
  bucket = local.buckets.media
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket" "snapshots" {
  bucket = local.buckets.snapshots
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket" "maintenance" {
  bucket = local.buckets.maintenance
}

# ── Versioning ────────────────────────────────────────────────────────────────

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_versioning" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id
  versioning_configuration { status = "Enabled" }
}

# ── Encryption ────────────────────────────────────────────────────────────────

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ── Block public access on all private buckets ────────────────────────────────

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "snapshots" {
  bucket                  = aws_s3_bucket.snapshots.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "maintenance" {
  bucket                  = aws_s3_bucket.maintenance.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Declared rather than inherited from the S3 account default, matching
# production and the other buckets in this tree. The account default is not
# visible here and can be changed elsewhere.
resource "aws_s3_bucket_server_side_encryption_configuration" "maintenance" {
  bucket = aws_s3_bucket.maintenance.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ── Snapshot lifecycle — expire old versions after 90 days ───────────────────

resource "aws_s3_bucket_lifecycle_configuration" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id

  rule {
    id     = "expire-old-snapshot-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    # Matches production. A snapshot is above the CLI's multipart threshold, and
    # parts left by a killed upload are not objects, so no expiration rule here
    # reaches them.
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }

  # The routine backup producer runs on this host too and writes a fresh
  # timestamped key each time. Every object is therefore a current version,
  # which the noncurrent rule above can never reach, so without these rules the
  # stream accumulates forever.
  #
  # The producer promotes the first run of each hour and each day into hourly/
  # and daily/, so all three prefixes need a window here even though staging is
  # reset-tolerant: an unswept prefix grows without bound whatever the data is
  # worth. The windows are deliberately shorter than production's. Staging's
  # database can be rebuilt from a seed at any time, so the long tail production
  # keeps for a late-discovered corruption buys nothing here; what staging needs
  # is enough history to rehearse a restore.
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
    expiration { days = 14 }
  }

  rule {
    id     = "expire-daily-tier"
    status = "Enabled"
    filter { prefix = "daily/" }
    expiration { days = 30 }
  }
}

# =============================================================================
# Media DR bucket (us-west-2) — cross-region replication target for the
# primary media bucket. Object Lock intentionally not applied: photo deletion
# must propagate to the DR side to honor member-account-erasure (DD §1.5
# "When member deletes account: member's photos automatically hard-deleted").
# Operator-recovery headroom comes from versioning + 30-day noncurrent
# expiration on both source and destination.
# =============================================================================

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

# ── Media lifecycle ──────────────────────────────────────────────────────────
# Two rules:
#   - expire-old-media-versions: noncurrent versions cleaned after 30 days.
#     Avatar keys are stable per member, so replacement uploads overwrite-in-
#     place under versioning. Without expiration, every replacement would
#     accumulate old bytes forever. 30 days gives operator headroom.
#   - expire-pending-uploads: objects under the configured pending/ prefix are
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

# ── CORS for direct browser PUT (DD §6.8 async curator video upload) ─────────
# The admin browser, loaded from the CloudFront URL, PUTs source video and
# poster bytes directly to this bucket via presigned URLs (bypasses nginx and
# CloudFront for the bytes). Without CORS the browser blocks the cross-origin
# PUT preflight. AllowedHeaders=* covers Content-Type (signed) plus the
# AWS-SDK-emitted x-amz-* headers. Empty when CloudFront is not yet enabled
# since there is no public origin to cross from.
#
# One origin, and it diverges from production deliberately: staging serves on its
# default CloudFront name permanently and attaches no custom domain, so that name
# is the only address an admin page is ever loaded from here. Production's list
# gains the canonical host and the preview subdomain as their flags turn on.

resource "aws_s3_bucket_cors_configuration" "media" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = ["https://${aws_cloudfront_distribution.main[0].domain_name}"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
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

# ── Cross-region replication: media → media_dr ───────────────────────────────
# Continuous, RPO < 15 min. ONEZONE_IA destination storage class for cost
# savings on DR. Delete markers are replicated so account-erasure deletions
# propagate.

resource "aws_s3_bucket_replication_configuration" "media" {
  # Replication requires versioning enabled on BOTH source and destination.
  # Without listing the destination, terraform schedules them in parallel and
  # S3 rejects the PutBucketReplication call before destination versioning
  # state propagates.
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
}

# ── CloudFront OAC read access on media bucket ───────────────────────────────
# Grants the CloudFront distribution s3:GetObject. Restricted to this distribution
# via aws:SourceArn so the bucket cannot be read through any other CloudFront
# distribution. Web role (app_runtime) has Put/Delete/Head only -- CloudFront-OAC
# is the sole read path.

# Ungated document, gated statement, matching production: the deny must not
# disappear on a tree with the distribution turned off.
data "aws_iam_policy_document" "media_cloudfront_oac" {
  statement {
    sid    = "DenyPlaintextAccess"
    effect = "Deny"
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.media.arn,
      "${aws_s3_bucket.media.arn}/*",
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  dynamic "statement" {
    for_each = var.enable_cloudfront ? [1] : []
    content {
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
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_cloudfront_oac.json
}

# Deny-only policies for the three staging buckets that grant nothing. Parity
# with production, and the same reasoning: adding a deny where no allow exists
# cannot subtract anything, and the estate should not have a bucket that accepts
# plaintext just because nothing else needed a policy on it.
data "aws_iam_policy_document" "snapshots" {
  statement {
    sid    = "DenyPlaintextAccess"
    effect = "Deny"
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.snapshots.arn,
      "${aws_s3_bucket.snapshots.arn}/*",
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id
  policy = data.aws_iam_policy_document.snapshots.json
}

data "aws_iam_policy_document" "maintenance" {
  statement {
    sid    = "DenyPlaintextAccess"
    effect = "Deny"
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.maintenance.arn,
      "${aws_s3_bucket.maintenance.arn}/*",
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "maintenance" {
  bucket = aws_s3_bucket.maintenance.id
  policy = data.aws_iam_policy_document.maintenance.json
}

data "aws_iam_policy_document" "media_dr" {
  statement {
    sid    = "DenyPlaintextAccess"
    effect = "Deny"
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.media_dr.arn,
      "${aws_s3_bucket.media_dr.arn}/*",
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "media_dr" {
  provider = aws.us_west_2
  bucket   = aws_s3_bucket.media_dr.id
  policy   = data.aws_iam_policy_document.media_dr.json
}
