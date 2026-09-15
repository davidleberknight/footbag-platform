#!/usr/bin/env bash
# create-stripe-endpoint.sh
#
# Creates the Stripe webhook endpoint for an environment through the Stripe API,
# rather than through the Dashboard's event picker.
#
# Why this exists as a script rather than a documented set of commands: the
# picker is the one un-scripted step in an otherwise scripted activation, and it
# is the step most able to fail silently. It asks a human to select eighteen
# events from a list whose near-misses sit directly beside the ones wanted (a
# dispute *updated* event, an invoice *paid* event, a payment-intent *canceled*
# event). A subscription narrower than the dispatcher expects means money moves
# and nothing records it: the payment row simply never leaves pending, with
# nothing errored anywhere.
#
# One API call sets the URL, the API version and every event at once, and the
# result is then diffed against the activation script's own REQUIRED_WEBHOOK_EVENTS
# so the registered set is proved equal to the dispatcher's rather than merely
# the right length.
#
# --verify exists because that diff used to happen once and never again. It ran
# against the creation call's own response, so it proved what Stripe had just
# echoed back and nothing afterwards: an endpoint edited in the Dashboard, or
# left behind by a code change that added an event, both passed unnoticed. The
# repository's own test proves the service constant, the dispatcher's switch and
# the copy in the activation script agree with one another, but all three are
# local files and none of them is the copy that decides what Stripe delivers.
# --verify reads the endpoint that actually exists and diffs that.
#
# --repair corrects a short event set through this script rather than by hand,
# so the fix is a tested path with the correction proved by re-reading the
# endpoint afterwards instead of trusting the write. It refuses to touch an
# endpoint whose API version disagrees with the pin: payload shapes are
# version-specific, so that disagreement is a decision, not a repair.
#
# The secret key is read from the terminal, never a file and never argv, and is
# unset as soon as the curl config is built. The signing secret the call returns
# is printed to /dev/tty, so a caller who redirects stdout collects the
# surrounding prose and never the secret. That secret goes straight into the
# activation script's prompt; it is readable again from the Dashboard afterwards,
# so nothing is lost by not saving it.
#
# Usage (run from the repository root, in a real terminal):
#   scripts/create-stripe-endpoint.sh --target production --mode live
#   scripts/create-stripe-endpoint.sh --target production --mode test
#   scripts/create-stripe-endpoint.sh --target production --mode live --dry-run
#   scripts/create-stripe-endpoint.sh --target production --mode live --verify
#   scripts/create-stripe-endpoint.sh --target production --mode live --verify --repair
#
# --verify changes nothing and exits non-zero on any disagreement, so it can be
# used as a gate. --repair is only meaningful alongside it.
#
# --mode is the money-safety floor: it is checked against the key's own prefix,
# so a test key cannot create the live endpoint and a live key cannot quietly
# create a rehearsal one.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Sourced for confirm_from_tty, which --repair uses, and for the unconditional
# ASSUME_YES assignment it carries: a guard an exported environment variable can
# satisfy is not a guard, so the library overwrites it and every caller parses
# its own flags afterwards. This file does exactly that, below.
source "$REPO_ROOT/scripts/lib/host-env-remote.sh"

TARGET=""
MODE=""
DRY_RUN=0
VERIFY=0
REPAIR=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --mode)    MODE="${2:-}";   shift 2 || { echo "ERROR: --mode requires live or test" >&2; exit 2; } ;;
    --dry-run) DRY_RUN=1; shift ;;
    --verify)  VERIFY=1; shift ;;
    --repair)  REPAIR=1; shift ;;
    --yes)     ASSUME_YES="yes"; shift ;;
    -h|--help) usage ;;
    *)         echo "ERROR: unknown argument: $1" >&2; usage ;;
  esac
done

[[ "$TARGET" == "production" || "$TARGET" == "staging" ]] || {
  echo "ERROR: --target must be production or staging." >&2; exit 2; }
