#!/usr/bin/env bash
# rotate-host-password.sh -- replace the shared host account's sudo password on
# one environment's host, and prove the host accepts the new one.
#
# The shared account (footbag) authorizes sudo with one password per
# environment, held in the vault and in each holder's credential file. Rotating
# it, for cause or when a holder leaves, is otherwise a hand session on the host.
# This does it over the same sudo wire every host script uses: the current
# password is line one of the ssh stream, the new one travels as a shell-quoted
# assignment behind it, and chpasswd reads it on stdin as root. Neither password
# reaches any command line on either machine.
#
# What it does:
#   1. Confirms the host it reached records the environment it was asked for,
#      which also proves the host accepts the current password.
#   2. Generates the new password here (openssl, 32 characters of base64).
#   3. After the typed confirmation, changes the password in one ssh session.
#   4. Proves the change with a second session whose sudo accepts the NEW
#      password.
#   5. Writes the new password into the credential file the account's rule
#      selects (mode 600, replacing the old one), and shows it on the terminal,
#      never on stdout, for the one step left by hand: replacing the vault entry
#      and giving the new value to every other holder of that file.
#
# What it refuses:
#   - a target it was not given; there is no default.
#   - an alias that connects as a named account: a dev-and-tester's own password
#     is theirs to change, through their onboarding, and never from here.
#   - to start without a terminal: the new password is shown only there, and
#     one minted where nobody can read it would be a live credential nobody holds.
#   - a host that does not record the environment asked for, or does not accept
#     the current password, before anything changes.
#   - to change anything without the typed APPLY. There is no flag to skip it.
#
# If the change or its proof fails, nothing is reverted: the run asks the host
# which password it now accepts and reports that. Where it cannot tell, it shows
# the new password on the terminal so whichever one is in force is still held.
# A re-run rotates again, which is harmless; a run cut off after the change and
# before the file was written has shown the new password on the terminal.
#
# Usage. The current sudo password is read from stdin, line 1. Which file holds
# it follows the account the alias connects as, and only the shared account's
# files apply here:
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/rotate-host-password.sh --target staging
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/rotate-host-password.sh --target production
#
# Test seams (CI only; operators never set these), each announced on stderr:
# FOOTBAG_HOST_SSH_BIN replaces the ssh client (scripts/lib/host-env-remote.sh),
# and ROTATE_HOST_PASSWORD_OPENSSL_BIN replaces openssl.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

TARGET=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

# One closing report from here on. Sourced after the usage checks, so a usage
# error keeps its plain exit 2.
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

ALIAS="footbag-${TARGET}"
REMOTE_HALF="${SCRIPT_DIR}/internal/rotate-host-password-remote.sh"
REMOTE_REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"
[[ -r "$REMOTE_HALF" ]] || cr_die "missing remote half: $REMOTE_HALF"
[[ -r "$REMOTE_REPORT_LIB" ]] || cr_die "missing remote-half report library: $REMOTE_REPORT_LIB"

OPENSSL_BIN="${ROTATE_HOST_PASSWORD_OPENSSL_BIN:-openssl}"
if [[ -n "${ROTATE_HOST_PASSWORD_OPENSSL_BIN:-}" ]]; then
  echo "NOTE: using a stand-in for openssl (ROTATE_HOST_PASSWORD_OPENSSL_BIN); this run's password is not a real one." >&2
fi

require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/rotate-host-password.sh --target ${TARGET}" "$ALIAS" "$TARGET" || exit 1
if [[ "$OPERATOR_CREDENTIAL_ACCOUNT" != "$OPERATOR_SHARED_ACCOUNT" ]]; then
  cr_die "${ALIAS} connects as '${OPERATOR_CREDENTIAL_ACCOUNT}', a named account; this rotates the shared account ${OPERATOR_SHARED_ACCOUNT}'s password only. Nothing was changed."
fi
# Checked before anything is minted: the terminal is the only place the new
# password is shown.
terminal_present \
  || cr_die "no terminal: the new password is shown only on the terminal, so this runs from an interactive shell. Nothing was changed."
require_host_is "$ALIAS" "$TARGET" \
  || cr_die "${ALIAS} did not confirm it is ${TARGET} with the current password; nothing was changed"
cr_proved "${ALIAS} records ${TARGET} and accepted the current password"

