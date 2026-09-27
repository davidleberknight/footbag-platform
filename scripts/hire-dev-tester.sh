#!/usr/bin/env bash
# hire-dev-tester.sh
#
# Hires a dev-and-tester onto staging in one run by a footbag-operator holder,
# for a person who is not at this keyboard: their named host account, their IAM
# user and key, and everything they need to reach staging, sealed with age to
# the SSH public key they sent. The sealed file travels by any channel, and the
# newcomer opens it on their own computer with
# scripts/accept-dev-tester-delivery.sh.
#
# WHY THIS EXISTS.
#
# A dev-and-tester holds no footbag-operator key, no shared password and no
# vault access, so nothing they need can be looked up by them and nothing can
# be handed over in a readable form. Their host account's one-time password,
# their access key and the staging host's pinned keys (which their job role is
# denied the Lightsail call to read) have to reach them some way, and every way
# involving a person reading a secret aloud or pasting one into a message
# leaves a copy somewhere. Sealing all of it to the public key they already
# sent leaves nothing readable on this machine and nothing readable in transit.
#
# WHAT IT REFUSES TO DO.
#
#   - Run as anything but the directly authenticated IAM user footbag-operator,
#     the one identity allowed to create another. It is only the caller here:
#     no IAM change names it, and no local AWS file is written, its section
#     included.
#   - Hire under the name footbag-operator or the shared host account's name, or
#     under a name that is not firstname_lastname.
#   - Hire onto production. A dev-and-tester's job role reaches staging only.
#   - Seal to a key age cannot use (anything but ssh-ed25519 or ssh-rsa), or to a
#     key the shared host account already holds (the host half refuses that).
#   - Adopt an IAM user of the name it did not create.
#   - Mint anything without a terminal for the typed confirmations.
#   - Leave a readable copy of any secret: every cleartext lives in shell
#     variables or in mode-600 temp files shredded on every way out.
#
# WHAT AN UNFINISHED RUN LEAVES.
#
# The host account, once the host step has handed its one-time password back,
# is reported and left, never removed by this run. An IAM key or user this run
# created and had not yet sealed is withdrawn, because nothing outside holds it
# and a live key nobody holds is worse than none. Re-running the same command
# finishes the work: the host account holding exactly the key given is issued a
# fresh password, and the IAM user's keys are retired and one reissued.
#
# Usage. The redirect is the sudo password of the account your alias connects
# as, which the host step reads; this script reads nothing from stdin itself:
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/hire-dev-tester.sh \
#     --target staging --account james_leberknight \
#     --operator "James Leberknight" --public-key ~/james.pub
#
# Flags:
#   --target staging           the only environment a dev-and-tester reaches;
#                              required rather than defaulted
#   --account <first_last>     the name of their host account and IAM user
#   --operator "<Full Name>"   who they are, for their host account and the
#                              sealed delivery. A dev-and-tester has no vault
#                              entry: who holds access is read live from the
#                              host and IAM, and their hire card records who
#                              approved it
#   --public-key <path>        their SSH public key, as they sent it
#
# Test seams (CI only; operators never set these):
#   HIRE_DEV_TESTER_AWS_BIN        replaces the aws CLI
#   HIRE_DEV_TESTER_PROVISION_CMD  replaces the host step
#   HIRE_DEV_TESTER_AGE_BIN        replaces age
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# The Terraform directory the host address is read from resolves from here.
cd "$REPO_ROOT"

# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# shellcheck source=lib/aws-identity.sh
source "${SCRIPT_DIR}/lib/aws-identity.sh"
# shellcheck source=lib/iam-access-key.sh
source "${SCRIPT_DIR}/lib/iam-access-key.sh"
# shellcheck source=lib/iam-operator-user.sh
source "${SCRIPT_DIR}/lib/iam-operator-user.sh"
# shellcheck source=lib/terraform-output.sh
source "${SCRIPT_DIR}/lib/terraform-output.sh"
# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# confirm_from_tty, and the unconditional assignment of ASSUME_YES that stops an
# exported value standing in for the typed word.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/secret-file.sh
source "${SCRIPT_DIR}/lib/secret-file.sh"
# shellcheck source=lib/terminal.sh
source "${SCRIPT_DIR}/lib/terminal.sh"
# shellcheck source=lib/dev-tester-delivery.sh
source "${SCRIPT_DIR}/lib/dev-tester-delivery.sh"

AWS_BIN="${HIRE_DEV_TESTER_AWS_BIN:-aws}"
IAM_KEY_AWS_BIN="$AWS_BIN"
AWS_IDENTITY_BIN="$AWS_BIN"
IAM_OPERATOR_AWS_BIN="$AWS_BIN"
AGE_BIN="${HIRE_DEV_TESTER_AGE_BIN:-age}"
PROVISION_CMD="${HIRE_DEV_TESTER_PROVISION_CMD:-${SCRIPT_DIR}/provision-operator-account.sh}"

