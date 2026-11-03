"""A curated correction replaces the competitors at one placement.

Most corrections name a doubles team. A blank second player corrects a singles
result that the parser expanded into several competitors, leaving its one player.
These exercise the remediation pass's own correction block on synthetic rows, and
then check the delivered data carries what each single-player correction says.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

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
    ns: dict = {"csv": csv, "ROOT": tmp_path, "participants": participants, "results": []}
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
