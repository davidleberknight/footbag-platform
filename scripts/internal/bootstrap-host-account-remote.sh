#!/usr/bin/env bash
# Root-side body of the first login onto a fresh instance, run by
# scripts/bootstrap-host.sh as the image's default ec2-user account on port 22.
# Never run directly: it expects the assignment its caller emits ahead of it on
# the same stdin stream.
#
# Invoked as:
#   { printf 'FOOTBAG_PASSWORD=%q\n' "$SUDO_PASS";
#     cat scripts/internal/bootstrap-host-account-remote.sh;
#   } | ssh -p 22 -l ec2-user REMOTE 'sudo -n bash -s footbag-bootstrap-account'
#
# Why this account and this port. A fresh instance carries only the image's
# default account, holding the key Terraform injected through the Lightsail key
# pair, with password-free sudo, and an sshd listening on port 22 alone. Every
# other script in the tree connects as the shared footbag account on port 2222
# with a sudo password, so none of them can reach the host until this has run.
# The password is therefore not a sudo password here: it is the value the shared
# account's password is set to, and it travels as an assignment on the stream,
# never as an argument, and reaches chpasswd on its standard input.
#
# What it sets, each idempotent and each left alone when already right:
#   - sshd listens on 2222 as well as 22, through a drop-in, validated before
#     the reload and removed again if validation fails. Some operator ISPs drop
#     outbound port 22 to AWS, and the deploy alias uses 2222.
#   - the shared footbag account exists and is in wheel.
#   - ec2-user's authorized keys are copied to it, line by line, never retyped
#     and never rewritten: a key already there stays, so a re-run cannot drop an
#     administrator added since.
#   - its password, which is what sudo asks for on every later step: set on an
#     account this run created or one with no usable password, and never on an
#     account that already has one.
#
# What it refuses: a host whose main sshd configuration does not read the
# drop-in directory, because the drop-in would then change nothing while this
# reported success; and an ec2-user holding no authorized key, because copying
# nothing would create an account no one can log in to.
#
# Required shell variables:
#   FOOTBAG_PASSWORD   the shared account's sudo password

set -euo pipefail

: "${FOOTBAG_PASSWORD:?remote half requires FOOTBAG_PASSWORD}"

ACCOUNT="footbag"
# The image's default account's keys, found from the account rather than from a
# spelled-out home directory.
SOURCE_ACCOUNT="ec2-user"
SOURCE_KEYS="$(getent passwd "$SOURCE_ACCOUNT" | cut -d: -f6)/.ssh/authorized_keys"
SSHD_CONFIG="/etc/ssh/sshd_config"
SSHD_DROPIN_DIR="/etc/ssh/sshd_config.d"
PORTS_DROPIN="${SSHD_DROPIN_DIR}/05-footbag-ports.conf"

