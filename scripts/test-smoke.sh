#!/usr/bin/env bash
# Self-contained runner for tests/smoke/*.test.ts.
# Reads environment-specific values from terraform output; hardcodes the
# stable ones. No operator-side env setup required.

set -euo pipefail

cd "$(dirname "$0")/.."

JWT_KMS_KEY_ID="$(terraform -chdir=terraform/staging output -raw jwt_signing_key_arn)"
SES_FROM_IDENTITY="$(terraform -chdir=terraform/staging output -raw ses_sender_identity)"
MEDIA_STORAGE_S3_BUCKET="$(terraform -chdir=terraform/staging output -raw media_bucket_name)"

export AWS_PROFILE=footbag-staging-runtime
export AWS_REGION=us-east-1
export JWT_KMS_KEY_ID
export SES_FROM_IDENTITY
export MEDIA_STORAGE_S3_BUCKET
export RUN_STAGING_SMOKE=1

# Fetch operator-supplied SSM secrets via the assumed-role chain. The
# safe-browsing smoke test asserts the value is non-placeholder shape, so a
# fresh staging environment that has run `terraform apply` but not yet
# `aws ssm put-parameter` returns the TODO sentinel and the smoke fails with
# a clear "operator: put-parameter" message. The 2>/dev/null||true tolerates
# a missing parameter (returns empty string) so smoke runs from a workstation
# that hasn't applied Terraform yet still report the fail with a clear
# "param does not exist" first-test failure rather than dying on aws-cli exit 1.
SAFE_BROWSING_API_KEY="$(
  aws ssm get-parameter \
    --region "$AWS_REGION" \
    --name "/footbag/staging/secrets/safe_browsing_api_key" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || true
)"
export SAFE_BROWSING_API_KEY

exec node_modules/.bin/vitest run tests/smoke/
