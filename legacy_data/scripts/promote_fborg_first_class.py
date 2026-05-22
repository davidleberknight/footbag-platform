#!/usr/bin/env python3
"""Promote first-class-ready tricks from the FB.org master spreadsheet.

Standalone curator-run tool. NOT a pipeline stage — not wired into
run_pipeline.sh. Reversible, idempotent.

Source of truth:
  exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv
Target:
  database/footbag.db  (freestyle_tricks)

SCOPE — UPDATE only. This loader implements "Option A": the additive
gap-fill UPDATE path for the 102 first_class_ready master rows that
already exist in freestyle_tricks. It does NOT INSERT. The 82
genuinely-missing tricks are staged separately for curator selection
(FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv).

What it writes — exactly one column, conservatively:
  freestyle_tricks.jobs_notation_raw

A matched row is gap-filled ONLY when ALL hold:
  1. master row source = 'fborg'         (clean Jobs-notation format;
     footbagmoves/passback rows carry FM-format notation and are skipped)
  2. master symbolic_notation_raw is Jobs-format ('[...]' tokens, no '>>')
  3. DB jobs_notation_raw is NULL/empty   (never overwrite)
  4. master source_adds == DB adds        (ADD-match guard — rejects
     slug collisions, e.g. 2-ADD Clipper-stall vs 1-ADD clipper)

It does NOT touch parser-owned columns (jobs_notation_normalized,
structural_parse_json, computed_add_formula, computed_adds,
add_formula_status). After running with --apply, run
`scripts/parse_freestyle_notation.py --apply` to derive those.

Idempotent: the DB-empty check (3) means a second --apply run matches
0 rows. Verify with --verify.

Usage:
  promote_fborg_first_class.py            # dry-run (default)
  promote_fborg_first_class.py --apply    # write
  promote_fborg_first_class.py --verify   # apply, then re-apply, assert noop
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MASTER = REPO / 'exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv'
DB = REPO / 'database/footbag.db'


def norm(s: str) -> str:
    s = re.sub(r'\([^)]*\)', '', s or '')
    return re.sub(r'\s+', ' ', s.strip().lower()
                  .replace('*', '').replace("'", '').replace('.', '')).strip()


def is_jobs_format(s: str) -> bool:
    """Clean Jobs notation: bracket tokens, no FM-style '>>' chains."""
    return bool(s) and '[' in s and ']' in s and '>>' not in s


def empty(v) -> bool:
    return v is None or str(v).strip() == ''


def build_plan(master_path: Path, db_path: Path):
    """Return (fills, skipped) where fills = list of (db_slug, notation)."""
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    dbrows = list(db.execute("SELECT * FROM freestyle_tricks"))
    db.close()

    by_slug = {r['slug']: r for r in dbrows}
    by_name: dict[str, sqlite3.Row] = {}
    for r in dbrows:
        by_name.setdefault(norm(r['canonical_name']), r)
        try:
            for a in json.loads(r['aliases_json'] or '[]'):
                by_name.setdefault(norm(a), r)
        except Exception:
            pass

    with master_path.open(newline='') as f:
        master = [r for r in csv.DictReader(f)
                  if r['publication_status'] == 'first_class_ready']

    fills, skipped = [], []
    for r in master:
        slug = r['canonical_slug'].strip()
        name = (r['display_name'] or r['move_name']).strip()
        m = by_slug.get(slug) or by_name.get(norm(name))
        if m is None:
            continue  # INSERT candidate — out of scope for this loader
        notation = r['symbolic_notation_raw'].strip()
        if r['source'] != 'fborg':
            skipped.append((m['slug'], 'non-fborg source (FM-format notation)'))
        elif not is_jobs_format(notation):
            skipped.append((m['slug'], 'master notation not Jobs-format'))
        elif not empty(m['jobs_notation_raw']):
            skipped.append((m['slug'], 'DB jobs_notation_raw already populated'))
        elif str(r['source_adds']).strip() != str(m['adds']).strip():
            skipped.append((m['slug'],
                            f"ADD-match guard: master {r['source_adds']} vs DB {m['adds']}"))
        else:
            fills.append((m['slug'], notation))
    return fills, skipped


def apply_fills(db_path: Path, fills) -> int:
    db = sqlite3.connect(db_path)
    ts = datetime.now(timezone.utc).isoformat()
    n = 0
    try:
        for slug, notation in fills:
            cur = db.execute(
                "UPDATE freestyle_tricks SET jobs_notation_raw=?, updated_at=? "
                "WHERE slug=? AND (jobs_notation_raw IS NULL OR jobs_notation_raw='')",
                (notation, ts, slug))
            n += cur.rowcount
        db.commit()
    finally:
        db.close()
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--apply', action='store_true', help='write changes')
    ap.add_argument('--verify', action='store_true',
                    help='apply, then re-run, assert second run is a noop')
    ap.add_argument('--master', type=Path, default=MASTER)
    ap.add_argument('--db', type=Path, default=DB)
    args = ap.parse_args()

    fills, skipped = build_plan(args.master, args.db)
    print(f"UPDATE loader — gap-fill freestyle_tricks.jobs_notation_raw")
    print(f"  master: {args.master}")
    print(f"  db:     {args.db}\n")
    print(f"  eligible gap-fills: {len(fills)}")
    print(f"  matched-but-skipped: {len(skipped)}")
    from collections import Counter
    for reason, c in Counter(s[1].split(':')[0] for s in skipped).most_common():
        print(f"    {c:3d}  {reason}")

    if not (args.apply or args.verify):
        print("\n[dry-run] no changes written. Re-run with --apply.")
        for slug, notation in fills:
            print(f"  would fill {slug:28s} <- {notation}")
        return 0

    n = apply_fills(args.db, fills)
    print(f"\n[apply] rows updated: {n}")

    if args.verify:
        fills2, _ = build_plan(args.master, args.db)
        n2 = apply_fills(args.db, fills2)
        print(f"[verify] second run eligible: {len(fills2)}; rows updated: {n2}")
        if n2 != 0 or len(fills2) != 0:
            print("IDEMPOTENCE FAILURE — second run was not a noop.", file=sys.stderr)
            return 1
        print("[verify] idempotence OK — second run was a noop.")

    print("\nNext: run `scripts/parse_freestyle_notation.py --apply` to derive "
          "the parser columns (jobs_notation_normalized, structural_parse_json, "
          "computed_adds) from the newly-filled jobs_notation_raw.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
