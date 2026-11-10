#!/usr/bin/env bash
# kms-key-status.sh -- read the state of an environment's two encryption keys,
# and bring back one that was scheduled for deletion or disabled.
#
# Each environment holds two keys, each reached through its alias:
#   alias/footbag-<target>       the application key: every SecureString
#                                parameter (every secret the platform holds) and
#                                both alarm topics are encrypted under it
#   alias/footbag-<target>-jwt   the key that signs every session token
# A key scheduled for deletion is disabled at once, so the parameters it
# encrypts cannot be read, alarm notifications stop publishing, or no member can
# sign in. AWS keeps a scheduled key for its pending window (thirty days here),
# during which the deletion can be cancelled; after that it is gone for good.
# The audit alarm on DisableKey and ScheduleKeyDeletion is what says it
# happened; this script is the recovery.
#
# What it does:
#   - Reads both keys through their aliases and prints each one's state:
#     Enabled, Disabled, or PendingDeletion with the date the deletion lands.
#     Exits 0 only when both are Enabled.
#   - With --cancel-deletion, for each key that is PendingDeletion or Disabled:
#     after the typed confirmation, cancels the deletion (which leaves the key
#     Disabled) and enables it. A Disabled key that was never scheduled is
#     enabled the same way. Then proves the outcome: the key reads Enabled and
#     its alias still resolves to that same key.
#
# What it refuses:
#   - a target it was not given; there is no default.
#   - to change anything without the typed confirmation, read from the
#     terminal. --yes stands in for it on staging only: production asks every
#     time, and a run with no terminal is refused there.
#   - a key in any other state (PendingImport, Unavailable and the like), which
#     this cannot repair, and a key or alias it could not read, before anything
#     changes.
#
# A key the alias no longer points at is never touched. Rotating the signing
# key leaves its predecessor scheduled for deletion on purpose; that key is not
# either alias's, so it is neither read nor revived here.
#
# Usage:
#   bash scripts/kms-key-status.sh --target <staging|production>
#   bash scripts/kms-key-status.sh --target <staging|production> --cancel-deletion
#   bash scripts/kms-key-status.sh --target staging --cancel-deletion --yes
#
# Exits 0 when both keys are Enabled (after the recovery, with
# --cancel-deletion), 1 when a key is not or could not be read or recovered,
# and 2 on a usage error.
#
# Test seam (CI only; operators never set this): KMS_KEY_STATUS_AWS_BIN
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
CANCEL=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --cancel-deletion) CANCEL=1; shift ;;
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
if [[ "$ASSUME_YES" == "yes" && "$CANCEL" != 1 ]]; then
  echo "ERROR: --yes confirms --cancel-deletion; a status read asks nothing." >&2
  exit 2
fi

# One closing report from here on. Sourced after the usage checks, so a usage
# error keeps its plain exit 2.
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

AWS_BIN="${KMS_KEY_STATUS_AWS_BIN:-aws}"
if [[ -n "${KMS_KEY_STATUS_AWS_BIN:-}" ]]; then
  echo "NOTE: using a stand-in for the AWS CLI (KMS_KEY_STATUS_AWS_BIN); this run proves nothing about the account." >&2
else
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  aws_profile_ensure || cr_die "the AWS identity for this run could not be settled; nothing was read or changed"
fi

LABELS=("application key" "session signing key")
ALIASES=("alias/footbag-${TARGET}" "alias/footbag-${TARGET}-jwt")
KEY_IDS=()
STATES=()
DELETION_DATES=()

# read_key <alias-or-id>: sets KEY_READ_ID, KEY_READ_STATE, KEY_READ_DATE, or
# returns 1 with KEY_READ_ERROR naming why. Only the tool's not-found reads as
# "no such key"; any other failure is an error carrying the tool's message.
read_key() {
  local out err rc=0
  KEY_READ_ID=""; KEY_READ_STATE=""; KEY_READ_DATE=""; KEY_READ_ERROR=""
  err="$(mktemp "$(_cr_tmp)/kms-err.XXXXXX")"
  out="$("$AWS_BIN" kms describe-key --key-id "$1" \
    --query 'KeyMetadata.[KeyId,KeyState,DeletionDate]' --output text </dev/null 2>"$err")" || rc=$?
  if (( rc != 0 )); then
    if grep -q 'NotFoundException' "$err"; then
      KEY_READ_ERROR="no such key or alias"
    else
      KEY_READ_ERROR="could not be read: $(grep -v '^[[:space:]]*$' "$err" | tail -n 1)"
    fi
    return 1
  fi
  read -r KEY_READ_ID KEY_READ_STATE KEY_READ_DATE <<< "$out"
  if [[ -z "$KEY_READ_ID" || -z "$KEY_READ_STATE" ]]; then
    KEY_READ_ERROR="returned no key id and state"
    return 1
  fi
  [[ "$KEY_READ_DATE" == "None" ]] && KEY_READ_DATE=""
  return 0
}

describe_state() {
  case "$1" in
    PendingDeletion) echo "PendingDeletion, deletion scheduled for ${2:-an unread date}" ;;
    *) echo "$1" ;;
  esac
}

