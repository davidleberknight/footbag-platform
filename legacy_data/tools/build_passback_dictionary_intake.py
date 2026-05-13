#!/usr/bin/env python3
"""PassBack dictionary intake — non-destructive source-evidence matcher.

Reads:
  - legacy_data/inputs/curated/tricks/passback-dicrionary.txt (240 rows; tab-separated)

Writes (staging-only; no DB mutation):
  - exploration/passback-intake/passback_trick_sources.csv
  - exploration/passback-intake/passback_source_links_staging.csv
  - exploration/passback-intake/passback_alias_candidates_staging.csv
  - exploration/passback-intake/passback_reports/matched_existing.csv
  - exploration/passback-intake/passback_reports/new_candidates.csv
  - exploration/passback-intake/passback_reports/alias_candidates.csv
  - exploration/passback-intake/passback_reports/conflicts.csv
  - exploration/passback-intake/passback_reports/needs_review.csv
  - exploration/passback-intake/passback_reports/glossary_terms.csv (placeholder; populated when glossary file arrives)

Read-only on DB. No commits. No DB writes. Deterministic output (stable sort).

Per PASSBACK_INTAKE_DESIGN.md §C (match-status rules).
"""
from __future__ import annotations

import csv
import re
import sqlite3
import sys
from pathlib import Path
from typing import Iterator

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "database" / "footbag.db"
PB_DICT = ROOT / "legacy_data" / "inputs" / "curated" / "tricks" / "passback-dicrionary.txt"
PB_DICT2 = ROOT / "legacy_data" / "inputs" / "curated" / "tricks" / "pb-dict2.txt"
PB_GLOSSARY = ROOT / "legacy_data" / "inputs" / "curated" / "tricks" / "passback-glossary.txt"
UX1_TOKEN_MATRIX = ROOT / "exploration" / "freestyle-notation-grammar" / "UX1_GLOSSARY_TOKEN_MATRIX.csv"
OUT_DIR = ROOT / "exploration" / "passback-intake"
REPORTS_DIR = OUT_DIR / "passback_reports"

PB_SOURCE_ID = "passback_dictionary"
PB_XSPORT_SOURCE_ID = "passback_xsport_map"
PB_GLOSSARY_SOURCE_ID = "passback_glossary"

# ─────────────────────────────────────────────────────────────────────────
# Output schemas
# ─────────────────────────────────────────────────────────────────────────

STAGING_FIELDS = [
    "source_file",
    "passback_primary_name",
    "passback_alternate_names",
    "passback_technical_name",
    "passback_uptime_component",
    "passback_downtime_component",
    "passback_dex_count",
    "passback_notes",
    "normalized_primary_name",
    "candidate_trick_slug",
    "match_status",
    "match_reason",
    "match_confidence",
    "passback_dex_count_vs_ifpa_adds",
    "review_status",
    "operator_notes",
]

SOURCE_LINKS_FIELDS = [
    "trick_slug",
    "source_id",
    "external_ref",
    "external_url",
    "asserted_adds",
    "asserted_notation",
    "asserted_category",
    "notes",
]

ALIAS_CANDIDATE_FIELDS = [
    "alias_slug",
    "alias_text",
    "trick_slug",
    "alias_type",
    "source_id",
    "notes",
    "safety_class",
]

GLOSSARY_FIELDS = [
    "term",
    "alternate_forms",
    "passback_section",
    "passback_explanation",
    "existing_glossary_anchor",
    "proposed_layer",
    "match_status",
    "review_status",
    "notes",
]

