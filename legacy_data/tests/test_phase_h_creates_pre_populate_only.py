"""
test_phase_h_creates_pre_populate_only.py
=========================================

Verifies that Phase H's `06_cutover_pre_populated_clubs.py` is the SOLE
creator of live `clubs` rows in production, and that it only promotes
the `pre_populate`-class candidates (i.e. those with bootstrap_eligible=1).

This pins the contract MIGRATION_PLAN §9.1 prescribes:

  • pre_populate candidates → live `clubs` at cutover
  • onboarding_visible / dormant / junk candidates → remain in
    `legacy_club_candidates` (staging); never auto-promoted

The test simulates a production-style fresh-DB state (clubs table empty;
legacy_club_candidates populated by Phase G) and invokes the cutover
script as a subprocess. After the run, only the bootstrap_eligible=1
rows should appear in `clubs`.

Run from repo root:
    python -m pytest legacy_data/tests/test_phase_h_creates_pre_populate_only.py -v
"""
import os
import subprocess
import sqlite3
import sys
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
CUTOVER_SCRIPT = REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "06_cutover_pre_populated_clubs.py"
SEED_CSV = REPO_ROOT / "legacy_data" / "seed" / "clubs.csv"


# Three legacy_club_keys taken verbatim from the real seed/clubs.csv at
# the time of test authoring. The cutover script reads SEED_CSV for full-
# row fallback (city / country / description / etc.), so these must
# correspond to actual rows. If seed/clubs.csv is restructured and these
# keys vanish, this test will need updating.
PRE_POPULATE_KEY_A = "1005960946"   # FootbagDenmark, Copenhagen
PRE_POPULATE_KEY_B = "1014117242"   # Finnsta, Helsinki
ONBOARDING_VISIBLE_KEY = "1018615368"  # Fundación Footbag Colombia


@pytest.fixture
def fresh_db(tmp_path: Path) -> Path:
    """Create a fresh on-disk SQLite DB with the project schema loaded.
    Returns the path. On-disk (not :memory:) because the cutover script
    runs in a subprocess and needs a path to open."""
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db_path


def _seed_candidates_with_mixed_classification(db_path: Path) -> None:
    """Insert the test fixture state: two pre_populate candidates
    (bootstrap_eligible=1) + one onboarding_visible candidate
    (bootstrap_eligible=0). Mirrors the post-Phase-G state of
    legacy_club_candidates in production.

    All three reference real legacy_club_keys from seed/clubs.csv so the
    cutover script's CSV-fallback lookup succeeds.
    """
    conn = sqlite3.connect(db_path)
    ts = "2026-01-01T00:00:00Z"
    conn.executemany(
        """
        INSERT INTO legacy_club_candidates (
          id, created_at, created_by, updated_at, updated_by, version,
          legacy_club_key, display_name, city, country,
          classification, bootstrap_eligible
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?, ?, ?, ?)
        """,
        [
            ("lcc-prepop-a", ts, ts, PRE_POPULATE_KEY_A,
             "FootbagDenmark", "Copenhagen", "Denmark",
             "pre_populate", 1),
            ("lcc-prepop-b", ts, ts, PRE_POPULATE_KEY_B,
             "Finnsta", "Helsinki", "Finland",
             "pre_populate", 1),
            ("lcc-onboarding", ts, ts, ONBOARDING_VISIBLE_KEY,
             "Fundación Footbag Colombia", "Medellín", "Colombia",
             "onboarding_visible", 0),
        ],
    )
    conn.commit()
    conn.close()


