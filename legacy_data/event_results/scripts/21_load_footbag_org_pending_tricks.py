"""
Script 21: Load footbag.org tricks that are NOT in our canonical dictionary as
review_status='pending', is_active=0. Phase 2B coverage step.

Reads:
  legacy_data/inputs/footbag_org_moves_snapshot.csv  (committed snapshot; refresh via script 18 --live)
  database/footbag.db
    freestyle_tricks
    freestyle_trick_aliases
    freestyle_trick_source_links

Writes: database/footbag.db
  freestyle_tricks                — INSERT new pending rows
  freestyle_trick_aliases         — INSERT alt_name aliases for new rows
  (script 20 owns freestyle_trick_source_links; re-run 20 after this script.)

Resolution:
  - For each scraped row, build a normalized-name resolver from existing
    canonical names + aliases. If source_name OR alt_name resolves, SKIP
    (existing trick is canonical; preserve curator/expert decisions).
  - Otherwise insert as a new pending row.

Constraints (Phase 2B):
  - Never overwrite an existing canonical or alias row.
  - Never set is_active=1 here.
  - Preserve ADD, notation, description, family/category hints.
  - Provenance: footbag.org source link is owned by script 20; this script
    only loads the trick itself + its alt_name alias. Run 20 afterward.

Idempotent:
  - Pre-cleans any prior pending-from-footbag rows (and their FK dependents)
    before re-inserting. "Pending-from-footbag" = freestyle_tricks with
    review_status='pending' AND a source_link to source_id='footbag-org-2026-04'.
  - Aliases use INSERT OR IGNORE — collisions with existing aliases are
    silently skipped, never overwritten.

Pipeline ordering:
  17 (curated)  →  19 (red additions)  →  20 (footbag source linker)
                 →  21 (this script)
                 →  20 again (refresh source_links to include new pending rows)
                 →  22 (QC)

Run from repo root with the venv active:
  python legacy_data/event_results/scripts/21_load_footbag_org_pending_tricks.py
  python legacy_data/event_results/scripts/21_load_footbag_org_pending_tricks.py --db /path/to/footbag.db
"""

from __future__ import annotations

import argparse
import csv
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT  = SCRIPT_DIR.parents[2]
LEGACY_DIR = SCRIPT_DIR.parents[1]

DEFAULT_DB     = REPO_ROOT / "database" / "footbag.db"
DEFAULT_SCRAPE = LEGACY_DIR / "inputs" / "footbag_org_moves_snapshot.csv"

FOOTBAG_ORG_SOURCE_ID = "footbag-org-2026-04"
PENDING_SORT_BASE     = 10_000  # well above any curated/red sort_order


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def name_to_slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower().strip())
    return s.strip("-")


def parse_int(value) -> int | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Resolver: scraped row -> existing canonical slug (or None)
# ---------------------------------------------------------------------------

def build_resolver(conn: sqlite3.Connection) -> dict[str, str]:
    """Map normalized name forms (lowercase + slug) to existing trick slugs."""
    resolver: dict[str, str] = {}

    for slug, canonical_name in conn.execute(
        "SELECT slug, canonical_name FROM freestyle_tricks"
    ):
        resolver.setdefault(canonical_name.strip().lower(), slug)
        resolver.setdefault(name_to_slug(canonical_name), slug)
        resolver.setdefault(slug, slug)

    for alias_slug, alias_text, trick_slug in conn.execute(
        "SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases"
    ):
        resolver.setdefault(alias_text.strip().lower(), trick_slug)
        resolver.setdefault(alias_slug, trick_slug)

    return resolver


def resolve_to_existing(row: dict, resolver: dict[str, str]) -> str | None:
    for field in ("source_name", "alt_name"):
        raw = (row.get(field) or "").strip()
        if not raw:
            continue
        if raw.lower() in resolver:
            return resolver[raw.lower()]
        slug = name_to_slug(raw)
        if slug and slug in resolver:
            return resolver[slug]
    return None


# ---------------------------------------------------------------------------
# Idempotency: clear prior pending-from-footbag rows
# ---------------------------------------------------------------------------

