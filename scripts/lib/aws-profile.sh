#!/usr/bin/env bash
# shellcheck shell=bash
# aws-profile.sh — supply the operator's AWS profile, so no operator has to.
#
# WHY THIS EXISTS.
#
# Everything in this tree that reaches AWS resolves its identity from the
# ambient SDK chain. An operator workstation carries exactly one named profile,
# written by scripts/install-operator-key.sh, and no [default] section for
# anything to fall back to. A fresh terminal therefore has no AWS identity at
# all, and the first command to need one fails with "Unable to locate
# credentials" or "no valid credential sources" — a message about the SDK, not
# about the operator's setup, which sends the reader looking at the wrong thing.
#
# The answer used to be a line in a runbook telling the operator to export
# AWS_PROFILE in every new shell. That is a step held in a person's head, it has
# to be repeated in every terminal they open, and it is recorded in the
# operations reference as a common cause of failure partway through a bring-up.
# A safety or usability property that depends on every operator remembering
# something belongs in the tooling instead, which is where this is.
#
# WHAT IT WILL NOT DO.
#
# It never overrides an identity the operator has already chosen. An exported
# profile, an exported access key AND ITS SECRET, or the isolation the test
# suite installs all win: this only fills a vacuum. And it refuses rather than
# guessing when the profile it would supply does not exist, because an operator
# who has not yet installed their key is better served by the command that
# installs it than by the SDK's own words.
#
# WHAT IT PROVES.
#
# Whichever identity the run ends up with, supplied here or already in the
# shell, is resolved against AWS once before the run does any work, and the
# identity it resolved to is printed. A configured profile is not an
# authenticating one: the key behind it can be deactivated, deleted, rotated
# away or, once operator identity is federated, simply expired, and none of that
# shows up in a list of profiles. Without the proof, the first tool to reach AWS
# reports the dead credential in its own vocabulary, which is how a deploy came
# to say that a perfectly healthy terraform tree had never been initialised.
#
# Half a key pair is the one thing here that is not an identity and is treated
# as none. Nothing can sign with an access key id whose secret is absent, or
# with a secret whose id is, but the SDK's chain takes the half anyway and takes
# it AHEAD of any profile, so every AWS call in the run then fails with "no
# valid credential sources found" and a timed-out search for an instance role.
# That message names the SDK, so it reads as an uninitialised terraform tree, a
# rotated key or a missing profile, and a deploy spent an afternoon being
# debugged as all three. The run clears the half pair from its own environment
# and says so, rather than leaving an operator to notice a stale variable in
# whichever shell they happened to start from, for the same reason as everything
# else in this file.

# The profile every operator script uses for everyday work.
#
# One name rather than one per environment, and one name rather than one per
# person. The environment is chosen by --target, never by which credential is
# loaded. The person is carried by the identity behind the profile, not by the
# profile's name, so every workstation spells this identically and no script has
# to know who is running it.
#
# Current: it names the shared IAM user, which is the only human identity the
#          account has, and which therefore still does the daily work.
# Target:  it names the profile that signs in as a named person and assumes the
#          one shared human-operator role. The shared IAM user is then the
#          emergency identity only, reached deliberately by naming it, never by
#          being what a script falls back to. Nothing else in this file changes
#          when that lands: the name stays, the credential behind it does not.
FOOTBAG_OPERATOR_PROFILE="${FOOTBAG_OPERATOR_PROFILE:-footbag-operator}"

# The identity a settled profile actually resolves to is proved rather than
# assumed, and that proof already exists for the key install and rotation
# scripts.
# shellcheck source=lib/aws-identity.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/aws-identity.sh"

# Test seam (CI only; operators never set this): replaces the aws binary used
# for the profile-existence check. The script says on stderr when it is in use,
# because a stubbed run proves nothing about the workstation. The proof of the
# identity has its own seam, AWS_IDENTITY_BIN, which the identity library owns.
AWS_PROFILE_BIN="${AWS_PROFILE_BIN:-aws}"

# Set once the announcement has been made, so a run that reads several outputs
# says which identity it is using one time rather than once per read. The proof
# behind the announcement is made on the same occasion, so this latches both: an
# operator run pays for one call to AWS, not one per terraform output.
_FOOTBAG_PROFILE_ANNOUNCED=""

# Set once the stubbed-binary note has been made, so a run with both seams
# replaced says so once rather than twice.
_FOOTBAG_STUB_NOTED=""

# aws_profile_drop_half_key_pair
#
# Removes an access key id with no secret behind it, or a secret with no id,
# from this run's environment, so the rest of the run resolves an identity as a
# shell carrying nothing would. Says on stderr when it does, because a run that
# silently discards part of the operator's environment is worse than the failure
# it prevents.
#
# The session token goes with the pair. A token is minted for one pair of keys
# and is useless without them, so leaving it behind only means the next thing to
# read the chain finds another fragment.
#
# Quiet when the pair is whole, and quiet when there is no pair at all, so the
# ordinary cases say nothing.
aws_profile_drop_half_key_pair() {
  local id="${AWS_ACCESS_KEY_ID:-}" secret="${AWS_SECRET_ACCESS_KEY:-}" missing

  if [[ -n "$id" && -z "$secret" ]]; then
    missing="AWS_SECRET_ACCESS_KEY"
  elif [[ -z "$id" && -n "$secret" ]]; then
    missing="AWS_ACCESS_KEY_ID"
  else
    return 0
  fi

  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

  echo "==> NOTE: this shell carried half an AWS key pair: ${missing} was not" >&2
  echo "    set beside it, so nothing could have authenticated with it, and it" >&2
  echo "    would have been preferred over your profile. This run has cleared" >&2
  echo "    it from its own environment and carries on; your shell is" >&2
  echo "    untouched, so whatever exported it will do this again." >&2
}

