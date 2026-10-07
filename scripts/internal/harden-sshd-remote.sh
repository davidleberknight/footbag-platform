#!/usr/bin/env bash
# Root-side body of scripts/harden-sshd.sh. Never run directly: it runs as root
# because the wrapper pipes it into sudo, after the password line and the MODE
# assignment on the same stdin stream.
#
# Invoked via:
#   { printf '%s\n' "$SUDO_PASS"; printf 'MODE=%q\n' "$mode";
#     cat scripts/internal/harden-sshd-remote.sh; } \
#     | ssh REMOTE 'sudo -k -S -p "" bash'
#
# The posture is written as one drop-in file rather than by editing the main
# configuration. sshd takes the first value it reads for each keyword, and the
# image's main file includes the drop-in directory before its own settings, so a
# file sorted ahead of the image's drop-ins decides these three keywords and
# touches nothing else.
#
# Nothing reloads until every check that can be made from here has passed:
#   - the new file validates;
#   - for root, the connecting account and the break-glass account, from a
#     loopback and an outside address, sshd would apply exactly the three
#     values written, so no Match block re-opens them;
#   - for the connecting account, the whole effective configuration differs
#     from before only in those three keywords, so ports, key and certificate
#     settings are untouched;
#   - no authentication method list makes a password a required second factor,
#     and the connecting account holds an authorized key to log in with.
# Until the reload has succeeded, any exit at all, a failed check, an error, an
# interrupt or a dropped connection, puts the previous file back or removes
# ours. A reload keeps established sessions, so the session running this is
# never cut off.
#
# A host already carrying the posture on disk is still validated and reloaded,
# because a file on disk is not proof the running daemon applies it: an earlier
# run can have been cut off between writing and reloading.
#
# The change also reverts itself unless it is confirmed. Before the reload, a
# one-shot systemd timer is set to put the previous file back and reload sshd a
# few minutes later. The workstation confirms (MODE=confirm) only after it has
# opened a brand-new connection and seen a password-only connection refused; if
# it never can, nobody has to reach the host: the timer undoes the change on its
# own while the existing sessions stay up. Unless the host reboots first: the
# timer is a transient unit and the revert script lives under /run, so neither
# survives a boot, while the hardened drop-in under /etc does.
#
# Required shell variables (from the wrapper's prepended assignments):
#   MODE        status | apply | confirm
#
# Optional, overridable so this body also runs standalone for its tests:
#   SSHD_BIN          the sshd binary (default sshd)
#   SSHD_CONFIG       the main configuration (default /etc/ssh/sshd_config)
#   SSHD_DROPIN_DIR   the drop-in directory (default /etc/ssh/sshd_config.d)
#   LOGIN_USER        the account to protect (default $SUDO_USER)
#   LOGIN_KEYS        that account's authorized keys file (default from its home)
#   BREAK_GLASS_USER  the break-glass account (default ec2-user)
#   REVERT_UNIT       the revert timer's unit name (default footbag-sshd-revert)
#   REVERT_SCRIPT     where the revert script is written (default /run/footbag-sshd-revert.sh)
#   REVERT_AFTER      seconds before an unconfirmed change reverts (default 300)
set -euo pipefail

: "${MODE:?remote half requires MODE}"
# One collation for every sort and comparison below, so two readings of the
# same configuration always compare equal.
export LC_ALL=C
SSHD_BIN="${SSHD_BIN:-sshd}"
SSHD_CONFIG="${SSHD_CONFIG:-/etc/ssh/sshd_config}"
SSHD_DROPIN_DIR="${SSHD_DROPIN_DIR:-/etc/ssh/sshd_config.d}"
LOGIN_USER="${LOGIN_USER:-${SUDO_USER:-}}"
BREAK_GLASS_USER="${BREAK_GLASS_USER:-ec2-user}"
DROPIN="${SSHD_DROPIN_DIR}/10-footbag-hardening.conf"
# Names the Include pattern (*.conf) does not match, so sshd never reads a
# half-written file or the saved previous one. Both sit in the drop-in directory
# itself, so restoring is a same-directory rename: atomic, and carrying the
# directory's own security label.
STAGED="${SSHD_DROPIN_DIR}/.10-footbag-hardening.conf.staged"
SAVED="${SSHD_DROPIN_DIR}/.10-footbag-hardening.conf.prev"
REVERT_UNIT="${REVERT_UNIT:-footbag-sshd-revert}"
REVERT_SCRIPT="${REVERT_SCRIPT:-/run/footbag-sshd-revert.sh}"
REVERT_AFTER="${REVERT_AFTER:-300}"
CONFIRMED_MARK="${CONFIRMED_MARK:-${REVERT_SCRIPT}.confirmed}"
HARDENED_LINES=$'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no'

