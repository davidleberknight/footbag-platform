#!/usr/bin/env bash
# Root-side body for reading the last matching line out of the running web
# container's log. Never run directly: it expects the variable assignments its
# caller emits ahead of this body on the same stdin stream, and it runs as root
# because the caller pipes it into sudo.
#
# Invoked via scripts/lib/host-env-remote.sh:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'LOG_PATTERN=%q\n' "$pattern";
#     printf 'LOG_SCAN_LINES=%q\n' "$lines";
#     cat scripts/internal/host-log-grep-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# This exists so no operator has to type an ad-hoc `docker logs | grep` against
# a deployed host. Anything worth reading off a host is worth a scripted step
# with a name, and a one-liner passed around in a runbook is the shape that
# rots, gets mistyped, and has no test.
#
# The container is resolved by filter rather than hardcoded, because the compose
# project prefix has changed before and a hardcoded name fails as "no output"
# rather than as an error, which reads as "nothing to find".
#
# Required shell variables (provided by the caller's prepended assignments):
#   LOG_PATTERN      fixed string to match (not a regex; matched with grep -F)
#   LOG_SCAN_LINES   how many recent log lines to scan

set -euo pipefail

: "${LOG_PATTERN:?remote half requires LOG_PATTERN}"
: "${LOG_SCAN_LINES:=2000}"

container="$(docker ps --filter "name=web" --format '{{.Names}}' 2>/dev/null | head -1)"
if [[ -z "$container" ]]; then
  echo "ERROR: no running web container found on this host." >&2
  exit 9
fi

# Both streams: the application logs structured JSON to stdout, but a crash
# banner lands on stderr, and reading only one hides half the story.
match="$(docker logs "$container" --tail "$LOG_SCAN_LINES" 2>&1 | grep -F "$LOG_PATTERN" | tail -1 || true)"

if [[ -z "$match" ]]; then
  echo "ERROR: no line matching '${LOG_PATTERN}' in the last ${LOG_SCAN_LINES} lines." >&2
  exit 8
fi

printf '%s\n' "$match"
