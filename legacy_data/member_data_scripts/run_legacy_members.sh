#!/usr/bin/env bash
# run_legacy_members.sh — extract the legacy footbag.org member data into a
# git-ignored intermediate CSV, and validate/preview loading it into the DB.
#
# The legacy database dump lives only on maintainer machines, reached read-only
# through the git-ignored repo-root `footbag.org` symlink or the
# FOOTBAG_LEGACY_REPO override, so extraction is maintainer-only. Extraction
# writes a PII-bearing intermediate CSV under the git-ignored out/ directory,
# which is the shareable artifact: a developer without the dump loads a copy
# handed to them out of band via --from-csv.
#
# Writing the member data into the database is guarded behind an explicit --apply
# flag. The source dump is dirty (many people hold several accounts; emails are
# shared across accounts), so --load first runs the identity reconciliation (the
# Stage A duplicate-account review, the Stage B historical-person link proposals)
# and a pre-apply QC gate, then re-runs the honors backfill over the proposals.
# Without --apply, --load stops read-only after a passing gate. With --apply, it
# snapshots legacy_members for rollback, loads the reconciled members, and applies
# the proposed links -- each write refuses production/staging and is individually
# reversible. A gate failure aborts before any write.
#
# This script does NOT modify the underlying per-step scripts
# (extract_legacy_members.py, load_legacy_export.py, validate_*.py, ...): they
# continue to work exactly as before when run directly.
#
# Stages (composable):
#   --extract          dump -> out/legacy_members_final.csv. Needs the dump and a
#                      built database carrying historical_persons.
#   --load             validate + preview, run Stage A / Stage B / the QC gate /
#                      the honors re-run, then stop before applying (read-only).
#   --from-csv PATH    use PATH as the intermediate CSV (implies --load; for an
#                      out-of-band copy, no dump needed).
#
# Modifiers:
#   --apply            with --load, perform the real writes after the gate passes:
#                      load the reconciled member rows, then apply the proposed
#                      historical-person links. Refused against production /
#                      staging / /srv/footbag by the underlying writers. Without
#                      it, --load writes nothing.
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
PROPOSED_LINKS_CSV="${OUT_DIR}/stage_b_proposed_links.csv"
RECONCILED_CSV="${OUT_DIR}/legacy_members_reconciled.csv"
MERGED_CSV="${OUT_DIR}/legacy_members_merged.csv"
MERGE_MAP_CSV="${OUT_DIR}/stage_a_merged_accounts.csv"

usage() {
  cat >&2 <<'USAGE'
Usage: run_legacy_members.sh [--extract] [--load | --from-csv PATH] [--apply] [--dry-run] [--strict-honors] [--db PATH]

  --extract          Extract the legacy dump into the git-ignored intermediate CSV (maintainer-only; needs the dump + a built DB).
  --load             Validate + preview, run reconciliation (Stage A, Stage B, QC gate, honors re-run), then stop before applying (read-only).
  --from-csv PATH    Use an out-of-band CSV copy (implies --load; no dump needed).
  --apply            With --load, perform the real writes after the gate passes (reconciled members, then proposed links). Refused on production/staging.
  --dry-run          Validate + preview and stop cleanly (no write attempted).
  --strict-honors    Make honor validation a hard gate.
  --db PATH          Target database (default: $FOOTBAG_DB_PATH or database/footbag.db).

There is ONE load path. What it does is decided by its inputs, not by a mode
flag, and every run prints which of them it had:

  FOOTBAG_MEMBER_ADJUDICATIONS_DIR   Directory holding stage_a_adjudication.csv and
                                     entitlement_dispositions.csv, the recorded human
                                     rulings about which accounts are the same person.
                                     Present: they are applied and duplicate accounts
                                     collapse through the merge map. Absent: they are
                                     not, and the run says so.
  FOOTBAG_BOARD_ROSTER               CSV of the directors sitting at cutover, one row per
                                     director with the legacy member id and the paid tier
                                     underneath the seat. Present: those rows carry the
                                     board flag. Absent: no row does, and the run says so.
  FOOTBAG_CUTOVER_DATE               Optional. The moment annual memberships are measured
                                     against, defaulting to today, which is the honest
                                     answer for a load happening today. Pin it only to
                                     reproduce a particular moment.
  DEPLOY_TARGET=footbag-production   Marks this as a production load: the rulings and the
                                     roster become mandatory and the run refuses without
                                     them. Nothing else changes, and how old a dump is
                                     worth loading stays the operator's call -- an extract
                                     run prints the dump's date and age so a stale one is
                                     visible. A load reading an intermediate CSV has no
                                     dump in front of it and prints no age.

A developer or CI machine has neither the rulings nor the roster and loads
anyway; that is the supported case. A production database can only be built the
complete way, and the only thing a human supplies is where those two files live
-- both in the private checkout, so in practice they are present or they are not.
USAGE
}