KEYWORDS_RE='^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|challengeresponseauthentication) '

posture() {
  "$SSHD_BIN" -T 2>/dev/null </dev/null \
    | grep -iE '^(port|permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|authenticationmethods) ' \
    | sort
}

# The effective configuration as sshd would apply it to one connection, with
# every Match block evaluated.
effective_for() {
  "$SSHD_BIN" -T -C "user=$1,host=$2,addr=$3" 2>/dev/null </dev/null | sort
}

value_in() {
  sed -n "s/^$1 //Ip" <<<"$2" | head -1
}

# Every connection this change must close, judged with Match applied: root, the
# account running this, the break-glass account; from loopback and from outside.
applies_everywhere() {
  local who where out
  for who in root "$LOGIN_USER" "$BREAK_GLASS_USER"; do
    for where in "localhost,127.0.0.1" "outside.invalid,203.0.113.1"; do
      out="$(effective_for "$who" "${where%%,*}" "${where##*,}")" || return 1
      [[ "$(value_in permitrootlogin "$out")" == "no" \
         && "$(value_in passwordauthentication "$out")" == "no" \
         && "$(value_in kbdinteractiveauthentication "$out")" == "no" ]] || {
        echo "       for ${who} from ${where##*,}: $(grep -iE "$KEYWORDS_RE" <<<"$out" | tr '\n' ' ')" >&2
        return 1
      }
    done
  done
}

echo "==> sshd posture on $(hostname) (configuration on disk)"
before="$(posture)" || before=""
[[ -n "$before" ]] || { echo "ERROR: could not read the effective sshd configuration (sshd -T failed)." >&2; exit 1; }
printf '%s\n' "$before" | sed 's/^/    /'

if [[ "$MODE" == "status" ]]; then
  # A change waiting to be confirmed is not what status would otherwise suggest:
  # the hardened file is on disk and is about to be put back.
  if systemctl is-active --quiet "${REVERT_UNIT}.timer" </dev/null 2>/dev/null; then
    echo "    NOTE: a change is waiting to be confirmed; its self-revert will put the previous file back." || true
  fi
  exit 0
fi

revert_pending() {
  systemctl is-active --quiet "${REVERT_UNIT}.timer" </dev/null 2>/dev/null
}

# The timer has fired and the revert is running or about to finish. Cancelling a
# timer does not stop a service it already started, and is-active alone reports
# "activating" as not active, so the state is read directly.
revert_running() {
  case "$(systemctl show -p ActiveState --value "${REVERT_UNIT}.service" </dev/null 2>/dev/null)" in
    active|activating|deactivating) return 0 ;;
    *) return 1 ;;
  esac
}

# Confirm: cancel the pending revert, and prove the hardened file is what stays.
# A revert that has already fired is reported as such, never as a confirmation.
if [[ "$MODE" == "confirm" ]]; then
  # Judged before anything is cancelled, so a change that has already reverted is
  # reported as that and never half-confirmed.
  if revert_running; then
    echo "ERROR: the revert is running now and will put the previous file back. Nothing was confirmed;" >&2
    echo "       read the posture, then re-run --apply once it has finished." >&2
    exit 1
  fi
  if [[ "$(grep -vE '^#' "$DROPIN" 2>/dev/null || true)" != "$HARDENED_LINES" ]]; then
    echo "ERROR: ${DROPIN} does not hold the hardened settings: the change was already reverted." >&2
    exit 1
  fi
  # The marker is written before the timer is cancelled. The revert script does
  # nothing once it exists, so a revert the timer has already queued, which
  # cancelling the timer does not withdraw and which reads as inactive until it
  # runs, can no longer undo the change. Every refusal below removes it again,
  # so a revert that is still to come does what the refusal says it will.
  : > "$CONFIRMED_MARK"
  if revert_pending; then
    systemctl stop "${REVERT_UNIT}.timer" </dev/null \
      || { rm -f "$CONFIRMED_MARK"; echo "ERROR: could not cancel the pending revert; it will still put the previous file back." >&2; exit 1; }
  fi
  # A revert that looked for the marker before it was written is either still
  # running, or has finished and left the previous file in place. Once it is no
  # longer running, the file says which.
  if revert_pending || revert_running; then
    rm -f "$CONFIRMED_MARK"
    echo "ERROR: the revert is still pending or running; it will put the previous file back." >&2
    exit 1
  fi
  if [[ "$(grep -vE '^#' "$DROPIN" 2>/dev/null || true)" != "$HARDENED_LINES" ]]; then
    rm -f "$CONFIRMED_MARK"
    echo "ERROR: the revert fired while this confirmation was being made and put the previous file back." >&2
    echo "       Nothing was confirmed. Check the posture, then re-run --apply." >&2
    exit 1
  fi
  rm -f "$SAVED" "$REVERT_SCRIPT"
  echo "    the change is confirmed; nothing will revert it"
  exit 0
