#!/usr/bin/env python3
"""Load legacy_data/seed/clubs.csv into the platform SQLite database.

Inserts one tags row (is_standard=1, standard_type='club') and one clubs row
per CSV entry. Skips on conflict (idempotent). Reads DB path from
FOOTBAG_DB_PATH env var, defaulting to ./database/footbag.db.

Hashtag algorithm — #club_{slug}, country prefix added only on collision:
  1. #club_{name_slug}
  2. #club_{country_slug}_{name_slug}
  3. #club_{country_slug}_{city_slug}_{name_slug}
  4. Append _2, _3, ... as last resort for true duplicates

Slugify: unicode → ASCII, lowercase, non-[a-z0-9] → underscore,
         collapse runs, strip leading/trailing underscores.

Usage:
  python legacy_data/scripts/load_clubs_seed.py [--db path/to/footbag.db]
"""

import argparse
import csv
import hashlib
import os
import re
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

CSV_PATH = Path(__file__).parent.parent / "seed" / "clubs.csv"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(prefix: str, *parts: str) -> str:
    raw = "||".join(str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


def slugify(text: str) -> str:
    """Slugify for hashtag use: unicode → ASCII, lowercase, underscores only."""
    # Decompose unicode and drop combining marks (é → e, à → a, etc.)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    # Replace any char that isn't a letter or digit with underscore
    text = re.sub(r"[^a-z0-9]+", "_", text)
    # Collapse runs and strip
    text = re.sub(r"_+", "_", text).strip("_")
    return text


# Redundant trailing words stripped from name slugs.
# Since tags begin with #club_, appending "_footbag_club" etc. is noise.
# Order matters: strip longer patterns first to avoid partial matches.
_REDUNDANT_SUFFIXES = [
    "_de_footbag_net_club",
    "_de_footbag_club",
    "_de_footbag",
    "_footbag_net_club",
    "_hacky_sack_club",
    "_footbag_club",
    "_footbag",
    "_club",
    "_fc",
]


def strip_redundant_suffix(slug: str) -> str:
    """Remove trailing redundant words from a name slug."""
    for suffix in _REDUNDANT_SUFFIXES:
        if slug.endswith(suffix):
            trimmed = slug[: -len(suffix)].strip("_")
            if trimmed:  # never strip to empty
                return trimmed
    return slug


def _clean_club_name(name: str) -> str:
    """Strip parenthetical abbreviations and leading articles before slugifying."""
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)  # strip (AFFC), (e.V.), etc.
    name = re.sub(r"^the\s+", "", name, flags=re.IGNORECASE)  # strip leading "The"
    return name.strip()


