"""
test_division_structure.py
==========================

Every historical division is stored with its structured parts (the game, the
gender, the class) from one curated file, because the historical names are far
from consistent: "Open Doubles Net", "Open Double Net" and "Net Doubles" are one
division, and "Open Freestyle" and "Open Singles Routines" are one contest. The
file covers net, freestyle, golf and sideline, keyed by discipline and name,
since one name ("Doubles", "Unknown") recurs across disciplines. The loader takes
the parts from it and refuses a name it does not list, so a new spelling the
source introduces fails the load instead of loading with no game, gender or
class. A division the schema cannot yet record truthfully, a team contest with no
entry size to carry, is withheld whole rather than loaded as singles.

Run from repo root:
    python -m pytest legacy_data/tests/test_division_structure.py -v
"""
from __future__ import annotations

import csv
import importlib.util
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"
STRUCTURE = LEGACY / "inputs" / "division_structure.csv"
CANONICAL_DISCIPLINES = LEGACY / "event_results" / "canonical_input" / "event_disciplines.csv"
LOADER = "legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py"

_helpers_spec = importlib.util.spec_from_file_location(
    "division_structure_loader_helpers", LEGACY / "tests" / "test_loader_idempotency.py")
helpers = importlib.util.module_from_spec(_helpers_spec)
_helpers_spec.loader.exec_module(helpers)

_loader_spec = importlib.util.spec_from_file_location(
    "division_structure_loader_08", REPO_ROOT / LOADER)
loader = importlib.util.module_from_spec(_loader_spec)
_loader_spec.loader.exec_module(loader)


def _seed_with_divisions(tmp_path: Path, divisions: list[tuple[str, str]]) -> Path:
    """The helpers' one-event seed, its division replaced by one division per
    (discipline, name). The first keeps the seed's own key, so the seed's one
    placed player belongs to it."""
    seed = helpers.build_mvfp_seed(tmp_path / "seed")
    path = seed / "seed_event_disciplines.csv"
    with path.open(encoding="utf-8") as f:
        base = list(csv.DictReader(f))[0]
    rows = [dict(base, discipline_key=base["discipline_key"] if i == 0 else f"div_{i}",
                 discipline_category=cat, discipline_name=name)
            for i, (cat, name) in enumerate(divisions)]
    helpers.write_csv(path, list(base.keys()), rows)
    return seed


def _load(tmp_path: Path, seed: Path):
    db = helpers.make_db(tmp_path)
    return db, helpers.run([LOADER, "--db", str(db), "--seed-dir", str(seed), "--no-backup"])


def _with_second_event(seed: Path, division_index: int) -> None:
    """Give the seeded division at `division_index` an event of its own, since
    one event holds a division name once whatever its discipline."""
    events = seed / "seed_events.csv"
    with events.open(encoding="utf-8") as f:
        ev = list(csv.DictReader(f))
    second = dict(ev[0], event_key="2001_idem_test")
    if "legacy_event_id" in second:
        second["legacy_event_id"] = "2001000001"
    helpers.write_csv(events, list(ev[0].keys()), ev + [second])
    discs = seed / "seed_event_disciplines.csv"
    with discs.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    rows[division_index]["event_key"] = "2001_idem_test"
    helpers.write_csv(discs, list(rows[0].keys()), rows)


def _parts(db: Path) -> dict[tuple[str, str], tuple]:
    """The seeded test events' divisions only: the loader also adds a fixed
    showcase event of its own."""
    conn = sqlite3.connect(db)
    try:
        return {(r[0], r[1]): r[2:] for r in conn.execute(
            "SELECT discipline_category, name, game_id, custom_game_name, "
            "gender_eligibility, division_class FROM event_disciplines "
            "WHERE id LIKE 'disc_%idem_test_%'")}
    finally:
        conn.close()


def _count_test_rows(db: Path, table: str) -> int:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE id LIKE '%idem_test_%'").fetchone()[0]
    finally:
        conn.close()


def test_the_loader_stores_each_division_with_its_curated_parts(tmp_path):
    # Defect caught: historical divisions loaded with no game, gender or class,
    # so they never group with the same division at a new event.
    seed = _seed_with_divisions(tmp_path, [
        ("net", "Women's Singles Net"), ("net", "Intermediate Singles Net"),
        ("net", "Advanced Singles"), ("net", "Mini Net"), ("net", "Unknown"),
        ("freestyle", "Open Freestyle"), ("freestyle", "Intermediate Shred"),
        ("golf", "Women's Golf")])
    db, result = _load(tmp_path, seed)
    assert result.returncode == 0, result.stderr
    assert _parts(db) == {
        ("net", "Women's Singles Net"): ("game_footbag_net", None, "women", "open"),
        ("net", "Intermediate Singles Net"): ("game_footbag_net", None, "open", "intermediate"),
        ("net", "Advanced Singles"): ("game_footbag_net", None, "open", "open"),
        ("net", "Mini Net"): (None, "Mini Net", "open", "open"),
        ("net", "Unknown"): (None, None, None, None),
        ("freestyle", "Open Freestyle"): ("game_routines", None, "open", "open"),
        ("freestyle", "Intermediate Shred"): (None, "Shred", "open", "intermediate"),
        ("golf", "Women's Golf"): ("game_footbag_golf", None, "women", "open"),
    }


