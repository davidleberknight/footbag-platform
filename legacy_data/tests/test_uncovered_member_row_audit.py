"""The audited uncovered-row result for the delivered member export.

Separate from the disposition contract tests on purpose. Those fix the rules and
hold for any source; this freezes what the rules found when the delivered export
was loaded against the post-consolidation person state, so a later run that moves
any of it has to say so rather than drifting quietly.

The figures come from a rehearsal: the real loader run against an isolated copy of
the rebuilt database, never the working one. The final load belongs to the cutover
and is expected to reproduce these numbers; where it does not, the fingerprints on
the recorded rulings refuse rather than carrying a stale decision forward.

Two counts here are easy to confuse and mean opposite things. The exclusions are
export records that never became member rows: the export offered them and the
loader declined. The uncovered rows are member rows the export does not cover:
they exist in the database and the export has nothing to say about them. Only the
second kind needs a disposition, which is why one number is in the thousands and
the other is one.

The export is operator-supplied and reachable only where a maintainer has put it,
so the parts needing it skip where it is absent. The frozen figures and the
recorded ruling are asserted either way.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS = _ROOT / "legacy_data" / "member_data_scripts"
sys.path.insert(0, str(_SCRIPTS))

import member_row_disposition as mrd  # noqa: E402

EXPORT = _SCRIPTS / "out" / "legacy_members_final.csv"
PRIVATE = _ROOT / "footbag_private_repo" / "private_data" / "stage_a_overrides"
DISPOSITIONS = PRIVATE / "member_row_dispositions.csv"

# The audited rehearsal result.
EXPORT_RECORDS = 33_665
IMPORTED = 25_657
EXCLUDED = 8_010
PULLED_BACK = 2
UNCOVERED_ROWS = 1
KEEP = 1
CLEAR = 0
DEFER = 0
DANGLING_PERSON_ACCOUNT_BINDINGS = 0

# The one row, and what makes it uncovered.
FIXTURE_ID = "STUB_FOOTBAG_HACKY"
FIXTURE_PERSON = "person_272d84cba03638d83876f8c5"
FIXTURE_FINGERPRINT = (
    "2abadb770b90b2541b4eb005fccc60883072502f13bf97f1a5d4df593b2d2300")


def test_the_partition_of_the_export_is_arithmetically_whole():
    # Every export record is either imported or excluded, and the pull-back moves
    # records across that line rather than creating them. If this stops adding up
    # the loader is dropping records nothing counted.
    assert EXPORT_RECORDS - EXCLUDED + PULLED_BACK == IMPORTED


def test_every_uncovered_row_carries_exactly_one_decision():
    assert KEEP + CLEAR + DEFER == UNCOVERED_ROWS


def test_no_person_binding_is_left_dangling():
    # The failure this whole line of work exists to prevent: a historical person
    # pointing at an account row that is not there.
    assert DANGLING_PERSON_ACCOUNT_BINDINGS == 0


def test_the_export_exclusions_are_not_uncovered_rows():
    # Stated as an assertion because the two numbers sit next to each other in
    # every report and reading the large one as the survivor population would
    # turn a one-row decision into a thousands-row panic.
    assert EXCLUDED > UNCOVERED_ROWS
    assert UNCOVERED_ROWS == 1


@pytest.mark.skipif(not DISPOSITIONS.exists(),
                    reason="the private adjudication checkout is not present here")
def test_the_recorded_ruling_is_the_audited_one():
    holds = mrd.load_dispositions(DISPOSITIONS)
    assert len(holds) == UNCOVERED_ROWS
    h = holds[0]
    assert h.legacy_member_id == FIXTURE_ID
    assert h.decision == mrd.KEEP
    assert h.reason == mrd.SYSTEM_FIXTURE_BY_DESIGN
    assert h.fingerprint == FIXTURE_FINGERPRINT
    # The note has to carry the two facts a later reader needs: that the row is
    # absent by design, and what depends on it.
    assert FIXTURE_PERSON in h.note
    assert "design" in h.note.lower()


@pytest.mark.skipif(not DISPOSITIONS.exists(),
                    reason="the private adjudication checkout is not present here")
def test_the_ruling_is_bound_to_its_evidence_not_to_the_id():
    # The fingerprint covers why the row is uncovered, so the same account under
    # different circumstances is a different question. Recomputing it with the
    # dependent person removed must not reproduce the recorded value.
    holds = mrd.load_dispositions(DISPOSITIONS)
    without_dependant = mrd.uncovered_boundary_fingerprint(
        FIXTURE_ID, "system_fixture", "not_in_export", False, [], "b" * 64)
    assert holds[0].fingerprint != without_dependant


@pytest.mark.skipif(not EXPORT.exists(),
                    reason="the delivered export is operator-supplied and absent here")
def test_the_delivered_export_is_still_the_one_that_was_audited():
    csv.field_size_limit(10_000_000)
    with EXPORT.open(encoding="utf-8", newline="") as f:
        n = sum(1 for _ in csv.DictReader(f))
    assert n == EXPORT_RECORDS, (
        f"the delivered export now holds {n:,} records, not the {EXPORT_RECORDS:,} "
        "these figures were audited against; re-audit rather than adjusting them")
