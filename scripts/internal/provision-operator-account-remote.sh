#!/usr/bin/env bash
# Root-side body of scripts/provision-operator-account.sh.
#
# Invoked via:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'OPACC_MODE=%q\n' "$MODE";
#     printf 'OPACC_ACCOUNT=%q\n' "$ACCOUNT";
#     printf 'OPACC_OPERATOR=%q\n' "$OPERATOR";
#     printf 'OPACC_KEY_LINE=%q\n' "$KEY_LINE";
#     printf 'OPACC_PASSWORD=%q\n' "$NEW_PASS";
#     cat scripts/internal/provision-operator-account-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# (sudo -S consumes the password line; bash inherits the rest, binds the
# assignments, and runs this body as root. Nothing secret reaches argv.)
#
# Required shell variables (provided by the caller's prepended assignments):
#   OPACC_MODE      create | rotate | remove
#   OPACC_ACCOUNT   the Linux account name
#   OPACC_OPERATOR  who it belongs to, for the comment field
#   OPACC_KEY_LINE  their SSH public key line (create and rotate)
#   OPACC_PASSWORD  the generated sudo password (create and rotate)

set -euo pipefail

: "${OPACC_MODE:?missing OPACC_MODE variable in pipe}"
: "${OPACC_ACCOUNT:?missing OPACC_ACCOUNT variable in pipe}"
OPACC_OPERATOR="${OPACC_OPERATOR:-}"
OPACC_KEY_LINE="${OPACC_KEY_LINE:-}"
OPACC_PASSWORD="${OPACC_PASSWORD:-}"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: this body must run as root; it is reached through sudo -S." >&2
  exit 1
fi

OPACC_TMPS=()
opacc_cleanup() {
  local t
  for t in ${OPACC_TMPS[@]+"${OPACC_TMPS[@]}"}; do
    [[ -e "$t" ]] || continue
    shred -u "$t" 2>/dev/null || rm -f "$t"
  done
  return 0
}
trap opacc_cleanup EXIT INT TERM

# Write stdin to a destination through a restricted temp file, then promote it
# with `install`. The temp file is created restricted rather than fixed up
# afterwards, and it is trapped in the same breath: one of these calls carries a
# key file, and an `install` that failed on a full filesystem, or a signal
# between the write and the promote, would otherwise leave it in /tmp.
install_via_tmp() {
  local dest="$1" mode="$2" owner="$3" group="$4" tmp
  tmp=$(umask 077 && mktemp)
  OPACC_TMPS+=("$tmp")
  cat > "$tmp"
  install -m "$mode" -o "$owner" -g "$group" "$tmp" "$dest"
  shred -u "$tmp" 2>/dev/null || rm -f "$tmp"
}

# ── remove ───────────────────────────────────────────────────────────────────
#
# Reached only from the caller's rollback path, which runs it exclusively for an
# account that same run created and that nothing outside has recorded yet.
if [[ "$OPACC_MODE" == "remove" ]]; then
  if ! id -u -- "$OPACC_ACCOUNT" >/dev/null 2>&1; then
    echo "  ${OPACC_ACCOUNT} does not exist; nothing to remove."
    exit 0
  fi
  pkill -KILL -u "$OPACC_ACCOUNT" 2>/dev/null || true
  userdel -r -- "$OPACC_ACCOUNT"
  echo "  Removed ${OPACC_ACCOUNT} and its home directory."
  exit 0
fi

if [[ "$OPACC_MODE" != "create" && "$OPACC_MODE" != "rotate" ]]; then
  echo "ERROR: OPACC_MODE must be create, rotate or remove; got '${OPACC_MODE}'." >&2
  exit 2
fi
if [[ -z "$OPACC_KEY_LINE" || -z "$OPACC_PASSWORD" ]]; then
  echo "ERROR: ${OPACC_MODE} needs both a key line and a password in the pipe." >&2
  exit 2
fi

# ── Which group carries sudo on this host ────────────────────────────────────
#
# Detected rather than assumed. Amazon Linux uses wheel and Debian-family images
# use sudo, and adding an account to a group that does not exist fails loudly
# while adding it to the wrong existing one fails silently: the login works and
# the first sudo does not, days later, in the middle of a deploy.
SUDO_GROUP=""
for candidate in wheel sudo; do
  if getent group "$candidate" >/dev/null 2>&1; then
    SUDO_GROUP="$candidate"
    break
  fi
