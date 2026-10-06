#!/usr/bin/env bash
# onboard-dev-tester.sh
#
# Onboards one dev-and-tester onto staging, in one run by a footbag-operator
# holder: their named host account, their IAM user and key, their address on
# the staging allow-list, and everything they need to reach staging, sealed with
# age to the SSH public key they sent. The sealed file is placed in their own
# home on the staging host, and nobody carries it: their acceptance,
# scripts/accept-dev-tester-onboarding.sh on their own computer, fetches it
# from there over their own login, proves it, and removes it. The run ends by
# printing that acceptance command, with the host address filled in.
#
# It is the one way anybody gets a named identity, and it works the same
# whoever that is. A holder onboarding themselves runs it at their own keyboard
# and then accepts on the same machine, exactly as somebody on another machine
# would; nothing about the path changes. A named identity is a
# user of the staging-only job role and nothing more: administrative work runs
# as footbag-operator and the shared host account, never as a named identity.
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
#   - Onboard under the name footbag-operator or the shared host account's name,
#     or under a name that is not firstname_lastname.
#   - Onboard onto production. A dev-and-tester's job role reaches staging only.
#   - Seal to a key age cannot use (anything but ssh-ed25519 or ssh-rsa), or to a
#     key the shared host account already holds (the host half refuses that).
#   - Adopt an IAM user of the name it did not create.
#   - Mint anything without a terminal for the typed confirmations.
#   - Re-issue a finished onboarding unasked. A person who has already accepted
#     holds a password they chose and a working key, and a re-run replacing both
#     would lock them out; so a finished onboarding is read back and reported,
#     and changed only with --reissue.
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
# fresh password, and the IAM user's keys are retired and one reissued. An
# onboarding counts as finished when IAM shows the grant and an active key,
# because the key is committed only once the sealed file is placed on the host,
# and the host account reads back live holding exactly the key given.
#
# Usage. The redirect is the sudo password of the account your alias connects
# as, which this run reads once and hands to each host step:
#
#   Somebody else, with what they posted:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/onboard-dev-tester.sh \
#     --target staging --account james_leberknight \
#     --full-name "James Leberknight" --public-key "ssh-ed25519 AAAA... james" \
#     --expect-fingerprint SHA256:<as they posted it> --address 203.0.113.7/32
#
#   Yourself, on your own machine, after setup-dev-workstation.sh --account
#   made your pair: the key, its fingerprint and your address are all derived.
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/onboard-dev-tester.sh \
#     --target staging --account david_leberknight --full-name "David Leberknight"
#
#   Proving an accepted onboarding, read-only, with one verdict:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/onboard-dev-tester.sh --verify \
#     --target staging --account james_leberknight --expect-fingerprint SHA256:<...>
#
# Flags:
#   --target staging           the only environment a dev-and-tester reaches;
#                              required rather than defaulted
#   --account <first_last>     the name of their host account and IAM user
#   --full-name "<Full Name>"  who they are, for their host account and the
#                              sealed file. Nobody named has a vault entry: who
#                              holds access is read live from the host and IAM,
#                              and the onboarding card records who approved it
#   --public-key <key>         their SSH public key line, as they sent it, or a
#                              file holding it. Leave it out to onboard yourself:
#                              the key is then ~/.ssh/id_ed25519_<account>.pub
#                              on this machine, and nothing else
#   --expect-fingerprint <SHA256:...>
#                              the key's fingerprint as they posted it, through a
#                              channel other than the one the key came by. A key
#                              swapped in transit would seal their access to
#                              somebody else, so a mismatch stops the run before
#                              anything is read or minted. Required with
#                              --public-key; derived when onboarding yourself
#   --address <cidr>           the address they connect from, put on the staging
#                              allow-list as their own entry. Required for
#                              somebody else; read from checkip when onboarding
#                              yourself
#   --location "<where>"       where that address is, for the entry's
#                              description. Default: home
#   --reissue                  replace a finished onboarding: a fresh one-time
#                              password and key, sealed again and placed over
#                              the one on the host. For a forgotten password, or
#                              a delivery that is no longer there to fetch
#   --verify                   change nothing; prove the onboarding finished and
#                              accepted: the host account live holding exactly the
#                              key and the shared account not holding it, the IAM
#                              user ours with the grant and exactly one active key,
#                              the address parameter present, and the job role
#                              assumed with that key since it was made (CloudTrail,
#                              polled up to about 15 minutes). Exit 0 proved, 1 not,
#                              3 pending: accepted not yet seen, with the re-run
#
# Ends with an evidence block (date, account, fingerprint, key id, address and,
# once seen, the assumed-role ARN) for the onboarding card. Posting it is human.
#
# Test seams (CI only; operators never set these):
#   ONBOARD_DEV_TESTER_AWS_BIN        replaces the aws CLI
#   ONBOARD_DEV_TESTER_PROVISION_CMD  replaces the host step
#   ONBOARD_DEV_TESTER_AGE_BIN        replaces age
#   ONBOARD_DEV_TESTER_ADDRESS_CMD    replaces the allow-list step
#   ONBOARD_DEV_TESTER_FETCH          replaces the checkip read of this machine's
#                                     address
#   ONBOARD_DEV_TESTER_POLL_SECONDS   the wait between CloudTrail reads (30)
#   ONBOARD_DEV_TESTER_POLL_TRIES     how many reads before "pending" (30)
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
# shellcheck source=lib/iam-dev-tester-user.sh
source "${SCRIPT_DIR}/lib/iam-dev-tester-user.sh"
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

