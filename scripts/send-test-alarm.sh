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
#   --region        us-east-1 or us-west-2: where the alarms live. Default the
#                   identity's own region. The backup region holds the alarms on
#                   metrics AWS publishes only there (S3 replication backlog and
#                   latency), which notify the backup region's alarm topic.
#   --yes           proceed without the typed prompt.
#   --status        read the named alarms' states and change nothing: no prompt,
#                   no state set. Proves an alarm watching its metric reads OK, or
#                   that a real breach (not a test raise) reached ALARM.
#   --expect <OK|ALARM>  with --status: every named alarm must read this state.
#   --wait-minutes <n>   with --expect: read again every minute until every
#                   alarm reads the state or n minutes pass. Default 0, one read.
#   --metric <name> with --status, instead of alarm names: read the
#                   environment's own metric (namespace Footbag/<target>) and
#                   pass once it has counted anything above zero in the last
#                   fifteen minutes, reading again every minute for up to
#                   --wait-minutes. Proves a metric filter matches a real event,
#                   such as a sign-in counted by LoginSuccessCount.
#
# Test alarms are raised one after another with a second's pause between them:
# the email service suspends a subscription that receives more than ten
# messages a second, for 30 days.
#
# Whether the mail arrived is checked by the people receiving it; the script says
# what each should look for. Exits 0 when every state change was accepted, 1 when
# one was refused, and 2 on a usage error. --status exits 0 when every alarm reads
# the expected state (or, with no --expect, when every state was read), 3 when
# one still does not once the wait is over, 1 when a read fails.
#
# Test seams: FOOTBAG_AWS_BIN replaces the AWS CLI for the alarm calls. A run using
# it says so on stderr, because a stubbed run proves nothing about the account.
# FOOTBAG_ALARM_POLL_SECS replaces the minute between --status reads.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"

TARGET=""
NAMES=()
PREFIXES=()
REGION_ARGS=()
STATUS=0
EXPECT=""
WAIT_MINUTES=0
METRIC=""

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
    --region) case "${2:-}" in
                us-east-1|us-west-2) REGION_ARGS=(--region "$2"); shift 2 ;;
                *) echo "ERROR: --region must be us-east-1 or us-west-2" >&2; exit 2 ;;
              esac ;;
    --yes)    ASSUME_YES="yes"; shift ;;
    --status) STATUS=1; shift ;;
    --expect) case "${2:-}" in
                OK|ALARM) EXPECT="$2"; shift 2 ;;
                *) echo "ERROR: --expect must be OK or ALARM" >&2; exit 2 ;;
              esac ;;
    --wait-minutes)
              [[ "${2:-}" =~ ^[0-9]+$ ]] || { echo "ERROR: --wait-minutes takes a whole number of minutes" >&2; exit 2; }
              WAIT_MINUTES="$2"; shift 2 ;;
    --metric) [[ "${2:-}" =~ ^[A-Za-z0-9]+$ ]] || { echo "ERROR: --metric takes a metric name of letters and digits" >&2; exit 2; }
              METRIC="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

