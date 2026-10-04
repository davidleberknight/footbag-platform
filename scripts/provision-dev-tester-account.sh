#!/usr/bin/env bash
# provision-dev-tester-account.sh
#
# Creates a named Linux account for a dev-and-tester on a deployed host: one login,
# one public key, one sudo password, one set of sudo rights, all belonging to a
# single named person.
#
# WHO RUNS IT.
#
# scripts/onboard-dev-tester.sh runs it, as the host step of onboarding one
# dev-and-tester, and scripts/offboard-dev-tester.sh runs it as the host step of
# offboarding one. An operator does not run it by hand. It is the same step
# whether the person being onboarded is somebody on another machine or the
# operator themselves: the password is generated, never shown, and sealed to
# the person's own public key either way. No named account has a vault entry:
# who holds that access is read live from the host and IAM, and the onboarding
# card records who approved it.
#
# WHY THIS EXISTS.
#
# The operations rules are explicit that nobody shares a private key, and every
# dev-and-tester reaches staging through an account of their own. The shared
# account stays for the two jobs only it can do: the host's way back in, and the
# bootstrap onto a host with nobody on it. The steps that get skipped under
# pressure are the ones with no immediate feedback, such as checking that sshd
# will actually admit the new name: a host whose sshd carries an AllowUsers list
# accepts the account creation silently and then refuses the login, which reads
# as a key problem and is not.
#
# So the whole host operation lives here: the account, the key, the password,
# and the checks that prove the outcome rather than the invocation.
#
# WHAT IT REFUSES TO DO.
#
#   - Reset an account that already exists without asking. One that is live is
#     re-issued only when it holds exactly the key given, and only on a typed
#     APPLY, because a silent reset would lock its owner out of the password
#     they are using.
#   - Accept a key file holding more than one key, or one ssh-keygen cannot
#     parse. Both fail silently later as "Permission denied (publickey)".
#   - Run without the pinned host-key file. The sudo password is line one of the
#     SSH stream, so a first connection to a substituted host would hand over the
#     credential before anything about that host had been checked.
#   - Show a password on the terminal. It is generated for the account's owner
#     and handed back to be sealed to their own public key.
#   - Create anything with no terminal for the typed confirmations, which are
#     checked for before anything is created.
#   - Delete an account it did not create, or one whose one-time password it
#     has handed back to be sealed.
#   - Put the new password, or the sudo password, into any process's argv.
#
# ORDER OF OPERATIONS.
#
# The account is created first and proved, and only then is its one-time
# password handed back to the caller to seal. Up to that moment the account is
# entirely this run's to withdraw, which makes an interrupted run recoverable by
# deleting what it made. From that moment it is the caller's.
#
# Usage. Reads the sudo password from stdin, line 1, and asks for typed
# confirmations on the terminal, so it needs both the redirect and a real
# terminal. scripts/onboard-dev-tester.sh runs it for you:
#
#   < ~/AWS/AWS_OPERATOR.txt DTACC_SEALED_OUT=<mode-600 empty file> \
#     bash scripts/provision-dev-tester-account.sh \
#       --target staging --account robin_fielder --full-name "Robin Fielder" \
#       --key-line "ssh-ed25519 AAAAC3Nza... robin@example" --sealed
#
# Which file belongs on the left is not a guess and not a preference: it follows
# the account the alias connects as, and each account has its own file:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt
#   your own named account:  ~/AWS/DEV_TESTER_HOST.txt
#
# A run started without the redirect names the one it needs.
#
# Flags:
#   --target staging               the only environment a named account exists
#                                  on; required, never inherited from ambient
#                                  state
#   --account <name>               the Linux account name to create
#   --full-name "<Full Name>"      who the account belongs to, for the
#                                  account's comment field
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
#   --sealed                       create or re-issue the account, with a
#                                  one-time password that travels sealed to the
#                                  owner's own public key rather than being
#                                  shown. The password is generated, never
#                                  displayed, and not expired, because its owner
#                                  replaces it themselves when they accept the
#                                  onboarding. It is handed back through
#                                  DTACC_SEALED_OUT, a file the caller created
#                                  empty at mode 600, once the account is
#                                  proven. An account that already exists is
#                                  decided here: one an offboard retired is
#                                  reopened on a typed APPLY; a live one holding
#                                  exactly the key given is issued a fresh
#                                  password on a typed APPLY; a live one holding
#                                  any other key is refused, because a lost key
#                                  is offboarded and re-onboarded rather than
#                                  patched.
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
#   --inspect                      read the account and change nothing: prints
#                                  ACCOUNT present|absent, then for one that is
#                                  present LOCKED yes|no (the same test the
#                                  reopen decision uses) and one KEY line per
#                                  key it accepts. Takes no key, no full
#                                  name and no terminal. It exists so a finished
#                                  onboarding's host account can be proved live
#                                  before the onboarding is called done.
#
# The private half of that keypair never leaves its owner's machine and never
# enters the vault: it identifies them, so sharing it destroys the attribution
# the named-account model exists to create.

