#!/usr/bin/env python3
"""GLOSSARY-SYNTHESIS-1: build comparative matrix + symbolic links + relationship graph.

Generates Tasks A/D/F of the GS-1 brief.

Inputs (read-only):
  - docs/Freestyle_Footbag_Glossary.md (IFPA glossary v2; 25-ish terms; the source
    document is retired, so its loader degrades to an empty term set)
  - legacy_data/inputs/curated/tricks/passback-glossary.txt (613 lines; 180 terms)
  - exploration/passback-intake/passback_glossary_staging.csv (180 parsed terms)
  - exploration/freestyle-notation-grammar/UX1_GLOSSARY_TOKEN_MATRIX.csv (83 tokens)
  - exploration/freestyle-notation-grammar/GRAMMAR_GLOSSARY_V3.md (observational v3)
  - freestyle/symbolic_grammar/glossary_crosslinks.csv (68 crosslinks)
  - freestyle/symbolic_grammar/symbolic_*_groups.csv (62 groups across 5 axes)
  - database/footbag.db (modifier table + active tricks; read-only)

Outputs (all under exploration/glossary-synthesis-1/):
  Task A — GLOSSARY_COMPARISON_MATRIX.csv (comparative per-term matrix)
  Task D — SYMBOLIC_GLOSSARY_LINKS.csv (term ↔ symbolic group ↔ related tricks/operators)
  Task F — GLOSSARY_RELATIONSHIP_GRAPH.csv (term-to-term relationships)

Tasks B/C/E/H are hand-authored markdown docs; not script-generated.

Read-only on DB. No DB writes. Deterministic output.
"""
from __future__ import annotations

import csv
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IFPA_GLOSSARY = ROOT / "docs" / "Freestyle_Footbag_Glossary.md"  # retired document; absent at this path
PB_GLOSSARY_TXT = ROOT / "legacy_data" / "inputs" / "curated" / "tricks" / "passback-glossary.txt"
PB_GLOSSARY_CSV = ROOT / "exploration" / "passback-intake" / "passback_glossary_staging.csv"
UX1_TOKENS = ROOT / "exploration" / "freestyle-notation-grammar" / "UX1_GLOSSARY_TOKEN_MATRIX.csv"
SG2_CROSSLINKS = ROOT / "freestyle" / "symbolic_grammar" / "glossary_crosslinks.csv"
SG2_TOPOLOGY = ROOT / "freestyle" / "symbolic_grammar" / "symbolic_topology_groups.csv"
SG2_MODIFIER = ROOT / "freestyle" / "symbolic_grammar" / "symbolic_modifier_groups.csv"
SG2_CONTACT = ROOT / "freestyle" / "symbolic_grammar" / "symbolic_contact_groups.csv"
SG2_DEX = ROOT / "freestyle" / "symbolic_grammar" / "symbolic_dex_groups.csv"
SG2_EXEC = ROOT / "freestyle" / "symbolic_grammar" / "symbolic_execution_patterns.csv"
SG2_MEMBERSHIP = ROOT / "freestyle" / "symbolic_grammar" / "symbolic_group_membership.csv"
DB = ROOT / "database" / "footbag.db"
OUT_DIR = ROOT / "exploration" / "glossary-synthesis-1"