def test_one_name_in_two_disciplines_takes_each_disciplines_parts(tmp_path):
    # Defect caught: a name shared across disciplines ("Doubles") taking the net
    # division's game for a freestyle contest, or the reverse.
    seed = _seed_with_divisions(tmp_path, [("net", "Doubles"), ("freestyle", "Doubles")])
    _with_second_event(seed, 1)
    db, result = _load(tmp_path, seed)
    assert result.returncode == 0, result.stderr
    got = _parts(db)
    assert got[("net", "Doubles")][0] == "game_footbag_net"
    assert got[("freestyle", "Doubles")][0] is None


@pytest.mark.parametrize("category,name", [
    ("net", "Opne Singles Nett"),
    ("freestyle", "Opne Freestyle"),
])
def test_the_loader_refuses_a_name_the_structure_does_not_list(tmp_path, category, name):
    # Defect caught: a new spelling from the source, in any discipline, loading
    # silently with no parts.
    seed = _seed_with_divisions(tmp_path, [("net", "Open Singles Net"), (category, name)])
    db, result = _load(tmp_path, seed)
    assert result.returncode != 0
    assert f"{category}: {name}" in result.stderr + result.stdout
    assert helpers.count(db, "event_disciplines") == 0


def test_a_team_division_is_withheld_whole_never_loaded_as_singles(tmp_path):
    # Defect caught: a team contest the schema cannot record loading as a
    # singles division, so the site shows a team result as an individual one.
    seed = _seed_with_divisions(tmp_path, [("freestyle", "Team Freestyle"),
                                           ("net", "Open Singles Net")])
    db, result = _load(tmp_path, seed)
    assert result.returncode == 0, result.stderr
    assert set(_parts(db)) == {("net", "Open Singles Net")}
    conn = sqlite3.connect(db)
    try:
        team_rows = conn.execute(
            "SELECT COUNT(*) FROM event_disciplines WHERE name = 'Team Freestyle'").fetchone()[0]
        placed = conn.execute(
            "SELECT COUNT(*) FROM event_result_entries WHERE discipline_id IS NULL "
            "OR discipline_id NOT IN (SELECT id FROM event_disciplines)").fetchone()[0]
    finally:
        conn.close()
    assert team_rows == 0
    assert placed == 0, "a withheld division's places were loaded without it"
    # The seed's one placed player belongs to the team division.
    assert _count_test_rows(db, "event_result_entries") == 0
    assert _count_test_rows(db, "event_result_entry_participants") == 0
    assert "withheld" in result.stdout


def test_a_structure_row_names_exactly_one_of_game_custom_name_or_reason(tmp_path):
    # Defect caught: a row carrying both a listed game and a custom name, which
    # the database refuses partway through the load.
    path = tmp_path / "structure.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["discipline_category", "discipline_name", "game_id", "custom_game_name",
                    "gender_eligibility", "division_class", "unmapped_reason", "withhold"])
        w.writerow(["net", "Open Singles Net", "game_footbag_net", "Mini Net", "open", "open",
                    "", "0"])
    with pytest.raises(SystemExit, match="exactly one of"):
        loader.read_division_structure(path)


def test_a_withheld_row_must_say_why(tmp_path):
    # Defect caught: a division dropped from the load with no recorded reason,
    # so nobody can tell why its results are missing.
    path = tmp_path / "structure.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["discipline_category", "discipline_name", "game_id", "custom_game_name",
                    "gender_eligibility", "division_class", "unmapped_reason", "withhold"])
        w.writerow(["freestyle", "Team Freestyle", "game_routines", "", "open", "open", "", "1"])
    with pytest.raises(SystemExit, match="withheld division must give"):
        loader.read_division_structure(path)


def test_every_committed_division_is_mapped_and_mixed_only_on_doubles():
    # Defect caught: the committed results carrying a name the structure lacks
    # (the load would refuse), or a mixed division tagged singles, which the
    # database refuses because mixed is only ever doubles.
    structure = loader.read_division_structure(STRUCTURE)
    with CANONICAL_DISCIPLINES.open(encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f)
                if r["discipline_category"] in loader.STRUCTURED_CATEGORIES]
    assert rows, "no divisions in the committed results, so nothing was checked"
    missing = sorted({(r["discipline_category"], r["discipline_name"]) for r in rows}
                     - set(structure))
    assert missing == [], f"divisions missing from {STRUCTURE.name}: {missing}"
    mixed_singles = [f"{r['event_key']}/{r['discipline_key']}" for r in rows
                     if structure[(r["discipline_category"], r["discipline_name"])]
                     ["gender_eligibility"] == "mixed"
                     and not structure[(r["discipline_category"], r["discipline_name"])]["withhold"]
                     and r["team_type"] != "doubles"]
    assert mixed_singles == [], f"mixed divisions tagged singles: {mixed_singles}"


def test_every_committed_team_contest_is_withheld():
    # Defect caught: a team contest in the committed results that the structure
    # maps instead of withholding, so it would load under a singles entry size.
    structure = loader.read_division_structure(STRUCTURE)
    with CANONICAL_DISCIPLINES.open(encoding="utf-8") as f:
        team = {(r["discipline_category"], r["discipline_name"]) for r in csv.DictReader(f)
                if r["discipline_category"] in loader.STRUCTURED_CATEGORIES
                and " team " in f" {r['discipline_name'].lower()} "}
    assert team, "no team contests in the committed results, so nothing was checked"
    loaded = sorted(k for k in team if not structure[k]["withhold"])
    assert loaded == [], f"team contests that would load as singles: {loaded}"
