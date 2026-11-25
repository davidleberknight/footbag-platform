#!/usr/bin/env bash
# verify-preview.sh
#
# Proves, against the live production edge, that the preview name serves the
# platform and is kept out of every search index, and that the members-only
# archive refuses a request carrying no signed cookie. Read-only: it reads two
# Terraform outputs and makes plain HTTPS requests, and changes nothing.
#
# WHY IT EXISTS.
#
# Through the cutover window the preview name is the only public name reaching
# the platform, while www still serves the migration notice. A preview page
# that lands in a search index outlives the window: results keep pointing at a
# name that is removed at launch, and the site's real pages compete with a copy
# of themselves. Whether a page is indexable is decided by the base address the
# host holds, so a host left on the wrong one, or a build that dropped the
# header, is invisible from a browser and only shows here. It runs in the
# second pass of the production-readiness sitting, once the custom domain and
# the window state are on.
#
# What it proves, one row per claim:
#   1. GET <preview>/                 200
#   2. GET <preview>/                 X-Robots-Tag: noindex, nofollow (set on
#                                     every response by any build that is not
#                                     the canonical www site)
#   3. GET <preview>/robots.txt       200, a "Disallow: /" line and no
#                                     "Sitemap:" line
#   4. GET <preview>/sitemap.xml      an X-Robots-Tag carrying noindex
#      GET <preview>/llms.txt         an X-Robots-Tag carrying noindex
#   5. GET https://<archive>/         403 with no cookie
#
# Header names and values are matched without regard to case. Each failed
# claim is an error in the closing report naming the claim and what was seen.
#
# WHAT IT REFUSES.
#
#   - A target other than production. Staging has no custom domain and no
#     preview name, so there is nothing there for this run to prove.
#   - A Terraform output it cannot read, with Terraform's own last error line.
#   - An empty preview_url: the custom domain or the preview record is off, so
#     there is no preview to check.
#   - An empty archive_domain: the archive stack is not applied.
#
# Usage:
#   scripts/verify-preview.sh --target production
#   scripts/verify-preview.sh --target production --profile footbag-operator
#
# Flags:
#   --target staging|production   Target environment (required, no default;
#                                 only production has a preview).
#   --profile <p>                 AWS profile the Terraform state is read
#                                 through; else the identity this run settles
#                                 and proves.
#
# Test seams: VERIFY_PREVIEW_CURL_BIN and VERIFY_PREVIEW_TERRAFORM_BIN replace
# curl and Terraform. A run using either says so on stderr, because a stubbed
# run proves nothing about the edge.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# The Terraform state lives in S3, so the outputs are read through an AWS
# identity this run supplies and proves rather than inherits.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

TARGET_ENV=""
AWS_PROFILE_ARG=""

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
    -h|--help) usage ;;
    *) cr_error "unknown argument: $1"; usage ;;
  esac
done

case "$TARGET_ENV" in
  production) ;;
  staging)
    cr_error "--target staging has no custom domain and no preview name, so there is nothing to verify there; this check runs on production only"
    exit 2
    ;;
  *)
    cr_error "--target must be 'staging' or 'production' (got '${TARGET_ENV}'), and only production has a preview"
    exit 2
    ;;
esac

CURL_BIN="${VERIFY_PREVIEW_CURL_BIN:-curl}"
TF_BIN="${VERIFY_PREVIEW_TERRAFORM_BIN:-terraform}"
[[ -n "${VERIFY_PREVIEW_CURL_BIN:-}" ]] && echo "NOTE: using a stand-in for curl; this run proves nothing about the edge." >&2
[[ -n "${VERIFY_PREVIEW_TERRAFORM_BIN:-}" ]] && echo "NOTE: using a stand-in for Terraform; the names this run checks are not the environment's." >&2

if [[ -n "$AWS_PROFILE_ARG" ]]; then
  export AWS_PROFILE="$AWS_PROFILE_ARG"
else
  aws_profile_ensure || cr_die "no AWS identity to read the Terraform state with (the reason is printed above)"
fi

TF_DIR="${REPO_ROOT}/terraform/${TARGET_ENV}"
TF_ERR="$(mktemp /tmp/footbag-verify-preview-tf.XXXXXX)"
cr_cleanup rm -f "$TF_ERR"
# tf_read <variable> <output>: reads one output into the named variable, in this
# shell rather than a command substitution, so a failed read stops the run with
# Terraform's own message in the closing report.
tf_read() {
  local -n _tf_into="$1"
  if ! _tf_into="$("$TF_BIN" -chdir="$TF_DIR" output -raw "$2" 2> "$TF_ERR")"; then
    cr_error "could not read the Terraform output $2 from ${TF_DIR}: $(grep -v '^[[:space:]]*$' "$TF_ERR" | tail -n 1 || [[ $? == 1 ]])"
    exit 1
  fi
}
tf_read PREVIEW_URL preview_url
tf_read ARCHIVE_DOMAIN archive_domain
if [[ -z "$PREVIEW_URL" ]]; then
  cr_error "preview_url is empty in ${TF_DIR}: the custom domain or the preview record is off, so there is no preview to check"
  exit 1
