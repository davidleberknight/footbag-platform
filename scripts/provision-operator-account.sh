#!/usr/bin/env bash
# provision-operator-account.sh
#
# Creates a named Linux account for an operator on a deployed host: one login,
# one public key, one sudo password, one set of sudo rights, all belonging to a
# single named person.
#
# WHO RUNS IT.
#
# Either an operator who already has host access, provisioning somebody else, or
# a new operator provisioning themselves from whatever shared credential got
# them this far. Both are real: the second is what the first run of this script
# will be, because the shared account it exists to retire is the only way in
# until it has run once. The flags read the same either way, and --operator names
# whoever the account is for rather than whoever is typing. Nothing here checks
# which case it is, because nothing here can: the difference is a matter of who
# holds the terminal, and it is the host-access inventory line at the end that
# records the answer.
#
# WHY THIS EXISTS.
#
# The operations rules are explicit that there are no shared shell accounts and
# no shared private keys, and the single-maintainer account was always meant to
# persist only until a second operator joined. Until now the procedure for that
# moment lived in a runbook as a handful of hand-typed root commands, and the
# steps that get skipped under pressure are exactly the ones with no immediate
# feedback: recording the password in the vault, adding the host-access
# inventory line, and checking that sshd will actually admit the new name. A
# host whose sshd carries an AllowUsers list accepts the account creation
# silently and then refuses the login, which reads as a key problem and is not.
#
# So the whole operation lives here: the account, the key, the password, the
# checks that prove the outcome rather than the invocation, and the two records
# an operator would otherwise be trusted to remember.
#
# WHAT IT REFUSES TO DO.
#
#   - Create an account that already exists. A re-run says so and stops, because
#     silently resetting the password would invalidate a vault entry somebody is
#     already working from. Replacing the credential is a rotation, and that
#     takes --rotate.
#   - Accept a key file holding more than one key, or one ssh-keygen cannot
#     parse. Both fail silently later as "Permission denied (publickey)".
#   - Run without the pinned host-key file. The sudo password is line one of the
#     SSH stream, so a first connection to a substituted host would hand over the
#     credential before anything about that host had been checked.
#   - Mint a password with no terminal to show it on. A credential nobody can
#     read is not a failed run, it is a live credential needing cleanup, so the
#     terminal is checked before anything is created.
#   - Delete an account it did not create, or one whose password the operator has
#     already recorded in the vault. Withdrawing a vaulted credential makes the
#     record a lie about the host, which is worse than the half-finished state.
#   - Put the new password, or the sudo password, into any process's argv.
#
# ORDER OF OPERATIONS, AND HOW IT DIVERGES FROM THE SIBLING INSTALLER.
#
# scripts/lib/cwagent-key.sh mints its credential, requires the vault entry, and
# only then installs it, because its install step ships the secret to a place the
# script no longer controls. This script is the other way round: it creates the
# account first and asks for the vault record afterwards. There is no downstream
# to ship to here, so the account stays entirely ours to withdraw right up to the
# moment the operator says they have written the password down, which makes a
# declined or interrupted run recoverable by deleting what it made. The
# confirmation word matches that sibling for the same reason it does there: this
# is not a confirmation to proceed, it is an attestation that a record now exists
# outside this script, and the rollback decision reads the answer.
#
# Usage. Reads the sudo password from stdin, line 1, and shows the new account's
# password on the terminal, so it needs both the redirect and a real terminal:
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/provision-operator-account.sh \
#       --target staging --account jsymons --operator "Julie Symons" \
#       --key-line "ssh-ed25519 AAAAC3Nza... julie@example"
#
# Flags:
#   --target <staging|production>  deployed environment; no default, never
#                                  inherited from ambient state
#   --account <name>               the Linux account name to create
#   --operator "<Full Name>"       who the account belongs to, for the vault
#                                  entry and the host-access inventory line
#   --key-line "<key>"             the account owner's SSH public key, pasted
#                                  whole. Preferred, because
#                                  a key arrives as a line of text in a mail, a
#                                  message or a tracker comment, and staging it
#                                  through a file first means a file to place and
#                                  a file to remember to remove. A public key is
#                                  not a secret, so nothing is lost by carrying
#                                  it here.
#   --key-file <path>              the same key as a .pub file, for when it
#                                  genuinely arrives as one. Exactly one of
#                                  --key-line and --key-file.
#   --rotate                       the account exists; replace its password and
#                                  reinstall the key
#
# The private half of that keypair never leaves its owner's machine and never
# enters the vault: it identifies them, so sharing it destroys the attribution
# the named-account model exists to create.
#
# Override the SSH alias:
#   DEPLOY_TARGET=footbag-staging ...