set -euo pipefail

TARGET=""
ACCOUNT=""
FULL_NAME=""
KEY_FILE=""
KEY_LINE_ARG=""
KEY_TMP=""
ROTATE=0
OFFBOARD=0
SEALED=0
INSPECT_ONLY=0

usage() {
  cat <<'EOF'
Usage: < <the credential file your alias selects> bash scripts/provision-dev-tester-account.sh \
         --target staging --account <name> --full-name "<Full Name>" \
         --key-line "<ssh public key>" (--sealed | --offboard)
       < <the credential file your alias selects> bash scripts/provision-dev-tester-account.sh \
         --target staging --account <name> --inspect

Reads the sudo password from stdin (line 1), so the redirect is not optional, and
refuses an empty first line rather than sending an empty password to the host. It
needs a terminal as well: --offboard stops for a typed APPLY before withdrawing
access, and --sealed asks APPLY before reopening or re-issuing an existing
account. scripts/onboard-dev-tester.sh and scripts/offboard-dev-tester.sh run it.

  --target staging               the only environment a named account exists on
  --account <name>               Linux account name to create
  --full-name "<Full Name>"      who it belongs to, for the account's comment field
  --key-line "<key>"             the account owner's public key, pasted whole (preferred)
  --key-file <path>              the same key as a .pub file, if it arrived as one
  --sealed                       create or re-issue the account: the password is
                                 never shown and is handed back through the
                                 file named in DTACC_SEALED_OUT, to be sealed
  --offboard                     disable the account and sweep the person's keys
                                 off every account on the host. Destructive.
  --inspect                      read the account and change nothing: whether it
                                 exists, whether it is locked, the keys it accepts
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
    --full-name)
      FULL_NAME="${2:-}"
      shift 2 || { echo "ERROR: --full-name requires an argument" >&2; exit 2; }
      ;;
    --key-file)
      KEY_FILE="${2:-}"
      shift 2 || { echo "ERROR: --key-file requires an argument" >&2; exit 2; }
      ;;
    --key-line)
      KEY_LINE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --key-line requires an argument" >&2; exit 2; }
      ;;
    --offboard) OFFBOARD=1; shift ;;
    --sealed) SEALED=1; shift ;;
    --inspect) INSPECT_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

# Every account made or retired here is a dev-and-tester's, and a dev-and-tester
# is onboarded onto staging only.
if [[ "$TARGET" == "production" ]]; then
  echo "ERROR: no named account is made or retired on production. A dev-and-tester" >&2
  echo "       is onboarded onto staging only. Nothing done." >&2
  exit 2
fi
if [[ "$TARGET" != "staging" ]]; then
  echo "ERROR: --target must be 'staging'; there is no default." >&2
  exit 2
