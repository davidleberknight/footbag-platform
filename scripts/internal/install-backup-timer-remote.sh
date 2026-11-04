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
#
# The caller sends scripts/lib/closing-report-remote.sh on the same stream just
# ahead of this body. Every problem met here is marked with crr_error or
# crr_warn, the first backup run's own failure and retry lines included, so they
# land in the caller's closing report rather than in a journal tail printed
# above its last line; crr_finish ends the run, non-zero when any was an error.
# The half keeps its own traps, because the caller's library is not on this
# host and the temp directory has to go on an interrupt too.

set -euo pipefail

: "${UNIT_SERVICE_B64:?remote half requires UNIT_SERVICE_B64}"
: "${UNIT_TIMER_B64:?remote half requires UNIT_TIMER_B64}"

umask 077
tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf '%s' "$UNIT_SERVICE_B64" | base64 -d > "$tmpdir/footbag-backup.service"
printf '%s' "$UNIT_TIMER_B64"   | base64 -d > "$tmpdir/footbag-backup.timer"

if [[ ! -s "$tmpdir/footbag-backup.service" || ! -s "$tmpdir/footbag-backup.timer" ]]; then
  crr_error "a unit file decoded empty; nothing was installed."
  crr_finish
fi

# systemctl's own failures name themselves "Failed" or "failed"; its warnings
# (a unit file changed on disk, say) begin with "Warning".
SYSTEMD_ERRORS='[Ff]ailed'
SYSTEMD_WARNINGS='^Warning'

echo "==> installing unit files"
install -m 0644 -o root -g root "$tmpdir/footbag-backup.service" /etc/systemd/system/footbag-backup.service
install -m 0644 -o root -g root "$tmpdir/footbag-backup.timer"   /etc/systemd/system/footbag-backup.timer

echo "==> reloading systemd and enabling the timer"
crr_run --errors "$SYSTEMD_ERRORS" --warnings "$SYSTEMD_WARNINGS" "systemctl daemon-reload" -- \
  systemctl daemon-reload || crr_finish
crr_run --errors "$SYSTEMD_ERRORS" --warnings "$SYSTEMD_WARNINGS" "enabling footbag-backup.timer" -- \
  systemctl enable --now footbag-backup.timer || crr_finish

echo "==> running the first snapshot now"
# The journal is read from this moment on, so the lines judged below are this
# run's and not an older failure the host already recovered from.
run_started="$(date '+%Y-%m-%d %H:%M:%S')"
# A failed first run is marked by crr_run and the run carries on, so the journal
# read below can add the backup's own reason for it.
crr_run --errors "$SYSTEMD_ERRORS" --warnings "$SYSTEMD_WARNINGS" "first backup run" -- \
  systemctl start footbag-backup.service || true

echo
# Shown for the operator; its exit status is not the verdict, which is the
# is-active check that follows.
systemctl --no-pager --lines=0 status footbag-backup.timer || true
if ! systemctl is-active --quiet footbag-backup.timer; then
  crr_error "footbag-backup.timer is not active after enabling it, so no backup will run on schedule."
fi
echo
# The backup's own lines: a refusal or a failed upload is an error; a retry it
# recovered from, or a metric it could not publish, is a warning.
crr_run --errors 'backup-db: FAILURE' --warnings 'backup-db: .*(failed|was not published)' \
  "first backup run, journal" -- \
  journalctl -u footbag-backup.service --since "$run_started" --no-pager || true
crr_finish