# ── Metric read: has the environment's metric counted anything lately ────────
if [[ -n "$METRIC" ]]; then
  (( STATUS )) || { echo "ERROR: --metric reads a metric, so it needs --status." >&2; exit 2; }
  if (( ${#NAMES[@]} + ${#PREFIXES[@]} )) || [[ -n "$EXPECT" ]]; then
    echo "ERROR: --metric reads a metric, not alarms; it takes no --alarm, --alarm-prefix or --expect." >&2
    exit 2
  fi
  # shellcheck source=lib/closing-report.sh
  source "${REPO_ROOT}/scripts/lib/closing-report.sh"
  AWS_BIN="${FOOTBAG_AWS_BIN:-aws}"
  [[ -n "${FOOTBAG_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the account." >&2
  aws_profile_ensure || cr_die "the AWS identity for this run could not be settled; nothing was read"
  POLL_SECS="${FOOTBAG_ALARM_POLL_SECS:-60}"
  [[ -n "${FOOTBAG_ALARM_POLL_SECS:-}" ]] && echo "NOTE: reading every ${POLL_SECS}s rather than every minute (test seam)." >&2
  namespace="Footbag/${TARGET}"
  deadline=$(( SECONDS + WAIT_MINUTES * 60 ))
  counted=0
  while :; do
    start="$(date -u -d '-15 minutes' +%Y-%m-%dT%H:%M:%SZ)"
    end="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    sums=""
    if ! sums="$("$AWS_BIN" cloudwatch get-metric-statistics "${REGION_ARGS[@]+"${REGION_ARGS[@]}"}" \
          --namespace "$namespace" --metric-name "$METRIC" --statistics Sum --period 60 \
          --start-time "$start" --end-time "$end" --query 'Datapoints[].Sum' --output text)"; then
      cr_die "${namespace} ${METRIC} could not be read; check the identity above"
    fi
    echo "  ${namespace} ${METRIC}, last 15 minutes: ${sums:-None}"
    # A sum is a non-negative number; anything but zero counts.
    for s in $sums; do
      [[ "$s" =~ ^[0-9]+(\.[0-9]+)?$ && ! "$s" =~ ^0+(\.0+)?$ ]] && counted=1
    done
    (( counted )) && break
    (( SECONDS < deadline )) || break
    echo "  waiting for ${METRIC} to count something"
    sleep "$POLL_SECS"
  done
  if (( ! counted )); then
    cr_unproved "${namespace} ${METRIC} counted nothing in the last 15 minutes"
    cr_finish_with 3 "NOT COUNTED"
  fi
  cr_proved "${namespace} ${METRIC} counted an event in the last 15 minutes"
  cr_finish
fi

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
if [[ -n "$EXPECT" ]] && (( ! STATUS )); then
  echo "ERROR: --expect reads a state, so it needs --status." >&2
  exit 2
fi
if (( WAIT_MINUTES > 0 )) && [[ -z "$EXPECT" ]]; then
  echo "ERROR: --wait-minutes waits for a state, so it needs --expect." >&2
  exit 2
fi

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
  if ! matched="$("$AWS_BIN" cloudwatch describe-alarms "${REGION_ARGS[@]+"${REGION_ARGS[@]}"}" --alarm-name-prefix "$prefix" \
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
  if ! actions="$("$AWS_BIN" cloudwatch describe-alarms "${REGION_ARGS[@]+"${REGION_ARGS[@]}"}" --alarm-names "$alarm" \
        --query 'MetricAlarms[0].AlarmActions' --output text)"; then
    cr_die "the alarm ${alarm} could not be read; check the name and the identity above. Nothing was changed."
  fi
  if [[ -z "${actions//[[:space:]]/}" || "$actions" == "None" ]]; then
    cr_die "${TARGET} has no alarm named ${alarm}. Nothing was changed."
  fi
  REACHES_GROUP["$alarm"]=0
  # The backup region's topic carries the watch group's subscription as the
  # critical topic does.
  [[ "$actions" == *":footbag-${TARGET}-alarms-critical"* || "$actions" == *":footbag-${TARGET}-alarms-usw2"* ]] \
    && REACHES_GROUP["$alarm"]=1
done

# ── Status: read each alarm's state, changing nothing ───────────────────────
if (( STATUS )); then
  POLL_SECS="${FOOTBAG_ALARM_POLL_SECS:-60}"
  [[ -n "${FOOTBAG_ALARM_POLL_SECS:-}" ]] && echo "NOTE: reading every ${POLL_SECS}s rather than every minute (test seam)." >&2
  deadline=$(( SECONDS + WAIT_MINUTES * 60 ))
  while :; do
    waiting=()
    for alarm in "${ALARMS[@]}"; do
      state=""
      if ! state="$("$AWS_BIN" cloudwatch describe-alarms "${REGION_ARGS[@]+"${REGION_ARGS[@]}"}" --alarm-names "$alarm" \
            --query 'MetricAlarms[0].StateValue' --output text)"; then
        cr_die "the state of ${alarm} could not be read; check the identity above"
      fi
      echo "  ${alarm}: ${state}"
      [[ -n "$EXPECT" && "$state" != "$EXPECT" ]] && waiting+=("${alarm} (${state})")
    done
    (( ${#waiting[@]} == 0 )) && break
    (( SECONDS < deadline )) || break
    echo "  waiting for ${EXPECT}: ${waiting[*]}"
    sleep "$POLL_SECS"
  done
  if (( ${#waiting[@]} )); then
    cr_unproved "${EXPECT} on every alarm; still not: ${waiting[*]}"
    cr_finish_with 3 "NOT ${EXPECT}"
  fi
  if [[ -n "$EXPECT" ]]; then
    cr_proved "every named alarm reads ${EXPECT}"
  else
    cr_proved "every named alarm's state was read"
  fi
  cr_finish
fi

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

raised=0
for alarm in "${ALARMS[@]}"; do
  # A second between alarms keeps each subscriber well under the email
  # service's ten messages a second, above which it suspends the subscription.
  (( raised )) && sleep 1
  raised=1
  if ! "$AWS_BIN" cloudwatch set-alarm-state "${REGION_ARGS[@]+"${REGION_ARGS[@]}"}" --alarm-name "$alarm" \
        --state-value ALARM --state-reason "Operator test of alarm mail delivery"; then
    cr_die "${alarm} could not be raised; check the name and the identity above. The alarms after it were not touched."
  fi
  if ! "$AWS_BIN" cloudwatch set-alarm-state "${REGION_ARGS[@]+"${REGION_ARGS[@]}"}" --alarm-name "$alarm" \
        --state-value OK --state-reason "Operator test of alarm mail delivery complete"; then
    cr_die "${alarm} was raised but could not be set back to OK; its next evaluation restores the true state. The alarms after it were not touched."
  fi
  cr_proved "${alarm} was set to ALARM and then back to OK"
done

echo ""
echo "Sent. For each alarm above, every watcher should receive two emails from AWS"
echo "  Notifications (no-reply@sns.amazonaws.com): a subject starting ALARM: and then"
echo "  one starting OK:, each followed by the alarm's name. They can take a few minutes."
echo "  Record who received both in the cutover log."
cr_unproved "that each watcher received both mails for each alarm: only the watchers can confirm that"
cr_finish