fi
[[ "$MODE" == "apply" ]] || { echo "ERROR: unknown MODE '${MODE}'." >&2; exit 1; }

grep -qE "^[[:space:]]*Include[[:space:]]+${SSHD_DROPIN_DIR}/\*\.conf" "$SSHD_CONFIG" \
  || { echo "ERROR: ${SSHD_CONFIG} does not include ${SSHD_DROPIN_DIR}/*.conf, so a drop-in would not take effect. Nothing changed." >&2; exit 1; }
[[ -n "$LOGIN_USER" ]] \
  || { echo "ERROR: cannot tell which account this session logged in as, so cannot protect its login. Nothing changed." >&2; exit 1; }

if [[ -z "${LOGIN_KEYS:-}" ]]; then
  login_home="$(getent passwd "$LOGIN_USER" | cut -d: -f6)" || login_home=""
  LOGIN_KEYS="${login_home}/.ssh/authorized_keys"
fi
[[ -s "$LOGIN_KEYS" ]] \
  || { echo "ERROR: ${LOGIN_USER} has no authorized key at ${LOGIN_KEYS}, so turning password login off could lock it out. Nothing changed." >&2; exit 1; }

login_before="$(effective_for "$LOGIN_USER" localhost 127.0.0.1)" \
  || { echo "ERROR: could not read the effective configuration for ${LOGIN_USER}. Nothing changed." >&2; exit 1; }
authmethods="$(value_in authenticationmethods "$login_before")"
if [[ -n "$authmethods" && "$authmethods" != "any" ]]; then
  echo "ERROR: ${LOGIN_USER} must satisfy AuthenticationMethods '${authmethods}'; turning password or" >&2
  echo "       keyboard-interactive login off could make that impossible. Nothing changed." >&2
  exit 1
fi

unit="sshd"
systemctl cat sshd.service >/dev/null 2>&1 </dev/null || unit="ssh"

# A saved copy left behind means an earlier run was killed between saving and
# finishing, and it may be the only copy of the original. Nothing here guesses
# which file is right.
if revert_pending; then
  echo "ERROR: an earlier run's change is still waiting to be confirmed, and its revert will fire" >&2
  echo "       within ${REVERT_AFTER} seconds of that run. Let it fire, or confirm it, then re-run. Nothing changed." >&2
  exit 1
fi
if [[ -e "$SAVED" ]]; then
  echo "ERROR: ${SAVED} is left from an interrupted run and may be the only copy of the previous" >&2
  echo "       file. If the host rebooted before the revert fired and the hardened file is what you want, the" >&2
  echo "       change was never confirmed: finish it with a confirm run, which clears this copy. Otherwise" >&2
  echo "       inspect it, then move it to ${DROPIN} or delete it, and re-run. Nothing changed." >&2
  exit 1
fi

# From here until the reload has succeeded, any exit restores what was there.
# The saved copy is the only copy of a previous drop-in, so it is removed only
# once that decision is made. Once a reload has been started, sshd may already
# have been told to read the new file, so a restore after that point reloads
# again, leaving the daemon and the disk in agreement.
saved=0
installed=0
committed=0
reload_started=0
revert_armed=0
restore_previous() {
  # Nothing may stop this function part way. The connection it would report on
  # may be gone, so a write can fail or raise SIGPIPE: signals are ignored here,
  # every write tolerates failure, and the file and the reload come before any
  # message.
  trap '' PIPE HUP INT TERM
  rm -f "$STAGED" || true
  if (( installed )) && ! (( committed )); then
    local note="The previous sshd configuration file is back in place."
    if (( revert_armed )); then
      systemctl stop "${REVERT_UNIT}.timer" </dev/null || true
      rm -f "$REVERT_SCRIPT" || true
    fi
    if (( saved )); then
      mv -f "$SAVED" "$DROPIN" || note="ERROR: could not put ${SAVED} back as ${DROPIN}; do it by hand before any reload."
    else
      rm -f "$DROPIN" || note="ERROR: could not remove ${DROPIN}; remove it by hand before any reload."
    fi
    if (( reload_started )); then
      systemctl reload "$unit" </dev/null \
        || note="${note} Reloading ${unit} to match it FAILED; check it on the host."
    fi
    echo "       ${note}" >&2 || true
  elif ! (( revert_armed )); then
    # Committed with a revert pending keeps the saved copy: it is what the
    # revert puts back, and confirming removes it.
    rm -f "$SAVED" || true
  fi
}
# One EXIT trap covers interrupts too: bash runs it when a TERM, INT or HUP ends
# the script. A separate signal handler would only risk returning into the run.
trap restore_previous EXIT

