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
  - the derived alias_slug must not collide with an alias another producer owns,
    or with a canonical trick slug.
Any failure aborts the step with a loud report; nothing is inserted.

Scoped by ownership, not by slug. This step rewrites and retires only rows it
owns: a curator's alias sharing a name with an addition stops the step rather
than being replaced, because the curator's row exists in no committed file and
this one does. Idempotent, so a full rebuild or a standalone re-run converges to
the same rows.

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

    # Open through the shared guard so a direct run refuses a post-cutover database.
    import os.path as _p
    import sys as _s
    _s.path.insert(0, _p.join(_p.dirname(_p.abspath(__file__)), "..", "..", "scripts"))
    from _freestyle_db import open_freestyle_db
    from _freestyle_alias_ownership import ALIAS_ADDITIONS, describe_refusal, may_rewrite
    conn = open_freestyle_db(db_path)
    try:
        cols = [c[1] for c in conn.execute("PRAGMA table_info(freestyle_trick_aliases)")]
        if "alias_display" not in cols:
            conn.execute(
                "ALTER TABLE freestyle_trick_aliases ADD COLUMN alias_display INTEGER NOT NULL DEFAULT 1")

        active = {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks WHERE is_active = 1")}
        canonical = {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks")}
        my_slugs = {a["alias_slug"] for a in additions}
        # Who owns each alias slug already. Ownership, not the provenance source:
        # a row this step created is one it may rewrite, and every other row
        # belongs to somebody else whatever source it cites.
        owner_of = {
            r[0]: r[1] for r in conn.execute(
                "SELECT alias_slug, alias_origin_producer FROM freestyle_trick_aliases")
        }

        errors = []
        for a in additions:
            if a["target"] not in canonical:
                errors.append(f"{a['alias_slug']}: target {a['target']} is not a canonical trick")
            elif a["target"] not in active:
                errors.append(f"{a['alias_slug']}: target {a['target']} is inactive")
            # Fail closed on a slug somebody else owns. This step used to delete by
            # slug alone, so a curator's alias sharing a name with an addition was
            # replaced without a word; the collision is the thing worth stopping
            # for, because only one of the two rows exists in a committed file.
            _owner = owner_of.get(a["alias_slug"])
            if _owner is not None and not may_rewrite(_owner, ALIAS_ADDITIONS):
                errors.append(describe_refusal(a["alias_slug"], _owner, ALIAS_ADDITIONS))
            if a["alias_slug"] in canonical:
                errors.append(f"{a['alias_slug']}: collides with a canonical trick slug")
        if errors:
            sys.stderr.write(f"ERROR: {len(errors)} alias addition(s) failed validation:\n")
            for e in errors:
                sys.stderr.write(f"  {e}\n")
            sys.exit(1)

        # Reconcile this step's own rows, scoped by ownership rather than by slug.
        # Retirement first: a row this step owns whose alias has left the input is
        # stale, and nothing else can retire it. Rows other producers own are not
        # in reach at all, which is the whole point of the scope.
        _stale = [s for s, o in owner_of.items()
                  if o == ALIAS_ADDITIONS and s not in my_slugs]
        conn.executemany(
            "DELETE FROM freestyle_trick_aliases "
            "WHERE alias_slug = ? AND alias_origin_producer = ?",
            [(s, ALIAS_ADDITIONS) for s in _stale])

        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        # The file's note is provenance: what the source says this alias is. It is
        # never a display reason, even on a row whose display is set against its
        # class, because a later override step is what settles that judgement and
        # carries its own reason for it.
        conn.executemany(
            "INSERT INTO freestyle_trick_aliases "
            "(alias_slug, alias_text, trick_slug, alias_type, alias_display, source_id,"
            " provenance_note, display_reason, alias_origin_producer, created_at) "
            "VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?) "
            "ON CONFLICT(alias_slug) DO UPDATE SET "
            "  alias_text = excluded.alias_text, trick_slug = excluded.trick_slug,"
            "  alias_type = excluded.alias_type, alias_display = excluded.alias_display,"
            "  provenance_note = excluded.provenance_note "
            "WHERE freestyle_trick_aliases.alias_origin_producer = ?",
            [(a["alias_slug"], a["alias_text"], a["target"], a["alias_type"],
              a["alias_display"], a["note"], ALIAS_ADDITIONS, now, ALIAS_ADDITIONS)
             for a in additions])
        conn.commit()
    finally:
        conn.close()

    by_type: dict[str, int] = {}
    for a in additions:
        by_type[a["alias_type"]] = by_type.get(a["alias_type"], 0) + 1
    breakdown = ", ".join(f"{t}={n}" for t, n in sorted(by_type.items()))
    print(f"alias additions applied: inserted={len(additions)} ({breakdown})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    load_additions(ap.parse_args().db)


if __name__ == "__main__":
    main()
