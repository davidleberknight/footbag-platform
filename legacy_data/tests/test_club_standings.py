"""
test_club_standings.py
======================

A curated Worlds source carries club standings: a club's name, its place and
its points. They are official results and are published, but a club is never a
person. Every stage that would otherwise read the name as a person must leave it
alone: the parser keeps the whole name as one competitor, and the seed builder
mints no person for it. In the committed results each standing is shown by name
only, so it adds to no player's career and links to no person page.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_standings.py -v
"""
from __future__ import annotations

import csv
import importlib.util
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"
CANONICAL_INPUT = LEGACY / "event_results" / "canonical_input"
STRUCTURED = LEGACY / "inputs" / "curated" / "events" / "structured"
SEED_BUILDER = LEGACY / "event_results" / "scripts" / "07_build_mvfp_seed_full.py"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


adapter = _load("curated_events_adapter_clubs", LEGACY / "pipeline" / "adapters" / "curated_events_adapter.py")
canon = _load("canonicalize_results_clubs", LEGACY / "pipeline" / "02_canonicalize_results.py")


def test_the_adapter_marks_a_standing_from_either_source_layout():
    # Defect caught: a club's standing reaching the parser as an ordinary name,
    # where it is split, dropped, or later turned into a person.
    block_a, _ = adapter._build_block_variant_a([
        {"division": "Overall Club Standings", "place": "1", "player_name": "Alpha Schwa Omega/MFA",
         "score": "7420", "notes": "club standing; source Footbag World"}])
    assert block_a.splitlines()[1] == "1. Alpha Schwa Omega/MFA [Club Standing] - 7420"
    block_b, _ = adapter._build_block_variant_b([
        {"category": "TEAM", "division": "Team Points", "place": "1",
         "player_1": "Illinois Footbag League", "player_2": "", "score": "8087"},
        {"category": "TEAM", "division": "Team Points", "place": "3",
         "player_1": "Kitsilano Kickers", "player_2": ""}])
    assert block_b.splitlines() == ["Team Points",
                                    "1. Illinois Footbag League [Club Standing] - 8087",
                                    "3. Kitsilano Kickers [Club Standing]"]


def test_the_two_player_layout_carries_its_score_column():
    # Defect caught: a score in the source's score column dropped before export,
    # or a thousands separator turning 12,411 into 411.
    block, _ = adapter._build_block_variant_b([
        {"category": "SIDELINE", "division": "Open Doubles Distance One Pass", "place": "1",
         "player_1": "Brent Welch", "player_2": "Alf Marcussen", "score": "246"},
        {"category": "NET", "division": "Open Singles", "place": "1",
         "player_1": "John Stalberger", "player_2": "", "score": "12,411"}])
    assert "1. Brent Welch / Alf Marcussen - 246" in block.splitlines()
    assert "1. John Stalberger - 12411" in block.splitlines()


def test_the_parser_keeps_every_club_name_whole():
    # Defect caught: a club name with a slash split into two "players", an
    # all-capitals name refused as not a person, or a name containing a division
    # word read as a new heading, each losing the club's place.
    text = ("Overall Club Standings\n"
            "1. Alpha Schwa Omega/MFA [Club Standing] - 7420\n"
            "3. POOF [Club Standing] - 5250\n"
            "17. World Net Alliance [Club Standing] - 316")
    records, _ = canon.parse_results_text(text, "1995_worlds", "worlds", trusted_headings=True)
    assert [(r["place"], r["player1_name"], r["player2_name"], r["competitor_type"])
            for r in records] == [
        (1, "Alpha Schwa Omega/MFA", "", "club"),
        (3, "POOF", "", "club"),
        (17, "World Net Alliance", "", "club"),
    ]
    assert all(r["division_canon"] == "Overall Club Standings" for r in records)


def _sourced_standings() -> set[tuple[str, str]]:
    """(place, club name) for every standing the curated sources mark."""
    out = set()
    for p in sorted(STRUCTURED.glob("*")):
        if p.suffix not in (".csv", ".txt") or not p.is_file():
            continue
        head = p.read_text(encoding="utf-8", errors="replace").splitlines()[:1]
        if not head or "division" not in head[0]:
            continue
        for r in csv.DictReader(open(p, encoding="utf-8", errors="replace")):
            if adapter._is_club_standing(r):
                out.add((r["place"], r.get("player_name") or r.get("player_1")))
    return out


def _published_standings(canonical_dir: Path) -> list[dict]:
    with open(canonical_dir / "event_result_participants.csv", encoding="utf-8") as f:
        return [r for r in csv.DictReader(f) if "club_standing" in r["notes"]]


def check_published_standings(canonical_dir: Path) -> list[str]:
    """Every sourced standing is published, by name only, and no club is a person."""
    sourced = _sourced_standings()
    published = _published_standings(canonical_dir)
    problems = []
    if not sourced:
        problems.append("no club standings found in the curated sources, so nothing was checked")
    missing = sourced - {(r["placement"], r["display_name"]) for r in published}
    problems += [f"standing not published: place {p} {n}" for p, n in sorted(missing)]
    problems += [f"standing linked to a person: {r['display_name']} -> {r['person_id']}"
                 for r in published if r["person_id"]]
    with open(canonical_dir / "persons.csv", encoding="utf-8") as f:
        club_names = {n for _, n in sourced}
        problems += [f"club published as a person: {p['person_name']}"
                     for p in csv.DictReader(f) if p["person_name"] in club_names]
    return problems


def test_every_sourced_standing_is_published_by_name_only():
    # Defect caught: an official club standing missing from the results, or a
    # club shown as a person with a career and a person page.
    assert check_published_standings(CANONICAL_INPUT) == []


def test_the_seed_builder_mints_no_person_for_a_standing(tmp_path):
    # Defect caught: the seed builder resolving a club name to a person through an
    # alias, or minting a stub person for it, which the loader would publish.
    out = tmp_path / "footbag-test-seed"
    subprocess.run([sys.executable, str(SEED_BUILDER), "--input-dir", str(CANONICAL_INPUT),
                    "--output-dir", str(out)], check=True, capture_output=True, timeout=300)
    with open(out / "seed_event_result_participants.csv", encoding="utf-8") as f:
        clubs = [r for r in csv.DictReader(f) if "club_standing" in r["notes"]]
    assert clubs, "no club standings in the seed, so nothing was checked"
    assert [r["display_name"] for r in clubs if r["person_id"]] == []
    names = {r["display_name"] for r in clubs}
    with open(out / "seed_persons.csv", encoding="utf-8") as f:
        assert [p["person_name"] for p in csv.DictReader(f) if p["person_name"] in names] == []