# ─────────────────────────────────────────────────────────────────────────
# Normalization helpers
# ─────────────────────────────────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Normalize a name for slug-style matching.

    Lowercase, strip punctuation except hyphens, collapse whitespace to single
    dash, strip leading/trailing dashes. Deterministic.
    """
    if not name:
        return ""
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9\s\-]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def split_primary_names(raw: str) -> tuple[str, list[str]]:
    """Split column-1 'Nickname(s) / Primary Name(s)' on commas.

    Returns (primary, alternates).
    """
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        return ("", [])
    return (parts[0], parts[1:])


# ─────────────────────────────────────────────────────────────────────────
# DB-state load (read-only)
# ─────────────────────────────────────────────────────────────────────────

def load_canonical_state(db_path: Path) -> dict:
    """Load slugs, canonical names, alias maps. Read-only."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        slugs: dict[str, dict] = {}
        for row in conn.execute("SELECT slug, canonical_name, adds, base_trick, trick_family FROM freestyle_tricks WHERE is_active=1"):
            # adds column is TEXT (per schema); coerce to int when possible, else None
            adds_raw = row["adds"]
            try:
                adds_int = int(adds_raw) if adds_raw not in (None, "", "modifier") else None
            except (ValueError, TypeError):
                adds_int = None
            slugs[row["slug"]] = {
                "slug": row["slug"],
                "canonical_name": row["canonical_name"] or "",
                "adds": adds_int,
                "base_trick": row["base_trick"] or "",
                "trick_family": row["trick_family"] or "",
            }

        alias_text_to_slug: dict[str, str] = {}
        alias_slug_to_slug: dict[str, str] = {}
        for row in conn.execute("SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases"):
            alias_text_to_slug[row["alias_text"].lower().strip()] = row["trick_slug"]
            alias_slug_to_slug[row["alias_slug"]] = row["trick_slug"]

        # Also build canonical_name → slug for normalized-canonical-name matching.
        canonical_name_to_slug: dict[str, str] = {}
        for slug, info in slugs.items():
            canonical_name_to_slug[info["canonical_name"].lower().strip()] = slug

        # Existing alias_slugs for collision-check.
        existing_alias_slugs = set(alias_slug_to_slug.keys())

        # §3.2 policy class — these rows accept dex_count_disagreement without conflict flag.
        policy_class_rows = {"nemesis", "jani-walker", "bullwhip"}

        return {
            "slugs": slugs,
            "alias_text_to_slug": alias_text_to_slug,
            "alias_slug_to_slug": alias_slug_to_slug,
            "canonical_name_to_slug": canonical_name_to_slug,
            "existing_alias_slugs": existing_alias_slugs,
            "policy_class_rows": policy_class_rows,
        }
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────
# Match-rule pipeline (per design §C)
# ─────────────────────────────────────────────────────────────────────────

