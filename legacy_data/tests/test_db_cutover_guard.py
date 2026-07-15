"""
Shared in-database post-cutover refusal for destructive seeders and loaders.

At cutover the operator appends a system_config row with config_key
'post_cutover' and value_json '1' to the live database. Unlike the host
env-file marker, this marker travels with every copy, snapshot, and restore of
the database file, so a destructive seeder pointed at a restored production
snapshot refuses before any mutation, on any machine, with no bypass flag.
scripts/lib/db_cutover_guard.py is the single implementation;
scripts/internal/assert-db-pre-cutover.sh is its shell entry.

Contract pinned here: missing file, missing system_config table, and no marker
row are all allowed (pre-cutover / fresh-build targets); a current value of '1'
is refused; a later-effective '0' row (the deliberate out-of-band disaster-
rebuild step) supersedes the '1' and is allowed again; and the probe opens
read-only, so checking a nonexistent path never creates a file.

The wiring tests pin that each destructive consumer actually invokes the guard:
deleting the call cannot pass silently.

Run from repo root:
    python -m pytest legacy_data/tests/test_db_cutover_guard.py -v
"""
import sqlite3
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
GUARD_PY = REPO_ROOT / "scripts" / "lib" / "db_cutover_guard.py"
GUARD_SH = REPO_ROOT / "scripts" / "internal" / "assert-db-pre-cutover.sh"

SYSTEM_CONFIG_DDL = """
CREATE TABLE system_config (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  config_key         TEXT NOT NULL,
  value_json         TEXT NOT NULL,
  effective_start_at TEXT NOT NULL,
  reason_text        TEXT NOT NULL,
  changed_by_member_id TEXT,
  UNIQUE (config_key, effective_start_at)
);
CREATE VIEW system_config_current AS
SELECT s.*
FROM system_config s
WHERE s.effective_start_at = (
  SELECT MAX(s2.effective_start_at)
  FROM system_config s2
  WHERE s2.config_key = s.config_key
    AND s2.effective_start_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
"""


def make_db(path, marker_rows=()):
    con = sqlite3.connect(path)
    con.executescript(SYSTEM_CONFIG_DDL)
    for i, (value, effective) in enumerate(marker_rows):
        con.execute(
            "INSERT INTO system_config (id, created_at, config_key, value_json,"
            " effective_start_at, reason_text) VALUES (?, ?, 'post_cutover', ?, ?, ?)",
            (f"cfg_test_{i}", effective, value, effective, "test fixture"),
        )
    con.commit()
    con.close()


def run_guard(db_path, entry=GUARD_SH):
    cmd = ["bash", str(entry)] if entry == GUARD_SH else ["python3", str(entry)]
    return subprocess.run(
        cmd + [str(db_path)], capture_output=True, text=True
    )


def test_allows_a_missing_database_file(tmp_path):
    # A fresh-build target does not exist yet.
    result = run_guard(tmp_path / "no-such.db")
    assert result.returncode == 0


def test_probing_a_missing_path_creates_no_file(tmp_path):
    target = tmp_path / "no-such.db"
    run_guard(target)
    assert not target.exists()


def test_allows_a_database_without_system_config(tmp_path):
    db = tmp_path / "bare.db"
    sqlite3.connect(db).close()
    result = run_guard(db)
    assert result.returncode == 0


def test_allows_a_pre_cutover_database(tmp_path):
    db = tmp_path / "pre.db"
    make_db(db)
    result = run_guard(db)
    assert result.returncode == 0


def test_refuses_a_marked_database(tmp_path):
    db = tmp_path / "marked.db"
    make_db(db, marker_rows=[("1", "2026-01-01T00:00:00.000Z")])
    result = run_guard(db)
    assert result.returncode != 0
    assert "post-cutover" in result.stderr
    assert "no bypass" in result.stderr


def test_refuses_via_the_python_entry_too(tmp_path):
    db = tmp_path / "marked.db"
    make_db(db, marker_rows=[("1", "2026-01-01T00:00:00.000Z")])
    result = run_guard(db, entry=GUARD_PY)
    assert result.returncode != 0
    assert "post-cutover" in result.stderr


