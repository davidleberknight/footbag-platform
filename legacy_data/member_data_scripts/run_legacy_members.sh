#!/usr/bin/env bash
# run_legacy_members.sh — extract the legacy footbag.org member data into a
# git-ignored intermediate CSV, and validate/preview loading it into the DB.
#
# The legacy database dump lives only on maintainer machines, reached read-only
# through the git-ignored repo-root `footbag.org` symlink or the
# FOOTBAG_LEGACY_DUMP_ROOT override, so extraction is maintainer-only. Extraction
# writes a PII-bearing intermediate CSV under the git-ignored out/ directory,
# which is the shareable artifact: a developer without the dump loads a copy
# handed to them out of band via --from-csv.
#
# The apply (writing the member data into the database) is NOT wired yet: the
# source dump is dirty (many people hold several accounts; emails are shared
# across accounts), so a real load must first run the identity reconciliation and
# a pre-apply QC gate. Those now run inside --load: it builds the Stage A
# duplicate-account review, the Stage B historical-person link proposals, and
# runs the QC gate over them. On a gate pass --load stops cleanly WITHOUT writing
# — applying the reviewed proposals and the member rows is a separate,
# human-approved step that is deliberately not wired. On a gate failure it aborts.
#
# This script does NOT modify the underlying per-step scripts
# (extract_legacy_members.py, load_legacy_export.py, validate_*.py, ...): they
# continue to work exactly as before when run directly.
#
# Stages (composable):
#   --extract          dump -> out/legacy_members_final.csv. Needs the dump and a
#                      built database carrying historical_persons.
#   --load             validate + preview, run Stage A / Stage B / the QC gate,
#                      then stop before applying (apply is not wired yet).
#   --from-csv PATH    use PATH as the intermediate CSV (implies --load; for an
#                      out-of-band copy, no dump needed).
#
# Modifiers:
#   --dry-run          validate + preview and stop cleanly (no write attempted).
#   --strict-honors    honor validation becomes a hard gate (final production load).
#   --db PATH          target database (default: $FOOTBAG_DB_PATH or database/footbag.db).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${HERE}/../.." && pwd)"
cd "${REPO_ROOT}"

PY="${HERE}/../footbag_venv/bin/python"
[[ -x "${PY}" ]] || PY="python3"

MDS="legacy_data/member_data_scripts"
OUT_DIR="${MDS}/out"
DEFAULT_CSV="${OUT_DIR}/legacy_members_final.csv"

usage() {
  cat >&2 <<'USAGE'
Usage: run_legacy_members.sh [--extract] [--load | --from-csv PATH] [--dry-run] [--strict-honors] [--db PATH]

  --extract          Extract the legacy dump into the git-ignored intermediate CSV (maintainer-only; needs the dump + a built DB).
  --load             Validate + preview, run reconciliation (Stage A, Stage B, QC gate), then stop before applying (apply not wired yet).
  --from-csv PATH    Use an out-of-band CSV copy (implies --load; no dump needed).
  --dry-run          Validate + preview and stop cleanly (no write attempted).
  --strict-honors    Make honor validation a hard gate (final production load).
  --db PATH          Target database (default: $FOOTBAG_DB_PATH or database/footbag.db).
USAGE
}

DO_EXTRACT=0
DO_LOAD=0
DRY_RUN=0
STRICT_HONORS=0
CSV=""
DB="${FOOTBAG_DB_PATH:-database/footbag.db}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extract)       DO_EXTRACT=1; shift ;;
    --load)          DO_LOAD=1; shift ;;
    --from-csv)      DO_LOAD=1; CSV="${2:-}"; shift 2 ;;
    --dry-run)       DRY_RUN=1; shift ;;
    --strict-honors) STRICT_HONORS=1; shift ;;
    --db)            DB="${2:-}"; shift 2 ;;
    -h|--help)       usage; exit 0 ;;
    *) echo "run_legacy_members: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "${DO_EXTRACT}" -eq 0 && "${DO_LOAD}" -eq 0 ]]; then
  echo "run_legacy_members: choose --extract and/or --load (or --from-csv PATH)." >&2
  usage
  exit 2
fi

[[ -n "${CSV}" ]] || CSV="${DEFAULT_CSV}"

db_has_historical_persons() {
  sqlite3 -readonly "${DB}" "SELECT 1 FROM historical_persons LIMIT 1;" >/dev/null 2>&1
}

