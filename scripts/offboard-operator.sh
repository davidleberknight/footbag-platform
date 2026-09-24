#!/usr/bin/env bash
# offboard-operator.sh
#
# Ends a named operator's access in one command: their Linux account on the
# deployed host, and their AWS identity, each proved ended by the half that
# ends it.
#
# WHY THIS EXISTS.
#
# Hiring became one command because a person half-hired is obvious within a day.
# Firing is the direction where a half-finished job is invisible: an operator
# whose AWS identity is retired and whose shell account is not still has a login
# and a sudo password, and nothing anywhere says so. A step printed for somebody
# to run later, on the day somebody leaves, is the step that gets skipped.
#
# NOTHING HERE NEEDS THE DEPARTING PERSON.
#
# Both halves are pure authority: the host account is disabled over SSH with the
# sudo password of the account this workstation's alias connects as, and the
# AWS identity is retired by the
# `footbag-operator` IAM user. No secret travels in either direction and the
# person being retired is not asked for anything, because a departure you need
# their cooperation to finish is not a departure.
#
# WHAT EACH HALF PROVES.
#
# The host half re-reads the account after disabling it and refuses to report
# success unless the password is locked, the login shell is nologin, the account
# is expired, it is out of the sudo group, and no account on the host still
# authorizes any key of theirs. The AWS half proves the grant and every key are
# gone and that a fresh role session is refused. A login attempted from this
# workstation would prove nothing more: it would be made with this machine's
# key, which was never theirs, and be refused whatever state their account was
# in.
#
# THE ORDER, AND WHY IT IS NOT A PREFERENCE.
#
# The host account goes first. It is the access that reaches a shell, and it is
# the one a departing person is most likely to still be holding open; the AWS
# identity is retired by an authority they cannot interfere with whenever it
# runs. Within the AWS half the order is also fixed, and that child owns it: the
# grant before the keys, because a key outliving the policy reaches nothing
# while a policy outliving the keys is a live grant waiting for a credential.
#
# FIRING YOUR OWN NAMED IDENTITY, AND THIS WORKSTATION.
#
# A footbag-operator holder may fire their own named identity. A departure is not
# finished while the departing identity's traces are still on a machine, so the
# run ends by removing them from this one: the named account's key pair and its
# Match block, its filed sudo password, its AWS credentials section, and the
# job-role profiles that chain from that key. It removes only what belongs to
# the account being fired, decided by what this machine holds for it, so firing
# somebody else from here finds nothing of theirs and says so.
#
# The default is untouched, as it is by hiring: footbag-operator on AWS and the
# shared `footbag` account on the host. The alias's own stanza is never edited,
# and a run that finds it connecting as anything but `footbag` refuses before
# it starts. The host half refuses to retire a named account whose key
# `footbag` also holds, so the shared account keeps its key.
#
# WHAT IT REFUSES TO DO.
#
#   - Run as anything but the directly authenticated `footbag-operator`.
#   - Retire `footbag-operator` or the shared `footbag` account. Retiring a
#     holder's footbag-operator access belongs with the future FootbagSuperAdmin
#     role.
#   - Delete the IAM user, or the host account. Both are left inert, because the
#     trail goes on naming them and a deleted identity makes those entries
#     unreadable. That is the children's behaviour and is not overridden here.
#   - Remove from this workstation anything that is not the fired account's: a
#     profile is removed only when it chains from that account, and the filed
#     sudo password only when this machine held that account's key.
#
# Steps, referenced by --from-step so a run that stopped part way is resumable:
#   1  the Linux account on the host
#   2  the AWS identity
# Whatever the step, this workstation is cleaned last, and that detects what is
# already done.
#
# Usage:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/offboard-operator.sh \
#       --target staging --account <their_account>
#
# The redirect carries the shared `footbag` account's sudo password, which the
# host is always reached as (~/AWS/AWS_OPERATOR_PRODUCTION.txt on production).
# Step 1 consumes it.
#
# Flags:
#   --target <staging|production>  deployed environment; no default
#   --account <name>               the operator being retired
#   --from-step <1-2>              resume a run that stopped part way
#   --yes                          accept this command's own confirmations and
#                                  the AWS step's in advance;
#                                  the host step always asks at the
#                                  terminal, so a person runs this, never a job
#   -h, --help                     this text
#
# Exit: 0 retired and proven, 1 refused or a step failed, 2 usage error.
#
# Test seams (CI only; operators never set these):
#   OFFBOARD_HOST_CMD     replaces the host-account child
#   OFFBOARD_AWS_CMD      replaces the AWS-identity child
#   OFFBOARD_AWS_BIN      replaces the aws CLI used for the caller check and the
#                         IAM user read
#   OFFBOARD_SSH_CONFIG   the SSH config file to read and change
#   OFFBOARD_SSH_ADD      replaces ssh-add
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
# The SSH config, and the AWS config and credentials files, are changed only
# through these, which keep every other line.
# shellcheck source=lib/ssh-alias.sh
source "${REPO_ROOT}/scripts/lib/ssh-alias.sh"
# shellcheck source=lib/aws-credentials-file.sh
source "${REPO_ROOT}/scripts/lib/aws-credentials-file.sh"

