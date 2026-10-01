#!/usr/bin/env bash
# Root-side body that reports which environment a deployed host says it is.
# Never run directly: it expects the assignment its caller emits ahead of this
# body on the same stdin stream, and it runs as root because the caller pipes it
# into sudo.
#
# Invoked via require_host_is in scripts/lib/host-env-remote.sh:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'HOST_ENV_PATH=%q\n' "$path";
#     cat scripts/internal/host-identity-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# The answer is two lines of the host's env file and nothing else: FOOTBAG_ENV,
# which environment the host says it is, and PUBLIC_BASE_URL, the address it
# says it serves. The file holds the host's whole secret set, so this body
# reads the two non-secret values a caller needs rather than shipping the file
# down to be searched on the workstation. A missing line is reported as an
# empty value, not as an error here: what an absent value means is the
# caller's rule, stated where it is used.
#
# Required shell variables (emitted by the caller ahead of this body):
#   HOST_ENV_PATH   absolute path of the env file to read

set -euo pipefail

: "${HOST_ENV_PATH:?remote half requires HOST_ENV_PATH}"

if [[ ! -r "$HOST_ENV_PATH" ]]; then
  echo "ERROR: $HOST_ENV_PATH does not exist or is unreadable even as root." >&2
  echo "       The host bootstrap has not run, or the path is wrong." >&2
  exit 1
fi

read_value() { awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/,""); print}' "$HOST_ENV_PATH" | tail -1; }

echo "---FOOTBAG-HOST-ENV---"
printf '%s\n' "$(read_value FOOTBAG_ENV)"
echo "---FOOTBAG-HOST-URL---"
printf '%s\n' "$(read_value PUBLIC_BASE_URL)"
echo "---FOOTBAG-END---"