done
if [[ -z "$SUDO_GROUP" ]]; then
  echo "ERROR: neither 'wheel' nor 'sudo' exists as a group on this host, so" >&2
  echo "       there is no way to grant sudo by group membership. Nothing done." >&2
  exit 1
fi

# That the group exists is not that it carries sudo. A host whose sudoers has
# been edited can have a wheel group with no rule behind it, and the account
# would then be created looking correct and be unable to do the one thing it is
# for.
if ! grep -Rqs -- "^[[:space:]]*%${SUDO_GROUP}[[:space:]]" /etc/sudoers /etc/sudoers.d/; then
  echo "ERROR: group '${SUDO_GROUP}' exists but no sudoers rule grants it anything." >&2
  echo "       Creating the account would produce a login that cannot sudo." >&2
  echo "       Fix the sudoers rule first. Nothing done." >&2
  exit 1
fi

# ── Will sshd admit this name at all ─────────────────────────────────────────
#
# Checked before the account is created, not after the operator reports a
# failure. An AllowUsers or AllowGroups list that does not name the account
# makes sshd refuse the login while everything else on the host looks right,
# and the error it returns is indistinguishable from a bad key.
SSHD_EFFECTIVE=""
if ! SSHD_EFFECTIVE="$(sshd -T 2>/dev/null)"; then
  echo "  WARNING: could not read the effective sshd config (sshd -T failed)." >&2
  echo "  Check AllowUsers/AllowGroups by hand before reporting this account ready." >&2
else
  allow_users="$(printf '%s\n' "$SSHD_EFFECTIVE" | sed -n 's/^allowusers //p')"
  allow_groups="$(printf '%s\n' "$SSHD_EFFECTIVE" | sed -n 's/^allowgroups //p')"
  deny_users="$(printf '%s\n' "$SSHD_EFFECTIVE" | sed -n 's/^denyusers //p')"

  if [[ -n "$deny_users" ]] && printf '%s\n' $deny_users | grep -qx -- "$OPACC_ACCOUNT"; then
    echo "ERROR: sshd's DenyUsers names ${OPACC_ACCOUNT}, so it could not log in." >&2
    echo "       Nothing done." >&2
    exit 1
  fi
  if [[ -n "$allow_users" ]] && ! printf '%s\n' $allow_users | grep -qx -- "$OPACC_ACCOUNT"; then
    echo "ERROR: sshd has an AllowUsers list and ${OPACC_ACCOUNT} is not on it:" >&2
    echo "         ${allow_users}" >&2
    echo "       The account would be created and then refused at login, which" >&2
    echo "       looks exactly like a bad key. Add the name to AllowUsers in" >&2
    echo "       /etc/ssh/sshd_config, reload sshd, then re-run. Nothing done." >&2
    exit 1
  fi
  if [[ -n "$allow_groups" ]] && ! printf '%s\n' $allow_groups | grep -qx -- "$SUDO_GROUP"; then
    echo "ERROR: sshd has an AllowGroups list that does not carry '${SUDO_GROUP}':" >&2
    echo "         ${allow_groups}" >&2
    echo "       The new account's groups would not satisfy it and the login" >&2
    echo "       would be refused. Fix sshd_config first. Nothing done." >&2
    exit 1
  fi
fi

# ── Create or rotate ─────────────────────────────────────────────────────────
if [[ "$OPACC_MODE" == "create" ]]; then
  if id -u -- "$OPACC_ACCOUNT" >/dev/null 2>&1; then
    echo "ERROR: ${OPACC_ACCOUNT} already exists; the caller should have caught this." >&2
    exit 1
  fi
  useradd -m -G "$SUDO_GROUP" -c "$OPACC_OPERATOR" -- "$OPACC_ACCOUNT"
  echo "  Created ${OPACC_ACCOUNT}, member of ${SUDO_GROUP}."
