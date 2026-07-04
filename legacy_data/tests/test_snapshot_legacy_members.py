"""
test_snapshot_legacy_members.py
===============================

Contract tests for snapshot_legacy_members.py, the read-only pre-write snapshot
that lets the reconciled legacy_members load be rolled back:

  * it writes the audit CSV and the rollback SQL and touches no database row;
  * the rollback restores an overwritten row and deletes a newly inserted row --
    proven end to end against the real loader;
  * the rollback never mentions the claim columns, so a completed claim survives;
  * affected ids are classified will_update vs will_insert;
  * output ordering is deterministic;
  * production / staging / /srv/footbag targets are refused.

Run from repo root:
    python -m pytest legacy_data/tests/test_snapshot_legacy_members.py -v
"""
import csv
import importlib.util
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "database" / "schema.sql"
MDS = REPO_ROOT / "legacy_data" / "member_data_scripts"
SNAP = MDS / "snapshot_legacy_members.py"
LOADER = MDS / "load_legacy_export.py"

_spec = importlib.util.spec_from_file_location("snapshot_legacy_members", SNAP)
snap = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(snap)


def make_db(tmp_path):
    db = tmp_path / "t.db"
    con = sqlite3.connect(db)
    con.executescript(SCHEMA.read_text())
    con.execute(
        "INSERT INTO legacy_members (legacy_member_id, real_name, display_name, "
        "display_name_normalized, import_source, imported_at, version) "
        "VALUES ('100','Old Name','Old Name','old name','mirror','2026-01-01T00:00:00Z',1)")
    con.commit()
    con.close()
    return db


def reconciled_csv(tmp_path, rows):
    p = tmp_path / "reconciled.csv"
    fields = ["legacy_member_id", "member_valid", "real_name", "display_name", "is_hof", "is_bap"]
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})
    return p


def run_snapshot(db, csv_path, tmp_path, env_extra=None):
    cmd = [sys.executable, str(SNAP), "--members-csv", str(csv_path), "--db", str(db),
           "--audit-out", str(tmp_path / "m_audit.csv"), "--rollback-out", str(tmp_path / "m_rb.sql")]
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    return subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT, env=env)


def run_loader_apply(db, csv_path):
    return subprocess.run(
        [sys.executable, str(LOADER), "--export", str(csv_path), "--db", str(db), "--apply"],
        capture_output=True, text=True, cwd=REPO_ROOT)


def rows_by_id(db):
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    out = {r["legacy_member_id"]: dict(r) for r in con.execute("SELECT * FROM legacy_members")}
    con.close()
    return out


def test_snapshot_is_read_only_but_emits_artifacts(tmp_path):
    db = make_db(tmp_path)
    csv_path = reconciled_csv(tmp_path, [{"legacy_member_id": "100", "member_valid": "1", "real_name": "New"}])
    before = db.read_bytes()
    r = run_snapshot(db, csv_path, tmp_path)
    assert r.returncode == 0, r.stderr
    assert db.read_bytes() == before                  # no database write
    assert (tmp_path / "m_audit.csv").exists()
    assert (tmp_path / "m_rb.sql").exists()


def test_audit_classifies_update_vs_insert(tmp_path):
    db = make_db(tmp_path)
    csv_path = reconciled_csv(tmp_path, [
        {"legacy_member_id": "100", "member_valid": "1", "real_name": "New Name", "display_name": "New Name"},
        {"legacy_member_id": "200", "member_valid": "1", "real_name": "Fresh", "display_name": "Fresh"},
    ])
    run_snapshot(db, csv_path, tmp_path)
    audit = {r["legacy_member_id"]: r["action"] for r in csv.DictReader((tmp_path / "m_audit.csv").open(encoding="utf-8"))}
    assert audit == {"100": "will_update", "200": "will_insert"}


