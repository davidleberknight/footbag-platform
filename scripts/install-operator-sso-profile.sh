#!/usr/bin/env bash
# install-operator-sso-profile.sh
#
# Writes the federated sign-in profile onto this workstation, so that everyday
# AWS work goes out as the person doing it rather than as one shared key.
#
# WHY THIS EXISTS.
#
# The step it replaces was a line at the end of a runbook telling the operator
# to type `aws configure sso` and answer six questions, four of which have
# exactly one right answer that nobody can guess: the access portal URL, the
# region the directory lives in, the account number, and the name of the
# permission set their job carries. The sibling script that installs the
# long-lived key exists for the same reason one file over, and its header says
# it plainly: a hand-copied stanza gets a detail wrong, and none of the ways it
# gets it wrong fail here. They fail later, in whatever tool runs next, with a
# message about credentials that reads like an outage.
#
# WHAT IT REFUSES TO DO, AND WHY THAT IS THE POINT.
#
# It refuses to write this profile while a static access key already occupies
# the same name, in either the credentials file or the config file beside it.
#
# That refusal is the whole reason this is a script rather than a paragraph. The
# SDK resolves a static key ahead of a sign-in session configured under the same
# profile name, and says nothing about doing so. Written over a key, this
# profile would be present, correct, and never once used: every command would go
# out on the long-lived credential, the run would report success, and the thing
# it proved would be the opposite of the thing it claimed. Nothing downstream
# notices, because from the outside a successful call is a successful call.
#
# So the key lives under its own profile name, this one is kept for the sign-in,
# and a collision is an error rather than a preference.
#
# It also leaves an existing section of this name alone rather than rewriting
# it. A profile may carry a session duration, an output format or a role name
# somebody set deliberately, and this script cannot tell that from a mistake.
#
# WHAT IT DOES NOT DO.
#
# It does not sign you in. `aws sso login` opens a browser and completes a
# device authorization, which is a person's act and not a configuration step, so
# it stays a command the operator runs, printed at the end with the profile name
# already filled in.
#
# Usage:
#   bash scripts/install-operator-sso-profile.sh \
#     --start-url https://<your-portal>.awsapps.com/start --role <permission-set>
#
# Flags:
#   --start-url <url>  The AWS access portal URL, from the invitation mail that
#                      brought you here. Required, and there is no sensible
#                      default: it carries the directory's own identifier.
#   --role <name>      The permission set your job carries. Required, and one of
#                      the two that exist, because a name that is nearly right
#                      configures cleanly and fails at sign-in with a message
#                      about the role rather than about the spelling.
#   --profile <name>   Profile section to write. Defaults to the name every
#                      operator script already uses for everyday work, which is
#                      the point: the name did not change when the credential
#                      behind it did.
#   --session <name>   The sso-session block this profile shares. Defaults to
#                      one name for the whole project, so a single sign-in
#                      serves every profile that points at it.
#
# It also writes the chained runtime profiles, which belong to whichever
# identity the operator acts as and under federation is this one. Staging for
# everybody; production only for the super-admin set, because production's
# runtime role does not trust the other one and a profile that resolves and
# cannot assume reads as a fault rather than as a boundary.
#
# Flags, continued:
#   --yes              Accept the typed confirmation in advance, for a run with
#                      no terminal attached. It changes a file on your own
#                      workstation and touches nothing deployed, which is why
#                      there is an unattended form at all. It does NOT skip the
#                      refusal below: a static key under this name stops the run
#                      whatever flags it was given.
#
# The config file is $AWS_CONFIG_FILE when set, which is what the AWS tools
# themselves honour, and ~/.aws/config otherwise.
#
# Test seams (CI only; operators never set these):
#   INSTALL_OPERATOR_SSO_ACCOUNT_ID  replaces the account number written
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
# confirm_from_tty is the shared confirmation helper: it reads the answer from
# /dev/tty rather than stdin, refuses when no terminal exists and --yes was not
# given, and assigns its own accept-in-advance flag at source time, so an
# exported one in the operator's shell cannot stand in for the typed word.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# Sourced for the two profile names. Nothing here settles an identity: this run
# writes a profile and reaches AWS not at all.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

