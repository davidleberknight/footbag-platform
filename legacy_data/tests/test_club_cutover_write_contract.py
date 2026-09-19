"""
test_club_cutover_write_contract.py
===================================

The write contract the four club-cutover loaders share, and the orchestrator's
side of it.

Phase H runs against the workstation database that already holds the one-shot
member import from the frozen legacy dump. A rebuild is not a recovery for a bad
club load at that moment, so each loader plans its writes, renders an audit CSV
and a rollback SQL file from the state the database is actually in, and only then
writes. Both halves are load-bearing and they fail in opposite directions:

  - A loader that writes by default is the hand invocation nobody meant to make.
  - An orchestrator that forgets the flag completes reporting success having
    written nothing, which is the quieter of the two and the reason the flag is
    asserted here rather than trusted.

The rollback is the part a convention cannot be trusted with. A file rendered
from what a loader expected to find, rather than from the rows that are really
there, reads as safety while restoring something else. So the contract
fingerprints the rows it rendered from and re-checks them under the write lock.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_cutover_write_contract.py -v
"""
import argparse
import re
import sqlite3
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CLUB_SCRIPTS = REPO_ROOT / "legacy_data" / "clubs" / "scripts"
ORCHESTRATOR = REPO_ROOT / "legacy_data" / "run_pipeline.sh"
LOCAL_REBUILD = REPO_ROOT / "scripts" / "reset-local-db.sh"

sys.path.insert(0, str(CLUB_SCRIPTS))
from _cutover_write_contract import (  # noqa: E402
    CutoverWrite, PreStateMoved, add_contract_args, sql_literal,
)

# Every Phase H writer, by the name the orchestrator calls it.
MUTATING_LOADERS = (
    "06_cutover_pre_populated_clubs.py",
    "07_load_bootstrap_leaders.py",
    "07a_load_bootstrap_leader_signals.py",
    "08_resolve_event_host_clubs.py",
)


# ── the orchestrator's side ────────────────────────────────────────────────

def _phase_h() -> str:
    text = ORCHESTRATOR.read_text(encoding="utf-8")
    match = re.search(r"^run_phase_h\(\) \{\n(.*?)^\}", text, re.M | re.S)
    assert match, (
        "run_phase_h is no longer a function in the orchestrator, so what it "
        "invokes cannot be checked. Either it was renamed or Phase H moved.")
    return match.group(1)


def _invocation(block: str, script: str) -> str:
    """One loader's invocation, line continuations joined."""
    joined = block.replace("\\\n", " ")
    for line in joined.splitlines():
        if script in line:
            return line
    return ""


@pytest.mark.parametrize("script", MUTATING_LOADERS)
def test_phase_h_opts_into_writes_for_every_mutating_loader(script: str) -> None:
    # The failure this catches is silent in the worst way: every loader defaults
    # to a dry run, so a Phase H invocation missing the flag completes, reports
    # its planned counts, exits zero, and writes nothing. The club cutover would
    # simply not have happened, and the next phase would fail somewhere else.
    invocation = _invocation(_phase_h(), script)
    assert invocation, f"Phase H no longer invokes {script}"
    assert "--apply" in invocation, (
        f"Phase H invokes {script} without --apply. The loader defaults to a dry "
        "run, so this phase would complete successfully having written nothing.")


@pytest.mark.parametrize("script", MUTATING_LOADERS)
def test_phase_h_names_both_artifacts_for_every_mutating_loader(script: str) -> None:
    invocation = _invocation(_phase_h(), script)
    assert "--audit-out" in invocation and "--rollback-out" in invocation, (
        f"Phase H invokes {script} without naming its audit and rollback files. "
        "They are what undo a bad club phase without redoing the one-shot member "
        "import, so where they land is the orchestrator's decision to state.")


# The local rebuild is the second orchestrator of these loaders, and the one
# that would have gone quiet: it runs on every developer machine and in the
# database-load gate, and three of the four are invoked from it. A rebuild that
# skipped the flag would produce a database with no club links, no bootstrap
# leaders and no leader signals, and say nothing about it.
REBUILD_LOADERS = (
    "06_cutover_pre_populated_clubs.py",
    "07_load_bootstrap_leaders.py",
    "07a_load_bootstrap_leader_signals.py",
)


def _rebuild_invocation(script: str) -> str:
    joined = LOCAL_REBUILD.read_text(encoding="utf-8").replace("\\\n", " ")
    for line in joined.splitlines():
        if script in line and not line.lstrip().startswith("#"):
            return line
    return ""


@pytest.mark.parametrize("script", REBUILD_LOADERS)
def test_the_local_rebuild_opts_into_writes(script: str) -> None:
    invocation = _rebuild_invocation(script)
    assert invocation, f"the local rebuild no longer invokes {script}"
    assert "--apply" in invocation, (
        f"the local rebuild invokes {script} without --apply. Every loader here "
        "defaults to a dry run, so a rebuild would finish with a database "
        "missing its club rows and report success.")


@pytest.mark.parametrize("script", REBUILD_LOADERS)
def test_the_local_rebuild_names_both_artifacts(script: str) -> None:
    invocation = _rebuild_invocation(script)
    assert "--audit-out" in invocation and "--rollback-out" in invocation, (
        f"the local rebuild invokes {script} without naming its audit and "
        "rollback files")


