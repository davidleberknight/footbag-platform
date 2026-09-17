#!/usr/bin/env bash
# shellcheck shell=bash
# iam-access-key.sh — the whole life of a long-lived IAM access key, owned by a
# script rather than by an operator holding three steps in their head.
#
# Several identities in this estate authenticate with long-lived access keys,
# because a Lightsail instance carries no instance role: the monitoring agent's
# publisher user, each environment's source-profile user, and the human operator
# identity. Somebody therefore has to mint a credential, record it, install it,
# and later retire its predecessor. The previous shape of that was hand-typed
# commands around an installer: create the key into a temp file, remember to
# vault it BEFORE installing rather than after, remember to shred the file, and
# later remember to come back and cut the old key. A forgotten shred leaves a
# live secret readable by every co-tenant of the workstation, a forgotten vault
# entry means the credential exists in the estate and nowhere in the record, and
# a forgotten retirement means a rotation that ends with two live keys and
# retires nothing. All three failures are silent.
#
# So the whole lifecycle lives here, on a trap:
#
#   - Refuse before minting anything if there is no terminal to show the secret
#     on. A credential nobody can read is not a failed run, it is a live
#     credential needing cleanup.
#   - Refuse to mint a second key by accident. Two live keys is the shape of a
#     rotation, which is deliberate, so it takes a rotation flag to get there.
#   - Emit the secret to the terminal device only, never to stdout, which a
#     wrapper, a CI job or an agent session may be capturing.
#   - Require the vault entry to be recorded BEFORE the key is installed
#     anywhere, which is the vault's own rule, enforced here by a typed
#     confirmation rather than remembered.
#   - Delete the key it just minted if anything after that fails or the operator
#     declines. Nothing this file creates outlives a run that did not finish.
#   - Retire a predecessor only in the documented order, and only when what
#     remains can still authenticate.
#
# The secret never touches disk and never enters any argv: it lives in a shell
# variable and leaves over whatever stdin pipe the caller already uses. An access
# key id does appear in argv on the deactivate and delete paths, which is
# correct, since the id is an identifier rather than a credential.
#
# Confirmation is read from /dev/tty, never stdin: under the credential-pipe
# pattern stdin carries the sudo password, and a read against it would consume
# that password as the answer.

IAM_KEY_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=terminal.sh
source "${IAM_KEY_LIB_DIR}/terminal.sh"

# Test seam (CI only; operators never set this): replaces the aws CLI. A run
# using it says so, because a stubbed key is not a key.
IAM_KEY_AWS_BIN="${IAM_KEY_AWS_BIN:-aws}"

# Set by iam_key_provision, read by the trap.
IAM_KEY_AKID=""
IAM_KEY_SAK=""
IAM_KEY_USER=""
IAM_KEY_AWS_ARGS=()

# The caller's description of what this credential is for, printed into the
# vault block under Notes. Each line is indented to sit under the label, so the
# caller supplies bare sentences. A caller that sets nothing gets a vault entry
# that says only what the key is called, which is a record nobody can act on.
IAM_KEY_VAULT_NOTES=""

# How far the credential has travelled, which is what decides whether an
# unfinished run may delete it. The distinction is load-bearing: a key that
# nobody has heard of can be withdrawn silently and correctly, and a key that
# has been written into the vault cannot, because deleting it turns the record
# into a lie about the estate. Withdrawing one that had already been vaulted and
# shipped is a real failure mode; it leaves a dead credential in service and a
# vault entry pointing at a key that no longer exists.
#
#   none      nothing minted
#   minted    exists in the account, recorded nowhere, shipped nowhere
#   vaulted   the operator has recorded it, so it is no longer ours to withdraw
#   installed delivered and working
IAM_KEY_STATE="none"