DO_EXTRACT=0
DO_LOAD=0
DO_APPLY=0
DRY_RUN=0
STRICT_HONORS=0
CSV=""
DB="${FOOTBAG_DB_PATH:-database/footbag.db}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extract)       DO_EXTRACT=1; shift ;;
    --load)          DO_LOAD=1; shift ;;
    --from-csv)      DO_LOAD=1; CSV="${2:-}"; shift 2 ;;
    --apply)         DO_APPLY=1; shift ;;
    --dry-run)       DRY_RUN=1; shift ;;
    --strict-honors) STRICT_HONORS=1; shift ;;
    # The mode flag this replaced is refused rather than ignored: a script or a
    # note that still passes it must be corrected, not silently downgraded to a
    # development load.
    --final-export)
      echo "run_legacy_members: --final-export no longer exists. The load has one path and reads its" >&2
      echo "  inputs instead: set FOOTBAG_MEMBER_ADJUDICATIONS_DIR and FOOTBAG_CUTOVER_DATE, and set" >&2
      echo "  DEPLOY_TARGET=footbag-production to make both mandatory. Run --help for the detail." >&2
      exit 2 ;;
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

# ── What this run is, decided from its inputs rather than from a mode flag ────
#
# There is one path. It does the most correct thing the machine can support and
# says which that was, because the alternative -- an opt-in flag on a load that
# looks identical either way -- is how a development-shaped database reaches
# production unnoticed.
#
# Two inputs decide it. The recorded account rulings, which live outside this
# repository because they hold real account identities, and the cutover date,
# which is what the annual-membership derivation compares expiry dates against.
# A machine without the rulings (a fresh clone, CI, a developer) still loads;
# it just says so. A production build without them refuses.
ADJ_DIR="${FOOTBAG_MEMBER_ADJUDICATIONS_DIR:-}"
ADJ_STAGE_A="${ADJ_DIR}/stage_a_adjudication.csv"
ADJ_ENTITLEMENTS="${ADJ_DIR}/entitlement_dispositions.csv"
ADJUDICATIONS_READY=0
if [[ -n "${ADJ_DIR}" && -s "${ADJ_STAGE_A}" && -s "${ADJ_ENTITLEMENTS}" ]]; then
  ADJUDICATIONS_READY=1
fi
# The directors sitting at cutover. Nothing in the dump records who they are, so
# the roster is supplied the same way the rulings are, and it is resolved and
# reported here rather than left to the extractor's own environment lookup: an
# input that only takes effect when a variable happens to be exported is an input
# nobody can see was missing.
BOARD_ROSTER="${FOOTBAG_BOARD_ROSTER:-}"
BOARD_ROSTER_READY=0
if [[ -n "${BOARD_ROSTER}" && -s "${BOARD_ROSTER}" ]]; then
  BOARD_ROSTER_READY=1
