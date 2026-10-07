#!/usr/bin/env bash
# rotate-jwt-signing-key.sh
#
# Rotates the KMS key that signs every session token, and proves the site came
# back on the new key.
#
# The design rotates this key as a whole new key, for cause, never on a clock,
# and with one key at a time: verification accepts only the current key, so every
# signed-in member is signed out at the switch and signs in again. That is a
# planned flag day, not an overlap, so announce it before running this.
#
# The host reaches the key through its alias, and the alias is what the runtime
# stamps into each token, so the alias moving to a new key needs no change to the
# host and no deploy: a restart is what makes the containers fetch the new public
# key. Terraform owns the key and the alias, so the replacement goes through
# scripts/terraform-apply.sh like any other apply. The key declares
# create_before_destroy, so the new key is created and the alias retargeted before
# the old key is scheduled for deletion, with its thirty-day window during which
# the deletion can still be cancelled.
#
# Steps (referenced by --from-step, so a failure part-way is resumable without
# replacing the key a second time):
#   1  prove the site answers through CloudFront, then replace the key through
#      scripts/terraform-apply.sh (saved plan, typed APPLY on production,
#      shredded plan), then prove the alias points at a different key that is
#      enabled, RSA_2048 and for signing, with a different public key, and that
#      the old key is pending deletion
#   2  restart the stack through scripts/restart-host.sh, so it loads the new key
#   3  prove the site answers through CloudFront again, then ask you to confirm
#      at the terminal that a session signed in before step 1 is now signed out
#
# What it refuses:
#   - a target it was not given; there is no default
#   - rotating while the site already fails through CloudFront, because the run
#     could then not tell its own breakage from one it walked into
#   - restarting onto a key the checks above did not prove
#
# What it cannot check, and asks you to confirm instead: that a session from
# before the rotation is refused. Only a real signed-in browser shows that, and
# this script holds no member session. The staging drill proves it with a member
# signed in.
#
# Key identifiers and public keys are compared, never printed.
#
# Usage. The restart in step 2 reads the host sudo password from stdin, so every
# run takes the redirect scripts/restart-host.sh documents:
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/rotate-jwt-signing-key.sh --target staging
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/rotate-jwt-signing-key.sh --target production
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/rotate-jwt-signing-key.sh --target production --from-step 2
#
# Test seams (CI only; operators never set these), each announced on stderr when
# set: ROTATE_JWT_TF_APPLY and ROTATE_JWT_RESTART replace the two scripts it runs;
# ROTATE_JWT_AWS_BIN, ROTATE_JWT_TERRAFORM_BIN and ROTATE_JWT_CURL_BIN replace
# the tools; ROTATE_JWT_PROBE_TRIES shortens the post-restart wait.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

TARGET=""
FROM_STEP=1

die() { echo "rotate-jwt-signing-key: $*" >&2; exit 1; }

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)    TARGET="${2:-}"; shift 2 || { echo "rotate-jwt-signing-key: --target requires an argument" >&2; exit 2; } ;;
    --from-step) FROM_STEP="${2:-}"; shift 2 || { echo "rotate-jwt-signing-key: --from-step requires a step number" >&2; exit 2; } ;;
    -h|--help)   usage 0 ;;
    *) echo "rotate-jwt-signing-key: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

[[ "$TARGET" == "staging" || "$TARGET" == "production" ]] \
  || die "--target must be staging or production (got '${TARGET}')"
[[ "$FROM_STEP" =~ ^[123]$ ]] || die "--from-step must be 1, 2 or 3 (got '${FROM_STEP}')"

TF_APPLY="${ROTATE_JWT_TF_APPLY:-${SCRIPT_DIR}/terraform-apply.sh}"
RESTART="${ROTATE_JWT_RESTART:-${SCRIPT_DIR}/restart-host.sh}"
AWS_BIN="${ROTATE_JWT_AWS_BIN:-aws}"
TF_BIN="${ROTATE_JWT_TERRAFORM_BIN:-terraform}"
CURL_BIN="${ROTATE_JWT_CURL_BIN:-curl}"
PROBE_TRIES="${ROTATE_JWT_PROBE_TRIES:-30}"
for seam in ROTATE_JWT_TF_APPLY ROTATE_JWT_RESTART ROTATE_JWT_AWS_BIN ROTATE_JWT_TERRAFORM_BIN ROTATE_JWT_CURL_BIN ROTATE_JWT_PROBE_TRIES; do
  [[ -n "${!seam:-}" ]] && echo "rotate-jwt-signing-key: TEST SEAM ${seam} is set; this run proves nothing about the estate." >&2
done

# The terminal confirmation helper. Sourcing it also assigns ASSUME_YES, so no
# value exported in the operator's shell can answer the confirmation in step 3.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

