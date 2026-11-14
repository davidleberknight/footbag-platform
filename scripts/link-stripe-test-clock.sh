#!/usr/bin/env bash
# link-stripe-test-clock.sh
#
# Creates a Stripe test clock and a customer attached to it, in test mode, and
# links that customer to a named member on pre-cutover production, so the
# member's next recurring donation renews on the clock.
#
# Why this exists. A genuine renewal, a dunning run and the cancellation at the
# end of dunning can only be produced by advancing a Stripe test clock, and a
# clock attaches to a customer only when the customer is created. The platform
# creates its customer inside checkout, so the ordinary donation flow can never
# produce a clock-attached one. The rehearsal therefore creates the customer
# first and writes its id onto the member, where the recurring checkout already
# looks for a member's customer. That write goes through the payment service in
# the running container, never by editing the database, and the rebuild that
# closes the rehearsal clears it with everything else.
#
# What it refuses:
#   - any target but production, the only host whose live payment adapter can
#     hold a test key;
#   - a production-live marker that does not read exactly "false", or cannot be
#     read: after go-live production holds real money and no test key;
#   - a live key, or anything that is not a test secret key;
#   - a member who does not exist, has died, or already holds a Stripe customer
#     (a member with no recurring donation yet is needed), and a host whose
#     payment key is not a test key; the payment service decides all three;
#   - running without a terminal, because it reads a key, and changing anything
#     without --apply and a typed APPLY.
#
# Without --apply it is a dry run: it checks every precondition, including the
# member and the host's key, and creates and writes nothing. With --apply it
# writes a record of the change (a CSV of the row and the rollback SQL) into
# --record-dir before the write, creates the clock and the customer, then links
# them. If the link fails, the clock it created is deleted at Stripe, which
# deletes the customer with it, so a re-run starts clean. A re-run after a
# success refuses, because the member then holds the customer, and changes
# nothing.
#
# Usage. Production is reached only as the shared footbag account, so the sudo
# password is that account's production file:
#
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/link-stripe-test-clock.sh \
#     --target production --member <slug>
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/link-stripe-test-clock.sh \
#     --target production --member <slug> --apply --record-dir <dir>
#
# --member-from-tty asks for the slug at the terminal instead, for a run whose
# command is written down before the member is chosen.
#
# The test key is in the Stripe Dashboard, in the sandbox, under Developers, API
# keys; it is read from the terminal, never argv, and lives only in a mode-0600
# curl config shredded when the run ends. Advance the clock afterwards in the
# Dashboard, under Billing, Test clocks.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/link-test-clock-remote.sh"
REMOTE_REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"

TARGET=""
MEMBER=""
MEMBER_FROM_TTY=0
APPLY=0
RECORD_DIR=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)     TARGET="${2:-}";     shift 2 || cr_die "--target requires an argument" ;;
    --member)     MEMBER="${2:-}";     shift 2 || cr_die "--member requires a slug" ;;
    --member-from-tty) MEMBER_FROM_TTY=1; shift ;;
    --record-dir) RECORD_DIR="${2:-}"; shift 2 || cr_die "--record-dir requires a directory" ;;
    --apply)      APPLY=1; shift ;;
    -h|--help)    usage ;;
    *)            echo "ERROR: unknown argument: $1" >&2; usage ;;
  esac
done

[[ "$TARGET" == "production" ]] \
  || cr_die "--target must be production: it is the only host whose payment adapter can hold a test key"
if (( MEMBER_FROM_TTY )); then
  [[ -z "$MEMBER" ]] || cr_die "give the member with --member or --member-from-tty, not both"
  # Asked at the terminal, so a run named in advance (the readiness sitting)
  # can link whichever member the operator chooses on the day.
  terminal_present || cr_die "no terminal to ask for the member on. Run it from an interactive shell."
  printf 'Slug of the member to link (one with no recurring donation yet): ' > /dev/tty
  IFS= read -r MEMBER < /dev/tty || MEMBER=""
fi
[[ "$MEMBER" =~ ^[a-z0-9_]+$ ]] || cr_die "--member must be a member's slug (lowercase letters, digits, underscores)"
if (( APPLY )); then
  [[ -n "$RECORD_DIR" && -d "$RECORD_DIR" ]] \
    || cr_die "--apply needs --record-dir <existing directory>, where the record of the change is written before it is made"
else
  [[ -z "$RECORD_DIR" ]] || cr_die "--record-dir is only for --apply; a dry run writes nothing"
fi
[[ -r "$REMOTE_HALF" ]] || cr_die "missing remote half: $REMOTE_HALF"
[[ -r "$REMOTE_REPORT_LIB" ]] || cr_die "missing remote-half report library: $REMOTE_REPORT_LIB"
command -v jq >/dev/null || cr_die "jq is required"

