"""The registry of database-backed guards stays in step with the guards themselves.

These guards assert over loaded data, so they cannot run without a built
database. That precondition used to be answered with a skip everywhere, and a
skip reads as success: in a run that had no database, every one of them reported
green while checking nothing, permanently and silently.

The fix has two halves, and this file protects the half that rots. One half is a
run declaring that it owns a database, which turns an unmet precondition into a
failure. The other half is the list of guards such a run must execute. A list is
only useful while it is complete, so this asserts that every file reading the
built database is on it, and that nothing on it has disappeared.
"""
from pathlib import Path

from built_db import REQUIRED_DB_INTEGRITY_GUARDS

TESTS_DIR = Path(__file__).resolve().parent


def _files_reading_the_built_database() -> set[str]:
    """Test files that actually call the precondition, not ones that discuss it.

    Matching the call form rather than the bare name keeps this file, which names
    the helper in prose, from counting itself.
    """
    found = set()
    for path in sorted(TESTS_DIR.glob("test_*.py")):
        if path.name == Path(__file__).name:
            continue
        if "require_loaded(" in path.read_text(encoding="utf-8"):
            found.add(path.name)
    return found


def test_every_database_backed_guard_is_registered():
    unregistered = _files_reading_the_built_database() - set(REQUIRED_DB_INTEGRITY_GUARDS)
    assert not unregistered, (
        f"{len(unregistered)} test file(s) read the built database but are absent from "
        f"REQUIRED_DB_INTEGRITY_GUARDS: {sorted(unregistered)}. A guard left off the list "
        f"is never required to run, so it can skip forever without anyone noticing."
    )


def test_no_registered_guard_has_vanished():
    missing = [name for name in REQUIRED_DB_INTEGRITY_GUARDS if not (TESTS_DIR / name).exists()]
    assert not missing, (
        f"REQUIRED_DB_INTEGRITY_GUARDS names {len(missing)} file(s) that no longer exist: "
        f"{missing}. Remove them from the list, or restore them."
    )


def test_the_registry_is_not_empty():
    # A run that requires a database but is handed an empty list would pass while
    # executing nothing, which is the failure this whole mechanism exists to stop.
    assert REQUIRED_DB_INTEGRITY_GUARDS
