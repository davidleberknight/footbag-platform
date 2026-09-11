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
    them, while an ordinary load never depends on them.
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
    # The honors backfill runs at extract time (no proposals) and again in --load
    # after Stage B, overlaying the proposed links so accounts linked by a
    # proposal receive their honor flags.
    assert TEXT.count("extract_legacy_honors.py") >= 2
    i_stage_b = TEXT.index('reconcile_legacy_members.py" --stage-b')
    i_qc = TEXT.index('reconcile_legacy_members.py" --qc-gate')
    i_honors_rerun = TEXT.index("--proposed-links")
    assert i_stage_b < i_honors_rerun
    assert i_qc < i_honors_rerun


def test_dry_run_short_circuits_before_the_honors_rerun() -> None:
    # The --all-data build previews with --load --dry-run, which must exit before
    # the post-Stage-B honors re-run.
    i_dry_exit = TEXT.index("dry-run complete")
    i_honors_rerun = TEXT.index("--proposed-links")
    assert i_dry_exit < i_honors_rerun


# The automatic merge fuses accounts sharing an exact name and a full birth date.
# Human rulings both add merges that rule cannot see and forbid merges it would
# otherwise make, so a production load that runs without them merges people ruled
# to be distinct and leaves one of them holding an account nobody can claim.

def test_final_merge_applies_the_recorded_account_rulings() -> None:
    merge_call = TEXT[TEXT.index('reconcile_legacy_members.py" --final-merge'):]
    merge_call = merge_call[:merge_call.index("LOAD_CSV=")]
    assert '--overrides "${ADJ_STAGE_A}"' in merge_call
    assert '--entitlement-dispositions "${ADJ_ENTITLEMENTS}"' in merge_call
    # Both paths are built once, where the readiness check reads them, so the
    # check and the call cannot disagree about which files a run actually applied.
    assert 'ADJ_STAGE_A="${PRIVATE_OVERRIDES}/stage_a_adjudication.csv"' in TEXT
    assert 'ADJ_ENTITLEMENTS="${PRIVATE_OVERRIDES}/entitlement_dispositions.csv"' in TEXT


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
    # refuse is one without the private checkout. The measurement date defaults to
    # today, so it is not a thing anyone can forget to set, and how old a dump is
    # worth loading stays the operator's call rather than a gate.
    assert "footbag_private_repo" in guard
    assert 'CUTOVER_DATE="${FOOTBAG_CUTOVER_DATE:-$(date -u +%F)}"' in TEXT
    assert "max-dump-age" not in TEXT


def test_the_rulings_are_applied_whenever_they_are_present() -> None:
    # Local and CI machines hold no private rulings, so an ordinary load must not
    # depend on them; but a machine that has them applies them without being
    # asked, because an opt-in flag is what let a development-shaped load reach
    # production unnoticed.
    assert 'ADJUDICATIONS_READY=1' in TEXT
    assert TEXT.index('if [[ "${ADJUDICATIONS_READY}" -eq 1 ]]') < \
        TEXT.index('reconcile_legacy_members.py" --final-merge')
    # The rulings reach the final merge and nothing earlier: Stage B proposes links
    # mechanically and the quality gate reads its output, so handing either the
    # rulings would make the gate judge a result already adjudicated.
    stage_b_call = TEXT[TEXT.index('reconcile_legacy_members.py" --stage-b'):
                        TEXT.index('reconcile_legacy_members.py" --qc-gate')]
    assert "--overrides" not in stage_b_call
    assert "ADJ_STAGE_A" not in stage_b_call