# Test seams. A stubbed run proves nothing about the account, so it says so.
CURL_BIN="${FOOTBAG_STRIPE_TESTCLOCK_CURL_BIN:-curl}"
AWS_BIN="${FOOTBAG_STRIPE_TESTCLOCK_AWS_BIN:-aws}"
if [[ -n "${FOOTBAG_STRIPE_TESTCLOCK_CURL_BIN:-}${FOOTBAG_STRIPE_TESTCLOCK_AWS_BIN:-}" ]]; then
  echo "SYNTHETIC: a test seam is in use -- this run proves nothing about the account or the marker." >&2
fi

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/link-stripe-test-clock.sh --target ${TARGET} --member ${MEMBER}" \
  "$ALIAS" "$TARGET" || exit 1
require_host_is "$ALIAS" "$TARGET" || exit 1

# The marker is read before anything else is asked of the operator. Only the
# exact pre-launch value lets the run go on, and a failed read is never taken to
# mean pre-launch.
aws_profile_ensure || exit 1
MARKER="$("$AWS_BIN" ssm get-parameter --name /footbag/production/app/production_live \
  --query 'Parameter.Value' --output text 2>&1)" \
  || cr_die "could not read the production-live marker: ${MARKER}. Nothing was changed."
[[ "$MARKER" == "false" ]] \
  || cr_die "the production-live marker reads '${MARKER}', not 'false': production is live or its state is unknown, and a test clock is linked only before launch. Nothing was changed."
echo "The production-live marker reads 'false': before launch."

SYNTHETIC_KEY=""
if [[ -n "${FOOTBAG_STRIPE_TESTCLOCK_CURL_BIN:-}" ]]; then
  SYNTHETIC_KEY="${FOOTBAG_STRIPE_TESTCLOCK_KEY_VALUE:-}"
fi
if [[ -z "$SYNTHETIC_KEY" ]] && ! terminal_present; then
  cr_die "no terminal: this reads a Stripe key and asks for a typed APPLY. Run it from an interactive shell."
fi

umask 077
WORK="$(mktemp -d)"
# Cleanups run newest first: every file is shredded, then the directory goes.
cr_cleanup rm -rf "$WORK"
cr_cleanup find "$WORK" -type f -exec shred -u {} +

if [[ -n "$SYNTHETIC_KEY" ]]; then
  STRIPE_KEY="$SYNTHETIC_KEY"
else
  printf 'The test secret key, starting sk_test_, is in the Stripe Dashboard, in the sandbox,\n' > /dev/tty
  printf 'under Developers, API keys. Paste it; it is used for this run only.\n' > /dev/tty
  printf 'Stripe test secret key (input hidden): ' > /dev/tty
  read -rs STRIPE_KEY < /dev/tty
  printf '\n' > /dev/tty
fi
case "$STRIPE_KEY" in
  sk_test_*) ;;
  sk_live_*|rk_live_*) unset STRIPE_KEY; cr_die "that is a live key. A test clock exists only in test mode; nothing was changed." ;;
  *)                   unset STRIPE_KEY; cr_die "that is not a Stripe test secret key (sk_test_...); nothing was changed." ;;
esac
printf 'user = "%s:"\n' "$STRIPE_KEY" > "$WORK/curlrc"
unset STRIPE_KEY

# host_session <mode> [customer]: one privileged session running the remote
# half, its stdout (the LINK: line) kept in a file the run then reads.
host_session() {
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'MEMBER_SLUG=%q\n' "$MEMBER"
    printf 'LINK_MODE=%q\n' "$1"
    printf 'CUSTOMER_ID=%q\n' "${2:-}"
    cat "$REMOTE_REPORT_LIB" "$REMOTE_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash' > "$WORK/link.out"
}

# link_line: the LINK: line the last session printed, without its prefix.
link_line() {
  sed -n 's/^LINK: //p' "$WORK/link.out" | tail -1
}

echo "Checking the member and the host's payment key on ${ALIAS}..."
# A refusal comes back as the session's non-zero status and a LINK: REFUSED
# line; the line is what the verdict reads, and the status is named beside it.
check_rc=0
cr_run_marked "the link check on ${ALIAS}" -- host_session check || check_rc=$?
CHECK="$(link_line)"
[[ "$check_rc" == 0 && "$CHECK" == CHECK\ member=* ]] \
  || cr_die "the host refused the link (session exit ${check_rc}): ${CHECK:-no LINK: line came back}. Nothing was changed."
MEMBER_ID="${CHECK#CHECK member=}"
echo "  ${MEMBER} is member ${MEMBER_ID}, holds no Stripe customer, and the host's key is a test key."

if (( ! APPLY )); then
  cr_proved "the marker reads false, the key is a test key, and ${MEMBER} can take a test-clock customer"
  cr_unproved "nothing was created or written: re-run with --apply --record-dir <dir>"
  cr_finish
fi

