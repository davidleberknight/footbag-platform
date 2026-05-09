#!/usr/bin/env bash
# =============================================================================
# deploy-local-data.sh
#
# Orchestrator for local SQLite database preparation. Wraps
# legacy_data/run_pipeline.sh and scripts/reset-local-db.sh into a single
# entry point with explicit modes, safe defaults, and preflight checks.
#
# Does NOT push anything to AWS. Use scripts/deploy-rebuild.sh for that.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

usage() {
  cat <<'USAGE'
Usage: bash scripts/deploy-local-data.sh <mode> [--dry-run]

Modes (exactly one required):
  --soup-to-nuts  Full rebuild from the legacy mirror. Drops the DB file,
                  reapplies schema, regenerates canonical CSVs from the
                  mirror, and reloads with all enrichment phases (C, D, E,
                  F, G) plus phase NET and V. Wipes modern operator tables
                  (members, votes, ballots, news_items, audit_entries, ...).
                  Delegates to scripts/reset-local-db.sh + legacy_data/
                  run_pipeline.sh full.
                  Requires: legacy_data/mirror_footbag_org/ present.

  --from-csv      Rebuild the local DB from existing canonical CSVs. Drops
                  the DB file and reapplies schema (same modern-operator-
                  table wipe as --soup-to-nuts). Does not require mirror
                  access. Runs all enrichment phases. Delegates to
                  scripts/reset-local-db.sh + legacy_data/run_pipeline.sh
                  csv_only.
                  Requires: legacy_data/event_results/canonical_input/*.csv
                            and legacy_data/event_results/seed/mvfp_full/*.csv
                            present.

  --db-only       Fast platform DB rebuild from canonical CSVs plus mirror-
                  derived club extraction. Skips enrichment phases
                  C, D, E, F, G. Clubs and members are seeded directly from
                  the mirror. Delegates to scripts/reset-local-db.sh.
                  Requires: mirror present (for club extractors).
                  Use --from-csv if you need phase C/D/E/F/G populated.

  --help, -h      Show this message.

Options:
  --dry-run       Print what would be executed without running anything.

This script orchestrates LOCAL DB preparation only. For AWS staging deploy,
see scripts/deploy-rebuild.sh.
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

MODE=""
DRY_RUN="no"
for arg in "$@"; do
  case "$arg" in
    --soup-to-nuts|--from-csv|--db-only)
      if [[ -n "$MODE" ]]; then
        echo "ERROR: only one mode may be specified (got '$MODE' and '$arg')" >&2
        exit 1
      fi
      MODE="$arg"
      ;;
    --dry-run)
      DRY_RUN="yes"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$arg'" >&2
      echo "" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  echo "ERROR: no mode specified" >&2
  echo "" >&2
  usage >&2
  exit 1
fi

run_or_print() {
  if [[ "$DRY_RUN" == "yes" ]]; then
    echo "    DRY RUN: would run: $*"
    return 0
  fi
  "$@"
}

run_soup_to_nuts() {
  echo "==> deploy-local-data: --soup-to-nuts"
  local mirror_dir="${REPO_ROOT}/legacy_data/mirror_footbag_org"
  if [[ ! -d "$mirror_dir" ]]; then
    echo "ERROR: mirror not found at ${mirror_dir}" >&2
    echo "       The legacy mirror must be present for --soup-to-nuts." >&2
    echo "       Use --from-csv if you do not have the mirror." >&2
    exit 1
  fi
  echo "    Mirror present: $mirror_dir"
  # reset-local-db.sh first: drops the DB file, reapplies schema, runs the
  # loader set run_pipeline.sh does not (load_legacy_members_seed, trick
  # dictionary 17/19/20, freestyle media 21/22/23, seed_fh_curator). Then
  # run_pipeline.sh full regenerates canonical_input from the mirror,
  # reloads canonical/legacy tables, and runs phases C-G/H/V to refine
  # (script 09 DELETE+INSERTs legacy_person_club_affiliations from
  # clubs/out/, overriding reset-local-db.sh's seed-derived rows). Modern
  # operator tables (members, votes, ballots, news_items, audit_entries,
  # etc.) wiped by the schema reapply stay empty because run_pipeline.sh
  # never touches them.
  run_or_print bash "${SCRIPT_DIR}/reset-local-db.sh"
  ( cd "${REPO_ROOT}/legacy_data" && run_or_print ./run_pipeline.sh full )
}

run_from_csv() {
  echo "==> deploy-local-data: --from-csv"
  local missing=()
  local ci="${REPO_ROOT}/legacy_data/event_results/canonical_input"
  local seed="${REPO_ROOT}/legacy_data/event_results/seed/mvfp_full"

  for f in events event_disciplines event_results event_result_participants persons; do
    [[ -f "${ci}/${f}.csv" ]] || missing+=("legacy_data/event_results/canonical_input/${f}.csv")
  done
  for f in seed_events seed_event_disciplines seed_event_results seed_event_result_participants seed_persons; do
    [[ -f "${seed}/${f}.csv" ]] || missing+=("legacy_data/event_results/seed/mvfp_full/${f}.csv")
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: csv_only preflight failed. Missing:" >&2
    for m in "${missing[@]}"; do echo "  MISSING: $m" >&2; done
    echo "" >&2
    echo "These CSVs are produced by a prior --soup-to-nuts run or obtained" >&2
    echo "from a collaborator." >&2
    exit 1
  fi

  echo "    Canonical CSVs present"

  # Bootstrap out/canonical/ from the committed canonical_input/ snapshot.
  # csv_only mode skips run_v0_backbone() (the only producer of out/canonical/)
  # because that step requires mirror access. Phase D's
  # 02_build_legacy_club_candidates.py still reads out/canonical/events.csv,
  # so we materialize it here from canonical_input. The two snapshots differ
  # by ~30 events that export_canonical_platform.py drops for sparse
  # disciplines; this is acceptable for the deploy-time enrichment build, and
  # any subsequent run_pipeline.sh full run overwrites these files with the
  # mirror-derived authoritative copies.
  local out_canonical="${REPO_ROOT}/legacy_data/out/canonical"
  run_or_print mkdir -p "${out_canonical}"
  for f in events event_disciplines event_results event_result_participants persons; do
    run_or_print cp "${ci}/${f}.csv" "${out_canonical}/${f}.csv"
  done

  # Same ordering as run_soup_to_nuts: reset-local-db.sh first to wipe modern
  # operator tables and run the loaders run_pipeline.sh does not, then
  # csv_only re-runs canonical/enrichment phases. csv_only does not
  # regenerate canonical_input, so both passes load against the committed
  # snapshot.
  run_or_print bash "${SCRIPT_DIR}/reset-local-db.sh"
  ( cd "${REPO_ROOT}/legacy_data" && run_or_print ./run_pipeline.sh csv_only )
}

run_db_only() {
  echo "==> deploy-local-data: --db-only"
  echo ""
  echo "    WARNING: --db-only skips phase C/D/E/F/G enrichment."
  echo "    Use --from-csv if you need those tables populated."
  echo ""
  # reset-local-db.sh is mirror-free as of the deploy-script cleanup; it
  # reads committed seed CSVs (legacy_data/seed/clubs.csv,
  # legacy_data/seed/club_members.csv) instead of re-extracting from mirror.
  # It also runs seed_fh_curator.py internally, so seed_curator() is not
  # re-invoked here.
  run_or_print bash "${SCRIPT_DIR}/reset-local-db.sh"
}

case "$MODE" in
  --soup-to-nuts) run_soup_to_nuts ;;
  --from-csv)     run_from_csv ;;
  --db-only)      run_db_only ;;
esac
