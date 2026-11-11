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
# The confirmation token reaches the subscribed address and nowhere else, so
# the operator has to open each confirmation email. Run at a terminal, the
# script reads which subscriptions are still pending, says which inbox to open
# and gives the exact search that finds the emails among the alarm mail, and
# offers to send fresh ones, recreating only the pending subscriptions; only a
# typed yes or no answers that question, and the end of input sends nothing.
# The operator then either clicks each email's link
# and presses Enter, and the script reads AWS again, or pastes the links in any
# order. A clicked link confirms the operations mailbox's subscription, which
# then receives alarm mail; a pasted one is confirmed with authentication
# required on unsubscribe, the form the shared group address needs. A link
# piped in without a terminal is confirmed on its own, as one call.
#
# Two subscriptions go through it: the ops-alert group's, which Terraform creates
# once the ops_alert_email value is set, and the account's own operations
# mailbox's, which Terraform recreates when alarm_email_subscription_generation
# is raised, so that its fresh confirmation can be made this way too.
#
# What it refuses:
#   - a link that is not a subscription confirmation link from the service.
#   - a link for any topic other than this environment's alarm topics, and, at
#     the terminal, a link for a topic other than the one asked for.
#   - to proceed without the typed confirmation, or without a terminal to type
#     it on, unless --yes is given.
#
# Usage:
#   bash scripts/confirm-alarm-subscription.sh --target <staging|production> [--yes]
#
#   At a terminal it walks every pending subscription. Piped, it reads one
#   confirmation link from standard input. Each environment has three alarm
#   topics: the main one, which the account mailbox subscribes to; the critical
#   one, which the group subscribes to; and the us-west-2 one AWS Health's
#   backup copy publishes to, which both subscribe to. So each address brings
#   two links per environment.
#
#   --target  the environment whose alarm topic the link must belong to.
#             Required, with no default.
#   --yes     confirm without the typed prompt.
#
# Exits 0 when every subscription it was given is confirmed: with authentication
# required on unsubscribe for a pasted or piped link, or, at a terminal, by a
# click on the operations mailbox's link (including when it already was, and, at
# a terminal, when nothing was pending), 1 when one could not be confirmed or the read-back
# disagrees, 2 on a usage error or a refused piped link, and 3 at a terminal
# when a subscription is still pending at the end because its link was skipped
# or the fresh emails were declined at the resend's APPLY.
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

# The environment's three alarm topics, each with the region it lives in.
TOPIC_SPECS=("us-east-1 footbag-${TARGET}-alarms" "us-east-1 footbag-${TARGET}-alarms-critical" "us-west-2 footbag-${TARGET}-alarms-usw2")

# parse_link <link>: sets TOPIC_ARN, TOKEN, topic_name and region, or PARSE_ERR
# and returns 1. The link carries the topic and the token as query parameters;
# a parser rather than a pattern, because the topic may arrive percent-encoded.
parse_link() {
  local link="$1" parsed verdict
  # A terminal wraps a paste in invisible bracketed-paste markers; drop them,
  # and any other control character or space, before reading the link.
  link="${link//$'\e[200~'/}"; link="${link//$'\e[201~'/}"
  link="$(printf '%s' "$link" | tr -d '[:cntrl:][:space:]')"
  PARSE_ERR=""
  if [[ -z "$link" ]]; then PARSE_ERR="no confirmation link was given."; return 1; fi
  parsed="$(printf '%s' "$link" | python3 -c '
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
    PARSE_ERR="that is not a subscription confirmation link from the notification service."
    return 1
  fi
  topic_name="${TOPIC_ARN##*:}"
  region="$(printf '%s' "$TOPIC_ARN" | cut -d: -f4)"
  case "$topic_name" in
    "footbag-${TARGET}-alarms" | "footbag-${TARGET}-alarms-critical") ;;
    "footbag-${TARGET}-alarms-usw2")
      if [[ "$region" != "us-west-2" ]]; then
        PARSE_ERR="the link names ${TARGET}'s us-west-2 alarm topic in ${region}, where it does not live."
        return 1
      fi
      ;;
    *)
      PARSE_ERR="the link is for topic '${topic_name}', which is not one of ${TARGET}'s alarm topics."
      return 1
      ;;
  esac
  return 0
}

