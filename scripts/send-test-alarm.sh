#!/usr/bin/env bash
# send-test-alarm.sh -- raise named alarms briefly, one after another, so every
# watcher can confirm that alarm mail reaches them.
#
# The go-live gate for alarm mail requires one test alarm received by every
# watcher before the watch window opens. A subscription can be confirmed and
# still deliver nowhere a person reads, so the only proof is a real alarm arriving
# in each inbox. This script sets each named alarm to ALARM and then back to OK,
# which publishes both notifications to its topic exactly as a real breach would.
# It does not change any alarm's definition, and the next evaluation of the metric
# would restore the true state anyway. A set of new alarms is proved in one run,
# under one confirmation, rather than one command per alarm.
#
# What it refuses:
#   - an alarm name or prefix outside the environment given (it must start with
#     footbag-<target>-), so a test aimed at staging cannot reach production.
#   - a name that is not an alarm, or a prefix that matches none, before anything
#     changes.
#   - to proceed without the typed confirmation, or without a terminal to type it
#     on, unless --yes is given.
# A state change that is refused stops the run there, so no alarm is left raised
# and the ones after it are not touched.
#
# Usage:
#   bash scripts/send-test-alarm.sh --target <staging|production> --alarm <name> [--yes]
#   bash scripts/send-test-alarm.sh --target staging \
#     --alarm-prefix footbag-staging-container- --alarm footbag-staging-site-unavailable
#
#   --target        the environment. Required, with no default.
#   --alarm         a CloudWatch alarm to raise. Repeatable.
#   --alarm-prefix  raise every alarm whose name starts with this. Repeatable.
#                   At least one --alarm or --alarm-prefix is required.
#   --yes           proceed without the typed prompt.
#
# Whether the mail arrived is checked by the people receiving it; the script says
# what each should look for. Exits 0 when every state change was accepted, 1 when
# one was refused, and 2 on a usage error.
#
# Test seam: FOOTBAG_AWS_BIN replaces the AWS CLI for the alarm calls. A run using
# it says so on stderr, because a stubbed run proves nothing about the account.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"

TARGET=""
NAMES=()
PREFIXES=()

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --alarm)  [[ -n "${2:-}" ]] || { echo "ERROR: --alarm requires an argument" >&2; exit 2; }
              NAMES+=("$2"); shift 2 ;;
    --alarm-prefix)
              [[ -n "${2:-}" ]] || { echo "ERROR: --alarm-prefix requires an argument" >&2; exit 2; }
              PREFIXES+=("$2"); shift 2 ;;
    --yes)    ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2
if (( ${#NAMES[@]} + ${#PREFIXES[@]} == 0 )); then
  echo "ERROR: --alarm or --alarm-prefix is required (the CloudWatch alarms to raise)." >&2
  exit 2
fi
for given in "${NAMES[@]+"${NAMES[@]}"}" "${PREFIXES[@]+"${PREFIXES[@]}"}"; do
  if [[ "$given" != "footbag-${TARGET}-"* ]]; then
    echo "ERROR: '${given}' is not one of ${TARGET}'s alarms; its name must start with footbag-${TARGET}-." >&2
    exit 2
  fi
done

# One closing report from here on. Sourced after the usage checks, so a usage
# error keeps its plain exit 2.
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"

AWS_BIN="${FOOTBAG_AWS_BIN:-aws}"
[[ -n "${FOOTBAG_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the account." >&2

aws_profile_ensure || cr_die "the AWS identity for this run could not be settled; nothing was changed"

# Each prefix becomes the alarms it names today, read from the account, so the
# list confirmed below is exactly the list raised.
ALARMS=()
for prefix in "${PREFIXES[@]+"${PREFIXES[@]}"}"; do
  matched=""
  if ! matched="$("$AWS_BIN" cloudwatch describe-alarms --alarm-name-prefix "$prefix" \
        --query 'MetricAlarms[].AlarmName' --output text)"; then
    cr_die "the alarms under ${prefix} could not be listed; check the identity above. Nothing was changed."
  fi
  [[ -n "${matched//[[:space:]]/}" && "$matched" != "None" ]] \
    || cr_die "${TARGET} has no alarm whose name starts with ${prefix}. Nothing was changed."
  read -r -a found <<<"$matched"
  ALARMS+=("${found[@]}")
done
ALARMS+=("${NAMES[@]+"${NAMES[@]}"}")
mapfile -t ALARMS < <(printf '%s\n' "${ALARMS[@]}" | awk 'NF && !seen[$0]++')

# Who receives the mail follows from each alarm's own action list: every alarm
# publishes to the main topic (the account mailbox and the admin console), and a
# critical one to the critical topic as well (the watch group). Read them all
# first, so the operator knows whose inbox to check, and so a name that is not
# an alarm is refused before anything changes.
declare -A REACHES_GROUP=()
for alarm in "${ALARMS[@]}"; do
  actions=""
  if ! actions="$("$AWS_BIN" cloudwatch describe-alarms --alarm-names "$alarm" \
        --query 'MetricAlarms[0].AlarmActions' --output text)"; then
    cr_die "the alarm ${alarm} could not be read; check the name and the identity above. Nothing was changed."
  fi
  if [[ -z "${actions//[[:space:]]/}" || "$actions" == "None" ]]; then
    cr_die "${TARGET} has no alarm named ${alarm}. Nothing was changed."
  fi
  REACHES_GROUP["$alarm"]=0
  [[ "$actions" == *":footbag-${TARGET}-alarms-critical"* ]] && REACHES_GROUP["$alarm"]=1
done

echo ""
echo "About to raise ${#ALARMS[@]} ${TARGET} alarm(s), one after another, each to ALARM and then back to OK:"
any_warning=0
for alarm in "${ALARMS[@]}"; do
  if (( REACHES_GROUP["$alarm"] )); then
    echo "  ${alarm}  (critical: the watch group receives both mails as well)"
  else
    echo "  ${alarm}  (warning: the watch group does not receive it)"
    any_warning=1
  fi
done
echo "  The account mailbox and the admin console receive an ALARM notice and then an OK notice for each."
if (( any_warning )) && (( ${#ALARMS[@]} == 1 )); then
  echo "  To test the group's mail, name a critical alarm such as footbag-${TARGET}-site-unavailable."
fi
echo ""
if ! confirm_from_tty "Type 'APPLY' to send the test alarms: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  cr_unproved "the test alarms: not confirmed, and nothing was changed"
  cr_finish_with 1 ABORTED
fi

for alarm in "${ALARMS[@]}"; do
  if ! "$AWS_BIN" cloudwatch set-alarm-state --alarm-name "$alarm" \
        --state-value ALARM --state-reason "Operator test of alarm mail delivery"; then
    cr_die "${alarm} could not be raised; check the name and the identity above. The alarms after it were not touched."
  fi
  if ! "$AWS_BIN" cloudwatch set-alarm-state --alarm-name "$alarm" \
        --state-value OK --state-reason "Operator test of alarm mail delivery complete"; then
    cr_die "${alarm} was raised but could not be set back to OK; its next evaluation restores the true state. The alarms after it were not touched."
  fi
  cr_proved "${alarm} was set to ALARM and then back to OK"
done

echo ""
echo "Sent. Each watcher confirms two mails from the notification service for each alarm"
echo "  above: one reporting ALARM, then one reporting OK. Record who received both in the cutover log."
cr_unproved "that each watcher received both mails for each alarm: only the watchers can confirm that"
cr_finish
