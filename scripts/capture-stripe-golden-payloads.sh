#!/usr/bin/env bash
# capture-stripe-golden-payloads.sh
#
# Captures real Stripe test-mode events into the committed golden-payload set
# (tests/fixtures/stripeGoldenPayloads.json), which the replay suite drives
# through the real webhook handlers.
#
# Why this exists. The stub payment adapter was written from the same
# assumptions as the handlers, so it cannot catch a field the provider moved or
# never sent; that class of defect has already passed the whole suite twice. The
# only remedy is the provider's own events, and they exist only while the
# test-mode exercise runs on pre-cutover production. Saving them by hand from
# the Dashboard is the step most likely to commit a donor's name, address or
# card digits to a public repository, so the capture is a script: it reads each
# named event from the API, and the sanitiser (scripts/lib/stripe-golden-sanitise.ts)
# rewrites every identifier to a synthetic one, nulls every personal field,
# link and secret, keeps the structure whole, and refuses a batch it cannot
# prove clean. The script shows the change to the committed set and writes it
# only on a typed APPLY.
#
# What it refuses:
#   - any target but production, where the only live adapter runs;
#   - a live key, a restricted live key, or anything that is not a Stripe key;
#   - an event marked live, or one sent at an API version other than the one the
#     activation script pins, because a payload from another version proves the
#     handlers read a shape the provider no longer sends;
#   - running without a terminal, because it reads a key;
#   - writing without a typed APPLY.
# It calls only GET /v1/events and GET /v1/events/{id}, so it changes nothing
# at the provider.
#
# Usage (from the repository root, in a real terminal):
#   scripts/capture-stripe-golden-payloads.sh --target production \
#     --list --since 2026-11-20
#   scripts/capture-stripe-golden-payloads.sh --target production \
#     --manifest <file> --out tests/fixtures/stripeGoldenPayloads.json
#   ... --dry-run    print what would run; no key read, no call made
#
# --list prints each event since the date, or the UTC time (YYYY-MM-DDTHH:MM:SSZ),
# with its id, type, created, api_version and livemode and no body, so the
# operator can write the manifest.
#
# The manifest names one event per line, in the order its sequence replays:
#   event id | what it shows | processed, duplicate or ignored | sequence group
# Blank lines and lines starting with # are skipped. Capture each sequence group
# whole, in one run: identifiers are rewritten once per run, so a group split
# across runs would no longer link up. A run replaces every committed entry of
# each group it names and keeps every other group as it was.
#
# The test key is in the Stripe Dashboard, in the sandbox, under Developers,
# API keys; it is read from the terminal, never argv, and lives only in a
# mode-0600 curl config shredded when the run ends.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=lib/closing-report.sh
source "$REPO_ROOT/scripts/lib/closing-report.sh"
# Sourced for confirm_from_tty, and for its unconditional ASSUME_YES assignment:
# no environment variable can stand in for the typed confirmation.
# shellcheck source=lib/host-env-remote.sh
source "$REPO_ROOT/scripts/lib/host-env-remote.sh"

TARGET=""
SINCE=""
LIST=0
MANIFEST=""
OUT=""
DRY_RUN=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)   TARGET="${2:-}";   shift 2 || cr_die "--target requires an argument" ;;
    --since)    SINCE="${2:-}";    shift 2 || cr_die "--since requires a date" ;;
    --manifest) MANIFEST="${2:-}"; shift 2 || cr_die "--manifest requires a file" ;;
    --out)      OUT="${2:-}";      shift 2 || cr_die "--out requires a file" ;;
    --list)     LIST=1; shift ;;
    --dry-run)  DRY_RUN=1; shift ;;
    -h|--help)  usage ;;
    *)          echo "ERROR: unknown argument: $1" >&2; usage ;;
  esac
done

[[ "$TARGET" == "production" ]] \
  || cr_die "--target must be production: the live payment adapter runs nowhere else, so no other environment's events are the provider's"

if (( LIST )); then
  [[ -n "$SINCE" ]] || cr_die "--list needs --since <YYYY-MM-DD>"
  [[ -z "$MANIFEST" && -z "$OUT" ]] || cr_die "--list reads only; it takes no --manifest or --out"
else
  [[ -n "$MANIFEST" && -n "$OUT" ]] || cr_die "a capture needs both --manifest <file> and --out <file> (or --list to see the events)"
  [[ -r "$MANIFEST" ]] || cr_die "cannot read the manifest: $MANIFEST"
  [[ -d "$(dirname "$OUT")" ]] || cr_die "the directory for --out does not exist: $(dirname "$OUT")"
fi

