#!/usr/bin/env bash
# authorize-operator-key.sh
#
# Adds or withdraws one person's SSH public key on an EXISTING account on a
# deployed host. It creates no account, sets no password, and mints nothing.
#
# WHY THIS EXISTS.
#
# It is the unblocker for a new operator, and it is the only thing that has to
# travel before they can do the rest themselves.
#
# These hosts accept public-key authentication only. So the shared account's
# password, which is legitimately in the vault and which every operator holds,
# does NOT get anybody a shell: it authorizes sudo AFTER a login rather than
# granting one. Somebody whose key is not already in an authorized_keys file
# cannot reach anything, which means a newcomer has no way in at all until an
# operator who does have access puts their key somewhere.
#
# The trap is to read the vaulted shared password as a way in and conclude a
# newcomer can provision themselves. They cannot: without a key on the host
# there is no shell to run anything from. This script is what closes that gap.
#
# WHAT IT UNLOCKS, AND WHY THAT IS THE WHOLE POINT.
#
# With her key on the shared account, a newcomer has a shell and already holds
# that account's sudo password from the vault. She can then run
# provision-operator-account.sh --own-password against her OWN named account,
# from her own machine: she types her own password, it is never generated,
# never displayed, and never known to anybody else, and the run proves the
# account end to end because both her private key and her password are there.
#
# Nothing passes between two people except a public key, which is not a secret.
# The alternative -- an existing operator provisioning her -- works, but it mints
# a one-time password that has to be read aloud, and it puts a second person in
# the path of her credential for no gain.
#
# THE KEY ON THE SHARED ACCOUNT IS A LOAN, NOT A GRANT.
#
# A person's key sitting in the shared account's authorized_keys means an action
# taken as that account could have been any of them, which is exactly the
# attribution the named accounts exist to create. So once the named account
# works, run --remove. The script says so at the end of every add, because a
# bootstrap nobody unwinds is just a shared credential with extra steps.
#
# What that withdrawal is NOT is the revocation path, and it must not be relied
# on as one. provision-operator-account.sh --offboard sweeps a departing
# operator's keys off every account on the host and proves none survives, so a
# forgotten withdrawal costs attribution while they are here rather than access
# after they leave.
#
# WHAT IT REFUSES TO DO.
#
#   - Create an account. That is provision-operator-account.sh, which mints a
#     password and demands a vault record; this one does neither, because it
#     grants no new identity, only a second way into an identity that exists.
#   - Rewrite authorized_keys. It appends, and it verifies afterwards that every
#     key that was there before is still there. A script that rebuilds this file
#     to add one line is how an unrelated operator is locked out by a run that
#     reported success.
#   - Install a key it cannot parse, or a file holding more than one. Both fail
#     later as "Permission denied (publickey)", which reads as the newcomer's
#     problem and is not.
#   - Run without the pinned host-key file. The sudo password is line one of the
#     SSH stream, so a first connection to a substituted host would hand over
#     the credential before anything about that host had been checked.
#
# Usage. Reads the sudo password from stdin, line 1:
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/authorize-operator-key.sh \
#       --target staging --account footbag --operator "Julie Symons" \
#       --key-line "ssh-ed25519 AAAAC3Nza... julie footbag"
#
# Flags:
#   --target <staging|production>  deployed environment; no default, never
#                                  inherited from ambient state
#   --account <name>               the EXISTING account whose authorized_keys is
#                                  edited. For a bootstrap this is the shared
#                                  service account. No default: which account
#                                  gains a way in is never guessed.
#   --operator "<Full Name>"       whose key this is. Printed, and named in the
#                                  reminder to withdraw it later.
#   --key-line "<key>"             the key, pasted whole. Preferred: a key
#                                  arrives as a line of text in a mail.
#   --key-file <path>              the same key as a .pub file.
#   --remove                       withdraw the key instead of adding it. Takes
#                                  the same key, and matches on fingerprint, so
#                                  a key written with a different comment is
#                                  still found.
#   --yes                          accept the typed confirmation in advance
#
# Override the SSH alias:
#   DEPLOY_TARGET=footbag-staging ...

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

TARGET=""
ACCOUNT=""
OPERATOR=""
KEY_FILE=""
KEY_LINE_ARG=""
KEY_TMP=""
REMOVE=0

