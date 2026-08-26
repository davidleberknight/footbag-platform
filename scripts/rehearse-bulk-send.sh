#!/usr/bin/env bash
# Staged bulk send rehearsal, against the AWS mailbox simulator.
#
# WHAT THIS PROVES, AND WHAT IT DOES NOT.
#
# It proves the provider half of a staged bulk send at full volume: that the
# sender identity is accepted, that the bulk configuration set is accepted on
# every message, that the account's maximum send rate tolerates the cadence the
# outbox worker releases at, and, with the bounce and complaint scenarios, that
# feedback for those messages comes back to the platform.
#
# It does not exercise the application's drain. The batching, the priority
# between the two streams, and the feedback halt are pinned by the integration
# suite, which can drive a hundred passes in a second; repeating them here would
# be slower and prove less. What the suite cannot reach is the provider, which
# is exactly what this reaches.
#
# WHY THE SIMULATOR, AND WHY IT IS SAFE TO RUN NOW.
#
# Mail to the simulator is delivered to nobody, works while the account is still
# in the sandbox, does not count against the daily sending quota, and does not
# affect the PROVIDER's bounce rate, complaint rate, or any of its deliverability
# metrics. The bounce address is not added to the suppression list. So a five
# hundred message rehearsal costs a few cents of per-message billing and no
# reputation at all, which is what makes it worth doing BEFORE production access
# is granted rather than after.
#
# IT IS NOT NEUTRAL FOR THE PLATFORM'S OWN HALT, AND THAT SURPRISES PEOPLE.
#
# The bounce and complaint scenarios drive real notifications through the feed,
# and the platform records every one of them. They therefore count in the
# numerator of the bulk feedback halt. They do NOT count in its denominator,
# because these sends go straight to the provider and never become outbox rows,
# and the halt's denominator is what the outbox sent. A rehearsal at any size can
# consequently push the observed rate over the threshold and stop the bulk stream
# for the length of the health window, while the provider's own metrics show
# nothing at all.
#
# That is survivable and self-clearing, but run the bounce and complaint
# scenarios BEFORE a real broadcast rather than during one, and if the bulk
# stream is unexpectedly halted afterwards, look here first. The success scenario
# generates no feedback and has no such effect.
#
# The addresses carry a label per message (bounce+0001@, bounce+0002@, and so
# on). Every label resolves to the same simulator mailbox, so one rehearsal gets
# as many distinct recipients as it asks for without inventing an address that
# belongs to somebody.
#
# READ THIS BEFORE EXPECTING FEEDBACK.
#
# Bounce and complaint notifications reach the platform only where the feedback
# queue exists for the target environment. Where it does not, the notification is
# published to a topic nothing is subscribed to and is dropped: the send half of
# the rehearsal still holds, the feedback half reports nothing, and that is a
# configuration state rather than a failure of the send. Check with
# scripts/verify-host-env.sh before reading anything into an empty result.
set -euo pipefail

TARGET=""
PROFILE=""
COUNT=50
SCENARIO="success"
BATCH=5          # Mirrors the shipped outbox_bulk_batch_limit default.
INTERVAL=30      # Mirrors the shipped outbox_poll_interval_seconds default.
DRY_RUN=0
RAW_PROBE=0
REGION="us-east-1"

usage() {
  cat >&2 <<'USAGE'
Usage: rehearse-bulk-send.sh --target <staging|production> [options]

  --target <env>       Which environment's sender identity and configuration set to use.
  --profile <name>     AWS profile; defaults to footbag-<target>-runtime.
  --count <n>          Messages to send (default 50).
  --scenario <s>       success | bounce | complaint | mixed (default success).
                       mixed sends mostly success with one bounce and one complaint,
                       which is the shape a real list produces.
  --batch <n>          Messages released per pass (default 5, the shipped bulk cap).
  --interval <secs>    Seconds between passes (default 30, the shipped poll interval).
  --dry-run            Print the plan and the addresses; send nothing.
  --raw-probe          Also send one message through SendRawEmail with the
                       one-click unsubscribe headers, which is the call a real
                       broadcast to a member-manageable list makes. Different
                       IAM action from the simple send, so worth proving once.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)   TARGET="$2"; shift 2 ;;
    --profile)  PROFILE="$2"; shift 2 ;;
    --count)    COUNT="$2"; shift 2 ;;
    --scenario) SCENARIO="$2"; shift 2 ;;
    --batch)    BATCH="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --raw-probe) RAW_PROBE=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

case "$TARGET" in
  staging|production) : ;;
  *) echo "ERROR: --target must be 'staging' or 'production'" >&2; usage; exit 2 ;;
esac
case "$SCENARIO" in
  success|bounce|complaint|mixed) : ;;
  *) echo "ERROR: --scenario must be success, bounce, complaint or mixed" >&2; exit 2 ;;
