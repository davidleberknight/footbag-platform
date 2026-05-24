#!/usr/bin/env python3
"""Load given_name_variants from the curated CSV into SQLite.

Source: legacy_data/inputs/curated/given_name_variants.csv
Target table: given_name_variants

These are generic first-name shortenings (Dave/David, Mike/Michael),
distinct from the person-specific name_variants table. The matching
service uses them at query time to expand first-name lookups.

Idempotent: DELETE + INSERT on every run.

Usage (from repo root):
    python legacy_data/scripts/load_given_name_variants_to_sqlite.py \\
        --db database/footbag.db
"""

import argparse
import csv
import os
import unicodedata
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
import sys

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
LEGACY_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
SOURCE_CSV  = os.path.join(LEGACY_ROOT, 'inputs', 'curated', 'given_name_variants.csv')


def db_normalize(s):
    """NFKC + lowercase + trim + collapse whitespace."""
    s = unicodedata.normalize('NFKC', (s or ''))
    s = s.lower().strip()
    return ' '.join(s.split())


def load(db_path):
    if not os.path.exists(SOURCE_CSV):
        print(f"ERROR: source CSV not found: {SOURCE_CSV}", file=sys.stderr)
        sys.exit(1)

    with open(SOURCE_CSV, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    print(f"Source rows read: {len(rows)}")

    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON")

    con.execute("DELETE FROM given_name_variants")

    inserted = 0
    skipped = 0
    for row in rows:
        short = db_normalize(row.get('short_form', ''))
        long = db_normalize(row.get('long_form', ''))
        if not short or not long or short == long:
            print(f"  SKIP: invalid pair ({row})", file=sys.stderr)
            skipped += 1
            continue
        con.execute(
            "INSERT OR IGNORE INTO given_name_variants "
            "(short_form_normalized, long_form_normalized) VALUES (?, ?)",
            (short, long),
        )
        inserted += 1

    con.commit()
    con.close()

    print(f"Rows inserted: {inserted}")
    if skipped:
        print(f"Rows skipped:  {skipped}")
    print(f"Database: {db_path}")


def main():
    parser = argparse.ArgumentParser(
        description='Load given_name_variants into SQLite.')
    parser.add_argument('--db', required=True, help='Path to footbag.db')
    args = parser.parse_args()

    db_path = os.path.expanduser(args.db)
    if not os.path.exists(db_path):
        print(f"ERROR: database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    load(db_path)


if __name__ == '__main__':
    main()
