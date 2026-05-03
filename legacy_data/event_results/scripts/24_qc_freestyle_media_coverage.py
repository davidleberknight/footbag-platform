"""
Script 24: QC the freestyle media coverage. READ-ONLY.

Produces a per-trick coverage row classifying primary strength, media presence,
and remediation priority. Mirrors the dashboard the team uses to decide which
tricks need new primary tutorials and which can be left alone.

Input:
  Either an existing DB (--db) or a fresh schema-only temp DB built by running
  reset-compatible loaders 17 + 19 + 21 + 22 + 23 in sequence. Default behavior
  is the temp build (matches what the next reset-local-db.sh will produce).

Output:
  legacy_data/reports/freestyle_media_coverage.csv

Stdout:
  Markdown summary with active counts, strong-coverage percentage, and the top
  20 priority targets (CORE_GAP first, then WEAK_CORE).

Validation (non-zero exit on any failure):
  - no duplicate primary per (entity_type='trick', entity_id)
  - no media_links.entity_id points to a missing trick slug
  - pending tricks with media all have is_primary=0
  - report row count == total freestyle_tricks row count

Run:
  python legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py
  python legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py --db /path/to/footbag.db
"""

from __future__ import annotations

import argparse
import csv
import subprocess
import sqlite3
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LEGACY_DATA_DIR = SCRIPT_DIR.parents[1]
REPO_ROOT = SCRIPT_DIR.parents[2]
SCHEMA_SQL = REPO_ROOT / "database" / "schema.sql"
REPORT_DIR = LEGACY_DATA_DIR / "reports"
REPORT_PATH = REPORT_DIR / "freestyle_media_coverage.csv"

LOADERS_IN_ORDER = [
    "17_load_trick_dictionary.py",
    "19_load_red_additions.py",
    "21_load_freestyle_media_sources.py",
    "22_load_freestyle_media_assets.py",
    "23_load_freestyle_media_links.py",
]

TUTORIAL_SOURCES = {
    "anz_trikz",
    "tt_youtube",
    "footbagspot_passback",
    "footbagspot_tutorials",
    "shred_global",
    "footbag_foundations",
    "polini_pointers",
    "everything_footbag",
    "flipsider_footbag",
    "footbag_finland",
}
RECORD_SOURCES = {"passback_records"}

CORE_TRICKS = {
    "mirage", "illusion", "pickup", "legover", "butterfly", "clipper",
    "around-the-world", "pixie", "fairy", "osis", "torque", "blender",
    "whirl", "drifter", "ripwalk", "smear", "blur", "mobius",
    "hop-over", "flying-inside", "flying-outside",
}


def build_temp_db() -> Path:
    """Build a temp DB from schema and run reset-compatible loaders. Returns path."""
    fd, path = tempfile.mkstemp(prefix="footbag-coverage-", suffix=".db")
    Path(path).unlink()  # let sqlite3 create fresh
    db_path = Path(path)

    # Load schema
    schema = SCHEMA_SQL.read_text()
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(schema)
    finally:
        conn.close()

    # Run loaders
    for loader in LOADERS_IN_ORDER:
        result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / loader), "--db", str(db_path)],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            sys.stderr.write(f"loader {loader} failed:\n{result.stderr}\n")
            db_path.unlink(missing_ok=True)
            sys.exit(1)

    return db_path


def classify_primary_strength(source_id: str | None) -> str:
    if source_id is None:
        return "NONE"
    if source_id in TUTORIAL_SOURCES:
        return "STRONG_TUTORIAL"
    if source_id in RECORD_SOURCES:
        return "WEAK_RECORD"
    # Unknown sources fall to weak; surface in the report rather than crashing.
    return "WEAK_RECORD"


def classify_status(is_active: int, primary_strength: str, total_links: int) -> str:
    if is_active == 1:
        if primary_strength == "STRONG_TUTORIAL":
            return "ACTIVE_STRONG_PRIMARY"
        if primary_strength == "WEAK_RECORD":
            return "ACTIVE_WEAK_PRIMARY"
        return "ACTIVE_NO_PRIMARY"
    if total_links > 0:
        return "PENDING_WITH_MEDIA"
    return "PENDING_NO_MEDIA"


