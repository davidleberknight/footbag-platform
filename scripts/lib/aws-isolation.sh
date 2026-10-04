# shellcheck shell=bash
# aws-isolation.sh — break AWS credential resolution for a command that must not
# reach AWS.
#
# WHY THIS EXISTS.
#
# The shell counterpart of tests/fixtures/awsIsolation.ts, which does the same
# job for every vitest worker. That declaration covers the suites; nothing
# covered the gates in run_all_tests.sh, and the gap was not theoretical.
#
# The terraform gate ran `terraform init -backend=false` believing the flag made
# init offline. It does not: it disables *configuring* a backend and then uses
# whatever was previously initialized instead. In a tree where an operator has
# run `terraform init`, the .terraform left behind holds the S3 state backend, so
# the gate loaded it and called STS on every local run. That was invisible for
# months because a passing credential check looks exactly like no credential
# check — and the day the operator's access key stopped being accepted, a
# credential outage was reported as a terraform failure.
#
# Not reaching AWS is therefore not something a gate can be trusted to do by
# avoiding credentials; it has to be enforced, so that a gate which starts
# reaching AWS fails at once on every machine rather than passing quietly
# wherever a key happens to work.
#
# This file refuses to do anything else. It does not decide which commands
# deserve isolation, and it never removes isolation from one.
#
# Usage:
#   source scripts/lib/aws-isolation.sh
#   aws_isolated_run terraform validate

# aws_isolated_run <command> [args...]
# Runs the command with every AWS credential source pointed at nothing. The
# assignments apply to the child only, so a caller that legitimately needs the
# operator's identity later in the same shell is unaffected.
#
# The mechanisms mirror NO_AWS_CREDENTIALS in tests/fixtures/awsIsolation.ts
# and must stay in step with it: a profile name that resolves to nothing, both
# credential-file paths aimed at /dev/null, the three environment key sources
# blanked, the web-identity and container credential sources blanked, the
# instance metadata endpoint disabled, and the region pinned.
#
# AWS_EC2_METADATA_DISABLED carries its own weight: without it the SDK falls
# through to the instance metadata endpoint, which on a workstation is a slow
# timeout rather than a refusal, and on any AWS-hosted runner is a live
# credential source. The web-identity and container sources are the same kind
# of thing on a runner that exports them.
aws_isolated_run() {
  env \
    AWS_PROFILE='footbag-test-nonexistent-profile' \
    AWS_CONFIG_FILE='/dev/null' \
    AWS_SHARED_CREDENTIALS_FILE='/dev/null' \
    AWS_ACCESS_KEY_ID='' \
    AWS_SECRET_ACCESS_KEY='' \
    AWS_SESSION_TOKEN='' \
    AWS_WEB_IDENTITY_TOKEN_FILE='' \
    AWS_ROLE_ARN='' \
    AWS_CONTAINER_CREDENTIALS_RELATIVE_URI='' \
    AWS_CONTAINER_CREDENTIALS_FULL_URI='' \
    AWS_CONTAINER_AUTHORIZATION_TOKEN='' \
    AWS_EC2_METADATA_DISABLED='true' \
    AWS_REGION='us-east-1' \
    "$@"
}

# aws_isolate_self "$@"
# For a script that must never reach AWS, as its first command: re-runs the
# calling script under aws_isolated_run, so the whole run and everything it
# starts has no credential source at all. Already isolated, it returns and the
# script carries on.
#
# A script that does this first is one the AWS-reach guard can trust without
# reading its body, which matters where the body names the aws CLI as data, as
# the hook fixture suite does in every test case it feeds the guard.
aws_isolate_self() {
  if [[ "${AWS_PROFILE:-}" == 'footbag-test-nonexistent-profile' \
        && "${AWS_CONFIG_FILE:-}" == '/dev/null' \
        && "${AWS_SHARED_CREDENTIALS_FILE:-}" == '/dev/null' \
        && -z "${AWS_ACCESS_KEY_ID:-}" \
        && -z "${AWS_SECRET_ACCESS_KEY:-}" \
        && -z "${AWS_SESSION_TOKEN:-}" \
        && -z "${AWS_WEB_IDENTITY_TOKEN_FILE:-}" \
        && -z "${AWS_ROLE_ARN:-}" \
        && -z "${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:-}" \
        && -z "${AWS_CONTAINER_CREDENTIALS_FULL_URI:-}" \
        && -z "${AWS_CONTAINER_AUTHORIZATION_TOKEN:-}" \
        && "${AWS_EC2_METADATA_DISABLED:-}" == 'true' ]]; then
    return 0
  fi
  # One list of variables, in aws_isolated_run; the re-run's exit is the script's.
  aws_isolated_run "$BASH" "${BASH_SOURCE[1]}" "$@"
  exit $?
}
