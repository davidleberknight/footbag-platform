#!/usr/bin/env python3
"""One-off diagnostic for the group_settings.csv members-cutoff investigation.

Reports the total row count and max group_id (robust to embedded newlines/
quotes inside a scraped field, unlike eyeballing the raw file), then dumps
repr() of the rows in a given group_id range so any embedded newline/quote
character is visible.
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv_path", type=Path, nargs="?", default=Path("group_settings.csv"))
    parser.add_argument("--from-id", type=int, default=20, help="First group_id to dump (default: 20)")
    parser.add_argument("--to-id", type=int, default=25, help="Last group_id to dump, inclusive (default: 25)")
    args = parser.parse_args()

    with args.csv_path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    print(f"total data rows: {len(rows)}")
    print(f"max group_id: {max(int(r['group_id']) for r in rows)}")
    for row in rows:
        group_id = int(row["group_id"])
        if args.from_id <= group_id <= args.to_id:
            print(group_id, repr(row))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