if [[ "${DO_EXTRACT}" -eq 1 ]]; then
  ROOT="$("${PY}" -c 'import sys; sys.path.insert(0, "legacy_data/member_data_scripts"); from _dump_parser import resolve_dump_root; r = resolve_dump_root(); print(r or "")')"
  if [[ -z "${ROOT}" ]]; then
    echo "run_legacy_members --extract: no legacy dump present (set FOOTBAG_LEGACY_DUMP_ROOT or create the repo-root footbag.org symlink)." >&2
    echo "  The dump lives only on maintainer machines; a developer without it loads a shared CSV via --from-csv instead." >&2
    exit 1
  fi
  MEMBERS_SQL="${ROOT}/members/backups/latest.sql"
  ADMINS_SQL="${ROOT}/members/admin/backups/latest.sql"
  if [[ ! -f "${MEMBERS_SQL}" ]]; then
    echo "run_legacy_members --extract: the members dump is missing:" >&2
    echo "  MISSING: ${MEMBERS_SQL}" >&2
    echo "  The per-app backup SQL files are supplied by the webmaster's private footbag.org repository." >&2
    exit 1
  fi
  if ! db_has_historical_persons; then
    echo "run_legacy_members --extract: the is_hof/is_bap backfill needs a built database with historical_persons at ${DB}." >&2
    echo "  Run scripts/reset-local-db.sh first, then re-run --extract." >&2
    exit 1
  fi

  mkdir -p "${OUT_DIR}"
  MEMBERS_CSV="${OUT_DIR}/legacy_members_extract.csv"
  WITH_ADMINS_CSV="${OUT_DIR}/legacy_members_with_admins.csv"

  echo "==> extract: members from the dump"
  "${PY}" "${MDS}/extract_legacy_members.py" --members-sql "${MEMBERS_SQL}" --out "${MEMBERS_CSV}"

  echo "==> extract: fill legacy_is_admin"
  if [[ -f "${ADMINS_SQL}" ]]; then
    "${PY}" "${MDS}/extract_legacy_admins.py" --members-csv "${MEMBERS_CSV}" --admins-sql "${ADMINS_SQL}" --out "${WITH_ADMINS_CSV}"
  else
    echo "  admins dump absent (${ADMINS_SQL}); carrying forward with legacy_is_admin unset." >&2
    cp "${MEMBERS_CSV}" "${WITH_ADMINS_CSV}"
  fi

  echo "==> extract: backfill is_hof / is_bap through the person layer"
  "${PY}" "${MDS}/extract_legacy_honors.py" --members-csv "${WITH_ADMINS_CSV}" --db "${DB}" --out "${DEFAULT_CSV}"
  echo "    wrote ${DEFAULT_CSV}"
fi

if [[ "${DO_LOAD}" -eq 1 ]]; then
  if [[ ! -f "${CSV}" ]]; then
    echo "run_legacy_members --load: intermediate CSV absent (${CSV}); nothing to load." >&2
    echo "  Produce it with --extract (needs the dump), or point at an out-of-band copy with --from-csv PATH." >&2
    exit 0
  fi
  if ! db_has_historical_persons; then
    echo "run_legacy_members --load: needs a built database with historical_persons at ${DB}. Run scripts/reset-local-db.sh first." >&2
    exit 1
  fi

  echo "==> validate export (hard gate)"
  "${PY}" "${MDS}/validate_legacy_export.py" --csv "${CSV}" --db "${DB}"

  echo "==> validate honors (advisory)"
  if "${PY}" "${MDS}/validate_legacy_honors.py" --members-csv "${CSV}" --db "${DB}"; then
    :
  elif [[ "${STRICT_HONORS}" -eq 1 ]]; then
    echo "run_legacy_members --load: honor validation failed and --strict-honors is set; aborting." >&2
    exit 1
  else
    echo "WARNING: honor validation reported issues; continuing (advisory until the honor worklist resolves). Use --strict-honors for the final production load." >&2
  fi

  echo "==> load: dry-run preview (writes nothing)"
  "${PY}" "${MDS}/load_legacy_export.py" --export "${CSV}" --db "${DB}"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "run_legacy_members: dry-run complete (validated and previewed; no write)."
    exit 0
  fi

  # Pre-apply identity reconciliation. The dump is dirty (people hold several
  # accounts; emails are shared), so build the review and proposal artifacts and
  # run the QC gate over them before any write. Stage A groups duplicate accounts
  # for review; Stage B proposes historical-person links and sets the ambiguous
  # ones aside; the QC gate fails if the proposals would duplicate a link or
  # auto-apply a set-aside candidate. All three read only and write git-ignored
  # artifacts under out/; none writes to the database.
  echo "==> reconcile: Stage A duplicate-account review"
  "${PY}" "${MDS}/reconcile_legacy_members.py" --stage-a --csv "${CSV}"

  echo "==> reconcile: Stage B historical-person link proposals"
  "${PY}" "${MDS}/reconcile_legacy_members.py" --stage-b --csv "${CSV}" --db "${DB}"

  echo "==> reconcile: QC gate"
  if ! "${PY}" "${MDS}/reconcile_legacy_members.py" --qc-gate; then
    cat >&2 <<'BLOCKED'

run_legacy_members --load: REFUSING TO APPLY.

  The pre-apply QC gate failed: the Stage B proposed links would duplicate a
  historical-person link or auto-apply a candidate set aside for review. Nothing
  was written.

  Review the git-ignored artifacts under legacy_data/member_data_scripts/out/
  (the Stage A duplicate-account review, the Stage B proposed links, and the
  Stage B link review), resolve the flagged rows, and re-run --load.
BLOCKED
    exit 1
  fi

  # Apply is intentionally NOT wired. A passing gate means the proposed links are
  # reviewed and non-duplicating, but writing them and the member rows into the
  # database is a separate, human-approved step. Nothing is written here.
  echo ""
  echo "run_legacy_members --load: reconciliation complete and the QC gate passed."
  echo "  Artifacts for review are under ${OUT_DIR}/ (Stage A review, Stage B"
  echo "  proposed links, Stage B link review). Apply is not wired yet, so no"
  echo "  member rows or historical-person links were written."
  exit 0
fi

echo "run_legacy_members: done."