# Both stacks live in one account and one region, spelled here rather than
# discovered, for the same reason the sibling script spells its role ARNs: there
# is exactly one of each, naming them is what makes a typo impossible, and the
# operator running this has no AWS identity yet to discover anything with.
ACCOUNT_ID="${INSTALL_OPERATOR_SSO_ACCOUNT_ID:-041904915126}"
REGION="us-east-1"

# The two runtime roles the chained profiles assume, on the same reasoning.
STAGING_ROLE_ARN="${INSTALL_OPERATOR_SSO_STAGING_ROLE_ARN:-arn:aws:iam::041904915126:role/footbag-staging-app-runtime}"
PRODUCTION_ROLE_ARN="${INSTALL_OPERATOR_SSO_PRODUCTION_ROLE_ARN:-arn:aws:iam::041904915126:role/footbag-production-app-runtime}"
STAGING_RUNTIME_PROFILE="footbag-staging-runtime"
PRODUCTION_RUNTIME_PROFILE="footbag-production-runtime"

# The two permission sets that exist. An operator takes exactly one: the
# super-admin set carries production and the work that reaches an operator's
# own identity, the dev-and-tester set is scoped to staging.
SUPER_ADMIN_ROLE="FootbagSuperAdmin"
DEV_TESTER_ROLE="FootbagDevTester"

CONFIG_FILE="${AWS_CONFIG_FILE:-$HOME/.aws/config}"
CRED_FILE="${AWS_SHARED_CREDENTIALS_FILE:-$HOME/.aws/credentials}"

PROFILE="$FOOTBAG_OPERATOR_PROFILE"
SESSION="footbag"
START_URL=""
ROLE_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --start-url)
      START_URL="${2:-}"
      shift 2 || { echo "ERROR: --start-url requires an argument" >&2; exit 2; }
      ;;
    --role)
      ROLE_NAME="${2:-}"
      shift 2 || { echo "ERROR: --role requires an argument" >&2; exit 2; }
      ;;
    --profile)
      PROFILE="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --session)
      SESSION="${2:-}"
      shift 2 || { echo "ERROR: --session requires an argument" >&2; exit 2; }
      ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

[[ -n "$PROFILE" ]] || { echo "ERROR: --profile was given with no value." >&2; exit 2; }
[[ -n "$SESSION" ]] || { echo "ERROR: --session was given with no value." >&2; exit 2; }

if [[ -z "$START_URL" ]]; then
  echo "ERROR: --start-url is required and has no default." >&2
  echo "       It is the AWS access portal link in the invitation mail that" >&2
  echo "       brought you here, and it ends in /start." >&2
  exit 2
fi

# Shape only. It says nothing about whether the portal exists, and it is not
# trying to: what it catches is the paste that picked up a console link, a
# mail-tracking redirect or the surrounding text, each of which configures
# cleanly and fails at sign-in with a message about the network.
if [[ "$START_URL" != https://* ]]; then
  echo "ERROR: the access portal URL must begin with https://, and '${START_URL}'" >&2
  echo "       does not. Copy the link itself rather than the text around it." >&2
  exit 2
fi

case "$ROLE_NAME" in
  "$SUPER_ADMIN_ROLE"|"$DEV_TESTER_ROLE") ;;
  "")
    echo "ERROR: --role is required and has no default. Which permission set you" >&2
    echo "       take is a property of your job here, not of this workstation:" >&2
    echo "" >&2
    echo "         ${SUPER_ADMIN_ROLE}   production, and the work that reaches an" >&2
    echo "                             operator's own identity" >&2
    echo "         ${DEV_TESTER_ROLE}    staging only" >&2
    exit 2
    ;;
  *)
    echo "ERROR: '${ROLE_NAME}' is not one of the permission sets that exist." >&2
    echo "       They are ${SUPER_ADMIN_ROLE} and ${DEV_TESTER_ROLE}. A name that is" >&2
    echo "       nearly right is written without complaint and fails at sign-in." >&2
    exit 2
    ;;