[[ "$MODE" == "live" || "$MODE" == "test" ]] || {
  echo "ERROR: --mode must be live or test." >&2; exit 2; }

# --repair alone would read as "create, and also repair", which is two different
# writes to the same account. It only ever means "fix what --verify just found".
if (( REPAIR )) && (( ! VERIFY )); then
  echo "ERROR: --repair only applies alongside --verify." >&2
  exit 2
fi

command -v jq   >/dev/null || { echo "ERROR: jq is required." >&2; exit 1; }
command -v curl >/dev/null || { echo "ERROR: curl is required." >&2; exit 1; }

# Test seams. A stubbed run proves nothing about the account, so it says so.
CURL_BIN="${FOOTBAG_STRIPE_ENDPOINT_CURL_BIN:-curl}"
TF_BIN="${FOOTBAG_STRIPE_ENDPOINT_TF_BIN:-terraform}"
if [[ -n "${FOOTBAG_STRIPE_ENDPOINT_CURL_BIN:-}${FOOTBAG_STRIPE_ENDPOINT_TF_BIN:-}" ]]; then
  echo "SYNTHETIC: a test seam is in use -- this run proves nothing about the account." >&2
fi

# Both facts come from the activation script, which is the single source for the
# pinned version and the dispatcher's event list. Reading them here rather than
# restating them is what keeps the endpoint and the code from drifting apart.
ACTIVATE="$REPO_ROOT/scripts/activate-payments.sh"
API_VERSION="$(grep '^STRIPE_API_VERSION=' "$ACTIVATE" | cut -d'"' -f2)"
EVENTS="$(grep '^REQUIRED_WEBHOOK_EVENTS=' "$ACTIVATE" | cut -d'"' -f2)"
[[ -n "$API_VERSION" && -n "$EVENTS" ]] || {
  echo "ERROR: could not read the pinned API version and event list from the activation script." >&2
  exit 1; }

# The distribution domain is a terraform output rather than a literal, so this
# cannot be pointed at a stale host. A wrong URL fails silently at delivery time.
DOMAIN="$("$TF_BIN" -chdir="$REPO_ROOT/terraform/$TARGET" output -raw cloudfront_domain 2>/dev/null || true)"
[[ -n "$DOMAIN" ]] || { echo "ERROR: could not read cloudfront_domain from terraform output for $TARGET." >&2; exit 1; }
URL="https://${DOMAIN}/payments/webhook"

# The endpoint is registered against the distribution's own name while the
# environment is pre-live, and the cutover re-points it at the published domain.
# Both are this environment's webhook, so verification accepts either: pinning
# only the first meant the gate that names --verify could never pass once the
# re-point had happened. Creation still uses the distribution name above, which
# is the only one that resolves here before the zone move.
#
# The published origin comes from terraform's own `platform_url` output rather
# than being rebuilt here. That output is the canonical origin the site is served
# at: the distribution's own name while the custom-domain flag is off, the `www`
# host once it is on, following the same flag that moves the site. Its own
# description carries the reason the apex form is wrong and would be easy to
# reconstruct by mistake: the apex only 301s to www, and the provider counts a
# redirect as a failed delivery.
PLATFORM_URL="$("$TF_BIN" -chdir="$REPO_ROOT/terraform/$TARGET" output -raw platform_url 2>/dev/null || true)"
CANONICAL_URL=""
[[ -n "$PLATFORM_URL" ]] && CANONICAL_URL="${PLATFORM_URL%/}/payments/webhook"

if (( VERIFY )); then
  ACTION_LABEL="verify"
  DRY_RUN_TAIL="nothing read."
else
  ACTION_LABEL="create"
  DRY_RUN_TAIL="nothing created."
fi

echo "== $ACTION_LABEL Stripe webhook endpoint: $TARGET ($MODE mode) =="
echo "  url:     $URL"
echo "  version: $API_VERSION"
echo "  events:  $(printf '%s\n' $EVENTS | wc -l)"
if (( DRY_RUN )); then
  echo ""
  printf '%s\n' $EVENTS | sed 's/^/    /'
  echo ""
  echo "Dry run: no key read, no call made, $DRY_RUN_TAIL"
  exit 0
