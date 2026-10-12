"""
test_curated_division_headings.py
=================================

A curated results source names every division in its own column, so the block
the adapter hands the parser holds only headings and numbered placements. The
parser's heading guesswork, built for free-text web pages, must not run on it:
a heading it refuses folds that division's placements into the one above, so
two contests publish as one doubles result.

Run from repo root:
    python -m pytest legacy_data/tests/test_curated_division_headings.py -v
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


canon = _load("canonicalize_results_headings", CANON)

# The two 1986 Worlds side contests as the curated adapter emits them. The
# second heading is long and starts with "Footbag", which the free-text
# heading test refuses.
CONTESTS_1986 = """\
Footbag Net Score Keeper's Contest
1. Bud Meltsner - 23
2. Barb Lareau - 18
Footbag Consecutive Counter's Contest
1. Walt Seger - 35172
2. Adam Hutchinson - 30739"""


def _by_division(text, trusted):
    records, _ = canon.parse_results_text(text, "1986_worlds_golden", "worlds",
                                          trusted_headings=trusted)
    out = {}
    for r in records:
        out.setdefault(r["division_raw"], []).append((r["place"], r["player1_name"]))
    return out


def test_a_curated_heading_the_free_text_test_refuses_still_starts_its_division():
    # Defect caught: the Counter's Contest winners published as the second
    # member of each Score Keeper's Contest place, one contest lost.
    divisions = _by_division(CONTESTS_1986, trusted=True)
    assert divisions["Footbag Consecutive Counter's Contest"] == [
        (1, "Walt Seger"), (2, "Adam Hutchinson")]
    assert divisions["Footbag Net Score Keeper's Contest"] == [
        (1, "Bud Meltsner"), (2, "Barb Lareau")]


def test_a_one_word_curated_heading_at_the_top_is_kept():
    # Defect caught: the 1996 Overall standings published under an "Unknown"
    # division because the heading is a single word with no division keyword.
    divisions = _by_division("Overall\n1. Allan Petersen\n2. Peter Shunny", trusted=True)
    assert divisions == {"Overall": [(1, "Allan Petersen"), (2, "Peter Shunny")]}


def test_free_text_pages_keep_the_heading_guesswork():
    # Defect caught: a stray narrative line on a web page becoming a division
    # once headings are trusted everywhere rather than on curated sources only.
    divisions = _by_division("Open Singles Net\n1. A Player\nThanks to all who came\n2. B Player",
                             trusted=False)
    assert list(divisions) == ["Open Singles Net"]
