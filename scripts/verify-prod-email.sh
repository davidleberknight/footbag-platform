#!/usr/bin/env bash
# Production email send-path validation. Sends through live SES to the AWS
# mailbox simulator (reputation-safe: the success simulator address never bounces
# and is not a real recipient) and, optionally, to one operator-supplied real
# inbox for an end-to-end deliverability + DKIM confirmation.
#
# A real --inbox can be any address: with production access on the account, SES
# does not require the recipient to be a verified identity.
#
# With --outbox, additionally runs the outbox leg (validation gate G10) on the
# production host, footbag-production, which confirms it is production first:
# the outbox send-path smoke executes inside the web container on the host,
# enqueueing through the application path and watching the worker drain the
# row to live SES, which the two direct `aws ses send-email` legs above cannot
# prove. Needs the credential file on stdin, host sudo-password first line, per
# the wire pattern in scripts/lib/host-env-remote.sh.
#
# Production is reached only as the shared footbag account, so that file is:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#
# A run started without the redirect names the one it needs.
#
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/verify-prod-email.sh \
#       --profile <p> --outbox --inbox <addr>
#
# --inbox-from-tty asks for the inbox at the terminal instead of taking it as an
# argument, for a caller (the readiness sitting) whose commands are committed:
# the operations mailbox is vault material, so it is typed, never written into a
# command. An empty answer is refused, since the check would then prove arrival
# nowhere.
#
# Two principals, each doing one job. --profile is the principal production
# sends as, the runtime role, and every send goes through it, because a send
# through it is what proves the role may send. That role may only send, so it
# cannot read an identity. --read-profile names a principal that can, the
# operator, and every identity read goes through it: whether the sender is
# verified, and the custom bounce domain's state. It must resolve to the same
# account as --profile, so the identity it reads is the one mail is sent through.
#
# This sends REAL email via the production SES identity. It refuses to run
# without an explicit production profile, and before the first send it states
# what it is about to send and asks for a typed APPLY on the terminal. --yes
# answers that prompt in advance; it exists for the pre-cutover checklist, which
# captures this script's output and so takes the typed APPLY itself first.
#
# It ends with one closing report on stderr listing every problem the run met,
# and exits non-zero when any is an error; stdout carries the run's own lines.
set -euo pipefail

# shellcheck source=lib/closing-report.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/closing-report.sh"
# confirm_from_tty and the host wire. Sourced before the flags are parsed,
# because the library assigns the accept-without-asking flag and --yes sets it.
# shellcheck source=lib/host-env-remote.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/host-env-remote.sh"

# The sender production is configured to send as, read from the production
# tree's ses_sender_identity output unless --sender names another. It is not the
# canonical address by default: until the sender moves onto the domain identity,
# production sends under an interim address, and a check sending under any other
# address proves nothing about the running configuration. An output that cannot
# be read is refused rather than replaced with a guess.
SENDER=""
REGION="us-east-1"             # SES identity region
SIMULATOR="success@simulator.amazonses.com"
BOUNCE_SIMULATOR="bounce@simulator.amazonses.com"
INBOX=""
INBOX_FROM_TTY=0
PROFILE=""
READ_PROFILE=""
BOUNCE_PROBE=0
OUTBOX=0
OUTBOX_TIMEOUT_SECONDS=""
# This script validates production and nothing else, so its host is production's
# own alias rather than an argument a run could point somewhere else.
HOST_ALIAS="footbag-production"

usage() {
  echo "Usage: $0 --profile <aws-profile> --read-profile <aws-profile> [--sender <address>] [--inbox <address> | --inbox-from-tty] [--bounce-probe] [--outbox [--outbox-timeout-seconds <n>]] [--yes]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --read-profile) READ_PROFILE="$2"; shift 2 ;;
    --sender) SENDER="$2"; shift 2 ;;
    --inbox) INBOX="$2"; shift 2 ;;
    --inbox-from-tty) INBOX_FROM_TTY=1; shift ;;
    --yes) ASSUME_YES="yes"; shift ;;
    --bounce-probe) BOUNCE_PROBE=1; shift ;;
    --outbox) OUTBOX=1; shift ;;
    --outbox-timeout-seconds) OUTBOX_TIMEOUT_SECONDS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$PROFILE" ]]; then
  echo "ERROR: --profile <production-runtime-profile> is required" >&2; exit 2
