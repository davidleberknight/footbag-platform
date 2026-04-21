"""
Script 19: Load Red Husted's expert-review additions and corrections (2026-04-20)
into the freestyle trick dictionary.

Reads:
  legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv     (22 rows)
  legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv   (1 row)

Writes: database/footbag.db
  - freestyle_tricks                (INSERT OR REPLACE for additions; UPDATE for corrections)
  - freestyle_trick_sources         (UPSERT 'red-husted-2026-04-20')
  - freestyle_trick_source_links    (DELETE + INSERT scoped to source_id='red-husted-2026-04-20';
                                     also UPDATE curated-v1 row's asserted_adds for corrected fields)
  - freestyle_trick_aliases         (DELETE + INSERT scoped to source_id='red-husted-2026-04-20')
  - freestyle_trick_modifier_links  (DELETE + INSERT scoped to Red's trick slugs)

Pipeline ordering: must run AFTER script 17 (curated baseline). Re-running script
17 wipes Red's source_links / aliases (they're scoped by source_id), so re-run
19 after any 17 invocation.

CSV columns expected — additions:
  canonical_name, adds, base_trick, category, aliases, modifier_links,
  description, review_status, is_active, review_note

CSV columns expected — corrections:
  slug, field, old_value, new_value, source_note

Run from legacy_data/ with the venv active:
    python event_results/scripts/19_load_red_additions.py [--db <path>]
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
REPO_ROOT = SCRIPT_DIR.parents[3]
ADDITIONS_CSV = SCRIPT_DIR.parents[1] / "inputs" / "curated" / "tricks" / "red_additions_2026_04_20.csv"
CORRECTIONS_CSV = SCRIPT_DIR.parents[1] / "inputs" / "curated" / "tricks" / "red_corrections_2026_04_20.csv"

RED_SOURCE_ID = "red-husted-2026-04-20"
RED_RETRIEVED_AT = "2026-04-20T00:00:00.000Z"
CURATED_V1_SOURCE_ID = "curated-v1"

# Fields on freestyle_tricks that source_links can carry asserted_* values for.
SOURCE_ASSERTABLE_FIELDS = {"adds", "notation", "category"}


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


def upsert_red_source(conn: sqlite3.Connection) -> None:
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
            "id": RED_SOURCE_ID,
            "source_type": "expert",
            "source_label": "Red Husted expert review email (2026-04-20, first reply)",
            "source_url": None,
            "retrieved_at": RED_RETRIEVED_AT,
            "notes": "First-pass expert additions and ADD corrections. Second pass pending.",
        },
    )


def parse_pipe_list(s: str | None) -> list[str]:
    if not s:
        return []
    return [x.strip() for x in s.split("|") if x.strip()]


def load_additions(conn: sqlite3.Connection, additions_csv: Path, loaded_at: str) -> dict:
    """Returns a dict of counts: {tricks, aliases, modifier_links, skipped}."""
    if not additions_csv.exists():
        raise FileNotFoundError(f"Red additions CSV not found: {additions_csv}")

    trick_rows: list[dict] = []
    alias_rows: list[dict] = []
    modifier_link_rows: list[dict] = []
    red_trick_slugs: list[str] = []
    skipped_modifier_links: list[tuple[str, str]] = []

    valid_modifier_slugs = {row[0] for row in conn.execute("SELECT slug FROM freestyle_trick_modifiers")}

    with additions_csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            canonical_name = (row.get("canonical_name") or "").strip()
            if not canonical_name:
                continue
            slug = trick_name_to_slug(canonical_name)
            adds = (row.get("adds") or "").strip() or None
            base_trick = (row.get("base_trick") or "").strip() or None
            category = (row.get("category") or "").strip() or None
            description = (row.get("description") or "").strip() or None
            review_status = (row.get("review_status") or "expert_reviewed").strip()
            is_active_raw = (row.get("is_active") or "1").strip()
            is_active = 1 if is_active_raw == "1" else 0
            aliases = parse_pipe_list(row.get("aliases"))
            modifier_links = parse_pipe_list(row.get("modifier_links"))
            trick_family = compute_trick_family(canonical_name, base_trick, category)

            red_trick_slugs.append(slug)

            trick_rows.append({
                "slug": slug,
                "canonical_name": canonical_name,
                "adds": adds,
                "base_trick": base_trick,
                "trick_family": trick_family,
                "category": category,
                "description": description,
                "aliases_json": json.dumps(aliases),
                "notation": None,
                "review_status": review_status,
                "is_core": 0,
                "is_active": is_active,
                "sort_order": 1000 + i,  # offset above curated rows
                "loaded_at": loaded_at,
                "updated_at": loaded_at,
            })

            for alias_text in aliases:
                alias_slug = trick_name_to_slug(alias_text)
                if not alias_slug or alias_slug == slug:
                    continue
                alias_rows.append({
                    "alias_slug": alias_slug,
                    "alias_text": alias_text,
                    "trick_slug": slug,
                    "alias_type": "common",
                    "source_id": RED_SOURCE_ID,
                    "created_at": loaded_at,
                })

            for order_idx, modifier_name in enumerate(modifier_links, start=1):
                modifier_slug = trick_name_to_slug(modifier_name)
                if modifier_slug not in valid_modifier_slugs:
                    skipped_modifier_links.append((slug, modifier_slug))
                    continue
                modifier_link_rows.append({
                    "trick_slug": slug,
                    "modifier_slug": modifier_slug,
                    "apply_order": order_idx,
                })

    # Tricks: REPLACE on conflict so re-runs are idempotent.
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
        ON CONFLICT(slug) DO UPDATE SET
          canonical_name=excluded.canonical_name,
          adds=excluded.adds,
          base_trick=excluded.base_trick,
          trick_family=excluded.trick_family,
          category=excluded.category,
          description=excluded.description,
          aliases_json=excluded.aliases_json,
          review_status=excluded.review_status,
          is_active=excluded.is_active,
          sort_order=excluded.sort_order,
          updated_at=excluded.updated_at
        """,
        trick_rows,
    )

    # Aliases: scoped DELETE + INSERT
    conn.execute(
        "DELETE FROM freestyle_trick_aliases WHERE source_id = ?",
        (RED_SOURCE_ID,),
    )
    # Dedupe: alias_slug is PK; if a curated alias already exists under that key,
    # we leave the curated row alone (Red's alias_text shouldn't conflict).
    existing_alias_slugs = {row[0] for row in conn.execute("SELECT alias_slug FROM freestyle_trick_aliases")}
    deduped_alias_rows = [r for r in alias_rows if r["alias_slug"] not in existing_alias_slugs]
    conn.executemany(
        """
        INSERT INTO freestyle_trick_aliases
          (alias_slug, alias_text, trick_slug, alias_type, source_id, notes, created_at)
        VALUES
          (:alias_slug, :alias_text, :trick_slug, :alias_type, :source_id, NULL, :created_at)
        """,
        deduped_alias_rows,
    )

    # Modifier links: scoped DELETE (by trick_slug) + INSERT
    if red_trick_slugs:
        placeholders = ",".join("?" * len(red_trick_slugs))
        conn.execute(
            f"DELETE FROM freestyle_trick_modifier_links WHERE trick_slug IN ({placeholders})",
            red_trick_slugs,
        )
    conn.executemany(
        """
        INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
        VALUES (:trick_slug, :modifier_slug, :apply_order)
        """,
        modifier_link_rows,
    )

    # Source links for Red: one per added trick
    conn.execute(
        "DELETE FROM freestyle_trick_source_links WHERE source_id = ?",
        (RED_SOURCE_ID,),
    )
    conn.executemany(
        """
        INSERT INTO freestyle_trick_source_links
          (trick_slug, source_id, external_ref, external_url, asserted_adds, asserted_notation, asserted_category, notes)
        VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL)
        """,
        [(slug, RED_SOURCE_ID) for slug in red_trick_slugs],
    )

    return {
        "tricks": len(trick_rows),
        "aliases": len(deduped_alias_rows),
        "modifier_links": len(modifier_link_rows),
        "source_links": len(red_trick_slugs),
        "skipped_modifier_links": skipped_modifier_links,
    }


