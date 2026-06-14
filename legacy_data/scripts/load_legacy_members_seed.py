#!/usr/bin/env python3
"""Seed the legacy_members table with a temporary mirror-derived population.

This population is TEMPORARY. It exists to unblock the FK
historical_persons.legacy_member_id -> legacy_members(legacy_member_id).
The legacy-site data dump will supersede these rows with full profile
fields and flip import_source from 'mirror' to 'legacy_site_data'.

Phase 1: legacy_member_id (PK), display_name, display_name_normalized,
imported_at, import_source='mirror'. Other columns left NULL.

Phase 2 (when member_profiles.csv exists): enriches rows with bio, city,
country, and ifpa_join_date extracted from mirror profile HTML. Fill-if-
empty semantics: only populates fields that are currently NULL.

Sources:
  legacy_data/seed/club_members.csv                       (2,372 unique
    mirror_member_ids; columns legacy_club_key,
    mirror_member_id, display_name, alias)
  legacy_data/event_results/canonical_input/persons.csv   (gap-fill for
    HP-referenced IDs that don't appear in any club roster)

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

CLUB_MEMBERS_CSV = Path(__file__).parent.parent / "seed" / "club_members.csv"
PERSONS_CSV = Path(__file__).parent.parent / "event_results" / "canonical_input" / "persons.csv"
PROFILES_CSV = Path(__file__).parent.parent / "seed" / "member_profiles.csv"


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
    ap.add_argument("--profiles-csv", default=str(PROFILES_CSV))
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    club_members_csv = Path(args.club_members_csv)
    persons_csv = Path(args.persons_csv)
    profiles_csv = Path(args.profiles_csv)
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
                VALUES (?, ?, ?, ?, 'mirror', 1)
                """,
                (mid, display_name, display_name_normalized, ts),
            )
            inserted += cur.rowcount

    # Phase 2: enrich existing rows with mirror profile data (bio, city, country,
    # ifpa_join_date). Fill-if-empty: only populate fields that are currently NULL.
    enriched = 0
    if profiles_csv.exists():
        profile_rows = load_csv(profiles_csv)
        with con:
            for r in profile_rows:
                mid = r.get("mirror_member_id", "").strip()
                if not mid:
                    continue
                bio = r.get("bio", "").strip() or None
                city = r.get("city", "").strip() or None
                country = r.get("country", "").strip() or None
                join_date = r.get("ifpa_join_date", "").strip() or None
                if not any([bio, city, country, join_date]):
                    continue
                cur = con.execute(
                    """
                    UPDATE legacy_members
                       SET bio            = COALESCE(bio, ?),
                           city           = COALESCE(city, ?),
                           country        = COALESCE(country, ?),
                           ifpa_join_date = COALESCE(ifpa_join_date, ?),
                           updated_at     = ?,
                           updated_by     = 'mirror_profile_enrichment'
                     WHERE legacy_member_id = ?
                       AND (bio IS NULL OR city IS NULL OR country IS NULL OR ifpa_join_date IS NULL)
                    """,
                    (bio, city, country, join_date, ts, mid),
                )
                enriched += cur.rowcount
    else:
        print(f"INFO: {profiles_csv} not found; skipping profile enrichment. "
              f"Run extract_member_profiles.py to generate it.")

    con.close()

    print(
        f"Done. legacy_members rows inserted: {inserted} "
        f"(sources considered: {len(rows_by_id)} unique IDs)"
    )
    if profiles_csv.exists():
        print(f"Profile enrichment: {enriched} rows updated with mirror profile data.")


if __name__ == "__main__":
    main()
