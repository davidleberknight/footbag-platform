#!/usr/bin/env bash
# scripts/check-versions.sh -- proves this machine's tools match the pins, and
# that the pins agree with each other, before and after a patch.
#
# Why this exists: a pin moves only when the maintainer decides to patch, and a
# moved pin is only safe once everything that depends on it has been seen to
# work with it. This is the one command that says whether that holds, as a table
# of tool, pinned version, version found and verdict.
#
# What it checks:
#   - each workstation tool against ops/tool-versions.env, .nvmrc and
#     .python-version: sqlite3, jq, age, node, python, terraform, and the
#     docker engine;
#   - that the pins agree: SQLITE_VERSION with the engine better-sqlite3
#     bundles, and FFMPEG_VERSION with the image container's Dockerfile;
#   - then, unless --quick, builds the three images and asks each one from the
#     inside: Node in every image against .nvmrc, and the image container's
#     ffmpeg package against FFMPEG_VERSION, so the row is what production runs
#     rather than what a Dockerfile says;
#   - and, unless --quick, the tests where two pinned things meet: the backup
#     against the pinned sqlite3, the image pins, the argon2 settings, the list
#     reader, the pinned-tools installer and the sqlite3 build.
#
# With --advisories it also runs the pinned Trivy scan over the repository's
# dependency locks, over the Amazon Linux image at the hosts' pinned release
# (AMAZONLINUX_IMAGE, a stand-in for the hosts' operating-system packages), and
# over each image named with --image, on request only: nothing here runs on a
# schedule, and nothing here changes a pin.
#
# What it refuses to do: report success while any row reads MISMATCH, or while
# any of the tests fails.
#
# Usage:
#   bash scripts/check-versions.sh [--quick] [--advisories [--image <ref>]...]
#
# Test seams, each announced on stderr:
#   FOOTBAG_TOOL_VERSIONS          a stand-in version list (the reader's seam)
#   FOOTBAG_CHECK_VERSIONS_DOCKER  replaces docker for the image builds, the
#                                  in-image probe and the advisory scan
#   FOOTBAG_CHECK_VERSIONS_VITEST  replaces the test runner for the seam tests
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"

usage() { sed -n '/^# Usage:/,/^# Test seams/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }

QUICK=0 ADVISORIES=0
IMAGES=()
while (( $# )); do
  case "$1" in
    --quick) QUICK=1; shift ;;
    --advisories) ADVISORIES=1; shift ;;
    --image) [[ -n "${2:-}" ]] || { echo "ERROR: --image needs a reference." >&2; exit 2; }; IMAGES+=("$2"); shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done
