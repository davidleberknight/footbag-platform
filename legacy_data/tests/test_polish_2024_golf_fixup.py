"""
test_polish_2024_golf_fixup.py
==============================

Pins the pre-parse fixup for the 2024 Polish Footbag Championships Krakow
(event 1727756195) Open Golf division in `pipeline/02_canonicalize_results.py`.

Why this exists. The legacy page prints Open Golf as two score-sorted blocks
split by the divider rule, and the second block restarts its numbering at 1.
Golf is one field ranked by score, so those numbers are positions within a
block, not places. Read literally the parser emits two firsts; sequentialising
the field 1..10 flattens the two genuine ties at 16 and 17 strokes. The
committed canonical output carries the standard competition ranking, so without
the fixup a rebuild silently reverts it — which is exactly the class of
undurable correction the committed-artifact audit was filed to eliminate.

The expected placements are not restated here as a magic list. They are read
from the committed canonical CSVs, so the test compares the parser against the
artifact it has to reproduce rather than against a second copy of the answer.

Run from repo root:
    python -m pytest legacy_data/tests/test_polish_2024_golf_fixup.py -v
"""
from __future__ import annotations

import csv
import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "pipeline" / "02_canonicalize_results.py"
CANONICAL_INPUT = REPO_ROOT / "legacy_data" / "event_results" / "canonical_input"

EVENT_ID = "1727756195"
EVENT_KEY = "2024_polish_krakow"
DISCIPLINE = "open_golf"

# The tail of the results block exactly as stage 1 hands it to the parser,
# blank lines included. Held here rather than read from the mirror because the
# mirror is machine-local and optional, while this contract must be pinned in
# every clone.
#
# The blank line under each header is load-bearing: an earlier draft of the
# fixup treated it as the end of the section, found no entries, and silently
# did nothing on the real page while passing against a collapsed copy of it.
REAL_PAGE = """\
STREET:

2 Squares:

1. Wiktor Debski
2. Maciej Pietrzycki
3. Pawel Rozek
————————————
4. Maciej Niczyporuk
5. Michal Rog
6. Jakub Worek
7. Marcin Czech
8. Przemek Pietrzycki

Open Golf:

1. Michal Klimczak 15
2. Przemek Pietrzycki 16
3. Maciej Niczyporuk 16
————————————
1. Marcin Czech 17
2. Kuba Mosciszewski 17
3. Michal Rog 18
4. Pawel Nowak 19
5. Wojtek Ignaczak 20
6. Lukasz Domin 21
7. Jakub Worek 25
"""


