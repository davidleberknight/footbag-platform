"""
Script 17: Load freestyle trick dictionary, modifier reference, aliases, and
curated-v1 provenance into SQLite (schema v2.1).

Reads:
  legacy_data/inputs/noise/tricks.csv          → freestyle_tricks (74 rows)
  legacy_data/inputs/noise/trick_modifiers.csv → freestyle_trick_modifiers
  legacy_data/inputs/noise/trick_aliases.csv   → freestyle_trick_aliases

Writes: database/footbag.db
  - freestyle_tricks (DELETE + INSERT)
  - freestyle_trick_modifiers (DELETE + INSERT)
  - freestyle_trick_sources       (INSERT OR REPLACE the 'curated-v1' row only)
  - freestyle_trick_source_links  (DELETE + INSERT scoped to source_id='curated-v1')
  - freestyle_trick_aliases       (DELETE + INSERT scoped to source_id='curated-v1')

Pipeline ordering: this script must run BEFORE script 19 (Red additions) and
script 20 (footbag.org overlay). Re-running script 17 standalone wipes those
loaders' source-scoped rows from freestyle_trick_source_links / aliases via
their respective source_id filters — but does NOT touch their freestyle_tricks
rows (which are owned by slug, not source). Re-run 19 + 20 after 17 to keep
provenance in sync.

trick_family rules (unchanged from v1):
  - Modifier tricks (category='modifier'): trick_family = NULL
  - Base tricks (base_trick empty or equals canonical_name): trick_family = own slug
  - Compound/dex tricks with a different base_trick: trick_family = slug(base_trick)

is_core rules (v2.1): only irreducible dex/body/set primitives, never modifiers.
See IS_CORE_SLUGS below.

Idempotent: all writes happen in a single transaction.
Run from legacy_data/ with the venv active:
    python event_results/scripts/17_load_trick_dictionary.py [--db <path>]
"""

import argparse
import csv
import json
import re
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parents[3]  # scripts/ → event_results/ → legacy_data/ → repo root
TRICKS_CSV = SCRIPT_DIR.parents[1] / "inputs" / "noise" / "tricks.csv"
MODIFIERS_CSV = SCRIPT_DIR.parents[1] / "inputs" / "noise" / "trick_modifiers.csv"
ALIASES_CSV = SCRIPT_DIR.parents[1] / "inputs" / "noise" / "trick_aliases.csv"

CURATED_V1_SOURCE_ID = "curated-v1"
CURATED_V1_RETRIEVED_AT = "2026-04-20T00:00:00.000Z"

# v2.1: irreducible trick primitives. Modifier rows are excluded by design.
IS_CORE_SLUGS = frozenset({
    # dex primitives (10)
    "clipper", "mirage", "legover", "pickup", "guay", "illusion",
    "whirl", "butterfly", "swirl", "osis",
    # set primitives (2)
    "pixie", "fairy",
    # body primitive (1)
    "around-the-world",
})