def _run_cutover(db_path: Path) -> subprocess.CompletedProcess:
    """Invoke 06_cutover_pre_populated_clubs.py against the test DB."""
    # The script resolves SEED_CSV via a path relative to its own location;
    # it does not honor an env var. Running from repo root keeps that
    # resolution working.
    return subprocess.run(
        [sys.executable, str(CUTOVER_SCRIPT), "--db", str(db_path)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


def test_clubs_empty_before_cutover(fresh_db: Path) -> None:
    """Sanity: with only schema loaded, `clubs` starts empty.
    Confirms the test setup reproduces the production-fresh-DB state
    Phase H expects."""
    _seed_candidates_with_mixed_classification(fresh_db)
    conn = sqlite3.connect(fresh_db)
    n_clubs = conn.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]
    n_cand  = conn.execute(
        "SELECT COUNT(*) FROM legacy_club_candidates"
    ).fetchone()[0]
    conn.close()
    assert n_clubs == 0, "clubs must start empty (this is production-fresh state)"
    assert n_cand  == 3, "legacy_club_candidates seeding failed"


def test_cutover_creates_only_pre_populate_clubs(fresh_db: Path) -> None:
    """Core contract: after Phase H runs, `clubs` contains exactly the
    pre_populate-class candidates (bootstrap_eligible=1). The
    onboarding_visible candidate stays in staging and does NOT appear
    in `clubs`.
    """
    _seed_candidates_with_mixed_classification(fresh_db)
    result = _run_cutover(fresh_db)
    assert result.returncode == 0, (
        f"Cutover script failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    conn = sqlite3.connect(fresh_db)
    club_count = conn.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]
    assert club_count == 2, (
        f"Expected 2 live clubs (the 2 pre_populate-class candidates), "
        f"got {club_count}. The onboarding_visible candidate must not "
        f"appear in `clubs`.\nstdout: {result.stdout}"
    )

    # Verify the right two clubs ended up in `clubs` by checking
    # legacy_club_candidates.mapped_club_id — Phase H sets this to the
    # newly-created `clubs.id` for each eligible candidate, NULL for
    # non-eligible rows.
    mapped = dict(
        conn.execute(
            "SELECT legacy_club_key, mapped_club_id "
            "FROM legacy_club_candidates ORDER BY legacy_club_key"
        ).fetchall()
    )
    conn.close()

    assert mapped[PRE_POPULATE_KEY_A] is not None, (
        "Pre-populate candidate A (FootbagDenmark) should have its "
        "mapped_club_id set after cutover."
    )
    assert mapped[PRE_POPULATE_KEY_B] is not None, (
        "Pre-populate candidate B (Finnsta) should have its "
        "mapped_club_id set after cutover."
    )
    assert mapped[ONBOARDING_VISIBLE_KEY] is None, (
        "Onboarding-visible candidate must NOT have a mapped_club_id; "
        "it remains in staging until the wizard/admin promotes it."
    )


def test_cutover_idempotent_on_rerun(fresh_db: Path) -> None:
    """Sanity: running Phase H twice produces the same DB state (no
    duplicate `clubs` rows, no count drift). Idempotency is documented
    in 06_cutover_pre_populated_clubs.py's docstring; this pins it."""
    _seed_candidates_with_mixed_classification(fresh_db)
    first = _run_cutover(fresh_db)
    assert first.returncode == 0

    conn = sqlite3.connect(fresh_db)
    count_after_first = conn.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]
    conn.close()

    second = _run_cutover(fresh_db)
    assert second.returncode == 0

    conn = sqlite3.connect(fresh_db)
    count_after_second = conn.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]
    conn.close()

    assert count_after_first == count_after_second == 2, (
        f"Idempotency broken: clubs={count_after_first} after first run, "
        f"clubs={count_after_second} after second run."
    )


# ─────────────────────────────────────────────────────────────────────────
# Fail-fast contract (Phase H Slice A hardening).
#
# The cutover script must exit non-zero on two upstream-state failures so
# `run_pipeline.sh` and operators don't silently proceed to
# 07_load_bootstrap_leaders.py with partial/empty state.
# ─────────────────────────────────────────────────────────────────────────


def test_cutover_exits_nonzero_when_no_candidates(fresh_db: Path) -> None:
    """`legacy_club_candidates` empty means Phase G enrichment never ran
    (or a classifier regression silently emitted zero rows). The cutover
    must exit non-zero so the failure surfaces immediately rather than
    leaving downstream Phase I with no work AND no warning."""
    # No candidate seeding — fresh schema-only DB.
    result = _run_cutover(fresh_db)

    assert result.returncode != 0, (
        f"Cutover must exit non-zero when legacy_club_candidates is empty; "
        f"got rc={result.returncode}.\nstdout: {result.stdout}\n"
        f"stderr: {result.stderr}"
    )
    assert "ERROR" in result.stderr, (
        "Cutover must emit an ERROR-tagged stderr message naming the "
        "empty-candidates failure so the operator can act.\n"
        f"stderr: {result.stderr}"
    )

    # Nothing should have been written.
    conn = sqlite3.connect(fresh_db)
    n_clubs = conn.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]
    conn.close()
    assert n_clubs == 0, (
        f"Cutover wrote {n_clubs} clubs rows during a fail-fast exit; "
        "no-candidates path must not produce any DB writes."
    )


# Synthetic legacy_club_key guaranteed not to exist in seed/clubs.csv.
# Picked outside the legacy ID space (which is short numeric strings).
BOGUS_LEGACY_KEY = "99999_test_missing_from_seed_csv"