fi
# The moment annual memberships are measured against. It defaults to now, which
# is the honest answer for a load happening now, so the derivation can never
# silently flag nobody for want of a date somebody forgot to set. Pin it only to
# reproduce a particular moment.
CUTOVER_DATE="${FOOTBAG_CUTOVER_DATE:-$(date -u +%F)}"
PRODUCTION_LOAD=0
if [[ "${DEPLOY_TARGET:-}" == "footbag-production" ]]; then
  PRODUCTION_LOAD=1
fi

if [[ "${PRODUCTION_LOAD}" -eq 1 && "${ADJUDICATIONS_READY}" -eq 0 ]]; then
  cat >&2 <<'NOPROD'

run_legacy_members: REFUSING a production load. The recorded account rulings are missing.

  Set FOOTBAG_MEMBER_ADJUDICATIONS_DIR to the directory in the private checkout
  holding a non-empty stage_a_adjudication.csv and entitlement_dispositions.csv.

  Without them, accounts a human ruled to be different people are fused, and one
  of the two becomes unclaimable by the person it belongs to. That failure raises
  no error of its own and the resulting database looks perfectly normal, which is
  why this refuses here instead. Nothing was written.
NOPROD
  exit 1
fi

# Only at extraction: the flag is written into the intermediate CSV there, so a
# production --from-csv run reads a roster decision that was already made.
if [[ "${PRODUCTION_LOAD}" -eq 1 && "${DO_EXTRACT}" -eq 1 && "${BOARD_ROSTER_READY}" -eq 0 ]]; then
  cat >&2 <<'NOBOARD'

run_legacy_members: REFUSING a production extract. The board roster is missing.

  Set FOOTBAG_BOARD_ROSTER to the non-empty CSV in the private checkout listing the
  directors sitting at cutover.

  Nothing in the legacy dump records who sits on the board, so without this file no
  row carries the board flag and every sitting director loads as an ordinary member.
  That produces a database that looks entirely normal and is wrong about the people
  most visible in it. Nothing was written.
NOBOARD
  exit 1
fi

# Rulings without a roster is a dead end, and it used to be found the expensive
# way. Supplying the rulings turns on the final merge, and that merge refuses to
# build its artifacts while no row carries the board flag -- so the run walked
# every stage and the quality gate first and then aborted from inside the merge,
# naming a column rather than the missing file. Caught here instead, before
# anything runs.
if [[ "${ADJUDICATIONS_READY}" -eq 1 && "${DO_EXTRACT}" -eq 1 && "${BOARD_ROSTER_READY}" -eq 0 ]]; then
  cat >&2 <<'NOBOARDADJ'

run_legacy_members: REFUSING. The account rulings are present and the board roster is not.

  Set FOOTBAG_BOARD_ROSTER to the non-empty CSV in the private checkout listing the
  directors sitting at cutover, beside the rulings directory you already supplied.

  The rulings turn on the final merge, and that merge will not build its artifacts
  while no row carries the board flag, because an OR-merge could otherwise drop a
  board grant. Without the roster no row ever carries it, so this run would fail
  at the merge after every earlier stage had already done its work. Nothing was
  written.
NOBOARDADJ
  exit 1
fi

echo "==> member intake: $([[ "${PRODUCTION_LOAD}" -eq 1 ]] && echo 'PRODUCTION load' || echo 'development load')"
echo "    account rulings: $([[ "${ADJUDICATIONS_READY}" -eq 1 ]] && echo "applied from ${ADJ_DIR}" || echo 'NOT APPLIED (none supplied; duplicate accounts merge on the mechanical rule alone)')"
if [[ "${DO_EXTRACT}" -eq 1 ]]; then
  echo "    board roster:    $([[ "${BOARD_ROSTER_READY}" -eq 1 ]] && echo "applied from ${BOARD_ROSTER}" || echo 'NOT APPLIED (none supplied; no row carries the board flag)')"
  echo "    measured at:     ${CUTOVER_DATE}$([[ -n "${FOOTBAG_CUTOVER_DATE:-}" ]] && echo ' (pinned)' || echo ' (today)')"
