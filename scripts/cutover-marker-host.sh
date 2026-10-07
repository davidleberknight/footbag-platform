#!/usr/bin/env bash
# cutover-marker-host.sh
#
# Reads or moves the cutover marker on a deployed host from the operator's
# workstation, and proves where both markers ended up.
#
# The marker is two records that must agree: a line in the host env file and a
# row in the live database. scripts/cutover-marker.sh moves them together, but it
# runs on the host, and the runbooks had the operator ssh in and type it under
# sudo. This is that step from the workstation, through the shared wire.
#
# WHAT IT DOES.
#
#   1. Proves the host it reached records the environment it was asked for.
#   2. For --set, states the direction and what it changes, and takes the typed
#      APPLY at this terminal. --status and --dry-run ask nothing.
#   3. Runs the host's deployed cutover-marker.sh as root over one ssh session,
#      passing --confirmed-at-workstation for a move.
#   4. Reads both markers back afterwards and, for a move, requires both to read
#      the requested direction. Anything else is a failure naming the state.
#
# WHAT IT REFUSES.
#
#   - A target it was not given, or an action it was not given exactly once.
#   - A host that records a different environment, before anything is read.
#   - A move nobody confirmed at a terminal.
#
# Usage. The host sudo password is read from stdin, line 1. Which file holds it
# follows the account the alias connects as:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt   ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#   your own named account:  ~/AWS/DEV_TESTER_HOST.txt  (staging only; none on production)
#
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/cutover-marker-host.sh --target production --status
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/cutover-marker-host.sh --target production --set complete
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/cutover-marker-host.sh --target production --set reversed
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/cutover-marker-host.sh --target production --set complete --dry-run
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/cutover-marker-remote.sh"

TARGET=""
ACTION=""
DRY_RUN="no"

die() { echo "cutover-marker-host: $*" >&2; exit 1; }

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

set_action() {
  [[ -z "$ACTION" ]] || { echo "cutover-marker-host: name one action, --status or --set" >&2; exit 2; }
  ACTION="$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "cutover-marker-host: --target requires an argument" >&2; exit 2; } ;;
    --status)  set_action status; shift ;;
    --set)
      case "${2:-}" in
        complete|reversed) set_action "set-$2"; shift 2 ;;
        *) echo "cutover-marker-host: --set takes 'complete' or 'reversed'" >&2; exit 2 ;;
      esac
      ;;
    --dry-run) DRY_RUN="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "cutover-marker-host: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

[[ "$TARGET" == "production" || "$TARGET" == "staging" ]] \
  || die "--target must be production or staging (got '${TARGET}')"
[[ -n "$ACTION" ]] || { echo "cutover-marker-host: one of --status or --set complete|reversed is required" >&2; exit 2; }
[[ -r "$REMOTE_HALF" ]] || die "missing remote half: $REMOTE_HALF"

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/cutover-marker-host.sh --target ${TARGET} ${ACTION}" \
  "$ALIAS" "$TARGET" || exit 1
require_host_is "$ALIAS" "$TARGET" || exit 1

if [[ "$ACTION" != "status" && "$DRY_RUN" != "yes" ]]; then
  direction="${ACTION#set-}"
  echo ""
  if [[ "$direction" == "complete" ]]; then
    echo "About to record the cutover as COMPLETE on ${ALIAS}, in the host env file and"
    echo "inside the live database. From then on the database-replacing rebuild deploy"
    echo "refuses this host and any copy of this database, and every destructive seeder"
    echo "and loader refuses alongside it."
  else
    echo "About to REVERSE the cutover marker on ${ALIAS}, re-arming the destructive"
    echo "rebuild deploy. This removes the protection that stops a full-refresh deploy"
    echo "destroying the live database. Do this only for a deliberate disaster rebuild."
  fi
  echo ""
  confirm_from_tty "Type 'APPLY' to move both markers to ${direction}: " "APPLY" \
    || die "not confirmed; neither marker was moved"
fi

result=""
if ! result="$(
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'MARKER_ACTION=%q\n' "$ACTION"
    printf 'MARKER_DRY_RUN=%q\n' "$DRY_RUN"
    cat "$REMOTE_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
)"; then
  [[ -n "$result" ]] && printf '%s\n' "$result"
  die "the remote step failed on ${ALIAS}; its output above says why. Nothing is assumed about the markers"
fi
printf '%s\n' "$result" | grep -vE '^MARKER_(ENV|DB)=' || true

env_state="$(sed -n 's/^MARKER_ENV=//p' <<<"$result" | tail -1)"
db_state="$(sed -n 's/^MARKER_DB=//p' <<<"$result" | tail -1)"
[[ -n "$env_state" && -n "$db_state" ]] || die "the host did not report both markers"

echo ""
if [[ "$ACTION" == "status" || "$DRY_RUN" == "yes" ]]; then
  echo "markers on ${TARGET}: env file ${env_state}, database ${db_state}"
  [[ "$env_state" == "$db_state" ]] || echo "WARNING: the two disagree; the destructive rebuild deploy refuses in this state."
  exit 0
fi

want="${ACTION#set-}"
if [[ "$env_state" != "$want" || "$db_state" != "$want" ]]; then
  die "after the move the markers read env file '${env_state}', database '${db_state}', not both '${want}'"
fi
echo "== both cutover markers on ${TARGET} read ${want}; record the time in the cutover log =="
