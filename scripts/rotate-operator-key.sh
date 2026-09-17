#!/usr/bin/env bash
# rotate-operator-key.sh
#
# Rotates the human operator's AWS access key: the credential an operator's own
# workstation authenticates with, and the one every chained runtime profile
# resolves from.
#
# WHY THIS EXISTS.
#
# The rule for this key was written down in three places and the procedure in
# none. One document sent the reader to the workload runbook, which opens by
# scoping itself to a different user and whose steps edit files on a host that
# this credential never touches. So an operator needing to replace it either
# followed steps that did not apply or concluded no procedure existed, and in
# practice it was done by hand, at the moment it was least welcome: a live key
# had just been pasted somewhere it should not have been.
#
# A rotation done by hand also stops halfway. Minting the replacement is the
# part with visible progress; retiring the predecessor is the part with none,
# and it is the part that makes it a rotation rather than an extra key.
#
# WHAT IT REFUSES TO DO.
#
#   - Delete and recreate the user. AWS resolves a role's trust policy to the
#     user's internal unique id at save time, not to the ARN text, so a user
#     recreated under the same name produces a trust that reads correctly,
#     shows no terraform diff, and silently refuses every AssumeRole. Both
#     runtime roles name this user, so that breaks every environment at once.
#     There is no flag for it here; the only rotation this script performs is a
#     second key under the existing user.
#   - Retire a key before the replacement has been proved. The verification
#     covers both environments, because proving only staging leaves untested
#     the chain that matters at cutover.
#   - Delete a key that is still active. Deactivating is reversible and shows
#     whether anything still depends on it; deleting is not, and an access key
#     id is never reissued.
#   - Mint a credential with no terminal to show it on, or leave one minted but
#     unrecorded. Both are the shared library's refusals rather than this
#     script's.
#
# Usage. Three steps, deliberately separate runs, because the operator has work
# to do between them and a window to observe in:
#
#   bash scripts/rotate-operator-key.sh --profile <profile> --issue
#     Mints the second key, shows it once, and requires it to be vaulted.
#     Afterwards, install it into ~/.aws/credentials yourself.
#
#   bash scripts/rotate-operator-key.sh --profile <profile> --retire <old-key-id>
#     Proves the new key resolves this identity and both runtime roles, then
#     deactivates the old key.
#
#   bash scripts/rotate-operator-key.sh --profile <profile> --delete <old-key-id>
#     Removes it, once it has stayed quiet.
#
# Flags:
#   --profile <name>   AWS CLI profile to act through. Required, no default:
#                      which credentials a rotation runs on is the operator's
#                      decision and not one this script may make quietly.
#   --user <name>      The IAM user. Defaults to the single human operator
#                      identity, because there is exactly one and naming it
#                      here is what makes a typo impossible.
#   --issue            Mint the replacement.
#   --retire <key-id>  Verify, then deactivate the named predecessor.
#   --delete <key-id>  Delete a predecessor that is already inactive.
#   --yes              Accept the typed confirmation in advance, for a run with
#                      no terminal attached.
#
# Test seams (CI only; operators never set these):
#   ROTATE_KEY_AWS_BIN          replaces the aws CLI
#   ROTATE_KEY_RUNTIME_PROFILES space-separated chained profiles to verify
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

# shellcheck source=lib/iam-access-key.sh
source "${SCRIPT_DIR}/lib/iam-access-key.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-identity.sh
source "${SCRIPT_DIR}/lib/aws-identity.sh"

AWS_BIN="${ROTATE_KEY_AWS_BIN:-aws}"
IAM_KEY_AWS_BIN="$AWS_BIN"
AWS_IDENTITY_BIN="$AWS_BIN"
RUNTIME_PROFILES="${ROTATE_KEY_RUNTIME_PROFILES:-footbag-staging-runtime footbag-production-runtime}"

PROFILE=""
USER_NAME="footbag-operator"
ACTION=""
OLD_KEY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --user)
      USER_NAME="${2:-}"
      shift 2 || { echo "ERROR: --user requires an argument" >&2; exit 2; }
      ;;
    --issue) ACTION="issue"; shift ;;
    --retire)
      ACTION="retire"
      OLD_KEY="${2:-}"
      shift 2 || { echo "ERROR: --retire requires the key id to retire" >&2; exit 2; }
      ;;
    --delete)
      ACTION="delete"
      OLD_KEY="${2:-}"
      shift 2 || { echo "ERROR: --delete requires the key id to delete" >&2; exit 2; }
      ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

