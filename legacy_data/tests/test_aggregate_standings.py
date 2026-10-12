"""
test_aggregate_standings.py
===========================

An aggregate standing (an overall or club standing) ranks competitors over
several of an event's contests rather than in one contest. It is kept apart from
the sport families: the curated list in overrides marks each one, with its scope.
A cross-sport standing carries no family; a standing over one sport keeps its
family. The export applies the list and refuses a listed division it cannot find,
and the loader stores a cross-sport standing with no family rather than inventing
one.

Run from repo root:
    python -m pytest legacy_data/tests/test_aggregate_standings.py -v
"""
from __future__ import annotations

import csv
import importlib.util
import sqlite3
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"
LIST = LEGACY / "overrides" / "aggregate_standings.csv"
CANONICAL_INPUT = LEGACY / "event_results" / "canonical_input"

sys.path.insert(0, str(LEGACY))
sys.path.insert(0, str(LEGACY / "pipeline" / "platform"))
_spec = importlib.util.spec_from_file_location(
    "export_canonical_platform_agg", LEGACY / "pipeline" / "platform" / "export_canonical_platform.py")
exporter = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = exporter
_spec.loader.exec_module(exporter)

_loader_spec = importlib.util.spec_from_file_location(
    "loader_idempotency_helpers", LEGACY / "tests" / "test_loader_idempotency.py")
helpers = importlib.util.module_from_spec(_loader_spec)
_loader_spec.loader.exec_module(helpers)


def _write_list(path: Path, rows: list[tuple[str, ...]]) -> Path:
    """Rows are (event_key, discipline_key, scope[, confidence]); confidence
    defaults to verified."""
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["event_key", "discipline_key", "scope", "confidence", "evidence"])
        for r in rows:
            w.writerow([*r[:3], r[3] if len(r) > 3 else "verified", "test"])
    return path


def _disciplines() -> list[dict]:
    return [
        {"event_key": "1995_worlds", "discipline_key": "mens_overall", "discipline_category": "net"},
        {"event_key": "2016_austrian", "discipline_key": "freestyle_overall", "discipline_category": "freestyle"},
        {"event_key": "1995_worlds", "discipline_key": "open_singles_net", "discipline_category": "net"},
    ]


def test_the_list_sets_scope_and_leaves_contests_alone(tmp_path):
    # Defect caught: an all-around standing still labelled a net result, a
    # one-sport standing losing its sport, or a contest marked as a standing.
    rows = _disciplines()
    fields = exporter.apply_aggregate_standings(
        ["event_key", "discipline_key", "discipline_category"], rows,
        _write_list(tmp_path / "agg.csv", [("1995_worlds", "mens_overall", "cross_sport"),
                                           ("2016_austrian", "freestyle_overall", "freestyle")]))
    assert fields[-1] == "is_aggregate_standing"
    assert [(r["discipline_category"], r["is_aggregate_standing"]) for r in rows] == [
        ("", "1"), ("freestyle", "1"), ("net", "0")]


def test_a_listed_division_that_is_absent_stops_the_export(tmp_path):
    # Defect caught: a renamed discipline silently losing its standing mark and
    # counting as a sport result again.
    with pytest.raises(SystemExit, match="1995_worlds/womens_overall"):
        exporter.apply_aggregate_standings(
            [], _disciplines(),
            _write_list(tmp_path / "agg.csv", [("1995_worlds", "womens_overall", "cross_sport")]))


def test_a_scope_that_is_neither_cross_sport_nor_a_family_stops_the_export(tmp_path):
    # Defect caught: a typo or a fifth "family" slipping into the categories.
    with pytest.raises(SystemExit, match="scope must be"):
        exporter.apply_aggregate_standings(
            [], _disciplines(),
            _write_list(tmp_path / "agg.csv", [("1995_worlds", "mens_overall", "overall")]))


def test_a_provisional_classification_is_named_on_every_run_and_a_missing_confidence_stops_it(tmp_path, capsys):
    # Defect caught: an unsettled classification passing silently as settled, or
    # a row added with no statement of how sure it is.
    exporter.apply_aggregate_standings(
        [], _disciplines(),
        _write_list(tmp_path / "agg.csv", [("1995_worlds", "mens_overall", "cross_sport", "provisional")]))
    assert "classified provisionally: 1995_worlds/mens_overall" in capsys.readouterr().out
    with pytest.raises(SystemExit, match="confidence must be"):
        exporter.apply_aggregate_standings(
            [], _disciplines(),
            _write_list(tmp_path / "agg2.csv", [("1995_worlds", "mens_overall", "cross_sport", "")]))


def test_the_committed_results_mark_exactly_the_listed_standings():
    # Defect caught: the committed results drifting from the curated list, so a
    # standing publishes as a sport result or a contest drops out of its sport.
    with LIST.open(encoding="utf-8") as f:
        listed = {(r["event_key"], r["discipline_key"]): r["scope"] for r in csv.DictReader(f)}
    with (CANONICAL_INPUT / "event_disciplines.csv").open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    marked = {(r["event_key"], r["discipline_key"]): r["discipline_category"]
              for r in rows if r["is_aggregate_standing"] == "1"}
    assert listed, "the curated list is empty, so nothing was checked"
    assert set(marked) == set(listed)
    assert all(marked[k] == ("" if s == "cross_sport" else s) for k, s in listed.items())
    assert all(r["discipline_category"] for r in rows if r["is_aggregate_standing"] != "1")


def test_the_loader_stores_a_cross_sport_standing_with_no_family(tmp_path):
    # Defect caught: the loader filling an empty family with a placeholder, which
    # files an all-around standing under a sport.
    db = helpers.make_db(tmp_path)
    seed = helpers.build_mvfp_seed(tmp_path / "seed")
    path = seed / "seed_event_disciplines.csv"
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    rows = [dict(r, is_aggregate_standing="0") for r in rows] + [
        dict(rows[0], discipline_key="mens_overall", discipline_name="Men's Overall",
             discipline_category="", is_aggregate_standing="1")]
    helpers.write_csv(path, list(rows[0].keys()), rows)
    result = helpers.run(["legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py",
                          "--db", str(db), "--seed-dir", str(seed), "--no-backup"])
    assert result.returncode == 0, result.stderr
    conn = sqlite3.connect(db)
    try:
        got = dict(conn.execute(
            "SELECT name, COALESCE(discipline_category, '(none)') || '/' || is_aggregate_standing "
            "FROM event_disciplines WHERE event_id = '2000_idem_test'").fetchall())
    finally:
        conn.close()
    assert got == {"Open Singles Net": "net/0", "Men's Overall": "(none)/1"}