# aws_profile_note_stub
#
# Says on stderr when either seam has replaced the AWS binary, once per run,
# because a stubbed run proves nothing about the workstation and two notes about
# the same fact read as two facts.
aws_profile_note_stub() {
  [[ -n "$_FOOTBAG_STUB_NOTED" ]] && return 0

  if [[ "$AWS_PROFILE_BIN" != "aws" ]]; then
    _FOOTBAG_STUB_NOTED="yes"
    echo "==> NOTE: the AWS binary is stubbed for this run (AWS_PROFILE_BIN)." >&2
  elif [[ "$AWS_IDENTITY_BIN" != "aws" ]]; then
    _FOOTBAG_STUB_NOTED="yes"
    echo "==> NOTE: the AWS binary is stubbed for this run (AWS_IDENTITY_BIN)." >&2
  fi
  return 0
}

# aws_profile_announce <where-it-came-from>
#
# Proves the settled identity against AWS and says what it is, once per run.
# Returns non-zero when it does not resolve.
#
# The proof is the point. Checking that a profile is configured says nothing
# about whether the credential behind it still authenticates, so a key that has
# been deactivated, deleted, rotated away or expired used to be discovered by
# whatever tool reached AWS first, in that tool's words: a terraform read failing
# on credential sources reads as an uninitialised tree, and a deploy spent an
# afternoon being debugged as one. Resolving it here costs one call, at the top
# of the run, and turns that whole class into one sentence naming the credential.
aws_profile_announce() {
  local origin="$1"

  [[ -n "$_FOOTBAG_PROFILE_ANNOUNCED" ]] && return 0

  aws_profile_note_stub
  if ! aws_identity_resolve "${AWS_PROFILE:-}"; then
    echo "" >&2
    echo "       The identity this run would have used does not authenticate, so" >&2
    echo "       nothing here can reach AWS. If the key behind it was rotated," >&2
    echo "       install the current one from the vault entry" >&2
    echo "       aws-footbag-operator-keys:" >&2
    echo "         bash scripts/install-operator-key.sh" >&2
    return 1
  fi

  _FOOTBAG_PROFILE_ANNOUNCED="yes"
  echo "==> AWS identity: ${origin}" >&2
  echo "    ${AWS_IDENTITY_ARN}" >&2
  return 0
}

# aws_profile_ensure
#
# Exports AWS_PROFILE when the shell carries no AWS identity of its own, proves
# whichever identity the run ends up with, and says on stderr what it is and
# where it came from. Returns non-zero, with the command that fixes it, when the
# profile does not exist or no longer authenticates.
#
# Safe to call more than once: the proof and the announcement are made once per
# run.
aws_profile_ensure() {
  aws_profile_drop_half_key_pair

  if [[ -n "${AWS_PROFILE:-}" || -n "${AWS_ACCESS_KEY_ID:-}" \
        || -n "${AWS_DEFAULT_PROFILE:-}" ]]; then
    aws_profile_announce "taken from your environment, not from this script." \
      || return 1
    return 0
  fi

  aws_profile_note_stub

  if ! aws_profile_exists "$FOOTBAG_OPERATOR_PROFILE"; then
    echo "ERROR: no AWS profile named '${FOOTBAG_OPERATOR_PROFILE}' on this machine," >&2
    echo "       and your shell carries no AWS credentials of its own, so nothing" >&2
    echo "       here can authenticate." >&2
    echo "" >&2
    echo "       Install it from the vault entry aws-footbag-operator-keys:" >&2
    echo "         bash scripts/install-operator-key.sh" >&2
    echo "" >&2
    echo "       That writes the profile and proves it against AWS before it" >&2
    echo "       keeps it. Nothing else here asks you to export anything." >&2
    return 1
  fi

  export AWS_PROFILE="$FOOTBAG_OPERATOR_PROFILE"
  if ! aws_profile_announce "profile '${AWS_PROFILE}', supplied by this script."; then
    # Withdrawn rather than left behind: a profile that does not authenticate is
    # not an identity, and leaving it exported would make the next call through
    # here report it as one the operator's shell had chosen.
    unset AWS_PROFILE
    return 1
  fi
  return 0
}

# aws_profile_exists <profile-name>
#
# True when the named profile is configured on this machine. It asks the AWS CLI
# rather than reading the credentials file, because a profile may be declared in
# either ~/.aws/credentials or ~/.aws/config and the CLI is the one thing that
# knows about both, plus whatever AWS_CONFIG_FILE and AWS_SHARED_CREDENTIALS_FILE
# point at.
aws_profile_exists() {
  local want="$1" listed
  listed="$("$AWS_PROFILE_BIN" configure list-profiles 2>/dev/null)" || return 1
  printf '%s\n' "$listed" | grep -Fxq -- "$want"
}
