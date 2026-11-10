#!/usr/bin/env bash
# incident-drill.sh
#
# Walks the incident-response flow end to end on staging, as one run, and
# writes the drill up.
#
# WHY THIS EXISTS.
#
# A response procedure that is never exercised fails the first time it matters:
# a stale command, a missing alias, a tool needing a credential nobody has to
# hand. The drill finds that step while it costs nothing. Walked by hand it is
# fourteen steps an operator holds in their head, with the timings written down
# from memory afterwards; this run takes every step, times each one as it
# happens, and leaves the write-up in the postmortem shape.
#
# WHAT IT DOES, in order:
#
#   1. Checks staging is healthy at the edge and its site-unavailable alarm is
#      OK, so the drill starts from a known state.
#   2. Asks whether everyone who watches staging alarms or the staging site has
#      been told a drill is starting, so a rehearsal is never taken for the
#      real thing, then asks for APPLY.
#   3. Stops the web container on the staging host (nginx stays up and answers
#      502), the failure the drill induces.
#   4. Reads the edge until /health/ready returns a 5xx, and waits for
#      footbag-staging-site-unavailable to reach ALARM: the first signal.
#   5. Says which email to look for and where, and asks whether it arrived
#      (yes, no, or wait to be asked again): the acknowledgment. The severity
#      is classified from what the edge answered, not asked.
#   6. Runs scripts/host-diagnostics.sh --target staging for the status, health
#      and all-logs groups, keeping their output for the write-up, as evidence
#      is captured before any recovery.
#   7. Drafts the member notice from the four things a notice says, and shows
#      it. It is recorded and never sent.
#   8. Recovers with scripts/restart-host.sh --target staging, the smallest
#      safe runbook.
#   9. Proves health: /health/live and /health/ready answer 200 at the edge, and
#      the alarm is back to OK. Then runs the integrity check, which runs inside
#      the web container and so cannot run while the outage has it stopped.
#  10. Lists the steps that did not work from the run's own recorded errors.
#  11. Writes the drill up under evidence/postmortems/ in the private
#      operations checkout, named YYYY-MM-DD-staging-incident-drill.md (with a
#      number added when that name is taken, so no write-up is overwritten).
#
# A step after the stop that fails is recorded and the drill carries on, since
# finding the step that fails is the point. If the run stops for any reason
# after the container was stopped and before the restart proved healthy, it
# runs scripts/restart-host.sh itself on the way out, so staging is never left
# down by an unfinished drill.
#
# WHAT IT REFUSES.
#
#   - Any target but staging. A failure is never induced on production to
#     rehearse.
#   - A host that does not record staging, before anything is changed.
#   - A start while staging is already unhealthy at the edge or its alarm is
#     not OK: a drill over a real fault hides it.
#   - A run with no terminal, a "no" to the announcement, or any word but APPLY.
#   - A run with no private operations checkout to write the drill up in.
#
# Usage. The host sudo password is read from stdin, line 1; the prompts are
# answered at the terminal.
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/incident-drill.sh --target staging
#
# Flags:
#   --target staging   required; never defaulted.
#
# Test seams (CI only; operators never set these), each announced on stderr:
# INCIDENT_DRILL_ALARM_SCRIPT, INCIDENT_DRILL_DIAGNOSTICS and
# INCIDENT_DRILL_RESTART replace scripts/send-test-alarm.sh,
# scripts/host-diagnostics.sh and scripts/restart-host.sh;
# INCIDENT_DRILL_CURL_BIN replaces curl; INCIDENT_DRILL_POSTMORTEM_DIR replaces
# the write-up directory; INCIDENT_DRILL_POLL_TRIES, INCIDENT_DRILL_POLL_SECS and
# INCIDENT_DRILL_WAIT_MINUTES bound the edge reads and the alarm waits.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# confirm_from_tty, require_operator_stdin, require_host_is, terminal_present.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# tf_output_read.
# shellcheck source=lib/terraform-output.sh
source "${SCRIPT_DIR}/lib/terraform-output.sh"