set -euo pipefail

TARGET=""
ACCOUNT=""
OPERATOR=""
KEY_FILE=""
KEY_LINE_ARG=""
KEY_TMP=""
ROTATE=0

usage() {
  cat <<'EOF'
Usage: < ~/AWS/AWS_OPERATOR.txt bash scripts/provision-operator-account.sh \
         --target <staging|production> --account <name> --operator "<Full Name>" \
         --key-line "<ssh public key>" [--rotate]

Reads the sudo password from stdin (line 1) and shows the new account's password
on the terminal, so it needs both the redirect and an interactive shell.

  --target <staging|production>  deployed environment; no default
  --account <name>               Linux account name to create
  --operator "<Full Name>"       who it belongs to, for the vault and inventory records
  --key-line "<key>"             the account owner's public key, pasted whole (preferred)
  --key-file <path>              the same key as a .pub file, if it arrived as one
  --rotate                       account exists; replace its password, reinstall the key

Override the SSH target:
  DEPLOY_TARGET=footbag-staging ...
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --account)
      ACCOUNT="${2:-}"
      shift 2 || { echo "ERROR: --account requires an argument" >&2; exit 2; }
      ;;
    --operator)
      OPERATOR="${2:-}"
      shift 2 || { echo "ERROR: --operator requires an argument" >&2; exit 2; }
      ;;
    --key-file)
      KEY_FILE="${2:-}"
      shift 2 || { echo "ERROR: --key-file requires an argument" >&2; exit 2; }
      ;;
    --key-line)
      KEY_LINE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --key-line requires an argument" >&2; exit 2; }
      ;;
    --rotate) ROTATE=1; shift ;;
    -h|--help) usage; exit 2 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$TARGET" != "staging" && "$TARGET" != "production" ]]; then
  echo "ERROR: --target must be 'staging' or 'production'; there is no default." >&2
  exit 2
fi
if [[ -z "$ACCOUNT" ]]; then
  echo "ERROR: --account is required. The account name is a human decision, and" >&2
  echo "       there is no safe derivation: guessing it from a full name assumes" >&2
  echo "       a naming convention, and taking it from a key comment is worse." >&2
  exit 2
fi
if [[ -z "$OPERATOR" ]]; then
  echo "ERROR: --operator is required. An account nobody can attribute cannot be" >&2
  echo "       recorded in the host-access inventory, and an unattributable login" >&2
  echo "       is the thing the named-account rule exists to prevent." >&2
  exit 2
fi
if [[ -n "$KEY_LINE_ARG" && -n "$KEY_FILE" ]]; then
  echo "ERROR: pass either --key-line or --key-file, not both. Two sources for" >&2
  echo "       one key is how the installed key stops being the one you checked." >&2
  exit 2
fi
if [[ -z "$KEY_LINE_ARG" && -z "$KEY_FILE" ]]; then
  echo "ERROR: the operator's public key is required: --key-line \"<key>\" for a" >&2
  echo "       key you can paste, or --key-file <path> if it arrived as a file." >&2
  exit 2
fi