def classify_priority(slug: str, status: str) -> str:
    is_core = slug in CORE_TRICKS
    if status == "ACTIVE_STRONG_PRIMARY":
        return "COMPLETE"
    if status in ("PENDING_WITH_MEDIA", "PENDING_NO_MEDIA"):
        return "PENDING_REVIEW"
    if status == "ACTIVE_NO_PRIMARY":
        return "CORE_GAP" if is_core else "LOW_PRIORITY"
    if status == "ACTIVE_WEAK_PRIMARY":
        return "WEAK_CORE" if is_core else "LOW_PRIORITY"
    return "LOW_PRIORITY"


def build_rows(conn: sqlite3.Connection) -> list[dict]:
    """One row per freestyle_tricks slug."""
    tricks = list(conn.execute("""
        SELECT slug, canonical_name, category, adds, is_active, review_status
        FROM freestyle_tricks ORDER BY slug
    """))

    # Pull all trick links + asset metadata in one shot.
    link_rows = list(conn.execute("""
        SELECT l.entity_id, l.media_id, l.is_primary,
               a.title, a.source_id
        FROM freestyle_media_links l
        JOIN freestyle_media_assets a ON l.media_id = a.id
        WHERE l.entity_type = 'trick'
    """))

    by_slug: dict[str, list[dict]] = {}
    for r in link_rows:
        by_slug.setdefault(r[0], []).append({
            "media_id": r[1], "is_primary": r[2],
            "title": r[3], "source_id": r[4],
        })

    rows = []
    for slug, name, cat, adds, is_active, status in tricks:
        links = by_slug.get(slug, [])
        primaries = [l for l in links if l["is_primary"] == 1]
        primary = primaries[0] if primaries else None
        primary_strength = classify_primary_strength(primary["source_id"] if primary else None)
        row_status = classify_status(is_active, primary_strength, len(links))
        priority = classify_priority(slug, row_status)

        sources = {l["source_id"] for l in links}
        rows.append({
            "slug": slug,
            "canonical_name": name,
            "category": cat or "",
            "adds": adds if adds is not None else "",
            "is_active": is_active,
            "review_status": status,
            "primary_media_id": primary["media_id"] if primary else "",
            "primary_title": (primary["title"] if primary else "") or "",
            "primary_source_id": primary["source_id"] if primary else "",
            "primary_strength": primary_strength,
            "total_media_links": len(links),
            "has_anztrikz": int("anz_trikz" in sources),
            "has_tt": int("tt_youtube" in sources),
            "has_passback": int(any(s in sources for s in ("footbagspot_passback", "passback_records"))),
            "has_record": int("passback_records" in sources),
            "status": row_status,
            "priority_bucket": priority,
        })
    return rows


def validate(conn: sqlite3.Connection, rows: list[dict]) -> list[str]:
    errors: list[str] = []

    # 1. no duplicate primary per trick
    dup = list(conn.execute("""
        SELECT entity_id, COUNT(*) FROM freestyle_media_links
        WHERE entity_type='trick' AND is_primary=1
        GROUP BY entity_id HAVING COUNT(*) > 1
    """))
    if dup:
        errors.append(f"duplicate primaries: {dup}")

    # 2. no media_links.entity_id points to a missing trick slug
    orphans = list(conn.execute("""
        SELECT l.entity_id FROM freestyle_media_links l
        LEFT JOIN freestyle_tricks t ON l.entity_id = t.slug
        WHERE l.entity_type='trick' AND t.slug IS NULL
    """))
    if orphans:
        errors.append(f"orphan trick references: {[o[0] for o in orphans]}")

    # 3. pending tricks with media all have is_primary=0
    pending_with_primary = list(conn.execute("""
        SELECT l.entity_id, l.is_primary FROM freestyle_media_links l
        JOIN freestyle_tricks t ON l.entity_id = t.slug
        WHERE l.entity_type='trick' AND t.is_active = 0 AND l.is_primary = 1
    """))
    if pending_with_primary:
        errors.append(f"pending trick with is_primary=1: {pending_with_primary}")

    # 4. report row count == total freestyle_tricks
    n_tricks = conn.execute("SELECT COUNT(*) FROM freestyle_tricks").fetchone()[0]
    if len(rows) != n_tricks:
        errors.append(f"row count mismatch: report={len(rows)} tricks_table={n_tricks}")

    return errors


