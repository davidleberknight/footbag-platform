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
# an operator provisioning their own named account over the shared account. Both
# are real, and which one applies is decided by the kind of operator: a
# `footbag-operator` holder holds the shared account's sudo password and
# provisions their own named account themselves, while a dev-and-tester is
# provisioned for. The flags read the same either way, and --operator names
# whoever the account is for rather than whoever is typing. Nothing here checks
# which case it is, because nothing here can: the difference is a matter of who
# holds the terminal. A holder's own account ends in a vault entry recording it;
# a dev-and-tester's has none, because who holds that access is read live from
# the host and IAM, and their hire's card records who approved it.
#
# WHY THIS EXISTS.
#
# The operations rules are explicit that no operator shares a shell account or a
# private key for routine work, so every person gets an account of their own. The
# shared account stays for the two jobs only it can do: the host's way back in,
# and the bootstrap onto a host with nobody on it. The procedure for standing up
# a named account once lived in a runbook as hand-typed root commands, and the
# steps that get skipped under pressure are exactly the ones with no immediate
# feedback: recording the access in the vault, adding the host-access
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
#     silently resetting the password would lock its owner out of the password
#     they are using. Replacing the credential is a rotation, and that
#     takes --rotate.
#   - Accept a key file holding more than one key, or one ssh-keygen cannot
#     parse. Both fail silently later as "Permission denied (publickey)".
#   - Run without the pinned host-key file. The sudo password is line one of the
#     SSH stream, so a first connection to a substituted host would hand over the
#     credential before anything about that host had been checked.
#   - Show a password on the terminal. Either the account's owner types it
#     here, or it is generated for somebody who is not here and sealed to their
#     own public key; a run that names neither is refused.
#   - Create anything with no terminal for the typed confirmations, which are
#     checked for before anything is created.
#   - Delete an account it did not create, one whose access the operator has
#     already recorded in the vault, or one whose one-time password it has
#     handed back to be sealed. Withdrawing a recorded account makes the record
#     a lie about the host, which is worse than the half-finished state.
#   - Put the new password, or the sudo password, into any process's argv.
#
# ORDER OF OPERATIONS, AND HOW IT DIVERGES FROM THE SIBLING INSTALLER.
#
# scripts/lib/iam-access-key.sh mints its credential, requires the vault entry, and
# only then installs it, because its install step ships the secret to a place the
# script no longer controls. This script is the other way round: it creates the
# account first and asks for the vault record afterwards. There is no downstream
# to ship to here, so the account stays entirely ours to withdraw right up to the
# moment the operator says they have written the password down, which makes a
# declined or interrupted run recoverable by deleting what it made. The
# confirmation word matches that sibling for the same reason it does there: this
# is not a confirmation to proceed, it is an attestation that a record now exists
# outside this script, and the rollback decision reads the answer. A sealed run
# asks for no record; its account stops being ours to withdraw at the moment its
# password is handed back to the caller to seal.
#
# Usage. Reads the sudo password from stdin, line 1, and asks for typed
# confirmations on the terminal, so it needs both the redirect and a real
# terminal. It is usually run for you, by scripts/onboard-operator.sh for your
# own account and by scripts/hire-dev-tester.sh for somebody else:
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/provision-operator-account.sh \
#       --target staging --account robin_fielder --operator "Robin Fielder" \
#       --key-line "ssh-ed25519 AAAAC3Nza... robin@example" --own-password
#
# Which file belongs on the left is not a guess and not a preference: it follows
# the account the alias connects as, and each account has its own file per
# environment, because staging and production are separate hosts with separate
# passwords:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt   ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#   your own named account:  ~/AWS/HOST_OPERATOR.txt  ~/AWS/HOST_OPERATOR_PRODUCTION.txt
#
# A run started without the redirect names the one it needs.
#
# Flags:
#   --target <staging|production>  deployed environment; no default, never
#                                  inherited from ambient state
#   --account <name>               the Linux account name to create
#   --operator "<Full Name>"       who the account belongs to. Goes into the
#                                  account's comment field, and for a holder's
#                                  own account into its vault entry
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
#   --own-password                 this account is YOURS. You type the password
#                                  here, twice, hidden; it is never generated,
#                                  never displayed, and does not expire, because
#                                  it was yours from the first byte. The run then
#                                  proves the account end to end by logging in as
#                                  it and using sudo, which it can do only in
#                                  this case, since both halves are on this
#                                  machine. Exactly one of this and --sealed on
#                                  every create or rotation.
#   --rotate                       the account exists; replace its password and
#                                  reinstall the key
#   --attest-own                   with --own-password: if the account already
#                                  exists, show the keys it accepts and, on a
#                                  typed APPLY confirming they are your own lost
#                                  keys, rotate it. No script can tell a key you
#                                  lost from somebody else's, so the operator
#                                  attests to it. An account an offboard
#                                  retired is reopened the same way, for the
#                                  same person, with a fresh key: a key it was
#                                  retired with is refused.
#   --sealed                       this account is for somebody not at this
#                                  keyboard, and its one-time password travels
#                                  sealed to their own public key rather than
#                                  being shown. scripts/hire-dev-tester.sh runs
#                                  it that way; an operator does not. The
#                                  password is generated, never displayed, and
#                                  not expired, because its owner replaces it
#                                  themselves when they open the delivery. It is
#                                  handed back through OPACC_SEALED_OUT, a file
#                                  the caller created empty at mode 600, once the
#                                  account is proven. There is no vault entry for
#                                  a dev-and-tester, so no VAULTED. An account
#                                  that already exists is decided here: one an
#                                  offboard retired is reopened on a typed
#                                  APPLY; a live one holding exactly the key
#                                  given is issued a fresh password on a typed
#                                  APPLY; a live one holding any other key is
#                                  refused, because a lost key is fired and
#                                  rehired rather than patched.
#   --offboard                     end this account's access. Disables rather
#                                  than deletes: the password is locked, the
#                                  login shell becomes nologin, the account is
#                                  expired and authorized_keys is moved aside.
#                                  The home directory, the shell history and the
#                                  ownership of everything they left behind stay,
#                                  because that is what an incident review reads
#                                  and deleting it answers no question anybody
#                                  asks. Refuses to disable the account the run
#                                  is connected as, and refuses to leave the host
#                                  with nobody able to log in and use sudo.
#                                  Needs no key and mints no password.
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
OFFBOARD=0
OWN_PASSWORD=0
SEALED=0
ATTEST_OWN=0