fi
if [[ -z "$ACCOUNT" ]]; then
  echo "ERROR: --account is required. The account name is a human decision, and" >&2
  echo "       there is no safe derivation: guessing it from a full name assumes" >&2
  echo "       a naming convention, and taking it from a key comment is worse." >&2
  exit 2
fi
# Required when an account is being created, and deliberately not when one is
# being retired. An unattributable login is what the named-account rule exists
# to prevent, and the name goes into the account's comment field, where the
# host itself says whose it is. A retirement calls no `useradd`, so demanding
# the name there is demanding a value nothing reads, on the one operation that
# must have the fewest ways to fail: the one-command offboard passes the account
# and the mode and has no name to give.
# A read needs neither the name nor a key, and refuses both as arguments below.
if [[ "$INSPECT_ONLY" -eq 1 ]]; then
  if [[ "$SEALED" -eq 1 || "$OFFBOARD" -eq 1 ]]; then
    echo "ERROR: --inspect reads the account and changes nothing; it is not combined" >&2
    echo "       with --sealed or --offboard." >&2
    exit 2
  fi
  if [[ -n "$FULL_NAME" || -n "$KEY_LINE_ARG" || -n "$KEY_FILE" ]]; then
    echo "ERROR: --inspect takes only --target and --account. Anything else given" >&2
    echo "       here would be silently ignored." >&2
    exit 2
  fi
fi
if [[ -z "$FULL_NAME" && "$OFFBOARD" -ne 1 && "$INSPECT_ONLY" -ne 1 ]]; then
  echo "ERROR: --full-name is required. It is written into the account itself, so" >&2
  echo "       the host says whose login this is, and an unattributable login is" >&2
  echo "       the thing the named-account rule exists to prevent." >&2
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
if [[ "$OFFBOARD" -eq 0 && "$INSPECT_ONLY" -eq 0 && -z "$KEY_LINE_ARG" && -z "$KEY_FILE" ]]; then
  echo "ERROR: the dev-and-tester's public key is required: --key-line \"<key>\" for a" >&2
  echo "       key you can paste, or --key-file <path> if it arrived as a file." >&2
  exit 2
fi
if [[ "$OFFBOARD" -eq 1 && ( -n "$KEY_LINE_ARG" || -n "$KEY_FILE" ) ]]; then
  echo "ERROR: --offboard withdraws access and takes no key. A key given here" >&2
  echo "       would be silently ignored, which is the wrong thing to do with" >&2
  echo "       something an operator believed they were installing." >&2
  exit 2
fi
# Checked as arguments: the two are opposite intentions, and exactly one is
# named on every run.
if [[ "$SEALED" -eq 1 && "$OFFBOARD" -eq 1 ]]; then
  echo "ERROR: --sealed hands a new password over and --offboard sets none." >&2
  echo "       They are opposite intentions; name the one you mean." >&2
  exit 2
fi
if [[ "$SEALED" -eq 0 && "$OFFBOARD" -eq 0 && "$INSPECT_ONLY" -eq 0 ]]; then
  echo "ERROR: name the operation: --sealed to create or re-issue the account, or" >&2
  echo "       --offboard to end its access. scripts/onboard-dev-tester.sh and" >&2
  echo "       scripts/offboard-dev-tester.sh pass the right one." >&2
  exit 2
