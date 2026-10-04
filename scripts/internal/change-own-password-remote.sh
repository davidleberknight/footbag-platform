#!/usr/bin/env bash
# Root-side body of the password step in scripts/accept-dev-tester-onboarding.sh:
# a dev-and-tester replacing the one-time password of their own host account
# with one they chose.
#
# Invoked via, as the named account itself, with its own key:
#   { printf '%s\n' "$ONE_TIME_PASSWORD";
#     printf 'CHPW_NEW=%q\n' "$NEW_PASSWORD";
#     cat scripts/internal/change-own-password-remote.sh;
#   } | ssh <the named account> 'sudo -k -S -p "" bash'
#
# (sudo -S consumes the one-time password; bash inherits the rest, binds the
# assignment, and runs this body as root. Neither password reaches argv.)
#
# Whose password changes is not an input. It is SUDO_USER, the account sudo
# authenticated, so this body can only ever change the password of the account
# that ran it, and it refuses root and the shared account outright: the shared
# account's password is a custody operation of its own and never set from here.
#
# Required shell variables:
#   CHPW_NEW   the new password, at least 12 characters

set -euo pipefail

CHPW_NEW="${CHPW_NEW:-}"
SHARED_ACCOUNT="footbag"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: this body must run as root; it is reached through sudo -S." >&2
  exit 1
fi

TARGET_USER="${SUDO_USER:-}"
if [[ -z "$TARGET_USER" || "$TARGET_USER" == "root" || "$TARGET_USER" == "$SHARED_ACCOUNT" ]]; then
  echo "REFUSING: this changes the password of the named account that ran it," >&2
  echo "          and it was run by '${TARGET_USER:-nobody}'. Nothing done." >&2
  exit 1
fi
if (( ${#CHPW_NEW} < 12 )); then
  echo "REFUSING: the new password is shorter than 12 characters. Nothing done." >&2
  exit 2
fi

# The password travels in a pipe: chpasswd takes it on stdin precisely so it
# never appears on a command line.
printf '%s:%s\n' "$TARGET_USER" "$CHPW_NEW" | chpasswd
CHPW_NEW=""

# Proved rather than assumed: set and usable, and not expired, because an
# expired password stops the sudo every later run depends on.
PW_STATUS="$(passwd -S -- "$TARGET_USER" 2>/dev/null | cut -d' ' -f2 || echo '?')"
case "$PW_STATUS" in
  P|PS) ;;
  *)
    echo "FAIL password status of ${TARGET_USER} is '${PW_STATUS}', not a usable password." >&2
    exit 1
    ;;
esac
PW_CHANGED="$(LC_ALL=C chage -l -- "$TARGET_USER" 2>/dev/null \
  | sed -n 's/^Last password change[^:]*: *//p')"
if [[ "$PW_CHANGED" == "password must be changed" ]]; then
  echo "FAIL the password of ${TARGET_USER} is expired." >&2
  exit 1
fi
echo "OK   the password of ${TARGET_USER} is set, usable and not expired"
