# shellcheck shell=bash
#
# scripts/lib/fetch-pinned.sh -- downloads one pinned artifact from
# ops/tool-versions.env and keeps it only if it matches the digest pinned beside
# it.
#
# Sourced, never run, after scripts/lib/tool-versions.sh, by every script that
# fetches a pinned standalone tool: the CI installer and the vulnerability
# report. One copy, so the check that a download is the pinned file cannot be
# weaker in one of them.
#
# A digest nobody compared is not a check: an artifact whose SHA-256 differs from
# its pin is deleted before the function returns, so a caller that ignores the
# status still has nothing unverified to use.
#
# The download command is FETCH_PINNED_CMD, a command and its arguments split on
# blanks, called with the URL appended and the download on stdout; it defaults
# to curl. A caller with its own test seam sets it after sourcing.

FETCH_PINNED_CMD="${FETCH_PINNED_CMD:-curl -fsSL}"

# Why the last fetch_pinned failed: pin (the list holds no usable URL or digest),
# download (the fetch itself failed) or checksum (the bytes are not the pinned
# file). Empty after a success.
FETCH_PINNED_FAILURE=""

# fetch_pinned <KEY_PREFIX> <out>
# Downloads <PREFIX>_URL into <out> and keeps it only if it matches
# <PREFIX>_SHA256. Returns 1, saying why on stderr and in FETCH_PINNED_FAILURE,
# otherwise.
fetch_pinned() {
  local prefix="$1" out="$2" url sha got
  FETCH_PINNED_FAILURE=""
  if ! tool_pins_ok "${prefix}_VERSION" "${prefix}_URL" "${prefix}_SHA256"; then
    FETCH_PINNED_FAILURE=pin
    return 1
  fi
  tool_pin "${prefix}_URL"; url="$TOOL_PIN_VALUE"
  tool_pin "${prefix}_SHA256"; sha="$TOOL_PIN_VALUE"
  # shellcheck disable=SC2086 # FETCH_PINNED_CMD is a command and its arguments.
  if ! $FETCH_PINNED_CMD "$url" > "$out"; then
    rm -f "$out"
    echo "ERROR: could not download ${url} (${prefix}_URL)." >&2
    FETCH_PINNED_FAILURE=download
    return 1
  fi
  got="$(sha256sum "$out" | cut -d' ' -f1)"
  if [[ "$got" != "$sha" ]]; then
    rm -f "$out"
    echo "ERROR: ${url} does not match ${prefix}_SHA256; the download was discarded." >&2
    FETCH_PINNED_FAILURE=checksum
    return 1
  fi
  return 0
}
