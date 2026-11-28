#!/usr/bin/env bash
# crash-loop-host.sh
#
# Reads, clears or drills the crash-loop breaker on a deployed host from the
# operator's workstation, and proves the outcome from what the host reports.
#
# The breaker (scripts/crash-loop-breaker.sh, run on the host every minute)
# stops a container that keeps failing after it has started: the whole site for
# web or nginx, that container alone for the worker or the image processor. It
# then keeps it stopped, through deploys and reboots, and the container's
# unhealthy alarm keeps firing, until a person has found the cause and clears
# the trip. This is the one way to clear it.
#
# WHAT IT DOES.
#
#   1. Proves the host it reached records the environment it was asked for.
#   2. --status reads the trip and every container's state, asking nothing.
#   3. --clear shows what it will clear, takes the typed APPLY at this terminal,
#      removes the trip and its failure history, starts the site (or brings the
#      stopped container back), and passes only when no trip is recorded and all
#      four containers are running and healthy.
#   4. --drill <worker|image>, staging only, takes the typed APPLY, records the
#      breaker's limit of failures for that container exactly as the monitor
#      records them, runs the monitor's unit at once, and passes only when the
#      breaker has tripped that container and stopped it. The site stays up.
#      Then watch for the container's unhealthy alarm mail, and --clear.
#
# WHAT IT REFUSES.
#
#   - A target it was not given, or an action it was not given exactly once.
#   - A drill on production, or a drill of web or nginx.
#   - A host that records a different environment, before anything is read.
#   - A clear or a drill nobody confirmed at a terminal.
#
# Usage. The host sudo password is read from stdin, line 1. Which file holds it
# follows the account the alias connects as:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt   ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#   your own named account:  ~/AWS/DEV_TESTER_HOST.txt  (staging only; none on production)
#
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/crash-loop-host.sh --target production --status
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/crash-loop-host.sh --target production --clear
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/crash-loop-host.sh --target staging --drill image
#
# Exit: 0 done; 1 a failure or a refusal; 2 usage error.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/crash-loop-remote.sh"
REMOTE_REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"
SERVICES=(nginx web worker image)

TARGET=""
ACTION=""
DRILL_SERVICE=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

set_action() {
  [[ -z "$ACTION" ]] || { echo "crash-loop-host: name one action, --status, --clear or --drill" >&2; exit 2; }
  ACTION="$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "crash-loop-host: --target requires an argument" >&2; exit 2; } ;;
    --status) set_action status; shift ;;
    --clear)  set_action clear; shift ;;
    --drill)
      case "${2:-}" in
        worker|image) set_action drill; DRILL_SERVICE="$2"; shift 2 ;;
        *) echo "crash-loop-host: --drill takes 'worker' or 'image'; the site's own containers are never drilled" >&2; exit 2 ;;
      esac
      ;;
    -h|--help) usage 0 ;;
    *) echo "crash-loop-host: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

if [[ "$TARGET" != "production" && "$TARGET" != "staging" ]]; then
  echo "crash-loop-host: --target must be production or staging (got '${TARGET}')" >&2
  exit 1
fi
[[ -n "$ACTION" ]] || { echo "crash-loop-host: one of --status, --clear or --drill worker|image is required" >&2; exit 2; }
if [[ "$ACTION" == drill && "$TARGET" != staging ]]; then
  echo "crash-loop-host: the drill runs on staging only" >&2
  exit 1
fi

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

for f in "$REMOTE_HALF" "$REMOTE_REPORT_LIB"; do
  [[ -r "$f" ]] || cr_die "missing ${f}, which this run sends to the host"
done

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/crash-loop-host.sh --target ${TARGET} --${ACTION}${DRILL_SERVICE:+ ${DRILL_SERVICE}}" \
  "$ALIAS" "$TARGET" || exit 1
require_host_is "$ALIAS" "$TARGET" || exit 1

OUT="$(mktemp)"
cr_cleanup rm -f -- "$OUT"

send() {
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'CRASH_LOOP_ACTION=%q\n' "$1"
    printf 'CRASH_LOOP_SERVICE=%q\n' "$DRILL_SERVICE"
    cat "$REMOTE_REPORT_LIB" "$REMOTE_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
}

