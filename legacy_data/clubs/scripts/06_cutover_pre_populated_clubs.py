#!/usr/bin/env python3
"""
06_cutover_pre_populated_clubs.py

IP Item 3a — pre-populated clubs cutover.

For each `legacy_club_candidates` row with `bootstrap_eligible = 1` (the
59 `category=pre_populate` rows from the §10.1 classifier), ensure the
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
DUPLICATE_OVERRIDES_CSV = LEGACY_DATA_ROOT / "overrides" / "club_duplicates.csv"


def load_duplicate_canonical_map(path: Path = DUPLICATE_OVERRIDES_CSV) -> dict[str, str]:
    """Confirmed duplicate pairs as drop_legacy_key -> keep_legacy_key (merge
    the duplicate into the canonical row). Single curator-authoritative source:
    overrides/club_duplicates.csv (schema: keep_legacy_key,drop_legacy_key,
    reason), the same file the §10.1 classifier reads to suppress
    bootstrap_eligible on the dropped key. Missing file -> empty map (no
    merges). Declaring a duplicate once here means both the classifier and this
    cutover honour the same source rather than a second hardcoded list.
    """
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            drop = (row.get("drop_legacy_key") or "").strip()
            keep = (row.get("keep_legacy_key") or "").strip()
            if drop and keep:
                out[drop] = keep
    return out

_CLASSIFICATION_ORDER = {
    'pre_populate': 0, 'onboarding_visible': 1, 'dormant': 2, 'junk': 3,
}


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
_PRE_NFKD_MAP = str.maketrans({
    'Ł': 'L', 'ł': 'l', 'Ø': 'O', 'ø': 'o', 'Đ': 'D', 'đ': 'd',
})


def slugify(text: str) -> str:
    text = (text or "").translate(_PRE_NFKD_MAP)
    text = unicodedata.normalize("NFKD", text)
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


def extract_primary_city(city: str) -> str:
    """Take the first city from multi-city values. Returns '' if empty."""
    if not city or not city.strip():
        return ''
    city = re.sub(r'\s*\([^)]*\)\s*', ' ', city)
    parts = re.split(r'\s*/\s*|\s+-\s+|\s+&\s+|\s+and\s+', city.strip(), flags=re.IGNORECASE)
    return parts[0].strip() if parts else ''


def make_tag_normalized(name: str, country: str, city: str, seen: set[str]) -> str:
    """Generate unique #club_{slug} using city-first cascade."""
    name_slug = strip_redundant_suffix(slugify(_clean_club_name(name)))
    country_slug = slugify(country)
    primary_city = extract_primary_city(city)
    city_slug = slugify(primary_city)

    if not city_slug or city_slug == country_slug:
        candidates = [
            f"#club_{name_slug}",
            f"#club_{country_slug}_{name_slug}",
        ]
    else:
        candidates = [
            f"#club_{city_slug}",
            f"#club_{country_slug}_{city_slug}",
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
        # Iterate all candidates (not just bootstrap_eligible). Linkage is
        # written for every candidate whose clubs row exists. Fallback INSERT
        # of a missing clubs row is restricted to bootstrap_eligible=1 (the
        # prod cutover contract); other candidates that lack a matching clubs
        # row are skipped without error. In prod this iterates 1037 rows;
        # only 41 take the fallback INSERT path. In dev (load_clubs_seed.py
        # already created all 311 clubs) the 311 matching candidates get
        # mapped_club_id stamped here, no fallback INSERT runs.
        all_candidates = con.execute(
            """
            SELECT legacy_club_key, display_name, city, country, bootstrap_eligible, classification
            FROM legacy_club_candidates
            ORDER BY legacy_club_key
            """
        ).fetchall()

        if not all_candidates:
            print(
                "ERROR: legacy_club_candidates is empty; nothing to cut over.",
                file=sys.stderr,
            )
            print(
                "       Phase H requires Phase G enrichment to populate "
                "legacy_club_candidates first. Confirm "
                "event_results/scripts/09_load_enrichment_to_sqlite.py ran "
                "against a fresh legacy_club_candidates.csv.",
                file=sys.stderr,
            )
            return 1

        # Pre-flight: distinguish "Phase G classifier didn't run" (CI smoke
        # fixture skips it; reset-local-db.sh on a sparse local mirror also
        # skips it) from "Phase G ran but emitted 0 eligible" (real
        # regression). The seed loader (load_club_members_seed.py) inserts
        # candidates with classification='dormant' as a default; Phase G's
        # classifier (clubs/scripts/02_build_legacy_club_candidates.py)
        # promotes the eligible cohort to 'pre_populate' / 'onboarding_visible'
        # and demotes some to 'junk'. If every candidate is still 'dormant',
        # the classifier never refined the defaults — exit cleanly. If any
        # candidate carries a non-dormant classification but no row is
        # bootstrap_eligible, the classifier ran and regressed — fail-fast.
        non_dormant_count = sum(1 for r in all_candidates if r[5] != 'dormant')
        eligible_count    = sum(1 for r in all_candidates if r[4])

        if non_dormant_count == 0:
            print(
                "  → Phase H: skipping pre-populate cutover (Phase G "
                "classifier did not run; every candidate still carries "
                "the seed-default classification='dormant').",
                file=sys.stderr,
            )
            print(
                "       This is the expected state in CI smoke fixtures "
                "and sparse local mirrors. Run "
                "clubs/scripts/02_build_legacy_club_candidates.py to "
                "populate classifications.",
                file=sys.stderr,
            )
            return 0

        if eligible_count == 0:
            print(
                "ERROR: legacy_club_candidates has 0 bootstrap_eligible=1 "
                "rows; Phase H would produce zero pre_populate clubs.",
                file=sys.stderr,
            )
            print(
                "       Phase G classifier ran (non-dormant classifications "
                "exist) but no candidates are eligible. The §10.1 classifier "
                "rules regressed silently. Confirm "
                "clubs/scripts/02_build_legacy_club_candidates.py classifier "
                "rules and the input clubs CSV.",
                file=sys.stderr,
            )
            return 1

        # Preflight: detect missing seed-CSV rows for eligible candidates
        # BEFORE any writes. Without this, the main loop below partially
        # commits clubs + tags + mapped_club_id stamps for eligible
        # candidates that DO have seed rows, then returns 1 at the end with
        # the missing ones reported — leaving the DB in a half-cutover
        # state (some pre_populate clubs exist, some don't). Fail-fast here
        # keeps Phase H writes atomic across the bootstrap-eligible cohort.
        preflight_missing_seed: list[str] = []
        for _legacy_key, _, _, _, _bootstrap_eligible, _ in all_candidates:
            if not _bootstrap_eligible:
                continue
            _club_id = stable_id("club", _legacy_key)
            _club_exists = con.execute(
                "SELECT 1 FROM clubs WHERE id = ?", (_club_id,)
            ).fetchone() is not None
            if not _club_exists and _legacy_key not in seed_by_key:
                preflight_missing_seed.append(_legacy_key)

        if preflight_missing_seed:
            print(
                f"ERROR: {len(preflight_missing_seed)} eligible candidate(s) "
                f"missing from seed CSV ({SEED_CSV}):",
                file=sys.stderr,
            )
            for k in preflight_missing_seed[:10]:
                print(f"    {k}", file=sys.stderr)
            if len(preflight_missing_seed) > 10:
                print(
                    f"    ... and {len(preflight_missing_seed) - 10} more",
                    file=sys.stderr,
                )
            print(
                "       Eligible candidates without seed rows would leave "
                "mapped_club_id NULL, which FK-fails downstream in "
                "07_load_bootstrap_leaders.py. Resolve the seed/clubs.csv "
                "gap before re-running. No partial writes performed.",
                file=sys.stderr,
            )
            return 1

        # Cascade ordering: bootstrap_eligible first, then classification
        # priority, then alphabetical. Higher-priority clubs claim shorter slugs.
        all_candidates.sort(key=lambda r: (
            0 if r[4] else 1,
            _CLASSIFICATION_ORDER.get(r[5], 99),
            (r[1] or '').lower(),
        ))

        # Prime slug-collision space for the fallback INSERT path.
        existing_tags = {
            r[0]
            for r in con.execute(
                "SELECT tag_normalized FROM tags WHERE standard_type = 'club'"
            )
        }
        for _, _, _, country, _, _ in all_candidates:
            existing_tags.add(f"#club_{slugify(country or '')}")

        clubs_inserted = 0
        clubs_existed = 0
        tags_inserted = 0
        mappings_written = 0
        mappings_unchanged = 0
        candidates_skipped_no_club = 0
        duplicates_merged = 0
        missing_seed: list[str] = []

        dup_map = load_duplicate_canonical_map()

        for legacy_key, display_name, city, country, bootstrap_eligible, _classification in all_candidates:
            # Dedup: if this is a known duplicate (entry B), point at
            # entry A's club row instead. No tag/club INSERT for B.
            canonical_key = dup_map.get(legacy_key)
            if canonical_key is not None:
                canonical_club_id = stable_id("club", canonical_key)
                cur = con.execute(
                    """
                    UPDATE legacy_club_candidates
                    SET mapped_club_id = ?,
                        updated_at = ?,
                        updated_by = 'cutover_06',
                        version = version + 1
                    WHERE legacy_club_key = ?
                      AND (mapped_club_id IS NULL OR mapped_club_id != ?)
                    """,
                    (canonical_club_id, ts, legacy_key, canonical_club_id),
                )
                if cur.rowcount:
                    duplicates_merged += 1
                continue

            club_id = stable_id("club", legacy_key)
            tag_id = stable_id("tag", "club", legacy_key)

            # Does the clubs row already exist? Common case after load_clubs_seed.
            club_exists = con.execute(
                "SELECT 1 FROM clubs WHERE id = ?", (club_id,)
            ).fetchone() is not None

            if not club_exists:
                if not bootstrap_eligible:
                    # Non-eligible candidate with no matching clubs row: skip
                    # without error. This is the normal prod case for 996
                    # non-pre_populate candidates.
                    candidates_skipped_no_club += 1
                    continue

                # Fallback: create from seed CSV (first-run scenario for
                # bootstrap-eligible candidates).
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

            # Stamp mapped_club_id for every candidate whose clubs row exists.
            # Idempotent: UPDATE no-ops when already set to the right value.
            cur = con.execute(
                """
                UPDATE legacy_club_candidates
                SET mapped_club_id = ?,
                    updated_at = ?,
                    updated_by = 'cutover_06',
                    version = version + 1
                WHERE legacy_club_key = ?
                  AND (mapped_club_id IS NULL OR mapped_club_id != ?)
                """,
                (club_id, ts, legacy_key, club_id),
            )
            if cur.rowcount:
                mappings_written += 1
            else:
                mappings_unchanged += 1

    con.close()

    print("Club cutover (live clubs + linkage) complete:")
    print(f"  candidates seen:           {len(all_candidates)}")
    print(f"  clubs rows inserted:       {clubs_inserted}")
    print(f"  clubs rows pre-existed:    {clubs_existed}")
    print(f"  tags rows inserted:        {tags_inserted}")
    print(f"  candidate mappings written: {mappings_written}")
    print(f"  candidate mappings unchanged (already set): {mappings_unchanged}")
    print(f"  duplicates merged (entry B → entry A): {duplicates_merged}")
    print(f"  non-eligible candidates skipped (no matching clubs row): {candidates_skipped_no_club}")
    if missing_seed:
        print(
            f"ERROR: {len(missing_seed)} eligible candidate(s) missing from "
            f"seed CSV ({SEED_CSV}):",
            file=sys.stderr,
        )
        for k in missing_seed[:10]:
            print(f"    {k}", file=sys.stderr)
        if len(missing_seed) > 10:
            print(f"    ... and {len(missing_seed) - 10} more", file=sys.stderr)
        print(
            "       Eligible candidates without seed rows leave "
            "mapped_club_id NULL, which FK-fails downstream in "
            "07_load_bootstrap_leaders.py. Resolve the seed/clubs.csv gap "
            "before re-running.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
