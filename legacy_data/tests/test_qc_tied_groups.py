"""
test_qc_tied_groups.py
======================

A placing several competitors are tied at carries each further competitor's
players marked "tied_team:N", and each marked group loads as its own entry at
that place. The QC gate holds every marked group to the size of one competitor:
one player in a singles contest, two in a doubles contest. These pin that.

Run from repo root:
    python -m pytest legacy_data/tests/test_qc_tied_groups.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
MOD = REPO_ROOT / "legacy_data" / "pipeline" / "qc" / "run_qc.py"


def _load():
    spec = importlib.util.spec_from_file_location("run_qc_tied_groups", MOD)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


qc = _load()


def _hard_codes(team_type: str | None, notes: list[str]) -> list[str]:
    participants = pd.DataFrame([{
        "event_key": "2003_worlds_prague", "discipline_key": "intermediate_singles_net",
        "placement": "9", "participant_order": str(i + 1), "display_name": f"P{i}",
        "person_id": "", "team_person_key": "", "notes": n,
    } for i, n in enumerate(notes)])
    # None stands for a contest with no row in the disciplines table at all.
    disciplines = pd.DataFrame(
        [] if team_type is None else [{"event_key": "2003_worlds_prague",
                                       "discipline_key": "intermediate_singles_net",
                                       "team_type": team_type}],
        columns=["event_key", "discipline_key", "team_type"])
    collector = qc.IssueCollector()
    qc.check_event_result_participants(participants, pd.DataFrame(), disciplines,
                                       pd.DataFrame(), collector)
    return [i.code for i in collector.issues if i.severity == "hard"]


def test_singles_players_tied_one_per_group_pass():
    # Defect caught: every sourced singles tie failing the build because the gate
    # expects each tied group to be a doubles team of two.
    assert "invalid_tied_doubles_team" not in _hard_codes(
        "singles", ["", "tied_team:2", "tied_team:3"])


def test_a_tied_singles_group_of_two_players_fails():
    # Defect caught: two players marked as one tied singles entry, which would
    # load as a pair at a place in a singles contest.
    assert "invalid_tied_doubles_team" in _hard_codes(
        "singles", ["", "tied_team:2", "tied_team:2"])


def test_a_tied_doubles_team_of_two_passes():
    assert "invalid_tied_doubles_team" not in _hard_codes(
        "doubles", ["", "", "tied_team:2", "tied_team:2"])


def test_a_tied_group_in_a_contest_with_no_entry_size_fails():
    # Defect caught: a tie in a contest the disciplines table does not describe
    # passing as a doubles tie, so a mis-keyed pair loads as two tied entries.
    assert "invalid_tied_doubles_team" in _hard_codes(
        None, ["", "tied_team:2", "tied_team:2"])


def test_a_tied_group_in_a_team_contest_fails():
    # Defect caught: a tie in a historical team contest judged by the doubles
    # size, which says nothing about how many players a tied team should have.
    assert "invalid_tied_doubles_team" in _hard_codes(
        "team", ["", "", "", "tied_team:2", "tied_team:2"])


def test_a_tied_doubles_team_of_one_still_fails():
    # Defect caught: a tied doubles team with a missing partner slipping through.
    assert "invalid_tied_doubles_team" in _hard_codes(
        "doubles", ["", "", "tied_team:2"])
