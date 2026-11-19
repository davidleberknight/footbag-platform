"""
test_net_division_structure.py
==============================

Every historical net division is stored with its structured parts (the game,
the gender, the class) from one curated file, because the historical names are
far from consistent: "Open Doubles Net", "Open Double Net" and "Net Doubles" are
one division. The loader takes the parts from that file and refuses a net name
it does not list, so a new spelling the source introduces fails the load instead
of loading with no game, gender or class.

Run from repo root:
    python -m pytest legacy_data/tests/test_net_division_structure.py -v
"""
from __future__ import annotations

import csv
import importlib.util
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"
STRUCTURE = LEGACY / "inputs" / "net_division_structure.csv"
CANONICAL_DISCIPLINES = LEGACY / "event_results" / "canonical_input" / "event_disciplines.csv"
LOADER = "legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py"

_helpers_spec = importlib.util.spec_from_file_location(
    "net_structure_loader_helpers", LEGACY / "tests" / "test_loader_idempotency.py")
helpers = importlib.util.module_from_spec(_helpers_spec)
_helpers_spec.loader.exec_module(helpers)

_loader_spec = importlib.util.spec_from_file_location(
    "net_structure_loader_08", REPO_ROOT / LOADER)
loader = importlib.util.module_from_spec(_loader_spec)
_loader_spec.loader.exec_module(loader)


def _seed_with_net_names(tmp_path: Path, names: list[str]) -> Path:
    """The helpers' one-event seed, with its net division renamed in turn to each
    name, one division per name."""
    seed = helpers.build_mvfp_seed(tmp_path / "seed")
    path = seed / "seed_event_disciplines.csv"
    with path.open(encoding="utf-8") as f:
        base = list(csv.DictReader(f))[0]
    rows = [dict(base, discipline_key=f"div_{i}", discipline_name=n) for i, n in enumerate(names)]
    helpers.write_csv(path, list(base.keys()), rows)
    return seed


def _load(tmp_path: Path, seed: Path):
    db = helpers.make_db(tmp_path)
    return db, helpers.run([LOADER, "--db", str(db), "--seed-dir", str(seed), "--no-backup"])


def test_the_loader_stores_each_net_division_with_its_curated_parts(tmp_path):
    # Defect caught: historical net divisions loaded with no game, gender or class,
    # so they never group with the same division at a new event.
    seed = _seed_with_net_names(tmp_path, [
        "Women's Singles Net", "Intermediate Singles Net", "Advanced Singles", "Mini Net",
        "Unknown"])
    db, result = _load(tmp_path, seed)
    assert result.returncode == 0, result.stderr
    conn = sqlite3.connect(db)
    try:
        got = {r[0]: r[1:] for r in conn.execute(
            "SELECT name, game_id, custom_game_name, gender_eligibility, division_class "
            "FROM event_disciplines WHERE discipline_category = 'net'")}
    finally:
        conn.close()
    assert got == {
        "Women's Singles Net": ("game_footbag_net", None, "women", "open"),
        "Intermediate Singles Net": ("game_footbag_net", None, "open", "intermediate"),
        "Advanced Singles": ("game_footbag_net", None, "open", "open"),
        "Mini Net": (None, "Mini Net", "open", "open"),
        "Unknown": (None, None, None, None),
    }


def test_the_loader_refuses_a_net_name_the_structure_does_not_list(tmp_path):
    # Defect caught: a new spelling from the source loading silently with no parts.
    seed = _seed_with_net_names(tmp_path, ["Open Singles Net", "Opne Singles Nett"])
    db, result = _load(tmp_path, seed)
    assert result.returncode != 0
    assert "'Opne Singles Nett'" in result.stderr + result.stdout
    assert helpers.count(db, "event_disciplines") == 0


def test_a_structure_row_names_exactly_one_of_game_custom_name_or_reason(tmp_path):
    # Defect caught: a row carrying both a listed game and a custom name, which
    # the database refuses partway through the load.
    path = tmp_path / "structure.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["discipline_name", "game_id", "custom_game_name", "gender_eligibility",
                    "division_class", "unmapped_reason"])
        w.writerow(["Open Singles Net", "game_footbag_net", "Mini Net", "open", "open", ""])
    with pytest.raises(SystemExit, match="exactly one of"):
        loader.read_net_division_structure(path)


def test_every_committed_net_division_is_mapped_and_mixed_only_on_doubles():
    # Defect caught: the committed results carrying a net name the structure
    # lacks (the load would refuse), or a mixed division tagged singles, which
    # the database refuses because mixed is only ever doubles.
    structure = loader.read_net_division_structure(STRUCTURE)
    with CANONICAL_DISCIPLINES.open(encoding="utf-8") as f:
        net = [r for r in csv.DictReader(f) if r["discipline_category"] == "net"]
    assert net, "no net divisions in the committed results, so nothing was checked"
    missing = sorted({r["discipline_name"] for r in net} - set(structure))
    assert missing == [], f"net names missing from {STRUCTURE.name}: {missing}"
    mixed_singles = [f"{r['event_key']}/{r['discipline_key']}" for r in net
                     if structure[r["discipline_name"]]["gender_eligibility"] == "mixed"
                     and r["team_type"] != "doubles"]
    assert mixed_singles == [], f"mixed divisions tagged singles: {mixed_singles}"
