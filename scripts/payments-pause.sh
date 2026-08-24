#!/usr/bin/env bash
# payments-pause.sh
#
# The fast stop for payments. Sets or clears the platform's payments_paused
# runtime switch on a deployed host, and prints what the switch reads
# afterwards.
#
# WHAT IT STOPS, AND WHAT IT DOES NOT.
#
# Paused, the platform refuses to start any new membership purchase or donation:
# the check runs before the eligibility test, before the throttle bucket, and
# before any call reaches the provider, so a paused platform opens no checkout
# session at all. It keeps processing webhooks, which is deliberate. Money
# already in flight when the switch went on still settles, still grants the tier
# it paid for, and still sends its receipt. Stopping that too would take a
# payment from a member and give them nothing.
#
# It is therefore the right lever for "something is wrong, stop taking money"
# and the wrong lever for "the provider itself is the problem". The full stop is
# disarming (scripts/arming.sh --state dark), which swaps the live adapter out
# entirely; it takes a few minutes, requires the provider's webhook endpoint be
# disabled first, and is a deploy. Reach for this one first: it is seconds, and
# it is reversible with the same command.
#
# WHY A SCRIPT AND NOT A BUTTON.
#
# The application has no write path to this switch and none is planned. Halting
# live payments is a System Administrator action, not something an application
# administrator does from a browser, and the design says so twice. Until this
# script existed the switch was readable and unwritable, which meant the
# documented kill switch could only be pulled by hand-writing SQL into the
# production database during an incident. That is what this replaces.
#
# The admin payments-health page shows the switch's state and names this script
# as what clears it, so an administrator who sees a paused platform knows what
# happened and who can undo it.
#
# HOW IT WRITES.
#
# The configuration table is append-only, enforced by database triggers, so each
# pause and each resume inserts a newer effective row rather than overwriting
# the last one. The history of every flip stays on the table, with the reason
# given, as its own audit trail. The value the platform acts on is read back
# from the same view the application reads, so what this prints is what is
# actually in force.
#
# Usage:
#   < ~/.footbag/operator-sudo bash scripts/payments-pause.sh --target production --status
#   < ~/.footbag/operator-sudo bash scripts/payments-pause.sh --target production --pause  --reason "duplicate charges reported"
#   < ~/.footbag/operator-sudo bash scripts/payments-pause.sh --target production --resume --reason "fixed in 1a2b3c4"
#   ... --pause --yes        skip the confirmation prompt (for a scripted incident response)
#   ... --actor <member-id>  record who flipped it, so the platform's own
#                            configuration history answers that question rather
#                            than it falling back to host access logs
#
# The host sudo password arrives on stdin, as with every other operator script
# here, so nothing secret reaches an argument list on either machine.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/payments-pause-remote.sh"
DB_FILE_DEFAULT="/srv/footbag/db/footbag.db"

TARGET="production"
ACTION=""
REASON=""
ACTOR=""
ASSUME_YES="no"
DB_FILE="${DB_FILE_DEFAULT}"

die() { echo "payments-pause: $*" >&2; exit 1; }

usage() {
  sed -n '2,55p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 ;;
    --status)  ACTION="status"; shift ;;
    --pause)   ACTION="pause";  shift ;;
    --resume)  ACTION="resume"; shift ;;
    --reason)  REASON="${2:-}"; shift 2 ;;
    --actor)   ACTOR="${2:-}"; shift 2 ;;
    --db-file) DB_FILE="${2:-}"; shift 2 ;;
    --yes)     ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) die "unknown argument '$1' (try --help)" ;;
  esac
done

[[ -n "$ACTION" ]] || die "one of --status, --pause or --resume is required"
[[ "$TARGET" == "production" || "$TARGET" == "staging" ]] \
  || die "--target must be production or staging (got '${TARGET}')"

if [[ "$ACTION" != "status" && -z "$REASON" ]]; then
  # The reason lands on the permanent config row and is the only thing that
  # tells the next person why payments stopped. An incident is exactly when
  # nobody remembers, so it is required rather than defaulted.
  die "--reason is required when pausing or resuming; it is recorded permanently"
fi

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/payments-pause.sh --target ${TARGET} ${ACTION}" || exit 1

if [[ "$ACTION" != "status" ]]; then
  verb="pause"; [[ "$ACTION" == "resume" ]] && verb="resume"
  echo ""
  if [[ "$ACTION" == "pause" ]]; then
    echo "About to PAUSE payments on ${TARGET}."
    echo "  New purchases and donations will be refused immediately."
    echo "  Payments already in flight will still settle, and webhooks keep processing."
    echo "  This does NOT disarm the live adapter; use scripts/arming.sh for that."
  else
    echo "About to RESUME payments on ${TARGET}."
    echo "  New purchases and donations will be accepted again immediately."
  fi
  echo "  Reason recorded: ${REASON}"
  echo ""
  confirm_from_tty "Type ${TARGET} to ${verb}: " "$TARGET" \
    || die "not confirmed; nothing was changed"
fi

result=""
# The remote half writes progress to stderr and only the PAYMENTS_PAUSED line to
# stdout, so a diagnostic can never be mistaken for the value.
if ! result="$(
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'DB_FILE=%q\n' "$DB_FILE"
    printf 'ACTION=%q\n' "$ACTION"
    printf 'REASON=%q\n' "${REASON:-status read}"
    printf 'ACTOR=%q\n' "${ACTOR:-}"
    cat "$REMOTE_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
)"; then
  die "the remote step failed; nothing is assumed about the switch state"
fi

state="$(printf '%s\n' "$result" | sed -n 's/^PAYMENTS_PAUSED=//p' | tail -1)"
[[ -n "$state" ]] || die "the host did not report a switch state"

echo ""
if [[ "$state" == "1" ]]; then
  echo "payments on ${TARGET}: PAUSED"
  echo "  New purchases and donations are being refused."
  echo "  Webhooks are still processed, so in-flight payments settle normally."
  echo "  Clear it with: scripts/payments-pause.sh --target ${TARGET} --resume --reason '...'"
else
  echo "payments on ${TARGET}: LIVE"
  echo "  New purchases and donations are being accepted."
  echo "  Stop them with: scripts/payments-pause.sh --target ${TARGET} --pause --reason '...'"
fi
echo ""
echo "The admin payments-health page shows this same state at /admin/payments/health."
