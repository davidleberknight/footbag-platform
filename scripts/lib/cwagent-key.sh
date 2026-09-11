#!/usr/bin/env bash
# cwagent-key.sh — the CloudWatch agent publisher key, minted and disposed of by
# the installer rather than by an operator holding three steps in their head.
#
# The agent authenticates with a long-lived IAM access key because a Lightsail
# instance carries no instance role and the agent does not follow the
# source-profile chain. Somebody therefore has to mint a credential, record it,
# and install it, and the previous shape of that was three hand-typed commands
# around the installer: create the key into a temp file, remember to vault it
# BEFORE installing rather than after, remember to shred the file afterwards. A
# forgotten shred leaves a live secret readable by every co-tenant of the
# workstation, and a forgotten vault entry means the credential exists in the
# estate and nowhere in the record. Both failures are silent.
#
# So the whole lifecycle lives here, on a trap:
#
#   - Refuse before minting anything if there is no terminal to show the secret
#     on. A credential nobody can read is not a failed run, it is a live
#     credential needing cleanup.
#   - Refuse to mint a second key by accident. Two live keys is the shape of a
#     rotation, which is deliberate, so it takes --rotate to get there.
#   - Emit the secret to the terminal device only, never to stdout, which a
#     wrapper, a CI job or an agent session may be capturing.
#   - Require the vault entry to be recorded BEFORE the key is installed
#     anywhere, which is the vault's own rule, enforced here by a typed
#     confirmation rather than remembered.
#   - Delete the key it just minted if anything after that fails or the operator
#     declines. Nothing this file creates outlives a run that did not finish.
#
# The secret never touches disk and never enters any argv: it lives in a shell
# variable and leaves over the ssh stdin pipe the installer already uses. The
# access key id does appear in argv on the delete path, which is correct, since
# the id is an identifier rather than a credential.
#
# Confirmation is read from /dev/tty, never stdin: under the credential-pipe
# pattern stdin carries the sudo password, and a read against it would consume
# that password as the answer.

# Test seam (CI only; operators never set this): replaces the aws CLI. A run
# using it says so, because a stubbed key is not a key.
CWAGENT_KEY_AWS_BIN="${CWAGENT_KEY_AWS_BIN:-aws}"

# Set by cwagent_key_provision, read by the trap.
CWAGENT_AKID=""
CWAGENT_SAK=""
CWAGENT_KEY_USER=""
CWAGENT_KEY_AWS_ARGS=()

# How far the credential has travelled, which is what decides whether an
# unfinished run may delete it. The distinction is load-bearing: a key that
# nobody has heard of can be withdrawn silently and correctly, and a key that
# has been written into the vault cannot, because deleting it turns the record
# into a lie about the estate. Withdrawing one that had already been vaulted and
# shipped is a real failure mode; it leaves a dead credential on the host and a
# vault entry pointing at a key that no longer exists.
#
#   none      nothing minted
#   minted    exists in the account, recorded nowhere, shipped nowhere
#   vaulted   the operator has recorded it, so it is no longer ours to withdraw
#   installed delivered and working
CWAGENT_KEY_STATE="none"

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
cwagent_key_cleanup() {
  case "$CWAGENT_KEY_STATE" in
    minted)
      echo "" >&2
      echo "The run stopped before the key was recorded anywhere, so the access" >&2
      echo "key minted for ${CWAGENT_KEY_USER} is being deleted: ${CWAGENT_AKID}." >&2
      if "$CWAGENT_KEY_AWS_BIN" iam delete-access-key \
        --user-name "$CWAGENT_KEY_USER" \
        --access-key-id "$CWAGENT_AKID" \
        ${CWAGENT_KEY_AWS_ARGS[@]+"${CWAGENT_KEY_AWS_ARGS[@]}"} 2>/dev/null; then
        echo "Deleted. Nothing was left behind." >&2
      else
        echo "COULD NOT DELETE IT. Remove it by hand before doing anything else:" >&2
        echo "  aws iam delete-access-key --user-name ${CWAGENT_KEY_USER} \\" >&2
        echo "    --access-key-id ${CWAGENT_AKID}" >&2
      fi
      ;;
    vaulted)
      echo "" >&2
      echo "The install did not finish, and the key is NOT being deleted:" >&2
      echo "  ${CWAGENT_AKID}" >&2
      echo "You have already recorded it in the vault, and it may have reached" >&2
      echo "the host, so withdrawing it here would leave the vault describing a" >&2
      echo "key that does not exist and the host holding one that does not work." >&2
      echo "" >&2
      echo "Re-running this script is safe: it is idempotent, and it will refuse" >&2
      echo "to mint a second key while this one exists, so use --rotate to try" >&2
      echo "again with a fresh credential, or delete this key by hand and remove" >&2
      echo "its vault entry if you are abandoning the install." >&2
      ;;
  esac
  # Both branches above have now had their say, and neither is true a second time:
  # the minted key has been deleted or reported unremovable, and the vaulted one
  # has been reported as kept. "none" matches no branch, so a second pass is
  # silent. This is not a claim that nothing was minted; it is the record that
  # cleanup has already happened.
  CWAGENT_KEY_STATE="none"
  CWAGENT_SAK=""
}

# Call once the credential is delivered and the agent is running.
cwagent_key_commit() {
  CWAGENT_KEY_STATE="installed"
}

