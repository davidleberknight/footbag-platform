"""
test_age_group_winner_lines.py
==============================

Some result pages list one winner per age group under a division header:

    Novice Consecutives
    Teen:        <name> (88)
    Youth Boys:  <name> (5)
    Youth Girls: <name> (3)

Each line is an age group's winner, its own sub-division, not 1st, 2nd and 3rd of
one division. The label is the sub-division; it is never the competitor's name.

Run from repo root:
    python -m pytest legacy_data/tests/test_age_group_winner_lines.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CANON = REPO_ROOT / "legacy_data" / "pipeline" / "02_canonicalize_results.py"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


canon = _load("canon_age_groups", CANON)

TEXT = """Novice Consecutives
Teen:\t\tAlpha Player (88)
Youth Boys:\tBeta Player (5)
Youth Girls: \tGamma Player (3)"""


def _by_division(text):
    records, _ = canon.parse_results_text(text, "2006_age_test", "freestyle")
    out = {}
    for r in records:
        out.setdefault(r["division_raw"], []).append((r["place"], r["player1_name"]))
    return out


def test_each_age_group_winner_is_its_own_first_place():
    # Defect caught: an age label shown as the winner's name, and the other age
    # groups' winners dropped without a trace.
    assert _by_division(TEXT) == {
        "Novice Consecutives - Teen": [(1, "Alpha Player")],
        "Novice Consecutives - Youth Boys": [(1, "Beta Player")],
        "Novice Consecutives - Youth Girls": [(1, "Gamma Player")],
    }


def test_an_ordinary_division_under_a_header_is_unchanged():
    # Defect caught: the age-group rule swallowing a normal numbered division.
    assert _by_division("Open Freestyle\n1. Alpha Player\n2. Beta Player") == {
        "Open Freestyle": [(1, "Alpha Player"), (2, "Beta Player")]}


def test_a_line_no_rule_reads_is_counted():
    # Defect caught: result lines dropped with nothing recording that they were.
    canon.UNPARSED_RESULT_LINES.clear()
    canon.parse_results_text("Open Freestyle\n1. Alpha Player\nsee you all next year",
                             "2006_count_test", "freestyle")
    assert canon.UNPARSED_RESULT_LINES["2006_count_test"] >= 1