def classify_row(pb_row: dict, state: dict) -> dict:
    """Apply match-rules in order; return staging-row dict."""
    raw_primary = pb_row["passback_primary_name"]
    normalized = normalize_name(raw_primary)

    slug = None
    rule = "no_match"
    confidence = "medium"

    # Rule 1: exact_slug
    if normalized and normalized in state["slugs"]:
        slug, rule, confidence = normalized, "exact_slug", "high"
    # Rule 2: exact_alias_text
    elif raw_primary.lower().strip() in state["alias_text_to_slug"]:
        slug = state["alias_text_to_slug"][raw_primary.lower().strip()]
        rule, confidence = "exact_alias_text", "high"
    # Rule 3: exact_alias_slug
    elif normalized in state["alias_slug_to_slug"]:
        slug = state["alias_slug_to_slug"][normalized]
        rule, confidence = "exact_alias_slug", "high"
    # Rule 4: normalized_canonical_name
    elif raw_primary.lower().strip() in state["canonical_name_to_slug"]:
        slug = state["canonical_name_to_slug"][raw_primary.lower().strip()]
        rule, confidence = "normalized_canonical", "high"
    # Rule 4b: relaxed normalization (hyphens stripped both sides; e.g. "Atomsmasher" -> "atom-smasher")
    elif normalized:
        compact = normalized.replace("-", "")
        for candidate_slug in state["slugs"]:
            if candidate_slug.replace("-", "") == compact:
                slug = candidate_slug
                rule, confidence = "compact_slug_match", "medium"
                break

    # Determine match_status
    if slug is not None:
        status = "matched_existing"
        # Rule 7: dex_count_disagreement check.
        # PassBack 'Dex Count' is the count of DEX flicks only; IFPA 'adds' includes dex+modifier+delay.
        # Baseline delta is NEGATIVE (PB dex_count < IFPA adds). Conflict fires when PB exceeds IFPA total.
        try:
            pb_dex = int(pb_row["passback_dex_count"]) if pb_row["passback_dex_count"] else None
        except ValueError:
            pb_dex = None
        ifpa_adds = state["slugs"].get(slug, {}).get("adds")
        delta = None
        if pb_dex is not None and ifpa_adds is not None:
            delta = pb_dex - ifpa_adds
            # Conflict only when PB dex_count exceeds IFPA total ADD (delta > 0) AND row is NOT §3.2 policy class.
            if delta > 0 and slug not in state["policy_class_rows"]:
                status = "conflict"
                rule = f"{rule}|dex_exceeds_adds"
    else:
        # No exact match — check rule 5 (alternate_name_alias)
        alt_match_slug = None
        for alt in pb_row["passback_alternate_names_list"]:
            alt_norm = normalize_name(alt)
            if alt.lower().strip() in state["alias_text_to_slug"]:
                alt_match_slug = state["alias_text_to_slug"][alt.lower().strip()]
                rule, confidence = "alternate_name_alias", "medium"
                break
            elif alt_norm in state["alias_slug_to_slug"]:
                alt_match_slug = state["alias_slug_to_slug"][alt_norm]
                rule, confidence = "alternate_name_alias", "medium"
                break
            elif alt_norm in state["slugs"]:
                alt_match_slug = alt_norm
                rule, confidence = "alternate_name_alias", "medium"
                break
        if alt_match_slug:
            slug = alt_match_slug
            status = "alias_candidate"
        else:
            # No match through any rule → new_candidate.
            # PassBack-vocab presence (Pdx./Symp./near/far) is recorded as metadata for curator,
            # not as a separate review-status trigger (would be too eager — PB vocab is house style).
            status, rule, confidence = "new_candidate", "no_match", "medium"
        delta = None

    # Review status
    if status == "matched_existing":
        review_status = "auto_ok"
    elif status in ("alias_candidate", "conflict", "needs_review"):
        review_status = "needs_review"
    else:  # new_candidate
        review_status = "needs_review"

    return {
        **pb_row,
        "normalized_primary_name": normalized,
        "candidate_trick_slug": slug or "",
        "match_status": status,
        "match_reason": rule,
        "match_confidence": confidence,
        "passback_dex_count_vs_ifpa_adds": "" if delta is None else delta,
        "review_status": review_status,
        "operator_notes": "",
    }


# ─────────────────────────────────────────────────────────────────────────
# Input reader
# ─────────────────────────────────────────────────────────────────────────

def read_passback_dictionary(path: Path) -> list[dict]:
    """Read tab-separated PassBack dictionary (passback-dicrionary.txt; 6 cols).

    Schema: Nickname(s) / Primary Name(s) | Technical Name(s) / Description |
            Uptime Component | Downtime Component | Dex Count | Notes
    Preserve all raw fields.
    """
    if not path.exists():
        print(f"missing PassBack dictionary: {path}", file=sys.stderr)
        return []
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for raw in reader:
            primary_raw = raw.get("Nickname(s) / Primary Name(s)", "") or ""
            primary, alternates = split_primary_names(primary_raw)
            rows.append({
                "source_file": "passback-dicrionary.txt",
                "passback_primary_name": primary,
                "passback_alternate_names": "|".join(alternates),
                "passback_alternate_names_list": alternates,  # internal
                "passback_technical_name": raw.get("Technical Name(s) / Description", "") or "",
                "passback_uptime_component": raw.get("Uptime Component", "") or "",
                "passback_downtime_component": raw.get("Downtime Component", "") or "",
                "passback_dex_count": raw.get("Dex Count", "") or "",
                "passback_notes": raw.get("Notes", "") or "",
            })
    return rows


