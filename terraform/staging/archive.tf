# =============================================================================
# The legacy-site archive stack, staging rehearsal
#
# A second, self-contained CloudFront stack: its own bucket, its own
# distribution, its own signing keypair. In staging it serves on the
# distribution's own cloudfront.net name — like the main staging distribution,
# no certificate, no alias, no DNS — which is enough to prove everything novel
# about the archive with hand-signed cookies: the trusted key group, the signing
# policy's wildcard, OAC read from a private bucket, the viewer-request
# function, both gate pages, the ListBucket-backed 404, and the content
# publisher at full object count. The certificate, the alias records and the
# parent-domain cookie flow cannot be exercised without a real domain and stay
# production-only.
#
# Access control is CloudFront signed cookies against a trusted key group. The
# edge verifies the signature natively; the viewer-request function below carries
# only the one behaviour a signature check cannot, the directory-index rewrite.
#
# Two flags, because the stack has two halves with different prerequisites.
# enable_archive creates everything that works on the distribution's own
# cloudfront.net name: bucket, keys, function, gate pages, logging, the
# distribution itself. enable_archive_custom_domain adds the pieces that need a
# real domain: the certificate, the distribution aliases and the DNS records.
# Staging has no domain and no zone, so the second flag stays off here; the
# resources it gates exist for parity with the production file.
# =============================================================================

variable "enable_archive" {
  description = "Create the archive stack: bucket, key group, signing-key parameter, edge function, gate pages, distribution and access logging, served on the distribution's own cloudfront.net name until enable_archive_custom_domain adds a real one. Independent of enable_cloudfront. Requires archive_signing_public_key when true."
  type        = bool
  default     = false
}

variable "enable_archive_custom_domain" {
  description = "Serve the archive at archive.<domain_name>: the ACM certificate, its validation records, the distribution aliases and the A/AAAA records. Off, the distribution answers only on its own cloudfront.net name under the default CloudFront certificate. Requires enable_archive, domain_name and route53_zone_id when true; stays off in staging, which has neither a domain nor a zone."
  type        = bool
  default     = false

  validation {
    condition     = !var.enable_archive_custom_domain || var.enable_archive
    error_message = "enable_archive_custom_domain requires enable_archive: the certificate and DNS records attach to the archive distribution, which does not exist without the rest of the stack."
  }

  validation {
    condition     = !var.enable_archive_custom_domain || var.domain_name != ""
    error_message = "enable_archive_custom_domain requires domain_name: the certificate and the alias records are for archive.<domain_name>."
  }
}

variable "archive_require_signed_cookies" {
  description = "Require CloudFront signed cookies on archive content. On, the trusted key group is the whole access control (the production design). Off, the distribution serves archive content to anyone who reaches its unpublished hostname, and the platform's login-gated redirect route is the access gate instead: staging's platform and archive sit on two sibling cloudfront.net hosts that can never share a session cookie (cloudfront.net is a public suffix), so the edge gate is unenforceable from a staging login by design."
  type        = bool
  default     = true
}

variable "archive_platform_url" {
  description = "Base URL of the platform the archive's login redirect and gate pages point back to, without a trailing slash. Empty derives https://<domain_name>, which is right wherever the platform runs on its own domain; staging's platform is reachable only on its CloudFront default URL, so staging supplies that URL here."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_archive || var.archive_platform_url != "" || var.domain_name != ""
    error_message = "The archive needs somewhere to send signed-out visitors: set archive_platform_url (or domain_name, from which it is derived) when enable_archive is true."
  }
}

variable "archive_signing_public_key" {
  description = "PEM-encoded RSA public key whose private half signs the archive's CloudFront cookies. The operator generates the keypair and supplies only this half, so the private key never enters Terraform state; it is put into the SecureString parameter below after apply."
  type        = string
  default     = ""

  # trimspace, because a key pasted through an indented heredoc arrives with
  # leading whitespace and is still a perfectly good key; the check is about the
  # encoding, not the paste.
  validation {
    condition     = !var.enable_archive || startswith(trimspace(var.archive_signing_public_key), "-----BEGIN PUBLIC KEY-----")
    error_message = "archive_signing_public_key must be a PEM-encoded public key (beginning -----BEGIN PUBLIC KEY-----) when enable_archive is true. CloudFront rejects any other encoding at apply, after the distribution has already been created."
  }
}

