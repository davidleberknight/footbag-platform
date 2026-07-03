#!/usr/bin/env python3
"""
build_freestyle_dict_coverage_diff.py

Frozen with the legacy_data tree: every file input it reads is a legacy_data
artifact (the retired footbag.org scrape twin, the trick-dictionary comparison
QC output, the curated external-name mappings), so it is not part of the living
freestyle pipeline under freestyle/ and deliberately stays here.

Reconciliation/audit report — what external freestyle sources contain vs how
those tricks map into our canonical ontology.

Read-only. Does not write to the DB. Does not promote any rows.

Inputs:
  database/footbag.db
    freestyle_tricks
    freestyle_trick_aliases
    freestyle_trick_modifiers
    freestyle_media_links
  legacy_data/out/scraped_footbag_moves.csv     (footbag.org scrape)
  legacy_data/out/trick_dictionary_comparison.csv  (existing QC output to enrich)
  legacy_data/inputs/curated/tricks/external_name_mappings.csv

Outputs:
  legacy_data/reports/freestyle_dict_coverage_diff.csv
  legacy_data/reports/freestyle_dict_coverage_diff.md
  legacy_data/reports/freestyle_dict_coverage_diff_priority.csv

Footbagmoves.com corpus is intentionally NOT loaded; if its CSV later lands at
legacy_data/out/scraped_footbagmoves.csv (or similar), this script can be
extended to produce a multi-source matrix.
"""

import csv
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "database" / "footbag.db"
SCRAPE_CSV = REPO_ROOT / "legacy_data" / "out" / "scraped_footbag_moves.csv"
COMPARISON_CSV = REPO_ROOT / "legacy_data" / "out" / "trick_dictionary_comparison.csv"
NAME_MAPPINGS_CSV = REPO_ROOT / "legacy_data" / "inputs" / "curated" / "tricks" / "external_name_mappings.csv"

OUT_DIR = REPO_ROOT / "legacy_data" / "reports"
OUT_CSV = OUT_DIR / "freestyle_dict_coverage_diff.csv"
OUT_MD = OUT_DIR / "freestyle_dict_coverage_diff.md"
OUT_PRIORITY = OUT_DIR / "freestyle_dict_coverage_diff_priority.csv"


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def load_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    tricks = {}
    for r in conn.execute(
        "SELECT slug, canonical_name, adds, base_trick, trick_family, category, "
        "review_status, is_active, notation, description FROM freestyle_tricks"
    ):
        tricks[r["slug"]] = dict(r)
    aliases = {}
    for r in conn.execute(
        "SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases"
    ):
        aliases[r["alias_slug"]] = dict(r)
    modifiers = set()
    for r in conn.execute("SELECT slug FROM freestyle_trick_modifiers"):
        modifiers.add(r["slug"])
    media_slugs = set()
    for r in conn.execute(
        "SELECT DISTINCT entity_id FROM freestyle_media_links WHERE entity_type='trick'"
    ):
        media_slugs.add(r[0])
    # Set of normalized record-trick names so external rows can flag whether the
    # same string appears as a passback-record. Records are a strong canonical
    # signal — they prove community-grade competitive use.
    record_name_set = set()
    for r in conn.execute(
        "SELECT DISTINCT trick_name FROM freestyle_records WHERE trick_name IS NOT NULL"
    ):
        if r[0]:
            record_name_set.add(r[0].strip().lower())
    conn.close()
    return tricks, aliases, modifiers, media_slugs, record_name_set


def load_comparison_csv():
    rows = []
    with COMPARISON_CSV.open() as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def load_external_name_mappings():
    """Return {slugify(external_name): mapping_row}."""
    out = {}
    if not NAME_MAPPINGS_CSV.exists():
        return out
    with NAME_MAPPINGS_CSV.open() as f:
        reader = csv.DictReader(f)
        for r in reader:
            key = slugify(r.get("external_name") or "")
            if key:
                out[key] = r
    return out


def load_scraped_descriptions():
    """Return {showmove_id: {description, alt_name, family_hint, category_hint, ...}}."""
    out = {}
    if not SCRAPE_CSV.exists():
        return out
    with SCRAPE_CSV.open() as f:
        reader = csv.DictReader(f)
        for r in reader:
            sid = r.get("showmove_id", "").strip()
            if sid:
                out[sid] = r
    return out


def parse_adds(value):
    if value is None:
        return None
    s = str(value).strip()
    if s == "" or s == "modifier":
        return None
    try:
        n = int(s)
        return n if n >= 0 else None
    except ValueError:
        return None