# Spelled as literals, as in manage-human-operator.sh: a check that reads the
# name from the place the credential came from is not a check.
FOOTBAG_OPERATOR_USER="footbag-operator"
SHARED_HOST_ACCOUNT="footbag"

TARGET=""
ACCOUNT=""
OPERATOR=""
PUBLIC_KEY=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --account) ACCOUNT="${2:-}"; shift 2 || { echo "ERROR: --account requires an argument" >&2; exit 2; } ;;
    --operator) OPERATOR="${2:-}"; shift 2 || { echo "ERROR: --operator requires an argument" >&2; exit 2; } ;;
    --public-key) PUBLIC_KEY="${2:-}"; shift 2 || { echo "ERROR: --public-key requires an argument" >&2; exit 2; } ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

# ── Arguments, before anything is read or reached ────────────────────────────

if [[ "$TARGET" == "production" ]]; then
  echo "ERROR: a dev-and-tester is never hired onto production. Their job role" >&2
  echo "       reaches staging only, by design. Nothing done." >&2
  exit 2
fi
require_target "$TARGET" staging || exit 2

if [[ "$ACCOUNT" == "$FOOTBAG_OPERATOR_USER" || "$ACCOUNT" == "$SHARED_HOST_ACCOUNT" ]]; then
  echo "ERROR: '${ACCOUNT}' is not a person. ${FOOTBAG_OPERATOR_USER} is the directly" >&2
  echo "       authenticated identity and ${SHARED_HOST_ACCOUNT} the shared host account;" >&2
  echo "       neither is hired, changed or sealed to anybody here. Nothing done." >&2
  exit 2
fi
if [[ ! "$ACCOUNT" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)+$ || ${#ACCOUNT} -gt 32 ]]; then
  echo "ERROR: '${ACCOUNT}' is not a usable account name." >&2
  echo "       firstname_lastname in lower-case ASCII, at most 32 characters: the" >&2
  echo "       same string names their host account, their IAM user and the role" >&2
  echo "       session name every trail entry of theirs carries." >&2
  exit 2
fi
if [[ -z "$OPERATOR" || "$OPERATOR" == *$'\n'* ]]; then
  echo "ERROR: --operator \"<Full Name>\" is required, on one line: it names whose" >&2
  echo "       host account this is, on the host itself." >&2
  exit 2
fi
if [[ -z "$PUBLIC_KEY" || ! -f "$PUBLIC_KEY" ]]; then
  echo "ERROR: --public-key must name their SSH public key file, as they sent it." >&2
  exit 2
fi

KEY_LINE="$(grep -m1 . "$PUBLIC_KEY" || true)"
KEY_TYPE="${KEY_LINE%% *}"
case "$KEY_TYPE" in
  ssh-ed25519|ssh-rsa) ;;
  *)
    echo "ERROR: the key is '${KEY_TYPE:-empty}'. age seals only to ssh-ed25519 or" >&2
    echo "       ssh-rsa, so ask for one of those. Nothing done." >&2
    exit 2
    ;;
esac
if ! KEY_FINGERPRINT="$(ssh-keygen -l -f "$PUBLIC_KEY" 2>/dev/null)" \
   || [[ "$(grep -c . <<<"$KEY_FINGERPRINT")" != "1" ]]; then
  echo "ERROR: '${PUBLIC_KEY}' is not exactly one public key ssh-keygen can read." >&2
  exit 2
fi
RECIPIENT_TAG="$(delivery_age_recipient_tag "$KEY_LINE" || true)"
if [[ -z "$RECIPIENT_TAG" ]]; then
  echo "ERROR: could not compute the sealing tag of that key." >&2
  exit 2
fi

# ── Tools and terminal, before anything is minted ────────────────────────────

delivery_require_tools "age=${AGE_BIN}" openssl=openssl ssh-keygen=ssh-keygen || exit 1
[[ "$AGE_BIN" != "age" ]] && echo "SYNTHETIC: age='${AGE_BIN}' -- nothing is really sealed." >&2
[[ "$AWS_BIN" != "aws" ]] && echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the account." >&2
[[ -n "${HIRE_DEV_TESTER_PROVISION_CMD:-}" ]] && echo "SYNTHETIC: host step='${PROVISION_CMD}' -- no host is being changed." >&2

if [[ -t 0 ]]; then
  echo "ERROR: stdin is a terminal. The host step reads the sudo password of the" >&2
  echo "       account your alias connects as from stdin, so redirect its file:" >&2
  echo "         < ~/AWS/AWS_OPERATOR.txt bash scripts/hire-dev-tester.sh ..." >&2
  exit 1
