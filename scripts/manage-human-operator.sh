#!/usr/bin/env bash
# manage-human-operator.sh
#
# The AWS half of a dev-and-tester's retirement, and the read-back of their
# identity: an IAM user of their own whose single grant is permission to assume
# one shared job role, and the key that user signs with. The identity is
# created by scripts/onboard-dev-tester.sh, which seals the key to its owner;
# this script retires it and reads it back.
#
# WHY THIS EXISTS.
#
# A shared identity cannot say who did something. The model gives each
# dev-and-tester their own IAM user, grants that user nothing at all except the
# right to assume one job role, and binds the role session name to the user's
# own name in the role's trust policy, so the name in the trail is the person's
# and it is not something a workstation config can lie about.
#
# The lifecycle is here rather than in Terraform for one reason: onboarding
# mints an access-key secret, and a secret must never enter Terraform state.
# The role those users assume IS declared in Terraform, in the account-level
# identity tree, and this script never touches it.
#
# WHAT IT REFUSES TO DO.
#
#   - Run as anything but the directly authenticated IAM user footbag-operator. Every
#     role in this account, including the job role operators use for everyday
#     work, is denied every write to a human operator's identity. A run started
#     under one would fail partway through rather than at the door.
#   - Touch the directly authenticated user itself, under any flag. That
#     identity is the break-glass path and the principal both runtime trust
#     policies name; it is out of scope here in every respect.
#   - Retire an IAM user of the same name that this script's family did not
#     create. A name collision with somebody else's user is a refusal.
#   - Delete the IAM user on offboarding. It is left inert — no policy, no
#     active keys — because the trail keeps naming it long after the person has
#     gone, and a deleted user makes those entries unreadable.
#   - Call an unreadable answer from IAM an absent one. A read that fails for
#     any reason but IAM saying the thing does not exist stops the run.
#
# Usage:
#
#   bash scripts/manage-human-operator.sh --offboard <operator_name>
#     Removes the grant, then retires every key, then proves the identity can
#     no longer reach the role, then ends the job-role sessions they already
#     hold. Leaves the user itself inert.
#
#   bash scripts/manage-human-operator.sh --verify <operator_name>
#     Reads and reports. Changes nothing.
#
# Flags:
#   --offboard <name>  Retire the named identity.
#   --verify <name>    Report on it, read-only.
#   --yes              Accept the typed confirmation in advance, for a run with
#                      no terminal attached.
#   --driven-by-offboard
#                      Set by offboard-dev-tester.sh, which has already retired
#                      the host account and goes on to the rest of a departure,
#                      so that command is not printed again here.
#
# Test seams (CI only; operators never set these):
#   MANAGE_OPERATOR_AWS_BIN           replaces the aws CLI
#   MANAGE_OPERATOR_PROPAGATION_POLL  seconds between retries while a deleted
#                                     key is still honoured
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

# The AWS identity this run uses, supplied and proved rather than inherited.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# shellcheck source=lib/aws-identity.sh
source "${SCRIPT_DIR}/lib/aws-identity.sh"
# shellcheck source=lib/iam-access-key.sh
source "${SCRIPT_DIR}/lib/iam-access-key.sh"
# shellcheck source=lib/aws-credentials-file.sh
source "${SCRIPT_DIR}/lib/aws-credentials-file.sh"
# The IAM user itself: ownership, the one grant, the retirement of old keys.
# shellcheck source=lib/iam-operator-user.sh
source "${SCRIPT_DIR}/lib/iam-operator-user.sh"
# confirm_from_tty, and the unconditional assignment of ASSUME_YES that stops an
# exported value in the operator's shell standing in for the typed word.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

AWS_BIN="${MANAGE_OPERATOR_AWS_BIN:-aws}"
IAM_KEY_AWS_BIN="$AWS_BIN"
AWS_IDENTITY_BIN="$AWS_BIN"
IAM_OPERATOR_AWS_BIN="$AWS_BIN"

# The identity that administers the others, and the one identity this script
# will not act on.
#
# Named for the principal rather than for what it is for, as every identity
# constant in this tree is.
#
# Spelled here as a literal rather than taken from the profile the shared
# library owns, deliberately: a check that reads the name from the same place
# the credential came from is not a check. Every script that needs it carries
# its own copy for that reason, and they are meant to stay copies.
FOOTBAG_OPERATOR_USER="footbag-operator"