fi
if [[ -z "$ARCHIVE_DOMAIN" ]]; then
  cr_error "archive_domain is empty in ${TF_DIR}: the archive stack is not applied (enable_archive = true)"
  exit 1
fi
PREVIEW_URL="${PREVIEW_URL%/}"

WORK_DIR="$(mktemp -d /tmp/footbag-verify-preview.XXXXXX)"
cr_cleanup rm -rf "$WORK_DIR"

# fetch <name> <url>: one GET, its status in CODE, its headers (carriage returns
# stripped) in <name>.headers and its body in <name>.body. A request curl could
# not make is an error naming the URL and curl's own message.
CODE=""
fetch() {
  local name="$1" url="$2" err="${WORK_DIR}/${1}.err"
  CODE=""
  if ! CODE="$("$CURL_BIN" -sS --max-time 30 -o "${WORK_DIR}/${name}.body" \
      -D "${WORK_DIR}/${name}.raw" -w '%{http_code}' "$url" 2> "$err")"; then
    cr_error "could not request ${url}: $(grep -v '^[[:space:]]*$' "$err" | tail -n 1 || [[ $? == 1 ]])"
    CODE="000"
  fi
  touch "${WORK_DIR}/${name}.raw" "${WORK_DIR}/${name}.body"
  tr -d '\r' < "${WORK_DIR}/${name}.raw" > "${WORK_DIR}/${name}.headers"
}

# robots_header <name>: the X-Robots-Tag value of a fetched response, lowercased
# and trimmed; empty when the header is absent.
robots_header() {
  { grep -i '^x-robots-tag:' "${WORK_DIR}/${1}.headers" || [[ $? == 1 ]]; } \
    | tail -n 1 | sed 's/^[^:]*:[[:space:]]*//; s/[[:space:]]*$//' | tr '[:upper:]' '[:lower:]'
}

failures=0
pass() { printf '  PASS  %-40s %s\n' "$1" "$2"; }
fail() {
  printf '  FAIL  %-40s %s\n' "$1" "$2"
  cr_error "claim $1: $2"
  failures=$((failures + 1))
}

echo "Preview proof: ${TARGET_ENV} (${PREVIEW_URL}, archive ${ARCHIVE_DOMAIN})"

fetch root "${PREVIEW_URL}/"
if [[ "$CODE" == "200" ]]; then
  pass "1 preview root answers 200" "$CODE"
else
  fail "1 preview root answers 200" "got ${CODE}"
fi
robots="$(robots_header root)"
if [[ "$robots" == "noindex, nofollow" ]]; then
  pass "2 preview root is noindex, nofollow" "$robots"
else
  fail "2 preview root is noindex, nofollow" "X-Robots-Tag was '${robots:-<absent>}'"
fi

fetch robots "${PREVIEW_URL}/robots.txt"
robots_body="$(tr -d '\r' < "${WORK_DIR}/robots.body")"
if [[ "$CODE" != "200" ]]; then
  fail "3 robots.txt disallows all, no sitemap" "got ${CODE}"
elif ! grep -qx 'Disallow: /' <<<"$robots_body"; then
  fail "3 robots.txt disallows all, no sitemap" "no 'Disallow: /' line"
elif grep -qi '^sitemap:' <<<"$robots_body"; then
  fail "3 robots.txt disallows all, no sitemap" "it names a sitemap: $(grep -i '^sitemap:' <<<"$robots_body" | head -n 1)"
else
  pass "3 robots.txt disallows all, no sitemap" "$CODE"
fi

for path in sitemap.xml llms.txt; do
  fetch "$path" "${PREVIEW_URL}/${path}"
  robots="$(robots_header "$path")"
  if [[ "$robots" == *noindex* ]]; then
    pass "4 ${path} is noindex" "$robots"
  else
    fail "4 ${path} is noindex" "X-Robots-Tag was '${robots:-<absent>}' (status ${CODE})"
  fi
done

fetch archive "https://${ARCHIVE_DOMAIN}/"
if [[ "$CODE" == "403" ]]; then
  pass "5 archive refuses an unsigned request" "$CODE"
else
  fail "5 archive refuses an unsigned request" "got ${CODE}, want 403"
fi

if [[ "$failures" -ne 0 ]]; then
  cr_unproved "the preview and archive claims on ${TARGET_ENV}: ${failures} claim(s) failed"
  cr_finish
fi
echo "PREVIEW PROOF PASSED: preview serves the platform, out of every index, and the archive refuses unsigned requests."
cr_proved "preview ${PREVIEW_URL} serves the platform with noindex on every surface checked, and ${ARCHIVE_DOMAIN} refuses an unsigned request"
cr_finish