# ─────────────────────────────────────────────────────────────────────────
# Curated term inventory — focal terms for comparative analysis
# ─────────────────────────────────────────────────────────────────────────
# Each entry: (term, aliases, primary_axis, high_value_flag)
# Primary axis: "concept" / "modifier" / "trick" / "notation" / "stall" / "execution"
# High-value flag: prioritized for synthesis drafts (Task C)
FOCAL_TERMS = [
    # Concepts
    ("ADD", ["ADDs", "Additional Degree of Difficulty"], "concept", True),
    ("dex", ["dexterity"], "concept", True),
    ("set", ["setting the bag"], "concept", True),
    ("stall", ["delay"], "concept", True),
    ("contact", [], "concept", False),
    ("component", [], "concept", False),
    ("uptime", ["uptime set", "uptime dex"], "concept", False),
    ("downtime", [], "concept", False),
    ("midtime", ["hangtime"], "concept", False),
    ("link", ["transition"], "concept", False),
    ("run", ["string"], "concept", False),
    ("combo", [], "concept", False),
    ("drill", [], "concept", False),
    ("mirror", [], "concept", False),
    ("rewind", [], "concept", False),
    ("symposium", ["symp", "FS", "BS", "frontside", "backside", "full symp"], "modifier", True),
    ("symple", [], "modifier", False),
    ("muted", [], "modifier", False),
    # Modifiers — set
    ("pixie", [], "modifier", True),
    ("fairy", [], "modifier", False),
    ("quantum", [], "modifier", True),
    ("atomic", [], "modifier", True),
    ("nuclear", [], "modifier", False),
    ("furious", [], "modifier", False),
    ("blurry", ["blur"], "modifier", False),
    ("shooting", [], "modifier", False),
    ("rooted", [], "modifier", False),
    ("pogo", [], "modifier", False),
    # Modifiers — body
    ("paradox", ["pdx", "PS"], "modifier", True),
    ("ducking", [], "modifier", True),
    ("diving", [], "modifier", False),
    ("weaving", [], "modifier", False),
    ("zulu", [], "modifier", False),
    ("stepping", [], "modifier", False),
    ("tapping", [], "modifier", False),
    ("barraging", [], "modifier", False),
    ("miraging", [], "modifier", False),
    ("backside", [], "modifier", False),
    # Modifiers — rotation
    ("spinning", [], "modifier", True),
    ("whirling", [], "modifier", False),
    ("swirling", [], "modifier", False),
    ("inspinning", ["inspin"], "modifier", False),
    ("gyro", [], "modifier", False),
    # X-Dex
    ("xdex", ["x-dex"], "modifier", False),
    # Foundational tricks
    ("butterfly", [], "trick", True),
    ("clipper", ["clipper stall"], "stall", True),
    ("toe", ["toe stall"], "stall", False),
    ("inside", ["inside stall"], "stall", False),
    ("outside", ["outside stall"], "stall", False),
    ("heel", ["heel stall"], "stall", False),
    ("sole", ["sole stall"], "stall", False),
    ("mirage", [], "trick", False),
    ("illusion", [], "trick", False),
    ("legover", [], "trick", False),
    ("pickup", [], "trick", False),
    ("osis", [], "trick", True),
    ("whirl", [], "trick", True),
    ("swirl", [], "trick", True),
    ("torque", [], "trick", False),
    ("blender", [], "trick", False),
    ("drifter", [], "trick", False),
    ("barfly", [], "trick", False),
    ("around the world", ["atw"], "trick", False),
    ("orbit", [], "trick", False),
    # Notation operators
    ("xbd", ["cross-body"], "notation", True),
    ("ss", ["same-side", "same side", "near"], "notation", True),
    ("op", ["opposite", "far"], "notation", True),
    ("in", ["in-out dex"], "notation", False),
    ("out", ["out-in dex"], "notation", False),
    ("hippy", [], "notation", False),
    ("leggy", [], "notation", False),
    ("full dex", [], "notation", False),
    ("half dex", [], "notation", False),
    ("Jobs notation", [], "notation", False),
    ("technical name", [], "notation", False),
    ("nickname", [], "notation", False),
    # Execution quality
    ("clean", [], "execution", False),
    ("deep dex", [], "execution", False),
    ("thin dex", [], "execution", False),
    ("crowny", [], "execution", False),
    ("shoey", [], "execution", False),
    ("scoopy", ["scooped"], "execution", False),
    ("pulled set", ["slurry"], "execution", False),
    ("the", [], "execution", False),
    # Stance + sidedness
    ("strong side", [], "execution", False),
    ("flip side", [], "execution", False),
    ("bigfoot", [], "execution", False),
    ("sideways", [], "execution", False),
    # ADD groupings
    ("tiltless", [], "concept", False),
    ("guiltless", [], "concept", False),
    ("tripless", [], "concept", False),
    ("fearless", [], "concept", False),
    ("beastly", [], "concept", False),
    ("godly", [], "concept", False),
    ("genuine", ["genuine guiltless"], "concept", False),
    ("BOP", [], "concept", False),
    # PassBack-specific concepts
    ("LIMP", [], "concept", False),
    ("CLIMP", [], "concept", False),
    ("alpine", [], "modifier", False),
    ("crispy", [], "modifier", False),
    ("BSOS", ["bee sauce", "BSOR"], "concept", False),
    ("midstring", [], "concept", False),
    ("shuffle combo", ["shuffling"], "concept", False),
    ("magic hop", [], "concept", False),
    # Component flags (operational)
    ("DEX", [], "notation", False),
    ("DEL", [], "notation", False),
    ("BOD", [], "notation", False),
    ("PDX", [], "notation", False),
    ("XBD", [], "notation", False),
    ("XDEX", [], "notation", False),
    ("UNS", [], "notation", False),
]


