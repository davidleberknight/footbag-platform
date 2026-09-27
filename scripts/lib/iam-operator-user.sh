#!/usr/bin/env bash
# shellcheck shell=bash
# iam-operator-user.sh — a named human operator's IAM user on the AWS side: the
# user, its ownership tags, its one grant, and the keys it held before this run.
#
# Two scripts create these users. manage-human-operator.sh onboards the person at
# the keyboard and writes their key into this workstation's AWS files;
# hire-dev-tester.sh hires somebody who is not here and seals their key to them.
# What differs between the two is only where the key goes, so what they share
# lives here and neither carries its own copy of the ownership rules, which are
# what the offboarding later checks before it will retire a user.
#
# WHAT IT WILL NOT DO.
#
#   - Act on the directly authenticated user, footbag-operator, or on the shared
#     host account's name. Every mutating function refuses both by name before
#     reaching AWS, whatever its caller has already checked, because the one
#     identity that administers the others is out of scope here in every
#     respect.
#   - Touch any local file. The AWS config and credentials files belong to the
#     caller, and one of the two callers must never write them.
#   - Adopt a user it did not create. A user of the name without the path and
#     all three tags is somebody else's, and granting it the job role would hand
#     a stranger's identity access to this project.
#   - Create a console password, or attach any managed policy. The user's whole
#     grant is one allow statement naming one role.
#   - Mint the key. That is scripts/lib/iam-access-key.sh, which the caller runs
#     after this, because the caller decides where the secret goes.
#
# The caller sets IAM_OPERATOR_AWS_BIN (the test seam) and runs
# iam_operator_undo from its own trap after iam_key_cleanup: a user cannot be
# deleted while it holds a key or an inline policy, so the unwind runs in the
# reverse of the order that built it.

# Canonical, and canonical in one place. The IAM path is what the job role's
# trust policy matches on, so a user created outside it can hold the grant and
# still be refused by the role; the tags are what let a later run prove a
# pre-existing user is one of ours before it modifies anything.
IAM_OPERATOR_PATH="/footbag-operators/"
# The inline policy attached to the user. A policy name, not the role's.
IAM_OPERATOR_POLICY_NAME="AssumeFootbagDevTester"
IAM_OPERATOR_TAG_PROJECT="footbag"
# Names the tool that owns the lifecycle, and the offboarding refuses a user
# without it, so both callers write this same value.
IAM_OPERATOR_TAG_MANAGED_BY="manage-human-operator.sh"
# What the user is for. Not the role's name.
IAM_OPERATOR_TAG_OPERATOR_ROLE="dev_tester"

IAM_OPERATOR_AWS_BIN="${IAM_OPERATOR_AWS_BIN:-aws}"

# What this run created, so a failure undoes that and nothing else. The most
# damaging mistake available here is deleting a user that pre-dated the run.
IAM_OPERATOR_CREATED_USER=0
IAM_OPERATOR_CREATED_POLICY=0
IAM_OPERATOR_TARGET=""

# Spelled as literals rather than read from any profile, because a check that
# reads the name from the place the credential came from is not a check.
_iam_operator_refuse_reserved() {
  case "$1" in
    footbag-operator|footbag|"")
      echo "ERROR: '${1}' is not a named operator, and no IAM change is made to it" >&2
      echo "       here under any circumstance. Nothing done." >&2
      return 1
      ;;
  esac
  return 0
}

# ── Reads ────────────────────────────────────────────────────────────────────

# The user's IAM path, or nothing when the user does not exist.
iam_operator_path() {
  "$IAM_OPERATOR_AWS_BIN" iam get-user --user-name "$1" --query 'User.Path' --output text 2>/dev/null
}

iam_operator_tag() {
  "$IAM_OPERATOR_AWS_BIN" iam list-user-tags --user-name "$1" \
    --query "Tags[?Key=='${2}'].Value" --output text 2>/dev/null || true
}

# Every access key the user holds, one `<id> <status> <created>` line each.
iam_operator_keys() {
  "$IAM_OPERATOR_AWS_BIN" iam list-access-keys --user-name "$1" \
    --query 'AccessKeyMetadata[].[AccessKeyId,Status,CreateDate]' --output text 2>/dev/null || true
}

iam_operator_has_policy() {
  "$IAM_OPERATOR_AWS_BIN" iam get-user-policy --user-name "$1" \
    --policy-name "$IAM_OPERATOR_POLICY_NAME" >/dev/null 2>&1
}

# iam_operator_state <name>
# Sets IAM_OPERATOR_STATE to absent, ours or foreign, and IAM_OPERATOR_FOUND_PATH.
# Ownership is proved from the path and all three tags together, because any one
# of them could be a coincidence and the set is what only these scripts write.
iam_operator_state() {
  local name="$1"
  IAM_OPERATOR_FOUND_PATH="$(iam_operator_path "$name" || true)"
  if [[ -z "$IAM_OPERATOR_FOUND_PATH" || "$IAM_OPERATOR_FOUND_PATH" == "None" ]]; then
    IAM_OPERATOR_STATE="absent"
  elif [[ "$IAM_OPERATOR_FOUND_PATH" != "$IAM_OPERATOR_PATH" ]] \
     || [[ "$(iam_operator_tag "$name" Project)" != "$IAM_OPERATOR_TAG_PROJECT" ]] \
     || [[ "$(iam_operator_tag "$name" ManagedBy)" != "$IAM_OPERATOR_TAG_MANAGED_BY" ]] \
     || [[ "$(iam_operator_tag "$name" OperatorRole)" != "$IAM_OPERATOR_TAG_OPERATOR_ROLE" ]]; then
    IAM_OPERATOR_STATE="foreign"
  else
    IAM_OPERATOR_STATE="ours"
  fi
}