esac

# ── The refusal this script exists for ───────────────────────────────────────
#
# Checked before anything is written and before the operator is asked anything,
# because the answer decides whether there is a question worth asking.
SHADOWING_KEY="$(aws_cred_current_key_id "$CRED_FILE" "$PROFILE")"
SHADOWING_FILE="$CRED_FILE"
if [[ -z "$SHADOWING_KEY" ]]; then
  SHADOWING_KEY="$(aws_config_profile_key_id "$CONFIG_FILE" "$PROFILE")"
  SHADOWING_FILE="$CONFIG_FILE"
fi

if [[ -n "$SHADOWING_KEY" ]]; then
  echo "ERROR: a static access key already occupies the profile '${PROFILE}'," >&2
  echo "       in ${SHADOWING_FILE}:" >&2
  echo "         ${SHADOWING_KEY}" >&2
  echo "" >&2
  echo "       A key there is preferred over a sign-in session on the same" >&2
  echo "       profile name, silently. Writing this profile over it would leave" >&2
  echo "       you with a federated sign-in that is configured, looks right, and" >&2
  echo "       is never used: every command would keep going out on that key and" >&2
  echo "       nothing anywhere would say so." >&2
  echo "" >&2
  echo "       The directly authenticated key belongs under its own profile" >&2
  echo "       name, '${FOOTBAG_OPERATOR_KEY_PROFILE}', which the scripts that" >&2
  echo "       need it name deliberately. Move it there and run this again:" >&2
  echo "         bash scripts/install-operator-key.sh" >&2
  echo "" >&2
  echo "       Nothing has been changed." >&2
  exit 1
fi

# ── Already done ─────────────────────────────────────────────────────────────
if aws_config_has_profile "$CONFIG_FILE" "$PROFILE"; then
  echo "The profile '${PROFILE}' is already in ${CONFIG_FILE}, and it carries no"
  echo "static key, so there is nothing here to fix. It is left exactly as it is:"
  echo "a profile may hold a session duration or an output format somebody set"
  echo "deliberately, and this run cannot tell that from a mistake."
  echo ""
  echo "Sign in with it:"
  echo "  aws sso login --profile ${PROFILE}"
  exit 0
fi

# ── Write it ─────────────────────────────────────────────────────────────────
cat <<EOF

Writing the federated sign-in profile.

  config file    ${CONFIG_FILE}
  profile        [profile ${PROFILE}]
  sso-session    [sso-session ${SESSION}]
  portal         ${START_URL}
  account        ${ACCOUNT_ID}
  permission set ${ROLE_NAME}
  region         ${REGION}

Nothing here is a credential. This describes where to sign in and as what; the
credential itself is minted by the sign-in, held for the session, and never
written to your disk by this script.

EOF

if ! confirm_from_tty "Type 'APPLY' to write it: " "APPLY"; then
  echo "Not confirmed; nothing has been changed." >&2
  exit 1
fi

# The session block first. A profile pointing at an sso-session that does not
# exist is refused by the CLI with a message about the profile, which sends the
# reader to the wrong section of the file.
SESSION_RC=0
aws_config_append_section "$CONFIG_FILE" "sso-session ${SESSION}" \
  "sso_start_url            = ${START_URL}" \
  "sso_region               = ${REGION}" \
  "sso_registration_scopes  = sso:account:access" || SESSION_RC=$?
case $SESSION_RC in
  0) echo "    [sso-session ${SESSION}]: written" ;;
  2) echo "    [sso-session ${SESSION}]: already present, left untouched" ;;
  *)
    echo "ERROR: could not write the sso-session block: ${AWS_CRED_ERROR}" >&2
    exit 1
    ;;
esac