fi
if [[ -z "$READ_PROFILE" ]]; then
  echo "ERROR: --read-profile <operator-profile> is required: the send profile cannot read an SES identity" >&2; exit 2
fi

if (( INBOX_FROM_TTY )); then
  if [[ -n "$INBOX" ]]; then
    echo "ERROR: --inbox and --inbox-from-tty both name the inbox; give one" >&2; exit 2
  fi
  # Read from the terminal device, never stdin, which may carry the host
  # credential for the outbox leg.
  if ! terminal_present; then
    echo "ERROR: --inbox-from-tty needs a terminal to ask on" >&2; exit 2
  fi
  printf 'Inbox to send the check to (an address you can open now): ' > /dev/tty
  IFS= read -r INBOX < /dev/tty || INBOX=""
  INBOX="${INBOX//[[:space:]]/}"
  if [[ -z "$INBOX" ]]; then
    echo "ERROR: no inbox was given; nothing was sent" >&2; exit 2
  fi
fi

if [[ -z "$SENDER" ]]; then
  # shellcheck source=lib/terraform-output.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/terraform-output.sh"
  PROD_TF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/terraform/production"
  if ! tf_output_read "$PROD_TF_DIR" ses_sender_identity || [[ -z "$TF_OUTPUT_VALUE" ]]; then
    echo "ERROR: could not read the sender production sends as (the ses_sender_identity output)." >&2
    tf_output_explain "$PROD_TF_DIR" ses_sender_identity
    echo "       Or name it explicitly with --sender <address>." >&2
    exit 2
  fi
  SENDER="$TF_OUTPUT_VALUE"
fi
echo "Sender: $SENDER"

# The outbox leg opens a privileged remote session, so its credential is read
# from stdin before anything else runs: a failure here should cost nothing.
if (( OUTBOX )); then
  require_operator_stdin "scripts/verify-prod-email.sh --profile <p> --outbox" \
    "$HOST_ALIAS" production || exit 2
  require_ssh_alias "$HOST_ALIAS" || exit 2
  require_host_is "$HOST_ALIAS" production || exit 2
fi

# Confirm the profile resolves to a production identity before sending anything.
ARN=$(aws sts get-caller-identity --profile "$PROFILE" --query Arn --output text)
echo "Caller identity: $ARN"
case "$ARN" in
  *footbag-production*) : ;;
  *) echo "ERROR: profile '$PROFILE' does not resolve to a footbag-production identity (got $ARN)" >&2; exit 1 ;;
esac

# The read principal, proved rather than trusted from its profile's name: an
# identity read in another account would describe some other sender entirely.
READ_ARN=$(aws sts get-caller-identity --profile "$READ_PROFILE" --query Arn --output text)
echo "Read identity: $READ_ARN"
if [[ "$(cut -d: -f5 <<< "$READ_ARN")" != "$(cut -d: -f5 <<< "$ARN")" ]]; then
  cr_die "read profile '$READ_PROFILE' resolves to $READ_ARN, which is not in the account the send profile is in ($ARN)"
fi

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
# Every identity read goes through the read principal: reading an identity is
# not a call the application makes, so the runtime role does not carry it.
#
# identity_read <identity> <query>
# Prints the answer and returns 0, or prints the CLI's last error line and
# returns 1. The answer is taken from stdout alone, because a warning the CLI
# prints on stderr beside a successful answer would otherwise be compared as the
# status; the error text comes from reading again, answer discarded.
identity_read() {
  local call=(aws sesv2 get-email-identity --email-identity "$1" --region "$REGION"
    --profile "$READ_PROFILE" --query "$2" --output text)
  local answer
  if answer="$("${call[@]}" 2>/dev/null)"; then
    printf '%s' "$answer"
    return 0
  fi
  "${call[@]}" 2>&1 >/dev/null | tail -n 1
  return 1
}

# Which identity to read. An address verified on its own is its own identity; an
# address at a verified domain has none, and SES authorises it through the
# domain's. The canonical sender is the second kind, so reading the address
# alone would report it missing on the day it starts working. Only a read that
# SES answers "not found" moves to the domain; any other failure stays on the
# address and is reported by the read below.
IDENTITY="$SENDER"
if ! identity_said="$(identity_read "$SENDER" IdentityType)"; then
  if grep -qi 'NotFoundException' <<< "$identity_said"; then
    IDENTITY="${SENDER#*@}"
  fi
