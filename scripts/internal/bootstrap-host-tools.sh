# shellcheck shell=bash
#
# Reads the pinned host-tools manifest, ops/host-tools.env, for the workstation
# side of every script that installs one of those tools onto a host. Sourced,
# never run, and never sent to a host: the values it reads travel over the
# install pipe as assignments like any other value the remote body needs.
#
# The manifest is parsed with grep rather than sourced, so a line in it can
# never run as code on an operator workstation.
#
# A pin is refused, by name, while it still holds the placeholder the manifest
# ships with or a digest that is not one. A checksum nobody has read is not a
# check, and an installer that went ahead without one would install whatever
# the publisher's address happened to serve that day.

HOST_TOOLS_MANIFEST_DEFAULT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/ops/host-tools.env"

# Test seam (CI only; operators never set this): FOOTBAG_HOST_TOOLS_MANIFEST
# names a stand-in manifest, so the refusal and the pinned path are both
# reachable without editing the committed file. Announced on every run, because
# a run against a stand-in manifest installs nothing the estate pins.
HOST_TOOLS_MANIFEST="${FOOTBAG_HOST_TOOLS_MANIFEST:-$HOST_TOOLS_MANIFEST_DEFAULT}"
if [[ -n "${FOOTBAG_HOST_TOOLS_MANIFEST:-}" ]]; then
  echo "NOTE: reading a stand-in host-tools manifest (FOOTBAG_HOST_TOOLS_MANIFEST); its pins are not the estate's." >&2
fi

HOST_TOOL_VALUE=""

# host_tool <KEY>
# Sets HOST_TOOL_VALUE to the manifest's value for KEY. Returns 1, saying why,
# when the manifest is unreadable or carries no such key.
host_tool() {
  local key="$1" line
  HOST_TOOL_VALUE=""
  if [[ ! -r "$HOST_TOOLS_MANIFEST" ]]; then
    echo "ERROR: cannot read the host-tools manifest at ${HOST_TOOLS_MANIFEST}." >&2
    return 1
  fi
  line="$(grep -E "^${key}=" "$HOST_TOOLS_MANIFEST" | tail -1 || true)"
  if [[ -z "$line" ]]; then
    echo "ERROR: the host-tools manifest names no ${key}." >&2
    return 1
  fi
  HOST_TOOL_VALUE="${line#*=}"
  return 0
}

# host_tool_pinned <KEY>...
# Every key must be present and hold a real value; a *_SHA256 key must also hold
# 64 hexadecimal characters. Reports every failing key in one pass, so an
# operator filling the manifest does not discover them one run at a time.
host_tool_pinned() {
  local key bad=0
  for key in "$@"; do
    if ! host_tool "$key"; then
      bad=1
      continue
    fi
    if [[ -z "$HOST_TOOL_VALUE" || "$HOST_TOOL_VALUE" == *REPLACE_WITH_* ]]; then
      echo "ERROR: ${key} in ${HOST_TOOLS_MANIFEST} is still a placeholder." >&2
      bad=1
      continue
    fi
    if [[ "$key" == *_SHA256 && ! "$HOST_TOOL_VALUE" =~ ^[0-9a-f]{64}$ ]]; then
      echo "ERROR: ${key} in ${HOST_TOOLS_MANIFEST} is not a SHA-256 digest (64 lowercase hex characters)." >&2
      bad=1
    fi
  done
  if (( bad )); then
    echo "       Nothing was installed. The manifest's header gives the command that" >&2
    echo "       downloads each artifact and prints the digest to write there." >&2
    return 1
  fi
  return 0
}
