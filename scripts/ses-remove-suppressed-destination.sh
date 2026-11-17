#!/usr/bin/env bash
# ses-remove-suppressed-destination.sh -- take one work-queue topic address off
# an environment's SES account-level suppression list, so the platform can turn
# that queue address back on.
#
# SES puts an address on the account's suppression list when mail to it
# bounces or draws a complaint, and from then on drops every message to it from
# any sender in the account. The platform switches a queue address off when it
# bounces. Once the mailbox behind it is fixed, the address is still suppressed
# at SES until someone removes it, and turning it back on in the platform alone
# would only queue mail SES drops. This script is that removal.
#
# What it does:
#   - Reads the address's entry on the target's suppression list. An address
#     SES says is not on the list is reported as nothing to do.
#   - Otherwise states what will change (the address, the environment, and the
#     reason and time SES recorded), and after the typed confirmation deletes
#     the entry. Then reads it again and requires SES to answer that the
#     address is not on the list: that read, not the delete call, is the proof.
#
# What it refuses:
#   - a target it was not given; there is no default.
#   - any address other than a work-queue topic address,
#     queue-<finance|membership|platform|sanctioning|freestyle|moderation>@footbag.org
#     (letter case ignored). Any other address SES suppressed stays suppressed:
#     SES stopped it for cause, and this script is not the place to lift that.
#   - to change anything without the typed confirmation, read from the
#     terminal. --yes stands in for it on staging only: production asks every
#     time, and a run with no terminal is refused there.
#   - to go on after a read that failed for any reason other than SES saying
#     the address is not on the list.
#
# Usage:
#   bash scripts/ses-remove-suppressed-destination.sh \
#     --target <staging|production> --address <queue address>
#   bash scripts/ses-remove-suppressed-destination.sh \
#     --target staging --address <queue address> --yes
#
# Exits 0 when the address is not on the list (removed by this run, or never
# there), 1 when it is still on it or could not be read or removed, and 2 on a
# usage error.
#
# Test seam (CI only; operators never set this): SES_SUPPRESSION_AWS_BIN
# replaces the AWS CLI. A run using it says so on stderr, because a stubbed run
# proves nothing about the account.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The terminal confirmation and the target guard. Sourcing it also assigns
# ASSUME_YES, so no value exported in the operator's shell can answer the
# confirmation.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

TARGET=""
ADDRESS=""
QUEUE_ADDRESS_RE='^queue-(finance|membership|platform|sanctioning|freestyle|moderation)@footbag\.org$'

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --address) ADDRESS="${2:-}"; shift 2 || { echo "ERROR: --address requires an argument" >&2; exit 2; } ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2
if [[ "$ASSUME_YES" == "yes" && "$TARGET" == "production" ]]; then
  echo "ERROR: --yes does not carry a production change; it asks at the terminal every time." >&2
  exit 2
fi
if [[ -z "$ADDRESS" ]]; then
  echo "ERROR: --address is required: the work-queue topic address to take off the list." >&2
  exit 2
fi
ADDRESS="${ADDRESS,,}"
if [[ ! "$ADDRESS" =~ $QUEUE_ADDRESS_RE ]]; then
  echo "ERROR: '${ADDRESS}' is not a work-queue topic address." >&2
  echo "       Only queue-<finance|membership|platform|sanctioning|freestyle|moderation>@footbag.org" >&2
  echo "       is taken off the suppression list here; any other address stays suppressed." >&2
  exit 2
fi

# One closing report from here on. Sourced after the usage checks, so a usage
# error keeps its plain exit 2.
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

AWS_BIN="${SES_SUPPRESSION_AWS_BIN:-aws}"
if [[ -n "${SES_SUPPRESSION_AWS_BIN:-}" ]]; then
  echo "NOTE: using a stand-in for the AWS CLI (SES_SUPPRESSION_AWS_BIN); this run proves nothing about the account." >&2
else
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  aws_profile_ensure || cr_die "the AWS identity for this run could not be settled; nothing was read or changed"
fi

LIST="${TARGET} SES suppression list"