else
  if ! id -u -- "$OPACC_ACCOUNT" >/dev/null 2>&1; then
    echo "ERROR: ${OPACC_ACCOUNT} does not exist; nothing to rotate." >&2
    exit 1
  fi
  usermod -aG "$SUDO_GROUP" -- "$OPACC_ACCOUNT"
  echo "  ${OPACC_ACCOUNT} exists; reinstalling key and replacing password."
fi

HOME_DIR="$(getent passwd "$OPACC_ACCOUNT" | cut -d: -f6)"
if [[ -z "$HOME_DIR" ]]; then
  echo "ERROR: ${OPACC_ACCOUNT} has no home directory in passwd." >&2
  exit 1
fi
PRIMARY_GROUP="$(id -gn -- "$OPACC_ACCOUNT")"

install -d -m 700 -o "$OPACC_ACCOUNT" -g "$PRIMARY_GROUP" "${HOME_DIR}/.ssh"
printf '%s\n' "$OPACC_KEY_LINE" \
  | install_via_tmp "${HOME_DIR}/.ssh/authorized_keys" 600 "$OPACC_ACCOUNT" "$PRIMARY_GROUP"
echo "  Installed authorized_keys."

# The password travels in a pipe. `chpasswd` takes it on stdin precisely so it
# never has to appear on a command line.
printf '%s:%s\n' "$OPACC_ACCOUNT" "$OPACC_PASSWORD" | chpasswd
echo "  Set the account password."

# ── Verify the outcome, not the invocation ───────────────────────────────────
#
# Every check below asserts something the operator would otherwise discover as a
# failed login or a failed sudo. What none of them can prove is that the person
# holding the private key can connect: that needs their key, which is on their
# machine and nowhere else, so it stays their verification step rather than a
# claim made here.
echo
echo "  === Verification ==="
FAILED=0

if id -nG -- "$OPACC_ACCOUNT" | tr ' ' '\n' | grep -qx -- "$SUDO_GROUP"; then
  echo "  OK   member of ${SUDO_GROUP}"
else
  echo "  FAIL not a member of ${SUDO_GROUP}" >&2
  FAILED=1
fi

# Field 2 of `passwd -S` is the status: P means a usable password is set, L
# locked, NP none. A locked or empty account accepts the key and then refuses
# every sudo, which is the failure this whole script exists to prevent.
PW_STATUS="$(passwd -S -- "$OPACC_ACCOUNT" 2>/dev/null | cut -d' ' -f2 || echo '?')"
if [[ "$PW_STATUS" == "P" ]]; then
  echo "  OK   password set and usable"
else
  echo "  FAIL password status is '${PW_STATUS}', expected 'P'" >&2
  FAILED=1
fi

LOGIN_SHELL="$(getent passwd "$OPACC_ACCOUNT" | cut -d: -f7)"
case "$LOGIN_SHELL" in
  */nologin|*/false|"")
    echo "  FAIL login shell is '${LOGIN_SHELL}'" >&2
    FAILED=1
    ;;
  *)
    echo "  OK   login shell ${LOGIN_SHELL}"
    ;;
esac

AK="${HOME_DIR}/.ssh/authorized_keys"
AK_MODE="$(stat -c '%a' "$AK" 2>/dev/null || echo '')"
AK_OWNER="$(stat -c '%U' "$AK" 2>/dev/null || echo '')"
if [[ "$AK_MODE" == "600" && "$AK_OWNER" == "$OPACC_ACCOUNT" ]]; then
  echo "  OK   authorized_keys mode 600, owned by ${OPACC_ACCOUNT}"
else
  # sshd silently ignores an authorized_keys file it considers unsafe, and the
  # login then fails as publickey with nothing in the account's own logs.
  echo "  FAIL authorized_keys is mode '${AK_MODE}' owned by '${AK_OWNER}'" >&2
  FAILED=1
fi

if INSTALLED_FP="$(ssh-keygen -l -f "$AK" 2>/dev/null)"; then
  echo "  OK   key on the host: ${INSTALLED_FP}"
else
  echo "  FAIL sshd will not be able to parse the installed key" >&2
  FAILED=1
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo >&2
  echo "  One or more checks failed. The account is NOT ready." >&2
  exit 1
fi

echo "  All checks passed."
