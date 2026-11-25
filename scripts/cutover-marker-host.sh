#!/usr/bin/env bash
# cutover-marker-host.sh
#
# Reads or moves the cutover marker on a deployed host from the operator's
# workstation, proves where both markers ended up, and asks the deploy's own
# cutover guard whether it would let a database-replacing deploy through.
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
#      APPLY at this terminal. --status, --check-guard and --dry-run ask nothing.
#   3. Runs the host's deployed cutover-marker.sh as root over one ssh session,
#      passing --confirmed-at-workstation for a move.
#   4. Reads both markers back afterwards and, for a move, requires both to read
#      the requested direction. Anything else is a failure naming the state.
#   5. For --check-guard, streams scripts/internal/deploy-rebuild-cutover-guard.sh,
#      the same file the database-replacing deploy sends ahead of any change, and
#      runs it alone and read-only on the host. It answers allow or refuse, with
#      the guard's own reason. No deploy is run, so the proof that the marker
#      holds is the guard's decision itself, not a deploy that may refuse for
#      some other reason before the marker is ever read.
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
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/cutover-marker-host.sh --target production --check-guard
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/cutover-marker-host.sh --target production --set complete
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/cutover-marker-host.sh --target production --set reversed
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/cutover-marker-host.sh --target production --set complete --dry-run
#
# Exit: 0 done (for --check-guard, the guard allows); 1 a failure or a refusal
# of this script's own; 2 usage error; 3 (--check-guard) the guard refuses the
# deploy, which is the answer sought once the marker is set.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/cutover-marker-remote.sh"
GUARD="${SCRIPT_DIR}/internal/deploy-rebuild-cutover-guard.sh"
PROBE_HALF="${SCRIPT_DIR}/internal/cutover-guard-probe-remote.sh"
REMOTE_REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"

TARGET=""
ACTION=""
DRY_RUN="no"

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

set_action() {
  [[ -z "$ACTION" ]] || { echo "cutover-marker-host: name one action, --status, --check-guard or --set" >&2; exit 2; }
  ACTION="$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "cutover-marker-host: --target requires an argument" >&2; exit 2; } ;;
    --status)  set_action status; shift ;;
    --check-guard) set_action check-guard; shift ;;
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

if [[ "$TARGET" != "production" && "$TARGET" != "staging" ]]; then
  echo "cutover-marker-host: --target must be production or staging (got '${TARGET}')" >&2
  exit 1
fi
[[ -n "$ACTION" ]] || { echo "cutover-marker-host: one of --status, --check-guard or --set complete|reversed is required" >&2; exit 2; }
if [[ "$ACTION" == check-guard && "$DRY_RUN" == yes ]]; then
  echo "cutover-marker-host: --check-guard only reads, so it takes no --dry-run" >&2
  exit 2
fi

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

for f in "$REMOTE_HALF" "$GUARD" "$PROBE_HALF" "$REMOTE_REPORT_LIB"; do
  [[ -r "$f" ]] || cr_die "missing ${f}, which this run sends to the host"
done

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/cutover-marker-host.sh --target ${TARGET} ${ACTION}" \
  "$ALIAS" "$TARGET" || exit 1
require_host_is "$ALIAS" "$TARGET" || exit 1

OUT="$(mktemp)"
cr_cleanup rm -f -- "$OUT"

# ── The guard, asked on its own ──────────────────────────────────────────────
if [[ "$ACTION" == check-guard ]]; then
  send_probe() {
    {
      printf '%s\n' "$SUDO_PASS"
      printf 'GUARD_SRC_B64=%q\n' "$(openssl base64 -A -in "$GUARD")"
      cat "$REMOTE_REPORT_LIB" "$PROBE_HALF"
    } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
  }
  if ! cr_run_marked "the cutover guard on ${ALIAS}" -- send_probe > "$OUT"; then
    cr_die "the guard's answer could not be read on ${ALIAS}; nothing is assumed about whether the deploy would be refused"
  fi
  answer="$(sed -n 's/^---FOOTBAG-GUARD--- //p' "$OUT" | tail -n 1)"
  why="$(sed -n 's/^---FOOTBAG-GUARD-WHY--- //p' "$OUT" | tail -n 1)"
  case "$answer" in
    allow)
      echo "cutover guard on ${TARGET}: allow (a database-replacing deploy would be let through)"
      cr_proved "the deploy's cutover guard, run on ${ALIAS}, allows the database-replacing deploy"
      cr_finish
      ;;
    refuse)
      echo "cutover guard on ${TARGET}: refuse (${why})"
      cr_proved "the deploy's cutover guard, run on ${ALIAS}, refuses the database-replacing deploy: ${why}"
      cr_finish_with 3 REFUSES
      ;;
    *)
      cr_die "the host gave no answer from the cutover guard, so whether the deploy would be refused is not known"
      ;;
  esac
fi

# ── The markers, read or moved ───────────────────────────────────────────────
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
    || cr_die "not confirmed; neither marker was moved"
fi

send_marker() {
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'MARKER_ACTION=%q\n' "$ACTION"
    printf 'MARKER_DRY_RUN=%q\n' "$DRY_RUN"
    cat "$REMOTE_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
}
if ! cr_run_marked "the marker step on ${ALIAS}" -- send_marker > "$OUT"; then
  [[ -s "$OUT" ]] && cat -- "$OUT"
  cr_die "the remote step failed on ${ALIAS}; its output above says why. Nothing is assumed about the markers"
fi
grep -vE '^MARKER_(ENV|DB)=' "$OUT" || [[ $? == 1 ]]

env_state="$(sed -n 's/^MARKER_ENV=//p' "$OUT" | tail -1)"
db_state="$(sed -n 's/^MARKER_DB=//p' "$OUT" | tail -1)"
[[ -n "$env_state" && -n "$db_state" ]] || cr_die "the host did not report both markers"

echo ""
if [[ "$ACTION" == "status" || "$DRY_RUN" == "yes" ]]; then
  echo "markers on ${TARGET}: env file ${env_state}, database ${db_state}"
  if [[ "$env_state" == "$db_state" ]]; then
    cr_proved "both cutover markers on ${TARGET} read ${env_state}"
  else
    cr_warn "the two cutover markers on ${TARGET} disagree (env file ${env_state}, database ${db_state}); the destructive rebuild deploy refuses in this state"
  fi
  [[ "$DRY_RUN" == "yes" ]] && cr_unproved "the move: a dry run moves nothing"
  cr_finish
fi

want="${ACTION#set-}"
if [[ "$env_state" != "$want" || "$db_state" != "$want" ]]; then
  cr_die "after the move the markers read env file '${env_state}', database '${db_state}', not both '${want}'"
fi
echo "== both cutover markers on ${TARGET} read ${want}; record the time in the cutover log =="
cr_proved "both cutover markers on ${TARGET} read ${want}, read back after the move"
cr_finish