usage() {
  cat <<'EOF'
Usage: < ~/AWS/AWS_OPERATOR.txt bash scripts/authorize-operator-key.sh \
         --target <staging|production> --account <name> \
         --operator "<Full Name>" --key-line "<ssh public key>" [--remove]

Adds one person's public key to an EXISTING account's authorized_keys, so a new
operator has a shell and can then provision their own named account themselves.
Creates no account and sets no password.

  --target <staging|production>  deployed environment; no default
  --account <name>               the existing account to authorize the key on
  --operator "<Full Name>"       whose key it is
  --key-line "<key>"             the key, pasted whole (preferred)
  --key-file <path>              the same key as a .pub file
  --remove                       withdraw the key rather than add it
  --yes                          accept the typed confirmation in advance

A key added to a SHARED account is a bootstrap. Withdraw it with --remove once
the person's own named account works.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --account) ACCOUNT="${2:-}"; shift 2 ;;
    --operator) OPERATOR="${2:-}"; shift 2 ;;
    --key-file) KEY_FILE="${2:-}"; shift 2 ;;
    --key-line) KEY_LINE_ARG="${2:-}"; shift 2 ;;
    --remove) REMOVE=1; shift ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

if [[ -z "$ACCOUNT" ]]; then
  echo "ERROR: --account is required and has no default." >&2
  echo "       Which account gains a way in is the whole decision here, so it" >&2
  echo "       is never inferred. For a newcomer's bootstrap this is the" >&2
  echo "       shared service account." >&2
  exit 2