def test_the_board_roster_is_resolved_and_passed_by_the_runner() -> None:
    # Nothing in the dump records who sits on the board, so the roster is an
    # operator-supplied input like the rulings. It must be resolved and reported
    # by the runner and handed to the extractor as an argument: relying on the
    # extractor's own environment lookup makes it an input that takes effect only
    # when a variable happens to be exported, and whose absence nothing reports.
    assert 'BOARD_ROSTER="${PRIVATE_OVERRIDES}/board_at_cutover.csv"' in TEXT
    assert "BOARD_ROSTER_READY=1" in TEXT
    extract_call = TEXT[TEXT.index("extract_legacy_members.py"):]
    extract_call = extract_call[:extract_call.index("extract_legacy_admins.py")]
    assert "--board-roster" in extract_call
    assert "board roster:" in TEXT          # every extract run says whether it had one


def test_production_extract_refuses_without_the_board_roster() -> None:
    # A director loaded without the flag is an ordinary member, and the database
    # that results looks entirely normal, so this refuses rather than degrading.
    # Only at extraction, because that is where the flag is written into the CSV.
    i_guard = TEXT.index('"${BOARD_ROSTER_READY}" -eq 0')
    guard = TEXT[i_guard:TEXT.index("==> member intake:")]
    assert "REFUSING a production extract" in guard
    assert "footbag_private_repo" in guard
    assert "exit 1" in guard
    assert '"${DO_EXTRACT}" -eq 1' in TEXT[i_guard - 200:i_guard]


def test_rulings_without_a_roster_are_refused_before_any_stage_runs() -> None:
    # Supplying the rulings turns on the final merge, and that merge will not
    # build its artifacts while no row carries the board flag. Left to itself the
    # run walks every stage and the quality gate first and then aborts from inside
    # the merge, naming a column instead of the file nobody set. Both doors into
    # that dead end refuse ahead of any work: the extract that would bake a
    # roster-less CSV, and the load handed one that was.
    i_extract_guard = TEXT.index(
        'if [[ "${ADJUDICATIONS_READY}" -eq 1 && "${DO_EXTRACT}" -eq 1 '
        '&& "${BOARD_ROSTER_READY}" -eq 0 ]]')
    assert i_extract_guard < TEXT.index("==> extract: members from the dump")
    extract_guard = TEXT[i_extract_guard:TEXT.index("==> member intake:")]
    assert "footbag_private_repo" in extract_guard
    assert "exit 1" in extract_guard

    i_csv_guard = TEXT.index('if [[ "${ADJUDICATIONS_READY}" -eq 1 && "${CSV_BOARD_ROWS}" -eq 0 ]]')
    assert i_csv_guard < TEXT.index("==> validate export (hard gate)")
    csv_guard = TEXT[i_csv_guard:TEXT.index("==> validate export (hard gate)")]
    assert "REFUSING" in csv_guard
    assert "exit 1" in csv_guard


def test_a_load_reports_the_board_flag_from_the_csv_it_is_about_to_load() -> None:
    # The flag was decided at extraction and is baked into the CSV, so the roster
    # variable says nothing about a load. Reporting it from the variable would
    # tell an operator their roster took effect on a run that never read it.
    i_report = TEXT.index("CSV_BOARD_ROWS=")
    assert i_report < TEXT.index("==> validate export (hard gate)")
    assert "legacy_was_board_at_cutover" in TEXT[i_report:i_report + 600]
    assert "board roster:" in TEXT[i_report:i_report + 900]


def test_the_retired_mode_flag_is_refused_rather_than_ignored() -> None:
    # A script or a note that still passes it must be corrected, not silently
    # downgraded to a development load.
    assert "--final-export no longer exists" in TEXT


def test_the_help_promises_the_dump_age_only_where_a_dump_is_read() -> None:
    # Only an extract has a dump in front of it. A promise that every run prints
    # the dump's date and age reads as a staleness safeguard on a load that has
    # no way to look, which is exactly the reassurance nothing gates on timing.
    usage = TEXT[TEXT.index("DEPLOY_TARGET=footbag-production"):TEXT.index("\nUSAGE")]
    assert "an extract\n" in usage
    assert "prints no age" in usage
    assert "every run" not in usage


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
                   "REFUSING a production extract",
                   "REFUSING. The account rulings are present and the board roster is not."):
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
