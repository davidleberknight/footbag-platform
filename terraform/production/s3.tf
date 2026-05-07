# =============================================================================
# S3 Buckets
#   - media:       user-facing media (future use)
#   - snapshots:   SQLite DB snapshots (primary)
#   - dr:          cross-region DR copy of snapshots
#   - maintenance: static maintenance page served by CloudFront on 5xx
# =============================================================================

# ── Media ─────────────────────────────────────────────────────────────────────
# Production media bucket is staged for go-live but not yet exercised. Today
# all curator media testing happens on staging; production only carries the
# bucket + public-access-block + the async-upload pieces (lifecycle, CORS,
# IAM) added below. Items still required before prod cutover, per parity with
# staging/s3.tf:
#   - aws_s3_bucket_versioning.media (Enabled)
#   - aws_s3_bucket_server_side_encryption_configuration.media (AES256)
#   - aws_s3_bucket_lifecycle_configuration.media: a noncurrent-version
#     expiration rule alongside the expire-pending-uploads rule below.
#   - aws_s3_bucket_policy.media: CloudFront OAC read grant
#     (s3:GetObject scoped to the production CloudFront distribution).
#   - DR replication: media_dr bucket in us-west-2 + replication rule.
# Add these alongside the production cutover work; do not apply this file to
# prod with the current shape and call it done.

resource "aws_s3_bucket" "media" {
  bucket = "${local.prefix}-media"
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Media lifecycle: expire pending uploads after 24h ────────────────────────
# Defense in depth for the async curator video upload flow (DD §6.8). The
# worker deletes pending sources on finalize-success; this rule reclaims any
# orphans where the browser PUT landed but /finalize was never called.

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

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
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

# ── DR bucket (cross-region) ──────────────────────────────────────────────────
# TODO: Configure replication rule on snapshots bucket to replicate to dr bucket.

resource "aws_s3_bucket" "dr" {
  bucket = "${local.prefix}-db-snapshots-dr"
}

resource "aws_s3_bucket_versioning" "dr" {
  bucket = aws_s3_bucket.dr.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "dr" {
  bucket = aws_s3_bucket.dr.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "dr" {
  bucket                  = aws_s3_bucket.dr.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
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
