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
# holds the terminal, and it is the vault entry at the end that records the
# answer.
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
# scripts/lib/iam-access-key.sh mints its credential, requires the vault entry, and
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
#   --operator "<Full Name>"       who the account belongs to. Goes into the
#                                  vault entry, which is the only record that
#                                  this person holds access
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
#                                  machine. Without the flag a one-time password
#                                  is generated, shown once and expired on the
#                                  host, which is correct when provisioning
#                                  somebody else and pointless when provisioning
#                                  yourself.
#   --rotate                       the account exists; replace its password and
#                                  reinstall the key
#   --key-only                     with --rotate: reinstall the key and leave
#                                  the password alone. The two credentials fail
#                                  independently, and a lost private key says
#                                  nothing about the password, so making its
#                                  owner take a new password as well is a cost
#                                  with no security content: it forces a
#                                  first-login ceremony and a one-time value
#                                  that has to travel between two people, both
#                                  to fix something that was not broken. With
#                                  this flag nothing is generated, nothing is
#                                  shown, and there is no handover. The vault
#                                  entry still changes, because the fingerprint
#                                  recorded in it is now wrong, so VAULTED is
#                                  still required.
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
KEY_ONLY=0

usage() {
  cat <<'EOF'
Usage: < ~/AWS/AWS_OPERATOR.txt bash scripts/provision-operator-account.sh \
         --target <staging|production> --account <name> --operator "<Full Name>" \
         --key-line "<ssh public key>" \
         [--own-password] [--rotate [--key-only]] [--offboard]

Reads the sudo password from stdin (line 1), so the redirect is not optional. It
needs a terminal as well: every mode stops for a typed confirmation, and the
modes that generate a password show it there and nowhere else.

  --target <staging|production>  deployed environment; no default
  --account <name>               Linux account name to create
  --operator "<Full Name>"       who it belongs to, for the vault and inventory records
  --key-line "<key>"             the account owner's public key, pasted whole (preferred)
  --key-file <path>              the same key as a .pub file, if it arrived as one
  --own-password                 this account is YOURS: you type the password,
                                 twice, hidden. Never generated, never shown,
                                 never vaulted, and not flagged must-change.
  --rotate                       account exists; replace its password, reinstall the key
  --key-only                     with --rotate: reinstall the key, leave the password alone
  --offboard                     disable the account and sweep the person's keys
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
    --key-only) KEY_ONLY=1; shift ;;
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
if [[ -z "$OPERATOR" ]]; then
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
if [[ "$KEY_ONLY" -eq 1 && "$OFFBOARD" -eq 1 ]]; then
  echo "ERROR: --offboard ends the access and --key-only renews it." >&2
  echo "       They are opposite intentions; name the one you mean." >&2
  exit 2
fi
if [[ "$KEY_ONLY" -eq 1 && "$OWN_PASSWORD" -eq 1 ]]; then
  echo "ERROR: --own-password sets a password and --key-only leaves it alone." >&2
  echo "       They are opposite intentions; name the one you mean." >&2
  exit 2
