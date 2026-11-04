#!/usr/bin/env bash
# host-cold-restart.sh
#
# Stops an environment's Lightsail instance cold, starts it again, and proves
# the host answers afterwards.
#
# WHY THIS EXISTS.
#
# A host that has run out of memory is reported running by AWS while every
# connection to it times out, so nothing that reaches the host can recover it.
# What does is a stop and then a start through the Lightsail API: the instance
# comes back on a fresh boot with nothing of the state that filled its memory.
# A reboot is not that. It is asked of the same exhausted kernel, may never
# complete, and brings the host back with whatever started the trouble still
# set to start again. By hand this is three commands and two waits typed under
# pressure, against an instance name that a restore from snapshot changes; this
# run reads the name from Terraform, takes every step and checks each outcome.
#
# WHAT IT DOES, in order:
#
#   1. Reads the instance Terraform names for the target and its state from
#      Lightsail.
#   2. States the cold stop and start of that instance and asks for APPLY.
#   3. Stops the instance and waits until Lightsail reports it stopped.
#   4. Starts it and waits until Lightsail reports it running.
#   5. Runs scripts/host-diagnostics.sh --target <target> status, which reaches
#      the host over its pinned connection, proves it records the environment
#      it was asked for, and lists its containers; any problem it reports is an
#      error in this run's closing report.
#
# A run stopped part way is finished by running it again: an instance already
# stopped or stopping is started (after the same APPLY), one already starting
# is waited on, and each is proved the same way.
#
# AN INSTANCE STUCK STOPPING. A host out of memory can leave its stop hanging,
# so Lightsail reports it stopping and a re-run waits out its bound and starts
# nothing. --force-stop sends the stop again with Lightsail's --force, which
# AWS documents for an instance stuck in the stopping state and for no other;
# the run then waits for stopped, starts it and proves it as usual. It is
# accepted only while Lightsail reports the instance stopping, and the typed
# APPLY states the forced stop in full.
#
# WHAT IT REFUSES.
#
#   - A target it was not given. There is no default.
#   - An instance in any state but running, stopping, stopped or pending; the
#     state is named.
#   - --force-stop for an instance in any state but stopping; the state is
#     named and nothing is changed.
#   - A run with no terminal for the typed confirmation, or any word but APPLY.
#   - Starting an instance that never reached stopped within the wait.
#
# Usage:
#
#   bash scripts/host-cold-restart.sh --target staging
#   bash scripts/host-cold-restart.sh --target production
#   bash scripts/host-cold-restart.sh --target production --force-stop
#
# No credential is redirected in: the stop and start are Lightsail API calls,
# and the diagnostics at the end read the operator credential file themselves.
#
# Flags:
#   --target <staging|production>  required; never defaulted.
#   --force-stop                   force the stop of an instance stuck stopping
#                                  (refused in any other state), then start it.
#
# Test seams (CI only; operators never set these), each announced on stderr:
# HOST_COLD_RESTART_AWS_BIN and HOST_COLD_RESTART_TERRAFORM_BIN replace the two
# tools; HOST_COLD_RESTART_DIAGNOSTICS replaces scripts/host-diagnostics.sh;
# HOST_COLD_RESTART_POLL_TRIES and HOST_COLD_RESTART_POLL_SECS bound each wait.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# confirm_from_tty, require_target.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# tf_instance_name.
# shellcheck source=lib/terraform-output.sh
source "${SCRIPT_DIR}/lib/terraform-output.sh"

REGION="us-east-1"
TARGET=""
FORCE_STOP=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { cr_error "--target requires an argument"; exit 2; } ;;
    --force-stop) FORCE_STOP=1; shift ;;
    -h|--help) usage 0 ;;
    *) cr_error "unknown argument '$1' (try --help)"; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

AWS_BIN="${HOST_COLD_RESTART_AWS_BIN:-aws}"
TF_OUTPUT_BIN="${HOST_COLD_RESTART_TERRAFORM_BIN:-terraform}"
DIAGNOSTICS="${HOST_COLD_RESTART_DIAGNOSTICS:-${SCRIPT_DIR}/host-diagnostics.sh}"
POLL_TRIES="${HOST_COLD_RESTART_POLL_TRIES:-60}"
POLL_SECS="${HOST_COLD_RESTART_POLL_SECS:-10}"
for seam in HOST_COLD_RESTART_AWS_BIN HOST_COLD_RESTART_TERRAFORM_BIN HOST_COLD_RESTART_DIAGNOSTICS \
            HOST_COLD_RESTART_POLL_TRIES HOST_COLD_RESTART_POLL_SECS; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
done
[[ "$POLL_TRIES" =~ ^[1-9][0-9]*$ && "$POLL_SECS" =~ ^[0-9]+$ ]] \
  || cr_die "the poll bounds must be whole numbers (tries ${POLL_TRIES}, seconds ${POLL_SECS})"

aws_profile_ensure || cr_die "no AWS identity is available for the Lightsail calls"
tf_instance_name "$TARGET" || cr_die "could not read the ${TARGET} instance name from Terraform"
INSTANCE="$TF_INSTANCE_NAME"

