"""
Script 22: Load freestyle media assets into SQLite.

Reads:
  legacy_data/inputs/curated/media/media_assets.csv

Writes: database/footbag.db
  - freestyle_media_assets (DELETE + INSERT)

Pipeline ordering: must run AFTER script 21 (sources, FK target) and BEFORE
script 23 (links, FK on media_id).
Idempotent: all writes happen in a single transaction.

Run from repo root or legacy_data/ with the venv active:
    python legacy_data/event_results/scripts/22_load_freestyle_media_assets.py [--db <path>]
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
ASSETS_CSV = SCRIPT_DIR.parents[1] / "inputs" / "curated" / "media" / "media_assets.csv"


def load_assets(conn: sqlite3.Connection, csv_path: Path) -> int:
    if not csv_path.exists():
        raise FileNotFoundError(f"Assets CSV not found: {csv_path}")

    rows = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "id":            row["id"].strip(),
                "media_type":    row["media_type"].strip(),
                "url":           row["url"].strip(),
                "title":         (row.get("title") or "").strip() or None,
                "creator":       (row.get("creator") or "").strip() or None,
                "source_id":     (row.get("source_id") or "").strip() or None,
                "review_status": row["review_status"].strip(),
                "is_active":     int(row["is_active"]),
            })

    # Cascade delete dependents (links) before assets so re-runs succeed.
    # After this loader runs, links is empty until 23 repopulates.
    conn.execute("DELETE FROM freestyle_media_links")
    conn.execute("DELETE FROM freestyle_media_assets")
    cur = conn.executemany(
        """
        INSERT INTO freestyle_media_assets
          (id, media_type, url, title, creator, source_id, review_status, is_active)
        VALUES
          (:id, :media_type, :url, :title, :creator, :source_id, :review_status, :is_active)
        """,
        rows,
    )
    return cur.rowcount


def main() -> None:
    parser = argparse.ArgumentParser(description="Load freestyle media assets")
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
            inserted = load_assets(conn, ASSETS_CSV)
        print(f"freestyle_media_assets: {inserted} row(s) inserted")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