def attempt_match(
    external_name: str,
    showmove_id: str,
    tricks: dict,
    aliases: dict,
    modifiers: set,
    name_mappings: dict,
):
    """Return (canonical_slug, match_type, match_layer, note) or all-None for no match.

    Layers:
      1. exact canonical slug (slugified external_name == any active slug)
      2. external_name_mappings.csv curated registry
      3. alias-table lookup
      4. pending-row match (is_active=0)
      5. structural-alias inference (multi-token name where first token is a
         modifier slug, last token is an active slug; flagged but not auto-matched)
    """
    ext_slug = slugify(external_name)
    if not ext_slug:
        return None, None, None, None

    # Layer 1: exact canonical slug
    if ext_slug in tricks:
        row = tricks[ext_slug]
        if row["is_active"] == 1:
            return ext_slug, "exact canonical", 1, None
        else:
            return ext_slug, "pending candidate", 4, "matches a pending row"

    # Layer 2: curated external_name_mappings registry
    mapping = name_mappings.get(ext_slug)
    if mapping:
        slug = mapping.get("canonical_slug", "").strip()
        mtype = mapping.get("match_type", "").strip()
        if slug and slug in tricks:
            return slug, f"alias (registry: {mtype})", 2, mapping.get("notes", "")

    # Layer 3: alias table
    alias = aliases.get(ext_slug)
    if alias:
        target = alias["trick_slug"]
        if target in tricks:
            return target, "alias", 3, None

    # Layer 4: pending-row match by alternate slug forms
    # (already covered by layer 1 with is_active=0 path; keep as no-op)

    # Layer 5: structural-alias inference (informational, not a match)
    tokens = ext_slug.split("-")
    if len(tokens) >= 2:
        # Check if first 1-2 tokens are modifier slugs and final 1-2 tokens are an active slug
        for split_at in (1, 2):
            if split_at >= len(tokens):
                continue
            modifier_part = tokens[:split_at]
            base_part = "-".join(tokens[split_at:])
            if all(m in modifiers for m in modifier_part) and base_part in tricks:
                if tricks[base_part]["is_active"] == 1:
                    return base_part, "likely structural alias", 5, (
                        f"name decomposes as {'+'.join(modifier_part)} + {base_part}"
                    )

    return None, None, None, None


def classify_unmatched(external_name: str, tags_summary: str, alt_name: str) -> str:
    """Heuristic classification for unmatched rows — describes SHAPE only.
    Strength of evidence is scored separately by compute_evidence_score().
    """
    name_lower = external_name.lower()
    tags = tags_summary.lower() if tags_summary else ""
    alt = alt_name.lower() if alt_name else ""

    if "[uns]" in tags:
        return "likely weak/unusual residue"
    if "kick" in name_lower and ("[bod]" in tags or "[dex]" in tags):
        if "[bod]" in tags and "[dex]" not in tags:
            return "likely body variant (kick)"
        return "likely kick variant (body+dex)"
    if alt:
        # If alt_name is a structural decomposition (multi-word, contains modifier-like prefixes)
        return "likely structural alias / decomposition (alt-name documented)"
    if "[bod]" in tags and "[dex]" in tags:
        return "likely body+dex compound"
    if "[bod]" in tags:
        return "likely body variant"
    if " " in name_lower or "-" in name_lower:
        return "likely compound"
    return "likely canonical candidate"


# Evidence-score weights. Tuned so that an external row with Jobs notation +
# description + records lands above any single-signal row, and a name-only
# row (no notation, no description, no records, no media, no alt-name) lands
# in the residue tier alongside [uns]-tagged entries.
EV_RECORDS = 4         # competition records — strongest signal
EV_NOTATION = 3        # Jobs notation — strong structural signal
EV_DESCRIPTION = 2     # community-grade prose — recognized identity
EV_MEDIA = 2           # canonical-side media coverage — taught/demonstrated
EV_STRUCTURAL = 2      # name decomposes via known modifier+base
EV_ALT_NAME = 1        # alt-name documented — decomposition recorded
EV_CLEAN_ADD = 1       # parseable numeric ADD — minimal but non-zero signal
EV_UNS_PENALTY = -3    # fb.org [uns] tag — its own residue bucket


def detect_structural_relation(
    external_slug: str,
    tricks: dict,
    modifiers: set,
) -> bool:
    """Return True if the external slug decomposes as <modifier(s)> + <active canonical>.
    Mirrors the matcher's layer-5 logic but returns boolean only (the matcher
    already captures the full match in canonical_slug when this is true; for
    unmatched rows this acts as an evidence-quality signal independent of
    whether we chose to surface the match).
    """
    if not external_slug:
        return False
    tokens = external_slug.split("-")
    if len(tokens) < 2:
        return False
    for split_at in (1, 2):
        if split_at >= len(tokens):
            continue
        modifier_part = tokens[:split_at]
        base_part = "-".join(tokens[split_at:])
        if all(m in modifiers for m in modifier_part) and base_part in tricks:
            if tricks[base_part]["is_active"] == 1:
                return True
    return False


