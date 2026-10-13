#!/usr/bin/env bash
# run_legacy_members.sh — validate, reconcile and load the published legacy member
# CSV into the DB.
#
# The member data arrives as one file: the published member CSV the publish step
# writes into the maintainers' private checkout
# (footbag_private_repo/legacy-publish/legacy_members.csv), built from the vetted
# legacy-site CSVs and committed there. This script never reads the legacy
# repository or a dump. It joins the honours through the built database into a
# git-ignored working copy under out/, because honours resolve through the
# person layer, which exists only once the database is built.
#
# Writing the member data into the database is guarded behind an explicit --apply
# flag. The source data is dirty (many people hold several accounts; emails are
# shared across accounts), so --load first runs the identity reconciliation (the
# Stage A duplicate-account review, the Stage B historical-person link proposals)
# and a pre-apply QC gate, then re-runs the honors backfill over the proposals.
# Without --apply, --load stops read-only after a passing gate. With --apply, it
# snapshots legacy_members for rollback, loads the reconciled members, and applies
# the proposed links -- each write refuses production/staging and is individually
# reversible. A gate failure aborts before any write.
#
# Stage:
#   --load             validate + preview, run Stage A / Stage B / the QC gate /
#                      the honors re-run, then stop before applying (read-only).
#
# Modifiers:
#   --apply            with --load, perform the real writes after the gate passes:
#                      load the reconciled member rows, then apply the proposed
#                      historical-person links. Refused against production /
#                      staging / /srv/footbag by the underlying writers. Without
#                      it, --load writes nothing.
#   --dry-run          validate + preview and stop cleanly (no write attempted).
#   --db PATH          target database (default: $FOOTBAG_DB_PATH or database/footbag.db).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${HERE}/../.." && pwd)"
cd "${REPO_ROOT}"

PY="${HERE}/../footbag_venv/bin/python"
[[ -x "${PY}" ]] || PY="python3"

MDS="legacy_data/member_data_scripts"
OUT_DIR="${MDS}/out"
PUBLISHED_CSV="${REPO_ROOT}/footbag_private_repo/legacy-publish/legacy_members.csv"
# The published CSV with the honours joined in: the CSV every later stage reads.
CSV="${OUT_DIR}/legacy_members_final.csv"
PROPOSED_LINKS_CSV="${OUT_DIR}/stage_b_proposed_links.csv"
RECONCILED_CSV="${OUT_DIR}/legacy_members_reconciled.csv"
MERGED_CSV="${OUT_DIR}/legacy_members_merged.csv"
MERGE_MAP_CSV="${OUT_DIR}/stage_a_merged_accounts.csv"

usage() {
  cat >&2 <<'USAGE'
Usage: run_legacy_members.sh --load [--apply] [--dry-run] [--db PATH]

  --load             Validate + preview, run reconciliation (Stage A, Stage B, QC gate, honors re-run), then stop before applying (read-only).
  --apply            With --load, perform the real writes after the gate passes (reconciled members, then proposed links). Refused on production/staging.
  --dry-run          Validate + preview and stop cleanly (no write attempted).
  --db PATH          Target database (default: $FOOTBAG_DB_PATH or database/footbag.db).

There is ONE load path, and every input it reads lives in the maintainers'
private checkout, reached through the git-ignored repo-root footbag_private_repo
symlink, at locations this script resolves itself: no path is ever typed and
nothing has to be exported.

  legacy-publish/legacy_members.csv  The published member CSV, required. The publish
                                     step builds it from the vetted legacy-site CSVs
                                     and fixes the cutover date and the board flag in
                                     it, so neither is an input here.
  private_data/stage_a_overrides/    The recorded human rulings about which accounts
                                     are the same person (stage_a_adjudication.csv,
                                     entitlement_dispositions.csv, person_link_holds.csv,
                                     review_resolutions.csv). Present: the rulings are
                                     applied and duplicate accounts collapse through the
                                     merge map. Absent: duplicates merge on the
                                     mechanical rule alone, and the run says so.
  DEPLOY_TARGET=footbag-production   Marks this as a production load: the rulings become
                                     mandatory and the run refuses without them.
USAGE
}