HOST_CMD="${OFFBOARD_HOST_CMD:-${SCRIPT_DIR}/provision-operator-account.sh}"
AWS_CMD="${OFFBOARD_AWS_CMD:-${SCRIPT_DIR}/manage-human-operator.sh}"
AWS_BIN="${OFFBOARD_AWS_BIN:-aws}"
AWS_IDENTITY_BIN="$AWS_BIN"
SSH_CONFIG="${OFFBOARD_SSH_CONFIG:-${HOME}/.ssh/config}"
SSH_ADD_BIN="${OFFBOARD_SSH_ADD:-ssh-add}"
AWS_CONFIG_PATH="${AWS_CONFIG_FILE:-${HOME}/.aws/config}"
AWS_CRED_PATH="${AWS_SHARED_CREDENTIALS_FILE:-${HOME}/.aws/credentials}"
# The chained profile the onboarding writes, spelled as the AWS half spells it.
STAGING_RUNTIME_PROFILE="footbag-staging-runtime"

FOOTBAG_OPERATOR_USER="footbag-operator"

TARGET=""
ACCOUNT=""
FROM_STEP=1

while (( $# )); do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || usage 2 ;;
    --account) ACCOUNT="${2:-}"; shift 2 || usage 2 ;;
    --from-step) FROM_STEP="${2:-}"; shift 2 || usage 2 ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

if [[ -z "$ACCOUNT" ]]; then
  echo "ERROR: --account names the operator being retired." >&2
  exit 2
fi
if [[ "$ACCOUNT" == "$OPERATOR_SHARED_ACCOUNT" ]]; then
  echo "ERROR: '${OPERATOR_SHARED_ACCOUNT}' is the shared account, not a person." >&2
  echo "       It is the host's way back in and the bootstrap path onto a host" >&2
  echo "       with nobody on it yet, and retiring it would remove both." >&2
  exit 2
fi
if [[ ! "$FROM_STEP" =~ ^[1-2]$ ]]; then
  echo "ERROR: --from-step takes 1 or 2." >&2
  exit 2
fi

aws_profile_use "$FOOTBAG_OPERATOR_PROFILE" \
  "Retiring a human operator is refused to every role, including the job role, by the role's own policy." \
  || exit 1
aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" || exit 1

ALIAS="footbag-${TARGET}"

# ── Whose workstation this is ────────────────────────────────────────────────

# The default, read with the job role's profile out of the way. It must be the
# shared account: that is what every run relies on, and the host is reached
# through it here.
ALIAS_USER=""
if command -v ssh >/dev/null 2>&1; then
  ALIAS_USER="$(env -u AWS_PROFILE ssh -G "$ALIAS" </dev/null 2>/dev/null | awk '/^user /{print $2}' | tail -1)"
fi
if [[ "$ALIAS_USER" != "$OPERATOR_SHARED_ACCOUNT" ]]; then
  echo "ERROR: '${ALIAS}' connects as '${ALIAS_USER:-nothing}', not the shared account" >&2
  echo "       '${OPERATOR_SHARED_ACCOUNT}'. That is the default every run relies on. Change its" >&2
  echo "       User line back to ${OPERATOR_SHARED_ACCOUNT} and re-run. Nothing was changed." >&2
  exit 1
fi

# What this machine holds for the account being fired: its key pair, its AWS
# credentials, or its Match block. Any one is enough to clean up after.
NAMED_KEY="${HOME}/.ssh/id_ed25519_${ACCOUNT}"
NAMED_KEY_TILDE="~/.ssh/id_ed25519_${ACCOUNT}"
HELD_HERE=0
if [[ -e "$NAMED_KEY" || -e "${NAMED_KEY}.pub" ]] \
   || aws_cred_has_section "$AWS_CRED_PATH" "$ACCOUNT" \
   || [[ "$(ssh_alias_match_account "$SSH_CONFIG" "$ALIAS" "$FOOTBAG_DEV_TESTER_PROFILE")" == "$ACCOUNT" ]]; then
  HELD_HERE=1
fi

echo ""
echo "Retiring '${ACCOUNT}' on ${TARGET}:"
echo "  1. their Linux account on the host: disabled, out of the sudo group, and"
echo "     their key swept off every account on it"
echo "  2. their AWS identity: the grant, then every key"
if (( HELD_HERE )); then
  echo "  3. this workstation: ${ACCOUNT}'s key pair and its Match block, its filed"
  echo "     sudo password, its AWS credentials and the profiles that chain from it"