esac
# Bounded above as well as below. Simulator mail costs no reputation and no
# quota, but it is billed per message and it consumes the account's send rate,
# so a mistyped count is a real charge and a real throttle rather than a typo
# that stops at the first prompt. Five thousand is far beyond any rehearsal this
# platform has reason to run against a membership of a few hundred.
if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || (( COUNT < 1 || COUNT > 5000 )); then
  echo "ERROR: --count must be a whole number from 1 to 5000" >&2; exit 2
fi
if ! [[ "$BATCH" =~ ^[0-9]+$ ]] || (( BATCH < 1 )); then
  echo "ERROR: --batch must be a positive whole number" >&2; exit 2
fi
# At least one second between passes. The point of the rehearsal is to prove the
# account's maximum send rate tolerates the cadence the outbox worker releases
# at; a zero interval fires every pass back to back, which measures how fast the
# provider will refuse rather than whether the real cadence holds.
if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || (( INTERVAL < 1 )); then
  echo "ERROR: --interval must be a whole number of seconds, at least 1" >&2; exit 2
fi

PROFILE="${PROFILE:-footbag-${TARGET}-runtime}"

# A dry run reaches nothing: no Terraform state, no credentials, no network. It
# exists to answer "what would this send, and at what cadence", which is a
# question about the arguments alone, and an operator checking that on a machine
# with no profile configured should get an answer rather than an authentication
# error. The three resolved values are named as unresolved rather than faked, so
# the plan never reads as though it had confirmed something it did not look at.
UNRESOLVED='(not resolved in a dry run)'
SENDER="$UNRESOLVED"
CONFIG_SET="$UNRESOLVED"
ARN="$UNRESOLVED"

if [[ "$DRY_RUN" -eq 0 ]]; then
  # The sender and the configuration set come from the environment's own
  # Terraform state rather than from a constant here, for the same reason the
  # smoke entry point reads them: while production sends under an interim
  # identity, a constant would prove the rehearsal against an address the
  # environment is not using.
  SENDER="$(terraform -chdir="terraform/${TARGET}" output -raw ses_sender_identity)"
  CONFIG_SET="$(terraform -chdir="terraform/${TARGET}" output -raw ses_configuration_set_bulk)"

  if [[ -z "$SENDER" || -z "$CONFIG_SET" ]]; then
    echo "ERROR: terraform/${TARGET} did not yield a sender identity and a bulk configuration set." >&2
    echo "       Apply that environment before rehearsing against it." >&2
    exit 1
  fi

  # Confirm the profile really resolves to the environment named, before
  # anything is sent. A rehearsal run against the wrong account bills the wrong
  # place and proves nothing about the one being launched.
  ARN="$(aws sts get-caller-identity --profile "$PROFILE" --query Arn --output text)"
  case "$ARN" in
    *"footbag-${TARGET}"*) : ;;
    *) echo "ERROR: profile '$PROFILE' does not resolve to a footbag-${TARGET} identity (got $ARN)" >&2; exit 1 ;;
  esac
fi

# Which simulator mailbox each message goes to. The mixed scenario puts one
# bounce and one complaint into an otherwise clean run, which is the shape that
# tells an operator whether the feedback path works without making the run look
# like a disaster.
mailbox_for() {
  local index="$1"
  case "$SCENARIO" in
    success)   echo "success" ;;
    bounce)    echo "bounce" ;;
    complaint) echo "complaint" ;;
    mixed)
      if   (( index == 2 )); then echo "bounce"
      elif (( index == 3 )); then echo "complaint"
      else echo "success"; fi ;;
  esac
}

address_for() {
  printf '%s+%04d@simulator.amazonses.com' "$(mailbox_for "$1")" "$1"
}

send_one() {
  aws ses send-email \
    --from "$SENDER" \
    --destination "ToAddresses=$1" \
    --configuration-set-name "$CONFIG_SET" \
    --message 'Subject={Data="footbag staged bulk send rehearsal"},Body={Text={Data="Rehearsal traffic to the AWS mailbox simulator. Delivered to nobody."}}' \
    --region "$REGION" \
    --profile "$PROFILE" \
    --query MessageId --output text
}

# Real bulk mail to a member-manageable list carries the one-click unsubscribe
# headers, and headers force the platform onto SendRawEmail rather than the
# simple send. That is a different API action with its own IAM grant, so a
# rehearsal built only on the simple send proves nothing about the call an
# actual broadcast makes. This sends one message the same way the platform
# would, which is the cheapest way to find a missing grant before a send to
# the membership finds it instead.
send_raw_probe() {
  local address="$1"
  local raw
  raw="$(printf '%s\r\n' \
    "From: ${SENDER}" \
    "To: ${address}" \
    "Subject: footbag staged bulk send rehearsal (raw)" \
    "List-Unsubscribe: <https://example.invalid/email/unsubscribe?t=rehearsal>" \
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click" \
    "MIME-Version: 1.0" \
    "Content-Type: text/plain; charset=UTF-8" \
    "" \
    "Rehearsal traffic to the AWS mailbox simulator. Delivered to nobody.")"

  aws ses send-raw-email \
    --raw-message "Data=$(printf '%s' "$raw" | base64 -w0)" \
    --configuration-set-name "$CONFIG_SET" \
    --region "$REGION" \
    --profile "$PROFILE" \
    --query MessageId --output text
}