# The path, the policy name and the tags are canonical in the IAM user library,
# which the onboarding script shares; these are local names for them.
OPERATOR_PATH="$IAM_OPERATOR_PATH"
# The role, taken from the shared library so there is one spelling of it.
DEV_TESTER_ROLE_NAME="$FOOTBAG_DEV_TESTER_ROLE"
USER_POLICY_NAME="$IAM_OPERATOR_POLICY_NAME"
# The job-role profile the offboarding proof looks for on this machine. A
# profile, not a principal: nothing here reads it to decide who anybody is. It
# is named for the principal it reaches, so it carries the role's own spelling.
DEV_TESTER_PROFILE="$FOOTBAG_DEV_TESTER_PROFILE"
TAG_PROJECT="$IAM_OPERATOR_TAG_PROJECT"
TAG_MANAGED_BY="$IAM_OPERATOR_TAG_MANAGED_BY"
TAG_OPERATOR_ROLE="$IAM_OPERATOR_TAG_OPERATOR_ROLE"

CONFIG_FILE="${AWS_CONFIG_FILE:-$HOME/.aws/config}"
CRED_FILE="${AWS_SHARED_CREDENTIALS_FILE:-$HOME/.aws/credentials}"

ACTION=""
OPERATOR=""
# Set only by offboard-dev-tester.sh, which has already retired the host account
# and goes on to the rest of what a departure owes, so this child does not name
# a command that is already running.
DRIVEN_BY_OFFBOARD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --offboard)
      ACTION="offboard"
      OPERATOR="${2:-}"
      shift 2 || { echo "ERROR: --offboard requires the operator name" >&2; exit 2; }
      ;;
    --verify)
      ACTION="verify"
      OPERATOR="${2:-}"
      shift 2 || { echo "ERROR: --verify requires the operator name" >&2; exit 2; }
      ;;
    --yes) ASSUME_YES="yes"; shift ;;
    --driven-by-offboard) DRIVEN_BY_OFFBOARD=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

if [[ -z "$ACTION" ]]; then
  echo "ERROR: one of --offboard or --verify is required." >&2
  echo "       There is no default: retiring an identity and reading one back are" >&2
  echo "       different acts, and neither is the safer guess. An identity is" >&2
  echo "       created by scripts/onboard-dev-tester.sh." >&2
  exit 2
fi

if [[ -z "$OPERATOR" ]]; then
  echo "ERROR: --${ACTION} requires the operator name." >&2
  exit 2
fi

# The name becomes an IAM user name, a local profile name and a role session
# name, so it is held to what all three accept rather than to what any one of
# them would tolerate.
# First, and before any judgement about the shape of the name, because this one
# identity must be refused in its own words whatever else is true of it. It is
# the directly authenticated IAM user, it is spelled to a different
# convention than the names this script creates, and nothing here touches it.
if [[ "$OPERATOR" == "$FOOTBAG_OPERATOR_USER" ]]; then
  echo "ERROR: ${FOOTBAG_OPERATOR_USER} is not managed here, under any flag." >&2
  echo "       It is the directly authenticated identity that administers the" >&2
  echo "       others and the principal both runtime trust policies name. This" >&2
  echo "       script's whole subject is the named operators it creates." >&2
  echo "       Nothing done." >&2
  exit 2
fi