# confirm_parsed: confirms the parsed link with authentication required on
# unsubscribe and proves it by reading the subscription back. Returns 1, with
# the reason in the closing report, when either fails. Neither the link nor its
# token is ever put into the report or through a logged command.
confirm_parsed() {
  local sub_arn attrs pending authenticated endpoint
  if ! sub_arn="$("$AWS_BIN" sns confirm-subscription --region "$region" \
        --topic-arn "$TOPIC_ARN" --token "$TOKEN" \
        --authenticate-on-unsubscribe true \
        --query SubscriptionArn --output text)"; then
    cr_error "the service refused the confirmation for ${topic_name}. AWS deletes an unconfirmed subscription 48 hours after sending its email, and a link from an older email no longer works: bash scripts/reconfirm-alarm-subscriptions.sh --target ${TARGET} --only-pending recreates the pending subscriptions and sends each a fresh confirmation email."
    return 1
  fi
  # The outcome is what the service now holds, not what the call returned.
  if ! attrs="$("$AWS_BIN" sns get-subscription-attributes --region "$region" \
        --subscription-arn "$sub_arn" \
        --query 'Attributes.[PendingConfirmation,ConfirmationWasAuthenticated,Endpoint]' \
        --output text)"; then
    cr_error "${topic_name}: the subscription could not be read back, so its state is unproven."
    return 1
  fi
  read -r pending authenticated endpoint <<< "$attrs"
  echo "Read back: endpoint ${endpoint}, pending ${pending}, authenticated ${authenticated}."
  if [[ "$pending" != "false" || "$authenticated" != "true" ]]; then
    echo "FAIL: the subscription is not confirmed with authentication required on unsubscribe."
    cr_error "the read-back shows ${endpoint} pending ${pending}, authenticated ${authenticated} on ${topic_name}: not confirmed with authentication required on unsubscribe."
    return 1
  fi
  echo "PASS: ${endpoint} is confirmed on ${topic_name}, and only a caller with AWS credentials can unsubscribe it."
  cr_proved "${endpoint} is confirmed on ${topic_name} with authentication required on unsubscribe (read back from the service)"
  return 0
}

# ask_to_confirm: the typed confirmation for the parsed topic. Returns 1 when
# it is not given.
ask_to_confirm() {
  echo ""
  echo "About to confirm the alarm subscription on ${TARGET}:"
  echo "  topic:  ${TOPIC_ARN}"
  echo "  with authentication required on unsubscribe, so the unsubscribe link in"
  echo "  an alarm email cannot remove it; only a caller with AWS credentials can."
  echo ""
  confirm_from_tty "Type 'APPLY' to confirm the subscription: " "APPLY"
}

# ── Piped: one link from standard input ──────────────────────────────────────
if [[ ! -t 0 ]]; then
  LINK=""
  IFS= read -r LINK || true
  parse_link "$LINK" || { echo "ERROR: ${PARSE_ERR}" >&2; exit 2; }

  # One closing report from here on. Sourced after the input checks, so a
  # missing or foreign link keeps its plain exit 2.
  # shellcheck source=lib/closing-report.sh
  source "${REPO_ROOT}/scripts/lib/closing-report.sh"
  aws_profile_ensure || cr_die "the AWS identity for this run could not be settled; nothing was changed"

  if ! ask_to_confirm; then
    echo "Not confirmed; nothing was changed." >&2
    cr_unproved "the subscription: not confirmed, and nothing was changed"
    cr_finish_with 1 ABORTED
  fi
  confirm_parsed || true
  cr_finish
fi

# ── At a terminal: walk every pending subscription ───────────────────────────
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"
aws_profile_ensure || cr_die "the AWS identity for this run could not be settled; nothing was changed"

# The resend: recreates every alarm email subscription so AWS sends a fresh
# confirmation email to each address.
RECONFIRM_BIN="${CONFIRM_RECONFIRM_BIN:-${REPO_ROOT}/scripts/reconfirm-alarm-subscriptions.sh}"
[[ -n "${CONFIRM_RECONFIRM_BIN:-}" ]] && echo "NOTE: using a stand-in for the resend (CONFIRM_RECONFIRM_BIN); this run sends no email." >&2

