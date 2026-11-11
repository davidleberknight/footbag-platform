#!/usr/bin/env bash
# reconfirm-alarm-subscriptions.sh -- find alarm email subscriptions confirmed by
# a click, and recreate them so they can be confirmed the safe way.
#
# A subscription confirmed by clicking the link in its confirmation email can be
# removed by anyone who clicks the unsubscribe link in any alarm email, silently.
# One confirmed through the service's API with authentication required on
# unsubscribe can be removed only by a caller holding AWS credentials;
# scripts/confirm-alarm-subscription.sh makes that confirmation. A clicked
# subscription cannot be converted: it has to be recreated, which Terraform does
# for every alarm email subscription when alarm_email_subscription_generation is
# raised, and each fresh confirmation link is then confirmed through that script.
#
# Three modes:
#   --status   Read-only. Lists every email subscription on this environment's
#              three alarm topics (main and critical in us-east-1, the Health
#              topic in us-west-2) and reports each as authenticated, clicked or
#              pending. A pending one is a warning in the closing report, and so
#              is a clicked one on the shared group's address: any member of the
#              group can remove it for everyone. The group is the address on the
#              critical topic, which only the group subscribes to. A click on the
#              operations mailbox counts as confirmed and is listed, not warned.
#              The operations mailbox is the address on the main topic; a main
#              topic with no email subscription, or a us-west-2 topic without
#              that address, is an error, because no alarm there reaches anyone.
#              The critical topic has no subscriber until the group exists.
#   --only-pending
#              Recreates only the subscriptions still pending, each by its own
#              Terraform address through scripts/terraform-apply.sh --replace,
#              so AWS sends each a fresh confirmation email while the confirmed
#              ones keep receiving alarm mail. One typed APPLY covers them all;
#              a production apply then shows its plan and asks again. The
#              values file is not touched. A pending subscription on the
#              us-west-2 topic belongs to the operations mailbox when its
#              address is the main topic's, and to the group when it is the
#              critical topic's; any other address is refused.
#   (default)  Raises alarm_email_subscription_generation by one in the
#              environment's values file, shown as a diff and confirmed with a
#              typed APPLY, then applies the tree. Every alarm email
#              subscription is recreated and its address sent a fresh
#              confirmation email; alarm mail to those addresses pauses until
#              each link is confirmed. The run ends naming the confirm script.
#
# What it refuses: a values file it cannot read; a generation line that is not a
# whole number; a run without the typed APPLY (or --yes).
#
# Usage:
#   bash scripts/reconfirm-alarm-subscriptions.sh --target staging --status
#   bash scripts/reconfirm-alarm-subscriptions.sh --target production --only-pending
#   bash scripts/reconfirm-alarm-subscriptions.sh --target production
#
# Flags:
#   --target staging|production  Required, no default.
#   --status                     The read-only report above.
#   --only-pending               Recreate only the pending subscriptions.
#   --yes                        Accept the APPLY confirmation without asking.
#   --tfvars <path>              CI only; a scratch values file, stopping before
#                                the apply.
#
# Test seams (each announced on stderr):
#   RECONFIRM_AWS_BIN        replaces the aws CLI for the status reads
#   RECONFIRM_TERRAFORM      replaces scripts/terraform-apply.sh
#
# Exit: 0 done (or every subscription authenticated), 1 refused or failed,
# 2 usage error; --status also exits 3 while any subscription is pending, else
# 4 while any was confirmed by a click; --only-pending exits 3 when its APPLY
# is not given, since nothing changed and the subscriptions are still pending.
set -euo pipefail

TARGET=""
STATUS=0
ONLY_PENDING=0
TFVARS_OVERRIDE=""
WANT_ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --status) STATUS=1; shift ;;
    --only-pending) ONLY_PENDING=1; shift ;;
    --tfvars) TFVARS_OVERRIDE="${2:-}"; shift 2 || { echo "ERROR: --tfvars requires an argument" >&2; exit 2; } ;;
    --yes) WANT_ASSUME_YES=1; shift ;;
    --help|-h) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# The library clears ASSUME_YES when sourced, so only this flag can set it.
