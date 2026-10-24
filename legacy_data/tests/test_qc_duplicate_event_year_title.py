"""
test_qc_duplicate_event_year_title.py
=====================================

Results reach the archive through two lanes, the mirror for 1997 onward and the
curated sources before it, and each lane mints its own event key. One competition
captured by both lanes therefore ships as two events with distinct keys, two event
pages and every competitor's appearances counted twice, and a unique-key check
cannot see it. The QC gate fails any year and title shared by two events.

Run from repo root:
    python -m pytest legacy_data/tests/test_qc_duplicate_event_year_title.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
MOD = REPO_ROOT / "legacy_data" / "pipeline" / "qc" / "run_qc.py"


def _load():
    spec = importlib.util.spec_from_file_location("run_qc_duplicate_event", MOD)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


qc = _load()


def _hard(rows: list[tuple[str, str, str]]) -> list[str]:
    events = pd.DataFrame([{"event_key": k, "year": y, "event_name": n} for k, y, n in rows])
    collector = qc.IssueCollector()
    qc.check_events(events, collector)
    return [i.message for i in collector.issues
            if i.severity == "hard" and i.code == "duplicate_event_year_title"]


def test_one_competition_under_two_keys_fails():
    # Defect caught: a championship shipped twice, once from each lane.
    found = _hard([("1997_worlds", "1997", "18th Annual World Footbag Championships"),
                   ("1997_worlds_portland", "1997", "18th  annual world footbag championships"),
                   ("1997_kansas_open", "1997", "Kansas Open")])
    assert len(found) == 1
    assert "1997_worlds" in found[0] and "1997_worlds_portland" in found[0]


def test_the_same_title_in_different_years_passes():
    # Defect caught: an annual series flagged as a duplicate of itself.
    assert _hard([("1996_worlds", "1996", "World Footbag Championships"),
                  ("1997_worlds", "1997", "World Footbag Championships")]) == []
