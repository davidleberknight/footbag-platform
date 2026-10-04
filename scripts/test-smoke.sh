#!/usr/bin/env bash
# Self-contained runner for tests/smoke/*.test.ts.
# Reads environment-specific values from terraform output; hardcodes the
# stable ones. No operator-side env setup required.
#
# --target names the environment, as on every operator command, with no
# default: every environment-specific read (terraform dir, AWS profile, SSM
# path, the site address the host records) follows it. SMOKE_TARGET_ENV is this
# script's hand-off to the suites, set here from --target; one already exported
# in the shell is refused rather than honoured.
#
#   npm run test:smoke -- --target staging
#
# An optional suite name runs one file instead of the directory:
#   npm run test:smoke -- --target production captcha
# This matters most against a production target, where every suite in the
# directory reaches the live environment and a narrow wiring check has no
# reason to exercise the rest. Filters always resolve under tests/smoke/, so a
# filter can never widen the run to a suite outside this directory.
#
# No suite here writes to object storage: the media-storage suite that once did
# is gone, and MEDIA_STORAGE_S3_BUCKET is exported below for a reader that no
# longer exists. Keep it that way. A suite that mutates a bucket is not safe to
# point at production by naming the directory, which is the whole reason the
# removed one needed a warning here.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -n "${SMOKE_TARGET_ENV:-}" ]]; then
  echo "ERROR: SMOKE_TARGET_ENV is set in this shell ('${SMOKE_TARGET_ENV}'). Name the" >&2
  echo "       environment with --target instead; this script sets it for the suites." >&2
  exit 1
fi

TARGET=""
SUITES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 1; }
      ;;
    *)
      suite_arg="$1"
      shift
      if [[ ! "$suite_arg" =~ ^[A-Za-z0-9._-]+$ ]]; then
        echo "ERROR: suite filter must be a bare suite name (letters, digits, dot, underscore, hyphen), got '$suite_arg'." >&2
        echo "       Example: npm run test:smoke -- --target staging captcha" >&2
        exit 1
      fi
      if ! compgen -G "tests/smoke/${suite_arg}*.test.ts" >/dev/null; then
        echo "ERROR: no smoke suite matches 'tests/smoke/${suite_arg}*.test.ts'." >&2
        echo "       Available:" >&2
        ls tests/smoke/ >&2
        exit 1
      fi
      SUITES+=("tests/smoke/${suite_arg}")
      ;;
  esac
done
[[ ${#SUITES[@]} -gt 0 ]] || SUITES=("tests/smoke/")

# shellcheck source=lib/host-env-remote.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/host-env-remote.sh"
require_target "$TARGET" staging production || exit 1
SMOKE_TARGET_ENV="$TARGET"
TF_DIR="terraform/${SMOKE_TARGET_ENV}"

# This suite reaches live AWS through a chained runtime profile. Fail fast with
# a clear message on a machine without that profile or an initialized terraform
# tree, rather than dying on a raw terraform or aws-cli error mid-run.
#
# The refusal says what is missing and what writes it, rather than calling the
# suite operator-only. That wording was a diagnosis and it was the wrong one for
# a dev-and-tester, who assumes a role granting exactly this staging access and
# was being told they were the wrong kind of person.
if ! grep -qs "footbag-${SMOKE_TARGET_ENV}-runtime" "$HOME/.aws/config" "$HOME/.aws/credentials"; then
  echo "ERROR: the footbag-${SMOKE_TARGET_ENV}-runtime AWS profile is not configured on this machine," >&2
  echo "       and this suite reaches AWS through it rather than through your own identity." >&2
  echo "" >&2
  echo "       Which script writes it depends on who you are:" >&2
  echo "         a footbag-operator key holder:  bash scripts/install-operator-key.sh" >&2
  echo "         a dev-and-tester:               bash scripts/accept-dev-tester-onboarding.sh" >&2
  echo "                                         (it chains off the job role your own" >&2
  echo "                                         IAM user assumes)" >&2
  echo "" >&2
  echo "       A production target additionally needs the directly authenticated" >&2
  echo "       identity: production's runtime role does not trust the job role," >&2
  echo "       and that boundary is deliberate." >&2
  exit 1
fi
if [[ ! -d "$TF_DIR/.terraform" ]]; then
  echo "ERROR: $TF_DIR is not initialized, and this runner reads terraform outputs from it." >&2
  echo "       Initialize it with: bash scripts/setup-operator-workstation.sh --target ${SMOKE_TARGET_ENV}" >&2
  echo "       (run through scripts/as-dev-tester.sh --account <name> if you are a dev-and-tester)." >&2
  exit 1
fi

# The outputs are read on the operator's own identity, before the runtime
# profile below takes over for the probes themselves. Settled and proved here,
# because a dead operator credential otherwise fails the first `output -raw`
# under set -e and reads as an uninitialised tree, which the check above has
# just ruled out.
# shellcheck source=lib/aws-profile.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/aws-profile.sh"
aws_profile_ensure || exit 1

JWT_KMS_KEY_ID="$(terraform -chdir="$TF_DIR" output -raw jwt_signing_key_arn)"
MEDIA_STORAGE_S3_BUCKET="$(terraform -chdir="$TF_DIR" output -raw media_bucket_name)"
# No suite here sends email. On staging, email is the adapter stub and the
# runtime role holds no send permission; real sending is checked on production
# by scripts/verify-prod-email.sh.

# The site address is the one the environment's host records it serves, asked of
# the host once it confirms it is this environment. Tolerated when it cannot be
# read: the static-asset smoke's first test then fails with a message saying so,
# rather than the whole runner dying before any suite reports.
SMOKE_SITE_URL=""
if host_address_for "$SMOKE_TARGET_ENV"; then
  SMOKE_SITE_URL="$HOST_ADDRESS"
fi

# Exported so target-aware tests can gate themselves (the persona-catalog
# smoke is staging-only and skips under a production target).
export SMOKE_TARGET_ENV
export AWS_PROFILE="footbag-${SMOKE_TARGET_ENV}-runtime"
export AWS_REGION=us-east-1
export JWT_KMS_KEY_ID
export MEDIA_STORAGE_S3_BUCKET
export SMOKE_SITE_URL
export RUN_STAGING_SMOKE=1

# Fetch operator-supplied SSM secrets via the assumed-role chain. The
# safe-browsing smoke test asserts the value is non-placeholder shape, so a
# fresh staging environment that has run `terraform apply` but not yet stored
# the key returns the TODO sentinel and the smoke fails with a message naming
# provision-url-screening-key.sh. The 2>/dev/null||true tolerates
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

TURNSTILE_SECRET_KEY="$(
  aws ssm get-parameter \
    --region "$AWS_REGION" \
    --name "/footbag/${SMOKE_TARGET_ENV}/secrets/turnstile_secret_key" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || true
)"
export TURNSTILE_SECRET_KEY

# One file at a time. Every assertion here is a real network round-trip against
# one environment, so running files concurrently buys little wall-clock and
# costs correctness: the suites contend for the same egress and the same AWS
# throttles, and a per-test timeout that is generous when a file runs alone
# becomes a coin toss when six files share the link. That is not a slow test to
# be given a bigger number, it is a suite whose timings are only meaningful
# unshared. The KMS sign round-trip is the one that surfaced it, finishing well
# inside its budget alone and timing out beside the others.
exec node_modules/.bin/vitest run --no-file-parallelism "${SUITES[@]}"
