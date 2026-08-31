"""
Script 21: Load footbag.org tricks that are NOT in our canonical dictionary as
review_status='pending', is_active=0. Phase 2B coverage step.

Reads:
  freestyle/inputs/footbag_org_moves_snapshot.csv  (committed snapshot; refresh via script 18 --live)
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
  python freestyle/loaders/21_load_footbag_org_pending_tricks.py
  python freestyle/loaders/21_load_footbag_org_pending_tricks.py --db /path/to/footbag.db
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
REPO_ROOT  = SCRIPT_DIR.parents[1]

# Who owns the rows this loader creates. It inserts only names that resolve to
# nothing already in the dictionary, so every row it writes is its own.
import sys as _sys  # noqa: E402
_sys.path.insert(0, str(REPO_ROOT / "scripts"))
from _freestyle_ownership import FOOTBAG_ORG_PENDING  # noqa: E402
from _freestyle_alias_ownership import (  # noqa: E402
    CURATOR_APPLICATION as ALIAS_CURATOR_APPLICATION,
    FOOTBAG_ORG_PENDING as ALIAS_FOOTBAG_ORG_PENDING,
)

LEGACY_DIR = SCRIPT_DIR.parents[0]

DEFAULT_DB     = REPO_ROOT / "database" / "footbag.db"
DEFAULT_SCRAPE = LEGACY_DIR / "inputs" / "footbag_org_moves_snapshot.csv"

FOOTBAG_ORG_SOURCE_ID = "footbag-org-2026-04"
PENDING_SORT_BASE     = 10_000  # well above any curated/red sort_order

sys.path.insert(0, str(REPO_ROOT / "scripts"))
from _legacy_move_overrides import (  # noqa: E402
    assert_override_targets_present_and_active,
    override_slug_for_move,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def name_to_slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", name.lower().strip())
    return s.strip("_")


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

    # This loader's own prior output is excluded. It inserts the names nothing
    # already curated accounts for, so it must look at the dictionary as if it had
    # not run: a row it created last time would otherwise resolve to itself and
    # the name would drop out of the intake. Earlier this was achieved by deleting
    # those rows first, which took their references with them; the ownership stamp
    # gives the same view without removing anything.
    for slug, canonical_name in conn.execute(
        "SELECT slug, canonical_name FROM freestyle_tricks"
        " WHERE trick_origin_producer IS NOT ? OR trick_origin_producer IS NULL",
        (FOOTBAG_ORG_PENDING,),
    ):
        resolver.setdefault(canonical_name.strip().lower(), slug)
        resolver.setdefault(name_to_slug(canonical_name), slug)
        resolver.setdefault(slug, slug)

    for alias_slug, alias_text, trick_slug in conn.execute(
        "SELECT a.alias_slug, a.alias_text, a.trick_slug"
        "  FROM freestyle_trick_aliases a"
        "  JOIN freestyle_tricks t ON t.slug = a.trick_slug"
        " WHERE t.trick_origin_producer IS NOT ? OR t.trick_origin_producer IS NULL",
        (FOOTBAG_ORG_PENDING,),
    ):
        resolver.setdefault(alias_text.strip().lower(), trick_slug)
        resolver.setdefault(alias_slug, trick_slug)

    return resolver


def resolve_to_existing(row: dict, resolver: dict[str, str]) -> str | None:
    """The curated move-ID override wins over name resolution, so an overridden
    move is recognized as already curated and never spawns a pending duplicate
    of the canonical trick it belongs to."""
    override = override_slug_for_move(row.get("showmove_id"))
    if override is not None:
        return override
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
# Idempotency: refresh the attachments on this loader's own rows
# ---------------------------------------------------------------------------

def clear_prior_pending_from_footbag(conn: sqlite3.Connection) -> int:
    """Clear the attachments on rows this loader owns, so it can rewrite them.

    The trick rows themselves stay. Deleting and re-inserting them took every
    reference with them, which is how a second refresh came to fail outright once
    rulings began pointing at these rows: the trick row is an identity other
    records name, not a scratch buffer. Rows this loader owns and the intake no
    longer produces are retired by the retirement step, which can see what every
    producer wants; they are not removed from here.

    Ownership is read from the stamp rather than from the reserved sort_order
    range the earlier version keyed on. The range was a stand-in for exactly this
    question and stopped being needed once the row could answer it directly.

    Existing pending rows from other sources (curated-v1, red-husted) live
    at lower sort_order values and are preserved.

    FK-safe order: aliases -> modifier_links -> relations -> source_links -> tricks.
    """
    rows = conn.execute(
        "SELECT slug FROM freestyle_tricks WHERE trick_origin_producer = ?",
        (FOOTBAG_ORG_PENDING,),
    ).fetchall()
    doomed = [r[0] for r in rows]
    if not doomed:
        return 0

    qmarks = ",".join("?" * len(doomed))
    # A curator's alias on a trick this loader is about to retire cannot simply be
    # swept up with it: it exists in no committed file, and the trick row it
    # points at is going away, so deleting it silently destroys the only copy and
    # keeping it breaks the foreign key. Neither is this loader's decision.
    _held = conn.execute(
        f"SELECT alias_slug, trick_slug FROM freestyle_trick_aliases "
        f" WHERE trick_slug IN ({qmarks}) AND alias_origin_producer = ?",
        [*doomed, ALIAS_CURATOR_APPLICATION],
    ).fetchall()
    if _held:
        sys.stderr.write(
            "ERROR: the intake wants to retire tricks a curator has attached "
            "aliases to. Nothing was changed.\n")
        for _a, _t in _held:
            sys.stderr.write(f"  {_a} on {_t}\n")
        sys.stderr.write(
            "\nRetiring the trick would delete an alias no committed file can "
            "restore. Decide each one deliberately: retire the alias through the "
            "application first, or keep the trick.\n")
        raise SystemExit(1)

    conn.execute(
        f"DELETE FROM freestyle_trick_aliases WHERE trick_slug IN ({qmarks}) "
        f"  AND alias_origin_producer = ?",
        [*doomed, ALIAS_FOOTBAG_ORG_PENDING],
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
                    "alias_origin_producer": ALIAS_FOOTBAG_ORG_PENDING,
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
           sort_order, loaded_at, updated_at, trick_origin_producer)
        VALUES
          (:slug, :canonical_name, :adds, :base_trick, :trick_family, :category,
           :description, :aliases_json, :notation, :review_status, :is_core, :is_active,
           :sort_order, :loaded_at, :updated_at, :trick_origin_producer)
        -- Upsert, because its own rows are no longer cleared first. The conflict
        -- path omits trick_origin_producer: ownership is settled in preflight and
        -- a content write never moves it.
        ON CONFLICT(slug) DO UPDATE SET
          canonical_name=excluded.canonical_name,
          adds=excluded.adds,
          base_trick=excluded.base_trick,
          trick_family=excluded.trick_family,
          category=excluded.category,
          description=excluded.description,
          aliases_json=excluded.aliases_json,
          notation=excluded.notation,
          review_status=excluded.review_status,
          is_active=excluded.is_active,
          sort_order=excluded.sort_order,
          updated_at=excluded.updated_at
        """,
        [{**r, "trick_origin_producer": FOOTBAG_ORG_PENDING} for r in rows],
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
              (alias_slug, alias_text, trick_slug, alias_type, source_id,
               provenance_note, display_reason, alias_origin_producer, created_at)
            VALUES
              (:alias_slug, :alias_text, :trick_slug, :alias_type, :source_id,
               :notes, NULL, :alias_origin_producer, :created_at)
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

    # Open through the shared guard so a direct run refuses a post-cutover database.
    import os.path as _p
    import sys as _s
    _s.path.insert(0, _p.join(_p.dirname(_p.abspath(__file__)), "..", "..", "scripts"))
    from _freestyle_db import open_freestyle_db
    conn = open_freestyle_db(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            n_cleared = clear_prior_pending_from_footbag(conn)

            assert_override_targets_present_and_active(
                conn, "footbag.org pending loader",
                [row.get("showmove_id") for row in scrape_rows],
            )
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
