# =============================================================================
# CloudFront Distribution
# Origin: Lightsail static IP (nginx on port 80)
# TLS termination at edge using ACM certificate (us-east-1)
# Maintenance page fallback on 5xx from origin
# =============================================================================

resource "aws_cloudfront_distribution" "main" {
  count = var.enable_cloudfront ? 1 : 0

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.prefix} distribution"
  default_root_object = ""
  price_class         = "PriceClass_100" # US + Europe — adjust for global reach

  # DEFERRED: custom domain aliases commented out for initial test deployment.
  # Uncomment and set domain_name + route53_zone_id in terraform.tfvars when
  # ready to attach a real domain. Also re-enable acm.tf and route53.tf.
  # aliases = [var.domain_name, "www.${var.domain_name}"]

  # ── Origin: Lightsail nginx ───────────────────────────────────────────────
  # Use the instance public DNS name, not the raw static IP.
  # CloudFront custom_origin_config requires a resolvable DNS hostname.
  # Retrieve the DNS name after the first apply (Lightsail only) and set
  # lightsail_origin_dns in terraform.tfvars before the second apply.
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
      # TODO: Set to a random secret and verify it in nginx to block direct-to-origin requests
      value = "TODO-set-shared-secret"
    }
  }

  # ── Origin: S3 maintenance page ───────────────────────────────────────────
  origin {
    origin_id   = "s3-maintenance"
    domain_name = aws_s3_bucket.maintenance.bucket_regional_domain_name

    s3_origin_config {
      # TODO: Create an OAC and reference it here
      origin_access_identity = ""
    }
  }

  # ── Default cache behaviour ───────────────────────────────────────────────
  default_cache_behavior {
    target_origin_id       = "lightsail-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    # Short TTL — server-rendered HTML should not be cached aggressively
    min_ttl     = 0
    default_ttl = 60
    max_ttl     = 300
  }

  # ── Static assets — longer cache ─────────────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/css/*"
    target_origin_id       = "lightsail-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400   # 1 day
    max_ttl     = 2592000 # 30 days
  }

  # ── Health probes — pass through uncached ────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/health/*"
    target_origin_id       = "lightsail-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
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
  # DEFERRED: switch to ACM certificate when real domain is attached.
  # See acm.tf and route53.tf (currently commented out).
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }
}