DO_LOAD=0
DO_APPLY=0
DRY_RUN=0
DB="${FOOTBAG_DB_PATH:-database/footbag.db}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --load)          DO_LOAD=1; shift ;;
    --apply)         DO_APPLY=1; shift ;;
    --dry-run)       DRY_RUN=1; shift ;;
    # Flags this script no longer has are refused rather than ignored: a script or
    # a note that still passes one must be corrected, not silently given a
    # different load.
    --extract)
      echo "run_legacy_members: --extract no longer exists. The member data is the published member CSV," >&2
      echo "  written by legacy_data/scripts/publish_legacy_repo_data.py from the vetted legacy-site CSVs;" >&2
      echo "  nothing here reads the legacy repository. Run --load. Run --help." >&2
      exit 2 ;;
    --from-csv)
      echo "run_legacy_members: --from-csv no longer exists. --load reads only the published member CSV" >&2
      echo "  in the private checkout, so every load is built from the same vetted data. Run --help." >&2
      exit 2 ;;
    --final-export)
      echo "run_legacy_members: --final-export no longer exists. The load has one path and reads its" >&2
      echo "  inputs instead: the recorded rulings are resolved from the private checkout, and" >&2
      echo "  DEPLOY_TARGET=footbag-production makes them mandatory. Run --help." >&2
      exit 2 ;;
    --db)            DB="${2:-}"; shift 2 ;;
    -h|--help)       usage; exit 0 ;;
    *) echo "run_legacy_members: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "${DO_LOAD}" -eq 0 ]]; then
  echo "run_legacy_members: choose --load." >&2
  usage
  exit 2
fi

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
# One input decides it: the recorded account rulings, which live outside this
# repository because they hold real account identities. A machine without them
# still loads; it just says so. A production build without them refuses.
# Where the recorded decisions live. The files sit together in the private
# checkout, reached through the git-ignored repo-root symlink that five other
# scripts in this subtree already use to find private material, so this run
# resolves them the same way. No variable names the location, because an operator
# command never carries a path: an input behind an exported variable is an input
# a human has to remember.
PRIVATE_OVERRIDES="${REPO_ROOT}/footbag_private_repo/private_data/stage_a_overrides"

ADJ_STAGE_A="${PRIVATE_OVERRIDES}/stage_a_adjudication.csv"
ADJ_ENTITLEMENTS="${PRIVATE_OVERRIDES}/entitlement_dispositions.csv"
# The Stage B half of the same adjudication: one file withholds proposed person
# links a human ruled must not be made, the other moves reviewed groups out of the
# undecided pile. They sit in the same private directory as the two above and are
# required alongside them, because a ruling the load never reads is a ruling that
# does not apply, and this load happens once.
ADJ_LINK_HOLDS="${PRIVATE_OVERRIDES}/person_link_holds.csv"
ADJ_REVIEW_RESOLUTIONS="${PRIVATE_OVERRIDES}/review_resolutions.csv"
ADJUDICATIONS_READY=0
if [[ -s "${ADJ_STAGE_A}" && -s "${ADJ_ENTITLEMENTS}" \
      && -s "${ADJ_LINK_HOLDS}" && -s "${ADJ_REVIEW_RESOLUTIONS}" ]]; then
  ADJUDICATIONS_READY=1
fi
PRODUCTION_LOAD=0
if [[ "${DEPLOY_TARGET:-}" == "footbag-production" ]]; then
  PRODUCTION_LOAD=1
fi

if [[ "${PRODUCTION_LOAD}" -eq 1 && "${ADJUDICATIONS_READY}" -eq 0 ]]; then
  cat >&2 <<NOPROD

run_legacy_members: REFUSING a production load. The recorded account rulings are missing.

  Looked for four non-empty files in:
    ${PRIVATE_OVERRIDES}
  stage_a_adjudication.csv, entitlement_dispositions.csv, person_link_holds.csv
  and review_resolutions.csv.

  They arrive with the maintainers' private checkout, reached through the git-ignored
  repo-root footbag_private_repo symlink. Create that symlink and re-run.

  Without them, accounts a human ruled to be different people are fused, and one
  of the two becomes unclaimable by the person it belongs to. That failure raises
  no error of its own and the resulting database looks perfectly normal, which is
  why this refuses here instead. Nothing was written.
NOPROD
  exit 1
fi

