"""
test_qc_three_person_team.py
============================

A doubles-type result normally holds exactly two participants, and the QC gate
fails any other count. A curated source can name a three-person team; the export
keeps the third member and marks it as an additional team member, and that one
marked member is what makes the slot a valid team. These tests pin the gate's
acceptance of exactly that shape and its refusal of anything else.

Run from repo root:
    python -m pytest legacy_data/tests/test_qc_three_person_team.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
MOD = REPO_ROOT / "legacy_data" / "pipeline" / "qc" / "run_qc.py"


def _load():
    spec = importlib.util.spec_from_file_location("run_qc_three_person", MOD)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


qc = _load()


def _hard_codes(notes: list[str]) -> list[str]:
    participants = pd.DataFrame([{
        "event_key": "1986_worlds_golden", "discipline_key": "open_team_freestyle",
        "placement": "1", "participant_order": str(i + 1), "display_name": f"P{i}",
        "person_id": "", "team_person_key": "", "notes": n,
    } for i, n in enumerate(notes)])
    disciplines = pd.DataFrame([{"event_key": "1986_worlds_golden",
                                 "discipline_key": "open_team_freestyle", "team_type": "doubles"}])
    collector = qc.IssueCollector()
    qc.check_event_result_participants(participants, pd.DataFrame(), disciplines,
                                       pd.DataFrame(), collector)
    return [i.code for i in collector.issues if i.severity == "hard"]


def test_a_team_with_one_marked_additional_member_passes():
    # Defect caught: a sourced three-person team failing the build, or being
    # forced back to two members to pass it.
    assert "invalid_doubles_participant_count" not in _hard_codes(
        ["", "", "additional_team_member"])


def test_a_four_person_team_with_two_marked_members_passes():
    assert "invalid_doubles_participant_count" not in _hard_codes(
        ["", "", "additional_team_member", "additional_team_member"])


def test_an_unmarked_third_participant_still_fails():
    # Defect caught: a stray third name in a doubles slot slipping through.
    assert "invalid_doubles_participant_count" in _hard_codes(["", "", ""])


def test_two_marked_members_in_one_slot_still_fail():
    assert "invalid_doubles_participant_count" in _hard_codes(
        ["", "additional_team_member", "additional_team_member"])