fi
# --key-only is a narrowing of --rotate and means nothing without it. On a
# create it would ask for an account with no password at all, which cannot sudo
# and so cannot do the job the account exists for; refusing here says that,
# where useradd's own failure would not.
if [[ "$KEY_ONLY" -eq 1 && "$ROTATE" -eq 0 ]]; then
  echo "ERROR: --key-only narrows --rotate and needs it." >&2
  echo "       On a new account there is no password to leave alone: one must be" >&2
  echo "       set or the account cannot sudo. Add --rotate, or drop --key-only." >&2
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
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

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
    echo "If a vault entry host-${TARGET}-${ACCOUNT} still exists, delete it and"
    echo "name the person and the date in the change note: that entry is the only"
    echo "record that the access was ever held."
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

  IFS= read -r SUDO_PASS
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'OPACC_ACCOUNT=%q\n' "$ACCOUNT"
    printf 'OPACC_MODE=%q\n' "offboard"
    cat "$REMOTE_HALF"
  } | "$SSH_BIN" "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'

  echo ""
  echo "Remove the vault entry host-${TARGET}-${ACCOUNT}, which is the record of"
  echo "this access and is the only one: there is no separate register to update."
  echo "Note the removal date in the vault's change note when you publish."
  echo ""
  echo "Then the rest of the offboarding, which is not this host's business and"
  echo "is not done by this script: their AWS identity, the vault, repository and"
  echo "CI access, and any alerting subscription in their name. While the operator"
  echo "AWS identity is shared, a departure is a rotation trigger for it."
  exit 0
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
#   created  THIS RUN created the account, and it holds a password recorded
#            nowhere. The only state in which removal is correct.
#   rotating the account predates this run. Never removed, whatever happens;
#            what is uncertain is only which password it now holds.
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
      # The state is set before the account exists, so "nothing to remove" is an
      # ordinary outcome here rather than a failure: a refusal on the remote side
      # ahead of useradd lands in this branch too. Probing first is what stops it
      # reporting a phantom account as one the operator must chase by hand.
      #
      # The probe answers on stdout rather than through its exit status, because
      # those are three outcomes and an exit status carries two. An unreachable
      # host and an absent account both fail, and treating the pair as "nothing
      # to do" is the dangerous direction: it skips the removal of an account
      # whose password was shown once and recorded nowhere. Only an explicit
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
        echo "COULD NOT REMOVE IT. Do it by hand before doing anything else:" >&2
        echo "  ssh ${REMOTE} 'sudo userdel -r ${ACCOUNT}'" >&2
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
      echo "You have already recorded its password in the vault, so removing it" >&2
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

# Read once. A single stdin cannot serve two sessions, because the first drains
# it, and the rollback path above needs it as much as the install does.
IFS= read -r SUDO_PASS

# ── Where the password comes from ────────────────────────────────────────────
#
# Two cases, and they are genuinely different rather than a preference.
#
# Provisioning SOMEBODY ELSE, which is the ordinary case: the operator running
# this cannot know the other person's password and must not choose it for them.
# So one is generated, shown once, handed over, and expired on the host the
# moment it is set, which makes it a bootstrap token rather than a credential.
# The standing password becomes theirs at first login and is never known here.
#
# Provisioning YOURSELF, with --own-password: there is nobody to hand anything
# to. Generating a value, printing it on your own screen, and then making you
# log in to replace it is a ceremony with no security content: it puts a
# credential on a screen and in a scrollback buffer for no reason, and it leaves
# the account depending on a forced-change prompt appearing at the right moment.
# Type it here instead. It is never displayed, never generated, and never needs
# expiring, because it was yours from the first byte.
#
# What does NOT change between the two is the governance rule: this password is
# not vaulted either way. The vault is shared, and a personal credential in it
# lets any custodian act as any operator.
#
# A third case sits above both: --key-only, where no password is involved at
# all. Nothing is generated and nothing is prompted for, so the terminal is
# never asked for a secret and there is no value to hand over or to destroy.
NEW_PASS=""
if (( KEY_ONLY )); then
  : # Deliberately empty. The remote half is told not to set one, and sending
    # an empty OPACC_PASSWORD it will not read is the honest shape: any value
    # here would be a password nobody chose, travelling for no reason.
