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
#   - Edit an SSH stanza this machine already carries. A missing one is written.
#   - Leave the one-time password standing, or accept a new one shorter than 12
#     characters.
#   - Leave a cleartext copy of the delivery anywhere: it is opened into a
#     mode-600 temp file shredded on every way out, and the sealed file itself
#     is deleted only after everything is proved, on a typed APPLY.
#
# Every step is shown before it changes anything, confirmed with APPLY, and
# skipped when its outcome is already proven, so a run that stopped part way is
# finished by running the same command again.
#
# Usage:
#   bash scripts/accept-dev-tester-onboarding.sh --target staging \
#     --account james_leberknight ~/Downloads/james_leberknight-staging.onboarding.age
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
#   <sealed file>             the .onboarding.age file the holder sent you
#
# Test seams (CI only; nobody else sets these):
#   ACCEPT_AWS_BIN            replaces the aws CLI
#   ACCEPT_AGE_BIN            replaces age
#   ACCEPT_SSH_BIN            replaces ssh for the connections to the host
#   ACCEPT_PROPAGATION_POLL   seconds between identity polls
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
if [[ -z "$SEALED" || ! -f "$SEALED" ]]; then
  echo "ERROR: name the sealed .onboarding.age file the holder sent you." >&2
  exit 2
fi

delivery_require_tools "age=${AGE_BIN}" "ssh=${SSH_BIN}" ssh-keygen=ssh-keygen \
  openssl=openssl "aws=${AWS_BIN}" || exit 1
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

if [[ -f "${NAMED_KEY}.pub" ]]; then
  if [[ "$(pub_tag "${NAMED_KEY}.pub")" != "$SEALED_TAGS" ]]; then
    echo "ERROR: ${NAMED_KEY} is not the key this delivery was sealed to. Nothing" >&2
    echo "       was moved or opened. Send the holder the public key you meant." >&2
    exit 1
  fi
  [[ -f "$NAMED_KEY" ]] || { echo "ERROR: ${NAMED_KEY} has no private half." >&2; exit 1; }
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
  echo "  copied"
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

if [[ "$CURRENT_KEY" == "$DELIVERY_AWS_ACCESS_KEY_ID" && -n "$DT_SOURCE" ]] && (( RT_PRESENT )); then
  echo "  already in place: [${ACCOUNT}] holds ${CURRENT_KEY}, and both profiles exist"
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
  if (( ! RT_PRESENT )); then
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
  fi
  if [[ -z "$DT_SOURCE" ]]; then
    aws_config_add_role_profile "$CONFIG_FILE" "$DEV_TESTER_PROFILE" \
      "$DELIVERY_DEV_TESTER_ROLE_ARN" "$ACCOUNT" us-east-1 "$ACCOUNT" || {
      echo "ERROR: could not write [profile ${DEV_TESTER_PROFILE}]: ${AWS_CRED_ERROR}" >&2; exit 1; }
  fi
  if (( ! RT_PRESENT )); then
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
if ! "$AWS_BIN" sts get-caller-identity --profile "$DEV_TESTER_PROFILE" \
    --query Arn --output text --region us-east-1 >/dev/null 2>&1; then
  echo "  waiting for the new key to take effect (up to $(( POLL * 24 ))s)"
  for (( try = 1; try <= 24; try++ )); do
    sleep "$POLL"
    "$AWS_BIN" sts get-caller-identity --profile "$DEV_TESTER_PROFILE" \
      --query Arn --output text --region us-east-1 >/dev/null 2>&1 && break
  done
fi
aws_identity_require_user "$ACCOUNT" "$ACCOUNT" || exit 1
echo "  [${ACCOUNT}] is IAM user ${ACCOUNT}"
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
MISSING=()
for _pin in "${DELIVERY_PINS[@]}"; do
  [[ -f "$PIN" ]] && grep -qxF -- "$_pin" "$PIN" && continue
  MISSING+=("$_pin")
done
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
if ! ssh-keygen -F "$DELIVERY_HOST_ADDRESS" -f "$PIN" 2>/dev/null | grep -q '^[^#]' \
   || ! ssh-keygen -F "[${DELIVERY_HOST_ADDRESS}]:${DELIVERY_HOST_PORT}" -f "$PIN" 2>/dev/null | grep -q '^[^#]'; then
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

# ── 8. The sealed file ───────────────────────────────────────────────────────

step "The sealed file"
echo "  Everything in ${SEALED} is now in place and proved, and its one-time"
echo "  password no longer works. It is deleted now."
if confirm_from_tty "Type 'APPLY' to delete it: " "APPLY"; then
  rm -f -- "$SEALED"
  echo "  deleted"
else
  echo "  kept. It opens only with your key and holds nothing that still works."
fi

echo ""
echo "Done. You reach ${TARGET} only as yourself, through the wrapper:"
echo ""
echo "  bash scripts/as-dev-tester.sh --account ${ACCOUNT} \\"
echo "    bash scripts/setup-operator-workstation.sh --target ${TARGET} --check"
echo ""
echo "Tell the holder who onboarded you that this finished."
