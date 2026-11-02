"""Historical results the pipeline had misclassified, read from the regenerated corpus.

A contest named by its source heading must keep its real sport family: a bare
heading must not become a net contest that was never played, and square games,
consecutives and distance contests are sideline. A decorated name must not reach
the corpus at all, or the player's results split onto a second person.

These read the committed canonical output, so a fix that is listed but not applied,
or applied to the wrong row, fails here.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

_CANON = Path(__file__).resolve().parents[1] / "event_results" / "canonical_input"
CINCO = "2002_cinco_de_mayo"


def _rows(name):
    with open(_CANON / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _disciplines():
    return {(d["event_key"], d["discipline_key"]): d for d in _rows("event_disciplines.csv")}


def _standing(key):
    by_place = {}
    for p in _rows("event_result_participants.csv"):
        if p["event_key"] == CINCO and p["discipline_key"] == key:
            by_place.setdefault(int(p["placement"]), []).append(p["display_name"])
    return by_place


def test_cinco_de_mayo_holds_the_contests_on_its_page_and_no_net():
    # Defect caught: bare division headings merged separate contests and became net.
    found = {k[1]: d["discipline_category"] for k, d in _disciplines().items() if k[0] == CINCO}
    assert found == {
        "novice_4_square": "sideline",
        "novice_timed_3_minute_consecutives": "sideline",
        "intermediate_big_3": "freestyle",
        "intermediate_timed_3_minute_consecutives": "sideline",
        "intermediate_shred_30": "freestyle",
        "open_shred_30": "freestyle",
        "open_big_3": "freestyle",
        "open_sick_one": "freestyle",
    }


def test_cinco_de_mayo_contests_keep_their_own_order_with_no_false_ties():
    # Defect caught: two lists under one heading read as ties at each place.
    assert _standing("intermediate_shred_30") == {
        1: ["Andrew Coleman"], 2: ["Ben Scarborough"], 3: ["Paully O'Reilly"], 4: ["Josh Owens"], 5: ["Brett Ables"]}
    assert _standing("novice_timed_3_minute_consecutives") == {
        1: ["Stephen Pride"], 2: ["Todd Squires"], 3: ["Mitch Carlsen"], 4: ["Sam Pride"]}


def test_sideline_contests_carry_the_sideline_family():
    # Defect caught: a square game or a distance contest counted in net or freestyle.
    disciplines = _disciplines()
    for key in [
        ("2007_footbagjam_warsaw", "four_square"),
        ("1998_worlds_montreal", "open_doubles_5_minute_timed_consecutives"),
        ("1998_worlds_montreal", "womens_open_5_minute_timed_consecutives"),
        ("1998_worlds_montreal", "womens_open_doubles_distance_one_pass"),
    ]:
        assert disciplines[key]["discipline_category"] == "sideline", key


def test_no_big_3_contest_is_called_net():
    # Defect caught: the bare-label repair reads a trick contest as a net contest.
    big_3 = [d for d in _rows("event_disciplines.csv") if re.search(r"big\s?3", d["discipline_name"], re.I)]
    assert big_3
    assert [d["discipline_key"] for d in big_3 if d["discipline_category"] == "net"] == []
    assert [d["discipline_name"] for d in big_3 if d["discipline_name"].endswith(" Net")] == []


def test_an_event_of_trick_contests_gains_no_net_contest():
    # Defect caught: a Big 3 marks its event as mixed, so its bare siblings become net.
    disciplines = _disciplines()
    for key in ("big_3", "big_1", "rippin_run"):
        assert disciplines[("2008_socali_08", key)]["discipline_category"] == "freestyle", key


def test_medal_decorated_names_resolve_to_the_player():
    # Defect caught: a decorated name misses the alias lookup and mints a second person.
    names = {p["display_name"] for p in _rows("event_result_participants.csv")
             if p["event_key"] in ("2026_worlds_ibaraki", "2026_eurochamp_parque_casino_de_la_reina_embajadores_madrid",
                                   "2026_akisphere")}
    assert {"Wiktor Debski", "Kenny Shults", "Natacha Mercure"} <= names
    assert [n for n in names if re.match(r"^(Gold|Silver|Bronze)\s*:|[\U0001F947-\U0001F949]|\x96", n)] == []
