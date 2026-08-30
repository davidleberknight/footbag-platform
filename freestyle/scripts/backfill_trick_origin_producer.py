#!/usr/bin/env python3
"""
Classify who owns each existing freestyle trick row.

Every loader now stamps the rows it creates, so a database built from scratch
needs nothing from this script. A database that already exists does: its rows
predate the stamp and are unowned, and an unowned row is one no producer may
retire, which would leave a working database permanently unrefreshable.

The classification reproduces the insertion semantics of a clean load rather than
guessing from the rows themselves. Three committed producers create trick rows,
in a fixed order, and each inserts only what the ones before it left unclaimed:
the base dictionary writes its file whole; the expert overlay inserts the names
its file adds and rewrites the ones already present without claiming them; the
footbag.org intake inserts only names that resolve to nothing already in the
dictionary. Walking those inputs in that order therefore reproduces exactly which
producer created each slug, which is what ownership means.

A slug no committed input accounts for is left NULL. That is the fail-closed
answer, not a gap: absence from a file is not evidence of committed origin, a
curator-created trick is absent from every file by definition, and the two cannot
be told apart from the rows alone. NULL is also safe, because no producer may
retire a row it cannot prove it owns.

Reads the committed inputs and the database; writes only trick_origin_producer,
and only where it is currently NULL, so a re-run cannot overwrite a stamp a loader
or a curator already set. Idempotent: a second run reports zero changes.

Usage:
    python3 freestyle/scripts/backfill_trick_origin_producer.py [--db path] [--apply]

Without --apply it reports what it would do and writes nothing.
"""
from __future__ import annotations

import argparse
import csv
import re
import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_ownership import (  # noqa: E402
    BASE_DICTIONARY,
    EXPERT_ADDITIONS,
    FOOTBAG_ORG_PENDING,
)

INPUTS = REPO_ROOT / "freestyle" / "inputs"
BASE_CSV = INPUTS / "base_dictionary" / "tricks.csv"
ADDITIONS_CSV = INPUTS / "curated" / "tricks" / "red_additions_2026_04_20.csv"


def trick_name_to_slug(name: str) -> str:
    """The fold every producer uses to turn a canonical name into a slug."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def committed_ownership() -> dict[str, str]:
    """Slug to owning producer, by replaying the clean-load insertion order.

    First writer wins, which is the whole rule: a later producer whose input also
    carries the slug rewrites the row without acquiring it.
    """
    owners: dict[str, str] = {}

    with BASE_CSV.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            slug = trick_name_to_slug(row["trick_canon"])
            if slug:
                owners.setdefault(slug, BASE_DICTIONARY)

    with ADDITIONS_CSV.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            slug = trick_name_to_slug(row["canonical_name"])
            if slug:
                owners.setdefault(slug, EXPERT_ADDITIONS)

    return owners


def classify(conn: sqlite3.Connection) -> tuple[dict[str, str], list[str]]:
    """Return the stamp to write per slug, and the slugs left unclassified.

    The footbag.org intake is identified by what it is rather than by a file: it
    inserts only names that resolve to nothing already curated, and it is the one
    producer that writes rows held out of the dictionary awaiting review. A row
    that is both unaccounted for by the two curated inputs and in that held-out
    state is one only that intake could have created.
    """
    owners = committed_ownership()
    plan: dict[str, str] = {}
    unclassified: list[str] = []

    rows = conn.execute(
        "SELECT slug, review_status, is_active, trick_origin_producer FROM freestyle_tricks"
    ).fetchall()
    for slug, review_status, is_active, existing in rows:
        if existing is not None:
            continue
        if slug in owners:
            plan[slug] = owners[slug]
        elif review_status == "pending" and is_active == 0:
            plan[slug] = FOOTBAG_ORG_PENDING
        else:
            unclassified.append(slug)

    return plan, unclassified


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(REPO_ROOT / "database" / "footbag.db"))
    ap.add_argument("--apply", action="store_true",
                    help="write the stamps; without it nothing is written")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        total = conn.execute("SELECT COUNT(*) FROM freestyle_tricks").fetchone()[0]
        already = conn.execute(
            "SELECT COUNT(*) FROM freestyle_tricks WHERE trick_origin_producer IS NOT NULL"
        ).fetchone()[0]
        plan, unclassified = classify(conn)

        counts: dict[str, int] = {}
        for producer in plan.values():
            counts[producer] = counts.get(producer, 0) + 1

        print(f"Rows: {total} total, {already} already stamped")
        for producer in sorted(counts):
            print(f"  {producer:<22} {counts[producer]}")
        print(f"  {'unclassified (left NULL)':<22} {len(unclassified)}")
        if unclassified:
            for slug in sorted(unclassified)[:20]:
                print(f"    {slug}")
            if len(unclassified) > 20:
                print(f"    ... and {len(unclassified) - 20} more")

        if not args.apply:
            print("\nDry run. Re-run with --apply to write these stamps.")
            return 0

        with conn:
            conn.executemany(
                "UPDATE freestyle_tricks SET trick_origin_producer = ? "
                " WHERE slug = ? AND trick_origin_producer IS NULL",
                [(producer, slug) for slug, producer in plan.items()],
            )
        print(f"\nStamped {len(plan)} rows.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
