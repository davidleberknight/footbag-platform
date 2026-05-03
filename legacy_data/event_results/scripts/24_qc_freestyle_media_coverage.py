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
REPORT_MD_PATH = REPORT_DIR / "freestyle_media_coverage.md"

LOADERS_IN_ORDER = [
    "17_load_trick_dictionary.py",
    "19_load_red_additions.py",
    "21_load_freestyle_media_sources.py",
    "22_load_freestyle_media_assets.py",
    "23_load_freestyle_media_links.py",
]

TUTORIAL_SOURCES = {
    # Explicit instruction-style content (channel-titled or lesson-numbered).
    "anz_trikz",
    "tt_youtube",
    "footbagspot_passback",
    "footbagspot_tutorials",
    "shred_global",
    "footbag_foundations",
    "polini_pointers",
    "everything_footbag",
}
HIGH_QUALITY_DEMO_SOURCES = {
    # Single-trick clean demonstration channels (slow, isolated, high-quality
    # but not narrated as instruction). Counts toward strong coverage but is
    # tagged separately for editorial visibility.
    "footbag_finland",
    "flipsider_footbag",
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
    if source_id in HIGH_QUALITY_DEMO_SOURCES:
        return "HIGH_QUALITY_DEMO"
    if source_id in RECORD_SOURCES:
        return "WEAK_RECORD"
    # Unknown sources fall to weak; surface in the report rather than crashing.
    return "WEAK_RECORD"


def classify_status(is_active: int, primary_strength: str, total_links: int) -> str:
    if is_active == 1:
        # STRONG_TUTORIAL and HIGH_QUALITY_DEMO both count as strong primary
        # for coverage; the distinction is preserved in primary_strength.
        if primary_strength in ("STRONG_TUTORIAL", "HIGH_QUALITY_DEMO"):
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
        SELECT slug, canonical_name, category, adds, is_active, review_status,
               base_trick, trick_family
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
    for slug, name, cat, adds, is_active, status, base, family in tricks:
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
            "base_trick": base or "",
            "trick_family": family or "",
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
        "slug", "canonical_name", "category", "base_trick", "trick_family", "adds",
        "is_active", "review_status",
        "primary_media_id", "primary_title", "primary_source_id", "primary_strength",
        "total_media_links", "has_anztrikz", "has_tt", "has_passback", "has_record",
        "status", "priority_bucket",
    ]
    with REPORT_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def family_key(row: dict) -> str:
    """Group label for the Family Coverage section.

    Surface delays and modifier rows take precedence over trick_family because
    they are taxonomically distinct from regular trick families.
    """
    if row["category"] == "surface":
        return "surface delays"
    if row["category"] == "modifier":
        return "sets/modifiers"
    if row["category"] == "set":
        return "sets/modifiers"
    if row["category"] == "body":
        return "body primitives"
    fam = row["trick_family"]
    if fam:
        return f"{fam} family"
    return "other"


def build_family_coverage(rows: list[dict]) -> dict:
    out: dict[str, dict] = {}
    for r in rows:
        fam = family_key(r)
        b = out.setdefault(fam, {"total": 0, "strong": 0, "weak": 0, "none": 0, "pending": 0, "members": []})
        b["total"] += 1
        b["members"].append(r["slug"])
        s = r["status"]
        if s == "ACTIVE_STRONG_PRIMARY": b["strong"] += 1
        elif s == "ACTIVE_WEAK_PRIMARY": b["weak"] += 1
        elif s == "ACTIVE_NO_PRIMARY":   b["none"] += 1
        else:                            b["pending"] += 1   # PENDING_*
    return out