# Trap body. Safe to install before anything is minted: in the "none" state it
# does nothing, so a failure during the preconditions says nothing about a
# credential that was never created.
#
# Idempotent, and it has to be: the callers install it on EXIT, INT and TERM, and
# a trapped INT does not terminate bash. The handler runs, the script resumes, the
# next command fails under `set -e`, and the EXIT handler runs the same branch a
# second time. That second pass cannot delete an already-deleted key, so it used
# to print "COULD NOT DELETE IT. Remove it by hand" about a key that was gone, at
# the moment the operator is least able to judge it. The state reset at the end is
# what makes each branch report exactly once.
iam_key_cleanup() {
  case "$IAM_KEY_STATE" in
    minted)
      echo "" >&2
      echo "The run stopped before the key was recorded anywhere, so the access" >&2
      echo "key minted for ${IAM_KEY_USER} is being deleted: ${IAM_KEY_AKID}." >&2
      if "$IAM_KEY_AWS_BIN" iam delete-access-key \
        --user-name "$IAM_KEY_USER" \
        --access-key-id "$IAM_KEY_AKID" \
        ${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"} 2>/dev/null; then
        echo "Deleted. Nothing was left behind." >&2
      else
        echo "COULD NOT DELETE IT. Remove it by hand before doing anything else:" >&2
        echo "  aws iam delete-access-key --user-name ${IAM_KEY_USER} \\" >&2
        echo "    --access-key-id ${IAM_KEY_AKID}" >&2
      fi
      ;;
    vaulted)
      echo "" >&2
      echo "The run did not finish, and the key is NOT being deleted:" >&2
      echo "  ${IAM_KEY_AKID}" >&2
      echo "You have already recorded it in the vault, and it may have reached" >&2
      echo "its destination, so withdrawing it here would leave the vault" >&2
      echo "describing a key that does not exist and a service holding one that" >&2
      echo "does not work." >&2
      echo "" >&2
      echo "Re-running is safe: it is idempotent, and it will refuse to mint a" >&2
      echo "second key while this one exists, so rotate to try again with a fresh" >&2
      echo "credential, or delete this key by hand and remove its vault entry if" >&2
      echo "you are abandoning the operation." >&2
      ;;
  esac
  # Both branches above have now had their say, and neither is true a second time:
  # the minted key has been deleted or reported unremovable, and the vaulted one
  # has been reported as kept. "none" matches no branch, so a second pass is
  # silent. This is not a claim that nothing was minted; it is the record that
  # cleanup has already happened.
  IAM_KEY_STATE="none"
  IAM_KEY_SAK=""
}

# Call once the credential is delivered and working.
iam_key_commit() {
  IAM_KEY_STATE="installed"
}