if [[ -z "${ROTATE_JWT_AWS_BIN:-}" ]]; then
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  aws_profile_ensure || exit 1
fi

ALIAS="alias/footbag-${TARGET}-jwt"

CF_DOMAIN="$("$TF_BIN" -chdir="terraform/${TARGET}" output -raw cloudfront_domain </dev/null 2>/dev/null)" \
  || die "could not read the cloudfront_domain output of terraform/${TARGET}"
[[ -n "$CF_DOMAIN" ]] || die "terraform/${TARGET} has no cloudfront_domain output"
PROBE_URL="https://${CF_DOMAIN}/health/ready"

answers_through_cloudfront() {
  local code
  code="$("$CURL_BIN" -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROBE_URL" </dev/null 2>/dev/null)" || code=""
  [[ "$code" == "200" ]]
}

key_meta() {
  "$AWS_BIN" kms describe-key --key-id "$1" --query "$2" --output text </dev/null 2>/dev/null
}

# A digest of the public key the alias resolves to, so two keys are compared
# without either being printed.
public_key_digest() {
  local pem
  pem="$("$AWS_BIN" kms get-public-key --key-id "$1" --query PublicKey --output text </dev/null 2>/dev/null)" || return 1
  [[ -n "$pem" ]] || return 1
  printf '%s' "$pem" | sha256sum | cut -d' ' -f1
}

if (( FROM_STEP <= 1 )); then
  echo "==> step 1: replace the signing key"
  answers_through_cloudfront \
    || die "the site does not answer through CloudFront (${PROBE_URL}) before anything is changed; find out why first, or this run cannot tell its own breakage from that one"
  old_key="$(key_meta "$ALIAS" KeyMetadata.KeyId)" || die "could not read the key ${ALIAS} points at"
  old_digest="$(public_key_digest "$ALIAS")" || die "could not read the public key of ${ALIAS}"

  # stdin is closed for the apply: it carries the host password the restart in
  # step 2 reads, and nothing in the apply may consume it.
  bash "$TF_APPLY" --target "$TARGET" --replace aws_kms_key.jwt_signing </dev/null \
    || die "the replacement did not apply. Nothing was restarted; fix the cause and re-run from step 1."

  new_key="$(key_meta "$ALIAS" KeyMetadata.KeyId)" || die "could not read the key ${ALIAS} points at after the apply"
  [[ -n "$new_key" && "$new_key" != "$old_key" ]] \
    || die "${ALIAS} still points at the same key. Not restarting; check the apply above replaced aws_kms_key.jwt_signing."
  shape="$(key_meta "$new_key" 'KeyMetadata.[KeyState,KeySpec,KeyUsage]' | tr -s '\t ' ' ')" || shape=""
  [[ "$shape" == "Enabled RSA_2048 SIGN_VERIFY" ]] \
    || die "the new key is not an enabled RSA_2048 signing key (reads '${shape:-unreadable}'). Not restarting onto it."
  new_digest="$(public_key_digest "$ALIAS")" || die "could not read the new public key of ${ALIAS}"
  [[ "$new_digest" != "$old_digest" ]] \
    || die "the alias's public key did not change. Not restarting."
  old_state="$(key_meta "$old_key" KeyMetadata.KeyState)" || old_state=""
  [[ "$old_state" == "PendingDeletion" ]] \
    || die "the old key is '${old_state:-unreadable}', not pending deletion. Not restarting; check the apply above."
  echo "    the alias points at a new enabled signing key; the old key is pending deletion"
fi

if (( FROM_STEP <= 2 )); then
  echo "==> step 2: restart, so the stack loads the new public key"
  # stdin passes through: it carries the host sudo password restart-host.sh reads.
  bash "$RESTART" --target "$TARGET" \
    || die "the restart failed. Until it succeeds the running stack still holds the old public key and refuses every new login: resume with --from-step 2."
fi

echo "==> step 3: prove the site answers through CloudFront"
ok=0
for (( i = 1; i <= PROBE_TRIES; i++ )); do
  if answers_through_cloudfront; then ok=1; break; fi
  (( i < PROBE_TRIES )) && sleep 4
done
(( ok )) || die "the site does not answer through CloudFront (${PROBE_URL}) after the restart. A container that cannot load the new key fails its readiness check; read its logs, then resume with --from-step 2."

echo ""
echo "The new key is live. What this script cannot see is the other half of the"
echo "rotation: a session signed in before step 1 must now be signed out. Check it"
echo "in a browser that was signed in before the rotation."
confirm_from_tty "Type 'APPLY' to confirm an earlier session is signed out: " "APPLY" \
  || die "not confirmed. The key is rotated and the site answers; confirm the earlier session is refused, then re-run with --from-step 3."

echo ""
echo "== JWT signing key rotated on ${TARGET}; ${PROBE_URL} answers 200 and an earlier session is signed out =="