PROFILE_RC=0
aws_config_append_section "$CONFIG_FILE" "profile ${PROFILE}" \
  "sso_session    = ${SESSION}" \
  "sso_account_id = ${ACCOUNT_ID}" \
  "sso_role_name  = ${ROLE_NAME}" \
  "region         = ${REGION}" \
  "output         = json" || PROFILE_RC=$?
case $PROFILE_RC in
  0) echo "    [profile ${PROFILE}]: written" ;;
  2) echo "    [profile ${PROFILE}]: already present, left untouched" ;;
  *)
    echo "ERROR: could not write the profile: ${AWS_CRED_ERROR}" >&2
    exit 1
    ;;
esac

# ── The chained runtime profiles ─────────────────────────────────────────────
#
# They belong to whichever identity the operator acts as, and under federation
# that is this profile. The design says so in as many words: the runtime role's
# trust policy lists the operator principal so the workstation can chain into
# the role for read-only probes, and the operator principal is now an assumed
# role rather than a user.
#
# Without them a dev-and-tester's permission set is a role that exists on paper:
# staging's runtime trust already names it, and the only script that wrote these
# stanzas chained them off a key that tier never holds, so the one suite that
# uses them refused with a message about the wrong thing.
#
# Staging for everybody. Production only for the super-admin set, because
# production's runtime trust names that role and not the other: written for a
# dev-and-tester it would be a profile that resolves and cannot assume, which
# every workstation check would then report as a fault rather than as the
# boundary working.
echo ""
echo "==> Ensuring the chained runtime profiles in ${CONFIG_FILE}"
_rt_names="$STAGING_RUNTIME_PROFILE"
[[ "$ROLE_NAME" == "$SUPER_ADMIN_ROLE" ]] && _rt_names="${_rt_names} ${PRODUCTION_RUNTIME_PROFILE}"
for _rt in $_rt_names; do
  case "$_rt" in
    *staging*)    _role_arn="$STAGING_ROLE_ARN" ;;
    *production*) _role_arn="$PRODUCTION_ROLE_ARN" ;;
  esac
  # Status captured rather than read from `$?`: "already present" is a non-zero
  # return and a normal outcome, and under `set -e` a bare call would abort the
  # run on exactly the path a re-run takes.
  _rc=0
  aws_config_add_role_profile "$CONFIG_FILE" "$_rt" "$_role_arn" "$PROFILE" "$REGION" || _rc=$?
  case $_rc in
    0) echo "    ${_rt}: written, chaining from [profile ${PROFILE}]" ;;
    2)
      echo "    ${_rt}: already present, left untouched"
      # Reported rather than rewritten, because a config section is the
      # operator's and may carry a duration or an mfa_serial set deliberately.
      # Worth naming all the same: a chain still sourcing the key profile works,
      # since both runtime trust policies name that user, but its calls are
      # attributed to the shared IAM user rather than to a person, which is the
      # thing this whole move exists to end.
      if [[ "$(aws_config_profile_source "$CONFIG_FILE" "$_rt")" == "$FOOTBAG_OPERATOR_KEY_PROFILE" ]]; then
        echo "      note: it chains from [profile ${FOOTBAG_OPERATOR_KEY_PROFILE}], so its calls"
        echo "      are attributed to the shared IAM user rather than to you. It works."
        echo "      To move it, delete that section and re-run this."
      fi
      ;;
    *)
      echo "ERROR: could not write ${_rt}: ${AWS_CRED_ERROR}" >&2
      exit 1
      ;;
  esac
done
unset _rt _rt_names _role_arn _rc

if [[ "$ROLE_NAME" == "$DEV_TESTER_ROLE" ]]; then
  echo ""
  echo "No production runtime profile was written, deliberately: production's runtime"
  echo "role does not trust the dev-and-tester set, so the profile would resolve and"
  echo "then fail to assume. That boundary is the permission set working."
fi

echo ""
echo "Written. One step left, and it is yours because it needs a browser and a"
echo "second factor:"
echo ""
echo "  aws sso login --profile ${PROFILE}"
echo ""
echo "After that, every script here finds this profile on its own. Nothing asks"
echo "you to export anything, in this shell or any other."
