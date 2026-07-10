#!/usr/bin/env python3
"""
21a_load_alias_additions.py

Insert additive curated aliases into freestyle_trick_aliases. This is the source
of truth for NEW curated aliases that no upstream loader produces, distinct from
the override step (21b), which only deletes/retypes rows other loaders already
made. Runs after the source loaders (17 curated, 19 red-additions, 20/21
footbag.org) and before the override step, so a later override could still adjust
an addition.

Input: freestyle/inputs/base_dictionary/alias_additions.csv
Columns: alias_text, target_canonical_slug, alias_type, alias_display, note

Each addition carries its own alias_type and alias_display, so it never depends on
the override step. Guards, validated before any write:
  - the target canonical slug must exist and be active (is_active = 1);
  - the derived alias_slug must not collide with a source-loader alias or a
    canonical trick slug.
Any failure aborts the step with a loud report; nothing is inserted. Idempotent:
the step clears its own prior additions (by alias_slug) and re-inserts, so a full
rebuild or a standalone re-run converges to the same rows.

Usage:
    python freestyle/loaders/21a_load_alias_additions.py [--db <path>]
"""
import argparse
import csv
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3

SCRIPT_DIR = Path(__file__).resolve().parent
ADDITIONS_CSV = SCRIPT_DIR.parent / "inputs" / "base_dictionary" / "alias_additions.csv"
DEFAULT_DB = SCRIPT_DIR.parent.parent / "database" / "footbag.db"


def trick_name_to_slug(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    return slug.strip("_")


def load_additions(db_path: str) -> None:
    with open(ADDITIONS_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    additions = []
    for r in rows:
        additions.append({
            "alias_text": r["alias_text"].strip(),
            "alias_slug": trick_name_to_slug(r["alias_text"].strip()),
            "target": r["target_canonical_slug"].strip(),
            "alias_type": r["alias_type"].strip(),
            "alias_display": int(r["alias_display"].strip()),
            "note": (r.get("note") or "").strip() or None,
        })

    conn = sqlite3.connect(db_path)
    try:
        cols = [c[1] for c in conn.execute("PRAGMA table_info(freestyle_trick_aliases)")]
        if "alias_display" not in cols:
            conn.execute(
                "ALTER TABLE freestyle_trick_aliases ADD COLUMN alias_display INTEGER NOT NULL DEFAULT 1")

        active = {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks WHERE is_active = 1")}
        canonical = {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks")}
        my_slugs = {a["alias_slug"] for a in additions}
        # Aliases from source loaders = everything except this step's own prior additions.
        source_aliases = {r[0] for r in conn.execute("SELECT alias_slug FROM freestyle_trick_aliases")} - my_slugs

        errors = []
        for a in additions:
            if a["target"] not in canonical:
                errors.append(f"{a['alias_slug']}: target {a['target']} is not a canonical trick")
            elif a["target"] not in active:
                errors.append(f"{a['alias_slug']}: target {a['target']} is inactive")
            if a["alias_slug"] in source_aliases:
                errors.append(f"{a['alias_slug']}: collides with a source-loader alias")
            if a["alias_slug"] in canonical:
                errors.append(f"{a['alias_slug']}: collides with a canonical trick slug")
        if errors:
            sys.stderr.write(f"ERROR: {len(errors)} alias addition(s) failed validation:\n")
            for e in errors:
                sys.stderr.write(f"  {e}\n")
            sys.exit(1)

        # Idempotent: clear this step's prior additions, then insert.
        conn.executemany("DELETE FROM freestyle_trick_aliases WHERE alias_slug = ?",
                         [(a["alias_slug"],) for a in additions])
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        conn.executemany(
            "INSERT INTO freestyle_trick_aliases "
            "(alias_slug, alias_text, trick_slug, alias_type, alias_display, source_id, notes, created_at) "
            "VALUES (?, ?, ?, ?, ?, NULL, ?, ?)",
            [(a["alias_slug"], a["alias_text"], a["target"], a["alias_type"],
              a["alias_display"], a["note"], now) for a in additions])
        conn.commit()
    finally:
        conn.close()

    print(f"alias additions applied: inserted={len(additions)} (all alias_type=technical, alias_display=0)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    load_additions(ap.parse_args().db)


if __name__ == "__main__":
    main()
