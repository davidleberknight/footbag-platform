#!/usr/bin/env bash
# prove-audit-alarms.sh
#
# Proves that the audit trail is watched, not merely kept: each new audit alarm
# fires on a deliberate, harmless trigger and clears again, a GuardDuty sample
# finding and an Access Analyzer finding reach the alarm email, and the console
# sign-in-without-MFA pattern matches a real sign-in event. Run once by a
# footbag-operator holder after the production tree carrying the audit alarms
# and both environments' finding rules are applied and GuardDuty is on.
#
# WHY THIS EXISTS.
#
# An alarm that has never fired is an alarm nobody knows works: a filter pattern
# that matches nothing reads exactly like a quiet account. Each trigger here was
# a hand-typed command on the card that asked for it, with the operator judging
# the console afterwards. Here every trigger is made, judged by the alarm's own
# history, and cleaned up by the run itself.
#
# WHAT IT DOES, in order, all as the directly authenticated footbag-operator:
#   1  read-only: the MFA pattern tested against a captured sign-in event with
#      `logs test-metric-filter`; no sign-in is made
#   2  re-sets the trail log group's retention to the 90 days it already holds,
#      which changes nothing and fires footbag-production-audit-trail-tampered
#   3  creates and deletes a throwaway IAM policy named footbag-staging-probe-*,
#      which fires footbag-production-iam-write
#   4  creates and deletes a throwaway alarm named footbag-staging-probe-*, which
#      fires footbag-production-alerting-disabled
#   5  creates a throwaway KMS key aliased alias/footbag-staging-probe-*,
#      disables it and schedules its deletion at the 7-day minimum, which fires
#      footbag-production-kms-key-disabled
#   6  creates a throwaway SQS queue named footbag-staging-probe-* whose policy
#      admits any principal, waits for Access Analyzer to report it, then
#      deletes the queue
#   7  asks GuardDuty for one high-severity sample finding
#   8  waits for each of the four alarms to reach ALARM and then OK in its own
#      history after the run began, then reads both environments' alarm-topic
#      email subscriptions and asks the operator, as yes or no questions,
#      whether the sample finding and the Access Analyzer finding emails
#      reached each environment's alarm mailbox: one question per finding
#      when both topics email the same destinations, one per environment
#      otherwise
#
# WHAT IT REFUSES TO DO.
#
#   - Run as anything but the directly authenticated footbag-operator.
#   - Touch anything not named footbag-staging-probe-*, except the trail log
#     group's retention, which it sets to the value it already reads there and
#     refuses to touch if that value is not 90.
#   - Leave a probe behind. Every probe it created is removed on every exit
#     path, including an interrupt: the policy and alarm deleted, the queue
#     deleted, the key disabled and scheduled for deletion. A KMS key cannot be
#     deleted sooner than seven days, so it is left pending deletion, disabled,
#     and the closing report names it.
#   - Run without a typed APPLY, since steps 2 to 7 change AWS.
#
# The alarms and the queue are account-wide, so the run proves both
# environments' finding routes at once: the GuardDuty and Access Analyzer
# findings reach every environment's alarm topic that carries the rules.
#
# Usage:
#   bash scripts/prove-audit-alarms.sh --dry-run
#   bash scripts/prove-audit-alarms.sh
#
# Flags:
#   --dry-run   State what a real run would do; read and change nothing.
#   --yes       Accept the confirmation where no terminal is attached; the yes
#               or no questions about the emails are then recorded as unproved.
#
# Test seams (CI only; operators never set these), announced on stderr when
# set: PROVE_AUDIT_ALARMS_AWS_BIN replaces the aws CLI;
# PROVE_AUDIT_ALARMS_POLL_SECONDS and PROVE_AUDIT_ALARMS_WAIT_MINUTES replace
# the polling interval and the per-alarm wait.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

DRY_RUN=0
ASSUME_YES=""
FOOTBAG_OPERATOR_USER="footbag-operator"
TRAIL_LOG_GROUP="/footbag/production/cloudtrail"
EXPECTED_RETENTION=90
AUDIT_ALARMS=(
  "footbag-production-audit-trail-tampered"
  "footbag-production-iam-write"
  "footbag-production-alerting-disabled"
  "footbag-production-kms-key-disabled"
)
MFA_FILTER="footbag-production-console-login-without-mfa"

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --yes)     ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 ;;
  esac
done

if (( DRY_RUN )); then
  cat <<'PLAN'
Dry run. A real run would, as footbag-operator, after a typed APPLY:

  1  test the sign-in-without-MFA pattern against a captured event (read-only)
  2  re-set the trail log group's retention to its current 90 days
  3  create and delete a throwaway IAM policy footbag-staging-probe-*
  4  create and delete a throwaway alarm footbag-staging-probe-*
  5  create a throwaway KMS key, disable it, schedule its deletion (7 days)
  6  create a public throwaway SQS queue, wait for Access Analyzer, delete it
  7  ask GuardDuty for one high-severity sample finding
  8  wait for the four audit alarms to reach ALARM and then OK, and ask
     whether the two finding emails reached each environment's alarm mailbox