# iam_operator_refuse_foreign <name>
# The refusal every caller gives for a user of the name that is not one of ours.
iam_operator_refuse_foreign() {
  local name="$1"
  echo "REFUSING: an IAM user named ${name} already exists and is not one" >&2
  echo "          of ours: it sits at ${IAM_OPERATOR_FOUND_PATH} and does not carry the" >&2
  echo "          full set of ownership tags this script writes." >&2
  echo "" >&2
  echo "          Granting it the job role would hand somebody else's identity" >&2
  echo "          access to this project. Pick a different operator name, or" >&2
  echo "          establish what that user is for before going further." >&2
  echo "          Nothing done." >&2
}

# ── Writes ───────────────────────────────────────────────────────────────────

# iam_operator_ensure <name> <exists:0|1> <role-arn>
# Creates the user when absent, grants the one statement, asserts there is no
# console login, and retires every key the user already holds, an active one
# included: a key that has been lost is still active until something retires
# it. The caller has already proved an existing user is ours and confirmed the
# run with the operator; this function only acts.
iam_operator_ensure() {
  local name="$1" exists="$2" role_arn="$3"
  _iam_operator_refuse_reserved "$name" || return 1
  IAM_OPERATOR_TARGET="$name"

  if (( ! exists )); then
    echo "==> Creating the IAM user"
    "$IAM_OPERATOR_AWS_BIN" iam create-user --user-name "$name" --path "$IAM_OPERATOR_PATH" \
      --tags "Key=Project,Value=${IAM_OPERATOR_TAG_PROJECT}" \
             "Key=ManagedBy,Value=${IAM_OPERATOR_TAG_MANAGED_BY}" \
             "Key=OperatorRole,Value=${IAM_OPERATOR_TAG_OPERATOR_ROLE}" >/dev/null || {
      echo "ERROR: could not create the IAM user ${name}." >&2
      return 1
    }
    IAM_OPERATOR_CREATED_USER=1
    echo "    created under ${IAM_OPERATOR_PATH}"
  fi

  echo "==> Granting the one statement this identity carries"
  local policy_document
  policy_document="$(printf '%s' \
    "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"${IAM_OPERATOR_POLICY_NAME}\"," \
    "\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\"," \
    "\"Resource\":\"${role_arn}\"}]}")"
  "$IAM_OPERATOR_AWS_BIN" iam put-user-policy --user-name "$name" \
    --policy-name "$IAM_OPERATOR_POLICY_NAME" \
    --policy-document "$policy_document" >/dev/null || {
    echo "ERROR: could not attach ${IAM_OPERATOR_POLICY_NAME} to ${name}." >&2
    return 1
  }
  IAM_OPERATOR_CREATED_POLICY=1
  echo "    ${IAM_OPERATOR_POLICY_NAME}: sts:AssumeRole on ${role_arn}"

  # Asserted rather than assumed. Nothing above creates one, but a login profile
  # arriving by any other route turns this identity into a console sign-in with
  # no second factor, which is the shape this model exists to avoid.
  if "$IAM_OPERATOR_AWS_BIN" iam get-login-profile --user-name "$name" >/dev/null 2>&1; then
    echo "ERROR: ${name} has a console login profile." >&2
    echo "       These identities sign API calls and have no console sign-in by" >&2
    echo "       design. Something else created it. Remove it and re-run." >&2
    return 1
  fi
  echo "    login profile: none, as intended"

  # A re-issue mints a NEW key; it never reactivates a retired one. Allowed to
  # take the last one: a fresh key is minted immediately after, and the
  # account's two-key limit would otherwise refuse an ordinary re-issue.
  local _id _status _rest
  while IFS=$'\t' read -r _id _status _rest; do
    [[ -z "$_id" ]] && continue
    if [[ "$_status" == "Active" ]]; then
      echo "==> Retiring the key being replaced: ${_id}"
      IAM_KEY_ALLOW_LAST=1 iam_key_retire "$name" "$_id" deactivate || return 1
    else
      echo "==> Clearing a retired key that is in the way: ${_id}"
    fi
    IAM_KEY_ALLOW_LAST=1 iam_key_retire "$name" "$_id" delete || return 1
  done <<< "$(iam_operator_keys "$name")"
  return 0
}

# iam_operator_undo
# Removes the grant and the user this run created, and nothing that pre-dated
# it. Idempotent, because a trapped INT does not terminate bash and the handler
# can run twice.
iam_operator_undo() {
  local name="$IAM_OPERATOR_TARGET"
  [[ -z "$name" ]] && return 0
  _iam_operator_refuse_reserved "$name" >/dev/null 2>&1 || return 0
  if (( IAM_OPERATOR_CREATED_POLICY )); then
    echo "Removing the ${IAM_OPERATOR_POLICY_NAME} policy this run attached." >&2
    "$IAM_OPERATOR_AWS_BIN" iam delete-user-policy --user-name "$name" \
      --policy-name "$IAM_OPERATOR_POLICY_NAME" >/dev/null 2>&1 || true
  fi
  if (( IAM_OPERATOR_CREATED_USER )); then
    echo "Deleting the IAM user this run created: ${name}." >&2
    "$IAM_OPERATOR_AWS_BIN" iam delete-user --user-name "$name" >/dev/null 2>&1 || true
  else
    echo "The IAM user ${name} pre-dated this run and is NOT being deleted." >&2
    echo "Re-running is safe." >&2
  fi
  IAM_OPERATOR_CREATED_USER=0
  IAM_OPERATOR_CREATED_POLICY=0
  IAM_OPERATOR_TARGET=""
  return 0
}
