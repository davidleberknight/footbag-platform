#!/usr/bin/env bash
# shellcheck shell=bash
# aws-identity.sh — what a profile actually resolves to, asserted rather than
# assumed.
#
# Several scripts need the same answers, and for the same reason: an operator
# key is about to be installed, or one is about to be cut, or an identity is
# about to be administered, and every one of those is only safe if the
# credential in play is the one the operator believes they are holding. A zero
# exit from the CLI is not that. A profile can succeed while resolving to a
# different user entirely, and a chained profile can succeed while quietly
# returning its own source identity, which means the assume-role step never
# happened and the role's permissions were never in play.
#
# The question is asked two ways, because the callers reach their credential
# differently: of a named profile, and of whatever the run has already settled.
#
# Both checks read the outcome, not the invocation. And both environments are
# always checked, never just the one nearest to hand: proving staging alone
# leaves untested the chain that matters at cutover, which is the one that
# cannot be rehearsed afterwards.
#
# A region is passed explicitly. Both stacks are us-east-1, and an operator
# whose ambient default region is elsewhere would otherwise collect confusing
# failures against a perfectly healthy account.

AWS_IDENTITY_BIN="${AWS_IDENTITY_BIN:-aws}"
AWS_IDENTITY_REGION="${AWS_IDENTITY_REGION:-us-east-1}"

# The ARN from the last successful call.
AWS_IDENTITY_ARN=""

# The session name from the last successful assumed-role assertion, which on a
# shared role IS the person: the role's trust policy requires it to equal the
# assuming user's own user name, so it is the one place a run can learn who it
# is acting as without being told.
AWS_IDENTITY_SESSION_NAME=""

# aws_identity_require_user <profile> <expected-iam-user>
#
# The profile must resolve, and must resolve to that user.
aws_identity_require_user() {
  local profile="$1" expected="$2" arn
  AWS_IDENTITY_ARN=""

  if ! arn="$("$AWS_IDENTITY_BIN" sts get-caller-identity --profile "$profile" \
    --query Arn --output text --region "$AWS_IDENTITY_REGION" 2>&1)"; then
    echo "ERROR: the profile '${profile}' could not resolve an identity at all." >&2
    printf '%s\n' "$arn" | sed 's/^/         /' >&2
    return 1
  fi

  # A user created under an IAM path carries that path in its ARN, as every
  # named operator does under /footbag-operators/, so the name is matched as
  # the last segment after `user/` whatever path sits between. The slash in
  # front of it is what stops a name that merely ends with the expected one
  # from matching.
  case "$arn" in
    *":user/${expected}"|*":user/"*"/${expected}")
      AWS_IDENTITY_ARN="$arn"
      echo "    ${profile}: ${arn}"
      return 0
      ;;
  esac

  echo "ERROR: '${profile}' resolves to ${arn}," >&2
  echo "       which is not user/${expected}. Acting on the strength of some" >&2
  echo "       other identity's success proves nothing. Nothing done." >&2
  return 1
}

# aws_identity_require_direct_user <expected-iam-user>
#
# The same demand as above, asked of the identity the run has already settled
# rather than of a profile name. Two callers need it and they reach their
# credential differently: one settles a profile through the shared helper, the
# other may be running on keys exported into the shell, and neither has a
# profile name to hand that is guaranteed to be the thing that authenticated.
#
# It exists as one function rather than as a test each caller writes because the
# invariant is the same invariant: administering a human operator, and applying
# the tree that declares what a human operator may do, are both refused to every
# assumed role, including the job role itself, which is denied every write to
# its own definition. Two copies of that check is how one of them drifts.
aws_identity_require_direct_user() {
  local expected="$1"

  if [[ -z "$AWS_IDENTITY_ARN" ]]; then
    aws_identity_resolve "${AWS_PROFILE:-}" || return 1
  fi

  case "$AWS_IDENTITY_ARN" in
    *":user/${expected}")
      return 0
      ;;
    *":assumed-role/"*)
      echo "ERROR: this run is authenticated as ${AWS_IDENTITY_ARN}," >&2
      echo "       which is an assumed role. This is refused to every role," >&2
      echo "       including the job role operators use for everyday work: a" >&2
      echo "       role is denied every write to its own definition, so a run" >&2
      echo "       started this way would fail partway through rather than at" >&2
      echo "       the door, leaving half a change behind." >&2
      echo "" >&2
      echo "       Re-run as the directly authenticated ${expected}." >&2
      echo "       Nothing done." >&2
      return 1
      ;;
  esac

  echo "ERROR: this run is authenticated as ${AWS_IDENTITY_ARN}," >&2
  echo "       which is not user/${expected}. Acting on the strength of some" >&2
  echo "       other identity's success proves nothing. Nothing done." >&2
  return 1
}

