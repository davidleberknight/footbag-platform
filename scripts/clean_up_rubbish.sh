#!/usr/bin/env bash
# scripts/clean_up_rubbish.sh
#
# Operator-runnable workstation cleanup. Targets ONLY files known to be
# transient test/build artifacts via explicit allowlist patterns. No broad
# recursive deletes; no operator-supplied paths; no environment-variable
# bypasses. Refuses to run anywhere except the footbag-platform project
# root (identified by package.json + the canonical scripts/ + tests/
# subdirs + the project name string), so it cannot clobber a sibling
# project's tests/ or dist/ by accident.
#
# Usage:
#   ./scripts/clean_up_rubbish.sh                  # delete safe targets + summary
#   ./scripts/clean_up_rubbish.sh --dry-run        # preview only, no deletes
#   ./scripts/clean_up_rubbish.sh --include-tfplan # also sweep terraform/*/*.tfplan
#   ./scripts/clean_up_rubbish.sh --help
#
# Default targets:
#   1. /tmp/footbag-test-*         vitest integration DB / WAL / SHM / allowlist files
#   2. /tmp/footbag-e2e-*          Playwright e2e ephemeral DB / JWT / pointer file
#   3. project-root: test-*.db*    pre-rename legacy leaks (defensive)
#   4. project-root: test-initial-admins-*.txt   legacy register-test allowlist files
#   5. dist/                       TypeScript compile output (npm run build)
#   6. tests/coverage/             vitest v8 coverage reports
#   7. tests/test-results/         Playwright trace / screenshot / video on failure
#   8. .pytest_cache/              legacy Python tool cache
#   9. database/footbag-ci.db*     local db-load-smoke artifacts
#
# Opt-in targets:
#   --include-tfplan               terraform/staging/*.tfplan + terraform/production/*.tfplan
#
# Real-data guard: every target above is workstation-transient by
# construction. No target overlaps with real-data paths (legacy_data/
# mirror_footbag_org/, legacy_data/event_results/canonical_input/,
# data/media/) — those have their own protections in fixture-staging
# scripts per .claude/rules/testing.md. This script does NOT recurse
# into legacy_data/, data/, curated/, or any other content-bearing
# subtree.

# `awk 'NR==1'` over `head -1` would be safer with set -o pipefail but no
# such pipelines exist in this script; pipefail is on for defense.
set -euo pipefail

# -----------------------------------------------------------------------------
# Project-root identity check. Refuse to delete anywhere else.
# -----------------------------------------------------------------------------
if [[ ! -f package.json || ! -d scripts || ! -d tests || ! -d src ]]; then
  echo "ERROR: must run from the footbag-platform project root (missing package.json + scripts/ + tests/ + src/)." >&2
  exit 2
fi
if ! grep -q '"name": "footbag-platform"' package.json 2>/dev/null; then
  echo "ERROR: package.json does not identify as footbag-platform; refusing to delete." >&2
  exit 2
fi

# -----------------------------------------------------------------------------
# Args.
# -----------------------------------------------------------------------------
DRY_RUN=0
INCLUDE_TFPLAN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --include-tfplan)
      INCLUDE_TFPLAN=1
      shift
      ;;
    --help|-h)
      sed -n '2,33p' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1' (see --help)" >&2
      exit 2
      ;;
  esac
done

# -----------------------------------------------------------------------------
# Sweep helper. Iterates one or more glob patterns; reports count + bytes.
# Uses bash nullglob so non-matching patterns expand to nothing (no literal
# pattern text reaching rm). du -sb is GNU-coreutils; fallback if not present.
# -----------------------------------------------------------------------------
TOTAL_ITEMS=0
TOTAL_BYTES=0

human_bytes() {
  local n="$1"
  if command -v numfmt >/dev/null 2>&1; then
    numfmt --to=iec --suffix=B "$n"
  else
    echo "${n}B"
  fi
}

sweep() {
  local label="$1"
  shift
  local count=0 bytes=0 pattern p matches
  for pattern in "$@"; do
    shopt -s nullglob
    matches=( $pattern )
    shopt -u nullglob
    for p in "${matches[@]}"; do
      [[ -e "$p" ]] || continue
      local sz
      if command -v du >/dev/null 2>&1; then
        sz="$(du -sb -- "$p" 2>/dev/null | awk '{print $1}')"
      else
        sz=0
      fi
      bytes=$((bytes + ${sz:-0}))
      count=$((count + 1))
      if (( DRY_RUN == 0 )); then
        rm -rf -- "$p"
      fi
    done
  done
  TOTAL_ITEMS=$((TOTAL_ITEMS + count))
  TOTAL_BYTES=$((TOTAL_BYTES + bytes))
  printf "  %-46s %4d items  %10s\n" "$label" "$count" "$(human_bytes "$bytes")"
}

# -----------------------------------------------------------------------------
# Run.
# -----------------------------------------------------------------------------
MODE_LABEL=$([[ $DRY_RUN == 1 ]] && echo "DRY RUN (no deletes)" || echo "APPLY (deleting)")
echo "=== clean_up_rubbish.sh — $MODE_LABEL ==="
echo "Project root: $(pwd)"
echo ""
echo "Default targets:"
sweep "/tmp/footbag-test-*"                "/tmp/footbag-test-*"
sweep "/tmp/footbag-e2e-*"                 "/tmp/footbag-e2e-*"
sweep "project-root test-*.db*"            "test-*.db" "test-*.db-wal" "test-*.db-shm"
sweep "project-root test-initial-admins-*" "test-initial-admins-*.txt"
sweep "dist/"                              "dist"
sweep "tests/coverage/"                    "tests/coverage"
sweep "tests/test-results/"                "tests/test-results"
sweep ".pytest_cache/"                     ".pytest_cache"
sweep "database/footbag-ci.db*"            "database/footbag-ci.db" "database/footbag-ci.db-wal" "database/footbag-ci.db-shm"

if (( INCLUDE_TFPLAN == 1 )); then
  echo ""
  echo "Opt-in targets (--include-tfplan):"
  sweep "terraform/staging/*.tfplan"       "terraform/staging/*.tfplan"
  sweep "terraform/production/*.tfplan"    "terraform/production/*.tfplan"
fi

echo ""
SUFFIX=$([[ $DRY_RUN == 1 ]] && echo " [DRY RUN, nothing removed]" || echo "")
printf "Total: %d items, %s%s\n" "$TOTAL_ITEMS" "$(human_bytes "$TOTAL_BYTES")" "$SUFFIX"
