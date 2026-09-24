# shellcheck shell=bash
#
# Which credential file a run reads, and nothing else.
#
# Four files, and each holds one credential permanently. Two for the shared
# account's sudo password, one per environment, and two for the sudo password of
# the named account belonging to the person at the keyboard:
#
#   ~/AWS/AWS_OPERATOR.txt              shared account, staging
#   ~/AWS/AWS_OPERATOR_PRODUCTION.txt   shared account, production
#   ~/AWS/HOST_OPERATOR.txt             your own account, staging
#   ~/AWS/HOST_OPERATOR_PRODUCTION.txt  your own account, production
#
# No file ever holds a different password at a different time, and that is the
# whole rule. A file whose meaning depends on when you look at it gives an
# operator nothing to check: the wrong password in the right file arrives as a
# sudo failure on the host, which reads as a broken account or a mistyped
# password and is neither, and nothing on the workstation says which credential
# the file is carrying today.
#
# Nothing selects between them by hand. The account the alias connects as is the
# selector, and the credential follows it. By default that is the shared account;
# a command run through scripts/as-dev-tester.sh --account <name> connects as the
# named account through the Match block onboarding writes, and the credential
# follows that too. No flag here chooses, and nothing has to be set up again in
# a new shell.
#
# This is its own file rather than part of the wire library because the rule is
# needed by entry points that open no wire: the deploy, the persona check and the
# workstation report all resolve a credential and none of them wants the wire
# library's connection options, its terminal helpers or its unconditional
# assignment of the accept-without-asking flag.

# One run acts as one person. This half records which account the alias connects
# as; the half that resolves an AWS identity records who that turned out to be,
# and whichever of the two settles second compares them. Sourced here rather
# than in each caller because every host-touching run reaches this file, which
# is the same reason the credential rule itself lives here.
# shellcheck source=lib/operator-identity-agreement.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/operator-identity-agreement.sh"

# The shared account. Every other name is a person, and a person's sudo password
# is their own, which is the distinction the rule turns on.
OPERATOR_SHARED_ACCOUNT="footbag"

# Set by operator_credential_select, read by its callers. NAME is the bare file
# name, FILE the absolute path, DISPLAY the tilde form that is pasteable into a
# command, and ACCOUNT the name the alias connects as.
OPERATOR_CREDENTIAL_ACCOUNT=""
OPERATOR_CREDENTIAL_NAME=""
OPERATOR_CREDENTIAL_FILE=""
OPERATOR_CREDENTIAL_DISPLAY=""

# operator_credential_file_for <account> <target>
# The naming rule alone, asked about an account the caller already knows rather
# than one read off an alias.
#
# Two callers need the same rule from different directions. Most runs are asking
# "which file holds the password for whoever this alias connects as", which is
# the function below. The provisioner is asking "which file should hold the
# password this account has just been given", and at that moment the alias still
# connects as somebody else, because the account being created is the one that
# does not exist yet. Both must produce the same name for the same account and
# environment, so there is one rule and this is it.
operator_credential_file_for() {
  local account="$1" target="$2" pair suffix
  OPERATOR_CREDENTIAL_ACCOUNT=""
  OPERATOR_CREDENTIAL_NAME=""
  OPERATOR_CREDENTIAL_FILE=""
  OPERATOR_CREDENTIAL_DISPLAY=""

  case "$target" in
    staging) suffix="" ;;
    production) suffix="_PRODUCTION" ;;
    *)
      echo "ERROR: the credential rule needs 'staging' or 'production', not '${target}'." >&2
      return 1
      ;;
  esac

  if [[ -z "$account" ]]; then
    echo "ERROR: the credential rule needs an account name to choose a file." >&2
    return 1
  fi

  if [[ "$account" == "$OPERATOR_SHARED_ACCOUNT" ]]; then
    pair="AWS_OPERATOR"
  else
    pair="HOST_OPERATOR"
  fi
  OPERATOR_CREDENTIAL_ACCOUNT="$account"
  OPERATOR_CREDENTIAL_NAME="${pair}${suffix}.txt"
  OPERATOR_CREDENTIAL_FILE="${HOME}/AWS/${OPERATOR_CREDENTIAL_NAME}"
  OPERATOR_CREDENTIAL_DISPLAY="~/AWS/${OPERATOR_CREDENTIAL_NAME}"
  return 0
}

