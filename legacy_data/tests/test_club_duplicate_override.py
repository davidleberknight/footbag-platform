"""
test_club_duplicate_override.py
================================

Pins the curator-authoritative duplicate-clubs override mechanism in
``legacy_data/clubs/scripts/02_build_legacy_club_candidates.py``.

Background
----------
``seed/clubs.csv`` is mirror-derived; the legacy site occasionally
lists the same real-world club twice (two ``legacy_club_key`` values
for the same name). Both rows can flow through the R1-R10 classifier
and emerge as ``pre_populate`` → both promote to live ``clubs`` rows
in Phase H → users see the same club twice in production.

``overrides/club_duplicates.csv`` adjudicates these cases. The drop
side's ``bootstrap_eligible`` is forced to 0 after classification so
Phase H's pre_populate filter skips it. The keep side is untouched.

Schema: ``keep_legacy_key,drop_legacy_key,reason``. The ``keep_*``
column documents the canonical winner for curator audit; only
``drop_legacy_key`` is consumed by the pipeline.

Tests covered
-------------
  1. ``load_club_duplicate_overrides`` parses the CSV → returns the
     set of drop_legacy_keys.
  2. ``apply_club_duplicate_overrides`` flips bootstrap_eligible to 0
     on rows whose key is in the drop set; preserves category.
  3. Rows NOT in the drop set keep their bootstrap_eligible value.
  4. End-to-end: when Phase H 06 runs against a candidates table where
     two pre_populate-class rows existed but the override suppressed
     one, exactly one live club is created.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_duplicate_override.py -v
"""
import importlib.util
import sqlite3
import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
CLASSIFIER_PATH = (
    REPO_ROOT / "legacy_data" / "clubs" / "scripts"
    / "02_build_legacy_club_candidates.py"
)
CUTOVER_SCRIPT = (
    REPO_ROOT / "legacy_data" / "clubs" / "scripts"
    / "06_cutover_pre_populated_clubs.py"
)

# Real seed/clubs.csv keys used in the integration test: both Les Pieds
# à Gilles candidates. Phase H 06 reads seed/clubs.csv for full-row
# fallback so these must correspond to actual rows there.
LES_PIEDS_KEEP_KEY = "1042652245"   # canonical 2003 row (URL + 12 events)
LES_PIEDS_DROP_KEY = "1488489195"   # empty 2017 duplicate


