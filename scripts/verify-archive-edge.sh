#!/usr/bin/env bash
# verify-archive-edge.sh
#
# The archive edge proof, scripted end to end: every refusal and serving claim
# the members-only archive rests on, checked against a live distribution with
# hand-signed CloudFront cookies. Read-only against the bucket except for one
# temporary probe object it creates and removes when the archive holds no
# content yet.
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
#   scripts/verify-archive-edge.sh --env staging --profile <p>
#   scripts/verify-archive-edge.sh --env staging --profile <p> --check-logs
#
# Flags:
#   --env staging|production   Target environment (required).
#   --profile <p>              AWS profile; else ambient AWS_PROFILE.
#   --signing-key <pem>        Private key (default ~/AWS/archive-signing-key.pem).
#   --check-logs               Also assert access-log delivery.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_ENV=""
AWS_PROFILE_ARG=""
SIGNING_KEY="${HOME}/AWS/archive-signing-key.pem"
CHECK_LOGS=0

usage() {
  sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

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
    --signing-key)
      SIGNING_KEY="${2:-}"
      shift 2 || { echo "ERROR: --signing-key requires an argument" >&2; exit 2; }
      ;;
    --check-logs) CHECK_LOGS=1; shift ;;
    -h|--help) usage ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage ;;
  esac
done

if [[ "$TARGET_ENV" != "staging" && "$TARGET_ENV" != "production" ]]; then
  echo "ERROR: --env must be 'staging' or 'production'" >&2
  exit 2
fi

AWS_ARGS=()
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  AWS_ARGS+=(--profile "$AWS_PROFILE_ARG")
elif [[ -n "${AWS_PROFILE:-}" ]]; then
  echo "Using ambient AWS_PROFILE=${AWS_PROFILE}"
else
  echo "ERROR: pass --profile or export AWS_PROFILE (operator credentials)" >&2
  exit 2
fi

if [[ ! -r "$SIGNING_KEY" ]]; then
  echo "ERROR: signing key not readable: ${SIGNING_KEY}" >&2
  echo "       Provision it with scripts/provision-archive-signing-key.sh," >&2
  echo "       or point --signing-key at the operator key directory." >&2
  exit 1
fi

TF_DIR="${REPO_ROOT}/terraform/${TARGET_ENV}"
tf_out() { terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || true; }
DOMAIN="$(tf_out archive_domain)"
KEY_PAIR_ID="$(tf_out archive_key_pair_id)"
BUCKET="$(tf_out archive_bucket_name)"
if [[ -z "$DOMAIN" || -z "$KEY_PAIR_ID" || -z "$BUCKET" ]]; then
  echo "ERROR: archive terraform outputs are empty in ${TF_DIR}." >&2
  echo "       The archive stack must be applied (enable_archive = true)." >&2
  exit 1
fi

WORK_DIR="$(mktemp -d /tmp/footbag-archive-edge.XXXXXX)"
PROBE_KEY=""
cleanup() {
  # Remove the probe object even on failure, so a failed run never leaves
  # content in an otherwise-empty archive bucket.
  if [[ -n "$PROBE_KEY" ]]; then
    aws s3 rm "s3://${BUCKET}/${PROBE_KEY}" "${AWS_ARGS[@]}" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

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
# Same cookie with one signature character transposed, so the signature is
# well-formed but invalid: that is what exercises the CloudFront-generated 403.
BAD_SIGNATURE="$(printf '%s' "$SIGNATURE" | sed 's/^\(.\)\(.\)/\2\1/')"
printf 'Cookie: CloudFront-Policy=%s; CloudFront-Signature=%s; CloudFront-Key-Pair-Id=%s\n' \
  "$POLICY_B64" "$BAD_SIGNATURE" "$KEY_PAIR_ID" > "$BAD_COOKIE_FILE"

# ---- Ensure there is a real object and a real directory URL to fetch ----------

CONTENT_KEY="index.html"
DIR_URL="https://${DOMAIN}/"
if ! aws s3api head-object --bucket "$BUCKET" --key "$CONTENT_KEY" "${AWS_ARGS[@]}" >/dev/null 2>&1; then
  # Empty archive (first bring-up): stand up a probe object under its own
  # prefix. Never under _gate/, which Terraform owns.
  PROBE_KEY="edge-proof/index.html"
  printf '<h1>edge proof</h1>\n' > "${WORK_DIR}/probe.html"
  aws s3 cp "${WORK_DIR}/probe.html" "s3://${BUCKET}/${PROBE_KEY}" \
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
    code="$(curl -sS -o "$body_file" -w '%{http_code}' -H "@${cookie}" "$url")"
  else
    code="$(curl -sS -o "$body_file" -w '%{http_code}' "$url")"
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

check "gate page, no cookies"        200 "https://${DOMAIN}/_gate/denied.html" "" "archive"
check "root, no cookies"             403 "https://${DOMAIN}/"                  "" "Sign in"
check "corrupted signature"          403 "https://${DOMAIN}/${CONTENT_KEY}"    "$BAD_COOKIE_FILE" "Sign in"
check "valid cookies, missing key"   404 "https://${DOMAIN}/no-such-key-$$"    "$COOKIE_FILE"
check "valid cookies, existing key"  200 "https://${DOMAIN}/${CONTENT_KEY}"    "$COOKIE_FILE"
check "valid cookies, directory URL" 200 "$DIR_URL"                            "$COOKIE_FILE"

# The noindex header must reach the gate pages both directly and when one is
# served as an error body, or the archive risks being indexed.
robots="$(curl -sSI "https://${DOMAIN}/_gate/denied.html" | tr -d '\r' | grep -i '^x-robots-tag:' || true)"
if [[ "$robots" == *noindex* ]]; then
  printf '  PASS  %-34s %s\n' "noindex on gate page" "${robots#*: }"
else
  printf '  FAIL  %-34s missing X-Robots-Tag noindex\n' "noindex on gate page"
  failures=$((failures + 1))
fi

if [[ "$CHECK_LOGS" -eq 1 ]]; then
  LOG_BUCKET="${BUCKET}-logs"
  account="$(aws sts get-caller-identity --query Account --output text "${AWS_ARGS[@]}" 2>/dev/null || true)"
  count="$(aws s3 ls "s3://${LOG_BUCKET}/AWSLogs/${account}/" --recursive "${AWS_ARGS[@]}" 2>/dev/null | grep -c . || true)"
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
  echo "EDGE PROOF FAILED: ${failures} check(s)." >&2
  exit 1
fi
echo "EDGE PROOF PASSED: every refusal and serving claim holds."
