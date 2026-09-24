#!/usr/bin/env bash
# as-dev-tester.sh
#
# Runs one command as the shared human-operator job role, under your own name,
# and proves that is what happened before the command starts.
#
# WHY THIS EXISTS.
#
# A `footbag-operator` holder can act as the directly authenticated IAM user
# `footbag-operator` in one run and as their own named IAM user's session of the
# job role in another; any one run is exactly one of them. `footbag-operator` is
# the default for every run, and nothing here changes that. What has been
# missing is any supported way to deliberately be the role for one command.
#
# Without it the shared library fills an empty shell by trying the
# `footbag-operator` profile first and the role-assuming profile second, so on a
# workstation that carries both -- which is every onboarded `footbag-operator`
# holder's workstation -- every command authenticates as the IAM user
# `footbag-operator`. It succeeds. It changes what
# it was told to change. And it demonstrates nothing at all about what the role
# is permitted to do, which is the entire question the role exists to answer. A
# failure that looks like success is not something to guard with a reminder in a
# runbook, so this refuses instead.
#
# WHY A WRAPPER RATHER THAN A FLAG ON EACH SCRIPT.
#
# Because the set of things worth running as the role is not a fixed list, and
# one of its members is not a script at all. The role's policy was written for
# the staging Terraform apply, the staging deploy, the staging smoke suite, the
# read-only account and DNS checks, and reading the trail back to answer who
# did something -- that last one being a bare `aws` invocation with no script
# around it. A flag repeated across dozens of entry points is a convention every
# new script has to remember, and the one that forgets it is the one that
# silently runs as `footbag-operator`.
#
# Nothing here is exported into your shell and nothing survives the command: the
# identity is chosen for one run and dies with it.
#
# THE HOST FOLLOWS.
#
# The command acts as you on the host too. Onboarding puts one Match block in
# your ~/.ssh/config, above the untouched deploy alias, that applies only while
# AWS_PROFILE names the job role's profile, which this sets for the command it
# wraps. So every script that reads the alias with `ssh -G` connects as your
# named account and picks your own sudo password file, and without this wrapper
# the same scripts connect as the shared account exactly as before. The two
# halves are one person, which the shared identity-agreement check proves.
#
# The account is named on the command line rather than inferred, so what a run
# acts as is written in the command that started it, and a workstation whose
# credentials resolve to somebody else is refused rather than used.
#
# WHAT IT REFUSES TO DO.
#
#   - Prompt, or read standard input, ever. Several commands worth wrapping take
#     a host sudo password on stdin by redirect. A prompt here would consume that
#     password as its answer and echo it on the failed comparison, and an earlier
#     attempt at this switch was withdrawn for putting work on that stream.
#   - Run as anything but the role. If the identity that resolves is not a
#     session of the job role carrying a name, the command does not start.
#   - Override key material already in your environment. Exported keys beat every
#     profile, so a run that tried would announce one identity and use another.
#     The shared library refuses that case rather than working around it.
#   - Decide which commands are safe to run this way. It does not need to: the
#     scripts that must not be the role already say so themselves and refuse a
#     role caller at their own door.
#
# Usage:
#   bash scripts/as-dev-tester.sh --account <name> <command> [args...]
#
# Examples:
#   bash scripts/as-dev-tester.sh --account david_leberknight \
#     bash scripts/terraform-apply.sh --target staging
#   bash scripts/as-dev-tester.sh --account david_leberknight ./deploy_to_aws.sh
#   bash scripts/as-dev-tester.sh --account david_leberknight npm run test:smoke
#
# Flags:
#   --account <name>  Required. Your named account, for example
#                     david_leberknight. The run is refused unless the job-role
#                     session carries exactly that name.
#   -h, --help        This text.
#   --                Ends the flags, for a command whose own first argument
#                     starts with a hyphen.
#
# Exit: the command's own status, or 2 on a usage error, or 1 when the identity
# could not be settled and proved.
#
# Test seams (CI only; operators never set these): none of its own. It reaches
# AWS only through the shared identity library, whose seams are AWS_PROFILE_BIN
# and AWS_IDENTITY_BIN, and which says on stderr when either is in use.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

ACCOUNT=""
while (( $# )); do
  case "$1" in
    -h|--help) usage 0 ;;
    --account)
      ACCOUNT="${2:-}"
      shift 2 || { echo "ERROR: --account requires a name." >&2; usage 2; }
      ;;
    --) shift; break ;;
    -*)
      echo "ERROR: unknown argument: $1" >&2
      echo "       This takes --account and --help. Everything after them is the" >&2
      echo "       command to run; put -- first if that command's own first" >&2
      echo "       argument starts with a hyphen." >&2
      usage 2
      ;;
    *) break ;;
  esac
done

if (( ! $# )); then
  echo "ERROR: no command given, so there is nothing to run as the role." >&2
  echo "" >&2
  echo "       This is a wrapper, not a way to switch your shell: the identity" >&2
  echo "       it settles lasts for the command it is given and no longer." >&2
  usage 2
fi
if [[ ! "$ACCOUNT" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
  echo "ERROR: --account <name> is required: the named account this command acts" >&2
  echo "       as, for example david_leberknight. Without it every run is" >&2
  echo "       footbag-operator, which is the default and needs no wrapper." >&2
  usage 2
fi

# The AWS identity this run uses, named rather than inherited. Sourced after the
# argument refusals, which need no credential: a run that was only ever going to
# print its usage should not fail for want of one.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

# Settled onto the role-assuming profile rather than filled from whatever the
# shell carries. The helper overrides an inherited profile, refuses outright when
# key material in the environment would beat it, and proves whatever it settles
# on before returning.
aws_profile_use "$FOOTBAG_DEV_TESTER_PROFILE" \
  "This command is being run deliberately as the ${FOOTBAG_DEV_TESTER_ROLE} job role, under your own name." \
  || exit 1

# Proving the outcome rather than the invocation. Settling a profile says which
# credential was reached for; only this says what it turned out to be.
aws_identity_require_assumed_role "$FOOTBAG_DEV_TESTER_ROLE" || exit 1

# The role's trust policy makes the session name the assuming user's own name,
# so this is the person the credentials on this workstation belong to.
if [[ "$AWS_IDENTITY_SESSION_NAME" != "$ACCOUNT" ]]; then
  echo "ERROR: the job-role session here is ${AWS_IDENTITY_SESSION_NAME}, not ${ACCOUNT}." >&2
  echo "       The credentials on this workstation belong to that account, so this" >&2
  echo "       command would act as them. Nothing was run." >&2
  exit 1
fi

echo "==> acting as ${FOOTBAG_DEV_TESTER_ROLE}, session ${AWS_IDENTITY_SESSION_NAME}" >&2
echo "    the trail will name that person rather than only the job" >&2
echo "==> running: $*" >&2

# exec rather than a call: the command inherits this process, so standard input
# reaches it exactly as the caller redirected it, nothing here sits between the
# two, and the command's own exit status is this script's without being relayed.
exec "$@"