fi
echo ""
echo "footbag-operator and the shared ${OPERATOR_SHARED_ACCOUNT} account are untouched."
echo ""
echo "Nothing is asked of ${ACCOUNT} and nothing is deleted: their host account"
echo "and IAM user are both left inert, because the trail goes on naming them."
echo ""
if ! confirm_from_tty "Type 'APPLY' to retire ${ACCOUNT}: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  exit 1
fi

CONFIG_TMP=""
trap 'rm -f -- "${CONFIG_TMP:-}"' EXIT INT TERM

# ── Step 1: the host account ─────────────────────────────────────────────────

if (( FROM_STEP <= 1 )); then
  echo ""
  echo "== Step 1: the Linux account on ${TARGET}"
  # Standard input reaches this child untouched: it carries the sudo password
  # of the account this workstation's alias connects as, and this script has
  # read none of it.
  if ! bash "$HOST_CMD" --target "$TARGET" --account "$ACCOUNT" --offboard; then
    echo "" >&2
    echo "ERROR: the host account was not retired, so the AWS identity has not" >&2
    echo "       been touched either. Ending one half and reporting the other" >&2
    echo "       as done is the failure this command exists to prevent." >&2
    echo "         bash scripts/offboard-operator.sh ... --from-step 1" >&2
    exit 1
  fi
fi

# ── Step 2: the AWS identity ─────────────────────────────────────────────────

if (( FROM_STEP <= 2 )); then
  echo ""
  echo "== Step 2: the AWS identity"

  # A person can hold a host account and no AWS identity: a dev-and-tester's
  # AWS half is delivered after their host account, so somebody leaving in
  # between has none. That is a proven absence only when IAM says so by name;
  # any other failure to read is a failure, never "nothing to retire".
  USER_READ=""
  if USER_READ="$("$AWS_BIN" iam get-user --user-name "$ACCOUNT" \
      --query 'User.Path' --output text 2>&1)"; then
    AWS_ARGS=(--offboard "$ACCOUNT")
    [[ "$ASSUME_YES" == "yes" ]] && AWS_ARGS+=(--yes)
    if ! bash "$AWS_CMD" "${AWS_ARGS[@]}" --driven-by-offboard </dev/null; then
      echo "" >&2
      echo "ERROR: the AWS identity was not retired. The host account from step 1" >&2
      echo "       IS retired, so this person currently holds an AWS identity and" >&2
      echo "       no shell. Finish it:" >&2
      echo "         bash scripts/offboard-operator.sh ... --from-step 2" >&2
      exit 1
    fi
  elif [[ "$USER_READ" == *NoSuchEntity* ]]; then
    echo "    IAM has no user named ${ACCOUNT}, so there is no AWS identity to retire."
  else
    echo "ERROR: could not read whether ${ACCOUNT} has an IAM user:" >&2
    printf '%s\n' "$USER_READ" | sed 's/^/         /' >&2
    echo "       The host account from step 1 IS retired. Resume once IAM can be read:" >&2
    echo "         bash scripts/offboard-operator.sh ... --from-step 2" >&2
    exit 1
  fi
fi

# ── Step 3: this workstation ─────────────────────────────────────────────────

# Last, because the AWS half proves its refusal through the job-role profile
# that chains from the retired key, so that profile has to outlive it. Each
# removal is of something that belongs to the account being fired and nothing
# else, and each says "none here" when it finds nothing, which is also what a
# re-run says.
echo ""
echo "== Step 3: ${ACCOUNT} on this workstation"
if (( ! HELD_HERE )); then
  echo "  nothing of ${ACCOUNT}'s is on this machine: no key pair, no credentials section"
  echo "  and no Match block"
