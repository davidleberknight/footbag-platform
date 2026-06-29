"""Tests for M12 validate_legacy_honors.py — integrity + curation worklist."""
import csv
import importlib.util
import sqlite3
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "member_data_scripts" / "validate_legacy_honors.py"
_spec = importlib.util.spec_from_file_location("validate_legacy_honors", _SCRIPT)
vlh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vlh)


def _fixtures(tmp_path, members_text):
    db = tmp_path / "t.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE historical_persons (person_id TEXT, person_name TEXT, "
                "aliases TEXT, legacy_member_id TEXT)")
    con.executemany("INSERT INTO historical_persons VALUES (?,?,?,?)", [
        ("p1", "Kenny Shults", None, "100"),
        ("p2", "Jane Doe", None, "200"),
        ("p3", "No Legacy Hof", None, None),
        ("p4a", "Twin Name", None, "401"),
        ("p4b", "Twin Name", None, "402"),
    ])
    con.execute("CREATE TABLE name_variants (canonical_normalized TEXT, variant_normalized TEXT)")
    con.execute("INSERT INTO name_variants VALUES ('jane doe','j doe')")
    con.commit(); con.close()
    hof = tmp_path / "hof.csv"
    hof.write_text("full_name,induction_year,person_id\nKenny Shults,1997,p1\n"
                   "No Legacy Hof,2000,p3\nMystery Hof,2001,\n", encoding="utf-8")
    bap = tmp_path / "bap.csv"
    bap.write_text("name,nickname,year_inducted\nKenny Shults,E,1992\nJ Doe,JD,1995\n"
                   "Twin Name,T,1996\nGhost Name,G,1998\n", encoding="utf-8")
    members = tmp_path / "members.csv"
    members.write_text("legacy_member_id,is_hof,is_bap\n" + members_text, encoding="utf-8")
    return members, db, hof, bap


# Flags consistent with the derivation: 100=HoF+BAP, 200=BAP(variant).
CLEAN = "100,1,1\n200,0,1\n300,0,0\n401,0,0\n"


def test_clean_integrity_ok(tmp_path):
    members, db, hof, bap = _fixtures(tmp_path, CLEAN)
    s = vlh.run(members, db, hof, bap, tmp_path / "worklist.csv")
    assert s["anomalies"] == []
    assert s["hof_flagged"] == 1 and s["bap_flagged"] == 2


def test_worklist_captures_gaps(tmp_path):
    members, db, hof, bap = _fixtures(tmp_path, CLEAN)
    s = vlh.run(members, db, hof, bap, None)
    got = {(w["honor"], w["status"]) for w in s["worklist"]}
    assert ("hof", "unresolved") in got           # Mystery Hof (no person_id)
    assert ("hof", "no_legacy_account") in got     # No Legacy Hof
    assert ("bap", "ambiguous") in got             # Twin Name
    assert ("bap", "unmatched") in got             # Ghost Name


def test_orphan_flag_is_anomaly(tmp_path):
    # 401 flagged is_hof but no roster honoree resolves to it -> integrity anomaly.
    members, db, hof, bap = _fixtures(tmp_path, "100,1,1\n200,0,1\n300,0,0\n401,1,0\n")
    s = vlh.run(members, db, hof, bap, None)
    assert any("is_hof flag(s) with no roster trace" in a for a in s["anomalies"])


def test_worklist_csv_written(tmp_path):
    members, db, hof, bap = _fixtures(tmp_path, CLEAN)
    out = tmp_path / "worklist.csv"
    vlh.run(members, db, hof, bap, out)
    rows = list(csv.DictReader(out.open(encoding="utf-8")))
    assert {"honor", "name", "status", "detail"} == set(rows[0].keys())
    assert any(r["name"] == "Ghost Name" for r in rows)
