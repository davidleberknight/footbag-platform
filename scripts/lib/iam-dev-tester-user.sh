#!/usr/bin/env bash
# shellcheck shell=bash
# iam-dev-tester-user.sh — a named dev-and-tester's IAM user on the AWS side: the
# user, its ownership tags, its one grant, and the keys it held before this run.
#
# onboard-dev-tester.sh creates these users and seals each key to its owner, and
# manage-dev-tester.sh retires them and reads them back. The ownership rules
# live here, in one place, because the offboarding checks them before it will
# retire a user.
#
# WHAT IT WILL NOT DO.
#
#   - Act on the directly authenticated user, footbag-operator, or on the shared
#     host account's name. Every mutating function refuses both by name before
#     reaching AWS, whatever its caller has already checked, because the one
#     identity that administers the others is out of scope here in every
#     respect.
#   - Touch any local file. The AWS config and credentials files belong to the
#     caller, and the onboarding must never write them.
#   - Adopt a user it did not create. A user of the name without the path and
#     all three tags is somebody else's, and granting it the job role would hand
#     a stranger's identity access to this project.
#   - Create a console password, or attach any managed policy. The user's whole
#     grant is one allow statement naming one role.
#   - Mint the key. That is scripts/lib/iam-access-key.sh, which the caller runs
#     after this, because the caller decides where the secret goes.
#
# The caller sets IAM_DEV_TESTER_AWS_BIN (the test seam) and runs
# iam_dev_tester_undo from its own trap after iam_key_cleanup: a user cannot be
# deleted while it holds a key or an inline policy, so the unwind runs in the
# reverse of the order that built it.

# Canonical, and canonical in one place. The IAM path is what the job role's
# trust policy matches on, so a user created outside it can hold the grant and
# still be refused by the role; the tags are what let a later run prove a
# pre-existing user is one of ours before it modifies anything.
IAM_DEV_TESTER_PATH="/footbag-dev-testers/"
# The inline policy attached to the user. A policy name, not the role's.
IAM_DEV_TESTER_POLICY_NAME="AssumeFootbagDevTester"
IAM_DEV_TESTER_TAG_PROJECT="footbag"
# Names the tool that owns the lifecycle, and the offboarding refuses a user
# without it.
IAM_DEV_TESTER_TAG_MANAGED_BY="manage-dev-tester.sh"
# What the user is for. Not the role's name.
IAM_DEV_TESTER_TAG_ROLE="dev_tester"

# Current: a user these scripts created under the earlier names sits at the
# legacy path with the legacy ManagedBy value and tag key, and the role's trust
# no longer admits it. A re-onboarding moves such a user to the path above and
# rewrites its tags, so no one-off command is needed.
# Target: no user carries the legacy names, and this block, the "legacy" state
# and iam_dev_tester_adopt_legacy are removed.
IAM_DEV_TESTER_LEGACY_PATH="/footbag-operators/"
IAM_DEV_TESTER_LEGACY_MANAGED_BY="manage-human-operator.sh"
IAM_DEV_TESTER_LEGACY_ROLE_KEY="OperatorRole"

IAM_DEV_TESTER_AWS_BIN="${IAM_DEV_TESTER_AWS_BIN:-aws}"

# What this run created, so a failure undoes that and nothing else. The most
# damaging mistake available here is deleting a user that pre-dated the run.
IAM_DEV_TESTER_CREATED_USER=0
IAM_DEV_TESTER_CREATED_POLICY=0
IAM_DEV_TESTER_TARGET=""

# Spelled as literals rather than read from any profile, because a check that
# reads the name from the place the credential came from is not a check.
_iam_dev_tester_refuse_reserved() {
  case "$1" in
    footbag-operator|footbag|"")
      echo "ERROR: '${1}' is not a named dev-tester, and no IAM change is made to it" >&2
      echo "       here under any circumstance. Nothing done." >&2
      return 1
      ;;
  esac
  return 0
}

# ── Reads ────────────────────────────────────────────────────────────────────

