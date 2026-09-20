#!/usr/bin/env bash
# install-operator-key.sh
#
# Installs the human operator's AWS access key onto this workstation, from the
# vault into ~/.aws/credentials, by asking for the two values and pasting them
# in for you.
#
# WHY THIS EXISTS.
#
# This was the one step of a key rotation with no script behind it. The runbook
# ended "install it into ~/.aws/credentials yourself", so the operator opened an
# editor with a secret on the clipboard and got it right or did not. What goes
# wrong is never dramatic: a paste that lost its last characters, a session
# token left behind from some earlier experiment, a profile name typed into the
# wrong section. None of them fail here. They fail later, in whatever tool runs
# next, with a message about credentials that reads like an outage -- which is
# exactly how one afternoon went: a deploy failed at its last step and said the
# terraform tree was not initialised, when the real answer was that the key
# behind the profile had been rotated away.
#
# So this run does the parts a person should not have to: it checks the shape of
# what you pasted, it proves the credential against AWS BEFORE touching your
# file, it replaces the section atomically so a failure cannot leave you with a
# half-written credentials file, and it proves both chained runtime profiles
# afterwards rather than only the identity you just installed.
#
# WHAT IT REFUSES TO DO.
#
#   - Take the secret from anywhere but your keyboard. Not a flag, not an
#     environment variable, not a file. A secret in argv is readable by every
#     process on this machine; a secret in a file is one nobody remembers to
#     shred.
#   - Run without a terminal. It has to prompt, and a prompt with no human is
#     either a hang or a wrong answer taken silently.
#   - Write a credential it could not authenticate. A bad paste is refused
#     while your existing file is still untouched.
#   - Say it worked because one call succeeded. Both runtime profiles are
#     proved, because the chain that matters at cutover is production's and
#     proving staging alone leaves it untested.
#   - Retire the key it replaces. That is a separate decision with an
#     observation window in front of it: scripts/rotate-operator-key.sh.
#
# Usage:
#   bash scripts/install-operator-key.sh
#
# Flags:
#   --profile <name>   Section to write in the credentials file. Defaults to
#                      the profile the directly authenticated IAM user has
#                      always gone out on, which is the same name every
#                      operator script already reaches for. This key and that
#                      name belong together: there is no second credential
#                      under it and nothing else resolves through it.
#   --user <name>      IAM user the pasted key must resolve to. Defaults to the
#                      single super-admin identity, named here rather than
#                      derived from the profile, because a key that
#                      authenticates as somebody else is a refusal rather than
#                      a warning and deriving one from the other would make
#                      that check circular.
#
# The credentials file is $AWS_SHARED_CREDENTIALS_FILE when set, which is what
# the AWS tools themselves honour, and ~/.aws/credentials otherwise.
#
# Test seams (CI only; operators never set these):
#   INSTALL_OPERATOR_KEY_AWS_BIN          replaces the aws CLI
#   INSTALL_OPERATOR_KEY_RUNTIME_PROFILES space-separated chained profiles
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

# shellcheck source=lib/aws-credentials-file.sh
source "${SCRIPT_DIR}/lib/aws-credentials-file.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-identity.sh
source "${SCRIPT_DIR}/lib/aws-identity.sh"
# Sourced for the profile NAMES alone. Nothing here settles an identity from the
# library: this run strips the ambient profile and proves the pasted key on its
# own, which is why it is exempt from the gate that asks every other script to
# take its identity from there.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

AWS_BIN="${INSTALL_OPERATOR_KEY_AWS_BIN:-aws}"
AWS_IDENTITY_BIN="$AWS_BIN"
RUNTIME_PROFILES="${INSTALL_OPERATOR_KEY_RUNTIME_PROFILES:-footbag-staging-runtime footbag-production-runtime}"

# Both stacks are us-east-1, and a workstation whose ambient default region is
# elsewhere would otherwise get a confusing failure against a healthy account.
REGION="us-east-1"

# The config file is $AWS_CONFIG_FILE when set, which is what the AWS tools
# themselves honour, and ~/.aws/config otherwise. It is a different file from
# the credentials one beside it and a different section spelling, which is the
# detail a hand-copied stanza gets wrong.
CONFIG_FILE="${AWS_CONFIG_FILE:-$HOME/.aws/config}"