if [[ -z "$PROFILE" ]]; then
  echo "ERROR: --profile is required, and there is no default. Which credentials" >&2
  echo "       a rotation runs on decides which account it reaches, and that is" >&2
  echo "       not a choice this script may make on your behalf." >&2
  exit 2
fi
if [[ -z "$USER_NAME" ]]; then
  echo "ERROR: --user was given with no value." >&2
  exit 2
fi
if [[ -z "$ACTION" ]]; then
  echo "ERROR: one of --issue, --retire <key-id> or --delete <key-id> is required." >&2
  echo "       They are separate runs on purpose: there is work to do between" >&2
  echo "       minting a key and retiring the one it replaces." >&2
  exit 2
fi
if [[ "$ACTION" != "issue" && -z "$OLD_KEY" ]]; then
  echo "ERROR: --${ACTION} needs the id of the key to ${ACTION}." >&2
  exit 2
fi

IAM_KEY_AWS_ARGS=(--profile "$PROFILE")

# What the retirement is allowed to rely on lives in scripts/lib/aws-identity.sh,
# because the install side needs exactly the same two assertions and a second
# copy is a second thing to keep true. The hint that belongs to THIS script --
# that a failure here usually means a freshly installed key went under the wrong
# profile name -- stays with the caller, below.

# ── Actions ──────────────────────────────────────────────────────────────────
if [[ "$AWS_BIN" != "aws" ]]; then
  echo "SYNTHETIC: aws='${AWS_BIN}' -- no real credential is involved." >&2
fi

case "$ACTION" in
  issue)
    IAM_KEY_VAULT_NOTES="Long-lived IAM access key for the human operator identity, used from an
operator workstation for AWS CLI and terraform work. It is also the
source identity every chained runtime profile assumes from, so both
runtime roles name this user in their trust policies.
Sensitivity: account-wide.
NEVER delete and recreate this user to rotate it: AWS resolves the
trust policies to its internal unique id, so a recreated user of the
same name refuses every AssumeRole with no terraform diff to show it.
Rotation: scripts/rotate-operator-key.sh, --issue then --retire then
--delete, which is the order that keeps a working credential at all
times."
    trap iam_key_cleanup EXIT INT TERM
    iam_key_provision "$USER_NAME" "aws-footbag-operator-keys" 1 || exit 1
    iam_key_commit
    echo ""
    echo "Next, on this workstation:"
    echo "  1. Put the new key into ~/.aws/credentials under [${USER_NAME}]."
    echo "  2. Tell the other custodians a new vault version is up."
    echo "  3. Re-run with --retire <old-key-id> once the new key is in place."
    echo ""
    echo "The old key is still active and still working. Nothing is broken by"
    echo "stopping here, which is why this is a separate run."
    ;;

  retire)
    echo "==> Proving the key now in use before retiring ${OLD_KEY}"
    if ! aws_identity_require_user "$PROFILE" "$USER_NAME"; then
      echo "       If the replacement key has just been installed, check it was" >&2
      echo "       written under the right profile name. Nothing retired." >&2
      exit 1
    fi
    # shellcheck disable=SC2086
    if ! aws_identity_require_chain $RUNTIME_PROFILES; then
      echo "       The replacement key does not carry every chained profile," >&2
      echo "       so nothing has been retired." >&2
      exit 1
    fi
    echo ""
    echo "Deactivating ${OLD_KEY} on ${USER_NAME}. Reversible: a deactivated key"
    echo "can be switched back on if something turns out to have depended on it."
    if ! confirm_from_tty "Type 'APPLY' to deactivate it: " "APPLY"; then
      echo "Not confirmed; the key is untouched." >&2
      exit 1
    fi
    iam_key_retire "$USER_NAME" "$OLD_KEY" deactivate || exit 1
    echo ""
    echo "Observe before deleting. Anything still holding the old key now fails"
    echo "visibly rather than silently, which is the point of the window."
    ;;

  delete)
    echo "==> Deleting ${OLD_KEY} on ${USER_NAME}"
    echo "Not reversible, and the key id is never reissued. The library refuses"
    echo "this unless the key is already inactive."
    if ! confirm_from_tty "Type 'APPLY' to delete it: " "APPLY"; then
      echo "Not confirmed; the key is untouched." >&2
      exit 1
    fi
    iam_key_retire "$USER_NAME" "$OLD_KEY" delete || exit 1
    echo ""
    echo "Record the rotation date and reviewer on the vault entry, and update"
    echo "the line recording when the current key was issued: the evidence-driven"
    echo "rotation rule reads that date."
    ;;
esac
