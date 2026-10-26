# =============================================================================
# SSM Parameter Store — /footbag/{env}/...
# Non-secret values live under app/ as String; secrets under secrets/ as
# SecureString with KMS encryption. Every value the deploy syncs onto the host
# is declared in scripts/lib/host-values.sh, which names this parameter as its
# source. A secret whose value Terraform cannot know is written through its
# provisioning script, never by a hand-typed put-parameter.
# =============================================================================

resource "aws_ssm_parameter" "app_log_level" {
  name  = "${local.ssm_prefix}/app/log_level"
  type  = "String"
  value = "warn" # production: suppress info logs
}

# Arming switches. Terraform is the writer (like app_log_level): arming is a
# tfvars flip + apply, and the next deploy syncs each value into
# /srv/footbag/env and derives the matching adapter on this host
# (armed -> live, dark -> stub). No ignore_changes: out-of-band put-parameter
# drift is reverted on the next apply, keeping tfvars, SSM, and the host in
# one line of custody, with SSM parameter history as the audit trail.
resource "aws_ssm_parameter" "app_payments_armed" {
  name  = "${local.ssm_prefix}/app/payments_armed"
  type  = "String"
  value = var.payments_armed
}

resource "aws_ssm_parameter" "app_email_send_armed" {
  name  = "${local.ssm_prefix}/app/email_send_armed"
  type  = "String"
  value = var.email_send_armed
}

# The two protective checks on member-submitted links, same custody as the pair
# above and one difference in behaviour: these are not inert below production.
# Screening a link and probing whether its host answers have no real-world side
# effect to withhold from a lower environment, so the deploy derives
# SAFE_BROWSING_ADAPTER and HTTP_REACHABILITY_ADAPTER from these on every host
# rather than on production alone. No ignore_changes, so an out-of-band
# put-parameter reverts on the next apply.
resource "aws_ssm_parameter" "app_url_screening_armed" {
  name  = "${local.ssm_prefix}/app/url_screening_armed"
  type  = "String"
  value = var.url_screening_armed
}

resource "aws_ssm_parameter" "app_reachability_armed" {
  name  = "${local.ssm_prefix}/app/reachability_armed"
  type  = "String"
  value = var.reachability_armed
}

# The two SES configuration sets the runtime names on a send, one per sending
# stream. Transactional and bulk mail keep separate reputations so a complaint
# spike on a broadcast cannot degrade delivery of a password reset, and the
# configuration set is where SES keeps those metrics apart. The value is read
# from the resource rather than repeated as a literal, so renaming a set moves
# the parameter with it and the host cannot end up naming a set that no longer
# exists. Plain String, not SecureString: a configuration set name is not a
# secret, and the deploy reads it without a decrypt.
resource "aws_ssm_parameter" "app_ses_configuration_set_transactional" {
  name  = "${local.ssm_prefix}/app/ses_configuration_set_transactional"
  type  = "String"
  value = aws_ses_configuration_set.transactional.name
}

resource "aws_ssm_parameter" "app_ses_configuration_set_bulk" {
  name  = "${local.ssm_prefix}/app/ses_configuration_set_bulk"
  type  = "String"
  value = aws_ses_configuration_set.bulk.name
}

# Two more identifiers the host needs and Terraform creates, published for the
# same reason as the configuration-set names above: read from the resource, so a
# rename travels with it and a host cannot end up naming something that no
# longer exists. The JWT alias matters beyond tidiness. The signing adapter
# stamps this exact string into every session token's key-id header and refuses
# a token whose header does not match it, so the host must hold the alias; the
# key ARN names the same key while publishing the AWS account id to every client
# holding a session.
resource "aws_ssm_parameter" "app_media_bucket" {
  name  = "${local.ssm_prefix}/app/media_bucket"
  type  = "String"
  value = aws_s3_bucket.media.id
}

resource "aws_ssm_parameter" "app_jwt_kms_key_id" {
  name  = "${local.ssm_prefix}/app/jwt_kms_key_id"
  type  = "String"
  value = aws_kms_alias.jwt_signing.name
}