# aws_identity_require_chain <profile> [<profile> ...]
#
# Every named profile must resolve to an assumed role. Each is reported, and the
# run is judged on all of them together rather than stopping at the first, so an
# operator sees the whole picture in one pass.
aws_identity_require_chain() {
  local profile arn failed=0

  for profile in "$@"; do
    if ! arn="$("$AWS_IDENTITY_BIN" sts get-caller-identity --profile "$profile" \
      --query Arn --output text --region "$AWS_IDENTITY_REGION" 2>&1)"; then
      echo "  FAIL ${profile}: ${arn}" >&2
      failed=1
      continue
    fi
    case "$arn" in
      *:assumed-role/*) echo "    ${profile}: ${arn}" ;;
      *)
        echo "  FAIL ${profile}: resolved ${arn}, which is not an assumed role." >&2
        echo "       A chained profile returning its own source identity means" >&2
        echo "       the assume-role step did not happen." >&2
        failed=1
        ;;
    esac
  done

  if [[ "$failed" -ne 0 ]]; then
    echo "ERROR: not every chained profile resolves." >&2
    echo "       Both environments are checked because proving only one leaves" >&2
    echo "       untested the chain that matters at cutover." >&2
    return 1
  fi
  return 0
}

# aws_identity_require_assumed_role <role-name>
#
# The run must be acting as a session of that role. The session name is left in
# AWS_IDENTITY_SESSION_NAME, because on a shared role that name is the person.
#
# This is the assertion a deliberate switch to the job role rests on, and the
# failure it exists to catch is the one that looks like success. A workstation
# can carry the footbag-operator profile and the role-assuming profile at once,
# by design, and either resolves without complaint. So a run that was meant to
# act as the role and did not acts as the IAM user footbag-operator instead: it
# succeeds, it
# changes exactly what it was asked to change, and it demonstrates nothing
# whatever about what the role is permitted. Nothing downstream can tell the
# difference afterwards, because the work landed either way. A reminder in a
# runbook does not catch that; only refusing to proceed does.
#
# It asks what STS returned rather than which profile was named, for the reason
# every identity check here does: a profile holds no authority and grants
# nothing, and each one in this tree is named for the principal it reaches, so
# the name is the least reliable thing about it.
aws_identity_require_assumed_role() {
  local role="$1" session=""

  if [[ -z "$AWS_IDENTITY_ARN" ]]; then
    aws_identity_resolve "${AWS_PROFILE:-}" || return 1
  fi

  AWS_IDENTITY_SESSION_NAME=""

  case "$AWS_IDENTITY_ARN" in
    *":assumed-role/${role}/"*)
      # Everything after the final slash. A session name cannot contain one, so
      # this is exact rather than a best effort. The trailing slash in the match
      # above is load-bearing too: without it a role whose name merely starts
      # with the wanted one would satisfy the check.
      session="${AWS_IDENTITY_ARN##*/}"
      ;;
    *":assumed-role/"*)
      echo "ERROR: this run is acting as ${AWS_IDENTITY_ARN}," >&2
      echo "       which is an assumed role, but not ${role}. A session of some" >&2
      echo "       other role carries some other policy, so nothing this run" >&2
      echo "       went on to do would say anything about ${role}." >&2
      echo "       Nothing done." >&2
      return 1
      ;;
    *)
      echo "ERROR: this run is acting as ${AWS_IDENTITY_ARN}," >&2
      echo "       which is not a session of ${role} at all." >&2
      echo "" >&2
      echo "       This is the failure that would otherwise look like success." >&2
      echo "       The work would have run under that identity's permissions rather" >&2
      echo "       than ${role}'s, and proved nothing about what ${role} is" >&2
      echo "       permitted to do." >&2
      echo "       Nothing done." >&2
      return 1
      ;;
  esac

  if [[ -z "$session" ]]; then
    echo "ERROR: ${AWS_IDENTITY_ARN} names ${role} but carries no session name," >&2
    echo "       so there is nothing in it identifying who is acting. On a" >&2
    echo "       shared role the session name is the whole of the attribution." >&2
    return 1
  fi

  AWS_IDENTITY_SESSION_NAME="$session"
  return 0
}

# aws_identity_resolve [<profile>]
#
# The identity must resolve to something. WHICH principal it resolves to is
# deliberately not asserted, which is what separates this from the two checks
# above. They run at the moments where the wrong credential would be acted on,
# so they name the principal they demand. This one runs at the start of an
# ordinary run, where the question is only whether the credential still
# authenticates, and where naming a principal would have to be revised the day
# the principal behind the same profile stops being an IAM user and becomes a
# federated role.
#
# With no argument, or an empty one, it asks about whatever the ambient chain
# resolves, which is the case where the operator's shell supplies keys rather
# than a profile name.
#
# The ARN is left in AWS_IDENTITY_ARN rather than printed, because the caller
# knows how it wants to say which identity the run is using.
aws_identity_resolve() {
  local profile="${1:-}" arn subject
  local -a scope=()

  AWS_IDENTITY_ARN=""
  if [[ -n "$profile" ]]; then
    scope=(--profile "$profile")
    subject="the profile '${profile}'"
  else
    subject="the AWS credentials in your environment"
  fi

  if ! arn="$("$AWS_IDENTITY_BIN" sts get-caller-identity \
    ${scope[@]+"${scope[@]}"} \
    --query Arn --output text --region "$AWS_IDENTITY_REGION" 2>&1)"; then
    echo "ERROR: ${subject} did not authenticate against AWS." >&2
    printf '%s\n' "$arn" | sed 's/^/         /' >&2
    return 1
  fi

  AWS_IDENTITY_ARN="$arn"
  return 0
}
