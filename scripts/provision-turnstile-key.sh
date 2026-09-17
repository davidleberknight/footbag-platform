#!/usr/bin/env bash
# provision-turnstile-key.sh
#
# Puts the captcha's secret key into production's Parameter Store.
#
# WHY THIS EXISTS.
#
# Production refuses to boot without a live captcha, and the secret half of that
# captcha comes off a vendor dashboard. Until now the only instruction for
# getting it into Parameter Store was a hand-typed `aws ssm put-parameter` in a
# runbook, which is the shape this estate has been removing all along: the value
# lands in argv where every process on the machine can read it, the KMS alias is
# retyped each time, and nothing reads the parameter back afterwards to confirm
# it is no longer the placeholder Terraform seeded.
#
# Its sibling `provision-ssm-secret.sh` is deliberately not the home for this.
# That script generates opaque secrets, and its own refusal branch says a value
# "an operator pastes from a provider console" is not its job. That is the right
# boundary: a generated secret can be destroyed and remade freely, and a pasted
# one often cannot be re-displayed by the vendor at all.
#
# PRODUCTION ONLY, and the refusal matters.
#
# `aws_ssm_parameter.turnstile_secret_key` is declared in
# terraform/production/ssm.tf and nowhere else. Staging's ssm.tf carries an
# explicit block headed "Production-only parameters, intentionally absent here"
# naming this among them, because staging runs the stub captcha adapter: the
# deploy forces it on any non-production target and the host verifier asserts it.
# So a staging run here would create a parameter no Terraform declares, sitting
# outside every apply and every inventory, holding a live vendor secret nothing
# reads. This script refuses instead of creating it.
#
# The public site key is not this script's either. It is not a secret, it is a
# committed line in docker/env/production.env, and the deploy owns it.
#
# Usage:
#   bash scripts/provision-turnstile-key.sh --env production status
#   bash scripts/provision-turnstile-key.sh --env production store
#
# Actions:
#   status   report absent / placeholder / set, printing no value. Read-only.
#   store    prompt for the secret, write it, and prove the write.
#
# Flags:
#   --env production   required, and production is the only accepted value.
#   --profile <p>      AWS profile; else the identity this run settles and proves.
#
# Test seam (CI only; operators never set this): VENDOR_SECRET_AWS_BIN replaces
# the aws CLI. A run using it says so, because a stubbed write proves nothing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# shellcheck source=lib/vendor-secret.sh
source "${SCRIPT_DIR}/lib/vendor-secret.sh"
# The AWS identity this run uses, supplied and proved rather than inherited from
# whichever shell the operator started from.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

# The store path hands the pasted key to the AWS CLI through a mode-600 temp file
# rather than through argv, where `ps` could read it. That file is destroyed as
# soon as the call returns, but an interrupt does not return: without this trap a
# Ctrl-C while the put is in flight leaves the vendor's secret on disk.
trap secret_file_sweep EXIT INT TERM

TARGET_ENV=""
ACTION=""
AWS_PROFILE_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      TARGET_ENV="${2:-}"
      shift 2 || { echo "ERROR: --env requires an argument" >&2; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    status|store) ACTION="$1"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

case "$TARGET_ENV" in
  production) ;;
  '')
    echo "ERROR: --env is required, and there is no default." >&2
    exit 2
    ;;
  staging)
    echo "REFUSING: staging holds no Turnstile secret, by design." >&2
    echo "       Staging runs the stub captcha adapter: the deploy forces it on" >&2
    echo "       any non-production target and the host verifier asserts it, so" >&2
    echo "       there is nothing there to authenticate. terraform/staging/ssm.tf" >&2
    echo "       names this parameter in its 'Production-only parameters,"  >&2
    echo "       intentionally absent here' block." >&2
    echo "" >&2
    echo "       Writing it anyway would create a parameter no Terraform" >&2
    echo "       declares, outside every apply and every inventory, holding a" >&2
    echo "       live vendor secret nothing reads. Nothing done." >&2
    exit 2
    ;;
  *)
    echo "ERROR: --env must be 'production' (got '${TARGET_ENV}')." >&2
    exit 2
    ;;
