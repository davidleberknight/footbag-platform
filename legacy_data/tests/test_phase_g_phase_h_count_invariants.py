"""
test_phase_g_phase_h_count_invariants.py
=========================================

Pins the two count invariants the IP requires for the Phase G + Phase H
cross-pipeline handoff (legacy_data/IMPLEMENTATION_PLAN.md, "Club
cleanup pipeline" checklist):

  Invariant 1 — clubs-count equals bootstrap_eligible count.
    After Phase H step 06 runs against a post-Phase-G candidate set,
    the live `clubs` row count must equal the number of candidates with
    `bootstrap_eligible = 1`. Non-eligible candidates (onboarding_visible,
    dormant, junk) must NOT appear in `clubs`.

  Invariant 2 — mapped_club_id matches the candidate↔clubs intersection.
    The number of `legacy_club_candidates` rows with a non-NULL
    `mapped_club_id` must equal the number of those rows whose
    `mapped_club_id` actually resolves to a live `clubs.id`. Said
    differently: no candidate may carry a stale FK pointing at a missing
    club. (Phase H 06 stamps `mapped_club_id` ONLY when the matching
    `clubs` row is created or already exists, so this invariant cannot
    fail on the happy path — but it pins the contract for future loader
    refactors.)

Setup approach: candidates are seeded directly into the DB via SQL,
simulating the post-Phase-G state. Phase G's CSV-to-DB INSERT shape
is already pinned by test_resolution_status_default.py + the Phase G
production run; the invariant here is about the COMPOSED state after
Phase H 06 transforms that input.

The fixture seeds 6 candidates using real `seed/clubs.csv`
legacy_club_keys (so Phase H 06's seed-CSV fallback succeeds) with a
mix of classifications:

  • 3 pre_populate (bootstrap_eligible=1)  → must become live clubs
  • 1 onboarding_visible (bootstrap_eligible=0) → stays in staging
  • 2 dormant            (bootstrap_eligible=0) → stays in staging

Run from repo root:
    python -m pytest legacy_data/tests/test_phase_g_phase_h_count_invariants.py -v
"""
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
CUTOVER_SCRIPT = REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "06_cutover_pre_populated_clubs.py"


# Real legacy_club_keys from seed/clubs.csv (verified 2026-05-18). Phase H
# 06 reads seed/clubs.csv for full-row fallback when inserting clubs from
# scratch; these keys must correspond to actual seed rows or the test
# will fail with a different signature than the invariant it's trying
# to assert.
PRE_POPULATE_KEYS = [
    "1005960946",  # FootbagDenmark, Copenhagen
    "1014117242",  # Finnsta, Helsinki
    "1019075457",  # Riverside Kicks, Savannah
]
ONBOARDING_VISIBLE_KEYS = [
    "1018615368",  # Fundación Footbag Colombia
]
DORMANT_KEYS = [
    "1021384954",  # Freestyle Fanatics
    "1025613544",  # ToMiStyKa Footbag Club
]


@pytest.fixture
def fresh_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db_path


def _seed_mixed_candidates(db_path: Path) -> None:
    """Insert 6 candidates with mixed classifications, simulating the
    Phase G post-state. All reference real seed/clubs.csv keys so
    Phase H 06's full-row fallback succeeds."""
    conn = sqlite3.connect(db_path)
    ts = "2026-01-01T00:00:00Z"
    rows = []
    for i, key in enumerate(PRE_POPULATE_KEYS):
        rows.append((
            f"lcc-prepop-{i}", ts, ts,
            key, f"Pre-Populate {i}", "Town", "Country",
            "pre_populate", 1,
        ))
    for i, key in enumerate(ONBOARDING_VISIBLE_KEYS):
        rows.append((
            f"lcc-onb-{i}", ts, ts,
            key, f"Onboarding-Visible {i}", "Town", "Country",
            "onboarding_visible", 0,
        ))
    for i, key in enumerate(DORMANT_KEYS):
        rows.append((
            f"lcc-dorm-{i}", ts, ts,
            key, f"Dormant {i}", "Town", "Country",
            "dormant", 0,
        ))
    conn.executemany(
        """
        INSERT INTO legacy_club_candidates (
          id, created_at, created_by, updated_at, updated_by, version,
          legacy_club_key, display_name, city, country,
          classification, bootstrap_eligible
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    conn.close()


def _run_cutover(db_path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CUTOVER_SCRIPT), "--db", str(db_path)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


def test_clubs_count_equals_bootstrap_eligible_count(fresh_db: Path) -> None:
    """Invariant 1: COUNT(clubs) == COUNT(candidates WHERE bootstrap_eligible=1).

    Three eligible candidates → three live clubs; three non-eligible
    candidates stay in staging. Pins the §10.1 cutover contract: Phase H
    promotes ONLY pre_populate-class rows; everything else awaits the
    wizard.
    """
    _seed_mixed_candidates(fresh_db)
    result = _run_cutover(fresh_db)
    assert result.returncode == 0, (
        f"Cutover script failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    conn = sqlite3.connect(fresh_db)
    clubs_count = conn.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]
    bootstrap_eligible_count = conn.execute(
        "SELECT COUNT(*) FROM legacy_club_candidates WHERE bootstrap_eligible = 1"
    ).fetchone()[0]
    conn.close()

    assert clubs_count == bootstrap_eligible_count == len(PRE_POPULATE_KEYS), (
        f"Invariant 1 broken: clubs={clubs_count}, "
        f"bootstrap_eligible={bootstrap_eligible_count}, "
        f"fixture pre_populate count={len(PRE_POPULATE_KEYS)}.\n"
        f"stdout: {result.stdout}"
    )


def test_mapped_club_id_count_equals_candidate_clubs_intersection(
    fresh_db: Path,
) -> None:
    """Invariant 2: no candidate carries a stale `mapped_club_id` FK.

    Asserted as:
      COUNT(candidates WHERE mapped_club_id IS NOT NULL)
        == COUNT(candidates INNER JOIN clubs ON mapped_club_id = clubs.id)

    Both counts must equal the number of bootstrap_eligible candidates
    after Phase H 06 runs. A stale `mapped_club_id` (FK pointing at a
    deleted/missing club) would make the LHS exceed the RHS.
    """
    _seed_mixed_candidates(fresh_db)
    result = _run_cutover(fresh_db)
    assert result.returncode == 0, (
        f"Cutover script failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    conn = sqlite3.connect(fresh_db)
    mapped_count = conn.execute(
        "SELECT COUNT(*) FROM legacy_club_candidates "
        "WHERE mapped_club_id IS NOT NULL"
    ).fetchone()[0]
    intersection_count = conn.execute(
        "SELECT COUNT(*) FROM legacy_club_candidates lcc "
        "INNER JOIN clubs c ON lcc.mapped_club_id = c.id"
    ).fetchone()[0]
    conn.close()

    assert mapped_count == intersection_count == len(PRE_POPULATE_KEYS), (
        f"Invariant 2 broken: candidates_with_mapped_club_id={mapped_count}, "
        f"candidates_inner_join_clubs={intersection_count}, "
        f"fixture pre_populate count={len(PRE_POPULATE_KEYS)}.\n"
        f"A divergence here means some candidate has a mapped_club_id "
        f"pointing at a missing or wrong `clubs.id`.\nstdout: {result.stdout}"
    )
