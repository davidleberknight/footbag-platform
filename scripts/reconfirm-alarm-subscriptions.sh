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
# Two modes:
#   --status   Read-only. Lists every email subscription on this environment's
#              three alarm topics (main and critical in us-east-1, the Health
#              topic in us-west-2) and reports each as authenticated, clicked or
#              pending. A pending one is a warning in the closing report, and so
#              is a clicked one on the shared group's address: any member of the
#              group can remove it for everyone. The group is the address on the
#              critical topic, which only the group subscribes to. A click on the
#              operations mailbox counts as confirmed and is listed, not warned.
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
#   bash scripts/reconfirm-alarm-subscriptions.sh --target production
#
# Flags:
#   --target staging|production  Required, no default.
#   --status                     The read-only report above.
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
# 4 while any was confirmed by a click.
set -euo pipefail

TARGET=""
STATUS=0
TFVARS_OVERRIDE=""
WANT_ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --status) STATUS=1; shift ;;
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

# ── Status: read every email subscription on the three alarm topics ──────────
if (( STATUS )); then
  if [[ -z "${RECONFIRM_AWS_BIN:-}" ]]; then
    # shellcheck source=lib/aws-profile.sh
    source "${SCRIPT_DIR}/lib/aws-profile.sh"
    aws_profile_ensure || cr_die "no AWS identity is available for the read"
  fi
  topics_read=0
  pending=0
  clicked=0
  # The critical topic is read before the us-west-2 one, so the group's
  # address is known by the time its us-west-2 subscription is judged.
  group_addresses=" "
  for spec in "us-east-1 footbag-${TARGET}-alarms" "us-east-1 footbag-${TARGET}-alarms-critical" "us-west-2 footbag-${TARGET}-alarms-usw2"; do
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
    topics_read=$(( topics_read + 1 ))
    if ! subs="$("$AWS_BIN" sns list-subscriptions-by-topic --region "$region" --topic-arn "$topic_arn" \
          --query 'Subscriptions[?Protocol==`email`].[SubscriptionArn,Endpoint]' --output text 2>&1)"; then
      cr_error "could not list the subscriptions of ${name}: ${subs##*$'\n'}"
      continue
    fi
    [[ -n "$subs" ]] || { echo "  ${name}: no email subscriptions"; continue; }
    while read -r sub_arn endpoint; do
      [[ -n "$sub_arn" ]] || continue
      [[ "$name" == "footbag-${TARGET}-alarms-critical" ]] && group_addresses+="${endpoint} "
      if [[ "$sub_arn" == "PendingConfirmation" ]]; then
        cr_warn "${name}: ${endpoint} is pending confirmation; confirm its link with bash scripts/confirm-alarm-subscription.sh --target ${TARGET}"
        pending=$(( pending + 1 ))
        continue
      fi
      if ! authenticated="$("$AWS_BIN" sns get-subscription-attributes --region "$region" --subscription-arn "$sub_arn" \
            --query 'Attributes.ConfirmationWasAuthenticated' --output text 2>&1)"; then
        cr_error "could not read ${name}'s subscription for ${endpoint}: ${authenticated##*$'\n'}"
        continue
      fi
      if [[ "$authenticated" == "true" ]]; then
        echo "  ${name}: ${endpoint} authenticated"
      elif [[ "$group_addresses" == *" ${endpoint} "* ]]; then
        cr_warn "${name}: ${endpoint} was confirmed by a click, so an unsubscribe link can remove it; recreate it with bash scripts/reconfirm-alarm-subscriptions.sh --target ${TARGET}"
        clicked=$(( clicked + 1 ))
      else
        echo "  ${name}: ${endpoint} confirmed by a click, which counts for the operations mailbox"
        clicked=$(( clicked + 1 ))
      fi
    done <<<"$subs"
  done
  (( topics_read > 0 )) || cr_error "none of the ${TARGET} alarm topics was found"
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