# The address goes to the AWS CLI as --email-address, the only way either call
# takes it short of an input document, so it is in the CLI's argv. That is
# acceptable here because the pattern above admits only the platform's
# published role addresses, which are not secrets. It is printed only where the
# statement of the change and the closing report must name it.

# read_entry: sets ENTRY_STATE to "listed" (with ENTRY_REASON and ENTRY_SINCE)
# or "absent", or returns 1 with ENTRY_ERROR holding the tool's own last line.
# Only SES's not-found reads as "not on the list"; any other failure is an
# error, because an unread entry is not an absent one.
read_entry() {
  local out err rc=0
  ENTRY_STATE=""; ENTRY_REASON=""; ENTRY_SINCE=""; ENTRY_ERROR=""
  err="$(mktemp "$(_cr_tmp)/ses-read-err.XXXXXX")"
  out="$("$AWS_BIN" sesv2 get-suppressed-destination --email-address "$ADDRESS" \
    --query 'SuppressedDestination.[Reason,LastUpdateTime]' --output text </dev/null 2>"$err")" || rc=$?
  if (( rc != 0 )); then
    if grep -q 'NotFoundException' "$err"; then
      ENTRY_STATE="absent"
      return 0
    fi
    ENTRY_ERROR="$(grep -v '^[[:space:]]*$' "$err" | tail -n 1 || [[ $? == 1 ]])"
    [[ -n "$ENTRY_ERROR" ]] || ENTRY_ERROR="the AWS CLI exited ${rc} and printed nothing"
    return 1
  fi
  ENTRY_STATE="listed"
  read -r ENTRY_REASON ENTRY_SINCE <<< "$out"
  [[ -z "$ENTRY_REASON" || "$ENTRY_REASON" == "None" ]] && ENTRY_REASON="not returned"
  [[ -z "$ENTRY_SINCE" || "$ENTRY_SINCE" == "None" ]] && ENTRY_SINCE="an unread time"
  return 0
}

echo "== ${LIST}: ${ADDRESS} =="
read_entry || cr_die "${ADDRESS} on the ${LIST} could not be read: ${ENTRY_ERROR}. Nothing was changed."
if [[ "$ENTRY_STATE" == "absent" ]]; then
  echo "${ADDRESS} is not on the ${LIST}; nothing to do."
  cr_proved "${ADDRESS} is not on the ${LIST}; nothing to do"
  cr_finish
fi

echo ""
echo "About to change the ${LIST}:"
echo "  address:          ${ADDRESS}"
echo "  SES recorded:     ${ENTRY_REASON}, since ${ENTRY_SINCE}"
echo "  change:           remove it from the list, so SES delivers to it again"
echo ""
if ! confirm_from_tty "Type 'APPLY' to remove ${ADDRESS} from the ${LIST}: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  cr_unproved "the removal of ${ADDRESS}: not confirmed, and nothing was changed"
  cr_finish_with 1 ABORTED
fi

# AWS's own last line from a failed delete, for the error that reports it.
CHANGE_ERR="$(mktemp "$(_cr_tmp)/ses-change-err.XXXXXX")"
aws_said() { grep -v '^[[:space:]]*$' "$CHANGE_ERR" | tail -n 1 || [[ $? == 1 ]]; }
if ! "$AWS_BIN" sesv2 delete-suppressed-destination --email-address "$ADDRESS" \
    </dev/null >/dev/null 2>"$CHANGE_ERR"; then
  cr_die "${ADDRESS} could not be removed; it is still on the ${LIST}. AWS answered: $(aws_said)"
fi
echo "  delete accepted; reading the list again to prove it"

# The proof: SES itself answers that the address is not on the list.
if ! read_entry; then
  cr_die "the delete was accepted, but ${ADDRESS} on the ${LIST} could not be read back: ${ENTRY_ERROR}"
fi
if [[ "$ENTRY_STATE" != "absent" ]]; then
  cr_die "${ADDRESS} is still on the ${LIST} after the delete was accepted (SES reads ${ENTRY_REASON})"
fi
echo "  ${ADDRESS} is no longer on the ${LIST}"
cr_proved "${ADDRESS} removed from the ${LIST}; the read-back finds it not on the list"
cr_finish
