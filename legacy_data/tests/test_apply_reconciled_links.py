"""
test_apply_reconciled_links.py
==============================

Contract tests for apply_reconciled_links.py, the guarded writer that applies the
Stage B proposed historical-person links (historical_persons.legacy_member_id):

  * dry run by default -- artifacts written, database untouched;
  * --apply required to write; the write is one atomic transaction;
  * production / staging / /srv/footbag targets are refused before the DB opens;
  * the audit CSV and rollback SQL are produced before any write, and the
    rollback SQL round-trips;
  * every precondition (unknown person / account, an account already linked to
    another person, a duplicate within the set) blocks the write;
  * an already-linked proposal is a no-op, reported honestly, with no rollback
    line and no rewrite.

Run from repo root:
    python -m pytest legacy_data/tests/test_apply_reconciled_links.py -v
"""
import csv
import importlib.util
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "database" / "schema.sql"
SCRIPT = REPO_ROOT / "legacy_data" / "member_data_scripts" / "apply_reconciled_links.py"

_spec = importlib.util.spec_from_file_location("apply_reconciled_links", SCRIPT)
arl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(arl)


def make_db(tmp_path, hp_rows=None, lm_ids=("100", "200", "300")):
    db = tmp_path / "t.db"
    con = sqlite3.connect(db)
    con.executescript(SCHEMA.read_text())
    for lid in lm_ids:
        con.execute(
            "INSERT INTO legacy_members (legacy_member_id, display_name, "
            "display_name_normalized, import_source, imported_at) VALUES (?,?,?,?,?)",
            (lid, "x", "x", "mirror", "2026-01-01T00:00:00Z"))
    for pid, name, lid in (hp_rows or [("hp_pre", "Pre Linked", "100"), ("hp_new", "New Person", None)]):
        con.execute(
            "INSERT INTO historical_persons (person_id, person_name, legacy_member_id) VALUES (?,?,?)",
            (pid, name, lid))
    con.commit()
    con.close()
    return db


def write_proposed(tmp_path, rows):
    p = tmp_path / "proposed.csv"
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["historical_person_id", "legacy_member_id", "match_signal"],
                           lineterminator="\n")
        w.writeheader()
        for hp, lm, sig in rows:
            w.writerow({"historical_person_id": hp, "legacy_member_id": lm, "match_signal": sig})
    return p


def run(db, proposed, tmp_path, apply=False, env_extra=None):
    cmd = [sys.executable, str(SCRIPT), "--proposed-links", str(proposed), "--db", str(db),
           "--audit-out", str(tmp_path / "audit.csv"), "--rollback-out", str(tmp_path / "rb.sql")]
    if apply:
        cmd.append("--apply")
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    return subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT, env=env)


def link_of(db, pid):
    con = sqlite3.connect(db)
    row = con.execute("SELECT legacy_member_id FROM historical_persons WHERE person_id=?", (pid,)).fetchone()
    con.close()
    return row[0]


def test_dry_run_default_writes_nothing_but_emits_artifacts(tmp_path):
    db = make_db(tmp_path)
    proposed = write_proposed(tmp_path, [("hp_new", "200", "name_dob")])
    r = run(db, proposed, tmp_path, apply=False)
    assert r.returncode == 0, r.stderr
    assert link_of(db, "hp_new") is None                 # no database write
    assert (tmp_path / "audit.csv").exists()
    assert (tmp_path / "rb.sql").exists()


def test_apply_flag_required_to_write(tmp_path):
    db = make_db(tmp_path)
    proposed = write_proposed(tmp_path, [("hp_new", "200", "name_dob")])
    run(db, proposed, tmp_path, apply=False)
    assert link_of(db, "hp_new") is None
    r = run(db, proposed, tmp_path, apply=True)
    assert r.returncode == 0, r.stderr
    assert link_of(db, "hp_new") == "200"


def test_guard_refuses_deployed_target(tmp_path):
    db = make_db(tmp_path)
    proposed = write_proposed(tmp_path, [("hp_new", "200", "name_dob")])
    r = run(db, proposed, tmp_path, apply=True, env_extra={"FOOTBAG_ENV": "staging"})
    assert r.returncode != 0
    assert "refusing to apply links" in r.stderr
    assert link_of(db, "hp_new") is None
    # A /srv/footbag path is refused before the DB is even opened.
    r2 = subprocess.run(
        [sys.executable, str(SCRIPT), "--proposed-links", str(proposed),
         "--db", "/srv/footbag/production/footbag.db"],
        capture_output=True, text=True, cwd=REPO_ROOT)
    assert r2.returncode != 0
    assert "refusing to apply links" in r2.stderr


def test_audit_and_rollback_written_before_any_write(tmp_path):
    # A dry run performs no database write yet still emits both artifacts, so they
    # do not depend on the write having happened.
    db = make_db(tmp_path)
    proposed = write_proposed(tmp_path, [("hp_new", "200", "name_dob"), ("hp_pre", "100", "verified_id")])
    run(db, proposed, tmp_path, apply=False)
    audit = {r["historical_person_id"]: r for r in csv.DictReader((tmp_path / "audit.csv").open(encoding="utf-8"))}
    assert audit["hp_new"]["action"] == "link"
    assert audit["hp_pre"]["action"] == "already_linked"
    rb = (tmp_path / "rb.sql").read_text()
    assert "hp_new" in rb            # the change gets a rollback line
    assert "hp_pre" not in rb        # the no-op does not


def test_rollback_sql_round_trips(tmp_path):
    db = make_db(tmp_path)
    proposed = write_proposed(tmp_path, [("hp_new", "200", "name_dob")])
    run(db, proposed, tmp_path, apply=True)
    assert link_of(db, "hp_new") == "200"
    con = sqlite3.connect(db)
    con.executescript((tmp_path / "rb.sql").read_text())
    con.close()
    assert link_of(db, "hp_new") is None