fi
# The file the password is handed back through. The caller creates it, so it
# can register it for shredding before this run writes a byte into it; this
# run refuses anything it could not be sure only that caller will read.
if [[ "$SEALED" -eq 1 ]]; then
  SEALED_OUT="${DTACC_SEALED_OUT:-}"
  if [[ -z "$SEALED_OUT" ]]; then
    echo "ERROR: --sealed needs DTACC_SEALED_OUT naming the file the password is" >&2
    echo "       handed back through. scripts/onboard-dev-tester.sh creates it." >&2
    exit 2
  fi
  if [[ -L "$SEALED_OUT" || ! -f "$SEALED_OUT" ]]; then
    echo "ERROR: DTACC_SEALED_OUT '${SEALED_OUT}' is not a regular file. A link" >&2
    echo "       would send the password wherever it points." >&2
    exit 2
  fi
  if [[ ! -O "$SEALED_OUT" ]]; then
    echo "ERROR: DTACC_SEALED_OUT '${SEALED_OUT}' is not owned by you." >&2
    exit 2
  fi
  SEALED_OUT_MODE="$(stat -c '%a' "$SEALED_OUT" 2>/dev/null || stat -f '%Lp' "$SEALED_OUT" 2>/dev/null || true)"
  if [[ "$SEALED_OUT_MODE" != "600" ]]; then
    echo "ERROR: DTACC_SEALED_OUT '${SEALED_OUT}' is mode '${SEALED_OUT_MODE}';" >&2
    echo "       it must be mode 600 before a password is written into it." >&2
    exit 2
  fi
  if [[ -s "$SEALED_OUT" ]]; then
    echo "ERROR: DTACC_SEALED_OUT '${SEALED_OUT}' is not empty. It is written" >&2
    echo "       whole by this run, and what is there now is not this run's." >&2
    exit 2
  fi
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
# (publickey)" hours later, by which time the account and the password exist
# and neither of them is the problem.
# A pasted key is staged in a temp file this script creates and removes, because
# ssh-keygen validates files rather than strings and the validation is worth more
# than avoiding the file. The operator is never asked to place one or to clean
# one up: a teardown step somebody has to remember is a teardown step that gets
# skipped, and the key then sits wherever it was staged.
#
# Skipped entirely when offboarding, which takes no key: the whole of this
# section validates something that run is not given and must not require.
KEY_FINGERPRINT=""
if [[ "$OFFBOARD" -eq 0 && "$INSPECT_ONLY" -eq 0 ]]; then

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

fi  # end of the key section, skipped when offboarding or inspecting

# ── The operator's own credential ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="footbag-${TARGET}"
REMOTE_HALF="${SCRIPT_DIR}/internal/provision-dev-tester-account-remote.sh"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

# The shared account's password is not this script's to set. Refused here, as
# early as the name of that account is known, and long before anything on the
# host is touched. Every footbag-operator holder holds it and the vault carries
# its real value, so changing it is a custody operation under the vault's own
# rules rather than a side effect of onboarding somebody.
#
# Its keys are not this script's either: several holders' keys sit on that one
# account, and a create here writes the account's authorized_keys whole, with
# the one key it was given, so every other holder's way in would go with it.
# They are added and removed one at a time by scripts/authorize-operator-key.sh,
# which edits the file line by line.
if [[ "$ACCOUNT" == "$OPERATOR_SHARED_ACCOUNT" && "$OFFBOARD" -eq 0 ]]; then
  echo "ERROR: ${OPERATOR_SHARED_ACCOUNT} is the shared account, and its password" >&2
  echo "       is not set from here." >&2
  echo "" >&2
  echo "       Every footbag-operator holder holds it and the vault carries its" >&2
  echo "       real value, so changing it is a custody operation under the" >&2
  echo "       vault's own rules rather than a side effect of onboarding." >&2
  echo "" >&2
  echo "       Its keys are added and removed one at a time with" >&2
  echo "       scripts/authorize-operator-key.sh." >&2
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
  "scripts/provision-dev-tester-account.sh --target ${TARGET} --account ${ACCOUNT} ..." \
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
echo "==> Account:     $ACCOUNT  for ${FULL_NAME}"
[[ -n "$KEY_FINGERPRINT" ]] && echo "==> Key:         $KEY_FINGERPRINT"

# Reachability, and that the host is the target, are proved before a credential
# exists, so an unreachable or wrong host costs nothing more than a wasted trip.
HOST_SSH_BIN="$SSH_BIN"
require_host_is "$REMOTE" "$TARGET" || exit 1

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

