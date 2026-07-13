"""
Focused test for the explicit SQL-NULL correction sentinel in loader 19.

A canonical folk compound can have no browse family and no base trick. An empty
base_trick otherwise defaults the family to the trick's own slug (an orphaned
family-of-one), and a blank correction value means "no correction", so there is
no way to express a null relationship without an explicit marker. A correction
whose new_value is the sentinel \\N clears the column to SQL NULL, scoped to the
nullable relationship columns (trick_family, base_trick). Any other field rejects
the sentinel rather than writing it as literal text.

Run from repo root:
    python -m pytest legacy_data/tests/test_red_additions_null_clear.py -v
"""
import csv
import sqlite3
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"

import subprocess
import sys

ADDITIONS_FIELDS = ["canonical_name", "adds", "base_trick", "category", "aliases",
                    "modifier_links", "description", "review_status", "is_active", "review_note"]
CORRECTIONS_FIELDS = ["slug", "field", "old_value", "new_value", "source_note"]


def make_db(tmp_path: Path) -> Path:
    db = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    return path


def run_loader(db: Path, additions: Path, corrections: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "freestyle/loaders/19_load_red_additions.py",
         "--db", str(db), "--additions-csv", str(additions), "--corrections-csv", str(corrections)],
        cwd=str(REPO_ROOT), capture_output=True, text=True,
    )


def row(db: Path, slug: str):
    conn = sqlite3.connect(db)
    try:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT base_trick, trick_family, adds FROM freestyle_tricks WHERE slug = ?", (slug,)
        ).fetchone()
    finally:
        conn.close()


def _inputs(tmp_path: Path):
    # A folk compound with an empty base: the loader inserts it with base_trick
    # NULL and (by default) trick_family = its own slug.
    additions = write_csv(tmp_path / "add.csv", ADDITIONS_FIELDS, [
        {"canonical_name": "nulltest", "adds": "2", "base_trick": "", "category": "compound",
         "aliases": "", "modifier_links": "", "description": "Null-family folk compound.",
         "review_status": "expert_reviewed", "is_active": "1", "review_note": ""},
    ])
    corrections = write_csv(tmp_path / "corr.csv", CORRECTIONS_FIELDS, [
        # Explicit null-clear on a nullable relationship column.
        {"slug": "nulltest", "field": "trick_family", "old_value": "", "new_value": r"\N", "source_note": "clear family"},
        # The sentinel on a non-relationship field must be rejected, not written.
        {"slug": "nulltest", "field": "adds", "old_value": "", "new_value": r"\N", "source_note": "must be rejected"},
    ])
    return additions, corrections


def test_null_clear_parsed_and_applied(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    additions, corrections = _inputs(tmp_path)

    r = run_loader(db, additions, corrections)
    assert r.returncode == 0, f"loader failed.\nstdout: {r.stdout}\nstderr: {r.stderr}"

    got = row(db, "nulltest")
    assert got is not None, "the folk compound was not inserted"
    # base_trick is null from the empty base; trick_family is nulled by the sentinel.
    assert got["base_trick"] is None, "base_trick should be SQL NULL"
    assert got["trick_family"] is None, "trick_family should be cleared to SQL NULL, not the self-slug"
    # The sentinel on an unsupported field is rejected: adds keeps its real value,
    # never the literal sentinel and never NULL.
    assert got["adds"] == "2", f"adds must be unchanged (\\N rejected on non-relationship field), got {got['adds']!r}"


def test_null_clear_idempotent_and_survives_rebuild(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    additions, corrections = _inputs(tmp_path)

    # First load.
    assert run_loader(db, additions, corrections).returncode == 0
    first = row(db, "nulltest")
    # Second load against the same inputs (the pipeline's re-run / rebuild path):
    # the addition re-inserts the row (family back to self), then the correction
    # re-clears it, so the end state is identical and stable.
    assert run_loader(db, additions, corrections).returncode == 0
    second = row(db, "nulltest")

    assert second["base_trick"] is None
    assert second["trick_family"] is None
    assert (first["base_trick"], first["trick_family"], first["adds"]) == \
           (second["base_trick"], second["trick_family"], second["adds"])