# ─────────────────────────────────────────────────────────────────────────
# Loaders
# ─────────────────────────────────────────────────────────────────────────

def load_ifpa_glossary_terms() -> dict[str, str]:
    """Return {term_lowered: short_definition_excerpt} from IFPA glossary v2."""
    if not IFPA_GLOSSARY.exists():
        return {}
    text = IFPA_GLOSSARY.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    # Section headers: ### Term, then prose until next ### or ##
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        m = re.match(r"^### (.+?)$", lines[i])
        if m:
            header = m.group(1).strip()
            # Capture next non-empty prose lines until next ### or ##
            i += 1
            paras: list[str] = []
            while i < len(lines) and not lines[i].startswith("#"):
                if lines[i].strip():
                    paras.append(lines[i].strip())
                i += 1
            definition = " ".join(paras)[:600]
            # Normalize header: strip parenthetical
            term_clean = re.sub(r"\s*\(.*\)\s*", "", header).strip()
            out[term_clean.lower()] = definition
        else:
            i += 1
    # Also extract abbreviation table at the bottom
    abbrev_section = False
    for line in lines:
        if "Abbreviation" in line and "Meaning" in line:
            abbrev_section = True
            continue
        if abbrev_section:
            m2 = re.match(r"^\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|", line)
            if m2:
                abbr = m2.group(1).strip().lower()
                meaning = m2.group(2).strip()
                if abbr and abbr != "abbreviation" and not abbr.startswith("-"):
                    out[abbr] = f"Abbreviation: {meaning}"
    return out


def load_passback_glossary_csv() -> dict[str, dict]:
    """Return {term_lower: full_row} from passback_glossary_staging.csv."""
    if not PB_GLOSSARY_CSV.exists():
        return {}
    out: dict[str, dict] = {}
    with PB_GLOSSARY_CSV.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["term"].lower().strip()] = row
            # Also index alternate forms
            for alt in row.get("alternate_forms", "").split("|"):
                if alt.strip():
                    out.setdefault(alt.strip().lower(), row)
    return out


def load_ux1_tokens() -> dict[str, dict]:
    """Return {token_lower: row} from UX1_GLOSSARY_TOKEN_MATRIX.csv."""
    if not UX1_TOKENS.exists():
        return {}
    out: dict[str, dict] = {}
    with UX1_TOKENS.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tok = row.get("token", "").strip().lower()
            if tok:
                out.setdefault(tok, row)
    return out


def load_sg2_modifier_groups() -> set[str]:
    """Return set of modifier-group ids (e.g. 'spinning-family')."""
    if not SG2_MODIFIER.exists():
        return set()
    with SG2_MODIFIER.open(encoding="utf-8") as f:
        return {row["symbolic_group_id"] for row in csv.DictReader(f)}


def load_sg2_membership() -> dict[str, list[str]]:
    """Return {symbolic_group_id: [trick_slugs]}."""
    out: dict[str, list[str]] = defaultdict(list)
    if not SG2_MEMBERSHIP.exists():
        return dict(out)
    with SG2_MEMBERSHIP.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["symbolic_group_id"]].append(row["trick_slug"])
    return dict(out)


def load_modifier_table() -> dict[str, dict]:
    if not DB.exists():
        return {}
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    try:
        out = {}
        for row in conn.execute("SELECT slug, modifier_name, add_bonus, add_bonus_rotational, modifier_type, notes FROM freestyle_trick_modifiers"):
            out[row["slug"]] = dict(row)
        return out
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────
# Classifier
# ─────────────────────────────────────────────────────────────────────────