fi
if [[ ! "$ACCOUNT" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
  echo "ERROR: '${ACCOUNT}' is not a usable Linux account name." >&2
  exit 2
fi
if [[ -z "$OPERATOR" ]]; then
  echo "ERROR: --operator is required: whose key this is." >&2
  echo "       It is printed with the change and named in the reminder to" >&2
  echo "       withdraw a bootstrap key later. A key nobody is named against" >&2
  echo "       is an access nobody will think to remove." >&2
  exit 2
fi

# ── The key ──────────────────────────────────────────────────────────────────
if [[ -n "$KEY_LINE_ARG" && -n "$KEY_FILE" ]]; then
  echo "ERROR: give --key-line or --key-file, not both." >&2
  exit 2
fi
if [[ -z "$KEY_LINE_ARG" && -z "$KEY_FILE" ]]; then
  echo "ERROR: the key is required: --key-line \"<key>\" or --key-file <path>." >&2
  exit 2
fi

cleanup_local() {
  [[ -n "$KEY_TMP" && -e "$KEY_TMP" ]] && rm -f "$KEY_TMP"
  # An EXIT trap's last command decides the script's exit status in bash, so a
  # trap ending on a false test silently rewrites every refusal below to 1. The
  # argument guards exit 2 by contract, and a caller distinguishing "bad
  # invocation" from "it failed" depends on that.
  return 0
}
trap cleanup_local EXIT INT TERM

if [[ -n "$KEY_LINE_ARG" ]]; then
  KEY_TMP="$(mktemp)"
  printf '%s\n' "$KEY_LINE_ARG" > "$KEY_TMP"
  KEY_SOURCE="$KEY_TMP"
else
  if [[ ! -r "$KEY_FILE" ]]; then
    echo "ERROR: cannot read key file '${KEY_FILE}'." >&2
    exit 2
  fi
  KEY_SOURCE="$KEY_FILE"
fi

# A file holding two keys would authorize both, and the second would be
# somebody nobody named. Refused rather than silently obeyed.
KEY_COUNT="$(grep -c '^[[:space:]]*[^#[:space:]]' "$KEY_SOURCE" || true)"
if [[ "$KEY_COUNT" -ne 1 ]]; then
  echo "ERROR: expected exactly one key, found ${KEY_COUNT}." >&2
  echo "       Authorizing a file of keys would grant access to whoever owns" >&2
  echo "       the others, and this script names exactly one person." >&2
  exit 2
fi

if ! KEY_INFO="$(ssh-keygen -l -f "$KEY_SOURCE" 2>&1)"; then
  echo "ERROR: ssh-keygen cannot parse that key." >&2
  echo "       ${KEY_INFO}" >&2
  echo "       An unparseable key installs cleanly and then fails every login" >&2
  echo "       as 'Permission denied (publickey)', which reads as the key" >&2
  echo "       owner's problem rather than a bad paste." >&2
  exit 2
fi
KEY_FINGERPRINT="$(printf '%s\n' "$KEY_INFO" | awk '{print $2}')"
KEY_LINE="$(grep -m1 '^[[:space:]]*[^#[:space:]]' "$KEY_SOURCE")"

# ── The connection ───────────────────────────────────────────────────────────
REMOTE="${DEPLOY_TARGET:-footbag-${TARGET}}"
REMOTE_HALF="${SCRIPT_DIR}/internal/authorize-operator-key-remote.sh"
[[ -r "$REMOTE_HALF" ]] || { echo "ERROR: missing ${REMOTE_HALF}" >&2; exit 1; }

require_operator_stdin "scripts/authorize-operator-key.sh --target ${TARGET} ..." || exit 1
require_ssh_alias "$REMOTE" || exit 1
require_host_ssh_opts || exit 1

SSH_BIN="${FOOTBAG_AUTHKEY_SSH:-ssh}"
[[ -n "${FOOTBAG_AUTHKEY_SSH:-}" ]] && \
  echo "NOTICE: ssh is stubbed via FOOTBAG_AUTHKEY_SSH; this run proves nothing about the host." >&2

MODE="add"
[[ "$REMOVE" -eq 1 ]] && MODE="remove"

echo "==> Target host: ${REMOTE}  (${TARGET})"
echo "==> Account:     ${ACCOUNT}"
echo "==> Key:         ${KEY_INFO}"
echo "==> Operator:    ${OPERATOR}"
echo

if [[ "$MODE" == "add" ]]; then
  cat <<EOF
About to authorize ${OPERATOR}'s key on the ${ACCOUNT} account of ${REMOTE}.

They will be able to log in as ${ACCOUNT} and, with that account's sudo
password, to use sudo as it. Anything they do will be recorded against
${ACCOUNT} rather than against them, so if ${ACCOUNT} is shared this is a
bootstrap and not a destination: it exists so they can create their own named
account, and it is withdrawn with --remove once that account works.
EOF
else
  cat <<EOF
About to withdraw ${OPERATOR}'s key from the ${ACCOUNT} account of ${REMOTE}.

They will no longer be able to log in as ${ACCOUNT}. Any other account they
hold on this host is untouched, and so is every other key on this one.
EOF
fi
echo

if ! confirm_from_tty "Type 'APPLY' to continue: " "APPLY"; then
  echo "Declined. Nothing has been changed." >&2
  exit 1
fi

echo "==> Applying via cat-pipe (mode: ${MODE})..."
{
  printf '%s\n' "$SUDO_PASS"
  printf 'AUTHKEY_MODE=%q\n' "$MODE"
  printf 'AUTHKEY_ACCOUNT=%q\n' "$ACCOUNT"
  printf 'AUTHKEY_OPERATOR=%q\n' "$OPERATOR"
  printf 'AUTHKEY_KEY_LINE=%q\n' "$KEY_LINE"
  printf 'AUTHKEY_FINGERPRINT=%q\n' "$KEY_FINGERPRINT"
  cat "$REMOTE_HALF"
} | "$SSH_BIN" "${HOST_SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'

echo
if [[ "$MODE" == "add" ]]; then
  cat <<EOF
Done. ${OPERATOR} can now reach ${REMOTE} as ${ACCOUNT}.

What they do next, from their own machine, with nothing further from you:

  < <their credential file> bash scripts/provision-operator-account.sh \\
    --target ${TARGET} --account <first_last> --operator "${OPERATOR}" \\
    --key-file <their public key> --own-password

They type their own password. It is never generated, never displayed, and is
not vaulted, so nobody else can read it -- including you, and including whoever
holds this vault next. Their vault entry host-${TARGET}-<first_last> records
the access and carries no password.

THEN COME BACK AND WITHDRAW THIS KEY:

  < <your credential file> bash scripts/authorize-operator-key.sh \\
    --target ${TARGET} --account ${ACCOUNT} --operator "${OPERATOR}" \\
    --key-line "<the same key>" --remove

Until you do, an action taken as ${ACCOUNT} could have been any of you, which
is the attribution the named accounts exist to create. That is the cost while
they are still here, and it is the reason to withdraw it promptly rather than
eventually.

If it is forgotten it does not become permanent: provision-operator-account.sh
--offboard sweeps a departing operator's keys off every account on the host,
not only their named one, and proves afterwards that none survives. So this is
about attribution, not about revocation.
EOF
else
  echo "Done. ${OPERATOR}'s key is no longer authorized on ${ACCOUNT}."
  echo "Their own named account, if they have one, is untouched."
fi
