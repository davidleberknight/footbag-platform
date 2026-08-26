#!/usr/bin/env bash
# bulk-send-pause.sh
#
# The stop for a bulk send that is going wrong, and nothing else. Sets or clears
# the platform's bulk_send_paused runtime switch on a deployed host, and prints
# what the switch reads afterwards. The third of the runtime levers, alongside
# scripts/payments-pause.sh and scripts/outbound-mail-pause.sh: same arguments,
# same append-only write, same reversal.
#
# WHAT IT STOPS, AND WHAT IT DOES NOT.
#
# Stopped, the outbox worker keeps draining transactional mail and stops
# releasing bulk mail. Verification links, password resets and receipts carry on
# arriving; the newsletter or announcement stops where it is. Queued bulk
# messages stay pending and go out when the switch is cleared.
#
# This is the lever for "call off the send", which during a staged first send to
# the membership is the thing most likely to be needed in a hurry.
#
# WHY NOT THE OUTBOX PAUSE.
#
# scripts/outbound-mail-pause.sh stops everything, including the verification
# mail somebody is waiting on to finish registering. Reaching for it to stop a
# newsletter strands those people for as long as the pause is held. Use this one
# whenever the problem is the bulk send rather than the mail system.
#
# WHY NOT JUST WAIT FOR THE AUTOMATIC HALT.
#
# The platform stops the bulk stream by itself when the bounce or complaint rate
# climbs, and that halt clears itself when the rate falls back. It answers a
# deliverability problem. It cannot answer "the wrong copy went out" or "that
# went to the wrong list", which are decisions, and a decision needs a switch
# somebody clears deliberately.
#
# WHY A SCRIPT AND NOT A BUTTON.
#
# The application reads this switch and has no write path to it, which is the
# rule both sibling switches follow.
#
# HOW IT WRITES.
#
# The configuration table is append-only, enforced by database triggers, so each
# stop and each release inserts a newer effective row rather than overwriting
# the last one. The history of every flip stays on the table, with the reason
# given, as its own audit trail. The value the platform acts on is read back
# from the same view the application reads, so what this prints is what is
# actually in force.
#
# Usage:
#   < ~/.footbag/operator-sudo bash scripts/bulk-send-pause.sh --target production --status
#   < ~/.footbag/operator-sudo bash scripts/bulk-send-pause.sh --target production --pause  --reason "wrong list selected"
#   < ~/.footbag/operator-sudo bash scripts/bulk-send-pause.sh --target production --resume --reason "list corrected"
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

REMOTE_HALF="${SCRIPT_DIR}/internal/runtime-pause-remote.sh"
DB_FILE_DEFAULT="/srv/footbag/db/footbag.db"

TARGET="production"
ACTION=""
REASON=""
ACTOR=""
ASSUME_YES="no"
DB_FILE="${DB_FILE_DEFAULT}"

die() { echo "bulk-send-pause: $*" >&2; exit 1; }

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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
  # tells the next person why the send stopped. Calling one off is exactly when
  # nobody writes it down, so it is required rather than defaulted.
  die "--reason is required when pausing or resuming; it is recorded permanently"
fi

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/bulk-send-pause.sh --target ${TARGET} ${ACTION}" || exit 1

if [[ "$ACTION" != "status" ]]; then
  verb="pause"; [[ "$ACTION" == "resume" ]] && verb="resume"
  echo ""
  if [[ "$ACTION" == "pause" ]]; then
    echo "About to STOP bulk sending on ${TARGET}."
    echo "  The outbox worker stops releasing bulk mail; queued bulk messages are"
    echo "  kept, not discarded, and go out when you resume."
    echo "  Transactional mail is unaffected: verification, password reset and"
    echo "  receipt messages keep going out throughout."
  else
    echo "About to RESUME bulk sending on ${TARGET}."
    echo "  The worker starts releasing bulk mail again, beginning with everything"
    echo "  queued while it was stopped, at the usual paced rate."
  fi
  echo "  Reason recorded: ${REASON}"
  echo ""
  if [[ "$ASSUME_YES" == "yes" ]]; then
    echo "  Confirmation skipped (--yes)."
  else
    confirm_from_tty "Type ${TARGET} to ${verb}: " "$TARGET" \
      || die "not confirmed; nothing was changed"
  fi
fi

result=""
# The remote half writes progress to stderr and only the switch-state line to
# stdout, so a diagnostic can never be mistaken for the value.
if ! result="$(
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'DB_FILE=%q\n' "$DB_FILE"
    printf 'CONFIG_KEY=%q\n' 'bulk_send_paused'
    printf 'ACTION=%q\n' "$ACTION"
    printf 'REASON=%q\n' "${REASON:-status read}"
    printf 'ACTOR=%q\n' "${ACTOR:-}"
    cat "$REMOTE_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
)"; then
  die "the remote step failed; nothing is assumed about the switch state"
fi

state="$(printf '%s\n' "$result" | sed -n 's/^SWITCH_PAUSED=//p' | tail -1)"
[[ -n "$state" ]] || die "the host did not report a switch state"

echo ""
if [[ "$state" == "1" ]]; then
  echo "bulk sending on ${TARGET}: STOPPED"
  echo "  Bulk messages are being kept; transactional mail is still going out."
  echo "  Clear it with: scripts/bulk-send-pause.sh --target ${TARGET} --resume --reason '...'"
else
  echo "bulk sending on ${TARGET}: RELEASING"
  echo "  The worker is releasing bulk mail at the paced rate."
  echo "  Stop it with: scripts/bulk-send-pause.sh --target ${TARGET} --pause --reason '...'"
fi
echo ""
echo "The admin system-health page shows this same state."