def make_tag_normalized(name: str, country: str, city: str, seen: set[str]) -> str:
    """Generate a unique #club_{slug} tag using name, adding country/city only on collision."""
    name_slug = strip_redundant_suffix(slugify(_clean_club_name(name)))
    country_slug = slugify(country)
    city_slug = slugify(city)

    candidates = [
        f"#club_{name_slug}",
        f"#club_{country_slug}_{name_slug}",
        f"#club_{country_slug}_{city_slug}_{name_slug}",
    ]
    for candidate in candidates:
        if candidate not in seen:
            return candidate

    # True duplicate: append numeric suffix
    base = candidates[-1]
    suffix = 2
    while f"{base}_{suffix}" in seen:
        suffix += 1
    return f"{base}_{suffix}"


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
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    if not CSV_PATH.exists():
        print(f"ERROR: clubs CSV not found at {CSV_PATH}", file=sys.stderr)
        print("Run legacy_data/scripts/extract_clubs.py first.", file=sys.stderr)
        sys.exit(1)

    rows = load_csv(CSV_PATH)
    ts = now_iso()

    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON")

    # Pre-load any club tags already in DB so collision check spans both
    # existing rows and the current batch being inserted.
    existing = {r[0] for r in con.execute(
        "SELECT tag_normalized FROM tags WHERE standard_type = 'club'"
    )}

    # Reserve country slugs so no club tag produces a clubSlug (tag_normalized
    # minus the leading '#') that matches a country slug. At runtime,
    # /clubs/:slug dispatches on country-slug first, so a colliding club would
    # be unreachable. e.g. "#club_sweden" is reserved → "Sweden Footbag" →
    # escalates to "#club_sweden_sweden_footbag" or similar.
    # NOTE: slugify() here must match slugifyCountry() in clubService.ts.
    for row in rows:
        existing.add(f"#club_{slugify(row['country'])}")

    inserted_tags = 0
    inserted_clubs = 0
    skipped = 0

    with con:
        for row in rows:
            key = row["legacy_club_key"]
            name = row["name"]

            tag_normalized = make_tag_normalized(
                name, row["country"], row["city"], existing
            )
            # tag_display preserves the computed normalized form (already lowercase)
            tag_display = tag_normalized

            # club_id and tag_id are stable across re-runs — keyed on legacy_club_key
            club_id = stable_id("club", key)
            tag_id = stable_id("tag", "club", key)

            existing.add(tag_normalized)

            # Insert tag (skip on conflict — tag_normalized is unique)
            cur = con.execute(
                """
                INSERT OR IGNORE INTO tags
                  (id, created_at, created_by, updated_at, updated_by, version,
                   tag_normalized, tag_display, is_standard, standard_type)
                VALUES (?, ?, 'seed', ?, 'seed', 1, ?, ?, 1, 'club')
                """,
                (tag_id, ts, ts, tag_normalized, tag_display),
            )
            inserted_tags += cur.rowcount

            # Insert club (skip on conflict — id is PRIMARY KEY)
            cur = con.execute(
                """
                INSERT OR IGNORE INTO clubs
                  (id, created_at, created_by, updated_at, updated_by, version,
                   name, description, city, region, country,
                   contact_email, external_url, status, hashtag_tag_id)
                VALUES (?, ?, 'seed', ?, 'seed', 1, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
                """,
                (
                    club_id, ts, ts,
                    name,
                    row["description"],
                    row["city"],
                    row["region"] or None,
                    row["country"],
                    row["contact_email"] or None,
                    row["external_url"] or None,
                    tag_id,
                ),
            )
            if cur.rowcount:
                inserted_clubs += 1
            else:
                skipped += 1

    # Resolve events.host_club_id from canonical events.csv host_club text.
    # Step 08 inserts events with host_club_id=NULL; clubs are in the DB now,
    # so the FK can be set. Match on normalized club name; unmatched values
    # (federation hosts NHSA/WFA, hosts not in seed/clubs.csv) stay NULL.
    events_csv = Path(__file__).parent.parent / "event_results" / "canonical_input" / "events.csv"
    if events_csv.exists():
        def normalize_name(s: str) -> str:
            s = unicodedata.normalize("NFKD", s or "")
            s = "".join(c for c in s if not unicodedata.combining(c))
            s = s.lower()
            s = re.sub(r"^\d+\.\s*", "", s)
            s = re.sub(r"[^a-z0-9]+", " ", s)
            return re.sub(r"\s+", " ", s).strip()

        name_to_club_id = {
            normalize_name(name): club_id
            for club_id, name in con.execute("SELECT id, name FROM clubs")
        }
        with events_csv.open("r", encoding="utf-8", newline="") as f:
            events_rows = list(csv.DictReader(f))

        host_matched = 0
        host_unmatched: set[str] = set()
        with con:
            for row in events_rows:
                host = (row.get("host_club") or "").strip()
                if not host:
                    continue
                club_id = name_to_club_id.get(normalize_name(host))
                if not club_id:
                    host_unmatched.add(host)
                    continue
                cur = con.execute(
                    "UPDATE events SET host_club_id = ?, updated_at = ?, updated_by = 'seed' "
                    "WHERE id = ?",
                    (club_id, ts, row["event_key"]),
                )
                if cur.rowcount:
                    host_matched += 1
        print(
            f"Resolved host_club_id on {host_matched} events; "
            f"{len(host_unmatched)} distinct host_club values unmatched."
        )
    else:
        print(f"WARN: events CSV not found at {events_csv}; skipping host_club_id resolution.")

    con.close()

    print(
        f"Done. tags inserted: {inserted_tags}, clubs inserted: {inserted_clubs}, "
        f"clubs skipped (already present): {skipped}."
    )


if __name__ == "__main__":
    main()
