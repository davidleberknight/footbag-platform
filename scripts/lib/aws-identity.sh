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

  case "$arn" in
    *":user/${expected}")
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

# aws_identity_resolve [<profile>]
#
# The identity must resolve to something. WHICH principal it resolves to is
# deliberately not asserted, which is what separates this from the two checks
# above. They run at the moments where the wrong credential would be acted on,
# so they name the principal they demand. This one runs at the start of an
# ordinary run, where the question is only whether the credential still
# authenticates, and where naming a principal would have to be revised the day
# the same profile stops being a shared IAM user and becomes a federated role.
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
