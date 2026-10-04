#!/usr/bin/env bash
# accept-dev-tester-onboarding.sh
#
# Run by a dev-and-tester on their own computer, from their clone of the public
# repository, to open the sealed onboarding a footbag-operator holder made for
# them with scripts/onboard-dev-tester.sh and put everything in it where the
# tooling expects it. At the end they reach staging only as themselves, through
# scripts/as-dev-tester.sh --account <their name>, with a sudo password nobody
# else has ever known.
#
# WHY THIS EXISTS.
#
# The delivery holds a one-time host password, an IAM access key, the account's
# role ARNs and the staging host's pinned keys. Each has one right place on this
# machine, several of those places are files the person already owns, and every
# one of them fails later, and silently, when placed by hand: a profile without
# the session-name line is refused by the job role, a pin line missing its
# bracketed port verifies nothing, a stanza with the wrong user connects as
# somebody else. So this run places each one, shows the change first, proves
# it, and replaces the one-time password before it can be forgotten.
#
# WHAT IT REFUSES TO DO.
#
#   - Open a delivery addressed to another account or environment than the one
#     named, or one whose contents are not exactly the known format. It is read,
#     never run.
#   - Write a [footbag-operator] section, or change any AWS section but this
#     person's own. The job role's profile is added only where absent, and one
#     that already chains from somebody else is refused.
#   - Use a key pair whose private half is not the public half's own, or copy
#     over one half of a pair already at the path the tooling uses.
#   - Take the job-role profile's word for the grant. The CLI answers it from
#     its session cache, so the grant is proved by a fresh session signed with
#     the new key, and this person's cached sessions are removed when the key
#     changes.
#   - Edit an SSH stanza this machine already carries. A missing one is written.
#   - Leave the one-time password standing, or accept a new one shorter than 12
#     characters.
#   - Leave a cleartext copy of the delivery anywhere: it is opened into a
#     mode-600 temp file shredded on every way out, and the sealed file itself
#     is deleted only after everything is proved, on a typed APPLY.
#
#   - Write the staging runtime profile on a machine whose AWS config carries a
#     footbag-operator profile. That name is the administrators' chain there, and
#     a holder onboarding themselves keeps it exactly as it is.
#   - Rewrite the pin file when it already verifies the staging host with the
#     delivered keys, however those lines happen to be written.
#   - Need the private operations checkout. Nothing here, nor in the workstation
#     setup it ends with, reads it.
#
# Every step is shown before it changes anything, confirmed with APPLY, and
# skipped when its outcome is already proven, so a run that stopped part way is
# finished by running the same command again. Before it opens anything it checks
# every tool the staging work needs (age, the pinned AWS CLI and Terraform,
# docker, jq, rsync, sqlite3), with ~/.local/bin first on the path, where the
# workstation setup installs them. It ends behind one APPLY with the full
# workstation setup and its check, both run through the wrapper as you, and an
# evidence block for the onboarding card.
#
# Usage, with the sealed file in ~/Downloads, ~/AWS or the current directory:
#   bash scripts/accept-dev-tester-onboarding.sh --target staging \
#     --account james_leberknight
# or naming it:
#   bash scripts/accept-dev-tester-onboarding.sh --target staging \
#     --account james_leberknight ~/somewhere/james_leberknight-staging.onboarding.age
#
# A holder who onboarded themselves runs this on the same machine, exactly as
# anybody else runs it on theirs. It writes no footbag-operator section, edits
# no stanza this machine already carries, and adds the staging runtime profile
# only where none exists, so a machine that already works as footbag-operator
# keeps working that way, and the named identity is reached only through
# scripts/as-dev-tester.sh.
#
# Flags:
#   --target staging          the environment the onboarding is for; required
#   --account <first_last>    your account name, as the holder onboarded you
#   <sealed file>             the .onboarding.age file the holder sent you;
#                             found by name when left out
#
# Test seams (CI only; nobody else sets these):
#   ACCEPT_AWS_BIN            replaces the aws CLI
#   ACCEPT_AGE_BIN            replaces age
#   ACCEPT_SSH_BIN            replaces ssh for the connections to the host
#   ACCEPT_SSH_ADD_BIN        replaces ssh-add
#   ACCEPT_SETUP_CMD          replaces the wrapped workstation setup it ends with
#   ACCEPT_PROPAGATION_POLL   seconds between identity polls (5)
#   ACCEPT_PROPAGATION_TRIES  how many polls before giving up (60)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Where the workstation setup installs the pinned AWS CLI and the Python tools,
# ahead of any older copy elsewhere on the path, for this run and its children.
PATH="${HOME}/.local/bin:${PATH}"
export PATH

# shellcheck source=lib/terminal.sh
source "${SCRIPT_DIR}/lib/terminal.sh"
# confirm_from_tty, and the unconditional assignment of ASSUME_YES.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/secret-file.sh
source "${SCRIPT_DIR}/lib/secret-file.sh"
# shellcheck source=lib/dev-tester-delivery.sh
source "${SCRIPT_DIR}/lib/dev-tester-delivery.sh"
# shellcheck source=lib/aws-credentials-file.sh
source "${SCRIPT_DIR}/lib/aws-credentials-file.sh"
# shellcheck source=lib/aws-identity.sh
source "${SCRIPT_DIR}/lib/aws-identity.sh"
# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# shellcheck source=lib/ssh-alias.sh
source "${SCRIPT_DIR}/lib/ssh-alias.sh"
# shellcheck source=lib/operator-ssh-key.sh
source "${SCRIPT_DIR}/lib/operator-ssh-key.sh"
# shellcheck source=lib/operator-credential.sh
source "${SCRIPT_DIR}/lib/operator-credential.sh"
# shellcheck source=lib/vendor-secret.sh
source "${SCRIPT_DIR}/lib/vendor-secret.sh"

