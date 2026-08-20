#!/usr/bin/env bash
# Root-side body for reading a deployed host's env file. Never run directly: it
# expects the variable assignments its caller emits ahead of this body on the
# same stdin stream, and it runs as root because the caller pipes it into sudo.
#
# Invoked via scripts/lib/host-env-remote.sh:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'HOST_ENV_PATH=%q\n' "$path";
#     printf 'WANT_HOST_REPORT=%q\n' "$yes_or_no";
#     cat scripts/internal/host-env-read-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# /srv/footbag/env is root:root 0600, so the operator's own account cannot read
# it and something has to run as root to hand it over. This body does that and
# nothing else: it writes no file anywhere on the host, so there is no staged
# copy of the secret set to shred afterwards and no cleanup step that a crash,
# an interrupt, or a forgetful operator can skip.
#
# The payload leaves as one base64 line between sentinels and every diagnostic
# goes to stderr. Raw text on a shared stream can interleave with a warning and
# arrive corrupted, or worse, arrive plausible; base64 on its own line cannot be
# confused with anything else, and it carries newlines and quotes intact.
#
# Required shell variables (emitted by the caller ahead of this body):
#   HOST_ENV_PATH     absolute path of the env file to read
#   WANT_HOST_REPORT  "yes" to also collect the bring-up host report

set -euo pipefail

: "${HOST_ENV_PATH:?remote half requires HOST_ENV_PATH}"
: "${WANT_HOST_REPORT:=no}"

if [[ ! -r "$HOST_ENV_PATH" ]]; then
  echo "ERROR: $HOST_ENV_PATH does not exist or is unreadable even as root." >&2
  echo "       The host bootstrap has not run, or the path is wrong." >&2
  exit 1
fi

echo "    read $HOST_ENV_PATH" >&2

echo "---FOOTBAG-ENV-B64---"
base64 -w0 < "$HOST_ENV_PATH"
echo

if [[ "$WANT_HOST_REPORT" == "yes" ]]; then
  # Both probes are best-effort: a host with no backup timer installed yet, or
  # with the stack down, is a state the report exists to show, not an error that
  # should abort the read the caller actually came for.
  echo "    collected host report" >&2
  echo "---FOOTBAG-REPORT-B64---"
  {
    systemctl is-active footbag-backup.timer 2>/dev/null || true
    echo '---'
    docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null || true
  } | base64 -w0
  echo
fi

echo "---FOOTBAG-END---"