def load_corrections(conn: sqlite3.Connection, corrections_csv: Path, loaded_at: str) -> dict:
    """Apply field-level UPDATEs to existing tricks; record divergence on prior source_links."""
    if not corrections_csv.exists():
        return {"applied": 0, "skipped": 0}

    applied = 0
    skipped: list[tuple[str, str, str]] = []

    with corrections_csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            slug = (row.get("slug") or "").strip()
            field = (row.get("field") or "").strip()
            old_value = (row.get("old_value") or "").strip() or None
            new_value = (row.get("new_value") or "").strip() or None
            if not slug or not field or new_value is None:
                continue

            existing = conn.execute(
                f"SELECT {field} FROM freestyle_tricks WHERE slug = ?", (slug,)
            ).fetchone()
            if existing is None:
                skipped.append((slug, field, "trick not found"))
                continue

            conn.execute(
                f"UPDATE freestyle_tricks SET {field} = ?, updated_at = ? WHERE slug = ?",
                (new_value, loaded_at, slug),
            )

            # Record divergence on prior source_links so the QC report surfaces it.
            if field in SOURCE_ASSERTABLE_FIELDS and old_value is not None:
                asserted_col = f"asserted_{field}"
                conn.execute(
                    f"""
                    UPDATE freestyle_trick_source_links
                    SET {asserted_col} = ?
                    WHERE trick_slug = ? AND source_id != ?
                    """,
                    (old_value, slug, RED_SOURCE_ID),
                )

            applied += 1

    return {"applied": applied, "skipped": skipped}


