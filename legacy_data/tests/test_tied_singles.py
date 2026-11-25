"""A tied singles placing becomes one result entry per tied player.

The tied competitors of a singles contest share one placing in the parsed data,
so the placing loads as a single entry holding them all, drawn like a team. A
TIED_SINGLES correction names the players the source page lists as tied at that
place; the remediation pass marks every player after the first as its own tied
group, and the loader turns each group into its own entry at the same place.
Only a listed placing is marked, and only when it holds exactly the listed
players. These exercise the pass's tied singles block on synthetic rows.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _ROOT / "legacy_data" / "pipeline" / "05p5_remediate_canonical.py"
SOURCE = _SCRIPT.read_text(encoding="utf-8")

COLUMNS = ["event_key", "discipline_key", "placement", "original_display",
           "corrected_player_a", "corrected_player_b", "correction_type", "active"]


def _place(placement: str, players: list[str], discipline: str = "D") -> list[dict]:
    return [{"event_key": "E", "discipline_key": discipline, "placement": placement,
             "participant_order": str(n), "display_name": name, "person_id": "", "notes": ""}
            for n, name in enumerate(players, start=1)]


def _apply(tmp_path: Path, corrections: list[dict], participants: list[dict]) -> list[dict]:
    """Run the pass's tied singles block over the given rows and corrections."""
    (tmp_path / "inputs").mkdir()
    with (tmp_path / "inputs" / "team_corrections.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, COLUMNS)
        writer.writeheader()
        for c in corrections:
            writer.writerow({"event_key": "E", "discipline_key": "D", "active": "1",
                             "corrected_player_a": "", "corrected_player_b": "",
                             "correction_type": "TIED_SINGLES", **c})
    ns: dict = {"csv": csv, "re": re, "ROOT": tmp_path, "participants": participants}
    start = SOURCE.index("# ── Tied singles")
    end = SOURCE.index("# ── Save")
    exec(SOURCE[start:end], ns)  # noqa: S102 - the block under test
    return ns["participants"]


def _marks(rows: list[dict]) -> list[tuple[str, str, str]]:
    return [(r["placement"], r["display_name"], r["notes"]) for r in rows]


def test_two_tied_players_become_two_entries(tmp_path: Path) -> None:
    # Defect caught: two singles players tied at a place shown as one entry, a
    # pair the page never listed, instead of two players sharing the place.
    rows = _apply(tmp_path, [{"placement": "9", "original_display": "Ann Lasken | Amber Ott"}],
                  _place("9", ["Ann Lasken", "Amber Ott"]))
    assert _marks(rows) == [("9", "Ann Lasken", ""), ("9", "Amber Ott", "tied_team:2")]


def test_a_larger_tie_gives_every_player_their_own_entry(tmp_path: Path) -> None:
    # Defect caught: only the second player of a tie split off, leaving the rest
    # still grouped as one entry.
    players = ["Smirnov", "Tellenbach", "Rutz", "Lacaze"]
    rows = _apply(tmp_path, [{"placement": "9", "original_display": " | ".join(players)}],
                  _place("9", players))
    assert _marks(rows) == [("9", "Smirnov", ""), ("9", "Tellenbach", "tied_team:2"),
                            ("9", "Rutz", "tied_team:3"), ("9", "Lacaze", "tied_team:4")]


def test_a_placing_that_differs_from_the_listed_players_stops_the_build(tmp_path: Path) -> None:
    # Defect caught: a tie correction splitting a placing whose players have
    # changed since it was checked against the page, making ties the page never showed.
    with pytest.raises(SystemExit, match="TIED_SINGLES"):
        _apply(tmp_path, [{"placement": "9", "original_display": "Ann Lasken | Amber Ott"}],
               _place("9", ["Ann Lasken", "Kelly Kelley"]))


def test_a_placing_no_row_lists_is_left_alone(tmp_path: Path) -> None:
    # Defect caught: a general rule splitting every multi-player placing, so a
    # doubles team or an unchecked group is broken up into ties.
    team = _place("1", ["Grant Corbett", "John Burrage"])
    listed = _place("9", ["Ann Lasken", "Amber Ott"])
    rows = _apply(tmp_path, [{"placement": "9", "original_display": "Ann Lasken | Amber Ott"}],
                  team + listed)
    assert _marks(rows)[:2] == [("1", "Grant Corbett", ""), ("1", "John Burrage", "")]