if [[ ! "$OPERATOR" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)+$ || ${#OPERATOR} -gt 64 ]]; then
  echo "ERROR: '${OPERATOR}' is not a usable operator name." >&2
  echo "       The house convention is firstname_lastname in lower-case ASCII," >&2
  echo "       and this name becomes three things that have to agree: the IAM" >&2
  echo "       user, the role session name the trust policy forces into every" >&2
  echo "       trail entry, and the account name the same person holds on each" >&2
  echo "       host. A second spelling leaves one person's IAM user and host" >&2
  echo "       account under different names, and the mismatch arrives as a refused assume rather" >&2
  echo "       than as a naming problem." >&2
  echo "" >&2
  echo "       Take the name from the person as they give it, insert a middle" >&2
  echo "       initial where two people would collide, and never a digit." >&2
  exit 2
fi

# A name colliding with a section this script writes is refused by the shape
# check above and needs no separate guard. Every such name carries a capital
# letter or a hyphen, and that check admits neither, so a list of them here
# could never be reached. One stood here and was unreachable, which is worse
# than nothing: the next person to add a reserved name would add it to a list
# that never runs and believe they were covered.

if [[ "$AWS_BIN" != "aws" ]]; then
  echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the account." >&2
fi

# ── Reads ────────────────────────────────────────────────────────────────────

# The reads live in the IAM user library; these are this script's names for them.
user_path() { iam_operator_path "$@"; }
user_tag() { iam_operator_tag "$@"; }
user_keys() { iam_operator_keys "$@"; }
user_policy_state() { iam_operator_policy_state "$@"; }

# The simulator's decision on whether the user's own permissions would let it
# assume the role: allowed, implicitDeny or explicitDeny. Asked of the policy
# simulator rather than by attempting the assume, because the caller here is
# footbag-operator and its own success or failure says nothing about the
# operator's. Returns 1, having said why, when the simulator could not answer,
# which is never read as a refusal.
role_assume_decision() {
  local decision
  if ! decision="$("$AWS_BIN" iam simulate-principal-policy \
      --policy-source-arn "arn:aws:iam::${ACCOUNT_ID}:user${OPERATOR_PATH}${1}" \
      --action-names sts:AssumeRole \
      --resource-arns "$DEV_TESTER_ROLE_ARN" \
      --query 'EvaluationResults[0].EvalDecision' --output text 2>&1)" \
     || [[ ! "$decision" =~ ^(allowed|implicitDeny|explicitDeny)$ ]]; then
    echo "ERROR: the policy simulator could not say whether ${1} may assume" >&2
    echo "       ${DEV_TESTER_ROLE_NAME}:" >&2
    printf '%s\n' "$decision" | sed 's/^/         /' >&2
    return 1
  fi
  echo "$decision"
}

# ── The identity this run acts on the strength of ────────────────────────────

# Settled onto the profile holding the footbag-operator key rather than filled
# from whatever the shell carries. Onboarding and offboarding are refused to
# every role, so a run that inherited a role-assuming section from the work
# before it would stop at the door and cost a re-run in a different shell, a
# refusal nobody should have to meet, since there is exactly one identity this
# can ever act as.
#
# The assertion behind it stays, and it is not redundant. The section names a
# credential; only the resolved ARN says whose it is, and the IAM user is named
# as a literal rather than read from the profile the library owns, because a
# check that reads the name from the same place the credential came from is not
# a check.
aws_profile_use "$FOOTBAG_OPERATOR_PROFILE" \
  "Retiring or reading back a dev-and-tester is refused to every role, including the job role, by the role's own policy." \
  || exit 1
aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" || exit 1

# Taken from the proved ARN rather than read back separately, so the account the
# role ARN names is definitionally the account this run authenticated against.
ACCOUNT_ID="$(printf '%s' "$AWS_IDENTITY_ARN" | cut -d: -f5)"
if [[ ! "$ACCOUNT_ID" =~ ^[0-9]{12}$ ]]; then
  echo "ERROR: could not read an account id out of ${AWS_IDENTITY_ARN}." >&2
  exit 1
fi

DEV_TESTER_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${DEV_TESTER_ROLE_NAME}"

if ! "$AWS_BIN" iam get-role --role-name "$DEV_TESTER_ROLE_NAME" >/dev/null 2>&1; then
  echo "ERROR: there is no ${DEV_TESTER_ROLE_NAME} role in account ${ACCOUNT_ID}." >&2
  echo "       It is the whole of what a named operator is granted, so there is" >&2
  echo "       no named identity to act on. Apply the account-level identity" >&2
  echo "       tree first:" >&2
  echo "         bash scripts/terraform-apply.sh --target identity" >&2
  echo "       Nothing done." >&2
  exit 1
fi

echo "==> ${ACTION}: ${OPERATOR}"
echo "    account ${ACCOUNT_ID}, job role ${DEV_TESTER_ROLE_NAME}"

# ── verify ───────────────────────────────────────────────────────────────────

if [[ "$ACTION" == "verify" ]]; then
  # Counted, so a wrong path or an unresolvable chain is a verdict rather than
  # a line in a report. Reading nothing back is not a finding: an absent user is
  # a legitimate answer to "is this person onboarded".
  FINDINGS=0

  FOUND_PATH="$(user_path "$OPERATOR" || true)"
  if [[ -z "$FOUND_PATH" || "$FOUND_PATH" == "None" ]]; then
    echo "    user:      absent"
    exit 0
  fi

  echo "    user:      present"
  if [[ "$FOUND_PATH" == "$OPERATOR_PATH" ]]; then
    echo "    path:      ${FOUND_PATH}"
  else
    echo "    path:      ${FOUND_PATH} -- NOT ${OPERATOR_PATH}, so the job role's"
    echo "               trust policy does not match this user and it cannot"
    echo "               assume the role whatever its own grants say."
    FINDINGS=$(( FINDINGS + 1 ))
  fi

  for _pair in "Project=${TAG_PROJECT}" "ManagedBy=${TAG_MANAGED_BY}" \
               "OperatorRole=${TAG_OPERATOR_ROLE}"; do
    _key="${_pair%%=*}"
    _want="${_pair#*=}"
    _got="$(user_tag "$OPERATOR" "$_key")"
    if [[ "$_got" == "$_want" ]]; then
      echo "    tag:       ${_key}=${_got}"
    else
      echo "    tag:       ${_key}=${_got:-<unset>} -- expected ${_want}"
      FINDINGS=$(( FINDINGS + 1 ))
    fi
  done
  unset _pair _key _want _got

  # Key age is reported and never judged. Keys here are replaced for a reason —
  # a suspected exposure, a departure, a lost laptop — and never on a calendar,
  # so an age threshold would fail a run over a credential nothing is wrong
  # with and teach the operator to ignore the output.
  _active=0
  _keys="$(user_keys "$OPERATOR")" || exit 1
  while IFS=$'\t' read -r _id _status _created; do
    [[ -z "$_id" ]] && continue
    [[ "$_status" == "Active" ]] && _active=$(( _active + 1 ))
    _age="unknown age"
    if _epoch="$(date -u -d "$_created" +%s 2>/dev/null)"; then
      _age="$(( ( $(date -u +%s) - _epoch ) / 86400 )) days old"
    fi
    echo "    key:       ${_id} ${_status}, ${_age}"
  done <<< "$_keys"
  echo "    active:    ${_active} key(s)"
  unset _id _status _created _age _epoch _keys

  _policy="$(user_policy_state "$OPERATOR")" || exit 1
  if [[ "$_policy" == "present" ]]; then
    echo "    policy:    ${USER_POLICY_NAME} present"
  else
    echo "    policy:    ${USER_POLICY_NAME} absent, so this identity reaches nothing"
  fi
  unset _policy

  # The local half. A section's presence is a fact about this workstation's
  # config file and says nothing about whose machine this is, so it is reported
  # as configuration; what each section RESOLVES to is the AWS-side fact, and a
  # failure there is a finding rather than a line to read past. Both checks used
  # to end in `|| true`, in the one mode whose whole job is to report, so the
  # chain proof could fail and the run still said nothing and exited 0.
  if aws_profile_exists "$OPERATOR"; then
    aws_identity_require_user "$OPERATOR" "$OPERATOR" || FINDINGS=$(( FINDINGS + 1 ))
  else
    echo "    section:   no [${OPERATOR}] section in this workstation's AWS config"
  fi
  if aws_profile_exists "$DEV_TESTER_PROFILE"; then
    aws_identity_require_chain "$DEV_TESTER_PROFILE" || FINDINGS=$(( FINDINGS + 1 ))
  else
    echo "    profile:   no [profile ${DEV_TESTER_PROFILE}] here, so this workstation"
    echo "               has no configured route to the ${DEV_TESTER_ROLE_NAME} role"
  fi

  if (( FINDINGS )); then
    echo "" >&2
    echo "${FINDINGS} finding(s). A read-back that reports a fault and exits 0 is" >&2
    echo "a report nobody acts on." >&2
    exit 1
  fi
  exit 0
fi

# ── offboard ─────────────────────────────────────────────────────────────────

FOUND_PATH="$(user_path "$OPERATOR" || true)"
if [[ -z "$FOUND_PATH" || "$FOUND_PATH" == "None" ]]; then
  echo "ERROR: there is no IAM user named ${OPERATOR}." >&2
  echo "       Nothing done." >&2
  exit 1
fi

if [[ "$FOUND_PATH" != "$OPERATOR_PATH" ]] \
   || [[ "$(user_tag "$OPERATOR" ManagedBy)" != "$TAG_MANAGED_BY" ]]; then
  echo "REFUSING: ${OPERATOR} sits at ${FOUND_PATH} and is not a user this script" >&2
  echo "          manages. Retiring somebody else's identity is not something to" >&2
  echo "          do by analogy with the name. Nothing done." >&2
  exit 1
fi

echo ""
echo "This will remove ${OPERATOR}'s permission to assume ${DEV_TESTER_ROLE_NAME},"
echo "then deactivate and delete every access key they hold. The IAM user itself is"
echo "left in place with nothing attached, because the trail goes on naming it and a"
echo "deleted user makes those entries unreadable."
echo ""
if ! confirm_from_tty "Type 'APPLY' to retire ${OPERATOR}: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  exit 1
fi

# The grant goes first, and the order is not a preference. A key that outlives
# the policy by a few seconds can reach nothing; a policy that outlives the keys
# is a live grant waiting for a key that was never actually destroyed.
echo "==> Removing the grant"
_policy="$(user_policy_state "$OPERATOR")" || exit 1
if [[ "$_policy" == "present" ]]; then
  "$AWS_BIN" iam delete-user-policy --user-name "$OPERATOR" \
    --policy-name "$USER_POLICY_NAME" || {
    echo "ERROR: could not remove ${USER_POLICY_NAME} from ${OPERATOR}." >&2
    echo "       Nothing further was attempted: the keys are still live and" >&2
    echo "       deleting them while the grant stands would leave the identity" >&2
    echo "       able to act the moment anybody issues it another one." >&2
    exit 1
  }
  echo "    ${USER_POLICY_NAME}: removed"
else
  echo "    ${USER_POLICY_NAME}: already absent"
fi

echo "==> Retiring the keys"
# The ids IAM holds for them, read before any is deleted. The real-session proof
# below needs to know whether this workstation's chain signs with one of them,
# and after deletion IAM no longer says.
_keys="$(user_keys "$OPERATOR")" || exit 1
RETIRED_KEY_IDS="$(printf '%s\n' "$_keys" | cut -f1)"
RETIRED_ANY=0
while IFS=$'\t' read -r _id _status _rest; do
  [[ -z "$_id" ]] && continue
  RETIRED_ANY=1
  # Allowed to take the last one: ending with nothing is the whole point here,
  # and the default refusal is written for a rotation, which must leave a
  # working identity something it can still authenticate with.
  if [[ "$_status" == "Active" ]]; then
    IAM_KEY_ALLOW_LAST=1 iam_key_retire "$OPERATOR" "$_id" deactivate || exit 1
  fi
  IAM_KEY_ALLOW_LAST=1 iam_key_retire "$OPERATOR" "$_id" delete || exit 1
done <<< "$_keys"
unset _id _status _rest _keys _policy
(( RETIRED_ANY )) || echo "    no keys to retire"

echo "==> Proving it"
REMAINING="$(user_keys "$OPERATOR")" || exit 1
# The status field on its own, matched whole: "Inactive" contains "Active", so
# a substring count would report a retired key as a live one.
ACTIVE_LEFT="$(printf '%s\n' "$REMAINING" | cut -f2 | grep -cx 'Active' || true)"
if [[ "$ACTIVE_LEFT" != "0" ]]; then
  echo "ERROR: ${OPERATOR} still holds ${ACTIVE_LEFT} active key(s)." >&2
  exit 1
fi
echo "    active keys: none"

_policy="$(user_policy_state "$OPERATOR")" || exit 1
if [[ "$_policy" != "absent" ]]; then
  echo "ERROR: ${USER_POLICY_NAME} is still attached to ${OPERATOR}." >&2
  exit 1
fi
unset _policy
echo "    ${USER_POLICY_NAME}: gone"

_decision="$(role_assume_decision "$OPERATOR")" || exit 1
if [[ "$_decision" == "allowed" ]]; then
  echo "ERROR: ${OPERATOR} would still be allowed to assume ${DEV_TESTER_ROLE_NAME}." >&2
  echo "       Something else grants it — a group, a managed policy, a boundary —" >&2
  echo "       and this script did not put it there. Find it before calling this" >&2
  echo "       identity retired." >&2
  exit 1
fi
echo "    a new role session: refused by the policy simulator"

# And again for real, where this machine is able to try it.
#
# The simulator asks whether a fresh session WOULD be allowed, which is the
# right instrument inside a script: it answers without minting anything. It is
# also an answer about policy evaluation rather than about this identity's
# credentials, and the two can differ. A key that survived the retirement above
# would still authenticate, and the simulator would never notice.
#
# So where the workstation carries the retired operator's own chain, the assume
# is attempted for real and required to fail. This was a command an operator was
# told to type at the keyboard afterwards, which is a check that gets skipped on
# the day it matters, and the go-live gate asks for the stronger evidence.
#
# It is attempted only where the local chain signs with one of the keys IAM held
# for THIS operator. A chain signing with anybody else's key would prove nothing
# about the person being retired, and its failure or success would be about them
# instead. Which key the chain uses is read from the local files; whether that
# key was the operator's is decided by comparing its id with the ids IAM listed
# for them, never by what the sections happen to be called.
ASSUME_SOURCE=""
ASSUME_KEY_ID=""
if aws_profile_exists "$DEV_TESTER_PROFILE"; then
  ASSUME_SOURCE="$(aws_config_profile_source "$CONFIG_FILE" "$DEV_TESTER_PROFILE")"
  if [[ -n "$ASSUME_SOURCE" ]]; then
    ASSUME_KEY_ID="$(aws_cred_current_key_id "$CRED_FILE" "$ASSUME_SOURCE")"
    [[ -n "$ASSUME_KEY_ID" ]] \
      || ASSUME_KEY_ID="$(aws_config_profile_key_id "$CONFIG_FILE" "$ASSUME_SOURCE")"
  fi
fi

if [[ -z "$ASSUME_SOURCE" ]]; then
  echo "    a real role session: not attempted here, because this workstation has"
  echo "      no [profile ${DEV_TESTER_PROFILE}] chaining from anything. The"
  echo "      simulator's answer above stands on its own; this is the stronger"
  echo "      evidence and it can only be produced on a machine holding the"
  echo "      retired key."
elif [[ -z "$ASSUME_KEY_ID" ]] \
     || ! printf '%s\n' "$RETIRED_KEY_IDS" | grep -qxF -- "$ASSUME_KEY_ID"; then
  echo "    a real role session: not attempted here, because [profile"
  echo "      ${DEV_TESTER_PROFILE}] on this machine chains from [${ASSUME_SOURCE}],"
  echo "      signing with ${ASSUME_KEY_ID:-no key recorded here}, which is not one of"
  echo "      the keys IAM held for ${OPERATOR}, so what it resolves to would be a"
  echo "      fact about somebody else's identity."
else
  # A fresh assume signed with the retired key itself. Asking through the role
  # profile instead would be answered from the CLI's on-disk session cache, and
  # a session already issued stays valid until it expires whatever happens to
  # the key, so it would prove nothing about the retirement. IAM also goes on
  # honouring a deleted key for some seconds, so a success is retried until it
  # stops or the wait runs out.
  RETIRE_POLL="${MANAGE_OPERATOR_PROPAGATION_POLL:-5}"
  RETIRE_TRIES=24
  retire_try=0
  while REAL_ASSUME="$("$AWS_BIN" sts assume-role --profile "$ASSUME_SOURCE" \
      --role-arn "$DEV_TESTER_ROLE_ARN" --role-session-name "$OPERATOR" \
      --query AssumedRoleUser.Arn --output text --region us-east-1 2>&1)"; do
    if (( retire_try >= RETIRE_TRIES )); then
      echo "ERROR: ${OPERATOR}'s own credentials still reached ${DEV_TESTER_ROLE_NAME}." >&2
      echo "       The attempt resolved to:" >&2
      printf '%s\n' "$REAL_ASSUME" | sed 's/^/         /' >&2
      echo "" >&2
      echo "       The grant and the keys report as gone, so something is still" >&2
      echo "       authenticating. This identity is NOT retired." >&2
      exit 1
    fi
    (( retire_try == 0 )) \
      && echo "==> waiting for the retired key to stop working (up to $(( RETIRE_POLL * RETIRE_TRIES ))s)"
    sleep "$RETIRE_POLL"
    retire_try=$(( retire_try + 1 ))
  done
  echo "    a real role session: refused, and this is what it said:"
  printf '%s\n' "$REAL_ASSUME" | sed 's/^/      /'
fi

# Asserted here for the same reason onboarding asserts it at creation: nothing
# in this script makes one, so a login profile on this user arrived by some
# other route, and it is a console sign-in with no second factor that neither
# the grant removal nor the key retirement above touches. An offboard that left
# one behind would report a retired identity that can still sign in.
_login="$(iam_operator_login_profile_state "$OPERATOR")" || exit 1
if [[ "$_login" != "absent" ]]; then
  echo "ERROR: ${OPERATOR} still has a console login profile." >&2
  echo "       The grant and the keys are gone, but this is a console sign-in" >&2
  echo "       that survives both, and nothing here created it. Remove it" >&2
  echo "       before calling this identity retired." >&2
  exit 1
fi
echo "    login profile: none"

# Sessions already issued. Removing the grant stops new sessions being minted;
# it does not reach one somebody already holds, which stays valid until it
# expires, up to the role's four hours. So the role itself is told to refuse
# every session this person was issued before now: a named inline policy on the
# role, the shape AWS's own "revoke active sessions" writes, narrowed to this
# person's sessions by the session name the trust policy forces to be theirs.
# Nobody else's session is touched, and a re-onboarding's sessions are issued after the
# cutoff and pass it; the next offboard of the same name rewrites the cutoff.
#
# Written here rather than in Terraform because it belongs to one departure and
# revoking access must never wait on an apply. Terraform declares the role's job
# policy by its own name and nothing that manages the whole set, so it neither
# reports nor removes this one. The job role is denied writing to itself, so
# only the identity running this can take it away.
#
# Last, after every proof, so a run that failed earlier has denied nobody.
REVOKE_POLICY_NAME="revoke-sessions-${OPERATOR}"
REVOKE_BEFORE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
REVOKE_USERID="*:${OPERATOR}"
printf -v REVOKE_DOC '%s' \
  '{"Version":"2012-10-17","Statement":[{"Sid":"RevokeSessionsIssuedBeforeOffboard",' \
  '"Effect":"Deny","Action":"*","Resource":"*","Condition":{' \
  '"DateLessThan":{"aws:TokenIssueTime":"'"$REVOKE_BEFORE"'"},' \
  '"StringLike":{"aws:userid":"'"$REVOKE_USERID"'"}}}]}'
echo "==> Ending the sessions ${OPERATOR} already holds"
if ! "$AWS_BIN" iam put-role-policy --role-name "$DEV_TESTER_ROLE_NAME" \
    --policy-name "$REVOKE_POLICY_NAME" --policy-document "$REVOKE_DOC" >/dev/null; then
  echo "ERROR: could not write ${REVOKE_POLICY_NAME} onto ${DEV_TESTER_ROLE_NAME}." >&2
  echo "       The grant and the keys are gone, so no new session can be minted," >&2
  echo "       but one issued before now still works until it expires. Re-run" >&2
  echo "       this offboard: every step before this one finds its work done." >&2
  exit 1
fi
REVOKE_READ="$("$AWS_BIN" iam get-role-policy --role-name "$DEV_TESTER_ROLE_NAME" \
  --policy-name "$REVOKE_POLICY_NAME" \
  --query 'PolicyDocument.Statement[0].[Effect,Condition.DateLessThan."aws:TokenIssueTime",Condition.StringLike."aws:userid"]' \
  --output text 2>/dev/null || true)"
if [[ "$REVOKE_READ" != "Deny"$'\t'"${REVOKE_BEFORE}"$'\t'"${REVOKE_USERID}" ]]; then
  echo "ERROR: ${REVOKE_POLICY_NAME} on ${DEV_TESTER_ROLE_NAME} does not read back as" >&2
  echo "       written. It reads:" >&2
  printf '%s\n' "${REVOKE_READ:-<nothing>}" | sed 's/^/         /' >&2
  echo "       Until it does, a session issued before now still works. Re-run this" >&2
  echo "       offboard." >&2
  exit 1
fi
echo "    ${REVOKE_POLICY_NAME}: every ${DEV_TESTER_ROLE_NAME} session of ${OPERATOR}'s"
echo "      issued before ${REVOKE_BEFORE} is refused"

# Earlier departures' revocations, once they can refuse nothing. A session lives
# at most the role's maximum duration, so a cutoff older than that plus an hour
# of margin denies no session that still exists. Each departure leaves one such
# policy on the role, and the role's inline policies share one size limit that
# the job policy needs too, so they are cleared here rather than left to grow
# until an offboard or an identity apply is refused. The person being retired
# now is already retired above, so a failure here is reported and ends nothing.
echo "==> Clearing earlier revocations that can no longer refuse any session"
PRUNE_MAX="$("$AWS_BIN" iam get-role --role-name "$DEV_TESTER_ROLE_NAME" \
  --query 'Role.MaxSessionDuration' --output text 2>&1 || true)"
PRUNE_LIST="$("$AWS_BIN" iam list-role-policies --role-name "$DEV_TESTER_ROLE_NAME" \
  --query 'PolicyNames' --output text 2>&1)" || PRUNE_LIST="unreadable"
if [[ ! "$PRUNE_MAX" =~ ^[0-9]+$ || "$PRUNE_LIST" == "unreadable" ]]; then
  echo "    WARNING: could not read ${DEV_TESTER_ROLE_NAME}'s session length or its"
  echo "      policies, so no earlier revocation was cleared. Nothing is exposed by"
  echo "      that; the next offboard tries again."
else
  PRUNE_NOW="$(date -u +%s)"
  PRUNED=0
  for _pname in $PRUNE_LIST; do
    [[ "$_pname" == revoke-sessions-* && "$_pname" != "$REVOKE_POLICY_NAME" ]] || continue
    _cutoff="$("$AWS_BIN" iam get-role-policy --role-name "$DEV_TESTER_ROLE_NAME" \
      --policy-name "$_pname" \
      --query 'PolicyDocument.Statement[0].[Effect,Condition.DateLessThan."aws:TokenIssueTime",Condition.StringLike."aws:userid"]' \
      --output text 2>/dev/null | cut -f2 || true)"
    # Parsed only in the exact shape this script writes: date(1) turns an empty
    # or odd string into a plausible time, which would clear a live revocation.
    if [[ ! "$_cutoff" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
       || ! _cutoff_epoch="$(date -u -d "$_cutoff" +%s 2>/dev/null)"; then
      echo "    ${_pname}: cutoff unreadable, left in place"
      continue
    fi
    if (( _cutoff_epoch + PRUNE_MAX + 3600 < PRUNE_NOW )); then
      if "$AWS_BIN" iam delete-role-policy --role-name "$DEV_TESTER_ROLE_NAME" \
          --policy-name "$_pname" >/dev/null 2>&1; then
        echo "    ${_pname}: cut off at ${_cutoff}, refuses nothing now, removed"
        PRUNED=$(( PRUNED + 1 ))
      else
        echo "    WARNING: ${_pname} could not be removed; the next offboard tries again."
      fi
    fi
  done
  unset _pname _cutoff _cutoff_epoch
  (( PRUNED )) || echo "    none to clear"
fi

echo ""
echo "Done. ${OPERATOR} is inert: no grant, no keys, no console sign-in, and no"
echo "job-role session still working. The user itself is left for the trail to keep"
echo "naming."
echo ""
echo "One thing no policy on the job role reaches: a staging runtime session they"
echo "chained from one of their job-role sessions before now. It carries no name of"
echo "theirs to refuse it by, and AWS ends a chained session within the hour."

# Run on its own, this script has ended one of several access paths, and not the
# one that reaches a shell, so the command that ends all of them is named here at
# the moment the gap opens. Driven by offboard-dev-tester.sh, that command is the
# one running and it goes on to the rest.
if (( ! DRIVEN_BY_OFFBOARD )); then
  echo ""
  echo "Still owed: the host account, the address on the SSH allow-list and the"
  echo "repository access. One command ends all of them, for each environment:"
  echo "  < <the credential file your alias selects> \\"
  echo "    bash scripts/offboard-dev-tester.sh --target <env> --account ${OPERATOR} \\"
  echo "      --github-login <their GitHub login, or none>"
fi
