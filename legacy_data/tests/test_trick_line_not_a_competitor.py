"""
test_trick_line_not_a_competitor.py
===================================

Combo and Sick 3 result pages often write what each competitor threw after their
name: "Name - Legbeater -> Vortex", "Name (DE) - Mobius >". The arrow marks a trick
sequence, and no name carries one. Read as a team separator, the dash made the
trick line a second competitor, turned a singles contest into doubles, and an
exclamation in the trick line dropped the whole placement as narrative.

Run from repo root:
    python -m pytest legacy_data/tests/test_trick_line_not_a_competitor.py -v
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


canon = _load("canon_trick_lines", CANON)


def test_a_trick_line_after_the_name_is_not_a_partner():
    # Defect caught: "Legbeater" published as the competitor's doubles partner.
    assert canon.split_entry("Alpha Player, Town, Finland  - Legbeater -> Vortex") == (
        "Alpha Player, Town, Finland", None, "player")
    assert canon.split_entry("Beta Player (DE) - Mobius >") == ("Beta Player (DE)", None, "player")
    assert canon.split_entry("Gamma Player (PL)- Locomotion >") == ("Gamma Player (PL)", None, "player")
    assert canon.split_entry("Alpha Player / Bedwetter>Frantic Butterfly") == (
        "Alpha Player", None, "player")


def test_real_teams_still_split():
    # Defect caught: the trick rule swallowing a genuine doubles team.
    assert canon.split_entry("Alpha Player / Beta Player") == ("Alpha Player", "Beta Player", "team")
    assert canon.split_entry("Alpha Player - Beta Player") == ("Alpha Player", "Beta Player", "team")
    assert canon.split_entry("Alpha Player / Beta Player - Swirl > Mirage") == (
        "Alpha Player", "Beta Player", "team")


def test_an_exclamation_in_the_trick_line_keeps_the_placement():
    # Defect caught: a contest winner dropped because their trick line ended "!!!".
    text = ("Open Huge Combo\n"
            "1. Alpha Player, Town, Finland  - Ripped warrior -> Pdx blender!!!!!\n"
            "2. Beta Player, Town, Finland  - Legbeater -> Vortex")
    records, _ = canon.parse_results_text(text, "2001_trick_test", "freestyle")
    assert [(r["place"], r["competitor_type"], r["player1_name"]) for r in records] == [
        (1, "player", "Alpha Player, Town, Finland"), (2, "player", "Beta Player, Town, Finland")]


def test_exclamatory_narrative_is_still_skipped_and_counted():
    # Defect caught: excited prose published as a placement, or dropped unrecorded.
    canon.UNPARSED_RESULT_LINES.clear()
    records, _ = canon.parse_results_text(
        "Open Freestyle\n1. Alpha Player\n2. what a great day everyone!", "2001_prose_test", "freestyle")
    assert [r["player1_name"] for r in records] == ["Alpha Player"]
    assert canon.UNPARSED_RESULT_LINES["2001_prose_test"] >= 1
