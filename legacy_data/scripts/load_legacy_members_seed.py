#!/usr/bin/env python3
"""Seed legacy_members with system fixtures, so historical persons can bind to them.

The canonical load binds historical_persons.legacy_member_id to
legacy_members(legacy_member_id) with foreign keys enforced, so every member id
a club roster or a historical person names needs a parent row first. Every
database build runs this, with or without the member data. Where the member load
then runs, it updates each row whose id its member CSV carries in place, filling
the profile fields and setting import_source='legacy_site_data'.

The rows are written as import_source='system_fixture': stand-ins carrying an id
and a display name, not member data. 'legacy_site_data' is the only
authoritative label, and a row at any other label after the member load is
uncovered: it is reported like any other, and a production database ships only
once each carries a recorded decision.

Seeds legacy_member_id (PK), display_name, display_name_normalized,
imported_at, import_source. Every other column stays NULL until the member load
fills it.

Sources:
  legacy_data/seed/club_members.csv    (one row per distinct mirror_member_id;
    columns legacy_club_key, mirror_member_id, display_name, alias)
  legacy_data/event_results/canonical_input/persons.csv   (gap-fill for
    ids a historical person carries that no club roster names)

Idempotent: INSERT OR IGNORE throughout. Safe to re-run.

Must run BEFORE event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py
so the FK on historical_persons.legacy_member_id can be satisfied.

Usage:
  python legacy_data/scripts/load_legacy_members_seed.py [--db path/to/footbag.db]
"""

import argparse
import csv
import os
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

# Resolve the sibling helper whether this file is run as a script, spawned as a
# subprocess, or spec-loaded by a test (importlib does not add the script's dir).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _seed_env_guard import refuse_if_deployed_target

CLUB_MEMBERS_CSV = Path(__file__).parent.parent / "seed" / "club_members.csv"
PERSONS_CSV = Path(__file__).parent.parent / "event_results" / "canonical_input" / "persons.csv"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize(name: str) -> str:
    return " ".join(name.strip().lower().split())


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return [{k: (v or "") for k, v in row.items()} for row in reader]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--db",
        default=os.environ.get("FOOTBAG_DB_PATH", "database/footbag.db"),
    )
    ap.add_argument("--club-members-csv", default=str(CLUB_MEMBERS_CSV))
    ap.add_argument("--persons-csv", default=str(PERSONS_CSV))
    args = ap.parse_args()

    refuse_if_deployed_target(args.db)

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    club_members_csv = Path(args.club_members_csv)
    persons_csv = Path(args.persons_csv)
    if not club_members_csv.exists():
        print(f"ERROR: {club_members_csv} not found; "
              f"run extract_club_members.py first.", file=sys.stderr)
        sys.exit(1)

    if not persons_csv.exists():
        print(f"ERROR: {persons_csv} not found; "
              f"run the canonical pipeline export first.", file=sys.stderr)
        sys.exit(1)

    club_rows = load_csv(club_members_csv)
    persons_rows = load_csv(persons_csv)
    ts = now_iso()

    # id -> display_name. First occurrence wins when an id appears in multiple clubs.
    rows_by_id: dict[str, str] = {}

    for r in club_rows:
        mid = r.get("mirror_member_id", "").strip()
        if not mid or mid in rows_by_id:
            continue
        rows_by_id[mid] = r.get("display_name", "").strip()

    # Gap-fill from historical_persons: any legacy_member_id referenced by an
    # HP row that isn't already covered from a club roster.
    for r in persons_rows:
        mid = r.get("member_id", "").strip()
        if not mid or mid.startswith("STUB_") or mid in rows_by_id:
            continue
        rows_by_id[mid] = r.get("person_name", "").strip()

    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON")

    inserted = 0
    with con:
        for mid, display_name in rows_by_id.items():
            display_name = display_name or None
            display_name_normalized = normalize(display_name) if display_name else None
            cur = con.execute(
                """
                INSERT OR IGNORE INTO legacy_members
                  (legacy_member_id, display_name, display_name_normalized,
                   imported_at, import_source, version)
                VALUES (?, ?, ?, ?, 'system_fixture', 1)
                """,
                (mid, display_name, display_name_normalized, ts),
            )
            inserted += cur.rowcount

    con.close()

    print(
        f"Done. legacy_members rows inserted: {inserted} "
        f"(sources considered: {len(rows_by_id)} unique IDs)"
    )


if __name__ == "__main__":
    main()