ALARM="footbag-staging-site-unavailable"
TARGET=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { cr_error "--target requires an argument"; exit 2; } ;;
    -h|--help) usage 0 ;;
    *) cr_error "unknown argument '$1' (try --help)"; exit 2 ;;
  esac
done

if [[ "$TARGET" == "production" ]]; then
  cr_die "the incident drill runs on staging only: a failure is never induced on production to rehearse"
fi
require_target "$TARGET" staging || exit 2

ALARM_SCRIPT="${INCIDENT_DRILL_ALARM_SCRIPT:-${SCRIPT_DIR}/send-test-alarm.sh}"
DIAGNOSTICS="${INCIDENT_DRILL_DIAGNOSTICS:-${SCRIPT_DIR}/host-diagnostics.sh}"
RESTART="${INCIDENT_DRILL_RESTART:-${SCRIPT_DIR}/restart-host.sh}"
CURL_BIN="${INCIDENT_DRILL_CURL_BIN:-curl}"
POSTMORTEM_DIR="${INCIDENT_DRILL_POSTMORTEM_DIR:-${REPO_ROOT}/footbag_private_repo/evidence/postmortems}"
POLL_TRIES="${INCIDENT_DRILL_POLL_TRIES:-30}"
POLL_SECS="${INCIDENT_DRILL_POLL_SECS:-10}"
WAIT_MINUTES="${INCIDENT_DRILL_WAIT_MINUTES:-10}"
for seam in INCIDENT_DRILL_ALARM_SCRIPT INCIDENT_DRILL_DIAGNOSTICS INCIDENT_DRILL_RESTART \
            INCIDENT_DRILL_CURL_BIN INCIDENT_DRILL_POSTMORTEM_DIR INCIDENT_DRILL_POLL_TRIES \
            INCIDENT_DRILL_POLL_SECS INCIDENT_DRILL_WAIT_MINUTES; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
done
[[ "$POLL_TRIES" =~ ^[1-9][0-9]*$ && "$POLL_SECS" =~ ^[0-9]+$ && "$WAIT_MINUTES" =~ ^[0-9]+$ ]] \
  || cr_die "the wait bounds must be whole numbers (tries ${POLL_TRIES}, seconds ${POLL_SECS}, minutes ${WAIT_MINUTES})"

REMOTE_HALF="${SCRIPT_DIR}/internal/incident-drill-stop-remote.sh"
REMOTE_REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"
[[ -r "$REMOTE_HALF" ]] || cr_die "missing remote half: $REMOTE_HALF"
[[ -r "$REMOTE_REPORT_LIB" ]] || cr_die "missing remote-half report library: $REMOTE_REPORT_LIB"

now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# ── Preconditions ────────────────────────────────────────────────────────────

terminal_present \
  || cr_die "no terminal: the drill asks questions only a person at a terminal can answer. Run it from an interactive shell."
[[ -d "$POSTMORTEM_DIR" ]] \
  || cr_die "no write-up directory at ${POSTMORTEM_DIR}: the drill is written up in the private operations checkout, which is not linked here. Link it with scripts/setup_private_repo.sh first."

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/incident-drill.sh --target ${TARGET}" "$ALIAS" "$TARGET" || exit 1
require_host_is "$ALIAS" "$TARGET" || exit 1

tf_output_read "${REPO_ROOT}/terraform/${TARGET}" cloudfront_domain \
  || cr_die "could not read the ${TARGET} distribution domain from Terraform: ${TF_OUTPUT_ERROR}"
DOMAIN="$TF_OUTPUT_VALUE"
[[ -n "$DOMAIN" && "$DOMAIN" != "null" ]] \
  || cr_die "Terraform names no distribution domain for ${TARGET}; the edge cannot be read"

# edge_status <path>: the HTTP status the edge answers with, or 000 when it
# could not be reached at all.
edge_status() {
  local code
  code="$("$CURL_BIN" -s -o /dev/null -w '%{http_code}' --max-time 10 "https://${DOMAIN}$1" </dev/null)" \
    || [[ -n "$code" ]] || code="000"
  printf '%s' "${code:-000}"
}