(( ${#IMAGES[@]} == 0 || ADVISORIES )) || { echo "ERROR: --image is for --advisories." >&2; exit 2; }

DOCKER="${FOOTBAG_CHECK_VERSIONS_DOCKER:-docker}"
[[ -n "${FOOTBAG_CHECK_VERSIONS_DOCKER:-}" ]] && echo "SYNTHETIC: FOOTBAG_CHECK_VERSIONS_DOCKER is set; the images and the scan are stand-ins." >&2
VITEST="${FOOTBAG_CHECK_VERSIONS_VITEST:-npx vitest}"
[[ -n "${FOOTBAG_CHECK_VERSIONS_VITEST:-}" ]] && echo "SYNTHETIC: FOOTBAG_CHECK_VERSIONS_VITEST is set; the seam tests are a stand-in." >&2

mismatches=0
row() {
  local tool="$1" pinned="$2" found="$3" verdict=ok
  [[ -n "$pinned" && "$found" == "$pinned" ]] || { verdict=MISMATCH; mismatches=$((mismatches + 1)); }
  printf '%-22s %-26s %-26s %s\n' "$tool" "${pinned:-<unpinned>}" "${found:-<absent>}" "$verdict"
}
pin() { tool_pin "$1" 2>/dev/null && printf '%s' "$TOOL_PIN_VALUE" || true; }

printf '%-22s %-26s %-26s %s\n' TOOL PINNED FOUND VERDICT
row sqlite3   "$(pin SQLITE_VERSION)"    "$(sqlite3 --version 2>/dev/null | cut -d' ' -f1 || true)"
row jq        "$(pin JQ_VERSION)"        "$(jq --version 2>/dev/null | sed 's/^jq-//' || true)"
row age       "$(pin AGE_VERSION)"       "$(age --version 2>/dev/null | sed 's/^v//' || true)"
row node      "$(tr -d '[:space:]v' < .nvmrc)" "$(node -v 2>/dev/null | tr -d v || true)"
py_pin="$(tr -d '[:space:]' < .python-version)"
row python    "$py_pin"                  "$("python${py_pin%.*}" -c 'import platform; print(platform.python_version())' 2>/dev/null || true)"
row terraform "$(pin TERRAFORM_VERSION)" "$(terraform version 2>/dev/null | sed -n '1s/^Terraform v//p' || true)"
# The workstation's container engine, read from the running daemon so Docker
# Desktop and an apt install answer alike. The pin is the apt version string
# (epoch:version-revision); the engine reports only the version part. This is
# the workstation's own docker, never the build seam below.
row docker    "$(pin DOCKER_ENGINE_WORKSTATION | sed 's/^[0-9]*://; s/-.*//')" \
  "$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"

# The pins against each other. The engine's version is the number
# better-sqlite3's own download script names (3510200 is 3.51.2).
engine_code="$(sed -n 's/^VERSION="\([0-9]*\)"$/\1/p' node_modules/better-sqlite3/deps/download.sh 2>/dev/null || true)"
engine=""
if [[ "$engine_code" =~ ^([0-9])([0-9]{2})([0-9]{2})[0-9]{2}$ ]]; then
  engine="${BASH_REMATCH[1]}.$((10#${BASH_REMATCH[2]})).$((10#${BASH_REMATCH[3]}))"
fi
row "sqlite engine (app)" "$(pin SQLITE_VERSION)" "$engine"
row "ffmpeg (Dockerfile)" "$(pin FFMPEG_VERSION)" "$(grep -oE 'ffmpeg=[^ ]+' docker/image/Dockerfile 2>/dev/null | head -1 | cut -d= -f2 | sed 's/^\$.*//' || true)"

# Inside the built images. The Dockerfile row above says what was asked for;
# these say what the build actually holds, which is what a host runs.
if (( ! QUICK )); then
  echo "==> Building the images to ask them from the inside"
  if "$DOCKER" compose -f docker/docker-compose.yml build web worker image >&2; then
    node_pin="$(tr -d '[:space:]v' < .nvmrc)"
    for img in docker-web docker-worker docker-image; do
      row "node (${img})" "$node_pin" \
        "$("$DOCKER" run --rm --entrypoint node "$img" -v 2>/dev/null | tr -d 'v[:space:]' || true)"
    done
    row "ffmpeg (docker-image)" "$(pin FFMPEG_VERSION)" \
      "$("$DOCKER" run --rm --entrypoint sh docker-image -c 'apk info -v 2>/dev/null' 2>/dev/null \
         | sed -n 's/^ffmpeg-\([0-9][^ ]*\)$/\1/p' | head -1 || true)"
  else
    echo "MISMATCH: the images did not build, so nothing inside them could be read." >&2
    mismatches=$((mismatches + 1))
  fi
fi

status=0
if (( mismatches )); then
  echo "MISMATCH: ${mismatches} row(s) above differ from the pins." >&2
  status=1
fi

if (( ! QUICK )); then
  echo "==> The tests where pinned things meet"
  $VITEST run --reporter=dot \
    tests/integration/backupDb.script.test.ts \
    tests/unit/imageToolPins.test.ts \
    tests/unit/passwordHash.test.ts \
    tests/integration/toolVersions.script.test.ts \
    tests/integration/installPinnedTools.script.test.ts \
    tests/integration/buildSqlite3.script.test.ts || status=1
fi

if (( ADVISORIES )); then
  tool_pins_ok TRIVY_IMAGE || exit 1
  tool_pin TRIVY_IMAGE
  trivy="$TOOL_PIN_VALUE"
  echo "==> Advisories in the dependency locks (Trivy ${trivy})"
  "$DOCKER" run --rm -v "${REPO_ROOT}:/src:ro" "$trivy" fs --scanners vuln --exit-code 0 /src || status=1
  tool_pins_ok AMAZONLINUX_IMAGE || exit 1
  tool_pin AMAZONLINUX_IMAGE
  echo "==> Advisories in the hosts' pinned Amazon Linux release (${TOOL_PIN_VALUE})"
  "$DOCKER" run --rm "$trivy" image --exit-code 0 "$TOOL_PIN_VALUE" || status=1
  for ref in "${IMAGES[@]}"; do
    echo "==> Advisories in image ${ref}"
    "$DOCKER" run --rm -v /var/run/docker.sock:/var/run/docker.sock "$trivy" image --exit-code 0 "$ref" || status=1
  done
fi

exit "$status"