(( WANT_ASSUME_YES )) && ASSUME_YES="yes"

require_target "$TARGET" staging production || exit 2

AWS_BIN="${RECONFIRM_AWS_BIN:-aws}"
[[ -n "${RECONFIRM_AWS_BIN:-}" ]] && echo "SYNTHETIC: aws seam '${AWS_BIN}' -- this run proves nothing about the estate." >&2
TERRAFORM_CMD="${RECONFIRM_TERRAFORM:-${SCRIPT_DIR}/terraform-apply.sh}"
[[ -n "${RECONFIRM_TERRAFORM:-}" ]] && echo "SYNTHETIC: terraform seam '${TERRAFORM_CMD}' -- no estate is reached." >&2

(( STATUS + ONLY_PENDING < 2 )) || { echo "ERROR: --status and --only-pending are separate modes" >&2; exit 2; }
(( ONLY_PENDING )) && [[ -n "$TFVARS_OVERRIDE" ]] && { echo "ERROR: --only-pending touches no values file, so it takes no --tfvars" >&2; exit 2; }

MAIN_TOPIC="footbag-${TARGET}-alarms"
CRITICAL_TOPIC="footbag-${TARGET}-alarms-critical"
WEST_TOPIC="footbag-${TARGET}-alarms-usw2"

# read_subscriptions: fills SUB_ROWS with one "<topic> <region> <state>
# <address>" per email subscription on the three alarm topics, where state is
# pending, authenticated or clicked; prints a line for a topic that is missing
# or has none; and counts the topics found in TOPICS_READ. A failed read is an
# error, never an empty topic. The topics are read main, critical, then
# us-west-2, so the main and critical addresses are known by the time a
# us-west-2 subscription is judged.
SUB_ROWS=()
TOPICS_READ=0
read_subscriptions() {
  local spec region name topic_arns topic_arn subs sub_arn endpoint authenticated state
  for spec in "us-east-1 ${MAIN_TOPIC}" "us-east-1 ${CRITICAL_TOPIC}" "us-west-2 ${WEST_TOPIC}"; do
    read -r region name <<<"$spec"
    if ! topic_arns="$("$AWS_BIN" sns list-topics --region "$region" --query 'Topics[].TopicArn' --output text 2>&1)"; then
      cr_error "could not list the ${region} topics: ${topic_arns##*$'\n'}"
      continue
    fi
    topic_arn="$(tr '\t' '\n' <<<"$topic_arns" | grep -E ":${name}$" || [[ $? == 1 ]])"
    if [[ -z "$topic_arn" ]]; then
      echo "  ${name} (${region}): no such topic"
      continue
    fi
    TOPICS_READ=$(( TOPICS_READ + 1 ))
    if ! subs="$("$AWS_BIN" sns list-subscriptions-by-topic --region "$region" --topic-arn "$topic_arn" \
          --query 'Subscriptions[?Protocol==`email`].[SubscriptionArn,Endpoint]' --output text 2>&1)"; then
      cr_error "could not list the subscriptions of ${name}: ${subs##*$'\n'}"
      continue
    fi
    [[ -n "$subs" ]] || { echo "  ${name}: no email subscriptions"; continue; }
    while read -r sub_arn endpoint; do
      [[ -n "$sub_arn" ]] || continue
      if [[ "$sub_arn" == "PendingConfirmation" ]]; then
        SUB_ROWS+=("${name} ${region} pending ${endpoint}")
        continue
      fi
      if ! authenticated="$("$AWS_BIN" sns get-subscription-attributes --region "$region" --subscription-arn "$sub_arn" \
            --query 'Attributes.ConfirmationWasAuthenticated' --output text 2>&1)"; then
        cr_error "could not read ${name}'s subscription for ${endpoint}: ${authenticated##*$'\n'}"
        continue
      fi
      state=clicked
      [[ "$authenticated" == "true" ]] && state=authenticated
      SUB_ROWS+=("${name} ${region} ${state} ${endpoint}")
    done <<<"$subs"
  done
}

