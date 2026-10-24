"""
test_qc_trick_text_as_name.py
=============================

A trick sequence written after a competitor ("Name - Legbeater > Vortex") was read
as a doubles partner, and one written on its own line was read as a division
heading. The QC gate fails any competitor or division name carrying a trick arrow,
because no name or heading carries one.

Run from repo root:
    python -m pytest legacy_data/tests/test_qc_trick_text_as_name.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
MOD = REPO_ROOT / "legacy_data" / "pipeline" / "qc" / "run_qc.py"


def _load():
    spec = importlib.util.spec_from_file_location("run_qc_trick_text", MOD)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


qc = _load()


def _hard(disc_names: list[str], participant_names: list[str]) -> list[str]:
    discs = pd.DataFrame([{"event_key": "E", "discipline_name": n} for n in disc_names])
    parts = pd.DataFrame([{"event_key": "E", "display_name": n} for n in participant_names])
    collector = qc.IssueCollector()
    qc.check_trick_text(discs, parts, collector)
    return [i.table for i in collector.issues if i.severity == "hard" and i.code == "trick_text_as_name"]


def test_a_trick_line_as_a_competitor_fails():
    # Defect caught: a trick sequence published as a doubles partner.
    assert _hard(["Open Huge Combo"], ["Alpha Player", "Legbeater -> Vortex"]) == [
        "event_result_participants.csv"]


def test_a_trick_line_as_a_division_fails():
    # Defect caught: a contest published under a trick line as its heading.
    assert _hard(["Dimwalk>Double Legover>Smudge"], ["Alpha Player"]) == ["event_disciplines.csv"]


def test_ordinary_names_pass():
    # Defect caught: real competitors or headings failing the build.
    assert _hard(["Open Sick 3", "Most Rippin' Run"], ["Alpha Player", "Unknown"]) == []