def classify_overlap(term: str, ifpa: str | None, passback: dict | None, ux1: dict | None,
                     modifier_table: dict[str, dict]) -> tuple[str, str]:
    """Return (overlap_type, recommended_action)."""
    has_ifpa = bool(ifpa and ifpa.strip())
    has_passback = bool(passback and passback.get("passback_explanation", "").strip())
    has_symbolic = bool(ux1 and ux1.get("plain_english", "").strip())

    presence = (has_ifpa, has_passback, has_symbolic)

    # No data at all
    if not any(presence):
        return ("absent_all", "FIELD GAP — needs definition from scratch")

    # Symbolic-only
    if has_symbolic and not has_ifpa and not has_passback:
        return ("symbolic_only", "STAGE — symbolic-only term; add to symbolic-grammar layer of v4")

    # PassBack-only (educational community vocab missing from IFPA)
    if has_passback and not has_ifpa and not has_symbolic:
        return ("community_passback_only", "REVIEW — community vocabulary candidate for educational layer")

    # IFPA-only (canonical without educational expansion)
    if has_ifpa and not has_passback and not has_symbolic:
        return ("ifpa_only", "AUGMENT — IFPA has definition; PassBack + symbolic could enrich")

    # IFPA + PassBack overlap — compare definition lengths as crude richness signal
    if has_ifpa and has_passback:
        pb_len = len(passback.get("passback_explanation", ""))
        ifpa_len = len(ifpa)
        if pb_len > 3 * ifpa_len and pb_len > 300:
            return ("broader_passback", "PROMOTE — PassBack adds significant educational depth IFPA lacks")
        elif ifpa_len > 2 * pb_len and ifpa_len > 200:
            return ("broader_ifpa", "PRESERVE — IFPA carries more authority/precision; PassBack as enrichment")
        else:
            return ("complementary", "SYNTHESIZE — both sources contribute; merge complementary aspects")

    # IFPA + symbolic
    if has_ifpa and has_symbolic and not has_passback:
        return ("ifpa_plus_symbolic", "LAYER — IFPA canonical + symbolic mechanics; pair without overwriting")

    # PassBack + symbolic
    if has_passback and has_symbolic and not has_ifpa:
        return ("educational_plus_symbolic", "PROMOTE — PassBack + symbolic; canonical IFPA entry candidate")

    # All three present
    if all(presence):
        return ("triple_coverage", "SYNTHESIZE — flagship term; harmonize all three layers in v4")

    return ("partial", "REVIEW — partial coverage; investigate")


def detect_axis(term: str, ux1: dict | None, modifier_table: dict[str, dict], focal_axis: str) -> str:
    """Determine the term's primary classification axis."""
    if focal_axis:
        return focal_axis
    term_lower = term.lower().strip()
    if term_lower in modifier_table:
        mt = modifier_table[term_lower].get("modifier_type", "")
        return f"modifier:{mt}" if mt else "modifier"
    if ux1:
        layer = ux1.get("layer", "")
        role = ux1.get("role", "")
        return f"{layer}:{role}" if layer and role else (layer or role or "unknown")
    return "unknown"


# ─────────────────────────────────────────────────────────────────────────
# Task A — comparison matrix
# ─────────────────────────────────────────────────────────────────────────

MATRIX_FIELDS = [
    "term",
    "primary_axis",
    "high_value",
    "existing_ifpa_definition",
    "passback_definition",
    "symbolic_definition",
    "operational_usage",
    "canonical_status",
    "educational_value",
    "symbolic_value",
    "overlap_type",
    "recommended_action",
    "notes",
]