# read_pending: fills PENDING with each pending subscription as
# "<region> <topic> <topic arn> <address>".
read_pending() {
  local spec t_region t_name topic_arns t_arn subs sub_arn endpoint authenticated
  local errors_before=${#CR_ERRORS[@]}
  PENDING=(); CLICKED=()
  for spec in "${TOPIC_SPECS[@]}"; do
    read -r t_region t_name <<<"$spec"
    if ! topic_arns="$("$AWS_BIN" sns list-topics --region "$t_region" --query 'Topics[].TopicArn' --output text 2>&1)"; then
      cr_error "could not list the ${t_region} topics: ${topic_arns##*$'\n'}"
      continue
    fi
    t_arn="$(tr '\t' '\n' <<<"$topic_arns" | grep -E ":${t_name}$" || [[ $? == 1 ]])"
    [[ -n "$t_arn" ]] || continue
    if ! subs="$("$AWS_BIN" sns list-subscriptions-by-topic --region "$t_region" --topic-arn "$t_arn" \
          --query 'Subscriptions[?Protocol==`email`].[SubscriptionArn,Endpoint]' --output text 2>&1)"; then
      cr_error "could not list the subscriptions of ${t_name}: ${subs##*$'\n'}"
      continue
    fi
    while read -r sub_arn endpoint; do
      [[ -n "$sub_arn" ]] || continue
      if [[ "$sub_arn" == "PendingConfirmation" ]]; then
        PENDING+=("${t_region} ${t_name} ${t_arn} ${endpoint}")
        continue
      fi
      if ! authenticated="$("$AWS_BIN" sns get-subscription-attributes --region "$t_region" --subscription-arn "$sub_arn" \
            --query 'Attributes.ConfirmationWasAuthenticated' --output text 2>&1)"; then
        cr_error "could not read ${t_name}'s subscription for ${endpoint}: ${authenticated##*$'\n'}"
        continue
      fi
      [[ "$authenticated" == "true" ]] || CLICKED+=("${t_name} (${t_region}) for ${endpoint}")
    done <<<"$subs"
  done
  (( ${#CR_ERRORS[@]} > errors_before )) && cr_die "the pending subscriptions could not be read; nothing was changed"
  return 0
}
read_pending

# A subscription confirmed by clicking its email link receives alarm mail, so it
# is confirmed; an unsubscribe click would remove it, and the status read then
# shows it missing.
if (( ${#PENDING[@]} == 0 )); then
  echo "Nothing to confirm: every alarm email subscription on ${TARGET} is confirmed."
  (( ${#CLICKED[@]} )) && printf '  confirmed by clicking the email link: %s\n' "${CLICKED[@]}"
  cr_proved "no alarm email subscription on ${TARGET} is waiting for confirmation"
  cr_finish
fi

addresses="$(printf '%s\n' "${PENDING[@]}" | cut -d' ' -f4 | sort -u | paste -sd, - | sed 's/,/, /g')"
echo ""
echo "${#PENDING[@]} alarm email subscription(s) on ${TARGET} are waiting for you to confirm them:"
n=0
for p in "${PENDING[@]}"; do
  read -r p_region p_name _ p_addr <<<"$p"
  n=$(( n + 1 ))
  printf '  %d. %-34s (%s)  sent to %s\n' "$n" "$p_name" "$p_region" "$p_addr"
done
cat <<EOF

Each one has its own confirmation email from AWS. To find them:
  1. Sign in to the inbox they were sent to: ${addresses}.
  2. Paste this into the search box (in Gmail it also searches Spam):
       from:no-reply@sns.amazonaws.com "Subscription Confirmation" in:anywhere newer_than:2d
     Alarm emails come from the same sender; this search shows only the
     confirmation emails. Each one's text names its topic ("You have chosen to
     subscribe to the topic: ...:<topic name>"); match it to the list above.
     Gmail groups them into one conversation and hides the repeated text,
     link included. If an email shows no "Confirm subscription" link, open
     the email's menu (three dots at its top right), choose "Show original"
     and copy the link that contains ConfirmSubscription.
  3. In each one, click "Confirm subscription", then come back here and press
     Enter: this run reads AWS again and shows what is still waiting. Or, if
     you prefer, right-click "Confirm subscription", choose "Copy link
     address" and paste it here, in any order; a pasted link is confirmed so
     that no unsubscribe link can remove it.

AWS deletes an unconfirmed subscription 48 hours after sending its email, so
an older email's link no longer works, and a deleted email cannot be sent again.
If you do not have every one of these emails from the last 48 hours, this run
can send fresh ones first: it recreates only the pending subscriptions, which
asks its own APPLY, and AWS emails each address again within a few minutes.
EOF
# Only an exact yes or no answers the question; anything else asks again, and
# the end of input changes nothing, since "no" recreates subscriptions.
echo ""
printf 'Do you have a confirmation email from the last 48 hours for every subscription listed above? yes = confirm them now. no = send fresh emails for these %d only: it recreates just these pending subscriptions, so any confirmation link you already have for them stops working, and leaves every confirmed one as it is (it asks its own APPLY first). (yes/no): ' "${#PENDING[@]}"
HAVE=""
while true; do
  if ! IFS= read -r HAVE; then
    # The input has closed, so nothing more can be asked or pasted.
    echo ""
    echo "No answer; nothing was changed, and ${#PENDING[@]} subscription(s) stay pending."
    cr_unproved "no answer to the fresh-email question, so nothing was sent and ${#PENDING[@]} subscription(s) on ${TARGET} stay pending; run bash scripts/confirm-alarm-subscription.sh --target ${TARGET} again"
    cr_finish_with 3 PENDING
  fi
  [[ "$HAVE" == yes || "$HAVE" == no ]] && break
  printf 'Answer yes or no. (yes/no): '
done
if [[ "$HAVE" == no ]]; then
  echo ""
  echo "Sending fresh confirmation emails for the pending subscriptions on ${TARGET}."
  resend_rc=0
  bash "$RECONFIRM_BIN" --target "$TARGET" --only-pending || resend_rc=$?
  if (( resend_rc == 3 )); then
    # The resend's APPLY was not given: nothing changed, and the
    # subscriptions are pending exactly as before.
    echo "Not resent; the subscriptions stay pending."
    cr_unproved "fresh confirmation emails: not sent, so ${#PENDING[@]} subscription(s) on ${TARGET} stay pending; run bash scripts/confirm-alarm-subscription.sh --target ${TARGET} again to send them"
    cr_finish_with 3 PENDING
  fi
  if (( resend_rc != 0 )); then
    cr_die "the fresh confirmation emails were not sent (the resend above stopped, exit ${resend_rc}); nothing was confirmed"
  fi
  read_pending
  if (( ${#PENDING[@]} == 0 )); then
    cr_die "the resend finished, but no subscription on ${TARGET} reads pending, so there is no fresh email to confirm"
  fi
  echo ""
  echo "Fresh confirmation emails were sent at $(date +%H:%M) your time ($(date -u +%H:%M) UTC) to"
  echo "${addresses}; they usually arrive within a few minutes. Use only emails"
  echo "received after that time: every older link points at a subscription that no longer exists."
fi

# WAITING holds the subscriptions not yet confirmed, in any order. A pasted link
# confirms its own topic; Enter reads AWS again, which picks up a clicked link.
# A second Enter that finds nothing new, or the end of input, stops the walk.
WAITING=("${PENDING[@]}")
idle=0
while (( ${#WAITING[@]} )); do
  echo ""
  echo "Waiting for (in any order):"
  for w in "${WAITING[@]}"; do
    read -r w_region w_name _ w_addr <<<"$w"
    printf '  %-34s (%s)  to %s\n' "$w_name" "$w_region" "$w_addr"
  done
  printf 'Press Enter once you have clicked the links, or paste a link: '
  LINK=""
  if ! IFS= read -r LINK; then
    break
  fi
  if [[ -z "${LINK//[[:space:]]/}" ]]; then
    before=${#WAITING[@]}
    read_pending
    still=()
    for w in "${WAITING[@]}"; do
      w_arn="$(cut -d' ' -f3 <<<"$w")"
      for p in "${PENDING[@]}"; do
        [[ "$(cut -d' ' -f3 <<<"$p")" == "$w_arn" ]] && { still+=("$w"); break; }
      done
    done
    WAITING=("${still[@]}")
    if (( ${#WAITING[@]} < before )); then
      idle=0
      echo "AWS now reads $(( before - ${#WAITING[@]} )) more of them confirmed."
    else
      idle=$(( idle + 1 ))
      (( idle >= 2 )) && break
      echo "Nothing new is confirmed yet. Click the remaining links, then press Enter; press Enter again to stop for now."
    fi
    continue
  fi
  idle=0
  if ! parse_link "$LINK"; then
    echo "That link was not used: ${PARSE_ERR} Copy the link again and paste it."
    continue
  fi
  match=-1
  for k in "${!WAITING[@]}"; do
    [[ "$(cut -d' ' -f3 <<<"${WAITING[$k]}")" == "$TOPIC_ARN" ]] && { match=$k; break; }
  done
  if (( match < 0 )); then
    echo "That link is for ${topic_name} (${region}), which is not waiting to be confirmed. Paste the link from one of the emails listed."
    continue
  fi
  if ! ask_to_confirm; then
    echo "Not confirmed; ${topic_name} stays pending."
    continue
  fi
  if confirm_parsed; then
    unset 'WAITING[match]'
    WAITING=("${WAITING[@]}")
  fi
done

STILL_PENDING=()
for w in "${WAITING[@]}"; do STILL_PENDING+=("$(cut -d' ' -f2 <<<"$w")"); done

if (( ${#STILL_PENDING[@]} )); then
  echo ""
  echo "Still pending: ${STILL_PENDING[*]}."
  echo "To get fresh confirmation emails for only these, run"
  echo "  bash scripts/reconfirm-alarm-subscriptions.sh --target ${TARGET} --only-pending"
  echo "and then this script again within 48 hours."
  cr_unproved "still pending: ${STILL_PENDING[*]}; fresh emails come from bash scripts/reconfirm-alarm-subscriptions.sh --target ${TARGET} --only-pending"
  (( ${#CR_ERRORS[@]} )) && cr_finish
  cr_finish_with 3 PENDING
fi
cr_finish