# Production-live marker. Seeded "false" (pre-live): data-replacing deploys
# are permitted and a test-mode Stripe key is accepted. Flipping it to "true"
# is a named go-live runbook step performed with an operator put-parameter;
# from then on the full-refresh deploy is forbidden permanently and test-mode
# Stripe keys are refused. Every data-replacing path requires an exact "false"
# read and refuses on anything else (missing, unreadable, any other value),
# fail closed. ignore_changes because the flip is out-of-band and deliberately
# one-way: a later apply must never silently revert a live production to
# pre-live and re-arm the destructive deploy paths.
resource "aws_ssm_parameter" "app_production_live" {
  name  = "${local.ssm_prefix}/app/production_live"
  type  = "String"
  value = "false"
  lifecycle { ignore_changes = [value] }
}

# The rest of the host values Terraform creates or decides, published so every
# deploy syncs them onto the host and no operator script has to. Each reads the
# resource or the flag it comes from, so a rename or a flag flip travels with it.
# No ignore_changes: Terraform is the only writer, and a hand put-parameter
# reverts on the next apply.

resource "aws_ssm_parameter" "app_snapshots_bucket" {
  name  = "${local.ssm_prefix}/app/snapshots_bucket"
  type  = "String"
  value = aws_s3_bucket.snapshots.bucket
}

resource "aws_ssm_parameter" "app_alarm_topic_arn" {
  name  = "${local.ssm_prefix}/app/alarm_topic_arn"
  type  = "String"
  value = aws_sns_topic.alarms.arn
}

resource "aws_ssm_parameter" "app_ses_feedback_topic_arn" {
  name  = "${local.ssm_prefix}/app/ses_feedback_topic_arn"
  type  = "String"
  value = aws_sns_topic.ses_feedback.arn
}

# The feed queues exist only once enable_feed_queues is on. Parameter Store
# refuses an empty value, so the parameter exists exactly when the queue does,
# and the deploy reads its absence as "no feed to poll".
resource "aws_ssm_parameter" "app_alarm_queue_url" {
  count = var.enable_feed_queues ? 1 : 0
  name  = "${local.ssm_prefix}/app/alarm_queue_url"
  type  = "String"
  value = aws_sqs_queue.alarm_feed[0].url
}

resource "aws_ssm_parameter" "app_ses_feedback_queue_url" {
  count = var.enable_feed_queues ? 1 : 0
  name  = "${local.ssm_prefix}/app/ses_feedback_queue_url"
  type  = "String"
  value = aws_sqs_queue.ses_feedback_feed[0].url
}

resource "aws_ssm_parameter" "app_ses_sender_identity" {
  name  = "${local.ssm_prefix}/app/ses_sender_identity"
  type  = "String"
  value = var.ses_sender_identity
}

# The site's canonical origin, which every absolute link, redirect and mail link
# is built against, and which the CSRF origin pin compares against. It is the
# public name that actually reaches the platform at each stage:
#
#   - www, once www serves the platform: the apex and www records point at the
#     distribution and the migration notice is off. That is go-live. Also www
#     for the launch dress rehearsal, while rehearse_launch_base_address is on,
#     because testers then reach www through an edge address and their form
#     posts must match the host's origin; its precondition below confines it.
#   - preview, while its record exists and www does not yet serve the platform:
#     from the custom-domain apply, while www still answers with the legacy
#     site, through the notice window, when www serves the notice.
#   - the distribution's own cloudfront.net name otherwise.
#
# Turning the custom domain on is not enough to move it to www: the records keep
# serving legacy until the freeze apply, and a host given www in that gap would
# build every mail link against the legacy site, permanently, since mail bodies
# are rendered when they are queued. Deciding it here is what lets every deploy
# put the right one on the host, with no operator flag on a separate script.
locals {
  platform_url        = var.enable_cloudfront ? "https://${var.enable_platform_custom_domain ? "www.${var.domain_name}" : aws_cloudfront_distribution.main[0].domain_name}" : null
  preview_url         = var.enable_cloudfront && var.enable_platform_custom_domain && var.enable_preview_record ? "https://preview.${var.domain_name}" : null
  distribution_url    = var.enable_cloudfront ? "https://${aws_cloudfront_distribution.main[0].domain_name}" : null
  www_serves_platform = (var.enable_platform_custom_domain && var.enable_apex_alias_records && !var.enable_cutover_notice) || var.rehearse_launch_base_address
  public_base_url = (
    local.www_serves_platform ? "https://www.${var.domain_name}" :
    local.preview_url != null ? local.preview_url :
    local.distribution_url
  )
}

