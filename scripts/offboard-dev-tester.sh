#!/usr/bin/env bash
# offboard-dev-tester.sh
#
# Offboards one dev-and-tester in one command: their Linux account on the
# deployed host, their AWS identity and the job-role sessions they already hold,
# and their address on that environment's SSH allow-list, each proved ended by
# the step that ends it.
#
# WHAT IT LEAVES THEM, DELIBERATELY.
#
# Offboarding ends their reach into the deployed environment and nothing more.
# Repository access on GitHub is granted and withdrawn separately, and nothing
# here reads or changes it. Their own machine is not cleaned: every credential
# this command retires is dead once it finishes.
#
# WHY THIS EXISTS.
#
# Onboarding is one command because a person half-onboarded is obvious within a
# day. Offboarding is the direction where a half-finished job is invisible: a
# person whose AWS identity is retired and whose shell account is not still has
# a login and a sudo password, and nothing anywhere says so. A step printed for
# somebody to run later, on the day somebody leaves, is the step that gets
# skipped.
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
# is expired, it is out of the sudo group, no account on the host still
# authorizes any key of theirs, and no onboarding they never accepted is left
# in their home. The AWS half proves the grant and every key are
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
# THIS WORKSTATION.
#
# A holder who onboarded themselves accepted the onboarding on this machine, so
# offboarding them is not finished while that identity's traces are still here.
# The run ends by removing them: the named account's key pair and its Match
# block, its filed sudo password, its AWS credentials section, and the job-role
# profiles that chain from that key. It removes only what belongs to the account
# being offboarded, decided by what this machine holds for it, so offboarding
# somebody else from here finds nothing of theirs and says so.
#
# The default is untouched, as it is by onboarding: footbag-operator on AWS and
# the shared `footbag` account on the host. The alias's own stanza is never
# edited, and a run that finds it connecting as anything but `footbag` refuses
# before it starts. The host half refuses to retire a named account whose key
# `footbag` also holds, so the shared account keeps its key.
#
# WHAT IT REFUSES TO DO.
#
#   - Run as anything but the directly authenticated `footbag-operator`.
#   - Retire `footbag-operator`, the shared `footbag` account, or any name that
#     is not a named account's shape. Administrative access is not a named
#     identity and is never retired by this command.
#   - Delete the IAM user, or the host account. Both are left inert, because the
#     trail goes on naming them and a deleted identity makes those entries
#     unreadable. That is the children's behaviour and is not overridden here.
#   - Remove from this workstation anything that is not the offboarded
#     account's: a profile is removed only when it chains from that account, and
#     the filed sudo password only when this machine's named account is theirs.
#
# Steps, referenced by --from-step so a run that stopped part way is resumable:
#   1  the Linux account on the host
#   2  the AWS identity, and the job-role sessions already issued to it
#   3  their address on this environment's SSH allow-list: their own address
#      parameter, removed through the allow-list step's dev-and-tester path,
#      which never opens the values file holding the administrators' entries.
#      When this machine connects from that very address, it warns first and
#      asks, since removing it can end this machine's own SSH to staging
# Whatever the step, this workstation is cleaned last, and that detects what is
# already done.
#
# Usage:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/offboard-dev-tester.sh \
#       --target staging --account <their_account>
#
# The redirect carries the shared `footbag` account's sudo password, which the
# host is always reached as. Step 1 consumes it.
#
# Flags:
#   --target staging               the only environment a dev-and-tester is
#                                  onboarded onto; required rather than defaulted
#   --account <name>               the dev-and-tester being offboarded
#   --from-step <1-3>              resume a run that stopped part way
#   --yes                          accept this command's own confirmations, the
#                                  AWS step's and the allow-list step's in
#                                  advance;
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
#   OFFBOARD_ADDRESS_CMD  replaces the allow-list child
#   OFFBOARD_FETCH        replaces the checkip read of this machine's address
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

HOST_CMD="${OFFBOARD_HOST_CMD:-${SCRIPT_DIR}/provision-dev-tester-account.sh}"
AWS_CMD="${OFFBOARD_AWS_CMD:-${SCRIPT_DIR}/manage-dev-tester.sh}"
ADDRESS_CMD="${OFFBOARD_ADDRESS_CMD:-${SCRIPT_DIR}/authorize-operator-address.sh}"
FETCH_CMD="${OFFBOARD_FETCH:-}"
DEV_TESTER_PATH="/footbag-ops/staging/dev-testers"
AWS_BIN="${OFFBOARD_AWS_BIN:-aws}"
AWS_IDENTITY_BIN="$AWS_BIN"
SSH_CONFIG="${OFFBOARD_SSH_CONFIG:-${HOME}/.ssh/config}"
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

