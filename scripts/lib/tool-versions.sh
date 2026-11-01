# shellcheck shell=bash
#
# Reads the one tool-version list, ops/tool-versions.env, for every script that
# installs or checks a pinned tool: the workstation setup, the host bootstrap
# and the CloudWatch agent installers. Sourced, never run, and never sent to a
# host: the values a host needs travel over the install pipe as assignments like
# any other value the remote body needs.
#
# The list is parsed with grep rather than sourced, so a line in it can never
# run as code on an operator workstation.
#
# A pin is refused, by name, while it still holds the placeholder a new entry
# ships with or a digest that is not one. A checksum nobody has read is not a
# check, and an installer that went ahead without one would install whatever the
# publisher's address happened to serve that day.

TOOL_VERSIONS_DEFAULT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/ops/tool-versions.env"

# Test seam (CI only; operators never set this): FOOTBAG_TOOL_VERSIONS names a
# stand-in list, so the refusal and the pinned path are both reachable without
# editing the committed file. Announced on every run, because a run against a
# stand-in list installs nothing the estate pins.
TOOL_VERSIONS="${FOOTBAG_TOOL_VERSIONS:-$TOOL_VERSIONS_DEFAULT}"
if [[ -n "${FOOTBAG_TOOL_VERSIONS:-}" ]]; then
  echo "NOTE: reading a stand-in tool-version list (FOOTBAG_TOOL_VERSIONS); its pins are not the estate's." >&2
fi

TOOL_PIN_VALUE=""

# tool_pin <KEY>
# Sets TOOL_PIN_VALUE to the list's value for KEY. Returns 1, saying why, when
# the list is unreadable or carries no such key.
tool_pin() {
  local key="$1" line
  TOOL_PIN_VALUE=""
  if [[ ! -r "$TOOL_VERSIONS" ]]; then
    echo "ERROR: cannot read the tool-version list at ${TOOL_VERSIONS}." >&2
    return 1
  fi
  line="$(grep -E "^${key}=" "$TOOL_VERSIONS" | tail -1 || true)"
  if [[ -z "$line" ]]; then
    echo "ERROR: the tool-version list names no ${key}." >&2
    return 1
  fi
  TOOL_PIN_VALUE="${line#*=}"
  return 0
}

# tool_pins_ok <KEY>...
# Every key must be present and hold a real value; a *_SHA256 or *_SHA3_256 key
# must also hold 64 hexadecimal characters. Reports every failing key in one
# pass, so an operator filling the list does not discover them one run at a
# time.
tool_pins_ok() {
  local key bad=0
  for key in "$@"; do
    if ! tool_pin "$key"; then
      bad=1
      continue
    fi
    if [[ -z "$TOOL_PIN_VALUE" || "$TOOL_PIN_VALUE" == *REPLACE_WITH_* ]]; then
      echo "ERROR: ${key} in ${TOOL_VERSIONS} is still a placeholder." >&2
      bad=1
      continue
    fi
    if [[ "$key" == *_SHA256 || "$key" == *_SHA3_256 ]] && [[ ! "$TOOL_PIN_VALUE" =~ ^[0-9a-f]{64}$ ]]; then
      echo "ERROR: ${key} in ${TOOL_VERSIONS} is not a digest (64 lowercase hex characters)." >&2
      bad=1
    fi
  done
  if (( bad )); then
    echo "       Nothing was installed. The list's header gives the command that" >&2
    echo "       downloads each artifact and prints the digest to write there." >&2
    return 1
  fi
  return 0
}
