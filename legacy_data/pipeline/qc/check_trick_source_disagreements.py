"""
QC: trick source disagreements.

For every freestyle_trick_source_links row where asserted_adds, asserted_notation,
or asserted_category is non-NULL, emit a CSV listing the divergence so an expert
(Red Husted) can review and resolve.

Reads:  database/footbag.db
Writes: legacy_data/out/trick_source_disagreements.csv

Run from legacy_data/ with the venv active:
    python pipeline/qc/check_trick_source_disagreements.py [--db <path>] [--out <path>]

Exit code: always 0 (this is an informational report, not a hard QC gate).
"""

import argparse
import csv
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parents[2]  # qc/ → pipeline/ → legacy_data/ → repo root
DEFAULT_DB = REPO_ROOT / "database" / "footbag.db"
DEFAULT_OUT = SCRIPT_DIR.parents[1] / "out" / "trick_source_disagreements.csv"


QUERY = """
SELECT
  sl.trick_slug,
  t.canonical_name,
  sl.source_id,
  s.source_label,
  s.source_url,
  sl.external_url,
  sl.external_ref,
  t.adds              AS canonical_adds,
  sl.asserted_adds,
  t.notation          AS canonical_notation,
  sl.asserted_notation,
  t.category          AS canonical_category,
  sl.asserted_category,
  sl.notes
FROM freestyle_trick_source_links sl
JOIN freestyle_tricks         t ON t.slug = sl.trick_slug
JOIN freestyle_trick_sources  s ON s.id   = sl.source_id
WHERE sl.asserted_adds      IS NOT NULL
   OR sl.asserted_notation  IS NOT NULL
   OR sl.asserted_category  IS NOT NULL
ORDER BY sl.trick_slug, sl.source_id
"""


def run(db_path: Path, out_path: Path) -> tuple[int, int, int]:
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.execute(QUERY)
        rows = cur.fetchall()
        cols = [d[0] for d in cur.description]
    finally:
        conn.close()

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(cols)
        writer.writerows(rows)

    n_adds = sum(1 for r in rows if r[cols.index("asserted_adds")] is not None)
    n_notation = sum(1 for r in rows if r[cols.index("asserted_notation")] is not None)
    n_category = sum(1 for r in rows if r[cols.index("asserted_category")] is not None)

    return len(rows), n_adds, n_notation, n_category


def main() -> None:
    parser = argparse.ArgumentParser(description="QC: emit trick source disagreement report")
    parser.add_argument("--db", default=str(DEFAULT_DB), help=f"SQLite path (default: {DEFAULT_DB})")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help=f"Output CSV path (default: {DEFAULT_OUT})")
    args = parser.parse_args()

    n_total, n_adds, n_notation, n_category = run(Path(args.db), Path(args.out))

    print(f"trick source disagreements report → {args.out}")
    print(f"  rows:               {n_total}")
    print(f"  asserted_adds:      {n_adds}  (source disagrees with canonical adds)")
    print(f"  asserted_notation:  {n_notation}  (source disagrees with canonical notation)")
    print(f"  asserted_category:  {n_category}  (source disagrees with canonical category)")


if __name__ == "__main__":
    main()