AWS_BIN="${ACCEPT_AWS_BIN:-aws}"
AWS_IDENTITY_BIN="$AWS_BIN"
AGE_BIN="${ACCEPT_AGE_BIN:-age}"
SSH_BIN="${ACCEPT_SSH_BIN:-ssh}"
POLL="${ACCEPT_PROPAGATION_POLL:-5}"
POLL_TRIES="${ACCEPT_PROPAGATION_TRIES:-60}"
SSH_ADD_BIN="${ACCEPT_SSH_ADD_BIN:-ssh-add}"
REMOTE_HALF="${SCRIPT_DIR}/internal/change-own-password-remote.sh"

DEV_TESTER_PROFILE="FootbagDevTester"
STAGING_RUNTIME_PROFILE="footbag-staging-runtime"

TARGET=""
ACCOUNT=""
SEALED=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --account) ACCOUNT="${2:-}"; shift 2 || { echo "ERROR: --account requires an argument" >&2; exit 2; } ;;
    -h|--help) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"; exit 0 ;;
    -*) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
    *)
      [[ -z "$SEALED" ]] || { echo "ERROR: one sealed file, not two." >&2; exit 2; }
      SEALED="$1"; shift ;;
  esac
done

# ── Arguments ────────────────────────────────────────────────────────────────

if [[ "$TARGET" != "staging" ]]; then
  echo "ERROR: --target staging is required. A dev-and-tester reaches staging only." >&2
  exit 2
fi
if [[ "$ACCOUNT" == "footbag-operator" || "$ACCOUNT" == "footbag" ]]; then
  echo "ERROR: '${ACCOUNT}' is not a person's account. Nothing done." >&2
  exit 2