AWS_BIN="${ONBOARD_DEV_TESTER_AWS_BIN:-aws}"
IAM_KEY_AWS_BIN="$AWS_BIN"
AWS_IDENTITY_BIN="$AWS_BIN"
IAM_DEV_TESTER_AWS_BIN="$AWS_BIN"
AGE_BIN="${ONBOARD_DEV_TESTER_AGE_BIN:-age}"
PROVISION_CMD="${ONBOARD_DEV_TESTER_PROVISION_CMD:-${SCRIPT_DIR}/provision-dev-tester-account.sh}"
ADDRESS_CMD="${ONBOARD_DEV_TESTER_ADDRESS_CMD:-${SCRIPT_DIR}/authorize-operator-address.sh}"
FETCH_CMD="${ONBOARD_DEV_TESTER_FETCH:-}"
POLL_SECONDS="${ONBOARD_DEV_TESTER_POLL_SECONDS:-30}"
POLL_TRIES="${ONBOARD_DEV_TESTER_POLL_TRIES:-30}"
# Where each dev-and-tester's own staging address lives, as the allow-list step
# writes it.
DEV_TESTER_PATH="/footbag-ops/staging/dev-testers"

# Spelled as literals, as in manage-dev-tester.sh: a check that reads the
# name from the place the credential came from is not a check.
FOOTBAG_OPERATOR_USER="footbag-operator"
SHARED_HOST_ACCOUNT="footbag"

TARGET=""
ACCOUNT=""
FULL_NAME=""
PUBLIC_KEY=""
EXPECT_FINGERPRINT=""
ADDRESS=""
LOCATION=""
REISSUE=0
VERIFY=0
# Onboarding yourself: no key was handed over, so it is this machine's own pair.
SELF=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --account) ACCOUNT="${2:-}"; shift 2 || { echo "ERROR: --account requires an argument" >&2; exit 2; } ;;
    --full-name) FULL_NAME="${2:-}"; shift 2 || { echo "ERROR: --full-name requires an argument" >&2; exit 2; } ;;
    --public-key) PUBLIC_KEY="${2:-}"; shift 2 || { echo "ERROR: --public-key requires an argument" >&2; exit 2; } ;;
    --expect-fingerprint) EXPECT_FINGERPRINT="${2:-}"; shift 2 || { echo "ERROR: --expect-fingerprint requires an argument" >&2; exit 2; } ;;
    --address) ADDRESS="${2:-}"; shift 2 || { echo "ERROR: --address requires an argument" >&2; exit 2; } ;;
    --location) LOCATION="${2:-}"; shift 2 || { echo "ERROR: --location requires an argument" >&2; exit 2; } ;;
    --reissue) REISSUE=1; shift ;;
    --verify) VERIFY=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

# ── Arguments, before anything is read or reached ────────────────────────────

if [[ "$TARGET" == "production" ]]; then
  echo "ERROR: a dev-and-tester is never onboarded onto production. Their job role" >&2
  echo "       reaches staging only, by design. Nothing done." >&2
  exit 2
fi
require_target "$TARGET" staging || exit 2

if [[ "$ACCOUNT" == "$FOOTBAG_OPERATOR_USER" || "$ACCOUNT" == "$SHARED_HOST_ACCOUNT" ]]; then
  echo "ERROR: '${ACCOUNT}' is not a person. ${FOOTBAG_OPERATOR_USER} is the directly" >&2
  echo "       authenticated identity and ${SHARED_HOST_ACCOUNT} the shared host account;" >&2
  echo "       neither is onboarded, changed or sealed to anybody here. Nothing done." >&2
  exit 2
fi
if [[ ! "$ACCOUNT" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)+$ || ${#ACCOUNT} -gt 32 ]]; then
  echo "ERROR: '${ACCOUNT}' is not a usable account name." >&2
  echo "       firstname_lastname in lower-case ASCII, at most 32 characters: the" >&2
  echo "       same string names their host account, their IAM user and the role" >&2
  echo "       session name every trail entry of theirs carries." >&2
  exit 2
fi
if (( VERIFY )); then
  if (( REISSUE )) || [[ -n "$FULL_NAME$PUBLIC_KEY$ADDRESS$LOCATION" ]]; then
    echo "ERROR: --verify changes nothing and takes only --target, --account and" >&2
    echo "       --expect-fingerprint." >&2
    exit 2
  fi
elif [[ -z "$FULL_NAME" || "$FULL_NAME" == *$'\n'* ]]; then
  echo "ERROR: --full-name \"<Full Name>\" is required, on one line: it names whose" >&2
  echo "       host account this is, on the host itself." >&2
  exit 2
fi

# The key: a line they sent, a file holding one, or, with neither, this machine's
# own named pair for a holder onboarding themselves. The self case takes that one
# file and nothing else, so a run cannot pick up some other key that happens to
# be lying around.
#
# A verification of somebody else needs no key at all, only the fingerprint they
# posted: it compares what the host and IAM hold against that.
VERIFY_BY_FINGERPRINT=0
if (( VERIFY )) && [[ -z "$PUBLIC_KEY" && -n "$EXPECT_FINGERPRINT" ]]; then
  VERIFY_BY_FINGERPRINT=1
  if [[ ! "$EXPECT_FINGERPRINT" =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]]; then
    echo "ERROR: --expect-fingerprint must be a SHA256 fingerprint as ssh-keygen prints it." >&2
    exit 2
  fi
  KEY_SHA="$EXPECT_FINGERPRINT"
elif [[ -z "$PUBLIC_KEY" ]]; then
  SELF=1
  PUBLIC_KEY_SOURCE="${HOME}/.ssh/id_ed25519_${ACCOUNT}.pub"
  if [[ ! -f "$PUBLIC_KEY_SOURCE" ]]; then
    echo "ERROR: no --public-key, and no ${PUBLIC_KEY_SOURCE} on this machine." >&2
    echo "       Onboarding somebody else, pass the key line they sent with" >&2
    echo "       --public-key and its fingerprint with --expect-fingerprint." >&2
    echo "       Onboarding yourself, make your pair first:" >&2
    echo "         bash scripts/setup-dev-workstation.sh --aws --account ${ACCOUNT}" >&2
    exit 2
  fi
  KEY_LINE="$(grep -m1 . "$PUBLIC_KEY_SOURCE" || true)"
elif [[ "$PUBLIC_KEY" == ssh-* ]]; then
  PUBLIC_KEY_SOURCE="the key line given"
  KEY_LINE="$PUBLIC_KEY"
elif [[ -f "$PUBLIC_KEY" ]]; then
  PUBLIC_KEY_SOURCE="$PUBLIC_KEY"
  # One key, or a refusal: a file of several is not "their key", and taking the
  # first would seal to whichever happened to come first.
  if [[ "$(grep -c . "$PUBLIC_KEY" || true)" != "1" ]]; then
    echo "ERROR: '${PUBLIC_KEY}' is not exactly one public key ssh-keygen can read." >&2
    exit 2
  fi
  KEY_LINE="$(grep -m1 . "$PUBLIC_KEY" || true)"
else
  echo "ERROR: --public-key must be their SSH public key line, as they sent it, or" >&2
  echo "       a file holding it." >&2
  exit 2
fi
if (( ! VERIFY_BY_FINGERPRINT )); then
if [[ "$KEY_LINE" == *$'\n'* ]]; then
  echo "ERROR: the key given is more than one line." >&2
  exit 2
fi

# The SHA256 form ssh-keygen prints: the prefix, then 43 characters of unpadded
# base64. Required for somebody else's key, because it is what proves the key is
# theirs; derived for your own, which never travelled.
if [[ -n "$EXPECT_FINGERPRINT" && ! "$EXPECT_FINGERPRINT" =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]] \
   || { (( ! SELF )) && [[ -z "$EXPECT_FINGERPRINT" ]]; }; then
  echo "ERROR: --expect-fingerprint must be the key's SHA256 fingerprint as they" >&2
  echo "       posted it, such as SHA256:YBSc2HxB3uZ8Xf3QRH8W7KT6l+RCDCZ4S8/uG9Ba3wA." >&2
  echo "       It is what proves the key is theirs, so it is not optional when the" >&2
  echo "       key came from somebody else." >&2
  exit 2
fi

KEY_TYPE="${KEY_LINE%% *}"
case "$KEY_TYPE" in
  ssh-ed25519|ssh-rsa) ;;
  *)
    echo "ERROR: the key is '${KEY_TYPE:-empty}'. age seals only to ssh-ed25519 or" >&2
    echo "       ssh-rsa, so ask for one of those. Nothing done." >&2
    exit 2
    ;;
