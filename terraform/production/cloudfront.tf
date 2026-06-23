# =============================================================================
# Cache & origin-request policies
# Managed policies (data sources) for HTML and static assets; one custom cache
# policy for /media-store/* (query string in cache key, URL-versioned cache-bust).
# =============================================================================

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host_header" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_origin_request_policy" "cors_s3_origin" {
  name = "Managed-CORS-S3Origin"
}

resource "aws_cloudfront_cache_policy" "media_assets" {
  name        = "${local.prefix}-media-assets"
  comment     = "Edge cache for /media-store/* with query string in cache key (URL-versioned cache-bust)"
  min_ttl     = 0
  default_ttl = 604800   # 7 days; matches express.static maxAge
  max_ttl     = 31536000 # 1 year ceiling

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
      query_string_behavior = "all"
    }
  }
}

# Edge cache for /css/* and /js/*. Mirrors media_assets: the query string is in the
# cache key, so the `?v=<content-hash>` token the app emits makes each content
# version a distinct, immutable edge entry and a deploy self-cache-busts with no
# manual invalidation.
resource "aws_cloudfront_cache_policy" "static_assets" {
  name        = "${local.prefix}-static-assets"
  comment     = "Edge cache for /css/* and /js/* with query string in cache key (?v=<content-hash> cache-bust)"
  min_ttl     = 0
  default_ttl = 604800   # 7 days
  max_ttl     = 31536000 # 1 year ceiling

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
      query_string_behavior = "all"
    }
  }
}

# =============================================================================
# Origin Access Control for the maintenance bucket.
# Lets the CloudFront distribution read the maintenance.html object via SigV4
# without exposing the bucket publicly. Paired with aws_s3_bucket_policy.maintenance
# in s3.tf.
# =============================================================================

