"""
Idempotency smoke test for pipeline-regenerated loaders.

Each loader, run twice against the same temp DB and identical inputs, must not
raise and must leave its target table at an identical row count. This pins the
DELETE+INSERT / INSERT-OR-IGNORE re-run-safety contract so a future
non-idempotent change (a raw INSERT, an append-counter, a missing scoped DELETE)
is caught instead of silently double-loading on the next pipeline run.

Covered: the enrichment candidate loader, the freestyle-records loader, the
name-variants seed loader, and the club cutover. All inputs are synthetic and
written to a temp dir; the cutover reads the committed seed CSV read-only and is
seeded with a candidate keyed to a real seed row.

Run from repo root:
    python -m pytest legacy_data/tests/test_loader_idempotency.py -v
"""
import csv
import sqlite3
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
TS = "2026-01-01T00:00:00Z"

# A real legacy_club_key from seed/clubs.csv: the cutover reads the seed for its
# full-row fallback, so the seeded candidate must reference an actual seed row.
REAL_SEED_KEY = "1005960946"


def make_db(tmp_path: Path) -> Path:
    db = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db


def count(db: Path, table: str) -> int:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
    return path


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, *args], cwd=str(REPO_ROOT), capture_output=True, text=True
    )


def assert_idempotent(db: Path, loader_args: list[str], target_table: str) -> int:
    """Run the loader twice; assert both succeed and the target count is stable.
    Returns the (stable) row count so the caller can assert it loaded > 0."""
    r1 = run(loader_args)
    assert r1.returncode == 0, f"run 1 failed.\nstdout: {r1.stdout}\nstderr: {r1.stderr}"
    first = count(db, target_table)
    r2 = run(loader_args)
    assert r2.returncode == 0, f"run 2 failed.\nstdout: {r2.stdout}\nstderr: {r2.stderr}"
    second = count(db, target_table)
    assert first == second, (
        f"{target_table} not idempotent: run1={first}, run2={second} "
        f"(a second load changed the row count).\nrun2 stdout: {r2.stdout}"
    )
    return first


def test_enrichment_candidate_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    persons = write_csv(tmp_path / "persons.csv", ["master_person_id", "person_name", "person_type"], [])
    affs = write_csv(tmp_path / "affs.csv", ["club_key", "master_person_id"], [])
    cands = write_csv(
        tmp_path / "cands.csv",
        ["club_key", "name", "category"],
        [
            {"club_key": "idem-1", "name": "Club One", "category": "pre_populate"},
            {"club_key": "idem-2", "name": "Club Two", "category": "dormant"},
        ],
    )
    loader = [
        "legacy_data/event_results/scripts/09_load_enrichment_to_sqlite.py",
        "--db", str(db),
        "--persons-csv", str(persons),
        "--candidates-csv", str(cands),
        "--affiliations-csv", str(affs),
    ]
    n = assert_idempotent(db, loader, "legacy_club_candidates")
    assert n == 2


def test_freestyle_records_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    records = write_csv(
        tmp_path / "records.csv",
        ["record_id", "unit", "confidence", "player", "record_value",
         "trick_name", "sort_name", "adds", "date_normalized", "approx_date", "video"],
        [{
            "record_id": "idem-rec-1", "unit": "consecutive_completions",
            "confidence": "high", "player": "Idem Player", "record_value": "100",
            "trick_name": "clipper", "sort_name": "clipper", "adds": "3",
            "date_normalized": "2010-01-01", "approx_date": "no", "video": "",
        }],
    )
    loader = [
        "legacy_data/event_results/scripts/10_load_freestyle_records_to_sqlite.py",
        "--db", str(db),
        "--records-csv", str(records),
    ]
    n = assert_idempotent(db, loader, "freestyle_records")
    assert n >= 1


def test_name_variants_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    inp = write_csv(
        tmp_path / "name_variants.csv",
        ["variant_name", "canonical_name", "confidence", "source"],
        [{"variant_name": "Bob Smith", "canonical_name": "Robert Smith",
          "confidence": "high", "source": "alias"}],
    )
    loader = [
        "legacy_data/scripts/load_name_variants_seed.py",
        "--input", str(inp),
        # Redirect both artifacts to the temp dir; the defaults point at
        # legacy_data/out/ (a real-data tree) which tests must never write.
        "--production-artifact", str(tmp_path / "prod.csv"),
        "--deferred-artifact", str(tmp_path / "deferred.csv"),
        "--db", str(db),
        "--apply",
        "--created-at", TS,
    ]
    n = assert_idempotent(db, loader, "name_variants")
    assert n >= 1


def test_cutover_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    # Seed one pre_populate candidate keyed to a real seed row so the cutover's
    # full-row fallback succeeds and it creates a live club.
    conn = sqlite3.connect(db)
    conn.execute(
        """INSERT INTO legacy_club_candidates (
             id, created_at, created_by, updated_at, updated_by, version,
             legacy_club_key, display_name, city, country,
             classification, bootstrap_eligible
           ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?, ?, ?, ?)""",
        ("lcc-idem", TS, TS, REAL_SEED_KEY, "Idem Club", "Town", "Country", "pre_populate", 1),
    )
    conn.commit()
    conn.close()
    loader = [
        "legacy_data/clubs/scripts/06_cutover_pre_populated_clubs.py",
        "--db", str(db),
    ]
    n = assert_idempotent(db, loader, "clubs")
    assert n == 1