# Runs one action on the host and leaves its report in OUT, the human lines
# shown and the machine lines kept for judging.
run_action() {
  local action="$1"
  if ! cr_run_marked "the crash-loop ${action} on ${ALIAS}" -- send "$action" > "$OUT"; then
    [[ -s "$OUT" ]] && cat -- "$OUT"
    cr_die "the ${action} step failed on ${ALIAS}; its output above says why. Nothing is assumed about the trip"
  fi
  grep -vE '^CRASH_LOOP_(MARKER|CONTAINER)=' "$OUT" || [[ $? == 1 ]]
  MARKER_STATE="$(sed -n 's/^CRASH_LOOP_MARKER=//p' "$OUT" | tail -n 1)"
  [[ -n "$MARKER_STATE" ]] || cr_die "the host did not report the trip's state"
  local svc line
  for svc in "${SERVICES[@]}"; do
    line="$(sed -n "s/^CRASH_LOOP_CONTAINER=${svc} //p" "$OUT" | tail -n 1)"
    [[ -n "$line" ]] || cr_die "the host did not report the ${svc} container's state"
    printf -v "STATE_${svc}" '%s' "$line"
    echo "  ${svc}: ${line}"
  done
}

state_of() { local v="STATE_$1"; printf '%s' "${!v}"; }

if [[ "$ACTION" == status ]]; then
  run_action status
  if [[ "$MARKER_STATE" == none ]]; then
    cr_proved "no crash-loop trip is recorded on ${TARGET}"
  else
    cr_warn "the ${MARKER_STATE} container is tripped for a crash loop on ${TARGET}; once the cause is fixed: bash scripts/crash-loop-host.sh --target ${TARGET} --clear"
  fi
  cr_finish
fi

# A clear or a drill changes what the host runs: read first, then confirm.
run_action status
echo ""
if [[ "$ACTION" == clear ]]; then
  if [[ "$MARKER_STATE" == none ]]; then
    cr_proved "no crash-loop trip is recorded on ${TARGET}; nothing was cleared"
    cr_finish
  fi
  echo "About to CLEAR the crash-loop trip of the ${MARKER_STATE} container on ${ALIAS} and"
  echo "start it again. If its cause is not fixed it will loop again, and the breaker"
  echo "will stop it again after the same number of failures."
else
  [[ "$MARKER_STATE" == none ]] || cr_die "a trip of the ${MARKER_STATE} container is already recorded; clear it before drilling"
  echo "About to DRILL the crash-loop breaker on ${ALIAS}: the ${DRILL_SERVICE} container is"
  echo "tripped and stopped, the rest of the site stays up, and its unhealthy alarm fires"
  echo "until you clear it."
fi
echo ""
confirm_from_tty "Type 'APPLY' to ${ACTION} the crash-loop trip: " "APPLY" \
  || cr_die "not confirmed; nothing on ${ALIAS} was changed"

run_action "$ACTION"
echo ""

if [[ "$ACTION" == clear ]]; then
  [[ "$MARKER_STATE" == none ]] || cr_die "after the clear the host still records a trip (${MARKER_STATE})"
  for svc in "${SERVICES[@]}"; do
    read -r status health <<<"$(state_of "$svc")"
    if [[ "$status" != running || ( "$health" != healthy && "$health" != none ) ]]; then
      cr_error "the ${svc} container is ${status} (${health}) after the clear, not running and healthy"
    fi
  done
  (( ${#CR_ERRORS[@]} )) && cr_die "the trip is cleared, but the site is not back; read the container logs before anything else"
  cr_proved "the trip on ${TARGET} is cleared and all four containers are running and healthy, read back after the start"
  cr_finish
fi

[[ "$MARKER_STATE" == "$DRILL_SERVICE" ]] \
  || cr_die "the breaker did not trip the ${DRILL_SERVICE} container (the host reports '${MARKER_STATE}')"
read -r status _ <<<"$(state_of "$DRILL_SERVICE")"
[[ "$status" != running ]] || cr_die "the breaker tripped the ${DRILL_SERVICE} container but it is still running"
for svc in web nginx; do
  read -r status _ <<<"$(state_of "$svc")"
  [[ "$status" == running ]] || cr_error "the ${svc} container is ${status} during the drill; the site should have stayed up"
done
cr_proved "the breaker tripped and stopped the ${DRILL_SERVICE} container on ${TARGET}, and the site stayed up"
cr_unproved "the alarm: within five minutes footbag-${TARGET}-container-unhealthy-${DRILL_SERVICE} mails ALARM; then run --clear"
cr_finish
