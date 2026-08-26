#!/usr/bin/env bash
# Production email send-path validation. Operator-run after SES production-access
# activation (AWS_OPERATIONS.md, private GitHub repo). Sends through live SES to
# the AWS mailbox simulator
# (reputation-safe: the success simulator address never bounces and is not a
# real recipient) and, optionally, to one operator-supplied real inbox for an
# end-to-end deliverability + DKIM confirmation.
#
# This sends REAL email via the production SES identity. It refuses to run
# without an explicit production profile and an explicit confirmation flag.
set -euo pipefail

# Canonical transactional sender. Overridable with --sender because the sender
# identity is not always the canonical one: it must be an address SES has
# verified, and the canonical address cannot be verified until mail for the
# domain is reachable. While production sends under an interim identity, this
# script has to send under the same one or it proves nothing about the running
# configuration.
SENDER="noreply@footbag.org"
REGION="us-east-1"             # SES identity region
SIMULATOR="success@simulator.amazonses.com"
BOUNCE_SIMULATOR="bounce@simulator.amazonses.com"
INBOX=""
PROFILE=""
CONFIRMED=0
BOUNCE_PROBE=0

usage() {
  echo "Usage: $0 --profile <aws-profile> --confirm-production [--sender <address>] [--inbox <address>] [--bounce-probe]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --sender) SENDER="$2"; shift 2 ;;
    --inbox) INBOX="$2"; shift 2 ;;
    --confirm-production) CONFIRMED=1; shift ;;
    --bounce-probe) BOUNCE_PROBE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$PROFILE" ]]; then
  echo "ERROR: --profile <production-runtime-profile> is required" >&2; exit 2
fi
if [[ "$CONFIRMED" -ne 1 ]]; then
  echo "ERROR: this sends real production email; pass --confirm-production to proceed" >&2; exit 2
fi

# Confirm the profile resolves to a production identity before sending anything.
ARN=$(aws sts get-caller-identity --profile "$PROFILE" --query Arn --output text)
echo "Caller identity: $ARN"
case "$ARN" in
  *footbag-production*) : ;;
  *) echo "ERROR: profile '$PROFILE' does not resolve to a footbag-production identity (got $ARN)" >&2; exit 1 ;;
esac

send_one() {
  aws ses send-email \
    --from "$SENDER" \
    --destination "ToAddresses=$1" \
    --message 'Subject={Data="footbag production email validation"},Body={Text={Data="Production SES send-path validation. Safe to ignore."}}' \
    --region "$REGION" \
    --profile "$PROFILE" \
    --query MessageId --output text
}

# Fail before sending rather than after: SES refuses an unverified sender with
# an error that reads like a permissions problem, and the operator is left
# guessing which of the two it is.
SENDER_VERIFIED=$(
  aws sesv2 get-email-identity \
    --email-identity "$SENDER" \
    --region "$REGION" \
    --profile "$PROFILE" \
    --query VerifiedForSendingStatus --output text 2>/dev/null
) || SENDER_VERIFIED="absent"
if [[ "$SENDER_VERIFIED" != "True" && "$SENDER_VERIFIED" != "true" ]]; then
  echo "ERROR: sender '$SENDER' is not a verified SES identity in $REGION (status: $SENDER_VERIFIED)." >&2
  echo "       Verify it, or pass --sender with the identity production is configured to send from." >&2
  exit 1
fi
echo "Sender identity: $SENDER (verified)"

echo "Sending to mailbox simulator ($SIMULATOR)..."
echo "  MessageId: $(send_one "$SIMULATOR")"

if [[ -n "$INBOX" ]]; then
  echo "Sending to operator inbox ($INBOX)..."
  echo "  MessageId: $(send_one "$INBOX")"
fi

if [[ "$BOUNCE_PROBE" -eq 1 ]]; then
  # Synthetic feedback-loop validation: the bounce simulator generates a
  # reputation-safe permanent bounce, which flows SES -> SNS -> the feedback
  # queue the worker polls. The simulator address matches no member row, so the
  # app records an email.bounce_recorded audit row with member_matched=false and
  # no member state changes. Nothing arrives at all where the environment's
  # feedback queue has not been brought up: the notification is published to a
  # topic with no subscriber and dropped.
  echo "Sending to bounce simulator ($BOUNCE_SIMULATOR)..."
  echo "  MessageId: $(send_one "$BOUNCE_SIMULATOR")"
  echo "  Within a few minutes, verify an 'email.bounce_recorded' audit row"
  echo "  appeared (masked b***@simulator.amazonses.com, member_matched=false):"
  echo "    SELECT created_at, metadata_json FROM audit_entries"
  echo "    WHERE action_type = 'email.bounce_recorded' ORDER BY created_at DESC LIMIT 3;"
fi

cat <<'EOF'

Manual confirmation checklist:
  1. If --inbox was supplied: the message arrived, and its headers show
     DKIM=pass and SPF=pass for footbag.org.
  2. An email-gated production page (e.g. /register/check-email after a real
     registration) renders the standard "check your email" copy with NO in-page
     preview card. The preview card is a development and staging affordance
     only; production must never render it.
  3. Bounce and complaint suppression wiring: run with --bounce-probe to
     exercise the full SES -> SNS -> feedback-queue loop with a reputation-safe
     synthetic bounce, then check the audit query the probe prints.
EOF