echo "==> member intake: $([[ "${PRODUCTION_LOAD}" -eq 1 ]] && echo 'PRODUCTION load' || echo 'development load')"
echo "    account rulings: $([[ "${ADJUDICATIONS_READY}" -eq 1 ]] && echo "applied from ${PRIVATE_OVERRIDES}" || echo "NOT APPLIED (nothing readable at ${PRIVATE_OVERRIDES}; duplicate accounts merge on the mechanical rule alone)")"

if [[ "${DO_LOAD}" -eq 1 ]]; then
  if [[ ! -s "${PUBLISHED_CSV}" ]]; then
    cat >&2 <<NOPUBLISHED

run_legacy_members --load: REFUSING. The published member CSV is missing.

  MISSING: ${PUBLISHED_CSV}

  It is committed in the maintainers' private checkout, reached through the
  git-ignored repo-root footbag_private_repo symlink, and is written by
    legacy_data/scripts/publish_legacy_repo_data.py --cutover-date YYYY-MM-DD
  from the vetted legacy-site CSVs. Without it there is no member data to load.
  Nothing was written.
NOPUBLISHED
    exit 1
  fi
  if ! db_has_historical_persons; then
    echo "run_legacy_members --load: needs a built database with historical_persons at ${DB}. Run scripts/reset-local-db.sh first." >&2
    exit 1
  fi
  # The cutover date and the board flag were fixed at publish and are part of the
  # published CSV, so nothing in this run can change them.
  echo "    member data:     ${PUBLISHED_CSV} (cutover date and board flag fixed at publish)"

  mkdir -p "${OUT_DIR}"
  echo "==> intake: backfill is_hof / is_bap through the person layer"
  "${PY}" "${MDS}/extract_legacy_honors.py" --members-csv "${PUBLISHED_CSV}" --db "${DB}" --out "${CSV}"
  echo "    wrote ${CSV}"

  CSV_BOARD_ROWS="$("${PY}" -c 'import csv, sys
