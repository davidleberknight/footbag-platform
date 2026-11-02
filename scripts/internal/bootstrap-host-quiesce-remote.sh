#!/usr/bin/env bash
# Root-side body that stops a live host's writes and takes its last backup,
# before scripts/bootstrap-host.sh --replace-instance snapshots it. Never run
# directly: the caller pipes it into sudo over the wire pattern.
#
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'MODE=%q\n' stop;
#     cat scripts/lib/closing-report-remote.sh;
#     cat scripts/internal/bootstrap-host-quiesce-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash -s footbag-bootstrap-quiesce'
#
# Why it stops the service rather than only backing up. The member database is
# the one thing on the host that changes between backups, and a replacement
# loses whatever was written after the last one. With the service stopped
# nothing more is written, so one backup run to completion after the stop holds
# every write the host ever took, and the caller proves that run's object landed
# in the bucket before it lets anything be destroyed.
#
# Every problem is marked with crr_error, from the remote reporting library the
# caller sends ahead of this body, so it lands in the caller's closing report;
# crr_finish ends the run, non-zero when any was an error.
#
# Two modes:
#   stop    stop footbag.service, then run footbag-backup.service once. A
#           oneshot unit's start returns when its run has finished, and fails
#           when the run failed, so its status is the backup's.
#   resume  start footbag.service again, for a replacement that stopped before
#           anything was replaced.
#
# Required shell variables:
#   MODE   stop | resume

set -euo pipefail

# What systemctl prints when a start or stop fails.
SYSTEMCTL_ERRORS='^(Failed|Job for)'
SYSTEMCTL_WARNINGS='^Warning:'

case "${MODE:-}" in
  stop)
    echo "==> Stopping footbag.service, so nothing more is written"
    crr_run --errors "$SYSTEMCTL_ERRORS" --warnings "$SYSTEMCTL_WARNINGS" "stop footbag.service" -- \
      systemctl stop footbag || crr_finish
    echo "==> Running one backup to completion"
    if ! crr_run --errors "$SYSTEMCTL_ERRORS" --warnings "$SYSTEMCTL_WARNINGS" "the last backup" -- \
        systemctl start footbag-backup.service; then
      crr_error "the backup run failed (journalctl -u footbag-backup.service says why)."
      crr_finish
    fi
    echo "---FOOTBAG-QUIESCED---"
    ;;
  resume)
    echo "==> Starting footbag.service again"
    crr_run --errors "$SYSTEMCTL_ERRORS" --warnings "$SYSTEMCTL_WARNINGS" "start footbag.service" -- \
      systemctl start footbag || crr_finish
    ;;
  *)
    crr_error "unknown MODE '${MODE:-}'."
    ;;
esac

crr_finish
