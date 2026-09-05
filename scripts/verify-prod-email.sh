#!/usr/bin/env bash
# Production email send-path validation. Operator-run after SES production-access
# activation (AWS_OPERATIONS.md, private GitHub repo). Sends through live SES to
# the AWS mailbox simulator
# (reputation-safe: the success simulator address never bounces and is not a
# real recipient) and, optionally, to one operator-supplied real inbox for an
# end-to-end deliverability + DKIM confirmation.
#
# With --host-alias, additionally runs the outbox leg (validation gate G10):
# the outbox send-path smoke executes inside the web container on the host,
# enqueueing through the application path and watching the worker drain the
# row to live SES, which the two direct `aws ses send-email` legs above cannot
# prove. Needs the operator credential file on stdin, host sudo-password first
# line, per the wire pattern in scripts/lib/host-env-remote.sh:
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/verify-prod-email.sh \
#       --profile <p> --confirm-production --host-alias <alias> --inbox <addr>
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
HOST_ALIAS=""
OUTBOX_TIMEOUT_SECONDS=""

usage() {
  echo "Usage: $0 --profile <aws-profile> --confirm-production [--sender <address>] [--inbox <address>] [--bounce-probe] [--host-alias <ssh-alias> [--outbox-timeout-seconds <n>]]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --sender) SENDER="$2"; shift 2 ;;
    --inbox) INBOX="$2"; shift 2 ;;
    --confirm-production) CONFIRMED=1; shift ;;
    --bounce-probe) BOUNCE_PROBE=1; shift ;;
    --host-alias) HOST_ALIAS="$2"; shift 2 ;;
    --outbox-timeout-seconds) OUTBOX_TIMEOUT_SECONDS="$2"; shift 2 ;;
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

# The outbox leg opens a privileged remote session, so its credential is read
# from stdin before anything else runs: a failure here should cost nothing.
if [[ -n "$HOST_ALIAS" ]]; then
  # shellcheck source=lib/host-env-remote.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/host-env-remote.sh"
  require_operator_stdin "scripts/verify-prod-email.sh --profile <p> --confirm-production --host-alias <alias>" || exit 2
  require_ssh_alias "$HOST_ALIAS" || exit 2
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
#
# Three outcomes here, not two, because reading an identity and sending as it
# are authorized separately. This script must run as the runtime role, since
# that is the principal production sends as, and that role deliberately grants
# only the two send actions: reading an identity's verification status is not a
# call the application makes, so it is not a permission the role carries. A
# denied read therefore says nothing at all about the sender, and collapsing it
# into "not verified" reintroduces the exact ambiguity this check exists to
# remove — pointing the operator at a verification problem that does not exist
# while the real one is a permission the role is not supposed to have.
if SENDER_STATUS=$(
  aws sesv2 get-email-identity \
    --email-identity "$SENDER" \
    --region "$REGION" \
    --profile "$PROFILE" \
    --query VerifiedForSendingStatus --output text 2>&1
); then
  if [[ "$SENDER_STATUS" != "True" && "$SENDER_STATUS" != "true" ]]; then
    echo "ERROR: sender '$SENDER' is not a verified SES identity in $REGION (status: $SENDER_STATUS)." >&2
    echo "       Verify it, or pass --sender with the identity production is configured to send from." >&2
    exit 1
  fi
  echo "Sender identity: $SENDER (verified)"
elif printf '%s' "$SENDER_STATUS" | grep -qiE 'accessdenied|not authorized'; then
  echo "Sender identity: $SENDER (status not readable by this profile; sending anyway)"
  echo "  The send principal grants sending only, so it cannot read an identity."
  echo "  If a send below fails as though unauthorized, confirm the identity with"
  echo "  a profile that can read it before suspecting the grant:"
  echo "    aws sesv2 get-email-identity --email-identity $SENDER --region $REGION \\"
  echo "      --profile <operator profile> --query VerifiedForSendingStatus"
else
  echo "ERROR: could not read the verification status of '$SENDER' in $REGION." >&2
  printf '%s\n' "$SENDER_STATUS" | sed 's/^/       /' >&2
  exit 1
fi

echo "Sending to mailbox simulator ($SIMULATOR)..."
echo "  MessageId: $(send_one "$SIMULATOR")"

if [[ -n "$INBOX" ]]; then
  echo "Sending to operator inbox ($INBOX)..."
  echo "  MessageId: $(send_one "$INBOX")"
fi

if [[ -n "$HOST_ALIAS" ]]; then
  # Outbox leg (validation gate G10): enqueue through the application path on
  # the host and watch the worker drain the row to live SES. The recipient is
  # the operator inbox when one was supplied, else the success simulator,
  # which proves the chain without an inbox to check.
  OUTBOX_TO="${INBOX:-$SIMULATOR}"
  OUTBOX_REMOTE_HALF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/internal/outbox-smoke-remote.sh"
  if [[ ! -r "$OUTBOX_REMOTE_HALF" ]]; then
    echo "ERROR: missing remote half: $OUTBOX_REMOTE_HALF" >&2; exit 1
  fi
  require_host_ssh_opts || exit 1
  echo "Running the outbox send-path smoke on ${HOST_ALIAS} (to ${OUTBOX_TO})..."
  if ! {
        printf '%s\n' "$SUDO_PASS"
        printf 'SMOKE_TO=%q\n' "$OUTBOX_TO"
        printf 'SMOKE_TIMEOUT_SECONDS=%q\n' "$OUTBOX_TIMEOUT_SECONDS"
        cat "$OUTBOX_REMOTE_HALF"
      } | ssh "${HOST_SSH_OPTS[@]}" "$HOST_ALIAS" 'sudo -k -S -p "" bash'; then
    echo "ERROR: the outbox send-path smoke failed; its GATE: line above names where the row stopped." >&2
    exit 1
  fi
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