# Only the drop-in this run writes can need undoing, and only until the daemon
# has validated it; the registry is emptied once it has.
BOOTSTRAP_UNDO=""
cleanup() {
  if [[ -n "$BOOTSTRAP_UNDO" && -e "$BOOTSTRAP_UNDO" ]]; then
    rm -f "$BOOTSTRAP_UNDO"
  fi
  return 0
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

sshd_unit="sshd"
systemctl cat sshd.service >/dev/null 2>&1 </dev/null || sshd_unit="ssh"

listening_ports() {
  sshd -T 2>/dev/null | grep -E '^port ' | cut -d' ' -f2 | sort -un | tr '\n' ' ' | sed 's/ $//'
}

# ── sshd on both ports ───────────────────────────────────────────────────────
ports="$(listening_ports)"
if [[ " $ports " == *" 22 "* && " $ports " == *" 2222 "* ]]; then
  echo "    sshd already listens on 22 and 2222"
else
  grep -qE "^[[:space:]]*Include[[:space:]]+${SSHD_DROPIN_DIR}/\*\.conf" "$SSHD_CONFIG" || {
    echo "ERROR: ${SSHD_CONFIG} does not include ${SSHD_DROPIN_DIR}/*.conf, so a port drop-in" >&2
    echo "       would change nothing. Nothing changed." >&2
    exit 1
  }
  # A Port line anywhere replaces the default of 22 rather than adding to it, so
  # the drop-in names 22 too unless the main file already does.
  wanted="Port 2222"
  grep -qE '^[[:space:]]*Port[[:space:]]+22([[:space:]]|$)' "$SSHD_CONFIG" || wanted=$'Port 22\nPort 2222'
  BOOTSTRAP_UNDO="$PORTS_DROPIN"
  printf '%s\n' "$wanted" > "$PORTS_DROPIN"
  chmod 600 "$PORTS_DROPIN"
  if ! sshd -t; then
    echo "ERROR: sshd rejected the port drop-in; it has been removed and nothing was reloaded." >&2
    exit 1
  fi
  BOOTSTRAP_UNDO=""
  systemctl reload "$sshd_unit"
  ports="$(listening_ports)"
  if [[ " $ports " != *" 22 "* || " $ports " != *" 2222 "* ]]; then
    echo "ERROR: after the reload sshd reports ports '${ports}', not 22 and 2222." >&2
    exit 1
  fi
  echo "    sshd now listens on ${ports}"
fi

# ── the shared account ───────────────────────────────────────────────────────
created=0
if id "$ACCOUNT" >/dev/null 2>&1; then
  echo "    ${ACCOUNT} exists"
else
  useradd -m "$ACCOUNT"
  created=1
  echo "    created ${ACCOUNT}"
fi
if [[ " $(id -nG "$ACCOUNT") " == *" wheel "* ]]; then
  echo "    ${ACCOUNT} is in wheel"
else
  usermod -aG wheel "$ACCOUNT"
  echo "    added ${ACCOUNT} to wheel"
fi

# ── its keys, copied rather than typed ───────────────────────────────────────
[[ -s "$SOURCE_KEYS" ]] && grep -qE '^(ssh-|ecdsa-)' "$SOURCE_KEYS" || {
  echo "ERROR: ${SOURCE_KEYS} holds no key to copy, so the new account would admit nobody." >&2
  exit 1
}
home="$(getent passwd "$ACCOUNT" | cut -d: -f6)"
install -d -o "$ACCOUNT" -g "$ACCOUNT" -m 700 "${home}/.ssh"
dest="${home}/.ssh/authorized_keys"
[[ -e "$dest" ]] || install -o "$ACCOUNT" -g "$ACCOUNT" -m 600 /dev/null "$dest"
added=0
while IFS= read -r line; do
  [[ "$line" =~ ^(ssh-|ecdsa-) ]] || continue
  if ! grep -qxF -- "$line" "$dest"; then
    printf '%s\n' "$line" >> "$dest"
    added=$(( added + 1 ))
  fi
done < "$SOURCE_KEYS"
chown "$ACCOUNT:$ACCOUNT" "$dest"
chmod 600 "$dest"
echo "    ${ACCOUNT} authorized keys: $(grep -cE '^(ssh-|ecdsa-)' "$dest") (${added} copied from ec2-user)"

# ── its password, on chpasswd's standard input ───────────────────────────────
# Set only on an account this run created, or one that holds no usable password
# yet. An existing account's password is what everyone else who administers the
# host types, so a re-run reaching this path (a dropped connection on the alias's
# port reads the same as a fresh instance from outside) must never change it. The
# second field of `passwd -S` is the status: L, LK or NP is a locked or empty
# password, which nobody can be using; P or PS is a usable one, left alone; and
# anything this does not recognise is refused rather than guessed at.
set_password=0
if (( created )); then
  set_password=1
else
  pw_status="$(passwd -S "$ACCOUNT" 2>/dev/null | cut -d' ' -f2 || true)"
  case "$pw_status" in
    L|LK|NP) set_password=1 ;;
    P|PS)
      echo "    ${ACCOUNT} already has a usable password; left as it is"
      ;;
    *)
      echo "ERROR: could not read whether ${ACCOUNT} has a password (passwd -S reported '${pw_status}')." >&2
      echo "       Its password was not changed." >&2
      exit 1
      ;;
  esac
fi
if (( set_password )); then
  printf '%s:%s\n' "$ACCOUNT" "$FOOTBAG_PASSWORD" | chpasswd
  echo "    ${ACCOUNT} password set"
fi
FOOTBAG_PASSWORD=""
