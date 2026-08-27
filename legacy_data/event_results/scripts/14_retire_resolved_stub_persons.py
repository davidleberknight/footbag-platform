#!/usr/bin/env python3
"""
14_retire_resolved_stub_persons.py

Retires the placeholder people the seed builder minted for display names it could
not resolve, once their names have resolved and nothing points at them any more.

Loader 08 deletes a retiring stub itself whenever nothing references it. This
script exists for the case it cannot handle: a stub still referenced by a table
whose owning stage runs later in the same pipeline run. Deleting there would break
a foreign key mid-run, so loader 08 leaves the row standing and reports it as
pending retirement. After the owning stage has rebuilt its rows against the fresh
canonical data, the stale reference is gone and the row can go.

Running this is always safe. It considers only rows carrying the unresolved-stub
scope, and only deletes one when every foreign key child of historical_persons
reports zero references to it, which it reads from the live schema rather than a
hard-coded list. Run it too early and it does nothing; run it twice and the second
run does nothing. It never touches the canonical or provisional populations, and
it never clears a reference to make a delete possible: an unreferenced row is the
condition, never the goal.

Usage (from the repository root):
    python legacy_data/event_results/scripts/14_retire_resolved_stub_persons.py \
        --db database/footbag.db
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts" / "lib"))
from db_cutover_guard import assert_maintainer_db_target  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # legacy_data/
from pipeline.identity.person_scopes import UNRESOLVED_STUB  # noqa: E402


def historical_person_referencers(conn: sqlite3.Connection) -> list[tuple[str, str]]:
    """Every (table, column) foreign key pointing at historical_persons(person_id),
    read from the live schema so a newly-added child table is covered without an
    edit here."""
    out: list[tuple[str, str]] = []
    for (table,) in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ):
        for fk in conn.execute(f"PRAGMA foreign_key_list({table})"):
            if fk[2] == "historical_persons":
                out.append((table, fk[3]))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", required=True, help="path to the SQLite database")
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would be retired and change nothing")
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found: {db_path}", file=sys.stderr)
        print("  Run the pipeline's DB load stage first "
              "(legacy_data/run_pipeline.sh full).", file=sys.stderr)
        sys.exit(1)
    assert_maintainer_db_target(str(db_path), "14_retire_resolved_stub_persons.py")

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        referencers = historical_person_referencers(conn)

        candidates = [
            r[0] for r in conn.execute(
                "SELECT person_id FROM historical_persons WHERE source_scope = ?",
                (UNRESOLVED_STUB,),
            )
        ]
        print(f"stub persons in the database: {len(candidates):,}")

        retire: list[str] = []
        held: list[str] = []
        for pid in candidates:
            refs = []
            for table, column in referencers:
                n = conn.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE {column} = ?", (pid,)
                ).fetchone()[0]
                if n:
                    refs.append(f"{table}.{column} x{n:,}")
            (held if refs else retire).append(pid)

        # A stub still in use is the normal case: it is a name the current export
        # has not resolved, so it is doing its job and is not up for retirement.
        print(f"  still referenced, left alone: {len(held):,}")
        print(f"  unreferenced, retiring:       {len(retire):,}")

        if not retire:
            print("Nothing to retire.")
            return
        if args.dry_run:
            for pid in sorted(retire):
                name = conn.execute(
                    "SELECT person_name FROM historical_persons WHERE person_id = ?",
                    (pid,),
                ).fetchone()[0]
                print(f"    would retire {pid}  {name!r}")
            print("Dry run: nothing was changed.")
            return

        with conn:
            removed = 0
            for pid in retire:
                removed += conn.execute(
                    "DELETE FROM historical_persons WHERE person_id = ? "
                    "AND source_scope = ?",
                    (pid, UNRESOLVED_STUB),
                ).rowcount
        print(f"Retired {removed:,} resolved stub person(s).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
