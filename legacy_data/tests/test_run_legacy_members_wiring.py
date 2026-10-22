"""
test_run_legacy_members_wiring.py
=================================

Wiring contract for run_legacy_members.sh --load: it builds the Stage A and
Stage B reconciliation artifacts and runs the QC gate over them, in that order,
before stopping short of any write.

These assert the load flow's structure directly (the script writes its
reconciliation artifacts to the git-ignored real out/ directory, which tests must
never touch, so the ordering is proven from the script rather than by executing
it; the reconcile stage commands are proven to generate those artifacts by
test_reconcile_legacy_members.py):

  * Stage A runs before Stage B runs before the QC gate;
  * the --dry-run clean exit precedes reconciliation, so a --load --dry-run
    (how the --all-data data build previews the member intake) never reaches
    Stage A / Stage B / the QC gate;
  * apply is opt-in and ordered: --apply snapshots members first, then loads
    the reconciled members, then applies the proposed links; without --apply a
    passing gate stops cleanly without writing;
  * the reconciliation runs inside the --load block;
  * the production load applies the recorded account rulings and refuses without
    them, while an ordinary load never depends on them;
  * the member data is the published member CSV alone: no dump, no roster, no
    cutover date, and a missing CSV refuses rather than passing as an empty load.
"""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "member_data_scripts" / "run_legacy_members.sh"

TEXT = SCRIPT.read_text()


def test_stage_a_then_stage_b_then_qc_gate_run_in_order() -> None:
    i_a = TEXT.index('reconcile_legacy_members.py" --stage-a')
    i_b = TEXT.index('reconcile_legacy_members.py" --stage-b')
    i_qc = TEXT.index('reconcile_legacy_members.py" --qc-gate')
    assert i_a < i_b < i_qc


def test_dry_run_short_circuits_before_reconciliation() -> None:
    # The --all-data data build previews the intake with --load --dry-run; the
    # dry-run clean exit must sit ahead of Stage A so that path never generates
    # artifacts or runs the gate.
    i_dry_exit = TEXT.index("dry-run complete")
    i_stage_a = TEXT.index('reconcile_legacy_members.py" --stage-a')
    assert i_dry_exit < i_stage_a


def test_default_load_path_writes_nothing() -> None:
    # Without --apply the load stops read-only after a passing gate, before any
    # writer runs: the apply writes live behind the DO_APPLY guard.
    i_default_stop = TEXT.index('if [[ "${DO_APPLY}" -eq 0 ]]')
    i_member_apply = TEXT.index('load_legacy_export.py" --export "${LOAD_CSV}"')
    assert i_default_stop < i_member_apply       # the read-only stop precedes the writers
    tail = TEXT[TEXT.index('reconcile_legacy_members.py" --qc-gate'):i_member_apply]
    assert "Re-run with --apply to write" in tail
    assert "exit 0" in tail                      # explicit read-only stop, not fall-through


def test_apply_writes_are_guarded_by_the_apply_flag() -> None:
    # Both real writes sit after the DO_APPLY check, so nothing writes by default.
    i_apply_gate = TEXT.index('if [[ "${DO_APPLY}" -eq 0 ]]')
    i_member_apply = TEXT.index('load_legacy_export.py" --export "${LOAD_CSV}"')
    i_link_apply = TEXT.index('apply_reconciled_links.py')
    assert i_apply_gate < i_member_apply
    assert i_apply_gate < i_link_apply


def test_apply_loads_members_before_applying_links() -> None:
    # The member rows must exist before the links that reference them are written.
    i_member_apply = TEXT.index('load_legacy_export.py" --export "${LOAD_CSV}"')
    i_link_apply = TEXT.index('apply_reconciled_links.py')
    assert i_member_apply < i_link_apply


def test_member_snapshot_runs_before_the_member_load() -> None:
    # The rollback snapshot of legacy_members is captured before the load
    # overwrites those rows, and only inside the --apply path.
    i_apply_gate = TEXT.index('if [[ "${DO_APPLY}" -eq 0 ]]')
    i_snapshot = TEXT.index('snapshot_legacy_members.py')
    i_member_apply = TEXT.index('load_legacy_export.py" --export "${LOAD_CSV}"')
    assert i_apply_gate < i_snapshot < i_member_apply


def test_apply_runs_after_stage_b_qc_and_honors() -> None:
    i_qc = TEXT.index('reconcile_legacy_members.py" --qc-gate')
    i_honors_rerun = TEXT.index("--proposed-links")
    i_member_apply = TEXT.index('load_legacy_export.py" --export "${LOAD_CSV}"')
    assert i_qc < i_member_apply
    assert i_honors_rerun < i_member_apply