fi

# The key may come from the environment only when the curl seam has replaced the
# real binary, so no key can reach Stripe on this path and there is nothing for a
# terminal to protect. Gating on the seam rather than on the value means an
# exported variable alone cannot bypass the prompt against the real account.
SYNTHETIC_KEY=""
if [[ -n "${FOOTBAG_STRIPE_ENDPOINT_CURL_BIN:-}" ]]; then
  SYNTHETIC_KEY="${FOOTBAG_STRIPE_ENDPOINT_KEY_VALUE:-}"
fi

if [[ -z "$SYNTHETIC_KEY" ]] && ! { true >/dev/tty; } 2>/dev/null; then
  echo "ERROR: no terminal. This reads a secret key, and the creating path prints" >&2
  echo "       a signing secret, so it refuses to run where either could land in" >&2
  echo "       a captured stream." >&2
  exit 1
fi

umask 077
WORK="$(mktemp -d)"
cleanup() {
  find "$WORK" -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

if [[ -n "$SYNTHETIC_KEY" ]]; then
  STRIPE_KEY="$SYNTHETIC_KEY"
else
  printf 'Stripe secret key for %s mode (input hidden): ' "$MODE" > /dev/tty
  read -rs STRIPE_KEY < /dev/tty
  printf '\n' > /dev/tty
fi

# Restricted keys are rejected here for the same reason the activation script
# rejects them: they cannot carry the whole activation, and finding out later
# means finding out mid-procedure.
case "$STRIPE_KEY" in
  sk_live_*) KEY_MODE="live" ;;
  sk_test_*) KEY_MODE="test" ;;
  rk_*)      echo "ERROR: restricted keys are not accepted; use the standard secret key." >&2; exit 1 ;;
  *)         echo "ERROR: that is not a Stripe secret key." >&2; exit 1 ;;
esac
if [[ "$KEY_MODE" != "$MODE" ]]; then
  echo "ERROR: --mode $MODE was given but the key is a $KEY_MODE key. Refusing." >&2
  exit 1
fi

printf 'user = "%s:"\n' "$STRIPE_KEY" > "$WORK/curlrc"
unset STRIPE_KEY

# Stripe delivers every event to every enabled destination, so a second enabled
# endpoint silently takes a copy of all traffic. Listing first costs one call.
"$CURL_BIN" -s --config "$WORK/curlrc" https://api.stripe.com/v1/webhook_endpoints -o "$WORK/existing.json"
if [[ "$(jq -r '.error.message // empty' "$WORK/existing.json")" != "" ]]; then
  echo "ERROR from Stripe listing endpoints:" >&2
  jq -r '.error.message' "$WORK/existing.json" >&2
  exit 1
fi