# address_on <topic>: the first email address subscribed to that topic, or
# nothing. On the main topic it is the operations mailbox.
address_on() {
  local row r_name r_endpoint
  for row in "${SUB_ROWS[@]+"${SUB_ROWS[@]}"}"; do
    read -r r_name _ _ r_endpoint <<<"$row"
    [[ "$r_name" == "$1" ]] && { printf '%s\n' "$r_endpoint"; return 0; }
  done
  return 0
}

# has_subscription <topic> <address>
has_subscription() {
  local row r_name r_endpoint
  for row in "${SUB_ROWS[@]+"${SUB_ROWS[@]}"}"; do
    read -r r_name _ _ r_endpoint <<<"$row"
    [[ "$r_name" == "$1" && "$r_endpoint" == "$2" ]] && return 0
  done
  return 1
}

if (( STATUS || ONLY_PENDING )) && [[ -z "${RECONFIRM_AWS_BIN:-}" ]]; then
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  aws_profile_ensure || cr_die "no AWS identity is available for the read"
fi

# ── Recreate only the pending subscriptions ─────────────────────────────────
if (( ONLY_PENDING )); then
  read_subscriptions
  (( ${#CR_ERRORS[@]} )) && cr_die "the ${TARGET} alarm subscriptions could not be read; nothing was changed"
  mailbox="$(address_on "$MAIN_TOPIC")"
  group="$(address_on "$CRITICAL_TOPIC")"
  ADDRS=()
  DESCS=()
  for row in "${SUB_ROWS[@]+"${SUB_ROWS[@]}"}"; do
    read -r name region state endpoint <<<"$row"
    [[ "$state" == pending ]] || continue
    case "$name" in
      "$MAIN_TOPIC") addr="aws_sns_topic_subscription.alarm_email" ;;
      "$CRITICAL_TOPIC") addr="aws_sns_topic_subscription.alarm_ops_alert[0]" ;;
      *)
        if [[ -n "$mailbox" && "$endpoint" == "$mailbox" ]]; then
          addr="aws_sns_topic_subscription.alarm_email_us_west_2"
        elif [[ -n "$group" && "$endpoint" == "$group" ]]; then
          addr="aws_sns_topic_subscription.alarm_ops_alert_us_west_2[0]"
        else
          cr_die "the pending subscription for ${endpoint} on ${name} matches neither the main topic's address nor the critical topic's, so which resource it belongs to is unknown; nothing was changed"
        fi
        ;;
    esac
    ADDRS+=("$addr")
    DESCS+=("${name} (${region}) for ${endpoint}")
  done

  if (( ${#ADDRS[@]} == 0 )); then
    echo "No alarm email subscription on ${TARGET} is pending, so none is recreated."
    cr_proved "no alarm email subscription on ${TARGET} is pending; none was recreated"
    cr_finish
  fi

  echo ""
  echo "These alarm email subscriptions on ${TARGET} are pending and will be recreated:"
  printf '  %s\n' "${DESCS[@]}"
  echo ""
  echo "AWS sends each a fresh confirmation email within a few minutes. Any"
  echo "confirmation link you already have for them stops working. Every"
  echo "confirmed subscription is left as it is and keeps receiving alarm mail."
  [[ "$TARGET" == production ]] && echo "Each production apply then shows its plan and asks for APPLY again."
  if ! confirm_from_tty "Type 'APPLY' to recreate the ${#ADDRS[@]} pending subscription(s): " "APPLY"; then
    echo "Not recreated; the subscriptions stay pending and nothing was changed."
    cr_unproved "the resend: not confirmed, so nothing was recreated and ${#ADDRS[@]} subscription(s) on ${TARGET} stay pending"
    cr_finish_with 3 PENDING
  fi

  # Each apply runs at the terminal, outside cr_run: it shows a plan and, on
  # production, asks for its own APPLY.
  for addr in "${ADDRS[@]}"; do
    bash "$TERRAFORM_CMD" --target "$TARGET" --replace "$addr" \
      || cr_die "the ${TARGET} apply replacing ${addr} did not succeed; any subscription it reached may already be recreated, which the walk reads again"
  done
  cr_proved "recreated the pending ${TARGET} alarm subscriptions, and only those: ${ADDRS[*]}"
  cr_unproved "the confirmations: each address now holds a fresh confirmation email"
  echo ""
  echo "Fresh confirmation emails are on their way. Confirm them with:"
  echo "  bash scripts/confirm-alarm-subscription.sh --target ${TARGET}"
  cr_finish
fi

# ── Status: read every email subscription on the three alarm topics ──────────
if (( STATUS )); then
  read_subscriptions
  pending=0
  clicked=0
  group_addresses=" "
  for row in "${SUB_ROWS[@]+"${SUB_ROWS[@]}"}"; do
    read -r name _ _ endpoint <<<"$row"
    [[ "$name" == "$CRITICAL_TOPIC" ]] && group_addresses+="${endpoint} "
  done
  for row in "${SUB_ROWS[@]+"${SUB_ROWS[@]}"}"; do
    read -r name _ state endpoint <<<"$row"
    case "$state" in
      pending)
        cr_warn "${name}: ${endpoint} is pending confirmation; confirm its link with bash scripts/confirm-alarm-subscription.sh --target ${TARGET}"
        pending=$(( pending + 1 ))
        ;;
      authenticated)
        echo "  ${name}: ${endpoint} authenticated"
        ;;
      *)
        if [[ "$group_addresses" == *" ${endpoint} "* ]]; then
          cr_warn "${name}: ${endpoint} was confirmed by a click, so an unsubscribe link can remove it; recreate it with bash scripts/reconfirm-alarm-subscriptions.sh --target ${TARGET}"
        else
          echo "  ${name}: ${endpoint} confirmed by a click, which counts for the operations mailbox"
        fi
        clicked=$(( clicked + 1 ))
        ;;
    esac
  done
  (( TOPICS_READ > 0 )) || cr_error "none of the ${TARGET} alarm topics was found"
  # The operations mailbox must be on the main topic and the us-west-2 one: an
  # unsubscribe click removes a clicked subscription silently, and a missing
  # one is a topic whose alarms reach no one. Judged only on a complete read.
  if (( ${#CR_ERRORS[@]} == 0 )); then
    mailbox="$(address_on "$MAIN_TOPIC")"
    if [[ -z "$mailbox" ]]; then
      cr_error "${MAIN_TOPIC} has no email subscription for the operations mailbox, so its alarms reach no one; bash scripts/terraform-apply.sh --target ${TARGET} recreates it"
    elif ! has_subscription "$WEST_TOPIC" "$mailbox"; then
      cr_error "${WEST_TOPIC} has no subscription for the operations mailbox ${mailbox}, so its alarms reach no one there; bash scripts/terraform-apply.sh --target ${TARGET} recreates it"
    fi
  fi
  cr_proved "read every email subscription on the ${TARGET} alarm topics found"
  # A caller branches on these: a failed read stays exit 1, since nothing was
  # proved; pending outranks clicked, because a pending address gets no alarm
  # mail at all while a clicked one still does.
  (( ${#CR_ERRORS[@]} )) && cr_finish
  (( pending )) && cr_finish_with 3 PENDING
  (( clicked )) && cr_finish_with 4 CLICKED
  cr_finish
fi

# ── Raise the generation and apply ──────────────────────────────────────────
TFVARS_PATH="${TFVARS_OVERRIDE:-${REPO_ROOT}/terraform/${TARGET}/terraform.tfvars}"
SYNTHETIC=0
if [[ -n "$TFVARS_OVERRIDE" ]]; then
  SYNTHETIC=1
  echo "SYNTHETIC: values file '${TFVARS_PATH}', stopping before the apply." >&2
fi
[[ -r "$TFVARS_PATH" ]] || cr_die "cannot read ${TFVARS_PATH}: each values file is a symlink into the maintainers' private operations checkout, and this script never invents one"

line="$(grep -E '^[[:space:]]*alarm_email_subscription_generation[[:space:]]*=' "$TFVARS_PATH" | head -1 || [[ $? == 1 ]])"
current=0
if [[ -n "$line" ]]; then
  current="$(sed -E 's/^[^=]*=[[:space:]]*([^[:space:]#]*).*$/\1/' <<<"$line")"
  [[ "$current" =~ ^[0-9]+$ ]] || cr_die "alarm_email_subscription_generation in ${TFVARS_PATH} is '${current}', not a whole number"
fi
next=$(( current + 1 ))

TFVARS_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-tfvars.XXXXXX")"
TFVARS_BACKUP="$(mktemp "${TMPDIR:-/tmp}/footbag-tfvars-orig.XXXXXX")"
cp "$TFVARS_PATH" "$TFVARS_BACKUP"
# written: the line is in the file and Terraform has not run, so a revert
# restores the world exactly. Once the apply starts, AWS is the outside record.
STATE="clean"
restore_unapplied() {
  if [[ "$STATE" == "written" ]]; then
    cat "$TFVARS_BACKUP" > "$TFVARS_PATH"
    echo "Put ${TFVARS_PATH} back the way it was found: the apply never started." >&2
  fi
  rm -f "$TFVARS_TMP" "$TFVARS_BACKUP"
}
cr_cleanup restore_unapplied

if [[ -n "$line" ]]; then
  sed -E "0,/^[[:space:]]*alarm_email_subscription_generation[[:space:]]*=/s/^([[:space:]]*alarm_email_subscription_generation[[:space:]]*=[[:space:]]*)[0-9]+/\\1${next}/" \
    "$TFVARS_PATH" > "$TFVARS_TMP"
else
  # The added line goes after a blank line, so terraform fmt treats it as a
  # group of its own rather than aligning it with whatever the file ends on;
  # otherwise the values file fails the fmt check.
  last_line="$(tail -n 1 "$TFVARS_PATH")"
  {
    cat "$TFVARS_PATH"
    if [[ -n "$last_line" ]]; then printf '\n'; fi
    printf 'alarm_email_subscription_generation = %s\n' "$next"
  } > "$TFVARS_TMP"
fi

echo ""
diff -u "$TFVARS_PATH" "$TFVARS_TMP" || [[ $? == 1 ]]
echo ""
echo "This recreates every alarm email subscription on ${TARGET}. Each address is"
echo "sent a fresh confirmation email, and alarm mail to it pauses until its link"
echo "is confirmed through scripts/confirm-alarm-subscription.sh."
if ! confirm_from_tty "Type 'APPLY' to recreate the ${TARGET} alarm subscriptions: " "APPLY"; then
  cr_unproved "the recreation: not confirmed, and the values file was not changed"
  cr_finish_with 1 ABORTED
fi

# cat rather than mv: the values file is a symlink into the private checkout.
cat "$TFVARS_TMP" > "$TFVARS_PATH"
STATE="written"
if (( SYNTHETIC )) && [[ -z "${RECONFIRM_TERRAFORM:-}" ]]; then
  STATE="applied"
  cr_unproved "the apply: synthetic mode stops before it"
  cr_finish
fi

STATE="applying"
cr_run "terraform apply of ${TARGET}" -- bash "$TERRAFORM_CMD" --target "$TARGET" \
  || cr_die "the ${TARGET} apply did not succeed; the values file is left at generation ${next}, because the apply may have recreated some subscriptions"
STATE="applied"
cr_proved "every ${TARGET} alarm email subscription recreated at generation ${next}"
cr_unproved "the confirmations: each address now holds a fresh confirmation email"
echo ""
echo "Next, once per confirmation email, paste its link into:"
echo "  bash scripts/confirm-alarm-subscription.sh --target ${TARGET}"
echo "Then check every subscription reads authenticated:"
echo "  bash scripts/reconfirm-alarm-subscriptions.sh --target ${TARGET} --status"
cr_finish