# edge_wait <pattern>: true once /health/ready answers a status matching the
# pattern, within the bound. EDGE_LAST holds the last status read.
EDGE_LAST=""
edge_wait() {
  local want="$1" i
  for (( i = 1; i <= POLL_TRIES; i++ )); do
    EDGE_LAST="$(edge_status /health/ready)"
    [[ "$EDGE_LAST" =~ $want ]] && return 0
    (( i < POLL_TRIES )) && sleep "$POLL_SECS"
  done
  return 1
}

# alarm <args...>: scripts/send-test-alarm.sh on this run's alarm, its problems
# folded into this report.
alarm() {
  bash "$ALARM_SCRIPT" --target "$TARGET" --alarm "$ALARM" --status "$@" </dev/null
}

echo "==> Checking ${TARGET} is healthy before the drill"
for path in /health/live /health/ready; do
  code="$(edge_status "$path")"
  [[ "$code" == "200" ]] \
    || cr_die "https://${DOMAIN}${path} answers ${code}, not 200. Staging is already unhealthy; investigate that rather than drilling over it."
done
probe_report="$(mktemp)"
cr_cleanup rm -f -- "$probe_report"
FOOTBAG_CR_REPORT_TO="$probe_report" alarm --expect OK >/dev/null 2>&1 \
  || cr_die "${ALARM} is not OK before the drill. Read it with: bash scripts/send-test-alarm.sh --target ${TARGET} --alarm ${ALARM} --status"
echo "    the edge answers 200 and ${ALARM} is OK"

# ── The write-up's name, settled before anything changes ─────────────────────

DAY="$(date -u +%F)"
WRITEUP="${POSTMORTEM_DIR}/${DAY}-staging-incident-drill.md"
n=2
while [[ -e "$WRITEUP" ]]; do
  WRITEUP="${POSTMORTEM_DIR}/${DAY}-staging-incident-drill-${n}.md"
  n=$(( n + 1 ))
done

# ── Prompts, all at the terminal: stdin carries the password ─────────────────

# ask_line <prompt>: one non-empty line from the terminal, into ANSWER.
ANSWER=""
ask_line() {
  ANSWER=""
  while [[ -z "$ANSWER" ]]; do
    printf '%s ' "$1" > /dev/tty
    IFS= read -r ANSWER < /dev/tty || cr_die "the terminal closed while a question was open"
  done
}

# ask_choice <prompt> <choice>...: one of the choices, into ANSWER.
ask_choice() {
  local prompt="$1" c
  shift
  while true; do
    ask_line "$prompt"
    for c in "$@"; do
      [[ "$ANSWER" == "$c" ]] && return 0
    done
    printf 'Please answer %s.\n' "$*" > /dev/tty
  done
}

# ── 1. Announce, and confirm ─────────────────────────────────────────────────

echo ""
echo "This drill takes the ${TARGET} site down on purpose. Anyone who watches the"
echo "staging alarms or might look at the staging site must know first, so the"
echo "alarm it raises is never taken for a real outage."
ask_choice "Have you told everyone who watches staging alarms or the staging site that a drill starts now? (yes/no)" yes no
[[ "$ANSWER" == "yes" ]] || cr_die "the drill was not announced; nothing was stopped. Announce it, then run this again."

echo ""
echo "About to STOP the web container on ${ALIAS}."
echo "  The ${TARGET} site answers every request with an error until the drill"
echo "  restarts it, a few minutes from now. ${ALARM} will fire and"
echo "  mail its subscribers."
echo ""
confirm_from_tty "Type 'APPLY' to start the drill: " "APPLY" \
  || cr_die "not confirmed; nothing was stopped"

T_START="$(now_utc)"

# ── 2. Induce the failure ────────────────────────────────────────────────────

STOPPED=0
RECOVERED=0
RESTART_RC=""

send_restart() {
  printf '%s\n' "$SUDO_PASS" | bash "$RESTART" --target "$TARGET"
}