# stripe_post <url> <output file> [curl args...]: one call, refused on a
# transport failure or an error the provider reports. Nothing it runs reads the
# terminal, which holds the operator's APPLY.
stripe_post() {
  local url="$1" out="$2"
  shift 2
  "$CURL_BIN" -s --config "$WORK/curlrc" "$url" "$@" -o "$out" </dev/null \
    || cr_die "the request to $url failed before Stripe answered"
  local err
  err="$(jq -r '.error.message // empty' "$out" 2>/dev/null)" || cr_die "Stripe's answer from $url is not JSON"
  [[ -z "$err" ]] || cr_die "Stripe refused $url: $err"
}

echo ""
echo "About to, in Stripe test mode and on ${TARGET}:"
echo "  1. create a test clock frozen at the current time,"
echo "  2. create a customer attached to it,"
echo "  3. record the change in ${RECORD_DIR},"
echo "  4. link the customer to ${MEMBER} (member ${MEMBER_ID}) through the payment service."
echo "The member's next recurring donation then renews on the clock."
confirm_from_tty "Type 'APPLY' to continue: " "APPLY" || cr_die "not confirmed; nothing was changed"

CLOCK=""
LINKED=0
# The clock is this run's own and nothing outside it records the clock until the
# link lands, so a run that stops short deletes it, and its customer with it.
delete_unlinked_clock() {
  [[ -n "$CLOCK" ]] && (( ! LINKED )) || return 0
  if "$CURL_BIN" -s --config "$WORK/curlrc" -X DELETE \
      "https://api.stripe.com/v1/test_helpers/test_clocks/$CLOCK" -o "$WORK/deleted.json" </dev/null \
      && [[ "$(jq -r '.deleted // false' "$WORK/deleted.json")" == "true" ]]; then
    echo "The link did not land, so test clock ${CLOCK} and its customer were deleted at Stripe." >&2
  else
    cr_error "the link did not land and test clock ${CLOCK} could not be deleted; delete it in the Dashboard under Billing, Test clocks"
  fi
}
cr_cleanup delete_unlinked_clock

stripe_post https://api.stripe.com/v1/test_helpers/test_clocks "$WORK/clock.json" \
  -d frozen_time="$(date -u +%s)" -d name="footbag payment rehearsal"
CLOCK="$(jq -r '.id // empty' "$WORK/clock.json")"
[[ "$CLOCK" == clock_* && "$(jq -r '.livemode' "$WORK/clock.json")" == "false" ]] \
  || cr_die "Stripe did not return a test-mode clock"
echo "Created test clock ${CLOCK}."

stripe_post https://api.stripe.com/v1/customers "$WORK/customer.json" \
  -d test_clock="$CLOCK" -d description="footbag payment rehearsal"
CUSTOMER="$(jq -r '.id // empty' "$WORK/customer.json")"
[[ "$CUSTOMER" == cus_* && "$(jq -r '.livemode' "$WORK/customer.json")" == "false" \
   && "$(jq -r '.test_clock' "$WORK/customer.json")" == "$CLOCK" ]] \
  || cr_die "Stripe did not return a test-mode customer attached to ${CLOCK}"
echo "Created customer ${CUSTOMER} on the clock."

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RECORD="${RECORD_DIR%/}/test-clock-link-${MEMBER}-${STAMP}"
printf 'table,id,column,before,after,test_clock\nmembers,%s,stripe_customer_id,,%s,%s\n' \
  "$MEMBER_ID" "$CUSTOMER" "$CLOCK" > "${RECORD}.csv"
printf -- "-- Undoes the test-clock link made by scripts/link-stripe-test-clock.sh at %s.\n-- The rebuild that closes the payment rehearsal clears it as well.\nUPDATE members SET stripe_customer_id = NULL WHERE id = '%s' AND stripe_customer_id = '%s';\n" \
  "$STAMP" "$MEMBER_ID" "$CUSTOMER" > "${RECORD}.rollback.sql"
echo "Recorded the change in ${RECORD}.csv and ${RECORD}.rollback.sql."

echo "Linking ${CUSTOMER} to ${MEMBER} on ${ALIAS}..."
link_rc=0
cr_run_marked "the link on ${ALIAS}" -- host_session link "$CUSTOMER" || link_rc=$?
RESULT="$(link_line)"
case "$link_rc:$RESULT" in
  "0:LINKED member=${MEMBER_ID} customer=${CUSTOMER}"|"0:ALREADY member=${MEMBER_ID} customer=${CUSTOMER}")
    LINKED=1 ;;
  *)
    cr_die "the host did not link the customer (session exit ${link_rc}): ${RESULT:-no LINK: line came back}" ;;
esac

cr_proved "test clock ${CLOCK} and its customer ${CUSTOMER} were created in test mode and the customer is linked to ${MEMBER}"
cr_unproved "the renewal itself: start a recurring donation as ${MEMBER}, then advance ${CLOCK} in the Dashboard"
echo ""
echo "Next: sign in as ${MEMBER} and start a recurring donation; it is created on"
echo "customer ${CUSTOMER}. Then advance test clock ${CLOCK} in the Stripe Dashboard,"
echo "under Billing, Test clocks, to produce the renewal."
cr_finish