def test_rollback_restores_overwritten_row_and_deletes_inserted_row(tmp_path):
    # End to end against the real loader: after the load, replaying the rollback
    # SQL must return legacy_members to its pre-load state.
    db = make_db(tmp_path)
    csv_path = reconciled_csv(tmp_path, [
        {"legacy_member_id": "100", "member_valid": "1", "real_name": "New Name",
         "display_name": "New Name", "is_hof": "1"},
        {"legacy_member_id": "200", "member_valid": "1", "real_name": "Fresh Person",
         "display_name": "Fresh Person"},
    ])
    run_snapshot(db, csv_path, tmp_path)
    assert run_loader_apply(db, csv_path).returncode == 0

    after_load = rows_by_id(db)
    assert after_load["100"]["real_name"] == "New Name"
    assert after_load["100"]["import_source"] == "legacy_site_data"
    assert "200" in after_load

    con = sqlite3.connect(db)
    con.executescript((tmp_path / "m_rb.sql").read_text())
    con.close()

    restored = rows_by_id(db)
    assert "200" not in restored                       # inserted row deleted
    assert restored["100"]["real_name"] == "Old Name"  # overwritten row restored
    assert restored["100"]["is_hof"] == 0
    assert restored["100"]["import_source"] == "mirror"
    assert restored["100"]["version"] == 1


def test_rollback_excludes_claim_columns_and_preserves_claim_state(tmp_path):
    db = make_db(tmp_path)
    # Seed a completed claim (foreign keys off only for this test seed, so the
    # claim can reference a member the fixture does not create).
    con = sqlite3.connect(db)
    con.execute("PRAGMA foreign_keys=OFF")
    con.execute("UPDATE legacy_members SET claimed_by_member_id='mem-x', "
                "claimed_at='2026-01-02T00:00:00Z' WHERE legacy_member_id='100'")
    con.commit()
    con.close()

    csv_path = reconciled_csv(tmp_path, [{"legacy_member_id": "100", "member_valid": "1", "real_name": "New"}])
    run_snapshot(db, csv_path, tmp_path)
    rb = (tmp_path / "m_rb.sql").read_text()
    # The header names the columns in prose; no restore statement assigns them.
    assert "SET claimed_by_member_id" not in rb
    assert "claimed_at =" not in rb

    con = sqlite3.connect(db)
    con.execute("PRAGMA foreign_keys=OFF")
    con.executescript(rb)
    claim = con.execute(
        "SELECT claimed_by_member_id, claimed_at FROM legacy_members WHERE legacy_member_id='100'").fetchone()
    con.close()
    assert claim == ("mem-x", "2026-01-02T00:00:00Z")


def test_rollback_ordering_is_deterministic(tmp_path):
    db = make_db(tmp_path)
    con = sqlite3.connect(db)
    con.execute("INSERT INTO legacy_members (legacy_member_id, import_source, imported_at) "
                "VALUES ('050','mirror','2026-01-01T00:00:00Z')")
    con.commit()
    con.close()
    csv_path = reconciled_csv(tmp_path, [
        {"legacy_member_id": "200", "member_valid": "1", "real_name": "B"},
        {"legacy_member_id": "050", "member_valid": "1", "real_name": "A"},
        {"legacy_member_id": "100", "member_valid": "1", "real_name": "C"},
    ])
    run_snapshot(db, csv_path, tmp_path)
    first = (tmp_path / "m_rb.sql").read_text()
    run_snapshot(db, csv_path, tmp_path)
    assert (tmp_path / "m_rb.sql").read_text() == first
    # ids appear in sorted order.
    assert first.index("'050'") < first.index("'100'") < first.index("'200'")


def test_guard_refuses_deployed_target(tmp_path):
    db = make_db(tmp_path)
    csv_path = reconciled_csv(tmp_path, [{"legacy_member_id": "100", "member_valid": "1", "real_name": "New"}])
    r = run_snapshot(db, csv_path, tmp_path, env_extra={"FOOTBAG_ENV": "production"})
    assert r.returncode != 0
    assert "refusing to snapshot" in r.stderr