# Every read here fails closed. IAM answering by name that the entity does not
# exist is an answer; any other failure (a denied call, a network error, an
# expired session) is not one. Read as "none", it would report keys and a grant
# as gone while both are still live, or a live user as absent, sending an
# onboarding re-run on to re-issue its host password. The not-found answer is
# recognised by its error code, NoSuchEntity, which the CLI prints inside a
# longer message whose wording is not a contract.
#
# A successful read is taken from stdout alone. The CLI can print a warning on
# stderr for a call that succeeded (a deprecation notice, a library warning),
# and captured together with the answer it becomes a key id or a policy name.

# _iam_dev_tester_error_of <aws args...>
# The error text of a read that has just failed, from making it again with its
# answer discarded. Repeating it is safe because it is a read, and it keeps the
# library free of temp files, which it has no trap to clean up.
_iam_dev_tester_error_of() {
  local err
  if err="$("$IAM_DEV_TESTER_AWS_BIN" "$@" 2>&1 >/dev/null)"; then
    echo "(the call failed, then succeeded when repeated, so there is no error text to show; re-run)"
    return 0
  fi
  printf '%s\n' "$err"
}

# The user's IAM path, or nothing when IAM says the user does not exist.
# Returns 1, having said why on stderr, when IAM could not be read.
iam_dev_tester_path() {
  local out err
  local -a call=(iam get-user --user-name "$1" --query 'User.Path' --output text)
  if out="$("$IAM_DEV_TESTER_AWS_BIN" "${call[@]}" 2>/dev/null)"; then
    [[ -n "$out" && "$out" != "None" ]] && printf '%s\n' "$out"
    return 0
  fi
  err="$(_iam_dev_tester_error_of "${call[@]}")"
  [[ "$err" == *NoSuchEntity* ]] && return 0
  echo "ERROR: could not read the IAM user ${1}:" >&2
  printf '%s\n' "$err" | sed 's/^/         /' >&2
  return 1
}

# iam_dev_tester_tag <name> <key>
# The tag's value, or nothing when the user carries no such tag. Returns 1,
# having said why on stderr, when IAM could not be read, so an unreadable tag is
# refused as unreadable rather than judged as a stranger's user.
iam_dev_tester_tag() {
  local out err
  local -a call=(iam list-user-tags --user-name "$1"
    --query "Tags[?Key=='${2}'].Value" --output text)
  if out="$("$IAM_DEV_TESTER_AWS_BIN" "${call[@]}" 2>/dev/null)"; then
    [[ -n "$out" && "$out" != "None" ]] && printf '%s\n' "$out"
    return 0
  fi
  err="$(_iam_dev_tester_error_of "${call[@]}")"
  echo "ERROR: could not read ${1}'s ${2} tag from IAM:" >&2
  printf '%s\n' "$err" | sed 's/^/         /' >&2
  return 1
}

# Every access key the user holds, one `<id> <status> <created>` line each, and
# nothing for a user IAM says does not exist. Returns 1, having said why on
# stderr, when IAM could not be read.
iam_dev_tester_keys() {
  local out err
  local -a call=(iam list-access-keys --user-name "$1"
    --query 'AccessKeyMetadata[].[AccessKeyId,Status,CreateDate]' --output text)
  if out="$("$IAM_DEV_TESTER_AWS_BIN" "${call[@]}" 2>/dev/null)"; then
    [[ -n "$out" && "$out" != "None" ]] && printf '%s\n' "$out"
    return 0
  fi
  err="$(_iam_dev_tester_error_of "${call[@]}")"
  [[ "$err" == *NoSuchEntity* ]] && return 0
  echo "ERROR: could not read ${1}'s access keys from IAM:" >&2
  printf '%s\n' "$err" | sed 's/^/         /' >&2
  return 1
}

# iam_dev_tester_policy_state <name>
# Prints `present` or `absent` for the one grant this library attaches. Returns
# 1, having said why on stderr, when IAM could not be read, so no caller can
# mistake an unreadable grant for a missing one.
iam_dev_tester_policy_state() {
  local err
  local -a call=(iam get-user-policy --user-name "$1"
    --policy-name "$IAM_DEV_TESTER_POLICY_NAME" --query PolicyName --output text)
  if "$IAM_DEV_TESTER_AWS_BIN" "${call[@]}" >/dev/null 2>&1; then
    echo "present"
    return 0
  fi
  err="$(_iam_dev_tester_error_of "${call[@]}")"
  if [[ "$err" == *NoSuchEntity* ]]; then
    echo "absent"
    return 0
  fi
  echo "ERROR: could not read whether ${1} holds ${IAM_DEV_TESTER_POLICY_NAME}:" >&2
  printf '%s\n' "$err" | sed 's/^/         /' >&2
  return 1
}

