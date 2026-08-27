"""The encoding repair's audited result for the delivered members dump.

Separate from the behaviour tests on purpose. Those fix the rules and hold for
any source; these count what the rules find in the dump currently delivered, so
a later delivery can legitimately change every number here without any rule
having weakened. When that happens the counts below are re-audited and updated,
which is the point of holding them apart.

The dump is operator-supplied and reachable only where a maintainer has put it,
so these skip where it is absent. A run that declares it owns one fails instead.
"""
import csv
import importlib.util
import os
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _ROOT / "legacy_data" / "member_data_scripts" / "extract_legacy_members.py"
_spec = importlib.util.spec_from_file_location("extract_legacy_members_delivery", _SCRIPT)
elm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(elm)

REQUIRE_ENV = "FOOTBAG_REQUIRE_DUMP"

# The audited result for the delivery in hand. Every figure is a property of that
# dump, not of the extractor.
AFFECTED_NAME_MEMBERS = 161
BY_CLEAN_COMPANION = 131
BY_REVERSAL = 6
BY_UNDAMAGED_COMPANION = 2
BLOCKED_IN_REPAIR_CLASS = 0
AFFECTED_CITY_MEMBERS = 0
# Members whose name is decoded through a codepage a curator recorded for them,
# after a ruling on the values no automatic rule could resolve. Purely additive:
# every figure above is what it was before that ruling, because the curated route
# reaches only the fields the curator named and those fields had no other route.
BY_CURATED_CODEPAGE = 26
# Counted per field value, not per member, and deliberately not added to the
# figures above: some of these members had a different field repaired
# successfully in the same run.
RESIDUAL_PROBLEM_VALUES = 5
RESIDUAL_PROBLEM_MEMBERS = 5

# Two members whose name is recovered from an intact companion column because
# the preferred value carries a destroyed character. Named individually because
# they are the whole of that class in this delivery.
RECOVERED_FROM_COMPANION = {
    "37326": "Aleksi Öhman",
    "81189": "Ulrike Häßler",
}


def _members_dump() -> Path:
    from _dump_parser import resolve_dump_root  # noqa: E402

    root = resolve_dump_root()
    candidate = root / "members" / "backups" / "latest.sql" if root else None
    if candidate is None or not candidate.is_file():
        reason = (
            "the delivered members dump is not on this machine "
            "(expected <legacy repository>/members/backups/latest.sql, reached "
            "through the repo-root footbag_legacy_repo symlink)"
        )
        if os.environ.get(REQUIRE_ENV, "").strip() == "1":
            pytest.fail(f"{REQUIRE_ENV}=1 declares this run owns a dump: {reason}")
        pytest.skip(reason)
    return candidate


@pytest.fixture(scope="module")
def extraction(tmp_path_factory):
    import sys

    sys.path.insert(0, str(_SCRIPT.parent))
    dump = _members_dump()
    out_dir = tmp_path_factory.mktemp("delivery")
    stats = elm.extract(dump, out_dir / "legacy_members_extract.csv")
    return stats, out_dir


def test_name_repair_breakdown_matches_the_audited_delivery(extraction):
    stats, _ = extraction
    repair = stats["name_repair"]
    assert stats["name_members_repaired"] == AFFECTED_NAME_MEMBERS
    assert repair[elm.SELECTED_COMPANION] == BY_CLEAN_COMPANION
    assert repair[elm.SELECTED_REVERSED] == BY_REVERSAL
    assert repair[elm.SELECTED_UNDAMAGED] == BY_UNDAMAGED_COMPANION
    assert repair[elm.SELECTED_LEFT] == BLOCKED_IN_REPAIR_CLASS
    assert repair[elm.SELECTED_CURATED] == BY_CURATED_CODEPAGE
    assert stats["name_members_by_curated_codepage"] == BY_CURATED_CODEPAGE


def test_no_city_value_needs_repair_in_this_delivery(extraction):
    stats, _ = extraction
    city = stats["city_repair"]
    assert (city[elm.SELECTED_COMPANION] + city[elm.SELECTED_REVERSED]
            + city[elm.SELECTED_UNDAMAGED] + city[elm.SELECTED_LEFT]) == AFFECTED_CITY_MEMBERS


