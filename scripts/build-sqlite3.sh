#!/usr/bin/env bash
# scripts/build-sqlite3.sh -- builds the pinned sqlite3 command-line tool.
#
# Why this exists: the backup, the restore and the deploy call sqlite3 on the
# hosts, the tests call it on workstations and in CI, and every one of them has
# to be the same version as the engine better-sqlite3 bundles into the app. No
# operating system here ships that version, and sqlite.org's prebuilt Linux
# tools need a newer C library than Amazon Linux 2023 and Ubuntu 22.04 carry.
# So the tool is built once per machine from sqlite.org's amalgamation as one
# static binary, which runs on every one of them unchanged.
#
# What it does: downloads the amalgamation named in ops/tool-versions.env,
# refuses it unless the zip matches its pinned SHA3-256 and the sqlite3.c inside
# matches the digest sqlite.org publishes for the release, compiles it inside
# the image container's pinned base with the compiler held to its pinned
# version, checks the result reports the pinned version, and installs it.
#
# What it refuses to do:
#   - Install a binary from a download whose digests do not match.
#   - Install a binary that reports any version but the pinned one.
#   - Rebuild over a binary that already reports the pinned version; it says so
#     and stops, so a re-run does no harm.
#   - Leave its download or build directory behind, on success, failure or
#     interrupt.
#
# Usage:
#   bash scripts/build-sqlite3.sh --install-dir <dir>
#
# Flags:
#   --install-dir <dir>  where the binary goes, as <dir>/sqlite3 (required)
#   --output <file>      write the binary to <file> instead of installing it,
#                        for the host bootstrap, which ships it to the host
#
# Requires curl, unzip, openssl and a running docker.
#
# Test seams, each announced on stderr because a run that uses one proves
# nothing about this machine:
#   FOOTBAG_BUILD_SQLITE_FETCH   replaces curl: called as <cmd> <url>, writes
#                                the download to stdout
#   FOOTBAG_BUILD_SQLITE_DOCKER  replaces docker
#   FOOTBAG_TOOL_VERSIONS        a stand-in version list (the reader's own seam)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"