resource "aws_cloudfront_origin_access_control" "maintenance" {
  name                              = "${local.prefix}-maintenance-oac"
  description                       = "OAC for maintenance bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# =============================================================================
# Origin Access Control for the media bucket.
# Lets the CloudFront distribution read media objects via SigV4 without
# making the bucket public. Paired with aws_s3_bucket_policy.media in s3.tf.
# =============================================================================

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${local.prefix}-media-oac"
  description                       = "OAC for media bucket (URL-versioned cache-bust + immutable PUTs)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# =============================================================================
# CloudFront Function: strip /media-store/ prefix from viewer-request URI
# DD §1.5 says local-fs and S3 layouts mirror exactly, so S3 keys do NOT
# have a /media-store/ prefix. The prefix is purely a URL convention. When
# CloudFront forwards to S3, this function rewrites the URI so the origin
# sees the actual S3 key. Without it, S3 looks up media-store/avatars/...
# and 404s.
# =============================================================================

resource "aws_cloudfront_function" "strip_media_store_prefix" {
  name    = "${local.prefix}-strip-media-store-prefix"
  runtime = "cloudfront-js-2.0"
  publish = true
  comment = "Strips /media-store/ from viewer-request URI before forwarding to S3 origin (DD §1.5)"
  code    = file("${path.module}/cloudfront-functions/strip-media-store-prefix.js")

  # CloudFront Functions cannot be deleted while a distribution still
  # references them, so renames or code changes that force replacement must
  # use create-before-destroy.
  lifecycle {
    create_before_destroy = true
  }
}

# =============================================================================
# CloudFront Distribution
# Origin: Lightsail static IP (nginx on port 80)
# TLS termination at edge using ACM certificate (us-east-1)
# Maintenance page fallback on 5xx from origin
# =============================================================================

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.prefix} distribution"
  default_root_object = ""
  price_class         = "PriceClass_100" # US + Europe — adjust for global reach

  aliases = [var.domain_name, "www.${var.domain_name}"]

  # ── Origin: Lightsail nginx ───────────────────────────────────────────────
  # CloudFront requires a resolvable DNS hostname; raw IPs are not supported.
  # Operator points var.lightsail_origin_dns at a real A record (e.g.
  # origin.footbag.org) that resolves to aws_lightsail_static_ip.web.ip_address.
  origin {
    origin_id   = "lightsail-origin"
    domain_name = var.lightsail_origin_dns

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # nginx on Lightsail listens on 80
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = data.aws_ssm_parameter.origin_verify_secret.value
    }
  }

  # ── Origin: S3 maintenance page (OAC-protected) ──────────────────────────
  origin {
    origin_id                = "s3-maintenance"
    domain_name              = aws_s3_bucket.maintenance.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.maintenance.id
  }

  # ── Origin: media bucket via OAC ─────────────────────────────────────────
  # CloudFront reads processed photo objects directly from S3. App writes
  # are handled by the app_runtime IAM policy (Put/Delete/Head only); reads
  # flow exclusively through this origin via OAC, never via direct S3 GetObject.
  origin {
    origin_id                = "media-s3-origin"
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  # ── Default cache behaviour ───────────────────────────────────────────────
  # All HTML uses CachingDisabled; origin (Express middleware) sets
  # Cache-Control on every authenticated response.
  default_cache_behavior {
    target_origin_id       = "lightsail-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host_header.id
  }

  # ── Static assets — longer cache ─────────────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/css/*"
    target_origin_id       = "lightsail-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3_origin.id
  }

  # ── JavaScript — longer cache ──────────────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/js/*"
    target_origin_id       = "lightsail-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3_origin.id
  }

  # ── Images — longer cache ────────────────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/img/*"
    target_origin_id       = "lightsail-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3_origin.id
  }

  # ── Web fonts — longer cache ─────────────────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/fonts/*"
    target_origin_id       = "lightsail-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3_origin.id
  }

  # ── Member photos and system-account media (S3 origin) — query-string in cache key (URL-versioned cache-bust) ─
  # Binary media is served under the dedicated `/media-store/*` URL prefix,
  # disjoint from the `/media` user-facing app section (routes `/media`,
  # `/media/:galleryId`, `/media/browse`). The app section flows through the
  # default cache behavior to lightsail-origin; only `/media-store/*` is
  # diverted to S3.
  #
  # No origin_request_policy: OAC handles SigV4 signing, and forwarding the
  # viewer Host header to an S3 origin breaks virtual-host bucket routing.
  # AllViewer forwarded Host=<cloudfront-domain> to S3, so S3 could not map
  # the Host to any bucket and returned generic NotFound before the bucket
  # policy was even evaluated. With no origin request policy plus a cache
  # policy that forwards no headers/cookies, CloudFront sets Host to the S3
  # origin domain and the OAC signature matches.
  ordered_cache_behavior {
    path_pattern           = "/media-store/*"
    target_origin_id       = "media-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id = aws_cloudfront_cache_policy.media_assets.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_media_store_prefix.arn
    }
  }

  # ── Health probes — pass through uncached ────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/health/*"
    target_origin_id       = "lightsail-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host_header.id
  }

  # ── Maintenance page (S3 origin via OAC) ─────────────────────────────────
  # CloudFront serves /maintenance.html from the maintenance S3 bucket via
  # OAC. No origin_request_policy: OAC handles SigV4 signing, and forwarding
  # the viewer Host header to an S3 origin breaks virtual-host bucket routing.
  # Referenced by the custom_error_response blocks below to serve a static
  # maintenance page during origin 5xx outages.
  ordered_cache_behavior {
    path_pattern           = "/maintenance.html"
    target_origin_id       = "s3-maintenance"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # ── Custom error: serve maintenance page on 5xx ──────────────────────────
  custom_error_response {
    error_code            = 502
    response_code         = 503
    response_page_path    = "/maintenance.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 503
    response_code         = 503
    response_page_path    = "/maintenance.html"
    error_caching_min_ttl = 10
  }

  # ── TLS ──────────────────────────────────────────────────────────────────
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.main.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }
}