usage() {
  cat <<'EOF'
Usage: < ~/AWS/HOST_OPERATOR.txt bash scripts/provision-operator-account.sh \
         --target <staging|production> --account <name> --operator "<Full Name>" \
         --key-line "<ssh public key>" \
         (--own-password [--attest-own] [--rotate] | --sealed | --offboard)

Reads the sudo password from stdin (line 1), so the redirect is not optional, and
refuses an empty first line rather than sending an empty password to the host. It
needs a terminal as well: --offboard stops for a typed APPLY before withdrawing
access; --own-password reads your password from it and stops for a typed VAULTED
afterwards, deliberately after the account exists and has been proven, because a
declined attestation rolls the account back and nothing has been handed to
anybody yet; --sealed asks APPLY before reopening or re-issuing an existing
account, and records no vault entry. A create or rotation names exactly one of
--own-password and --sealed.

  --target <staging|production>  deployed environment; no default
  --account <name>               Linux account name to create
  --operator "<Full Name>"       who it belongs to, for the account and a holder's vault entry
  --key-line "<key>"             the account owner's public key, pasted whole (preferred)
  --key-file <path>              the same key as a .pub file, if it arrived as one
  --own-password                 this account is YOURS: you type the password,
                                 twice, hidden. Never generated, never shown,
                                 never vaulted, and not flagged must-change.
  --rotate                       account exists; replace its password, reinstall the key
  --attest-own                   with --own-password: an existing account is shown,
                                 and rotated (or, if retired, reopened) on a typed
                                 APPLY that it is yours
  --sealed                       for scripts/hire-dev-tester.sh: the password is
                                 never shown and is handed back through the
                                 file named in OPACC_SEALED_OUT, to be sealed
  --offboard                    disable the account and sweep the person's keys
                                 off every account on the host. Destructive.

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
    --offboard) OFFBOARD=1; shift ;;
    --own-password) OWN_PASSWORD=1; shift ;;
    --sealed) SEALED=1; shift ;;
    --attest-own) ATTEST_OWN=1; shift ;;
    -h|--help) usage; exit 0 ;;
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
# Required when an account is being created or rotated, and deliberately not
# when one is being retired. The reason the guard gives is the vault entry: an
# account nobody can attribute cannot be recorded, and an unattributable login
# is what the named-account rule exists to prevent. A retirement records
# nothing. It deletes the entry, and the only thing this name ever reaches is
# the comment field of `useradd`, which a retirement does not call. So demanding
# it there is demanding a value nothing reads, on the one operation that must
# have the fewest ways to fail on the day it is run. It refused every firing:
# the one-command offboard passes the account and the mode and has no name to
# give, so step 1 exited 2 before touching anything.
if [[ -z "$OPERATOR" && "$OFFBOARD" -ne 1 ]]; then
  echo "ERROR: --operator is required. An account nobody can attribute cannot be" >&2
  echo "       recorded in the vault, which is the only record that anyone holds" >&2
  echo "       this access, and an unattributable login is the thing the" >&2
  echo "       named-account rule exists to prevent." >&2
  exit 2
fi
if [[ -n "$KEY_LINE_ARG" && -n "$KEY_FILE" ]]; then
  echo "ERROR: pass either --key-line or --key-file, not both. Two sources for" >&2
  echo "       one key is how the installed key stops being the one you checked." >&2
  exit 2
fi
# Offboarding needs no key: it is ending an access rather than granting one, and
# demanding the departing person's public key to withdraw their access would be
# a requirement nobody can always meet.
if [[ "$OFFBOARD" -eq 0 && -z "$KEY_LINE_ARG" && -z "$KEY_FILE" ]]; then
  echo "ERROR: the operator's public key is required: --key-line \"<key>\" for a" >&2
  echo "       key you can paste, or --key-file <path> if it arrived as a file." >&2
  exit 2
fi
if [[ "$OFFBOARD" -eq 1 && ( -n "$KEY_LINE_ARG" || -n "$KEY_FILE" ) ]]; then
  echo "ERROR: --offboard withdraws access and takes no key. A key given here" >&2
  echo "       would be silently ignored, which is the wrong thing to do with" >&2
  echo "       something an operator believed they were installing." >&2
  exit 2
fi
# Checked here rather than in the offboarding branch below, which is past the
# key handling: the two flags are contradictory as arguments, so they are
# refused as arguments.
if [[ "$OFFBOARD" -eq 1 && "$ROTATE" -eq 1 ]]; then
  echo "ERROR: --rotate replaces a credential and --offboard ends the access." >&2
  echo "       They are opposite intentions; name the one you mean." >&2
  exit 2
fi
if [[ "$OFFBOARD" -eq 1 && "$OWN_PASSWORD" -eq 1 ]]; then
  echo "ERROR: --offboard sets no password, so --own-password has nothing to do." >&2
  exit 2
fi
# The two contradictions are refused before the narrowing rule below, and the
# order is load-bearing rather than cosmetic. --offboard carries no --rotate, so
# the narrowing rule matches it too, and its advice ("add --rotate") would send
# the operator to a second refusal for a flag combination that is also
# forbidden. A refusal that recommends a wrong next step is worse than no
# refusal, because it is followed.
# --sealed is for a person who is not at this keyboard, so it cannot also be
# the flag that says the account is yours, it has nothing to seal on a
# retirement, and it decides an existing account itself, as --attest-own does.
if [[ "$SEALED" -eq 1 && ( "$OWN_PASSWORD" -eq 1 || "$ATTEST_OWN" -eq 1 ) ]]; then
  echo "ERROR: --sealed provisions somebody who is not at this keyboard, and" >&2
  echo "       --own-password says the account is yours. Name the one you mean." >&2
  exit 2
fi
if [[ "$SEALED" -eq 1 && "$OFFBOARD" -eq 1 ]]; then
  echo "ERROR: --sealed hands a new password over and --offboard sets none." >&2
  echo "       They are opposite intentions; name the one you mean." >&2
  exit 2
fi
if [[ "$SEALED" -eq 1 && "$ROTATE" -eq 1 ]]; then
  echo "ERROR: --sealed takes no --rotate: it reads an existing account and" >&2
  echo "       decides the rotation itself, after a typed APPLY." >&2
  exit 2
