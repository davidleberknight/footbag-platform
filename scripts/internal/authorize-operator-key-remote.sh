#!/usr/bin/env bash
# Root-side body of scripts/authorize-operator-key.sh.
#
# Invoked via:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'AUTHKEY_MODE=%q\n' "$MODE";
#     printf 'AUTHKEY_ACCOUNT=%q\n' "$ACCOUNT";
#     printf 'AUTHKEY_OPERATOR=%q\n' "$OPERATOR";
#     printf 'AUTHKEY_KEY_LINE=%q\n' "$KEY_LINE";
#     printf 'AUTHKEY_FINGERPRINT=%q\n' "$KEY_FINGERPRINT";
#     cat scripts/internal/authorize-operator-key-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# (sudo -S consumes the password line; bash inherits the rest, binds the
# assignments, and runs this body as root. Nothing secret reaches argv, and a
# public key is not secret in any case.)
#
# Required shell variables (provided by the caller's prepended assignments):
#   AUTHKEY_MODE         add | remove
#   AUTHKEY_ACCOUNT      the Linux account whose authorized_keys is edited
#   AUTHKEY_OPERATOR     who the key belongs to, for the output only
#   AUTHKEY_KEY_LINE     the public key line (add only)
#   AUTHKEY_FINGERPRINT  the key's SHA256 fingerprint, computed by the caller
#
# WHY THE FINGERPRINT IS PASSED IN RATHER THAN DERIVED HERE.
#
# It is what makes both idempotence and verification possible without comparing
# key text. Two spellings of the same key -- a different comment, different
# whitespace, an options prefix -- are the same credential and must not be
# installed twice, and a removal must find the key however it was written. The
# fingerprint is the identity; the line is one rendering of it.

set -euo pipefail

: "${AUTHKEY_MODE:?missing AUTHKEY_MODE variable in pipe}"
: "${AUTHKEY_ACCOUNT:?missing AUTHKEY_ACCOUNT variable in pipe}"
: "${AUTHKEY_FINGERPRINT:?missing AUTHKEY_FINGERPRINT variable in pipe}"
AUTHKEY_OPERATOR="${AUTHKEY_OPERATOR:-}"
AUTHKEY_KEY_LINE="${AUTHKEY_KEY_LINE:-}"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: this body must run as root; it is reached through sudo -S." >&2
  exit 1
fi

AUTHKEY_TMPS=()
authkey_cleanup() {
  local t
  for t in ${AUTHKEY_TMPS[@]+"${AUTHKEY_TMPS[@]}"}; do
    [[ -n "$t" && -e "$t" ]] || continue
    shred -u "$t" 2>/dev/null || rm -f "$t"
  done
  # Under set -e the exit status of an EXIT trap's last command replaces the
  # script's own. Files here are destroyed inline as soon as they are consumed,
  # so the final loop pass routinely tests one that is already gone, and a
  # cleanup ending on that false test would report a successful run as a
  # failure -- which the caller reads as a failed pipe, aborting it before it
  # prints what the operator does next.
  return 0
}
trap authkey_cleanup EXIT INT TERM

install_via_tmp() {
  local dest="$1" mode="$2" owner="$3" group="$4" tmp
  tmp=$(umask 077 && mktemp)
  AUTHKEY_TMPS+=("$tmp")
  cat > "$tmp"
  install -m "$mode" -o "$owner" -g "$group" "$tmp" "$dest"
  shred -u "$tmp" 2>/dev/null || rm -f "$tmp"
}

# fingerprints_of <file> -- one SHA256 fingerprint per parseable key, in order.
#
# ssh-keygen -l -f on a multi-key file prints one line per key. A line it cannot
# parse is skipped with a message on stderr rather than failing the run, which
# is the behaviour wanted here: a pre-existing malformed line in this file is
# somebody else's problem and must not stop a key being authorized, but it must
# also never be counted as a key.
fingerprints_of() {
  local f="$1"
  [[ -s "$f" ]] || return 0
  ssh-keygen -l -f "$f" 2>/dev/null | awk '{print $2}' || true
}

if ! id -u -- "$AUTHKEY_ACCOUNT" >/dev/null 2>&1; then
  echo "ERROR: account ${AUTHKEY_ACCOUNT} does not exist on this host." >&2
  echo "       This script authorizes a key on an account that already exists;" >&2
  echo "       it never creates one. Creating an account is" >&2
  echo "       provision-operator-account.sh, which is a different operation" >&2
  echo "       with a different record." >&2
  exit 1
fi

HOME_DIR="$(getent passwd -- "$AUTHKEY_ACCOUNT" | cut -d: -f6)"
if [[ -z "$HOME_DIR" || ! -d "$HOME_DIR" ]]; then
  echo "ERROR: ${AUTHKEY_ACCOUNT} has no home directory at '${HOME_DIR}'." >&2
  exit 1
fi
PRIMARY_GROUP="$(id -gn -- "$AUTHKEY_ACCOUNT")"
SSH_DIR="${HOME_DIR}/.ssh"
AUTH_FILE="${SSH_DIR}/authorized_keys"

# sshd silently refuses a key whose file or directory is group- or
# world-writable, with nothing in the operator's client output to say so. Assert
# the modes rather than assuming them: this file belongs to an account other
# people also use, so its state is not this script's to take on trust.
install -d -m 700 -o "$AUTHKEY_ACCOUNT" -g "$PRIMARY_GROUP" "$SSH_DIR"
if [[ ! -e "$AUTH_FILE" ]]; then
  : | install_via_tmp "$AUTH_FILE" 600 "$AUTHKEY_ACCOUNT" "$PRIMARY_GROUP"
fi

