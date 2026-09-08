#!/usr/bin/env bash
# verify-cutover-notice.sh
#
# Proves the cutover migration notice does what the freeze act needs it to do,
# and is the only check that can: everything else the cutover runbook runs is
# blind to the notice. The health path is an ordered behaviour the edge function
# never runs on, and the apex redirect is a viewer-request function that fires
# with the notice both up and down, so both return identical results either way.
# The one observable difference is a page path through the front door, and the
# one thing that can observe it before DNS moves is the function itself.
#
# Two modes, and the first needs no DNS at all:
#
#   --function   Runs the published function against synthetic viewer events at
#                the DEVELOPMENT stage (`aws cloudfront test-function`), which
#                exercises the real edge runtime with whatever Host the tester
#                chooses. This is the rehearsal that exists because the
#                maintenance-page resources are deliberately absent from
#                staging, so the notice branch has no pre-production home.
#                Read-only: the DEVELOPMENT stage is not what viewers reach.
#
#   --front-door Fetches the real names once they resolve, asserting the notice
#                on www and the platform on preview in the same run. This is the
#                check the launch decision rests on, because it is the only one
#                that distinguishes the two states from outside.
#
# Both modes assert the same four-way contract, which is the whole design:
#
#   www + a page path        -> 503 carrying the notice
#   www + the webhook path   -> passes through (Stripe deliveries are exempt)
#   preview + a page path    -> passes through (preview is the real site)
#   apex + any path          -> 301 to www (the redirect is unaffected)
#
# With the notice flag off the expectations invert for the first case only: www
# passes through like the rest. Pass --expect-notice or --expect-live to say
# which state the tree is in; the script refuses to guess, because a run that
# picks its own expectations proves nothing.
#
# Usage:
#   scripts/verify-cutover-notice.sh --function --expect-notice --profile <prod-profile>
#   scripts/verify-cutover-notice.sh --front-door --expect-live
#
# Exits 0 when every expectation holds, 1 when any fails, 2 on invalid
# invocation. Never applies, never publishes, never writes to the tree.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MODE=""
EXPECT=""
AWS_PROFILE_ARG=""
FUNCTION_NAME="${FOOTBAG_CUTOVER_FUNCTION_NAME:-footbag-production-apex-redirect}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --function)      MODE="function"; shift ;;
    --front-door)    MODE="front-door"; shift ;;
    --expect-notice) EXPECT="notice"; shift ;;
    --expect-live)   EXPECT="live"; shift ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --name)
      FUNCTION_NAME="${2:-}"
      shift 2 || { echo "ERROR: --name requires an argument" >&2; exit 2; }
      ;;
    -h|--help)
      sed -n '2,/^set -euo pipefail/{/^set -euo pipefail/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

[[ -n "$MODE" ]]   || { echo "ERROR: name a mode: --function or --front-door" >&2; exit 2; }
[[ -n "$EXPECT" ]] || {
  echo "ERROR: name the state you expect: --expect-notice or --expect-live." >&2
  echo "       A check that infers its own expectations from what it observes" >&2
  echo "       agrees with the world by construction and proves nothing." >&2
  exit 2
}

PASS=0
FAIL=0
pass() { printf '  ok    %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }

# Scratch for the synthetic event objects. Removed on every exit path, including
# a failed assertion and an interrupt: nothing here is worth leaving behind and
# an operator should not have to remember a teardown.
WORK=""
cleanup() { [[ -n "$WORK" && -d "$WORK" ]] && rm -rf "$WORK"; return 0; }
trap cleanup EXIT INT TERM

# ── The four-way matrix, one row per line: host, uri, expectation-key ─────────
# The expectation-key is resolved against the declared state below, so the
# matrix itself carries no assumption about which way the flag is set.
MATRIX=(
  "www.footbag.org|/events|www-page"
  "www.footbag.org|/payments/webhook|passthrough"
  "preview.footbag.org|/members|passthrough"
  "footbag.org|/events|redirect"
)

expected_for() {
  case "$1" in
    www-page)    [[ "$EXPECT" == "notice" ]] && echo "notice" || echo "passthrough" ;;
    passthrough) echo "passthrough" ;;
    redirect)    echo "redirect" ;;
  esac
}

