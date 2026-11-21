"""A curated correction replaces the competitors at one placement.

Most corrections name a doubles team. A blank second player corrects a singles
result that the parser expanded into several competitors, leaving its one player.
These exercise the remediation pass's own correction block on synthetic rows, and
then check the delivered data carries what each single-player correction says.
"""
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _ROOT / "legacy_data" / "pipeline" / "05p5_remediate_canonical.py"
_CANON = _ROOT / "legacy_data" / "event_results" / "canonical_input"
_CORRECTIONS = _ROOT / "legacy_data" / "inputs" / "team_corrections.csv"

SOURCE = _SCRIPT.read_text(encoding="utf-8")

COLUMNS = ["event_key", "discipline_key", "placement", "corrected_player_a",
           "corrected_player_b", "correction_type", "active"]


def _apply(tmp_path: Path, player_a: str, player_b: str) -> list[dict]:
    """Run the pass's correction block over one expanded result and return the rows."""
    (tmp_path / "inputs").mkdir()
    with (tmp_path / "inputs" / "team_corrections.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, COLUMNS)
        writer.writeheader()
        writer.writerow({"event_key": "E", "discipline_key": "D", "placement": "5",
                         "corrected_player_a": player_a, "corrected_player_b": player_b,
                         "correction_type": "T", "active": "1"})
    participants = [
        {"event_key": "E", "discipline_key": "D", "placement": "5", "participant_order": str(n),
         "display_name": name, "person_id": "", "notes": ""}
        for n, name in enumerate(["Caleb Abraham", "Calab Abraham", "Unknown"], start=1)
    ]
    ns: dict = {"csv": csv, "re": re, "ROOT": tmp_path, "participants": participants,
                "results": []}
    start = SOURCE.index('TEAM_CORRECTIONS = ROOT / "inputs"')
    end = SOURCE.index("# ── Fix 1 & 2: Identity Sync")
    exec(SOURCE[start:end], ns)  # noqa: S102 - the block under test
    return ns["participants"]


def test_a_blank_second_player_leaves_one_competitor(tmp_path: Path) -> None:
    # Defect caught: a singles result keeps a nameless second competitor, which
    # stops the build on a blank display name or shows an empty slot on the page.
    rows = _apply(tmp_path, "Caleb Abraham", "")
    assert [(r["participant_order"], r["display_name"]) for r in rows] == [("1", "Caleb Abraham")]


def test_a_named_second_player_still_makes_a_team(tmp_path: Path) -> None:
    # Defect caught: a doubles correction loses the partner it exists to restore.
    rows = _apply(tmp_path, "Martin Côté", "Martin Graton")
    assert [(r["participant_order"], r["display_name"]) for r in rows] == [
        ("1", "Martin Côté"), ("2", "Martin Graton")]


def _apply_rows(tmp_path: Path, corrections: list[dict], participants: list[dict]) -> list[dict]:
    """Run the pass's correction block over the given rows with several corrections."""
    (tmp_path / "inputs").mkdir()
    with (tmp_path / "inputs" / "team_corrections.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, COLUMNS)
        writer.writeheader()
        for c in corrections:
            writer.writerow({"event_key": "E", "discipline_key": "D", "active": "1", **c})
    ns: dict = {"csv": csv, "re": re, "ROOT": tmp_path, "participants": participants,
                "results": []}
    start = SOURCE.index('TEAM_CORRECTIONS = ROOT / "inputs"')
    end = SOURCE.index("# ── Fix 1 & 2: Identity Sync")
    exec(SOURCE[start:end], ns)  # noqa: S102 - the block under test
    return ns["participants"]


def _doubles_place(players: list[str]) -> list[dict]:
    return [{"event_key": "E", "discipline_key": "D", "placement": "3",
             "participant_order": str(n), "display_name": name, "person_id": "", "notes": ""}
            for n, name in enumerate(players, start=1)]


def test_a_tied_team_is_added_beside_the_team_at_that_place(tmp_path: Path) -> None:
    # Defect caught: a tie correction replacing the team already at the place, so
    # one of the two tied teams disappears from the results.
    rows = _apply_rows(tmp_path, [
        {"placement": "3", "corrected_player_a": "Chris Siebert",
         "corrected_player_b": "Josh Gayhart", "correction_type": "MISSING_PARTNER"},
        {"placement": "3", "corrected_player_a": "Chris Cleaver",
         "corrected_player_b": "Kevin Fura", "correction_type": "TIED_TEAM"},
    ], _doubles_place(["Unknown", "Josh Gayhart"]))
    assert [(r["participant_order"], r["display_name"], r["notes"]) for r in rows] == [
        ("1", "Chris Siebert", ""), ("2", "Josh Gayhart", ""),
        ("3", "Chris Cleaver", "tied_team:2"), ("4", "Kevin Fura", "tied_team:2")]


def test_a_tied_team_row_must_name_both_partners(tmp_path: Path) -> None:
    # Defect caught: a tied doubles "team" of one player, which would load as a
    # second entry with a missing partner.
    with pytest.raises(SystemExit, match="TIED_TEAM row without two players"):
        _apply_rows(tmp_path, [
            {"placement": "3", "corrected_player_a": "Chris Cleaver",
             "corrected_player_b": "", "correction_type": "TIED_TEAM"},
        ], _doubles_place(["Chris Siebert", "Josh Gayhart"]))


def test_the_2022_east_region_doubles_tie_reaches_the_delivered_data() -> None:
    # Defect caught: the two teams the page lists tied at 3rd collapsing to one,
    # or the pipeline re-pairing the four players into consecutive places.
    canon = _CANON / "event_result_participants.csv"
    with canon.open(encoding="utf-8", newline="") as f:
        third = [(r["participant_order"], r["display_name"], r["notes"]) for r in csv.DictReader(f)
                 if r["event_key"] == "2022_eastregion"
                 and r["discipline_key"] == "open_doubles_net" and r["placement"] == "3"]
    assert sorted(third) == [
        ("1", "Chris Siebert", ""), ("2", "Josh Gayhart", ""),
        ("3", "Chris Cleaver", "tied_team:2"), ("4", "Kevin Fura", "tied_team:2")]


def test_each_single_player_correction_is_one_competitor_in_the_delivered_data() -> None:
    # Defect caught: the correction file says one player while the published
    # results still carry the repeated names, because the output was not regenerated.
    csv.field_size_limit(sys.maxsize)
    with _CORRECTIONS.open(newline="", encoding="utf-8") as f:
        corrections = [r for r in csv.DictReader(f)
                       if r["active"].strip() == "1" and not r["corrected_player_b"].strip()]
    assert corrections, "no single-player correction left to check"

    with (_CANON / "event_result_participants.csv").open(newline="", encoding="utf-8") as f:
        delivered: dict[tuple[str, str, str], list[str]] = {}
        for row in csv.DictReader(f):
            key = (row["event_key"], row["discipline_key"], row["placement"])
            delivered.setdefault(key, []).append(row["display_name"])

    for rule in corrections:
        key = (rule["event_key"], rule["discipline_key"], rule["placement"])
        assert delivered.get(key) == [rule["corrected_player_a"]], key