def test_rollback_sql_enforces_foreign_keys_and_states_the_apply_order(tmp_path):
    # The links rollback runs BEFORE the members rollback (it un-links persons
    # that reference accounts the members rollback deletes); the file says so
    # and carries its own foreign-key pragma so a wrong-order apply fails
    # loudly instead of leaving dangling links.
    db = make_db(tmp_path)
    proposed = write_proposed(tmp_path, [("hp_new", "200", "name_dob")])
    run(db, proposed, tmp_path, apply=False)
    rb = (tmp_path / "rb.sql").read_text()
    assert "PRAGMA foreign_keys=ON;" in rb
    assert rb.index("PRAGMA foreign_keys=ON;") < rb.index("BEGIN;")
    assert "BEFORE apply_members_rollback.sql" in rb


def _errs(tmp_path, hp_rows, links):
    db = make_db(tmp_path, hp_rows=hp_rows)
    con = sqlite3.connect(db)
    errs = arl.validate_preconditions(
        con, [{"historical_person_id": h, "legacy_member_id": l, "match_signal": s} for h, l, s in links])
    con.close()
    return errs


def test_precondition_unknown_person(tmp_path):
    errs = _errs(tmp_path, [("hp_new", "New", None)], [("ghost", "200", "name_dob")])
    assert any("not in historical_persons" in e for e in errs)


def test_precondition_unknown_account(tmp_path):
    errs = _errs(tmp_path, [("hp_new", "New", None)], [("hp_new", "999", "name_dob")])
    assert any("not in legacy_members" in e for e in errs)


def test_precondition_account_already_linked_to_another_person(tmp_path):
    errs = _errs(tmp_path, [("hp_a", "A", "100"), ("hp_new", "New", None)], [("hp_new", "100", "name_dob")])
    assert any("already linked to a different person" in e for e in errs)


def test_precondition_duplicate_account_in_set(tmp_path):
    errs = _errs(tmp_path, [("hp_new", "New", None), ("hp_two", "Two", None)],
                 [("hp_new", "200", "name_dob"), ("hp_two", "200", "name_dob")])
    assert any("account proposed more than once" in e for e in errs)


def test_apply_refuses_and_writes_nothing_when_a_precondition_fails(tmp_path):
    db = make_db(tmp_path, hp_rows=[("hp_new", "New", None)])
    proposed = write_proposed(tmp_path, [("ghost", "200", "name_dob")])   # unknown person
    r = run(db, proposed, tmp_path, apply=True)
    assert r.returncode != 0
    assert "precondition" in r.stderr.lower()
    assert link_of(db, "hp_new") is None


def test_link_writes_are_atomic(tmp_path):
    # A batch whose second link collides with an existing link (the partial unique
    # index) raises and rolls back, leaving the first, valid link unwritten.
    db = make_db(tmp_path, hp_rows=[("hp_a", "A", "100"), ("hp_new", "New", None), ("hp_bad", "Bad", None)])
    con = sqlite3.connect(db)
    changes = [("hp_new", None, "200", "name_dob"), ("hp_bad", None, "100", "name_dob")]  # 100 already on hp_a
    with pytest.raises(Exception):
        arl.apply_links(con, changes)
    con.close()
    assert link_of(db, "hp_new") is None      # rolled back, not partially applied
    assert link_of(db, "hp_bad") is None


def test_already_linked_proposal_is_a_no_op(tmp_path):
    db = make_db(tmp_path, hp_rows=[("hp_pre", "Pre", "100")])
    con = sqlite3.connect(db)
    changes, noops = arl.plan_changes(
        con, [{"historical_person_id": "hp_pre", "legacy_member_id": "100", "match_signal": "verified_id"}])
    con.close()
    assert changes == []
    assert noops == [("hp_pre", "100", "verified_id")]


def test_connect_enforces_foreign_keys(tmp_path):
    db = make_db(tmp_path)
    con = arl._connect(db)
    on = con.execute("PRAGMA foreign_keys").fetchone()[0]
    con.close()
    assert on == 1


def test_foreign_key_violation_fails_loudly(tmp_path):
    # With foreign keys enforced, writing a link to an account that does not
    # exist raises rather than silently leaving a dangling reference, and the
    # transaction leaves nothing behind.
    db = make_db(tmp_path, hp_rows=[("hp_new", "New", None)])
    con = arl._connect(db)
    with pytest.raises(Exception):
        arl.apply_links(con, [("hp_new", None, "does-not-exist", "name_dob")])
    con.close()
    assert link_of(db, "hp_new") is None


def test_claim_state_on_legacy_members_is_untouched(tmp_path):
    # The link writer touches only historical_persons.legacy_member_id, so a
    # completed claim on the legacy account it links is preserved.
    db = make_db(tmp_path, hp_rows=[("hp_new", "New", None)])
    con = sqlite3.connect(db)
    con.execute(
        "UPDATE legacy_members SET claimed_by_member_id='mem-x', claimed_at='2026-01-02T00:00:00Z' "
        "WHERE legacy_member_id='200'")
    con.commit()
    con.close()

    proposed = write_proposed(tmp_path, [("hp_new", "200", "name_dob")])
    r = run(db, proposed, tmp_path, apply=True)
    assert r.returncode == 0, r.stderr
    assert link_of(db, "hp_new") == "200"

    con = sqlite3.connect(db)
    claim = con.execute(
        "SELECT claimed_by_member_id, claimed_at FROM legacy_members WHERE legacy_member_id='200'").fetchone()
    con.close()
    assert claim == ("mem-x", "2026-01-02T00:00:00Z")