NEW_PASS="$("$OPENSSL_BIN" rand -base64 24 </dev/null | tr -d '\n')" || NEW_PASS=""
if [[ ${#NEW_PASS} -lt 32 || "$NEW_PASS" == *:* ]]; then
  NEW_PASS=""
  cr_die "could not generate a new password; nothing was changed"
fi

# Set once the new password may be in force on the host, cleared once it is
# held somewhere: an interrupt in between shows it on the terminal, so whichever
# password the host now takes is not lost with the run.
SENT=0
HELD=0
show_new_password() {
  {
    echo ""
    echo "New sudo password for ${OPERATOR_SHARED_ACCOUNT} on the ${TARGET} host:"
    echo ""
    printf '    %s\n' "$NEW_PASS"
    echo ""
  } > /dev/tty
}
show_if_unheld() {
  (( SENT && ! HELD )) || return 0
  show_new_password
  echo "The run stopped after the new password was sent. It is shown above; the host may accept it or the old one." > /dev/tty
}
cr_cleanup show_if_unheld

# sudo_answers <password>: 0 when the host's sudo accepts it, 1 when it refuses
# it, 255 when the host was not reached, which says nothing about the password.
sudo_answers() {
  local rc=0
  printf '%s\n' "$1" | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" -v' >/dev/null 2>&1 || rc=$?
  case "$rc" in
    0) return 0 ;;
    255) return 255 ;;
    *) return 1 ;;
  esac
}

echo ""
echo "About to replace the sudo password of ${OPERATOR_SHARED_ACCOUNT} on the ${TARGET} host (${ALIAS})."
echo "  The new password was generated here. Once the host accepts it, it is written"
echo "  into ${OPERATOR_CREDENTIAL_DISPLAY}, replacing the current one, and shown on this"
echo "  terminal for the vault. Every other holder of that file needs the new value."
echo ""
if ! confirm_from_tty "Type 'APPLY' to replace the password: " "APPLY"; then
  NEW_PASS=""
  echo "Not confirmed; nothing was changed." >&2
  cr_unproved "the password rotation: not confirmed, and nothing was changed"
  cr_finish_with 1 ABORTED
fi

send_change() {
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'RHP_NEW=%q\n' "$NEW_PASS"
    printf 'RHP_ACCOUNT=%q\n' "$OPERATOR_SHARED_ACCOUNT"
    cat "$REMOTE_REPORT_LIB" "$REMOTE_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
}
SENT=1
CHANGE_OK=1
cr_run_marked "password change on ${ALIAS}" -- send_change || CHANGE_OK=0

# The verdict is what the host's sudo accepts now, whatever the session above
# reported: a session cut off after chpasswd changed the password as surely as
# one that finished.
NEW_RC=0
sudo_answers "$NEW_PASS" || NEW_RC=$?
if (( NEW_RC != 0 )); then
  OLD_RC=0
  if (( NEW_RC == 1 )); then
    sudo_answers "$SUDO_PASS" || OLD_RC=$?
  fi
  if (( NEW_RC == 1 && OLD_RC == 0 )); then
    SENT=0
    NEW_PASS=""
    cr_error "the host still accepts the current password and refuses the new one: the password was not changed. ${OPERATOR_CREDENTIAL_DISPLAY} is untouched; re-run to try again."
    cr_finish
  fi
  HELD=1
  show_new_password
  echo "The host's sudo could not be shown to accept this password or the old one." > /dev/tty
  echo "Keep it until you know which is in force: try each with sudo on the host." > /dev/tty
  NEW_PASS=""
  cr_error "could not prove which password ${ALIAS} accepts now (the host refused or was not reached); the new one is shown on the terminal, and ${OPERATOR_CREDENTIAL_DISPLAY} is untouched"
  cr_finish
fi
(( CHANGE_OK )) || cr_warn "the change session on ${ALIAS} did not finish cleanly, but the host's sudo accepts the new password"
cr_proved "the ${TARGET} host's sudo accepts the new password for ${OPERATOR_SHARED_ACCOUNT}"

# Written in place, through any link, so a file kept in the private operations
# checkout stays there; the umask makes a file created here owner-only.
if mkdir -p -m 700 -- "$(dirname -- "$OPERATOR_CREDENTIAL_FILE")" \
   && ( umask 077 && printf '%s\n' "$NEW_PASS" > "$OPERATOR_CREDENTIAL_FILE" ) \
   && chmod 600 -- "$OPERATOR_CREDENTIAL_FILE"; then
  cr_proved "${OPERATOR_CREDENTIAL_DISPLAY} holds the new password, mode 600"
  WRITTEN=1
else
  cr_error "${OPERATOR_CREDENTIAL_DISPLAY} could not be written; the new password is shown on the terminal, so put it there by hand (mode 600)"
  WRITTEN=0
fi

HELD=1
show_new_password
{
  if (( WRITTEN )); then
    echo "It is in ${OPERATOR_CREDENTIAL_DISPLAY}. Still to do by hand:"
  else
    echo "Still to do by hand: write it into ${OPERATOR_CREDENTIAL_DISPLAY} (mode 600), and"
  fi
  echo "  - replace the ${TARGET} sudo password in the vault entry with it;"
  echo "  - give it to every other holder of ${OPERATOR_CREDENTIAL_DISPLAY}, whose copy now fails."
} > /dev/tty
NEW_PASS=""
cr_unproved "the vault entry and other holders' copies: only a person can update those"
echo ""
echo "== ${TARGET}: the shared account's sudo password is replaced and proved =="
cr_finish
