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
import os
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

# The database these tests read is not tracked, so a fresh checkout does not have
# one and the path is not the same everywhere: a workstation builds
# database/footbag.db, while continuous integration builds its own file under a
# different name. FOOTBAG_TEST_DB names the file to read, so the run that owns a
# built database can point these tests at it instead of rebuilding one.
DB_PATH_ENV = "FOOTBAG_TEST_DB"
REQUIRE_ENV = "FOOTBAG_REQUIRE_DB"


# The guards that read the built database and must actually execute in a run that
# declares one. Named explicitly rather than discovered so that adding a
# database-backed guard is a deliberate act: the registry test below fails if a
# file calls require_loaded without being listed here, and the continuous
# integration runner reads this list so the two cannot drift.
REQUIRED_DB_INTEGRITY_GUARDS = (
    "test_freestyle_atw_direction.py",
    "test_freestyle_butterfly_side_default.py",
    "test_freestyle_incomplete_notation_cohort.py",
    "test_freestyle_same_in_out_scope.py",
    "test_freestyle_scoring_bracket_parity.py",
)


def _db_path() -> Path:
    override = os.environ.get(DB_PATH_ENV, "").strip()
    return Path(override).expanduser().resolve() if override else REPO_ROOT / "database" / "footbag.db"


DB_PATH = _db_path()


def _database_is_required() -> bool:
    """True when an unmet precondition must fail rather than skip.

    A skip reads as success. That is the honest answer where no database was
    asked for, and the wrong one in a run whose whole purpose is to execute these
    guards: there, a precondition nothing satisfies turns the guard off silently
    and permanently. Setting FOOTBAG_REQUIRE_DB=1 declares that the run owns a
    database, so anything short of executing the guard is a failure.
    """
    return os.environ.get(REQUIRE_ENV, "").strip() == "1"


def _precondition_unmet(reason: str) -> None:
    if _database_is_required():
        pytest.fail(
            f"database-backed guard could not run and {REQUIRE_ENV}=1 declares that it must: {reason}"
        )
    pytest.skip(reason)


def require_loaded(table: str, hint: str = "run the freestyle loaders first") -> None:
    """Skip the calling test unless `table` exists in the built database and has rows.

    Fails instead of skipping when the run declares a database is required.
    """
    if not DB_PATH.exists():
        _precondition_unmet(f"built database is absent at {DB_PATH}; {hint}")
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    except sqlite3.OperationalError:
        _precondition_unmet(f"built database has no {table} table; {hint}")
    finally:
        connection.close()
    if not count:
        _precondition_unmet(f"built database has an empty {table}; {hint}")
