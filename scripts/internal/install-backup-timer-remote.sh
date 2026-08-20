#!/usr/bin/env bash
# Root-side body of scripts/install-backup-timer.sh. Never run directly: it
# expects the variable assignments its wrapper emits ahead of this body on the
# same stdin stream, and it runs as root because the wrapper pipes it into sudo.
#
# Invoked via:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'UNIT_SERVICE_B64=%q\n' "$svc";
#     printf 'UNIT_TIMER_B64=%q\n'   "$tmr";
#     cat scripts/internal/install-backup-timer-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# The unit files ride the pipe as base64 assignments rather than being scp'd
# into a staging directory. That removes the directory, the copy step, and the
# cleanup trap that had to remove it on every exit path, and it means a failure
# part-way leaves nothing behind on the host to find later and wonder about.
#
# Installing, reloading, enabling and first-running all happen here, in one
# elevated shell, because they are one operation: units that are installed but
# not enabled, or enabled but never run, are the two states that look healthy
# and back up nothing.
#
# The service is started once immediately so a missing prerequisite fails here,
# loudly, rather than silently on the first timer tick. backup-db.sh refuses to
# run without BACKUP_S3_BUCKET in the host env file, and a timer whose service
# refuses still reports active, uploading nothing.
#
# Required shell variables (provided by the caller's prepended assignments):
#   UNIT_SERVICE_B64  base64 of ops/systemd/footbag-backup.service
#   UNIT_TIMER_B64    base64 of ops/systemd/footbag-backup.timer

set -euo pipefail

: "${UNIT_SERVICE_B64:?remote half requires UNIT_SERVICE_B64}"
: "${UNIT_TIMER_B64:?remote half requires UNIT_TIMER_B64}"

umask 077
tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT INT TERM

printf '%s' "$UNIT_SERVICE_B64" | base64 -d > "$tmpdir/footbag-backup.service"
printf '%s' "$UNIT_TIMER_B64"   | base64 -d > "$tmpdir/footbag-backup.timer"

if [[ ! -s "$tmpdir/footbag-backup.service" || ! -s "$tmpdir/footbag-backup.timer" ]]; then
  echo "ERROR: a unit file decoded empty; nothing was installed." >&2
  exit 1
fi

echo "==> installing unit files"
install -m 0644 -o root -g root "$tmpdir/footbag-backup.service" /etc/systemd/system/footbag-backup.service
install -m 0644 -o root -g root "$tmpdir/footbag-backup.timer"   /etc/systemd/system/footbag-backup.timer

echo "==> reloading systemd and enabling the timer"
systemctl daemon-reload
systemctl enable --now footbag-backup.timer

echo "==> running the first snapshot now"
systemctl start footbag-backup.service

echo
systemctl --no-pager --lines=0 status footbag-backup.timer
echo
journalctl -u footbag-backup.service -n 10 --no-pager
