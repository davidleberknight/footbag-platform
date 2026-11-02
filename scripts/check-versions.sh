#!/usr/bin/env bash
# scripts/check-versions.sh -- proves this machine's tools match the pins, and
# that the pins agree with each other, before and after a patch.
#
# Why this exists: a pin moves only when the maintainer decides to patch, and a
# moved pin is only safe once everything that depends on it has been seen to
# work with it. This is the one command that says whether that holds, as a table
# of tool, pinned version, version found and verdict, ending in one closing
# report that lists every row that differs and every step that failed.
#
# What it checks:
#   - each workstation tool against ops/tool-versions.env, .nvmrc and
#     .python-version: sqlite3, jq, age, node, python, terraform, the docker
#     engine and the Compose plugin;
#   - that the pins agree: SQLITE_VERSION with the engine better-sqlite3
#     bundles, FFMPEG_VERSION with the image container's Dockerfile, and
#     AMAZON_LINUX_RELEASE with the release AMAZONLINUX_IMAGE's tag names;
#   - then, unless --quick, asks the pinned Amazon Linux image which docker
#     package the pinned release serves, against DOCKER_ENGINE_HOST, so the host
#     engine pin is what a host stepped to that release would install;
#   - and, unless --quick, builds the three images and asks each one from the
#     inside: Node in every image against .nvmrc, and the image container's
#     ffmpeg package against FFMPEG_VERSION, so the row is what production runs
#     rather than what a Dockerfile says;
#   - and, unless --quick, the tests where two pinned things meet: the backup
#     against the pinned sqlite3, the image pins, the argon2 settings, the list
#     reader, the pinned-tools installer and the sqlite3 build.
#
# Which pinned versions carry a published flaw is a different question, with its
# own report: scripts/check-vulnerabilities.sh.
#
# What it refuses to do: report success while any row reads MISMATCH, or while
# any step or test failed. A failure part way through is recorded and the run
# carries on, so every row is still checked and the closing report lists them
# all.
#
# Usage:
#   bash scripts/check-versions.sh [--quick]
#
# Test seams, each announced on stderr:
#   FOOTBAG_TOOL_VERSIONS          a stand-in version list (the reader's seam)
#   FOOTBAG_CHECK_VERSIONS_DOCKER  replaces docker for the image builds, the
#                                  in-image probes and the release's package
#                                  query
#   FOOTBAG_CHECK_VERSIONS_VITEST  replaces the test runner for the seam tests
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"
# shellcheck source=lib/compose-build.sh
source "${SCRIPT_DIR}/lib/compose-build.sh"

