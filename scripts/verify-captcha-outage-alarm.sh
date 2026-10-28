#!/usr/bin/env bash
# verify-captcha-outage-alarm.sh
#
# Proves, end to end on staging, that a human-verification outage refuses the
# sign-in form with a retry-later answer and reaches an operator: the login form
# answers 503 with Retry-After, the app logs captcha.unavailable, and the
# captcha-unavailable CloudWatch alarm fires. The route tests prove the 503 and
# the Terraform declares the alarm; only a real post through the front door
# shows the log line reaches the log group, the metric filter matches it and the
# alarm watches that metric.
#
# Staging only. Staging runs the stub captcha, whose outage sentinel answer
# drives the outage on demand; production runs the live verifier, where no
# answer a script can send makes Cloudflare unavailable, so a production run is
# refused rather than run against the wrong thing.
#
# What it changes: nothing stored. The post is refused before any account is
# read. The alarm moves to ALARM and notifies the staging alarm topic once, then
# returns to OK by itself about five minutes after the last outage line.
#
# What it refuses or fails on:
#   - a target other than staging; there is no default
#   - the alarm missing (the staging Terraform is not applied) or already in
#     ALARM, because a state the run did not cause proves nothing
#   - a login page without the stub card's captcha answer (staging is not
#     running a build that has this check)
#   - the post answering anything but 503 with a numeric Retry-After
#   - no captcha.unavailable line in the app log group after the post
#   - the alarm not reaching ALARM before the deadline
#
# Usage:
#   bash scripts/verify-captcha-outage-alarm.sh --target staging
#
# Exits 0 when every check holds, 1 when any fails, 2 on invalid invocation.
#
# Test seams (CI only; operators never set these), announced on stderr when set:
# VERIFY_CAPTCHA_ALARM_AWS_BIN, VERIFY_CAPTCHA_ALARM_TERRAFORM_BIN and
# VERIFY_CAPTCHA_ALARM_CURL_BIN replace the three tools;
# VERIFY_CAPTCHA_ALARM_POLL_SECONDS replaces the wait between polls.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

TARGET=""
# The alarm evaluates five-minute periods, and the metric lands a minute or two
# after the line, so ALARM can take up to about seven minutes; twelve leaves
# room for a slow evaluation without waiting forever on a broken one.
ALARM_POLLS=24
LOG_POLLS=8
OUTAGE_ANSWER="stub-captcha-unavailable"

die() { echo "verify-captcha-outage-alarm: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "verify-captcha-outage-alarm: --target requires an argument" >&2; exit 2; } ;;
    -h|--help) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "verify-captcha-outage-alarm: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

if [[ "$TARGET" == "production" ]]; then
  echo "verify-captcha-outage-alarm: production runs the live captcha, which no posted answer can make unavailable; this proof runs on staging only." >&2
  exit 2
fi
[[ "$TARGET" == "staging" ]] || { echo "verify-captcha-outage-alarm: --target must be staging (got '${TARGET}')" >&2; exit 2; }

AWS_BIN="${VERIFY_CAPTCHA_ALARM_AWS_BIN:-aws}"
TF_BIN="${VERIFY_CAPTCHA_ALARM_TERRAFORM_BIN:-terraform}"
CURL_BIN="${VERIFY_CAPTCHA_ALARM_CURL_BIN:-curl}"
POLL_SECONDS="${VERIFY_CAPTCHA_ALARM_POLL_SECONDS:-30}"
for seam in VERIFY_CAPTCHA_ALARM_AWS_BIN VERIFY_CAPTCHA_ALARM_TERRAFORM_BIN VERIFY_CAPTCHA_ALARM_CURL_BIN VERIFY_CAPTCHA_ALARM_POLL_SECONDS; do
  [[ -n "${!seam:-}" ]] && echo "verify-captcha-outage-alarm: TEST SEAM ${seam} is set; this run proves nothing about the estate." >&2
done

if [[ -z "${VERIFY_CAPTCHA_ALARM_AWS_BIN:-}" ]]; then
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  aws_profile_ensure || exit 1
fi

WORK="$(mktemp -d)"
cleanup() { rm -rf -- "$WORK"; }
trap cleanup EXIT INT TERM

