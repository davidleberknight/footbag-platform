#!/usr/bin/env python3
"""
11_load_consecutive_records_to_sqlite.py

Loads consecutive kicks records from the curated CSV into the SQLite database.

Source: freestyle/inputs/curated/records/consecutives_records.csv
Target table: consecutive_kicks_records

Usage (from the repo root):
    python freestyle/loaders/11_load_consecutive_records_to_sqlite.py \
        --db ~/projects/footbag-platform/database/footbag.db

Or via run_freestyle.sh which resolves --db automatically.
"""

import argparse
import csv
import os
import uuid
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
import sys

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
LEGACY_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
SOURCE_CSV  = os.path.join(LEGACY_ROOT, 'inputs', 'curated', 'records', 'consecutives_records.csv')

def load_records(db_path: str, source_csv: str = SOURCE_CSV) -> None:
    if not os.path.exists(source_csv):
        print(f"ERROR: source CSV not found: {source_csv}", file=sys.stderr)
        sys.exit(1)

    with open(source_csv, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Source rows read: {len(rows)}")

    # Open through the shared guard so a direct run refuses a post-cutover database.
    import os.path as _p
    import sys as _s
    _s.path.insert(0, _p.join(_p.dirname(_p.abspath(__file__)), "..", "..", "scripts"))
    from _freestyle_db import open_freestyle_db
    con = open_freestyle_db(db_path)
    con.execute("PRAGMA foreign_keys = ON")

    # Wipe and reload (idempotent)
    con.execute("DELETE FROM consecutive_kicks_records")

    inserted = 0
    for row in rows:
        sort_order = int(row['sort_order']) if row['sort_order'].strip() else None
        if sort_order is None:
            print(f"  SKIP: missing sort_order on row {row}", file=sys.stderr)
            continue

        score_raw = row['score'].strip()
        score = int(score_raw) if score_raw else None

        rank_raw = row['rank'].strip()
        rank = int(rank_raw) if rank_raw else None

        year_raw = row['year'].strip()
        year = year_raw if year_raw else None

        # A fresh surrogate id per row so the admin edit path and audit trail key on
        # a stable identity rather than the mutable display position. The DELETE
        # above empties the table, so a plain INSERT suffices; a duplicate sort_order
        # in the source now surfaces as a UNIQUE error rather than silently replacing.
        con.execute("""
            INSERT INTO consecutive_kicks_records
              (id, sort_order, section, subsection, division, year, rank,
               player_1, player_2, score, note, event_date, event_name, location,
               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        """, (
            str(uuid.uuid4()),
            sort_order,
            row['section'].strip(),
            row['subsection'].strip(),
            row['division'].strip(),
            year,
            rank,
            row['person_or_team'].strip() or None,
            row['partner'].strip() or None,
            score,
            row['note'].strip() or None,
            row['event_date'].strip() or None,
            row['event_name'].strip() or None,
            row['location'].strip() or None,
        ))
        inserted += 1

    con.commit()
    con.close()

    print(f"Rows inserted: {inserted}")
    print(f"Database: {db_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description='Load consecutive kicks records into SQLite.')
    parser.add_argument('--db', required=True, help='Path to footbag.db')
    parser.add_argument('--source-csv', default=SOURCE_CSV,
                        help='Path to consecutives_records.csv source')
    args = parser.parse_args()

    db_path = os.path.expanduser(args.db)
    if not os.path.exists(db_path):
        print(f"ERROR: database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    load_records(db_path, os.path.expanduser(args.source_csv))


if __name__ == '__main__':
    main()