fi
if [[ ! "$ACCOUNT" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)+$ || ${#ACCOUNT} -gt 32 ]]; then
  echo "ERROR: '${ACCOUNT}' is not an account name: firstname_lastname, lower case." >&2
  exit 2
fi
# Every tool the staging work needs, before anything is opened: a machine that
# accepts and then cannot deploy or test has an onboarding nobody can use.
delivery_require_tools "age=${AGE_BIN}" "ssh=${SSH_BIN}" ssh-keygen=ssh-keygen \
  openssl=openssl "aws=${AWS_BIN}" terraform=terraform docker=docker jq=jq \
  rsync=rsync sqlite3=sqlite3 || exit 1
# Present is not enough for two of them. The AWS CLI and Terraform are pinned,
# and each pin is read from the one place that sets it rather than copied here.
# shellcheck source=lib/tool-report.sh
source "${SCRIPT_DIR}/lib/tool-report.sh"
WRONG_VERSIONS=()
AWS_PIN="$(sed -n 's/^AWS_CLI_VERSION="\(.*\)"$/\1/p' "${SCRIPT_DIR}/setup-dev-workstation.sh")"
if [[ "$("$AWS_BIN" --version 2>&1)" != "aws-cli/${AWS_PIN} "* ]]; then
  WRONG_VERSIONS+=("the AWS CLI is not ${AWS_PIN}, the version the scripts are written for")
fi
TF_PROBLEM="$(_tool_report_check terraform "$REPO_ROOT")"
[[ -z "$TF_PROBLEM" ]] || WRONG_VERSIONS+=("${TF_PROBLEM%% Install*}")
if (( ${#WRONG_VERSIONS[@]} )); then
  echo "ERROR: the right tools are here, at the wrong versions:" >&2
  printf '  - %s\n' "${WRONG_VERSIONS[@]}" >&2
  echo "Nothing was changed on this machine. Install the pinned versions with:" >&2
  echo "  bash scripts/setup-dev-workstation.sh --operator --account ${ACCOUNT}" >&2
  echo "then run this again." >&2
  exit 1
fi

# The sealed file: as named, or found by its own name where people put files
# they were sent. Exactly one is used; two copies in different places are asked
# about rather than chosen between.
if [[ -z "$SEALED" ]]; then
  SEALED_NAME="${ACCOUNT}-${TARGET}.onboarding.age"
  declare -A SEEN=()
  FOUND_SEALED=()
  for where in "${HOME}/Downloads" "${HOME}/AWS" "$PWD"; do
    candidate="${where}/${SEALED_NAME}"
    [[ -f "$candidate" ]] || continue
    real="$(readlink -f -- "$candidate")"
    [[ -n "${SEEN[$real]:-}" ]] && continue
    SEEN[$real]=1
    FOUND_SEALED+=("$candidate")
  done
  if (( ${#FOUND_SEALED[@]} == 0 )); then
    echo "ERROR: no ${SEALED_NAME} in ~/Downloads, ~/AWS or here. Put the file the" >&2
    echo "       holder sent you in one of those, or name it on the command line." >&2
    exit 2
  fi
  if (( ${#FOUND_SEALED[@]} > 1 )); then
    echo "ERROR: more than one ${SEALED_NAME}:" >&2
    printf '         %s\n' "${FOUND_SEALED[@]}" >&2
    echo "       Name the one to use on the command line." >&2
    exit 2
  fi
  SEALED="${FOUND_SEALED[0]}"
  echo "==> Using ${SEALED}"
fi
if [[ ! -f "$SEALED" ]]; then
  echo "ERROR: ${SEALED} is not a file. Name the sealed .onboarding.age file the" >&2
  echo "       holder sent you." >&2
  exit 2
fi
[[ "$AGE_BIN" != "age" ]] && echo "SYNTHETIC: age='${AGE_BIN}' -- nothing is really opened." >&2
[[ "$AWS_BIN" != "aws" ]] && echo "SYNTHETIC: aws='${AWS_BIN}' -- nothing proves an identity." >&2
[[ "$SSH_BIN" != "ssh" ]] && echo "SYNTHETIC: ssh='${SSH_BIN}' -- no host is reached." >&2

if ! terminal_present --with-stdin; then
  echo "ERROR: run this from an interactive terminal. Every step is confirmed by" >&2
  echo "       a typed word, and your new password is typed. Nothing done." >&2
  exit 1
fi

BUNDLE=""
NEW_PASS=""
accept_cleanup() {
  NEW_PASS=""
  DELIVERY_HOST_PASSWORD=""
  DELIVERY_AWS_SECRET_ACCESS_KEY=""
  secret_file_sweep
  return 0
}
trap accept_cleanup EXIT
# An interrupt ends the run. Cleaning up and carrying on would reach the next
# step with the secrets blanked, and report the delivery as used when it is not.
trap 'accept_cleanup; exit 130' INT TERM

step() { printf '\n==> %s\n' "$1"; }

# ── 1. The key pair the delivery was sealed to ───────────────────────────────

step "Your key pair"
SEALED_TAGS="$(delivery_age_header_tags "$SEALED")"
if [[ -z "$SEALED_TAGS" || "$(grep -c . <<<"$SEALED_TAGS")" != "1" ]]; then
  echo "ERROR: ${SEALED} is not sealed to exactly one SSH key. Ask the holder who" >&2
  echo "       sent it to run the onboarding again." >&2
  exit 1
fi
NAMED_KEY="${HOME}/.ssh/id_ed25519_${ACCOUNT}"
pub_tag() { delivery_age_recipient_tag "$(grep -m1 . "$1" 2>/dev/null)" 2>/dev/null || true; }

# require_pair <private> <public>
# Refuses unless the private half is the one the public half belongs to, proved
# by deriving the public key from it. The tag check below reads only the public
# half, and a private file that does not match it is found only when age fails
# to open the delivery, with an error that does not say why. ssh-keygen asks
# for the key's passphrase on the terminal, if it has one, and a key it cannot
# read is refused as unreadable rather than as a mismatch, so the message
# points at the real cause.
require_pair() {
  local derived
  if ! derived="$(ssh-keygen -y -f "$1")" || [[ -z "$derived" ]]; then
    echo "ERROR: ssh-keygen could not read the private key ${1}." >&2
    echo "       A wrong passphrase, a file that is not a private key, or one that" >&2
    echo "       other users can read (ssh-keygen refuses those) all end here." >&2
    echo "       Nothing was copied or opened." >&2
    exit 1
  fi
  if [[ "$(cut -d' ' -f2 <<<"$derived")" != "$(grep -m1 . "$2" | cut -d' ' -f2)" ]]; then
    echo "ERROR: ${1} is not the private half of ${2}." >&2
    echo "       Nothing was copied or opened. Move the wrong file aside and re-run." >&2
    exit 1
  fi
}

# One half at the named path without the other is somebody else's file. The
# copy below would skip the half that is there and bring in the other, leaving
# two halves that do not belong together.
if [[ -e "$NAMED_KEY" && ! -e "${NAMED_KEY}.pub" ]] || [[ ! -e "$NAMED_KEY" && -e "${NAMED_KEY}.pub" ]]; then
  echo "ERROR: only one half of the key pair is at the path the tooling uses:" >&2
  echo "         ${NAMED_KEY}      $([[ -e "$NAMED_KEY" ]] && echo present || echo missing)" >&2
  echo "         ${NAMED_KEY}.pub  $([[ -e "${NAMED_KEY}.pub" ]] && echo present || echo missing)" >&2
  echo "       Nothing was copied or opened. Move the one that is there aside, or" >&2
  echo "       put its other half beside it, and re-run." >&2
  exit 1
fi

echo "  Checking that the private half matches the public one (a key with a"
echo "  passphrase asks for it here)."
if [[ -f "${NAMED_KEY}.pub" ]]; then
  if [[ "$(pub_tag "${NAMED_KEY}.pub")" != "$SEALED_TAGS" ]]; then
    echo "ERROR: ${NAMED_KEY} is not the key this delivery was sealed to. Nothing" >&2
    echo "       was moved or opened. Send the holder the public key you meant." >&2
    exit 1
  fi
  require_pair "$NAMED_KEY" "${NAMED_KEY}.pub"
  echo "  ${NAMED_KEY} is the pair this delivery was sealed to"
else
  FOUND=()
  for candidate in "${HOME}"/.ssh/*.pub; do
    [[ -f "$candidate" && -f "${candidate%.pub}" ]] || continue
    [[ "$(pub_tag "$candidate")" == "$SEALED_TAGS" ]] && FOUND+=("${candidate%.pub}")
  done
  if (( ${#FOUND[@]} != 1 )); then
    echo "ERROR: ${#FOUND[@]} key pairs in ~/.ssh match the key this delivery was sealed" >&2
    echo "       to; exactly one must. Nothing was moved or opened." >&2
    exit 1
  fi
  require_pair "${FOUND[0]}" "${FOUND[0]}.pub"
  # Copied, never moved. The pair may be the one this machine signs everything
  # else with, and moving it would break each of those without a word; a copy
  # leaves every other use of it as it was.
  echo "  The delivery was sealed to ${FOUND[0]}. The tooling expects that pair at"
  echo "  ${NAMED_KEY}, so both halves are copied there, unchanged. The original"
  echo "  stays where it is, and nothing else that uses it changes:"
  echo "    ${FOUND[0]}      -> ${NAMED_KEY}"
  echo "    ${FOUND[0]}.pub  -> ${NAMED_KEY}.pub"
  if ! confirm_from_tty "Type 'APPLY' to copy the pair: " "APPLY"; then
    echo "Not confirmed; nothing copied." >&2
    exit 1
  fi
  cp -n -p -- "${FOUND[0]}" "$NAMED_KEY"
  cp -n -p -- "${FOUND[0]}.pub" "${NAMED_KEY}.pub"
  chmod 600 -- "$NAMED_KEY"
  [[ -f "$NAMED_KEY" && -f "${NAMED_KEY}.pub" ]] || { echo "ERROR: the copy did not land." >&2; exit 1; }
  require_pair "$NAMED_KEY" "${NAMED_KEY}.pub"
  echo "  copied"
fi

# A key with a passphrase is asked for it on every connection the staging work
# makes, which is dozens per deploy. An agent holding it for a working day asks
# once. Offered, never done unasked, and only where an agent is running; the
# lifetime means the key leaves the agent on its own.
if [[ -n "${SSH_AUTH_SOCK:-}" ]] && command -v "$SSH_ADD_BIN" >/dev/null 2>&1; then
  AGENT_KEYS="$("$SSH_ADD_BIN" -l 2>/dev/null || true)"
  NAMED_FP="$(ssh-keygen -l -f "${NAMED_KEY}.pub" 2>/dev/null | awk '{print $2}')"
  if [[ -n "$NAMED_FP" ]] && ! grep -qF -- "$NAMED_FP" <<<"$AGENT_KEYS"; then
    echo "  Your SSH agent is running and does not hold this key. Adding it for eight"
    echo "  hours means its passphrase, if it has one, is asked for once rather than on"
    echo "  every connection the staging work makes."
    if confirm_from_tty "Type 'APPLY' to add it to the agent for eight hours: " "APPLY"; then
      "$SSH_ADD_BIN" -t 8h "$NAMED_KEY" || echo "  not added; every connection will ask instead"
    else
      echo "  not added; every connection will ask for the passphrase instead"
    fi
  fi
fi

# ── 2. Open the delivery ─────────────────────────────────────────────────────

step "Opening the delivery"
BUNDLE="$(umask 077 && mktemp)"
secret_file_register "$BUNDLE"
# age asks for the key's passphrase itself, on the terminal, if it has one.
if ! "$AGE_BIN" -d -i "$NAMED_KEY" -o "$BUNDLE" "$SEALED"; then
  echo "ERROR: age could not open ${SEALED} with ${NAMED_KEY}." >&2
  exit 1
fi
if ! delivery_bundle_parse "$BUNDLE"; then
  echo "ERROR: the delivery is not in the expected format: ${DELIVERY_ERROR}." >&2
  exit 1
fi
secret_file_destroy "$BUNDLE"
if [[ "$DELIVERY_ACCOUNT" != "$ACCOUNT" || "$DELIVERY_TARGET" != "$TARGET" ]]; then
  echo "ERROR: this delivery is for ${DELIVERY_ACCOUNT} on ${DELIVERY_TARGET}, not ${ACCOUNT} on" >&2
  echo "       ${TARGET}. Nothing was changed." >&2
  exit 1
fi
if ! aws_cred_key_id_looks_valid "$DELIVERY_AWS_ACCESS_KEY_ID" \
   || ! aws_cred_secret_looks_valid "$DELIVERY_AWS_SECRET_ACCESS_KEY" \
   || [[ ! "$DELIVERY_AWS_ACCOUNT_ID" =~ ^[0-9]{12}$ ]] \
   || [[ "$DELIVERY_DEV_TESTER_ROLE_ARN" != "arn:aws:iam::${DELIVERY_AWS_ACCOUNT_ID}:role/${DEV_TESTER_PROFILE}" ]] \
   || [[ "$DELIVERY_STAGING_RUNTIME_ROLE_ARN" != "arn:aws:iam::${DELIVERY_AWS_ACCOUNT_ID}:role/"* ]] \
   || [[ ! "$DELIVERY_HOST_ADDRESS" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] \
   || [[ ! "$DELIVERY_HOST_PORT" =~ ^[0-9]{1,5}$ ]]; then
  echo "ERROR: a value in the delivery is not the shape it must be. Nothing was" >&2
  echo "       changed; ask the holder to run the onboarding again." >&2
  exit 1
fi
for _pin in "${DELIVERY_PINS[@]}"; do
  case "$_pin" in
    "${DELIVERY_HOST_ADDRESS} "*|"[${DELIVERY_HOST_ADDRESS}]:${DELIVERY_HOST_PORT} "*) ;;
    *) echo "ERROR: a pin line in the delivery names another host. Nothing changed." >&2; exit 1 ;;
  esac
done
echo "  opened: ${ACCOUNT} on ${TARGET}, host ${DELIVERY_HOST_ADDRESS}, key ${DELIVERY_AWS_ACCESS_KEY_ID}"

# ── 3. Your AWS profiles ─────────────────────────────────────────────────────

step "Your AWS profiles"
CRED_FILE="${AWS_SHARED_CREDENTIALS_FILE:-${HOME}/.aws/credentials}"
CONFIG_FILE="${AWS_CONFIG_FILE:-${HOME}/.aws/config}"
CURRENT_KEY="$(aws_cred_current_key_id "$CRED_FILE" "$ACCOUNT")"
DT_SOURCE="$(aws_config_profile_source "$CONFIG_FILE" "$DEV_TESTER_PROFILE" || true)"
if [[ -n "$DT_SOURCE" && "$DT_SOURCE" != "$ACCOUNT" ]]; then
  echo "ERROR: [profile ${DEV_TESTER_PROFILE}] in ${CONFIG_FILE} already chains from" >&2
  echo "       [${DT_SOURCE}], so this machine's job-role profile is somebody else's." >&2
  echo "       It is left alone. Nothing was changed." >&2
  exit 1
fi
RT_PRESENT=0
aws_config_has_profile "$CONFIG_FILE" "$STAGING_RUNTIME_PROFILE" && RT_PRESENT=1
# On a machine that also carries the directly authenticated identity's profile,
# the staging runtime profile is that identity's chain, administrative tooling
# relies on it, and it is never written from here, present or absent: a chain
# through the job role under that name would quietly change what every
# administrator run on this machine acts as. This decides only whether to write
# a file entry, never who anybody is; the profile list is the CLI's own answer.
OPERATOR_PROFILE_HERE=0
if grep -qx 'footbag-operator' <<<"$("$AWS_BIN" configure list-profiles 2>/dev/null || true)"; then
  OPERATOR_PROFILE_HERE=1
fi
WRITE_RT=0
(( ! RT_PRESENT && ! OPERATOR_PROFILE_HERE )) && WRITE_RT=1

# The CLI keeps each job-role session it is issued in its cache and answers the
# profile from there until the session expires, up to an hour. A re-onboarding
# leaves the profile exactly as it was, so a session cached before an offboard
# would go on being used, and the role refuses every one of those. Only this
# person's job-role sessions are removed, found by the role and session name the
# cache file records; the CLI asks for a fresh one on its next call.
CLI_CACHE="${HOME}/.aws/cli/cache"
clear_cached_sessions() {
  local f cleared=0
  [[ -d "$CLI_CACHE" ]] || return 0
  for f in "$CLI_CACHE"/*.json; do
    [[ -f "$f" ]] || continue
    grep -qF -- "assumed-role/${DEV_TESTER_PROFILE}/${ACCOUNT}\"" "$f" || continue
    secret_file_destroy "$f"
    echo "    removed a cached ${DEV_TESTER_PROFILE} session of ${ACCOUNT}'s: ${f}"
    cleared=1
  done
  (( cleared )) || echo "    no cached ${DEV_TESTER_PROFILE} session of ${ACCOUNT}'s to remove"
}

if (( ! RT_PRESENT && OPERATOR_PROFILE_HERE )); then
  echo "  This machine carries a footbag-operator profile, so [profile ${STAGING_RUNTIME_PROFILE}]"
  echo "  is the administrators' chain here and is not written by this run."
fi
if [[ "$CURRENT_KEY" == "$DELIVERY_AWS_ACCESS_KEY_ID" && -n "$DT_SOURCE" ]] && (( ! WRITE_RT )); then
  echo "  already in place: [${ACCOUNT}] holds ${CURRENT_KEY}, and the job-role profile exists"
else
  echo "  In ${CRED_FILE}:"
  if [[ -z "$CURRENT_KEY" ]]; then
    echo "    add [${ACCOUNT}] holding ${DELIVERY_AWS_ACCESS_KEY_ID} (the secret is not shown)"
  elif [[ "$CURRENT_KEY" != "$DELIVERY_AWS_ACCESS_KEY_ID" ]]; then
    echo "    [${ACCOUNT}] now holds ${CURRENT_KEY}, which the onboarding retired; it will"
    echo "    hold ${DELIVERY_AWS_ACCESS_KEY_ID} instead (the secret is not shown)"
  else
    echo "    [${ACCOUNT}] already holds ${CURRENT_KEY}"
  fi
  echo "  In ${CONFIG_FILE}, appended where absent and never edited:"
  if [[ -z "$DT_SOURCE" ]]; then
    echo "    [profile ${DEV_TESTER_PROFILE}]"
    echo "    role_arn          = ${DELIVERY_DEV_TESTER_ROLE_ARN}"
    echo "    source_profile    = ${ACCOUNT}"
    echo "    role_session_name = ${ACCOUNT}"
    echo "    region            = us-east-1"
  fi
  if (( WRITE_RT )); then
    echo "    [profile ${STAGING_RUNTIME_PROFILE}]"
    echo "    role_arn          = ${DELIVERY_STAGING_RUNTIME_ROLE_ARN}"
    echo "    source_profile    = ${DEV_TESTER_PROFILE}"
    echo "    region            = us-east-1"
  fi
  if ! confirm_from_tty "Type 'APPLY' to write them: " "APPLY"; then
    echo "Not confirmed; nothing written." >&2
    exit 1
  fi
  if [[ "$CURRENT_KEY" != "$DELIVERY_AWS_ACCESS_KEY_ID" ]]; then
    aws_cred_put "$CRED_FILE" "$ACCOUNT" "$DELIVERY_AWS_ACCESS_KEY_ID" "$DELIVERY_AWS_SECRET_ACCESS_KEY" || {
      echo "ERROR: could not write the credential: ${AWS_CRED_ERROR}" >&2; exit 1; }
    clear_cached_sessions
  fi
  if [[ -z "$DT_SOURCE" ]]; then
    aws_config_add_role_profile "$CONFIG_FILE" "$DEV_TESTER_PROFILE" \
      "$DELIVERY_DEV_TESTER_ROLE_ARN" "$ACCOUNT" us-east-1 "$ACCOUNT" || {
      echo "ERROR: could not write [profile ${DEV_TESTER_PROFILE}]: ${AWS_CRED_ERROR}" >&2; exit 1; }
  fi
  if (( WRITE_RT )); then
    aws_config_add_role_profile "$CONFIG_FILE" "$STAGING_RUNTIME_PROFILE" \
      "$DELIVERY_STAGING_RUNTIME_ROLE_ARN" "$DEV_TESTER_PROFILE" us-east-1 || {
      echo "ERROR: could not write [profile ${STAGING_RUNTIME_PROFILE}]: ${AWS_CRED_ERROR}" >&2; exit 1; }
  fi
  echo "  written"
fi
DELIVERY_AWS_SECRET_ACCESS_KEY=""

# ── 4. Prove the identity ────────────────────────────────────────────────────
#
# A key minted minutes ago is refused as invalid for a while: IAM is eventually
# consistent. Polled until it resolves or the wait runs out; the proofs then
# judge the outcome either way.

step "Proving who you are on AWS"
# The job role is proved by a fresh assume signed with the new key itself, never
# through the role profile, which the CLI can answer from a session it cached
# before an offboard; that session would pass every proof here and then be
# refused on real work.
FRESH_CALL=(sts assume-role --profile "$ACCOUNT" --role-arn "$DELIVERY_DEV_TESTER_ROLE_ARN"
  --role-session-name "$ACCOUNT" --query AssumedRoleUser.Arn --output text --region us-east-1)
FRESH_WANT="arn:aws:sts::${DELIVERY_AWS_ACCOUNT_ID}:assumed-role/${DEV_TESTER_PROFILE}/${ACCOUNT}"
FRESH_ARN=""
for (( try = 0; try <= POLL_TRIES; try++ )); do
  if (( try )); then
    (( try == 1 )) && echo "  waiting for the new key to take effect (up to $(( POLL * POLL_TRIES ))s)"
    sleep "$POLL"
  fi
  FRESH_ARN="$("$AWS_BIN" "${FRESH_CALL[@]}" 2>/dev/null)" && break
  FRESH_ARN=""
done
aws_identity_require_user "$ACCOUNT" "$ACCOUNT" || exit 1
echo "  [${ACCOUNT}] is IAM user ${ACCOUNT}"
if [[ "$FRESH_ARN" != "$FRESH_WANT" ]]; then
  echo "ERROR: a fresh session of ${DEV_TESTER_PROFILE}, signed with your new key, was not" >&2
  echo "       issued as ${FRESH_WANT}." >&2
  if [[ -n "$FRESH_ARN" ]]; then
    echo "       It came back as ${FRESH_ARN}." >&2
  else
    echo "       AWS said:" >&2
    "$AWS_BIN" "${FRESH_CALL[@]}" 2>&1 >/dev/null | sed 's/^/         /' >&2 || true
  fi
  echo "       A key made minutes ago can take a while longer to be honoured. Wait a" >&2
  echo "       few minutes and run the same command again; every step already done" >&2
  echo "       is found done:" >&2
  echo "         bash scripts/accept-dev-tester-onboarding.sh --target ${TARGET} --account ${ACCOUNT}" >&2
  echo "       If it still fails, ask the holder who onboarded you to check your grant." >&2
  exit 1
fi
echo "  a fresh ${DEV_TESTER_PROFILE} session, signed with your new key: ${FRESH_ARN}"
aws_identity_resolve "$DEV_TESTER_PROFILE" || exit 1
aws_identity_require_assumed_role "$DEV_TESTER_PROFILE" || exit 1
if [[ "$AWS_IDENTITY_SESSION_NAME" != "$ACCOUNT" ]]; then
  echo "ERROR: the ${DEV_TESTER_PROFILE} session is named '${AWS_IDENTITY_SESSION_NAME}', not ${ACCOUNT}." >&2
  exit 1
fi
echo "  [profile ${DEV_TESTER_PROFILE}] assumes ${DEV_TESTER_PROFILE} as ${ACCOUNT}"

# The chain the staging work runs on, proved where this run wrote it or where it
# already runs through the job role. On a machine whose runtime profile chains
# from footbag-operator, it is that machine's administrative chain: it is left
# as it is, and proving it here would be a fact about somebody else's identity.
RT_ROLE="${DELIVERY_STAGING_RUNTIME_ROLE_ARN##*/}"
RT_SOURCE="$(aws_config_profile_source "$CONFIG_FILE" "$STAGING_RUNTIME_PROFILE" || true)"
if [[ "$RT_SOURCE" == "$DEV_TESTER_PROFILE" ]]; then
  aws_identity_resolve "$STAGING_RUNTIME_PROFILE" || exit 1
  aws_identity_require_assumed_role "$RT_ROLE" || exit 1
  echo "  [profile ${STAGING_RUNTIME_PROFILE}] chains through ${DEV_TESTER_PROFILE} to ${RT_ROLE}"
else
  echo "  [profile ${STAGING_RUNTIME_PROFILE}] chains from [${RT_SOURCE:-nothing}] on this machine,"
  echo "    not through ${DEV_TESTER_PROFILE}, so it is left as it is and not proved here"
fi

# ── 5. The pinned host keys ──────────────────────────────────────────────────

step "The staging host's pinned keys"
PIN="${FOOTBAG_KNOWN_HOSTS:-$FOOTBAG_KNOWN_HOSTS_DEFAULT}"
# A delivered pin is already in place when the file verifies that host with that
# key, which is what ssh asks; how the line is written (hashed, combined with
# other names, in another order) is not the question. So a pin file that already
# works, an administrator's included, is left byte for byte.
MISSING=()
for _pin in "${DELIVERY_PINS[@]}"; do
  _pin_host="${_pin%% *}"
  _pin_key="$(cut -d' ' -f2,3 <<<"$_pin")"
  if [[ -f "$PIN" ]] \
     && grep -qF -- "$_pin_key" <<<"$(ssh-keygen -F "$_pin_host" -f "$PIN" 2>/dev/null)"; then
    continue
  fi
  MISSING+=("$_pin")
done
unset _pin_host _pin_key
if (( ${#MISSING[@]} == 0 )); then
  echo "  already pinned in ${PIN}"
else
  echo "  Into ${PIN}, replacing any older lines for ${DELIVERY_HOST_ADDRESS} and keeping every other host's:"
  printf '    %s\n' "${DELIVERY_PINS[@]}"
  if ! confirm_from_tty "Type 'APPLY' to pin them: " "APPLY"; then
    echo "Not confirmed; nothing written." >&2
    exit 1
  fi
  PIN_DIR="$(dirname -- "$PIN")"
  mkdir -p -m 700 -- "$PIN_DIR"
  PIN_TMP="$(umask 077 && mktemp "${PIN_DIR}/.footbag_known_hosts.XXXXXX")"
  secret_file_register "$PIN_TMP"
  # A line is dropped only when one of its host names IS this address, bare or
  # with a port. A substring test would also drop 11.2.3.4 while replacing
  # 1.2.3.4, silently unpinning another host.
  if [[ -f "$PIN" ]]; then
    while IFS= read -r _pin_line; do
      _pin_keep=1
      IFS=',' read -r -a _pin_hosts <<<"${_pin_line%% *}"
      for _pin_host in "${_pin_hosts[@]}"; do
        if [[ "$_pin_host" == "$DELIVERY_HOST_ADDRESS" \
              || "$_pin_host" == "[${DELIVERY_HOST_ADDRESS}]:"* ]]; then
          _pin_keep=0
        fi
      done
      (( _pin_keep )) && printf '%s\n' "$_pin_line" >> "$PIN_TMP"
    done < "$PIN"
    unset _pin_line _pin_keep _pin_hosts _pin_host
  fi
  printf '%s\n' "${DELIVERY_PINS[@]}" >> "$PIN_TMP"
  chmod 600 "$PIN_TMP"
  mv -f -- "$PIN_TMP" "$PIN"
fi
if ! grep -q '^[^#]' <<< "$(ssh-keygen -F "$DELIVERY_HOST_ADDRESS" -f "$PIN" 2>/dev/null)" \
   || ! grep -q '^[^#]' <<< "$(ssh-keygen -F "[${DELIVERY_HOST_ADDRESS}]:${DELIVERY_HOST_PORT}" -f "$PIN" 2>/dev/null)"; then
  echo "ERROR: ${PIN} does not verify for ${DELIVERY_HOST_ADDRESS} on both ports." >&2
  exit 1
fi
echo "  verified on port 22 and port ${DELIVERY_HOST_PORT}"
FOOTBAG_KNOWN_HOSTS="$PIN"
require_pinned_known_hosts || exit 1

# ── 6. The SSH alias ─────────────────────────────────────────────────────────

ALIAS="footbag-${TARGET}"
SSH_CONFIG="${HOME}/.ssh/config"
step "The ${ALIAS} alias in ${SSH_CONFIG}"
STANZA_TMP="$(umask 077 && mktemp)"
secret_file_register "$STANZA_TMP"
_rc=0
ssh_alias_add_stanza "$SSH_CONFIG" "$ALIAS" "$DELIVERY_HOST_ADDRESS" "$DELIVERY_HOST_PORT" "$STANZA_TMP" || _rc=$?
case "$_rc" in
  0)
    echo "  This machine has no ${ALIAS} stanza. The one added connects as the shared"
    echo "  account by default, which yours cannot log in to; your own account is"
    echo "  reached through the block added below it, only through the wrapper:"
    echo ""
    if [[ -f "$SSH_CONFIG" ]]; then
      diff -u "$SSH_CONFIG" "$STANZA_TMP" || true
    else
      diff -u /dev/null "$STANZA_TMP" || true
    fi
    echo ""
    if ! confirm_from_tty "Type 'APPLY' to add it: " "APPLY"; then
      echo "Not confirmed; nothing written." >&2
      exit 1
    fi
    mkdir -p -m 700 -- "$(dirname -- "$SSH_CONFIG")"
    [[ -e "$SSH_CONFIG" ]] || ( umask 077 && : > "$SSH_CONFIG" )
    cat "$STANZA_TMP" > "$SSH_CONFIG"
    ;;
  2)
    _host="$("$OSK_SSH_BIN" -G "$ALIAS" </dev/null 2>/dev/null | awk '/^hostname /{print $2}' | tail -1)"
    if [[ "$_host" != "$DELIVERY_HOST_ADDRESS" ]]; then
      echo "ERROR: your ${ALIAS} stanza points at '${_host}', not ${DELIVERY_HOST_ADDRESS}." >&2
      echo "       It is yours and is not edited here. Correct its Hostname and re-run." >&2
      exit 1
    fi
    echo "  already present, pointing at ${DELIVERY_HOST_ADDRESS}; left as it is"
    ;;
  *)
    echo "ERROR: could not read ${SSH_CONFIG}, or the result would not parse." >&2
    exit 1
    ;;
esac
osk_ensure_match_block "$SSH_CONFIG" "$ALIAS" "$ACCOUNT" "$DEV_TESTER_PROFILE" || exit 1

# ── 7. Your own sudo password ────────────────────────────────────────────────
#
# Written into the credential file before the host changes it, so a run that
# stops in between still holds the new value on disk; a re-run then finds the
# filed password refused and the one-time one still accepted, and changes it
# again. The one file this account's password lives in is chosen by the shared
# rule, never built here.

step "Your sudo password on the ${TARGET} host"
SSH_TO_HOST=("$SSH_BIN" -F /dev/null "${FOOTBAG_SSH_PIN_OPTS[@]}"
  -o "User=${ACCOUNT}" -o "Port=${DELIVERY_HOST_PORT}" -o "IdentityFile=${NAMED_KEY}"
  -o "IdentitiesOnly=yes" -o "ControlPath=none" -o "ConnectTimeout=10"
  "$DELIVERY_HOST_ADDRESS")

sudo_accepts() {
  # The password is line one of the stream and sudo reads it from there. ssh
  # exits 255 when it never reached the host, which says nothing about the
  # password, so that ends the run here rather than reading as a refusal: a
  # refusal sends the person to ask for a new delivery they do not need.
  local rc=0
  printf '%s\n' "$1" | "${SSH_TO_HOST[@]}" 'sudo -k -S -p "" -v' >/dev/null 2>&1 || rc=$?
  if (( rc == 255 )); then
    echo "ERROR: could not reach ${DELIVERY_HOST_ADDRESS} on port ${DELIVERY_HOST_PORT} as" >&2
    echo "       ${ACCOUNT}. Nothing about your password was decided. Check your" >&2
    echo "       connection, and that your address is on the host's allow-list," >&2
    echo "       then run this again with the same file." >&2
    exit 1
  fi
  return "$rc"
}

operator_credential_file_for "$ACCOUNT" "$TARGET" || exit 1
FILED=""
if [[ -f "$OPERATOR_CREDENTIAL_FILE" ]] && operator_credential_mode_ok "$OPERATOR_CREDENTIAL_FILE" 2>/dev/null; then
  IFS= read -r FILED < "$OPERATOR_CREDENTIAL_FILE" || true
fi
if [[ -n "$FILED" ]] && sudo_accepts "$FILED"; then
  FILED=""
  echo "  already done: sudo accepts the password in ${OPERATOR_CREDENTIAL_DISPLAY}"
else
  FILED=""
  if ! sudo_accepts "$DELIVERY_HOST_PASSWORD"; then
    echo "ERROR: the host refuses the one-time password in this file, and there is" >&2
    echo "       no working password filed here. The file has been used or replaced." >&2
    echo "       Ask the holder to re-run the onboarding with --reissue, then use the" >&2
    echo "       new file." >&2
    exit 1
  fi
  echo "  The one-time password works. It is replaced now by one you choose, which"
  echo "  nobody else ever sees, and filed in ${OPERATOR_CREDENTIAL_DISPLAY} at mode 600,"
  [[ -e "$OPERATOR_CREDENTIAL_FILE" ]] && echo "  replacing what that file holds now, which the host does not accept,"
  echo "  where every script that needs it finds it."
  if ! confirm_from_tty "Type 'APPLY' to choose it: " "APPLY"; then
    echo "Not confirmed; the one-time password still stands." >&2
    exit 1
  fi
  if ! vendor_secret_read "New sudo password, at least 12 characters: "; then
    echo "ERROR: ${VENDOR_SECRET_ERROR}" >&2
    exit 1
  fi
  NEW_PASS="$VENDOR_SECRET_VALUE"
  VENDOR_SECRET_VALUE=""
  if (( ${#NEW_PASS} < 12 )); then
    echo "ERROR: that is shorter than 12 characters. Nothing changed." >&2
    exit 1
  fi
  mkdir -p -m 700 -- "$(dirname -- "$OPERATOR_CREDENTIAL_FILE")"
  ( umask 077 && printf '%s\n' "$NEW_PASS" > "$OPERATOR_CREDENTIAL_FILE" )
  chmod 600 -- "$OPERATOR_CREDENTIAL_FILE"
  {
    printf '%s\n' "$DELIVERY_HOST_PASSWORD"
    printf 'CHPW_NEW=%q\n' "$NEW_PASS"
    cat "$REMOTE_HALF"
  } | "${SSH_TO_HOST[@]}" 'sudo -k -S -p "" bash' || {
    echo "ERROR: the host did not change the password. Re-run the same command." >&2
    exit 1
  }
  if ! sudo_accepts "$NEW_PASS"; then
    echo "ERROR: the host does not accept the new password. Re-run the same command." >&2
    exit 1
  fi
  NEW_PASS=""
  echo "  set, proved with sudo, and filed in ${OPERATOR_CREDENTIAL_DISPLAY}"
fi
DELIVERY_HOST_PASSWORD=""

# ── 8. The acceptance marker ─────────────────────────────────────────────────
#
# Which pair this account was onboarded with, recorded beside the pair. The only
# reader is setup-dev-workstation.sh --replace-key retired, which sets a pair
# aside for a re-onboarding only when this says it is the one that was accepted,
# so a pair that never reached the host is not mistaken for a retired one. It
# holds a fingerprint, nothing secret; offboarding removes it.
MARKER="${NAMED_KEY}.onboarded"
NAMED_SHA="$(ssh-keygen -l -f "${NAMED_KEY}.pub" 2>/dev/null | awk '{print $2}')"
if [[ -f "$MARKER" && "$(cat "$MARKER")" == "$NAMED_SHA" ]]; then
  :
else
  ( umask 077 && printf '%s\n' "$NAMED_SHA" > "$MARKER" )
fi

# ── 9. The sealed file ───────────────────────────────────────────────────────

step "The sealed file"
echo "  Everything in ${SEALED} is now in place and proved, and its one-time"
echo "  password no longer works. It is deleted now."
if confirm_from_tty "Type 'APPLY' to delete it: " "APPLY"; then
  rm -f -- "$SEALED"
  echo "  deleted"
else
  echo "  kept. It opens only with your key and holds nothing that still works."
fi

# ── 10. The workstation, set up and checked as you ───────────────────────────
#
# The rest of what deploying and testing staging needs (the Terraform tree, the
# host address, the checks that prove the login) is the workstation setup's, run
# through the wrapper so it acts as this person on AWS and on the host together.
# As the job role it writes no stanza, no credential file and no administrator
# setting, so on a holder's own machine nothing administrative moves.
step "Your workstation, as ${ACCOUNT}"
if [[ -n "${ACCEPT_SETUP_CMD:-}" ]]; then
  echo "SYNTHETIC: setup='${ACCEPT_SETUP_CMD}' -- the workstation setup is a stand-in." >&2
  SETUP_WRAP=("$ACCEPT_SETUP_CMD")
else
  SETUP_WRAP=(bash "${SCRIPT_DIR}/as-dev-tester.sh" --account "$ACCOUNT"
    bash "${SCRIPT_DIR}/setup-operator-workstation.sh")
fi
SETUP_RC=0
echo "  The full workstation setup, then its check, both as ${ACCOUNT}:"
echo "    bash scripts/as-dev-tester.sh --account ${ACCOUNT} \\"
echo "      bash scripts/setup-operator-workstation.sh --target ${TARGET}"
echo "    (and the same with --check)"
if confirm_from_tty "Type 'APPLY' to run them: " "APPLY"; then
  "${SETUP_WRAP[@]}" --target "$TARGET" || true
  "${SETUP_WRAP[@]}" --target "$TARGET" --check || SETUP_RC=$?
else
  echo "  not run. Run them yourself when you are ready; they repeat nothing done."
fi

echo ""
echo "---- evidence for the onboarding card ----"
echo "date:          $(date -u +%Y-%m-%d)"
echo "account:       ${ACCOUNT}"
echo "fingerprint:   ${NAMED_SHA}"
echo "access key id: ${DELIVERY_AWS_ACCESS_KEY_ID}"
echo "assumed role:  ${FRESH_ARN}"
echo "------------------------------------------"
echo ""
echo "Done. You reach ${TARGET} only as yourself, through the wrapper:"
echo ""
echo "  bash scripts/as-dev-tester.sh --account ${ACCOUNT} <command>"
echo ""
echo "Tell the holder who onboarded you that this finished, with the block above."
if (( SETUP_RC != 0 )); then
  echo ""
  echo "The workstation check above still lists something to do; it says what." >&2
  exit "$SETUP_RC"
fi