fi
if ! terminal_present; then
  echo "ERROR: no terminal to confirm on. Every step that creates something is" >&2
  echo "       confirmed by a typed word. Re-run from an interactive shell." >&2
  echo "       Nothing has been created." >&2
  exit 1
fi

# ── The identity this run acts on the strength of ────────────────────────────

aws_profile_use "$FOOTBAG_OPERATOR_PROFILE" \
  "Hiring a named operator is refused to every role, including the job role, by the role's own policy." \
  || exit 1
aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" || exit 1

ACCOUNT_ID="$(printf '%s' "$AWS_IDENTITY_ARN" | cut -d: -f5)"
if [[ ! "$ACCOUNT_ID" =~ ^[0-9]{12}$ ]]; then
  echo "ERROR: could not read an account id out of ${AWS_IDENTITY_ARN}." >&2
  exit 1
fi
DEV_TESTER_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${FOOTBAG_DEV_TESTER_ROLE}"
STAGING_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/footbag-staging-app-runtime"
if ! "$AWS_BIN" iam get-role --role-name "$FOOTBAG_DEV_TESTER_ROLE" >/dev/null 2>&1; then
  echo "ERROR: there is no ${FOOTBAG_DEV_TESTER_ROLE} role in account ${ACCOUNT_ID}, so there" >&2
  echo "       is nothing to hire anybody into. Apply the identity tree first:" >&2
  echo "         bash scripts/terraform-apply.sh --target identity" >&2
  exit 1
fi

iam_operator_state "$ACCOUNT"
case "$IAM_OPERATOR_STATE" in
  foreign) iam_operator_refuse_foreign "$ACCOUNT"; exit 1 ;;
  ours) IAM_USER_EXISTS=1 ;;
  *) IAM_USER_EXISTS=0 ;;
esac

# Read before anything changes, so a Terraform or Lightsail problem costs
# nothing but the run.
known_hosts_pin_lines "$TARGET" "$AWS_BIN" || exit 1

OUT_DIR="${HOME}/AWS"
OUT_FILE="${OUT_DIR}/${ACCOUNT}-${TARGET}.delivery.age"

# ── What this run will do ────────────────────────────────────────────────────

echo ""
echo "Hiring ${OPERATOR} as ${ACCOUNT} on ${TARGET}, sealed to:"
echo "  ${KEY_FINGERPRINT}"
echo ""
echo "  host account  ${ACCOUNT} on footbag-${TARGET}-web, with a one-time password"
echo "                that is never shown (an existing one is read first and"
echo "                decided with you)"
if (( IAM_USER_EXISTS )); then
  echo "  IAM user      ${ACCOUNT} exists and is ours; its keys are retired and one"
  echo "                fresh key is minted"
else
  echo "  IAM user      ${ACCOUNT} is created under ${IAM_OPERATOR_PATH}, granted"
  echo "                sts:AssumeRole on ${FOOTBAG_DEV_TESTER_ROLE} and nothing else"
fi
echo "  pin lines     ${KNOWN_HOSTS_PIN_COUNT} for ${KNOWN_HOSTS_PIN_IP}"
echo "  sealed file   ${OUT_FILE}"
[[ -e "$OUT_FILE" ]] && echo "                (replacing the one there, which this run makes obsolete)"
echo ""
echo "No IAM change names ${FOOTBAG_OPERATOR_USER}, and no AWS file on this machine is written."
if ! confirm_from_tty "Type 'APPLY' to hire ${ACCOUNT}: " "APPLY"; then
  echo "Not confirmed; nothing was created." >&2
  exit 1
fi

# ── State, and what an unfinished run may undo ───────────────────────────────

HOST_DONE=0
SEALED_DONE=0
SEAL_TMP=""

hire_cleanup() {
  (( SEALED_DONE )) && { secret_file_sweep; return 0; }
  iam_key_cleanup
  iam_operator_undo
  [[ -n "$SEAL_TMP" ]] && rm -f -- "$SEAL_TMP"
  SEAL_TMP=""
  secret_file_sweep
  if (( HOST_DONE )); then
    echo "" >&2
    echo "The host account ${ACCOUNT} is left in place and is NOT being removed." >&2
    echo "Its one-time password was never shown and is now destroyed, so nobody" >&2
    echo "holds it. Re-run the same command: it issues a fresh one." >&2
  fi
  HOST_DONE=0
  return 0
}
trap hire_cleanup EXIT INT TERM