fi
# The file the password is handed back through. The caller creates it, so it
# can register it for shredding before this run writes a byte into it; this
# run refuses anything it could not be sure only that caller will read.
if [[ "$SEALED" -eq 1 ]]; then
  SEALED_OUT="${OPACC_SEALED_OUT:-}"
  if [[ -z "$SEALED_OUT" ]]; then
    echo "ERROR: --sealed needs OPACC_SEALED_OUT naming the file the password is" >&2
    echo "       handed back through. scripts/hire-dev-tester.sh creates it." >&2
    exit 2
  fi
  if [[ -L "$SEALED_OUT" || ! -f "$SEALED_OUT" ]]; then
    echo "ERROR: OPACC_SEALED_OUT '${SEALED_OUT}' is not a regular file. A link" >&2
    echo "       would send the password wherever it points." >&2
    exit 2
  fi
  if [[ ! -O "$SEALED_OUT" ]]; then
    echo "ERROR: OPACC_SEALED_OUT '${SEALED_OUT}' is not owned by you." >&2
    exit 2
  fi
  SEALED_OUT_MODE="$(stat -c '%a' "$SEALED_OUT" 2>/dev/null || stat -f '%Lp' "$SEALED_OUT" 2>/dev/null || true)"
  if [[ "$SEALED_OUT_MODE" != "600" ]]; then
    echo "ERROR: OPACC_SEALED_OUT '${SEALED_OUT}' is mode '${SEALED_OUT_MODE}';" >&2
    echo "       it must be mode 600 before a password is written into it." >&2
    exit 2
  fi
  if [[ -s "$SEALED_OUT" ]]; then
    echo "ERROR: OPACC_SEALED_OUT '${SEALED_OUT}' is not empty. It is written" >&2
    echo "       whole by this run, and what is there now is not this run's." >&2
    exit 2
  fi
fi
# Only a person can say a key is theirs, and only about their own account, so
# the attestation is tied to the flag that says the account is yours.
if [[ "$ATTEST_OWN" -eq 1 && ( "$OWN_PASSWORD" -eq 0 || "$ROTATE" -eq 1 || "$OFFBOARD" -eq 1 ) ]]; then
  echo "ERROR: --attest-own needs --own-password and takes neither --rotate nor" >&2
  echo "       --offboard: it decides the rotation itself, for your own account." >&2
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
#
# Skipped entirely when offboarding, which takes no key: the whole of this
# section validates something that run is not given and must not require.
KEY_FINGERPRINT=""
if [[ "$OFFBOARD" -eq 0 ]]; then

if [[ -n "$KEY_LINE_ARG" ]]; then
  KEY_TMP="$(umask 077 && mktemp)"
  # No trap here. The account cleanup installed further down replaces any EXIT
  # trap this set, so one armed at this point is silently discarded and the
  # staged key file survives every run that gets that far -- against this
  # section's own promise that the operator is never left a file to clean up.
  # provision_cleanup removes it instead, so there is exactly one EXIT handler
  # and it knows about everything the run created.
  printf '%s\n' "$KEY_LINE_ARG" > "$KEY_TMP"
  KEY_FILE="$KEY_TMP"
fi

if [[ ! -f "$KEY_FILE" ]]; then
  echo "ERROR: --key-file '${KEY_FILE}' is not a regular file." >&2
  exit 1
fi

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

fi  # end of the key section, skipped when offboarding

# ── The operator's own credential ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${DEPLOY_TARGET:-footbag-${TARGET}}"
REMOTE_HALF="${SCRIPT_DIR}/internal/provision-operator-account-remote.sh"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

# The shared account's password is not this script's to set. Refused here, as
# early as the name of that account is known, and long before anything on the
# host is touched.
#
# Everything below about a vault entry is written for a named operator: it
# prints a redacted password and says the account belongs to one person and is
# not shared. Every word of that is wrong for the shared account, whose entry
# has to carry the real value, because a credential every footbag-operator
# holder is meant to hold is exactly what a shared store is for. A run that set the password here would
# hand the custodian instructions to redact a value that must be kept, and the
# vault would then describe a credential nobody can retrieve.
#
# Changing it is a custody operation under the vault's own rules, and there is
# deliberately no script for it. Its keys are not this script's either: several
# holders' keys sit on that one account, and a rotation here writes the account's
# authorized_keys whole, with the one key it was given, so every other holder's
# way in would go with it. They are added and removed one at a time by
# scripts/authorize-operator-key.sh, which edits the file line by line.
if [[ "$ACCOUNT" == "$OPERATOR_SHARED_ACCOUNT" && "$OFFBOARD" -eq 0 ]]; then
  echo "ERROR: ${OPERATOR_SHARED_ACCOUNT} is the shared account, and its password" >&2
  echo "       is not set from here." >&2
  echo "" >&2
  echo "       Every footbag-operator holder holds it, the vault carries the real value rather" >&2
  echo "       than a redaction, and changing it is a custody operation under" >&2
  echo "       the vault's own rules rather than a side effect of provisioning." >&2
  echo "       This run would have told you to record an entry saying the" >&2
  echo "       password is deliberately absent, which for this one account is" >&2
  echo "       the opposite of true." >&2
  echo "" >&2
  echo "       Its keys are added and removed one at a time with" >&2
  echo "       scripts/authorize-operator-key.sh." >&2
  echo "       Nothing done." >&2
  exit 2
fi

# Whose password it is, named every time. It is either typed by the account's
# own owner at this keyboard, or generated for somebody who is not here and
# sealed to their own public key. Showing one on this screen for somebody else
# to be told is neither: a password read aloud, mailed or pasted has left a
# copy wherever it went.
if [[ "$OFFBOARD" -eq 0 && "$OWN_PASSWORD" -eq 0 && "$SEALED" -eq 0 ]]; then
  echo "ERROR: name whose password this is: --own-password when the account is" >&2
  echo "       yours and you are typing it, or --sealed, which" >&2
  echo "       scripts/hire-dev-tester.sh passes for somebody who is not here." >&2
  echo "       Nothing done." >&2
  exit 2
fi

# The shared gate, as every sibling script uses, rather than the hand-rolled
# check this used to carry. The difference is not cosmetic. The old one refused
# an interactive stdin and stopped there, so an EMPTY credential file passed it:
# the bare read further down then set an empty password, every sudo on the host
# refused it, and the run reported what looked like a host problem. It also
# named the staging credential file whatever the target was, so an operator
# whose production run was refused was handed the wrong file to re-run with.
#
# Read ONCE, here, for both branches. A single stdin cannot serve two sessions
# because the first consumer drains it, and the rollback path needs the
# credential as much as the install does.
require_operator_stdin \
  "scripts/provision-operator-account.sh --target ${TARGET} --account ${ACCOUNT} ..." \
  "${REMOTE}" "${TARGET}" || {
  echo "" >&2
  usage >&2
  exit 1
}

# Operator-only preflight, and it follows the credential guard as in every
# sibling script, so a run refused for a missing credential says so wherever it
# runs. This was the one script of its family without it: a workstation with no
# deploy-alias stanza got a bare "Permission denied (publickey)" from the
# reachability probe below, which reads as a rejected key rather than as a name
# ssh could not resolve, and sends the operator to look at the wrong thing.
require_ssh_alias "$REMOTE" || exit 1