if (( VERIFY )); then
  ENABLED_COUNT="$(jq -r '[.data[] | select(.status=="enabled")] | length' "$WORK/existing.json")"
  if [[ "$ENABLED_COUNT" == "0" ]]; then
    echo "FAIL: no enabled webhook endpoint exists in this account." >&2
    echo "      Nothing is receiving events at all." >&2
    exit 1
  fi
  if [[ "$ENABLED_COUNT" != "1" ]]; then
    echo "FAIL: $ENABLED_COUNT enabled endpoints exist; exactly one is expected." >&2
    jq -r '.data[] | select(.status=="enabled") | "  \(.id)  \(.url)"' "$WORK/existing.json" >&2
    echo "      Every enabled endpoint receives a copy; disable the extras first." >&2
    exit 1
  fi

  jq -r '[.data[] | select(.status=="enabled")][0]' "$WORK/existing.json" > "$WORK/endpoint.json"
  EP_ID="$(jq -r '.id' "$WORK/endpoint.json")"
  EP_URL="$(jq -r '.url' "$WORK/endpoint.json")"
  EP_VERSION="$(jq -r '.api_version // "unset"' "$WORK/endpoint.json")"

  echo ""
  echo "Registered endpoint:"
  echo "  id:      $EP_ID"
  echo "  url:     $EP_URL"
  echo "  version: $EP_VERSION"
  echo ""

  FAILED=0

  # Compared rather than assumed: an endpoint pointing at a stale distribution
  # receives nothing and still reads as healthy from the account's own list.
  if [[ "$EP_URL" != "$URL" && ( -z "$CANONICAL_URL" || "$EP_URL" != "$CANONICAL_URL" ) ]]; then
    echo "  MISMATCH url: expected $URL" >&2
    [[ -n "$CANONICAL_URL" ]] && echo "                or $CANONICAL_URL after the cutover re-point" >&2
    FAILED=1
  fi

  # Reported, never repaired. Payload shapes are version-specific, so moving an
  # endpoint between versions is a decision someone makes, not a drift to tidy.
  if [[ "$EP_VERSION" != "$API_VERSION" ]]; then
    echo "  MISMATCH api_version: the adapter pins $API_VERSION" >&2
    FAILED=1
  fi

  jq -r '.enabled_events[]' "$WORK/endpoint.json" | sort > "$WORK/got"
  printf '%s\n' $EVENTS | sort > "$WORK/want"

  if [[ "$(cat "$WORK/got")" == "*" ]]; then
    # Stripe's wildcard delivers everything, so nothing is missing; it is still
    # wrong, because the dispatcher's set is the documented contract and a
    # wildcard hides the next addition instead of failing on it.
    echo "  MISMATCH events: the endpoint subscribes to all events (\"*\")" >&2
    echo "    rather than the dispatcher's set. Nothing is dropped, but a future" >&2
    echo "    event this platform does not handle arrives unannounced." >&2
    FAILED=1
  else
    MISSING="$(comm -23 "$WORK/want" "$WORK/got")"
    UNEXPECTED="$(comm -13 "$WORK/want" "$WORK/got")"
    if [[ -n "$MISSING" ]]; then
      echo "  MISSING -- Stripe never delivers these, so nothing records them:" >&2
      printf '%s\n' "$MISSING" | sed 's/^/    /' >&2
      FAILED=1
    fi
    if [[ -n "$UNEXPECTED" ]]; then
      echo "  UNEXPECTED -- registered here but not dispatched by the code:" >&2
      printf '%s\n' "$UNEXPECTED" | sed 's/^/    /' >&2
      FAILED=1
    fi
  fi

  if (( ! FAILED )); then
    echo "  events:  exact match ($(wc -l < "$WORK/got") events)"
    echo ""
    echo "The registered endpoint matches the dispatcher."
    exit 0
  fi

  if (( ! REPAIR )); then
    echo "" >&2
    echo "Re-run with --repair to set the event list to the dispatcher's." >&2
    exit 1
  fi

  # --repair rewrites one field. A url or version disagreement is neither its
  # business nor safe to guess at, and repairing around one would leave the run
  # reporting success over an endpoint that is still wrong.
  if (( FAILED )) && [[ "$EP_VERSION" != "$API_VERSION" ]]; then
    echo "" >&2
    echo "REFUSING to repair: the api_version disagrees, and --repair does not" >&2
    echo "change it. Resolve that first." >&2
    exit 1
  fi
  if [[ "$EP_URL" != "$URL" && ( -z "$CANONICAL_URL" || "$EP_URL" != "$CANONICAL_URL" ) ]]; then
    echo "" >&2
    echo "REFUSING to repair: the url is neither this environment's distribution" >&2
    echo "nor its published name, and --repair does not change it." >&2
    exit 1
  fi

  echo ""
  echo "--repair replaces this endpoint's whole event list with the dispatcher's"
  echo "$(printf '%s\n' $EVENTS | wc -l) events, so anything listed as unexpected above is removed too."
  if ! confirm_from_tty "Type 'APPLY' to continue: " "APPLY"; then
    echo "Not confirmed; nothing was changed." >&2
    exit 1
  fi

  CURL_ARGS=()
  for evt in $EVENTS; do CURL_ARGS+=(-d "enabled_events[]=$evt"); done
  "$CURL_BIN" -s --config "$WORK/curlrc" \
    "https://api.stripe.com/v1/webhook_endpoints/$EP_ID" \
    "${CURL_ARGS[@]}" \
    -o "$WORK/repaired.json"
  if [[ "$(jq -r '.error.message // empty' "$WORK/repaired.json")" != "" ]]; then
    echo "ERROR from Stripe updating the endpoint:" >&2
    jq -r '.error.message' "$WORK/repaired.json" >&2
    exit 1
  fi

  # Re-read rather than diff the update's own response. Trusting what the write
  # echoed back is the exact habit that let this drift go unnoticed for weeks.
  "$CURL_BIN" -s --config "$WORK/curlrc" \
    "https://api.stripe.com/v1/webhook_endpoints/$EP_ID" \
    -o "$WORK/reread.json"
  jq -r '.enabled_events[]' "$WORK/reread.json" | sort > "$WORK/after"
  echo ""
  if diff "$WORK/want" "$WORK/after"; then
    echo "Repaired: the endpoint now carries the dispatcher's event set ($(wc -l < "$WORK/after") events)."
    exit 0
  fi
  echo "ERROR: the endpoint still disagrees after the update; the difference is above." >&2
  exit 1
