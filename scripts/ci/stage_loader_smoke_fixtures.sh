#!/usr/bin/env bash
# stage_loader_smoke_fixtures.sh
# Stages tiny synthetic fixtures into the paths reset-local-db.sh reads from.
#
# Source: legacy_data/tests/fixtures/{canonical_input,mirror,out}/
# Targets:
#   legacy_data/event_results/canonical_input/
#   legacy_data/mirror_footbag_org/
#   legacy_data/out/
#
# Targets are gitignored on a fresh clone; CI runs find them empty and the
# script proceeds. Locally, refuses to clobber existing data unless --force or
# CI=true is set in the environment.
#
# REAL-DATA GUARD (defense-in-depth):
#   The script ALSO refuses to clobber a target that looks like real
#   (non-fixture) data, EVEN with --force or CI=true. The only escape is
#   the explicit --clobber-real-data flag, which exists so a developer
#   who is consciously rebuilding their local dev tree from scratch can
#   override. Triggers:
#     - mirror_footbag_org/ has www.footbag.org/events/show/ with >100 entries
#     - event_results/canonical_input/events.csv has >50 rows
#     - out/canonical/events.csv has >50 rows
#   These thresholds are well above any CI fixture (the fixture ships
#   <10 events) and well below the real mirror crawl (hundreds to
#   thousands). Without this guard a stray --force or a devcontainer
#   defaulting CI=true wipes hours-to-days of mirror-crawl + pipeline
#   work; the 2026-05-09 incident lost a 60 GB mirror this way.

set -euo pipefail

FORCE=0
CLOBBER_REAL=0
for arg in "$@"; do
  case "$arg" in
    --force)              FORCE=1 ;;
    --clobber-real-data)  CLOBBER_REAL=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done
if [[ "${CI:-}" == "true" || "${GITHUB_ACTIONS:-}" == "true" ]]; then
  FORCE=1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_BASE="${ROOT}/legacy_data/tests/fixtures"
DEST_CANONICAL="${ROOT}/legacy_data/event_results/canonical_input"
DEST_MIRROR="${ROOT}/legacy_data/mirror_footbag_org"
DEST_OUT="${ROOT}/legacy_data/out"

# Detect whether the target dir holds REAL (non-fixture) data the operator
# would not want clobbered. Returns 0 (true) if real-data signals present.
_target_holds_real_data() {
  local label="$1"
  case "$label" in
    mirror_footbag_org)
      local events_dir="${DEST_MIRROR}/www.footbag.org/events/show"
      if [[ -d "${events_dir}" ]]; then
        local n
        n=$(find "${events_dir}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
        (( n > 100 ))
        return $?
      fi
      return 1
      ;;
    canonical_input)
      local events_csv="${DEST_CANONICAL}/events.csv"
      if [[ -f "${events_csv}" ]]; then
        local n
        n=$(($(wc -l < "${events_csv}") - 1))  # subtract header
        (( n > 50 ))
        return $?
      fi
      return 1
      ;;
    out)
      local events_csv="${DEST_OUT}/canonical/events.csv"
      if [[ -f "${events_csv}" ]]; then
        local n
        n=$(($(wc -l < "${events_csv}") - 1))
        (( n > 50 ))
        return $?
      fi
      return 1
      ;;
  esac
  return 1
}

_check_target() {
  local path="$1"
  local label="$2"
  # Real-data guard runs FIRST and is independent of --force / CI=true.
  if _target_holds_real_data "${label}" && [[ "${CLOBBER_REAL}" -ne 1 ]]; then
    echo "ERROR: ${label} (${path}) appears to hold real (non-fixture) data." >&2
    echo "       Refusing to overwrite with the synthetic CI fixture, even" >&2
    echo "       with --force or CI=true. This guard prevents accidental loss" >&2
    echo "       of hours-to-days of mirror-crawl / pipeline work (see" >&2
    echo "       2026-05-09 incident: 60 GB mirror lost to a stray --force)." >&2
    echo "" >&2
    echo "       To proceed anyway, pass: --force --clobber-real-data" >&2
    exit 1
  fi
  if [[ -L "${path}" ]]; then
    if [[ "${FORCE}" -ne 1 ]]; then
      echo "ERROR: ${label} (${path}) is a symlink. Refusing to clobber." >&2
      echo "Pass --force or set CI=true to remove the symlink and stage fixtures." >&2
      exit 1
    fi
    rm -f "${path}"
  elif [[ -d "${path}" ]] && [[ -n "$(ls -A "${path}" 2>/dev/null || true)" ]]; then
    if [[ "${FORCE}" -ne 1 ]]; then
      echo "ERROR: ${label} (${path}) is non-empty. Refusing to clobber." >&2
      echo "Pass --force or set CI=true to wipe and re-stage." >&2
      exit 1
    fi
    rm -rf "${path}"
  fi
}

_check_target "${DEST_CANONICAL}" "canonical_input"
_check_target "${DEST_MIRROR}" "mirror_footbag_org"
_check_target "${DEST_OUT}" "out"

echo "  → Staging canonical_input fixture..."
mkdir -p "${DEST_CANONICAL}"
cp "${SRC_BASE}/canonical_input/"*.csv "${DEST_CANONICAL}/"

echo "  → Staging mirror fixture..."
mkdir -p "${DEST_MIRROR}"
cp -r "${SRC_BASE}/mirror/"* "${DEST_MIRROR}/"

echo "  → Staging out/ fixture stubs..."
mkdir -p "${DEST_OUT}"
cp "${SRC_BASE}/out/"* "${DEST_OUT}/"

echo "Fixtures staged."
echo "  canonical_input: $(ls -1 "${DEST_CANONICAL}" | wc -l) files"
echo "  mirror:          $(find "${DEST_MIRROR}" -type f | wc -l) files"
echo "  out:             $(ls -1 "${DEST_OUT}" | wc -l) files"