# Used by both the creation summary and the offboarding row below.
TODAY="$(date -u +%Y-%m-%d)"

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
[[ -n "$KEY_FINGERPRINT" ]] && echo "==> Key:         $KEY_FINGERPRINT"

# Reachability is proved before a credential exists, so an unreachable host costs
# nothing more than a wasted trip. This connection needs no privilege and so
# consumes none of the credential on stdin.
"$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" "echo '    SSH OK'" </dev/null

# Whether the account is already there decides the mode, and the read is
# unprivileged, so it happens before the password is consumed. "Already exists"
# is a far more useful answer than a failure inside the privileged half.
# The answer travels on stdout, not in the exit status, because these are three
# outcomes and an exit status carries two. An unreachable host and an absent
# account both fail, and treating the pair as "absent" is the dangerous
# direction: on an offboarding it reports "nothing to do", exits zero, and the
# operator records a withdrawal of access that never happened.
ACCOUNT_PROBE="$("$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" \
  "id -u -- $(printf '%q' "$ACCOUNT") >/dev/null 2>&1 && echo EXISTS || echo ABSENT" \
  2>/dev/null </dev/null || echo UNKNOWN)"

if [[ "$ACCOUNT_PROBE" == "UNKNOWN" ]]; then
  echo "ERROR: could not reach ${REMOTE} to check whether ${ACCOUNT} exists." >&2
  echo "       Nothing has been done. Re-run when the host is reachable rather" >&2
  echo "       than acting on a guess about what is there." >&2
  exit 1
fi

ACCOUNT_EXISTS="no"
[[ "$ACCOUNT_PROBE" == "EXISTS" ]] && ACCOUNT_EXISTS="yes"

# ── Offboarding ──────────────────────────────────────────────────────────────
#
# The devops guide has stated the offboarding rule since before any of this
# existed, and had no host step behind it: the only removal path in the tree was
# the rollback the trap uses, which deletes the account and its home, and which
# is the wrong act for a real departure.
#
# Disabling rather than deleting is the whole point. The person's access ends;
# their home directory, shell history and file ownership stay, because that is
# what an incident review reads and deleting it answers no question anybody
# asks. The remote half proves the account can no longer log in rather than
# reporting that four commands ran, and it refuses to leave a host with nobody
# able to administer it.
#
# No password is minted here, so this run needs no terminal to show one on and
# consumes no credential beyond the sudo line.
if [[ "$OFFBOARD" -eq 1 ]]; then
  if [[ "$ACCOUNT_EXISTS" == "no" ]]; then
    echo "Nothing to do: ${ACCOUNT} does not exist on ${REMOTE}."
    echo "Where this was a footbag-operator holder's own named account and a vault"
    echo "entry host-${TARGET}-${ACCOUNT} still exists, delete it and name the person"
    echo "and the date in the change note. A dev-and-tester has no vault entry."
    exit 0
  fi

  echo ""
  echo "Offboarding ${ACCOUNT} on ${REMOTE}."
  echo "The account is disabled, not deleted: password locked, login shell set to"
  echo "nologin, account expired, and authorized_keys moved aside rather than"
  echo "removed. The home directory and every file they own stay exactly as they"
  echo "are, deliberately."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to offboard ${ACCOUNT}: " "APPLY"; then
    echo "Not confirmed; the account is untouched." >&2
    exit 1
  fi

  {
    printf '%s\n' "$SUDO_PASS"
    printf 'OPACC_ACCOUNT=%q\n' "$ACCOUNT"
    printf 'OPACC_MODE=%q\n' "offboard"
    printf 'OPACC_SHARED_ACCOUNT=%q\n' "$OPERATOR_SHARED_ACCOUNT"
    cat "$REMOTE_HALF"
  } | "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'

  echo ""
  echo "The host account is retired. This is the first step of a departure, not"
  echo "the whole of one: bash scripts/offboard-operator.sh runs this step and then"
  echo "retires their AWS identity, their allow-list entry and their repository"
  echo "access, and names what is left after that."
  exit 0
fi