SINCE_EPOCH=""
if [[ -n "$SINCE" ]]; then
  [[ "$SINCE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)?$ ]] \
    || cr_die "--since must be YYYY-MM-DD or a UTC time YYYY-MM-DDTHH:MM:SSZ, not '$SINCE'"
  SINCE_EPOCH="$(date -u -d "$SINCE" +%s 2>/dev/null)" || cr_die "--since is not a real date: $SINCE"
fi

command -v jq >/dev/null || cr_die "jq is required"

# Test seam. A stubbed run proves nothing about the account, so it says so.
CURL_BIN="${FOOTBAG_STRIPE_CAPTURE_CURL_BIN:-curl}"
if [[ -n "${FOOTBAG_STRIPE_CAPTURE_CURL_BIN:-}" ]]; then
  echo "SYNTHETIC: a test seam is in use -- this run proves nothing about the account." >&2
fi
command -v "$CURL_BIN" >/dev/null || cr_die "curl is required"

# The pin comes from the activation script, the single source for it, so the
# capture and the endpoint can never be checked against two different versions.
API_VERSION="$(grep '^STRIPE_API_VERSION=' "$REPO_ROOT/scripts/activate-payments.sh" | cut -d'"' -f2)"
[[ -n "$API_VERSION" ]] || cr_die "could not read the pinned API version from the activation script"

EVENT_IDS=()
if (( ! LIST )); then
  # Only the ids are read here; the sanitiser parses and checks the whole manifest.
  while IFS= read -r id; do EVENT_IDS+=("$id"); done \
    < <(grep -vE '^[[:space:]]*(#|$)' "$MANIFEST" | cut -d'|' -f1 | sed -E 's/[[:space:]]+//g')
  (( ${#EVENT_IDS[@]} > 0 )) || cr_die "the manifest names no events"
  for id in "${EVENT_IDS[@]}"; do
    [[ "$id" =~ ^evt_[A-Za-z0-9]+$ ]] || cr_die "the manifest names '$id', which is not an event id"
  done
fi

echo "== Stripe golden-payload capture: $TARGET (test mode) =="
echo "  pinned API version: $API_VERSION"
if (( LIST )); then
  echo "  listing events created since $SINCE"
else
  echo "  events named:       ${#EVENT_IDS[@]}"
  echo "  committed set:      $OUT"
fi
if (( DRY_RUN )); then
  echo ""
  echo "Dry run: no key read, no call made, nothing written."
  cr_proved "the arguments and the manifest's event ids are well formed"
  cr_unproved "anything at the provider: a dry run reads no key and makes no call"
  cr_finish
fi

# The key may come from the environment only when the curl seam has replaced the
# real binary, so no key reaches Stripe on this path. Gating on the seam, not on
# the value, means an exported variable alone cannot skip the prompt.
SYNTHETIC_KEY=""
if [[ -n "${FOOTBAG_STRIPE_CAPTURE_CURL_BIN:-}" ]]; then
  SYNTHETIC_KEY="${FOOTBAG_STRIPE_CAPTURE_KEY_VALUE:-}"
fi
if [[ -z "$SYNTHETIC_KEY" ]] && ! { true >/dev/tty; } 2>/dev/null; then
  cr_die "no terminal: this reads a Stripe key, which is never taken from a captured stream. Run it from an interactive shell."
fi

umask 077
WORK="$(mktemp -d)"
# Cleanups run newest first: every file is shredded, then the directory goes.
cr_cleanup rm -rf "$WORK"
cr_cleanup find "$WORK" -type f -exec shred -u {} +

if [[ -n "$SYNTHETIC_KEY" ]]; then
  STRIPE_KEY="$SYNTHETIC_KEY"
else
  printf 'The test secret key, starting sk_test_, is in the Stripe Dashboard, in the sandbox,\n' > /dev/tty
  printf 'under Developers, API keys. Paste it; it is used for this run only.\n' > /dev/tty
  printf 'Stripe test secret key (input hidden): ' > /dev/tty
  read -rs STRIPE_KEY < /dev/tty
  printf '\n' > /dev/tty
fi

case "$STRIPE_KEY" in
  sk_test_*|rk_test_*) ;;
  sk_live_*|rk_live_*) unset STRIPE_KEY; cr_die "that is a live key. Golden payloads are captured from test mode only; nothing was read." ;;
  *)                   unset STRIPE_KEY; cr_die "that is not a Stripe secret key; nothing was read." ;;
esac

printf 'user = "%s:"\n' "$STRIPE_KEY" > "$WORK/curlrc"
unset STRIPE_KEY

# stripe_get <url> <output file> [curl args...]: one read, refused on a
# transport failure or an error the provider reports.
stripe_get() {
  local url="$1" out="$2"
  shift 2
  # Nothing a run calls may read the terminal, which holds the operator's APPLY.
  if ! "$CURL_BIN" -s -G --config "$WORK/curlrc" "$url" "$@" -o "$out" </dev/null; then
    cr_die "the request to $url failed before Stripe answered"
  fi
  local err
  err="$(jq -r '.error.message // empty' "$out" 2>/dev/null)" || cr_die "Stripe's answer from $url is not JSON"
  [[ -z "$err" ]] || cr_die "Stripe refused $url: $err"
}

if (( LIST )); then
  COUNT=0
  AFTER=""
  printf '%s\t%s\t%s\t%s\t%s\n' id type created api_version livemode
  while :; do
    PAGE_ARGS=(--data-urlencode "limit=100" --data-urlencode "created[gte]=$SINCE_EPOCH")
    [[ -n "$AFTER" ]] && PAGE_ARGS+=(--data-urlencode "starting_after=$AFTER")
    stripe_get https://api.stripe.com/v1/events "$WORK/page.json" "${PAGE_ARGS[@]}"
    jq -r '.data[] | [.id, .type, (.created | todate), .api_version, (.livemode | tostring)] | @tsv' "$WORK/page.json"
    COUNT=$(( COUNT + $(jq -r '.data | length' "$WORK/page.json") ))
    [[ "$(jq -r '.has_more' "$WORK/page.json")" == "true" ]] || break
    AFTER="$(jq -r '.data[-1].id' "$WORK/page.json")"
  done
  cr_proved "listed $COUNT events created since $SINCE"
  cr_finish
fi

mkdir "$WORK/events"
for id in "${EVENT_IDS[@]}"; do
  stripe_get "https://api.stripe.com/v1/events/$id" "$WORK/events/$id.json"
  [[ "$(jq -r '.livemode' "$WORK/events/$id.json")" == "false" ]] \
    || cr_die "$id is not a test-mode event: a live event is real money and is never committed. Nothing was written."
  got_version="$(jq -r '.api_version' "$WORK/events/$id.json")"
  [[ "$got_version" == "$API_VERSION" ]] \
    || cr_die "$id was sent at API version $got_version, and the adapter pins $API_VERSION. A payload from another version proves nothing about the shape the handlers read. Nothing was written."
done
echo "Read ${#EVENT_IDS[@]} events; each is test mode at $API_VERSION."

EXISTING="$OUT"
[[ -e "$OUT" ]] || EXISTING="$WORK/none.json"
# The capture day is today's, except under the curl seam, where a test may fix
# it so a repeat run is compared on its events rather than on the clock.
CAPTURED_AT="$(date -u +%Y-%m-%d)"
if [[ -n "${FOOTBAG_STRIPE_CAPTURE_CURL_BIN:-}" && -n "${FOOTBAG_STRIPE_CAPTURE_DATE:-}" ]]; then
  CAPTURED_AT="$FOOTBAG_STRIPE_CAPTURE_DATE"
fi
if ! "$REPO_ROOT/node_modules/.bin/tsx" "$REPO_ROOT/scripts/lib/stripe-golden-sanitise.ts" \
    --manifest "$MANIFEST" --events-dir "$WORK/events" --existing "$EXISTING" \
    --captured-at "$CAPTURED_AT" --out "$WORK/new.json" </dev/null; then
  cr_die "the sanitiser refused the batch (its reason is above). Nothing was written."
fi

echo ""
echo "Change to $OUT:"
if [[ -e "$OUT" ]]; then
  diff_rc=0
  diff -u "$OUT" "$WORK/new.json" || diff_rc=$?
  (( diff_rc <= 1 )) || cr_die "could not compare the new set with $OUT"
  if (( diff_rc == 0 )); then
    cr_proved "the captured events match what is already committed; nothing to write"
    cr_finish
  fi
else
  sed 's/^/+ /' "$WORK/new.json"
fi
echo ""
echo "APPLY writes the sanitised set above to $OUT. Nothing is committed: review"
echo "the diff and commit it yourself."
if ! confirm_from_tty "Type 'APPLY' to write it: " "APPLY"; then
  cr_die "not confirmed; nothing was written"
fi
cat "$WORK/new.json" > "$OUT"
cr_proved "${#EVENT_IDS[@]} test-mode events at $API_VERSION were sanitised, checked clean and written to $OUT"
cr_unproved "that the handlers accept them: run the golden-payload replay suite (tests/integration/stripeGoldenPayloads.replay.test.ts)"
cr_finish
