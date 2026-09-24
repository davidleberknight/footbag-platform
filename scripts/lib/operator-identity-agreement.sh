#!/usr/bin/env bash
# shellcheck shell=bash
# operator-identity-agreement.sh — one run, one person.
#
# WHAT THIS IS FOR.
#
# A run that reaches both a deployed host and AWS acts as one AWS identity and
# connects as one host account, and the two are chosen by mechanisms that know
# nothing about each other. Which host account it connects as is decided solely
# by the `User` line of the SSH alias. Which AWS principal it acts as is what
# STS returns for the credential the shared library settles and proves. Each is
# correct on its own terms, and nothing anywhere
# compares them.
#
# So a run can ship a release to the host as one person and make the AWS calls
# around it as another. Both halves succeed. Two trails record two different
# names for one act, and the disagreement is visible only to somebody reading
# both of them afterwards and thinking to line them up. That is not a failure
# anybody notices on the day.
#
# The two names are the same string by convention: the house form is a lower
# case first name, an underscore, and a last name, and an operator's host
# account and their IAM user are both spelled that way. Holding them to it is
# therefore free where the setup is right, and loud where it is not.
#
# WHEN IT APPLIES, AND WHEN IT DELIBERATELY DOES NOT.
#
# Only where the AWS half is acting as a PERSON, which in this estate means a
# session of the shared job role, whose trust policy binds the session name to
# the assuming user's own user name. Two other cases are legitimate and are not
# compared:
#
#   - Work done as the IAM user footbag-operator. That user is directly
#     authenticated, not a person's role session; it has no session name at all, and it
#     is the identity that provisions and revokes named accounts in the first
#     place. Refusing it would refuse the ordinary path.
#   - A runtime role. Those carry generated session names describing a workload
#     rather than a person, so there is nothing there to hold to anything.
#
# HOW IT AVOIDS DEPENDING ON THE ORDER THE TWO ARRIVE IN.
#
# Neither half can know whether the other has happened yet: a script may settle
# its AWS identity first and its host account later, or the reverse, and both
# orders are correct. So both halves call this, it does nothing until both
# values are present, and whichever arrives second is the one that fires. That
# is why it lives in a file of its own rather than inside either half: a check
# placed in one of them would be a check the other order silently skips, and a
# guard nobody has seen fire is not a guard.
#
# WHY NEITHER VALUE IS INHERITED FROM THE ENVIRONMENT.
#
# Both are assigned unconditionally here rather than defaulted from whatever the
# calling shell holds. A guard an exported variable can satisfy is not a guard,
# and this tree has already paid for that lesson once with a confirmation flag
# that an exported value answered on a production apply. The same reasoning
# applies with more force to an identity: a stale value in somebody's shell
# must never be able to tell a run that two names agreed.

# The person this run is acting as on the AWS side, set by the half that
# resolves and proves an AWS identity, and only where that identity is a session
# of the shared job role.
FOOTBAG_ACTING_AS_PERSON=""

# The host account this run connects as, set by the half that reads the SSH
# alias. Its own library owns the name; this is the copy the comparison reads,
# so that neither file has to know when the other ran.
FOOTBAG_ACTING_ON_HOST_AS=""

# Latched once a verdict has been reached, so a run that settles several
# credentials or reads several terraform outputs says this once rather than
# once per call.
_FOOTBAG_AGREEMENT_SETTLED=""
# The verdict itself, so the enforcing half can act on a comparison the
# recording half already made and printed.
_FOOTBAG_AGREEMENT_DISAGREED=""

# WHY RECORDING AND ENFORCING ARE SEPARATE.
#
# Some runs look this up in order to act on it, and some look it up in order to
# describe the machine. The workstation report is the second kind, and it exists
# precisely to be run where the setup is half finished: an operator who has just
# been onboarded, and whose SSH alias still connects as the shared account, is
# exactly who needs to be told. Refusing there would deny them the report that
# names the thing to fix, and it would report a perfectly good credential as one
# that does not authenticate.
#
# So the comparison is made and said out loud wherever both halves become known,
# and the refusal happens only where a run is about to act on an identity.

# operator_identity_agreement_record
#
# Makes the comparison, says what it found, and never fails. Silent where there
# is nothing to compare, because most runs are one half or the other.
operator_identity_agreement_record() {
  local person="$FOOTBAG_ACTING_AS_PERSON" account="$FOOTBAG_ACTING_ON_HOST_AS"

  [[ -n "$_FOOTBAG_AGREEMENT_SETTLED" ]] && return 0
  [[ -z "$person" || -z "$account" ]] && return 0

  _FOOTBAG_AGREEMENT_SETTLED="yes"

  if [[ "$person" == "$account" ]]; then
    echo "==> identities agree: ${person} on AWS and on the host" >&2
    return 0
  fi

  _FOOTBAG_AGREEMENT_DISAGREED="yes"
  echo "ERROR: this run would act as two different people, and the two halves" >&2
  echo "       of what it did would be recorded under two different names." >&2
  echo "" >&2
  echo "       On AWS it is acting as:   ${person}" >&2
  echo "         taken from the session name the assumed role reports, which" >&2
  echo "         the role's trust policy binds to the assuming user's own IAM" >&2
  echo "         user name, so it is not something a workstation can misstate." >&2
  echo "" >&2
  echo "       On the host it would be:  ${account}" >&2
  echo "         taken from the 'User' line of the SSH alias in ~/.ssh/config," >&2
  echo "         which is the entire act of choosing a host account and also" >&2
  echo "         what picks the sudo password file this run would open." >&2
  echo "" >&2
  echo "       One of the two is not what you meant. Either the alias still" >&2
  echo "       connects as another account, commonly the shared 'footbag' account, or this" >&2
  echo "       run was put on the job role under a name that is not yours." >&2
  echo "       Nothing done." >&2
  return 0
}

# operator_identity_agreement_require
#
# For the paths where a run is about to act rather than to look. Returns
# non-zero when the comparison has been made and the two names differ, and zero
# in every other case, including the ordinary one where only one half is known.
operator_identity_agreement_require() {
  operator_identity_agreement_record
  [[ -z "$_FOOTBAG_AGREEMENT_DISAGREED" ]]
}

# operator_identity_agreement_reset
#
# Forgets the verdict, for the one caller that deliberately puts a run on a
# different identity part way through.
#
# The latch exists so a run reaching several credentials says this once rather
# than once per call. It must not also mean that a run which CHANGED who it is
# acting as keeps the verdict it reached about who it was acting as before: that
# would carry an answer about one person into a comparison about another, which
# is the same stale-value failure this file refuses to allow from the
# environment.
operator_identity_agreement_reset() {
  _FOOTBAG_AGREEMENT_SETTLED=""
  _FOOTBAG_AGREEMENT_DISAGREED=""
}