if [[ -e "$DROPIN" ]]; then
  cp -a "$DROPIN" "$SAVED"
  saved=1
fi

umask 077
{
  echo "# Written by scripts/harden-sshd.sh. Sorted ahead of the image's drop-ins so"
  echo "# these values are the ones sshd applies."
  echo "PermitRootLogin no"
  echo "PasswordAuthentication no"
  echo "KbdInteractiveAuthentication no"
} > "$STAGED"
chmod 600 "$STAGED"
installed=1
mv -f "$STAGED" "$DROPIN"

if ! "$SSHD_BIN" -t </dev/null; then
  echo "ERROR: the new configuration does not validate (sshd -t). sshd was not reloaded." >&2
  exit 1
fi

if ! applies_everywhere; then
  echo "ERROR: with the file in place, sshd would still allow root, password or keyboard-interactive" >&2
  echo "       login for the connection above: another setting decides first. sshd was not reloaded." >&2
  exit 1
fi

login_after="$(effective_for "$LOGIN_USER" localhost 127.0.0.1)" || login_after=""
rest_before="$(grep -viE "$KEYWORDS_RE" <<<"$login_before" || true)"
rest_after="$(grep -viE "$KEYWORDS_RE" <<<"$login_after" || true)"
if [[ -z "$login_after" || "$rest_before" != "$rest_after" ]]; then
  echo "ERROR: the change would alter more than the three login settings for ${LOGIN_USER}:" >&2
  # Both are sorted, so comm shows what appears on one side only. comm is in
  # coreutils, which a minimal image always carries; diff is not.
  comm -3 <(printf '%s\n' "$rest_before") <(printf '%s\n' "$rest_after") | sed 's/^/       /' >&2 || true
  echo "       sshd was not reloaded." >&2
  exit 1
fi

# The revert, set before the reload so no moment exists where the change is live
# and nothing will undo it. It puts back exactly what is on disk now (the saved
# copy, or no file) and reloads, unless the workstation confirms first.
{
  echo '#!/usr/bin/env bash'
  echo '# Written by scripts/harden-sshd.sh: undoes an unconfirmed sshd change.'
  # A confirmed change is never undone, even by a service that started first.
  printf 'if [[ -e %q ]]; then rm -f %q; exit 0; fi\n' "$CONFIRMED_MARK" "$CONFIRMED_MARK"
  printf 'if [[ -e %q ]]; then mv -f %q %q; else rm -f %q; fi\n' "$SAVED" "$SAVED" "$DROPIN" "$DROPIN"
  # The reload's own status is the service's, so a failed reload shows as a failed unit.
  printf 'systemctl reload %q; status=$?\n' "$unit"
  printf 'rm -f %q\n' "$REVERT_SCRIPT"
  echo 'exit $status'
} > "$REVERT_SCRIPT"
chmod 700 "$REVERT_SCRIPT"
revert_armed=1
rm -f "$CONFIRMED_MARK"
if ! systemd-run --quiet --collect --unit="$REVERT_UNIT" --on-active="${REVERT_AFTER}s" \
     --timer-property=AccuracySec=1s /bin/bash "$REVERT_SCRIPT" </dev/null; then
  echo "ERROR: could not set the self-revert timer, so the change was not made live." >&2
  echo "       If a unit of that name is left failed, clear it with: systemctl reset-failed ${REVERT_UNIT}" >&2
  exit 1
fi
echo "    the change reverts itself in ${REVERT_AFTER} seconds unless the workstation confirms it"

echo "==> systemctl reload ${unit}"
reload_started=1
if ! systemctl reload "$unit" </dev/null; then
  echo "ERROR: the reload of ${unit} failed. The running daemon may or may not have read the new file;" >&2
  echo "       the previous file is being restored and ${unit} reloaded again to match it." >&2
  exit 1
fi
committed=1

# The change is live from here; a failed report must not read as a failure of it.
# A closed connection would otherwise end the run by SIGPIPE on the next write.
trap '' PIPE
echo "==> sshd posture on $(hostname) after the reload (configuration on disk)" || true
posture | sed 's/^/    /' || true
echo "    root, password and keyboard-interactive login off for every account checked; nothing else" || true
echo "    changed for ${LOGIN_USER}. The workstation now proves key login and the refusal, then confirms." || true