Nothing was read, changed or created.
PLAN
  exit 0
fi

AWS_BIN="${PROVE_AUDIT_ALARMS_AWS_BIN:-aws}"
POLL_SECONDS="${PROVE_AUDIT_ALARMS_POLL_SECONDS:-60}"
WAIT_MINUTES="${PROVE_AUDIT_ALARMS_WAIT_MINUTES:-30}"
for seam in PROVE_AUDIT_ALARMS_AWS_BIN PROVE_AUDIT_ALARMS_POLL_SECONDS PROVE_AUDIT_ALARMS_WAIT_MINUTES; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam} is set; this run proves nothing about the account." >&2
done

# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
# shellcheck source=lib/aws-identity.sh
source "${REPO_ROOT}/scripts/lib/aws-identity.sh"
aws_profile_ensure || cr_die "could not settle the AWS identity this run acts as"
aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" || cr_die "this run acts only as the directly authenticated ${FOOTBAG_OPERATOR_USER}"

AWS_ERR="$(mktemp)"
cr_cleanup rm -f "$AWS_ERR"
aws_q() { "$AWS_BIN" "$@" 2>"$AWS_ERR"; }
aws_err() { tr '\n' ' ' <"$AWS_ERR"; }

STAMP="$(date -u +%Y%m%d%H%M%S)"
PROBE="footbag-staging-probe-${STAMP}"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ── Precondition: the retention the run will re-set ──────────────────────────
retention="$(aws_q logs describe-log-groups --log-group-name-prefix "$TRAIL_LOG_GROUP" \
  --query "logGroups[?logGroupName=='${TRAIL_LOG_GROUP}'].retentionInDays | [0]" --output text)" \
  || cr_die "could not read the trail log group's retention: $(aws_err)"
[[ "$retention" == "$EXPECTED_RETENTION" ]] \
  || cr_die "the trail log group's retention reads '${retention}', not ${EXPECTED_RETENTION}; refusing to re-set a value this run did not expect. Nothing was changed."

for alarm in "${AUDIT_ALARMS[@]}"; do
  found="$(aws_q cloudwatch describe-alarms --alarm-names "$alarm" \
    --query 'length(MetricAlarms)' --output text)" || cr_die "could not read alarm ${alarm}: $(aws_err)"
  [[ "$found" == "1" ]] || cr_die "alarm ${alarm} does not exist; apply the production tree first. Nothing was changed."
done

# ── Step 1: the MFA pattern, read-only ───────────────────────────────────────
echo "-- step 1: the sign-in-without-MFA pattern against a captured sign-in event --"
mfa_pattern="$(aws_q logs describe-metric-filters --log-group-name "$TRAIL_LOG_GROUP" \
  --filter-name-prefix "$MFA_FILTER" --query 'metricFilters[0].filterPattern' --output text)" \
  || cr_die "could not read the MFA metric filter: $(aws_err)"
# The shape CloudTrail records for a console sign-in by an IAM user without MFA.
mfa_event='{"eventVersion":"1.08","userIdentity":{"type":"IAMUser","userName":"probe"},"eventSource":"signin.amazonaws.com","eventName":"ConsoleLogin","responseElements":{"ConsoleLogin":"Success"},"additionalEventData":{"MFAUsed":"No"}}'
matches="$(aws_q logs test-metric-filter --filter-pattern "$mfa_pattern" \
  --log-event-messages "$mfa_event" --query 'length(matches)' --output text)" \
  || cr_die "could not test the MFA pattern: $(aws_err)"
if [[ "$matches" == "1" ]]; then
  cr_proved "the sign-in-without-MFA pattern matches a captured sign-in without MFA"
else
  cr_error "the sign-in-without-MFA pattern matched ${matches:-nothing} of one captured sign-in without MFA"
fi

if ! confirm_from_tty "Type 'APPLY' to create the footbag-staging-probe-* probes, re-set the trail log retention to ${EXPECTED_RETENTION} days, and request a GuardDuty sample finding: " "APPLY"; then
  cr_die "aborted before any change. Nothing was changed."
fi

