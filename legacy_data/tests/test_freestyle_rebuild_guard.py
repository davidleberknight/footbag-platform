"""
Production-safety guard for the freestyle rebuild.

The freestyle rebuild (freestyle/run_freestyle.sh) DELETE+INSERTs every freestyle
table, so it must never run against a live database. The guard script
freestyle/_assert_dev_db.sh refuses to proceed unless BOTH the environment is
development (FOOTBAG_ENV unset or exactly "development", never staging or
production) and the resolved target path is one of this checkout's own
disposable databases (database/footbag.db, the dev default, or
database/footbag-ci.db, the CI loader-smoke gate). There is no bypass flag.

These tests exercise the guard in isolation (they never run the rebuild itself),
so they touch no real data. Paths are canonicalized in the guard, so a relative
or symlinked path cannot slip a live database past it.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_rebuild_guard.py -v
"""
import os
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GUARD = REPO_ROOT / "freestyle" / "_assert_dev_db.sh"
DEV_DB = REPO_ROOT / "database" / "footbag.db"
CI_DB = REPO_ROOT / "database" / "footbag-ci.db"


def run_guard(db_path, footbag_env="__unset__"):
    """Invoke the guard with a target path and an optional FOOTBAG_ENV.

    footbag_env="__unset__" removes FOOTBAG_ENV from the environment entirely;
    any other value sets it explicitly.
    """
    env = dict(os.environ)
    env.pop("FOOTBAG_ENV", None)
    if footbag_env != "__unset__":
        env["FOOTBAG_ENV"] = footbag_env
    return subprocess.run(
        ["bash", str(GUARD), str(db_path)],
        env=env,
        capture_output=True,
        text=True,
    )


def test_allows_the_dev_database_when_environment_is_clean():
    # FOOTBAG_ENV unset, target is the checkout's dev database -> allowed.
    assert run_guard(DEV_DB).returncode == 0
    # Explicit development is equally allowed.
    assert run_guard(DEV_DB, footbag_env="development").returncode == 0


def test_allows_the_ci_smoke_database_on_purpose_not_as_drift():
    # The CI loader-smoke gate sets FOOTBAG_DB_PATH to database/footbag-ci.db, so
    # the guard must allow it: it is a disposable in-checkout database, and a
    # guard that allowed only footbag.db would refuse and break that gate.
    # Allowing both disposable checkout databases is the intended rule (never a
    # live database), not drift from a single-name rule. The file need not exist
    # locally; the path still canonicalizes.
    assert run_guard(CI_DB).returncode == 0


def test_refuses_a_non_development_environment():
    for env_value in ("production", "staging"):
        result = run_guard(DEV_DB, footbag_env=env_value)
        assert result.returncode != 0, env_value
        assert "FOOTBAG_ENV" in result.stderr


def test_refuses_an_alternate_database_path(tmp_path):
    # A development environment does not license an arbitrary target database.
    other = tmp_path / "elsewhere.db"
    result = run_guard(other, footbag_env="development")
    assert result.returncode != 0
    assert "database" in result.stderr.lower()


def test_refuses_an_alternate_path_even_when_environment_is_missing(tmp_path):
    # A clean (unset) environment passes the environment check but must not let
    # an out-of-checkout database through: the path check is independent.
    other = tmp_path / "elsewhere.db"
    result = run_guard(other)
    assert result.returncode != 0
    assert "database" in result.stderr.lower()


def test_rebuild_orchestrator_invokes_the_guard_before_any_loader():
    # The guard only protects the rebuild if the orchestrator actually calls it.
    # This pins the wiring: run_freestyle.sh invokes _assert_dev_db.sh, and does
    # so before the first loader invocation, so a refusal happens before any
    # table is touched. Without this, deleting the one call line would leave the
    # guard green in isolation while the rebuild ran unguarded.
    orchestrator = (REPO_ROOT / "freestyle" / "run_freestyle.sh").read_text()
    # Compare executable lines only: the header comments mention loader names,
    # which would otherwise anchor the "first loader" before the guard.
    executable = "\n".join(
        line for line in orchestrator.splitlines() if not line.lstrip().startswith("#")
    )
    guard_pos = executable.find("_assert_dev_db.sh")
    assert guard_pos != -1, "run_freestyle.sh no longer invokes the dev-db guard"
    first_invocation_pos = executable.find("_load_")
    assert first_invocation_pos != -1, "run_freestyle.sh runs no loaders?"
    assert guard_pos < first_invocation_pos, (
        "the dev-db guard must run before the first loader invocation"
    )