with open(sys.argv[1], newline="", encoding="utf-8") as fh:
    rows = csv.DictReader(fh)
    print(sum(1 for row in rows
              if (row.get("legacy_was_board_at_cutover") or "0").strip() not in ("", "0")))' "${CSV}")"
  echo "    board flag:      $([[ "${CSV_BOARD_ROWS}" -gt 0 ]] && echo "${CSV_BOARD_ROWS} row(s) carry it" || echo 'no row carries it (the delivery'"'"'s board roster is not current; administrators seat the directors after cutover)')"

  echo "==> validate export (hard gate)"
  "${PY}" "${MDS}/validate_legacy_export.py" --csv "${CSV}" --db "${DB}"

  echo "==> load: dry-run preview (writes nothing)"
  "${PY}" "${MDS}/load_legacy_export.py" --export "${CSV}" --db "${DB}"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "run_legacy_members: dry-run complete (validated and previewed; no write)."
    exit 0
  fi

  # Pre-apply identity reconciliation. The legacy data is dirty (people hold several
  # accounts; emails are shared), so build the review and proposal artifacts and
  # run the QC gate over them before any write. Stage A groups duplicate accounts
  # for review; Stage B proposes historical-person links and sets the ambiguous
  # ones aside; the QC gate fails if the proposals would duplicate a link or
  # auto-apply a set-aside candidate. All three read only and write git-ignored
  # artifacts under out/; none writes to the database.
  echo "==> reconcile: Stage A duplicate-account review"
  "${PY}" "${MDS}/reconcile_legacy_members.py" --stage-a --csv "${CSV}"

  # Completeness is asserted on the production load alone: it refuses unless every
  # membership-only provisional person carries a proposed link or a recorded
  # disposition, which is the right bar for the load that cannot be redone and too
  # strict for a dev or CI run against partial data.
  COMPLETE_ARGS=()
  if [[ "${PRODUCTION_LOAD}" -eq 1 ]]; then
    COMPLETE_ARGS=(--require-complete-dispositions)
  fi

  # The person-link holds and the review-group resolutions are rulings about
  # Stage B's own proposals, so they apply here, where the proposals are made:
  # a held link never reaches the proposed-links CSV the apply step writes from.
  # With the rulings present, Stage B also reads the account universe after the
  # ruled Stage A merges, so a merged pair presents as one account.
  echo "==> reconcile: Stage B historical-person link proposals"
  if [[ "${ADJUDICATIONS_READY}" -eq 1 ]]; then
    "${PY}" "${MDS}/reconcile_legacy_members.py" --stage-b-survivor-view \
      --csv "${CSV}" --db "${DB}" \
      --overrides "${ADJ_STAGE_A}" \
      --link-holds "${ADJ_LINK_HOLDS}" \
      --review-resolutions "${ADJ_REVIEW_RESOLUTIONS}" \
      "${COMPLETE_ARGS[@]+"${COMPLETE_ARGS[@]}"}"
  else
    "${PY}" "${MDS}/reconcile_legacy_members.py" --stage-b --csv "${CSV}" --db "${DB}"
  fi

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

  # Honors backfill, re-run over the proposed links. The intake honors pass
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

  # Final-load only: build the duplicate-account auto-merge artifacts (the
  # merged member CSV with survivors consolidated, the loser->survivor map, and
  # the review CSV holding the contradiction groups). The loader applies the map
  # in its transaction. Ordinary dev/CI loads skip this and load RECONCILED_CSV
  # unchanged.
  LOAD_CSV="${RECONCILED_CSV}"
  if [[ "${ADJUDICATIONS_READY}" -eq 1 ]]; then
    # The automatic merge fuses accounts sharing a surname, a full birth date and
    # a compatible first and middle name. A human reviewed that cohort and recorded rulings that both add
    # merges the rule cannot see and forbid merges the rule would otherwise
    # make, so a load must have them in front of it: without them a pair ruled to
    # be two different people is fused, and the person whose row collapses can
    # never claim it. The rulings hold real account identities, so they live
    # in the private checkout.
    echo "==> account rulings: build the duplicate-account auto-merge artifacts"
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

  # The link proposals were built before the member load, and the load collapses
  # the duplicate accounts the rulings name, so the map goes to this writer too:
  # a proposal naming a collapsed account names its survivor, where the merge has
  # already put that person's link. Without it the apply refuses at the last step
  # of the whole intake, on a stale id, having written the member rows already.
  echo "==> apply: proposed historical-person links (writes historical_persons.legacy_member_id)"
  LINK_MAP_ARGS=()
  if [[ "${ADJUDICATIONS_READY}" -eq 1 ]]; then
    LINK_MAP_ARGS=(--merge-map "${MERGE_MAP_CSV}")
  fi
  "${PY}" "${MDS}/apply_reconciled_links.py" \
    --proposed-links "${PROPOSED_LINKS_CSV}" --db "${DB}" \
    --audit-out "${OUT_DIR}/apply_links_audit.csv" \
    --rollback-out "${OUT_DIR}/apply_links_rollback.sql" --apply \
    "${LINK_MAP_ARGS[@]+"${LINK_MAP_ARGS[@]}"}"

  # The honours flags are judged on the database as loaded, after the backfill
  # carried them to the newly linked accounts and the links are written: only
  # then do the flags and the person links describe the same state. A mismatch
  # fails the run, so a build carrying a wrong flag never reaches a deploy.
  echo "==> verify: honours flags as loaded trace to the rosters"
  if ! "${PY}" "${MDS}/validate_legacy_honors.py" --flags-from-db --db "${DB}"; then
    echo "run_legacy_members --load --apply: the loaded honours flags do not match the rosters." >&2
    echo "  The rows are written; the rollback SQL below restores the pre-apply state." >&2
    echo "    1. links:   ${OUT_DIR}/apply_links_rollback.sql" >&2
    echo "    2. members: ${OUT_DIR}/apply_members_rollback.sql" >&2
    exit 1
  fi

  # The member-data audits judge the same loaded state against the figures
  # audited for this delivery and the recorded rulings. No finding is a warning:
  # a build that fails one never reaches a deploy.
  echo "==> verify: member-data audits on the loaded database"
  if ! "${PY}" "${MDS}/audit_member_data.py" --db "${DB}"; then
    echo "run_legacy_members --load --apply: a member-data audit failed on the loaded database." >&2
    echo "  The rows are written; the rollback SQL below restores the pre-apply state." >&2
    echo "    1. links:   ${OUT_DIR}/apply_links_rollback.sql" >&2
    echo "    2. members: ${OUT_DIR}/apply_members_rollback.sql" >&2
    exit 1
  fi

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
