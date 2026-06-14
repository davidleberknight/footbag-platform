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