# The account name is checked here as well as on the host. useradd would reject
# a bad one, but only after the connection, the sudo and the password mint, and
# its own message does not say which of the two names in this command it means.
if [[ ! "$ACCOUNT" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
  echo "ERROR: '${ACCOUNT}' is not a usable Linux account name." >&2
  echo "       Lower-case letter or underscore first, then letters, digits," >&2
  echo "       underscores or hyphens; 32 characters at most." >&2
  exit 2
fi

# ── The public key ───────────────────────────────────────────────────────────
#
# Read and validated before anything is created, because every defect in a key
# file surfaces on the host as the same unhelpful "Permission denied
# (publickey)" hours later, by which time the account, the password and the
# vault entry all exist and none of them is the problem.
# A pasted key is staged in a temp file this script creates and removes, because
# ssh-keygen validates files rather than strings and the validation is worth more
# than avoiding the file. The operator is never asked to place one or to clean
# one up: a teardown step somebody has to remember is a teardown step that gets
# skipped, and the key then sits wherever it was staged.
if [[ -n "$KEY_LINE_ARG" ]]; then
  KEY_TMP="$(umask 077 && mktemp)"
  trap 'rm -f "$KEY_TMP"' EXIT INT TERM
  printf '%s\n' "$KEY_LINE_ARG" > "$KEY_TMP"
  KEY_FILE="$KEY_TMP"
fi

if [[ ! -f "$KEY_FILE" ]]; then
  echo "ERROR: --key-file '${KEY_FILE}' is not a regular file." >&2
  exit 1
fi

KEY_FINGERPRINT=""
if ! KEY_FINGERPRINT="$(ssh-keygen -l -f "$KEY_FILE" 2>/dev/null)"; then
  echo "ERROR: ssh-keygen cannot read '${KEY_FILE}' as a public key file." >&2
  echo "       This wants the .pub half. If you were sent the key in a mail or a" >&2
  echo "       chat message, check it has not been wrapped across lines." >&2
  exit 1
fi

# One account, one key. A file holding several is how a shared key arrives
# without anyone deciding to share one, and the fingerprint recorded in the
# inventory would then describe only the first of them.
KEY_COUNT="$(printf '%s\n' "$KEY_FINGERPRINT" | grep -c . || true)"
if [[ "$KEY_COUNT" != "1" ]]; then
  echo "ERROR: '${KEY_FILE}' holds ${KEY_COUNT} public keys; expected exactly one." >&2
  echo "       One account, one key: that is what makes a login attributable." >&2
  exit 1
fi

KEY_LINE="$(grep -m1 . "$KEY_FILE")"
if [[ -z "$KEY_LINE" ]]; then
  echo "ERROR: '${KEY_FILE}' is empty." >&2
  exit 1
fi

# ── The operator's own credential ────────────────────────────────────────────
if [[ -t 0 ]]; then
  echo "ERROR: must receive the sudo password on stdin." >&2
  echo "       Run via: < ~/AWS/AWS_OPERATOR.txt bash scripts/provision-operator-account.sh ..." >&2
  echo "" >&2
  usage >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${DEPLOY_TARGET:-footbag-${TARGET}}"
REMOTE_HALF="${SCRIPT_DIR}/internal/provision-operator-account-remote.sh"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"

[[ -r "$REMOTE_HALF" ]] || { echo "ERROR: missing remote-half: $REMOTE_HALF" >&2; exit 1; }

# Test seam (CI only; operators never set this). A stubbed run proves nothing
# about the host, so it says so on stderr rather than looking like a real one.
SSH_BIN="${FOOTBAG_PROVISION_SSH:-ssh}"
if [[ "$SSH_BIN" != "ssh" ]]; then
  echo "SYNTHETIC: ssh='${SSH_BIN}' -- no host is being changed." >&2
fi

require_pinned_known_hosts || exit 1
SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

echo "==> Target host: $REMOTE  (${TARGET})"
echo "==> Account:     $ACCOUNT  for ${OPERATOR}"
echo "==> Key:         $KEY_FINGERPRINT"

# Reachability is proved before a credential exists, so an unreachable host costs
# nothing more than a wasted trip. This connection needs no privilege and so
# consumes none of the credential on stdin.
"$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" "echo '    SSH OK'" </dev/null

# Whether the account is already there decides the mode, and the read is
# unprivileged, so it happens before the password is consumed. "Already exists"
# is a far more useful answer than a failure inside the privileged half.
ACCOUNT_EXISTS="no"
if "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" "id -u -- $(printf '%q' "$ACCOUNT")" </dev/null >/dev/null 2>&1; then
  ACCOUNT_EXISTS="yes"
fi

if [[ "$ACCOUNT_EXISTS" == "yes" && "$ROTATE" -eq 0 ]]; then
  echo "" >&2
  echo "Nothing to do: ${ACCOUNT} already exists on ${REMOTE}." >&2
  echo "" >&2
  echo "This run is stopping rather than resetting the password, because somebody" >&2
  echo "may already be working from the vault entry that records it, and a silent" >&2
  echo "reset would lock them out with no sign of why." >&2
  echo "" >&2
  echo "Replacing the credential is a rotation: re-run with --rotate, which mints" >&2
  echo "a fresh password, reinstalls the key, and shows you the vault entry to" >&2
  echo "update. To remove the account instead, see the offboarding steps in the" >&2
  echo "operations guide." >&2
  exit 1
fi
if [[ "$ACCOUNT_EXISTS" == "no" && "$ROTATE" -eq 1 ]]; then
  echo "ERROR: --rotate was given but ${ACCOUNT} does not exist on ${REMOTE}." >&2
  echo "       Rotating a credential that is not there would create the account" >&2
  echo "       as a side effect of replacing something. Drop --rotate to create it." >&2
  exit 1
fi

MODE="create"
[[ "$ROTATE" -eq 1 ]] && MODE="rotate"

# Checked before minting rather than before printing: a password that exists on
# the host and cannot be shown is live and recorded nowhere, which is a worse
# position than not having run at all.
if [[ ! -t 1 || ! -t 2 ]] || ! { true >/dev/tty; } 2>/dev/null; then
  echo "ERROR: no terminal to show the new account password on." >&2
  echo "       It is displayed once and must not land in a captured stream: a" >&2
  echo "       wrapper, a CI log, an agent transcript. Re-run from an interactive" >&2
  echo "       shell. Nothing has been created." >&2
  exit 1
fi

# ── State, and what an unfinished run may undo ───────────────────────────────
#
#   none     nothing changed on the host
#   created  the account exists and holds this password, recorded nowhere
#   vaulted  the operator has written it down, so it is no longer ours to remove
PROVISION_STATE="none"
NEW_PASS=""
SUDO_PASS=""

# Idempotent, and it has to be: the trap covers EXIT, INT and TERM, and a trapped
# INT does not terminate bash, so the handler can run twice. The state reset at
# the end is what makes each branch report exactly once.
provision_cleanup() {
  case "$PROVISION_STATE" in
    created)
      echo "" >&2
      echo "The run stopped before the password was recorded anywhere, so the" >&2
      echo "account just created is being removed: ${ACCOUNT} on ${REMOTE}." >&2
      if {
        printf '%s\n' "$SUDO_PASS"
        printf 'OPACC_MODE=%q\n' "remove"
        printf 'OPACC_ACCOUNT=%q\n' "$ACCOUNT"
        printf 'OPACC_OPERATOR=%q\n' "$OPERATOR"
        printf 'OPACC_KEY_LINE=%q\n' ""
        printf 'OPACC_PASSWORD=%q\n' ""
        cat "$REMOTE_HALF"
      } | "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash' >&2; then
        echo "Removed. Nothing was left behind." >&2
      else
        echo "COULD NOT REMOVE IT. Do it by hand before doing anything else:" >&2
        echo "  ssh ${REMOTE} 'sudo userdel -r ${ACCOUNT}'" >&2
      fi
      ;;
    vaulted)
      echo "" >&2
      echo "The run did not finish, and the account is NOT being removed:" >&2
      echo "  ${ACCOUNT} on ${REMOTE}" >&2
      echo "You have already recorded its password in the vault, so removing it" >&2
      echo "here would leave the vault describing a login that does not exist." >&2
      echo "" >&2
      echo "Re-running is safe: it will refuse to touch an account that exists," >&2
      echo "so use --rotate to try again with a fresh password, or remove the" >&2
      echo "account and its vault entry together if you are abandoning this." >&2
      ;;
  esac
  # Neither branch is true a second time: the created account has been removed or
  # reported unremovable, and the vaulted one reported as kept. "none" matches
  # nothing, so a second pass is silent.
  PROVISION_STATE="none"
  NEW_PASS=""
}
trap provision_cleanup EXIT INT TERM