resource "aws_ssm_parameter" "app_public_base_url" {
  count = var.enable_cloudfront ? 1 : 0
  name  = "${local.ssm_prefix}/app/public_base_url"
  type  = "String"
  value = local.public_base_url

  lifecycle {
    precondition {
      condition     = !var.enable_cutover_notice || local.preview_url != null
      error_message = "enable_cutover_notice needs the preview record and the custom domain on: while the notice is up, preview is the only name reaching the platform, so the host must be given it."
    }
    precondition {
      condition     = !var.rehearse_launch_base_address || (local.preview_url != null && !var.enable_cutover_notice && !var.enable_apex_alias_records)
      error_message = "rehearse_launch_base_address is for the launch dress rehearsal only: the custom domain and preview record on, the notice off, and the apex records still on the legacy site. Turn it off before the window state, the freeze or launch."
    }
  }
}

# Origin-bypass secret. CloudFront injects this as X-Origin-Verify; nginx
# rejects (444) any direct-to-origin request where the header is missing or
# wrong. The value is generated by random_id below (64 hex chars; matches the
# shape check in docker/nginx/40-render-nginx-conf.sh). Production value is
# distinct from staging because each environment generates its own random_id.
#
# Rotation: `terraform apply -replace=random_id.origin_verify_secret` regenerates
# the value, the SSM parameter updates, the next deploy fetches the new value
# from SSM and rewrites X_ORIGIN_VERIFY_SECRET in /srv/footbag/env on the host.
# CloudFront re-reads via the data-source on the same apply.
#
# No ignore_changes: Terraform owns the canonical value. Manual
# `aws ssm put-parameter --overwrite` would be reverted on the next apply.
resource "random_id" "origin_verify_secret" {
  byte_length = 32
}

resource "aws_ssm_parameter" "origin_verify_secret" {
  name   = "${local.ssm_prefix}/secrets/origin_verify_secret"
  type   = "SecureString"
  key_id = aws_kms_alias.main.name
  value  = random_id.origin_verify_secret.hex
}

data "aws_ssm_parameter" "origin_verify_secret" {
  name            = aws_ssm_parameter.origin_verify_secret.name
  with_decryption = true
}

# ── Safe Browsing v4 API key (operator-supplied) ─────────────────────────────
# SecureString + KMS-encrypted. Terraform owns the resource shell with a TODO
# placeholder; the real value is operator-supplied, under operator credentials —
# the app runtime role is read-only on SSM apart from deleting the first-admin
# bootstrap token, and cannot PutParameter:
#   scripts/provision-url-screening-key.sh --env both store
# That script owns every write of this value. It is not a convenience wrapper
# around put-parameter: one key serves both environments, so a write that
# reaches only one leaves the other screening with a key it no longer shares,
# and nothing detects the split. The script checks both destinations before it
# writes either, keeps the value off the command line and out of shell history,
# and shreds its own copy afterwards.
# `lifecycle { ignore_changes = [value] }` because Terraform never owns the
# real value, only the resource existence + KMS reference. The runtime live
# SecretsAdapter reads it lazily on first SafeBrowsing lookup. The TODO
# placeholder string is rejected by the live adapter so a deploy without the
# put-parameter step fails loudly, not silently.
resource "aws_ssm_parameter" "safe_browsing_api_key" {
  name   = "${local.ssm_prefix}/secrets/safe_browsing_api_key"
  type   = "SecureString"
  key_id = aws_kms_alias.main.name
  value  = "TODO-set-via-cli-after-apply"
  lifecycle { ignore_changes = [value] }
}

