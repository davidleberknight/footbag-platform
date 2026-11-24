#!/usr/bin/env bash
# verify-archive-member-access.sh
#
# The member's side of the Legacy Archive, proved through the deployed platform
# the way a browser meets it: sign in on the platform, follow the archive link
# with whatever cookies the sign-in left, sign out, and try again; then the same
# for a prospective member, who holds a session but no archive access. The edge
# proof (scripts/verify-archive-edge.sh) signs its own cookies and so proves
# the distribution; this proves the platform mints the right ones for the right
# person and withdraws them at sign-out.
#
# What it proves, one row per claim:
#   1. A member's sign-in is answered with the session cookie, host-only and
#      Secure, so no other footbag.org host is sent the session.
#   2. The same response sets the three CloudFront-* cookies, Secure, scoped to
#      the archive's parent domain (Domain=.footbag.org) once the archive answers
#      on its custom domain, and host-only before then.
#   3. With those cookies the archive's landing page answers 200: one sign-in,
#      no second login.
#   4. Sign-out clears all four cookies, and the archive then answers 403.
#   5. A prospective member's sign-in sets the session cookie and no archive
#      cookie, and the archive answers 403.
#
# Before the archive answers on a name under the platform's own parent domain,
# no cookie the platform sets can reach the archive host, so rows 3, 4's refusal
# and 5's refusal cannot be shown. They are reported as unproved, never as
# passed, and the run says what it needs.
#
# It refuses an environment whose archive edge does not require signed cookies
# (staging, whose archive the platform's login redirect gates): there the
# platform signs nothing and there is nothing of this to prove.
#
# The two accounts are real accounts on the target: a member, and a registered
# account whose onboarding is unfinished. The run signs each in and out once and
# changes nothing else. Their passwords are read from the terminal with echo
# off, or, when stdin is not a terminal, as two lines of stdin, member first;
# neither ever appears in a process argument, and each reaches curl through a
# 0600 file.
#
# Usage:
#   scripts/verify-archive-member-access.sh --target production \
#     --member-email <email> --prospective-email <email>
#
# Flags:
#   --target staging|production   Target environment (required).
#   --member-email <email>        Sign-in address of a member's account.
#   --prospective-email <email>   Sign-in address of an account whose
#                                 onboarding is unfinished.
#   --profile <p>                 AWS profile for the Terraform state read; else
#                                 the identity this run settles and proves.
#
# Test seams: VERIFY_MEMBER_ACCESS_CURL_BIN and
# VERIFY_MEMBER_ACCESS_TERRAFORM_BIN replace curl and Terraform. A run using
# either says so on stderr, because a stubbed run proves nothing about the site.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

SESSION_COOKIE="__Host-footbag_session"
ARCHIVE_COOKIES=(CloudFront-Policy CloudFront-Signature CloudFront-Key-Pair-Id)

TARGET_ENV=""
MEMBER_EMAIL=""
PROSPECTIVE_EMAIL=""
AWS_PROFILE_ARG=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET_ENV="${2:-}"; shift 2 || { cr_error "--target requires an argument"; exit 2; } ;;
    --member-email) MEMBER_EMAIL="${2:-}"; shift 2 || { cr_error "--member-email requires an argument"; exit 2; } ;;
    --prospective-email) PROSPECTIVE_EMAIL="${2:-}"; shift 2 || { cr_error "--prospective-email requires an argument"; exit 2; } ;;
    --profile) AWS_PROFILE_ARG="${2:-}"; shift 2 || { cr_error "--profile requires an argument"; exit 2; } ;;
    -h|--help) usage ;;
    *) cr_error "unknown argument: $1"; usage ;;
  esac
done

if [[ "$TARGET_ENV" != "staging" && "$TARGET_ENV" != "production" ]]; then
  cr_error "--target must be 'staging' or 'production'"
  exit 2
fi
if [[ -z "$MEMBER_EMAIL" || -z "$PROSPECTIVE_EMAIL" ]]; then
  cr_error "--member-email and --prospective-email are both required"
  exit 2
fi
if [[ "$MEMBER_EMAIL" == "$PROSPECTIVE_EMAIL" ]]; then
  cr_error "--member-email and --prospective-email name the same account; the refusal row needs a second account with no archive access"
  exit 2