def read_ux1_glossary_terms() -> dict[str, str]:
    """Read UX1_GLOSSARY_TOKEN_MATRIX.csv → {normalized_token: short_label}.

    Used to cross-reference glossary terms against the existing token inventory.
    """
    if not UX1_TOKEN_MATRIX.exists():
        return {}
    out: dict[str, str] = {}
    with UX1_TOKEN_MATRIX.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            token = row.get("token", "").strip().lower()
            if token:
                out[token] = row.get("short_label", "")
    return out


def read_passback_glossary(path: Path) -> list[dict]:
    """Read passback-glossary.txt; extract terms + definitions.

    Structure: TOC (lines 1-83) → Body sections (85-432) → Index (433-end).

    Strategy:
    1. Parse Index section → list of term-lines (comma-separated alternate forms).
    2. Walk body sections; track current section header per paragraph.
    3. For each index term, find first occurrence in body; capture surrounding
       section + paragraph as the term's definition context.
    """
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")

    # Identify Index section start
    index_start = None
    # Find the second occurrence of a standalone "Index" line (first is in TOC)
    index_hits = [i for i, L in enumerate(lines) if L.strip() == "Index"]
    if len(index_hits) >= 2:
        index_start = index_hits[1]
    elif index_hits:
        # Fall back: only one "Index" header found
        index_start = index_hits[0]
    if index_start is None:
        return []

    # Extract index terms (one entry per non-blank line after the index header)
    index_lines = [L.strip() for L in lines[index_start + 1:] if L.strip()]

    # Identify section headers within the body (lines before Index, ≤ 5 words, no period at end,
    # not a TOC entry with page numbers)
    # Use the TOC at the top (lines 4-82) as the authoritative section-header list.
    toc_section_headers: list[str] = []
    # Section names appear on lines like "Equipment        2" or "ADD System Controversy        9"
    for L in lines[:index_start]:
        m = re.match(r"^([A-Z][^\t]*?)\s+(\d+)\s*$", L.strip())
        if m:
            header = m.group(1).strip()
            # Filter out anything that looks like a definition (has a comma followed by lowercase)
            if header and len(header.split()) <= 6:
                toc_section_headers.append(header)

    # Walk body; track section per line index
    body_lines = lines[:index_start]
    line_section: list[str] = []
    current_section = ""
    section_set = set(toc_section_headers)
    for L in body_lines:
        stripped = L.strip()
        if stripped in section_set:
            current_section = stripped
        line_section.append(current_section)

    # For each index term, find first occurrence in body + extract context
    glossary_entries: list[dict] = []
    for term_line in index_lines:
        # Split comma-separated alternate forms
        forms = [p.strip() for p in term_line.split(",") if p.strip()]
        primary = forms[0]
        alternates = forms[1:]
        # Search body lines for first occurrence of primary term (case-insensitive)
        primary_lower = primary.lower()
        found_section = ""
        found_paragraph = ""
        for i, L in enumerate(body_lines):
            if primary_lower in L.lower():
                found_section = line_section[i]
                # Capture this line + a few surrounding lines for definition context
                # Find paragraph boundaries (blank line on either side)
                start = i
                while start > 0 and body_lines[start - 1].strip():
                    start -= 1
                end = i
                while end < len(body_lines) - 1 and body_lines[end + 1].strip():
                    end += 1
                paragraph_lines = [body_lines[j].strip() for j in range(start, end + 1) if body_lines[j].strip()]
                found_paragraph = " ".join(paragraph_lines)
                break
        glossary_entries.append({
            "term": primary,
            "alternate_forms": "|".join(alternates),
            "passback_section": found_section,
            "passback_explanation": found_paragraph[:1500],  # cap for CSV readability
            "_term_lower": primary_lower,  # internal
        })
    return glossary_entries