fi

if ! SENDER_STATUS="$(identity_read "$IDENTITY" VerifiedForSendingStatus)"; then
  cr_die "could not read the verification status of '$SENDER' through identity '$IDENTITY' as $READ_ARN: $SENDER_STATUS"
fi
if [[ "$SENDER_STATUS" != "True" && "$SENDER_STATUS" != "true" ]]; then
  cr_die "sender '$SENDER' is not verified for sending in $REGION through identity '$IDENTITY' (status: $SENDER_STATUS). Verify it, or pass --sender with the identity production is configured to send from."
fi
if [[ "$IDENTITY" == "$SENDER" ]]; then
  echo "Sender identity: $SENDER (verified)"
else
  echo "Sender identity: $SENDER (verified through the $IDENTITY domain identity)"
fi

# The custom bounce domain degrades silently by design, which is why it is read
# here rather than trusted. The failure behaviour is left at its default, so if
# SES cannot read the bounce domain's MX record it falls back to its own envelope
# sender instead of refusing the send. That keeps mail flowing on a bad day,
# which is the right failure for this site, but it drops the domain's
# authentication to signature alignment alone and nothing bounces, alarms or
# logs. A setup stuck at Pending or Failed is therefore invisible everywhere
# except here. SES reports state changes to the address on the AWS account, which
# is a maintainer's mailbox rather than the operational channel.
#
# Which side of mail day a run is on is read from SES itself: the mail-day apply
# is what configures the bounce domain on the identity, together with its
# records, so a bounce domain SES holds means the records are applied. Before
# that there is nothing to judge, and the expected absence is not reported as a
# problem. After it, anything but a healthy state is an error, because the
# freeze-day run of this check is what launch waits on to prove alignment, and a
# domain SES has not yet found (Pending) aligns no better than a failed one. The
# send legs below still run, so the report also says whether sending works. An
# unreadable identity is an error at any time: a failed read is never "not
# configured", since that would pass a mail-day run that proved nothing.
if ! MAIL_FROM="$(identity_read "$IDENTITY" 'MailFromAttributes.[MailFromDomain,MailFromDomainStatus]')"; then
  echo "Custom bounce domain: status could not be read"
  cr_error "the custom bounce domain on identity '$IDENTITY' could not be read as $READ_ARN, so whether mail aligns is not known: $MAIL_FROM"
else
  read -r MAIL_FROM_DOMAIN MAIL_FROM_STATUS <<< "$MAIL_FROM"
  case "${MAIL_FROM_DOMAIN}:${MAIL_FROM_STATUS}" in
    None:*|:*)
      echo "Custom bounce domain: not configured (SES uses its own envelope sender)"
      echo "  Expected before mail day; the mail-day apply configures it."
      ;;
    *:SUCCESS)
      echo "Custom bounce domain: healthy (aligned return path in use)"
      cr_proved "the custom bounce domain ${MAIL_FROM_DOMAIN} is healthy: SES sends with the aligned return path"
      ;;
    *)
      echo "Custom bounce domain: ${MAIL_FROM_STATUS} -- NOT healthy"
      echo "  SES is falling back to its own envelope sender, so mail still goes"
      echo "  out but cannot align on the sender-policy route. Check the bounce"
      echo "  domain's MX record: SES requires exactly one, and several make the"
      echo "  setup fail. SES retries detection for 72 hours before giving up."
      cr_error "the custom bounce domain ${MAIL_FROM_DOMAIN} reads ${MAIL_FROM_STATUS}, not SUCCESS, so mail goes out unaligned; re-run once SES has found its MX record"
      ;;
  esac
fi

# Every check that sends nothing has passed; everything below sends real mail
# through the production identity, so this is where the operator confirms it.
echo ""
echo "About to send REAL email through production SES as ${SENDER}:"
echo "  to the mailbox simulator (${SIMULATOR})"
[[ -n "$INBOX" ]] && echo "  to the inbox ${INBOX}"
(( OUTBOX )) && echo "  through the outbox on ${HOST_ALIAS}, to ${INBOX:-$SIMULATOR}"
(( BOUNCE_PROBE )) && echo "  to the bounce simulator (${BOUNCE_SIMULATOR})"
if ! confirm_from_tty "Type APPLY to send: " "APPLY"; then
  cr_die "Not confirmed; nothing was sent."