def trick_name_to_slug(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug


def compute_trick_family(canonical_name: str, base_trick: str | None, category: str | None) -> str | None:
    if category == "modifier":
        return None
    if not base_trick:
        return trick_name_to_slug(canonical_name)
    if base_trick.lower() == canonical_name.lower():
        return trick_name_to_slug(canonical_name)
    return trick_name_to_slug(base_trick)


def load_tricks(conn: sqlite3.Connection, tricks_csv: Path, loaded_at: str) -> tuple[int, dict[str, list[str]]]:
    """Load freestyle_tricks. Returns (row_count, aliases_by_slug) for downstream alias loading."""
    if not tricks_csv.exists():
        raise FileNotFoundError(f"Tricks CSV not found: {tricks_csv}")

    rows = []
    aliases_by_slug: dict[str, list[str]] = {}

    with tricks_csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            canonical_name = row["trick_canon"].strip()
            if not canonical_name:
                continue
            slug = trick_name_to_slug(canonical_name)
            adds = row.get("adds", "").strip() or None
            base_trick_raw = row.get("base_trick", "").strip() or None
            category = row.get("category", "").strip() or None
            notes = row.get("notes", "").strip() or None
            raw_aliases = row.get("aliases", "").strip()
            aliases = [a.strip() for a in raw_aliases.split("|") if a.strip()] if raw_aliases else []
            trick_family = compute_trick_family(canonical_name, base_trick_raw, category)
            is_core = 1 if slug in IS_CORE_SLUGS else 0

            aliases_by_slug.setdefault(slug, []).extend(aliases)

            rows.append({
                "slug": slug,
                "canonical_name": canonical_name,
                "adds": adds,
                "base_trick": base_trick_raw,
                "trick_family": trick_family,
                "category": category,
                "description": notes,
                "aliases_json": json.dumps(aliases),
                "notation": None,
                "review_status": "curated",
                "is_core": is_core,
                "is_active": 1,
                "sort_order": i,
                "loaded_at": loaded_at,
                "updated_at": loaded_at,
            })

    conn.execute("DELETE FROM freestyle_tricks")
    conn.executemany(
        """
        INSERT INTO freestyle_tricks
          (slug, canonical_name, adds, base_trick, trick_family, category,
           description, aliases_json, notation, review_status, is_core, is_active,
           sort_order, loaded_at, updated_at)
        VALUES
          (:slug, :canonical_name, :adds, :base_trick, :trick_family, :category,
           :description, :aliases_json, :notation, :review_status, :is_core, :is_active,
           :sort_order, :loaded_at, :updated_at)
        """,
        rows,
    )
    return len(rows), aliases_by_slug


def load_modifiers(conn: sqlite3.Connection, modifiers_csv: Path, loaded_at: str) -> int:
    if not modifiers_csv.exists():
        raise FileNotFoundError(f"Modifiers CSV not found: {modifiers_csv}")

    rows = []
    with modifiers_csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            modifier_name = row["modifier"].strip()
            if not modifier_name:
                continue
            slug = trick_name_to_slug(modifier_name)
            rows.append({
                "slug": slug,
                "modifier_name": modifier_name,
                "add_bonus": int(row["add_bonus"].strip()),
                "add_bonus_rotational": int(row["add_bonus_rotational"].strip()),
                "modifier_type": row["modifier_type"].strip(),
                "notes": row.get("notes", "").strip() or None,
                "loaded_at": loaded_at,
            })

    conn.execute("DELETE FROM freestyle_trick_modifiers")
    conn.executemany(
        """
        INSERT INTO freestyle_trick_modifiers
          (slug, modifier_name, add_bonus, add_bonus_rotational, modifier_type, notes, loaded_at)
        VALUES
          (:slug, :modifier_name, :add_bonus, :add_bonus_rotational, :modifier_type, :notes, :loaded_at)
        """,
        rows,
    )
    return len(rows)


def upsert_curated_v1_source(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        INSERT INTO freestyle_trick_sources (id, source_type, source_label, source_url, retrieved_at, notes)
        VALUES (:id, :source_type, :source_label, :source_url, :retrieved_at, :notes)
        ON CONFLICT(id) DO UPDATE SET
          source_type=excluded.source_type,
          source_label=excluded.source_label,
          source_url=excluded.source_url,
          retrieved_at=excluded.retrieved_at,
          notes=excluded.notes
        """,
        {
            "id": CURATED_V1_SOURCE_ID,
            "source_type": "curated",
            "source_label": "Original curated trick dictionary (tricks.csv v1, 74 tricks)",
            "source_url": None,
            "retrieved_at": CURATED_V1_RETRIEVED_AT,
            "notes": "First curated dictionary version. Canonical for the 74 tricks loaded by script 17.",
        },
    )


def load_curated_source_links(conn: sqlite3.Connection) -> int:
    """One source_link row per curated trick, all asserted_* fields NULL (curated-v1 IS canonical)."""
    conn.execute(
        "DELETE FROM freestyle_trick_source_links WHERE source_id = ?",
        (CURATED_V1_SOURCE_ID,),
    )
    rows = list(conn.execute("SELECT slug FROM freestyle_tricks").fetchall())
    conn.executemany(
        """
        INSERT INTO freestyle_trick_source_links
          (trick_slug, source_id, external_ref, external_url, asserted_adds, asserted_notation, asserted_category, notes)
        VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL)
        """,
        [(r[0], CURATED_V1_SOURCE_ID) for r in rows],
    )
    return len(rows)


def load_aliases(
    conn: sqlite3.Connection,
    aliases_csv: Path,
    inline_aliases_by_slug: dict[str, list[str]],
    loaded_at: str,
) -> tuple[int, list[tuple[str, str]]]:
    """Load freestyle_trick_aliases.

    Sources merged:
      - inline aliases from tricks.csv (passed in as inline_aliases_by_slug)
      - dedicated rows from trick_aliases.csv

    Skips:
      - rows where alias_text == trick canonical (self-aliases)
      - rows pointing to a canonical name not in freestyle_tricks (logged as
        unresolved and returned for sidecar reporting)

    Returns (row_count, unresolved_pairs) where unresolved_pairs is a list of
    (alias, target_canonical_name) tuples.
    """
    canonical_by_slug = {
        row[0]: row[1]
        for row in conn.execute("SELECT slug, canonical_name FROM freestyle_tricks")
    }
    valid_slugs = set(canonical_by_slug.keys())
    canonical_lower_to_slug = {name.lower(): slug for slug, name in canonical_by_slug.items()}

    merged: dict[str, dict[str, str]] = {}  # alias_slug -> {alias_text, trick_slug}
    unresolved: list[tuple[str, str]] = []

    def add_alias(alias_text: str, trick_slug: str) -> None:
        alias_text = alias_text.strip()
        if not alias_text:
            return
        if trick_slug not in valid_slugs:
            return
        if alias_text.lower() == canonical_by_slug[trick_slug].lower():
            return  # self-alias; skip
        alias_slug = trick_name_to_slug(alias_text)
        if not alias_slug:
            return
        if alias_slug == trick_slug:
            return  # alias normalizes to canonical slug; redundant
        if alias_slug in merged and merged[alias_slug]["trick_slug"] != trick_slug:
            return  # ambiguous alias collision; first-write wins, skip silently
        merged[alias_slug] = {"alias_text": alias_text, "trick_slug": trick_slug}

    # 1. inline aliases from tricks.csv
    for slug, aliases in inline_aliases_by_slug.items():
        for alias_text in aliases:
            add_alias(alias_text, slug)

    # 2. dedicated trick_aliases.csv
    if aliases_csv.exists():
        with aliases_csv.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                alias_text = row.get("alias", "").strip()
                target_canonical = row.get("trick_canon", "").strip()
                if not alias_text or not target_canonical:
                    continue
                target_slug = canonical_lower_to_slug.get(target_canonical.lower())
                if target_slug is None:
                    unresolved.append((alias_text, target_canonical))
                    continue
                add_alias(alias_text, target_slug)

    conn.execute(
        "DELETE FROM freestyle_trick_aliases WHERE source_id = ?",
        (CURATED_V1_SOURCE_ID,),
    )
    conn.executemany(
        """
        INSERT INTO freestyle_trick_aliases
          (alias_slug, alias_text, trick_slug, alias_type, source_id, notes, created_at)
        VALUES
          (:alias_slug, :alias_text, :trick_slug, :alias_type, :source_id, NULL, :created_at)
        """,
        [
            {
                "alias_slug": alias_slug,
                "alias_text": v["alias_text"],
                "trick_slug": v["trick_slug"],
                "alias_type": "common",
                "source_id": CURATED_V1_SOURCE_ID,
                "created_at": loaded_at,
            }
            for alias_slug, v in merged.items()
        ],
    )

    return len(merged), unresolved


def load(db_path: Path, tricks_csv: Path, modifiers_csv: Path, aliases_csv: Path) -> None:
    loaded_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            n_tricks, inline_aliases = load_tricks(conn, tricks_csv, loaded_at)
            n_modifiers = load_modifiers(conn, modifiers_csv, loaded_at)
            upsert_curated_v1_source(conn)
            n_source_links = load_curated_source_links(conn)
            n_aliases, unresolved = load_aliases(conn, aliases_csv, inline_aliases, loaded_at)

        print(f"Loaded {n_tricks} tricks into freestyle_tricks (review_status='curated').")
        cur = conn.execute(
            "SELECT category, COUNT(*) AS n FROM freestyle_tricks GROUP BY category ORDER BY n DESC"
        )
        for cat_row in cur.fetchall():
            print(f"  {str(cat_row[0] or '(none)'):20s} {cat_row[1]}")

        n_core = conn.execute("SELECT COUNT(*) FROM freestyle_tricks WHERE is_core = 1").fetchone()[0]
        print(f"  is_core=1: {n_core}")

        print()
        print(f"Loaded {n_modifiers} modifiers into freestyle_trick_modifiers.")
        print(f"Loaded {n_source_links} source_links to '{CURATED_V1_SOURCE_ID}'.")
        print(f"Loaded {n_aliases} aliases into freestyle_trick_aliases.")

        if unresolved:
            print()
            print(f"WARNING: {len(unresolved)} alias rows reference canonical tricks not in dictionary:")
            for alias, target in unresolved:
                print(f"  '{alias}' -> '{target}' (skipped)")

        print()
        print("Trick families:")
        cur = conn.execute(
            """
            SELECT trick_family, COUNT(*) AS n
            FROM freestyle_tricks
            WHERE trick_family IS NOT NULL
            GROUP BY trick_family ORDER BY n DESC LIMIT 15
            """
        )
        for fam_row in cur.fetchall():
            print(f"  {str(fam_row[0]):25s} {fam_row[1]}")
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Load freestyle trick dictionary, modifiers, aliases, and curated-v1 provenance")
    parser.add_argument(
        "--db",
        default=str(REPO_ROOT / "database" / "footbag.db"),
        help="Path to SQLite database (default: repo root database/footbag.db)",
    )
    parser.add_argument(
        "--tricks-csv",
        default=str(TRICKS_CSV),
        help="Path to tricks.csv source",
    )
    parser.add_argument(
        "--modifiers-csv",
        default=str(MODIFIERS_CSV),
        help="Path to trick_modifiers.csv source",
    )
    parser.add_argument(
        "--aliases-csv",
        default=str(ALIASES_CSV),
        help="Path to trick_aliases.csv source",
    )
    args = parser.parse_args()

    load(Path(args.db), Path(args.tricks_csv), Path(args.modifiers_csv), Path(args.aliases_csv))


if __name__ == "__main__":
    main()
