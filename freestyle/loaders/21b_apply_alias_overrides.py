#!/usr/bin/env python3
"""
21b_apply_alias_overrides.py

Apply curated alias-type / display overrides to freestyle_trick_aliases after all
source loaders (17 curated, 19 red-additions, 20/21 footbag.org) have populated
the table. Aliases arrive from several sources that all write alias_type='common'
and leave alias_display at its default 1; this step is the single place that
retypes or removes specific rows, keyed by the stable alias_slug primary key.

Input: freestyle/inputs/base_dictionary/alias_overrides.csv
Columns: alias_slug, action, alias_type, alias_display, note
Actions:
  - retype: set alias_type and alias_display on the row.
  - delete: remove the row (junk / notation-phrase aliases).

Strict by design: every override must match a present alias_slug. A row that does
not match (a source loader stopped producing it) is a stale override; the step
reports every stale row and exits non-zero without applying anything, so an
override is never silently skipped. Idempotent: source loaders recreate the base
rows on each rebuild and this step re-applies the same overrides.

Usage:
    python freestyle/loaders/21b_apply_alias_overrides.py [--db <path>]
"""
import argparse
import csv
import sys
from pathlib import Path

try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3

SCRIPT_DIR = Path(__file__).resolve().parent
OVERRIDES_CSV = SCRIPT_DIR.parent / "inputs" / "base_dictionary" / "alias_overrides.csv"
DEFAULT_DB = SCRIPT_DIR.parent.parent / "database" / "footbag.db"


def apply_overrides(db_path: str) -> None:
    with open(OVERRIDES_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # Open through the shared guard so a direct run refuses a post-cutover database.
    import os.path as _p
    import sys as _s
    _s.path.insert(0, _p.join(_p.dirname(_p.abspath(__file__)), "..", "..", "scripts"))
    from _freestyle_db import open_freestyle_db
    conn = open_freestyle_db(db_path)
    try:
        # Idempotent additive column-ensure: this step writes alias_display, and the
        # Python rebuild runs without the Node app's connection-open ensure, so a DB
        # built before the column existed gets it here. Additive, DEFAULT 1, so the
        # base rows the source loaders just wrote stay displayed.
        cols = [r[1] for r in conn.execute("PRAGMA table_info(freestyle_trick_aliases)")]
        if "alias_display" not in cols:
            conn.execute(
                "ALTER TABLE freestyle_trick_aliases ADD COLUMN alias_display INTEGER NOT NULL DEFAULT 1")

        present = {r[0] for r in conn.execute("SELECT alias_slug FROM freestyle_trick_aliases")}

        # Validate first, before any change. A retype whose target alias is absent
        # is a genuine stale override (a source loader stopped producing the row):
        # that is fatal, so it is never silently skipped. A delete whose target is
        # already absent has achieved its goal (already removed, or the source no
        # longer produces it), so it is reported loudly but is not fatal, which
        # keeps the step idempotent when re-run outside a full rebuild.
        stale_retype = [r["alias_slug"].strip() for r in rows
                        if r["action"].strip() == "retype" and r["alias_slug"].strip() not in present]
        absent_delete = [r["alias_slug"].strip() for r in rows
                         if r["action"].strip() == "delete" and r["alias_slug"].strip() not in present]
        if stale_retype:
            sys.stderr.write(
                f"ERROR: {len(stale_retype)} stale retype override(s) reference an alias_slug not "
                f"present after the source loaders:\n")
            for slug in stale_retype:
                sys.stderr.write(f"  {slug} (retype)\n")
            sys.stderr.write(
                "Fix or remove the stale rows in alias_overrides.csv; retype overrides are never "
                "silently skipped.\n")
            sys.exit(1)
        if absent_delete:
            sys.stderr.write(
                f"NOTE: {len(absent_delete)} delete override(s) target an alias_slug already "
                f"absent (removal already in effect): {', '.join(absent_delete)}\n")

        deleted = 0
        retyped_by_type: dict[str, int] = {}
        for r in rows:
            slug = r["alias_slug"].strip()
            action = r["action"].strip()
            if action == "delete":
                if slug in present:
                    conn.execute("DELETE FROM freestyle_trick_aliases WHERE alias_slug = ?", (slug,))
                    deleted += 1
            elif action == "retype":
                atype = r["alias_type"].strip()
                adisplay = int(r["alias_display"].strip())
                conn.execute(
                    "UPDATE freestyle_trick_aliases SET alias_type = ?, alias_display = ? "
                    "WHERE alias_slug = ?",
                    (atype, adisplay, slug))
                retyped_by_type[atype] = retyped_by_type.get(atype, 0) + 1
            else:
                sys.exit(f"ERROR: unknown action {action!r} for alias_slug {slug!r} "
                         f"(allowed: retype, delete)")
        conn.commit()
    finally:
        conn.close()

    by_type = ", ".join(f"{t}={n}" for t, n in sorted(retyped_by_type.items()))
    print(f"alias overrides applied: deleted={deleted}, retyped={sum(retyped_by_type.values())} "
          f"({by_type})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    apply_overrides(ap.parse_args().db)


if __name__ == "__main__":
    main()