def test_reconciliation_runs_inside_the_load_block() -> None:
    i_load = TEXT.index('if [[ "${DO_LOAD}" -eq 1 ]]')
    i_stage_a = TEXT.index('reconcile_legacy_members.py" --stage-a')
    assert i_load < i_stage_a


def test_honors_backfill_reruns_after_stage_b_over_the_proposed_links() -> None:
    # The honors backfill runs at intake (no proposals) and again after Stage B,
    # overlaying the proposed links so accounts linked by a proposal receive their
    # honor flags.
    assert TEXT.count("extract_legacy_honors.py") >= 2
    i_stage_b = TEXT.index('reconcile_legacy_members.py" --stage-b')
    i_qc = TEXT.index('reconcile_legacy_members.py" --qc-gate')
    i_honors_rerun = TEXT.index("--proposed-links")
    assert i_stage_b < i_honors_rerun
    assert i_qc < i_honors_rerun


def test_the_loaded_honours_flags_are_judged_after_the_links_and_fail_the_run() -> None:
    # Judged before the links are written, the flags and the person links describe
    # different states and disagree on every honoree a proposal links; judged as a
    # warning, a wrong flag reaches the deploy. So the check reads the database
    # after the link apply, and a mismatch exits non-zero whatever flags are passed.
    i_link_apply = TEXT.index('apply_reconciled_links.py')
    i_check = TEXT.index('validate_legacy_honors.py" --flags-from-db')
    assert i_link_apply < i_check
    after = TEXT[i_check:TEXT.index("fi", i_check)]
    assert "exit 1" in after
    assert TEXT.count("validate_legacy_honors.py") == 1


def test_the_member_data_audits_judge_the_loaded_database_and_fail_the_run() -> None:
    # Run before the links are written, the audits would judge a state the build
    # does not ship; run as a warning, a failing build reaches the deploy.
    i_check = TEXT.index('validate_legacy_honors.py" --flags-from-db')
    i_audit = TEXT.index('if ! "${PY}" "${MDS}/audit_member_data.py" --db "${DB}"; then')
    assert i_check < i_audit
    after = TEXT[i_audit:TEXT.index("fi", i_audit)]
    assert "exit 1" in after
    assert TEXT.count("audit_member_data.py") == 1


def test_dry_run_short_circuits_before_the_honors_rerun() -> None:
    # The --all-data build previews with --load --dry-run, which must exit before
    # the post-Stage-B honors re-run.
    i_dry_exit = TEXT.index("dry-run complete")
    i_honors_rerun = TEXT.index("--proposed-links")
    assert i_dry_exit < i_honors_rerun


# The automatic merge fuses accounts it groups as one person. Human rulings both
# add merges that rule cannot see and forbid merges it would otherwise make, so a
# production load that runs without them merges people ruled to be distinct and
# leaves one of them holding an account nobody can claim.

def _stage_b_ruled_call() -> str:
    start = TEXT.index('reconcile_legacy_members.py" --stage-b-survivor-view')
    return TEXT[start:TEXT.index("else", start)]


def test_final_merge_applies_the_recorded_account_rulings() -> None:
    merge_call = TEXT[TEXT.index('reconcile_legacy_members.py" --final-merge'):]
    merge_call = merge_call[:merge_call.index("LOAD_CSV=")]
    assert '--overrides "${ADJ_STAGE_A}"' in merge_call
    assert '--entitlement-dispositions "${ADJ_ENTITLEMENTS}"' in merge_call
    # The Stage B half of the same adjudication rules on Stage B's proposals, so
    # it goes to the call that makes them. A ruling the call never applies is a
    # ruling that does not apply: the withheld link is proposed and written anyway,
    # and the reviewed groups stay in the undecided pile, neither raising an error.
    stage_b = _stage_b_ruled_call()
    assert '--link-holds "${ADJ_LINK_HOLDS}"' in stage_b
    assert '--review-resolutions "${ADJ_REVIEW_RESOLUTIONS}"' in stage_b
    assert '--link-holds' not in merge_call
    assert '--review-resolutions' not in merge_call
    # All four paths are built once, where the readiness check reads them, so the
    # check and the call cannot disagree about which files a run actually applied.
    assert 'ADJ_STAGE_A="${PRIVATE_OVERRIDES}/stage_a_adjudication.csv"' in TEXT
    assert 'ADJ_ENTITLEMENTS="${PRIVATE_OVERRIDES}/entitlement_dispositions.csv"' in TEXT
    assert 'ADJ_LINK_HOLDS="${PRIVATE_OVERRIDES}/person_link_holds.csv"' in TEXT
    assert 'ADJ_REVIEW_RESOLUTIONS="${PRIVATE_OVERRIDES}/review_resolutions.csv"' in TEXT
    # Readiness covers all four, so a checkout carrying only the Stage A pair cannot
    # reach a production load and silently drop the Stage B rulings.
    assert '-s "${ADJ_LINK_HOLDS}" && -s "${ADJ_REVIEW_RESOLUTIONS}"' in TEXT


