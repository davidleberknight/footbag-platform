#!/usr/bin/env bash
# Root-side body of the one reboot at the end of scripts/bootstrap-host.sh.
# Never run directly: the caller pipes it into sudo over the wire pattern.
#
#   { printf '%s\n' "$SUDO_PASS";
#     cat scripts/internal/bootstrap-host-reboot-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash -s footbag-bootstrap-reboot'
#
# The reboot is scheduled a few seconds out rather than run in this session, so
# the session that asked for it ends cleanly and its exit status means "the
# reboot is scheduled" instead of "the connection dropped", which looks the
# same as every other failure. The boot id printed first is what the caller
# compares against afterwards: a host answering with the same id has not
# rebooted, whatever else it says.

set -euo pipefail

echo "---FOOTBAG-BOOT-ID---"
cat /proc/sys/kernel/random/boot_id
systemd-run --quiet --on-active=5 --unit=footbag-bootstrap-reboot systemctl reboot
echo "---FOOTBAG-END---"