usage() { sed -n '/^# Usage:/,/^# Test seams/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }

QUICK=0
while (( $# )); do
  case "$1" in
    --quick) QUICK=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) cr_error "unknown argument: $1"; usage; exit 2 ;;
  esac
done

DOCKER="${FOOTBAG_CHECK_VERSIONS_DOCKER:-docker}"
if [[ -n "${FOOTBAG_CHECK_VERSIONS_DOCKER:-}" ]]; then
  echo "SYNTHETIC: FOOTBAG_CHECK_VERSIONS_DOCKER is set; the images are stand-ins." >&2
  cr_unproved "what the real images and the real release hold: FOOTBAG_CHECK_VERSIONS_DOCKER stood in for docker"
fi
VITEST="${FOOTBAG_CHECK_VERSIONS_VITEST:-npx vitest}"
if [[ -n "${FOOTBAG_CHECK_VERSIONS_VITEST:-}" ]]; then
  echo "SYNTHETIC: FOOTBAG_CHECK_VERSIONS_VITEST is set; the seam tests are a stand-in." >&2
  cr_unproved "the tests where pinned things meet: FOOTBAG_CHECK_VERSIONS_VITEST stood in for the runner"
fi

WORK="$(mktemp -d)"
cr_cleanup rm -rf "$WORK"

rows=0 bad_rows=0
row() {
  local tool="$1" pinned="$2" found="$3" verdict=ok
  rows=$((rows + 1))
  [[ -n "$pinned" && "$found" == "$pinned" ]] || verdict=MISMATCH
  printf '%-22s %-26s %-26s %s\n' "$tool" "${pinned:-<unpinned>}" "${found:-<absent>}" "$verdict"
  if [[ "$verdict" == MISMATCH ]]; then
    bad_rows=$((bad_rows + 1))
    cr_error "${tool}: pinned ${pinned:-<unpinned>}, found ${found:-<absent>}"
  fi
}
# The reader says on stderr why a key is missing; the row then reads <unpinned>
# and is recorded as a mismatch.
pin() { if tool_pin "$1"; then printf '%s' "$TOOL_PIN_VALUE"; fi; }

# probe <label> <cmd...>: runs a command whose stdout is the answer, setting
# PROBE_OUT. Not run in a subshell, so a failure is recorded in the report: a
# non-zero exit is an error carrying the tool's last line, and its stderr is
# read for the problems it printed.
PROBE_OUT=""
probe() {
  local label="$1" rc=0
  shift
  "$@" > "${WORK}/probe.out" 2> "${WORK}/probe.err" || rc=$?
  PROBE_OUT="$(cat "${WORK}/probe.out")"
  cr_harvest "$label" "${WORK}/probe.err"
  if (( rc )); then
    cr_error "${label}: exit ${rc}: $(tail -n 1 "${WORK}/probe.err")"
  fi
  return 0
}

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
# The Compose plugin, read from the workstation's own docker. The pin carries a
# leading v and the plugin's short form does not, so both sides drop it.
row compose   "$(pin COMPOSE_VERSION | sed 's/^v//')" \
  "$(docker compose version --short 2>/dev/null | sed 's/^v//' || true)"

# The pins against each other. The engine's version is the number
# better-sqlite3's own download script names (3510200 is 3.51.2).
engine_code="$(sed -n 's/^VERSION="\([0-9]*\)"$/\1/p' node_modules/better-sqlite3/deps/download.sh 2>/dev/null || true)"
engine=""
if [[ "$engine_code" =~ ^([0-9])([0-9]{2})([0-9]{2})[0-9]{2}$ ]]; then
  engine="${BASH_REMATCH[1]}.$((10#${BASH_REMATCH[2]})).$((10#${BASH_REMATCH[3]}))"
fi
row "sqlite engine (app)" "$(pin SQLITE_VERSION)" "$engine"
row "ffmpeg (Dockerfile)" "$(pin FFMPEG_VERSION)" "$(grep -oE 'ffmpeg=[^ ]+' docker/image/Dockerfile 2>/dev/null | head -1 | cut -d= -f2 | sed 's/^\$.*//' || true)"
# The image the release query and the vulnerability report read must be the hosts'
# release: its tag is the release followed by one more component (the image
# build, ".0"): release 2023.9.20250101 is the tag 2023.9.20250101.0.
al_release="$(pin AMAZON_LINUX_RELEASE)"
al_image="$(pin AMAZONLINUX_IMAGE)"
al_tag=""
if [[ "$al_image" == *:* ]]; then
  al_tag="${al_image#*:}"
  al_tag="${al_tag%%@*}"
fi
row "amazon linux (image)" "$al_release" "${al_tag%.*}"

if (( QUICK )); then
  cr_unproved "the docker package the pinned release serves, what the built images hold, and the tests where pinned things meet (--quick)"
else
  # What the pinned release serves. The distribution locks a host to the
  # release it was built from, so the newest docker package at that release is
  # what a host installs; asked inside the pinned image so no host is touched.
  if [[ -n "$al_image" && -n "$al_release" ]]; then
    echo "==> Asking Amazon Linux ${al_release} which docker package it serves"
    probe "docker package (release ${al_release})" "$DOCKER" run --rm "$al_image" \
      dnf repoquery --quiet "--releasever=${al_release}" --latest-limit=1 --qf '%{version}-%{release}' docker
    row "docker (host release)" "$(pin DOCKER_ENGINE_HOST)" "$(printf '%s\n' "$PROBE_OUT" | sed '/^[[:space:]]*$/d' | tail -n 1)"
  else
    cr_error "docker (host release): AMAZON_LINUX_RELEASE and AMAZONLINUX_IMAGE are both needed to ask the release; not asked"
  fi

  # Inside the built images. The Dockerfile row above says what was asked for;
  # these say what the build actually holds, which is what a host runs.
  echo "==> Building the images to ask them from the inside"
  if cr_run "image build" -- compose_build_images "$DOCKER" web worker image >&2; then
    node_pin="$(tr -d '[:space:]v' < .nvmrc)"
    for img in docker-web docker-worker docker-image; do
      probe "node (${img})" "$DOCKER" run --rm --entrypoint node "$img" -v
      row "node (${img})" "$node_pin" "$(printf '%s' "$PROBE_OUT" | tr -d 'v[:space:]')"
    done
    probe "ffmpeg (docker-image)" "$DOCKER" run --rm --entrypoint sh docker-image -c 'apk info -v'
    row "ffmpeg (docker-image)" "$(pin FFMPEG_VERSION)" \
      "$(printf '%s\n' "$PROBE_OUT" | sed -n 's/^ffmpeg-\([0-9][^ ]*\)$/\1/p' | head -1)"
  else
    cr_unproved "what the built images hold: the images did not build"
  fi

  echo "==> The tests where pinned things meet"
  # shellcheck disable=SC2086 # VITEST is a command and its arguments.
  cr_run "the tests where pinned things meet" -- $VITEST run --reporter=dot \
    tests/integration/backupDb.script.test.ts \
    tests/unit/imageToolPins.test.ts \
    tests/unit/passwordHash.test.ts \
    tests/integration/toolVersions.script.test.ts \
    tests/integration/installPinnedTools.script.test.ts \
    tests/integration/buildSqlite3.script.test.ts \
    || cr_unproved "the tests where pinned things meet: they failed"
fi

if (( bad_rows )); then
  cr_unproved "that this machine and the pins agree: ${bad_rows} of ${rows} row(s) differ"
else
  cr_proved "every one of the ${rows} row(s) above matches its pin"
fi
cr_finish
