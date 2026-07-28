"""Shared precondition for tests that read the built platform database.

These tests assert over loaded data rather than over fixtures, so they can only
run once the loaders have populated the table they read. Guarding on the
database file existing is not the same condition: a workstation keeps the file
between runs, and a pipeline run that resets it, or aborts before its load step,
leaves the file in place with empty tables.

An empty table is the worse failure of the two it causes. A test that asserts no
row breaks a rule passes vacuously when there are no rows, so it reports success
while checking nothing; a test that asserts a specific row exists fails and looks
like a real regression. This guard turns both into an honest skip.
"""
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "database" / "footbag.db"


def require_loaded(table: str, hint: str = "run the freestyle loaders first") -> None:
    """Skip the calling test unless `table` exists in the built database and has rows."""
    if not DB_PATH.exists():
        pytest.skip(f"built database is absent; {hint}")
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    except sqlite3.OperationalError:
        pytest.skip(f"built database has no {table} table; {hint}")
    finally:
        connection.close()
    if not count:
        pytest.skip(f"built database has an empty {table}; {hint}")