PASS=0
FAIL=0
pass() { printf '  ok    %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }

finish() {
  echo ""
  echo "  passed: ${PASS}   failed: ${FAIL}"
  if [[ "$FAIL" -gt 0 ]]; then
    echo "GATE: CAPTCHA-OUTAGE-ALARM FAIL: ${FAIL} check(s) unmet"
    exit 1
  fi
  echo "GATE: CAPTCHA-OUTAGE-ALARM PASS: the outage refuses sign-in with 503 and alarms; the alarm returns to OK by itself"
  exit 0
}

BASE_URL="$("$TF_BIN" -chdir="terraform/${TARGET}" output -raw public_base_url </dev/null 2>/dev/null)" \
  || die "could not read terraform/${TARGET} output public_base_url"
[[ "$BASE_URL" =~ ^https?://[^/]+$ ]] || die "terraform/${TARGET} output public_base_url is not an origin: '${BASE_URL}'"
ALARM_NAME="footbag-${TARGET}-captcha-unavailable"
LOG_GROUP="/footbag/${TARGET}/app"

echo "== captcha outage alarm: ${TARGET} (${BASE_URL}) =="

alarm_state() {
  "$AWS_BIN" cloudwatch describe-alarms --alarm-names "$ALARM_NAME" \
    --query 'MetricAlarms[0].StateValue' --output text </dev/null 2>/dev/null
}

before="$(alarm_state)" || die "could not read alarm ${ALARM_NAME}"
case "$before" in
  OK|INSUFFICIENT_DATA) pass "alarm ${ALARM_NAME} exists and is not firing (${before})" ;;
  ALARM) fail "alarm ${ALARM_NAME} is already in ALARM; wait for it to return to OK and run again"; finish ;;
  *) fail "alarm ${ALARM_NAME} not found (apply the ${TARGET} Terraform first)"; finish ;;
esac

login_page="${WORK}/login.html"
"$CURL_BIN" -s --max-time 20 -o "$login_page" "${BASE_URL}/login" </dev/null || true
if grep -q 'name="cf-turnstile-response"' "$login_page" 2>/dev/null; then
  pass "the login page carries the stub captcha answer"
else
  fail "the login page carries no stub captcha answer; staging is not running a build with this check"
  finish
fi

start_ms="$(( $(date +%s) * 1000 - 60000 ))"
headers="${WORK}/headers.txt"
status="$("$CURL_BIN" -s --max-time 20 -o /dev/null -D "$headers" -w '%{http_code}' \
  -H "Origin: ${BASE_URL}" \
  --data-urlencode "email=verify-captcha-alarm@example.invalid" \
  --data-urlencode "password=not-a-real-password" \
  --data-urlencode "cf-turnstile-response=${OUTAGE_ANSWER}" \
  "${BASE_URL}/login" </dev/null)" || status="000"
retry_after="$(grep -i '^retry-after:' "$headers" 2>/dev/null | tr -d '\r' | sed 's/^[^:]*: *//' | head -n 1 || true)"
if [[ "$status" == "503" && "$retry_after" =~ ^[0-9]+$ ]]; then
  pass "the login post with the verifier unavailable answers 503, Retry-After ${retry_after}"
else
  fail "the login post with the verifier unavailable answered ${status}, Retry-After '${retry_after}'; expected 503 with a number"
fi

logged=0
for ((i = 1; i <= LOG_POLLS; i++)); do
  # The CLI pages this search and applies the query to each page, so a count per
  # page would print one number per page; counting the event ids across every
  # page gives one answer however the results are split.
  count="$({ "$AWS_BIN" logs filter-log-events --log-group-name "$LOG_GROUP" \
    --start-time "$start_ms" --filter-pattern '{ $.msg = "captcha.unavailable" }' \
    --query 'events[].eventId' --output text </dev/null 2>/dev/null || true; } | wc -w)"
  if [[ "$count" -gt 0 ]]; then logged=1; break; fi
  [[ "$i" -lt "$LOG_POLLS" ]] && sleep "$POLL_SECONDS"
done
if [[ "$logged" -eq 1 ]]; then
  pass "captcha.unavailable reached the ${LOG_GROUP} log group"
else
  fail "no captcha.unavailable line in ${LOG_GROUP} after the post"
fi

fired=""
for ((i = 1; i <= ALARM_POLLS; i++)); do
  state="$(alarm_state || true)"
  if [[ "$state" == "ALARM" ]]; then fired=1; break; fi
  [[ "$i" -lt "$ALARM_POLLS" ]] && sleep "$POLL_SECONDS"
done
if [[ -n "$fired" ]]; then
  pass "alarm ${ALARM_NAME} fired"
else
  fail "alarm ${ALARM_NAME} did not reach ALARM in $((ALARM_POLLS * POLL_SECONDS)) seconds (last state: ${state:-unknown})"
fi

finish
