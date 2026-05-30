#!/usr/bin/env bash
# Production email send-path validation. Operator-run after the Path I SES
# activation. Sends through live SES to the AWS mailbox simulator
# (reputation-safe: the success simulator address never bounces and is not a
# real recipient) and, optionally, to one operator-supplied real inbox for an
# end-to-end deliverability + DKIM confirmation.
#
# This sends REAL email via the production SES identity. It refuses to run
# without an explicit production profile and an explicit confirmation flag.
set -euo pipefail

SENDER="noreply@footbag.org"   # canonical transactional sender
REGION="us-east-1"             # SES identity region
SIMULATOR="success@simulator.amazonses.com"
INBOX=""
PROFILE=""
CONFIRMED=0

usage() {
  echo "Usage: $0 --profile <aws-profile> --confirm-production [--inbox <address>]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --inbox) INBOX="$2"; shift 2 ;;
    --confirm-production) CONFIRMED=1; shift ;;
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

echo "Sending to mailbox simulator ($SIMULATOR)..."
echo "  MessageId: $(send_one "$SIMULATOR")"

if [[ -n "$INBOX" ]]; then
  echo "Sending to operator inbox ($INBOX)..."
  echo "  MessageId: $(send_one "$INBOX")"
fi

cat <<'EOF'

Manual confirmation checklist:
  1. If --inbox was supplied: the message arrived, and its headers show
     DKIM=pass and SPF=pass for footbag.org.
  2. An email-gated production page (e.g. /register/check-email after a real
     registration) renders the standard "check your email" copy with NO in-page
     preview card. The preview card is a development and staging affordance
     only; production must never render it.
  3. Bounce and complaint suppression wiring is validated separately once the
     SNS feedback handler is implemented; this script does not exercise it.
EOF