def classify_glossary_term(entry: dict, ux1_terms: dict[str, str]) -> dict:
    """Cross-reference a glossary term against UX1 token inventory."""
    term_lower = entry["_term_lower"]
    matched = None
    # Try exact match on first alternate-form variant against UX1 tokens.
    candidates = [entry["term"].lower()] + [f.strip().lower() for f in entry["alternate_forms"].split("|") if f.strip()]
    for cand in candidates:
        if cand in ux1_terms:
            matched = cand
            break
        # Try the abbreviation/acronym form (e.g. "BOD" within "Body (component), BOD (ADD category)")
        for tok in ux1_terms:
            if tok and tok == cand:
                matched = tok
                break
        if matched:
            break

    if matched:
        status = "existing_term"
        review_status = "auto_ok"
        anchor = matched
        notes = f"matches UX1 token: {ux1_terms[matched]}"
    else:
        status = "new_term"
        review_status = "needs_review"
        anchor = ""
        notes = "no UX1 token match; candidate for educational glossary layer"

    return {
        "term": entry["term"],
        "alternate_forms": entry["alternate_forms"],
        "passback_section": entry["passback_section"],
        "passback_explanation": entry["passback_explanation"],
        "existing_glossary_anchor": anchor,
        "proposed_layer": "educational",
        "match_status": status,
        "review_status": review_status,
        "notes": notes,
    }


def read_passback_xsport(path: Path) -> list[dict]:
    """Read PassBack cross-sport map (pb-dict2.txt; 3 cols).

    Schema: Freestyle Footbag Trick/Concept | Freestyle Football Trick/Concept | Notes

    The footbag column populates passback_primary_name; the football column carries
    cross-sport equivalent as 'futbol:<name>' in passback_alternate_names so the
    matcher can route it through the standard rule pipeline. Other PB-dict-1 columns
    (uptime/downtime/dex_count) are empty for these rows.
    """
    if not path.exists():
        # Not an error — pb-dict2 is optional secondary source
        return []
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for raw in reader:
            footbag = (raw.get("Freestyle Footbag Trick/Concept", "") or "").strip()
            football = (raw.get("Freestyle Football Trick/Concept", "") or "").strip()
            notes = (raw.get("Notes", "") or "").strip()
            if not footbag:
                continue  # skip rows without a footbag entry (e.g. operator-only rows)
            # Split footbag side on " / " to capture multi-name forms like "Eggbeater (Illusioning Legover)"
            # The parenthetical here is a structural decomposition note, NOT an alternate name;
            # we preserve it in technical_name slot since it functions like PB-dict-1's technical-description.
            # Multi-name on " / " is a real alternate-name pattern ("Eggbeater / Atomic Legover" style).
            primary_parts = [p.strip() for p in footbag.split(" / ") if p.strip()]
            primary = primary_parts[0]
            alternates = primary_parts[1:]
            # Football column = cross-sport equivalent; prefix with 'futbol:' so matcher
            # doesn't accidentally classify a football term as an IFPA alias.
            football_marker = f"futbol:{football}" if football else ""
            if football_marker:
                alternates.append(football_marker)
            # Extract parenthetical from primary as technical_name when present
            tech_name = ""
            paren_match = re.search(r"\(([^)]+)\)\s*$", primary)
            if paren_match:
                tech_name = paren_match.group(1).strip()
                primary = re.sub(r"\s*\([^)]+\)\s*$", "", primary).strip()
            rows.append({
                "source_file": "pb-dict2.txt",
                "passback_primary_name": primary,
                "passback_alternate_names": "|".join(alternates),
                "passback_alternate_names_list": alternates,  # internal
                "passback_technical_name": tech_name,
                "passback_uptime_component": "",
                "passback_downtime_component": "",
                "passback_dex_count": "",
                "passback_notes": notes,
            })
    return rows


# ─────────────────────────────────────────────────────────────────────────
# Staging-emitter helpers
# ─────────────────────────────────────────────────────────────────────────