else
  # The filed sudo password first, while the key that shows this machine held
  # the account is still here to say so.
  operator_credential_file_for "$ACCOUNT" "$TARGET" || exit 1
  if [[ -e "$OPERATOR_CREDENTIAL_FILE" ]]; then
    secret_file_destroy "$OPERATOR_CREDENTIAL_FILE"
    echo "  ${OPERATOR_CREDENTIAL_DISPLAY}: shredded"
  else
    echo "  ${OPERATOR_CREDENTIAL_DISPLAY}: none here"
  fi

  # The profiles that chain from the retired key: the job-role profile only
  # where it sources from this account, and the staging runtime profile only
  # where it sources from that job-role profile. A holder's own chains source
  # from footbag-operator and are left exactly as they are.
  DEV_TESTER_SOURCE="$(aws_config_profile_source "$AWS_CONFIG_PATH" "$FOOTBAG_DEV_TESTER_PROFILE")"
  if [[ "$DEV_TESTER_SOURCE" == "$ACCOUNT" ]]; then
    RUNTIME_SOURCE="$(aws_config_profile_source "$AWS_CONFIG_PATH" "$STAGING_RUNTIME_PROFILE")"
    if [[ "$RUNTIME_SOURCE" == "$FOOTBAG_DEV_TESTER_PROFILE" ]]; then
      # The config file spells a named profile with a "profile " prefix, and the
      # section match ignores whitespace, hence the joined form.
      aws_cred_remove_section "$AWS_CONFIG_PATH" "profile${STAGING_RUNTIME_PROFILE}" || {
        echo "ERROR: could not remove [profile ${STAGING_RUNTIME_PROFILE}]: ${AWS_CRED_ERROR}" >&2; exit 1; }
      echo "  [profile ${STAGING_RUNTIME_PROFILE}], chaining from it: removed"
    fi
    aws_cred_remove_section "$AWS_CONFIG_PATH" "profile${FOOTBAG_DEV_TESTER_PROFILE}" || {
      echo "ERROR: could not remove [profile ${FOOTBAG_DEV_TESTER_PROFILE}]: ${AWS_CRED_ERROR}" >&2; exit 1; }
    echo "  [profile ${FOOTBAG_DEV_TESTER_PROFILE}], sourcing ${ACCOUNT}: removed"
  else
    echo "  no ${FOOTBAG_DEV_TESTER_PROFILE} profile here sourcing ${ACCOUNT}"
  fi

  CRED_RC=0
  aws_cred_remove_section "$AWS_CRED_PATH" "$ACCOUNT" || CRED_RC=$?
  if (( CRED_RC == 0 )); then
    echo "  [${ACCOUNT}] in the AWS credentials file: removed"
  elif (( CRED_RC == 2 )); then
    echo "  [${ACCOUNT}] in the AWS credentials file: none here"
  else
    echo "ERROR: could not remove [${ACCOUNT}]: ${AWS_CRED_ERROR}" >&2
    exit 1
  fi

  CONFIG_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-ssh-config.XXXXXX")"
  chmod 600 "$CONFIG_TMP"
  BLOCK_RC=0
  ssh_alias_remove_match_block "$SSH_CONFIG" "$ALIAS" "$ACCOUNT" "$FOOTBAG_DEV_TESTER_PROFILE" "$CONFIG_TMP" || BLOCK_RC=$?
  if (( BLOCK_RC == 0 )); then
    cat "$CONFIG_TMP" > "$SSH_CONFIG"
    echo "  ${ACCOUNT}'s Match block for ${ALIAS}: removed"
  elif (( BLOCK_RC == 2 )); then
    echo "  ${ACCOUNT}'s Match block for ${ALIAS}: none here"
  else
    echo "ERROR: could not read ${SSH_CONFIG}, or the result would not parse. It was not changed." >&2
    exit 1
  fi

  if [[ -e "$NAMED_KEY" || -e "${NAMED_KEY}.pub" ]]; then
    "$SSH_ADD_BIN" -d "$NAMED_KEY" >/dev/null 2>&1 || true
    secret_file_destroy "$NAMED_KEY" "${NAMED_KEY}.pub"
    echo "  ${NAMED_KEY_TILDE} key pair: shredded, and taken out of the agent"
  else
    echo "  ${NAMED_KEY_TILDE} key pair: none here"
  fi
fi

echo ""
echo "Done. ${ACCOUNT} holds no shell on ${TARGET} and their IAM user is inert"
echo "(no grant, no keys), and each"
echo "half proved its own refusal rather than reporting what it ran."
echo ""
echo "One thing nothing here can do: a role session issued before this runs stays"
echo "valid until it expires, up to four hours. Removing the grant stops new"
echo "sessions being minted; it does not reach credentials already in somebody's"
echo "possession."
echo ""
echo "Still owed:"
echo ""
echo "  1. Their host account on the other environment, if they held one there:"
echo "     this command again with the other --target, redirecting the credential"
echo "     file your alias selects for that environment."
echo ""
echo "  2. Their address on the SSH allow-list. One command per environment takes"
echo "     it off and reads the live firewall back:"
echo ""
echo "       bash scripts/authorize-operator-address.sh --target staging \\"
echo "         --address <their-cidr> --remove"
echo "       bash scripts/authorize-operator-address.sh --target production \\"
echo "         --address <their-cidr> --remove"
echo ""
echo "  3. Their repository and CI access, including any personal access token or"
echo "     deploy key, and any personal alerting subscription on an SNS topic or"
echo "     alarm action."
echo ""
echo "  4. Their vault entries, last, removed by hand by a footbag-operator holder or a"
echo "     board member once every access above is proved ended, with the vault"
echo "     published per its own procedure. The vault cannot be edited by script;"
echo "     the entry records the access, which has just ended."
exit 0
