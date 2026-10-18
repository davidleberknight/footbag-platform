"""Disciplines the parser could not name, corrected from their source pages.

Results whose source heading named no division the parser recognised were
published as a discipline called "Unknown" in a sport family called "unknown",
which is outside the four families. On the site they sorted after every real
division and fell out of players' career statistics. Each was read against its
source page and corrected through the curated inputs:

- prose or placeholder rows misread as results, and empty disciplines, are
  removed;
- a real contest takes its source name and its sport family, which the
  discipline-fix list now carries for headings that name none (a net "king of
  the court", a 2-square side game);
- an overall standing takes its source name and is marked a cross-sport
  aggregate with no family;
- one event whose results were mis-parsed throughout is rebuilt from its source.

These read the regenerated competitor-results corpus, so a fix that is listed
but not applied, or applied to the wrong row, fails here.
"""
from __future__ import annotations

import csv
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_FIXES = _ROOT / "legacy_data" / "inputs" / "canonical_discipline_fixes.csv"
_CANON = _ROOT / "legacy_data" / "event_results" / "canonical_input"
FAMILIES = {"net", "freestyle", "golf", "sideline"}


def _rows(name: str) -> list[dict[str, str]]:
    with open(_CANON / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _disciplines() -> dict[tuple[str, str], dict[str, str]]:
    return {(r["event_key"], r["discipline_key"]): r for r in _rows("event_disciplines.csv")}


def test_no_published_discipline_is_in_a_family_outside_the_four():
    # A family outside the four drops the contest from career statistics and
    # sorts it after every real division.
    bad = {k for k, r in _disciplines().items()
           if r["discipline_category"] and r["discipline_category"] not in FAMILIES}
    assert bad == set()


def test_every_category_the_fix_list_sets_is_one_of_the_four_families():
    with open(_FIXES, newline="", encoding="utf-8") as f:
        cats = {(r.get("new_category") or "").strip() for r in csv.DictReader(f)}
    assert cats - {""} <= FAMILIES


def test_the_rebuilt_event_publishes_its_source_divisions_and_no_trick_named_ones():
    # The parser filed this event's freestyle results under trick names and
    # shifted every doubles pair by one place.
    d = _disciplines()
    keys = {k: d[(e, k)]["discipline_category"] for (e, k) in d if e == "2019_medejam_de"}
    assert keys == {"open_singles_net": "net", "open_doubles_net": "net",
                    "freestyle_big_one": "freestyle", "sick_3": "freestyle"}
    doubles: dict[str, set[str]] = {}
    for p in _rows("event_result_participants.csv"):
        if p["event_key"] == "2019_medejam_de" and p["discipline_key"] == "open_doubles_net":
            doubles.setdefault(p["placement"], set()).add(p["display_name"])
    # Juan Palacios and Juan David Palomino play in different teams here, so an
    # alias folding one into the other shows up as a wrong fourth-place pair.
    assert doubles == {
        "1": {"Gianni Almanza Amaya", "Julian Florez Cifuentes"},
        "2": {"Esteban Restrepo", "Juan Bernardo Palacios Lemos"},
        "3": {"Reinaldo Cardozo", "Antonio Linero Castro"},
        "4": {"Carlos Ramirez", "Juan David Palomino Mosquera"},
    }
