"""Tests for crosscheck_member_profile_ids.py.

Read-only cross-check of member-account IDs vs the IDs in old profile-page URLs
vs the result-attribution links. Verifies the two gap sets that signal a real
problem: a profile URL with no member account (a link that would break), and an
attribution link with no member account (a result pointing at nothing).
"""
import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "crosscheck_member_profile_ids.py"
_spec = importlib.util.spec_from_file_location("crosscheck_member_profile_ids", _SCRIPT)
cc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cc)


def test_compare_flags_profile_and_attribution_orphans():
    a = {"1", "2", "3"}        # member accounts
    b = {"2", "3", "4"}        # profile URLs; 4 has no account
    c = {"3", "5"}             # attribution links; 5 has no account
    g = cc.compare_id_sets(a, b, c)
    assert g["profile_orphans"] == {"4"}
    assert g["hp_orphans"] == {"5"}
    assert g["account_only"] == {"1"}
    assert g["profile_resolved"] == {"2", "3"}
    assert g["hp_resolved"] == {"3"}


def test_compare_clean_when_profile_and_attribution_are_subsets():
    a = {"1", "2", "3"}
    g = cc.compare_id_sets(a, {"1", "2"}, {"2", "3"})
    assert g["profile_orphans"] == set()
    assert g["hp_orphans"] == set()


def test_ids_from_csv_skips_blanks(tmp_path):
    p = tmp_path / "club_members.csv"
    p.write_text(
        "legacy_club_key,mirror_member_id,display_name\n"
        "k1,100,Alice\n"
        "k2,,Bob\n"
        "k3,200,Carol\n",
        encoding="utf-8")
    assert cc.ids_from_csv(p, "mirror_member_id") == {"100", "200"}