fi

CURL_BIN="${VERIFY_MEMBER_ACCESS_CURL_BIN:-curl}"
TF_BIN="${VERIFY_MEMBER_ACCESS_TERRAFORM_BIN:-terraform}"
[[ -n "${VERIFY_MEMBER_ACCESS_CURL_BIN:-}" ]] && echo "NOTE: using a stand-in for curl; this run proves nothing about the site." >&2
[[ -n "${VERIFY_MEMBER_ACCESS_TERRAFORM_BIN:-}" ]] && echo "NOTE: using a stand-in for Terraform; the addresses this run uses are not the environment's." >&2

if [[ -n "$AWS_PROFILE_ARG" ]]; then
  export AWS_PROFILE="$AWS_PROFILE_ARG"
else
  aws_profile_ensure || cr_die "no AWS identity to read the Terraform state with (the reason is printed above)"
fi

WORK_DIR="$(mktemp -d /tmp/footbag-member-access.XXXXXX)"
chmod 700 "$WORK_DIR"
cr_cleanup rm -rf "$WORK_DIR"

# ---- The environment, from its own Terraform outputs ---------------------------

TF_DIR="${REPO_ROOT}/terraform/${TARGET_ENV}"
# tf_read <variable> <output>: reads one output into the named variable, in this
# shell rather than a command substitution, so a failed read lands in this run's
# closing report with Terraform's own message.
tf_read() {
  local -n _tf_into="$1"
  if ! _tf_into="$("$TF_BIN" -chdir="$TF_DIR" output -raw "$2" 2> "${WORK_DIR}/tf.err")"; then
    cr_die "could not read the Terraform output $2 from ${TF_DIR}: $(grep -v '^[[:space:]]*$' "${WORK_DIR}/tf.err" | tail -n 1 || [[ $? == 1 ]])"
  fi
}
tf_read REQUIRE_COOKIES archive_requires_signed_cookies
if [[ "$REQUIRE_COOKIES" != "true" ]]; then
  cr_die "REFUSING: ${TARGET_ENV}'s archive edge does not require signed cookies (archive_requires_signed_cookies reads '${REQUIRE_COOKIES}'), so its platform signs no archive cookies and gates the archive by its login redirect instead. Nothing was signed in."