# Your own account, existing, and reached by no key the caller holds: a key you
# lost, an account an offboard retired, or somebody else's account under your
# name. Nothing here can tell those apart, so the host is read, what it holds is
# shown, and the operator attests to it. Read-only until the typed APPLY. A
# retired account is reopened for the same person, which the host half does
# with a fresh key only: a key it was retired with is refused there.
#
# A sealed run reads the account the same way, for somebody who is not here to
# attest. What it is allowed to decide is narrower: a retired account is
# reopened for the same person, and a live one is issued a fresh password only
# when it holds exactly the key given, which is a hire re-run to finish its
# work. A live account holding any other key is a different person or a lost
# key, and neither is patched from here.
REOPEN=0
if [[ "$ACCOUNT_EXISTS" == "yes" && "$ROTATE" -eq 0 && ( "$ATTEST_OWN" -eq 1 || "$SEALED" -eq 1 ) ]]; then
  if ! INSPECT="$({
      printf '%s\n' "$SUDO_PASS"
      printf 'OPACC_MODE=%q\n' "inspect"
      printf 'OPACC_ACCOUNT=%q\n' "$ACCOUNT"
      cat "$REMOTE_HALF"
    } | "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash')"; then
    echo "ERROR: could not read ${ACCOUNT} on ${REMOTE}. Nothing changed." >&2
    exit 1
  fi
  INSPECT_SHELL="$(sed -n 's/^SHELL //p' <<<"$INSPECT")"
  INSPECT_PASSWORD="$(sed -n 's/^PASSWORD //p' <<<"$INSPECT")"
  INSPECT_KEYS="$(sed -n 's/^KEY //p' <<<"$INSPECT")"
  INSPECT_RETIRED="$(sed -n 's/^RETIRED //p' <<<"$INSPECT")"
  if grep -qx 'OFFBOARDED yes' <<<"$INSPECT" \
     || [[ "$INSPECT_SHELL" == */nologin || "$INSPECT_SHELL" == */false \
           || "$INSPECT_PASSWORD" == L || "$INSPECT_PASSWORD" == LK ]]; then
    REOPEN=1
    echo ""
    echo "${ACCOUNT} on ${REMOTE} was retired by an offboard (shell '${INSPECT_SHELL}',"
    echo "password '${INSPECT_PASSWORD}'). The keys it was retired with:"
    if [[ -n "$INSPECT_RETIRED" ]]; then
      sed 's/^/  /' <<<"$INSPECT_RETIRED"
    else
      echo "  none recorded"
    fi
    echo ""
    if (( SEALED )); then
      echo "If it was ${OPERATOR}'s, it is reopened for them under the same name: the"
      echo "login shell and the expiry are restored, it gets the new key alone and a"
      echo "fresh password sealed to that key, and a key it was retired with is"
      echo "refused. If it was not theirs, stop: a name is reused only by the person"
      echo "who held it."
      if ! confirm_from_tty "Type 'APPLY' to reopen ${ACCOUNT} for ${OPERATOR}: " "APPLY"; then
        echo "Not confirmed; ${ACCOUNT} is untouched." >&2
        exit 1
      fi
    else
      echo "If this was your account, it is reopened for you under the same name: the"
      echo "login shell and the expiry are restored, it gets the new key alone and a"
      echo "password you type, and a key it was retired with is refused. If it was"
      echo "not yours, stop: a name is reused only by the person who held it."
      if ! confirm_from_tty "Type 'APPLY' to reopen ${ACCOUNT} as your own: " "APPLY"; then
        echo "Not confirmed; ${ACCOUNT} is untouched." >&2
        exit 1
      fi
    fi
  elif (( SEALED )); then
    # The comparison is on the SHA256 field alone: the length and the comment
    # around it are presentation, and a comment is whatever the key's owner
    # typed.
    GIVEN_SHA="$(awk '{print $2}' <<<"$KEY_FINGERPRINT")"
    HELD_SHAS="$(awk '{print $2}' <<<"$INSPECT_KEYS" | sed '/^$/d' | sort -u)"
    echo ""
    echo "${ACCOUNT} is live on ${REMOTE}. The keys it accepts:"
    if [[ -n "$INSPECT_KEYS" ]]; then
      sed 's/^/  /' <<<"$INSPECT_KEYS"
    else
      echo "  none"
    fi
    echo ""
    if [[ "$HELD_SHAS" != "$GIVEN_SHA" ]]; then
      echo "It does not hold exactly the key given to this run, so it is not" >&2
      echo "re-issued. A lost or replaced key is fired, then rehired under the same" >&2
      echo "name with a fresh pair:" >&2
      echo "  bash scripts/offboard-operator.sh --target ${TARGET} --account ${ACCOUNT} \\" >&2
      echo "    --github-login <their GitHub login, or none>" >&2
      echo "and if it is not ${OPERATOR}'s account at all, stop. Nothing changed." >&2
      exit 1
    fi
    echo "It holds exactly the key given to this run, so this is a hire that did"
    echo "not finish. It is issued a fresh one-time password, sealed to that key;"
    echo "whatever password it holds now stops working."
    if ! confirm_from_tty "Type 'APPLY' to issue ${ACCOUNT} a fresh password: " "APPLY"; then
      echo "Not confirmed; ${ACCOUNT} is untouched." >&2
      exit 1
    fi
  else
    echo ""
    echo "${ACCOUNT} exists on ${REMOTE}, and no key on this machine logs in to it."
    echo "The keys it accepts:"
    if [[ -n "$INSPECT_KEYS" ]]; then
      sed 's/^/  /' <<<"$INSPECT_KEYS"
    else
      echo "  none"
    fi
    echo ""
    echo "If these are your own keys, lost from this machine, the account is rotated:"
    echo "it gets the new key alone and a password you type. If any is not yours,"
    echo "stop: the account may be somebody else's."
    if ! confirm_from_tty "Type 'APPLY' if the account and every key above are yours: " "APPLY"; then
      echo "Not confirmed; ${ACCOUNT} is untouched." >&2
      exit 1
    fi
  fi
  ROTATE=1
fi

if [[ "$ACCOUNT_EXISTS" == "yes" && "$ROTATE" -eq 0 ]]; then
  echo "" >&2
  echo "Nothing to do: ${ACCOUNT} already exists on ${REMOTE}." >&2
  echo "" >&2
  echo "This run is stopping rather than resetting the password, because somebody" >&2
  echo "may already be using the password it holds, and a silent" >&2
  echo "reset would lock them out with no sign of why." >&2
  echo "" >&2
  echo "Replacing your own account's credential is a rotation: re-run with" >&2
  echo "--rotate --own-password, which reinstalls the key, takes the password you" >&2
  echo "type, and shows you the vault entry (fingerprint) to update. For somebody" >&2
  echo "else's account, re-run scripts/hire-dev-tester.sh. To end its access instead:" >&2
  echo "  bash scripts/offboard-operator.sh --target ${TARGET} --account ${ACCOUNT} \\" >&2
  echo "    --github-login <their GitHub login, or none>" >&2
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

# Checked before anything exists. An --own-password run reads the password from
# the terminal and confirms its vault entry by a typed VAULTED; a sealed run asks
# at the terminal before it reopens or re-issues an account that exists. A run
# with none would stop part way.
if (( SEALED )) && { [[ ! -t 1 || ! -t 2 ]] || ! { true >/dev/tty; } 2>/dev/null; }; then
  echo "ERROR: no terminal to confirm on. A sealed run shows no password, but" >&2
  echo "       an account that already exists is reopened or re-issued only on a" >&2
  echo "       typed APPLY. Re-run from an interactive shell. Nothing has been" >&2
  echo "       created." >&2
  exit 1
elif [[ ! -t 1 || ! -t 2 ]] || ! { true >/dev/tty; } 2>/dev/null; then
  echo "ERROR: no terminal to type your password and confirm on. Re-run from an" >&2
  echo "       interactive shell. Nothing has been created." >&2
  exit 1
fi

# ── State, and what an unfinished run may undo ───────────────────────────────
#
#   none     nothing changed on the host
#   created  THIS RUN created the account, and it holds a password recorded
#            nowhere. The only state in which removal is correct.
#   rotating the account predates this run. Never removed, whatever happens;
#            what is uncertain is only which password it now holds.
#   vaulted  the operator has recorded the entry, so it is no longer ours to remove
# A sealed run records no entry: it goes from created or rotating straight to
# none once the password is handed back, and from then on the account is the
# calling script's to seal and report.
PROVISION_STATE="none"
NEW_PASS=""

