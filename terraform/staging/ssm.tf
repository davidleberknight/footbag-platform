# =============================================================================
# SSM Parameter Store — /footbag/{env}/...
# All application secrets live here. SecureString type with KMS encryption.
#
# TODO: After apply, set actual secret values via AWS Console or CLI:
#   aws ssm put-parameter --name "/footbag/staging/app/secret_key" \
#     --value "$(openssl rand -hex 32)" --type SecureString \
#     --key-id alias/footbag-staging --overwrite
# =============================================================================

resource "aws_ssm_parameter" "app_port" {
  name  = "${local.ssm_prefix}/app/port"
  type  = "String"
  value = "3000"
}

resource "aws_ssm_parameter" "app_log_level" {
  name  = "${local.ssm_prefix}/app/log_level"
  type  = "String"
  value = "info"
}

# Arming switches. Terraform is the writer (like app_log_level); the deploy
# syncs each value into /srv/footbag/env. Inert on staging (adapters stay
# stubbed below production); published so both trees carry the same app/*
# parameter set and the deploy sync reads one uniform contract.
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

# The two protective checks on member-submitted links. Same custody as the pair
# above and one difference that matters here: these are NOT inert on staging.
# Screening a link and probing whether its host answers have no real-world side
# effect to withhold from a lower environment, and staging is where the live
# path is exercised before members reach it, so the deploy derives
# SAFE_BROWSING_ADAPTER and HTTP_REACHABILITY_ADAPTER from these here as well as
# on production. No ignore_changes, so an out-of-band put-parameter reverts on
# the next apply.
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
# exists. Staging carries both at parity with production even though its mail
# adapter is stubbed, so the deploy path is exercised here first.
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

# The site's own public address is deliberately not a parameter here either, for
# the reason the production tree records: nothing reads it, and the running value
# lives in the host env file.

resource "aws_ssm_parameter" "app_db_path" {
  name = "${local.ssm_prefix}/app/db_path"
  type = "String"
  # Matches the host bind mount the compose stack declares. Operators may move
  # the path on the host during a maintenance window, and a re-apply must not
  # clobber that without explicit intent, so the value is not reverted here.
  value = "/srv/footbag/db/footbag.db"
  lifecycle { ignore_changes = [value] }
}

# Origin-bypass secret. CloudFront injects this as X-Origin-Verify; nginx
# rejects (444) any direct-to-origin request where the header is missing or
# wrong. The value is generated by random_id below (64 hex chars; matches the
# shape check in docker/nginx/40-render-nginx-conf.sh).
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

# ── SESSION_SECRET (cookie-parser signing + env.ts boot-time check) ──────────
# Terraform owns the canonical value via random_id below (32 bytes → 64 hex
# chars, well past the env.ts ≥32 floor and never matches 'changeme'). The
# deploy script (scripts/internal/deploy-{rebuild,code}-remote.sh) fetches
# this parameter on every deploy and writes it into /srv/footbag/env, where
# systemd picks it up and Docker Compose forwards it into each container.
#
# Rotation: `terraform apply -replace=random_id.session_secret` regenerates
# the value, the SSM parameter updates, the next deploy fetches the new
# value from SSM and rewrites SESSION_SECRET in /srv/footbag/env. All
# active sessions are invalidated by the rotation (cookie signatures fail
# verification under the new secret).
#
# No `ignore_changes`: Terraform IS the writer. A manual `aws ssm
# put-parameter --overwrite` would be reverted on the next apply.
resource "random_id" "session_secret" {
  byte_length = 32
}

resource "aws_ssm_parameter" "app_session_secret" {
  name   = "${local.ssm_prefix}/secrets/session_secret"
  type   = "SecureString"
  key_id = aws_kms_alias.main.name
  value  = random_id.session_secret.hex
}

data "aws_ssm_parameter" "app_session_secret" {
  name            = aws_ssm_parameter.app_session_secret.name
  with_decryption = true
}

# ── Safe Browsing v4 API key (operator-supplied) ─────────────────────────────
# SecureString + KMS-encrypted. Terraform owns the resource shell with a TODO
# placeholder; the real value is operator-supplied, under operator credentials —
# the app runtime role is deliberately read-only on SSM and cannot PutParameter:
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

# ── Stripe secret API key (operator-supplied) ─────────────────────────────────
# Same shell-with-placeholder pattern as safe_browsing_api_key above: Terraform
# owns the resource existence + KMS reference, the operator supplies the real
# key (Stripe test-mode key on staging) via put-parameter, and the live
# payment adapter rejects the TODO placeholder so a deploy without the
# put-parameter step fails the first checkout loudly, not silently. Path is
# under /secrets/ because the runtime SecretsAdapter resolves
# "${local.ssm_prefix}/secrets/<key>".
resource "aws_ssm_parameter" "stripe_secret_key" {
  name   = "${local.ssm_prefix}/secrets/stripe_secret_key"
  type   = "SecureString"
  key_id = aws_kms_alias.main.name
  value  = "TODO-set-via-cli-after-apply"
  lifecycle { ignore_changes = [value] }
}

# ── Production-only parameters, intentionally absent here ────────────────────
# Four parameters exist in production and not in staging, by design, so the
# divergence is asserted rather than silent:
#   - the go-live marker: it gates full-refresh deploys and test keys once
#     production goes live, and there is no equivalent moment in staging.
#   - the Turnstile secret key: the production boot mandates the live CAPTCHA
#     adapter, whose server-side verification needs the secret; staging's
#     captcha does not resolve through Parameter Store.
#   - the Stripe webhook secret and its previous-value slot, which exist to
#     carry a zero-downtime signing-secret rotation. Staging never reaches
#     Stripe, so it receives no webhooks and has no secret to rotate.

# ── SES (placeholder — email deferred) ───────────────────────────────────────
# resource "aws_ssm_parameter" "ses_sender" {
#   name   = "${local.ssm_prefix}/ses/sender_address"
#   type   = "SecureString"
#   key_id = aws_kms_key.main.arn
#   value  = "TODO-noreply@footbag.org"
#   lifecycle { ignore_changes = [value] }
# }
