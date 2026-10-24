"""
test_qc_duplicate_discipline_spelling.py
========================================

A division spelled two ways in the placements lock, for example with a dash read
as "?" or a trailing colon, is exported as two disciplines under different keys.
The event page then shows the division twice, each copy holding part of its
places. The QC gate fails any two disciplines of one event whose names agree once
case, spacing and punctuation are ignored.

Run from repo root:
    python -m pytest legacy_data/tests/test_qc_duplicate_discipline_spelling.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
MOD = REPO_ROOT / "legacy_data" / "pipeline" / "qc" / "run_qc.py"


def _load():
    spec = importlib.util.spec_from_file_location("run_qc_discipline_spelling", MOD)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


qc = _load()


def _hard(rows: list[tuple[str, str, str]]) -> list[str]:
    discs = pd.DataFrame([{"event_key": e, "discipline_key": k, "discipline_name": n,
                           "team_type": "singles"} for e, k, n in rows])
    collector = qc.IssueCollector()
    qc.check_event_disciplines(discs, pd.DataFrame(), collector)
    return [i.message for i in collector.issues
            if i.severity == "hard" and i.code == "duplicate_discipline_spelling"]


def test_one_division_under_two_spellings_fails():
    # Defect caught: a division shown twice on its event page, its places split.
    found = _hard([("E", "intermediate_singles_net", "Intermediate Singles Net"),
                   ("E", "intermediate_singles_net_2", "Intermediate Singles Net:"),
                   ("E", "open_singles_net", "Open Singles Net")])
    assert len(found) == 1 and "intermediate_singles_net_2" in found[0]


def test_distinct_divisions_and_other_events_pass():
    # Defect caught: two real divisions, or the same division at two events,
    # failing the build.
    assert _hard([("E", "open_sick_3", "Open Sick 3"),
                  ("E", "open_sick_1", "Open Sick 1"),
                  ("F", "open_sick_3", "Open Sick 3")]) == []