def build_link_health(conn: sqlite3.Connection) -> dict:
    """4 link-health metrics for the dashboard."""
    dup = list(conn.execute("""
        SELECT entity_id, COUNT(*) FROM freestyle_media_links
        WHERE entity_type='trick' AND is_primary=1
        GROUP BY entity_id HAVING COUNT(*) > 1
    """))
    orphans = [r[0] for r in conn.execute("""
        SELECT DISTINCT l.entity_id FROM freestyle_media_links l
        LEFT JOIN freestyle_tricks t ON l.entity_id = t.slug
        WHERE l.entity_type='trick' AND t.slug IS NULL
    """)]
    pending_primary = list(conn.execute("""
        SELECT l.entity_id FROM freestyle_media_links l
        JOIN freestyle_tricks t ON l.entity_id = t.slug
        WHERE l.entity_type='trick' AND t.is_active = 0 AND l.is_primary = 1
    """))
    missing_src = list(conn.execute("""
        SELECT a.id, a.url, a.source_id FROM freestyle_media_assets a
        LEFT JOIN freestyle_media_sources s ON a.source_id = s.source_id
        WHERE a.source_id IS NULL OR a.source_id = '' OR s.source_id IS NULL
    """))
    return {
        "duplicate_primaries": dup,
        "orphan_media_links":  orphans,
        "pending_links_marked_primary": [r[0] for r in pending_primary],
        "missing_source_ids": [(r[0], r[1], r[2]) for r in missing_src],
    }


