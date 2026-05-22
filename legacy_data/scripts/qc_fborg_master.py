#!/usr/bin/env python3
"""QC checks against SYMBOLIC_GRAMMAR_MASTER.csv + live freestyle_tricks.

Read-only. No mutation. Exits non-zero if any HARD check fails.
Six checks:
  1. duplicate canonical_slug (master)
  2. duplicate normalized display_name (master)
  3. live DB rows missing from master (informational)
  4. first_class=true without settled / no-review / clean-notation
  5. equivalent_to target missing
  6. curator_review_needed=false but unresolved_questions non-empty

Usage: qc_fborg_master.py [--master PATH] [--db PATH]
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MASTER = REPO / 'exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv'
DB = REPO / 'database/footbag.db'


def norm(s: str) -> str:
    s = re.sub(r'\([^)]*\)', '', s or '')
    return re.sub(r'\s+', ' ', s.strip().lower()
                  .replace('*', '').replace("'", '').replace('.', '')).strip()


def has_notation(r) -> bool:
    return bool(r['symbolic_notation_raw'].strip() or r['add_formula'].strip()
                or r['parsed_symbol_sequence'].strip())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--master', type=Path, default=MASTER)
    ap.add_argument('--db', type=Path, default=DB)
    args = ap.parse_args()

    with args.master.open(newline='') as f:
        master = list(csv.DictReader(f))
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    dbrows = list(conn.execute(
        "SELECT slug, canonical_name, aliases_json FROM freestyle_tricks"))
    conn.close()

    findings = {}      # check -> list of detail strings
    hard_fail = False

    # ---- 1. duplicate canonical_slug -------------------------------
    slug_ct = Counter(r['canonical_slug'].strip() for r in master
                      if r['canonical_slug'].strip())
    dup_slugs = {s: c for s, c in slug_ct.items() if c > 1}
    findings['1. duplicate canonical_slug'] = [f"{s} ×{c}" for s, c in sorted(dup_slugs.items())]
    if dup_slugs:
        hard_fail = True

    # ---- 2. duplicate normalized display_name ----------------------
    name_rows = {}
    for r in master:
        dn = r['display_name'].strip()
        if dn:
            name_rows.setdefault(norm(dn), []).append((dn, r['source'], r['source_adds']))
    dup_names = {k: v for k, v in name_rows.items() if len(v) > 1}
    findings['2. duplicate normalized display_name'] = [
        f"{k!r}: " + '; '.join(f"{dn} ({src}/{a}add)" for dn, src, a in v)
        for k, v in sorted(dup_names.items())]

    # ---- 3. live DB rows missing from master -----------------------
    m_slugs = {r['canonical_slug'].strip() for r in master if r['canonical_slug'].strip()}
    m_names = {norm(r['display_name']) for r in master if r['display_name'].strip()}
    m_names |= {norm(r['move_name']) for r in master if r['move_name'].strip()}
    missing = []
    for d in dbrows:
        if d['slug'] in m_slugs:
            continue
        if norm(d['canonical_name']) in m_names:
            continue
        missing.append(d['slug'])
    findings['3. live DB rows missing from master'] = sorted(missing)

    # ---- 4. first_class=true without the 3 criteria ----------------
    bad_fc = []
    for r in master:
        if r['first_class'] != 'true':
            continue
        if not (r['doctrine_status'] == 'settled'
                and r['curator_review_needed'] in ('false', '')
                and has_notation(r)
                and not r['unresolved_questions'].strip()):
            bad_fc.append(r['canonical_slug'] or r['move_name'])
    findings['4. first_class=true violating criteria'] = sorted(bad_fc)
    if bad_fc:
        hard_fail = True

    # ---- 5. equivalent_to target missing ---------------------------
    valid = m_slugs | {d['slug'] for d in dbrows} | m_names \
        | {norm(d['canonical_name']) for d in dbrows}
    bad_equiv = []
    for r in master:
        et = r['equivalent_to'].strip()
        if not et:
            continue
        # leading token = text before the first '(' ; the slug-ish head
        head = et.split('(')[0].strip().rstrip(';,').strip()
        if not head:
            continue
        if head in valid or norm(head) in valid:
            continue
        bad_equiv.append(f"{r['canonical_slug'] or r['move_name']}: equivalent_to head {head!r} not found")
    findings['5. equivalent_to target missing'] = bad_equiv

    # ---- 6. review=false but unresolved_questions non-empty --------
    bad_consist = []
    for r in master:
        if r['curator_review_needed'] in ('false', '') and r['unresolved_questions'].strip():
            bad_consist.append(f"{r['canonical_slug'] or r['move_name']}: "
                               f"{r['unresolved_questions'][:70]}")
    findings['6. review=false + unresolved_questions set'] = bad_consist

    # ---- report ----------------------------------------------------
    print(f"QC — SYMBOLIC_GRAMMAR_MASTER.csv ({len(master)} rows) vs "
          f"freestyle_tricks ({len(dbrows)} rows)\n")
    for check, items in findings.items():
        mark = 'FAIL' if (items and check.startswith(('1.', '4.'))) else \
               ('flag' if items else 'ok')
        print(f"[{mark}] {check}: {len(items)}")
        for it in items[:40]:
            print(f"       - {it}")
        if len(items) > 40:
            print(f"       ... +{len(items) - 40} more")
    print()
    print("HARD-FAIL" if hard_fail else "No hard failures.")
    return 1 if hard_fail else 0


if __name__ == '__main__':
    sys.exit(main())
