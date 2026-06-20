"""Tests for report_legacy_member_honors.py (read-only honor-resolution dry-run).

Verifies the HoF worklist categorization: an honoree lands only when the curated
person_id resolves to a legacy_member_id that exists in the current member table.
Otherwise it is surfaced for a curator (no person_id in the roster, resolved
person with no member link, or a link that is not in the current table) rather
than silently dropped, since a missed honoree means a missed tier-2 grant.
"""
import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "report_legacy_member_honors.py"
_spec = importlib.util.spec_from_file_location("report_legacy_member_honors", _SCRIPT)
rep = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rep)


def test_hof_worklist_categorizes(tmp_path):
    hof = tmp_path / "hof.csv"
    hof.write_text(
        "full_name,induction_year,person_id\n"
        "Landed Hof,1997,p1\n"          # p1 -> 100, present in current members
        "No Link Hof,2000,p3\n"         # p3 resolves but has no member link
        "Mystery Hof,2001,\n"           # no person_id in the roster
        "Not Present Hof,2002,p9\n",    # p9 -> 999, not in the current table
        encoding="utf-8")
    pid2legacy = {"p1": "100", "p3": "", "p9": "999"}
    present = {"100"}
    wl = rep.hof_worklist(hof, pid2legacy, present)
    assert wl["landed"] == ["Landed Hof"]
    assert wl["no_legacy"] == ["No Link Hof"]
    assert wl["no_pid"] == ["Mystery Hof"]
    assert wl["not_present"] == ["Not Present Hof"]