# The two roles the runtime profiles chain into. Literals for the same reason
# the profile names above are: there is exactly one of each, naming them here is
# what makes a typo impossible, and reading them from Terraform is circular,
# since initialising that tree needs the profiles these lines create.
STAGING_ROLE_ARN="${INSTALL_OPERATOR_KEY_STAGING_ROLE_ARN:-arn:aws:iam::041904915126:role/footbag-staging-app-runtime}"
PRODUCTION_ROLE_ARN="${INSTALL_OPERATOR_KEY_PRODUCTION_ROLE_ARN:-arn:aws:iam::041904915126:role/footbag-production-app-runtime}"

PROFILE="$FOOTBAG_OPERATOR_PROFILE"

# The IAM user, spelled here rather than derived from the profile name. The two
# happen to agree, and deriving one from the other would make the identity
# check below circular: it exists to catch a pasted key that authenticates as
# somebody other than the user this run names, which is not a check a name
# taken from the same place can make.
DEFAULT_USER_NAME="footbag-operator"
USER_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --user)
      USER_NAME="${2:-}"
      shift 2 || { echo "ERROR: --user requires an argument" >&2; exit 2; }
      ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

[[ -n "$PROFILE" ]] || { echo "ERROR: --profile was given with no value." >&2; exit 2; }
[[ -n "$USER_NAME" ]] || USER_NAME="$DEFAULT_USER_NAME"

CRED_FILE="${AWS_SHARED_CREDENTIALS_FILE:-$HOME/.aws/credentials}"

if [[ "$AWS_BIN" != "aws" ]]; then
  echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the account." >&2
fi

# The terminal check is a precondition, not a courtesy, and --with-stdin is the
# load-bearing part: this is one of the few scripts that asks a human to TYPE a
# secret, so a redirected stdin means somebody is feeding one in and the run
# must refuse rather than consume whatever the pipe holds.
if ! terminal_present --with-stdin; then
  echo "ERROR: no terminal. This run asks you to paste a secret, so it needs an" >&2
  echo "       interactive shell: not a pipe, not a captured stream, and not the" >&2
  echo "       agent's '!' prefix, which pipes." >&2
  echo "       Nothing has been read and nothing has been changed." >&2
  exit 1
fi

CURRENT_KEY="$(aws_cred_current_key_id "$CRED_FILE" "$PROFILE")"

cat <<EOF

Installing the operator access key.

  credentials file   ${CRED_FILE}
  profile section    [${PROFILE}]
  must authenticate  user/${USER_NAME}
  currently recorded ${CURRENT_KEY:-(no key in that section)}
EOF

cat <<EOF

Take both values from the vault entry for this identity: the access key id is
in its Notes, the secret is the Password field. Nothing is written until the
credential has been proved against AWS, so a bad paste costs you this prompt
and nothing else.

EOF

# ── Read the two values ──────────────────────────────────────────────────────
#
# From /dev/tty rather than stdin. Stdin is a terminal here, checked above, but
# reading the device directly is what makes that true by construction rather
# than by the caller's good manners.
AKID=""
printf 'Access key id (AKIA...): ' > /dev/tty
read -r AKID < /dev/tty || AKID=""
AKID="${AKID//[[:space:]]/}"

if ! aws_cred_key_id_looks_valid "$AKID"; then
  echo "" >&2
  echo "ERROR: that is not the shape of a long-lived access key id." >&2
  echo "       Expected AKIA followed by 16 upper-case letters and digits." >&2
  case "$AKID" in
    ASIA*)
      echo "       What you pasted starts ASIA, which is a temporary session" >&2
      echo "       credential. It expires. You have copied the wrong line." >&2
      ;;
    *)
      echo "       A paste that lost its last characters looks exactly like this," >&2
      echo "       and is the usual cause." >&2
      ;;
  esac
  echo "       Nothing has been changed." >&2
  exit 1
fi

SAK=""
printf 'Secret access key (not shown as you type): ' > /dev/tty
read -rs SAK < /dev/tty || SAK=""
printf '\n' > /dev/tty
SAK="${SAK//[[:space:]]/}"