def write_csv(rows: list[dict]) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    fields = [
        "slug", "canonical_name", "category", "adds", "is_active", "review_status",
        "primary_media_id", "primary_title", "primary_source_id", "primary_strength",
        "total_media_links", "has_anztrikz", "has_tt", "has_passback", "has_record",
        "status", "priority_bucket",
    ]
    with REPORT_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def print_summary(rows: list[dict]) -> None:
    total_active = sum(1 for r in rows if r["is_active"] == 1)
    total_pending = sum(1 for r in rows if r["is_active"] == 0)
    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
    strong = by_status.get("ACTIVE_STRONG_PRIMARY", 0)
    weak = by_status.get("ACTIVE_WEAK_PRIMARY", 0)
    no_prim = by_status.get("ACTIVE_NO_PRIMARY", 0)
    pending_media = by_status.get("PENDING_WITH_MEDIA", 0)
    pending_nomedia = by_status.get("PENDING_NO_MEDIA", 0)
    pct = (strong / total_active * 100) if total_active else 0

    print(f"\n# Freestyle media coverage")
    print()
    print(f"Report: {REPORT_PATH.relative_to(REPO_ROOT)}")
    print()
    print(f"## Summary")
    print()
    print(f"| Metric | Count |")
    print(f"|---|---|")
    print(f"| Active tricks | {total_active} |")
    print(f"| Active strong primary (tutorial) | {strong} |")
    print(f"| Active weak primary (record-only) | {weak} |")
    print(f"| Active no primary | {no_prim} |")
    print(f"| Pending with media | {pending_media} |")
    print(f"| Pending no media | {pending_nomedia} |")
    print(f"| Strong coverage % of active | **{pct:.1f}%** |")
    print()

    # Top 20 priority targets: CORE_GAP first, then WEAK_CORE, then LOW_PRIORITY-no-primary
    rank = {"CORE_GAP": 0, "WEAK_CORE": 1, "LOW_PRIORITY": 2, "PENDING_REVIEW": 3, "COMPLETE": 9}
    targets = sorted(
        [r for r in rows if r["priority_bucket"] in ("CORE_GAP", "WEAK_CORE", "LOW_PRIORITY")
         and r["status"] != "ACTIVE_STRONG_PRIMARY"],
        key=lambda r: (rank[r["priority_bucket"]], r["status"], r["slug"]),
    )[:20]

    print(f"## Top 20 priority targets")
    print()
    print(f"| # | Slug | Bucket | Status | Current primary |")
    print(f"|---|---|---|---|---|")
    for i, r in enumerate(targets, 1):
        cur = r["primary_title"] if r["primary_title"] else "(none)"
        if len(cur) > 60:
            cur = cur[:57] + "..."
        print(f"| {i} | `{r['slug']}` | {r['priority_bucket']} | {r['status']} | {cur} |")
    print()


def main() -> None:
    p = argparse.ArgumentParser(description="Freestyle media coverage QC")
    p.add_argument("--db", help="Use existing DB instead of building a temp one from loaders")
    args = p.parse_args()

    if args.db:
        db_path = Path(args.db)
        owns_db = False
    else:
        db_path = build_temp_db()
        owns_db = True

    try:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            rows = build_rows(conn)
            errors = validate(conn, rows)
        finally:
            conn.close()

        write_csv(rows)
        print_summary(rows)

        if errors:
            print("## Validation errors", file=sys.stderr)
            for e in errors:
                print(f"  - {e}", file=sys.stderr)
            sys.exit(2)
        else:
            print(f"Validation: 4/4 checks passed.")
    finally:
        if owns_db:
            db_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