def test_a_later_zero_row_supersedes_the_marker(tmp_path):
    # The deliberate disaster-rebuild step appends a '0' row; append-only
    # reversal, no UPDATE.
    db = tmp_path / "reverted.db"
    make_db(
        db,
        marker_rows=[
            ("1", "2026-01-01T00:00:00.000Z"),
            ("0", "2026-02-01T00:00:00.000Z"),
        ],
    )
    result = run_guard(db)
    assert result.returncode == 0


def executable_lines(path):
    return "\n".join(
        line
        for line in Path(path).read_text().splitlines()
        if not line.lstrip().startswith("#")
    )


def test_curator_seeder_wires_the_guard():
    body = executable_lines(REPO_ROOT / "scripts" / "seed_fh_curator.py")
    assert "assert_db_pre_cutover(db_path" in body


def test_freestyle_assert_script_wires_the_guard():
    body = executable_lines(REPO_ROOT / "freestyle" / "_assert_dev_db.sh")
    assert "assert-db-pre-cutover.sh" in body


def test_reset_local_db_wires_the_guard_before_any_phase():
    script = (REPO_ROOT / "scripts" / "reset-local-db.sh").read_text()
    lines = script.splitlines()
    guard_line = next(
        i for i, line in enumerate(lines)
        if "assert-db-pre-cutover.sh" in line and not line.lstrip().startswith("#")
    )
    slate_line = next(i for i, line in enumerate(lines) if "phase_slate()" in line)
    assert guard_line < slate_line, (
        "the cutover guard must run at top level before the slate phase that deletes the DB"
    )


def test_legacy_member_loader_wires_the_guard():
    body = executable_lines(
        REPO_ROOT / "legacy_data" / "member_data_scripts" / "load_legacy_export.py"
    )
    assert "assert_db_pre_cutover(args.db" in body


# ── Freestyle rebuild loaders open through the shared guard ───────────────────
#
# Every freestyle loader that wipes and reloads a freestyle table opens its target
# database through scripts/_freestyle_db.open_freestyle_db, so the same post-cutover
# refusal run_freestyle.sh applies once up front also protects a loader run directly,
# outside the orchestrator. The read-only QC loaders never mutate the database and
# are intentionally not in this set.

FREESTYLE_WRITE_LOADERS = [
    "freestyle/loaders/10_load_freestyle_records_to_sqlite.py",
    "freestyle/loaders/11_load_consecutive_records_to_sqlite.py",
    "freestyle/loaders/17_load_trick_dictionary.py",
    "freestyle/loaders/19_load_red_additions.py",
    "freestyle/loaders/20_link_footbag_org_sources.py",
    "freestyle/loaders/21_load_footbag_org_pending_tricks.py",
    "freestyle/loaders/21a_load_alias_additions.py",
    "freestyle/loaders/21b_apply_alias_overrides.py",
    "freestyle/loaders/26_load_symbolic_grammar.py",
    "freestyle/loaders/27_load_trick_tips.py",
    "freestyle/scripts/parse_freestyle_notation.py",
]


def _open_freestyle_db():
    import sys
    scripts = str(REPO_ROOT / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    from _freestyle_db import open_freestyle_db
    return open_freestyle_db


def test_open_freestyle_db_refuses_a_marked_database(tmp_path):
    db = tmp_path / "marked.db"
    make_db(db, marker_rows=[("1", "2026-01-01T00:00:00.000Z")])
    with pytest.raises(SystemExit):
        _open_freestyle_db()(str(db), "a freestyle rebuild loader")


def test_open_freestyle_db_allows_a_pre_cutover_database(tmp_path):
    db = tmp_path / "pre.db"
    make_db(db)
    conn = _open_freestyle_db()(str(db), "a freestyle rebuild loader")
    conn.close()  # returns a usable connection, not a refusal


@pytest.mark.parametrize("rel", FREESTYLE_WRITE_LOADERS)
def test_freestyle_write_loader_opens_through_the_guard(rel):
    body = executable_lines(REPO_ROOT / rel)
    assert "open_freestyle_db(" in body
