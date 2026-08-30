#!/usr/bin/env python3
"""
Settle who owns what, before the refresh writes a single trick row.

A refresh is preflight, then upsert, then retire. This is the preflight. It builds
the complete map of what the committed inputs want, compares it with what the
database already holds, and either clears the way or stops the whole refresh
before anything has changed.

Two things it refuses outright. A committed input asking for a slug a curator
owns: publication is somebody's work and a rebuild reading files has no standing
to take it over, so ownership never moves that way automatically. And a committed
input asking for a slug nobody has classified: an unclassified row is one whose
origin was never established, and claiming it would be the refresh deciding that
question by helping itself. Both abort here rather than part-way through, because
a refresh that stops half-applied leaves a dictionary nobody can reason about.

One thing it does do: move a row between committed producers when the inputs have
genuinely handed it over. The row keeps its slug and every foreign key pointing at
it; only the stamp changes. Deleting and re-inserting would break those references
and is never how a transfer is applied.

Usage:
    python3 freestyle/loaders/16_preflight_trick_ownership.py [--db path]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_db import open_freestyle_db  # noqa: E402
from _freestyle_desired_map import (  # noqa: E402
    DesiredMapError,
    build_file_backed_map,
    collisions,
    transfers,
)
from _freestyle_ownership import may_transfer_ownership  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(REPO_ROOT / "database" / "footbag.db"))
    args = ap.parse_args()

    try:
        desired = build_file_backed_map()
    except DesiredMapError as err:
        print(f"ERROR: the committed inputs contradict themselves.\n  {err}",
              file=sys.stderr)
        return 1

    conn = open_freestyle_db(args.db, "16_preflight_trick_ownership.py")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        blocked = collisions(conn, desired)
        if blocked:
            print("ERROR: the refresh wants slugs it is not entitled to claim. "
                  "Nothing was changed.", file=sys.stderr)
            for slug, current, producer in blocked:
                held = current if current else "unclassified"
                print(f"  {slug}: held by {held}; {producer} wants to claim it",
                      file=sys.stderr)
            print("\nA curator's trick is never taken over by a refresh, and a row "
                  "whose origin was never established is never assumed to be the "
                  "pipeline's. Resolve each slug deliberately: rename the committed "
                  "row, or retire the existing one on purpose.", file=sys.stderr)
            return 1

        moves = transfers(conn, desired)
        for slug, current, wanted in moves:
            if not may_transfer_ownership(current, wanted):
                print(f"ERROR: {slug} may not move from {current} to {wanted}.",
                      file=sys.stderr)
                return 1

        with conn:
            for slug, _current, wanted in moves:
                conn.execute(
                    "UPDATE freestyle_tricks SET trick_origin_producer = ? WHERE slug = ?",
                    (wanted, slug),
                )

        print(f"Preflight: {len(desired)} slugs wanted by committed inputs, "
              f"no collisions, {len(moves)} ownership transfers applied.")
        for slug, current, wanted in moves:
            print(f"  {slug}: {current} -> {wanted}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