def render_report(rows: list[dict], family_cov: dict, link_health: dict) -> str:
    """Render the 4-section markdown report. Used both for stdout and the .md artifact."""
    out: list[str] = []
    push = out.append

    # 1. Coverage summary
    total_active = sum(1 for r in rows if r["is_active"] == 1)
    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
    strong = by_status.get("ACTIVE_STRONG_PRIMARY", 0)
    weak = by_status.get("ACTIVE_WEAK_PRIMARY", 0)
    no_prim = by_status.get("ACTIVE_NO_PRIMARY", 0)
    pending_media = by_status.get("PENDING_WITH_MEDIA", 0)
    pending_nomedia = by_status.get("PENDING_NO_MEDIA", 0)
    pct = (strong / total_active * 100) if total_active else 0

    # Subcounts within ACTIVE_STRONG_PRIMARY, by primary_strength
    strong_tutorial = sum(1 for r in rows if r["status"] == "ACTIVE_STRONG_PRIMARY" and r["primary_strength"] == "STRONG_TUTORIAL")
    strong_demo = sum(1 for r in rows if r["status"] == "ACTIVE_STRONG_PRIMARY" and r["primary_strength"] == "HIGH_QUALITY_DEMO")

    push("# Freestyle media coverage")
    push("")
    push(f"CSV: `{REPORT_PATH.relative_to(REPO_ROOT)}`")
    push("")
    push("## 1. Coverage summary")
    push("")
    push("| Metric | Count |")
    push("|---|---|")
    push(f"| active_tricks | {total_active} |")
    push(f"| strong_primary | {strong} |")
    push(f"| &nbsp;&nbsp;&nbsp;strong_tutorial | {strong_tutorial} |")
    push(f"| &nbsp;&nbsp;&nbsp;high_quality_demo | {strong_demo} |")
    push(f"| weak_primary | {weak} |")
    push(f"| no_primary | {no_prim} |")
    push(f"| pending_with_media | {pending_media} |")
    push(f"| pending_no_media | {pending_nomedia} |")
    push(f"| strong_coverage_pct | **{pct:.1f}%** |")
    push("")

    # 2. Top action list — sort by user-specified priority order
    bucket_rank = {"CORE_GAP": 0, "WEAK_CORE": 1, "PENDING_REVIEW": 4, "COMPLETE": 9, "LOW_PRIORITY": 5}
    status_rank = {"ACTIVE_NO_PRIMARY": 2, "ACTIVE_WEAK_PRIMARY": 3, "PENDING_WITH_MEDIA": 4,
                   "PENDING_NO_MEDIA": 4, "ACTIVE_STRONG_PRIMARY": 9}

    def action_key(r: dict) -> tuple:
        # CORE_GAP and WEAK_CORE come first regardless of status; then sort by status rank for the rest.
        if r["priority_bucket"] == "CORE_GAP":  return (0, r["slug"])
        if r["priority_bucket"] == "WEAK_CORE": return (1, r["slug"])
        return (status_rank.get(r["status"], 99), r["slug"])

    actions = sorted([r for r in rows if r["priority_bucket"] != "COMPLETE"], key=action_key)[:25]
    push("## 2. Top action list")
    push("")
    push("Sorted: CORE_GAP → WEAK_CORE → ACTIVE_NO_PRIMARY → ACTIVE_WEAK_PRIMARY → PENDING_REVIEW.")
    push("")
    push("| # | Slug | Family | Status | Bucket | Current primary |")
    push("|---|---|---|---|---|---|")
    for i, r in enumerate(actions, 1):
        cur = r["primary_title"] or "(none)"
        if len(cur) > 50:
            cur = cur[:47] + "..."
        push(f"| {i} | `{r['slug']}` | {r['trick_family'] or r['category'] or '-'} | {r['status']} | {r['priority_bucket']} | {cur} |")
    push("")

    # 3. Family coverage — sorted by lowest completion first
    push("## 3. Family coverage")
    push("")
    push("`family_completion_pct = strong_primary / total`. Sorted ascending (least-covered families first); ties broken by larger family size first.")
    push("")
    push("| Family | total | strong | weak | none | pending | completion % |")
    push("|---|---|---|---|---|---|---|")

    def completion_key(fam: str) -> tuple:
        b = family_cov[fam]
        pct = (b["strong"] / b["total"] * 100) if b["total"] else 0.0
        return (pct, -b["total"], fam)

    for fam in sorted(family_cov.keys(), key=completion_key):
        b = family_cov[fam]
        pct = (b["strong"] / b["total"] * 100) if b["total"] else 0.0
        push(f"| {fam} | {b['total']} | {b['strong']} | {b['weak']} | {b['none']} | {b['pending']} | {pct:.0f}% |")
    push("")

    # 4. Link health
    push("## 4. Link health")
    push("")
    push("| Check | Count | Detail |")
    push("|---|---|---|")
    push(f"| duplicate_primaries | {len(link_health['duplicate_primaries'])} | {link_health['duplicate_primaries'] or '-'} |")
    push(f"| orphan_media_links | {len(link_health['orphan_media_links'])} | {link_health['orphan_media_links'] or '-'} |")
    push(f"| pending_links_marked_primary | {len(link_health['pending_links_marked_primary'])} | {link_health['pending_links_marked_primary'] or '-'} |")
    miss = link_health["missing_source_ids"]
    miss_detail = "-" if not miss else "; ".join(f"{a[0]} ({a[2] or 'NULL'})" for a in miss[:5]) + (f" ... +{len(miss)-5}" if len(miss) > 5 else "")
    push(f"| missing_source_ids | {len(miss)} | {miss_detail} |")
    push("")

    return "\n".join(out)


def write_markdown(report_text: str) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_MD_PATH.write_text(report_text + "\n", encoding="utf-8")


def print_report(report_text: str) -> None:
    print(report_text)


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
            family_cov = build_family_coverage(rows)
            link_health = build_link_health(conn)
            errors = validate(conn, rows)
        finally:
            conn.close()

        write_csv(rows)
        report_text = render_report(rows, family_cov, link_health)
        write_markdown(report_text)
        print_report(report_text)

        if errors:
            print("## Validation errors", file=sys.stderr)
            for e in errors:
                print(f"  - {e}", file=sys.stderr)
            sys.exit(2)
        else:
            print(f"Validation: 4/4 checks passed.")
            print(f"Markdown report: {REPORT_MD_PATH.relative_to(REPO_ROOT)}")
    finally:
        if owns_db:
            db_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