# cwagent_key_provision <iam-user> <vault-entry-title> <rotate:0|1>
#
# Leaves the credential in CWAGENT_AKID and CWAGENT_SAK. Arms nothing: the
# caller installs the trap, because the trap has to cover the caller's later
# steps as well.
cwagent_key_provision() {
  local user="$1" vault_entry="$2" rotate="$3"
  CWAGENT_KEY_USER="$user"

  if [[ "$CWAGENT_KEY_AWS_BIN" != "aws" ]]; then
    echo "SYNTHETIC: aws='${CWAGENT_KEY_AWS_BIN}' -- no real credential is involved." >&2
  fi

  # What already exists is read first, because "you already have a key" is a
  # more useful answer than a complaint about terminals, and the read is
  # harmless. Minting still cannot happen before the terminal check below.
  local existing
  existing="$("$CWAGENT_KEY_AWS_BIN" iam list-access-keys --user-name "$user" \
    ${CWAGENT_KEY_AWS_ARGS[@]+"${CWAGENT_KEY_AWS_ARGS[@]}"} \
    --query 'length(AccessKeyMetadata)' --output text)" || {
    echo "ERROR: cannot read the access keys of ${user}." >&2
    echo "       Check the profile, and that terraform has been applied for this" >&2
    echo "       environment: the publisher user is declared there." >&2
    return 1
  }

  if [[ "$existing" != "0" && "$rotate" != "1" ]]; then
    echo "REFUSING: ${user} already holds ${existing} access key(s)." >&2
    echo "" >&2
    echo "If the agent is already installed and publishing, there is nothing to" >&2
    echo "do here. If you are replacing the key, that is a rotation: re-run with" >&2
    echo "--rotate, which mints a second key alongside the first, installs it," >&2
    echo "and leaves the old one active so metrics never stop. Deactivate and" >&2
    echo "delete the old key only after the verification script passes." >&2
    return 1
  fi

  if [[ "$rotate" == "1" && "$existing" == "2" ]]; then
    echo "REFUSING: ${user} already holds two access keys, which is the IAM" >&2
    echo "limit, so a rotation cannot mint a third. Delete the older key first." >&2
    return 1
  fi

  # Checked before minting rather than before printing. A secret that exists and
  # cannot be shown has already done the damage: it is live in the account and
  # recorded nowhere.
  if [[ ! -t 1 || ! -t 2 ]] || ! { true >/dev/tty; } 2>/dev/null; then
    echo "ERROR: no terminal to show the new access key on." >&2
    echo "       The secret is displayed once and must not land in a captured" >&2
    echo "       stream. Re-run from an interactive shell." >&2
    echo "       Nothing has been created." >&2
    return 1
  fi

  echo "==> Minting an access key for ${user}"
  local key_line
  key_line="$("$CWAGENT_KEY_AWS_BIN" iam create-access-key --user-name "$user" \
    ${CWAGENT_KEY_AWS_ARGS[@]+"${CWAGENT_KEY_AWS_ARGS[@]}"} \
    --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)" || {
    echo "ERROR: could not create an access key for ${user}." >&2
    return 1
  }

  # Parameter expansion rather than a pipeline or a here-string, so the secret
  # never reaches another process and no temp file is involved.
  CWAGENT_AKID="${key_line%%$'\t'*}"
  CWAGENT_SAK="${key_line##*$'\t'}"
  if [[ -z "$CWAGENT_AKID" || -z "$CWAGENT_SAK" || "$CWAGENT_AKID" == "$CWAGENT_SAK" ]]; then
    echo "ERROR: could not read the new key out of the IAM response." >&2
    return 1
  fi
  CWAGENT_KEY_STATE="minted"

  {
    echo ""
    echo "Record this in the credential vault NOW, before the install continues."
    echo "The vault is never the last place to learn that a credential exists,"
    echo "and this secret is shown once."
    echo ""
    echo "  Title:     ${vault_entry}"
    echo "  Username:  ${user}"
    echo "  Password:  ${CWAGENT_SAK}"
    echo "  Notes:     Access key id ${CWAGENT_AKID}."
    echo "             Long-lived IAM access key for the CloudWatch agent, which"
    echo "             runs in on-premises mode because a Lightsail host has no"
    echo "             instance role and the agent does not follow the"
    echo "             source-profile chain. Installed at"
    echo "             /etc/amazon-cloudwatch-agent.aws/credentials, root-owned,"
    echo "             mode 0600. Sensitivity: narrow-service."
    echo "             Rotation: re-run the installer with --rotate, confirm"
    echo "             metrics flow, then deactivate and delete the older key."
    echo ""
    echo "Remember the vault's own rules: bump the version number in the file"
    echo "name and in the version line, add a change note, then publish."
    echo ""
  } > /dev/tty

  local answer=""
  printf 'Type VAULTED once it is recorded, or anything else to abandon it: ' > /dev/tty
  read -r answer < /dev/tty || answer=""
  if [[ "$answer" != "VAULTED" ]]; then
    echo "Not vaulted, so the key is being withdrawn rather than installed." >&2
    return 1
  fi

  # From here the credential is written down somewhere this script cannot edit,
  # so it stops being ours to withdraw. Everything after this point reports and
  # leaves the key alone.
  CWAGENT_KEY_STATE="vaulted"
  return 0
}