# ── Cleanup of every probe, registered before each is created ────────────────
POLICY_ARN=""
KEY_ID=""
QUEUE_URL=""
cleanup_probes() {
  if [[ -n "$POLICY_ARN" ]]; then
    "$AWS_BIN" iam delete-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1 \
      || cr_warn "could not delete the probe IAM policy ${POLICY_ARN}; delete it by hand"
  fi
  "$AWS_BIN" cloudwatch delete-alarms --alarm-names "$PROBE" >/dev/null 2>&1 || true
  if [[ -n "$QUEUE_URL" ]]; then
    "$AWS_BIN" sqs delete-queue --queue-url "$QUEUE_URL" >/dev/null 2>&1 \
      || cr_warn "could not delete the probe queue ${QUEUE_URL}; delete it by hand"
  fi
  if [[ -n "$KEY_ID" ]]; then
    "$AWS_BIN" kms disable-key --key-id "$KEY_ID" >/dev/null 2>&1 || true
    "$AWS_BIN" kms schedule-key-deletion --key-id "$KEY_ID" --pending-window-in-days 7 >/dev/null 2>&1 || true
    cr_warn "probe KMS key ${KEY_ID} is disabled and pending deletion; AWS removes it after 7 days"
  fi
}
cr_cleanup cleanup_probes

# ── Step 2: the trail log group's retention, re-set to its own value ─────────
echo "-- step 2: re-set the trail log retention to ${EXPECTED_RETENTION} days --"
aws_q logs put-retention-policy --log-group-name "$TRAIL_LOG_GROUP" \
  --retention-in-days "$EXPECTED_RETENTION" || cr_die "could not re-set the trail log retention: $(aws_err)"

# ── Step 3: a throwaway IAM policy ───────────────────────────────────────────
echo "-- step 3: create and delete IAM policy ${PROBE} --"
POLICY_ARN="$(aws_q iam create-policy --policy-name "$PROBE" \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Deny","Action":"s3:GetObject","Resource":"arn:aws:s3:::footbag-staging-probe-none/*"}]}' \
  --query Policy.Arn --output text)" || cr_die "could not create the probe IAM policy: $(aws_err)"
aws_q iam delete-policy --policy-arn "$POLICY_ARN" || cr_die "could not delete the probe IAM policy: $(aws_err)"
POLICY_ARN=""

# ── Step 4: a throwaway alarm ────────────────────────────────────────────────
echo "-- step 4: create and delete alarm ${PROBE} --"
aws_q cloudwatch put-metric-alarm --alarm-name "$PROBE" --namespace "Footbag/staging/Probe" \
  --metric-name Probe --statistic Sum --period 300 --evaluation-periods 1 --threshold 1 \
  --comparison-operator GreaterThanThreshold || cr_die "could not create the probe alarm: $(aws_err)"
aws_q cloudwatch delete-alarms --alarm-names "$PROBE" || cr_die "could not delete the probe alarm: $(aws_err)"

# ── Step 5: a throwaway KMS key ──────────────────────────────────────────────
echo "-- step 5: create, disable and schedule deletion of a probe KMS key --"
KEY_ID="$(aws_q kms create-key --description "$PROBE" --tags "TagKey=Name,TagValue=${PROBE}" \
  --query KeyMetadata.KeyId --output text)" || cr_die "could not create the probe KMS key: $(aws_err)"
aws_q kms create-alias --alias-name "alias/${PROBE}" --target-key-id "$KEY_ID" \
  || cr_die "could not alias the probe KMS key: $(aws_err)"
aws_q kms disable-key --key-id "$KEY_ID" || cr_die "could not disable the probe KMS key: $(aws_err)"
aws_q kms schedule-key-deletion --key-id "$KEY_ID" --pending-window-in-days 7 >/dev/null \
  || cr_die "could not schedule the probe KMS key's deletion: $(aws_err)"

# ── Step 6: a public throwaway queue, for Access Analyzer ───────────────────
echo "-- step 6: create public queue ${PROBE} for Access Analyzer --"
QUEUE_URL="$(aws_q sqs create-queue --queue-name "$PROBE" --query QueueUrl --output text)" \
  || cr_die "could not create the probe queue: $(aws_err)"
queue_arn="$(aws_q sqs get-queue-attributes --queue-url "$QUEUE_URL" --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)" || cr_die "could not read the probe queue's ARN: $(aws_err)"
policy="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"sqs:SendMessage\",\"Resource\":\"${queue_arn}\"}]}"
aws_q sqs set-queue-attributes --queue-url "$QUEUE_URL" \
  --attributes "$(jq -cn --arg p "$policy" '{Policy: $p}')" \
  || cr_die "could not make the probe queue public: $(aws_err)"

# ── Step 7: a GuardDuty sample finding ───────────────────────────────────────
echo "-- step 7: request a GuardDuty sample finding --"
detector="$(aws_q guardduty list-detectors --query 'DetectorIds[0]' --output text)" \
  || cr_die "could not read the GuardDuty detector: $(aws_err)"
[[ -n "$detector" && "$detector" != "None" ]] || cr_die "no GuardDuty detector; run apply-account-baseline.sh --enable-guardduty first"
aws_q guardduty create-sample-findings --detector-id "$detector" \
  --finding-types "UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS" \
  || cr_die "could not create the GuardDuty sample finding: $(aws_err)"