else
  # The date is consumed at extraction, so it is already baked into the CSV this
  # run reads. Saying otherwise here would invite someone to set it and expect
  # this run to change.
  echo "    cutover date:    (set at extraction; this run reads what the intermediate CSV already carries)"
fi

if [[ "${DO_EXTRACT}" -eq 1 ]]; then
  ROOT="$("${PY}" -c 'import sys; sys.path.insert(0, "legacy_data/member_data_scripts"); from _dump_parser import resolve_dump_root; r = resolve_dump_root(); print(r or "")')"
  if [[ -z "${ROOT}" ]]; then
    echo "run_legacy_members --extract: no legacy dump present (set FOOTBAG_LEGACY_REPO or create the repo-root footbag_legacy_repo symlink)." >&2
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
  BOARD_ARGS=()
  if [[ "${BOARD_ROSTER_READY}" -eq 1 ]]; then
    BOARD_ARGS=(--board-roster "${BOARD_ROSTER}")
  fi
  "${PY}" "${MDS}/extract_legacy_members.py" --members-sql "${MEMBERS_SQL}" --out "${MEMBERS_CSV}" \
    --cutover-date "${CUTOVER_DATE}" "${BOARD_ARGS[@]+"${BOARD_ARGS[@]}"}"

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

  # The board flag was decided at extraction and is baked into this CSV, so the
  # roster variable says nothing about the load in front of us. Read the answer
  # off the file instead, and report it the way an extract run reports its input.
  CSV_BOARD_ROWS="$("${PY}" -c 'import csv, sys
with open(sys.argv[1], newline="", encoding="utf-8") as fh:
    rows = csv.DictReader(fh)
    print(sum(1 for row in rows
              if (row.get("legacy_was_board_at_cutover") or "0").strip() not in ("", "0")))' "${CSV}")"
  echo "    board roster:    $([[ "${CSV_BOARD_ROWS}" -gt 0 ]] && echo "${CSV_BOARD_ROWS} row(s) carry the board flag" || echo 'NOT APPLIED (no row in this CSV carries the board flag)')"

  # Same dead end as the extract-side refusal, reached by the other door: a CSV
  # extracted without a roster, loaded on a machine that has the rulings.
  if [[ "${ADJUDICATIONS_READY}" -eq 1 && "${CSV_BOARD_ROWS}" -eq 0 ]]; then
    cat >&2 <<NOBOARDCSV

run_legacy_members --load: REFUSING. The account rulings are present and this CSV carries no board row.

  MISSING: a board flag on every row of ${CSV}

  Re-extract with FOOTBAG_BOARD_ROSTER pointing at the non-empty CSV in the private
  checkout that lists the directors sitting at cutover, or load a CSV that was
  extracted with it.

  The rulings turn on the final merge, and that merge will not build its artifacts
  while no row carries the board flag. Refusing now rather than after every earlier
  stage has run. Nothing was written.