# iam_dev_tester_login_profile_state <name>
# Prints `present` or `absent` for a console login profile, failing closed the
# same way: a login profile nobody could read is not one proved absent.
iam_dev_tester_login_profile_state() {
  local err
  local -a call=(iam get-login-profile --user-name "$1")
  if "$IAM_DEV_TESTER_AWS_BIN" "${call[@]}" >/dev/null 2>&1; then
    echo "present"
    return 0
  fi
  err="$(_iam_dev_tester_error_of "${call[@]}")"
  if [[ "$err" == *NoSuchEntity* ]]; then
    echo "absent"
    return 0
  fi
  echo "ERROR: could not read whether ${1} has a console login profile:" >&2
  printf '%s\n' "$err" | sed 's/^/         /' >&2
  return 1
}

# iam_dev_tester_state <name>
# Sets IAM_DEV_TESTER_STATE to absent, ours, legacy or foreign, and
# IAM_DEV_TESTER_FOUND_PATH. Ownership is proved from the path and all three
# tags together, because any one of them could be a coincidence and the set is
# what only these scripts write. "legacy" is the same proof against the earlier
# names, a user of ours that a re-onboarding moves; everything else is foreign.
# Returns 1, having said why on stderr, when any of them could not be read.
#
# Each read carries its own `|| return 1`. A caller writes this function under
# `||`, and inside it errexit is then off, so a failed read would otherwise run
# on as an empty answer; and a read made inside `[[ ]]` never reports failure.
iam_dev_tester_state() {
  local name="$1" project managed_by dev_tester_role legacy_role
  IAM_DEV_TESTER_FOUND_PATH="$(iam_dev_tester_path "$name")" || return 1
  if [[ -z "$IAM_DEV_TESTER_FOUND_PATH" ]]; then
    IAM_DEV_TESTER_STATE="absent"
    return 0
  fi
  project="$(iam_dev_tester_tag "$name" Project)" || return 1
  managed_by="$(iam_dev_tester_tag "$name" ManagedBy)" || return 1
  dev_tester_role="$(iam_dev_tester_tag "$name" DevTesterRole)" || return 1
  if [[ "$IAM_DEV_TESTER_FOUND_PATH" == "$IAM_DEV_TESTER_PATH" \
        && "$project" == "$IAM_DEV_TESTER_TAG_PROJECT" \
        && "$managed_by" == "$IAM_DEV_TESTER_TAG_MANAGED_BY" \
        && "$dev_tester_role" == "$IAM_DEV_TESTER_TAG_ROLE" ]]; then
    IAM_DEV_TESTER_STATE="ours"
    return 0
  fi
  legacy_role="$(iam_dev_tester_tag "$name" "$IAM_DEV_TESTER_LEGACY_ROLE_KEY")" || return 1
  # Either path: a move that stopped after the path changed and before the tags
  # did is finished by the next run rather than refused as somebody else's.
  if [[ ( "$IAM_DEV_TESTER_FOUND_PATH" == "$IAM_DEV_TESTER_LEGACY_PATH" \
          || "$IAM_DEV_TESTER_FOUND_PATH" == "$IAM_DEV_TESTER_PATH" ) \
        && "$project" == "$IAM_DEV_TESTER_TAG_PROJECT" \
        && "$managed_by" == "$IAM_DEV_TESTER_LEGACY_MANAGED_BY" \
        && "$legacy_role" == "$IAM_DEV_TESTER_TAG_ROLE" \
        && -z "$dev_tester_role" ]]; then
    IAM_DEV_TESTER_STATE="legacy"
  else
    IAM_DEV_TESTER_STATE="foreign"
  fi
  return 0
}