esac

if [[ -z "$ACTION" ]]; then
  echo "ERROR: name an action: 'status' or 'store'." >&2
  exit 2
fi

AWS_ARGS=()
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  AWS_ARGS+=(--profile "$AWS_PROFILE_ARG")
else
  # No profile named on the command line, so the identity is the one the shared
  # library settles and proves: whatever this shell already carries, or the
  # operator profile. Nothing here asks the operator to export anything.
  aws_profile_ensure || exit 1
fi

if [[ "$VENDOR_SECRET_AWS_BIN" != "aws" ]]; then
  echo "SYNTHETIC: aws='${VENDOR_SECRET_AWS_BIN}' -- this run proves nothing about the estate." >&2
fi

PARAM="/footbag/${TARGET_ENV}/secrets/turnstile_secret_key"
KMS_ALIAS="alias/footbag-${TARGET_ENV}"

case "$ACTION" in
  status)
    # Not `STATE="$(...)"`: that runs the function in a subshell and the detail
    # explaining an unreadable parameter dies with it, which is the whole point
    # of separating unreadable from absent.
    vendor_secret_status "$PARAM" ${AWS_ARGS[@]+"${AWS_ARGS[@]}"}
    STATE="$VENDOR_SECRET_STATE"
    echo "  parameter: ${PARAM}"
    echo "  state:     ${STATE}"
    case "$STATE" in
      unreadable)
        echo "" >&2
        echo "ERROR: the parameter could not be read, which is not the same as it" >&2
        echo "       not being there. AWS said:" >&2
        printf '%s\n' "$VENDOR_SECRET_STATUS_DETAIL" | sed 's/^/         /' >&2
        echo "" >&2
        echo "       Most likely the profile's key no longer authenticates, or it" >&2
        echo "       lacks ssm:GetParameter or kms:Decrypt on this environment's" >&2
        echo "       key. Do NOT read this as 'apply Terraform': applying" >&2
        echo "       production to fix a credential fault is the wrong move and" >&2
        echo "       an earlier version of this message invited exactly that." >&2
        exit 1
        ;;
      absent)
        echo ""
        echo "The parameter does not exist. Terraform declares it, so this means"
        echo "terraform/production has not been applied yet rather than that"
        echo "somebody deleted it. Apply first."
        exit 1
        ;;
      placeholder)
        echo ""
        echo "The parameter exists and still holds the value Terraform seeded."
        echo "Production will refuse to boot: the captcha adapter rejects it."
        echo "  next: $0 --env ${TARGET_ENV} store"
        exit 1
        ;;
      set)
        echo ""
        echo "A real value is stored. This says nothing about whether it is the"
        echo "CURRENT key on the vendor dashboard, which nothing here can know."
        exit 0
        ;;
    esac
    ;;

  store)
    echo "Reading the Turnstile secret key for ${TARGET_ENV}."
    echo ""
    echo "Take it from the vendor dashboard, from the widget this environment"
    echo "uses. Record it in the vault BEFORE storing it here: this parameter is"
    echo "not somewhere you can read it back from in a hurry, and some vendors"
    echo "will not re-display a secret once it has been issued."
    echo ""

    if ! vendor_secret_read "Paste the Turnstile secret key (input hidden): "; then
      echo "ERROR: ${VENDOR_SECRET_ERROR}." >&2
      echo "       Nothing has been written." >&2
      exit 1
    fi

    if ! vendor_secret_put "$PARAM" "$KMS_ALIAS" "$VENDOR_SECRET_VALUE" \
      ${AWS_ARGS[@]+"${AWS_ARGS[@]}"}; then
      echo "ERROR: ${VENDOR_SECRET_ERROR}." >&2
      exit 1
    fi
    VENDOR_SECRET_VALUE=""

    echo "    stored and read back: ${PARAM}"
    echo ""
    echo "The host picks it up at the next deploy, which re-syncs from Parameter"
    echo "Store. Confirm with a real challenge on a Turnstile-protected form"
    echo "afterwards: a stored value is not a working one, and the pairing of"
    echo "site key and secret key is what a challenge actually tests."
    ;;
esac
