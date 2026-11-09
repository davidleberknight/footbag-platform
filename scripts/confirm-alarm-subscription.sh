#!/usr/bin/env bash
# confirm-alarm-subscription.sh -- confirm an email subscription to an alarm
# topic so that no one can remove it by clicking a link.
#
# Every alarm email the notification service sends carries an unsubscribe link.
# On a subscription confirmed by clicking the link in the confirmation email,
# anyone who clicks that unsubscribe link removes the subscription, and on a
# group address that is every member of the group, silently and for everyone.
# The service offers one protection: a subscription confirmed through its API
# with authentication required on unsubscribe can only be removed by a caller
# holding AWS credentials. This script is that confirmation, and it proves the
# result by reading the subscription back.
#
# Two subscriptions go through it: the ops-alert group's, which Terraform creates
# once the ops_alert_email value is set, and the account's own operations
# mailbox's, which Terraform recreates when alarm_email_subscription_generation
# is raised, so that its fresh confirmation can be made this way too.
#
# What it refuses:
#   - a link that is not a subscription confirmation link from the service.
#   - a link for any topic other than this environment's alarm topics.
#   - to proceed without the typed confirmation, or without a terminal to type
#     it on, unless --yes is given.
#
# Usage:
#   bash scripts/confirm-alarm-subscription.sh --target <staging|production> [--yes]
#
#   The confirmation link from the email is read from standard input: paste it
#   at the prompt, or pipe it in. Run it once per confirmation email, each with
#   that topic's own link. Each environment has three alarm topics: the main
#   one, which the account mailbox subscribes to; the critical one, which the
#   group subscribes to; and the us-west-2 one AWS Health's backup copy
#   publishes to, which both subscribe to. So each address brings two links per
#   environment.
#
#   --target  the environment whose alarm topic the link must belong to.
#             Required, with no default.
#   --yes     confirm without the typed prompt.
#
# Exits 0 when the subscription is confirmed with authentication required on
# unsubscribe (including when it already was), 1 when it could not be confirmed
# or the read-back disagrees, and 2 on a usage error or a refused link.
#
# Test seam: FOOTBAG_AWS_BIN replaces the AWS CLI for the subscription calls. A
# run using it says so on stderr, because a stubbed run proves nothing about the
# account.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"

TARGET=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --yes)    ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

AWS_BIN="${FOOTBAG_AWS_BIN:-aws}"
[[ -n "${FOOTBAG_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the account." >&2

if [[ -t 0 ]]; then
  printf 'Paste the "Confirm subscription" link from the email: ' >&2
fi
LINK=""
IFS= read -r LINK || true
LINK="${LINK//[[:space:]]/}"
if [[ -z "$LINK" ]]; then
  echo "ERROR: no confirmation link was given." >&2
  exit 2
fi

# The link carries the topic and the token as query parameters. A parser rather
# than a pattern, because the topic may arrive percent-encoded.
parsed="$(printf '%s' "$LINK" | python3 -c '
import sys, urllib.parse
u = urllib.parse.urlsplit(sys.stdin.read())
q = urllib.parse.parse_qs(u.query)
host = u.hostname or ""
ok = u.scheme == "https" and host.startswith("sns.") and host.endswith(".amazonaws.com")
topic = (q.get("TopicArn") or [""])[0]
token = (q.get("Token") or [""])[0]
print("ok" if ok and topic and token else "bad")
print(topic)
print(token)
')"
verdict="$(printf '%s\n' "$parsed" | sed -n 1p)"
TOPIC_ARN="$(printf '%s\n' "$parsed" | sed -n 2p)"
TOKEN="$(printf '%s\n' "$parsed" | sed -n 3p)"
if [[ "$verdict" != "ok" ]]; then
  echo "ERROR: that is not a subscription confirmation link from the notification service." >&2
  exit 2
fi

topic_name="${TOPIC_ARN##*:}"
region="$(printf '%s' "$TOPIC_ARN" | cut -d: -f4)"
case "$topic_name" in
  "footbag-${TARGET}-alarms" | "footbag-${TARGET}-alarms-critical") ;;
  "footbag-${TARGET}-alarms-usw2")
    if [[ "$region" != "us-west-2" ]]; then
      echo "ERROR: the link names ${TARGET}'s us-west-2 alarm topic in ${region}, where it does not live." >&2
      exit 2
    fi
    ;;
  *)
    echo "ERROR: the link is for topic '${topic_name}', which is not one of ${TARGET}'s alarm topics." >&2
    exit 2
    ;;
esac

# One closing report from here on. Sourced after the input checks, so a missing
# or foreign link keeps its plain exit 2. Neither the link nor its token is ever
# put into the report or through a logged command.
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"

aws_profile_ensure || cr_die "the AWS identity for this run could not be settled; nothing was changed"

echo ""
echo "About to confirm the alarm subscription on ${TARGET}:"
echo "  topic:  ${TOPIC_ARN}"
echo "  with authentication required on unsubscribe, so the unsubscribe link in"
echo "  an alarm email cannot remove it; only a caller with AWS credentials can."
echo ""
if ! confirm_from_tty "Type 'APPLY' to confirm the subscription: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  cr_unproved "the subscription: not confirmed, and nothing was changed"
  cr_finish_with 1 ABORTED
fi

sub_arn=""
if ! sub_arn="$("$AWS_BIN" sns confirm-subscription --region "$region" \
      --topic-arn "$TOPIC_ARN" --token "$TOKEN" \
      --authenticate-on-unsubscribe true \
      --query SubscriptionArn --output text)"; then
  cr_die "the service refused the confirmation. A token lasts three days; an expired one needs a fresh confirmation email: bash scripts/reconfirm-alarm-subscriptions.sh --target ${TARGET} recreates the subscriptions and sends one."
fi

# The outcome is what the service now holds, not what the call returned.
attrs=""
if ! attrs="$("$AWS_BIN" sns get-subscription-attributes --region "$region" \
      --subscription-arn "$sub_arn" \
      --query 'Attributes.[PendingConfirmation,ConfirmationWasAuthenticated,Endpoint]' \
      --output text)"; then
  cr_die "the subscription could not be read back, so its state is unproven."
fi
read -r pending authenticated endpoint <<< "$attrs"
echo "Read back: endpoint ${endpoint}, pending ${pending}, authenticated ${authenticated}."
if [[ "$pending" != "false" || "$authenticated" != "true" ]]; then
  echo "FAIL: the subscription is not confirmed with authentication required on unsubscribe."
  cr_die "the read-back shows ${endpoint} pending ${pending}, authenticated ${authenticated}: not confirmed with authentication required on unsubscribe."
fi
echo "PASS: ${endpoint} is confirmed on ${topic_name}, and only a caller with AWS credentials can unsubscribe it."
cr_proved "${endpoint} is confirmed on ${topic_name} with authentication required on unsubscribe (read back from the service)"
cr_finish
