#!/usr/bin/env python3
"""Script 25: QC the media-tag invariant. READ-ONLY hard fail.

Invariant (per scripts/_trick_tag_invariant.py):
  1. Every media_items row must carry ≥1 semantic tag.
  2. Semantic domains: TRICK (underscore slug, active or pending),
     EVENT (event_*), SYSTEM (demo_*, fh_*), FUTURE (player_*, club_*, set_*).
  3. Trick-shaped tags must resolve; alias-only or unknown bodies fail.
  4. Utility tags (freestyle, trick, curated, tricks_of_the_trade) pass
     through but do NOT count toward the semantic-tag requirement.
  5. Items with zero semantic tags fail.

Tripwire for any ingestion path (curator seeder, sidecar promotion, member
uploads). Run after a fresh DB reset.

Usage:
  python freestyle/loaders/25_qc_media_tag_invariant.py
  python freestyle/loaders/25_qc_media_tag_invariant.py --db /path/to/footbag.db

Exit 0 iff no violations; exit 1 on any violation; exit 2 on missing DB.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parents[1]

sys.path.insert(0, str(REPO_ROOT / "scripts"))
from _trick_tag_invariant import (  # noqa: E402
    MediaTagInvariantError,
    load_slug_sets_from_db,
    validate_media_tags,
)


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "--db",
        default=str(REPO_ROOT / "database" / "footbag.db"),
        help="Path to SQLite DB (default: repo-root database/footbag.db)",
    )
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: DB not found: {db_path}", file=sys.stderr)
        return 2

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        active, pending, aliases, nontrick = load_slug_sets_from_db(con)
        items = list(con.execute(
            "SELECT id, source_filename, video_id "
            "FROM media_items "
            "WHERE moderation_status='active'"
        ))
        tags_by_media: dict[str, list[str]] = defaultdict(list)
        for r in con.execute("SELECT media_id, tag_display FROM media_tags"):
            tags_by_media[r["media_id"]].append(r["tag_display"])
    finally:
        con.close()

    failures: list[str] = []
    for it in items:
        label = it["source_filename"] or it["video_id"] or it["id"][-12:]
        try:
            validate_media_tags(
                label,
                tags_by_media.get(it["id"], []),
                active_slugs=active,
                pending_slugs=pending,
                alias_slugs=aliases,
                nontrick_slugs=nontrick,
            )
        except MediaTagInvariantError as e:
            failures.append(str(e))

    total = len(items)
    print("=" * 72)
    print(f"Media-tag invariant QC — {total} active media_items checked")
    print("=" * 72)
    if failures:
        print(f"VIOLATIONS: {len(failures)}", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        print()
        print(
            f"FAIL: {len(failures)}/{total} item(s) violate the invariant.",
            file=sys.stderr,
        )
        return 1
    print(f"PASS: all {total} items satisfy the invariant.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
