"""Pins the duplicate-club roster MERGE in
``legacy_data/clubs/scripts/03_build_legacy_person_club_affiliations.py``.

The duplicate-clubs override (``overrides/club_duplicates.csv``) drops one of two
mirror-derived rows for the same real club. Dropping alone discards the dropped
row's roster. The merge re-points the dropped club's affiliations onto its keep
club so the keep club absorbs the roster, preserves the original key in
``merged_from_club_key`` for audit, and collapses a resolved person duplicated
across the two source clubs. Identity is taken from the already-resolved
``matched_person_id``; the merge never re-resolves names. Unmatched / conflict
rows union untouched. A drop key whose keep key is not a real club raises rather
than silently orphaning the roster.
"""
import importlib.util
import sys
from pathlib import Path

import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MOD_PATH = REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "03_build_legacy_person_club_affiliations.py"


def _mod():
    spec = importlib.util.spec_from_file_location("affil_03", MOD_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["affil_03"] = module
    spec.loader.exec_module(module)
    return module


m = _mod()


def test_load_keep_map_parses_drop_to_keep(tmp_path):
    p = tmp_path / "dup.csv"
    p.write_text("keep_legacy_key,drop_legacy_key,reason\nKEEP,DROP,because\n,,\nK2,D2,x\n", encoding="utf-8")
    assert m.load_duplicate_keep_map(p) == {"DROP": "KEEP", "D2": "K2"}


def test_load_keep_map_missing_file_is_empty(tmp_path):
    assert m.load_duplicate_keep_map(tmp_path / "nope.csv") == {}


def test_repoint_moves_drop_to_keep_and_records_audit():
    df = pd.DataFrame({"club_key": ["KEEP", "DROP", "OTHER"], "matched_person_id": ["p1", "p2", "p3"]})
    out = m.repoint_duplicates(df.copy(), {"DROP": "KEEP"}, {"KEEP", "OTHER"})
    assert list(out["club_key"]) == ["KEEP", "KEEP", "OTHER"]
    assert list(out["merged_from_club_key"]) == ["", "DROP", ""]   # only the re-pointed row carries the origin


def test_repoint_empty_map_is_noop():
    df = pd.DataFrame({"club_key": ["A"], "matched_person_id": ["p"]})
    out = m.repoint_duplicates(df.copy(), {}, {"A"})
    assert list(out["club_key"]) == ["A"]
    assert list(out["merged_from_club_key"]) == [""]


def test_repoint_raises_actionable_on_dangling_keep():
    df = pd.DataFrame({"club_key": ["DROP"], "matched_person_id": ["p"]})
    with pytest.raises(ValueError, match="dangling"):
        m.repoint_duplicates(df.copy(), {"DROP": "MISSINGKEEP"}, {"OTHER"})


def test_repoint_dangling_ignored_when_drop_has_no_affiliations():
    # A missing keep is only dangerous when the drop actually carries a roster.
    df = pd.DataFrame({"club_key": ["OTHER"], "matched_person_id": ["p"]})
    out = m.repoint_duplicates(df.copy(), {"DROP": "MISSINGKEEP"}, {"OTHER"})
    assert list(out["club_key"]) == ["OTHER"]


def test_dedupe_collapses_same_person_keeping_highest_score():
    df = pd.DataFrame({
        "club_key": ["KEEP", "KEEP"],
        "matched_person_id": ["p1", "p1"],
        "affiliation_confidence_score": [0.7, 0.9],
    })
    out = m.dedupe_resolved(df)
    assert len(out) == 1
    assert float(out.iloc[0]["affiliation_confidence_score"]) == 0.9


def test_dedupe_keeps_distinct_persons_and_unions_unmatched():
    df = pd.DataFrame({
        "club_key": ["KEEP", "KEEP", "KEEP", "KEEP"],
        "matched_person_id": ["p1", "p2", "", ""],
        "affiliation_confidence_score": [0.9, 0.9, 0.5, 0.5],
    })
    out = m.dedupe_resolved(df)
    assert len(out) == 4   # two distinct resolved + two unmatched unioned, never person-deduped


def test_merge_end_to_end_keep_absorbs_drop_roster():
    # KEEP has p1; DROP has p1 (duplicate person), p2 (unique), and one unmatched row.
    df = pd.DataFrame({
        "club_key": ["KEEP", "DROP", "DROP", "DROP"],
        "matched_person_id": ["p1", "p1", "p2", ""],
        "affiliation_confidence_score": [0.7, 0.9, 0.9, 0.5],
    })
    out = m.dedupe_resolved(m.repoint_duplicates(df.copy(), {"DROP": "KEEP"}, {"KEEP"}))
    assert set(out["club_key"]) == {"KEEP"}                                  # everything under the keep club
    assert len(out) == 3                                                     # p1 (collapsed) + p2 + 1 unmatched
    p1 = out[out["matched_person_id"] == "p1"]
    assert float(p1.iloc[0]["affiliation_confidence_score"]) == 0.9          # highest-confidence p1 survives
    assert "p2" in set(out["matched_person_id"])                            # unique drop-side person preserved
    assert int((out["matched_person_id"] == "").sum()) == 1                 # unmatched row preserved