esac
if ! KEY_FINGERPRINT="$(ssh-keygen -l -f /dev/stdin <<<"$KEY_LINE" 2>/dev/null)" \
   || [[ "$(grep -c . <<<"$KEY_FINGERPRINT")" != "1" ]]; then
  echo "ERROR: ${PUBLIC_KEY_SOURCE} is not exactly one public key ssh-keygen can read." >&2
  exit 2
fi
# The SHA256 field alone: the length and the comment are presentation.
KEY_SHA="$(awk '{print $2}' <<<"$KEY_FINGERPRINT")"
if [[ -n "$EXPECT_FINGERPRINT" && "$KEY_SHA" != "$EXPECT_FINGERPRINT" ]]; then
  echo "REFUSING: ${PUBLIC_KEY_SOURCE} is ${KEY_SHA}," >&2
  echo "          not the ${EXPECT_FINGERPRINT} they posted. Sealing to it would" >&2
  echo "          hand their access to whoever holds that key. Get the key again" >&2
  echo "          and check it against what they posted. Nothing done." >&2
  exit 1
fi
RECIPIENT_TAG="$(delivery_age_recipient_tag "$KEY_LINE" || true)"
if [[ -z "$RECIPIENT_TAG" ]]; then
  echo "ERROR: could not compute the sealing tag of that key." >&2
  exit 2
fi
fi  # the key itself, skipped when verifying by fingerprint alone

