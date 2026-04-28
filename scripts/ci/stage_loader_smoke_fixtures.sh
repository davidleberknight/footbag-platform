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

set -euo pipefail

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
elif [[ "${CI:-}" == "true" || "${GITHUB_ACTIONS:-}" == "true" ]]; then
  FORCE=1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_BASE="${ROOT}/legacy_data/tests/fixtures"
DEST_CANONICAL="${ROOT}/legacy_data/event_results/canonical_input"
DEST_MIRROR="${ROOT}/legacy_data/mirror_footbag_org"
DEST_OUT="${ROOT}/legacy_data/out"
DEST_SEED_DIR="${ROOT}/legacy_data/seed"

_check_target() {
  local path="$1"
  local label="$2"
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

# Force the mirror extractors (extract_clubs.py, extract_club_members.py) to
# regenerate from the staged mirror fixture rather than no-op against the
# committed seed/{clubs,club_members}.csv. Their idempotency check is
# `output mtime > script mtime`; on a fresh CI checkout both have equal
# mtimes, so the extractors run and would produce non-deterministic output
# depending on which file got the marginally newer mtime. Removing the
# outputs makes the extractor path unconditional.
for _f in "${DEST_SEED_DIR}/clubs.csv" "${DEST_SEED_DIR}/club_members.csv"; do
  if [[ -f "${_f}" ]]; then
    if [[ "${FORCE}" -ne 1 ]]; then
      echo "ERROR: ${_f} exists and is committed. Refusing to remove without --force." >&2
      echo "Pass --force or set CI=true to force-regenerate from the mirror fixture." >&2
      exit 1
    fi
    rm -f "${_f}"
  fi
done

echo "Fixtures staged."
echo "  canonical_input: $(ls -1 "${DEST_CANONICAL}" | wc -l) files"
echo "  mirror:          $(find "${DEST_MIRROR}" -type f | wc -l) files"
echo "  out:             $(ls -1 "${DEST_OUT}" | wc -l) files"
