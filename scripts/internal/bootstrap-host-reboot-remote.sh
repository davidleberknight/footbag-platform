#!/usr/bin/env bash
# Root-side body of a host reboot, for scripts/lib/host-reboot.sh. Never run
# directly: the caller pipes it into sudo over the wire pattern.
#
#   { printf '%s\n' "$SUDO_PASS";
#     cat scripts/lib/closing-report-remote.sh;
#     cat scripts/internal/bootstrap-host-reboot-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash -s footbag-reboot'
#
# The reboot is scheduled a few seconds out rather than run in this session, so
# the session that asked for it ends cleanly and its exit status means "the
# reboot is scheduled" instead of "the connection dropped", which looks the
# same as every other failure. The boot id printed first is what the caller
# compares against afterwards: a host answering with the same id has not
# rebooted, whatever else it says.
#
# Lines for the caller to read, on standard output:
#   ---FOOTBAG-BOOT-ID---
#   <the boot id before the reboot>
#   ---FOOTBAG-END---       printed only once the reboot is scheduled
#
# It arrives behind scripts/lib/closing-report-remote.sh, so every problem it
# meets is a marked line on standard error that the caller lists in its own
# closing report; it ends with crr_finish, whose status says whether any was an
# error.

set -uo pipefail

if ! boot_id="$(cat /proc/sys/kernel/random/boot_id)" || [[ -z "$boot_id" ]]; then
  crr_error "could not read the boot id, so a reboot could not be proved; nothing was scheduled"
  crr_finish
fi
echo "---FOOTBAG-BOOT-ID---"
printf '%s\n' "$boot_id"
if crr_run --errors '' --warnings '' "schedule the reboot" -- \
    systemd-run --quiet --on-active=5 --unit=footbag-bootstrap-reboot systemctl reboot; then
  echo "---FOOTBAG-END---"
fi
crr_finish