def emit_source_link(row: dict, state: dict) -> dict | None:
    """For matched_existing or conflict rows, build a staging source-link record."""
    if row["match_status"] not in ("matched_existing", "conflict"):
        return None
    slug = row["candidate_trick_slug"]
    if not slug:
        return None
    ifpa_adds = state["slugs"].get(slug, {}).get("adds")
    try:
        pb_dex = int(row["passback_dex_count"]) if row["passback_dex_count"] else None
    except ValueError:
        pb_dex = None
    asserted_adds = pb_dex if pb_dex is not None and pb_dex != ifpa_adds else None
    notation_parts = []
    if row["passback_technical_name"]:
        notation_parts.append(f"pb_tech={row['passback_technical_name']}")
    if row["passback_uptime_component"]:
        notation_parts.append(f"uptime={row['passback_uptime_component']}")
    if row["passback_downtime_component"]:
        notation_parts.append(f"downtime={row['passback_downtime_component']}")
    asserted_notation = "; ".join(notation_parts) if notation_parts else None
    notes_parts = []
    if row["passback_dex_count"]:
        notes_parts.append(f"pb_dex_count={row['passback_dex_count']}")
    if row["passback_notes"]:
        notes_parts.append(f"pb_notes={row['passback_notes']}")
    if row["match_status"] == "conflict":
        notes_parts.append(f"conflict_delta={row['passback_dex_count_vs_ifpa_adds']}")
    notes = " | ".join(notes_parts) if notes_parts else None
    return {
        "trick_slug": slug,
        "source_id": PB_SOURCE_ID,
        "external_ref": row["passback_primary_name"],
        "external_url": "",
        "asserted_adds": "" if asserted_adds is None else asserted_adds,
        "asserted_notation": asserted_notation or "",
        "asserted_category": "",
        "notes": notes or "",
    }


def emit_alias_candidate(row: dict, state: dict) -> dict | None:
    """For alias_candidate rows, build a staging alias-row record with safety class."""
    if row["match_status"] != "alias_candidate":
        return None
    slug = row["candidate_trick_slug"]
    if not slug:
        return None
    # Determine which name to propose as alias.
    primary_normalized = normalize_name(row["passback_primary_name"])
    alias_slug = primary_normalized
    alias_text = row["passback_primary_name"]
    if alias_slug in state["existing_alias_slugs"]:
        # Try alternate names
        for alt in row["passback_alternate_names_list"]:
            alt_slug = normalize_name(alt)
            if alt_slug and alt_slug not in state["existing_alias_slugs"]:
                alias_slug = alt_slug
                alias_text = alt
                break

    # Safety class determination (per design §A.4)
    canonical_name = state["slugs"].get(slug, {}).get("canonical_name", "").lower()
    if not alias_slug:
        safety = "blocked"
    elif alias_slug in state["existing_alias_slugs"]:
        safety = "blocked"
    elif alias_text.lower().strip() == canonical_name:
        safety = "blocked"  # alias same as canonical name
    else:
        # Round-trip check: passback_dex_count agrees with ifpa.adds?
        try:
            pb_dex = int(row["passback_dex_count"]) if row["passback_dex_count"] else None
        except ValueError:
            pb_dex = None
        ifpa_adds = state["slugs"].get(slug, {}).get("adds")
        if pb_dex is not None and ifpa_adds is not None and pb_dex != ifpa_adds:
            safety = "needs_review"  # dex disagreement
        else:
            safety = "safe"

    src_id = PB_XSPORT_SOURCE_ID if row.get("source_file") == "pb-dict2.txt" else PB_SOURCE_ID
    return {
        "alias_slug": alias_slug,
        "alias_text": alias_text,
        "trick_slug": slug,
        "alias_type": "common",
        "source_id": src_id,
        "notes": f"pb_tech={row['passback_technical_name']}; pb_dex={row['passback_dex_count']}; source={row.get('source_file', '')}",
        "safety_class": safety,
    }


# ─────────────────────────────────────────────────────────────────────────
# Output writers
# ─────────────────────────────────────────────────────────────────────────

def write_csv(rows: list[dict], path: Path, fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, quoting=csv.QUOTE_ALL)
        w.writeheader()
        for row in rows:
            # Drop internal-only keys (start with _)
            cleaned = {k: row.get(k, "") for k in fields}
            w.writerow(cleaned)


