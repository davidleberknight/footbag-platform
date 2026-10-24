"""Folding a merged-away event into the event it duplicates.

`overrides/event_equivalence.csv` declares pairs of event records that are one
competition, and the remediation pass folds the loser's rows into the winner. The
winner's own placements stand. A competition only the loser recorded comes across
whole, competitors included, which is how the 1997 Worlds overall titles and the
1984 Women's Team Freestyle reach the surviving event. Extra places the loser
holds in a competition the winner already recorded are tie leftovers and are
dropped, and the named duplicate spellings of a winner competition are not
carried at all.

These exercise the shipped function on synthetic rows.
"""
from __future__ import annotations

from pathlib import Path

_SCRIPT = (Path(__file__).resolve().parents[1] / "pipeline" / "05p5_remediate_canonical.py")
SOURCE = _SCRIPT.read_text(encoding="utf-8")


def _merge():
    """The pass's own function, lifted out of the script so these exercise the
    shipped code rather than a copy of it that could drift."""
    ns: dict = {}
    start = SOURCE.index("def merge_loser_into_winner(")
    end = SOURCE.index('print("\\n[Event merge] Applying')
    exec("from collections import defaultdict\n" + SOURCE[start:end], ns)  # noqa: S102
    return ns["merge_loser_into_winner"]


def _tables(rows):
    """Build the three tables and the winner indexes from (event, discipline,
    placement, competitor) tuples."""
    disciplines, results, participants = [], [], []
    seen_d, seen_r = set(), set()
    for ev, dk, pl, name in rows:
        if (ev, dk) not in seen_d:
            seen_d.add((ev, dk))
            disciplines.append({"event_key": ev, "discipline_key": dk})
        if (ev, dk, pl) not in seen_r:
            seen_r.add((ev, dk, pl))
            results.append({"event_key": ev, "discipline_key": dk, "placement": pl, "notes": ""})
        participants.append({"event_key": ev, "discipline_key": dk, "placement": pl,
                             "display_name": name})
    return disciplines, results, participants


def _index(disciplines, results, ev):
    return ({d["discipline_key"] for d in disciplines if d["event_key"] == ev},
            {(r["discipline_key"], r["placement"]) for r in results if r["event_key"] == ev})


def _run(rows, losers, duplicates=frozenset()):
    disciplines, results, participants = _tables(rows)
    discs, slots = _index(disciplines, results, "W")
    merge = _merge()
    counts = {}
    for loser in losers:
        for k, v in merge("W", loser, disciplines, results, participants,
                          discs, slots, duplicates).items():
            counts[k] = counts.get(k, 0) + v
    return disciplines, results, participants, counts


def _competitors(participants, dk):
    return sorted((p["placement"], p["display_name"]) for p in participants
                  if p["event_key"] == "W" and p["discipline_key"] == dk)


def test_a_competition_only_the_loser_recorded_arrives_with_its_competitors():
    # Without this the merged placements land with nobody in them, and the page
    # hides them: the overall titles and team results simply vanish.
    rows = [("W", "open_singles_net", "1", "Winner One"),
            ("L", "mens_overall", "1", "Overall Champion"),
            ("L", "womens_team_freestyle", "1", "Team A1"),
            ("L", "womens_team_freestyle", "1", "Team A2")]
    _, _, participants, counts = _run(rows, ["L"])
    assert _competitors(participants, "mens_overall") == [("1", "Overall Champion")]
    assert _competitors(participants, "womens_team_freestyle") == [("1", "Team A1"), ("1", "Team A2")]
    assert counts["parts_added"] == 3


def test_a_place_the_winner_holds_keeps_the_winners_competitors():
    # Without this a second source would add a second name to a decided place.
    rows = [("W", "open_singles_net", "1", "Winner One"),
            ("L", "open_singles_net", "1", "Someone Else")]
    _, results, participants, counts = _run(rows, ["L"])
    assert _competitors(participants, "open_singles_net") == [("1", "Winner One")]
    flagged = [r for r in results if r["event_key"] == "W" and "MERGE_CONFLICT" in r["notes"]]
    assert len(flagged) == 1 and counts["results_conflict"] == 1


def test_extra_places_in_a_competition_the_winner_recorded_are_dropped():
    # Without this the loser's tie leftovers become extra places below the
    # winner's complete standings, repeating players already placed above.
    rows = [("W", "womens_doubles_net", "1", "Pair One"),
            ("W", "womens_doubles_net", "2", "Pair Two"),
            ("L", "womens_doubles_net", "1", "Pair One"),
            ("L", "womens_doubles_net", "4", "Pair Two")]
    _, results, participants, counts = _run(rows, ["L"])
    assert _competitors(participants, "womens_doubles_net") == [("1", "Pair One"), ("2", "Pair Two")]
    assert ("womens_doubles_net", "4") not in {
        (r["discipline_key"], r["placement"]) for r in results if r["event_key"] == "W"}
    assert counts["skipped_shared_discipline_extra"] == 1


def test_a_named_duplicate_spelling_is_not_carried():
    # Without this the page shows a second section for a competition the winner
    # already lists under its own spelling.
    rows = [("W", "singles_net", "1", "Winner One"),
            ("L", "open_singles_net", "1", "Winner One"),
            ("L", "open_golf", "1", "Golfer")]
    disciplines, _, participants, counts = _run(rows, ["L"], frozenset({("W", "open_singles_net")}))
    assert ("W", "open_singles_net") not in {(d["event_key"], d["discipline_key"]) for d in disciplines}
    assert _competitors(participants, "open_singles_net") == []
    # An unlisted competition from the same loser still comes across.
    assert _competitors(participants, "open_golf") == [("1", "Golfer")]
    assert counts["skipped_duplicate_discipline"] == 1


def test_a_second_loser_cannot_join_a_place_the_first_loser_filled():
    # Without this two merged sources would both put a competitor in one place.
    rows = [("W", "open_singles_net", "1", "Winner One"),
            ("L1", "mens_overall", "1", "First Source"),
            ("L2", "mens_overall", "1", "Second Source")]
    _, _, participants, _ = _run(rows, ["L1", "L2"])
    assert _competitors(participants, "mens_overall") == [("1", "First Source")]