def _load():
    spec = importlib.util.spec_from_file_location("canonicalize_results", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


canon = _load()


def _golf(records):
    return [r for r in records if "Golf" in r["division_raw"]]


def _parse(text, event_id=EVENT_ID):
    records, _ = canon.parse_results_text(text, event_id)
    return records


def committed_places() -> list[int]:
    """
    Placement slots the committed canonical output carries for this division.
    One row per slot, deduped across ties, so a tie at 2nd appears once here and
    twice in the participants file.
    """
    with (CANONICAL_INPUT / "event_results.csv").open(newline="", encoding="utf-8") as fh:
        return [
            int(row["placement"])
            for row in csv.DictReader(fh)
            if row["event_key"] == EVENT_KEY and row["discipline_key"] == DISCIPLINE
        ]


def committed_participants() -> list[tuple[int, str]]:
    """(placement, name) pairs the committed canonical output carries."""
    with (CANONICAL_INPUT / "event_result_participants.csv").open(
        newline="", encoding="utf-8"
    ) as fh:
        return [
            (int(row["placement"]), row["display_name"])
            for row in csv.DictReader(fh)
            if row["event_key"] == EVENT_KEY and row["discipline_key"] == DISCIPLINE
        ]


def test_the_rule_is_registered_for_this_event():
    """A fixup nobody dispatches is the same as no fixup at all."""
    rules = canon.EVENT_PARSING_RULES.get(EVENT_ID, {})
    assert rules.get("pre_parse_fixup") == "polish_2024_golf"


def test_places_match_the_committed_canonical_output():
    parsed = sorted({r["place"] for r in _golf(_parse(REAL_PAGE))})
    assert parsed == committed_places()


def test_the_two_ties_are_derived_from_the_stroke_scores():
    """
    Standard competition ranking: equal scores share the earlier place and the
    next place skips. 15,16,16,17,17,18,19,20,21,25 -> 1,2,2,4,4,6,7,8,9,10.
    """
    golf = _golf(_parse(REAL_PAGE))
    assert [r["place"] for r in golf] == [1, 2, 2, 4, 4, 6, 7, 8, 9, 10]
    scores = [int(r["entry_raw"].rsplit(" ", 1)[1]) for r in golf]
    assert scores == [15, 16, 16, 17, 17, 18, 19, 20, 21, 25]
    # 3rd and 5th are vacant, which is what a tie at 2nd and 4th means.
    assert 3 not in [r["place"] for r in golf]
    assert 5 not in [r["place"] for r in golf]


def test_competitors_land_on_the_committed_placements():
    golf = _golf(_parse(REAL_PAGE))
    parsed = [(r["place"], r["player1_name"]) for r in golf]
    committed = committed_participants()
    assert len(parsed) == len(committed)
    # Names are transliterated downstream, so compare placement structure plus
    # the surname, which survives every normalisation between here and there.
    assert [p for p, _ in parsed] == [p for p, _ in committed]
    for (_, got), (_, want) in zip(parsed, committed):
        assert got.split()[-1].lower() in want.lower()


def test_the_2_squares_division_on_the_same_page_is_untouched():
    """
    2 Squares carries the same divider rule but numbers continuously across it,
    and the parser already reads it correctly. Widening the fixup to every
    divider on the page would corrupt it.
    """
    with_rule = _parse(REAL_PAGE)
    without_rule = _parse(REAL_PAGE, event_id="EVENT_WITH_NO_RULES")
    non_golf_with = [r for r in with_rule if "Golf" not in r["division_raw"]]
    non_golf_without = [r for r in without_rule if "Golf" not in r["division_raw"]]
    assert non_golf_with == non_golf_without


def test_the_blank_line_under_the_header_does_not_end_the_section():
    """
    The regression that a collapsed test fixture hid: stage 1 hands this parser
    the block with its blank lines intact, and a scan that stops on the first
    blank finds no entries and returns the text untouched.
    """
    with_blank = "Open Golf:\n\n1. Alpha 15\n2. Bravo 16\n————\n1. Charlie 16\n"
    out = canon.fixup_polish_2024_golf(with_blank)
    assert out != with_blank
    assert [ln for ln in out.splitlines() if ln.strip()][1:] == [
        "1. Alpha 15",
        "2. Bravo 16",
        "2. Charlie 16",
    ]


def test_the_section_ends_at_the_next_header_not_at_a_blank_line():
    text = (
        "Open Golf:\n\n1. Alpha 15\n2. Bravo 16\n————\n1. Charlie 16\n"
        "\nOpen Singles:\n\n1. Delta\n2. Echo\n"
    )
    out = canon.fixup_polish_2024_golf(text)
    assert out.endswith("\nOpen Singles:\n\n1. Delta\n2. Echo\n")


def test_an_already_continuous_block_passes_through_unchanged():
    """Inert on a corrected source, so a fixed page is not re-derived."""
    continuous = (
        "Open Golf:\n"
        "1. Alpha 15\n"
        "2. Bravo 16\n"
        "3. Charlie 17\n"
    )
    assert canon.fixup_polish_2024_golf(continuous) == continuous


def test_text_with_no_open_golf_section_passes_through_unchanged():
    other = "Open Singles:\n1. Alpha\n2. Bravo\n"
    assert canon.fixup_polish_2024_golf(other) == other


@pytest.mark.parametrize("divider", ["————————————", "------------", "––––––––"])
def test_the_divider_is_dropped_whichever_dash_the_page_used(divider):
    text = (
        "Open Golf:\n"
        "1. Alpha 15\n"
        "2. Bravo 16\n"
        f"{divider}\n"
        "1. Charlie 16\n"
        "2. Delta 20\n"
    )
    out = canon.fixup_polish_2024_golf(text)
    assert divider not in out
    assert out.splitlines()[1:] == [
        "1. Alpha 15",
        "2. Bravo 16",
        "2. Charlie 16",
        "4. Delta 20",
    ]
