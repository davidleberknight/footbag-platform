#!/usr/bin/env python3
"""
backfill_unresolved_stub_scope.py

Labels the person rows that were written before ownership was recorded.

The seed builder has always minted a placeholder person for a participant
display name nothing could resolve, and those rows went in with no source_scope
at all. The seed loader then claimed every unlabelled row as part of its
canonical population, so a placeholder that later resolved looked exactly like a
real identity disappearing, and the guard protecting real identities fired on it.
Ownership is now stated at creation; this labels what predates that.

Nothing here guesses. A stub's id is uuid5 over the namespace and the normalised
display name, so an unlabelled row can be checked against its own name: recompute
the id and see whether it matches. A match is proof the seed builder minted the
row, because nothing else produces ids that way. A row that does not match was
written by something else, is not labelled, and is listed for a human instead —
mislabelling one would hand a real person to a cohort whose members are deleted
on sight once unreferenced.

Idempotent: rows already carrying a scope are not considered, so a second run
finds nothing to do.

Usage (from the repository root):
    python legacy_data/tools/backfill_unresolved_stub_scope.py --db database/footbag.db
    python legacy_data/tools/backfill_unresolved_stub_scope.py --db database/footbag.db --apply
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.identity.alias_resolver import normalize_name  # noqa: E402
from pipeline.identity.person_scopes import UNRESOLVED_STUB  # noqa: E402

sys.path.insert(0, str(ROOT.parent / "scripts" / "lib"))
from db_cutover_guard import assert_maintainer_db_target  # noqa: E402

# The namespace the seed builder hashes display names under. Must stay identical
# to 07_build_mvfp_seed_full.py's, or identification silently matches nothing and
# this tool reports every row as unidentified.
_AUTO_PERSON_NS = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")


def minted_by_the_seed_builder(person_id: str, person_name: str) -> bool:
    """True when this row's id is the one the seed builder would derive from its
    own name, which nothing else in the pipeline produces."""
    if not person_name or not person_name.strip():
        return False
    expected = str(uuid.uuid5(_AUTO_PERSON_NS, normalize_name(person_name)))
    return expected == person_id


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", required=True)
    ap.add_argument("--apply", action="store_true",
                    help="write the labels; without it this only reports")
    ap.add_argument("--audit-out", default=None,
                    help="path for the audit CSV (default: beside the database)")
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found: {db_path}", file=sys.stderr)
        sys.exit(1)
    assert_maintainer_db_target(str(db_path), "backfill_unresolved_stub_scope.py")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT person_id, person_name FROM historical_persons "
            "WHERE source_scope IS NULL OR TRIM(COALESCE(source_scope, '')) = ''"
        ).fetchall()
        print(f"unlabelled person rows: {len(rows):,}")
        if not rows:
            print("Nothing to backfill.")
            return

        identified, unidentified = [], []
        for r in rows:
            target = identified if minted_by_the_seed_builder(
                r["person_id"], r["person_name"]) else unidentified
            target.append((r["person_id"], r["person_name"]))

        print(f"  positively identified as seed-builder stubs: {len(identified):,}")
        print(f"  not identified, left for a human:            {len(unidentified):,}")

        audit_path = Path(args.audit_out) if args.audit_out else \
            db_path.parent / "backfill_unresolved_stub_scope_audit.csv"
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with audit_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["person_id", "person_name", "disposition", "applied_at"])
            for pid, name in identified:
                w.writerow([pid, name, "labelled_unresolved_stub",
                            stamp if args.apply else ""])
            for pid, name in unidentified:
                w.writerow([pid, name, "unidentified_left_unlabelled", ""])
        print(f"  audit written: {audit_path}")

        if unidentified:
            print("\nThese rows carry no scope and were not minted by the seed builder,"
                  "\nso their owner is unknown and this tool will not choose one:",
                  file=sys.stderr)
            for pid, name in sorted(unidentified, key=lambda x: x[1] or ""):
                print(f"    {pid}  {name!r}", file=sys.stderr)
            print("Resolve each one deliberately before the next reseed; the loader "
                  "refuses to run while any remain.", file=sys.stderr)

        if not args.apply:
            print("\nReport only. Re-run with --apply to write the labels.")
            return

        with conn:
            n = 0
            for pid, _name in identified:
                n += conn.execute(
                    "UPDATE historical_persons SET source_scope = ? "
                    "WHERE person_id = ? AND (source_scope IS NULL "
                    "      OR TRIM(COALESCE(source_scope, '')) = '')",
                    (UNRESOLVED_STUB, pid),
                ).rowcount
        print(f"\nLabelled {n:,} row(s) as {UNRESOLVED_STUB}.")
        if unidentified:
            print(f"{len(unidentified):,} row(s) still unlabelled and still blocking.")
            sys.exit(2)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