elif (( OWN_PASSWORD )); then
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
  # another person's password, and expired on the host so it cannot become one.
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
# password was shown once and recorded nowhere, which is the exact outcome this
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
  # Expire it only when the operator did not choose it. A password the account's
  # own owner just typed is already theirs; forcing a change would make them
  # invent a second one minutes later for no gain, and would make the account
  # depend on a change prompt appearing at the right moment on a host where they
  # may be the only person who can log in.
  printf 'OPACC_EXPIRE_PASSWORD=%q\n' "$( (( OWN_PASSWORD )) && echo no || echo yes )"
  # The remote half skips chpasswd and the expiry entirely on no, and drops the
  # expiry assertion with them: whether this account's existing password is
  # expired was decided before this run and is not this run's business.
  printf 'OPACC_SET_PASSWORD=%q\n' "$( (( KEY_ONLY )) && echo no || echo yes )"
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
# What makes that safe rather than merely principled is that the value below is
# already expired on the host. It admits one login, which must change it, and
# from then on the standing password is known to its owner and to nobody else.
# So there is nothing here worth vaulting and nothing lost by not.
#
# The shared account is the opposite case and stays in the vault, because a
# credential everybody is meant to hold is one the shared store is exactly right
# for.
VAULT_ENTRY="host-${TARGET}-${ACCOUNT}"

{
  echo ""
  if (( KEY_ONLY )); then
    echo "The key for ${ACCOUNT} was replaced. The password was not touched, so"
    echo "${OPERATOR} keeps the one they already had and there is nothing to hand"
    echo "over and nothing to expire."
    echo ""
    echo "The vault entry still changes: the fingerprint recorded in it is now"
    echo "wrong, and a fingerprint that no longer matches the host is worse than"
    echo "none, because it reads as evidence and is not."
    echo ""
  elif (( OWN_PASSWORD )); then
    # Nothing is printed. The operator typed it, it is on the host, and putting
    # it on a screen now would be the only place it had ever been exposed.
    echo "The password you chose is set for ${ACCOUNT} and is not expired."
    echo "It is yours: it was never generated, never displayed, and is not in"
    echo "the vault. Nobody else can read it, including whoever runs this next."
    if [[ "$MODE" == "rotate" ]]; then
      echo "This replaces the previous one; the account and its key are unchanged."
    fi
    echo ""
  else
    echo "One-time password for ${ACCOUNT}, shown once, and NOT for the vault:"
    echo ""
    echo "      ${NEW_PASS}"
    echo ""
    echo "It is already expired on the host, so the first login must replace it."
    echo "After that the standing password is ${OPERATOR}'s alone."
    if [[ "$MODE" == "rotate" ]]; then
      echo "This replaces the previous one; the account and its key are unchanged."
    fi
    echo ""
    echo "If ${OPERATOR} is not reading this, hand it over directly, by voice. It"
    echo "is single-use and expires on use, so it wants no durable home at all."
    echo ""
    echo "If this account is your own, --own-password skips all of the above:"
    echo "you type the password here, it is never shown, and it does not expire."
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
  if (( KEY_ONLY )); then
    echo "             not set or replaced by this run at all; it remains the"
    echo "             standing password its owner already held, known to them"
    echo "             and to nobody else."
  elif (( OWN_PASSWORD )); then
    echo "             chosen by the account's own owner at provisioning time and"
    echo "             was never displayed or generated, so there has never been"
    echo "             a copy of it anywhere to record."
  else
    echo "             a one-time value that expired on first login, so no"
    echo "             standing credential exists to record."
  fi
  echo "             Public key fingerprint: ${KEY_FINGERPRINT}"
  echo "             Access approved: ${TODAY}."
  echo "             Sensitivity: environment-wide, root-capable via sudo"
  echo "             Forgotten password: another operator re-runs the"
  echo "             provisioning script with --rotate, which issues a fresh"
  echo "             one-time password. There is nothing here to look up."
  echo "             Lost or replaced private key: --rotate --key-only installs"
  echo "             the new key and leaves the password alone. Record the new"
  echo "             fingerprint here; the two credentials fail independently."
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
  PROOF_OPTS=("${SSH_OPTS[@]}" -o "User=${ACCOUNT}" -o "BatchMode=yes")
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
else
  NEW_PASS=""
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
  echo ""
  echo "This script cannot run those two itself, because the private half of the"
  echo "key is on their machine and the password will be theirs after first"
  echo "login. Provisioning your OWN account with --own-password is different:"
  echo "there it runs them and this hand-off does not exist."
fi
