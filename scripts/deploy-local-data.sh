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

  --db-only       Fast platform DB rebuild, equivalent to running
                  scripts/reset-local-db.sh directly. Mirror-free: loads the
                  committed seed CSVs and the staged/committed canonical_input,
                  then freestyle, net, clubs, curator, and tag_stats. Skips the
                  run_pipeline.sh mirror regeneration and the phase C/D/E/F/G
                  enrichment. Delegates to scripts/reset-local-db.sh.
                  Use --from-csv if you need phase C/D/E/F/G populated.

  --all-data      The --from-csv build (no mirror) PLUS the legacy member-data
                  intake: extract the footbag.org dump into the git-ignored
                  intermediate CSV and validate/preview it. The member LOAD is
                  deferred (the identity reconciliation in
                  legacy_data/member_data_scripts/reconcile_legacy_members.py is
                  not implemented yet), so the member data is not applied; a
                  notice says so and the run still succeeds.
                  Requires: the gitignored membership roster
                            (legacy_data/membership/inputs/membership_input_normalized.csv)
                            AND either the footbag.org dump or a prior
                            intermediate CSV.

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
    --soup-to-nuts|--from-csv|--db-only|--all-data)
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
  # Three phases so loader 08's canonical reseed runs on an empty slate: an
  # in-place reseed over a populated DB aborts on net_* foreign keys (and the
  # foreign-owned freestyle_records / auto_link_staged_candidates that no
  # pipeline rebuilds).
  #   1. reset-local-db.sh --slate: drop the DB file, reapply schema, seed
  #      legacy_members (the one FK prerequisite loader 08 needs).
  #   2. run_pipeline.sh full: regenerate canonical_input from the mirror and
  #      load canonical + net + clubs + enrichment (phases C-G/H/V) onto the
  #      slate; loader 08 deletes nothing because the slate is empty.
  #   3. reset-local-db.sh --post-canonical: layer the freestyle pipeline, the
  #      full clubs seed, curator content, and tag_stats, idempotently
  #      re-running the loaders run_pipeline.sh already did (every post loader
  #      is DELETE+INSERT or INSERT OR IGNORE). Modern operator tables
  #      (members, votes, ballots, news_items, audit_entries, ...) wiped by the
  #      schema reapply stay empty; nothing here repopulates them.
  run_or_print bash "${SCRIPT_DIR}/reset-local-db.sh" --slate
  ( cd "${REPO_ROOT}/legacy_data" && run_or_print ./run_pipeline.sh full )
  run_or_print bash "${SCRIPT_DIR}/reset-local-db.sh" --post-canonical
}

run_from_csv() {
  echo "==> deploy-local-data: --from-csv"
  local missing=()
  local ci="${REPO_ROOT}/legacy_data/event_results/canonical_input"

  # Only canonical_input is required here. The mvfp_full seed CSVs are built
  # from it at load time (run_pipeline.sh run_db_load_canonical, via script 07),
  # so they are neither required as inputs nor committed.
  for f in events event_disciplines event_results event_result_participants persons; do
    [[ -f "${ci}/${f}.csv" ]] || missing+=("legacy_data/event_results/canonical_input/${f}.csv")
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

  # Same three-phase order as run_soup_to_nuts so loader 08 reseeds an empty
  # slate. csv_only does not regenerate canonical_input (both passes load the
  # committed snapshot), and it does not run phase NET, so the --post-canonical
  # pass rebuilds the net tables (12/13/14) along with freestyle, the full
  # clubs seed, curator content, and tag_stats.
  run_or_print bash "${SCRIPT_DIR}/reset-local-db.sh" --slate
  ( cd "${REPO_ROOT}/legacy_data" && run_or_print ./run_pipeline.sh csv_only )
  run_or_print bash "${SCRIPT_DIR}/reset-local-db.sh" --post-canonical
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

run_all_data() {
  echo "==> deploy-local-data: --all-data"

  # Preflight A: the gitignored IFPA membership roster (real member data,
  # operator handoff) that the enrichment build requires.
  local roster="${REPO_ROOT}/legacy_data/membership/inputs/membership_input_normalized.csv"
  if [[ ! -f "$roster" ]]; then
    echo "ERROR: membership roster not found at ${roster}" >&2
    echo "       This is the gitignored IFPA membership roster (real member data);" >&2
    echo "       obtain it from the maintainer. --from-csv / --db-only build without it." >&2
    exit 1
  fi

  # Preflight B: a legacy member-data source -- either the footbag.org dump (to
  # extract) or a prior intermediate CSV (to validate/preview).
  local py="${REPO_ROOT}/legacy_data/footbag_venv/bin/python"
  [[ -x "$py" ]] || py="python3"
  local dump_root
  dump_root="$("$py" -c 'import sys; sys.path.insert(0, "legacy_data/member_data_scripts"); from _dump_parser import resolve_dump_root; r = resolve_dump_root(); print(r or "")' 2>/dev/null || true)"
  local intermediate="${REPO_ROOT}/legacy_data/member_data_scripts/out/legacy_members_final.csv"
  if [[ -z "$dump_root" && ! -f "$intermediate" ]]; then
    echo "ERROR: no legacy member-data source." >&2
    echo "       Need either the footbag.org dump (repo-root symlink or FOOTBAG_LEGACY_DUMP_ROOT)" >&2
    echo "       or a prior intermediate CSV at ${intermediate}." >&2
    exit 1
  fi

  # The enrichment build, identical to --from-csv (no mirror). This builds the
  # database (historical_persons included) that the member extract reads.
  run_from_csv

  # The legacy member intake. Extraction needs the dump. This build only previews
  # the load (--load --dry-run): it produces / validates the intermediate CSV but
  # does NOT apply the member data. A full --load runs the identity reconciliation
  # (Stage A duplicate-account review, Stage B historical-person link proposals,
  # the QC gate, and the honors backfill over those proposals); applying the
  # result is a separate, human-approved step that is not wired yet.
  local runner="${REPO_ROOT}/legacy_data/member_data_scripts/run_legacy_members.sh"
  if [[ -n "$dump_root" ]]; then
    echo "==> member intake: extract dump -> intermediate CSV"
    run_or_print bash "$runner" --extract
  else
    echo "==> member intake: no dump; using the existing intermediate CSV"
  fi
  echo "==> member intake: validate + preview (no write)"
  run_or_print bash "$runner" --load --dry-run

  echo ""
  echo "NOTE: member data was NOT loaded. This build only previews the intake"
  echo "      (validate + dry-run). A full --load runs the identity reconciliation"
  echo "      and QC gate; applying the member data is a separate, human-approved"
  echo "      step that is not wired yet. --all-data has built the enrichment DB"
  echo "      and the intermediate CSV."
}

case "$MODE" in
  --soup-to-nuts) run_soup_to_nuts ;;
  --from-csv)     run_from_csv ;;
  --db-only)      run_db_only ;;
  --all-data)     run_all_data ;;
esac