# inspect_account
# Reads an existing account through the remote half's read-only mode into
# INSPECT and the INSPECT_* fields, and sets INSPECT_LOCKED to yes or no.
# Retired means locked now: an offboard's marker, a login shell that admits
# nobody, or a locked password. Returns 1 when the account could not be read.
inspect_account() {
  INSPECT="$({
      printf '%s\n' "$SUDO_PASS"
      printf 'DTACC_MODE=%q\n' "inspect"
      printf 'DTACC_ACCOUNT=%q\n' "$ACCOUNT"
      printf 'DTACC_SHARED_ACCOUNT=%q\n' "$OPERATOR_SHARED_ACCOUNT"
      cat "$REMOTE_HALF"
    } | "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash')" || return 1
  INSPECT_SHELL="$(sed -n 's/^SHELL //p' <<<"$INSPECT")"
  INSPECT_PASSWORD="$(sed -n 's/^PASSWORD //p' <<<"$INSPECT")"
  INSPECT_KEYS="$(sed -n 's/^KEY //p' <<<"$INSPECT")"
  INSPECT_RETIRED="$(sed -n 's/^RETIRED //p' <<<"$INSPECT")"
  INSPECT_LOCKED="no"
  if grep -qx 'OFFBOARDED yes' <<<"$INSPECT" \
     || [[ "$INSPECT_SHELL" == */nologin || "$INSPECT_SHELL" == */false \
           || "$INSPECT_PASSWORD" == L || "$INSPECT_PASSWORD" == LK ]]; then
    INSPECT_LOCKED="yes"
  fi
  return 0
}

# ── Inspecting ───────────────────────────────────────────────────────────────
#
# Read-only, for a caller that has to prove the host side of something before
# calling it done. The facts go to stdout one per line, and nothing is changed.
if [[ "$INSPECT_ONLY" -eq 1 ]]; then
  if [[ "$ACCOUNT_EXISTS" == "no" ]]; then
    echo "ACCOUNT absent"
    exit 0
  fi
  if ! inspect_account; then
    echo "ERROR: could not read ${ACCOUNT} on ${REMOTE}. Nothing changed." >&2
    exit 1
  fi
  echo "ACCOUNT present"
  echo "LOCKED ${INSPECT_LOCKED}"
  [[ -n "$INSPECT_KEYS" ]] && sed 's/^/KEY /' <<<"$INSPECT_KEYS"
  [[ -n "$INSPECT_RETIRED" ]] && sed 's/^/RETIRED /' <<<"$INSPECT_RETIRED"
  # Passed through as the remote half printed it, and "unknown" when it printed
  # nothing, so no reader can take a missing line for an absent key.
  INSPECT_SHARED="$(sed -n 's/^SHARED //p' <<<"$INSPECT")"
  if [[ -n "$INSPECT_SHARED" ]]; then
    sed 's/^/SHARED /' <<<"$INSPECT_SHARED"
  else
    echo "SHARED unknown"
  fi
  exit 0
fi

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
    printf 'DTACC_ACCOUNT=%q\n' "$ACCOUNT"
    printf 'DTACC_MODE=%q\n' "offboard"
    printf 'DTACC_SHARED_ACCOUNT=%q\n' "$OPERATOR_SHARED_ACCOUNT"
    cat "$REMOTE_HALF"
  } | "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'

  echo ""
  echo "The host account is retired. This is the first step of a departure, not"
  echo "the whole of one: bash scripts/offboard-dev-tester.sh runs this step and then"
  echo "retires their AWS identity and their own allow-list address, and names what"
  echo "is left after that. Their repository access is separate, and not its to end."
  exit 0
fi

