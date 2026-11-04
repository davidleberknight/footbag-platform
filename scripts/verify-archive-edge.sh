#!/usr/bin/env bash
# verify-archive-edge.sh
#
# The archive edge proof, scripted end to end: every refusal and serving claim
# the members-only archive rests on, checked against a live distribution with
# hand-signed CloudFront cookies. Read-only against the bucket except for one
# temporary probe object it creates and removes when the archive holds no
# content yet. A removal that fails is a warning in the closing report naming
# the object left behind.
#
# What it proves, one row per claim:
#   1. Gate page, no cookies          200 + noindex   (unauthenticated behavior serves it)
#   2. Root, no cookies               403 + denied    (CloudFront validates before the
#                                                      viewer function, so a cookie-less
#                                                      visitor draws the denied page and
#                                                      there is deliberately no edge
#                                                      login redirect)
#   3. Corrupted signature            403 + denied    (a CloudFront-generated 403 does
#                                                      route through the error mapping)
#
# Rows 2 and 3 read the environment's declared cookie posture and assert the
# answer that posture calls for. Where archive content is not gated on a signed
# cookie, both expect the content to be served instead, and the run says so in
# its output. Inverting rather than skipping keeps every environment's proof a
# statement about what it actually does. The expectation comes from the declared
# intent and never from the live distribution, so an environment that lost its
# key group fails here rather than being taken for one that meant to be open.
#   4. Valid cookies, missing key     404 + notfound  (only true because the bucket policy
#                                                      grants ListBucket; without it S3
#                                                      answers 403 and every broken link
#                                                      would read as access denied)
#   5. Valid cookies, existing key    200             (key group, custom policy, OAC)
#   6. Valid cookies, directory URL   200             (the viewer function's index.html
#                                                      rewrite, on a validated request)
#
# With --check-logs it also confirms access-log objects are being delivered.
# That check exists because a wrong log-bucket policy fails SILENTLY: the
# distribution serves normally and simply never writes a log.
#
# The signing key never appears in a process argument: openssl reads it from
# the file, and the resulting cookie (a bearer credential) reaches curl through
# a 0600 header file rather than the command line.
#
# Usage:
#   scripts/verify-archive-edge.sh --target staging --profile <p>
#   scripts/verify-archive-edge.sh --target staging --profile <p> --check-logs
#
# Flags:
#   --target staging|production   Target environment (required).
#   --profile <p>              AWS profile; else the identity this run settles
#                              and proves.
#   --signing-key <pem>        Private key (default the environment's own,
#                              ~/AWS/archive-signing-key-<env>.pem).
#   --check-logs               Also assert access-log delivery.
#
# Test seams: VERIFY_ARCHIVE_EDGE_CURL_BIN, VERIFY_ARCHIVE_EDGE_TERRAFORM_BIN and
# VERIFY_ARCHIVE_EDGE_AWS_BIN replace curl, Terraform and the AWS CLI. A run
# using any of them says so on stderr, because a stubbed run proves nothing
# about the distribution.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# The AWS identity this run uses, supplied and proved rather than inherited from
# whichever shell the operator started from.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# The one closing report. Run by publish-archive.sh, this run is nested and its
# problems land in the publisher's report.
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

TARGET_ENV=""
AWS_PROFILE_ARG=""
# Resolved after --target is parsed, because the default carries the environment:
# each environment signs with its own keypair, so a default fixed at assignment
# time would sign this proof with whichever key happened to be provisioned first.
SIGNING_KEY=""
CHECK_LOGS=0

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot truncate the help text or run past it into the script body.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_ENV="${2:-}"
      shift 2 || { cr_error "--target requires an argument"; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { cr_error "--profile requires an argument"; exit 2; }
      ;;
    --signing-key)
      SIGNING_KEY="${2:-}"
      shift 2 || { cr_error "--signing-key requires an argument"; exit 2; }
      ;;
    --check-logs) CHECK_LOGS=1; shift ;;
    -h|--help) usage ;;
    *) cr_error "unknown argument: $1"; usage ;;
  esac