# ── The host account ─────────────────────────────────────────────────────────
#
# The host step inherits this run's stdin, which carries the sudo password, and
# hands the one-time password back through a file this run created and will
# shred.
PASS_FILE="$(umask 077 && mktemp)"
secret_file_register "$PASS_FILE"
OPACC_SEALED_OUT="$PASS_FILE" bash "$PROVISION_CMD" --target "$TARGET" \
  --account "$ACCOUNT" --operator "$OPERATOR" --key-file "$PUBLIC_KEY" --sealed || {
  echo "ERROR: the host step did not finish; nothing else was started." >&2
  exit 1
}
HOST_DONE=1
DELIVERY_HOST_PASSWORD=""
IFS= read -r DELIVERY_HOST_PASSWORD < "$PASS_FILE" || true
secret_file_destroy "$PASS_FILE"
if [[ -z "$DELIVERY_HOST_PASSWORD" ]]; then
  echo "ERROR: the host step reported success and handed back no password." >&2
  exit 1
fi

# ── The IAM identity ─────────────────────────────────────────────────────────

iam_operator_ensure "$ACCOUNT" "$IAM_USER_EXISTS" "$DEV_TESTER_ROLE_ARN" || exit 1
IAM_KEY_DELIVERY="install"
IAM_KEY_AWS_ARGS=()
iam_key_provision "$ACCOUNT" "" 1 || exit 1

# ── Seal ─────────────────────────────────────────────────────────────────────

DELIVERY_TARGET="$TARGET"
DELIVERY_ACCOUNT="$ACCOUNT"
DELIVERY_OPERATOR="$OPERATOR"
DELIVERY_AWS_ACCESS_KEY_ID="$IAM_KEY_AKID"
DELIVERY_AWS_SECRET_ACCESS_KEY="$IAM_KEY_SAK"
DELIVERY_AWS_ACCOUNT_ID="$ACCOUNT_ID"
DELIVERY_DEV_TESTER_ROLE_ARN="$DEV_TESTER_ROLE_ARN"
DELIVERY_STAGING_RUNTIME_ROLE_ARN="$STAGING_ROLE_ARN"
DELIVERY_HOST_ADDRESS="$KNOWN_HOSTS_PIN_IP"
DELIVERY_HOST_PORT="2222"
DELIVERY_PINS=()
while IFS= read -r _pin; do
  [[ -n "$_pin" ]] && DELIVERY_PINS+=("$_pin")
done <<< "$KNOWN_HOSTS_PIN_LINES"

BUNDLE="$(umask 077 && mktemp)"
secret_file_register "$BUNDLE"
delivery_bundle_emit > "$BUNDLE" || exit 1
DELIVERY_HOST_PASSWORD=""
DELIVERY_AWS_SECRET_ACCESS_KEY=""

mkdir -p -m 700 -- "$OUT_DIR"
SEAL_TMP="$(umask 077 && mktemp "${OUT_DIR}/.${ACCOUNT}-delivery.XXXXXX")"
"$AGE_BIN" -r "$KEY_LINE" -o "$SEAL_TMP" "$BUNDLE" || {
  echo "ERROR: age could not seal the delivery." >&2
  exit 1
}
secret_file_destroy "$BUNDLE"

# Proved rather than trusted: the header names exactly one recipient, and it is
# the key given to this run.
HEADER_TAGS="$(delivery_age_header_tags "$SEAL_TMP")"
if [[ "$HEADER_TAGS" != "$RECIPIENT_TAG" ]]; then
  echo "ERROR: the sealed file is not addressed to exactly the key given" >&2
  echo "       (expected ${RECIPIENT_TAG}, found '${HEADER_TAGS//$'\n'/ }')." >&2
  exit 1
fi
chmod 600 "$SEAL_TMP"
mv -f -- "$SEAL_TMP" "$OUT_FILE"
SEAL_TMP=""

iam_key_commit
IAM_KEY_SAK=""
SEALED_DONE=1

echo ""
echo "Sealed: ${OUT_FILE}"
echo "Only the private half of ${KEY_FINGERPRINT%% (*} opens it."
echo ""
echo "1. Send that file to ${OPERATOR} by any channel. It is useless to anybody else."
echo ""
echo "2. They install age, pull the public repository, and run on their own computer:"
echo ""
echo "     bash scripts/accept-dev-tester-delivery.sh --target ${TARGET} \\"
echo "       --account ${ACCOUNT} <path to ${ACCOUNT}-${TARGET}.delivery.age>"
echo ""
echo "3. Nothing goes in the vault: a dev-and-tester has no vault entry. Who holds"
echo "   this access is read live, as below, and their hire card records who"
echo "   approved it. The access key id issued is ${IAM_KEY_AKID}."
echo ""
echo "4. When they report success, read it back from here, changing nothing:"
echo ""
echo "     bash scripts/manage-human-operator.sh --verify ${ACCOUNT}"
echo "     bash scripts/host-diagnostics.sh --target ${TARGET} host-access"