echo "== encryption keys: ${TARGET} =="
UNREAD=0
for i in "${!ALIASES[@]}"; do
  if read_key "${ALIASES[$i]}"; then
    KEY_IDS[i]="$KEY_READ_ID"
    STATES[i]="$KEY_READ_STATE"
    DELETION_DATES[i]="$KEY_READ_DATE"
    echo "  ${LABELS[$i]} (${ALIASES[$i]}): $(describe_state "$KEY_READ_STATE" "$KEY_READ_DATE")"
  else
    KEY_IDS[i]=""
    STATES[i]=""
    DELETION_DATES[i]=""
    UNREAD=1
    echo "  ${LABELS[$i]} (${ALIASES[$i]}): ${KEY_READ_ERROR}"
    cr_error "${LABELS[$i]} (${ALIASES[$i]}): ${KEY_READ_ERROR}"
  fi
done

if (( ! CANCEL )); then
  for i in "${!ALIASES[@]}"; do
    case "${STATES[$i]}" in
      Enabled) cr_proved "${LABELS[$i]} (${ALIASES[$i]}) is Enabled" ;;
      PendingDeletion|Disabled)
        cr_error "${LABELS[$i]} (${ALIASES[$i]}) is $(describe_state "${STATES[$i]}" "${DELETION_DATES[$i]}"); recover it with bash scripts/kms-key-status.sh --target ${TARGET} --cancel-deletion" ;;
      "") ;;
      *) cr_error "${LABELS[$i]} (${ALIASES[$i]}) is ${STATES[$i]}, which this script cannot repair" ;;
    esac
  done
  cr_finish
fi

# --cancel-deletion from here. Everything is read before anything changes, so a
# key that cannot be read or repaired stops the run with nothing changed.
(( UNREAD )) && cr_die "a key could not be read; nothing was changed"
TODO=()
for i in "${!ALIASES[@]}"; do
  case "${STATES[$i]}" in
    Enabled) cr_proved "${LABELS[$i]} (${ALIASES[$i]}) is Enabled; nothing to do" ;;
    PendingDeletion|Disabled) TODO+=("$i") ;;
    *) cr_die "${LABELS[$i]} (${ALIASES[$i]}) is ${STATES[$i]}, which this script cannot repair; nothing was changed" ;;
  esac
done
if (( ${#TODO[@]} == 0 )); then
  echo ""
  echo "Both keys are Enabled; no deletion to cancel and nothing to enable."
  cr_finish
fi

echo ""
echo "About to recover ${#TODO[@]} ${TARGET} key(s):"
for i in "${TODO[@]}"; do
  if [[ "${STATES[$i]}" == PendingDeletion ]]; then
    echo "  ${LABELS[$i]} (${ALIASES[$i]}): cancel its scheduled deletion, then enable it"
  else
    echo "  ${LABELS[$i]} (${ALIASES[$i]}): enable it"
  fi
done
echo ""
if ! confirm_from_tty "Type 'APPLY' to recover the keys: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  cr_unproved "the key recovery: not confirmed, and nothing was changed"
  cr_finish_with 1 ABORTED
fi

# AWS's own last line from a failed change, for the error that reports it.
CHANGE_ERR="$(mktemp "$(_cr_tmp)/kms-change-err.XXXXXX")"
aws_said() { grep -v '^[[:space:]]*$' "$CHANGE_ERR" | tail -n 1 || [[ $? == 1 ]]; }
for i in "${TODO[@]}"; do
  key="${KEY_IDS[$i]}"
  name="${LABELS[$i]} (${ALIASES[$i]})"
  if [[ "${STATES[$i]}" == PendingDeletion ]]; then
    "$AWS_BIN" kms cancel-key-deletion --key-id "$key" </dev/null >/dev/null 2>"$CHANGE_ERR" \
      || { cr_error "${name}: the deletion could not be cancelled; it is still scheduled. AWS answered: $(aws_said)"; continue; }
    echo "  ${name}: deletion cancelled"
  fi
  # Cancelling leaves the key Disabled, so enabling is the second half of the
  # same recovery, and the whole of it for a key that was only disabled.
  "$AWS_BIN" kms enable-key --key-id "$key" </dev/null >/dev/null 2>"$CHANGE_ERR" \
    || { cr_error "${name}: could not be enabled; it stays Disabled. AWS answered: $(aws_said). Re-run this command."; continue; }
  # The proof: the key itself reads Enabled, and the alias the platform reaches
  # it by resolves to this same key.
  if ! read_key "$key"; then
    cr_error "${name}: after enabling, the key ${KEY_READ_ERROR}"
    continue
  fi
  if [[ "$KEY_READ_STATE" != Enabled ]]; then
    cr_error "${name}: after enabling, the key reads ${KEY_READ_STATE}, not Enabled"
    continue
  fi
  if ! read_key "${ALIASES[$i]}"; then
    cr_error "${name}: the key is Enabled, but the alias ${KEY_READ_ERROR}"
    continue
  fi
  if [[ "$KEY_READ_ID" != "$key" || "$KEY_READ_STATE" != Enabled ]]; then
    cr_error "${name}: the key is Enabled, but the alias now resolves to a different key or one not Enabled"
    continue
  fi
  echo "  ${name}: Enabled, and the alias resolves to it"
  cr_proved "${name} is Enabled and its alias resolves to it"
done
cr_finish
