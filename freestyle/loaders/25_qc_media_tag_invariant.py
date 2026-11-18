#!/usr/bin/env python3
"""Script 25: QC the media-tag shape. READ-ONLY hard fail.

Checks every active media item against the hashtag standards that bind a
stored tag (per scripts/_trick_tag_invariant.py): every tag starts with '#'
and is lowercase. Nothing else is required of a tag: one that is not a trick
slug is a freeform tag, and an item with no tags passes, since uploads never
block on tags.

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
    ap.add_argument(
        "--require-items",
        action="store_true",
        help=(
            "Fail when there are no active media items to check. Passed where "
            "the check runs after the step that creates them, so a reordering "
            "that puts it back in front of its producer fails instead of "
            "passing on an empty table."
        ),
    )
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: DB not found: {db_path}", file=sys.stderr)
        return 2

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
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
            validate_media_tags(label, tags_by_media.get(it["id"], []))
        except MediaTagInvariantError as e:
            failures.append(str(e))

    total = len(items)
    print("=" * 72)
    print(f"Media-tag invariant QC — {total} active media_items checked")
    print("=" * 72)
    if total == 0 and args.require_items:
        print(
            "FAIL: no active media items to check; this run was expected to "
            "follow the step that creates them.",
            file=sys.stderr,
        )
        return 1
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