def compute_evidence_score(
    has_notation: bool,
    has_description: bool,
    has_records: bool,
    has_media: bool,
    has_alt_name: bool,
    has_clean_add: bool,
    has_structural_relation: bool,
    has_uns_tag: bool,
) -> tuple[int, list[str]]:
    """Numeric quality score for an external row, plus a list of contributing
    reasons. Higher = stronger candidate. Negative scores indicate residue."""
    score = 0
    reasons: list[str] = []
    if has_records:
        score += EV_RECORDS
        reasons.append(f"records (+{EV_RECORDS})")
    if has_notation:
        score += EV_NOTATION
        reasons.append(f"notation (+{EV_NOTATION})")
    if has_description:
        score += EV_DESCRIPTION
        reasons.append(f"description (+{EV_DESCRIPTION})")
    if has_media:
        score += EV_MEDIA
        reasons.append(f"media (+{EV_MEDIA})")
    if has_structural_relation:
        score += EV_STRUCTURAL
        reasons.append(f"structural-relation (+{EV_STRUCTURAL})")
    if has_alt_name:
        score += EV_ALT_NAME
        reasons.append(f"alt-name (+{EV_ALT_NAME})")
    if has_clean_add:
        score += EV_CLEAN_ADD
        reasons.append(f"clean-ADD (+{EV_CLEAN_ADD})")
    if has_uns_tag:
        score += EV_UNS_PENALTY
        reasons.append(f"[uns]-tag ({EV_UNS_PENALTY})")
    return score, reasons


MULTIPLICITY_PREFIXES = [
    "quintuple",
    "quadruple",
    "triple",
    "double",
]


def detect_multiplicity(
    external_name: str,
    tricks: dict,
    aliases: dict,
) -> dict | None:
    """Detect whether `external_name` is a productive-multiplicity pattern.

    Returns None when the name doesn't start with a recognized multiplicity
    prefix. Otherwise returns a dict with:
      multiplicity_prefix      — 'Double' / 'Triple' / 'Quadruple' / 'Quintuple'
      multiplicity_base_name   — phrase after the prefix
      multiplicity_base_canonical — slug if base resolves canonically, else ''
      base_resolution          — 'canonical' / 'alias' / 'none'
      multiplicity_note        — pre-shaped human-readable note

    Per Red pt3: "Double" / "Triple" / etc. typically describe repeated
    dexterity or body-spin events, not a stabilized community-fixed name.
    Detection is informational; rows are NOT automatically demoted.
    """
    name_lower = external_name.lower().strip()
    matched_prefix = None
    for prefix in MULTIPLICITY_PREFIXES:
        if name_lower.startswith(prefix + " "):
            matched_prefix = prefix
            break
    if matched_prefix is None:
        return None

    base_phrase = external_name[len(matched_prefix):].strip()
    base_slug = slugify(base_phrase)
    base_canonical = ""
    base_resolution = "none"
    if base_slug in tricks and tricks[base_slug]["is_active"] == 1:
        base_canonical = base_slug
        base_resolution = "canonical"
    elif base_slug in aliases:
        target = aliases[base_slug].get("trick_slug", "")
        if target in tricks:
            base_canonical = target
            base_resolution = "alias"

    if base_resolution == "canonical":
        note = f"Base '{base_phrase}' is an active canonical (`{base_canonical}`); '{matched_prefix}' is a productive count-prefix."
    elif base_resolution == "alias":
        note = f"Base '{base_phrase}' resolves via alias to canonical (`{base_canonical}`); '{matched_prefix}' is a productive count-prefix."
    else:
        note = f"Base '{base_phrase}' does NOT resolve to a canonical or alias; multiplicity prefix may not be productive here."

    return {
        "multiplicity_prefix": matched_prefix.capitalize(),
        "multiplicity_base_name": base_phrase,
        "multiplicity_base_canonical": base_canonical,
        "base_resolution": base_resolution,
        "multiplicity_note": note,
    }


def evidence_to_priority_rank(score: int) -> int:
    """Map a numeric evidence score to the existing 0..5 priority rank scale.

    Tier boundaries chosen to match adjudication intent:
      - Whirr (records + notation + description + clean ADD = 10) → rank 5
      - Triage (notation + description + clean ADD = 6) → rank 4
      - Triple ATW (notation + description + structural-relation? + clean ADD)
        → rank 3 or 4 depending on structural relation detection
      - Dragon/Probe/Wrap (clean ADD only = 1) → rank 1
      - [uns] residue (clean ADD - [uns] = -2) → rank 0
    """
    if score >= 8:
        return 5
    if score >= 6:
        return 4
    if score >= 4:
        return 3
    if score >= 2:
        return 2
    if score >= 0:
        return 1
    return 0