PASSES=$(( (COUNT + BATCH - 1) / BATCH ))
PROJECTED=$(( PASSES > 0 ? (PASSES - 1) * INTERVAL : 0 ))

echo "Rehearsal plan"
echo "  environment       : ${TARGET}"
echo "  caller identity   : ${ARN}"
echo "  sender            : ${SENDER}"
echo "  configuration set : ${CONFIG_SET}"
echo "  scenario          : ${SCENARIO}"
echo "  messages          : ${COUNT} in ${PASSES} pass(es) of ${BATCH}, ${INTERVAL}s apart"
echo "  projected wall    : ${PROJECTED}s of pacing, plus send time"
echo ""

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run. Addresses that would be used:"
  for (( i = 1; i <= COUNT; i++ )); do
    echo "  $(address_for "$i")"
  done
  echo ""
  echo "Nothing was sent."
  exit 0
fi

# Holds one send's stderr so a failure can be shown rather than swallowed.
# Removed on every exit path, including an interrupt part-way through a run,
# because a rehearsal is the kind of thing an operator stops with control-C.
SEND_ERR="$(mktemp "${TMPDIR:-/tmp}/footbag-rehearse-err.XXXXXX")"
trap 'rm -f "${SEND_ERR:-}"' EXIT INT TERM

STARTED_AT=$(date +%s)
SENT=0
FAILED=0
PASS=0

for (( i = 1; i <= COUNT; i++ )); do
  if (( (i - 1) % BATCH == 0 )); then
    PASS=$(( PASS + 1 ))
    if (( PASS > 1 )); then
      echo "  ... pausing ${INTERVAL}s before pass ${PASS}"
      sleep "$INTERVAL"
    fi
    echo "pass ${PASS}/${PASSES}"
  fi

  ADDRESS="$(address_for "$i")"
  # The provider's error is the finding, so it is shown rather than discarded.
  # Sent to a temp file because the value of this call is its stdout: a throttle,
  # an unverified sender, a rejected configuration set and an authorisation
  # failure all arrive here and are the exact things the rehearsal exists to
  # surface, and "SEND FAILED" alone cannot tell them apart.
  if MESSAGE_ID="$(send_one "$ADDRESS" 2>"$SEND_ERR")"; then
    SENT=$(( SENT + 1 ))
    echo "  ${ADDRESS}  ${MESSAGE_ID}"
  else
    FAILED=$(( FAILED + 1 ))
    # Worth continuing rather than aborting: a throttle partway through is one
    # of the things the rehearsal exists to discover, and the count of what got
    # through is the finding.
    echo "  ${ADDRESS}  SEND FAILED" >&2
    sed 's/^/    /' "$SEND_ERR" >&2
  fi
done

RAW_RESULT=""
if [[ "$RAW_PROBE" -eq 1 ]]; then
  echo ""
  echo "raw-MIME probe (SendRawEmail, with one-click unsubscribe headers)"
  if RAW_ID="$(send_raw_probe "success+raw@simulator.amazonses.com" 2>"$SEND_ERR")"; then
    RAW_RESULT="sent, MessageId ${RAW_ID}"
    echo "  success+raw@simulator.amazonses.com  ${RAW_ID}"
  else
    RAW_RESULT="FAILED"
    echo "  SendRawEmail FAILED. The simple sends above may all have succeeded:" >&2
    echo "  ses:SendRawEmail is a separate IAM action, and bulk mail to a" >&2
    echo "  member-manageable list takes this path, not the simple one." >&2
    sed 's/^/    /' "$SEND_ERR" >&2
  fi
fi

ELAPSED=$(( $(date +%s) - STARTED_AT ))

echo ""
echo "Rehearsal result"
echo "  sent              : ${SENT}"
echo "  failed            : ${FAILED}"
echo "  elapsed           : ${ELAPSED}s"
if (( ELAPSED > 0 )); then
  echo "  observed rate     : $(( SENT * 60 / ELAPSED )) messages/minute"
fi
if [[ -n "$RAW_RESULT" ]]; then
  echo "  raw-MIME probe    : ${RAW_RESULT}"
fi
echo ""

if [[ "$SCENARIO" != "success" ]]; then
  cat <<'FEEDBACK'
Feedback check, a few minutes from now:

  The bounce and complaint notifications for this run reach the platform only
  where the target environment has its feedback queue. Where it does, each one
  is recorded against no member (the simulator addresses match nobody), so what
  to look for is the audit trail rather than a member state change:

    SELECT created_at, action_type, metadata_json FROM audit_entries
    WHERE action_type IN ('email.bounce_recorded', 'email.complaint_recorded')
    ORDER BY created_at DESC LIMIT 10;

  Nothing arriving means either the queue is not wired for this environment or
  the worker is not polling it. Check which before treating it as a defect.
FEEDBACK
fi