# ── Step 8: judge every outcome ──────────────────────────────────────────────
echo "-- step 8: waiting for each audit alarm to fire and clear --"
deadline=$(( $(date +%s) + WAIT_MINUTES * 60 ))
analyzer="$(aws_q accessanalyzer list-analyzers --query 'analyzers[?status==`ACTIVE` && type==`ACCOUNT`].arn | [0]' --output text)" \
  || cr_die "could not read the Access Analyzer: $(aws_err)"
finding_seen=0
declare -A fired=() cleared=()
while :; do
  for alarm in "${AUDIT_ALARMS[@]}"; do
    [[ -n "${cleared[$alarm]:-}" ]] && continue
    states="$(aws_q cloudwatch describe-alarm-history --alarm-name "$alarm" --history-item-type StateUpdate \
      --start-date "$STARTED" --query 'AlarmHistoryItems[].HistorySummary' --output text)" || states=""
    [[ "$states" == *"to ALARM"* ]] && fired[$alarm]=1
    [[ -n "${fired[$alarm]:-}" && "$states" == *"ALARM to OK"* ]] && cleared[$alarm]=1
  done
  if (( ! finding_seen )); then
    count="$(aws_q accessanalyzer list-findings --analyzer-arn "$analyzer" \
      --filter "{\"resource\":{\"eq\":[\"${queue_arn}\"]}}" --query 'length(findings)' --output text)" || count=0
    [[ "$count" =~ ^[1-9] ]] && finding_seen=1
  fi
  (( ${#cleared[@]} == ${#AUDIT_ALARMS[@]} && finding_seen )) && break
  (( $(date +%s) >= deadline )) && break
  sleep "$POLL_SECONDS"
done

for alarm in "${AUDIT_ALARMS[@]}"; do
  if [[ -n "${cleared[$alarm]:-}" ]]; then
    cr_proved "${alarm} fired on its trigger and cleared"
  elif [[ -n "${fired[$alarm]:-}" ]]; then
    cr_error "${alarm} fired but did not clear within ${WAIT_MINUTES} minutes"
  else
    cr_error "${alarm} did not fire within ${WAIT_MINUTES} minutes of its trigger"
  fi
done
if (( finding_seen )); then
  cr_proved "Access Analyzer reported the public probe queue"
else
  cr_error "Access Analyzer did not report the public probe queue within ${WAIT_MINUTES} minutes"
fi

# Delivery to a mailbox outside AWS is not readable from here, so the operator
# attests to it. Both environments' alarm topics carry the finding rules, so
# each finding is asked about at each environment's mailbox. Where the two
# topics email exactly the same destinations there is one inbox to check, and
# one question says so; a second would invite a second "yes" for one email.
# The addresses are compared, never printed: the alarm mailbox is the account's
# recovery identity and its value is held in the vault.
#
# mailbox_destinations <env>: the sorted email endpoints on that environment's
# alarm topic, one per line; empty when there are none.
mailbox_destinations() {
  local out
  out="$(aws_q sns list-subscriptions \
    --query "Subscriptions[?Protocol=='email' && ends_with(TopicArn, ':footbag-${1}-alarms')].Endpoint" \
    --output json)" || return 1
  jq -r '.[]' <<<"$out" | sort -u
}

mailboxes=()
declare -A destinations=()
for env in staging production; do
  if ! destinations[$env]="$(mailbox_destinations "$env")"; then
    cr_error "could not read the footbag-${env}-alarms subscriptions: $(aws_err)"
  elif [[ -z "${destinations[$env]}" ]]; then
    cr_error "footbag-${env}-alarms has no email subscription, so no finding email could reach the ${env} alarm mailbox"
  else
    mailboxes+=("$env")
  fi
done
if (( ${#mailboxes[@]} == 2 )) && [[ "${destinations[staging]}" == "${destinations[production]}" ]]; then
  mailbox_labels=("alarm mailbox that staging and production share")
else
  mailbox_labels=()
  for env in "${mailboxes[@]}"; do mailbox_labels+=("${env} alarm mailbox"); done
fi

for what in "the GuardDuty sample finding" "the Access Analyzer finding for ${PROBE}"; do
  for label in "${mailbox_labels[@]}"; do
    if [[ "$ASSUME_YES" == "yes" ]] || ! terminal_present; then
      cr_unproved "an email for ${what} reached the ${label} (not asked: no terminal)"
      continue
    fi
    printf 'Did an email for %s reach the %s? (yes/no): ' "$what" "$label" > /dev/tty
    answer=""; read -r answer < /dev/tty || answer=""
    if [[ "$answer" == "yes" ]]; then
      cr_proved "an email for ${what} reached the ${label} (operator attested)"
    else
      cr_error "no email for ${what} reached the ${label}"
    fi
  done
done

cr_finish