# An account that already exists is read, what it holds is shown, and the run
# decides narrowly: a retired account is reopened for the same person, which the
# host half does with a fresh key only (a key it was retired with is refused
# there), and a live one is issued a fresh password only when it holds exactly
# the key given, which is an onboarding re-run to finish its work. A live
# account holding any other key is a different person or a lost key, and
# neither is patched from here. Read-only until the typed APPLY.
REOPEN=0
if [[ "$ACCOUNT_EXISTS" == "yes" ]]; then
  if ! inspect_account; then
    echo "ERROR: could not read ${ACCOUNT} on ${REMOTE}. Nothing changed." >&2
    exit 1
  fi
  if [[ "$INSPECT_LOCKED" == "yes" ]]; then
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
    echo "If it was ${FULL_NAME}'s, it is reopened for them under the same name: the"
    echo "login shell and the expiry are restored, it gets the new key alone and a"
    echo "fresh password sealed to that key, and a key it was retired with is"
    echo "refused. If it was not theirs, stop: a name is reused only by the person"
    echo "who held it."
    if ! confirm_from_tty "Type 'APPLY' to reopen ${ACCOUNT} for ${FULL_NAME}: " "APPLY"; then
      echo "Not confirmed; ${ACCOUNT} is untouched." >&2
      exit 1
    fi
  else
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
      echo "re-issued. A lost or replaced key is offboarded, then re-onboarded under" >&2
      echo "the same name with a fresh pair:" >&2
      echo "  bash scripts/offboard-dev-tester.sh --target ${TARGET} --account ${ACCOUNT}" >&2
      echo "and if it is not ${FULL_NAME}'s account at all, stop. Nothing changed." >&2
      exit 1
    fi
    echo "It holds exactly the key given to this run, so this is an onboarding that"
    echo "is being re-issued. It is given a fresh one-time password, sealed to that"
    echo "key; whatever password it holds now stops working."
    if ! confirm_from_tty "Type 'APPLY' to issue ${ACCOUNT} a fresh password: " "APPLY"; then
      echo "Not confirmed; ${ACCOUNT} is untouched." >&2
      exit 1
    fi
  fi
  ROTATE=1
fi

MODE="create"
[[ "$ROTATE" -eq 1 ]] && MODE="rotate"

# Checked before anything exists: an account that already exists is reopened
# or re-issued only on a typed APPLY, so a run with no terminal would stop part
# way.
if [[ ! -t 1 || ! -t 2 ]] || ! { true >/dev/tty; } 2>/dev/null; then
  echo "ERROR: no terminal to confirm on. A sealed run shows no password, but" >&2
  echo "       an account that already exists is reopened or re-issued only on a" >&2
  echo "       typed APPLY. Re-run from an interactive shell. Nothing has been" >&2
  echo "       created." >&2
  exit 1
fi

