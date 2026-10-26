#!/usr/bin/env bash
# Root-side body that stops a live host's writes and takes its last backup,
# before scripts/bootstrap-host.sh --replace-instance snapshots it. Never run
# directly: the caller pipes it into sudo over the wire pattern.
#
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'MODE=%q\n' stop;
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

: "${MODE:?remote half requires MODE}"

case "$MODE" in
  stop)
    echo "==> Stopping footbag.service, so nothing more is written"
    systemctl stop footbag
    echo "==> Running one backup to completion"
    if ! systemctl start footbag-backup.service; then
      echo "ERROR: the backup run failed (journalctl -u footbag-backup.service says why)." >&2
      exit 1
    fi
    echo "---FOOTBAG-QUIESCED---"
    ;;
  resume)
    echo "==> Starting footbag.service again"
    systemctl start footbag
    ;;
  *)
    echo "ERROR: unknown MODE '${MODE}'." >&2
    exit 1
    ;;
esac