def determine_ontology_status(
    canonical_slug: str | None, tricks: dict
) -> str:
    if canonical_slug is None:
        return "external-only"
    row = tricks.get(canonical_slug)
    if row is None:
        return "external-only"
    if row["is_active"] == 1:
        return "active canonical"
    if row["review_status"] == "pending":
        return "pending"
    return "deferred"


def main():
    if not DB_PATH.exists():
        print(f"DB not found: {DB_PATH}", file=sys.stderr)
        return 1
    if not COMPARISON_CSV.exists():
        print(f"Comparison CSV not found (run script 22 first): {COMPARISON_CSV}", file=sys.stderr)
        return 1

    tricks, aliases, modifiers, media_slugs, record_name_set = load_db()
    comparison = load_comparison_csv()
    name_mappings = load_external_name_mappings()
    scraped = load_scraped_descriptions()

    # Filter to rows where the external source has the row (in_footbag_org=1).
    external_rows = [r for r in comparison if r.get("in_footbag_org") == "1"]

    enriched = []
    counters = Counter()
    classification_counter = Counter()
    media_yes = 0
    media_no = 0
    unmatched_examples = []
    structural_examples = []
    rejected_examples: list[dict] = []  # placeholder for future rejected registry

    for r in external_rows:
        ext_name = r.get("concept_name", "").strip()
        showmove_id = r.get("footbag_showmove_id", "").strip()
        scraped_row = scraped.get(showmove_id, {})
        ext_notation = r.get("footbag_notation", "").strip()
        ext_description = scraped_row.get("description", "").strip()
        tags_summary = scraped_row.get("tags_summary", "").strip()
        alt_name = scraped_row.get("alt_name", "").strip()
        ext_adds_raw = r.get("footbag_adds", "").strip()
        ext_slug = slugify(ext_name)

        canonical_slug, match_type, match_layer, match_note = attempt_match(
            ext_name, showmove_id, tricks, aliases, modifiers, name_mappings
        )
        ontology_status = determine_ontology_status(canonical_slug, tricks)

        # Media presence — check both canonical-side AND external-side media.
        # An unmatched external trick can also "have media" if a sidecar/asset
        # exists keyed by its slug, even without a canonical row yet.
        canonical_has_media = bool(canonical_slug) and canonical_slug in media_slugs
        external_slug_has_media = ext_slug in media_slugs
        media_present_bool = canonical_has_media or external_slug_has_media
        media_present = "yes" if media_present_bool else "no"
        if media_present == "yes":
            media_yes += 1
        else:
            media_no += 1

        expert_reviewed = ""
        if canonical_slug and canonical_slug in tricks:
            rs = tricks[canonical_slug]["review_status"]
            expert_reviewed = "yes" if rs == "expert_reviewed" else rs

        # Evidence-quality signals (independent of match outcome).
        has_notation = bool(ext_notation)
        has_description = bool(ext_description)
        has_records = ext_name.strip().lower() in record_name_set
        has_alt_name = bool(alt_name)
        has_clean_add = parse_adds(ext_adds_raw) is not None
        has_structural_relation = detect_structural_relation(ext_slug, tricks, modifiers)
        has_uns_tag = "[uns]" in (tags_summary or "").lower()

        # Productive-multiplicity detection — informational; does NOT demote
        # priority. Per Red pt3: "Double / Triple" describes repeated events;
        # only a stabilized community-fixed name earns canonical status.
        mult = detect_multiplicity(ext_name, tricks, aliases)
        is_productive_multiplicity = mult is not None
        mult_prefix = mult["multiplicity_prefix"] if mult else ""
        mult_base_name = mult["multiplicity_base_name"] if mult else ""
        mult_note_base = mult["multiplicity_note"] if mult else ""
        # Augment the note when evidence is high — flag for adjudication
        # rather than auto-promotion.
        mult_note = mult_note_base
        if is_productive_multiplicity and (has_records or (has_notation and has_description)):
            mult_note = (
                f"{mult_note_base} — High evidence, but productive multiplicity "
                "pattern; requires named-identity adjudication."
            )

        evidence_score, evidence_reasons = compute_evidence_score(
            has_notation,
            has_description,
            has_records,
            media_present_bool,
            has_alt_name,
            has_clean_add,
            has_structural_relation,
            has_uns_tag,
        )

        # If unmatched, classify shape (independent of evidence score).
        classification = ""
        if canonical_slug is None:
            classification = classify_unmatched(ext_name, tags_summary, alt_name)
            classification_counter[classification] += 1

        # Review-needed flag. Productive-multiplicity patterns get their own
        # review lane (overrides candidate-review / structural-alias-review)
        # so adjudicators can apply the named-identity test specifically.
        review_needed = ""
        adds_conflict = r.get("adds_conflict", "0") == "1"
        if canonical_slug is None and is_productive_multiplicity:
            review_needed = "productive-multiplicity-review"
        elif canonical_slug is None and not has_uns_tag:
            review_needed = "candidate-review"
        elif adds_conflict:
            review_needed = "ADD-disagreement"
        elif match_type and "structural alias" in match_type:
            review_needed = "structural-alias-review"

        notes_parts = []
        if r.get("notes"):
            notes_parts.append(r["notes"])
        if match_note:
            notes_parts.append(match_note)
        notes = "; ".join(p for p in notes_parts if p)

        out_row = {
            "source": "footbag.org",
            "external_name": ext_name,
            "external_slug": ext_slug,
            "external_ADD": ext_adds_raw,
            "external_notation": ext_notation,
            "external_description": ext_description,
            "external_family": r.get("footbag_family_hint", "").strip(),
            "external_category": r.get("footbag_category_hint", "").strip(),
            "external_alt_name": alt_name,
            "external_url": r.get("footbag_url", "").strip(),
            "external_showmove_id": showmove_id,
            "canonical_match": "yes" if canonical_slug else "no",
            "canonical_slug": canonical_slug or "",
            "match_type": match_type or "no match",
            "match_layer": str(match_layer) if match_layer else "",
            "ontology_status": ontology_status,
            "expert_reviewed": expert_reviewed,
            "media_present": media_present,
            "has_external_notation": "yes" if has_notation else "no",
            "has_external_description": "yes" if has_description else "no",
            "has_records": "yes" if has_records else "no",
            "has_media": "yes" if media_present_bool else "no",
            "has_structural_relation": "yes" if has_structural_relation else "no",
            "evidence_score": evidence_score,
            "evidence_reasons": " | ".join(evidence_reasons),
            "is_productive_multiplicity": "yes" if is_productive_multiplicity else "no",
            "multiplicity_prefix": mult_prefix,
            "multiplicity_base_name": mult_base_name,
            "multiplicity_note": mult_note,
            "review_needed": review_needed,
            "adds_conflict": "yes" if adds_conflict else "no",
            "classified_pattern": classification,
            "notes": notes,
        }
        enriched.append(out_row)
        counters[match_type or "no match"] += 1

        if match_type and "structural alias" in match_type:
            structural_examples.append(out_row)
        if canonical_slug is None:
            unmatched_examples.append(out_row)

    # Write CSV
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fieldnames = list(enriched[0].keys()) if enriched else []
    with OUT_CSV.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(enriched)

    # Build priority list — rank derived from evidence_score, not pattern shape.
    # Rows with rank >= 2 are surfaced for human review; rank 0/1 stay in the
    # full matrix CSV but don't enter the priority list.
    priority = []
    for row in unmatched_examples:
        score = int(row["evidence_score"])
        rank = evidence_to_priority_rank(score)
        if rank >= 2:
            priority.append({**row, "priority_rank": rank})

    # Sort by rank desc, then evidence_score desc (so ties break on raw score),
    # then alphabetical for stable display.
    priority.sort(
        key=lambda r: (
            -int(r["priority_rank"]),
            -int(r["evidence_score"]),
            r["external_name"],
        )
    )
    with OUT_PRIORITY.open("w", newline="") as f:
        if priority:
            w = csv.DictWriter(f, fieldnames=list(priority[0].keys()))
            w.writeheader()
            w.writerows(priority)
        else:
            f.write("(no priority items)\n")

    # Build markdown summary
    canonical_count = sum(1 for t in tricks.values() if t["is_active"] == 1)
    pending_count = sum(1 for t in tricks.values() if t["is_active"] == 0)

    md = []
    md.append("# Freestyle dictionary coverage-diff report")
    md.append("")
    md.append("Reconciliation audit comparing the canonical ontology against external")
    md.append("freestyle sources. Read-only. No DB writes, no auto-promotions.")
    md.append("")
    md.append("## Sources loaded")
    md.append("")
    md.append("| Source | Status | Rows |")
    md.append("|---|---|---|")
    md.append(f"| footbag.org (`scraped_footbag_moves.csv`) | loaded | {len(scraped)} |")
    md.append("| footbagmoves.com | **not yet loaded** | 0 (deferred — corpus not present locally) |")
    md.append("| canonical dictionary (`freestyle_tricks`) | loaded | "
              f"{len(tricks)} ({canonical_count} active, {pending_count} pending) |")
    md.append(f"| alias table (`freestyle_trick_aliases`) | loaded | {len(aliases)} |")
    md.append(f"| curated mappings (`external_name_mappings.csv`) | loaded | {len(name_mappings)} |")
    md.append("")

    md.append("## Counts")
    md.append("")
    md.append(f"- External tricks examined (footbag.org): **{len(external_rows)}**")
    md.append(f"- With canonical match: **{sum(1 for r in enriched if r['canonical_match']=='yes')}**")
    md.append(f"- Without canonical match: **{sum(1 for r in enriched if r['canonical_match']=='no')}**")
    md.append(f"- ADD-disagreement flagged: **{sum(1 for r in enriched if r['adds_conflict']=='yes')}**")
    md.append(f"- Media-link present (canonical-side): **{media_yes}** / {media_yes+media_no}")
    md.append("")

    md.append("## Match-type distribution")
    md.append("")
    md.append("| match_type | count |")
    md.append("|---|---|")
    for k, v in counters.most_common():
        md.append(f"| {k} | {v} |")
    md.append("")

    md.append("## Unmatched classification (pattern guesses, NOT auto-promotion)")
    md.append("")
    md.append("| pattern | count |")
    md.append("|---|---|")
    for k, v in classification_counter.most_common():
        md.append(f"| {k} | {v} |")
    md.append("")

    md.append("## Sanity checks (user-named adjudications)")
    md.append("")
    md.append("| trick | result | row in matrix |")
    md.append("|---|---|---|")
    sanity_targets = {
        "double around the world heel": None,
        "triple around the world": None,
        "whirling swirl": None,
        "dada curve": None,
        "flying clipper": None,
        "dragonfly kick": None,
    }
    for row in enriched:
        nl = row["external_name"].strip().lower()
        if nl in sanity_targets:
            sanity_targets[nl] = row
    for name, row in sanity_targets.items():
        if row is None:
            md.append(f"| {name} | NOT in footbag.org scrape | (n/a) |")
        else:
            md.append(
                f"| {name} | match_type=**{row['match_type']}**, "
                f"canonical=`{row['canonical_slug'] or '—'}`, "
                f"ontology={row['ontology_status']} | row {row['external_showmove_id']} |"
            )
    md.append("")

    md.append("## Top patterns (sample 10 unmatched per pattern)")
    md.append("")
    by_pattern = defaultdict(list)
    for row in enriched:
        if row["canonical_match"] == "no":
            by_pattern[row["classified_pattern"]].append(row)
    for pattern, rows in sorted(by_pattern.items(), key=lambda kv: -len(kv[1])):
        md.append(f"### {pattern} ({len(rows)} total)")
        md.append("")
        for row in rows[:10]:
            alt = row["external_alt_name"]
            alt_str = f" (alt: {alt})" if alt else ""
            adds = row["external_ADD"]
            md.append(f"- {row['external_name']}{alt_str} — ADD={adds}, family={row['external_family'] or '—'}, category={row['external_category'] or '—'}")
        if len(rows) > 10:
            md.append(f"- … +{len(rows) - 10} more")
        md.append("")

    md.append("## Evidence-scoring logic")
    md.append("")
    md.append("Priority rank for unmatched rows is derived from a numeric")
    md.append("`evidence_score`, not from name-shape alone. Each signal contributes:")
    md.append("")
    md.append("| signal | weight | rationale |")
    md.append("|---|---|---|")
    md.append(f"| passback record present (matched on external_name) | +{EV_RECORDS} | competition records prove community-grade use |")
    md.append(f"| Jobs notation present | +{EV_NOTATION} | structural decomposition is documented |")
    md.append(f"| description present | +{EV_DESCRIPTION} | recognized identity in source prose |")
    md.append(f"| canonical-side or external-side media | +{EV_MEDIA} | trick is taught/demonstrated |")
    md.append(f"| name decomposes via known modifier+canonical-base | +{EV_STRUCTURAL} | ontological relationship to existing canon |")
    md.append(f"| alt-name documented in scrape | +{EV_ALT_NAME} | decomposition or alternate identity recorded |")
    md.append(f"| numeric ADD parseable | +{EV_CLEAN_ADD} | minimal but non-zero structural fact |")
    md.append(f"| fb.org `[uns]` tag (residue bucket) | {EV_UNS_PENALTY} | source itself flags as unusual |")
    md.append("")
    md.append("Rank tiers from total score:")
    md.append("")
    md.append("| score | priority_rank | meaning |")
    md.append("|---|---|---|")
    md.append("| ≥ 8 | 5 | strongest candidate (records + multiple structural signals) |")
    md.append("| 6 – 7 | 4 | strong candidate (notation + description, or records-driven) |")
    md.append("| 4 – 5 | 3 | worth review (single strong signal + minor signals) |")
    md.append("| 2 – 3 | 2 | weak but present (some structural data) |")
    md.append("| 0 – 1 | 1 | thin/bare (name + ADD only, no semantic content) |")
    md.append("| < 0 | 0 | residue (name + ADD with `[uns]` penalty) |")
    md.append("")

    md.append("## Top candidates by evidence score (rank 4 + 5)")
    md.append("")
    p_strong = [r for r in priority if int(r["priority_rank"]) >= 4]
    if p_strong:
        md.append("| trick | rank | score | reasons | family | showmove |")
        md.append("|---|---|---|---|---|---|")
        for row in p_strong[:30]:
            md.append(
                f"| **{row['external_name']}** "
                f"| {row['priority_rank']} | {row['evidence_score']} "
                f"| {row['evidence_reasons']} "
                f"| {row['external_family'] or '—'} "
                f"| showmove/{row['external_showmove_id']} |"
            )
        if len(p_strong) > 30:
            md.append(f"\n_… +{len(p_strong) - 30} more in priority CSV_")
    else:
        md.append("_(none)_")
    md.append("")

    md.append("## Worth review (rank 3)")
    md.append("")
    p3 = [r for r in priority if int(r["priority_rank"]) == 3]
    if p3:
        for row in p3[:25]:
            adds = row["external_ADD"]
            md.append(
                f"- **{row['external_name']}** — ADD={adds}, score={row['evidence_score']}, "
                f"reasons={row['evidence_reasons']}, classification={row['classified_pattern']}, "
                f"fb.org showmove/{row['external_showmove_id']}"
            )
        if len(p3) > 25:
            md.append(f"- … +{len(p3) - 25} more in priority CSV")
    else:
        md.append("_(none)_")
    md.append("")

    md.append("## Weak name-only external residue (rank 0 + 1)")
    md.append("")
    md.append("Rows with no Jobs notation, no description, no records, no media — only a")
    md.append("name and ADD. These do NOT belong in the priority queue and should be")
    md.append("treated as external-only until stronger evidence emerges.")
    md.append("")
    weak = [r for r in unmatched_examples if evidence_to_priority_rank(int(r["evidence_score"])) <= 1]
    if weak:
        md.append("| trick | ADD | category | score | reasons |")
        md.append("|---|---|---|---|---|")
        for row in weak[:25]:
            md.append(
                f"| {row['external_name']} | {row['external_ADD'] or '—'} "
                f"| {row['external_category'] or '—'} "
                f"| {row['evidence_score']} | {row['evidence_reasons'] or '—'} |"
            )
        if len(weak) > 25:
            md.append(f"\n_… +{len(weak) - 25} more in matrix CSV_")
    else:
        md.append("_(none — every unmatched row carries at least some evidence)_")
    md.append("")

    md.append("## Productive multiplicity patterns")
    md.append("")
    md.append("**Red pt3 principle:** *\"Double / Triple\" describes repeated dexterity or")
    md.append("body-spin events. It is not automatically its own family/set/modifier.*")
    md.append("A productive-multiplicity name only earns canonical status when community")
    md.append("usage stabilizes a distinct, recognized identity (e.g. `double-leg-over`,")
    md.append("`double-around-the-world`, `double-spin` — already canonical).")
    md.append("")
    md.append("Detected rows are flagged so adjudicators can apply the named-identity")
    md.append("test specifically. Detection does NOT auto-demote priority — high-evidence")
    md.append("rows keep their evidence_score and rank, with a caution note added.")
    md.append("")
    mult_rows = [r for r in enriched if r["is_productive_multiplicity"] == "yes"]
    matched_mult = [r for r in mult_rows if r["canonical_match"] == "yes"]
    unmatched_mult = [r for r in mult_rows if r["canonical_match"] == "no"]
    md.append(f"**Total detected:** {len(mult_rows)} "
              f"({len(matched_mult)} already canonical, {len(unmatched_mult)} unmatched and pending review)")
    md.append("")
    md.append("### Top 10 unmatched productive-multiplicity rows by evidence score")
    md.append("")
    if unmatched_mult:
        unmatched_mult_sorted = sorted(
            unmatched_mult, key=lambda r: -int(r["evidence_score"])
        )
        md.append("| trick | ADD | score | base phrase | base resolves? | recommendation |")
        md.append("|---|---|---|---|---|---|")
        for row in unmatched_mult_sorted[:10]:
            base_canonical = ""
            # Re-derive whether base resolves from the note text.
            if "resolves via alias" in row["multiplicity_note"]:
                base_status = "alias"
            elif "is an active canonical" in row["multiplicity_note"]:
                base_status = "canonical"
            else:
                base_status = "no"
            md.append(
                f"| **{row['external_name']}** "
                f"| {row['external_ADD'] or '—'} | {row['evidence_score']} "
                f"| {row['multiplicity_base_name']} "
                f"| {base_status} "
                f"| review for named identity, not automatic canonical |"
            )
        if len(unmatched_mult_sorted) > 10:
            md.append(f"\n_… +{len(unmatched_mult_sorted) - 10} more in matrix CSV (filter `is_productive_multiplicity=yes` AND `canonical_match=no`)_")
    else:
        md.append("_(none)_")
    md.append("")
    md.append("### Sanity-check examples (named in the brief)")
    md.append("")
    sanity_mult = ["Double Fairy", "Double Spinning Osis", "Triple Around The World"]
    for name in sanity_mult:
        match = next((r for r in mult_rows if r["external_name"] == name), None)
        if match:
            md.append(
                f"- **{name}** — score={match['evidence_score']}, "
                f"base='{match['multiplicity_base_name']}', "
                f"prefix='{match['multiplicity_prefix']}', "
                f"review_needed=`{match['review_needed']}` — "
                f"{match['multiplicity_note']}"
            )
        else:
            md.append(f"- **{name}** — not detected (check matrix)")
    md.append("")
    md.append("### Already-canonical multiplicity names (informational)")
    md.append("")
    md.append("These were promoted as canonical at some point because community usage")
    md.append("fixed them as distinct names. They are NOT awaiting review.")
    md.append("")
    if matched_mult:
        for row in matched_mult[:15]:
            md.append(f"- `{row['canonical_slug']}` ({row['external_name']}) — base='{row['multiplicity_base_name']}'")
        if len(matched_mult) > 15:
            md.append(f"- … +{len(matched_mult) - 15} more")
    else:
        md.append("_(none)_")
    md.append("")
    md.append("### Classifier limitation note (carried forward)")
    md.append("")
    md.append("The detector flags multiplicity patterns but does NOT itself decide")
    md.append("canonical-worthiness. A productive-multiplicity name with high evidence")
    md.append("(records + notation + description) still requires human adjudication of")
    md.append("named-identity persistence per Red pt3. Conversely, low-evidence")
    md.append("multiplicity names that don't resolve to a canonical base are likely")
    md.append("descriptive noise.")
    md.append("")

    md.append("## Likely structural-alias clusters")
    md.append("")
    if structural_examples:
        for row in structural_examples[:25]:
            md.append(
                f"- **{row['external_name']}** decomposes to canonical `{row['canonical_slug']}` "
                f"({row['notes']})"
            )
    else:
        md.append("_(none auto-detected — registry-driven mappings still recommended for ambiguous cases)_")
    md.append("")

    md.append("## Outputs")
    md.append("")
    md.append(f"- Matrix CSV: `{OUT_CSV.relative_to(REPO_ROOT)}`")
    md.append(f"- Priority CSV: `{OUT_PRIORITY.relative_to(REPO_ROOT)}`")
    md.append(f"- This summary: `{OUT_MD.relative_to(REPO_ROOT)}`")
    md.append("")
    md.append("## Next-steps direction (non-binding)")
    md.append("")
    md.append("1. Adjudicate **priority-4 candidates** first (likely canonicals).")
    md.append("2. Use **structural-alias clusters** as ontology stress-tests (do they decompose cleanly? do they need a `freestyle_trick_aliases` row, an `external_name_mappings` row, or a new canonical?).")
    md.append("3. Defer **`[uns]` (unusual)** classifications — these are footbag.org's own residue bucket; promote only when expert review confirms competitive significance.")
    md.append("4. When **footbagmoves.com** corpus lands locally, this script's `load_scraped_descriptions()` and source-loop are the extension points.")
    md.append("")

    with OUT_MD.open("w") as f:
        f.write("\n".join(md))

    print(f"wrote {OUT_CSV}")
    print(f"wrote {OUT_MD}")
    print(f"wrote {OUT_PRIORITY}")
    print(f"  external rows: {len(external_rows)}")
    print(f"  matched: {sum(1 for r in enriched if r['canonical_match']=='yes')}")
    print(f"  unmatched: {sum(1 for r in enriched if r['canonical_match']=='no')}")
    print(f"  priority items: {len(priority)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