fi

echo "Sending to mailbox simulator ($SIMULATOR)..."
echo "  MessageId: $(send_one "$SIMULATOR")"
cr_proved "a send as ${SENDER} through ${ARN} to the mailbox simulator was accepted"

if [[ -n "$INBOX" ]]; then
  echo "Sending to operator inbox ($INBOX)..."
  echo "  MessageId: $(send_one "$INBOX")"
  cr_proved "a send to the operator inbox was accepted"
  cr_unproved "its arrival and headers: the manual checklist below"
fi

if (( OUTBOX )); then
  # Outbox leg (validation gate G10): enqueue through the application path on
  # the host and watch the worker drain the row to live SES. The recipient is
  # the operator inbox when one was supplied, else the success simulator,
  # which proves the chain without an inbox to check.
  OUTBOX_TO="${INBOX:-$SIMULATOR}"
  OUTBOX_REMOTE_HALF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/internal/outbox-smoke-remote.sh"
  if [[ ! -r "$OUTBOX_REMOTE_HALF" ]]; then
    cr_die "missing remote half: $OUTBOX_REMOTE_HALF"
  fi
  require_host_ssh_opts || exit 1
  echo "Running the outbox send-path smoke on ${HOST_ALIAS} (to ${OUTBOX_TO})..."
  # The stream carries the sudo password, so the session runs marked: only lines
  # the half marks are ever written down.
  outbox_session() {
    {
      printf '%s\n' "$SUDO_PASS"
      printf 'SMOKE_TO=%q\n' "$OUTBOX_TO"
      printf 'SMOKE_TIMEOUT_SECONDS=%q\n' "$OUTBOX_TIMEOUT_SECONDS"
      cat "$OUTBOX_REMOTE_HALF"
    } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$HOST_ALIAS" 'sudo -k -S -p "" bash'
  }
  if ! cr_run_marked "the outbox send-path smoke on ${HOST_ALIAS} (its GATE: line names where the row stopped)" -- outbox_session; then
    exit 1
  fi
  cr_proved "a row enqueued through the application on ${HOST_ALIAS} was drained by the worker to live SES"
fi

if [[ "$BOUNCE_PROBE" -eq 1 ]]; then
  # Synthetic feedback-loop validation: the bounce simulator generates a
  # reputation-safe permanent bounce, which flows SES -> SNS -> the feedback
  # queue the worker polls. The simulator address matches no member row, so the
  # app records the notification's ses_events claim row and nothing else: no
  # member state changes, and no audit entry, since the audit log keeps nothing
  # about an address no member holds. Nothing arrives at all where the
  # environment's feedback queue has not been brought up: the notification is
  # published to a topic with no subscriber and dropped.
  probe_sent="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Sending to bounce simulator ($BOUNCE_SIMULATOR)..."
  echo "  MessageId: $(send_one "$BOUNCE_SIMULATOR")"
  echo "  Within a few minutes, the bounce feed should record it. Check with:"
  echo "    bash scripts/host-diagnostics.sh --target production \\"
  echo "      ses-bounces --since ${probe_sent}"
  cr_proved "a send to the bounce simulator was accepted"
  cr_unproved "the bounce feed recording it: the host diagnostics command above"
fi

cat <<'EOF'

Manual confirmation checklist:
  1. If --inbox was supplied: the message arrived, and its headers show
     DKIM=pass and SPF=pass. Read the signing DOMAIN before calling it a
     failure: while production sends under the interim address identity with
     domain-level signing off, the pass is for amazonses.com, which is correct.
     It becomes footbag.org at the sender cutover, when sending moves onto the
     domain identity.
  2. An email-gated production page (e.g. /register/check-email after a real
     registration) renders the standard "check your email" copy with NO in-page
     preview card. The preview card is a development and staging affordance
     only; production must never render it.
  3. Bounce and complaint suppression wiring: run with --bounce-probe to
     exercise the full SES -> SNS -> feedback-queue loop with a reputation-safe
     synthetic bounce, then check the audit query the probe prints.
EOF
cr_finish
