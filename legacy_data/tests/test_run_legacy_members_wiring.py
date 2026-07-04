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


def test_apply_is_not_wired() -> None:
    # No load --apply remains anywhere: applying the reviewed proposals and the
    # member rows is a separate, human-approved step.
    assert "--apply" not in TEXT


def test_passing_gate_stops_cleanly_without_writing() -> None:
    i_qc = TEXT.index('reconcile_legacy_members.py" --qc-gate')
    tail = TEXT[i_qc:]
    assert "reconciliation complete and the QC gate passed" in tail
    assert "Apply is not wired yet" in tail
    # The clean stop after the gate is an explicit exit, not a fall-through.
    assert "exit 0" in tail


def test_reconciliation_runs_inside_the_load_block() -> None:
    i_load = TEXT.index('if [[ "${DO_LOAD}" -eq 1 ]]')
    i_stage_a = TEXT.index('reconcile_legacy_members.py" --stage-a')
    assert i_load < i_stage_a
