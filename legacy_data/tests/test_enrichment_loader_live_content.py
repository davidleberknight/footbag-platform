"""
Pins the enrichment loader's live-content contract: a club candidate's
`description` and `external_url` must be carried from the candidates CSV into
`legacy_club_candidates`, so a club promoted later lands with its description
and (post-validation) URL instead of empty fields.

Boundary behaviour:
  - a populated description + url land verbatim
  - an empty description stores '' (the live club's description is non-null),
    while an empty external_url stores NULL (nullable, validated at promotion)

`contact_email` is never carried (club contact is leader-supplied), so the
candidate's effective contact channel comes from onboarding, not the legacy
mirror.

Run from repo root:
    python -m pytest legacy_data/tests/test_enrichment_loader_live_content.py -v
"""
import csv
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
LOADER = REPO_ROOT / "legacy_data" / "event_results" / "scripts" / "09_load_enrichment_to_sqlite.py"


@pytest.fixture
def fresh_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db_path


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


def _run_loader(tmp_path: Path, db_path: Path, candidate_rows: list[dict]) -> subprocess.CompletedProcess:
    persons_csv = tmp_path / "persons.csv"
    candidates_csv = tmp_path / "candidates.csv"
    affiliations_csv = tmp_path / "affiliations.csv"
    # Persons and affiliations are header-only: the loader iterates them but the
    # contract under test is the candidate live-content carry.
    _write_csv(persons_csv, ["master_person_id", "person_name", "person_type"], [])
    _write_csv(affiliations_csv, ["club_key", "master_person_id"], [])
    _write_csv(candidates_csv, ["club_key", "name", "category", "description", "external_url"], candidate_rows)
    return subprocess.run(
        [
            sys.executable, str(LOADER),
            "--db", str(db_path),
            "--persons-csv", str(persons_csv),
            "--candidates-csv", str(candidates_csv),
            "--affiliations-csv", str(affiliations_csv),
        ],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


def test_loader_carries_description_and_external_url(fresh_db: Path, tmp_path: Path) -> None:
    rows = [
        {
            "club_key": "tc-populated",
            "name": "Populated Club",
            "category": "pre_populate",
            "description": "A real club with a blurb.",
            "external_url": "https://example.com/club",
        },
    ]
    result = _run_loader(tmp_path, fresh_db, rows)
    assert result.returncode == 0, f"loader failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"

    conn = sqlite3.connect(fresh_db)
    desc, url = conn.execute(
        "SELECT description, external_url FROM legacy_club_candidates WHERE legacy_club_key = ?",
        ("tc-populated",),
    ).fetchone()
    conn.close()
    assert desc == "A real club with a blurb."
    assert url == "https://example.com/club"


def test_loader_empty_live_content_boundary(fresh_db: Path, tmp_path: Path) -> None:
    rows = [
        {
            "club_key": "tc-empty",
            "name": "Bare Club",
            "category": "dormant",
            "description": "",
            "external_url": "",
        },
    ]
    result = _run_loader(tmp_path, fresh_db, rows)
    assert result.returncode == 0, f"loader failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"

    conn = sqlite3.connect(fresh_db)
    desc, url = conn.execute(
        "SELECT description, external_url FROM legacy_club_candidates WHERE legacy_club_key = ?",
        ("tc-empty",),
    ).fetchone()
    conn.close()
    # Empty description stores '' (live club description is non-null); empty
    # external_url stores NULL (nullable, set only after validation).
    assert desc == ""
    assert url is None