# Read once. A single stdin cannot serve two sessions, because the first drains
# it, and the rollback path above needs it as much as the install does.
IFS= read -r SUDO_PASS

# 24 bytes of base64 is 32 characters and no padding, so it survives a copy out
# of the vault and into a one-line file without a trailing character to argue
# about. It is generated rather than chosen, because a password a person invents
# is one that can be guessed, and that holds whether they invented it for
# themselves or for somebody else.
NEW_PASS="$(openssl rand -base64 24 | tr -d '\n')"
if [[ -z "$NEW_PASS" ]]; then
  echo "ERROR: could not generate a password. Nothing has been created." >&2
  exit 1
fi

echo "==> Creating the account via cat-pipe (mode: ${MODE})..."
# printf lines emit shell-quoted assignments so the remote bash binds them before
# running the body; cat appends the body. Combined stream -> ssh stdin -> remote
# sudo -S consumes the password line -> bash inherits the rest. No secret reaches
# argv on either hop.
{
  printf '%s\n' "$SUDO_PASS"
  printf 'OPACC_MODE=%q\n' "$MODE"
  printf 'OPACC_ACCOUNT=%q\n' "$ACCOUNT"
  printf 'OPACC_OPERATOR=%q\n' "$OPERATOR"
  printf 'OPACC_KEY_LINE=%q\n' "$KEY_LINE"
  printf 'OPACC_PASSWORD=%q\n' "$NEW_PASS"
  cat "$REMOTE_HALF"
} | "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'

