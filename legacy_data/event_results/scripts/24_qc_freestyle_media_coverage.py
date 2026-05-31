"""
Script 24: QC the freestyle media coverage. READ-ONLY.

Produces a per-trick coverage row classifying primary strength, media presence,
and remediation priority. Mirrors the dashboard the team uses to decide which
tricks need new primary tutorials and which can be left alone.

Source graph:
  The UNIFIED media graph (media_items + media_tags). A trick is "covered" when
  a curated media item (one carrying the #curated tag) is tagged with its
  #<slug>; coverage strength is derived from the item's source_id. The
  deprecated freestyle_media_* graph is no longer read.

Input:
  --db <path> against a seeded DB is the supported path: curated media_items are
  populated by scripts/reset-local-db.sh (seed_fh_curator), which this script
  does NOT run. Default temp-build mode loads only the trick dictionary (loaders
  17 + 19) and cannot populate media_items, so it exits with guidance to use --db.

  Indirect (embedded) instructional coverage — a trick taught inside another
  trick's tutorial — is read from a curator manifest
  (legacy_data/tools/trick_video_discovery/embedded_coverage.csv) and reported
  SEPARATELY: it never counts toward the direct strong-coverage headline. A
  no-primary trick with an embedded edge is bucketed EMBEDDED_ONLY (covered
  indirectly), not as a gap.

Output:
  legacy_data/reports/freestyle_media_coverage.csv
  (per-trick row incl. embedded_covered / embedded_hosts / has_pedagogical_reach)

Stdout:
  Markdown summary with active counts, the direct strong-coverage percentage, a
  separate indirect-coverage block (embedded_covered, pedagogical_reach), and
  the top priority targets (CORE_GAP first, then WEAK_CORE; EMBEDDED_ONLY excluded).

Validation (non-zero exit on any failure):
  - report row count == total freestyle_tricks row count
  - every curated media item's (non-blank) source_id is a recognized source
  - every embedded_coverage.csv slug (embedded + host) resolves to a real trick
  (Non-resolving curated tags are surfaced in the Media-health section, not failed.)

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
# Curator-authored manifest of indirect (embedded) instructional coverage: a
# trick taught INSIDE another trick's tutorial, with no dedicated clip of its
# own (e.g. orbit inside the Around The World lesson). Manual source, not
# pipeline-generated. Read-only here; embedded coverage is reported separately
# and never counts toward the direct strong-coverage headline.
EMBEDDED_COVERAGE_CSV = LEGACY_DATA_DIR / "tools" / "trick_video_discovery" / "embedded_coverage.csv"
REPORT_DIR = LEGACY_DATA_DIR / "reports"
REPORT_PATH = REPORT_DIR / "freestyle_media_coverage.csv"
REPORT_MD_PATH = REPORT_DIR / "freestyle_media_coverage.md"

# Coverage strength is derived from a curated item's source_id (the unified
# media graph carries no per-item tier column). STRONG = a teaching-tier source;
# DEMO = demonstration-tier; RECORD = a record clip. A blank source_id on a
# curated item is treated as weak (covered, but not strong). A non-blank source
# not recognized here is flagged by validation.
STRONG_TUTORIAL_SOURCES = {
    "tt_youtube", "anz_trikz", "footbagspot_passback", "passback_tutorials",
    "footbagspot_tutorials", "footbag_foundations", "polini_pointers",
    "everything_footbag",
}
DEMO_SOURCES = {"shred_global", "footbag_finland", "flipsider_footbag"}
RECORD_SOURCES = {"passback_records"}
KNOWN_SOURCES = STRONG_TUTORIAL_SOURCES | DEMO_SOURCES | RECORD_SOURCES
# Strength labels that count as strong primary coverage.
STRONG_STRENGTHS = {"STRONG_TUTORIAL", "HIGH_QUALITY_DEMO"}

# Tag-shape vocabulary mirrored from the live media-tag invariant: exact utility
# words and snake_case domain prefixes are NOT trick references; a bare
# kebab-case tag is a trick slug.
UTILITY_EXACT_TAGS = {"freestyle", "trick", "curated", "tricks_of_the_trade", "passback_records"}
DOMAIN_PREFIXES = ("event_", "demo_", "fh_", "player_", "club_", "set_", "by_")


def trick_tag_body(tag_display: str) -> str | None:
    """Return the trick-slug body of a media tag, or None if it is a utility /
    domain-prefix tag (not a trick reference)."""
    body = tag_display.lstrip("#").strip().lower()
    if not body or body in UTILITY_EXACT_TAGS or body.startswith(DOMAIN_PREFIXES):
        return None
    return body


# Temp-build loads only the trick dictionary; the unified curated media
# (media_items) is seeded out-of-band by reset-local-db.sh, not here.
LOADERS_IN_ORDER = [
    "17_load_trick_dictionary.py",
    "19_load_red_additions.py",
]

# Media-priority "core" set: tricks whose MISSING tutorial counts as a
# high-priority coverage gap (CORE_GAP / WEAK_CORE). Intentionally a SUPERSET
# of the 12 irreducible ontology atoms — it contains all of them plus
# high-value compounds (pixie, fairy, mobius, ...) that warrant a tutorial.
# The 12 atoms are listed first. Note: clipper-stall is the atom; the bare
# `clipper` slug is the Clipper Kick (ADD-1 body trick) and is NOT core.
CORE_TRICKS = {
    # the 12 irreducible atoms
    "toe-stall", "clipper-stall", "around-the-world", "orbit", "legover",
    "pickup", "mirage", "illusion", "butterfly", "osis", "whirl", "swirl",
    # high-value compounds whose missing tutorial is a high-priority gap
    "pixie", "fairy", "torque", "blender", "drifter", "ripwalk",
    "smear", "blur", "mobius", "hop-over", "flying-inside", "flying-outside",
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


def load_embedded_coverage() -> dict[str, list[str]]:
    """Load embedded-coverage edges from the curator manifest (source of truth).

    Returns {embedded_trick_slug: [host_trick_slug, ...]}. Absent file → empty
    dict (graceful: a fresh clone or partial state never crashes the dashboard).
    """
    out: dict[str, list[str]] = {}
    if not EMBEDDED_COVERAGE_CSV.exists():
        return out
    with EMBEDDED_COVERAGE_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            emb = (row.get("embedded_trick_slug") or "").strip()
            host = (row.get("host_trick_slug") or "").strip()
            if not emb:
                continue
            out.setdefault(emb, [])
            if host:
                out[emb].append(host)
    return out


def classify_primary_strength(source_id: str) -> str:
    """Map a curated item's source_id to a coverage-strength label.

    Returns STRONG_TUTORIAL / HIGH_QUALITY_DEMO / WEAK_RECORD. A blank or
    unrecognized source_id is treated as weak (covered, not strong); an
    unrecognized non-blank source is additionally flagged by validation.
    """
    if source_id in STRONG_TUTORIAL_SOURCES:
        return "STRONG_TUTORIAL"
    if source_id in DEMO_SOURCES:
        return "HIGH_QUALITY_DEMO"
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


def classify_priority(slug: str, status: str, embedded_covered: bool = False) -> str:
    is_core = slug in CORE_TRICKS
    if status == "ACTIVE_STRONG_PRIMARY":
        return "COMPLETE"
    if status in ("PENDING_WITH_MEDIA", "PENDING_NO_MEDIA"):
        return "PENDING_REVIEW"
    if status == "ACTIVE_NO_PRIMARY":
        # A trick taught inside another trick's tutorial is covered, just not
        # by a dedicated clip — it is not a gap. Surface it distinctly so it
        # neither hides among COMPLETE nor inflates the CORE_GAP list.
        if embedded_covered:
            return "EMBEDDED_ONLY"
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

    # Curated media in the unified graph: a media_item carrying the #curated
    # tag, joined to its #<trick-slug> tags. One row per (item, trick-tag).
    item_rows = list(conn.execute("""
        SELECT lower(t.tag_display), mi.id, COALESCE(mi.source_id, ''), COALESCE(mi.caption, '')
        FROM media_tags t
        JOIN media_items mi ON mi.id = t.media_id
        WHERE EXISTS (SELECT 1 FROM media_tags c
                      WHERE c.media_id = mi.id AND lower(c.tag_display) = '#curated')
    """))

    by_slug: dict[str, list[dict]] = {}
    for tag, media_id, source_id, caption in item_rows:
        body = trick_tag_body(tag)
        if body is None:
            continue
        by_slug.setdefault(body, []).append({
            "media_id": media_id, "source_id": source_id, "caption": caption,
            "strength": classify_primary_strength(source_id),
        })

    embedded = load_embedded_coverage()
    # Best curated item per trick: strongest tier wins.
    rank = {"STRONG_TUTORIAL": 3, "HIGH_QUALITY_DEMO": 2, "WEAK_RECORD": 1}

    rows = []
    for slug, name, cat, adds, is_active, status, base, family in tricks:
        items = by_slug.get(slug, [])
        primary = max(items, key=lambda i: rank[i["strength"]]) if items else None
        primary_strength = primary["strength"] if primary else "NONE"
        row_status = classify_status(is_active, primary_strength, len(items))
        embedded_hosts = embedded.get(slug, [])
        embedded_covered = bool(embedded_hosts)
        priority = classify_priority(slug, row_status, embedded_covered)
        is_strong = primary_strength in STRONG_STRENGTHS
        # Pedagogical reach: direct dedicated coverage OR embedded coverage.
        # Reported separately from the direct headline; never merged into it.
        has_reach = row_status == "ACTIVE_STRONG_PRIMARY" or embedded_covered

        sources = {i["source_id"] for i in items}
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
            "primary_title": (primary["caption"] if primary else "") or "",
            "primary_source_id": primary["source_id"] if primary else "",
            "primary_strength": primary_strength,
            "is_strong": int(is_strong),
            "total_media_items": len(items),
            "has_anztrikz": int("anz_trikz" in sources),
            "has_tt": int("tt_youtube" in sources),
            "has_passback": int(any(s in sources for s in ("footbagspot_passback", "passback_tutorials", "passback_records"))),
            "has_record": int("passback_records" in sources),
            "embedded_covered": int(embedded_covered),
            "embedded_hosts": "|".join(embedded_hosts),
            "has_pedagogical_reach": int(has_reach),
            "status": row_status,
            "priority_bucket": priority,
        })
    return rows


def curated_trick_tags(conn: sqlite3.Connection) -> set[str]:
    """Distinct trick-slug bodies tagged on curated media items."""
    out: set[str] = set()
    for (tag,) in conn.execute("""
        SELECT DISTINCT lower(t.tag_display) FROM media_tags t
        WHERE EXISTS (SELECT 1 FROM media_tags c
                      WHERE c.media_id = t.media_id AND lower(c.tag_display) = '#curated')
    """):
        body = trick_tag_body(tag)
        if body is not None:
            out.add(body)
    return out


def validate(conn: sqlite3.Connection, rows: list[dict]) -> list[str]:
    errors: list[str] = []

    # Non-resolving curated tags (source / status / topic / other-discipline tags
    # such as #shred_global, #tutorial, #net) do NOT corrupt coverage — build_rows
    # only reads tags that match a freestyle_tricks slug — so they are surfaced in
    # the Media-health section, not hard-failed here.

    # 1. report row count == total freestyle_tricks
    n_tricks = conn.execute("SELECT COUNT(*) FROM freestyle_tricks").fetchone()[0]
    if len(rows) != n_tricks:
        errors.append(f"row count mismatch: report={len(rows)} tricks_table={n_tricks}")

    # 2. curated media with an unrecognized (non-blank) source_id. Blank is
    #    allowed (weak/unsourced); a non-blank unknown source means the strength
    #    map is stale, so name it.
    bad_src = sorted({
        r[0] for r in conn.execute("""
            SELECT DISTINCT COALESCE(mi.source_id, '') FROM media_items mi
            WHERE EXISTS (SELECT 1 FROM media_tags c
                          WHERE c.media_id = mi.id AND lower(c.tag_display) = '#curated')
              AND COALESCE(mi.source_id, '') <> ''
        """)
        if r[0] not in KNOWN_SOURCES
    })
    if bad_src:
        errors.append(f"curated media with unrecognized source_id (update strength map): {bad_src}")

    # 3. embedded-coverage manifest slugs must resolve to real trick slugs
    #    (both the embedded trick and its host). A typo here would silently
    #    mis-mark coverage, so name the offenders and fail.
    embedded = load_embedded_coverage()
    if embedded:
        valid_slugs = {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks")}
        unknown_embedded = sorted(s for s in embedded if s not in valid_slugs)
        unknown_hosts = sorted({
            h for hosts in embedded.values() for h in hosts if h not in valid_slugs
        })
        if unknown_embedded:
            errors.append(
                f"embedded_coverage.csv embedded_trick_slug not in freestyle_tricks: "
                f"{unknown_embedded}"
            )
        if unknown_hosts:
            errors.append(
                f"embedded_coverage.csv host_trick_slug not in freestyle_tricks: "
                f"{unknown_hosts}"
            )

    return errors


def write_csv(rows: list[dict]) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    fields = [
        "slug", "canonical_name", "category", "base_trick", "trick_family", "adds",
        "is_active", "review_status",
        "primary_media_id", "primary_title", "primary_source_id", "primary_strength",
        "is_strong",
        "total_media_items", "has_anztrikz", "has_tt", "has_passback", "has_record",
        "embedded_covered", "embedded_hosts", "has_pedagogical_reach",
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
    """Media-health metrics for the unified curated graph."""
    valid_slugs = {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks")}
    orphan_tags = sorted(t for t in curated_trick_tags(conn) if t not in valid_slugs)
    unrecognized_sources = sorted({
        r[0] for r in conn.execute("""
            SELECT DISTINCT COALESCE(mi.source_id, '') FROM media_items mi
            WHERE EXISTS (SELECT 1 FROM media_tags c
                          WHERE c.media_id = mi.id AND lower(c.tag_display) = '#curated')
              AND COALESCE(mi.source_id, '') <> ''
        """)
        if r[0] not in KNOWN_SOURCES
    })
    blank_source = conn.execute("""
        SELECT COUNT(DISTINCT mi.id) FROM media_items mi
        WHERE EXISTS (SELECT 1 FROM media_tags c
                      WHERE c.media_id = mi.id AND lower(c.tag_display) = '#curated')
          AND COALESCE(mi.source_id, '') = ''
    """).fetchone()[0]
    return {
        "orphan_curated_tags": orphan_tags,
        "unrecognized_sources": unrecognized_sources,
        "curated_items_blank_source": blank_source,
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

    # Indirect (embedded) coverage — reported SEPARATELY, never merged into the
    # direct strong-coverage headline above. Pedagogical reach = direct strong
    # OR embedded; it is a distinct, explicitly-labelled metric.
    embedded_active = sum(1 for r in rows if r["is_active"] == 1 and r["embedded_covered"])
    embedded_only = sum(1 for r in rows if r["priority_bucket"] == "EMBEDDED_ONLY")
    reach = sum(1 for r in rows if r["is_active"] == 1 and r["has_pedagogical_reach"])
    reach_pct = (reach / total_active * 100) if total_active else 0

    # Subcounts within ACTIVE_STRONG_PRIMARY, by source-derived strength
    strong_tutorial = sum(1 for r in rows if r["status"] == "ACTIVE_STRONG_PRIMARY" and r["primary_strength"] == "STRONG_TUTORIAL")
    strong_demo = sum(1 for r in rows if r["status"] == "ACTIVE_STRONG_PRIMARY" and r["primary_strength"] == "HIGH_QUALITY_DEMO")

    push("# Freestyle media coverage")
    push("")
    push(f"CSV: `{REPORT_PATH.relative_to(REPO_ROOT)}`")
    push("")
    push("Source graph: **unified `media_items` / `media_tags`** (curated items only). "
         "Direct coverage = a curated `#<slug>`-tagged item; strength is derived from `source_id`.")
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
    push(f"| strong_coverage_pct (direct dedicated) | **{pct:.1f}%** |")
    push("")
    push("Indirect coverage (reported separately; NOT added to the direct headline above):")
    push("")
    push("| Metric | Count |")
    push("|---|---|")
    push(f"| embedded_covered (active) | {embedded_active} |")
    push(f"| &nbsp;&nbsp;&nbsp;embedded_only (no direct primary) | {embedded_only} |")
    push(f"| pedagogical_reach (incl. embedded) | {reach} |")
    push(f"| pedagogical_reach_pct (incl. embedded) | {reach_pct:.1f}% |")
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

    # EMBEDDED_ONLY is covered indirectly (taught inside another trick's
    # tutorial) — not a gap, so it stays off the action list alongside COMPLETE.
    covered_buckets = {"COMPLETE", "EMBEDDED_ONLY"}
    actions = sorted([r for r in rows if r["priority_bucket"] not in covered_buckets], key=action_key)[:25]
    push("## 2. Top action list")
    push("")
    push("Sorted: CORE_GAP → WEAK_CORE → ACTIVE_NO_PRIMARY → ACTIVE_WEAK_PRIMARY → PENDING_REVIEW. EMBEDDED_ONLY excluded (covered indirectly).")
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

    # 4. Media health (unified curated graph)
    push("## 4. Media health")
    push("")
    push("| Check | Count | Detail |")
    push("|---|---|---|")
    orphan = link_health["orphan_curated_tags"]
    push(f"| orphan_curated_tags | {len(orphan)} | {orphan or '-'} |")
    bad_src = link_health["unrecognized_sources"]
    push(f"| unrecognized_sources | {len(bad_src)} | {bad_src or '-'} |")
    push(f"| curated_items_blank_source | {link_health['curated_items_blank_source']} | (counted as weak coverage) |")
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
        # Preflight: curated media lives in media_items, seeded by
        # scripts/reset-local-db.sh (seed_fh_curator), which this script does not
        # run. Temp-build mode therefore has an empty media_items — fail loudly
        # with the producer + supported path rather than report 0 coverage.
        n_media = conn.execute("SELECT COUNT(*) FROM media_items").fetchone()[0]
        if n_media == 0 and owns_db:
            conn.close()
            db_path.unlink(missing_ok=True)
            sys.stderr.write(
                "media_items is empty in the temp build. Curated media is seeded by "
                "scripts/reset-local-db.sh (seed_fh_curator), which this script does not run.\n"
                "Run against a seeded DB:\n"
                "  python legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py "
                "--db database/footbag.db\n"
            )
            sys.exit(2)
        if n_media == 0:
            sys.stderr.write("WARNING: media_items is empty in the supplied --db; coverage will read 0.\n")
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
            print(f"Validation: 3/3 checks passed (unified media_items graph + embedded-coverage manifest).")
            print(f"Markdown report: {REPORT_MD_PATH.relative_to(REPO_ROOT)}")
    finally:
        if owns_db:
            db_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