locals {
  archive_domain       = "archive.${var.domain_name}"
  archive_platform_url = var.archive_platform_url != "" ? var.archive_platform_url : "https://${var.domain_name}"
  archive_login_url    = "${local.archive_platform_url}/login"
  archive_site_url     = "${local.archive_platform_url}/"

  # Reserved key prefix for the two pages CloudFront serves when it refuses a
  # request or the origin has no such object. The captured tree has exactly one
  # underscore-prefixed top-level entry (_jpg), so this prefix cannot collide
  # with mirror content, and the content publisher must never delete it.
  archive_gate_prefix = "_gate"
}

# ── Bucket ───────────────────────────────────────────────────────────────────
# Same shape as the media and snapshot buckets: private, versioned, SSE-S3, all
# four public-access-block flags, prevent_destroy.
#
# Deliberately NO Object Lock, unlike the DR snapshot bucket. The whole tree is
# re-synced after the final crawl adds video, and bucket-layer immutability
# fights a workflow whose normal operation is overwriting. Recovery headroom
# comes from versioning plus the checksummed packaged capture held offline.

resource "aws_s3_bucket" "archive" {
  count  = var.enable_archive ? 1 : 0
  bucket = "${local.prefix}-archive"

  # prevent_destroy also means turning enable_archive back off is refused at plan
  # time rather than silently deleting the rehearsal load; the plan fails whole,
  # so nothing else is touched either. Retiring the archive for real is a
  # deliberate sequence: empty the bucket, remove prevent_destroy, and flip the
  # flag off in that same change.
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "archive" {
  count  = var.enable_archive ? 1 : 0
  bucket = aws_s3_bucket.archive[0].id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "archive" {
  count  = var.enable_archive ? 1 : 0
  bucket = aws_s3_bucket.archive[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "archive" {
  count                   = var.enable_archive ? 1 : 0
  bucket                  = aws_s3_bucket.archive[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Every publish re-syncs the whole tree, so each replaced object leaves a
# noncurrent version behind. Across a capture of this size that accretes
# indefinitely without an expiry rule; 30 days leaves ample rollback headroom
# between publishes.
resource "aws_s3_bucket_lifecycle_configuration" "archive" {
  count  = var.enable_archive ? 1 : 0
  bucket = aws_s3_bucket.archive[0].id

  rule {
    id     = "expire-old-archive-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# ── CloudFront read access ───────────────────────────────────────────────────
# Origin Access Control, scoped by aws:SourceArn so this bucket is readable
# through the archive distribution and no other. The ARN condition is why the
# archive cannot reuse the maintenance bucket or its policy.
#
# ListBucket is granted alongside GetObject, which the other OAC buckets do not
# do, and the difference is load-bearing. Without ListBucket, S3 answers 403 for
# a key that does not exist, which is the same status CloudFront returns when it
# refuses a signed cookie — the two would be indistinguishable at the edge, and
# every broken link inside the mirror would tell a signed-in member their access
# was denied. The captured tree has roughly a thousand root-relative directory
# links plus a few hundred that were already broken on the live site, so missing
# keys are routine. With ListBucket, S3 returns a real 404 and the error pages
# stay truthful. Viewers gain nothing: CloudFront never issues a LIST.

resource "aws_cloudfront_origin_access_control" "archive" {
  count                             = var.enable_archive ? 1 : 0
  name                              = "${local.prefix}-archive-oac"
  description                       = "OAC for the legacy archive bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "archive_cloudfront_oac" {
  count = var.enable_archive ? 1 : 0

  statement {
    sid       = "AllowCloudFrontServicePrincipalRead"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.archive[0].arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.archive[0].arn]
    }
  }

  statement {
    sid       = "AllowCloudFrontServicePrincipalList"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.archive[0].arn]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.archive[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "archive" {
  count  = var.enable_archive ? 1 : 0
  bucket = aws_s3_bucket.archive[0].id
  policy = data.aws_iam_policy_document.archive_cloudfront_oac[0].json
}

# ── Signing keypair ──────────────────────────────────────────────────────────
# Only the public half is Terraform-managed input, so the private half never
# lands in state. Rotation is additive: register a second public key, add it to
# the group, wait out a cookie lifetime so every cookie signed by the old key
# has expired, then remove the old key.

resource "aws_cloudfront_public_key" "archive" {
  count       = var.enable_archive ? 1 : 0
  name        = "${local.prefix}-archive-signing-key"
  comment     = "Public half of the keypair signing the archive's cookies"
  encoded_key = var.archive_signing_public_key

  # A key group holds a reference to the public key, so any change forcing
  # replacement has to create the new one first.
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_cloudfront_key_group" "archive" {
  count   = var.enable_archive ? 1 : 0
  name    = "${local.prefix}-archive-signers"
  comment = "Trusted signers for the legacy archive"
  items   = [aws_cloudfront_public_key.archive[0].id]
}

# The private half, operator-supplied after apply, in the same
# shell-with-placeholder shape as the other operator-supplied secrets, under
# operator credentials (the runtime role is read-only on SSM):
#
#   aws ssm put-parameter \
#     --name "/footbag/staging/secrets/archive_signing_private_key" \
#     --value "file://$HOME/AWS/archive-signing-key.pem" --type SecureString \
#     --key-id alias/footbag-staging --overwrite
#
# (file:// hygiene keeps the key out of shell history and process listings.)
#
# This one key is exportable, where the session-JWT key is a non-exportable KMS
# key, and that difference is permanent rather than a shortcut: a CloudFront
# policy signature is RSA-SHA1 computed in the application process, and KMS does
# not offer that algorithm, so the raw key has to be loadable. The runtime role
# already reads this whole parameter prefix, so no IAM change accompanies it.
resource "aws_ssm_parameter" "archive_signing_private_key" {
  count  = var.enable_archive ? 1 : 0
  name   = "${local.ssm_prefix}/secrets/archive_signing_private_key"
  type   = "SecureString"
  key_id = aws_kms_alias.main.name
  value  = "TODO-set-via-cli-after-apply"
  lifecycle { ignore_changes = [value] }
}

# The base URL the application links its Legacy Archive card to. Terraform is
# the only party that knows the served hostname, so it publishes it here and the
# deploy syncs it into the host env file, the same route LOG_LEVEL takes. That
# keeps the address out of every committed file (it is deliberately unpublished,
# and the conventions gate refuses a concrete distribution hostname in the repo)
# and out of operator hands: no hand-edited host env line to forget or mistype.
# Absent when the archive is off, and the deploy then leaves the variable unset,
# which hides the card rather than rendering a dead link.
resource "aws_ssm_parameter" "app_archive_url" {
  count = var.enable_archive ? 1 : 0
  name  = "${local.ssm_prefix}/app/archive_url"
  type  = "String"
  value = "https://${var.enable_archive_custom_domain ? local.archive_domain : aws_cloudfront_distribution.archive[0].domain_name}"
}

# Tells the application to route the Legacy Archive card through its own
# login-gated redirect instead of linking the archive host directly. Published
# exactly when the edge gate is off, so the two can never disagree: whichever
# party gates access, the other stands down. Synced into the host env the same
# way as archive_url; absent means the direct-link default.
resource "aws_ssm_parameter" "app_archive_login_redirect" {
  count = var.enable_archive && !var.archive_require_signed_cookies ? 1 : 0
  name  = "${local.ssm_prefix}/app/archive_login_redirect"
  type  = "String"
  value = "1"
}

# ── Certificate ──────────────────────────────────────────────────────────────
# The custom-domain half starts here: everything from this certificate through
# the DNS records at the bottom of the file is gated on
# enable_archive_custom_domain, not on enable_archive. Staging has no domain and
# no zone, so this half never turns on here; it exists for parity with the
# production file.
#
# Its own certificate rather than a subject-alternative name on the main one, so
# the archive can be created, replaced or destroyed without touching the
# certificate the main distribution depends on. us-east-1 because that is where
# CloudFront reads certificates from.

resource "aws_acm_certificate" "archive" {
  count             = var.enable_archive_custom_domain ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = local.archive_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "archive_cert_validation" {
  for_each = var.enable_archive_custom_domain ? {
    for dvo in aws_acm_certificate.archive[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "archive" {
  count                   = var.enable_archive_custom_domain ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.archive[0].arn
  validation_record_fqdns = [for record in aws_route53_record.archive_cert_validation : record.fqdn]
}

# ── Edge function ────────────────────────────────────────────────────────────
# One behaviour the native signature check cannot provide: naming the index
# document on directory URLs, which an S3 origin cannot resolve on its own.
# There is deliberately no login redirect here: CloudFront validates the signed
# cookie before a viewer-request function runs, so a redirect branch for
# cookie-less visitors could never fire — anonymous visitors draw the 403 that
# maps to the denied-access page, whose sign-in link covers them.

resource "aws_cloudfront_function" "archive_edge" {
  count   = var.enable_archive ? 1 : 0
  name    = "${local.prefix}-archive-edge"
  runtime = "cloudfront-js-2.0"
  publish = true
  comment = "Resolves archive directory URLs to their index.html"
  code    = file("${path.module}/cloudfront-functions/archive-edge.js")

  # CloudFront Functions cannot be deleted while a distribution still references
  # them, so any change forcing replacement must create the new one first.
  lifecycle {
    create_before_destroy = true
  }
}

# ── Cache and response policies ──────────────────────────────────────────────
# The capture is immutable between publishes, and every publish ends with a
# blanket invalidation, so content can sit at the edge for a year. Cookies stay
# out of the cache key: the signed cookies differ per member and per session, and
# including them would shard the cache to uselessness while adding nothing —
# CloudFront validates them before the cache is consulted.

resource "aws_cloudfront_cache_policy" "archive_content" {
  count       = var.enable_archive ? 1 : 0
  name        = "${local.prefix}-archive-content"
  comment     = "Long-lived edge cache for immutable archive objects; no cookies, headers or query strings in the cache key"
  min_ttl     = 0
  default_ttl = 31536000 # 1 year; objects change only when a publish replaces them
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# The archive must not be indexed. The auth gate does most of that work, since a
# crawler never holds a signed cookie, but the responses a crawler CAN reach —
# the two gate pages — say so explicitly.
resource "aws_cloudfront_response_headers_policy" "archive_noindex" {
  count   = var.enable_archive ? 1 : 0
  name    = "${local.prefix}-archive-noindex"
  comment = "Marks the publicly reachable archive gate pages as non-indexable"

  custom_headers_config {
    items {
      header   = "X-Robots-Tag"
      value    = "noindex, nofollow"
      override = true
    }
  }
}

# ── Gate pages ───────────────────────────────────────────────────────────────
# Terraform places these rather than the content publisher, because the stack has
# to prove its refusal behaviour end to end on an empty distribution, before any
# mirror content is uploaded. They also have to survive every later publish, so
# they live under a reserved prefix the publisher leaves alone.

resource "aws_s3_object" "archive_denied_page" {
  count        = var.enable_archive ? 1 : 0
  bucket       = aws_s3_bucket.archive[0].id
  key          = "${local.archive_gate_prefix}/denied.html"
  content      = templatefile("${path.module}/archive-pages/denied.html.tftpl", { login_url = local.archive_login_url, site_url = local.archive_site_url })
  content_type = "text/html; charset=utf-8"
}

resource "aws_s3_object" "archive_not_found_page" {
  count        = var.enable_archive ? 1 : 0
  bucket       = aws_s3_bucket.archive[0].id
  key          = "${local.archive_gate_prefix}/not-found.html"
  content      = templatefile("${path.module}/archive-pages/not-found.html.tftpl", { site_url = local.archive_site_url })
  content_type = "text/html; charset=utf-8"
}

# ── Access log bucket ────────────────────────────────────────────────────────
# A members-only surface holding legacy member contact details should not run
# with no record of who read what. Ninety days is long enough to investigate an
# incident and short enough that the log set does not become its own liability.

resource "aws_s3_bucket" "archive_logs" {
  count  = var.enable_archive ? 1 : 0
  bucket = "${local.prefix}-archive-logs"
}

resource "aws_s3_bucket_public_access_block" "archive_logs" {
  count                   = var.enable_archive ? 1 : 0
  bucket                  = aws_s3_bucket.archive_logs[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "archive_logs" {
  count  = var.enable_archive ? 1 : 0
  bucket = aws_s3_bucket.archive_logs[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "archive_logs" {
  count  = var.enable_archive ? 1 : 0
  bucket = aws_s3_bucket.archive_logs[0].id

  rule {
    id     = "expire-archive-access-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = 90
    }
  }
}

# This policy follows AWS's published bucket policy for the log-delivery service
# verbatim: writes land under AWSLogs/<account>/, carry the bucket-owner canned
# ACL header (accepted, not applied, on a bucket with ACLs disabled), and must
# originate from a delivery source in this account. The ACL-check statement is
# the delivery service verifying bucket ownership before it writes. None of this
# is optional narrowing: a policy the service considers insufficient does not
# fail the apply, it just never delivers a log, and nobody notices until the
# incident the logs were kept for.
data "aws_iam_policy_document" "archive_logs_delivery" {
  count = var.enable_archive ? 1 : 0

  statement {
    sid       = "AWSLogDeliveryWrite"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.archive_logs[0].arn}/AWSLogs/${var.aws_account_id}/*"]

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:logs:us-east-1:${var.aws_account_id}:delivery-source:*"]
    }
  }

  statement {
    sid       = "AWSLogDeliveryAclCheck"
    effect    = "Allow"
    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [aws_s3_bucket.archive_logs[0].arn]

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:logs:us-east-1:${var.aws_account_id}:delivery-source:*"]
    }
  }
}

resource "aws_s3_bucket_policy" "archive_logs" {
  count  = var.enable_archive ? 1 : 0
  bucket = aws_s3_bucket.archive_logs[0].id
  policy = data.aws_iam_policy_document.archive_logs_delivery[0].json
}

# Standard logging through the log-delivery service rather than the older
# in-distribution logging block, which would require re-enabling S3 ACLs on the
# log bucket; every bucket in this tree keeps ACLs disabled. CloudFront is a
# global service whose log delivery is configured out of us-east-1.

resource "aws_cloudwatch_log_delivery_source" "archive_access_logs" {
  count        = var.enable_archive ? 1 : 0
  provider     = aws.us_east_1
  name         = "${local.prefix}-archive-access-logs"
  log_type     = "ACCESS_LOGS"
  resource_arn = aws_cloudfront_distribution.archive[0].arn
}

resource "aws_cloudwatch_log_delivery_destination" "archive_access_logs" {
  count         = var.enable_archive ? 1 : 0
  provider      = aws.us_east_1
  name          = "${local.prefix}-archive-access-logs"
  output_format = "w3c"

  delivery_destination_configuration {
    destination_resource_arn = aws_s3_bucket.archive_logs[0].arn
  }
}

resource "aws_cloudwatch_log_delivery" "archive_access_logs" {
  count                    = var.enable_archive ? 1 : 0
  provider                 = aws.us_east_1
  delivery_source_name     = aws_cloudwatch_log_delivery_source.archive_access_logs[0].name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.archive_access_logs[0].arn
}

# ── Distribution ─────────────────────────────────────────────────────────────

resource "aws_cloudfront_distribution" "archive" {
  count               = var.enable_archive ? 1 : 0
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.prefix} legacy archive"
  price_class         = "PriceClass_100" # US + Europe, matching the main distribution
  aliases             = var.enable_archive_custom_domain ? [local.archive_domain] : []
  default_root_object = "" # the edge function names index.html on every directory URL, including /

  origin {
    origin_id                = "archive-s3-origin"
    domain_name              = aws_s3_bucket.archive[0].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.archive[0].id
  }

  # ── Archive content, members only ─────────────────────────────────────────
  # trusted_key_groups is the whole access control: CloudFront verifies the
  # cookie signature itself and refuses anything else with a 403, which the
  # error mapping below turns into a readable page. With
  # archive_require_signed_cookies off, the list is empty and the distribution
  # serves without a credential; the platform's login-gated redirect is then
  # the access gate (see that variable for why staging cannot gate here).
  #
  # No origin_request_policy: OAC signs the request, and forwarding the viewer
  # Host header to an S3 origin breaks virtual-host bucket routing (the
  # /media-store/* behaviour in cloudfront.tf carries the full account of that
  # failure). It also matters here that no cookies reach the origin at all.
  default_cache_behavior {
    target_origin_id       = "archive-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id    = aws_cloudfront_cache_policy.archive_content[0].id
    trusted_key_groups = var.archive_require_signed_cookies ? [aws_cloudfront_key_group.archive[0].id] : []

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.archive_edge[0].arn
    }
  }

  # ── Gate pages, deliberately unauthenticated ──────────────────────────────
  # These are what a refused viewer is shown, so they cannot themselves require
  # the credential that was just refused: no key group, and no function either —
  # the gate pages are exact object keys with no directory URLs to resolve.
  ordered_cache_behavior {
    path_pattern           = "/${local.archive_gate_prefix}/*"
    target_origin_id       = "archive-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.archive_noindex[0].id
  }

  # A missing or expired cookie draws CloudFront's own 403; a key the bucket
  # does not hold draws a 404, which is a real 404 only because the bucket policy
  # grants ListBucket. Each keeps its own status: the first is genuinely a
  # refusal, the second genuinely a missing page, and telling a member which one
  # happened is the entire reason there are two pages.
  custom_error_response {
    error_code            = 403
    response_code         = 403
    response_page_path    = "/${local.archive_gate_prefix}/denied.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/${local.archive_gate_prefix}/not-found.html"
    error_caching_min_ttl = 10
  }

  # Without the custom domain there is no certificate to name: the distribution
  # answers on its own cloudfront.net name under the default CloudFront
  # certificate, which is also the only certificate that name allows.
  viewer_certificate {
    cloudfront_default_certificate = var.enable_archive_custom_domain ? null : true
    acm_certificate_arn            = var.enable_archive_custom_domain ? aws_acm_certificate_validation.archive[0].certificate_arn : null
    ssl_support_method             = var.enable_archive_custom_domain ? "sni-only" : null
    minimum_protocol_version       = var.enable_archive_custom_domain ? "TLSv1.2_2021" : "TLSv1"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }
}

# ── DNS ──────────────────────────────────────────────────────────────────────
# Gated on the custom-domain flag, which stays off in staging: there is no zone
# to write into.

resource "aws_route53_record" "archive_a" {
  count   = var.enable_archive_custom_domain ? 1 : 0
  zone_id = var.route53_zone_id
  name    = local.archive_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.archive[0].domain_name
    zone_id                = aws_cloudfront_distribution.archive[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "archive_aaaa" {
  count   = var.enable_archive_custom_domain ? 1 : 0
  zone_id = var.route53_zone_id
  name    = local.archive_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.archive[0].domain_name
    zone_id                = aws_cloudfront_distribution.archive[0].hosted_zone_id
    evaluate_target_health = false
  }
}