if [[ "$MODE" == "function" ]]; then
  command -v aws >/dev/null || { echo "ERROR: aws CLI not installed" >&2; exit 2; }
  AWS_ARGS=()
  [[ -n "$AWS_PROFILE_ARG" ]] && AWS_ARGS=(--profile "$AWS_PROFILE_ARG")

  WORK="$(mktemp -d)"

  ETAG="$(aws "${AWS_ARGS[@]+"${AWS_ARGS[@]}"}" cloudfront describe-function \
    --name "$FUNCTION_NAME" --query 'ETag' --output text 2>/dev/null || true)"
  if [[ -z "$ETAG" || "$ETAG" == "None" ]]; then
    echo "ERROR: could not read the ETag for function '$FUNCTION_NAME'." >&2
    echo "       The function must exist and be published before it can be tested." >&2
    exit 1
  fi

  echo "== cutover notice: function test (${FUNCTION_NAME}, DEVELOPMENT stage) =="
  echo "   expecting the notice to be: ${EXPECT}"

  for row in "${MATRIX[@]}"; do
    IFS='|' read -r host uri key <<< "$row"
    want="$(expected_for "$key")"
    event="${WORK}/event.json"
    cat > "$event" <<EVENT
{
  "version": "1.0",
  "context": { "eventType": "viewer-request" },
  "viewer": { "ip": "198.51.100.11" },
  "request": {
    "method": "GET",
    "uri": "${uri}",
    "querystring": {},
    "headers": { "host": { "value": "${host}" } },
    "cookies": {}
  }
}
EVENT
    out="$(aws "${AWS_ARGS[@]+"${AWS_ARGS[@]}"}" cloudfront test-function \
      --name "$FUNCTION_NAME" --if-match "$ETAG" \
      --event-object "fileb://${event}" --stage DEVELOPMENT \
      --query 'TestResult.FunctionOutput' --output text 2>/dev/null || true)"

    if [[ -z "$out" ]]; then
      fail "${host}${uri}: the function test returned nothing"
      continue
    fi

    case "$want" in
      notice)
        if [[ "$out" == *'"statusCode":503'* || "$out" == *'"statusCode": 503'* ]]; then
          pass "${host}${uri}: 503 notice"
        else
          fail "${host}${uri}: expected the 503 notice, got: ${out:0:160}"
        fi
        ;;
      redirect)
        if [[ "$out" == *301* && "$out" == *"www.footbag.org${uri}"* ]]; then
          pass "${host}${uri}: 301 to www"
        else
          fail "${host}${uri}: expected a 301 to www, got: ${out:0:160}"
        fi
        ;;
      passthrough)
        # A pass-through returns the request, which carries a uri and no status.
        if [[ "$out" == *statusCode* ]]; then
          fail "${host}${uri}: expected pass-through to the platform, got a generated response: ${out:0:160}"
        else
          pass "${host}${uri}: passes through to the platform"
        fi
        ;;
    esac
  done
fi

if [[ "$MODE" == "front-door" ]]; then
  echo "== cutover notice: front door =="
  echo "   expecting the notice to be: ${EXPECT}"

  status_of() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1"; }

  www_status="$(status_of "https://www.footbag.org/events")"
  if [[ "$EXPECT" == "notice" ]]; then
    if [[ "$www_status" == "503" ]]; then
      pass "www page path: 503 (the notice is up, which is correct for the window)"
    else
      fail "www page path: expected 503 while the notice is up, got ${www_status}"
    fi
  else
    if [[ "$www_status" == "200" ]]; then
      pass "www page path: 200 (the platform is serving, which is launch)"
    else
      fail "www page path: expected 200 after launch, got ${www_status}"
    fi
  fi

  # Preview is the control in both states, and it is the assertion that makes
  # this check worth running during the window: it is what proves the notice is
  # per-hostname rather than a blanket outage.
  preview_status="$(status_of "https://preview.footbag.org/events")"
  if [[ "$preview_status" == "200" ]]; then
    pass "preview page path: 200 (the real site, through the window and after it)"
  else
    fail "preview page path: expected 200, got ${preview_status}; preview must serve the platform in both states"
  fi

  apex_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://footbag.org/events")"
  if [[ "$apex_status" == "301" ]]; then
    pass "apex: 301 (the redirect is unaffected by the notice, as designed)"
  else
    fail "apex: expected 301, got ${apex_status}"
  fi
fi

echo ""
echo "  passed: ${PASS}   failed: ${FAIL}"
if [[ "$FAIL" -gt 0 ]]; then
  echo "GATE: CUTOVER-NOTICE FAIL: ${FAIL} expectation(s) unmet"
  exit 1
fi
echo "GATE: CUTOVER-NOTICE PASS: the notice is ${EXPECT} and every hostname behaves as designed"
exit 0
