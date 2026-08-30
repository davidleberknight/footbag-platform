#!/usr/bin/env python3
"""
Retire the trick rows the committed inputs have stopped asking for.

The last step of a refresh, and the only one that removes a trick. It runs after
every producer has written, because a row is stale only when no committed input
wants it, and that cannot be known while a later producer might still claim it.
Retiring per producer as it went would make every other producer's rows look
stale to it, which is the whole reason a refresh used to destroy the dictionary.

What it will not touch. A trick a curator published: no committed file carries it
and its absence from the map means nothing. A row nobody has classified: its
origin was never established, so no producer can show it is theirs to remove. A
row a different committed producer still owns and still wants.

If a row that should go is still referenced, the refresh stops and says which row
and which reference. It does not cascade, it does not blank the reference, and it
does not turn foreign keys off. A reference surviving a retirement is a
disagreement between two records about whether a trick exists, and resolving it is
a decision somebody makes, not a side effect of a rebuild.

Usage:
    python3 freestyle/loaders/21c_retire_stale_tricks.py [--db path] [--dry-run]
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_db import open_freestyle_db  # noqa: E402
from _freestyle_desired_map import DesiredMapError, complete_map, stale  # noqa: E402
from _freestyle_ownership import may_retire  # noqa: E402

#: Where a surviving reference to a retired trick can come from. Read only to
#: name the reference in the diagnostic; the constraint is what actually refuses.
REFERENCING_TABLES = (
    ("freestyle_ev_adjudications", "published_trick_slug", "an Emerging Vocabulary ruling"),
    ("freestyle_trick_relations", "to_trick_slug", "a trick relation"),
    ("freestyle_trick_relations", "from_trick_slug", "a trick relation"),
)


def describe_references(conn, slug: str) -> list[str]:
    found = []
    for table, column, label in REFERENCING_TABLES:
        n = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {column} = ?", (slug,)
        ).fetchone()[0]
        if n:
            found.append(f"{n} x {label} ({table}.{column})")
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(REPO_ROOT / "database" / "footbag.db"))
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would be retired and write nothing")
    args = ap.parse_args()

    conn = open_freestyle_db(args.db, "21c_retire_stale_tricks.py")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        try:
            desired = complete_map(conn)
        except DesiredMapError as err:
            print(f"ERROR: the committed inputs contradict themselves.\n  {err}",
                  file=sys.stderr)
            return 1

        candidates = stale(conn, desired)
        for slug, owner in candidates:
            if not may_retire(owner, owner):
                print(f"ERROR: {slug} is owned by {owner}, which may not retire it.",
                      file=sys.stderr)
                return 1

        print(f"Retirement: {len(desired)} slugs wanted, {len(candidates)} stale.")
        for slug, owner in candidates:
            print(f"  {slug} (owned by {owner})")
        if args.dry_run:
            print("Dry run. Nothing was written.")
            return 0
        if not candidates:
            return 0

        try:
            with conn:
                conn.executemany(
                    "DELETE FROM freestyle_tricks WHERE slug = ? AND trick_origin_producer = ?",
                    [(slug, owner) for slug, owner in candidates],
                )
        except sqlite3.IntegrityError:
            print("ERROR: a stale trick is still referenced, so nothing was retired.",
                  file=sys.stderr)
            for slug, owner in candidates:
                refs = describe_references(conn, slug)
                if refs:
                    print(f"  {slug} (owned by {owner}) is referenced by: "
                          f"{', '.join(refs)}", file=sys.stderr)
            print("\nTwo records disagree about whether this trick exists. Resolve it "
                  "deliberately rather than by rebuild: the reference is somebody's "
                  "record of a decision, and clearing it is that person's call.",
                  file=sys.stderr)
            return 1

        print(f"Retired {len(candidates)} rows.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
