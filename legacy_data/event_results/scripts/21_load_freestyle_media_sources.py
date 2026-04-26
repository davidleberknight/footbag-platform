"""
Script 21: Load freestyle media source registry into SQLite.

Reads:
  legacy_data/inputs/curated/media/media_sources.csv

Writes: database/footbag.db
  - freestyle_media_sources (DELETE + INSERT)

Pipeline ordering: must run BEFORE script 22 (assets) and script 23 (links).
Idempotent: all writes happen in a single transaction.

Run from repo root or legacy_data/ with the venv active:
    python legacy_data/event_results/scripts/21_load_freestyle_media_sources.py [--db <path>]
"""

import argparse
import csv
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parents[2]  # scripts/ → event_results/ → legacy_data/ → repo root
SOURCES_CSV = SCRIPT_DIR.parents[1] / "inputs" / "curated" / "media" / "media_sources.csv"


def load_sources(conn: sqlite3.Connection, csv_path: Path) -> int:
    if not csv_path.exists():
        raise FileNotFoundError(f"Sources CSV not found: {csv_path}")

    rows = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "source_id":   row["source_id"].strip(),
                "source_name": row["source_name"].strip(),
                "source_type": row["source_type"].strip(),
                "url":         (row.get("url") or "").strip() or None,
                "creator":     (row.get("creator") or "").strip() or None,
            })

    # Cascade delete in reverse FK order so re-runs after a full chain succeed.
    # After this loader runs, downstream tables are empty until 22+23 repopulate.
    conn.execute("DELETE FROM freestyle_media_links")
    conn.execute("DELETE FROM freestyle_media_assets")
    conn.execute("DELETE FROM freestyle_media_sources")
    cur = conn.executemany(
        """
        INSERT INTO freestyle_media_sources
          (source_id, source_name, source_type, url, creator)
        VALUES
          (:source_id, :source_name, :source_type, :url, :creator)
        """,
        rows,
    )
    return cur.rowcount


def main() -> None:
    parser = argparse.ArgumentParser(description="Load freestyle media source registry")
    parser.add_argument("--db", default=str(REPO_ROOT / "database" / "footbag.db"),
                        help="Path to SQLite database (default: repo root database/footbag.db)")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        with conn:
            inserted = load_sources(conn, SOURCES_CSV)
        print(f"freestyle_media_sources: {inserted} row(s) inserted")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
