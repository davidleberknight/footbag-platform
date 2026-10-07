#!/usr/bin/env bash
# harden-sshd.sh
#
# Sets the ssh daemon's posture on a deployed host and proves the host can
# still be reached afterwards.
#
# Nothing else in this project sets or enforces sshd configuration, so a host's
# posture is whatever the image shipped plus whatever anyone changed by hand.
# The image permits key-based root login, which costs nothing while root holds
# no key and nobody would notice the day it did. This script makes the posture
# a recorded, repeatable act.
#
# WHAT IT DOES.
#
#   1. Proves the host it reached records the environment it was asked for.
#   2. Reads and prints the effective sshd posture: root, password,
#      keyboard-interactive and key login, and the listening ports.
#   3. With --apply: on production, shows that posture and then asks for APPLY.
#      Writes root, password and keyboard-interactive login off as one drop-in
#      file, validates it, confirms with every Match block applied that sshd
#      would refuse those logins for root, the connecting account and the
#      break-glass account, that nothing else changes for the connecting
#      account, that no method list makes a password required, and that the
#      account holds a key. Then it sets a one-shot timer on the host that will
#      put the previous configuration back and reload in five minutes, and only
#      then reloads the daemon. Until the reload succeeds, any exit, interrupt or
#      dropped connection restores the previous configuration at once.
#   4. Proves a brand-new key-based connection succeeds, since established
#      sessions survive a reload, and proves the running daemon refuses a
#      connection that offers only a password.
#   5. Only after both proofs, confirms the change, which cancels the timer.
#
# WHAT IT REFUSES.
#
#   - A target it was not given. There is no default host.
#   - A host that records a different environment, before anything is changed.
#   - A production change nobody confirmed at a terminal.
#   - A host whose main configuration does not read the drop-in directory, since
#     the file would then change nothing.
#
# A re-run writes the same file, validates and reloads again, which is harmless
# and is what proves a run cut off before its reload is finished. If either proof
# fails, or the run stops before confirming, nothing has to reach the host: the
# timer undoes the change by itself, so a lockout heals without break-glass,
# unless the host reboots first. The timer and the revert script it runs last
# only until the next boot (a transient unit and a file under /run) while the
# hardened drop-in persists, so a reboot inside those five minutes keeps the
# change with nothing left to undo it.
#
# Usage. The host sudo password is read from stdin, line 1. Which file holds it
# follows the account the alias connects as:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt   ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#   your own named account:  ~/AWS/DEV_TESTER_HOST.txt  (staging only; none on production)
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/harden-sshd.sh --target staging
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/harden-sshd.sh --target staging --apply
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/harden-sshd.sh --target staging --confirm   # finish an unconfirmed change
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/harden-sshd.sh --target production --apply
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/harden-sshd-remote.sh"

TARGET=""
MODE="status"

die() { echo "harden-sshd: $*" >&2; exit 1; }

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "harden-sshd: --target requires an argument" >&2; exit 2; } ;;
    --apply)   MODE="apply"; shift ;;
    --confirm) MODE="confirm"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "harden-sshd: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

[[ "$TARGET" == "production" || "$TARGET" == "staging" ]] \
  || die "--target must be production or staging (got '${TARGET}')"
[[ -r "$REMOTE_HALF" ]] || die "missing remote half: $REMOTE_HALF"

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/harden-sshd.sh --target ${TARGET}" \
  "$ALIAS" "$TARGET" || exit 1
require_host_is "$ALIAS" "$TARGET" || exit 1

run_remote() {
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'MODE=%q\n' "$1"
    cat "$REMOTE_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
}

if [[ "$MODE" == "status" ]]; then
  run_remote status || die "could not read the sshd posture on ${ALIAS}"
  exit 0
fi

# Finishes a change that was never confirmed, for example because the host
# rebooted before its self-revert fired. It proves the same two things first,
# because confirming is what keeps the hardened file.
if [[ "$MODE" == "confirm" ]]; then
  run_remote status || die "could not read the sshd posture on ${ALIAS}; nothing was changed"
  echo ""
  confirm_from_tty "Type 'APPLY' to keep the hardened sshd settings on ${TARGET}: " "APPLY" \
    || die "not confirmed; nothing was changed"
  PROVE_THEN_CONFIRM=1
fi

# Production is shown its current posture before it is asked to confirm, so the
# confirmation is about something the operator has just read.
if [[ "$TARGET" == "production" && "$MODE" == "apply" ]]; then
  run_remote status || die "could not read the sshd posture on ${ALIAS}; nothing was changed"
  echo ""
  echo "About to set the ssh posture on ${ALIAS}: root login, password login and"
  echo "keyboard-interactive login off. Key login and the listening ports are not"
  echo "changed, and established sessions are kept."
  echo ""
  confirm_from_tty "Type 'APPLY' to harden sshd on production: " "APPLY" \
    || die "not confirmed; nothing was changed"