# ── SESSION_SECRET (cookie-parser signing + env.ts boot-time check) ──────────
# SecureString + KMS-encrypted, on the same operator-supplied placeholder shape
# as safe_browsing_api_key above. The deploy script
# (scripts/internal/deploy-{rebuild,code}-remote.sh) fetches this parameter on
# every deploy and writes it into /srv/footbag/env, where systemd picks it up
# and Docker Compose forwards it into each container.
#
# It was a Terraform-generated random_id until this change, and the reason it is
# not any more is the whole point: a random_id result is stored in state in
# plaintext by construction, so Terraform owning the value meant the state file
# held a live secret. A saved plan committed under an unmatched ignore rule then
# published two of these for seven weeks. Encrypting the state harder does not
# reach this; keeping the value out of state does, which is HashiCorp's own
# guidance and the pattern this file already uses for every operator-supplied
# secret.
#
#   scripts/provision-ssm-secret.sh --env <env> --secret session_secret store
#
# That script owns every write. It generates 32 bytes of hex, checks the
# destination before writing, keeps the value off the command line and out of
# shell history, and shreds its own copy afterwards.
#
# `lifecycle { ignore_changes = [value] }` because Terraform owns the resource
# existence and the KMS reference, never the value. Rotation is a fresh
# `store` followed by any deploy, and it invalidates every active session by
# design. The TODO placeholder is rejected by the deploy's own shape gate and by
# the env.ts boot check, so a deploy before the store step fails loudly.
resource "aws_ssm_parameter" "app_session_secret" {
  name   = "${local.ssm_prefix}/secrets/session_secret"
  type   = "SecureString"
  key_id = aws_kms_alias.main.name
  value  = "TODO-set-via-cli-after-apply"
  lifecycle { ignore_changes = [value] }
}

# ── Stripe secret API key (operator-supplied) ─────────────────────────────────
# Same shell-with-placeholder pattern as safe_browsing_api_key above: Terraform
# owns the resource existence + KMS reference, the operator supplies the real
# live-mode key via put-parameter, and the live payment adapter rejects the
# TODO placeholder so a deploy without the put-parameter step fails the first
# checkout loudly, not silently. Path is under /secrets/ because the runtime
# SecretsAdapter resolves "${local.ssm_prefix}/secrets/<key>".
resource "aws_ssm_parameter" "stripe_secret_key" {
  name   = "${local.ssm_prefix}/secrets/stripe_secret_key"
  type   = "SecureString"
  key_id = aws_kms_alias.main.name
  value  = "TODO-set-via-cli-after-apply"
  lifecycle { ignore_changes = [value] }
}

# ── Stripe webhook signing secret (operator-supplied) ────────────────────────
# Same shell-with-placeholder pattern. A real value here is authoritative: the
# deploy sync writes it into the host env on every run, so the secret is never
# hand-pasted onto a host and the running value always has a declared source.
# While the value is the TODO placeholder the sync leaves any existing host
# value untouched rather than clearing it, so a secret installed by the
# payments activation script survives deploys; clearing it would strip the only
# copy from a host and refuse the next live-payment boot. The _previous twin
# holds the outgoing secret during a Stripe secret roll (Stripe signs with both
# for the roll window) and returns to the placeholder when the roll completes.
resource "aws_ssm_parameter" "stripe_webhook_secret" {
  name   = "${local.ssm_prefix}/secrets/stripe_webhook_secret"
  type   = "SecureString"
  key_id = aws_kms_alias.main.name
  value  = "TODO-set-via-cli-after-apply"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "stripe_webhook_secret_previous" {
  name   = "${local.ssm_prefix}/secrets/stripe_webhook_secret_previous"
  type   = "SecureString"
  key_id = aws_kms_alias.main.name
  value  = "TODO-set-via-cli-after-apply"
  lifecycle { ignore_changes = [value] }
}

# ── Cloudflare Turnstile secret key (operator-supplied) ──────────────────────
# Same shell-with-placeholder pattern. The production boot mandates the live
# CAPTCHA adapter, whose server-side verification needs this secret; the
# operator supplies the value from the Cloudflare dashboard via put-parameter.
resource "aws_ssm_parameter" "turnstile_secret_key" {
  name   = "${local.ssm_prefix}/secrets/turnstile_secret_key"
  type   = "SecureString"
  key_id = aws_kms_alias.main.name
  value  = "TODO-set-via-cli-after-apply"
  lifecycle { ignore_changes = [value] }
}

# ── SES (placeholder — email deferred) ───────────────────────────────────────
# resource "aws_ssm_parameter" "ses_sender" {
#   name   = "${local.ssm_prefix}/ses/sender_address"
#   type   = "SecureString"
#   key_id = aws_kms_key.main.arn
#   value  = "TODO-noreply@footbag.org"
#   lifecycle { ignore_changes = [value] }
# }