def clear_prior_pending_from_footbag(conn: sqlite3.Connection) -> int:
    """Delete pending rows that came from a previous run of this script.

    Identified via review_status='pending' AND sort_order >= PENDING_SORT_BASE.
    PENDING_SORT_BASE (10_000) is reserved exclusively for this loader's
    inserts; curated/red rows live at 0-99. This identifier is robust even if
    a prior run failed before writing source_links (any pending row in the
    reserved sort_order range is owned by this script).

    Existing pending rows from other sources (curated-v1, red-husted) live
    at lower sort_order values and are preserved.

    FK-safe order: aliases -> modifier_links -> relations -> source_links -> tricks.
    """
    rows = conn.execute(
        """
        SELECT slug
        FROM freestyle_tricks
        WHERE review_status = 'pending' AND sort_order >= ?
        """,
        (PENDING_SORT_BASE,),
    ).fetchall()
    doomed = [r[0] for r in rows]
    if not doomed:
        return 0

    qmarks = ",".join("?" * len(doomed))
    conn.execute(
        f"DELETE FROM freestyle_trick_aliases WHERE trick_slug IN ({qmarks})",
        doomed,
    )
    conn.execute(
        f"DELETE FROM freestyle_trick_modifier_links WHERE trick_slug IN ({qmarks})",
        doomed,
    )
    conn.execute(
        f"""
        DELETE FROM freestyle_trick_relations
         WHERE from_trick_slug IN ({qmarks}) OR to_trick_slug IN ({qmarks})
        """,
        doomed + doomed,
    )
    conn.execute(
        f"DELETE FROM freestyle_trick_source_links WHERE trick_slug IN ({qmarks})",
        doomed,
    )
    conn.execute(
        f"DELETE FROM freestyle_tricks WHERE slug IN ({qmarks})",
        doomed,
    )
    return len(doomed)


# ---------------------------------------------------------------------------
# Build pending row + alias rows from each scraped row
# ---------------------------------------------------------------------------

def build_pending_rows(scrape_rows: list[dict],
                       resolver: dict[str, str],
                       loaded_at: str) -> tuple[list[dict], list[dict], list[dict], int, int]:
    """Return (tricks, aliases, source_links, n_resolved_skipped, n_dedup_collapsed).

    source_links are emitted only for the new pending rows this script inserts.
    Script 20 owns source_links for is_active=1 canonical rows; this script
    owns them for the pending rows it creates (since 20's resolver intentionally
    excludes pending rows).
    """
    tricks: list[dict] = []
    aliases: list[dict] = []
    source_links: list[dict] = []
    seen_slugs: set[str] = set()
    n_resolved_skipped = 0
    n_dedup_collapsed = 0

    for i, row in enumerate(scrape_rows):
        # Skip if scraped row resolves to anything already in our dictionary.
        if resolve_to_existing(row, resolver) is not None:
            n_resolved_skipped += 1
            continue

        source_name = (row.get("source_name") or "").strip()
        if not source_name:
            continue

        slug = name_to_slug(source_name)
        if not slug:
            continue
        if slug in seen_slugs:
            n_dedup_collapsed += 1
            continue
        seen_slugs.add(slug)

        family_hint   = (row.get("family_hint") or "").strip() or None
        category_hint = (row.get("category_hint") or "").strip() or None
        description   = (row.get("description") or "").strip() or None
        notation      = (row.get("notation") or "").strip() or None
        adds          = parse_int(row.get("add_value"))
        showmove_id   = (row.get("showmove_id") or "").strip() or None
        source_url    = (row.get("source_url") or "").strip() or None

        tricks.append({
            "slug":            slug,
            "canonical_name":  source_name,
            "adds":            str(adds) if adds is not None else None,
            "base_trick":      family_hint,
            "trick_family":    family_hint,
            "category":        category_hint,
            "description":     description,
            "aliases_json":    "[]",
            "notation":        notation,
            "review_status":   "pending",
            "is_core":         0,
            "is_active":       0,
            "sort_order":      PENDING_SORT_BASE + i,
            "loaded_at":       loaded_at,
            "updated_at":      loaded_at,
        })

        # Source link — pending rows ARE canonical for the data they hold, so
        # asserted_* are NULL (no divergence to capture).
        source_links.append({
            "trick_slug":         slug,
            "source_id":          FOOTBAG_ORG_SOURCE_ID,
            "external_ref":       showmove_id,
            "external_url":       source_url,
            "asserted_adds":      None,
            "asserted_notation":  None,
            "asserted_category":  None,
            "notes":              None,
        })

        alt_name = (row.get("alt_name") or "").strip()
        if alt_name:
            alias_slug = name_to_slug(alt_name)
            if alias_slug and alias_slug != slug:
                aliases.append({
                    "alias_slug":  alias_slug,
                    "alias_text":  alt_name,
                    "trick_slug":  slug,
                    "alias_type":  "common",
                    "source_id":   FOOTBAG_ORG_SOURCE_ID,
                    "notes":       None,
                    "created_at":  loaded_at,
                })

    return tricks, aliases, source_links, n_resolved_skipped, n_dedup_collapsed