def load(db_path: Path, additions_csv: Path, corrections_csv: Path) -> None:
    loaded_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            upsert_red_source(conn)
            additions = load_additions(conn, additions_csv, loaded_at)
            corrections = load_corrections(conn, corrections_csv, loaded_at)

        print(f"Red additions: {additions['tricks']} tricks (active + pending)")
        cur = conn.execute(
            """
            SELECT review_status, is_active, COUNT(*) AS n
            FROM freestyle_tricks
            WHERE slug IN (
              SELECT trick_slug FROM freestyle_trick_source_links WHERE source_id = ?
            )
            GROUP BY review_status, is_active
            ORDER BY review_status
            """,
            (RED_SOURCE_ID,),
        )
        for r in cur.fetchall():
            print(f"  review_status={r[0]} is_active={r[1]}: {r[2]}")

        print(f"Red aliases:        {additions['aliases']}")
        print(f"Red modifier_links: {additions['modifier_links']}")
        print(f"Red source_links:   {additions['source_links']}")
        if additions["skipped_modifier_links"]:
            print()
            print("WARNING: modifier_links referenced unknown modifier slugs (skipped):")
            for trick_slug, mod_slug in additions["skipped_modifier_links"]:
                print(f"  {trick_slug} -> {mod_slug}")

        print()
        print(f"Corrections applied: {corrections['applied']}")
        if corrections["skipped"]:
            print("WARNING: corrections skipped:")
            for slug, field, reason in corrections["skipped"]:
                print(f"  {slug}.{field}: {reason}")
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Load Red Husted's expert-review additions and corrections (2026-04-20)")
    parser.add_argument(
        "--db",
        default=str(REPO_ROOT / "database" / "footbag.db"),
        help="Path to SQLite database (default: repo root database/footbag.db)",
    )
    parser.add_argument(
        "--additions-csv",
        default=str(ADDITIONS_CSV),
        help="Path to red_additions CSV",
    )
    parser.add_argument(
        "--corrections-csv",
        default=str(CORRECTIONS_CSV),
        help="Path to red_corrections CSV",
    )
    args = parser.parse_args()

    load(Path(args.db), Path(args.additions_csv), Path(args.corrections_csv))


if __name__ == "__main__":
    main()