BEFORE_LIST="$(fingerprints_of "$AUTH_FILE")"
BEFORE_COUNT="$(printf '%s\n' "$BEFORE_LIST" | grep -c . || true)"
PRESENT="no"
printf '%s\n' "$BEFORE_LIST" | grep -qx -- "$AUTHKEY_FINGERPRINT" && PRESENT="yes"

echo "  ${AUTHKEY_ACCOUNT} on this host currently authorizes ${BEFORE_COUNT} key(s)."

WORK=$(umask 077 && mktemp)
AUTHKEY_TMPS+=("$WORK")

if [[ "$AUTHKEY_MODE" == "add" ]]; then
  if [[ -z "$AUTHKEY_KEY_LINE" ]]; then
    echo "ERROR: add mode needs AUTHKEY_KEY_LINE." >&2
    exit 1
  fi
  if [[ "$PRESENT" == "yes" ]]; then
    echo "  Already authorized (${AUTHKEY_FINGERPRINT}); nothing to do."
    echo "  Re-running this is safe and changes nothing."
    exit 0
  fi
  # Append. Never rewrite: every other key in this file belongs to somebody
  # else's access, and replacing the file to add one line is how an unrelated
  # operator is locked out by a script that reported success.
  cat "$AUTH_FILE" > "$WORK"
  # A file whose last line lacks a newline would otherwise have the new key
  # concatenated onto it, producing one corrupt line and losing two keys.
  if [[ -s "$WORK" ]] && [[ -n "$(tail -c 1 "$WORK")" ]]; then
    printf '\n' >> "$WORK"
  fi
  printf '%s\n' "$AUTHKEY_KEY_LINE" >> "$WORK"
else
  if [[ "$PRESENT" == "no" ]]; then
    echo "  Not authorized here (${AUTHKEY_FINGERPRINT}); nothing to remove."
    exit 0
  fi
  # Filter by fingerprint, one line at a time, so a key written with a different
  # comment or an options prefix is still found. Comments and blank lines are
  # preserved: they may be somebody's note about whose key follows.
  : > "$WORK"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ -z "${line// /}" || "${line#\#}" != "$line" ]]; then
      printf '%s\n' "$line" >> "$WORK"
      continue
    fi
    line_fp="$(printf '%s\n' "$line" | ssh-keygen -l -f /dev/stdin 2>/dev/null | awk '{print $2}' || true)"
    if [[ "$line_fp" == "$AUTHKEY_FINGERPRINT" ]]; then
      continue
    fi
    printf '%s\n' "$line" >> "$WORK"
  done < "$AUTH_FILE"
fi

install_via_tmp "$AUTH_FILE" 600 "$AUTHKEY_ACCOUNT" "$PRIMARY_GROUP" < "$WORK"

# ── Verify the outcome, not the invocation ───────────────────────────────────
echo
echo "  === Verification ==="
FAILED=0

AFTER_LIST="$(fingerprints_of "$AUTH_FILE")"
AFTER_COUNT="$(printf '%s\n' "$AFTER_LIST" | grep -c . || true)"
AFTER_PRESENT="no"
printf '%s\n' "$AFTER_LIST" | grep -qx -- "$AUTHKEY_FINGERPRINT" && AFTER_PRESENT="yes"

if [[ "$AUTHKEY_MODE" == "add" ]]; then
  if [[ "$AFTER_PRESENT" == "yes" ]]; then
    echo "  OK   key authorized (${AUTHKEY_FINGERPRINT})"
  else
    echo "  FAIL key is not in ${AUTH_FILE} after the write" >&2
    FAILED=1
  fi
  WANT=$(( BEFORE_COUNT + 1 ))
else
  if [[ "$AFTER_PRESENT" == "no" ]]; then
    echo "  OK   key withdrawn (${AUTHKEY_FINGERPRINT})"
  else
    echo "  FAIL key is still in ${AUTH_FILE} after the write" >&2
    FAILED=1
  fi
  WANT=$(( BEFORE_COUNT - 1 ))
fi

# The check that matters most, and the one an eyeball never makes: exactly one
# key moved. A rewrite that dropped somebody else's access would satisfy every
# assertion above and this is what catches it.
if [[ "$AFTER_COUNT" -eq "$WANT" ]]; then
  echo "  OK   ${AFTER_COUNT} key(s) authorized; exactly one changed"
else
  echo "  FAIL expected ${WANT} key(s) after this change, found ${AFTER_COUNT}" >&2
  echo "       Another key was added or lost. Inspect ${AUTH_FILE}." >&2
  FAILED=1
fi

# Every key that was there before and was not the subject must still be there.
# The count above would miss a swap: one lost, one gained.
SURVIVED=1
while IFS= read -r fp; do
  [[ -z "$fp" ]] && continue
  [[ "$fp" == "$AUTHKEY_FINGERPRINT" ]] && continue
  if ! printf '%s\n' "$AFTER_LIST" | grep -qx -- "$fp"; then
    echo "  FAIL a pre-existing key is gone: ${fp}" >&2
    SURVIVED=0
    FAILED=1
  fi
done <<< "$BEFORE_LIST"
[[ "$SURVIVED" -eq 1 ]] && echo "  OK   every other key that was here is still here"

MODE_NOW="$(stat -c '%a' "$AUTH_FILE")"
OWNER_NOW="$(stat -c '%U' "$AUTH_FILE")"
if [[ "$MODE_NOW" == "600" && "$OWNER_NOW" == "$AUTHKEY_ACCOUNT" ]]; then
  echo "  OK   ${AUTH_FILE} is ${MODE_NOW} and owned by ${OWNER_NOW}"
else
  echo "  FAIL ${AUTH_FILE} is ${MODE_NOW} owned by ${OWNER_NOW}; sshd will ignore it" >&2
  FAILED=1
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "  authorize_failed"
  exit 1
fi
echo "  All checks passed."