if ! aws_cred_secret_looks_valid "$SAK"; then
  echo "" >&2
  echo "ERROR: that is not the shape of a secret access key: expected 40" >&2
  echo "       characters of letters, digits, '/', '+' and '='." >&2
  echo "       It is not shown as you type, so a paste that dropped characters" >&2
  echo "       is invisible; this check is the only thing that would catch it." >&2
  echo "       Nothing has been changed." >&2
  exit 1
fi

if [[ "$AKID" == "$SAK" ]]; then
  echo "ERROR: the same value was pasted twice. Nothing has been changed." >&2
  exit 1
fi

# ── Prove it before writing it ───────────────────────────────────────────────
#
# Against a throwaway credentials file, so the operator's own is still whatever
# it was if this fails. The probe deliberately ignores the ambient profile
# settings: a shell can carry an AWS_PROFILE the tooling supplied for it, and a
# probe that quietly resolved through it would prove the OLD key still works and
# report that as success.
PROBE=""
probe_cleanup() {
  secret_file_destroy "$PROBE"
  PROBE=""
  # The credentials-file library leaves a mode-600 temp file beside the operator's
  # own credentials file for as long as it takes to promote it by rename. Its own
  # cleanup does not fire on an interrupt, so this trap is where a Ctrl-C between
  # the write and the rename gets that file destroyed.
  secret_file_sweep
}
trap probe_cleanup EXIT INT TERM

PROBE="$(umask 077 && mktemp)"
{
  printf '[default]\n'
  printf 'aws_access_key_id = %s\n' "$AKID"
  printf 'aws_secret_access_key = %s\n' "$SAK"
} > "$PROBE"

echo "==> Proving the pasted credential against AWS"
PROBE_ARN=""
# Every ambient credential source is cleared, not just the profile ones. The
# SDK reads AWS_ACCESS_KEY_ID and friends BEFORE it reads any profile, so an
# operator whose shell exports them -- from an earlier `export`, or from an
# `aws configure export-credentials` -- would have this probe authenticate as
# that credential, resolve happily to the right user, and pronounce an unproved
# paste good. The write then lands, and the post-write check catches it only
# after the working key has already been replaced, which is exactly the
# situation this probe exists to avoid.
if ! PROBE_ARN="$(env \
  -u AWS_PROFILE -u AWS_DEFAULT_PROFILE \
  -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
  -u AWS_SECURITY_TOKEN -u AWS_CREDENTIAL_EXPIRATION \
  -u AWS_ROLE_ARN -u AWS_WEB_IDENTITY_TOKEN_FILE \
  -u AWS_CONTAINER_CREDENTIALS_FULL_URI \
  -u AWS_CONTAINER_CREDENTIALS_RELATIVE_URI \
  AWS_SHARED_CREDENTIALS_FILE="$PROBE" \
  AWS_CONFIG_FILE=/dev/null \
  AWS_EC2_METADATA_DISABLED=true \
  "$AWS_BIN" sts get-caller-identity --query Arn --output text \
  --region "$REGION" 2>&1)"; then
  echo "" >&2
  echo "ERROR: AWS refused the pasted credential:" >&2
  printf '%s\n' "$PROBE_ARN" | sed 's/^/         /' >&2
  echo "" >&2
  echo "       Your credentials file has NOT been touched. Check the vault entry" >&2
  echo "       is the current one, and that the whole secret came across." >&2
  exit 1
fi

case "$PROBE_ARN" in
  *":user/${USER_NAME}")
    echo "    authenticates as ${PROBE_ARN}"
    ;;
  *)
    echo "" >&2
    echo "ERROR: that key authenticates as" >&2
    echo "         ${PROBE_ARN}" >&2
    echo "       which is not user/${USER_NAME}. Installing it under" >&2
    echo "       [${PROFILE}] would give that profile someone else's identity," >&2
    echo "       and every later run would act as them without saying so." >&2
    echo "       Your credentials file has NOT been touched." >&2
    exit 1
    ;;
esac

probe_cleanup

# ── Write it ─────────────────────────────────────────────────────────────────
echo ""
echo "Replacing the credential in [${PROFILE}] of ${CRED_FILE}."
if [[ -n "$CURRENT_KEY" ]]; then
  echo "  ${CURRENT_KEY}  ->  ${AKID}"