def test_completeness_is_required_on_the_final_load_alone() -> None:
    # The flag refuses unless every membership-only provisional person carries a
    # proposed link or a recorded disposition. That is the bar for the final
    # cutover load, run on the export the rulings were fitted to. A production
    # rebuild before cutover replaces a database that can be redone, from member
    # data that is not yet final; keyed on the deploy target, the check stopped
    # those rebuilds on people nobody could yet rule on.
    stage_b = _stage_b_ruled_call()
    assert '"${COMPLETE_ARGS[@]+"${COMPLETE_ARGS[@]}"}"' in stage_b
    i_call = TEXT.index('reconcile_legacy_members.py" --stage-b-survivor-view')
    setup = TEXT[:i_call]
    i_args = setup.rindex("COMPLETE_ARGS=()")
    guard = setup[i_args:]
    assert 'if [[ "${FINAL_LOAD}" -eq 1 ]]' in guard
    assert "PRODUCTION_LOAD" not in guard
    assert "COMPLETE_ARGS=(--require-complete-dispositions)" in guard


def test_the_final_load_is_marked_by_its_flag_alone() -> None:
    # Only the cutover command names the final load. A value inherited from the
    # environment or derived from the target would put every production rebuild
    # back under the cutover bar.
    assert "FINAL_LOAD=0" in TEXT
    assert TEXT.count("FINAL_LOAD=1") == 1
    assert "--final-load)    FINAL_LOAD=1; shift ;;" in TEXT
    # Every run says which bar it applied, so a cutover run missing the flag is
    # visible in its own output.
    assert "completeness:" in TEXT and "required (final load)" in TEXT


def test_production_load_refuses_when_its_inputs_are_absent() -> None:
    # A production load is marked by the deploy target, not by a flag someone has
    # to remember, and it refuses rather than quietly degrading to the ordinary
    # load: a database built the lesser way is indistinguishable afterwards.
    i_guard = TEXT.index('if [[ "${PRODUCTION_LOAD}" -eq 1 && "${ADJUDICATIONS_READY}" -eq 0 ]]')
    i_merge = TEXT.index('reconcile_legacy_members.py" --final-merge')
    assert i_guard < i_merge                      # the refusal precedes the merge
    guard = TEXT[i_guard:i_merge]
    assert "REFUSING a production load" in guard
    assert "exit 1" in guard
    # The rulings are the only input a production load insists on, and the refusal
    # names the symlink that delivers them rather than a variable to export: on a
    # maintainer machine they are already there, so the only machine that can still
    # refuse is one without the private checkout.
    assert "footbag_private_repo" in guard


def test_the_rulings_are_applied_whenever_they_are_present() -> None:
    # Local and CI machines hold no private rulings, so an ordinary load must not
    # depend on them; but a machine that has them applies them without being
    # asked, because an opt-in flag is what let a development-shaped load reach
    # production unnoticed.
    assert 'ADJUDICATIONS_READY=1' in TEXT
    assert TEXT.index('if [[ "${ADJUDICATIONS_READY}" -eq 1 ]]') < \
        TEXT.index('reconcile_legacy_members.py" --final-merge')
    # With the rulings present, Stage B reads the account universe after the ruled
    # merges and applies its own rulings; without them it runs mechanically, so an
    # ordinary load needs nothing private. Both calls run before the quality gate,
    # which then judges the links the apply step will actually write.
    i_ruled = TEXT.index('reconcile_legacy_members.py" --stage-b-survivor-view')
    i_plain = TEXT.index('reconcile_legacy_members.py" --stage-b --csv')
    i_gate = TEXT.index('reconcile_legacy_members.py" --qc-gate')
    guard = TEXT.rindex('if [[ "${ADJUDICATIONS_READY}" -eq 1 ]]', 0, i_ruled)
    assert guard < i_ruled < i_plain < i_gate
    assert '--overrides "${ADJ_STAGE_A}"' in _stage_b_ruled_call()
    assert "ADJ_" not in TEXT[i_plain:i_gate]


def test_the_load_reads_the_published_member_csv_and_nothing_from_the_legacy_repository() -> None:
    # One script reads the legacy repository, the refresh. A load that reached for
    # the dump would build members from data nobody vetted, and one that read a
    # leftover working copy would load a previous run's members.
    assert ('PUBLISHED_CSV="${REPO_ROOT}/footbag_private_repo/legacy-publish/'
            'legacy_members.csv"') in TEXT
    intake = TEXT[TEXT.index("==> intake: backfill is_hof / is_bap"):]
    intake = intake[:intake.index("\n\n")]
    assert '--members-csv "${PUBLISHED_CSV}"' in intake
    assert '--out "${CSV}"' in intake
    for needle in ("footbag_legacy_repo", "FOOTBAG_LEGACY_REPO", "_dump_parser",
                   "latest.sql", "extract_legacy_members.py", "extract_legacy_admins.py"):
        assert needle not in TEXT, needle


