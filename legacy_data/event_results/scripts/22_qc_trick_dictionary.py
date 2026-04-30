"""
Script 22: QC the freestyle trick dictionary against footbag.org and emit
review artifacts. READ-ONLY. Writes nothing to the database. Writes nothing
to source CSVs. All output lands in legacy_data/out/ for human review.

Inputs:
  - database/footbag.db
      freestyle_tricks
      freestyle_trick_aliases
      freestyle_trick_sources
      freestyle_trick_source_links
      freestyle_trick_modifier_links
      freestyle_trick_relations
  - legacy_data/out/scraped_footbag_moves.csv  (produced by script 18)

Outputs (legacy_data/out/):
  - trick_dictionary_comparison.csv  — concept-level matrix (one row per
    distinct concept name found in either source). Drives merge planning.
  - trick_dictionary_conflicts.csv   — one row per detected conflict, with
    severity HIGH/MED/LOW and a suggested resolution.
  - trick_dictionary_known_issues.csv — focused HIGH-severity subset for
    quick triage.
  - trick_notation_coverage.csv      — per-trick notation presence audit;
    target is 100% notation coverage on active rows.

Conflict types detected:
  ADD_DISAGREEMENT              — source_links.asserted_adds NOT NULL
  NOTATION_DISAGREEMENT         — source_links.asserted_notation NOT NULL
  CATEGORY_DISAGREEMENT         — source_links.asserted_category NOT NULL
  DESCRIPTION_SELF_CONTRADICTION — description claims '= N ADD' but adds != N
  DUPLICATE_CANONICAL            — two slugs normalize to the same name
  MISSING_NOTATION               — active trick with no notation but footbag has it
  REVIEWER_NAME_LEAK             — description references a reviewer name
  DIRECTION_AMBIGUITY            — known direction-pair flagged for review
  NEW_FROM_SOURCE                — footbag.org trick not present in canonical or aliases

Usage (from legacy_data/ with venv active, or from repo root):
  python legacy_data/event_results/scripts/22_qc_trick_dictionary.py
  python legacy_data/event_results/scripts/22_qc_trick_dictionary.py --db /path/to/footbag.db
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import re
import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT  = SCRIPT_DIR.parents[2]
LEGACY_DIR = SCRIPT_DIR.parents[1]

DEFAULT_DB     = REPO_ROOT / "database" / "footbag.db"
DEFAULT_SCRAPE = LEGACY_DIR / "out" / "scraped_footbag_moves.csv"
OUT_DIR        = LEGACY_DIR / "out"

OUT_COMPARISON = OUT_DIR / "trick_dictionary_comparison.csv"
OUT_CONFLICTS  = OUT_DIR / "trick_dictionary_conflicts.csv"
OUT_KNOWN      = OUT_DIR / "trick_dictionary_known_issues.csv"
OUT_NOTATION   = OUT_DIR / "trick_notation_coverage.csv"

REVIEWER_NAME_PATTERNS = [
    re.compile(r"\bper\s+red\b", re.IGNORECASE),
    re.compile(r"\bby\s+red\b", re.IGNORECASE),
    re.compile(r"\bred\s+husted\b", re.IGNORECASE),
    re.compile(r"\bred\s+\d{4}", re.IGNORECASE),
    re.compile(r"\bconfirmed\s+by\b", re.IGNORECASE),
]

ADDS_IN_DESC_RE = re.compile(r"=\s*(\d+)\s*ADD", re.IGNORECASE)

# Pairs flagged for human direction-adjudication. These are documented in the
# skill: same-stem names where direction is structural, not cosmetic.
DIRECTION_PAIRS = [
    ("around-the-world", "around-the-world-kick"),  # 2 ADD compound vs 1 ADD body
    ("around-the-world", "reverse-around-the-world"),
    ("mirage",   "illusion"),                       # in-to-out vs out-to-in dex
    ("spinning", "inspinning"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_concept(name: str) -> str:
    """Lowercase, alphanumeric-only key for duplicate detection."""
    return re.sub(r"[^a-z0-9]+", "", name.lower().strip())


def name_to_slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower().strip())
    return s.strip("-")


def conflict_id(*parts: str) -> str:
    h = hashlib.sha1("|".join(p or "" for p in parts).encode("utf-8")).hexdigest()
    return h[:12]


def adds_to_int(value) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(str(value).strip())
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Load: curated tricks, aliases, source_links
# ---------------------------------------------------------------------------

def load_curated(conn: sqlite3.Connection) -> dict[str, dict]:
    rows = {}
    for row in conn.execute(
        """
        SELECT slug, canonical_name, adds, base_trick, trick_family, category,
               description, notation, review_status, is_core, is_active
        FROM freestyle_tricks
        """
    ):
        slug, canonical_name, adds, base_trick, trick_family, category, \
            description, notation, review_status, is_core, is_active = row
        rows[slug] = {
            "slug": slug,
            "canonical_name": canonical_name,
            "adds": adds,
            "base_trick": base_trick,
            "trick_family": trick_family,
            "category": category,
            "description": description or "",
            "notation": notation or "",
            "review_status": review_status,
            "is_core": is_core,
            "is_active": is_active,
        }
    return rows


def load_aliases(conn: sqlite3.Connection) -> list[tuple[str, str, str, str]]:
    return list(conn.execute(
        """
        SELECT alias_slug, alias_text, trick_slug, alias_type
        FROM freestyle_trick_aliases
        """
    ))


def load_source_links(conn: sqlite3.Connection) -> list[dict]:
    out = []
    for row in conn.execute(
        """
        SELECT l.trick_slug, l.source_id, s.source_label, l.external_url,
               l.external_ref, l.asserted_adds, l.asserted_notation,
               l.asserted_category, l.notes
        FROM freestyle_trick_source_links l
        LEFT JOIN freestyle_trick_sources s ON s.id = l.source_id
        """
    ):
        out.append({
            "trick_slug": row[0],
            "source_id": row[1],
            "source_label": row[2] or "",
            "external_url": row[3] or "",
            "external_ref": row[4] or "",
            "asserted_adds": row[5],
            "asserted_notation": row[6] or "",
            "asserted_category": row[7] or "",
            "notes": row[8] or "",
        })
    return out


def load_footbag_scrape(path: Path) -> list[dict]:
    if not path.exists():
        print(f"WARNING: scrape CSV not found at {path} — running with empty scrape.")
        return []
    rows = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "source_name":   (row.get("source_name") or "").strip(),
                "alt_name":      (row.get("alt_name") or "").strip(),
                "add_value":     (row.get("add_value") or "").strip(),
                "showmove_id":   (row.get("showmove_id") or "").strip(),
                "source_url":    (row.get("source_url") or "").strip(),
                "notation":      (row.get("notation") or "").strip(),
                "tags_summary":  (row.get("tags_summary") or "").strip(),
                "description":   (row.get("description") or "").strip(),
                "family_hint":   (row.get("family_hint") or "").strip(),
                "category_hint": (row.get("category_hint") or "").strip(),
            })
    return rows


# ---------------------------------------------------------------------------
# Resolver: footbag scrape row → curated slug (or None for genuinely new)
# ---------------------------------------------------------------------------

def build_resolver(curated: dict[str, dict],
                   aliases: list[tuple[str, str, str, str]]) -> dict[str, str]:
    resolver: dict[str, str] = {}
    for slug, t in curated.items():
        resolver.setdefault(t["canonical_name"].lower(), slug)
        resolver.setdefault(name_to_slug(t["canonical_name"]), slug)
    for alias_slug, alias_text, trick_slug, _ in aliases:
        resolver.setdefault(alias_text.lower(), trick_slug)
        resolver.setdefault(alias_slug, trick_slug)
    return resolver


def resolve_scrape_row(scrape: dict, resolver: dict[str, str]) -> tuple[str | None, str]:
    """Return (curated_slug, match_type)."""
    src = scrape["source_name"].lower()
    alt = scrape["alt_name"].lower()
    if src and src in resolver:
        return resolver[src], "exact"
    src_slug = name_to_slug(scrape["source_name"])
    if src_slug and src_slug in resolver:
        return resolver[src_slug], "exact"
    if alt and alt in resolver:
        return resolver[alt], "alias_match"
    alt_slug = name_to_slug(scrape["alt_name"])
    if alt_slug and alt_slug in resolver:
        return resolver[alt_slug], "alias_match"
    return None, "new"


# ---------------------------------------------------------------------------
# Comparison matrix
# ---------------------------------------------------------------------------

def build_comparison_rows(curated: dict[str, dict],
                          aliases: list[tuple[str, str, str, str]],
                          scrape_rows: list[dict]) -> list[dict]:
    resolver = build_resolver(curated, aliases)

    # Concept key → comparison row. Concept key is normalize_concept(canonical_name)
    # for curated, or normalize_concept(source_name) for footbag.
    matrix: dict[str, dict] = {}

    # Seed from curated.
    for slug, t in curated.items():
        key = normalize_concept(t["canonical_name"])
        matrix[key] = {
            "concept_name": t["canonical_name"],
            "curated_slug": slug,
            "in_curated": 1,
            "in_footbag_org": 0,
            "curated_adds": t["adds"],
            "curated_category": t["category"],
            "curated_description": t["description"],
            "curated_notation": t["notation"],
            "curated_review_status": t["review_status"],
            "footbag_showmove_id": "",
            "footbag_url": "",
            "footbag_adds": "",
            "footbag_notation": "",
            "footbag_tags": "",
            "footbag_family_hint": "",
            "footbag_category_hint": "",
            "footbag_alt_name": "",
            "match_type": "curated_only",
            "adds_conflict": 0,
            "notation_present_curated": 1 if t["notation"] else 0,
            "notation_present_footbag": 0,
            "description_conflict": 0,
            "suggested_action": "keep_curated",
            "review_priority": "LOW",
            "notes": "",
        }

    # Overlay footbag.
    for sc in scrape_rows:
        slug, match_type = resolve_scrape_row(sc, resolver)
        key = normalize_concept(sc["source_name"]) or normalize_concept(sc["alt_name"])
        if not key:
            continue

        if slug and slug in curated:
            curated_key = normalize_concept(curated[slug]["canonical_name"])
            row = matrix.get(curated_key)
            if row is None:
                row = matrix.setdefault(curated_key, {})
        else:
            row = matrix.setdefault(key, {
                "concept_name": sc["source_name"],
                "curated_slug": "",
                "in_curated": 0,
                "in_footbag_org": 0,
                "curated_adds": "",
                "curated_category": "",
                "curated_description": "",
                "curated_notation": "",
                "curated_review_status": "",
                "footbag_showmove_id": "",
                "footbag_url": "",
                "footbag_adds": "",
                "footbag_notation": "",
                "footbag_tags": "",
                "footbag_family_hint": "",
                "footbag_category_hint": "",
                "footbag_alt_name": "",
                "match_type": "new",
                "adds_conflict": 0,
                "notation_present_curated": 0,
                "notation_present_footbag": 0,
                "description_conflict": 0,
                "suggested_action": "new_pending",
                "review_priority": "MED",
                "notes": "",
            })

        # Only fill footbag fields once per concept (first-hit wins; alt-name
        # / partial matches that point at the same curated slug collapse).
        if not row["in_footbag_org"]:
            row["in_footbag_org"] = 1
            row["footbag_showmove_id"] = sc["showmove_id"]
            row["footbag_url"] = sc["source_url"]
            row["footbag_adds"] = sc["add_value"]
            row["footbag_notation"] = sc["notation"]
            row["footbag_tags"] = sc["tags_summary"]
            row["footbag_family_hint"] = sc["family_hint"]
            row["footbag_category_hint"] = sc["category_hint"]
            row["footbag_alt_name"] = sc["alt_name"]
            row["notation_present_footbag"] = 1 if sc["notation"] else 0
            if row["in_curated"]:
                row["match_type"] = match_type if match_type != "new" else "exact"
            else:
                row["match_type"] = "new"

    # Conflict / suggestion derivation per row.
    for row in matrix.values():
        c_adds = adds_to_int(row["curated_adds"])
        f_adds = adds_to_int(row["footbag_adds"])
        if row["in_curated"] and row["in_footbag_org"] and c_adds is not None and f_adds is not None and c_adds != f_adds:
            row["adds_conflict"] = 1

        # Description conflict heuristic:
        #   - "= N ADD" claim in description but trick.adds != N
        #   - description references "inside delay" / "outside delay" without notation alignment
        if row["in_curated"] and row["curated_description"]:
            m = ADDS_IN_DESC_RE.search(row["curated_description"])
            if m and c_adds is not None and int(m.group(1)) != c_adds:
                row["description_conflict"] = 1

        # Suggested action + priority.
        if row["in_curated"] and row["in_footbag_org"]:
            if row["adds_conflict"]:
                row["suggested_action"] = "flag_review"
                row["review_priority"] = "HIGH"
            elif row["description_conflict"]:
                row["suggested_action"] = "flag_review"
                row["review_priority"] = "HIGH"
            elif not row["curated_notation"] and row["footbag_notation"]:
                row["suggested_action"] = "accept_footbag_notation"
                row["review_priority"] = "MED"
            else:
                row["suggested_action"] = "keep_curated"
                row["review_priority"] = "LOW"
        elif not row["in_curated"] and row["in_footbag_org"]:
            row["suggested_action"] = "new_pending"
            # Higher-ADD compound tricks merit closer review; 1-ADDs are bulk-ok.
            if f_adds is not None and f_adds >= 4:
                row["review_priority"] = "MED"
            else:
                row["review_priority"] = "LOW"

    return sorted(matrix.values(), key=lambda r: (r["concept_name"] or "").lower())


# ---------------------------------------------------------------------------
# Conflict detection
# ---------------------------------------------------------------------------

def detect_conflicts(curated: dict[str, dict],
                     source_links: list[dict],
                     comparison_rows: list[dict]) -> list[dict]:
    out: list[dict] = []

    # Index: source_links keyed by trick_slug.
    by_slug: dict[str, list[dict]] = {}
    for link in source_links:
        by_slug.setdefault(link["trick_slug"], []).append(link)

    # Source-link assertions (already captured by loader 20).
    for link in source_links:
        slug = link["trick_slug"]
        t = curated.get(slug, {})
        canonical_name = t.get("canonical_name", slug)
        if link["asserted_adds"] is not None:
            out.append({
                "conflict_id": conflict_id(slug, link["source_id"], "ADD"),
                "trick_slug": slug,
                "canonical_name": canonical_name,
                "conflict_type": "ADD_DISAGREEMENT",
                "canonical_value": str(t.get("adds") or ""),
                "asserted_value": str(link["asserted_adds"]),
                "source_id": link["source_id"],
                "external_url": link["external_url"],
                "severity": "HIGH",
                "suggested_resolution": "needs_human_review",
                "notes": link["notes"],
            })
        if link["asserted_notation"]:
            out.append({
                "conflict_id": conflict_id(slug, link["source_id"], "NOTATION"),
                "trick_slug": slug,
                "canonical_name": canonical_name,
                "conflict_type": "NOTATION_DISAGREEMENT",
                "canonical_value": (t.get("notation") or "")[:200],
                "asserted_value": link["asserted_notation"][:200],
                "source_id": link["source_id"],
                "external_url": link["external_url"],
                "severity": "MED",
                "suggested_resolution": "accept_source_when_canonical_blank" if not t.get("notation") else "needs_human_review",
                "notes": link["notes"],
            })
        if link["asserted_category"]:
            out.append({
                "conflict_id": conflict_id(slug, link["source_id"], "CATEGORY"),
                "trick_slug": slug,
                "canonical_name": canonical_name,
                "conflict_type": "CATEGORY_DISAGREEMENT",
                "canonical_value": t.get("category") or "",
                "asserted_value": link["asserted_category"],
                "source_id": link["source_id"],
                "external_url": link["external_url"],
                "severity": "MED",
                "suggested_resolution": "needs_human_review",
                "notes": link["notes"],
            })

    # Description self-contradiction + reviewer-name leak.
    for slug, t in curated.items():
        desc = t["description"] or ""
        adds = adds_to_int(t["adds"])
        m = ADDS_IN_DESC_RE.search(desc)
        if m and adds is not None and int(m.group(1)) != adds:
            out.append({
                "conflict_id": conflict_id(slug, "internal_qc", "DESC_CONTRADICTION"),
                "trick_slug": slug,
                "canonical_name": t["canonical_name"],
                "conflict_type": "DESCRIPTION_SELF_CONTRADICTION",
                "canonical_value": f"adds={adds}",
                "asserted_value": f"description claims = {m.group(1)} ADD",
                "source_id": "internal_qc",
                "external_url": "",
                "severity": "HIGH",
                "suggested_resolution": "rewrite_description",
                "notes": desc[:160],
            })
        for pat in REVIEWER_NAME_PATTERNS:
            if pat.search(desc):
                out.append({
                    "conflict_id": conflict_id(slug, "internal_qc", "REVIEWER_LEAK"),
                    "trick_slug": slug,
                    "canonical_name": t["canonical_name"],
                    "conflict_type": "REVIEWER_NAME_LEAK",
                    "canonical_value": "",
                    "asserted_value": desc[:200],
                    "source_id": "internal_qc",
                    "external_url": "",
                    "severity": "HIGH",
                    "suggested_resolution": "redact_to_source_links_notes",
                    "notes": "Public description references reviewer name.",
                })
                break

    # Duplicate canonical detection: two slugs whose normalized concept matches.
    by_concept: dict[str, list[str]] = {}
    for slug, t in curated.items():
        by_concept.setdefault(normalize_concept(t["canonical_name"]), []).append(slug)
    for concept, slugs in by_concept.items():
        if len(slugs) > 1:
            sorted_slugs = sorted(slugs)
            for slug in sorted_slugs:
                others = [s for s in sorted_slugs if s != slug]
                out.append({
                    "conflict_id": conflict_id(concept, slug, "DUP"),
                    "trick_slug": slug,
                    "canonical_name": curated[slug]["canonical_name"],
                    "conflict_type": "DUPLICATE_CANONICAL",
                    "canonical_value": slug,
                    "asserted_value": ",".join(others),
                    "source_id": "internal_qc",
                    "external_url": "",
                    "severity": "HIGH",
                    "suggested_resolution": "needs_human_review_pick_canonical",
                    "notes": f"Slugs {sorted_slugs} normalize to '{concept}'. Pick canonical form; collapse others to aliases.",
                })

    # Missing notation on active rows (where footbag offers it).
    for row in comparison_rows:
        if (row["in_curated"]
                and row["curated_review_status"] in ("curated", "expert_reviewed")
                and not row["curated_notation"]
                and row["footbag_notation"]):
            out.append({
                "conflict_id": conflict_id(row["curated_slug"], "internal_qc", "MISSING_NOTATION"),
                "trick_slug": row["curated_slug"],
                "canonical_name": row["concept_name"],
                "conflict_type": "MISSING_NOTATION",
                "canonical_value": "",
                "asserted_value": row["footbag_notation"][:200],
                "source_id": "footbag-org-2026-04",
                "external_url": row["footbag_url"],
                "severity": "MED",
                "suggested_resolution": "accept_footbag_notation",
                "notes": "Active trick has no notation; footbag.org provides one.",
            })

    # Direction-pair ambiguity flags.
    curated_slugs = set(curated.keys())
    for a, b in DIRECTION_PAIRS:
        if a in curated_slugs and b in curated_slugs:
            out.append({
                "conflict_id": conflict_id(a, b, "DIR"),
                "trick_slug": a,
                "canonical_name": curated[a]["canonical_name"],
                "conflict_type": "DIRECTION_AMBIGUITY",
                "canonical_value": a,
                "asserted_value": b,
                "source_id": "internal_qc",
                "external_url": "",
                "severity": "MED",
                "suggested_resolution": "confirm_relation_type",
                "notes": f"Direction-paired with '{b}'. Ensure freestyle_trick_relations entry exists.",
            })

    # NEW_FROM_SOURCE: footbag rows that didn't resolve to a curated slug.
    for row in comparison_rows:
        if not row["in_curated"] and row["in_footbag_org"]:
            f_adds = adds_to_int(row["footbag_adds"])
            severity = "MED" if (f_adds is not None and f_adds >= 4) else "LOW"
            out.append({
                "conflict_id": conflict_id(row["concept_name"], "footbag-org-2026-04", "NEW"),
                "trick_slug": "",
                "canonical_name": row["concept_name"],
                "conflict_type": "NEW_FROM_SOURCE",
                "canonical_value": "(absent)",
                "asserted_value": f"adds={row['footbag_adds']} notation_present={'yes' if row['footbag_notation'] else 'no'}",
                "source_id": "footbag-org-2026-04",
                "external_url": row["footbag_url"],
                "severity": severity,
                "suggested_resolution": "load_as_pending",
                "notes": row["footbag_tags"],
            })

    return out


# ---------------------------------------------------------------------------
# Notation coverage
# ---------------------------------------------------------------------------

def build_notation_coverage(curated: dict[str, dict],
                            comparison_rows: list[dict]) -> list[dict]:
    fb_notation_by_slug = {}
    for row in comparison_rows:
        if row["curated_slug"] and row["footbag_notation"]:
            fb_notation_by_slug[row["curated_slug"]] = row["footbag_notation"]

    out = []
    for slug, t in curated.items():
        has_notation = bool(t["notation"])
        notation_source = "curated" if has_notation else (
            "footbag_available" if slug in fb_notation_by_slug else "missing"
        )
        out.append({
            "slug": slug,
            "canonical_name": t["canonical_name"],
            "adds": t["adds"] or "",
            "is_active": t["is_active"],
            "review_status": t["review_status"],
            "has_notation": 1 if has_notation else 0,
            "notation": t["notation"],
            "notation_source": notation_source,
            "footbag_notation_available": fb_notation_by_slug.get(slug, ""),
        })
    return sorted(out, key=lambda r: (-int(r["is_active"]), r["slug"]))


# ---------------------------------------------------------------------------
# CSV emit
# ---------------------------------------------------------------------------

def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})


COMPARISON_FIELDS = [
    "concept_name", "curated_slug", "in_curated", "in_footbag_org",
    "curated_adds", "curated_category", "curated_description",
    "curated_notation", "curated_review_status",
    "footbag_showmove_id", "footbag_url", "footbag_adds", "footbag_notation",
    "footbag_tags", "footbag_family_hint", "footbag_category_hint", "footbag_alt_name",
    "match_type", "adds_conflict", "notation_present_curated",
    "notation_present_footbag", "description_conflict",
    "suggested_action", "review_priority", "notes",
]

CONFLICT_FIELDS = [
    "conflict_id", "trick_slug", "canonical_name", "conflict_type",
    "canonical_value", "asserted_value", "source_id", "external_url",
    "severity", "suggested_resolution", "notes",
]

NOTATION_FIELDS = [
    "slug", "canonical_name", "adds", "is_active", "review_status",
    "has_notation", "notation", "notation_source", "footbag_notation_available",
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(db_path: Path, scrape_path: Path) -> dict:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        curated = load_curated(conn)
        aliases = load_aliases(conn)
        source_links = load_source_links(conn)
    finally:
        conn.close()

    scrape_rows = load_footbag_scrape(scrape_path)

    comparison_rows = build_comparison_rows(curated, aliases, scrape_rows)
    conflict_rows = detect_conflicts(curated, source_links, comparison_rows)
    notation_rows = build_notation_coverage(curated, comparison_rows)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_csv(OUT_COMPARISON, comparison_rows, COMPARISON_FIELDS)
    write_csv(OUT_CONFLICTS, sorted(conflict_rows, key=lambda r: (
        {"HIGH": 0, "MED": 1, "LOW": 2}.get(r["severity"], 3),
        r["conflict_type"],
        r["canonical_name"] or "",
    )), CONFLICT_FIELDS)
    write_csv(
        OUT_KNOWN,
        [r for r in conflict_rows if r["severity"] == "HIGH"],
        CONFLICT_FIELDS,
    )
    write_csv(OUT_NOTATION, notation_rows, NOTATION_FIELDS)

    return {
        "curated_total": len(curated),
        "scrape_total": len(scrape_rows),
        "comparison_rows": len(comparison_rows),
        "conflicts_total": len(conflict_rows),
        "high": sum(1 for r in conflict_rows if r["severity"] == "HIGH"),
        "med": sum(1 for r in conflict_rows if r["severity"] == "MED"),
        "low": sum(1 for r in conflict_rows if r["severity"] == "LOW"),
        "by_type": _count_by(conflict_rows, "conflict_type"),
    }


def _count_by(rows: list[dict], key: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for r in rows:
        out[r[key]] = out.get(r[key], 0) + 1
    return out


def main() -> None:
    parser = argparse.ArgumentParser(
        description="QC the freestyle trick dictionary; emit comparison + conflict reports.",
    )
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--scraped-csv", default=str(DEFAULT_SCRAPE))
    args = parser.parse_args()

    db_path = Path(args.db)
    scrape_path = Path(args.scraped_csv)

    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        sys.exit(2)

    stats = run(db_path, scrape_path)

    print("trick-dictionary QC complete")
    print(f"  curated tricks            : {stats['curated_total']}")
    print(f"  footbag.org scraped rows  : {stats['scrape_total']}")
    print(f"  comparison rows emitted   : {stats['comparison_rows']}")
    print(f"  conflicts total           : {stats['conflicts_total']}  (HIGH {stats['high']} / MED {stats['med']} / LOW {stats['low']})")
    print("  by type:")
    for kind, n in sorted(stats["by_type"].items(), key=lambda kv: -kv[1]):
        print(f"    {kind:34s} {n}")
    print()
    print("output:")
    print(f"  {OUT_COMPARISON.relative_to(REPO_ROOT)}")
    print(f"  {OUT_CONFLICTS.relative_to(REPO_ROOT)}")
    print(f"  {OUT_KNOWN.relative_to(REPO_ROOT)}")
    print(f"  {OUT_NOTATION.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