usage() { sed -n '/^# Usage:/,/^# Requires/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }

INSTALL_DIR=""
OUTPUT=""
while (( $# )); do
  case "$1" in
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done
if [[ -z "$INSTALL_DIR" && -z "$OUTPUT" ]] || [[ -n "$INSTALL_DIR" && -n "$OUTPUT" ]]; then
  echo "ERROR: give exactly one of --install-dir <dir> or --output <file>." >&2
  usage
  exit 2
fi

FETCH="${FOOTBAG_BUILD_SQLITE_FETCH:-curl -fsSL}"
DOCKER="${FOOTBAG_BUILD_SQLITE_DOCKER:-docker}"
for seam in FOOTBAG_BUILD_SQLITE_FETCH FOOTBAG_BUILD_SQLITE_DOCKER; do
  if [[ -n "${!seam:-}" ]]; then
    echo "SYNTHETIC: ${seam} is set -- this run proves nothing about this machine." >&2
  fi
done

KEYS=(SQLITE_VERSION SQLITE_SOURCE_URL SQLITE_SOURCE_SHA3_256 SQLITE_AMALGAMATION_SHA3_256
  SQLITE_BUILD_GCC SQLITE_BUILD_MUSL_DEV)
tool_pins_ok "${KEYS[@]}" || exit 1
declare -A PIN
for k in "${KEYS[@]}"; do tool_pin "$k"; PIN[$k]="$TOOL_PIN_VALUE"; done
VERSION="${PIN[SQLITE_VERSION]}"

# The build image is the image container's runtime base, read from its
# Dockerfile, so the compiler environment moves with the one base-image pin
# rather than carrying a copy of its digest here.
BASE_IMAGE="$(sed -n 's/^FROM \(node:[^ ]*@sha256:[0-9a-f]\{64\}\) AS runtime$/\1/p' "${REPO_ROOT}/docker/image/Dockerfile" | head -1)"
[[ -n "$BASE_IMAGE" ]] || { echo "ERROR: no digest-pinned runtime base found in docker/image/Dockerfile." >&2; exit 1; }

reports_pin() { [[ -x "$1" ]] && [[ "$("$1" --version 2>/dev/null | cut -d' ' -f1)" == "$VERSION" ]]; }

if [[ -n "$INSTALL_DIR" ]] && reports_pin "${INSTALL_DIR}/sqlite3"; then
  echo "sqlite3 ${VERSION} is already installed at ${INSTALL_DIR}/sqlite3; nothing rebuilt."
  exit 0
fi

for cmd in unzip openssl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: ${cmd} is required." >&2; exit 1; }
done
# A freshly started CI runner's daemon can be slow to answer its first call,
# so the wait is long enough not to call a slow start a stopped daemon, and
# still bounded so a missing one fails rather than hangs.
if [[ -z "${FOOTBAG_BUILD_SQLITE_DOCKER:-}" ]] && ! timeout 60 docker info >/dev/null 2>&1; then
  echo "ERROR: docker is not running; the build compiles inside the image container's pinned base." >&2
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/footbag-sqlite-build.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

sha3() { openssl dgst -sha3-256 "$1" | sed 's/^.*= //'; }

echo "==> Downloading sqlite ${VERSION} source"
$FETCH "${PIN[SQLITE_SOURCE_URL]}" > "${WORK}/src.zip"
got="$(sha3 "${WORK}/src.zip")"
if [[ "$got" != "${PIN[SQLITE_SOURCE_SHA3_256]}" ]]; then
  echo "ERROR: the download does not match SQLITE_SOURCE_SHA3_256; nothing built." >&2
  echo "       pinned:     ${PIN[SQLITE_SOURCE_SHA3_256]}" >&2
  echo "       downloaded: ${got}" >&2
  exit 1
fi
unzip -q "${WORK}/src.zip" -d "${WORK}/src"
SRC="$(find "${WORK}/src" -name sqlite3.c -print -quit)"
[[ -n "$SRC" ]] || { echo "ERROR: the download holds no sqlite3.c; nothing built." >&2; exit 1; }
SRC_DIR="$(dirname "$SRC")"
got="$(sha3 "$SRC")"
if [[ "$got" != "${PIN[SQLITE_AMALGAMATION_SHA3_256]}" ]]; then
  echo "ERROR: sqlite3.c does not match the digest sqlite.org publishes for ${VERSION}; nothing built." >&2
  echo "       published: ${PIN[SQLITE_AMALGAMATION_SHA3_256]}" >&2
  echo "       found:     ${got}" >&2
  exit 1
fi

echo "==> Building a static sqlite3 ${VERSION} in ${BASE_IMAGE%%@*}"
mkdir -p "${WORK}/out"
$DOCKER run --rm \
  -v "${SRC_DIR}:/src:ro" -v "${WORK}/out:/out" \
  "$BASE_IMAGE" sh -c "apk add --no-cache ${PIN[SQLITE_BUILD_GCC]} ${PIN[SQLITE_BUILD_MUSL_DEV]} >/dev/null \
    && gcc -O2 -static -DSQLITE_THREADSAFE=0 -DSQLITE_OMIT_LOAD_EXTENSION \
         -o /out/sqlite3 /src/shell.c /src/sqlite3.c -lm \
    && chown $(id -u):$(id -g) /out/sqlite3"

reports_pin "${WORK}/out/sqlite3" || {
  echo "ERROR: the built binary does not report sqlite3 ${VERSION}; nothing installed." >&2
  exit 1
}

if [[ -n "$OUTPUT" ]]; then
  install -m 0755 "${WORK}/out/sqlite3" "$OUTPUT"
  echo "sqlite3 ${VERSION} built and written to ${OUTPUT}"
else
  mkdir -p "$INSTALL_DIR"
  install -m 0755 "${WORK}/out/sqlite3" "${INSTALL_DIR}/sqlite3"
  reports_pin "${INSTALL_DIR}/sqlite3" || {
    echo "ERROR: ${INSTALL_DIR}/sqlite3 does not report ${VERSION} after the install." >&2
    exit 1
  }
  echo "sqlite3 ${VERSION} built and installed at ${INSTALL_DIR}/sqlite3"
fi