def _seed_eligible_candidate_with_missing_seed_row(db_path: Path) -> None:
    """Insert a single bootstrap_eligible candidate whose legacy_club_key
    does NOT appear in seed/clubs.csv. The cutover's CSV-fallback lookup
    will fail and the script must surface that as an ERROR exit, not a
    silent WARN."""
    conn = sqlite3.connect(db_path)
    ts = "2026-01-01T00:00:00Z"
    conn.execute(
        """
        INSERT INTO legacy_club_candidates (
          id, created_at, created_by, updated_at, updated_by, version,
          legacy_club_key, display_name, city, country,
          classification, bootstrap_eligible
        ) VALUES ('lcc-bogus', ?, 'test', ?, 'test', 1, ?,
                  'Bogus Test Club', 'Atlantis', 'Nowhere',
                  'pre_populate', 1)
        """,
        (ts, ts, BOGUS_LEGACY_KEY),
    )
    conn.commit()
    conn.close()


def test_cutover_exits_nonzero_when_eligible_candidate_missing_seed_csv(
    fresh_db: Path,
) -> None:
    """An eligible candidate without a matching seed/clubs.csv row would
    leave `mapped_club_id` NULL and FK-fail the downstream
    `07_load_bootstrap_leaders.py` with no useful upstream context.
    The cutover must surface this as an ERROR exit so the seed gap is
    resolved before re-running."""
    _seed_eligible_candidate_with_missing_seed_row(fresh_db)
    result = _run_cutover(fresh_db)

    assert result.returncode != 0, (
        f"Cutover must exit non-zero when an eligible candidate has no "
        f"seed CSV row; got rc={result.returncode}.\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )
    assert "ERROR" in result.stderr, (
        "Cutover must emit an ERROR-tagged stderr message naming the "
        "missing-seed failure so the operator can act.\n"
        f"stderr: {result.stderr}"
    )
    assert BOGUS_LEGACY_KEY in result.stderr, (
        "Cutover stderr must name the offending legacy_club_key so the "
        f"operator can locate the gap. Expected {BOGUS_LEGACY_KEY!r} in:\n"
        f"{result.stderr}"
    )


def _seed_only_non_eligible_candidates(db_path: Path) -> None:
    """Insert candidates only in non-pre_populate classifications
    (bootstrap_eligible=0). Mirrors a degenerate Phase G output where
    enrichment ran but emitted zero pre_populate-class rows — the
    classifier-regression failure mode Goal 2 of Slice A hardens
    against."""
    conn = sqlite3.connect(db_path)
    ts = "2026-01-01T00:00:00Z"
    conn.executemany(
        """
        INSERT INTO legacy_club_candidates (
          id, created_at, created_by, updated_at, updated_by, version,
          legacy_club_key, display_name, city, country,
          classification, bootstrap_eligible
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?, ?, ?, 0)
        """,
        [
            ("lcc-onboarding", ts, ts, ONBOARDING_VISIBLE_KEY,
             "Fundación Footbag Colombia", "Medellín", "Colombia",
             "onboarding_visible"),
        ],
    )
    conn.commit()
    conn.close()


def test_cutover_exits_nonzero_when_zero_eligible_candidates(
    fresh_db: Path,
) -> None:
    """`legacy_club_candidates` populated but with zero bootstrap_eligible=1
    rows means the §9.1 classifier silently emitted no pre_populate
    candidates (or Phase G ran against the wrong input). Phase H must
    fail-fast so the regression surfaces before 07_load_bootstrap_leaders.py
    finds zero FK targets and downstream wiring lands in a degenerate
    empty state."""
    _seed_only_non_eligible_candidates(fresh_db)
    result = _run_cutover(fresh_db)

    assert result.returncode != 0, (
        f"Cutover must exit non-zero when zero bootstrap_eligible "
        f"candidates exist; got rc={result.returncode}.\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )
    assert "ERROR" in result.stderr, (
        "Cutover must emit an ERROR-tagged stderr message naming the "
        "zero-eligible-candidates failure so the operator can act.\n"
        f"stderr: {result.stderr}"
    )
    assert "bootstrap_eligible" in result.stderr, (
        "Cutover stderr must name the bootstrap_eligible column so the "
        "operator knows where to look upstream.\n"
        f"stderr: {result.stderr}"
    )

    # Nothing should have been written.
    conn = sqlite3.connect(fresh_db)
    n_clubs = conn.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]
    conn.close()
    assert n_clubs == 0, (
        f"Cutover wrote {n_clubs} clubs rows during a fail-fast exit; "
        "zero-eligible path must not produce any DB writes."
    )
