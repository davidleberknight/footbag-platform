"""
Script 23: Load freestyle media links into SQLite.

Reads:
  legacy_data/inputs/curated/media/media_links.csv

Writes: database/footbag.db
  - freestyle_media_links (DELETE + INSERT)

Pipeline ordering: must run AFTER scripts 21 (sources) and 22 (assets, FK target).

Empty start_seconds / end_seconds in the CSV become NULL in the DB.

Idempotent: all writes happen in a single transaction.

Run from repo root or legacy_data/ with the venv active:
    python legacy_data/event_results/scripts/23_load_freestyle_media_links.py [--db <path>]
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
LINKS_CSV = SCRIPT_DIR.parents[1] / "inputs" / "curated" / "media" / "media_links.csv"


def _maybe_int(s: str) -> int | None:
    s = (s or "").strip()
    if not s:
        return None
    return int(s)


def load_links(conn: sqlite3.Connection, csv_path: Path) -> int:
    if not csv_path.exists():
        raise FileNotFoundError(f"Links CSV not found: {csv_path}")

    rows = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "media_id":      row["media_id"].strip(),
                "entity_type":   row["entity_type"].strip(),
                "entity_id":     row["entity_id"].strip(),
                "start_seconds": _maybe_int(row.get("start_seconds", "")),
                "end_seconds":   _maybe_int(row.get("end_seconds", "")),
                "is_primary":    int(row["is_primary"]),
            })

    conn.execute("DELETE FROM freestyle_media_links")
    cur = conn.executemany(
        """
        INSERT INTO freestyle_media_links
          (media_id, entity_type, entity_id, start_seconds, end_seconds, is_primary)
        VALUES
          (:media_id, :entity_type, :entity_id, :start_seconds, :end_seconds, :is_primary)
        """,
        rows,
    )
    return cur.rowcount


def main() -> None:
    parser = argparse.ArgumentParser(description="Load freestyle media links")
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
            inserted = load_links(conn, LINKS_CSV)
        print(f"freestyle_media_links: {inserted} row(s) inserted")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
