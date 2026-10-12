"""Tests for consecutive-discipline score extraction (canonical event-results export).

Pins the kick-count recovery the export stage uses to fill score_text: a trailing
count is captured (parenthesised, bare, or dash-prefixed) for consecutive
disciplines, while name-only placements, location parentheses, and generic point
totals yield no count. The discipline gate that separates a meaningful kick count
from a generic point total is also pinned.
"""
import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MOD = REPO_ROOT / "legacy_data" / "pipeline" / "historical" / "score_extraction.py"
_spec = importlib.util.spec_from_file_location("score_extraction", MOD)
se = importlib.util.module_from_spec(_spec)
sys.modules["score_extraction"] = se
_spec.loader.exec_module(se)


def test_parenthesised_count_extracted():
    assert se.extract_consecutive_count("Michael Marczyk (256)") == "256"
    assert se.extract_consecutive_count("Eric Wulff (6164)") == "6164"


def test_bare_and_dash_prefixed_count_extracted():
    assert se.extract_consecutive_count("Jeff Wells 532") == "532"
    assert se.extract_consecutive_count("Dyalan Govender - 412") == "412"
    assert se.extract_consecutive_count("Katrina Schultz - 242") == "242"


def test_noise_prefixes_do_not_block_the_trailing_count():
    assert se.extract_consecutive_count("rh Place Chris Burkhart (26)") == "26"


def test_name_only_placement_has_no_count():
    assert se.extract_consecutive_count("Alex Spears") is None
    assert se.extract_consecutive_count("tie Michael Lopez") is None
    assert se.extract_consecutive_count("") is None


def test_location_parentheses_are_not_a_count():
    # A trailing place/location parenthetical is not digits -> no count.
    assert se.extract_consecutive_count("Mitch Carlsen (Augusta, GA)") is None


def test_generic_point_total_is_not_captured_as_a_trailing_count():
    # "16 pts" does not end in a bare/parenthesised number, so nothing is taken;
    # the discipline gate is the primary guard against point totals, this is a
    # second line of defence on the raw shape.
    assert se.extract_consecutive_count("Mitch Carlsen (Augusta, GA) 16 pts") is None


def test_single_digit_is_ignored():
    # Two-digit minimum avoids capturing a stray place number like a trailing "1".
    assert se.extract_consecutive_count("Some Player 1") is None


def test_discipline_gate_matches_consecutive_keys_only():
    for key in ("open_singles_5_minute_consecutive", "open_timed_consecutives",
                "singles_consecutive_kicks"):
        assert se.CONSECUTIVE_DISCIPLINE_RE.search(key)
    for key in ("open_singles_net", "intermediate_routines", "open_singles_golf"):
        assert not se.CONSECUTIVE_DISCIPLINE_RE.search(key)


def test_curated_scores_keep_their_unit():
    # Defect caught: a golf total or overall points shown as a bare number a
    # visitor would read as kicks, or a kick count gaining a stray unit.
    assert se.curated_score_text("open_5_min_speed_consecutives", "Sean Flynn - 799") == "799"
    assert se.curated_score_text("open_footbag_golf", "Davie Piper - 173") == "173 strokes"
    assert se.curated_score_text("open_overall", "Allan Petersen - 947") == "947 points"


def test_a_third_team_member_is_recovered_from_a_curated_entry():
    # Defect caught: a three-person team published with only two members.
    assert se.curated_extra_team_members(
        "Scott Cleere / Bill Bethurum / Randy Nelson", "Scott Cleere", "Bill Bethurum"
    ) == ["Randy Nelson"]


def test_a_four_person_team_keeps_both_additional_members():
    # Defect caught: the third and fourth members of a sourced four-person team
    # dropped.
    assert se.curated_extra_team_members(
        "Greg Cortopassi / Mag Hughes / Gary Lautt / Jim Caveney", "Greg Cortopassi", "Mag Hughes"
    ) == ["Gary Lautt", "Jim Caveney"]


def test_no_extra_member_unless_the_entry_really_names_them_after_the_kept_pair():
    # Defect caught: a pair, an entry stage 2 split differently, or a garbled
    # line of first names gaining invented team members.
    assert se.curated_extra_team_members("A One / B Two", "A One", "B Two") == []
    assert se.curated_extra_team_members(
        "A One / B Two / C Three", "A One", "Somebody Else") == []
    assert se.curated_extra_team_members(
        "Sandro / Thorsten, Ole / Hannes, Fine", "Sandro", "Thorsten") == []


def test_a_world_record_count_is_read_through_its_designation():
    # Defect caught: a record-setting run losing its kick count because the
    # designation sits between the name and the number.
    assert se.curated_score_text("womens_singles_consecutive_kicks",
                                 "Tricia George [World Record] - 12838") == "12838"
    assert se.WORLD_RECORD_RE.search("Tricia George [World Record] - 12838")
    assert not se.WORLD_RECORD_RE.search("Constance Constable")


def test_team_points_and_distance_counts_keep_their_meaning():
    # Defect caught: a club's team-points total dropped, or shown as a bare
    # number a visitor would read as kicks; a distance one-pass kick count dropped.
    assert se.curated_score_text("team_points", "Illinois Footbag League [Club Standing] - 8087") == "8087 points"
    assert se.curated_score_text("open_doubles_distance_one_pass", "Brent Welch / Alf Marcussen - 246") == "246"


def test_curated_score_needs_a_scoring_discipline_and_a_number():
    # Defect caught: a net result's trailing point total surfacing as a score,
    # or an unscored result gaining one.
    assert se.curated_score_text("open_singles_footbag_net", "Randy Mulder - 15") == ""
    assert se.curated_score_text("open_footbag_golf", "Davie Piper") == ""
