#!/usr/bin/env bash
# shellcheck shell=bash
# terraform-output.sh — read one terraform output and KEEP the reason it failed.
#
# Every caller of `terraform output -raw` in this tree wrote the same three
# things: redirect stderr to /dev/null, tolerate a non-zero exit, and then, on
# an empty value, print a guess at what went wrong. The guess is the problem.
# An empty cloudfront_domain has at least three causes that present identically:
#
#   - the tree has never been initialised, so there is no state to read;
#   - the AWS profile in the ambient chain no longer authenticates, because the
#     sign-in behind it has expired or the key behind it was rotated away;
#   - the operator profile is not set up on this machine at all, so there is
#     no identity for the read to use.
#
# Terraform says which of those it is, in one clear sentence, and the deploy
# threw that sentence away and told the operator to check the first cause. So a
# deploy during a key rotation reads as an infrastructure problem, and the
# operator goes looking at the tree rather than at their credentials.
#
# This keeps the sentence. Callers get the value on stdout when the read works,
# and TF_OUTPUT_ERROR holding terraform's own words when it does not.
#
# Deliberately NOT a policy: whether an unreadable output is fatal belongs to
# the caller. Some of these reads are optional enrichment and some are the
# address a smoke check needs. What is not the caller's business any more is
# inventing an explanation.

# Every terraform read in this tree comes through here, which makes it the one
# place that can guarantee the run has an AWS identity before it asks for one.
# The alternative is a line in each caller, which is the convention-each-script-
# repeats shape that the operator never sees and the next script forgets.
# shellcheck source=lib/aws-profile.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/aws-profile.sh"

# Test seam (CI only; operators never set this): replaces the terraform binary.
TF_OUTPUT_BIN="${TF_OUTPUT_BIN:-terraform}"

# The last read's value, and terraform's own stderr from it. One of the two is
# meaningful after any call; the error is empty when the read succeeded.
TF_OUTPUT_VALUE=""
TF_OUTPUT_ERROR=""

# tf_output_read <terraform-dir> <output-name>
#
# Sets TF_OUTPUT_VALUE and TF_OUTPUT_ERROR. Returns terraform's exit status. An
# output that exists but is empty is a successful read of an empty value, and is
# reported as such rather than as a failure.
#
# It sets a variable rather than printing, which looks like the wrong shape for
# a shell function and is the right one here. `value="$(f)"` runs f in a
# subshell, so anything f records about WHY it failed dies with that subshell --
# which is the exact loss this file exists to stop, reintroduced by a caller
# writing the idiomatic thing. There is no printing form to reach for.
tf_output_read() {
  local dir="$1" name="$2" errfile rc=0

  TF_OUTPUT_VALUE=""
  TF_OUTPUT_ERROR=""

  # A read with no identity behind it fails inside terraform, which reports it
  # as its own problem. Settle the identity first so the operator gets the
  # sentence that names the fix instead.
  if ! aws_profile_ensure; then
    TF_OUTPUT_ERROR="no AWS identity is available for this read"
    return 1
  fi

  errfile="$(mktemp)" || {
    TF_OUTPUT_ERROR="could not create a temp file to capture terraform's stderr"
    return 1
  }
  # RETURN rather than EXIT: callers install their own EXIT traps for credential
  # cleanup, and a second one here would replace theirs.
  #
  # It clears itself, which is not decoration. A RETURN trap fires for the
  # function that set it and then STAYS SET on the shell, so without this it
  # would fire again on the next `source` the caller does, running `rm -f` on a
  # path that has since been freed for reuse. Removing it as it fires keeps the
  # cleanup to the one run that created the file.
  # shellcheck disable=SC2064
  trap "rm -f -- '${errfile}'; trap - RETURN" RETURN

  TF_OUTPUT_VALUE="$("$TF_OUTPUT_BIN" -chdir="$dir" output -raw "$name" 2>"$errfile")" || rc=$?

  if [[ "$rc" -ne 0 ]]; then
    TF_OUTPUT_VALUE=""
    TF_OUTPUT_ERROR="$(cat -- "$errfile")"
  fi
  return "$rc"
}

# tf_output_explain <terraform-dir> <output-name>
#
# The lines a caller prints on stderr after a failed read: terraform's own
# words, then the three causes that look identical from the outside, so the
# operator checks their credentials as readily as the tree.
tf_output_explain() {
  local dir="$1" name="$2"
  echo "       terraform said:" >&2
  if [[ -n "$TF_OUTPUT_ERROR" ]]; then
    printf '%s\n' "$TF_OUTPUT_ERROR" | sed 's/^/         /' >&2
  else
    echo "         (nothing; the read succeeded and the output is empty)" >&2
  fi
  echo "" >&2
  echo "       Reproduce it directly:" >&2
  echo "         terraform -chdir=${dir} output -raw ${name}" >&2
  echo "" >&2
  echo "       Three causes look identical here, so check all three:" >&2
  echo "         - the tree has not been initialised (terraform -chdir=${dir} init);" >&2
  echo "         - your sign-in has expired, which is the ordinary one" >&2
  echo "           (aws sso login --profile ${FOOTBAG_OPERATOR_PROFILE});" >&2
  echo "         - the operator profile is not set up on this machine at all" >&2
  echo "           (bash scripts/install-operator-sso-profile.sh --help)." >&2
}