fi

if [[ "${PROVE_THEN_CONFIRM:-0}" != "1" ]] && ! run_remote apply; then
  echo "harden-sshd: the run on ${ALIAS} did not complete." >&2
  echo "             If its output above ends with a refusal, the previous configuration was" >&2
  echo "             put back and sshd not reloaded. If the connection was cut, the state is" >&2
  echo "             unknown: read it with" >&2
  echo "               bash scripts/harden-sshd.sh --target ${TARGET}" >&2
  echo "             and re-run with --apply, which validates and reloads again." >&2
  exit 1
fi

# A reload keeps established sessions, so only a new connection, opened with no
# shared master and no prompt, shows the host is still reachable. A connection
# landing while sshd re-executes can be refused for a moment, so it is retried.
echo "==> Proving a fresh key-based connection to ${ALIAS}"
fresh_ok=0
for attempt in 1 2 3; do
  if ssh "${HOST_SSH_OPTS[@]}" -o BatchMode=yes -o ControlMaster=no -o ControlPath=none \
       "$ALIAS" true </dev/null; then
    fresh_ok=1
    break
  fi
  (( attempt < 3 )) && sleep 2
done
# Every failure from here leaves the change unconfirmed, so the host undoes it on
# its own: nobody has to reach it, and the established sessions stay up. A
# --confirm run made no change and may be finishing one whose revert is gone,
# already fired or lost to a reboot, so it promises no revert.
unconfirmed() {
  echo "harden-sshd: $1" >&2
  if [[ "$MODE" == "confirm" ]]; then
    echo "             Nothing was confirmed, and this run changed nothing on ${ALIAS}. Read the" >&2
    echo "             posture with" >&2
    echo "               bash scripts/harden-sshd.sh --target ${TARGET}" >&2
    echo "             and if it is not hardened, re-run with --apply." >&2
    exit 1
  fi
  echo "             The change was NOT confirmed, so ${ALIAS} puts its previous sshd" >&2
  echo "             configuration back and reloads by itself within five minutes of the" >&2
  echo "             change, unless it reboots first. Do nothing; afterwards, read the" >&2
  echo "             posture with" >&2
  echo "               bash scripts/harden-sshd.sh --target ${TARGET}" >&2
  exit 1
}

if (( ! fresh_ok )); then
  unconfirmed "a NEW connection to ${ALIAS} failed after the change."
fi

# The running daemon, not the file, decides whether a password is accepted. A
# connection that offers only password and keyboard-interactive login must be
# refused, and the refusal lists the methods the daemon still offers: neither
# may appear there.
# Retried for the same reason as the key proof: an attempt landing while sshd
# re-executes is refused before it is asked for methods. A daemon that really
# still offers a password says so on every attempt, so retrying hides nothing.
echo "==> Proving the running daemon refuses password login on ${ALIAS}"
methods=""
for attempt in 1 2 3; do
  refusal="$(ssh "${HOST_SSH_OPTS[@]}" -o BatchMode=yes -o ControlMaster=no -o ControlPath=none \
    -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive \
    "$ALIAS" true 2>&1 </dev/null)" && unconfirmed "a password-only connection to ${ALIAS} was accepted; the daemon still allows it"
  methods="$(grep -o 'Permission denied ([^)]*)' <<<"$refusal" | head -1)" || methods=""
  [[ -n "$methods" ]] && break
  (( attempt < 3 )) && sleep 2
done
if [[ -z "$methods" ]]; then
  unconfirmed "could not read the daemon's offered methods from the refused connection: ${refusal}"
fi
if grep -qE 'password|keyboard-interactive' <<<"$methods"; then
  if [[ "$MODE" == "confirm" ]]; then
    unconfirmed "the running daemon still offers ${methods#Permission denied }"
  fi
  unconfirmed "the running daemon still offers ${methods#Permission denied }; the reload did not take effect"
fi
echo "    refused, offering ${methods#Permission denied }"

# Both proofs passed, so the change is kept: cancel the host's self-revert.
echo "==> Confirming the change on ${ALIAS}"
if ! run_remote confirm; then
  echo "harden-sshd: confirming the change on ${ALIAS} did not complete, and its state is not certain." >&2
  echo "             Either the self-revert already put the previous configuration back, or the" >&2
  echo "             change is kept and only its cleanup was cut short. Read it with" >&2
  echo "               bash scripts/harden-sshd.sh --target ${TARGET}" >&2
  echo "             If the posture is hardened and no revert is pending, finish with --confirm;" >&2
  echo "             if it is open again, re-run with --apply." >&2
  exit 1
fi

echo ""
echo "== ${TARGET}: sshd hardened, a fresh connection proved, password login refused =="