# operator_credential_select <alias> <target>
# Applies the rule above. Selects only: opening the file is the caller's, and
# for the callers that receive the password on stdin nobody opens it at all.
operator_credential_select() {
  local alias="$1" target="$2" user
  OPERATOR_CREDENTIAL_ACCOUNT=""
  OPERATOR_CREDENTIAL_NAME=""
  OPERATOR_CREDENTIAL_FILE=""
  OPERATOR_CREDENTIAL_DISPLAY=""

  # Refused before the alias is read, so a bad environment name fails on its own
  # terms rather than as a confusing lookup.
  case "$target" in
    staging|production) ;;
    *)
      echo "ERROR: the credential rule needs 'staging' or 'production', not '${target}'." >&2
      return 1
      ;;
  esac

  if ! command -v ssh >/dev/null 2>&1; then
    echo "ERROR: ssh is not installed, so the account '${alias}' connects as cannot be read." >&2
    echo "       That account is what picks the credential file, so nothing can be chosen." >&2
    return 1
  fi
  # `ssh -G` reports the effective configuration without opening a connection,
  # so this costs nothing and answers on a host that is down. It is also the
  # source require_ssh_alias reads, so the account and the hostname can never
  # come from two different places and disagree.
  user="$(ssh -G "$alias" 2>/dev/null | awk '/^user /{print $2}' | tail -1)"
  if [[ -z "$user" ]]; then
    echo "ERROR: could not read which account '${alias}' connects as." >&2
    echo "       'ssh -G ${alias}' printed no user line; check that ~/.ssh/config parses." >&2
    return 1
  fi

  # The naming rule itself, from the one place that holds it.
  operator_credential_file_for "$user" "$target" || return 1

  # The shared account is recorded like any other. It is a legitimate account to
  # connect as, and it is deliberately not exempt from the comparison: a run
  # acting on AWS as a named person while acting on the host as the shared
  # account is exactly the split that leaves one act recorded under two names.
  FOOTBAG_ACTING_ON_HOST_AS="$user"
  # Recorded and said out loud, never refused here: this function is a lookup,
  # and the workstation report calls it precisely to describe a machine whose
  # setup is half finished. The refusal belongs to the callers that are about to
  # act on the credential.
  operator_identity_agreement_record
  return 0
}

# operator_credential_mode_ok <path>
# A sudo password readable by anything but its owner has already been exposed,
# and narrowing the mode afterwards undoes none of it: whatever could read the
# file has read it. So the refusal says rotate rather than chmod. Unreadable
# mode is a refusal too, because the alternative is a check that passes by
# failing to look.
operator_credential_mode_ok() {
  local path="$1" mode
  mode="$(stat -c '%a' "$path" 2>/dev/null || stat -f '%Lp' "$path" 2>/dev/null || true)"
  case "$mode" in
    600|400) return 0 ;;
    "")
      echo "ERROR: could not read the file mode of ${path}." >&2
      echo "       A credential whose permissions cannot be checked is not treated as safe." >&2
      return 1
      ;;
  esac
  echo "ERROR: ${path} is mode ${mode}; an operator credential must be 600 or 400." >&2
  echo "       Narrowing it now does not undo the exposure, because whatever could read" >&2
  echo "       it already could. Rotate the password, then write the new one into a file" >&2
  echo "       created under 'umask 077'." >&2
  return 1
}

# require_operator_credential <alias> <target>
# For the scripts that open the credential file themselves rather than having it
# piped in. Refuses by name when the selected file is missing, and never reaches
# for the other pair: a silent fallback would run a named operator's work under
# the shared account's credential, and nothing afterwards would say so.
require_operator_credential() {
  local alias="$1" target="$2"
  operator_credential_select "$alias" "$target" || return 1
  if [[ ! -r "$OPERATOR_CREDENTIAL_FILE" ]]; then
    echo "ERROR: ${OPERATOR_CREDENTIAL_DISPLAY} is missing or unreadable." >&2
    echo "       '${alias}' connects as '${OPERATOR_CREDENTIAL_ACCOUNT}', whose sudo password" >&2
    echo "       lives in that one file. Nothing else is read in its place." >&2
    return 1
  fi
  operator_credential_mode_ok "$OPERATOR_CREDENTIAL_FILE" || return 1
  # This caller is about to open the credential and act, so a run naming two
  # different people stops here rather than shipping under one name and calling
  # AWS under another.
  operator_identity_agreement_require || return 1
  echo "credential: ${OPERATOR_CREDENTIAL_DISPLAY} ('${alias}' connects as '${OPERATOR_CREDENTIAL_ACCOUNT}')" >&2
  return 0
}
