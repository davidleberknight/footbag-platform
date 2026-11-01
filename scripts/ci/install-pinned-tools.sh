#!/usr/bin/env bash
# scripts/ci/install-pinned-tools.sh -- installs jq, age, sqlite3 and ffmpeg at
# the versions ops/tool-versions.env pins, for a continuous-integration job.
#
# Why this exists: the runner image carries its own jq, age, sqlite3 and ffmpeg at
# whatever versions its release ships, and those move on the image's schedule.
# A job that used them would prove a different version from the one the hosts
# and the workstations run. Each job calls this instead, so the push gate runs
# the pinned tools.
#
# What it refuses to do:
#   - Install a download whose SHA-256 does not match its pin.
#   - Leave its download directory behind.
#
# Usage:
#   bash scripts/ci/install-pinned-tools.sh --bin-dir <dir> <tool>...
#
# Tools: jq, age, sqlite3, ffmpeg. sqlite3 is built by scripts/build-sqlite3.sh
# and ffmpeg (with ffprobe) is production's, run through scripts/ffmpeg-pinned.sh;
# both need docker. The caller puts <dir> on PATH (in a workflow, through
# GITHUB_PATH).
#
# Test seam: FOOTBAG_INSTALL_PINNED_FETCH replaces curl, called as <cmd> <url>
# with the download on stdout; announced on stderr.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=../lib/tool-versions.sh
source "${REPO_ROOT}/scripts/lib/tool-versions.sh"

BIN_DIR=""
TOOLS=()
while (( $# )); do
  case "$1" in
    --bin-dir) BIN_DIR="${2:-}"; shift 2 ;;
    jq|age|sqlite3|ffmpeg) TOOLS+=("$1"); shift ;;
    *) echo "ERROR: unknown argument: $1 (tools: jq, age, sqlite3, ffmpeg)" >&2; exit 2 ;;
  esac
done
[[ -n "$BIN_DIR" && ${#TOOLS[@]} -gt 0 ]] || {
  echo "Usage: bash scripts/ci/install-pinned-tools.sh --bin-dir <dir> <tool>..." >&2
  exit 2
}

FETCH="${FOOTBAG_INSTALL_PINNED_FETCH:-curl -fsSL}"
[[ -n "${FOOTBAG_INSTALL_PINNED_FETCH:-}" ]] \
  && echo "SYNTHETIC: FOOTBAG_INSTALL_PINNED_FETCH is set -- this run proves nothing about this machine." >&2

WORK="$(mktemp -d "${TMPDIR:-/tmp}/footbag-pinned-tools.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$BIN_DIR"

# fetch_pinned <KEY_PREFIX> <out>: downloads <PREFIX>_URL and refuses it unless
# it matches <PREFIX>_SHA256.
fetch_pinned() {
  local prefix="$1" out="$2" url sha got
  tool_pins_ok "${prefix}_VERSION" "${prefix}_URL" "${prefix}_SHA256" || exit 1
  tool_pin "${prefix}_URL"; url="$TOOL_PIN_VALUE"
  tool_pin "${prefix}_SHA256"; sha="$TOOL_PIN_VALUE"
  $FETCH "$url" > "$out"
  got="$(sha256sum "$out" | cut -d' ' -f1)"
  if [[ "$got" != "$sha" ]]; then
    echo "ERROR: ${url} does not match ${prefix}_SHA256; nothing from it was installed." >&2
    exit 1
  fi
}

for tool in "${TOOLS[@]}"; do
  case "$tool" in
    jq)
      fetch_pinned JQ "${WORK}/jq"
      install -m 0755 "${WORK}/jq" "${BIN_DIR}/jq"
      ;;
    age)
      fetch_pinned AGE "${WORK}/age.tar.gz"
      tar -xzf "${WORK}/age.tar.gz" -C "$WORK" age/age age/age-keygen
      install -m 0755 "${WORK}/age/age" "${BIN_DIR}/age"
      install -m 0755 "${WORK}/age/age-keygen" "${BIN_DIR}/age-keygen"
      ;;
    sqlite3)
      bash "${REPO_ROOT}/scripts/build-sqlite3.sh" --install-dir "$BIN_DIR"
      ;;
    ffmpeg)
      # ffmpeg and ffprobe, production's version, through the pinned image.
      bash "${REPO_ROOT}/scripts/ffmpeg-pinned.sh" --install "$BIN_DIR"
      ;;
  esac
  echo "installed ${tool} into ${BIN_DIR}"
done
