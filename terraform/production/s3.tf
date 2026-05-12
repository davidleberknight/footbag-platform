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
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_cloudfront_oac.json
}

# ── Media DR (cross-region replication target, us-west-2) ────────────────────
# Object Lock intentionally NOT applied: photo deletion must propagate to the
# DR side to honor member-account-erasure (DD §1.5 "When member deletes
# account: member's photos automatically hard-deleted"). Operator-recovery
# headroom comes from versioning + 30-day noncurrent expiration on both
# source and destination. Region per AWS_PROJECT_SPECIFICS backup region.

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
    }
  }
}

# ── CORS for direct browser PUT (DD §6.8) ────────────────────────────────────
# Admin browser loaded from the CloudFront URL PUTs source video and poster
# bytes directly to this bucket via presigned URLs. AllowedHeaders=* covers
# Content-Type (signed) plus AWS-SDK-emitted x-amz-* headers. Production
# pulls the canonical origin from var.domain_name when set; without a domain
# attached, this resource is skipped (production has no traffic yet).

resource "aws_s3_bucket_cors_configuration" "media" {
  count  = var.domain_name != "" ? 1 : 0
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = ["https://${var.domain_name}"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# ── Snapshots (primary) ───────────────────────────────────────────────────────

resource "aws_s3_bucket" "snapshots" {
  bucket = "${local.prefix}-db-snapshots"
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
}

# ── DR bucket (cross-region snapshots backup) ────────────────────────────────
# Lives in us-west-2 (backup region per AWS_PROJECT_SPECIFICS). Object Lock
# would normally apply per MIGRATION_PLAN OR1 but Object Lock can only be
# enabled at bucket creation; revisit as a separate gated decision before
# enabling Object Lock requires recreating the bucket.

resource "aws_s3_bucket" "dr" {
  provider = aws.us_west_2
  bucket   = "${local.prefix}-db-snapshots-dr"
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

# ── Snapshots cross-region replication ───────────────────────────────────────
# Mirrors the staging/s3.tf media replication pattern: replicate every object
# (including delete markers) from snapshots (us-east-1) to dr (us-west-2) using
# the s3_replication IAM role declared in iam.tf. ONEZONE_IA storage class on
# the destination for cost savings.

resource "aws_s3_bucket_replication_configuration" "snapshots" {
  depends_on = [
    aws_s3_bucket_versioning.snapshots,
    aws_s3_bucket_versioning.dr,
  ]

  role   = aws_iam_role.s3_replication.arn
  bucket = aws_s3_bucket.snapshots.id

  rule {
    id     = "replicate-snapshots-to-dr"
    status = "Enabled"
    filter {}
    delete_marker_replication { status = "Enabled" }

    destination {
      bucket        = aws_s3_bucket.dr.arn
      storage_class = "ONEZONE_IA"
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
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "maintenance" {
  bucket = aws_s3_bucket.maintenance.id
  policy = data.aws_iam_policy_document.maintenance_cloudfront_oac.json
}
