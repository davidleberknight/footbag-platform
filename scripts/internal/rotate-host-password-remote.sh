#!/usr/bin/env bash
# Root-side body of scripts/rotate-host-password.sh: replaces the shared host
# account's sudo password with the one the operator side generated.
#
# Invoked via:
#   { printf '%s\n' "$CURRENT_PASSWORD";
#     printf 'RHP_NEW=%q\n' "$NEW_PASSWORD";
#     printf 'RHP_ACCOUNT=%q\n' footbag;
#     cat scripts/lib/closing-report-remote.sh scripts/internal/rotate-host-password-remote.sh;
#   } | ssh <alias> 'sudo -k -S -p "" bash'
#
# (sudo -S consumes the current password; bash inherits the rest, binds the
# assignments, and runs this body as root. Neither password reaches argv.)
#
# Whose password changes is the account sudo authenticated, and it must be the
# account the operator side named: the shared account. A run that reached this
# body as anyone else changes nothing, so a named account's password is never
# replaced from here.
#
# Required shell variables:
#   RHP_NEW       the new password: not empty, one line, no colon (chpasswd's
#                 separator)
#   RHP_ACCOUNT   the account whose password changes

set -euo pipefail

RHP_NEW="${RHP_NEW:-}"
RHP_ACCOUNT="${RHP_ACCOUNT:-}"

if [[ $EUID -ne 0 ]]; then
  crr_error "this body must run as root; it is reached through sudo -S. Nothing was changed."
  crr_finish
fi

if [[ -z "$RHP_ACCOUNT" || "$RHP_ACCOUNT" == "root" || "${SUDO_USER:-}" != "$RHP_ACCOUNT" ]]; then
  crr_error "this changes the password of ${RHP_ACCOUNT:-no named account}, and it was run by '${SUDO_USER:-nobody}'. Nothing was changed."
  crr_finish
fi
if [[ -z "$RHP_NEW" || "$RHP_NEW" == *:* || "$RHP_NEW" == *$'\n'* ]]; then
  crr_error "the new password arrived empty or in a shape chpasswd cannot take. Nothing was changed."
  crr_finish
fi

# The password travels in a pipe: chpasswd takes it on stdin precisely so it
# never appears on a command line.
if ! printf '%s:%s\n' "$RHP_ACCOUNT" "$RHP_NEW" | chpasswd; then
  RHP_NEW=""
  crr_error "chpasswd refused the new password for ${RHP_ACCOUNT}; the old password still stands."
  crr_finish
fi
RHP_NEW=""

# Proved rather than assumed: set and usable, and not expired, because an
# expired password stops the sudo every later run depends on. A tool that
# fails is reported with its own last line.
PW_ERR="$(mktemp)"
trap 'rm -f "$PW_ERR"' EXIT
trap "trap '' HUP INT TERM; exit 130" INT
trap "trap '' HUP INT TERM; exit 143" TERM
if PW_LINE="$(passwd -S -- "$RHP_ACCOUNT" 2>"$PW_ERR")"; then
  PW_STATUS="$(cut -d' ' -f2 <<<"$PW_LINE")"
  case "$PW_STATUS" in
    P|PS) ;;
    *) crr_error "the password status of ${RHP_ACCOUNT} is '${PW_STATUS}', not a usable password." ;;
  esac
else
  crr_error "the password status of ${RHP_ACCOUNT} could not be read, so the new password is not proved usable: passwd said: $(tail -n 1 "$PW_ERR")"
fi
# A failed age read leaves the expiry unchecked; it is a warning, as it was
# never the verdict on the change.
if PW_AGE="$(LC_ALL=C chage -l -- "$RHP_ACCOUNT" 2>"$PW_ERR")"; then
  PW_CHANGED="$(sed -n 's/^Last password change[^:]*: *//p' <<<"$PW_AGE")"
  if [[ "$PW_CHANGED" == "password must be changed" ]]; then
    crr_error "the password of ${RHP_ACCOUNT} is expired."
  fi
else
  crr_warn "the password age of ${RHP_ACCOUNT} could not be read, so whether it is expired was not checked: chage said: $(tail -n 1 "$PW_ERR")"
fi
echo "    the password of ${RHP_ACCOUNT} was replaced on the host"
crr_finish