def _load_module():
    """Load 02_build_legacy_club_candidates.py via importlib (numeric
    prefix prevents normal import). Returns the module."""
    spec = importlib.util.spec_from_file_location(
        "classifier_02", CLASSIFIER_PATH,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["classifier_02"] = module
    spec.loader.exec_module(module)
    return module


classifier = _load_module()


# ── Override loader ──────────────────────────────────────────────────


def test_load_club_duplicate_overrides_parses_drop_keys(tmp_path: Path) -> None:
    """The loader returns the set of drop_legacy_keys, stripping
    whitespace. keep_legacy_key + reason columns are present in the
    CSV for curator audit but not consumed."""
    csv = tmp_path / "club_duplicates.csv"
    csv.write_text(
        "keep_legacy_key,drop_legacy_key,reason\n"
        "AAA,BBB,empty duplicate\n"
        "CCC, DDD ,trailing space tolerated\n",
        encoding="utf-8",
    )
    result = classifier.load_club_duplicate_overrides(csv)
    assert result == {"BBB", "DDD"}


def test_load_club_duplicate_overrides_missing_file_returns_empty(
    tmp_path: Path,
) -> None:
    """Missing override file is the graceful default: no overrides
    applied. New repos / fresh installs work without the file."""
    missing = tmp_path / "does_not_exist.csv"
    result = classifier.load_club_duplicate_overrides(missing)
    assert result == set()


# ── Override application ─────────────────────────────────────────────


def test_apply_override_suppresses_bootstrap_eligible_on_drop_key() -> None:
    """When a row's _club_key is in the drop set, bootstrap_eligible is
    overridden to 0. category stays as the classifier-derived value
    (audit visibility preserved)."""
    df = pd.DataFrame([
        {"_club_key": "A", "category": "pre_populate",       "bootstrap_eligible": 1},
        {"_club_key": "B", "category": "pre_populate",       "bootstrap_eligible": 1},
        {"_club_key": "C", "category": "onboarding_visible", "bootstrap_eligible": 0},
    ])
    n = classifier.apply_club_duplicate_overrides(df, {"B"}, key_col="_club_key")
    assert n == 1
    assert df.loc[df["_club_key"] == "A", "bootstrap_eligible"].iloc[0] == 1
    assert df.loc[df["_club_key"] == "B", "bootstrap_eligible"].iloc[0] == 0
    assert df.loc[df["_club_key"] == "B", "category"].iloc[0] == "pre_populate"
    assert df.loc[df["_club_key"] == "C", "bootstrap_eligible"].iloc[0] == 0


def test_apply_override_no_op_on_empty_drop_set() -> None:
    """Empty drop set is a no-op; returns 0; DataFrame unchanged."""
    df = pd.DataFrame([
        {"_club_key": "A", "category": "pre_populate", "bootstrap_eligible": 1},
    ])
    n = classifier.apply_club_duplicate_overrides(df, set(), key_col="_club_key")
    assert n == 0
    assert df.loc[0, "bootstrap_eligible"] == 1


def test_apply_override_handles_unknown_keys_safely() -> None:
    """Drop set keys that don't exist in the DataFrame are ignored
    without error (curator might list a key that was already removed
    upstream)."""
    df = pd.DataFrame([
        {"_club_key": "A", "category": "pre_populate", "bootstrap_eligible": 1},
    ])
    n = classifier.apply_club_duplicate_overrides(
        df, {"NOT_IN_DF"}, key_col="_club_key",
    )
    assert n == 0
    assert df.loc[0, "bootstrap_eligible"] == 1


# ── End-to-end via Phase H 06 ────────────────────────────────────────


@pytest.fixture
def fresh_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db_path


def _seed_les_pieds_candidates(db_path: Path) -> None:
    """Insert both Les Pieds à Gilles candidates with the post-override
    state: keep_key has bootstrap_eligible=1, drop_key has
    bootstrap_eligible=0 (classifier-stage override already applied
    upstream). Both still classified pre_populate; only eligibility
    differs."""
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
            ("lcc-pieds-keep", ts, ts, LES_PIEDS_KEEP_KEY,
             "Les Pieds à Gilles", "Lausanne", "Switzerland",
             "pre_populate", 1),
            ("lcc-pieds-drop", ts, ts, LES_PIEDS_DROP_KEY,
             "Les Pieds à Gilles", "Lausanne", "Switzerland",
             "pre_populate", 0),
        ],
    )
    conn.commit()
    conn.close()


def test_phase_h_06_creates_only_one_club_when_override_suppresses_duplicate(
    fresh_db: Path,
) -> None:
    """End-to-end contract: a confirmed duplicate pair promotes to exactly
    one live club (the keep), and the dropped candidate's mapped_club_id is
    merged onto that same club so any reference to the drop resolves to the
    canonical club. The drop never creates its own `clubs` row.

    Without the duplicate adjudication both rows would promote and the user
    would see "Les Pieds à Gilles" twice in production.
    """
    _seed_les_pieds_candidates(fresh_db)

    result = subprocess.run(
        [sys.executable, str(CUTOVER_SCRIPT), "--db", str(fresh_db)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, (
        f"Cutover failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    conn = sqlite3.connect(fresh_db)
    club_count = conn.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]
    mapped = dict(conn.execute(
        "SELECT legacy_club_key, mapped_club_id "
        "FROM legacy_club_candidates ORDER BY legacy_club_key"
    ).fetchall())
    conn.close()

    assert club_count == 1, (
        f"Duplicate adjudication failed: expected 1 live club (only the keep "
        f"promotes), got {club_count}.\nstdout: {result.stdout}"
    )
    assert mapped[LES_PIEDS_KEEP_KEY] is not None, (
        "Keep row should have mapped_club_id set after cutover."
    )
    assert mapped[LES_PIEDS_DROP_KEY] == mapped[LES_PIEDS_KEEP_KEY], (
        "Dropped duplicate must merge onto the keep's club (its mapped_club_id "
        "points at the same clubs.id), not create or orphan a second club."
    )


def test_real_override_file_includes_les_pieds_drop_key() -> None:
    """Smoke: the real overrides/club_duplicates.csv file ships with
    the Les Pieds drop key. Guards against an accidental
    delete/rename of the shipped adjudication row."""
    real_csv = REPO_ROOT / "legacy_data" / "overrides" / "club_duplicates.csv"
    assert real_csv.exists(), (
        "overrides/club_duplicates.csv is missing — was it deleted?"
    )
    drops = classifier.load_club_duplicate_overrides(real_csv)
    assert LES_PIEDS_DROP_KEY in drops, (
        f"Expected Les Pieds drop key {LES_PIEDS_DROP_KEY!r} in "
        f"overrides/club_duplicates.csv; got drop set {drops!r}."
    )