NOBOARDCSV
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

  # Honors backfill, re-run over the proposed links. The extract-time honors pass
  # only saw the accounts already linked in the database, so an honoree linked to
  # an account by a Stage B proposal was missed. Re-running with those proposals
  # overlaid produces the reconciled member CSV the later apply will load, with
  # is_hof / is_bap carried to the newly-linked accounts. Reads only; writes only
  # the reconciled CSV artifact -- no database write, and the proposed links are
  # not written to the database here.
  echo "==> reconcile: honors backfill over the proposed links"
  "${PY}" "${MDS}/extract_legacy_honors.py" \
    --members-csv "${CSV}" --db "${DB}" \
    --proposed-links "${PROPOSED_LINKS_CSV}" --out "${RECONCILED_CSV}"

  # Final-load only: build the exact-name + full-DOB auto-merge artifacts (the
  # merged member CSV with survivors consolidated, the loser->survivor map, and
  # the review CSV holding the contradiction groups). The loader applies the map
  # in its transaction. Ordinary dev/CI loads skip this and load RECONCILED_CSV
  # unchanged.
  LOAD_CSV="${RECONCILED_CSV}"
  if [[ "${ADJUDICATIONS_READY}" -eq 1 ]]; then
    # The automatic merge fuses accounts sharing an exact name and a full birth
    # date. A human reviewed that cohort and recorded rulings that both add
    # merges the rule cannot see and forbid merges the rule would otherwise
    # make, so a load must have them in front of it: without them a pair ruled to
    # be two different people is fused, and the person whose row collapses can
    # never claim it. The rulings hold real account identities, so they live
    # outside this repository and the operator supplies their location, the same
    # way the dump location is supplied.
    echo "==> account rulings: build the exact-name + full-DOB auto-merge artifacts"
    "${PY}" "${MDS}/reconcile_legacy_members.py" --final-merge \
      --csv "${RECONCILED_CSV}" --db "${DB}" \
      --proposed-out "${PROPOSED_LINKS_CSV}" \
      --merged-out "${MERGED_CSV}" --merge-map-out "${MERGE_MAP_CSV}" \
      --overrides "${ADJ_STAGE_A}" \
      --entitlement-dispositions "${ADJ_ENTITLEMENTS}"
    LOAD_CSV="${MERGED_CSV}"
  fi

  if [[ "${DO_APPLY}" -eq 0 ]]; then
    # Read-only by default: a passing gate means the proposed links are reviewed
    # and non-duplicating, but writing them and the reconciled member rows is a
    # separate, explicit --apply step. Nothing is written here.
    echo ""
    echo "run_legacy_members --load: reconciliation complete and the QC gate passed."
    echo "  Artifacts for review are under ${OUT_DIR}/ (Stage A review, Stage B"
    echo "  proposed links, Stage B link review, and the reconciled member CSV with"
    echo "  honors carried to the proposed links). Re-run with --apply to write."
    exit 0
  fi

  # --apply: two guarded, individually-atomic writes. The member load runs first
  # so the account rows the links reference exist; the link writer then validates,
  # writes its audit CSV and rollback SQL before its transaction, and applies the
  # links. Both writers refuse production / staging / /srv/footbag targets and
  # enforce foreign keys. These are two separate connections, so two transactions,
  # not one -- rollback is preserved by the pre-written rollback SQL and by the
  # member-first ordering.
  echo "==> apply: snapshot legacy_members for rollback (read-only, pre-write)"
  "${PY}" "${MDS}/snapshot_legacy_members.py" \
    --members-csv "${LOAD_CSV}" --db "${DB}" \
    --audit-out "${OUT_DIR}/apply_members_audit.csv" \
    --rollback-out "${OUT_DIR}/apply_members_rollback.sql"

  echo "==> apply: load reconciled members (writes legacy_members; preserves claim state)"
  if [[ "${ADJUDICATIONS_READY}" -eq 1 ]]; then
    "${PY}" "${MDS}/load_legacy_export.py" --export "${LOAD_CSV}" --db "${DB}" --apply \
      --merge-map "${MERGE_MAP_CSV}"
  else
    "${PY}" "${MDS}/load_legacy_export.py" --export "${LOAD_CSV}" --db "${DB}" --apply
  fi

  echo "==> apply: proposed historical-person links (writes historical_persons.legacy_member_id)"
  "${PY}" "${MDS}/apply_reconciled_links.py" \
    --proposed-links "${PROPOSED_LINKS_CSV}" --db "${DB}" \
    --audit-out "${OUT_DIR}/apply_links_audit.csv" \
    --rollback-out "${OUT_DIR}/apply_links_rollback.sql" --apply

  echo ""
  echo "run_legacy_members --load --apply: complete. Wrote the reconciled member"
  echo "  rows and the proposed historical-person links. Rollback SQL, apply in"
  echo "  THIS order (links first, then members; both together restore the"
  echo "  pre-apply state):"
  echo "    1. links:   ${OUT_DIR}/apply_links_rollback.sql"
  echo "    2. members: ${OUT_DIR}/apply_members_rollback.sql"
  exit 0
fi

echo "run_legacy_members: done."