PROVISION_STATE="created"

VAULT_ENTRY="host-${TARGET}-${ACCOUNT}"
TODAY="$(date -u +%Y-%m-%d)"

{
  echo ""
  echo "Record this in the credential vault NOW. The vault is never the last"
  echo "place to learn that a credential exists, and this is shown once."
  echo ""
  echo "  Title:     ${VAULT_ENTRY}"
  echo "  Username:  ${ACCOUNT}"
  echo "  Password:  ${NEW_PASS}"
  echo "  Notes:     Host sudo password for ${OPERATOR} on the ${TARGET} host."
  echo "             A single person's named account; not shared, not a service"
  echo "             login. It is kept locally at ~/AWS/AWS_OPERATOR.txt, one"
  echo "             line, mode 600, which is where the deploy wrapper reads it."
  echo "             The matching SSH private key is deliberately NOT in this"
  echo "             vault: it identifies its owner, so sharing it destroys the"
  echo "             attribution the named-account model exists to create."
  echo "             Public key fingerprint: ${KEY_FINGERPRINT}"
  echo "             Sensitivity: host shell access, ${TARGET}."
  echo "             Rotation: re-run the provisioning script with --rotate."
  echo ""
  echo "Then the vault's own rules: bump the version number in the file name and"
  echo "in the version line, add a change note, and re-upload."
  echo ""
  echo "If ${OPERATOR} is not the person reading this, the vault is how the"
  echo "password reaches them: never chat, never email."
  echo ""
} > /dev/tty

VAULT_ANSWER=""
printf 'Type VAULTED once it is recorded, or anything else to undo this: ' > /dev/tty
read -r VAULT_ANSWER < /dev/tty || VAULT_ANSWER=""
if [[ "$VAULT_ANSWER" != "VAULTED" ]]; then
  echo "Not vaulted, so the account is being removed rather than left behind." >&2
  exit 1
fi

# From here the password is written down somewhere this script cannot edit, so it
# stops being ours to withdraw.
PROVISION_STATE="vaulted"

echo ""
echo "Account ${ACCOUNT} is ready on ${REMOTE}."
echo ""
echo "Add this line to the host-access inventory, which the operations guide"
echo "requires for every named account:"
echo ""
echo "  ${OPERATOR} | ${ACCOUNT} | ${KEY_FINGERPRINT} | ${TARGET} | approved ${TODAY} | removed: -"
echo ""
echo "The next two checks run from ${OPERATOR}'s own workstation, signed in as"
echo "${ACCOUNT}, and prove the layers separately. Run separately they name the"
echo "failure; run together inside a deploy they do not:"
echo ""
echo "  ssh footbag-${TARGET} \"uptime\"      # firewall, key, and the host-key pin"
echo "  ssh footbag-${TARGET} \"sudo -v\"     # the password, from their own file"
echo ""
echo "If the first times out, their address is not in operator_cidrs, or their"
echo "ISP is dropping the port. If it says 'Permission denied (publickey)', the"
echo "key in this run is not the key on their machine."