if (( ! VERIFY )); then
  # Your own address, read the way setup-dev-workstation.sh reads it, when you
  # are onboarding yourself from the machine you will connect from.
  if [[ -z "$ADDRESS" ]] && (( SELF )); then
    if [[ -n "$FETCH_CMD" ]]; then
      echo "SYNTHETIC: checkip='${FETCH_CMD}' -- this machine's address is a stand-in." >&2
      ADDRESS="$("$FETCH_CMD" 2>/dev/null || true)"
    else
      ADDRESS="$(curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null || true)"
    fi
    ADDRESS="${ADDRESS//[[:space:]]/}"
    [[ -n "$ADDRESS" ]] && echo "==> This machine connects from ${ADDRESS} (checkip)." >&2
  fi
  # Checked for shape here so a typo is refused before anything is minted; the
  # allow-list step holds it to a canonical single host itself.
  _octets_ok=1
  if [[ "$ADDRESS" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})(/32)?$ ]]; then
    for _o in "${BASH_REMATCH[@]:1:4}"; do (( 10#$_o <= 255 )) || _octets_ok=0; done
  else
    _octets_ok=0
  fi
  if (( ! _octets_ok )); then
    echo "ERROR: --address must be the IPv4 address they connect from, such as" >&2
    echo "       203.0.113.7/32, one host. Without it on the allow-list nothing else" >&2
    echo "       this run makes reaches them. They can read it with:" >&2
    echo "         curl -s https://checkip.amazonaws.com" >&2
    exit 2
  fi
  [[ -n "$LOCATION" ]] || LOCATION="home"
  if [[ "$LOCATION" == *$'\n'* || "$LOCATION" == *';'* ]]; then
    echo "ERROR: --location \"<where>\" goes on one line and without a ';': it" >&2
    echo "       completes the address description '${ACCOUNT}; <where>'." >&2
    exit 2
  fi
  [[ "$ADDRESS" == */* ]] || ADDRESS="${ADDRESS}/32"
fi

# ── Tools and terminal, before anything is minted ────────────────────────────

if (( VERIFY )); then
  delivery_require_tools ssh-keygen=ssh-keygen jq=jq || exit 1
else
  delivery_require_tools "age=${AGE_BIN}" openssl=openssl ssh-keygen=ssh-keygen || exit 1
fi
[[ "$AGE_BIN" != "age" ]] && (( ! VERIFY )) && echo "SYNTHETIC: age='${AGE_BIN}' -- nothing is really sealed." >&2
[[ "$AWS_BIN" != "aws" ]] && echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the account." >&2
[[ -n "${ONBOARD_DEV_TESTER_PROVISION_CMD:-}" ]] && echo "SYNTHETIC: host step='${PROVISION_CMD}' -- no host is being changed." >&2
[[ -n "${ONBOARD_DEV_TESTER_ADDRESS_CMD:-}" ]] && echo "SYNTHETIC: allow-list step='${ADDRESS_CMD}' -- no firewall is being changed." >&2

if [[ -t 0 ]]; then
  echo "ERROR: stdin is a terminal. The host step reads the sudo password of the" >&2
  echo "       account your alias connects as from stdin, so redirect its file:" >&2
  echo "         < ~/AWS/AWS_OPERATOR.txt bash scripts/onboard-dev-tester.sh ..." >&2
  exit 1
fi
if (( ! VERIFY )) && ! terminal_present; then
  echo "ERROR: no terminal to confirm on. Every step that creates something is" >&2
  echo "       confirmed by a typed word. Re-run from an interactive shell." >&2
  echo "       Nothing has been created." >&2
  exit 1
fi

# The sudo password, read once. More than one host step needs it (the read
# before anything is confirmed, the change itself, and the read-back), and a
# single stdin cannot serve two: the first consumer drains it. Each step gets it
# as the first line of its own pipe, never as an argument.
SUDO_PASS=""
IFS= read -r SUDO_PASS || true
if [[ -z "$SUDO_PASS" ]]; then
  echo "ERROR: nothing arrived on stdin. Redirect the sudo password file of the" >&2
  echo "       account your alias connects as:" >&2
  echo "         < ~/AWS/AWS_OPERATOR.txt bash scripts/onboard-dev-tester.sh ..." >&2
  exit 1
fi

# host_step <args...>: the host step, fed the sudo password and nothing else.
host_step() {
  printf '%s\n' "$SUDO_PASS" | bash "$PROVISION_CMD" "$@"
}

# ── The identity this run acts on the strength of ────────────────────────────

aws_profile_use "$FOOTBAG_OPERATOR_PROFILE" \
  "Onboarding a dev-and-tester is refused to every role, including the job role, by the role's own policy." \
  || exit 1
aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" || exit 1

ACCOUNT_ID="$(printf '%s' "$AWS_IDENTITY_ARN" | cut -d: -f5)"
if [[ ! "$ACCOUNT_ID" =~ ^[0-9]{12}$ ]]; then
  echo "ERROR: could not read an account id out of ${AWS_IDENTITY_ARN}." >&2
  exit 1
fi
# The acceptance trusts a delivery only when it was issued in this account, so
# one sealed from anywhere else would be refused at the other end after a key
# and a host password had been minted for it.
if [[ "$ACCOUNT_ID" != "$FOOTBAG_AWS_ACCOUNT_ID" ]]; then
  echo "ERROR: ${AWS_IDENTITY_ARN} is in account ${ACCOUNT_ID}, not this project's" >&2
  echo "       ${FOOTBAG_AWS_ACCOUNT_ID}. Nothing done." >&2
  exit 1
fi
DEV_TESTER_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${FOOTBAG_DEV_TESTER_ROLE}"
STAGING_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/footbag-staging-app-runtime"
if ! "$AWS_BIN" iam get-role --role-name "$FOOTBAG_DEV_TESTER_ROLE" >/dev/null 2>&1; then
  echo "ERROR: there is no ${FOOTBAG_DEV_TESTER_ROLE} role in account ${ACCOUNT_ID}, so there" >&2
  echo "       is nothing to onboard anybody into. Apply the identity tree first:" >&2
  echo "         bash scripts/terraform-apply.sh --target identity" >&2
  exit 1
fi

# A user IAM could not be read is neither absent nor ours. Read as absent, a
# finished onboarding would skip the check below and go on to re-issue a live
# host password before the create failed.
iam_dev_tester_state "$ACCOUNT" || exit 1
# A legacy user is ours under the earlier names; it is moved and retagged after
# the confirmation, then treated as the existing user it is.
IAM_ADOPT_LEGACY=0
case "$IAM_DEV_TESTER_STATE" in
  foreign) iam_dev_tester_refuse_foreign "$ACCOUNT"; exit 1 ;;
  ours) IAM_USER_EXISTS=1 ;;
  legacy) IAM_USER_EXISTS=1; IAM_ADOPT_LEGACY=1 ;;
  *) IAM_USER_EXISTS=0 ;;
esac

# onboard_evidence <key id> <address> <assumed-role ARN or a reason it is absent>
# The block a person copies onto the onboarding card. Nothing in it is secret: a
# key id names a key without being one, and a fingerprint names a public key.
onboard_evidence() {
  echo ""
  echo "---- evidence for the onboarding card ----"
  echo "date:          $(date -u +%Y-%m-%d)"
  echo "account:       ${ACCOUNT}"
  echo "fingerprint:   ${KEY_SHA}"
  echo "access key id: ${1:-unknown}"
  echo "address:       ${2:-none}"
  echo "assumed role:  ${3}"
  echo "------------------------------------------"
}

# ── Proving an accepted onboarding, read-only ────────────────────────────────
#
# One verdict from every place an onboarding leaves a mark, each read rather
# than assumed, and nothing written anywhere. A failure names what is wrong; the
# one thing time alone can fix (CloudTrail not yet showing the acceptance) is
# reported as pending rather than as a failure, with the command to re-run.
if (( VERIFY )); then
  VERIFY_FAIL=0
  vfail() { echo "  FAIL  $1" >&2; VERIFY_FAIL=1; }
  vpass() { echo "  ok    $1"; }

  echo "Verifying ${ACCOUNT} on ${TARGET}, key ${KEY_SHA}"

  # IAM: ours, the one grant, exactly one active key.
  VERIFY_AKID=""
  VERIFY_CREATED=""
  if [[ "$IAM_DEV_TESTER_STATE" != "ours" ]]; then
    vfail "IAM user ${ACCOUNT} reads as ${IAM_DEV_TESTER_STATE}, not one of ours"
  else
    vpass "IAM user ours, at ${IAM_DEV_TESTER_FOUND_PATH}, all three ownership tags"
    V_POLICY="$(iam_dev_tester_policy_state "$ACCOUNT")" || { echo "ERROR: IAM could not be read." >&2; exit 1; }
    if [[ "$V_POLICY" == "present" ]]; then
      vpass "grant ${IAM_DEV_TESTER_POLICY_NAME}"
    else
      vfail "no ${IAM_DEV_TESTER_POLICY_NAME} grant, so the user reaches nothing"
    fi
    V_KEYS="$(iam_dev_tester_keys "$ACCOUNT")" || { echo "ERROR: IAM could not be read." >&2; exit 1; }
    V_ACTIVE="$(printf '%s\n' "$V_KEYS" | awk -F'\t' '$2=="Active"')"
    V_COUNT="$(grep -c . <<<"$V_ACTIVE" || true)"
    if [[ "$V_COUNT" == "1" ]]; then
      VERIFY_AKID="$(cut -f1 <<<"$V_ACTIVE")"
      VERIFY_CREATED="$(cut -f3 <<<"$V_ACTIVE")"
      vpass "exactly one active key, ${VERIFY_AKID}, made ${VERIFY_CREATED}"
    else
      vfail "${V_COUNT:-0} active keys where exactly one belongs"
    fi
  fi

  # The host: live, holding exactly this key, and the shared account not holding it.
  if ! V_HOST="$(host_step --target "$TARGET" --account "$ACCOUNT" --inspect)"; then
    vfail "the ${TARGET} host could not be read"
  else
    if ! grep -qx 'ACCOUNT present' <<<"$V_HOST"; then
      vfail "no ${ACCOUNT} account on the ${TARGET} host"
    elif ! grep -qx 'LOCKED no' <<<"$V_HOST"; then
      vfail "the ${ACCOUNT} host account is locked"
    else
      V_HELD="$(sed -n 's/^KEY //p' <<<"$V_HOST" | awk '{print $2}' | sed '/^$/d' | sort -u)"
      if [[ "$V_HELD" == "$KEY_SHA" ]]; then
        vpass "host account live, holding exactly ${KEY_SHA}"
      else
        vfail "host account holds ${V_HELD:-no key}, not exactly ${KEY_SHA}"
      fi
    fi
    V_SHARED="$(sed -n 's/^SHARED //p' <<<"$V_HOST")"
    if [[ -z "$V_SHARED" || "$V_SHARED" == "unknown" ]]; then
      vfail "whether the shared ${SHARED_HOST_ACCOUNT} account holds this key could not be read"
    elif grep -qxF -- "$KEY_SHA" <<<"$V_SHARED"; then
      vfail "the shared ${SHARED_HOST_ACCOUNT} account holds this key too"
    else
      vpass "the shared ${SHARED_HOST_ACCOUNT} account does not hold this key"
    fi
  fi

  # The address: their own parameter, which the staging firewall admits.
  VERIFY_ADDRESS=""
  if VERIFY_ADDRESS="$("$AWS_BIN" ssm get-parameter --region us-east-1 \
        --name "${DEV_TESTER_PATH}/${ACCOUNT}" --query Parameter.Value --output text 2>/dev/null)" \
     && [[ -n "$VERIFY_ADDRESS" ]]; then
    vpass "address ${VERIFY_ADDRESS}"
  else
    VERIFY_ADDRESS=""
    vfail "no staging address parameter for ${ACCOUNT}"
  fi

  if (( VERIFY_FAIL )); then
    onboard_evidence "${VERIFY_AKID:-}" "$VERIFY_ADDRESS" "not checked: the onboarding is not in place"
    echo ""
    echo "NOT VERIFIED: ${ACCOUNT}'s onboarding is not in place; each FAIL above says why." >&2
    exit 1
  fi

  # The acceptance: the job role assumed with the active key, after it was made.
  # Accepting is the only thing that does that, so seeing it in the trail is
  # seeing the acceptance. CloudTrail delivers events some minutes late, so the
  # read is repeated rather than judged once.
  VERIFY_ARN=""
  V_TRY=0
  while (( V_TRY < POLL_TRIES )); do
    V_TRY=$(( V_TRY + 1 ))
    V_EVENTS="$("$AWS_BIN" cloudtrail lookup-events --region us-east-1 \
      --lookup-attributes "AttributeKey=AccessKeyId,AttributeValue=${VERIFY_AKID}" \
      --start-time "$VERIFY_CREATED" --output json 2>/dev/null || true)"
    [[ -n "$V_EVENTS" ]] || V_EVENTS='{}'
    VERIFY_ARN="$(jq -r --arg created "$VERIFY_CREATED" '
        [ .Events[]?
          | select(.EventName == "AssumeRole")
          | (.CloudTrailEvent | fromjson?) // {}
          | select((.eventTime // "") > $created)
          | .responseElements.assumedRoleUser.arn // empty ] | first // empty
      ' <<<"$V_EVENTS" 2>/dev/null || true)"
    [[ -n "$VERIFY_ARN" ]] && break
    (( V_TRY < POLL_TRIES )) && sleep "$POLL_SECONDS"
  done

  if [[ -z "$VERIFY_ARN" ]]; then
    onboard_evidence "$VERIFY_AKID" "$VERIFY_ADDRESS" "not yet seen in CloudTrail"
    echo ""
    echo "PENDING: everything is in place, but CloudTrail does not yet show ${VERIFY_AKID}"
    echo "assuming the role. Either the onboarding has not been accepted yet, or the"
    echo "trail has not caught up. Re-run in a few minutes:"
    echo "  < ~/AWS/AWS_OPERATOR.txt bash scripts/onboard-dev-tester.sh --verify \\"
    echo "    --target ${TARGET} --account ${ACCOUNT} --expect-fingerprint ${KEY_SHA}"
    exit 3
  fi
  vpass "accepted: ${VERIFY_AKID} assumed the role as ${VERIFY_ARN}"
  onboard_evidence "$VERIFY_AKID" "$VERIFY_ADDRESS" "$VERIFY_ARN"
  echo ""
  echo "VERIFIED: ${ACCOUNT} is onboarded and has accepted. Nothing was changed."
  exit 0
fi

# ── The two steps every run ends with ────────────────────────────────────────
#
# Both are idempotent and both hand off to the script that owns the thing, with
# stdin closed, because this run's stdin carries the sudo password.

# The person's address on the staging allow-list, as their own parameter. Without
# it nothing else reaches them, so it is part of onboarding rather than a step to
# remember. The values file, which holds the administrators' entries, is never
# opened on this path, so an administrator's entry cannot be changed by it even
# when the person shares an administrator's address.
onboard_address() {
  echo ""
  echo "==> ${ACCOUNT}'s address on the ${TARGET} allow-list"
  if ! bash "$ADDRESS_CMD" --target "$TARGET" --dev-tester "$ACCOUNT" --address "$ADDRESS" \
      --for "${ACCOUNT}; ${LOCATION}" </dev/null; then
    echo "ERROR: ${ADDRESS} is not proved on the ${TARGET} allow-list. Everything else is" >&2
    echo "       in place; re-run this same command to finish it." >&2
    exit 1
  fi
}

# onboard_readback [<key id>]
# Reads back from IAM what the onboarding claims: a user of ours (the path and
# all three tags), the one grant, and an active key, the one just minted when it
# is named. Anything else, a read that failed included, fails the run.
#
# IAM only, never this machine's AWS files. A holder re-issuing their own
# onboarding still has the key it just retired in their files until they accept
# the new one, and what those files resolve to says nothing about what IAM
# holds for the person the file was sealed to.
onboard_readback() {
  local want_key="${1:-}" policy keys active
  echo ""
  echo "==> Reading ${ACCOUNT} back from IAM"
  if ! iam_dev_tester_state "$ACCOUNT"; then
    onboard_readback_failed "IAM could not be read."
  fi
  if [[ "$IAM_DEV_TESTER_STATE" != "ours" ]]; then
    onboard_readback_failed "the user reads back as ${IAM_DEV_TESTER_STATE}, not as one of ours at ${IAM_DEV_TESTER_PATH} with all three ownership tags."
  fi
  echo "    user:    ours, at ${IAM_DEV_TESTER_FOUND_PATH}, all three ownership tags"
  policy="$(iam_dev_tester_policy_state "$ACCOUNT")" || onboard_readback_failed "IAM could not be read."
  if [[ "$policy" != "present" ]]; then
    onboard_readback_failed "it does not hold ${IAM_DEV_TESTER_POLICY_NAME}, so it reaches nothing."
  fi
  echo "    grant:   ${IAM_DEV_TESTER_POLICY_NAME}"
  keys="$(iam_dev_tester_keys "$ACCOUNT")" || onboard_readback_failed "IAM could not be read."
  active="$(printf '%s\n' "$keys" | awk -F'\t' '$2=="Active"{print $1}')"
  if [[ -n "$want_key" ]]; then
    if ! grep -qxF -- "$want_key" <<<"$active"; then
      onboard_readback_failed "the key just sealed, ${want_key}, is not active."
    fi
    echo "    key:     ${want_key} active"
  elif [[ -z "$active" ]]; then
    onboard_readback_failed "it holds no active key."
  else
    echo "    key:     ${active//$'\n'/ } active"
  fi
}

onboard_readback_failed() {
  echo "ERROR: ${ACCOUNT} does not read back from IAM as onboarded: ${1}" >&2
  echo "       Do not tell them to accept on the strength of this run. Re-running" >&2
  echo "       the same command reads IAM again, and completes whatever it finds" >&2
  echo "       missing." >&2
  exit 1
}

# The host half of a finished onboarding, proved before it is called done. IAM
# alone cannot say: an offboard that locked the host account and then failed to
# reach IAM leaves the grant and the key live over an account nobody can use.
# Read through the host step's read-only inspection. A host that cannot be read
# is a refusal, never "done".
onboard_host_finished() {
  local out given held
  echo ""
  echo "==> Reading ${ACCOUNT} on the ${TARGET} host"
  if ! out="$(host_step --target "$TARGET" --account "$ACCOUNT" --inspect)"; then
    echo "ERROR: IAM shows ${ACCOUNT} onboarded, but their host account could not be" >&2
    echo "       read, so the onboarding is not proved finished. Nothing was changed." >&2
    echo "       Re-run once the host is reachable." >&2
    exit 1
  fi
  if ! grep -qx 'ACCOUNT present' <<<"$out"; then
    echo "REFUSING: IAM shows ${ACCOUNT} onboarded, but there is no ${ACCOUNT} account on" >&2
    echo "          the ${TARGET} host. Nothing was changed. Re-run with --reissue, which" >&2
    echo "          creates it and seals a fresh file." >&2
    exit 1
  fi
  if ! grep -qx 'LOCKED no' <<<"$out"; then
    echo "REFUSING: IAM shows ${ACCOUNT} onboarded, but their host account is locked," >&2
    echo "          which is what an offboard that stopped part way leaves. Nothing was" >&2
    echo "          changed. Finish the offboarding, then onboard them again:" >&2
    echo "            bash scripts/offboard-dev-tester.sh --target ${TARGET} --account ${ACCOUNT} \\" >&2
    echo "              --from-step 2" >&2
    exit 1
  fi
  given="$KEY_SHA"
  held="$(sed -n 's/^KEY //p' <<<"$out" | awk '{print $2}' | sed '/^$/d' | sort -u)"
  if [[ "$held" != "$given" ]]; then
    echo "REFUSING: IAM shows ${ACCOUNT} onboarded, but their host account does not hold" >&2
    echo "          exactly the key given to this run. It holds:" >&2
    printf '%s\n' "${held:-none}" | sed 's/^/            /' >&2
    echo "          Nothing was changed. A lost or replaced key is offboarded, then" >&2
    echo "          re-onboarded under the same name with a fresh pair." >&2
    exit 1
  fi
  echo "    host:    live, holding exactly ${given}"
}

# A finished onboarding is read back rather than re-issued. The key is committed
# only once the sealed file is placed on the host, so an IAM user carrying the
# grant and an active key is one whose file was placed; re-issuing it would
# replace the key and the password its owner may already be using.
ACTIVE_KEYS=""
if (( IAM_USER_EXISTS && ! IAM_ADOPT_LEGACY )); then
  POLICY_NOW="$(iam_dev_tester_policy_state "$ACCOUNT")" || exit 1
  KEYS_NOW="$(iam_dev_tester_keys "$ACCOUNT")" || exit 1
  ACTIVE_KEYS="$(printf '%s\n' "$KEYS_NOW" | awk -F'\t' '$2=="Active"{print $1}' | tr '\n' ' ')"
  if [[ "$POLICY_NOW" == "present" && -n "${ACTIVE_KEYS// /}" ]] && (( ! REISSUE )); then
    onboard_host_finished
    echo ""
    echo "Already done: ${ACCOUNT} holds the ${FOOTBAG_DEV_TESTER_ROLE} grant and an active key"
    echo "(${ACTIVE_KEYS% }), which exists only once a sealed file has been placed, and"
    echo "their host account is live holding exactly the key given."
    echo "Nothing is re-issued. If they have forgotten their password, or their"
    echo "acceptance finds nothing to fetch and they have not accepted, re-run with"
    echo "--reissue, which replaces both."
    onboard_address
    onboard_readback
    exit 0
  fi
fi

# The host account as it stands, read before anything is confirmed. A key the
# account was retired with is refused here rather than at the host step, after
# two typed confirmations and a minted key: whoever still holds the private half
# of a retired key would be let back in by reinstating it, which is why a
# re-onboarding takes a pair made fresh for it. A key the shared account holds is
# refused here too, for the reason the host half refuses it.
if ! PRE_HOST="$(host_step --target "$TARGET" --account "$ACCOUNT" --inspect)"; then
  echo "ERROR: the ${TARGET} host could not be read, so the key cannot be checked" >&2
  echo "       against what the account was retired with. Nothing has been created." >&2
  exit 1
fi
PRE_RETIRED="$(sed -n 's/^RETIRED //p' <<<"$PRE_HOST" | awk '{print $2}')"
if grep -qxF -- "$KEY_SHA" <<<"$PRE_RETIRED"; then
  echo "REFUSING: ${KEY_SHA} is a key ${ACCOUNT} was retired with. Reinstating it would" >&2
  echo "          let back in whoever still holds its private half. Make a fresh pair:" >&2
  echo "            bash scripts/setup-dev-workstation.sh --aws --account ${ACCOUNT} \\" >&2
  echo "              --replace-key retired --profile ${ACCOUNT}" >&2
  echo "          (--profile proves the old identity dead where no acceptance marker" >&2
  echo "          sits beside the pair; with one, it is not needed)" >&2
  echo "          then onboard with the new key. Nothing has been created." >&2
  exit 1
fi
PRE_SHARED="$(sed -n 's/^SHARED //p' <<<"$PRE_HOST")"
if grep -qxF -- "$KEY_SHA" <<<"$PRE_SHARED"; then
  echo "REFUSING: ${KEY_SHA} is also on the shared ${SHARED_HOST_ACCOUNT} account. A named key" >&2
  echo "          must be a pair of its own. Nothing has been created." >&2
  exit 1
fi

# Read before anything changes, so a Terraform or Lightsail problem costs
# nothing but the run.
known_hosts_pin_lines "$TARGET" "$AWS_BIN" || exit 1

HOST_FILE="$(delivery_file_name "$ACCOUNT" "$TARGET")"

# ── What this run will do ────────────────────────────────────────────────────

echo ""
echo "Onboarding ${FULL_NAME} as ${ACCOUNT} on ${TARGET}, sealed to:"
echo "  ${KEY_FINGERPRINT}"
echo ""
echo "  host account  ${ACCOUNT} on footbag-${TARGET}-web, with a one-time password"
echo "                that is never shown (an existing one is read first and"
echo "                decided with you)"
if (( IAM_ADOPT_LEGACY )); then
  echo "  IAM user      ${ACCOUNT} exists and is ours under ${IAM_DEV_TESTER_LEGACY_PATH};"
  echo "                it is moved to ${IAM_DEV_TESTER_PATH} and its ownership tags"
  echo "                rewritten, its keys are retired and one fresh key is minted"
elif (( IAM_USER_EXISTS )); then
  echo "  IAM user      ${ACCOUNT} exists and is ours; its keys are retired and one"
  echo "                fresh key is minted"
else
  echo "  IAM user      ${ACCOUNT} is created under ${IAM_DEV_TESTER_PATH}, granted"
  echo "                sts:AssumeRole on ${FOOTBAG_DEV_TESTER_ROLE} and nothing else"
fi
echo "  pin lines     ${KNOWN_HOSTS_PIN_COUNT} for ${KNOWN_HOSTS_PIN_IP}"
echo "  sealed file   ~${ACCOUNT}/${HOST_FILE} on the ${TARGET} host, theirs at mode 600,"
echo "                replacing any there; no copy stays on this machine"
echo "  allow-list    ${ADDRESS}, as ${ACCOUNT}'s own address parameter on ${TARGET}"
echo "                (staging's firewall is reapplied alone: every staging port"
echo "                blinks for a few seconds; the values file is not opened)"
echo ""
echo "No IAM change names ${FOOTBAG_OPERATOR_USER}, no administrator allow-list entry is"
echo "touched, and no AWS file on this machine is written."
if ! confirm_from_tty "Type 'APPLY' to onboard ${ACCOUNT}: " "APPLY"; then
  echo "Not confirmed; nothing was created." >&2
  exit 1
fi

# ── State, and what an unfinished run may undo ───────────────────────────────

HOST_DONE=0
SEALED_DONE=0
SEAL_TMP=""

onboard_cleanup() {
  (( SEALED_DONE )) && { secret_file_sweep; return 0; }
  iam_key_cleanup
  iam_dev_tester_undo
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
trap onboard_cleanup EXIT INT TERM

# ── The host account ─────────────────────────────────────────────────────────
#
# The host step inherits this run's stdin, which carries the sudo password, and
# hands the one-time password back through a file this run created and will
# shred.
PASS_FILE="$(umask 077 && mktemp)"
secret_file_register "$PASS_FILE"
printf '%s\n' "$SUDO_PASS" | DTACC_SEALED_OUT="$PASS_FILE" bash "$PROVISION_CMD" --target "$TARGET" \
  --account "$ACCOUNT" --full-name "$FULL_NAME" --key-line "$KEY_LINE" --sealed || {
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

if (( IAM_ADOPT_LEGACY )); then
  iam_dev_tester_adopt_legacy "$ACCOUNT" || exit 1
fi
iam_dev_tester_ensure "$ACCOUNT" "$IAM_USER_EXISTS" "$DEV_TESTER_ROLE_ARN" || exit 1
IAM_KEY_DELIVERY="install"
IAM_KEY_AWS_ARGS=()
iam_key_provision "$ACCOUNT" "" 1 || exit 1

# ── Seal ─────────────────────────────────────────────────────────────────────

DELIVERY_TARGET="$TARGET"
DELIVERY_ACCOUNT="$ACCOUNT"
DELIVERY_FULL_NAME="$FULL_NAME"
DELIVERY_AWS_ACCESS_KEY_ID="$IAM_KEY_AKID"
DELIVERY_AWS_SECRET_ACCESS_KEY="$IAM_KEY_SAK"
DELIVERY_AWS_ACCOUNT_ID="$ACCOUNT_ID"
DELIVERY_DEV_TESTER_ROLE_ARN="$DEV_TESTER_ROLE_ARN"
DELIVERY_STAGING_RUNTIME_ROLE_ARN="$STAGING_ROLE_ARN"
DELIVERY_HOST_ADDRESS="$KNOWN_HOSTS_PIN_IP"
DELIVERY_HOST_PORT="$DELIVERY_SSH_PORT"
DELIVERY_PINS=()
while IFS= read -r _pin; do
  [[ -n "$_pin" ]] && DELIVERY_PINS+=("$_pin")
done <<< "$KNOWN_HOSTS_PIN_LINES"

BUNDLE="$(umask 077 && mktemp)"
secret_file_register "$BUNDLE"
delivery_bundle_emit > "$BUNDLE" || exit 1
DELIVERY_HOST_PASSWORD=""
DELIVERY_AWS_SECRET_ACCESS_KEY=""

SEAL_TMP="$(umask 077 && mktemp)"
secret_file_register "$SEAL_TMP"
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

# ── Placed on the host ───────────────────────────────────────────────────────
#
# In their own home, over this run's pinned connection, and proved there by the
# host step's read-back. The key inside is committed only after that, so a
# placement that fails withdraws a key nobody could ever have fetched. No copy
# stays on this machine: the temp file is shredded on every way out.
echo ""
echo "==> Placing the sealed file in ${ACCOUNT}'s home on the ${TARGET} host"
if ! host_step --target "$TARGET" --account "$ACCOUNT" --place-delivery "$SEAL_TMP"; then
  echo "ERROR: the sealed file is not proved in place on the ${TARGET} host. The key" >&2
  echo "       inside it is withdrawn; re-run the same command." >&2
  exit 1
fi
secret_file_destroy "$SEAL_TMP"
SEAL_TMP=""

iam_key_commit
IAM_KEY_SAK=""
SEALED_DONE=1

echo ""
echo "Sealed to ${KEY_FINGERPRINT%% (*} and placed as ~${ACCOUNT}/${HOST_FILE}."
echo "Only the private half of that key opens it."

onboard_address
onboard_readback "$IAM_KEY_AKID"
onboard_evidence "$IAM_KEY_AKID" "$ADDRESS" "not yet: seen once they accept, by --verify"

echo ""
echo "1. Post the evidence block on the onboarding card, with this line for"
echo "   ${FULL_NAME}. They pull the public repository and run it on their own"
echo "   computer (on this one, when onboarding yourself). It fetches the sealed"
echo "   file from their account on ${TARGET}, proves it, and removes it there:"
echo ""
echo "     bash scripts/accept-dev-tester-onboarding.sh --target ${TARGET} \\"
echo "       --account ${ACCOUNT} --host ${KNOWN_HOSTS_PIN_IP}"
echo ""
echo "   The address is the ${TARGET} host's. It carries no trust: the acceptance"
echo "   refuses a delivery that names any other."
echo ""
echo "2. Nothing is sent to them. If their connection is refused, their address"
echo "   has changed: re-run this with the new one."
echo ""
echo "3. Nothing goes in the vault: nobody named has a vault entry. Who holds this"
echo "   access is read live, and the onboarding card records who approved it."
echo ""
echo "4. When they report success, prove it from here, read-only:"
echo ""
echo "     < ~/AWS/AWS_OPERATOR.txt bash scripts/onboard-dev-tester.sh --verify \\"
echo "       --target ${TARGET} --account ${ACCOUNT} --expect-fingerprint ${KEY_SHA}"
