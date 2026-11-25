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
#                the LIVE stage (`aws cloudfront test-function`), which exercises
#                the real edge runtime with whatever Host the tester chooses.
#                This is the rehearsal that exists because the maintenance-page
#                resources are deliberately absent from staging, so the notice
#                branch has no pre-production home. Read-only: test-function
#                serves no traffic on either stage and publishes no metrics.
#                LIVE rather than DEVELOPMENT because Terraform writes
#                DEVELOPMENT and then publishes, so a publish that did not land
#                leaves the two stages holding different code and only LIVE is
#                what a viewer would reach.
#
#   --front-door Fetches the real names once they resolve, asserting the notice
#                on www and the platform on preview in the same run. This is the
#                check the launch decision rests on, because it is the only one
#                that distinguishes the two states from outside. With
#                --expect-live it asserts the launched state instead: www serves
#                the platform, preview has no DNS record (it is removed at
#                launch, before this runs), and the apex 301 carries the path
#                and query it was asked for to the same address on www. The
#                apex is held to that Location in both states.
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
  if [[ -n "$AWS_PROFILE_ARG" ]]; then
    AWS_ARGS=(--profile "$AWS_PROFILE_ARG")
  else
    # No profile named on the command line, so the identity is the one the
    # shared library settles and proves: whatever this shell already carries,
    # or the operator profile.
    # shellcheck source=lib/aws-profile.sh
    source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/aws-profile.sh"
    aws_profile_ensure || exit 1
  fi

  WORK="$(mktemp -d)"

  ETAG="$(aws "${AWS_ARGS[@]+"${AWS_ARGS[@]}"}" cloudfront describe-function \
    --name "$FUNCTION_NAME" --stage LIVE --query 'ETag' --output text 2>/dev/null || true)"
  if [[ -z "$ETAG" || "$ETAG" == "None" ]]; then
    echo "ERROR: could not read the ETag for function '$FUNCTION_NAME'." >&2
    echo "       The function must exist and be published before it can be tested." >&2
    exit 1
  fi

  echo "== cutover notice: function test (${FUNCTION_NAME}, LIVE stage) =="
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
      --event-object "fileb://${event}" --stage LIVE \
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

  # One probe that never aborts the run: the body is discarded, the -w format
  # is written to PROBE_OUT and curl's own exit status to PROBE_RC, so a name
  # that does not resolve becomes an expectation the verdict can read rather
  # than an exit under set -e.
  probe() {
    PROBE_RC=0
    PROBE_OUT="$(curl -s -o /dev/null -w "$2" --max-time 15 "$1")" || PROBE_RC=$?
  }

  if [[ "$EXPECT" == "notice" ]]; then
    # Preview is the control during the window, and it is the assertion that
    # makes this check worth running then: it is what proves the notice is
    # per-hostname rather than a blanket outage.
    preview_status="$(status_of "https://preview.footbag.org/events")"
    if [[ "$preview_status" == "200" ]]; then
      pass "preview page path: 200 (the real site, through the window)"
    else
      fail "preview page path: expected 200, got ${preview_status}; preview must serve the platform while the notice is up"
    fi
  else
    # At launch the preview record is removed before this check runs, so the
    # launched state is a preview name with no DNS record. curl's own exit 6
    # (could not resolve host) is the only outcome that proves it: an answer of
    # any status means the record is still published, and any other failure (a
    # timeout, a refused connection) means the name still resolves to an
    # address, so both fail.
    probe "https://preview.footbag.org/events" '%{http_code}'
    if [[ "$PROBE_RC" == "6" ]]; then
      pass "preview: the name no longer resolves (its record is removed at launch)"
    elif [[ "$PROBE_RC" == "0" ]]; then
      fail "preview: expected no DNS record after launch, but it answered ${PROBE_OUT}"
    else
      fail "preview: expected no DNS record after launch, but curl failed with exit ${PROBE_RC} rather than a resolution failure, so the name still resolves"
    fi
  fi

  # The apex redirect is the same with the notice up and down, so it is held to
  # the same expectation in both states. It is probed with a path and a query
  # string, because a redirect that sends every visitor to the www home page,
  # or drops the query, still answers 301: only the Location shows that the
  # address the visitor typed survives the hop.
  apex_path="/events/year/2025"
  apex_query="cutover-probe=1"
  apex_want="https://www.footbag.org${apex_path}?${apex_query}"
  probe "https://footbag.org${apex_path}?${apex_query}" '%{http_code} %{redirect_url}'
  apex_status="${PROBE_OUT%% *}"
  apex_location="${PROBE_OUT#* }"
  if [[ "$PROBE_RC" != "0" ]]; then
    fail "apex: the request failed (curl exit ${PROBE_RC})"
  elif [[ "$apex_status" != "301" ]]; then
    fail "apex: expected 301, got ${apex_status}"
  elif [[ "$apex_location" != "$apex_want" ]]; then
    fail "apex: expected a 301 to ${apex_want}, got a 301 to '${apex_location}'"
  else
    pass "apex: 301 to ${apex_want} (path and query carried to www, unaffected by the notice)"
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