# Idempotent, and it has to be: the trap covers EXIT, INT and TERM, and a trapped
# INT does not terminate bash, so the handler can run twice. The state reset at
# the end is what makes each branch report exactly once.
provision_cleanup() {
  case "$PROVISION_STATE" in
    created)
      # The state is set before the account exists, so "nothing to remove" is an
      # ordinary outcome here rather than a failure: a refusal on the remote side
      # ahead of useradd lands in this branch too. Probing first is what stops it
      # reporting a phantom account as one the operator must chase by hand.
      #
      # The probe answers on stdout rather than through its exit status, because
      # those are three outcomes and an exit status carries two. An unreachable
      # host and an absent account both fail, and treating the pair as "nothing
      # to do" is the dangerous direction: it skips the removal of an account
      # whose password is recorded nowhere. Only an explicit
      # ABSENT skips; anything else attempts the removal and says so.
      PROBE="$("$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" \
        "id -u -- $(printf '%q' "$ACCOUNT") >/dev/null 2>&1 && echo EXISTS || echo ABSENT" \
        2>/dev/null </dev/null || echo UNKNOWN)"
      if [[ "$PROBE" == "ABSENT" ]]; then
        PROVISION_STATE="none"
        NEW_PASS=""
        return 0
      fi
      if [[ "$PROBE" != "EXISTS" ]]; then
        echo "" >&2
        echo "Could not reach ${REMOTE} to check whether ${ACCOUNT} was created." >&2
        echo "Attempting the removal anyway: an account that may hold a password" >&2
        echo "recorded nowhere is not something to leave on a guess." >&2
      fi
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
        echo "COULD NOT REMOVE IT. End its access before doing anything else; the" >&2
        echo "host offboard disables it through the same pinned connection:" >&2
        echo "  < <the credential file your alias selects> \\" >&2
        echo "    bash scripts/provision-operator-account.sh --target ${TARGET} --account ${ACCOUNT} --offboard" >&2
      fi
      ;;
    rotating)
      # The account predates this run, so it is not ours to remove whatever
      # happened. What IS uncertain is which password it now holds: the remote
      # half may have set the new one before failing, and this run may have been
      # the only place that value was ever shown.
      echo "" >&2
      echo "The rotation did not finish, and ${ACCOUNT} on ${REMOTE} is NOT being" >&2
      echo "removed. It existed before this run, so removing it is not this" >&2
      echo "script's to do at any point." >&2
      echo "" >&2
      echo "Its password is now uncertain: the host may have accepted the new one" >&2
      echo "before the run stopped, and the old one may no longer work. Re-run" >&2
      echo "with --rotate to set a fresh password and record it; that is safe and" >&2
      echo "is the intended way out of this. The account's owner should not try" >&2
      echo "to sudo until it has been re-run." >&2
      ;;
    vaulted)
      echo "" >&2
      echo "The run did not finish, and the account is NOT being removed:" >&2
      echo "  ${ACCOUNT} on ${REMOTE}" >&2
      echo "You have already recorded this account in the vault, so removing it" >&2
      echo "here would leave the vault describing a login that does not exist." >&2
      echo "" >&2
      echo "Re-running is safe: it will refuse to touch an account that exists," >&2
      echo "so use --rotate to try again with a fresh password, or remove the" >&2
      echo "account and its vault entry together if you are abandoning this." >&2
      ;;
  esac
  # The staged public-key file, on every path out. A public key is not a secret,
  # so this is about the promise that the operator is never left a file to
  # remember rather than about exposure. It lives here because this is the only
  # EXIT trap the script has: one armed beside the mktemp would be replaced by
  # this one and never fire.
  [[ -n "$KEY_TMP" ]] && rm -f -- "$KEY_TMP"
  KEY_TMP=""

  # Neither branch is true a second time: the created account has been removed or
  # reported unremovable, and the vaulted one reported as kept. "none" matches
  # nothing, so a second pass is silent.
  PROVISION_STATE="none"
  NEW_PASS=""
}
trap provision_cleanup EXIT INT TERM

# The credential was read once, by the shared gate above, for exactly the reason
# this comment used to give: a single stdin cannot serve two sessions, because
# the first consumer drains it, and the rollback path above needs it as much as
# the install does. Reading it here as well consumed a second line that nobody
# sends, which on an empty file left the password empty and unchecked.

