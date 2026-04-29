#!/usr/bin/env python3
"""Seed the Footbag Hacky system member account into the platform SQLite database.

Footbag Hacky is the platform's curator identity (DD §2.8). It is a regular
`members` row with `is_system=1` and NULL credentials, owning platform-published
content (demo loops, page illustrations, well-known event photos, etc.). All
other members are created via the registration flow at /register.

Usage:
  python legacy_data/scripts/seed_members.py [--db path/to/footbag.db]

Options:
  --db PATH                  Path to SQLite DB (default: FOOTBAG_DB_PATH env
                             var, then ./database/footbag.db)
"""

import argparse
import hashlib
import os
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from datetime import datetime, timezone

DEFAULT_DB = "./database/footbag.db"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(prefix: str, *parts: str) -> str:
    raw = "||".join(str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=None, help="Path to SQLite database")
    args = parser.parse_args()

    db_path = args.db or os.environ.get("FOOTBAG_DB_PATH", DEFAULT_DB)
    ts = now_iso()

    con = sqlite3.connect(db_path)
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("PRAGMA foreign_keys = ON")
    cur = con.cursor()

    # Footbag Hacky: the platform's system member account (DD §2.8).
    # is_system=1, all credentials NULL, unauthenticatable by data shape.
    member_id = stable_id("member", "footbag-hacky")
    slug = "footbag_hacky"

    cur.execute(
        """
        INSERT OR IGNORE INTO members (
            id, slug,
            login_email, login_email_normalized, email_verified_at,
            password_hash, password_changed_at,
            real_name, display_name, display_name_normalized,
            city, region, country, first_competition_year,
            searchable, is_admin, is_system, is_hof, hof_inducted_year,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (
            :id, :slug,
            NULL, NULL, NULL,
            NULL, NULL,
            :real_name, :display_name, :display_name_norm,
            :city, :region, :country, :first_comp_year,
            1, 0, 1, 1, 2025,
            :ts, 'seed', :ts, 'seed', 1
        )
        """,
        {
            "id": member_id,
            "slug": slug,
            "ts": ts,
            "real_name": "Footbag Hacky",
            "display_name": "Footbag Hacky",
            "display_name_norm": "footbag hacky",
            "city": "Oregon City",
            "region": "OR",
            "country": "USA",
            "first_comp_year": 1972,
        },
    )
    print("  → Seeded system member account: Footbag Hacky (is_system=1, NULL credentials)")

    # Link Footbag Hacky to any matching historical_persons record.
    # This is a special case for the test stub account. In production, this
    # linkage happens through the claim flow or auto-link at migration.
    #
    # Under the three-table identity model (DD §2.4), the canonical member↔HP
    # link is members.historical_person_id (direct FK). legacy_member_id on
    # both tables is still set for legacy_account-claim traceability, but slug
    # resolution uses the FK.
    hacky_legacy_id = "STUB_FOOTBAG_HACKY"
    # Seed a stub legacy_members row so the members.legacy_member_id FK
    # can reference it. The row stays unclaimed-flagged; Hacky's member row
    # holds the canonical identity.
    cur.execute(
        """INSERT OR IGNORE INTO legacy_members
             (legacy_member_id, real_name, display_name, display_name_normalized,
              country, is_hof, is_bap, imported_at, version)
           VALUES
             (:lid, 'Footbag Hacky', 'Footbag Hacky', 'footbag hacky',
              'USA', 1, 0, :ts, 1)""",
        {"lid": hacky_legacy_id, "ts": ts},
    )
    cur.execute(
        "UPDATE members SET legacy_member_id = :lid WHERE id = :mid AND legacy_member_id IS NULL",
        {"lid": hacky_legacy_id, "mid": member_id},
    )
    cur.execute(
        """UPDATE historical_persons SET legacy_member_id = :lid
           WHERE person_name = 'Footbag Hacky' AND legacy_member_id IS NULL""",
        {"lid": hacky_legacy_id},
    )
    linked_hp = cur.rowcount
    # Additionally set members.historical_person_id so the FK-based redirect
    # fires under Phase 4+ read paths.
    cur.execute(
        """UPDATE members
           SET historical_person_id = (
             SELECT person_id FROM historical_persons
             WHERE person_name = 'Footbag Hacky'
             LIMIT 1
           )
           WHERE id = :mid AND historical_person_id IS NULL""",
        {"mid": member_id},
    )
    if linked_hp:
        print(f"  → Linked Footbag Hacky member to historical person (legacy_member_id={hacky_legacy_id}, historical_person_id FK set)")
    else:
        print("  → No matching historical person found for Footbag Hacky (will link when results are loaded)")

    con.commit()
    con.close()
    print("  → Member seed complete: 1 account (Footbag Hacky).")


if __name__ == "__main__":
    main()
