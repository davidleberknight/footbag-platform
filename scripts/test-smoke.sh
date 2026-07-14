#!/usr/bin/env bash
# Self-contained runner for tests/smoke/*.test.ts.
# Reads environment-specific values from terraform output; hardcodes the
# stable ones. No operator-side env setup required.
#
# Targets staging by default; SMOKE_TARGET_ENV=production points every
# environment-specific read (terraform dir, AWS profile, SSM path) at the
# production account instead. The exported variable names stay the same
# either way because the smoke tests read those exact names.

set -euo pipefail

cd "$(dirname "$0")/.."

SMOKE_TARGET_ENV="${SMOKE_TARGET_ENV:-staging}"
case "$SMOKE_TARGET_ENV" in
  staging|production) ;;
  *) echo "ERROR: SMOKE_TARGET_ENV must be 'staging' or 'production', got '$SMOKE_TARGET_ENV'" >&2; exit 1 ;;
esac
TF_DIR="terraform/${SMOKE_TARGET_ENV}"

# Operator-only guard: this suite reaches live AWS. Fail fast with a clear
# message on a machine without the operator's AWS profile or an initialized
# terraform tree, rather than dying on a raw terraform or aws-cli error
# mid-run. Testers do not run this suite.
if ! grep -qs "footbag-${SMOKE_TARGET_ENV}-runtime" "$HOME/.aws/config" "$HOME/.aws/credentials"; then
  echo "ERROR: the staging-AWS adapter smoke is operator-only: the footbag-${SMOKE_TARGET_ENV}-runtime AWS profile is not configured on this machine." >&2
  exit 1
fi
if [[ ! -d "$TF_DIR/.terraform" ]]; then
  echo "ERROR: the staging-AWS adapter smoke is operator-only: $TF_DIR is not initialized (run terraform init there); the runner reads terraform outputs." >&2
  exit 1
fi

JWT_KMS_KEY_ID="$(terraform -chdir="$TF_DIR" output -raw jwt_signing_key_arn)"
SES_FROM_IDENTITY="$(terraform -chdir="$TF_DIR" output -raw ses_sender_identity)"
MEDIA_STORAGE_S3_BUCKET="$(terraform -chdir="$TF_DIR" output -raw media_bucket_name)"

# Tolerate a null/absent value (CloudFront disabled or not yet applied): the
# static-asset smoke's first test fails with a clear "operator: terraform apply"
# message rather than the script dying under set -e on `output -raw` of null.
STAGING_CLOUDFRONT_DOMAIN="$(terraform -chdir="$TF_DIR" output -raw cloudfront_domain 2>/dev/null || true)"

# Exported so target-aware tests can gate themselves (the persona-catalog
# smoke is staging-only and skips under a production target).
export SMOKE_TARGET_ENV
export AWS_PROFILE="footbag-${SMOKE_TARGET_ENV}-runtime"
export AWS_REGION=us-east-1
export JWT_KMS_KEY_ID
export SES_FROM_IDENTITY
export MEDIA_STORAGE_S3_BUCKET
export STAGING_CLOUDFRONT_DOMAIN
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
    --name "/footbag/${SMOKE_TARGET_ENV}/secrets/safe_browsing_api_key" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || true
)"
export SAFE_BROWSING_API_KEY

exec node_modules/.bin/vitest run tests/smoke/
