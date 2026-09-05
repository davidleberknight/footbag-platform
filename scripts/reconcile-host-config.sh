#!/usr/bin/env bash
# reconcile-host-config.sh
#
# Restores named runtime configuration values on a deployed host to the defaults
# the schema seeds, and says so when they already match.
#
# WHY A HOST NEEDS THIS AT ALL.
#
# Runtime configuration lives in the database, not in the environment file, so a
# rebuild-and-replace deploy carries whatever configuration rows the workstation
# database held. A value meant only for a developer's own machine therefore
# travels to whatever host that deploy lands on. It is the quietest kind of
# defect: nothing fails, no log says anything, and the host simply behaves
# differently from every document describing it until somebody notices the
# symptom and traces it back.
#
# The builder no longer writes developer-only rows into a database destined for
# a host. That fixes the next rebuild and cannot reach a host already carrying
# one, because a code deploy does not touch configuration rows. This is the
# scripted correction for that state.
#
# WHAT IT WRITES.
#
# The configuration table is append-only, enforced by database triggers, so a
# correction is a newer effective row rather than an edit. Both rows stay on the
# record with their reasons, which is the point: the history says what the host
# was doing and when that stopped.
#
# The value restored is the one the schema seeds for that key, read from the
# database itself rather than named here. A constant repeated in this script
# would be a second source of truth, and the two would drift without anything
# catching it.
#
# WHAT IT DOES NOT DO.
#
# It does not turn a switch on or off, and it is not the way to change a value
# deliberately. An administrator changing a setting does that through the admin
# surfaces; the two runtime kill switches have their own scripts. This one only
# ever moves a value back to its seeded default, so the worst it can do is undo
# a deliberate change, which --status shows you before --apply writes anything.
#
# Usage (the sudo password is read from stdin, line 1):
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/reconcile-host-config.sh --target production --status
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/reconcile-host-config.sh --target production --apply --reason "<why>"
#   ... --key <name>   reconcile one named key instead of the default set
#   ... --actor <id>   record who did it on the row
#   ... --yes          accept the confirmation in advance, where no terminal is attached
#
# Confirmations are read from the terminal, never from stdin: stdin carries the
# credential file, and a prompt reading it would swallow the password.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/reconcile-host-config-remote.sh"
DB_FILE_DEFAULT="/srv/footbag/db/footbag.db"

# The keys a host is known to be able to acquire a developer-only value for.
# Deliberately a short, named list rather than every key in the table: this
# script exists to undo a specific class of accident, and reconciling everything
# would silently revert deliberate administrator changes alongside it.
DEFAULT_KEYS="outbox_poll_interval_seconds"

TARGET=""
ACTION=""
REASON=""
ACTOR=""
KEYS=""
DB_FILE="${DB_FILE_DEFAULT}"

die() { echo "reconcile-host-config: $*" >&2; exit 1; }

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 ;;
    --status)  ACTION="status"; shift ;;
    --apply)   ACTION="apply"; shift ;;
    --key)     KEYS="${KEYS:+$KEYS }${2:-}"; shift 2 ;;
    --reason)  REASON="${2:-}"; shift 2 ;;
    --actor)   ACTOR="${2:-}"; shift 2 ;;
    --db-file) DB_FILE="${2:-}"; shift 2 ;;
    --yes)     ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) die "unknown argument '$1' (try --help)" ;;
  esac
done

case "$TARGET" in
  staging|production) ;;
  '') die "--target is required ('staging' or 'production')" ;;
  *) die "--target must be production or staging (got '${TARGET}')" ;;
esac

[[ -n "$ACTION" ]] || die "one of --status or --apply is required"

if [[ "$ACTION" == "apply" && -z "$REASON" ]]; then
  # The reason lands on the permanent row and is the only thing telling the next
  # reader why the value moved. A correction with no reason reads, later, like
  # an unexplained configuration change.
  die "--reason is required when applying; it is recorded permanently"
fi

[[ -n "$KEYS" ]] || KEYS="$DEFAULT_KEYS"

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/reconcile-host-config.sh --target ${TARGET} --${ACTION}" || exit 1

if [[ "$ACTION" == "apply" ]]; then
  echo ""
  echo "About to restore these configuration values on ${TARGET} to their seeded defaults:"
  for key in $KEYS; do echo "  ${key}"; done
  echo ""
  echo "  A newer effective row is appended per value that differs; nothing is edited."
  echo "  Run --status first if you have not, so you see what will change."
  echo "  Reason recorded: ${REASON}"
  echo ""
  if ! confirm_from_tty "Type ${TARGET} to apply: " "$TARGET"; then
    die "not confirmed; nothing was changed"
  fi
fi

result=""
# The remote half writes progress to stderr and only the CONFIG_ lines to
# stdout, so a diagnostic can never be mistaken for a result.
if ! result="$(
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'DB_FILE=%q\n' "$DB_FILE"
    printf 'KEYS=%q\n' "$KEYS"
    printf 'ACTION=%q\n' "$ACTION"
    printf 'REASON=%q\n' "${REASON:-status read}"
    printf 'ACTOR=%q\n' "${ACTOR:-}"
    cat "$REMOTE_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
)"; then
  die "the remote step failed; nothing is assumed about the host's configuration"
fi

echo ""
printf '%s\n' "$result" | sed -n 's/^CONFIG_OK=/  matches seeded default: /p'
printf '%s\n' "$result" | sed -n 's/^CONFIG_DRIFT=/  DIFFERS from seeded default: /p'
printf '%s\n' "$result" | sed -n 's/^CONFIG_RESTORED=/  restored: /p'

DRIFT="$(printf '%s\n' "$result" | sed -n 's/^CONFIG_DRIFT_FOUND=//p' | tail -1)"
WRITTEN="$(printf '%s\n' "$result" | sed -n 's/^CONFIG_ROWS_WRITTEN=//p' | tail -1)"
[[ -n "$DRIFT" ]] || die "the host did not report a result"

echo ""
if [[ "$ACTION" == "status" ]]; then
  if [[ "$DRIFT" == "1" ]]; then
    echo "configuration on ${TARGET}: DIFFERS from the seeded defaults above."
    echo "  Correct it with: scripts/reconcile-host-config.sh --target ${TARGET} --apply --reason '...'"
  else
    echo "configuration on ${TARGET}: every checked value matches its seeded default."
  fi
else
  echo "configuration on ${TARGET}: ${WRITTEN} value(s) restored."
  echo "  The running application picks a value up on its next read; the outbox"
  echo "  interval is re-read each pass, so it takes effect without a restart."
fi