def test_residual_problems_are_reported_separately_and_unmodified(extraction):
    stats, out_dir = extraction
    problems = out_dir / "legacy_members_encoding_problems.csv"
    assert problems.is_file()
    rows = list(csv.DictReader(problems.open(encoding="utf-8")))
    assert stats["encoding_problems"] == RESIDUAL_PROBLEM_VALUES
    assert len(rows) == RESIDUAL_PROBLEM_VALUES
    assert len({r["legacy_member_id"] for r in rows}) == RESIDUAL_PROBLEM_MEMBERS
    # The inventory records both stored spellings so a follow-up ruling has the
    # evidence, and neither is rewritten in it.
    extract_rows = {
        r["legacy_member_id"]: r for r in csv.DictReader(
            (out_dir / "legacy_members_extract.csv").open(encoding="utf-8"))
    }
    for r in rows:
        assert r["stored_unicode_column"] or r["stored_plain_column"], r
        assert r["reason"], r
        if r["column"] not in ("MemberFirstName", "MemberMiddleName", "MemberLastName"):
            continue
        # The damage is still visible in the output. A value here may have been
        # repaired as far as the evidence allows and still be listed: removing a
        # double-encoding does not restore a character the legacy system
        # destroyed, and the question mark it left is never filled in.
        name = extract_rows[r["legacy_member_id"]]["real_name"]
        assert "?" in name, (r, name)


def test_a_partly_repaired_value_is_still_listed_as_unresolved(extraction):
    # This member's name was double-encoded AND carries a character the legacy
    # system destroyed. The double-encoding is repaired; the destroyed character
    # cannot be, so the value appears in the output repaired as far as the
    # evidence allows and in the inventory as still unresolved. Counting it only
    # as a success would overstate what this pass achieved.
    _, out_dir = extraction
    rows = {
        r["legacy_member_id"]: r for r in csv.DictReader(
            (out_dir / "legacy_members_extract.csv").open(encoding="utf-8"))
    }
    assert rows["83072"]["real_name"] == "Marek Barnabá?"
    listed = [
        r for r in csv.DictReader(
            (out_dir / "legacy_members_encoding_problems.csv").open(encoding="utf-8"))
        if r["legacy_member_id"] == "83072"
    ]
    assert len(listed) == 1
    assert listed[0]["resolution"] == elm.SELECTED_COMPANION
    assert listed[0]["stored_unicode_column"] == "BarnabÃ¡?"


def test_residual_count_is_not_folded_into_the_repair_population(extraction):
    stats, out_dir = extraction
    rows = list(csv.DictReader(
        (out_dir / "legacy_members_encoding_problems.csv").open(encoding="utf-8")))
    # The two populations are counted differently and overlap: a member can have
    # one field repaired and another left in the inventory. Asserting the overlap
    # exists is what stops the two numbers being read as one.
    assert len({r["legacy_member_id"] for r in rows}) != stats["name_members_repaired"]


def test_the_two_companion_recoveries_reach_the_output(extraction):
    _, out_dir = extraction
    rows = {
        r["legacy_member_id"]: r for r in csv.DictReader(
            (out_dir / "legacy_members_extract.csv").open(encoding="utf-8"))
    }
    for member_id, expected in RECOVERED_FROM_COMPANION.items():
        assert rows[member_id]["real_name"] == expected


def test_two_runs_over_the_unchanged_dump_are_byte_identical(tmp_path):
    import sys

    sys.path.insert(0, str(_SCRIPT.parent))
    dump = _members_dump()
    first, second = tmp_path / "a", tmp_path / "b"
    elm.extract(dump, first / "legacy_members_extract.csv")
    elm.extract(dump, second / "legacy_members_extract.csv")
    for name in ("legacy_members_extract.csv", "legacy_members_encoding_problems.csv"):
        assert (first / name).read_bytes() == (second / name).read_bytes(), name


def test_no_repaired_name_still_carries_a_double_encoding(extraction):
    _, out_dir = extraction
    for row in csv.DictReader((out_dir / "legacy_members_extract.csv").open(encoding="utf-8")):
        name = row["real_name"]
        if not name:
            continue
        assert elm._undouble(name) is None or "?" in name, row["legacy_member_id"]