# On the way out of a run that stopped the container and never proved the
# restart, restart it, so an unfinished drill never leaves staging down.
recover_on_exit() {
  (( STOPPED && ! RECOVERED )) || return 0
  echo "==> The drill ended before recovery; restarting ${TARGET} so it is not left down" >&2
  send_restart || cr_error "the restart on the way out failed; ${TARGET} may still be down. Run: < ~/AWS/AWS_OPERATOR.txt bash scripts/restart-host.sh --target ${TARGET}"
}
cr_cleanup recover_on_exit

send_stop() {
  {
    printf '%s\n' "$SUDO_PASS"
    cat "$REMOTE_REPORT_LIB" "$REMOTE_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
}

echo "==> Stopping the web container on ${ALIAS}"
STOPPED=1
errors_before=${#CR_ERRORS[@]}
if ! cr_run_marked "stop the web container on ${ALIAS}" -- send_stop \
   || (( ${#CR_ERRORS[@]} > errors_before )); then
  cr_unproved "the drill: the failure was not induced"
  cr_finish
fi
T_STOPPED="$(now_utc)"
cr_proved "the web container on ${ALIAS} was stopped and read back as not running"

# ── 3. Edge behaviour ────────────────────────────────────────────────────────

echo "==> Reading https://${DOMAIN}/health/ready until the edge answers a 5xx"
if edge_wait '^5[0-9][0-9]$'; then
  EDGE_DOWN="$EDGE_LAST"
  cr_proved "the edge answered ${EDGE_DOWN} on /health/ready while the origin was down"
else
  EDGE_DOWN="none (last ${EDGE_LAST})"
  cr_error "the edge never answered a 5xx on /health/ready within $(( POLL_TRIES * POLL_SECS ))s of the stop (last ${EDGE_LAST})"
fi

# ── 4. The alarm: first signal ───────────────────────────────────────────────

echo "==> Waiting up to ${WAIT_MINUTES} minutes for ${ALARM} to reach ALARM"
T_SIGNAL=""
if alarm --expect ALARM --wait-minutes "$WAIT_MINUTES"; then
  T_SIGNAL="$(now_utc)"
  cr_proved "${ALARM} reached ALARM"
else
  cr_error "${ALARM} did not reach ALARM within ${WAIT_MINUTES} minutes of the stop"
fi

# ── 5. Alarm path, severity: acknowledgment ──────────────────────────────────

echo ""
echo "AWS Notifications (no-reply@sns.amazonaws.com) now emails the operations"
echo "mailbox, subject starting 'ALARM: \"${ALARM}\"'. It can take a few minutes."
echo "In Gmail, search:  \"${ALARM}\" in:anywhere newer_than:1d"
while true; do
  ask_choice "Has that ALARM email arrived? (yes, no, or wait to be asked again in $(( POLL_SECS * 6 )) seconds)" yes no wait
  [[ "$ANSWER" == "wait" ]] || break
  sleep $(( POLL_SECS * 6 ))
done
MAIL_ARRIVED="$ANSWER"
if [[ "$MAIL_ARRIVED" == "yes" ]]; then
  RECEIVED_BY="the operations mailbox"
else
  RECEIVED_BY="nobody"
  cr_error "the ${ALARM} email did not arrive in the operations mailbox"
fi
# The induced outage is the guide's SEV-1 case: the site unreachable or
# actively erroring. It is classified from what the edge answered, not asked.
if [[ "$EDGE_DOWN" =~ ^5 ]]; then
  SEVERITY="SEV-1 (the edge answered ${EDGE_DOWN}: unreachable or actively erroring)"
else
  SEVERITY="not classified: the edge never answered an error"
fi
echo "Severity: ${SEVERITY}"
T_ACK="$(now_utc)"

# ── 6. Diagnostics, before recovery ──────────────────────────────────────────

DIAG_OUT="$(mktemp)"
cr_cleanup rm -f -- "$DIAG_OUT"
DIAG_RESULTS=()
# The groups describe an origin that is down on purpose, so what they print is
# not judged here; whether each one ran is. A group exits non-zero only when the
# tool itself failed, which is a step that did not work. The integrity check
# runs inside the web container, which this outage stops, so it runs after
# recovery instead.
# diagnose <group> <when>: one group, its output kept for the write-up.
diagnose() {
  local group="$1" when="$2" one rc=0
  echo "==> scripts/host-diagnostics.sh --target ${TARGET} ${group}"
  one="$(mktemp)"
  bash "$DIAGNOSTICS" --target "$TARGET" "$group" </dev/null >"$one" 2>&1 || rc=$?
  cat "$one"
  { printf '### %s, %s (exit %s)\n\n```\n' "$group" "$when" "$rc"; cat "$one"; printf '```\n\n'; } >> "$DIAG_OUT"
  rm -f -- "$one"
  DIAG_RESULTS+=("scripts/host-diagnostics.sh --target ${TARGET} ${group} (${when}): exit ${rc}")
  (( rc == 0 )) || cr_error "scripts/host-diagnostics.sh --target ${TARGET} ${group} failed (exit ${rc}); its output is in the write-up"
}
for group in status health all-logs; do
  diagnose "$group" "before recovery"
done

# ── 7. Member notice, drafted and not sent ───────────────────────────────────

# A notice says four things and no more: what is affected in members' terms,
# what is not (money and member data), that it is being worked on, and when the
# next update comes. The drill knows each, so it drafts the notice itself.
NOTICE="The footbag.org website cannot be reached right now; every page answers with an error.
No payment was taken and no member data was lost or exposed.
We are working on it.
The next update comes by $(date -u -d '+30 minutes' +%H:%M) UTC."
echo ""
echo "The member notice this outage calls for, recorded in the write-up and NOT sent:"
printf '%s\n' "$NOTICE" | sed 's/^/  /'
T_NOTICE="$(now_utc)"

# ── 8. Recovery ──────────────────────────────────────────────────────────────

echo "==> Recovering with scripts/restart-host.sh --target ${TARGET}"
T_RECOVERY="$(now_utc)"
RESTART_RC=0
cr_run_marked "restart ${TARGET}" -- send_restart || RESTART_RC=$?
if (( RESTART_RC == 0 )); then
  RECOVERED=1
  cr_proved "scripts/restart-host.sh brought ${TARGET} back with every container healthy"
else
  cr_error "scripts/restart-host.sh --target ${TARGET} failed (exit ${RESTART_RC})"
fi

# ── 9. Health ────────────────────────────────────────────────────────────────

T_GREEN=""
if (( RECOVERED )); then
  echo "==> Reading the edge until /health/ready answers 200"
  if edge_wait '^200$' && [[ "$(edge_status /health/live)" == "200" ]]; then
    cr_proved "the edge answers 200 on /health/live and /health/ready after recovery"
    echo "==> Waiting up to ${WAIT_MINUTES} minutes for ${ALARM} to clear"
    if alarm --expect OK --wait-minutes "$WAIT_MINUTES"; then
      T_GREEN="$(now_utc)"
      cr_proved "${ALARM} cleared to OK"
    else
      cr_error "${ALARM} did not clear to OK within ${WAIT_MINUTES} minutes of recovery"
    fi
  else
    cr_error "the edge did not answer 200 on /health/live and /health/ready after the restart (last /health/ready: ${EDGE_LAST})"
  fi
  diagnose integrity "after recovery"
fi

# ── 10. What did not work, from the run's own record ─────────────────────────

CORRECTIONS=""
for problem in "${CR_ERRORS[@]+"${CR_ERRORS[@]}"}"; do
  CORRECTIONS+="- ${problem}"$'\n'
done
[[ -n "$CORRECTIONS" ]] || CORRECTIONS="Every step worked as the drill ran it."$'\n'
CORRECTIONS+=$'\n'"Add here anything the run could not see (a stale command in the guide, a credential nobody had), and correct the guide for each."$'\n'

# ── 11. Write-up ─────────────────────────────────────────────────────────────

or_unrecorded() { printf '%s' "${1:-not reached}"; }
indent_quote() { sed 's/^/> /'; }

{
  printf '# Drill, staging: induced origin outage, %s\n\n' "$DAY"
  printf 'A drill, not an incident. Severity as classified: %s. Drill of the incident-response flow on staging, run by scripts/incident-drill.sh.\n\n' "$SEVERITY"
  printf '## Summary\n\n'
  printf 'The web container on %s was stopped on purpose at %s, so the origin answered 502 and %s fired. Evidence was captured with scripts/host-diagnostics.sh, a member notice was drafted and not sent, and the site was recovered with scripts/restart-host.sh.\n\n' \
    "$ALIAS" "$T_STOPPED" "$ALARM"
  printf '## Timeline (UTC)\n\n'
  printf -- '- %s: drill started (announced, confirmed)\n' "$T_START"
  printf -- '- %s: web container stopped (failure induced)\n' "$T_STOPPED"
  printf -- '- %s: first signal (%s reached ALARM)\n' "$(or_unrecorded "$T_SIGNAL")" "$ALARM"
  printf -- '- %s: acknowledged (severity %s)\n' "$T_ACK" "$SEVERITY"
  printf -- '- %s: member notice drafted\n' "$T_NOTICE"
  printf -- '- %s: recovery started (scripts/restart-host.sh)\n' "$T_RECOVERY"
  printf -- '- %s: health green (edge 200, alarm OK)\n\n' "$(or_unrecorded "$T_GREEN")"
  printf '## Induced failure\n\n'
  printf 'The web container stopped with docker compose stop web, nginx left up. The edge answered %s on /health/ready.\n\n' "$EDGE_DOWN"
  printf '## Alarm path\n\n'
  printf -- '- Alarm: %s\n- Email arrived: %s\n- Received by: %s\n\n' "$ALARM" "$MAIL_ARRIVED" "$RECEIVED_BY"
  printf '## Commands run\n\n'
  printf -- '- scripts/send-test-alarm.sh --target %s --alarm %s --status --expect ALARM: %s\n' \
    "$TARGET" "$ALARM" "$( [[ -n "$T_SIGNAL" ]] && echo worked || echo 'did not see ALARM' )"
  for line in "${DIAG_RESULTS[@]}"; do printf -- '- %s\n' "$line"; done
  printf -- '- scripts/restart-host.sh --target %s: exit %s\n' "$TARGET" "$RESTART_RC"
  printf -- '- scripts/send-test-alarm.sh --target %s --alarm %s --status --expect OK: %s\n\n' \
    "$TARGET" "$ALARM" "$( [[ -n "$T_GREEN" ]] && echo worked || echo 'did not see OK' )"
  printf '## Member notice (drafted, not sent)\n\n'
  printf '%s' "$NOTICE" | indent_quote
  printf '\n## Response assessment\n\n'
  printf '1. Could detection have been faster?\n2. Could diagnosis have been faster?\n3. Could mitigation have been faster?\n4. Can this class of incident be prevented outright?\n\n'
  printf '## Impact\n\nStaging only, induced for the drill; no member, payment or data affected.\n\n'
  printf '## Root cause\n\nInduced: the web container was stopped.\n\n'
  printf '## Contributing factors and steps that did not work\n\n'
  printf '%s\n' "$CORRECTIONS"
  printf '## Immediate fix\n\nscripts/restart-host.sh --target %s.\n\n' "$TARGET"
  printf '## Prevention measures\n\n'
  printf 'Each correction above, made in the guide in the same pass, with an owner and a due date.\n\n'
  printf '## Lessons learned\n\n'
  printf '## Appendix: diagnostics captured before recovery\n\n'
  cat "$DIAG_OUT"
} > "$WRITEUP"

cr_proved "the drill is written up at ${WRITEUP}"
cr_unproved "the response assessment and lessons in the write-up: those are the operator's to fill in, with the guide corrected in the same pass, before the write-up is committed"
cr_finish