def test_a_missing_published_csv_refuses_before_anything_runs() -> None:
    # A load that exits 0 with nothing to load passes the deploy as a success and
    # ships a database with no members in it.
    i_guard = TEXT.index('if [[ ! -s "${PUBLISHED_CSV}" ]]')
    guard = TEXT[i_guard:TEXT.index("db_has_historical_persons; then", i_guard)]
    assert "REFUSING" in guard
    assert "publish_legacy_repo_data.py" in guard
    assert "exit 1" in guard
    assert "exit 0" not in guard
    assert i_guard < TEXT.index("==> intake: backfill is_hof / is_bap")
    assert i_guard < TEXT.index("==> validate export (hard gate)")


def test_the_board_flag_and_cutover_date_come_only_from_the_published_csv() -> None:
    # Both are fixed at publish. A roster file or a date resolved here could
    # disagree with the CSV and give the claim a board flag or an annual standing
    # the published record does not carry.
    for needle in ("board_at_cutover.csv", "BOARD_ROSTER", "--board-roster",
                   "CUTOVER_DATE", "FOOTBAG_CUTOVER_DATE"):
        assert needle not in TEXT, needle
    # The board count is reported from the CSV being loaded, and refuses nothing:
    # a delivery whose roster is not current carries no board row by design.
    i_report = TEXT.index("CSV_BOARD_ROWS=")
    report = TEXT[i_report:TEXT.index("==> validate export (hard gate)")]
    assert "legacy_was_board_at_cutover" in report
    assert "exit" not in report


def test_removed_flags_are_refused_rather_than_ignored() -> None:
    # A script or a note that still passes one must be corrected, not silently
    # given a different load.
    for flag in ("--extract", "--from-csv", "--final-export"):
        assert f"{flag} no longer exists" in TEXT, flag
        start = TEXT.index(f"{flag})")
        assert "exit 2" in TEXT[start:start + 600], flag


def test_the_private_inputs_resolve_themselves_and_no_variable_names_a_path() -> None:
    # A production load refused because an operator had not exported a variable
    # naming a path inside the private checkout. The refusal was right and the
    # remedy was wrong: every operator command in this tree is a canonical script
    # invocation, and no command carries a path. The three files always sit
    # together in the private checkout, reached through the repo-root symlink that
    # extract_legacy_estate.py, derive_vote_tallies.py,
    # build_group_disposition_worksheet.py, fetch_group_files.py and
    # verify_mirror.sh already use, so the runner resolves them the same way.
    assert 'PRIVATE_OVERRIDES="${REPO_ROOT}/footbag_private_repo/private_data/stage_a_overrides"' in TEXT
    # Resolved once, before the readiness checks that read it.
    assert TEXT.index("PRIVATE_OVERRIDES=") < TEXT.index("ADJUDICATIONS_READY=0")
    # And there is no way left to name the location. A variable that overrides it
    # is the same defect wearing a default: the path becomes something a human can
    # get wrong, and a load can silently apply a different set of rulings than the
    # one the checkout holds.
    assert "FOOTBAG_MEMBER_ADJUDICATIONS_DIR" not in TEXT
    assert "FOOTBAG_BOARD_ROSTER" not in TEXT


def test_the_refusals_name_the_symlink_rather_than_a_variable_to_export() -> None:
    # Telling an operator to set a variable is the shape this change removed. On a
    # maintainer machine the files are already there and the run finds them; the
    # only machine that can still refuse is one without the private checkout, and
    # what that machine needs is the symlink, which is what the message should say.
    for marker in ("REFUSING a production load",
                   "REFUSING. The published member CSV is missing."):
        start = TEXT.index(marker)
        message = TEXT[start:start + 900]
        assert "footbag_private_repo" in message, marker
        assert "Set FOOTBAG_" not in message, marker


def test_every_run_reports_the_resolved_path_whether_it_found_the_inputs_or_not() -> None:
    # An input resolved silently is as hard to audit as one that silently stayed
    # unset, and the absent case is the one that matters: a run that applied no
    # rulings must say where it looked, or the lesser load it produced is
    # indistinguishable afterwards.
    assert "account rulings:" in TEXT
    assert 'NOT APPLIED (nothing readable at ${PRIVATE_OVERRIDES}' in TEXT
    assert 'applied from ${PRIVATE_OVERRIDES}' in TEXT