# Onboarding reaches staging only, so offboarding does too. A production run
# would find nothing of theirs there, and its closing report that nothing else
# is owed would leave their staging account and allow-list entry standing.
if [[ "$TARGET" == "production" ]]; then
  echo "ERROR: a dev-and-tester is never onboarded onto production, so there is" >&2
  echo "       nothing of theirs there to offboard. Run it with --target staging." >&2
  echo "       Nothing done." >&2
  exit 2
fi
require_target "$TARGET" staging || exit 2

if [[ -z "$ACCOUNT" ]]; then
  echo "ERROR: --account names the dev-and-tester being retired." >&2
  exit 2
fi
if [[ "$ACCOUNT" == "$OPERATOR_SHARED_ACCOUNT" ]]; then
  echo "ERROR: '${OPERATOR_SHARED_ACCOUNT}' is the shared account, not a person." >&2
  echo "       It is the host's way back in and the bootstrap path onto a host" >&2
  echo "       with nobody on it yet, and retiring it would remove both." >&2
  exit 2
fi
# The same shape onboarding holds a name to, checked before anything is read
# or changed. Every later step trusts it: the workstation cleanup removes the
# credentials section and the password file belonging to whatever name it is
# given, and a resumed run skips the children that would otherwise refuse, so
# a name such as footbag-operator reaching it would strip the administrative
# identity off the machine running this.
if [[ ! "$ACCOUNT" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)+$ || ${#ACCOUNT} -gt 32 ]]; then
  echo "ERROR: '${ACCOUNT}' is not the shape a named account takes here." >&2
  echo "       Lower case letters and digits in two or more parts joined by" >&2
  echo "       underscores, starting with a letter, at most 32 characters." >&2
  echo "       Nothing that is not a person's named account can be retired" >&2
  echo "       by this command." >&2
  exit 2
fi
if [[ ! "$FROM_STEP" =~ ^[1-3]$ ]]; then
  echo "ERROR: --from-step takes 1 to 3." >&2
  exit 2
fi

aws_profile_use "$FOOTBAG_OPERATOR_PROFILE" \
  "Retiring a dev-and-tester is refused to every role, including the job role, by the role's own policy." \
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

# What this machine holds for the account being offboarded: its key pair, its AWS
# credentials, or its Match block. Any one is enough to clean up after.
NAMED_KEY="${HOME}/.ssh/id_ed25519_${ACCOUNT}"
NAMED_KEY_TILDE="~/.ssh/id_ed25519_${ACCOUNT}"
HELD_HERE=0
# The named account this machine's Match block connects as, if any. The filed
# named-account password is one file per machine, not per account, so it is
# this account's only when the Match block says this machine is theirs.
MATCH_ACCOUNT_HERE="$(ssh_alias_match_account "$SSH_CONFIG" "$ALIAS" "$FOOTBAG_DEV_TESTER_PROFILE" 2>/dev/null || true)"
if [[ -e "$NAMED_KEY" || -e "${NAMED_KEY}.pub" || -e "${NAMED_KEY}.onboarded" ]] \
   || aws_cred_has_section "$AWS_CRED_PATH" "$ACCOUNT" \
   || [[ "$MATCH_ACCOUNT_HERE" == "$ACCOUNT" ]]; then
  HELD_HERE=1
fi

echo ""
echo "Retiring '${ACCOUNT}' on ${TARGET}:"
echo "  1. their Linux account on the host: disabled, out of the sudo group, and"
echo "     their key swept off every account on it"
echo "  2. their AWS identity: the grant, then every key, then the job-role"
echo "     sessions they already hold"
echo "  3. their address on the ${TARGET} SSH allow-list"
if (( HELD_HERE )); then
  echo "  4. this workstation: ${ACCOUNT}'s key pair and its Match block, its filed"
  echo "     sudo password, its AWS credentials and the profiles that chain from it"
fi
echo ""
echo "footbag-operator and the shared ${OPERATOR_SHARED_ACCOUNT} account are untouched."
echo ""
echo "Nothing is asked of ${ACCOUNT} and nothing is deleted: their host account"
echo "and IAM user are both left inert, because the trail goes on naming them."
echo "Their repository access on GitHub is separate, and is not touched here."
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
    echo "         bash scripts/offboard-dev-tester.sh ... --from-step 1" >&2
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
      echo "         bash scripts/offboard-dev-tester.sh ... --from-step 2" >&2
      exit 1
    fi
  elif [[ "$USER_READ" == *NoSuchEntity* ]]; then
    echo "    IAM has no user named ${ACCOUNT}, so there is no AWS identity to retire."
  else
    echo "ERROR: could not read whether ${ACCOUNT} has an IAM user:" >&2
    printf '%s\n' "$USER_READ" | sed 's/^/         /' >&2
    echo "       The host account from step 1 IS retired. Resume once IAM can be read:" >&2
    echo "         bash scripts/offboard-dev-tester.sh ... --from-step 2" >&2
    exit 1
  fi
fi

# ── Step 3: the SSH allow-list ───────────────────────────────────────────────

# After the host and AWS halves, because an address with no account behind it
# reaches a login prompt and nothing more. The address is this account's own
# parameter, removed by the script that owns the allow-list, which proves the
# firewall afterwards and never opens the values file: the administrators'
# entries cannot be touched from here, even when this person shares an
# administrator's address, and the report then names that entry as what still
# admits it.
if (( FROM_STEP <= 3 )); then
  echo ""
  echo "== Step 3: ${ACCOUNT}'s address on the ${TARGET} SSH allow-list"
  OWN_ADDRESS=""
  ADDRESS_READ_ERR=""
  if ! OWN_ADDRESS="$("$AWS_BIN" ssm get-parameter --region us-east-1 \
        --name "${DEV_TESTER_PATH}/${ACCOUNT}" --query Parameter.Value --output text 2>/dev/null)"; then
    ADDRESS_READ_ERR="$("$AWS_BIN" ssm get-parameter --region us-east-1 \
        --name "${DEV_TESTER_PATH}/${ACCOUNT}" --query Parameter.Value --output text 2>&1 >/dev/null || true)"
    OWN_ADDRESS=""
    if [[ "$ADDRESS_READ_ERR" != *ParameterNotFound* ]]; then
      echo "" >&2
      echo "ERROR: could not read ${ACCOUNT}'s staging address: ${ADDRESS_READ_ERR}" >&2
      echo "       The host account and the AWS identity ARE retired. Once it reads:" >&2
      echo "         bash scripts/offboard-dev-tester.sh ... --from-step 3" >&2
      exit 1
    fi
  fi

  if [[ -z "$OWN_ADDRESS" ]]; then
    echo "    ${ACCOUNT} has no staging address parameter; nothing to remove"
  else
    # This machine's own address, the way onboarding reads it. Removing the
    # address this machine connects from can end its own SSH to staging, unless
    # an administrator entry also admits it, which this run does not read: the
    # warning says both, and the person running it decides.
    if [[ -n "$FETCH_CMD" ]]; then
      echo "SYNTHETIC: checkip='${FETCH_CMD}' -- this machine's address is a stand-in." >&2
      HERE="$("$FETCH_CMD" 2>/dev/null || true)"
    else
      HERE="$(curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null || true)"
    fi
    HERE="${HERE//[[:space:]]/}"
    [[ -n "$HERE" && "$HERE" != */* ]] && HERE="${HERE}/32"
    if [[ -n "$HERE" && "$HERE" == "$OWN_ADDRESS" ]]; then
      echo ""
      echo "  WARNING: this machine connects from ${OWN_ADDRESS}, the address being removed."
      echo "  If no administrator entry also admits it, this machine loses SSH to"
      echo "  ${TARGET} when it is removed. An administrator's own entry stays exactly"
      echo "  as it is; the removal report says whether one still admits this address."
      # --yes does not answer this one: whether to cut this machine off is
      # decided by the person at it, not by a flag passed before they knew.
      SELF_ASSUME_YES_WAS="$ASSUME_YES"
      ASSUME_YES="no"
      SELF_OK=0
      confirm_from_tty "Type 'APPLY' to remove this machine's own address: " "APPLY" && SELF_OK=1
      ASSUME_YES="$SELF_ASSUME_YES_WAS"
      if (( ! SELF_OK )); then
        echo "Not confirmed. The host account and the AWS identity ARE retired; the" >&2
        echo "address stays until this is resumed:" >&2
        echo "  bash scripts/offboard-dev-tester.sh ... --from-step 3" >&2
        exit 1
      fi
    fi
    ADDRESS_ARGS=(--target "$TARGET" --dev-tester "$ACCOUNT" --remove)
    [[ "$ASSUME_YES" == "yes" ]] && ADDRESS_ARGS+=(--yes)
    if ! bash "$ADDRESS_CMD" "${ADDRESS_ARGS[@]}" </dev/null; then
      echo "" >&2
      echo "ERROR: ${OWN_ADDRESS} was not proved off the ${TARGET} allow-list. The host" >&2
      echo "       account and the AWS identity ARE retired. Resume:" >&2
      echo "         bash scripts/offboard-dev-tester.sh ... --from-step 3" >&2
      exit 1
    fi
    echo "    ${OWN_ADDRESS}: ${ACCOUNT}'s own entry is gone, and the live firewall was read back"
  fi
fi

# ── Step 4: this workstation ─────────────────────────────────────────────────

# Last, because the AWS half proves its refusal through the job-role profile
# that chains from the retired key, so that profile has to outlive it. Each
# removal is of something that belongs to the account being offboarded and nothing
# else, and each says "none here" when it finds nothing, which is also what a
# re-run says.
echo ""
echo "== Step 4: ${ACCOUNT} on this workstation"
if (( ! HELD_HERE )); then
  echo "  nothing of ${ACCOUNT}'s is on this machine: no key pair, no credentials section"
  echo "  and no Match block"
else
  # The filed sudo password first, while the key that shows this machine held
  # the account is still here to say so.
  # That file holds the password of whichever named account this machine's
  # Match block connects as, so it is shredded only when that is this account.
  # Otherwise it is somebody else's, most often the person running this.
  operator_credential_file_for "$ACCOUNT" "$TARGET" || exit 1
  if [[ "$MATCH_ACCOUNT_HERE" != "$ACCOUNT" ]]; then
    echo "  ${OPERATOR_CREDENTIAL_DISPLAY}: left alone, because this machine's named account"
    echo "    is ${MATCH_ACCOUNT_HERE:-none}, not ${ACCOUNT}"
  elif [[ -e "$OPERATOR_CREDENTIAL_FILE" ]]; then
    secret_file_destroy "$OPERATOR_CREDENTIAL_FILE"
    echo "  ${OPERATOR_CREDENTIAL_DISPLAY}: shredded"
  else
    echo "  ${OPERATOR_CREDENTIAL_DISPLAY}: none here"
  fi

  # The profiles that chain from the retired key: the job-role profile only
  # where it sources from this account, and the staging runtime profile only
  # where it sources from that job-role profile. An administrator's chains
  # source from footbag-operator and are left exactly as they are.
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
  if [[ -e "$SSH_CONFIG" ]]; then
    ssh_alias_remove_match_block "$SSH_CONFIG" "$ALIAS" "$ACCOUNT" "$FOOTBAG_DEV_TESTER_PROFILE" "$CONFIG_TMP" || BLOCK_RC=$?
  else
    BLOCK_RC=2
  fi
  if (( BLOCK_RC == 0 )); then
    # The file is the operator's own, so the change is shown as it is made.
    diff -u --label "${SSH_CONFIG} (before)" --label "${SSH_CONFIG} (after)" \
      "$SSH_CONFIG" "$CONFIG_TMP" | sed 's/^/    /' || true
    cat "$CONFIG_TMP" > "$SSH_CONFIG"
    echo "  ${ACCOUNT}'s Match block for ${ALIAS}: removed"
  elif (( BLOCK_RC == 2 )); then
    echo "  ${ACCOUNT}'s Match block for ${ALIAS}: none here"
  else
    echo "ERROR: could not read ${SSH_CONFIG}, or the result would not parse. It was not changed." >&2
    exit 1
  fi

  # Shredded, and deliberately not taken out of the SSH agent. Acceptance copies
  # the pair the onboarding was sealed to, which may be the person's everyday
  # key, and `ssh-add -d` removes an identity by its public key, so it would
  # unload the everyday original too and stop their other SSH sessions. The
  # account it logged in to is retired, so a copy left loaded opens nothing.
  if [[ -e "$NAMED_KEY" || -e "${NAMED_KEY}.pub" ]]; then
    secret_file_destroy "$NAMED_KEY" "${NAMED_KEY}.pub"
    echo "  ${NAMED_KEY_TILDE} key pair: shredded"
  else
    echo "  ${NAMED_KEY_TILDE} key pair: none here"
  fi
  # The acceptance marker named the pair just shredded; left behind, it would
  # describe a pair that no longer exists.
  if [[ -e "${NAMED_KEY}.onboarded" ]]; then
    secret_file_destroy "${NAMED_KEY}.onboarded"
    echo "  ${NAMED_KEY_TILDE}.onboarded acceptance marker: removed"
  fi
fi

# Reached only when every step above proved its outcome: each one that could
# not has already stopped the run, naming where to resume.
echo ""
echo "Done. On ${TARGET}, ${ACCOUNT} holds no shell, their IAM user is inert with no"
echo "job-role session still working, and their own address is off the SSH"
echo "allow-list. Each step proved its own outcome rather than reporting what it"
echo "ran."
echo ""
echo "One thing no step here reaches: a staging runtime session they chained from"
echo "one of their job-role sessions before now carries no name of theirs to refuse"
echo "it by, and AWS ends a chained session within the hour."
echo ""
echo "Nothing else is owed. A dev-and-tester is onboarded onto staging only, and"
echo "nobody named has a vault entry, so there is nothing to remove there."
exit 0
