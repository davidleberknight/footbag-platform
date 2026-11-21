"""
test_tied_doubles_load.py
=========================

Two doubles teams the source lists tied at one place load as two result entries
at that place, one per team with its two players, the shape an uploaded results
file stores a tie in. The tied team reaches the loader marked "tied_team:N" by a
TIED_TEAM team correction.

Run from repo root:
    python -m pytest legacy_data/tests/test_tied_doubles_load.py -v
"""
from __future__ import annotations

import csv
import importlib.util
import sqlite3
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"
LOADER = "legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py"

_helpers_spec = importlib.util.spec_from_file_location(
    "tied_doubles_loader_helpers", LEGACY / "tests" / "test_loader_idempotency.py")
helpers = importlib.util.module_from_spec(_helpers_spec)
_helpers_spec.loader.exec_module(helpers)


def _seed_tied_doubles(tmp_path: Path) -> Path:
    """The helpers' one-event seed with its division made a doubles net division
    whose 1st place holds two teams, the second marked as tied."""
    seed = helpers.build_mvfp_seed(tmp_path / "seed")
    discs = seed / "seed_event_disciplines.csv"
    with discs.open(encoding="utf-8") as f:
        d = list(csv.DictReader(f))
    d[0].update(discipline_name="Open Doubles Net", team_type="doubles")
    helpers.write_csv(discs, list(d[0].keys()), d)
    parts = seed / "seed_event_result_participants.csv"
    with parts.open(encoding="utf-8") as f:
        p = list(csv.DictReader(f))
    base = p[0]
    rows = [dict(base, participant_order=str(n), display_name=name, person_id="", notes=note)
            for n, (name, note) in enumerate([("Ann A", ""), ("Bob B", ""),
                                              ("Cat C", "tied_team:2"), ("Dan D", "tied_team:2")],
                                             start=1)]
    helpers.write_csv(parts, list(base.keys()), rows)
    return seed


def test_two_teams_tied_at_one_place_load_as_two_entries_at_that_place(tmp_path):
    # Defect caught: two tied doubles teams loading as one four-player entry,
    # which the site shows as a single team of four.
    seed = _seed_tied_doubles(tmp_path)
    db = helpers.make_db(tmp_path)
    result = helpers.run([LOADER, "--db", str(db), "--seed-dir", str(seed), "--no-backup"])
    assert result.returncode == 0, result.stderr
    conn = sqlite3.connect(db)
    try:
        entries = conn.execute(
            "SELECT e.id, e.placement, p.participant_order, p.display_name "
            "FROM event_result_entries e JOIN event_result_entry_participants p "
            "ON p.result_entry_id = e.id WHERE e.id LIKE 'result_2000_idem_test_%' "
            "ORDER BY e.id, p.participant_order").fetchall()
    finally:
        conn.close()
    by_entry: dict[str, list] = {}
    for entry_id, place, order, name in entries:
        by_entry.setdefault(entry_id, []).append((place, order, name))
    assert sorted(by_entry.values()) == [
        [(1, 1, "Ann A"), (1, 2, "Bob B")],
        [(1, 1, "Cat C"), (1, 2, "Dan D")],
    ]
