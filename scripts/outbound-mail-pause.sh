#!/usr/bin/env bash
# outbound-mail-pause.sh
#
# The fast stop for outbound mail. Sets or clears the platform's
# email_outbox_paused runtime switch on a deployed host, and prints what the
# switch reads afterwards. The sibling of scripts/payments-pause.sh: same
# arguments, same append-only write, same reversal.
#
# WHAT IT STOPS, AND WHAT IT DOES NOT.
#
# Paused, the outbox worker stops draining. Nothing is sent and nothing is lost:
# every queued message stays pending, and resuming sends them. Enqueuing carries
# on, so a member who registers while mail is paused still has their
# verification email waiting rather than never written at all.
#
# It is therefore the right lever for "stop mail going out while we work out
# what is wrong". Note what that means for anyone mid-registration: their
# verification mail waits with everything else, so a pause held for long enough
# strands them until it is lifted.
#
# WHY THIS AND NOT DISARMING.
#
# Disarming email (scripts/arming.sh --switch email --state dark) is NOT a
# pause. It swaps the live sender for the stub, and the stub reports every send
# as delivered, so the drain marks each queued message sent and clears its body.
# The queue empties, nothing arrives, and there is nothing left to resend. Reach
# for this script whenever the intent is "stop, then continue", and disarm only
# to take the provider integration itself out of the picture.
#
# WHY A SCRIPT AND NOT A BUTTON.
#
# The application reads this switch and has no write path to it. Halting
# outbound mail is a System Administrator action rather than something an
# application administrator does from a browser, which is the same rule the
# payments switch follows.
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
#   < ~/.footbag/operator-sudo bash scripts/outbound-mail-pause.sh --target production --status
#   < ~/.footbag/operator-sudo bash scripts/outbound-mail-pause.sh --target production --pause  --reason "wrong template went out"
#   < ~/.footbag/operator-sudo bash scripts/outbound-mail-pause.sh --target production --resume --reason "template corrected"
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

die() { echo "outbound-mail-pause: $*" >&2; exit 1; }

usage() {
  sed -n '2,57p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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
  # tells the next person why mail stopped. An incident is exactly when nobody
  # remembers, so it is required rather than defaulted.
  die "--reason is required when pausing or resuming; it is recorded permanently"
fi

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/outbound-mail-pause.sh --target ${TARGET} ${ACTION}" || exit 1

if [[ "$ACTION" != "status" ]]; then
  verb="pause"; [[ "$ACTION" == "resume" ]] && verb="resume"
  echo ""
  if [[ "$ACTION" == "pause" ]]; then
    echo "About to PAUSE outbound mail on ${TARGET}."
    echo "  The outbox worker stops draining; nothing is sent."
    echo "  Queued messages are kept, not discarded, and go out when you resume."
    echo "  Anyone mid-registration waits for their verification mail until then."
  else
    echo "About to RESUME outbound mail on ${TARGET}."
    echo "  The worker starts draining again, beginning with everything queued"
    echo "  while it was paused."
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
    printf 'CONFIG_KEY=%q\n' 'email_outbox_paused'
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
  echo "outbound mail on ${TARGET}: PAUSED"
  echo "  The outbox worker is not draining; queued messages are being kept."
  echo "  Clear it with: scripts/outbound-mail-pause.sh --target ${TARGET} --resume --reason '...'"
else
  echo "outbound mail on ${TARGET}: DRAINING"
  echo "  The outbox worker is sending normally."
  echo "  Stop it with: scripts/outbound-mail-pause.sh --target ${TARGET} --pause --reason '...'"
fi
echo ""
echo "The admin system-health page shows this same state."
