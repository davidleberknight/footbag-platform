#!/usr/bin/env bash
# create-stripe-endpoint.sh
#
# Creates the Stripe webhook endpoint for an environment through the Stripe API,
# rather than through the Dashboard's event picker.
#
# Why this exists as a script rather than a documented set of commands: the
# picker is the one un-scripted step in an otherwise scripted activation, and it
# is the step most able to fail silently. It asks a human to select thirteen
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
#
# --mode is the money-safety floor: it is checked against the key's own prefix,
# so a test key cannot create the live endpoint and a live key cannot quietly
# create a rehearsal one.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=""
MODE=""
DRY_RUN=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --mode)    MODE="${2:-}";   shift 2 || { echo "ERROR: --mode requires live or test" >&2; exit 2; } ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage ;;
    *)         echo "ERROR: unknown argument: $1" >&2; usage ;;
  esac
done

[[ "$TARGET" == "production" || "$TARGET" == "staging" ]] || {
  echo "ERROR: --target must be production or staging." >&2; exit 2; }
[[ "$MODE" == "live" || "$MODE" == "test" ]] || {
  echo "ERROR: --mode must be live or test." >&2; exit 2; }

command -v jq   >/dev/null || { echo "ERROR: jq is required." >&2; exit 1; }
command -v curl >/dev/null || { echo "ERROR: curl is required." >&2; exit 1; }

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
DOMAIN="$(terraform -chdir="$REPO_ROOT/terraform/$TARGET" output -raw cloudfront_domain 2>/dev/null || true)"
[[ -n "$DOMAIN" ]] || { echo "ERROR: could not read cloudfront_domain from terraform output for $TARGET." >&2; exit 1; }
URL="https://${DOMAIN}/payments/webhook"

echo "== create Stripe webhook endpoint: $TARGET ($MODE mode) =="
echo "  url:     $URL"
echo "  version: $API_VERSION"
echo "  events:  $(printf '%s\n' $EVENTS | wc -l)"
if (( DRY_RUN )); then
  echo ""
  printf '%s\n' $EVENTS | sed 's/^/    /'
  echo ""
  echo "Dry run: no key read, no call made, nothing created."
  exit 0
fi

if ! { true >/dev/tty; } 2>/dev/null; then
  echo "ERROR: no terminal. This reads a secret key and prints a signing secret," >&2
  echo "       so it refuses to run where either could land in a captured stream." >&2
  exit 1
fi

umask 077
WORK="$(mktemp -d)"
cleanup() {
  find "$WORK" -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

printf 'Stripe secret key for %s mode (input hidden): ' "$MODE" > /dev/tty
read -rs STRIPE_KEY < /dev/tty
printf '\n' > /dev/tty

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
curl -s --config "$WORK/curlrc" https://api.stripe.com/v1/webhook_endpoints -o "$WORK/existing.json"
if [[ "$(jq -r '.error.message // empty' "$WORK/existing.json")" != "" ]]; then
  echo "ERROR from Stripe listing endpoints:" >&2
  jq -r '.error.message' "$WORK/existing.json" >&2
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

curl -s --config "$WORK/curlrc" https://api.stripe.com/v1/webhook_endpoints \
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