# ── Where the password comes from ────────────────────────────────────────────
#
# Two cases, and they are genuinely different rather than a preference.
#
# Provisioning YOURSELF, with --own-password: you type it here. It is never
# displayed, never generated, and never needs expiring, because it was yours
# from the first byte.
#
# Provisioning SOMEBODY ELSE, with --sealed: the operator running this cannot
# know the other person's password and must not choose it for them. So one is
# generated, never shown, and handed back to the hire script, which seals it to
# their own public key. It is not expired, because they replace it themselves
# by script when they open the delivery rather than at a first login nobody can
# drive, and from then on it is known to them alone.
#
# What does NOT change between the two is the governance rule: this password is
# not vaulted either way. The vault is shared, and a personal credential in it
# lets any custodian act as any operator.
NEW_PASS=""
if (( OWN_PASSWORD )); then
  NEW_PASS_CONFIRM=""
  printf 'Choose the sudo password for %s on %s.\n' "$ACCOUNT" "$REMOTE" > /dev/tty
  printf 'It is not shown as you type, is never displayed, and is not vaulted.\n' > /dev/tty
  printf 'New password: ' > /dev/tty
  IFS= read -rs NEW_PASS < /dev/tty || NEW_PASS=""
  printf '\n' > /dev/tty
  printf 'Again, to confirm: ' > /dev/tty
  IFS= read -rs NEW_PASS_CONFIRM < /dev/tty || NEW_PASS_CONFIRM=""
  printf '\n' > /dev/tty

  if [[ -z "$NEW_PASS" ]]; then
    echo "ERROR: nothing was entered. Nothing has been created." >&2
    exit 1
  fi
  if [[ "$NEW_PASS" != "$NEW_PASS_CONFIRM" ]]; then
    NEW_PASS=""
    NEW_PASS_CONFIRM=""
    echo "ERROR: the two entries differ. Nothing has been created." >&2
    exit 1
  fi
  NEW_PASS_CONFIRM=""

  # Refused here rather than by PAM on the host, where the failure would land
  # after the account exists and leave it in the half-made state this whole
  # state machine is built to avoid.
  if (( ${#NEW_PASS} < 12 )); then
    NEW_PASS=""
    echo "ERROR: that is shorter than 12 characters." >&2
    echo "       This password stands alone: it is not vaulted, so nothing else" >&2
    echo "       recovers the account if it is guessed. Nothing has been created." >&2
    exit 1
  fi
else
  # 24 bytes of base64 is 32 characters and no padding, so it survives a copy out
  # of a message and into a one-line file without a trailing character to argue
  # about. Generated rather than chosen because nobody here is entitled to choose
  # another person's password; its owner replaces it when they open the delivery.
  NEW_PASS="$(openssl rand -base64 24 | tr -d '\n')"
  if [[ -z "$NEW_PASS" ]]; then
    echo "ERROR: could not generate a password. Nothing has been created." >&2
    exit 1
  fi
fi

echo "==> Creating the account via cat-pipe (mode: ${MODE})..."

# The state advances BEFORE the pipe, not after it, and the difference is not
# theoretical. The remote half creates the account and then verifies it, so a
# verification failure exits non-zero with the account already on the host. Set
# after the pipe, this line never runs under `set -e`: the trap fires in the
# "none" state, matches no branch, and silently leaves behind an account whose
# password is recorded nowhere, which is the exact outcome this
# state machine exists to prevent. Being pessimistic costs a removal attempt
# against an account that may not exist, and the cleanup below checks for that
# rather than reporting a phantom as unremovable.
# Which of the two this run is decides what the cleanup may do, and conflating
# them is destructive: setting this to "created" unconditionally means a
# --rotate run that is interrupted, or whose operator types anything other than
# VAULTED, sends OPACC_MODE=remove for an account that PREDATED the run. The
# remote half's remove is `userdel -r`: a person's account, home directory, shell
# history and every file they owned, destroyed by declining a prompt, while
# stderr said "the account just created is being removed".
#
# A trap may only undo what the run itself created. In rotate mode it created
# nothing, so there is nothing for it to undo and the correct action is to say
# what state the account is in and leave it alone.
if [[ "$MODE" == "rotate" ]]; then
  PROVISION_STATE="rotating"
else
  PROVISION_STATE="created"
fi
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
  printf 'OPACC_SHARED_ACCOUNT=%q\n' "$OPERATOR_SHARED_ACCOUNT"
  # Never expired. A password the account's own owner just typed is already
  # theirs, and forcing a change would leave the account depending on a change
  # prompt appearing at the right moment on a host where they may be the only
  # person who can log in. A sealed one is replaced by its owner when they open
  # the delivery, and an expired value would stop the sudo that replacement
  # runs through.
  printf 'OPACC_EXPIRE_PASSWORD=%q\n' "no"
  printf 'OPACC_REOPEN=%q\n' "$( (( REOPEN )) && echo yes || echo no )"
  cat "$REMOTE_HALF"
} | "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'

# This password is NOT vaulted, and that is the point rather than an omission.
#
# The vault is shared between custodians. A personal credential kept in it lets
# any custodian act as any operator, so an access record naming one of them
# records nothing, and the attribution a named account exists to create is gone.
# The governance rule already says so for private SSH keys and second-factor
# seeds: the vault records who holds access, never their personal credential. A
# per-person sudo password is the same kind of thing.
#
# What makes that safe rather than merely principled is that the standing
# password is known to its owner and to nobody else: typed by them here, or
# replaced by them when they open a sealed delivery. So there is nothing here
# worth vaulting and nothing lost by not.
#
# The shared account is the opposite case and stays in the vault, because a
# credential every footbag-operator holder is meant to hold is one the shared
# store is exactly right for.
#
# A dev-and-tester, provisioned with --sealed, has no vault entry at all. The
# entry would hold no secret and nothing that is not read live: the host lists
# its accounts and their key fingerprints, IAM lists the named users under their
# path and tags, and the allow-list names its entries, while the hire's own card
# records who approved them and when. A second, hand-kept copy of live state is
# the register that drifted once already. A footbag-operator holder's own named
# account keeps its entry, as the record the vault's custodians govern.
VAULT_ENTRY="host-${TARGET}-${ACCOUNT}"

if (( SEALED )); then
  {
    echo ""
    # Nothing is printed. The value goes back to the calling script, which seals
    # it to the owner's public key; a screen would be the only other place it
    # had ever been.
    echo "A one-time password is set for ${ACCOUNT}. It is not shown here: it is"
    echo "sealed to ${OPERATOR}'s own public key with the rest of their delivery,"
    echo "and they replace it with their own when they open it. It is not"
    echo "expired, so that replacement can run through sudo."
    if [[ "$MODE" == "rotate" ]]; then
      echo "This replaces the previous one, and the key is the one given to this run."
    fi
    echo "There is no vault entry to record: a dev-and-tester has none."
    echo ""
  } > /dev/tty

  # Handed back once the account is proven, and only then: a run that stopped
  # earlier removes an account it created, and a copy of its password left in
  # the caller's file would describe nothing. printf is a builtin, so the value
  # reaches no process's argv on the way.
  printf '%s\n' "$NEW_PASS" > "$SEALED_OUT"
  NEW_PASS=""
  # From here the password is the calling script's to seal, and an unfinished
  # hire is that script's to report.
  PROVISION_STATE="none"

  echo ""
  echo "Account ${ACCOUNT} is ready on ${REMOTE}."
  echo ""
  echo "The one-time password is in the file the calling script named, for it to"
  echo "seal. The proof that the account works runs when ${OPERATOR} opens the"
  echo "delivery on their own computer and replaces the password through sudo."
  exit 0
fi

{
  echo ""
  # Nothing is printed. The operator typed it, it is on the host, and putting
  # it on a screen now would be the only place it had ever been exposed.
  echo "The password you chose is set for ${ACCOUNT} and is not expired."
  echo "It is yours: it was never generated, never displayed, and is not in"
  echo "the vault. Nobody else can read it, including whoever runs this next."
  if [[ "$MODE" == "rotate" ]]; then
    echo "This replaces the previous one. The account is unchanged, and its key is"
    echo "now the one given to this run."
  fi
  echo ""
  if [[ "$MODE" == "rotate" ]]; then
    echo "The entry already exists. Update it: replace its fingerprint with the one"
    echo "below and add the key-replaced date; keep its approval date."
    echo ""
  fi
  echo "Now record the ENTRY, which carries everything except the password:"
  echo ""
  echo "  Title:     ${VAULT_ENTRY}"
  echo "  Username:  ${ACCOUNT}"
  echo "  Password:  REDACTED - see notes"
  echo "  Notes:     Named host account for ${OPERATOR} on the ${TARGET} host."
  echo "             A single person's account; not shared, not a service login."
  echo "             The sudo password is NOT held here and must not be added."
  echo "             This vault is shared between custodians, so a password kept"
  echo "             in it lets any custodian act as this operator, and an access"
  echo "             record that could be true of more than one person records"
  echo "             nothing. The same reasoning keeps operators' private SSH"
  echo "             keys and personal second-factor seeds out. The password was"
  echo "             chosen by the account's own owner at provisioning time and"
  echo "             was never displayed or generated, so there has never been"
  echo "             a copy of it anywhere to record."
  echo "             Public key fingerprint: ${KEY_FINGERPRINT}"
  if [[ "$MODE" == "rotate" ]]; then
    # A rotation reinstalls the key; it does not approve the access again, so
    # the approval date already in the entry stays as it is.
    echo "             Access approved: keep the date already recorded in the entry."
    echo "             Key replaced: ${TODAY}."
  else
    echo "             Access approved: ${TODAY}."
  fi
  echo "             Sensitivity: environment-wide, root-capable via sudo"
  echo "             Forgotten password: the owner replaces it with --rotate"
  echo "             --own-password. There is nothing here to look up."
  echo "             Lost private key: the account is fired and rehired under"
  echo "             the same name with a freshly made key pair. Record the"
  echo "             new fingerprint here."
  echo ""
  echo "Then the vault's own rules: bump the version number in the file name and"
  echo "in the version line, add a change note, and re-upload."
  echo ""
} > /dev/tty

VAULT_ANSWER=""
printf 'Type VAULTED once the entry is recorded, or anything else to undo this: ' > /dev/tty
read -r VAULT_ANSWER < /dev/tty || VAULT_ANSWER=""
if [[ "$VAULT_ANSWER" != "VAULTED" ]]; then
  echo "Not recorded, so the account is being removed rather than left behind:" >&2
  echo "an unrecorded account is access that no review will ever see." >&2
  exit 1
fi

# From here the account is written down somewhere this script cannot edit, so it
# stops being ours to withdraw.
PROVISION_STATE="vaulted"

echo ""
echo "Account ${ACCOUNT} is ready on ${REMOTE}."
echo ""
# There is deliberately no separate access register to update.
#
# A second register would duplicate the vault entry on most of its fields and
# the two would drift, which is how an account comes to be live while the
# register reads empty. The vault entry above is the record of who holds access,
# and the typed VAULTED confirmation is what makes it exist before the account
# does.
if (( OWN_PASSWORD )); then
  # The account is this operator's own, so the private key and the password are
  # both here and the end-to-end proof is this script's to make rather than a
  # step to hand over. "What it cannot prove is that the key's owner can
  # connect" is true when provisioning somebody else, and an excuse here.
  echo "==> Proving the account end to end, as ${ACCOUNT}"
  # The key is named here because the alias's own stanza lists only the main
  # key, which the account refuses. A public key file selects its private half
  # from the agent.
  PROOF_OPTS=("${SSH_OPTS[@]}" -o "User=${ACCOUNT}" -o "IdentityFile=${KEY_FILE}" -o "BatchMode=yes")
  PROOF_FAILED=0

  if "$SSH_BIN" "${PROOF_OPTS[@]}" "$REMOTE" "uptime" </dev/null >/dev/null 2>&1; then
    echo "    login as ${ACCOUNT}: the firewall, the key and the host pin all hold"
  else
    echo "  FAIL could not log in as ${ACCOUNT}." >&2
    echo "       A timeout means this address is not in operator_cidrs, or the" >&2
    echo "       ISP is dropping the port. 'Permission denied (publickey)' means" >&2
    echo "       the key installed here is not the one this machine offers." >&2
    PROOF_FAILED=1
  fi

  if (( ! PROOF_FAILED )); then
    if printf '%s\n' "$NEW_PASS" \
      | "$SSH_BIN" "${PROOF_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" -v' >/dev/null 2>&1; then
      echo "    sudo as ${ACCOUNT}: the password works and the sudoers rule applies"
    else
      echo "  FAIL sudo refused for ${ACCOUNT}." >&2
      echo "       The account exists and the login works, so this is the" >&2
      echo "       password or the sudoers rule rather than the key." >&2
      PROOF_FAILED=1
    fi
  fi

  # Filed by the run that holds the value, because nothing else ever sees it.
  # This password is typed straight into this script and is never displayed,
  # never returned and never vaulted, so an operator asked to create the
  # credential file afterwards is being asked to retype a secret from memory
  # into a path they also have to get right. One character wrong in either lands
  # as a sudo failure on the host days later, which reads as a broken account
  # and is neither.
  #
  # After the proofs rather than before, because a password that has just been
  # shown to work is the only one worth filing, and a file written ahead of a
  # failed proof would describe a credential that does not work.
  #
  # Only on this path. Provisioning somebody else mints a one-time password for
  # a machine that is not this one, and filing that here would leave their
  # bootstrap credential on the provisioner's disk.
  if (( ! PROOF_FAILED )) && [[ "$ACCOUNT" == "$OPERATOR_SHARED_ACCOUNT" ]]; then
    # The shared account's password is not one person's to file. It is the
    # host's way back in, every footbag-operator holder holds it, and the vault is its
    # canonical copy under custody rules of its own. Writing it here from one
    # operator's run would put a shared credential on one machine silently and
    # leave the vault describing a password that is no longer the one in use.
    echo "    ${OPERATOR_SHARED_ACCOUNT} is the shared account, so its password is not filed here."
    echo "      It is vaulted, and changing it is a custody operation rather than"
    echo "      a side effect of this run."
  elif (( ! PROOF_FAILED )); then
    if ! operator_credential_file_for "$ACCOUNT" "$TARGET"; then
      echo "  FAIL could not work out which file this password belongs in." >&2
      PROOF_FAILED=1
    else
      CRED_EXISTED="no"
      [[ -e "$OPERATOR_CREDENTIAL_FILE" ]] && CRED_EXISTED="yes"
      mkdir -p -m 700 -- "$(dirname -- "$OPERATOR_CREDENTIAL_FILE")"
      # The subshell's umask is what makes the file restricted from its first
      # byte; the chmod covers the case where it already existed, since a
      # truncating write keeps whatever mode was there.
      ( umask 077 && printf '%s\n' "$NEW_PASS" > "$OPERATOR_CREDENTIAL_FILE" )
      chmod 600 -- "$OPERATOR_CREDENTIAL_FILE"
      if [[ "$CRED_EXISTED" == "yes" ]]; then
        echo "    ${OPERATOR_CREDENTIAL_DISPLAY}: replaced, mode 600"
      else
        echo "    ${OPERATOR_CREDENTIAL_DISPLAY}: written, mode 600"
      fi
      echo "      that is the one file this account's sudo password lives in, and"
      echo "      every script that needs it finds it from the alias by itself"
    fi
  fi

  NEW_PASS=""
  if (( PROOF_FAILED )); then
    echo "" >&2
    echo "The account is NOT being removed: it is recorded in the vault now, so" >&2
    echo "withdrawing it would leave the record describing a login that does not" >&2
    echo "exist. Fix what the message above names and re-run with --rotate." >&2
    exit 1
  fi
  echo ""
  echo "Nothing further to do. Your password is set, your key works, and sudo"
  echo "works. There is no first-login ceremony, because there is no one-time"
  echo "credential to replace."
fi

# Finished, so the cleanup has nothing to report on the way out.
PROVISION_STATE="none"