def build_comparison_matrix() -> int:
    ifpa = load_ifpa_glossary_terms()
    passback = load_passback_glossary_csv()
    ux1 = load_ux1_tokens()
    modifier_table = load_modifier_table()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    seen_terms: set[str] = set()

    for term, aliases, primary_axis, high_value in FOCAL_TERMS:
        term_lower = term.lower()
        if term_lower in seen_terms:
            continue
        seen_terms.add(term_lower)

        # Lookup across sources (term + aliases)
        ifpa_def = None
        for key in [term_lower] + [a.lower() for a in aliases]:
            if key in ifpa:
                ifpa_def = ifpa[key]
                break

        pb_row = None
        for key in [term_lower] + [a.lower() for a in aliases]:
            if key in passback:
                pb_row = passback[key]
                break

        ux_row = None
        for key in [term_lower] + [a.lower() for a in aliases]:
            if key in ux1:
                ux_row = ux1[key]
                break

        # Operational usage
        operational_usage = ""
        if ux_row and ux_row.get("layer") == "operational":
            operational_usage = ux_row.get("example_in_context", "")
        # If modifier-table entry exists, append note
        mt_note = ""
        if term_lower in modifier_table:
            mt = modifier_table[term_lower]
            mt_note = f"Modifier table: add_bonus={mt['add_bonus']} / rotational={mt['add_bonus_rotational']} / type={mt['modifier_type']}"

        # Canonical status
        if term_lower in modifier_table:
            canonical_status = "canonical_modifier"
        elif ifpa_def:
            canonical_status = "canonical_glossary"
        elif pb_row and pb_row.get("match_status") == "existing_term":
            canonical_status = "cross_referenced_existing"
        else:
            canonical_status = "non_canonical"

        # Educational value (PassBack-grounded)
        if pb_row:
            pb_explanation_len = len(pb_row.get("passback_explanation", ""))
            if pb_explanation_len > 600:
                educational_value = "high"
            elif pb_explanation_len > 200:
                educational_value = "medium"
            elif pb_explanation_len > 0:
                educational_value = "low"
            else:
                educational_value = "absent"
        else:
            educational_value = "absent"

        # Symbolic value (UX1-grounded)
        if ux_row:
            weight = ux_row.get("weight", "")
            role = ux_row.get("role", "")
            if role in ("core_family", "rotation", "modifier", "set", "component_flag"):
                symbolic_value = "high"
            elif role:
                symbolic_value = "medium"
            else:
                symbolic_value = "low"
        else:
            symbolic_value = "absent"

        overlap_type, action = classify_overlap(term, ifpa_def, pb_row, ux_row, modifier_table)

        notes_parts: list[str] = []
        if mt_note:
            notes_parts.append(mt_note)
        if pb_row and pb_row.get("passback_section"):
            notes_parts.append(f"PB section: {pb_row['passback_section']}")
        if aliases:
            notes_parts.append(f"aliases: {', '.join(aliases)}")

        rows.append({
            "term": term,
            "primary_axis": primary_axis,
            "high_value": "true" if high_value else "false",
            "existing_ifpa_definition": (ifpa_def or "")[:400],
            "passback_definition": (pb_row.get("passback_explanation", "") if pb_row else "")[:600],
            "symbolic_definition": (ux_row.get("plain_english", "") if ux_row else "")[:400],
            "operational_usage": operational_usage,
            "canonical_status": canonical_status,
            "educational_value": educational_value,
            "symbolic_value": symbolic_value,
            "overlap_type": overlap_type,
            "recommended_action": action,
            "notes": "; ".join(notes_parts),
        })

    rows.sort(key=lambda r: (r["primary_axis"], r["term"].lower()))
    with (OUT_DIR / "GLOSSARY_COMPARISON_MATRIX.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=MATRIX_FIELDS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


# ─────────────────────────────────────────────────────────────────────────
# Task D — symbolic glossary links
# ─────────────────────────────────────────────────────────────────────────

LINKS_FIELDS = [
    "glossary_term",
    "symbolic_group_id",
    "related_tricks",
    "related_operators",
    "notation_examples",
    "topology_examples",
    "notes",
]


# Term → symbolic-group mapping. Hand-curated for accuracy.
TERM_TO_GROUPS = {
    "spinning": ["spinning-family"],
    "paradox": ["paradox-family"],
    "pixie": ["pixie-family"],
    "ducking": ["ducking-family"],
    "diving": ["diving-family"],
    "symposium": ["symposium-family"],
    "stepping": ["stepping-family"],
    "tapping": ["tapping-family"],
    "atomic": ["atomic-family"],
    "furious": ["furious-family"],
    "quantum": ["quantum-family"],
    "nuclear": ["nuclear-family"],
    "gyro": ["gyro-family"],
    "whirling": ["whirling-family"],
    "barraging": ["barraging-family"],
    "blurry": ["blurry-family"],
    "miraging": ["miraging-family"],
    "butterfly": ["butterfly-wing-topology"],
    "whirl": ["whirl-rotational-topology"],
    "swirl": ["swirl-rotational-topology"],
    "osis": ["osis-rotational-topology"],
    "torque": ["torque-rotational-topology"],
    "blender": ["blender-rotational-topology"],
    "legover": ["legover-topology"],
    "pickup": ["pickup-topology"],
    "mirage": ["mirage-topology"],
    "illusion": ["illusion-topology"],
    "drifter": ["drifter-miraging-clipper-topology"],
    "around the world": ["atw-leg-circle-topology"],
    "barfly": ["barfly-double-loop-topology"],
    "clipper": ["clipper-start", "clipper-ending", "stall-1add-topology"],
    "toe": ["toe-start", "toe-ending", "stall-1add-topology"],
    "xbd": ["clipper-ending", "cross-body-xbd"],
    "ss": ["same-side-execution"],
    "op": ["same-side-execution"],  # the pair lives in the same-side-execution group via contrast
    "hippy": ["hippy-in-dex", "hippy-out-dex"],
    "leggy": ["leggy-pass", "leggy-circle"],
    "DEX": ["single-dex-family", "double-dex-topology", "multi-dex-topology"],
    "XBD": ["clipper-ending"],
    "PDX": ["paradox-family"],
    "BOD": ["spinning-family", "ducking-family", "diving-family"],
    "XDEX": ["xdex-topology"],
    "UNS": ["unusual-surface-topology"],
    "rooted": ["rooted-pre-state"],
}


def build_symbolic_links() -> int:
    membership = load_sg2_membership()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    for term, group_ids in TERM_TO_GROUPS.items():
        for gid in group_ids:
            related = membership.get(gid, [])
            sample = ", ".join(related[:6]) if related else "(no membership data)"
            related_operators = ""
            notation_examples = ""
            topology_examples = ""
            # Cross-link to other groups for context
            if "family" in gid:
                related_operators = f"compose with base topology groups (e.g. on whirl/osis/butterfly/etc.)"
            if "topology" in gid:
                topology_examples = f"anchor topology: {gid}"
            if gid.endswith("-dex"):
                notation_examples = f"James-shorthand: [set]>{gid}>op toe (cf. CORE_TRICK_SYMBOLIC_TABLE)"
            rows.append({
                "glossary_term": term,
                "symbolic_group_id": gid,
                "related_tricks": sample,
                "related_operators": related_operators,
                "notation_examples": notation_examples,
                "topology_examples": topology_examples,
                "notes": f"{len(related)} member tricks in this group",
            })
    rows.sort(key=lambda r: (r["glossary_term"].lower(), r["symbolic_group_id"]))
    with (OUT_DIR / "SYMBOLIC_GLOSSARY_LINKS.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=LINKS_FIELDS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


# ─────────────────────────────────────────────────────────────────────────
# Task F — relationship graph
# ─────────────────────────────────────────────────────────────────────────

RELATIONSHIP_FIELDS = [
    "term_a",
    "term_b",
    "relationship_type",
    "axis",
    "rationale",
    "source",
    "notes",
]


# Hand-curated relationships beyond the 68 in glossary_crosslinks.csv;
# extends to symbolic-grammar concepts not yet linked.
RELATIONSHIPS = [
    # synonym_of (same meaning, different naming)
    ("ss", "near", "synonym_of", "footedness", "Same-side and near are interchangeable per PassBack glossary.", "PassBack", ""),
    ("op", "far", "synonym_of", "footedness", "Opposite and far are interchangeable per PassBack glossary.", "PassBack", ""),
    ("dex", "dexterity", "synonym_of", "concept", "Dex = abbreviation of dexterity.", "IFPA + PassBack", ""),
    ("ADD", "additional degree of difficulty", "synonym_of", "concept", "ADD acronym expansion.", "IFPA + PassBack", ""),
    ("XBD", "cross-body", "synonym_of", "notation", "XBD component flag = cross-body delay.", "UX1 + PassBack", ""),
    ("clipper", "xbd inside stall", "synonym_of", "stall-position", "Clipper IS the inside stall in cross-body position.", "PassBack glossary", ""),
    # related_to (educational pair)
    ("paradox", "symposium", "related_to", "modifier-family-body", "Both are +1 body modifiers; both involve specific support-leg behaviors. Often confused.", "IFPA + PassBack", ""),
    ("paradox", "xdex", "related_to", "modifier", "Both involve hip pivots between dexes; paradox for clipper-set tricks, xdex for toe-set. Pt1: xdex narrow.", "UX1 + pt1", ""),
    ("symposium", "symple", "related_to", "modifier-family-symposium", "Symposium = jump-and-land active leg; symple = starts symposium, non-symple foot returns midway.", "PassBack glossary", ""),
    ("symposium", "muted", "related_to", "modifier-family-symposium", "Muted = active leg held in air for entire component (no plant at all).", "PassBack glossary", ""),
    # prerequisite_for (foundation relationships)
    ("toe", "mirage", "prerequisite_for", "stall→trick", "Toe-stall is required as the set surface for most mirage executions.", "PassBack glossary", ""),
    ("clipper", "butterfly", "prerequisite_for", "stall→trick", "Clipper-stall is the canonical recovery surface for butterfly.", "PassBack glossary", ""),
    ("dex", "mirage", "prerequisite_for", "concept→trick", "Dex (dexterity) is the foundational motion; mirage = one dex per IFPA glossary.", "IFPA glossary", ""),
    ("dex", "atom smasher", "prerequisite_for", "concept→trick", "Atom smasher uses an X-Dex (a dex variant).", "IFPA glossary", ""),
    ("ADD", "BOP", "prerequisite_for", "concept→grouping", "ADD system enables BOP grouping (Butterfly + Osis + Pdx Mirage).", "IFPA glossary", ""),
    # modifier_of (applies to base)
    ("spinning", "whirl", "modifier_of", "modifier→base", "Spinning + whirl = spinning-whirl (4 ADD).", "UX1 + memory", ""),
    ("paradox", "mirage", "modifier_of", "modifier→base", "Paradox + mirage = pdx-mirage = 3 ADD; one of the 3 BOP tricks.", "IFPA glossary + UX1", ""),
    ("pixie", "butterfly", "modifier_of", "modifier→base", "Pixie + butterfly = dimwalk = 4 ADD.", "memory + SCALE-4", ""),
    ("atomic", "mirage", "modifier_of", "modifier→base", "Atomic + mirage = atom smasher = 4 ADD (with X-Dex per pt1).", "UX1", ""),
    ("symposium", "whirl", "modifier_of", "modifier→base", "Symposium + whirl = symposium-whirl = 4 ADD.", "UX1 + SCALE pilot", ""),
    # topology_related
    ("whirl", "swirl", "topology_related", "rotational-direction-pair", "Direction-variant pair: same rotational mechanic, opposite directional travel.", "SG-2 equivalence cluster", ""),
    ("drifter", "reverse-drifter", "topology_related", "direction-variant", "First canonical direction-variant pair in dictionary.", "SCALE-10", ""),
    ("whirl", "rev-whirl", "topology_related", "direction-variant", "Second canonical direction-variant pair after drifter.", "SCALE-11", ""),
    ("osis", "drifter", "topology_related", "rotational-topology", "Osis hippy-in-extended and drifter miraging-clipper both anchor rotational-dex topologies on distinct bases.", "SG-2 topology groups", ""),
    ("torque", "blender", "topology_related", "rotational-decomposition-pair", "Torque = miraging-osis; blender = whirling-osis. Both osis-based via different rotational body modifiers.", "pt11", ""),
    ("ripwalk", "dimwalk", "topology_related", "walking-family", "Both butterfly-wing-topology with stepping/pixie modifier variants.", "SCALE pilot data", ""),
    ("ripwalk", "sidewalk", "topology_related", "walking-family-direction-variant", "Both stepping-butterfly; natural-direction vs same-side.", "pt11", ""),
    ("dimwalk", "parkwalk", "topology_related", "walking-family-direction-variant", "Both pixie-butterfly; natural-direction vs same-side.", "SCALE-11", ""),
    ("ripwalk", "dada-curve", "topology_related", "walking-family-foot-plant", "Same op-mechanics shape (clip-dex-dex-op clip), differentiated by foot-plant.", "SCALE-10", ""),
    # operational_variant
    ("DEX", "XDEX", "operational_variant", "component-flag", "Both dex flags; XDEX = full-circle dex variant (pt1: narrow specific tricks).", "UX1 + pt1", ""),
    ("paradox", "PDX", "operational_variant", "semantic→operational", "PDX = operational notation flag for paradox-direction dex.", "UX1", ""),
    ("XBD", "clipper", "operational_variant", "component-flag→stall", "XBD flag and clipper-stall describe the same cross-body recovery surface.", "UX1 + PassBack", ""),
    # symbolic_equivalent (cross-source equivalence)
    ("technical name", "Jobs notation", "symbolic_equivalent", "notation-form", "Both are written forms of trick decomposition; Jobs notation is the formal grammar.", "PassBack glossary", ""),
    ("blur", "stepping-paradox-mirage", "symbolic_equivalent", "trick-decomposition", "Pt10: blur = stepping + paradox + mirage.", "pt10", ""),
    ("torque", "miraging-osis", "symbolic_equivalent", "trick-decomposition", "Pt11: torque = miraging-osis.", "pt11", ""),
    ("blender", "whirling-osis", "symbolic_equivalent", "trick-decomposition", "Pt11: blender = whirling-osis.", "pt11", ""),
    ("drifter", "miraging-clipper", "symbolic_equivalent", "trick-decomposition", "Pt11: drifter = miraging-clipper.", "pt11", ""),
    ("eggbeater", "atomic-legover", "symbolic_equivalent", "trick-decomposition", "Pt4: eggbeater = atomic + legover.", "pt4", ""),
    ("mobius", "spinning-torque", "symbolic_equivalent", "trick-decomposition", "Multi-layer: mobius = spinning + torque = spinning + miraging + osis.", "pt11 + memory", ""),
    # educational_pair (PassBack pairs)
    ("ducking", "diving", "educational_pair", "head-motion", "Four head-motion family: ducking, diving, weaving, zulu.", "PassBack glossary", ""),
    ("weaving", "zulu", "educational_pair", "head-motion", "Both same-side head-motion; ducking→opposite, weaving→same, diving→same, zulu→opposite.", "PassBack glossary", ""),
    ("spinning", "gyro", "educational_pair", "rotational-degree", "Spinning = 360°; gyro = 180°. Combine for arbitrary degrees.", "PassBack glossary", ""),
    ("spinning", "inspinning", "educational_pair", "rotational-direction", "Spinning = backspin (default); inspinning = chest passes bag first.", "PassBack glossary", ""),
    ("pixie", "quantum", "educational_pair", "set-modifier-plus-1", "Both +1 universal set modifiers; named separately for different mechanical sources.", "UX1", ""),
    ("atomic", "furious", "educational_pair", "set-primitive", "Parallel set primitives: both +1 non-rotational / +2 rotational.", "UX1", ""),
    ("pogo", "rooted", "educational_pair", "zero-ADD-set", "Two zero-ADD set modifiers (pt6 + pt8 rulings).", "UX1 + pt-rulings", ""),
    ("backside", "frontside", "educational_pair", "symposium-modifier", "BS modifies downtime to symposium; FS modifies uptime.", "PassBack glossary", ""),
    ("stepping", "tapping", "educational_pair", "body-modifier-foot-pattern", "Two foot-pattern body modifiers; pt3 explicitly distinguishes them.", "UX1 + pt3", ""),
    ("alpine", "crispy", "educational_pair", "compound-modifier", "Two compound-modifier patterns: alpine = insert duck/dive between phases; crispy = re-time downtime to uptime.", "PassBack glossary", ""),
    # community-only or PB-only
    ("LIMP", "CLIMP", "related_to", "trick-set-abbreviation", "LIMP = Legover/Illusion/Mirage/Pickup; CLIMP adds Clipper.", "PassBack glossary", ""),
    ("BSOS", "BSOR", "synonym_of", "execution-pattern", "Both = both sides one string/run.", "PassBack glossary", ""),
    ("shred", "kick", "synonym_of", "play-style", "Casual freestyle invitations; interchangeable.", "PassBack glossary", ""),
]


def build_relationship_graph() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    for term_a, term_b, rel, axis, rationale, source, notes in RELATIONSHIPS:
        rows.append({
            "term_a": term_a,
            "term_b": term_b,
            "relationship_type": rel,
            "axis": axis,
            "rationale": rationale,
            "source": source,
            "notes": notes,
        })
    # Pull in the 68 SG-2 crosslinks to extend (mapped to relationship_type vocabulary)
    if SG2_CROSSLINKS.exists():
        crosslink_to_rel = {
            "equivalence": "synonym_of",
            "variant": "related_to",
            "composition": "modifier_of",
            "contrast": "related_to",
            "cluster": "educational_pair",
        }
        with SG2_CROSSLINKS.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                term_a, term_b = row["term_a"], row["term_b"]
                # De-dup against hand-curated
                if any(r["term_a"] == term_a and r["term_b"] == term_b for r in rows):
                    continue
                rel_type = crosslink_to_rel.get(row["relationship"], "related_to")
                rows.append({
                    "term_a": term_a,
                    "term_b": term_b,
                    "relationship_type": rel_type,
                    "axis": row.get("cluster", ""),
                    "rationale": (row.get("notes", "") or "")[:300],
                    "source": row.get("source", "SG-2 crosslinks"),
                    "notes": f"crosslink_id={row.get('crosslink_id', '')}",
                })
    rows.sort(key=lambda r: (r["term_a"].lower(), r["term_b"].lower()))
    with (OUT_DIR / "GLOSSARY_RELATIONSHIP_GRAPH.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=RELATIONSHIP_FIELDS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main() -> int:
    n_matrix = build_comparison_matrix()
    n_links = build_symbolic_links()
    n_rels = build_relationship_graph()
    print("GLOSSARY-SYNTHESIS-1 build complete")
    print(f"  GLOSSARY_COMPARISON_MATRIX.csv  {n_matrix:>4d} terms")
    print(f"  SYMBOLIC_GLOSSARY_LINKS.csv     {n_links:>4d} term-group links")
    print(f"  GLOSSARY_RELATIONSHIP_GRAPH.csv {n_rels:>4d} relationships")
    print(f"\nOutputs at: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
