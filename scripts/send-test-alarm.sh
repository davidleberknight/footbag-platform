#!/usr/bin/env bash
# send-test-alarm.sh -- raise one named alarm briefly so every watcher can confirm
# that alarm mail reaches them.
#
# The go-live gate for alarm mail requires one test alarm received by every
# watcher before the watch window opens. A subscription can be confirmed and
# still deliver nowhere a person reads, so the only proof is a real alarm arriving
# in each inbox. This script sets the named alarm to ALARM and then back to OK,
# which publishes both notifications to its topic exactly as a real breach would.
# It does not change the alarm's definition, and the next evaluation of the metric
# would restore the true state anyway.
#
# What it refuses:
#   - an alarm name outside the environment given (it must start with
#     footbag-<target>-), so a test aimed at staging cannot reach production.
#   - to proceed without the typed confirmation, or without a terminal to type it
#     on, unless --yes is given.
#
# Usage:
#   bash scripts/send-test-alarm.sh --target <staging|production> --alarm <name> [--yes]
#
#   --target  the environment. Required, with no default.
#   --alarm   the CloudWatch alarm to raise. Required, with no default.
#   --yes     proceed without the typed prompt.
#
# Whether the mail arrived is checked by the people receiving it; the script says
# what each should look for. Exits 0 when both state changes were accepted, 1 when
# either was refused, and 2 on a usage error.
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
ALARM=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --alarm)  ALARM="${2:-}";  shift 2 || { echo "ERROR: --alarm requires an argument" >&2; exit 2; } ;;
    --yes)    ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2
if [[ -z "$ALARM" ]]; then
  echo "ERROR: --alarm is required (the CloudWatch alarm to raise)." >&2
  exit 2
fi
if [[ "$ALARM" != "footbag-${TARGET}-"* ]]; then
  echo "ERROR: '${ALARM}' is not one of ${TARGET}'s alarms; its name must start with footbag-${TARGET}-." >&2
  exit 2
fi

AWS_BIN="${FOOTBAG_AWS_BIN:-aws}"
[[ -n "${FOOTBAG_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the account." >&2

aws_profile_ensure || exit 1

echo ""
echo "About to raise the ${TARGET} alarm ${ALARM} to ALARM and then set it back to OK."
echo "  Every subscribed address receives an ALARM mail and then an OK mail."
echo ""
confirm_from_tty "Type 'APPLY' to send the test alarm: " "APPLY" \
  || { echo "Not confirmed; nothing was changed." >&2; exit 1; }

if ! "$AWS_BIN" cloudwatch set-alarm-state --alarm-name "$ALARM" \
      --state-value ALARM --state-reason "Operator test of alarm mail delivery"; then
  echo "FAIL: the alarm could not be raised; check the name and the identity above." >&2
  exit 1
fi
if ! "$AWS_BIN" cloudwatch set-alarm-state --alarm-name "$ALARM" \
      --state-value OK --state-reason "Operator test of alarm mail delivery complete"; then
  echo "FAIL: the alarm was raised but could not be set back to OK; its next evaluation restores the true state." >&2
  exit 1
fi

echo ""
echo "Sent. Each watcher confirms two mails from the notification service about ${ALARM}:"
echo "  one reporting ALARM, then one reporting OK. Record who received both in the cutover log."
exit 0
