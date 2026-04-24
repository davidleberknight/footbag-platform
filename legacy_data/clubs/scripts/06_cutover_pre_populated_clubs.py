#!/usr/bin/env python3
"""
06_cutover_pre_populated_clubs.py

IP Item 3a — pre-populated clubs cutover.

For each `legacy_club_candidates` row with `bootstrap_eligible = 1` (the
59 `category=pre_populate` rows from the §9.1 classifier), ensure the
matching live `clubs` row exists and set `legacy_club_candidates.mapped_club_id`
to that `clubs.id`. The mapping is the audit link that lets bootstrap
leaders (item 3b) attach by FK to `clubs.id`.

Scope (per IP constraints):
  - Eligible rows only (`bootstrap_eligible=1`). onboarding_visible,
    dormant, and junk candidates are not touched.
  - No leaders loaded here (item 3b deferred).
  - No schema changes.
  - No classifier rule changes.

Idempotent: re-running produces no changes after the first successful
application. Relies on `load_clubs_seed.py` having already created the
59 matching `clubs` rows (via `scripts/reset-local-db.sh`); on a clean
install that hasn't seeded clubs, the script falls back to inserting
full club + tag rows using the legacy seed CSV.

All DB writes land in a single transaction.

Usage (from legacy_data/ or repo root):
    python clubs/scripts/06_cutover_pre_populated_clubs.py [--db path/to/footbag.db]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import re
import sys
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_DATA_ROOT = SCRIPT_DIR.parent.parent  # legacy_data/
SEED_CSV = LEGACY_DATA_ROOT / "seed" / "clubs.csv"


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def stable_id(prefix: str, *parts: str) -> str:
    """Deterministic id. Must match load_clubs_seed.py to reuse existing rows."""
    raw = "||".join(str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


# Tag-generation helpers duplicated from load_clubs_seed.py so the cutover
# script can INSERT a club + tag from scratch on a DB where load_clubs_seed
# has not yet run. On the normal path (reset-local-db.sh runs load_clubs_seed
# first), INSERT OR IGNORE no-ops and this logic is unused.
def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


_REDUNDANT_SUFFIXES = [
    "_de_footbag_net_club", "_de_footbag_club", "_de_footbag",
    "_footbag_net_club", "_hacky_sack_club", "_footbag_club", "_footbag",
    "_club", "_fc",
]


def strip_redundant_suffix(slug: str) -> str:
    for suffix in _REDUNDANT_SUFFIXES:
        if slug.endswith(suffix):
            trimmed = slug[: -len(suffix)].strip("_")
            if trimmed:
                return trimmed
    return slug


def _clean_club_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    name = re.sub(r"^the\s+", "", name, flags=re.IGNORECASE)
    return name.strip()


def make_tag_normalized(name: str, country: str, city: str, seen: set[str]) -> str:
    name_slug = strip_redundant_suffix(slugify(_clean_club_name(name)))
    country_slug = slugify(country)
    city_slug = slugify(city)
    candidates = [
        f"#club_{name_slug}",
        f"#club_{country_slug}_{name_slug}",
        f"#club_{country_slug}_{city_slug}_{name_slug}",
    ]
    for c in candidates:
        if c not in seen:
            return c
    base = candidates[-1]
    suffix = 2
    while f"{base}_{suffix}" in seen:
        suffix += 1
    return f"{base}_{suffix}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument(
        "--db",
        default=os.environ.get("FOOTBAG_DB_PATH", "database/footbag.db"),
    )
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        return 1
    if not SEED_CSV.exists():
        print(f"ERROR: clubs seed CSV not found at {SEED_CSV}", file=sys.stderr)
        print("       Run legacy_data/scripts/extract_clubs.py first.", file=sys.stderr)
        return 1

    # Index seed/clubs.csv by legacy_club_key for on-demand full-row fallback
    with open(SEED_CSV, newline="", encoding="utf-8") as f:
        seed_by_key = {r["legacy_club_key"]: r for r in csv.DictReader(f)}

    ts = now_iso()
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON")

    with con:
        eligible = con.execute(
            """
            SELECT legacy_club_key, display_name, city, country
            FROM legacy_club_candidates
            WHERE bootstrap_eligible = 1
            ORDER BY legacy_club_key
            """
        ).fetchall()

        if not eligible:
            print("No bootstrap-eligible candidates found. Nothing to cut over.")
            print("If this is unexpected, confirm the enrichment loader "
                  "(event_results/scripts/09_load_enrichment_to_sqlite.py) "
                  "ran against a fresh legacy_club_candidates.csv.")
            return 0

        # Prime slug-collision space for the fallback INSERT path.
        existing_tags = {
            r[0]
            for r in con.execute(
                "SELECT tag_normalized FROM tags WHERE standard_type = 'club'"
            )
        }
        for _, _, _, country in eligible:
            existing_tags.add(f"#club_{slugify(country or '')}")

        clubs_inserted = 0
        clubs_existed = 0
        tags_inserted = 0
        mappings_written = 0
        mappings_unchanged = 0
        missing_seed: list[str] = []

        for legacy_key, display_name, city, country in eligible:
            club_id = stable_id("club", legacy_key)
            tag_id = stable_id("tag", "club", legacy_key)

            # Does the clubs row already exist? Common case after load_clubs_seed.
            club_exists = con.execute(
                "SELECT 1 FROM clubs WHERE id = ?", (club_id,)
            ).fetchone() is not None

            if not club_exists:
                # Fallback: create from seed CSV (first-run scenario).
                seed_row = seed_by_key.get(legacy_key)
                if not seed_row:
                    missing_seed.append(legacy_key)
                    continue

                tag_normalized = make_tag_normalized(
                    seed_row["name"],
                    seed_row["country"],
                    seed_row["city"],
                    existing_tags,
                )
                existing_tags.add(tag_normalized)

                cur = con.execute(
                    """
                    INSERT OR IGNORE INTO tags
                      (id, created_at, created_by, updated_at, updated_by, version,
                       tag_normalized, tag_display, is_standard, standard_type)
                    VALUES (?, ?, 'cutover_06', ?, 'cutover_06', 1, ?, ?, 1, 'club')
                    """,
                    (tag_id, ts, ts, tag_normalized, tag_normalized),
                )
                tags_inserted += cur.rowcount

                cur = con.execute(
                    """
                    INSERT OR IGNORE INTO clubs
                      (id, created_at, created_by, updated_at, updated_by, version,
                       name, description, city, region, country,
                       contact_email, external_url, status, hashtag_tag_id)
                    VALUES (?, ?, 'cutover_06', ?, 'cutover_06', 1,
                            ?, ?, ?, ?, ?, ?, ?, 'active', ?)
                    """,
                    (
                        club_id, ts, ts,
                        seed_row["name"],
                        seed_row.get("description", ""),
                        seed_row["city"],
                        seed_row.get("region") or None,
                        seed_row["country"],
                        seed_row.get("contact_email") or None,
                        seed_row.get("external_url") or None,
                        tag_id,
                    ),
                )
                if cur.rowcount:
                    clubs_inserted += 1
                else:
                    clubs_existed += 1
            else:
                clubs_existed += 1

            # Write the audit mapping. Idempotent — UPDATE no-ops when already set.
            cur = con.execute(
                """
                UPDATE legacy_club_candidates
                SET mapped_club_id = ?,
                    updated_at = ?,
                    updated_by = 'cutover_06',
                    version = version + 1
                WHERE legacy_club_key = ?
                  AND bootstrap_eligible = 1
                  AND (mapped_club_id IS NULL OR mapped_club_id != ?)
                """,
                (club_id, ts, legacy_key, club_id),
            )
            if cur.rowcount:
                mappings_written += 1
            else:
                mappings_unchanged += 1

    con.close()

    print("Club cutover (bootstrap-eligible → live clubs) complete:")
    print(f"  eligible candidates:       {len(eligible)}")
    print(f"  clubs rows inserted:       {clubs_inserted}")
    print(f"  clubs rows pre-existed:    {clubs_existed}")
    print(f"  tags rows inserted:        {tags_inserted}")
    print(f"  candidate mappings written: {mappings_written}")
    print(f"  candidate mappings unchanged (already set): {mappings_unchanged}")
    if missing_seed:
        print(f"  WARN: {len(missing_seed)} eligible candidate(s) missing from seed CSV:")
        for k in missing_seed[:10]:
            print(f"    {k}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