@pytest.mark.parametrize("script", MUTATING_LOADERS)
def test_every_mutating_loader_carries_the_shared_contract(script: str) -> None:
    # Four copies of a safety rule drift, and the copy that drifts is the one
    # nobody reads again. This asserts the rule stayed in one place.
    source = (CLUB_SCRIPTS / script).read_text(encoding="utf-8")
    assert "_cutover_write_contract" in source, (
        f"{script} no longer imports the shared write contract")
    assert "add_contract_args(" in source, (
        f"{script} does not take its flags from the shared contract, so --apply "
        "may not mean there what it means in its three siblings")
    assert "contract.apply(" in source, (
        f"{script} does not write through the contract, so nothing enforces that "
        "its artifacts exist before its transaction opens")


@pytest.mark.parametrize("script", MUTATING_LOADERS)
def test_every_mutating_loader_refuses_a_deployed_or_post_cutover_target(script: str) -> None:
    # 08 carried no guard of any kind and was the one Phase H writer that would
    # still have run against a restored post-cutover snapshot.
    source = (CLUB_SCRIPTS / script).read_text(encoding="utf-8")
    assert "assert_maintainer_db_target(" in source, (
        f"{script} does not refuse a production, staging or post-cutover target "
        "before it opens the database")


# ── the contract itself, against a table of its own ────────────────────────

def _make_db(tmp_path: Path) -> Path:
    db = tmp_path / "contract.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE widget (id TEXT PRIMARY KEY, label TEXT)")
    conn.executemany("INSERT INTO widget VALUES (?, ?)",
                     [("a", "first"), ("b", "second")])
    conn.commit()
    conn.close()
    return db


def _args(tmp_path: Path, *, apply: bool):
    parser = argparse.ArgumentParser()
    add_contract_args(parser, audit_default="audit.csv", rollback_default="rb.sql")
    argv = ["--audit-out", str(tmp_path / "audit.csv"),
            "--rollback-out", str(tmp_path / "rb.sql")]
    if apply:
        argv.append("--apply")
    return parser.parse_args(argv)


def _snapshot(conn):
    return conn.execute("SELECT id, label FROM widget ORDER BY id").fetchall()


def _rows(db: Path):
    conn = sqlite3.connect(db)
    try:
        return conn.execute("SELECT id, label FROM widget ORDER BY id").fetchall()
    finally:
        conn.close()


def _plan(contract: CutoverWrite, conn) -> None:
    before = _snapshot(conn)
    contract.plan(
        conn,
        snapshot=_snapshot,
        audit_rows=[{"action": "update", "id": "a", "label": "changed"}],
        rollback_sql=[f"UPDATE widget SET label = {sql_literal(label)} "
                      f"WHERE id = {sql_literal(row_id)};"
                      for row_id, label in before],
        rollback_note="test",
    )


def _write(cur) -> None:
    cur.execute("UPDATE widget SET label = 'changed' WHERE id = 'a'")


def test_a_dry_run_writes_both_artifacts_and_no_rows(tmp_path: Path) -> None:
    db = _make_db(tmp_path)
    conn = sqlite3.connect(db)
    contract = CutoverWrite("probe", _args(tmp_path, apply=False),
                            audit_fields=["action", "id", "label"])
    _plan(contract, conn)
    written = contract.apply(conn, _write)
    conn.close()

    assert written is False
    assert (tmp_path / "audit.csv").exists(), "the audit CSV is the dry run's output"
    assert (tmp_path / "rb.sql").exists()
    assert _rows(db) == [("a", "first"), ("b", "second")], (
        "a run without --apply changed the database")


def test_applying_writes_and_the_rollback_restores_the_exact_rows(tmp_path: Path) -> None:
    db = _make_db(tmp_path)
    before = _rows(db)

    conn = sqlite3.connect(db)
    contract = CutoverWrite("probe", _args(tmp_path, apply=True),
                            audit_fields=["action", "id", "label"])
    _plan(contract, conn)
    assert contract.apply(conn, _write) is True
    conn.close()

    assert _rows(db) == [("a", "changed"), ("b", "second")]

    conn = sqlite3.connect(db)
    conn.executescript((tmp_path / "rb.sql").read_text(encoding="utf-8"))
    conn.close()
    assert _rows(db) == before, (
        "the rollback did not restore the exact rows the run replaced")


def test_writing_before_the_artifacts_exist_is_refused(tmp_path: Path) -> None:
    # The ordering is the contract. A loader that could write first would leave
    # the artifacts describing a state that had already gone.
    db = _make_db(tmp_path)
    conn = sqlite3.connect(db)
    contract = CutoverWrite("probe", _args(tmp_path, apply=True),
                            audit_fields=["action", "id", "label"])
    with pytest.raises(RuntimeError, match="apply\\(\\) before plan\\(\\)"):
        contract.apply(conn, _write)
    conn.close()
    assert _rows(db) == [("a", "first"), ("b", "second")]


def test_a_database_that_moved_since_the_rollback_was_rendered_is_refused(
        tmp_path: Path) -> None:
    # The case the pre-state digest exists for: the rollback file on disk
    # describes rows that are no longer there, so applying it would restore the
    # wrong ones. Refusing is the only honest outcome, and a dropped table is
    # not the point here; an ordinary edit between the render and the lock is.
    db = _make_db(tmp_path)
    conn = sqlite3.connect(db)
    contract = CutoverWrite("probe", _args(tmp_path, apply=True),
                            audit_fields=["action", "id", "label"])
    _plan(contract, conn)

    other = sqlite3.connect(db)
    other.execute("UPDATE widget SET label = 'somebody else' WHERE id = 'b'")
    other.commit()
    other.close()

    with pytest.raises(PreStateMoved, match="changed between writing"):
        contract.apply(conn, _write)
    conn.close()

    assert _rows(db) == [("a", "first"), ("b", "somebody else")], (
        "the refused run wrote anyway")