# iam_key_provision <iam-user> <vault-entry-title> <rotate:0|1>
#
# Leaves the credential in IAM_KEY_AKID and IAM_KEY_SAK. Arms nothing: the
# caller installs the trap, because the trap has to cover the caller's later
# steps as well.
iam_key_provision() {
  local user="$1" vault_entry="$2" rotate="$3"
  IAM_KEY_USER="$user"

  if [[ "$IAM_KEY_AWS_BIN" != "aws" ]]; then
    echo "SYNTHETIC: aws='${IAM_KEY_AWS_BIN}' -- no real credential is involved." >&2
  fi

  # What already exists is read first, because "you already have a key" is a
  # more useful answer than a complaint about terminals, and the read is
  # harmless. Minting still cannot happen before the terminal check below.
  local existing
  existing="$("$IAM_KEY_AWS_BIN" iam list-access-keys --user-name "$user" \
    ${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"} \
    --query 'length(AccessKeyMetadata)' --output text)" || {
    echo "ERROR: cannot read the access keys of ${user}." >&2
    echo "       Check the profile, and that the user exists: several of these" >&2
    echo "       identities are declared in terraform and do not exist until it" >&2
    echo "       has been applied for that environment." >&2
    return 1
  }

  if [[ "$existing" != "0" && "$rotate" != "1" ]]; then
    echo "REFUSING: ${user} already holds ${existing} access key(s)." >&2
    echo "" >&2
    echo "If the credential is already in service there is nothing to do here." >&2
    echo "If you are replacing it, that is a rotation: re-run with the rotation" >&2
    echo "flag, which mints a second key alongside the first and leaves the old" >&2
    echo "one active so nothing stops. Retire the old key only after the new one" >&2
    echo "has been verified in service." >&2
    return 1
  fi

  if [[ "$rotate" == "1" && "$existing" == "2" ]]; then
    echo "REFUSING: ${user} already holds two access keys, which is the IAM" >&2
    echo "limit, so a rotation cannot mint a third. Retire the older key first." >&2
    return 1
  fi

  # Checked before minting rather than before printing. A secret that exists and
  # cannot be shown has already done the damage: it is live in the account and
  # recorded nowhere.
  if ! terminal_present; then
    echo "ERROR: no terminal to show the new access key on." >&2
    echo "       The secret is displayed once and must not land in a captured" >&2
    echo "       stream. Re-run from an interactive shell." >&2
    echo "       Nothing has been created." >&2
    return 1
  fi

  echo "==> Minting an access key for ${user}"
  local key_line
  key_line="$("$IAM_KEY_AWS_BIN" iam create-access-key --user-name "$user" \
    ${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"} \
    --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)" || {
    echo "ERROR: could not create an access key for ${user}." >&2
    return 1
  }

  # Parameter expansion rather than a pipeline or a here-string, so the secret
  # never reaches another process and no temp file is involved.
  IAM_KEY_AKID="${key_line%%$'\t'*}"
  IAM_KEY_SAK="${key_line##*$'\t'}"
  if [[ -z "$IAM_KEY_AKID" || -z "$IAM_KEY_SAK" || "$IAM_KEY_AKID" == "$IAM_KEY_SAK" ]]; then
    echo "ERROR: could not read the new key out of the IAM response." >&2
    return 1
  fi
  IAM_KEY_STATE="minted"

  {
    echo ""
    echo "Record this in the credential vault NOW, before anything else continues."
    echo "The vault is never the last place to learn that a credential exists,"
    echo "and this secret is shown once."
    echo ""
    echo "  Title:     ${vault_entry}"
    echo "  Username:  ${user}"
    echo "  Password:  ${IAM_KEY_SAK}"
    echo "  Notes:     Access key id ${IAM_KEY_AKID}."
    if [[ -n "$IAM_KEY_VAULT_NOTES" ]]; then
      printf '%s\n' "$IAM_KEY_VAULT_NOTES" | sed 's/^/             /'
    fi
    echo ""
    echo "Remember the vault's own rules: bump the version number in the file"
    echo "name and in the version line, add a change note, then publish."
    echo ""
  } > /dev/tty

  local answer=""
  printf 'Type VAULTED once it is recorded, or anything else to abandon it: ' > /dev/tty
  read -r answer < /dev/tty || answer=""
  if [[ "$answer" != "VAULTED" ]]; then
    echo "Not vaulted, so the key is being withdrawn rather than kept." >&2
    return 1
  fi

  # From here the credential is written down somewhere this script cannot edit,
  # so it stops being ours to withdraw. Everything after this point reports and
  # leaves the key alone.
  IAM_KEY_STATE="vaulted"
  return 0
}