# iam_dev_tester_adopt_legacy <name>
# Moves a legacy user of ours to the current path and rewrites its tags, then
# reads it back as ours. The user keeps its unique id, its keys and its inline
# grant; only its ARN changes, which is what the role's trust matches on. The
# caller has already proved the user legacy and confirmed the run.
iam_dev_tester_adopt_legacy() {
  local name="$1"
  _iam_dev_tester_refuse_reserved "$name" || return 1
  echo "==> Moving ${name} from ${IAM_DEV_TESTER_LEGACY_PATH} to ${IAM_DEV_TESTER_PATH}"
  "$IAM_DEV_TESTER_AWS_BIN" iam update-user --user-name "$name" \
    --new-path "$IAM_DEV_TESTER_PATH" >/dev/null || {
    echo "ERROR: could not move the IAM user ${name}." >&2
    return 1
  }
  "$IAM_DEV_TESTER_AWS_BIN" iam tag-user --user-name "$name" \
    --tags "Key=ManagedBy,Value=${IAM_DEV_TESTER_TAG_MANAGED_BY}" \
           "Key=DevTesterRole,Value=${IAM_DEV_TESTER_TAG_ROLE}" >/dev/null || {
    echo "ERROR: could not rewrite ${name}'s ownership tags." >&2
    return 1
  }
  "$IAM_DEV_TESTER_AWS_BIN" iam untag-user --user-name "$name" \
    --tag-keys "$IAM_DEV_TESTER_LEGACY_ROLE_KEY" >/dev/null || {
    echo "ERROR: could not remove ${name}'s ${IAM_DEV_TESTER_LEGACY_ROLE_KEY} tag." >&2
    return 1
  }
  iam_dev_tester_state "$name" || return 1
  if [[ "$IAM_DEV_TESTER_STATE" != "ours" ]]; then
    echo "ERROR: ${name} reads back as ${IAM_DEV_TESTER_STATE} after the move, not as one of ours." >&2
    return 1
  fi
  echo "    now at ${IAM_DEV_TESTER_PATH} with the current ownership tags"
  return 0
}

# iam_dev_tester_refuse_foreign <name>
# The refusal every caller gives for a user of the name that is not one of ours.
iam_dev_tester_refuse_foreign() {
  local name="$1"
  echo "REFUSING: an IAM user named ${name} already exists and is not one" >&2
  echo "          of ours: it sits at ${IAM_DEV_TESTER_FOUND_PATH} and does not carry the" >&2
  echo "          full set of ownership tags this script writes." >&2
  echo "" >&2
  echo "          Granting it the job role would hand somebody else's identity" >&2
  echo "          access to this project. Pick a different dev-tester name, or" >&2
  echo "          establish what that user is for before going further." >&2
  echo "          Nothing done." >&2
}

# ── Writes ───────────────────────────────────────────────────────────────────