ERR_FILE="$(mktemp)"
cr_cleanup rm -f -- "$ERR_FILE"
aws_ls() { "$AWS_BIN" lightsail "$@" --region "$REGION" </dev/null 2>"$ERR_FILE"; }
aws_said() { tail -n 1 "$ERR_FILE"; }

# Sets STATE to the instance's state as Lightsail reports it; returns 1, with
# Lightsail's words in the closing report, when it cannot be read.
STATE=""
read_state() {
  STATE="$(aws_ls get-instance-state --instance-name "$INSTANCE" --query 'state.name' --output text)" \
    || { STATE=""; return 1; }
}

# wait_for <state>: true once Lightsail reports it, within the bound.
wait_for() {
  local want="$1" i
  for (( i = 1; i <= POLL_TRIES; i++ )); do
    read_state || cr_die "could not read the state of ${INSTANCE} while waiting for ${want}: $(aws_said)"
    [[ "$STATE" == "$want" ]] && return 0
    (( i < POLL_TRIES )) && sleep "$POLL_SECS"
  done
  return 1
}

read_state || cr_die "could not read ${INSTANCE}, the instance Terraform names for ${TARGET}: $(aws_said)"
echo "==> ${INSTANCE} (${TARGET}) is ${STATE}"

# AWS documents the forced stop for an instance stuck stopping and warns against
# it in any other state, so the flag is refused before anything is asked or sent.
if (( FORCE_STOP )) && [[ "$STATE" != "stopping" ]]; then
  cr_die "--force-stop is only for an instance stuck stopping; ${INSTANCE} is ${STATE}, so nothing was changed. Run without --force-stop."
fi

case "$STATE" in
  running|stopping|stopped)
    if [[ "$STATE" == "running" ]]; then
      plan="a cold STOP and then a START of ${INSTANCE}, the ${TARGET} host"
    elif (( FORCE_STOP )); then
      plan="a FORCED STOP (Lightsail stop-instance --force) of ${INSTANCE}, the ${TARGET} host, which is stuck stopping, and then a START of it"
    else
      plan="a START of ${INSTANCE}, the ${TARGET} host, which an earlier cold restart left ${STATE}"
    fi
    echo ""
    echo "About to run ${plan}."
    echo "  The site on ${TARGET} is down from the stop until the host has booted again."
    echo "  This is a stop and start through the Lightsail API, not a reboot: the host"
    echo "  comes back on a fresh boot. Its disk, its static IP and its firewall are kept."
    echo ""
    confirm_from_tty "Type 'APPLY' to cold-restart ${INSTANCE}: " "APPLY" \
      || cr_die "not confirmed; ${INSTANCE} was not changed"

    if [[ "$STATE" == "running" ]]; then
      echo "==> Stopping ${INSTANCE}"
      aws_ls stop-instance --instance-name "$INSTANCE" >/dev/null \
        || cr_die "the stop of ${INSTANCE} was refused: $(aws_said)"
    elif (( FORCE_STOP )); then
      echo "==> Forcing the stop of ${INSTANCE}"
      aws_ls stop-instance --instance-name "$INSTANCE" --force >/dev/null \
        || cr_die "the forced stop of ${INSTANCE} was refused; it is still stopping: $(aws_said)"
    fi
    if [[ "$STATE" != "stopped" ]]; then
      wait_for stopped || cr_die "${INSTANCE} did not reach stopped within $(( POLL_TRIES * POLL_SECS ))s (last state: ${STATE}); it was not started. Run again to keep waiting, or with --force-stop if it stays stopping."
    fi
    echo "    ${INSTANCE} is stopped"
    echo "==> Starting ${INSTANCE}"
    aws_ls start-instance --instance-name "$INSTANCE" >/dev/null \
      || cr_die "the start of ${INSTANCE} was refused; it is stopped and the ${TARGET} site is down. Run again to start it: $(aws_said)"
    ;;
  pending)
    echo "    ${INSTANCE} is already starting; waiting for it rather than stopping it again"
    ;;
  *)
    cr_die "${INSTANCE} is ${STATE}, not running; a cold restart starts only from running, or finishes one left stopping, stopped or pending"
    ;;
esac

wait_for running || cr_die "${INSTANCE} did not reach running within $(( POLL_TRIES * POLL_SECS ))s (last state: ${STATE}). Run again to keep waiting."
echo "    ${INSTANCE} is running"
cr_proved "Lightsail reports ${INSTANCE} running again after the cold restart"

echo "==> Asking the host for its status through scripts/host-diagnostics.sh"
# Judged on what the diagnostics printed as well as on their exit, so a status
# that exits 0 over an error line it printed proves nothing here.
errors_before=${#CR_ERRORS[@]}
if cr_run_marked --errors "$FOOTBAG_FAILURE_GRAMMAR" --warnings "$FOOTBAG_NOTICE_GRAMMAR" \
   "host diagnostics status" -- bash "$DIAGNOSTICS" --target "$TARGET" status \
   && (( ${#CR_ERRORS[@]} == errors_before )); then
  cr_proved "the host answers over its pinned connection as ${TARGET} and lists its containers (host-diagnostics status)"
else
  cr_unproved "that the host answers after the restart: the diagnostics did not complete"
fi
cr_unproved "the site's readiness: the status lists the containers but does not ask the application (scripts/host-diagnostics.sh --target ${TARGET} health does)"
cr_finish