# ---------------------------------------------------------------------------
# DB writers
# ---------------------------------------------------------------------------

def insert_pending_tricks(conn: sqlite3.Connection, rows: list[dict]) -> int:
    if not rows:
        return 0
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
    return len(rows)


def insert_aliases(conn: sqlite3.Connection, rows: list[dict]) -> int:
    if not rows:
        return 0
    inserted = 0
    for r in rows:
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO freestyle_trick_aliases
              (alias_slug, alias_text, trick_slug, alias_type, source_id, notes, created_at)
            VALUES
              (:alias_slug, :alias_text, :trick_slug, :alias_type, :source_id, :notes, :created_at)
            """,
            r,
        )
        if cur.rowcount:
            inserted += 1
    return inserted


def insert_source_links(conn: sqlite3.Connection, rows: list[dict]) -> int:
    if not rows:
        return 0
    # PRIMARY KEY (trick_slug, source_id); use INSERT OR IGNORE so re-runs are
    # idempotent when the prior run's rows weren't fully cleared.
    inserted = 0
    for r in rows:
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO freestyle_trick_source_links
              (trick_slug, source_id, external_ref, external_url,
               asserted_adds, asserted_notation, asserted_category, notes)
            VALUES
              (:trick_slug, :source_id, :external_ref, :external_url,
               :asserted_adds, :asserted_notation, :asserted_category, :notes)
            """,
            r,
        )
        if cur.rowcount:
            inserted += 1
    return inserted


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def load(db_path: Path, scrape_path: Path) -> dict:
    if not scrape_path.exists():
        raise FileNotFoundError(f"Scraped CSV not found: {scrape_path}")

    loaded_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    scrape_rows: list[dict] = []
    with scrape_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            scrape_rows.append({k: (v or "").strip() for k, v in row.items()})

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            n_cleared = clear_prior_pending_from_footbag(conn)

            resolver = build_resolver(conn)
            tricks, aliases, source_links, n_resolved, n_dedup = build_pending_rows(
                scrape_rows, resolver, loaded_at
            )

            n_inserted_tricks       = insert_pending_tricks(conn, tricks)
            n_inserted_aliases      = insert_aliases(conn, aliases)
            n_inserted_source_links = insert_source_links(conn, source_links)
    finally:
        conn.close()

    return {
        "scrape_rows":          len(scrape_rows),
        "cleared_prior":        n_cleared,
        "resolved_skipped":     n_resolved,
        "dedup_collapsed":      n_dedup,
        "inserted_tricks":      n_inserted_tricks,
        "alias_candidates":     len(aliases),
        "inserted_aliases":     n_inserted_aliases,
        "inserted_source_links": n_inserted_source_links,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Load missing footbag.org tricks as pending/inactive (Phase 2B).",
    )
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--scraped-csv", default=str(DEFAULT_SCRAPE))
    args = parser.parse_args()

    db_path = Path(args.db)
    scrape_path = Path(args.scraped_csv)

    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        sys.exit(2)

    stats = load(db_path, scrape_path)

    print("Phase 2B: footbag.org pending-trick load complete.")
    print(f"  scraped rows read              : {stats['scrape_rows']}")
    print(f"  cleared from prior run         : {stats['cleared_prior']}")
    print(f"  resolved to existing (skipped) : {stats['resolved_skipped']}")
    print(f"  dedup collapsed                : {stats['dedup_collapsed']}")
    print(f"  pending tricks inserted        : {stats['inserted_tricks']}")
    print(f"  alias candidates from alt_name : {stats['alias_candidates']}")
    print(f"  aliases inserted (OR IGNORE)   : {stats['inserted_aliases']}")
    print(f"  source_links inserted (pending): {stats['inserted_source_links']}")
    print()
    print("Next: re-run script 22 for QC. (Script 20 only re-links is_active=1")
    print("rows; the source_links written above own the pending rows' provenance.)")


if __name__ == "__main__":
    main()