else
  echo "  (no key recorded)  ->  ${AKID}"
fi
echo "Everything else in that file, and everything in that section that is not a"
echo "credential, is kept. The old key is NOT retired: that is a separate run."
echo ""

# The shared helper rather than a prompt of our own. It is the one place that
# knows a controlling terminal outlives the redirection of the standard streams,
# so a harness with /dev/tty still reachable does not get asked a question only
# a human could answer. It also assigns its own accept-in-advance flag at source
# time, which is why an exported one in the operator's shell cannot stand in for
# the typed word here.
if ! confirm_from_tty "Type 'APPLY' to write it: " "APPLY"; then
  echo "Not confirmed; nothing has been changed." >&2
  exit 1
fi

if ! aws_cred_put "$CRED_FILE" "$PROFILE" "$AKID" "$SAK"; then
  echo "ERROR: ${AWS_CRED_ERROR}" >&2
  echo "       The new file is built beside the old one and renamed over it, so" >&2
  echo "       a failure here leaves your existing file intact." >&2
  exit 1
fi
SAK=""
echo "    written, mode 0600"

# ── Prove the installed file, and the whole chain ────────────────────────────
#
# Re-read through the real file under the real profile name. The probe above
# proved the credential; this proves it is what that profile now resolves to,
# which is a different claim and the one the operator actually depends on.
# ── The chained runtime profiles, written rather than left to the operator ───
#
# This script already knew both profile names and already proved them; what it
# did not do was write them, so the operator hand-edited a second file and the
# run then exited 1 if they had not done it yet, or had done it after. That is
# the same defect this script's own header describes one file over: a runbook
# ending "put it in the config yourself", and a failure that surfaces as a
# credential error rather than as a missing stanza.
#
# Additive and idempotent. An existing section of the same name is left exactly
# as it is and reported, never rewritten, because it may carry an mfa_serial or
# a session duration somebody set deliberately and this script cannot tell the
# difference between that and a mistake.
echo ""
echo "==> Ensuring the chained runtime profiles in ${CONFIG_FILE}"
for _rt in $RUNTIME_PROFILES; do
  case "$_rt" in
    *staging*)    _role="$STAGING_ROLE_ARN" ;;
    *production*) _role="$PRODUCTION_ROLE_ARN" ;;
    *)
      echo "    ${_rt}: no role known for this profile name; leaving it alone" >&2
      continue
      ;;
  esac
  # Status captured rather than read from `$?` after the call: "already present"
  # is a non-zero return and a normal outcome, and under `set -e` a bare call
  # would abort the run on exactly the path a re-run takes.
  _rc=0
  aws_config_add_role_profile "$CONFIG_FILE" "$_rt" "$_role" "$PROFILE" "$REGION" || _rc=$?
  case $_rc in
    0) echo "    ${_rt}: written" ;;
    2) echo "    ${_rt}: already present, left untouched" ;;
    *)
      echo "ERROR: could not write ${_rt}: ${AWS_CRED_ERROR}" >&2
      exit 1
      ;;
  esac
done
unset _rt _role _rc

echo ""
echo "==> Proving the installed profile and both chained runtime profiles"
FAILED=0
aws_identity_require_user "$PROFILE" "$USER_NAME" || FAILED=1
# shellcheck disable=SC2086
aws_identity_require_chain $RUNTIME_PROFILES || FAILED=1

if (( FAILED )); then
  echo "" >&2
  echo "The key is installed and authenticates, but the chain above is not whole." >&2
  echo "Nothing is broken by stopping here: the credential is in place and the" >&2
  echo "old key, if it still exists, is untouched. Fix the chain before retiring" >&2
  echo "anything." >&2
  exit 1
fi

echo ""
echo "Installed and proved."
echo ""
echo "The key this replaces has NOT been retired. See what ${USER_NAME} holds:"
echo "  aws iam list-access-keys --user-name ${USER_NAME}"
echo ""
echo "Then, when the predecessor is ready to go, one step per run:"
echo "  bash scripts/rotate-operator-key.sh \\"
echo "    --profile ${PROFILE} --retire <old-key-id>"
echo "  bash scripts/rotate-operator-key.sh \\"
echo "    --profile ${PROFILE} --delete <old-key-id>"
