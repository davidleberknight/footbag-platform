#!/usr/bin/env python3
"""INSERT curator-accepted FB.org tricks into freestyle_tricks.

Standalone curator-run tool. NOT a pipeline stage. Reversible
(rows can be deleted by slug), idempotent.

Source:
  exploration/footbagmoves-federation/FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv
  — rows where curator_decision == 'accept' are promoted.
Target:
  database/footbag.db  (freestyle_tricks)

Per-slug DB field shaping (base_trick / trick_family / category /
description) is curator-decided and held in ACCEPTED_SHAPING below —
the staging CSV says WHICH rows; this table says HOW each maps to a
canonical row. Editing this table is a deliberate, auditable act.

Safety:
  - match-quality pre-check: a candidate is INSERTed only if its slug,
    normalized canonical_name, and aliases are all absent from the DB.
    A near-match aborts that row (prevents duplicate canonical rows).
  - idempotent: a candidate already present (by slug) is skipped, so a
    second --apply run inserts 0.
  - review_status='curated' — honest available value (the curator
    explicitly accepted these; 'expert_reviewed' would overclaim).
  - parser columns left empty; run scripts/parse_freestyle_notation.py
    --apply afterward.

Usage:
  promote_fborg_inserts.py            # dry-run (default)
  promote_fborg_inserts.py --apply    # write
  promote_fborg_inserts.py --verify   # apply, re-run, assert noop
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
QUEUE = REPO / 'exploration/footbagmoves-federation/FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv'
DB = REPO / 'database/footbag.db'

# Curator-decided DB shaping for each accepted slug.
ACCEPTED_SHAPING = {
    'peak-delay': dict(
        canonical_name='peak delay', adds='1',
        base_trick='peak-delay', trick_family='peak-delay', category='surface',
        jobs_notation_raw='PEAK [UNS] [DEL]',
        description="Delay the footbag on the peak of your cap or hat. "
                    "Dismount with a flick of the head or by 'pinging' the peak."),
    'double-knee': dict(
        canonical_name='double knee', adds='1',
        base_trick='double-knee', trick_family='double-knee', category='body',
        jobs_notation_raw='',
        description="Single flying-body movement."),
    'ducking-mirage': dict(
        canonical_name='ducking mirage', adds='3',
        base_trick='mirage', trick_family='mirage', category='compound',
        jobs_notation_raw='',
        description="Ducking-modified mirage. From a toe set, duck the bag over "
                    "the head, then complete an in-to-out dexterity into a toe "
                    "delay. Ducking implies the bag passes over the head on the "
                    "same side from which it was set."),
    'spinning-pickup': dict(
        canonical_name='spinning pickup', adds='3',
        base_trick='pickup', trick_family='pickup', category='compound',
        jobs_notation_raw='',
        description="Spinning-modified pickup."),
}


def norm(s: str) -> str:
    s = re.sub(r'\([^)]*\)', '', s or '')
    return re.sub(r'\s+', ' ', s.strip().lower()
                  .replace('*', '').replace("'", '').replace('.', '')).strip()


def db_indexes(conn):
    rows = list(conn.execute("SELECT slug, canonical_name, aliases_json FROM freestyle_tricks"))
    slugs = {r[0] for r in rows}
    names = set()
    for r in rows:
        names.add(norm(r[1]))
        try:
            for a in json.loads(r[2] or '[]'):
                names.add(norm(a))
        except Exception:
            pass
    return slugs, names


def build_plan(queue_path: Path, db_path: Path):
    """Return (inserts, blocked) — inserts are dicts ready for INSERT."""
    with queue_path.open(newline='') as f:
        accepted = [r for r in csv.DictReader(f)
                    if r.get('curator_decision', '').strip() == 'accept']

    conn = sqlite3.connect(db_path)
    slugs, names = db_indexes(conn)
    next_sort = (conn.execute("SELECT MAX(sort_order) FROM freestyle_tricks").fetchone()[0] or 0)
    conn.close()

    inserts, blocked = [], []
    for r in accepted:
        slug = r['canonical_slug'].strip()
        shape = ACCEPTED_SHAPING.get(slug)
        if shape is None:
            blocked.append((slug, "no ACCEPTED_SHAPING entry — refusing to guess DB fields"))
            continue
        # match-quality pre-check
        if slug in slugs:
            blocked.append((slug, "slug already in freestyle_tricks (idempotent skip)"))
            continue
        if norm(shape['canonical_name']) in names:
            blocked.append((slug, f"normalized name '{shape['canonical_name']}' already in DB — "
                                  "possible duplicate; aborting this row"))
            continue
        next_sort += 1
        inserts.append({'slug': slug, 'sort_order': next_sort, **shape})
    return inserts, blocked


COLUMNS = ('slug', 'canonical_name', 'adds', 'base_trick', 'trick_family',
           'category', 'description', 'aliases_json', 'jobs_notation_raw',
           'review_status', 'is_core', 'is_active', 'sort_order',
           'loaded_at', 'updated_at')


def apply_inserts(db_path: Path, inserts) -> int:
    conn = sqlite3.connect(db_path)
    ts = datetime.now(timezone.utc).isoformat()
    n = 0
    try:
        for row in inserts:
            # idempotence guard at write time
            exists = conn.execute("SELECT 1 FROM freestyle_tricks WHERE slug=?",
                                  (row['slug'],)).fetchone()
            if exists:
                continue
            vals = (
                row['slug'], row['canonical_name'], row['adds'], row['base_trick'],
                row['trick_family'], row['category'], row['description'], '[]',
                row['jobs_notation_raw'], 'curated', 0, 1, row['sort_order'], ts, ts,
            )
            conn.execute(
                f"INSERT INTO freestyle_tricks ({','.join(COLUMNS)}) "
                f"VALUES ({','.join('?' * len(COLUMNS))})", vals)
            n += 1
        conn.commit()
    finally:
        conn.close()
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--verify', action='store_true')
    ap.add_argument('--queue', type=Path, default=QUEUE)
    ap.add_argument('--db', type=Path, default=DB)
    args = ap.parse_args()

    inserts, blocked = build_plan(args.queue, args.db)
    print("INSERT loader — curator-accepted FB.org tricks -> freestyle_tricks")
    print(f"  queue: {args.queue.name}")
    print(f"  db:    {args.db}\n")
    print(f"  proposed INSERTs: {len(inserts)}")
    for r in inserts:
        print(f"    + {r['slug']:18s} '{r['canonical_name']}'  {r['adds']} ADD  "
              f"family={r['trick_family']} category={r['category']} "
              f"review_status=curated is_active=1")
    print(f"  blocked / skipped: {len(blocked)}")
    for slug, why in blocked:
        print(f"    - {slug}: {why}")

    if not (args.apply or args.verify):
        print("\n[dry-run] no rows inserted. Re-run with --apply.")
        return 0

    n = apply_inserts(args.db, inserts)
    print(f"\n[apply] rows inserted: {n}")

    if args.verify:
        inserts2, _ = build_plan(args.queue, args.db)
        n2 = apply_inserts(args.db, inserts2)
        print(f"[verify] second run proposed: {len(inserts2)}; inserted: {n2}")
        if n2 != 0:
            print("IDEMPOTENCE FAILURE — second run inserted rows.", file=sys.stderr)
            return 1
        print("[verify] idempotence OK — second run was a noop.")

    print("\nNext: run `scripts/parse_freestyle_notation.py --apply` so the new "
          "rows get structural_parse_json / computed_adds.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