# ── State, and what an unfinished run may undo ───────────────────────────────
#
#   none     nothing changed on the host, or the password has been handed back
#            and the account is now the calling script's to seal and report
#   created  THIS RUN created the account, and it holds a password recorded
#            nowhere. The only state in which removal is correct.
#   rotating the account predates this run. Never removed, whatever happens;
#            what is uncertain is only which password it now holds.
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
        printf 'DTACC_MODE=%q\n' "remove"
        printf 'DTACC_ACCOUNT=%q\n' "$ACCOUNT"
        printf 'DTACC_FULL_NAME=%q\n' "$FULL_NAME"
        printf 'DTACC_KEY_LINE=%q\n' ""
        printf 'DTACC_PASSWORD=%q\n' ""
        cat "$REMOTE_HALF"
      } | "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash' >&2; then
        echo "Removed. Nothing was left behind." >&2
      else
        echo "COULD NOT REMOVE IT. End its access before doing anything else; the" >&2
        echo "host offboard disables it through the same pinned connection:" >&2
        echo "  < <the credential file your alias selects> \\" >&2
        echo "    bash scripts/provision-dev-tester-account.sh --target ${TARGET} --account ${ACCOUNT} --offboard" >&2
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
      echo "before the run stopped, and the old one may no longer work. Re-run the" >&2
      echo "onboarding to issue a fresh one; that is safe and is the intended way" >&2
      echo "out of this. The account's owner should not try to sudo until then." >&2
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
  # reported unremovable, and the rotated one reported as kept. "none" matches
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
# Generated, never shown, and handed back to the onboarding script, which seals
# it to the owner's own public key. Nobody running this is entitled to choose
# another person's password, and the same holds when the person being onboarded
# is the one at this keyboard: the path is identical either way. It is not
# expired, because its owner replaces it by script when they accept the
# onboarding rather than at a first login nobody can drive, and from then on it
# is known to them alone. It is never vaulted: the vault is shared, and a
# personal credential in it lets any custodian act as any dev-and-tester.
#
# 24 bytes of base64 is 32 characters and no padding, so it survives a copy out
# of a message and into a one-line file without a trailing character to argue
# about.
NEW_PASS="$(openssl rand -base64 24 | tr -d '\n')"
if [[ -z "$NEW_PASS" ]]; then
  echo "ERROR: could not generate a password. Nothing has been created." >&2
  exit 1
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
# them is destructive: setting this to "created" unconditionally means an
# interrupted re-issue sends DTACC_MODE=remove for an account that PREDATED the
# run. The remote half's remove is `userdel -r`: a person's account, home
# directory, shell history and every file they owned, destroyed by an interrupt,
# while stderr said "the account just created is being removed".
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
  printf 'DTACC_MODE=%q\n' "$MODE"
  printf 'DTACC_ACCOUNT=%q\n' "$ACCOUNT"
  printf 'DTACC_FULL_NAME=%q\n' "$FULL_NAME"
  printf 'DTACC_KEY_LINE=%q\n' "$KEY_LINE"
  printf 'DTACC_PASSWORD=%q\n' "$NEW_PASS"
  printf 'DTACC_SHARED_ACCOUNT=%q\n' "$OPERATOR_SHARED_ACCOUNT"
  printf 'DTACC_REOPEN=%q\n' "$( (( REOPEN )) && echo yes || echo no )"
  cat "$REMOTE_HALF"
} | "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'

# This password is NOT vaulted, and that is the point rather than an omission.
# The vault is shared between custodians, so a personal credential kept in it
# lets any custodian act as any dev-and-tester. Nor is any record of the account: the
# host lists its accounts and their key fingerprints, IAM lists the named users
# under their path and tags, and the allow-list names its entries, while the
# onboarding card records who approved them and when. A second, hand-kept copy
# of live state is the register that drifted once already.
{
  echo ""
  # Nothing is printed. The value goes back to the calling script, which seals
  # it to the owner's public key; a screen would be the only other place it
  # had ever been.
  echo "A one-time password is set for ${ACCOUNT}. It is not shown here: it is"
  echo "sealed to ${FULL_NAME}'s own public key with the rest of their onboarding,"
  echo "and they replace it with their own when they accept it. It is not"
  echo "expired, so that replacement can run through sudo."
  if [[ "$MODE" == "rotate" ]]; then
    echo "This replaces the previous one, and the key is the one given to this run."
  fi
  echo ""
} > /dev/tty

# Handed back once the account is proven, and only then: a run that stopped
# earlier removes an account it created, and a copy of its password left in
# the caller's file would describe nothing. printf is a builtin, so the value
# reaches no process's argv on the way.
printf '%s\n' "$NEW_PASS" > "$SEALED_OUT"
NEW_PASS=""
# From here the password is the calling script's to seal, and an unfinished
# onboarding is that script's to report.
PROVISION_STATE="none"

echo ""
echo "Account ${ACCOUNT} is ready on ${REMOTE}."
echo ""
echo "The one-time password is in the file the calling script named, for it to"
echo "seal. The proof that the account works runs when ${FULL_NAME} accepts the"
echo "onboarding and replaces the password through sudo."
exit 0
