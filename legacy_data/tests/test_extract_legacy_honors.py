"""Tests for extract_legacy_honors.py.

is_hof via the curated person_id ID-join; is_bap via name -> historical_persons
(alias + name_variants aware) -> legacy_member_id, unambiguous only. Verifies
flags land only on legacy-linked resolved persons, ambiguous/unmatched names are
reported (never guessed), and HoF honorees with no legacy account are counted.
"""
import csv
import importlib.util
import sqlite3
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "member_data_scripts" / "extract_legacy_honors.py"
_spec = importlib.util.spec_from_file_location("extract_legacy_honors", _SCRIPT)
elh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(elh)


def _db(tmp_path):
    db = tmp_path / "t.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE historical_persons (person_id TEXT, person_name TEXT, "
                "aliases TEXT, legacy_member_id TEXT)")
    con.executemany(
        "INSERT INTO historical_persons VALUES (?,?,?,?)",
        [
            ("p1", "Kenny Shults", None, "100"),
            ("p2", "Jane Doe", None, "200"),
            ("p3", "No Legacy Hof", None, None),     # HoF person, no legacy account
            ("p4a", "Twin Name", None, "401"),
            ("p4b", "Twin Name", None, "402"),        # ambiguous BAP name
        ])
    con.execute("CREATE TABLE name_variants (canonical_normalized TEXT, variant_normalized TEXT)")
    con.execute("INSERT INTO name_variants VALUES ('jane doe','j doe')")
    con.commit()
    con.close()
    return db


def _run(tmp_path):
    db = _db(tmp_path)
    hof = tmp_path / "hof.csv"
    hof.write_text(
        "full_name,induction_year,person_id\n"
        "Kenny Shults,1997,p1\n"
        "No Legacy Hof,2000,p3\n"
        "Mystery Hof,2001,\n", encoding="utf-8")
    bap = tmp_path / "bap.csv"
    bap.write_text(
        "name,nickname,year_inducted\n"
        "Kenny Shults,The Enforcer,1992\n"
        "J Doe,JD,1995\n"          # resolves via name_variants -> Jane Doe -> p2
        "Twin Name,T,1996\n"       # ambiguous
        "Ghost Name,G,1998\n", encoding="utf-8")     # unmatched
    members = tmp_path / "members.csv"
    members.write_text(
        "legacy_member_id,is_hof,is_bap\n"
        "100,,\n200,,\n300,,\n401,,\n", encoding="utf-8")
    out = tmp_path / "out.csv"
    stats = elh.apply_honors(members, db, hof, bap, out)
    by_id = {r["legacy_member_id"]: r for r in csv.DictReader(out.open(encoding="utf-8"))}
    return stats, by_id


def test_is_hof_id_join(tmp_path):
    stats, by_id = _run(tmp_path)
    assert by_id["100"]["is_hof"] == "1"       # p1 -> legacy 100
    assert by_id["200"]["is_hof"] == "0"
    assert stats["hof_flagged"] == 1
    assert stats["hof_person_no_legacy"] == 1  # p3 resolved but unlinked
    assert stats["hof_no_person"] == 1         # Mystery Hof, empty person_id


def test_is_bap_unique_and_variant(tmp_path):
    _, by_id = _run(tmp_path)
    assert by_id["100"]["is_bap"] == "1"       # Kenny Shults -> p1 -> 100
    assert by_id["200"]["is_bap"] == "1"       # "J Doe" via name_variants -> Jane Doe -> p2 -> 200


def test_is_bap_ambiguous_not_flagged(tmp_path):
    stats, by_id = _run(tmp_path)
    assert by_id["401"]["is_bap"] == "0"       # Twin Name ambiguous -> not flagged
    assert "Twin Name" in stats["bap_ambiguous"]


def test_is_bap_unmatched_reported(tmp_path):
    stats, _ = _run(tmp_path)
    assert "Ghost Name" in stats["bap_unmatched"]
    assert stats["bap_flagged"] == 2           # only 100 and 200


# --- proposed-link overlay: re-run after reconciliation, pre-apply -----------

def _hof_only_fixture(tmp_path):
    """A HoF honoree (p3) who has no linked account in the database, plus the
    account (300) a reconciliation proposal would link them to."""
    db = _db(tmp_path)
    hof = tmp_path / "hof.csv"
    hof.write_text("full_name,induction_year,person_id\nNo Legacy Hof,2000,p3\n", encoding="utf-8")
    bap = tmp_path / "bap.csv"
    bap.write_text("name,nickname,year_inducted\n", encoding="utf-8")
    members = tmp_path / "members.csv"
    members.write_text("legacy_member_id,is_hof,is_bap\n300,,\n", encoding="utf-8")
    return db, hof, bap, members


def test_proposed_links_overlay_flags_an_account_missed_at_extract_time(tmp_path):
    # The extract-time pass sees only accounts already linked in the database, so
    # honoree p3's account 300 is missed; re-running with the Stage B proposal
    # p3 -> 300 overlaid lands the honor on 300 in the reconciled output.
    db, hof, bap, members = _hof_only_fixture(tmp_path)

    out1 = tmp_path / "out_extract.csv"
    s1 = elh.apply_honors(members, db, hof, bap, out1)
    by1 = {r["legacy_member_id"]: r for r in csv.DictReader(out1.open(encoding="utf-8"))}
    assert by1["300"]["is_hof"] == "0"
    assert s1["hof_person_no_legacy"] == 1        # p3 honoree, unlinked in the DB

    proposed = tmp_path / "proposed.csv"
    proposed.write_text(
        "historical_person_id,legacy_member_id,match_signal\np3,300,name_dob\n",
        encoding="utf-8")
    out2 = tmp_path / "out_reconciled.csv"
    s2 = elh.apply_honors(members, db, hof, bap, out2, proposed_links=proposed)
    by2 = {r["legacy_member_id"]: r for r in csv.DictReader(out2.open(encoding="utf-8"))}
    assert s2["proposed_links_overlaid"] == 1
    assert by2["300"]["is_hof"] == "1"
    assert s2["hof_flagged"] == 1
    assert s2["hof_person_no_legacy"] == 0        # p3 now resolves to an account


def test_proposed_links_overlay_does_not_write_the_database(tmp_path):
    db, hof, bap, members = _hof_only_fixture(tmp_path)
    proposed = tmp_path / "proposed.csv"
    proposed.write_text(
        "historical_person_id,legacy_member_id,match_signal\np3,300,name_dob\n",
        encoding="utf-8")
    before = db.read_bytes()
    elh.apply_honors(members, db, hof, bap, tmp_path / "out.csv", proposed_links=proposed)
    assert db.read_bytes() == before          # the honors run only reads the DB

    con = sqlite3.connect(db)
    linked = con.execute(
        "SELECT legacy_member_id FROM historical_persons WHERE person_id='p3'").fetchone()
    con.close()
    assert linked[0] is None                  # the proposed link was overlaid in memory only