fi

ENABLED="$(jq -r '[.data[] | select(.status=="enabled")] | length' "$WORK/existing.json")"
if [[ "$ENABLED" != "0" ]]; then
  echo "REFUSING: $ENABLED enabled endpoint(s) already exist in this account:" >&2
  jq -r '.data[] | select(.status=="enabled") | "  \(.id)  \(.url)"' "$WORK/existing.json" >&2
  echo "Disable or delete them first; every enabled endpoint receives every event." >&2
  exit 1
fi

CURL_ARGS=()
for evt in $EVENTS; do CURL_ARGS+=(-d "enabled_events[]=$evt"); done

"$CURL_BIN" -s --config "$WORK/curlrc" https://api.stripe.com/v1/webhook_endpoints \
  -d url="$URL" \
  -d api_version="$API_VERSION" \
  "${CURL_ARGS[@]}" \
  -o "$WORK/created.json"

if [[ "$(jq -r '.error.message // empty' "$WORK/created.json")" != "" ]]; then
  echo "ERROR from Stripe creating the endpoint:" >&2
  jq -r '.error.message' "$WORK/created.json" >&2
  echo "" >&2
  echo "If the pinned API version was rejected as unavailable, do NOT edit the adapter" >&2
  echo "constant to match: it is asserted equal to the version the installed Stripe" >&2
  echo "library pins, so they move together or the suite fails." >&2
  exit 1
fi

echo ""
jq -r '"Created:\n  id:      \(.id)\n  status:  \(.status)\n  url:     \(.url)\n  version: \(.api_version)"' "$WORK/created.json"

echo ""
echo "Registered events vs the dispatcher's list:"
jq -r '.enabled_events[]' "$WORK/created.json" | sort > "$WORK/got"
printf '%s\n' $EVENTS | sort > "$WORK/want"
if diff "$WORK/want" "$WORK/got"; then
  echo "  exact match ($(wc -l < "$WORK/got") events)"
else
  echo "  MISMATCH shown above. The endpoint exists but does not match the dispatcher;" >&2
  echo "  delete it and investigate before activating." >&2
  exit 1
fi

printf '\nSigning secret. It goes straight into the activation prompt; it stays readable\nin the Dashboard, so do not save it anywhere else:\n\n' > /dev/tty
jq -r '"  " + .secret' "$WORK/created.json" > /dev/tty
printf '\n' > /dev/tty

echo ""
echo "Next: scripts/activate-payments.sh --target $TARGET --profile <profile>"
echo "      It prompts for the key and this signing secret, and installs both together."