# iam_key_retire <iam-user> <access-key-id> <deactivate|delete>
#
# The half that was missing, and whose absence is why a documented rotation
# could end with two live keys and retire nothing.
#
# The order is not a preference. Deactivating is reversible and proves nothing
# depends on the key any more; deleting is not reversible and an access key id
# cannot be reissued. So a delete is refused unless the key is already inactive,
# which turns the documented "deactivate, observe, delete" sequence into
# something the tool enforces rather than something the operator remembers.
iam_key_retire() {
  local user="$1" akid="$2" mode="$3"

  if [[ "$IAM_KEY_AWS_BIN" != "aws" ]]; then
    echo "SYNTHETIC: aws='${IAM_KEY_AWS_BIN}' -- no real key is being changed." >&2
  fi

  # Read the whole key list once: it answers ownership, count and status, and
  # each of those is a refusal this function owes the operator.
  local listing
  listing="$("$IAM_KEY_AWS_BIN" iam list-access-keys --user-name "$user" \
    ${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"} \
    --query 'AccessKeyMetadata[].[AccessKeyId,Status]' --output text)" || {
    echo "ERROR: cannot read the access keys of ${user}." >&2
    return 1
  }

  local status
  status="$(printf '%s\n' "$listing" | grep -F "$akid" | cut -f2)"
  if [[ -z "$status" ]]; then
    echo "REFUSING: ${akid} is not a key of ${user}." >&2
    echo "       Retiring a key belonging to another identity is how a rotation" >&2
    echo "       takes down something it was never meant to touch. Nothing done." >&2
    return 1
  fi

  # ACTIVE keys, not keys. Counting rows made a user holding one Active key and
  # one Inactive one look safe to retire from, because the count was two -- and
  # deactivating the Active one then left the identity with nothing that can
  # authenticate, which is the exact outcome this guard exists to prevent. An
  # inactive key is not a way in.
  #
  # The key being retired is excluded from the count, so what is measured is
  # what would REMAIN. On a delete that is the same question; on a deactivate
  # the key being cut is by definition no longer usable afterwards.
  local remaining_active
  remaining_active="$(printf '%s\n' "$listing" \
    | grep -v -F "$akid" \
    | awk -F'\t' '$2 == "Active"' \
    | grep -c . || true)"
  if [[ "$remaining_active" -lt 1 ]]; then
    echo "REFUSING: retiring ${akid} would leave ${user} with no active key." >&2
    echo "       The identity would have no way to authenticate at all. An" >&2
    echo "       inactive key left on the user is not a way back in." >&2
    echo "       Mint and verify the replacement first. Nothing done." >&2
    echo "" >&2
    echo "       ${user} currently holds:" >&2
    printf '%s\n' "$listing" | sed 's/^/         /' >&2
    return 1
  fi

  case "$mode" in
    deactivate)
      if [[ "$status" == "Inactive" ]]; then
        echo "==> ${akid} is already inactive; nothing to do."
        return 0
      fi
      echo "==> Deactivating ${akid} on ${user}"
      "$IAM_KEY_AWS_BIN" iam update-access-key --user-name "$user" \
        --access-key-id "$akid" --status Inactive \
        ${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"} || {
        echo "ERROR: could not deactivate ${akid}." >&2
        return 1
      }
      ;;
    delete)
      if [[ "$status" != "Inactive" ]]; then
        echo "REFUSING: ${akid} is still active." >&2
        echo "       Deactivate it first and give whatever uses it time to fail" >&2
        echo "       visibly. A deactivated key can be turned back on; a deleted" >&2
        echo "       one cannot, and its id is never reissued. Nothing done." >&2
        return 1
      fi
      echo "==> Deleting ${akid} on ${user}"
      "$IAM_KEY_AWS_BIN" iam delete-access-key --user-name "$user" \
        --access-key-id "$akid" \
        ${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"} || {
        echo "ERROR: could not delete ${akid}." >&2
        return 1
      }
      ;;
    *)
      echo "ERROR: iam_key_retire mode must be 'deactivate' or 'delete'." >&2
      return 1
      ;;
  esac

  # The outcome, not the invocation: a zero exit from the AWS CLI is not the key
  # having changed state. Read it back.
  local after
  after="$("$IAM_KEY_AWS_BIN" iam list-access-keys --user-name "$user" \
    ${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"} \
    --query 'AccessKeyMetadata[].[AccessKeyId,Status]' --output text)" || {
    echo "ERROR: could not re-read the key list to confirm the change." >&2
    return 1
  }
  echo "    ${user} now holds:"
  printf '%s\n' "$after" | sed 's/^/      /'
  return 0
}