# iam_dev_tester_ensure <name> <exists:0|1> <role-arn>
# Creates the user when absent, grants the one statement, asserts there is no
# console login, and retires every key the user already holds, an active one
# included: a key that has been lost is still active until something retires
# it. The caller has already proved an existing user is ours and confirmed the
# run with the operator; this function only acts.
iam_dev_tester_ensure() {
  local name="$1" exists="$2" role_arn="$3"
  _iam_dev_tester_refuse_reserved "$name" || return 1
  IAM_DEV_TESTER_TARGET="$name"

  if (( ! exists )); then
    echo "==> Creating the IAM user"
    "$IAM_DEV_TESTER_AWS_BIN" iam create-user --user-name "$name" --path "$IAM_DEV_TESTER_PATH" \
      --tags "Key=Project,Value=${IAM_DEV_TESTER_TAG_PROJECT}" \
             "Key=ManagedBy,Value=${IAM_DEV_TESTER_TAG_MANAGED_BY}" \
             "Key=DevTesterRole,Value=${IAM_DEV_TESTER_TAG_ROLE}" >/dev/null || {
      echo "ERROR: could not create the IAM user ${name}." >&2
      return 1
    }
    IAM_DEV_TESTER_CREATED_USER=1
    echo "    created under ${IAM_DEV_TESTER_PATH}"
  fi

  echo "==> Granting the one statement this identity carries"
  # Read first, so the undo removes the grant only when this run added it. A
  # re-run over a live identity rewrites a grant that already existed, and a
  # failure after that must leave the person holding what they held before.
  local policy_before
  policy_before="$(iam_dev_tester_policy_state "$name")" || return 1
  local policy_document
  policy_document="$(printf '%s' \
    "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"${IAM_DEV_TESTER_POLICY_NAME}\"," \
    "\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\"," \
    "\"Resource\":\"${role_arn}\"}]}")"
  "$IAM_DEV_TESTER_AWS_BIN" iam put-user-policy --user-name "$name" \
    --policy-name "$IAM_DEV_TESTER_POLICY_NAME" \
    --policy-document "$policy_document" >/dev/null || {
    echo "ERROR: could not attach ${IAM_DEV_TESTER_POLICY_NAME} to ${name}." >&2
    return 1
  }
  [[ "$policy_before" == "absent" ]] && IAM_DEV_TESTER_CREATED_POLICY=1
  echo "    ${IAM_DEV_TESTER_POLICY_NAME}: sts:AssumeRole on ${role_arn}"

  # Asserted rather than assumed. Nothing above creates one, but a login profile
  # arriving by any other route turns this identity into a console sign-in with
  # no second factor, which is the shape this model exists to avoid.
  local login_profile
  login_profile="$(iam_dev_tester_login_profile_state "$name")" || return 1
  if [[ "$login_profile" == "present" ]]; then
    echo "ERROR: ${name} has a console login profile." >&2
    echo "       These identities sign API calls and have no console sign-in by" >&2
    echo "       design. Something else created it. Remove it and re-run." >&2
    return 1
  fi
  echo "    login profile: none, as intended"

  # A re-issue mints a NEW key; it never reactivates a retired one. Allowed to
  # take the last one: a fresh key is minted immediately after, and the
  # account's two-key limit would otherwise refuse an ordinary re-issue.
  local _id _status _rest _keys
  _keys="$(iam_dev_tester_keys "$name")" || return 1
  while IFS=$'\t' read -r _id _status _rest; do
    [[ -z "$_id" ]] && continue
    if [[ "$_status" == "Active" ]]; then
      echo "==> Retiring the key being replaced: ${_id}"
      IAM_KEY_ALLOW_LAST=1 iam_key_retire "$name" "$_id" deactivate || return 1
    else
      echo "==> Clearing a retired key that is in the way: ${_id}"
    fi
    IAM_KEY_ALLOW_LAST=1 iam_key_retire "$name" "$_id" delete || return 1
  done <<< "$_keys"
  return 0
}

# iam_dev_tester_undo
# Removes the grant and the user this run created, and nothing that pre-dated
# it. Idempotent, because a trapped INT does not terminate bash and the handler
# can run twice.
iam_dev_tester_undo() {
  local name="$IAM_DEV_TESTER_TARGET"
  [[ -z "$name" ]] && return 0
  _iam_dev_tester_refuse_reserved "$name" >/dev/null 2>&1 || return 0
  if (( IAM_DEV_TESTER_CREATED_POLICY )); then
    echo "Removing the ${IAM_DEV_TESTER_POLICY_NAME} policy this run attached." >&2
    "$IAM_DEV_TESTER_AWS_BIN" iam delete-user-policy --user-name "$name" \
      --policy-name "$IAM_DEV_TESTER_POLICY_NAME" >/dev/null 2>&1 || true
  fi
  if (( IAM_DEV_TESTER_CREATED_USER )); then
    echo "Deleting the IAM user this run created: ${name}." >&2
    "$IAM_DEV_TESTER_AWS_BIN" iam delete-user --user-name "$name" >/dev/null 2>&1 || true
  else
    echo "The IAM user ${name} pre-dated this run and is NOT being deleted." >&2
    echo "Re-running is safe." >&2
  fi
  IAM_DEV_TESTER_CREATED_USER=0
  IAM_DEV_TESTER_CREATED_POLICY=0
  IAM_DEV_TESTER_TARGET=""
  return 0
}