done

if [[ "$TARGET_ENV" != "staging" && "$TARGET_ENV" != "production" ]]; then
  cr_error "--target must be 'staging' or 'production'"
  exit 2
fi

: "${SIGNING_KEY:=${HOME}/AWS/archive-signing-key-${TARGET_ENV}.pem}"

CURL_BIN="${VERIFY_ARCHIVE_EDGE_CURL_BIN:-curl}"
TF_BIN="${VERIFY_ARCHIVE_EDGE_TERRAFORM_BIN:-terraform}"
AWS_BIN="${VERIFY_ARCHIVE_EDGE_AWS_BIN:-aws}"
[[ -n "${VERIFY_ARCHIVE_EDGE_CURL_BIN:-}" ]] && echo "NOTE: using a stand-in for curl; this run proves nothing about the distribution." >&2
[[ -n "${VERIFY_ARCHIVE_EDGE_TERRAFORM_BIN:-}" ]] && echo "NOTE: using a stand-in for Terraform; the identifiers this run uses are not the environment's." >&2
[[ -n "${VERIFY_ARCHIVE_EDGE_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the bucket." >&2

AWS_ARGS=()
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  AWS_ARGS+=(--profile "$AWS_PROFILE_ARG")
else
  # No profile named on the command line, so the identity is the one the shared
  # library settles and proves: whatever this shell already carries, or the
  # operator profile. Nothing here asks the operator to export anything.
  aws_profile_ensure || cr_die "no AWS identity to read the archive with (the reason is printed above)"
fi

if [[ ! -r "$SIGNING_KEY" ]]; then
  cr_error "signing key not readable: ${SIGNING_KEY}"
  echo "       Provision it with scripts/provision-archive-signing-key.sh," >&2
  echo "       or point --signing-key at the operator key directory." >&2
  exit 1
fi

TF_DIR="${REPO_ROOT}/terraform/${TARGET_ENV}"
tf_out() { "$TF_BIN" -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || true; }
DOMAIN="$(tf_out archive_domain)"
KEY_PAIR_ID="$(tf_out archive_key_pair_id)"
BUCKET="$(tf_out archive_bucket_name)"
if [[ -z "$DOMAIN" || -z "$KEY_PAIR_ID" || -z "$BUCKET" ]]; then
  cr_error "archive terraform outputs are empty in ${TF_DIR}."
  echo "       The archive stack must be applied (enable_archive = true)." >&2
  exit 1
fi
# Which answer a cookie-less request should draw depends on whether this
# environment gates archive content at all. Where the gate is off the two
# refusal rows below are inverted rather than skipped, so the run still states
# what it found and a reader of the output can see the posture it ran under.
# Taken from the declared intent, never from the live distribution: an
# environment that lost its key group would otherwise be read as deliberately
# open and pass.
REQUIRE_COOKIES="$(tf_out archive_requires_signed_cookies)"
if [[ -z "$REQUIRE_COOKIES" ]]; then
  cr_error "archive_requires_signed_cookies is not published by ${TF_DIR}."
  echo "       Apply the archive stack so the output lands in state." >&2
  exit 1
fi
if [[ "$REQUIRE_COOKIES" == "true" ]]; then
  GATED_CODE=403
  GATED_BODY="Sign in"
else
  GATED_CODE=200
  GATED_BODY=""
fi

WORK_DIR="$(mktemp -d /tmp/footbag-archive-edge.XXXXXX)"
cr_cleanup rm -rf "$WORK_DIR"
PROBE_KEY=""
remove_probe() {
  # Remove the probe object even on failure, so a failed run never leaves
  # content in an otherwise-empty archive bucket. A removal that fails is a
  # warning naming the object, because the bucket then serves it to members
  # until someone deletes it by hand.
  local said
  [[ -n "$PROBE_KEY" ]] || return 0
  if ! said="$("$AWS_BIN" s3 rm "s3://${BUCKET}/${PROBE_KEY}" "${AWS_ARGS[@]}" 2>&1)"; then
    cr_warn "the probe object s3://${BUCKET}/${PROBE_KEY} could not be removed and is still in the bucket; delete it by hand: $(printf '%s\n' "$said" | grep -v '^[[:space:]]*$' | tail -n 1)"
  fi
  return 0
}
cr_cleanup remove_probe

# ---- Sign a short-lived cookie set --------------------------------------------

EXPIRES="$(( $(date +%s) + 3600 ))"
POLICY="$(printf '{"Statement":[{"Resource":"https://%s/*","Condition":{"DateLessThan":{"AWS:EpochTime":%s}}}]}' \
  "$DOMAIN" "$EXPIRES")"
cf_b64() { openssl base64 -A | tr '+=/' '-_~'; }
POLICY_B64="$(printf '%s' "$POLICY" | cf_b64)"
SIGNATURE="$(printf '%s' "$POLICY" | openssl dgst -sha1 -sign "$SIGNING_KEY" | cf_b64)"

COOKIE_FILE="${WORK_DIR}/cookie.txt"
BAD_COOKIE_FILE="${WORK_DIR}/cookie_bad.txt"
touch "$COOKIE_FILE" "$BAD_COOKIE_FILE"
chmod 600 "$COOKIE_FILE" "$BAD_COOKIE_FILE"
printf 'Cookie: CloudFront-Policy=%s; CloudFront-Signature=%s; CloudFront-Key-Pair-Id=%s\n' \
  "$POLICY_B64" "$SIGNATURE" "$KEY_PAIR_ID" > "$COOKIE_FILE"
# Same cookie with the first signature character replaced by a different one,
# so the signature is well-formed but invalid: that is what exercises the
# CloudFront-generated 403. Replaced rather than swapped with its neighbour,
# because a swap changes nothing when the two characters are equal, which
# happens about one run in sixty-four, and the proof then fails a healthy
# distribution on this row.
if [[ "${SIGNATURE:0:1}" == "A" ]]; then
  BAD_SIGNATURE="B${SIGNATURE:1}"
else
  BAD_SIGNATURE="A${SIGNATURE:1}"
fi
printf 'Cookie: CloudFront-Policy=%s; CloudFront-Signature=%s; CloudFront-Key-Pair-Id=%s\n' \
  "$POLICY_B64" "$BAD_SIGNATURE" "$KEY_PAIR_ID" > "$BAD_COOKIE_FILE"

# ---- Ensure there is a real object and a real directory URL to fetch ----------

CONTENT_KEY="index.html"
DIR_URL="https://${DOMAIN}/"
if ! "$AWS_BIN" s3api head-object --bucket "$BUCKET" --key "$CONTENT_KEY" "${AWS_ARGS[@]}" >/dev/null 2>&1; then
  # Empty archive (first bring-up): stand up a probe object under its own
  # prefix. Never under _gate/, which Terraform owns.
  PROBE_KEY="edge-proof/index.html"
  printf '<h1>edge proof</h1>\n' > "${WORK_DIR}/probe.html"
  "$AWS_BIN" s3 cp "${WORK_DIR}/probe.html" "s3://${BUCKET}/${PROBE_KEY}" \
    --content-type "text/html" "${AWS_ARGS[@]}" >/dev/null
  CONTENT_KEY="$PROBE_KEY"
  DIR_URL="https://${DOMAIN}/edge-proof/"
  echo "Archive holds no content yet; using a temporary probe object (removed on exit)."
fi

# ---- The proof ----------------------------------------------------------------

failures=0
check() {
  local name="$1" expected_code="$2" url="$3" cookie="$4" expect_body="${5:-}"
  local body_file="${WORK_DIR}/body.$$"
  local code
  if [[ -n "$cookie" ]]; then
    code="$("$CURL_BIN" -sS -o "$body_file" -w '%{http_code}' -H "@${cookie}" "$url")"
  else
    code="$("$CURL_BIN" -sS -o "$body_file" -w '%{http_code}' "$url")"
  fi
  local detail=""
  if [[ -n "$expect_body" ]] && ! grep -qi -- "$expect_body" "$body_file"; then
    detail=" (body did not contain '${expect_body}')"
  fi
  if [[ "$code" == "$expected_code" && -z "$detail" ]]; then
    printf '  PASS  %-34s %s\n' "$name" "$code"
  else
    printf '  FAIL  %-34s got %s, want %s%s\n' "$name" "$code" "$expected_code" "$detail"
    failures=$((failures + 1))
  fi
  rm -f "$body_file"
}

echo "Archive edge proof: ${TARGET_ENV} (${DOMAIN})"
if [[ "$REQUIRE_COOKIES" != "true" ]]; then
  echo "  NOTE  archive content is not cookie-gated here; the two rows below assert"
  echo "        that a cookie-less request is served, which is this environment's"
  echo "        stated posture. The platform's login-gated redirect is the gate."
fi

check "gate page, no cookies"        200 "https://${DOMAIN}/_gate/denied.html" "" "archive"
check "root, no cookies"             "$GATED_CODE" "https://${DOMAIN}/"               "" "$GATED_BODY"
check "corrupted signature"          "$GATED_CODE" "https://${DOMAIN}/${CONTENT_KEY}" "$BAD_COOKIE_FILE" "$GATED_BODY"
check "valid cookies, missing key"   404 "https://${DOMAIN}/no-such-key-$$"    "$COOKIE_FILE"
check "valid cookies, existing key"  200 "https://${DOMAIN}/${CONTENT_KEY}"    "$COOKIE_FILE"
check "valid cookies, directory URL" 200 "$DIR_URL"                            "$COOKIE_FILE"

# The noindex header must reach the gate pages both directly and when one is
# served as an error body, or the archive risks being indexed.
robots="$("$CURL_BIN" -sSI "https://${DOMAIN}/_gate/denied.html" | tr -d '\r' | grep -i '^x-robots-tag:' || true)"
if [[ "$robots" == *noindex* ]]; then
  printf '  PASS  %-34s %s\n' "noindex on gate page" "${robots#*: }"
else
  printf '  FAIL  %-34s missing X-Robots-Tag noindex\n' "noindex on gate page"
  failures=$((failures + 1))
fi

if [[ "$CHECK_LOGS" -eq 1 ]]; then
  LOG_BUCKET="${BUCKET}-logs"
  account="$("$AWS_BIN" sts get-caller-identity --query Account --output text "${AWS_ARGS[@]}" 2>/dev/null || true)"
  count="$("$AWS_BIN" s3 ls "s3://${LOG_BUCKET}/AWSLogs/${account}/" --recursive "${AWS_ARGS[@]}" 2>/dev/null | grep -c . || true)"
  if [[ "${count:-0}" -gt 0 ]]; then
    printf '  PASS  %-34s %s objects\n' "access-log delivery" "$count"
  else
    printf '  FAIL  %-34s no objects under AWSLogs/%s/\n' "access-log delivery" "$account"
    echo "        Delivery lags traffic by up to an hour, so re-check before"
    echo "        concluding the log-bucket policy is wrong; silent"
    echo "        non-delivery is exactly what this row exists to catch." >&2
    failures=$((failures + 1))
  fi
fi

if [[ "$failures" -ne 0 ]]; then
  cr_error "EDGE PROOF FAILED: ${failures} check(s). The FAIL rows above name each one."
  cr_unproved "the archive edge on ${TARGET_ENV}: ${failures} check(s) failed"
  cr_finish
fi
echo "EDGE PROOF PASSED: every refusal and serving claim holds."
cr_proved "every refusal and serving claim of the archive edge on ${TARGET_ENV}"
cr_finish
