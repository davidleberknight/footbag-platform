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
  * apply is not wired: no load --apply remains, and a passing gate stops
    cleanly without writing;
  * the reconciliation runs inside the --load block.
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
    i_member_apply = TEXT.index('load_legacy_export.py" --export "${RECONCILED_CSV}"')
    assert i_default_stop < i_member_apply       # the read-only stop precedes the writers
    tail = TEXT[TEXT.index('reconcile_legacy_members.py" --qc-gate'):i_member_apply]
    assert "Re-run with --apply to write" in tail
    assert "exit 0" in tail                      # explicit read-only stop, not fall-through


def test_apply_writes_are_guarded_by_the_apply_flag() -> None:
    # Both real writes sit after the DO_APPLY check, so nothing writes by default.
    i_apply_gate = TEXT.index('if [[ "${DO_APPLY}" -eq 0 ]]')
    i_member_apply = TEXT.index('load_legacy_export.py" --export "${RECONCILED_CSV}"')
    i_link_apply = TEXT.index('apply_reconciled_links.py')
    assert i_apply_gate < i_member_apply
    assert i_apply_gate < i_link_apply


def test_apply_loads_members_before_applying_links() -> None:
    # The member rows must exist before the links that reference them are written.
    i_member_apply = TEXT.index('load_legacy_export.py" --export "${RECONCILED_CSV}"')
    i_link_apply = TEXT.index('apply_reconciled_links.py')
    assert i_member_apply < i_link_apply


def test_member_snapshot_runs_before_the_member_load() -> None:
    # The rollback snapshot of legacy_members is captured before the load
    # overwrites those rows, and only inside the --apply path.
    i_apply_gate = TEXT.index('if [[ "${DO_APPLY}" -eq 0 ]]')
    i_snapshot = TEXT.index('snapshot_legacy_members.py')
    i_member_apply = TEXT.index('load_legacy_export.py" --export "${RECONCILED_CSV}"')
    assert i_apply_gate < i_snapshot < i_member_apply


def test_apply_runs_after_stage_b_qc_and_honors() -> None:
    i_qc = TEXT.index('reconcile_legacy_members.py" --qc-gate')
    i_honors_rerun = TEXT.index("--proposed-links")
    i_member_apply = TEXT.index('load_legacy_export.py" --export "${RECONCILED_CSV}"')
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