fi
tf_read PLATFORM public_base_url
tf_read ARCHIVE_HOST archive_domain
[[ "$PLATFORM" =~ ^https://[A-Za-z0-9.-]+$ ]] || cr_die "public_base_url reads '${PLATFORM}', not an https origin"
[[ "$ARCHIVE_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || cr_die "archive_domain reads '${ARCHIVE_HOST}', not a host name"
PLATFORM_HOST="${PLATFORM#https://}"
ARCHIVE_URL="https://${ARCHIVE_HOST}/index.html"

# The archive cookies can reach the archive only once both hosts sit under one
# parent the cookies are scoped to; a cloudfront.net name is a public suffix
# and shares no cookie with anything.
PARENT=""
if [[ "$ARCHIVE_HOST" != *.cloudfront.net && "$ARCHIVE_HOST" == *.*.* ]]; then
  candidate="${ARCHIVE_HOST#*.}"
  [[ "$PLATFORM_HOST" == *".${candidate}" ]] && PARENT=".${candidate}"
fi
if [[ -n "$PARENT" ]]; then
  echo "Platform ${PLATFORM}, archive ${ARCHIVE_HOST}: archive cookies are expected on ${PARENT}."
else
  echo "Platform ${PLATFORM}, archive ${ARCHIVE_HOST}: the two share no parent domain yet, so the archive cookies are expected host-only and cannot reach the archive."
fi

# ---- The two passwords ---------------------------------------------------------

read_password() {
  local who="$1" file="$2" value
  if [[ -t 0 ]]; then
    printf 'Password for the %s account: ' "$who" > /dev/tty
    IFS= read -rs value < /dev/tty || cr_die "no password read for the ${who} account"
    printf '\n' > /dev/tty
  else
    IFS= read -r value || cr_die "no password read for the ${who} account: stdin carries the member's password, then the prospective member's, one per line"
  fi
  [[ -n "$value" ]] || cr_die "the password for the ${who} account is empty"
  ( umask 077; printf '%s' "$value" > "$file" )
}
read_password member "${WORK_DIR}/member.pw"
read_password "prospective member" "${WORK_DIR}/prospective.pw"
( umask 077; printf '%s' "$MEMBER_EMAIL" > "${WORK_DIR}/member.email" )
( umask 077; printf '%s' "$PROSPECTIVE_EMAIL" > "${WORK_DIR}/prospective.email" )

# ---- Requests ------------------------------------------------------------------

failures=0
row() {
  local verdict="$1" label="$2" detail="$3"
  printf '  %-5s %-48s %s\n' "$verdict" "$label" "$detail"
  [[ "$verdict" == FAIL ]] && failures=$((failures + 1))
  return 0
}

# A sign-in or sign-out: the form post a browser makes, with the Origin header
# the platform's cross-site check requires, the headers kept to read the
# cookies from and the jar updated the way a browser's would be. Each request
# leaves its status in `code`, set in this shell rather than read through a
# command substitution, so a failed request lands in this run's closing report.
code=""
post_form() {
  local path="$1" jar="$2" headers="$3"; shift 3
  code="$("$CURL_BIN" -sS -o /dev/null -w '%{http_code}' -D "$headers" -b "$jar" -c "$jar" \
    -H "Origin: ${PLATFORM}" "$@" "${PLATFORM}${path}" 2> "${WORK_DIR}/curl.err")" \
    || cr_die "the request to ${PLATFORM}${path} failed: $(tail -n 1 "${WORK_DIR}/curl.err")"
}
sign_in() {
  local who="$1" jar="$2" headers="$3"
  post_form /login "$jar" "$headers" \
    --data-urlencode "email@${WORK_DIR}/${who}.email" \
    --data-urlencode "password@${WORK_DIR}/${who}.pw"
}
archive_status() {
  local jar="$1"
  code="$("$CURL_BIN" -sS -o /dev/null -w '%{http_code}' -b "$jar" "$ARCHIVE_URL" 2> "${WORK_DIR}/curl.err")" \
    || cr_die "the request to ${ARCHIVE_URL} failed: $(tail -n 1 "${WORK_DIR}/curl.err")"
}
# The attributes a response set on one cookie, or nothing when it set none.
set_cookie() {
  local headers="$1" name="$2"
  grep -i "^set-cookie:[[:space:]]*${name}=" "$headers" | tail -n 1 | tr -d '\r' || [[ $? == 1 ]]
}
has_attr() { [[ "$1" =~ (^|;)[[:space:]]*$2([[:space:]]*(;|=|$)) ]]; }
domain_of() {
  local attrs="$1"
  if [[ "$attrs" =~ \;[[:space:]]*[Dd]omain=([^;]+) ]]; then printf '%s' "${BASH_REMATCH[1]}"; fi
}
cleared() {
  local attrs="$1"
  [[ "$attrs" =~ [Ee]xpires=Thu,\ 01\ Jan\ 1970 || "$attrs" =~ [Mm]ax-[Aa]ge=0([^0-9]|$) ]]
}
check_session_cookie() {
  local headers="$1" who="$2" attrs
  attrs="$(set_cookie "$headers" "$SESSION_COOKIE")"
  if [[ -z "$attrs" ]]; then
    row FAIL "${who}: session cookie set at sign-in" "none; the sign-in did not succeed"
  elif [[ -n "$(domain_of "$attrs")" ]] || ! has_attr "$attrs" '[Ss]ecure'; then
    row FAIL "${who}: session cookie host-only and Secure" "${attrs#*; }"
  else
    row PASS "${who}: session cookie host-only and Secure" ""
  fi
}

echo
echo "Member"
MJAR="${WORK_DIR}/member.jar"; MHEAD="${WORK_DIR}/member-login.headers"
( umask 077; : > "$MJAR" )
sign_in member "$MJAR" "$MHEAD"
[[ "$code" =~ ^30[23]$ ]] && row PASS "member: sign-in redirects" "$code" || row FAIL "member: sign-in redirects" "answered ${code}"
check_session_cookie "$MHEAD" member
for name in "${ARCHIVE_COOKIES[@]}"; do
  attrs="$(set_cookie "$MHEAD" "$name")"
  domain="$(domain_of "$attrs")"
  if [[ -z "$attrs" ]]; then
    row FAIL "member: ${name} set" "none"
  elif ! has_attr "$attrs" '[Ss]ecure'; then
    row FAIL "member: ${name} Secure" "no Secure attribute"
  elif [[ -n "$PARENT" && "$domain" != "$PARENT" ]]; then
    row FAIL "member: ${name} scoped to ${PARENT}" "Domain=${domain:-<none>}"
  elif [[ -z "$PARENT" && -n "$domain" ]]; then
    row FAIL "member: ${name} host-only before the custom domain" "Domain=${domain}"
  else
    row PASS "member: ${name} Secure, ${PARENT:-host-only}" ""
  fi
done
if [[ -n "$PARENT" ]]; then
  archive_status "$MJAR"
  [[ "$code" == 200 ]] && row PASS "member: archive served with no second sign-in" "200" \
    || row FAIL "member: archive served with no second sign-in" "answered ${code}"
fi

OHEAD="${WORK_DIR}/member-logout.headers"
post_form /logout "$MJAR" "$OHEAD"
[[ "$code" =~ ^30[23]$ ]] && row PASS "member: sign-out redirects" "$code" || row FAIL "member: sign-out redirects" "answered ${code}"
for name in "$SESSION_COOKIE" "${ARCHIVE_COOKIES[@]}"; do
  attrs="$(set_cookie "$OHEAD" "$name")"
  if cleared "$attrs"; then
    row PASS "member: sign-out clears ${name}" ""
  else
    row FAIL "member: sign-out clears ${name}" "${attrs:-not cleared}"
  fi
done
if [[ -n "$PARENT" ]]; then
  archive_status "$MJAR"
  [[ "$code" == 403 ]] && row PASS "member: archive refused after sign-out" "403" \
    || row FAIL "member: archive refused after sign-out" "answered ${code}"
fi

echo
echo "Prospective member"
PJAR="${WORK_DIR}/prospective.jar"; PHEAD="${WORK_DIR}/prospective-login.headers"
( umask 077; : > "$PJAR" )
sign_in prospective "$PJAR" "$PHEAD"
[[ "$code" =~ ^30[23]$ ]] && row PASS "prospective member: sign-in redirects" "$code" \
  || row FAIL "prospective member: sign-in redirects" "answered ${code}"
check_session_cookie "$PHEAD" "prospective member"
granted=""
for name in "${ARCHIVE_COOKIES[@]}"; do
  [[ -n "$(set_cookie "$PHEAD" "$name")" ]] && granted+=" ${name}"
done
[[ -z "$granted" ]] && row PASS "prospective member: no archive cookie" "" \
  || row FAIL "prospective member: no archive cookie" "set${granted}"
if [[ -n "$PARENT" ]]; then
  archive_status "$PJAR"
  [[ "$code" == 403 ]] && row PASS "prospective member: archive refused" "403" \
    || row FAIL "prospective member: archive refused" "answered ${code}"
fi
post_form /logout "$PJAR" "${WORK_DIR}/prospective-logout.headers"

echo
if [[ "$failures" -ne 0 ]]; then
  cr_error "MEMBER ACCESS CHECK FAILED: ${failures} check(s). The FAIL rows above name each one."
  cr_unproved "members' archive access on ${TARGET_ENV}: ${failures} check(s) failed"
  cr_finish
fi
cr_proved "the cookies ${TARGET_ENV}'s platform sets and clears for a member and a prospective member"
if [[ -n "$PARENT" ]]; then
  echo "MEMBER ACCESS CHECK PASSED: one sign-in reaches the archive, sign-out withdraws it, and a prospective member is refused."
  cr_proved "a member reaches the archive with one sign-in and is refused after sign-out; a prospective member is refused"
else
  echo "MEMBER ACCESS CHECK PASSED as far as it can before the archive's custom domain."
  cr_unproved "the click-through and both refusals at the archive: they need the archive and the platform under one parent domain (archive.footbag.org beside the platform's footbag.org name)"
fi
cr_finish