def write_report(rows: list[dict], path: Path) -> None:
    if not rows:
        # Write empty file with header for determinism.
        write_csv([], path, STAGING_FIELDS)
        return
    write_csv(rows, path, STAGING_FIELDS)


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main() -> int:
    if not DB.exists():
        print(f"missing DB: {DB}", file=sys.stderr)
        return 2
    if not PB_DICT.exists():
        print(f"missing PassBack dictionary: {PB_DICT}", file=sys.stderr)
        return 2

    state = load_canonical_state(DB)
    pb_rows = read_passback_dictionary(PB_DICT)
    pb_xsport_rows = read_passback_xsport(PB_DICT2)
    all_rows = pb_rows + pb_xsport_rows
    classified = [classify_row(r, state) for r in all_rows]

    # Stable sort by source_file then passback_primary_name for determinism.
    classified.sort(key=lambda r: (r["source_file"], r["passback_primary_name"].lower()))

    # Primary staging CSV — drop internal "_list" field.
    primary = [{k: r.get(k, "") for k in STAGING_FIELDS} for r in classified]
    write_csv(primary, OUT_DIR / "passback_trick_sources.csv", STAGING_FIELDS)

    # Source-link staging
    source_links = [
        emit_source_link(r, state) for r in classified
        if r["match_status"] in ("matched_existing", "conflict")
    ]
    source_links = [s for s in source_links if s]
    write_csv(source_links, OUT_DIR / "passback_source_links_staging.csv", SOURCE_LINKS_FIELDS)

    # Alias-candidate staging
    alias_candidates = [
        emit_alias_candidate(r, state) for r in classified
        if r["match_status"] == "alias_candidate"
    ]
    alias_candidates = [a for a in alias_candidates if a]
    write_csv(alias_candidates, OUT_DIR / "passback_alias_candidates_staging.csv", ALIAS_CANDIDATE_FIELDS)

    # Reports by status
    by_status: dict[str, list[dict]] = {
        "matched_existing": [],
        "new_candidate": [],
        "alias_candidate": [],
        "conflict": [],
        "needs_review": [],
    }
    for r in classified:
        by_status[r["match_status"]].append(r)
    write_report(by_status["matched_existing"], REPORTS_DIR / "matched_existing.csv")
    write_report(by_status["new_candidate"], REPORTS_DIR / "new_candidates.csv")
    write_report(by_status["alias_candidate"], REPORTS_DIR / "alias_candidates.csv")
    write_report(by_status["conflict"], REPORTS_DIR / "conflicts.csv")
    write_report(by_status["needs_review"], REPORTS_DIR / "needs_review.csv")

    # Glossary processing — read passback-glossary.txt + emit staging CSV + report
    ux1_terms = read_ux1_glossary_terms()
    glossary_entries = read_passback_glossary(PB_GLOSSARY)
    glossary_staged = [classify_glossary_term(e, ux1_terms) for e in glossary_entries]
    # Stable sort by term for determinism
    glossary_staged.sort(key=lambda r: r["term"].lower())
    write_csv(glossary_staged, OUT_DIR / "passback_glossary_staging.csv", GLOSSARY_FIELDS)
    write_csv(glossary_staged, REPORTS_DIR / "glossary_terms.csv", GLOSSARY_FIELDS)

    # Summary
    print(f"PassBack dictionary intake — {len(classified)} rows processed")
    print(f"  passback-dicrionary.txt   {len(pb_rows):>4d} rows")
    print(f"  pb-dict2.txt              {len(pb_xsport_rows):>4d} rows")
    print(f"  passback-glossary.txt     {len(glossary_staged):>4d} terms")
    print()
    for status, rs in by_status.items():
        print(f"  {status:25s} {len(rs):>4d}")
    print(f"  source_links staged       {len(source_links):>4d}")
    print(f"  alias_candidates staged   {len(alias_candidates):>4d}")
    print()
    safe_aliases = sum(1 for a in alias_candidates if a["safety_class"] == "safe")
    print(f"  alias_candidates by safety_class:")
    for sc in ("safe", "needs_review", "blocked"):
        n = sum(1 for a in alias_candidates if a["safety_class"] == sc)
        print(f"    {sc:14s} {n:>3d}")
    print(f"\nOutputs at: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
