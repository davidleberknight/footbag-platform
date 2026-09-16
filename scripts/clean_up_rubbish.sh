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
#   ./scripts/clean_up_rubbish.sh --stale-only     # spare temp artifacts a live run may own
#   ./scripts/clean_up_rubbish.sh --include-tfplan # also sweep terraform/*/*.tfplan
#   ./scripts/clean_up_rubbish.sh --help
#
# Default targets ($TMPDIR below is the temp directory the test tiers write to,
# which is /tmp unless the environment names another one):
#   1. $TMPDIR/footbag-test-*      vitest integration DB / WAL / SHM / allowlist files
#   2. $TMPDIR/footbag-e2e-*       Playwright e2e ephemeral DB / JWT / pointer file
#   3. project-root: test-*.db*    pre-rename legacy leaks (defensive)
#   4. project-root: test-initial-admins-*.txt   legacy register-test allowlist files
#   5. dist/                       TypeScript compile output (npm run build)
#   6. tests/coverage/             vitest v8 coverage reports
#   7. tests/test-results/ (+ stray repo-root test-results/)  Playwright run artifacts; also
#                                  sweeps a stray ./test-results/ left by a bare `playwright
#                                  test` run without `-c tests/playwright.config.ts`
#   8. .pytest_cache/              legacy Python tool cache
#   9. database/footbag-ci.db*     local db-load-smoke artifacts
#
# Opt-in targets:
#   --include-tfplan               terraform/staging/*.tfplan + terraform/production/*.tfplan
#
# Live-run safety: the two temp-directory targets are shared with every vitest
# and Playwright session on this machine, including one started from another
# terminal, another checkout or an agent. Deleting them while such a run is
# going destroys its databases mid-suite, and the damage does not report itself
# as a deletion: an already-open SQLite handle keeps working on the unlinked
# file, so only a suite that opens a fresh connection afterwards notices, and it
# reports a missing table. That reads as a schema fault in whichever suite
# happened to be between tests, with nothing pointing back here.
#
# --stale-only therefore spares anything modified within the last two hours,
# which is the threshold the vitest session sweep applies to the same paths for
# the same reason: an artifact young enough to belong to a live run is never a
# candidate. Whatever a run leaks is collected by a later sweep instead. The
# flag is what the automated sweep at the start of run_all_tests.sh uses, since
# that one runs whenever an operator starts a second run. The default stays the
# immediate sweep, for an operator who wants the directory empty now.
#
# Real-data guard: every target above is workstation-transient by
# construction. No target overlaps with real-data paths (legacy_data/
# legacy_mirror/mirror_footbag_org/, legacy_data/event_results/canonical_input/);
# those have their own refuse-on-real-data protections built into the
# fixture-staging scripts themselves. This script does NOT recurse
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
STALE_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --stale-only)
      STALE_ONLY=1
      shift
      ;;
    --include-tfplan)
      INCLUDE_TFPLAN=1
      shift
      ;;
    --help|-h)
      # Bounded by the first `set -eu` rather than a line number, so editing the
      # header cannot silently truncate the help text.
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
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

# The window in which an artifact is assumed to belong to a run that is still
# going. It has to exceed the longest plausible single run, because a run keeps
# the artifacts it created at the start, and a full suite here is tens of
# minutes. The same figure guards the vitest session sweep, and the two have to
# agree: they collect the same paths.
LIVE_RUN_AGE_MINUTES=120

# True when the path was modified recently enough that a live run could own it.
# find performs the comparison, so there is no stat output to parse and no
# portability question about its format. A path that has vanished or cannot be
# read answers no, and the sweep then handles it as it handles any other target
# that is not there.
#
# Directory mtime is the same signal the session sweep uses, and it carries the
# same limitation: a directory whose contents are being written does not
# necessarily change its own mtime. The window is wide enough that this does not
# decide anything for a run of ordinary length.
modified_within_live_window() {
  [[ -n "$(find "$1" -maxdepth 0 -mmin "-${LIVE_RUN_AGE_MINUTES}" 2>/dev/null)" ]]
}

# `--spare-live` marks a target that is shared with any other run on this
# machine rather than owned by this checkout; under --stale-only those targets
# keep whatever is young enough to still be in use. The repo-local targets carry
# no such marker: they are this checkout's own build output.
sweep() {
  local spare_live=0
  if [[ "${1:-}" == "--spare-live" ]]; then
    spare_live=1
    shift
  fi
  local label="$1"
  shift
  local count=0 bytes=0 kept=0 pattern p matches
  for pattern in "$@"; do
    shopt -s nullglob
    matches=( $pattern )
    shopt -u nullglob
    for p in "${matches[@]}"; do
      [[ -e "$p" ]] || continue
      if (( spare_live == 1 && STALE_ONLY == 1 )) && modified_within_live_window "$p"; then
        kept=$((kept + 1))
        continue
      fi
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
  if (( kept > 0 )); then
    printf "  %-46s %4d items  %10s  (%d spared, a live run may own them)\n" \
      "$label" "$count" "$(human_bytes "$bytes")" "$kept"
  else
    printf "  %-46s %4d items  %10s\n" "$label" "$count" "$(human_bytes "$bytes")"
  fi
}

# -----------------------------------------------------------------------------
# Run.
# -----------------------------------------------------------------------------
MODE_LABEL=$([[ $DRY_RUN == 1 ]] && echo "DRY RUN (no deletes)" || echo "APPLY (deleting)")
echo "=== clean_up_rubbish.sh — $MODE_LABEL ==="
echo "Project root: $(pwd)"
# The temp directory the test tiers write into, which is what os.tmpdir() and
# mktemp resolve to. Reading it from the environment rather than spelling /tmp
# is what keeps this sweep and those tiers pointed at the same directory on a
# machine that names another one.
TMP_ROOT="${TMPDIR:-/tmp}"
TMP_ROOT="${TMP_ROOT%/}"
echo "Temp directory: ${TMP_ROOT}"
if (( STALE_ONLY == 1 )); then
  echo "Sparing temp artifacts modified in the last ${LIVE_RUN_AGE_MINUTES} minutes (--stale-only)."
fi
echo ""
echo "Default targets:"
sweep --spare-live "${TMP_ROOT}/footbag-test-*"  "${TMP_ROOT}/footbag-test-*"
sweep --spare-live "${TMP_ROOT}/footbag-e2e-*"   "${TMP_ROOT}/footbag-e2e-*"
sweep "project-root test-*.db*"            "test-*.db" "test-*.db-wal" "test-*.db-shm"
sweep "project-root test-initial-admins-*" "test-initial-admins-*.txt"
sweep "dist/"                              "dist"
sweep "tests/coverage/"                    "tests/coverage"
sweep "tests/test-results/"                "tests/test-results" "test-results"
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
