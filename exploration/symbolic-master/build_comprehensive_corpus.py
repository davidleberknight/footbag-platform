#!/usr/bin/env python3
"""
build_comprehensive_corpus.py
==============================

Read-only corpus assembler. Pulls trick-like entities from every available
source (canonical DB, Emerging Vocabulary, tracked unpublished names, full
FootbagMoves inventory, FootbagMoves symbolic grammar master, footbag.org
per-ADD text dumps, footbag.org curator-staged insert queue, PassBack
intake staging, Stanford shorthand) and emits ONE row PER (source_system,
source_record) pair.

Does NOT silently collapse variants. Does NOT promote one source over
another. Does NOT mutate the DB. Does NOT alter UI.

Outputs:
  exploration/symbolic-master/comprehensive_symbolic_trick_corpus_YYYY-MM-DD.csv
  exploration/symbolic-master/CORPUS_COVERAGE_REPORT_YYYY-MM-DD.md

Coverage checks are visible in the report; gaps are surfaced loudly.

Usage:
  python3 exploration/symbolic-master/build_comprehensive_corpus.py
"""

from __future__ import annotations

import csv
import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field, asdict
from datetime import date
from pathlib import Path
from typing import Iterator, Optional

ROOT = Path(__file__).resolve().parents[2]
TODAY = date.today().isoformat()

# Input paths
DB_PATH = ROOT / "database" / "footbag.db"
OBSERVATIONAL_TS = ROOT / "src" / "content" / "freestyleObservationalTricks.ts"
TRACKED_NAMES_TS = ROOT / "src" / "content" / "freestyleTrackedNames.ts"
FM_INVENTORY_CSV = ROOT / "legacy_data" / "out" / "footbagmoves_inventory.csv"
FM_SYMBOLIC_GRAMMAR_CSV = ROOT / "exploration" / "footbagmoves-federation" / "SYMBOLIC_GRAMMAR_MASTER.csv"
FBORG_DIR = ROOT / "exploration" / "fborg"
FBORG_INSERT_STAGING_CSV = ROOT / "exploration" / "footbagmoves-federation" / "FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv"
FBORG_OBSERVATIONAL_EXPORT_CSV = ROOT / "exploration" / "footbagmoves-federation" / "FBORG_OBSERVATIONAL_EXPORT_2026-05-21.csv"
PASSBACK_TRICK_SOURCES_CSV = ROOT / "exploration" / "passback-intake" / "passback_trick_sources.csv"
PASSBACK_SOURCE_LINKS_CSV = ROOT / "exploration" / "passback-intake" / "passback_source_links_staging.csv"
STANFORD_TXT = ROOT / "exploration" / "stanford" / "stanford-2.txt"

OUT_CSV = ROOT / "exploration" / "symbolic-master" / f"comprehensive_symbolic_trick_corpus_{TODAY}.csv"
OUT_REPORT = ROOT / "exploration" / "symbolic-master" / f"CORPUS_COVERAGE_REPORT_{TODAY}.md"


# ----------------------------- helpers ----------------------------------------

def slugify(name: str) -> str:
    """Lowercase + replace whitespace/punctuation with hyphens. Idempotent.

    Mirrors the project's canonical slug rule.
    """
    if not name:
        return ""
    text = unicodedata.normalize("NFKD", name)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


# ----------------------------- row dataclass ---------------------------------

CSV_COLUMNS = [
    # identity
    "canonical_slug",
    "source_slug",
    "source_name",
    "source_system",
    "source_subsystem",
    "source_record_id",
    # publication state (for the canonical alignment, where known)
    "publication_status",
    "official_add",
    # source-specific raw — FM (FootbagMoves)
    "fm_formula_raw",
    "fm_job_raw",
    "fm_add_claim",
    "fm_technical_name",
    "fm_aliases_raw",
    "fm_source_file",
    # source-specific raw — FB.org (footbag.org /newmoves)
    "fborg_formula_raw",
    "fborg_job_raw",
    "fborg_add_claim",
    "fborg_description_raw",
    "fborg_source_file",
    # source-specific raw — PassBack
    "passback_reading_raw",
    "passback_add_claim",
    "passback_uptime",
    "passback_downtime",
    "passback_dex_count",
    "passback_alternate_names",
    # source-specific raw — Stanford
    "stanford_symbolic",
    "stanford_components",
    # normalized interpretation
    "notation_primary",
    "notation_primary_system",
    "operational_notation",
    "operational_notation_convention",
    "add_formula_primary",
    "add_formula_convention",
    "source_add_claim",
    "source_add_system",
    "add_gap",
    # quality
    "parser_status",
    "promotion_readiness",
    "blocker_notes",
    "curator_notes",
]


def empty_row() -> dict:
    return {col: "" for col in CSV_COLUMNS}


# ----------------------------- canonical DB ----------------------------------

def parse_canonical_db() -> list[dict]:
    rows: list[dict] = []
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # All freestyle_tricks (active + pending, NO is_active filter so we
    # don't silently drop pending review rows).
    cur.execute("""
        SELECT slug, canonical_name, adds, base_trick, trick_family,
               category, description, notation, operational_notation,
               operational_notation_source, review_status, is_active
        FROM freestyle_tricks
        ORDER BY slug
    """)
    for r in cur.fetchall():
        row = empty_row()
        slug = (r["slug"] or "").strip()
        row["canonical_slug"] = slug
        row["source_slug"] = slug
        row["source_name"] = r["canonical_name"] or ""
        row["source_system"] = "canonical_db"
        row["source_subsystem"] = "freestyle_tricks"
        row["source_record_id"] = slug
        row["publication_status"] = (
            "canonical_active" if r["is_active"] == 1
            else f"canonical_{r['review_status'] or 'inactive'}"
        )
        row["official_add"] = r["adds"] or ""
        row["notation_primary"] = r["notation"] or ""
        row["notation_primary_system"] = "jobs_notation" if r["notation"] else ""
        row["operational_notation"] = r["operational_notation"] or ""
        if r["operational_notation"]:
            # canonical-bracket convention when ALL CAPS + [BRACKET]; FM convention when (parens).
            opn = r["operational_notation"]
            if "(" in opn and ")" in opn and opn.upper() != opn:
                row["operational_notation_convention"] = "fm_parens"
            elif "[" in opn:
                row["operational_notation_convention"] = "canonical_brackets"
            else:
                row["operational_notation_convention"] = "plain"
        row["source_add_claim"] = r["adds"] or ""
        row["source_add_system"] = "ifpa_canonical"
        row["curator_notes"] = (r["description"] or "")[:300]
        rows.append(row)

    con.close()
    return rows


# ----------------------------- observational TS ------------------------------

OBS_ROW_RE = re.compile(
    r"folkSlug:\s*'([^']+)'[\s\S]*?"
    r"displayName:\s*'([^']+)'[\s\S]*?"
    r"proposedReadings:\s*\[([^\]]*)\][\s\S]*?"
    r"proposedAddFormula:\s*(null|'[^']*')[\s\S]*?"
    r"proposedAddTotal:\s*([0-9]+|null)[\s\S]*?"
    r"sourceLabel:\s*'([^']*)'[\s\S]*?"
    r"sourceCitation:\s*'([^']*)'",
    re.DOTALL,
)


def parse_observational_ts() -> list[dict]:
    rows: list[dict] = []
    if not OBSERVATIONAL_TS.exists():
        return rows
    text = OBSERVATIONAL_TS.read_text(encoding="utf-8")
    for m in OBS_ROW_RE.finditer(text):
        slug, display, readings_blob, formula, add, label, citation = m.groups()
        # Pull each 'string' from the readings array.
        readings = [
            r.strip().strip("'")
            for r in re.findall(r"'([^']*)'", readings_blob)
        ]
        formula_val = "" if formula == "null" else formula.strip("'")
        row = empty_row()
        row["canonical_slug"] = slug
        row["source_slug"] = slug
        row["source_name"] = display
        row["source_system"] = "observational_ts"
        row["source_subsystem"] = "emerging_vocabulary"
        row["source_record_id"] = slug
        row["publication_status"] = "observational"
        row["source_add_claim"] = "" if add == "null" else add
        row["source_add_system"] = "passback_observational_claim"
        if readings:
            primary_reading = readings[0]
            row["passback_reading_raw"] = " | ".join(readings)
            row["notation_primary"] = primary_reading
            row["notation_primary_system"] = "observational_reading"
            row["operational_notation"] = primary_reading
            row["operational_notation_convention"] = (
                "canonical_brackets" if "[" in primary_reading else "natural_prose"
            )
        if formula_val:
            row["add_formula_primary"] = formula_val
            row["add_formula_convention"] = (
                "canonical_brackets" if "[" in formula_val else "fm_parens"
            )
        row["curator_notes"] = f"source_label={label}; citation={citation[:120]}"
        rows.append(row)
    return rows


# ----------------------------- tracked names TS ------------------------------

TRACKED_ROW_RE = re.compile(
    r"\{\s*displayName:\s*'([^']*)'[^}]*?slug:\s*'([^']+)'(?:[^}]*?operationalNotation:\s*'([^']*)')?"
    r"(?:[^}]*?formulaProvenance:\s*'([^']*)')?(?:[^}]*?formulaConfidence:\s*'([^']*)')?",
    re.DOTALL,
)


def parse_tracked_names_ts() -> list[dict]:
    rows: list[dict] = []
    if not TRACKED_NAMES_TS.exists():
        return rows
    text = TRACKED_NAMES_TS.read_text(encoding="utf-8")
    for m in TRACKED_ROW_RE.finditer(text):
        display, slug, opn, prov, conf = m.groups()
        row = empty_row()
        row["canonical_slug"] = slug
        row["source_slug"] = slug
        row["source_name"] = display
        row["source_system"] = "tracked_names_ts"
        row["source_subsystem"] = "freestyle_tracked_names"
        row["source_record_id"] = slug
        row["publication_status"] = "tracked_unpublished"
        if opn:
            row["fm_formula_raw"] = opn
            row["fm_job_raw"] = opn
            row["operational_notation"] = opn
            row["operational_notation_convention"] = "fm_parens"
        if prov:
            row["fm_source_file"] = f"provenance={prov}"
        if conf:
            row["curator_notes"] = f"confidence={conf}"
        rows.append(row)
    return rows


# ----------------------------- FM inventory CSV ------------------------------

def parse_fm_inventory() -> list[dict]:
    rows: list[dict] = []
    if not FM_INVENTORY_CSV.exists():
        return rows
    with FM_INVENTORY_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            display = (r.get("display_name") or "").strip()
            if not display:
                continue
            slug = slugify(display)
            row = empty_row()
            row["canonical_slug"] = slug
            row["source_slug"] = slug
            row["source_name"] = display
            row["source_system"] = "fm_inventory"
            row["source_subsystem"] = "footbagmoves_inventory"
            row["source_record_id"] = r.get("synthetic_external_id") or slug
            row["publication_status"] = "fm_corpus_entry"
            row["fm_formula_raw"] = r.get("operational_notation_raw") or ""
            row["fm_job_raw"] = r.get("operational_notation_raw") or ""
            row["fm_add_claim"] = r.get("add_count") or ""
            row["fm_technical_name"] = r.get("technical_name") or ""
            row["fm_aliases_raw"] = r.get("aliases_raw") or ""
            row["fm_source_file"] = r.get("source_paste_file") or ""
            row["source_add_claim"] = r.get("add_count") or ""
            row["source_add_system"] = "fm_inventory_claim"
            if row["fm_formula_raw"]:
                row["operational_notation"] = row["fm_formula_raw"]
                row["operational_notation_convention"] = "fm_parens"
                row["notation_primary"] = row["fm_formula_raw"]
                row["notation_primary_system"] = "fm_set_arc"
            same_side = r.get("same_side_variant", "0") or "0"
            if same_side == "1":
                row["curator_notes"] = "same_side_variant"
            rows.append(row)
    return rows


# ----------------------------- FM symbolic grammar CSV -----------------------

def parse_fm_symbolic_grammar() -> list[dict]:
    rows: list[dict] = []
    if not FM_SYMBOLIC_GRAMMAR_CSV.exists():
        return rows
    with FM_SYMBOLIC_GRAMMAR_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, r in enumerate(reader):
            move = (r.get("move_name") or "").strip()
            slug_field = (r.get("canonical_slug") or "").strip()
            display = (r.get("display_name") or "").strip() or move
            if not move and not slug_field:
                continue
            inferred_slug = slug_field or slugify(move or display)
            row = empty_row()
            row["canonical_slug"] = inferred_slug
            row["source_slug"] = inferred_slug
            row["source_name"] = move or display
            row["source_system"] = "fm_symbolic_grammar"
            row["source_subsystem"] = r.get("source") or "footbagmoves"
            row["source_record_id"] = f"sg__{i}__{inferred_slug or 'noname'}"
            row["publication_status"] = (
                r.get("publication_status") or "fm_grammar_observation"
            )
            row["fm_formula_raw"] = r.get("symbolic_notation_raw") or ""
            row["fm_job_raw"] = r.get("symbolic_notation_raw") or ""
            row["fm_add_claim"] = r.get("source_adds") or ""
            row["fm_technical_name"] = r.get("technical_name") or ""
            row["fm_aliases_raw"] = r.get("alternate_names") or ""
            row["fm_source_file"] = r.get("source_file") or ""
            row["source_add_claim"] = r.get("source_adds") or ""
            row["source_add_system"] = "fm_grammar_claim"
            if row["fm_formula_raw"]:
                row["operational_notation"] = row["fm_formula_raw"]
                row["operational_notation_convention"] = (
                    "canonical_brackets" if "[" in row["fm_formula_raw"] else "fm_parens"
                )
                row["notation_primary"] = row["fm_formula_raw"]
                row["notation_primary_system"] = "fm_set_arc"
            row["add_formula_primary"] = r.get("add_formula") or ""
            if r.get("add_formula"):
                row["add_formula_convention"] = (
                    "canonical_brackets" if "[" in (r.get("add_formula") or "") else "fm_parens"
                )
            # Quality fields
            row["parser_status"] = r.get("review_status") or r.get("parse_confidence") or ""
            blockers = []
            if r.get("doctrine_status"):
                blockers.append(f"doctrine={r['doctrine_status']}")
            if r.get("unresolved_questions"):
                blockers.append(f"unresolved={r['unresolved_questions'][:80]}")
            row["blocker_notes"] = "; ".join(blockers)
            row["curator_notes"] = (r.get("notes") or r.get("provenance_notes") or "")[:300]
            rows.append(row)
    return rows


# ----------------------------- FB.org per-ADD text files ----------------------

FBORG_ADD_FILES = [
    ("fborg-1add.txt", 1),
    ("fborg-2add.txt", 2),
    ("fborg-3add.txt", 3),
    ("fborg-4add.txt", 4),
    ("fborg-5add.txt", 5),
    ("fborg-6add.txt", 6),
    ("fborg-7add.txt", 7),
    ("fundamentalmoves.txt", None),
    ("paradoxMoves.txt", None),
    ("gyroMoves.txt", None),
    ("blurryMoves.txt", None),
    ("pixieMoves.txt", None),
]

ADDS_LINE_RE = re.compile(r"^\s*(\d+)\s+adds?\s*$", re.IGNORECASE)
SET_ARC_PREFIX_RE = re.compile(
    r"^\s*(SET|TOE|CLIP|INSIDE|OUTSIDE|DRAGON|JUMP|FRIGIDOSIS|OP|SAME|PIXIE|FAIRY|ATOMIC|NUCLEAR|QUASI|QUANTUM)\b",
    re.IGNORECASE,
)
FLAGS_ONLY_RE = re.compile(r"^\s*(?:\[\w+\]\s*)+$")


def parse_fborg_file(path: Path, default_adds: Optional[int]) -> list[dict]:
    """Tolerant state-machine parser for the fborg /newmoves text dumps.

    Each entry has the rough shape:
        <name line>
        [pronunciation line]?
        N add[s]
        [optional empty]
        <set-arc notation line>?
        <description paragraph(s)>?
        [optional flags-only line]?

    Some entries (the 1-ADD dumps) compress everything onto two lines:
        <name>
        N add\t<description>\t[flags]
    """
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = [ln.rstrip("\n") for ln in text.splitlines()]
    rows: list[dict] = []
    pending_name: Optional[str] = None
    pending_pron: Optional[str] = None

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        # Header noise drops
        if (
            "FOOTBAG WORLDWIDE" in stripped
            or "FREESTYLE MOVE LIST" in stripped
            or re.match(r"^\d+-Add Moves", stripped)
            or stripped in {"Fundamental Moves", "Discover more", "footbag"}
            or re.match(r"^Add-Category", stripped)
        ):
            i += 1
            continue

        # Compact 1-ADD shape: a single line carrying name + adds + description
        # (and optionally flags), tab-separated. Only fire when the line has
        # AT LEAST 3 substantive parts after splitting on tabs — otherwise this
        # is the start of a multi-line entry whose adds line has trailing tabs.
        if "\t" in line and re.search(r"\d+\s+adds?\b", line, re.IGNORECASE):
            parts = [p.strip() for p in line.split("\t") if p.strip()]
            has_adds_part = any(ADDS_LINE_RE.match(p) for p in parts)
            has_desc_part = any(
                (not ADDS_LINE_RE.match(p))
                and (not FLAGS_ONLY_RE.match(p))
                and len(p) > 10
                for p in parts
            )
            if has_adds_part and has_desc_part and len(parts) >= 2:
                adds_val = None
                desc = ""
                flags = ""
                name = pending_name
                for p in parts:
                    if ADDS_LINE_RE.match(p):
                        adds_val = int(ADDS_LINE_RE.match(p).group(1))
                    elif FLAGS_ONLY_RE.match(p):
                        flags = p
                    elif name is None:
                        name = p
                    else:
                        desc = desc + (" " if desc else "") + p
                if name and adds_val is not None:
                    rows.append(
                        make_fborg_row(name, adds_val, "", desc, flags, path.name)
                    )
                    pending_name = None
                    pending_pron = None
                i += 1
                continue
            # Fall through: this line is "N adds<tabs>" — treat as multi-line
            # adds anchor below.

        adds_match = ADDS_LINE_RE.match(stripped)
        if adds_match:
            adds_val = int(adds_match.group(1))
            # Look ahead for set-arc and description
            notation = ""
            description = ""
            flags = ""
            j = i + 1
            while j < len(lines):
                la = lines[j].strip()
                if not la:
                    j += 1
                    continue
                # Stop when next entry begins (next "N add[s]" line or new
                # name line followed within ~3 lines by adds).
                if ADDS_LINE_RE.match(la):
                    break
                if FLAGS_ONLY_RE.match(la):
                    flags = la
                    j += 1
                    continue
                if not notation and SET_ARC_PREFIX_RE.match(la):
                    notation = la
                    j += 1
                    continue
                # Treat as description / next-name probe. If subsequent
                # 1-3 lines reveal an adds line, current line is next-name.
                look_for_adds = False
                for k in range(j + 1, min(j + 4, len(lines))):
                    if ADDS_LINE_RE.match(lines[k].strip()):
                        look_for_adds = True
                        break
                if look_for_adds and description:
                    # This is the next entry's name line. Stop.
                    break
                description = description + (" " if description else "") + la
                j += 1
            rows.append(
                make_fborg_row(
                    pending_name or "", adds_val, notation, description, flags, path.name
                )
            )
            pending_name = None
            pending_pron = None
            i = j
            continue

        # Pronunciation lines look like "ba-razh'" — heuristic: contains hyphen
        # or apostrophe, all-lower, short.
        if (
            pending_name
            and len(stripped) < 30
            and re.match(r"^[a-z'\-\s]+$", stripped)
        ):
            pending_pron = stripped
            i += 1
            continue

        # Otherwise treat as a name line (possibly with trailing '*' marker).
        pending_name = stripped.rstrip("*").strip()
        i += 1

    # Tag pronunciation onto rows if we captured one
    if pending_pron and rows and not rows[-1].get("curator_notes"):
        rows[-1]["curator_notes"] = f"pronunciation={pending_pron}"
    return rows


def make_fborg_row(
    name: str,
    adds_val: int,
    notation: str,
    description: str,
    flags: str,
    source_file: str,
) -> dict:
    name = name.strip().rstrip("*").strip()
    slug = slugify(name)
    row = empty_row()
    row["canonical_slug"] = slug
    row["source_slug"] = slug
    row["source_name"] = name
    row["source_system"] = "fborg_text"
    row["source_subsystem"] = source_file
    row["source_record_id"] = f"fborg__{source_file}__{slug or 'unnamed'}"
    row["publication_status"] = "fborg_corpus_entry"
    row["fborg_formula_raw"] = notation
    row["fborg_job_raw"] = notation
    row["fborg_add_claim"] = str(adds_val) if adds_val is not None else ""
    row["fborg_description_raw"] = description[:600] if description else ""
    row["fborg_source_file"] = source_file
    row["source_add_claim"] = str(adds_val) if adds_val is not None else ""
    row["source_add_system"] = "fborg_textfile_claim"
    if notation:
        row["operational_notation"] = notation
        row["operational_notation_convention"] = "canonical_brackets"
        row["notation_primary"] = notation
        row["notation_primary_system"] = "fborg_set_arc"
    if flags:
        row["add_formula_primary"] = flags
        row["add_formula_convention"] = "canonical_brackets"
    return row


def parse_fborg_text_corpus() -> list[dict]:
    rows: list[dict] = []
    for name, default_adds in FBORG_ADD_FILES:
        p = FBORG_DIR / name
        rows.extend(parse_fborg_file(p, default_adds))
    return rows


# ----------------------------- FBORG insert staging --------------------------

def parse_fborg_insert_staging() -> list[dict]:
    rows: list[dict] = []
    if not FBORG_INSERT_STAGING_CSV.exists():
        return rows
    with FBORG_INSERT_STAGING_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            slug = (r.get("canonical_slug") or "").strip()
            display = (r.get("display_name") or "").strip()
            if not slug and not display:
                continue
            inferred = slug or slugify(display)
            row = empty_row()
            row["canonical_slug"] = inferred
            row["source_slug"] = inferred
            row["source_name"] = display
            row["source_system"] = "fborg_insert_staging"
            row["source_subsystem"] = r.get("source") or "fborg"
            row["source_record_id"] = f"fborg_stg__{inferred or 'noname'}"
            row["publication_status"] = (
                f"fborg_staging_{r.get('recommended_decision') or 'unknown'}"
            )
            row["fborg_formula_raw"] = r.get("symbolic_notation_raw") or ""
            row["fborg_job_raw"] = r.get("symbolic_notation_raw") or ""
            row["fborg_add_claim"] = r.get("source_adds") or ""
            row["fborg_description_raw"] = (r.get("source_description") or "")[:600]
            row["fborg_source_file"] = r.get("source_file") or ""
            row["source_add_claim"] = r.get("source_adds") or ""
            row["source_add_system"] = "fborg_staging_claim"
            if row["fborg_formula_raw"]:
                row["operational_notation"] = row["fborg_formula_raw"]
                row["operational_notation_convention"] = "canonical_brackets"
                row["notation_primary"] = row["fborg_formula_raw"]
                row["notation_primary_system"] = "fborg_set_arc"
            row["add_formula_primary"] = r.get("add_formula") or ""
            row["add_formula_convention"] = (
                "canonical_brackets" if "[" in (r.get("add_formula") or "") else ""
            )
            blockers = []
            if r.get("doctrine_status"):
                blockers.append(f"doctrine={r['doctrine_status']}")
            if r.get("recommended_decision"):
                blockers.append(f"triage={r['recommended_decision']}")
            row["blocker_notes"] = "; ".join(blockers)
            row["curator_notes"] = (
                (r.get("curator_notes") or r.get("triage_rationale") or "")[:300]
            )
            rows.append(row)
    return rows


# ----------------------------- PassBack staging -------------------------------

def parse_passback_trick_sources() -> list[dict]:
    rows: list[dict] = []
    if not PASSBACK_TRICK_SOURCES_CSV.exists():
        return rows
    with PASSBACK_TRICK_SOURCES_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            primary = (r.get("passback_primary_name") or "").strip()
            candidate = (r.get("candidate_trick_slug") or "").strip()
            normalized = (r.get("normalized_primary_name") or "").strip()
            if not primary and not candidate:
                continue
            inferred = candidate or slugify(normalized or primary)
            row = empty_row()
            row["canonical_slug"] = inferred
            row["source_slug"] = inferred
            row["source_name"] = primary
            row["source_system"] = "passback_intake"
            row["source_subsystem"] = "passback_trick_sources"
            row["source_record_id"] = f"pb_ts__{inferred or 'noname'}__{r.get('source_file', '')}"
            row["publication_status"] = (
                f"passback_intake_{r.get('match_status') or 'unknown'}"
            )
            row["passback_reading_raw"] = r.get("passback_technical_name") or ""
            row["passback_add_claim"] = r.get("passback_dex_count") or ""
            row["passback_uptime"] = r.get("passback_uptime_component") or ""
            row["passback_downtime"] = r.get("passback_downtime_component") or ""
            row["passback_dex_count"] = r.get("passback_dex_count") or ""
            row["passback_alternate_names"] = r.get("passback_alternate_names") or ""
            row["source_add_claim"] = r.get("passback_dex_count") or ""
            row["source_add_system"] = "passback_observational_claim"
            blocker = []
            if r.get("passback_dex_count_vs_ifpa_adds"):
                blocker.append(f"vs_ifpa={r['passback_dex_count_vs_ifpa_adds']}")
            row["blocker_notes"] = "; ".join(blocker)
            row["curator_notes"] = (r.get("operator_notes") or r.get("passback_notes") or "")[:300]
            row["parser_status"] = r.get("review_status") or ""
            rows.append(row)
    return rows


def parse_passback_source_links() -> list[dict]:
    rows: list[dict] = []
    if not PASSBACK_SOURCE_LINKS_CSV.exists():
        return rows
    with PASSBACK_SOURCE_LINKS_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            slug = (r.get("trick_slug") or "").strip()
            if not slug:
                continue
            row = empty_row()
            row["canonical_slug"] = slug
            row["source_slug"] = slug
            row["source_name"] = r.get("external_ref") or slug
            row["source_system"] = "passback_source_links"
            row["source_subsystem"] = r.get("source_id") or "passback"
            row["source_record_id"] = f"pb_sl__{slug}"
            row["publication_status"] = "passback_source_link_authored"
            row["passback_reading_raw"] = r.get("asserted_notation") or ""
            row["passback_add_claim"] = r.get("asserted_adds") or ""
            row["source_add_claim"] = r.get("asserted_adds") or ""
            row["source_add_system"] = "passback_authored_claim"
            row["curator_notes"] = (r.get("notes") or "")[:300]
            rows.append(row)
    return rows


# ----------------------------- Stanford corpus -------------------------------

# Mirrors the parser in extract_stanford_master.py
STANFORD_TOKEN_MAP = {
    "Z": "toe-set",
    "X": "clipper-set",
    "*": "any-set",
    "L": "inside-set",
    "D": "dragon-set",
    "F": "frigid-osis",
    "U": "pendulum",
    "R": "rake",
    "+": "same-side",
    "-": "opposite-side",
    "0": "out-in-dex",
    "1": "in-out-dex",
    ".": "peak",
    "!": "symposium",
    "^": "duck",
    "&": "dive",
    "/": "forward-spin",
    "\\": "backward-spin",
    "?": "any-body-flag",
}


def parse_stanford_components(token_string: str) -> list[str]:
    """Greedy tokenize Stanford shorthand into component labels."""
    out: list[str] = []
    i = 0
    while i < len(token_string):
        ch = token_string[i]
        # 2-char tokens (xS = crossbody sole)
        if i + 1 < len(token_string) and token_string[i:i + 2] in {"xS"}:
            out.append("crossbody-sole")
            i += 2
            continue
        if ch in STANFORD_TOKEN_MAP:
            out.append(STANFORD_TOKEN_MAP[ch])
            i += 1
            continue
        if ch.isspace():
            i += 1
            continue
        out.append(f"unknown:{ch}")
        i += 1
    return out


SHORTHAND_RE = re.compile(r"^[XZ\*LDFURxS\+\-01\.\!\^\&\/\\\?\s]+$")
ADD_BUCKET_RE = re.compile(r"^\s*(\d+)\s+ADD\s*$", re.IGNORECASE)


def parse_stanford_corpus() -> list[dict]:
    """Parse stanford-2.txt. Observed format:

        2 ADD
        <shorthand-line>
        <name-line (may include parenthetical aliases)>
        <blank>
        <shorthand-line>
        <name-line>
        ...
        3 ADD
        ...

    Blank lines separate entries; shorthand always precedes name within
    each entry. Aliases inside the name line use parentheses or commas.
    """
    rows: list[dict] = []
    if not STANFORD_TXT.exists():
        return rows
    text = STANFORD_TXT.read_text(encoding="utf-8", errors="replace")
    lines = [ln.strip() for ln in text.splitlines()]

    current_bucket: Optional[int] = None
    pending_shorthand: Optional[str] = None
    record_id = 0
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line:
            i += 1
            continue
        # ADD bucket header
        m = ADD_BUCKET_RE.match(line)
        if m:
            current_bucket = int(m.group(1))
            pending_shorthand = None
            i += 1
            continue
        # Skip the preamble lines before the first "2 ADD" header
        if current_bucket is None:
            i += 1
            continue
        # Shorthand line — every char in the token-set
        if SHORTHAND_RE.match(line) and re.search(r"[XZ\*LDFURxS]", line):
            pending_shorthand = line
            i += 1
            continue
        # Otherwise: name line (consumes pending shorthand)
        if pending_shorthand is None:
            # Free-text line without a shorthand companion — skip.
            i += 1
            continue
        # Names: split parenthetical aliases and comma-separated continuations
        # e.g. "Around The World (ATW)" -> ["Around The World", "ATW"]
        all_names: list[str] = []
        primary = re.sub(r"\s*\(([^)]+)\)\s*", "", line).strip()
        if primary:
            for chunk in primary.split(","):
                cn = chunk.strip()
                if cn:
                    all_names.append(cn)
        # captured parenthetical aliases
        for ali in re.findall(r"\(([^)]+)\)", line):
            for chunk in ali.split(","):
                cn = chunk.strip()
                if cn:
                    all_names.append(cn)
        if not all_names:
            pending_shorthand = None
            i += 1
            continue
        shorthand = pending_shorthand
        dex_count = sum(1 for c in shorthand if c in "01")
        components = parse_stanford_components(shorthand)
        parser_ok = all(not c.startswith("unknown:") for c in components)
        for nm in all_names:
            record_id += 1
            slug = slugify(nm)
            row = empty_row()
            row["canonical_slug"] = slug
            row["source_slug"] = slug
            row["source_name"] = nm
            row["source_system"] = "stanford_corpus"
            row["source_subsystem"] = "stanford-2.txt"
            row["source_record_id"] = f"sf__{record_id:04d}__{slug}"
            row["publication_status"] = "stanford_shorthand_authored"
            row["stanford_symbolic"] = shorthand
            row["stanford_components"] = json.dumps(components, ensure_ascii=False)
            row["parser_status"] = "parser-clean" if parser_ok else "needs-review"
            row["source_add_claim"] = str(current_bucket) if current_bucket else (
                str(dex_count) if dex_count else ""
            )
            row["source_add_system"] = "stanford_bucket_header"
            row["notation_primary"] = shorthand
            row["notation_primary_system"] = "stanford_shorthand"
            if nm != all_names[0]:
                row["curator_notes"] = f"alias_of={slugify(all_names[0])}"
            rows.append(row)
        pending_shorthand = None
        i += 1
    return rows


# ----------------------------- coverage report --------------------------------

def add_gap_field(row: dict, official_lookup: dict) -> None:
    """Compute add_gap when row has both source_add_claim and an official_add
    from the canonical-DB lookup of the same canonical_slug."""
    slug = row.get("canonical_slug")
    claim = row.get("source_add_claim")
    if not slug or not claim:
        return
    if row.get("source_system") == "canonical_db":
        return
    official = official_lookup.get(slug)
    if not official:
        return
    try:
        c = int(claim)
        o = int(official)
        row["add_gap"] = str(c - o)
        row["official_add"] = str(o)
    except (TypeError, ValueError):
        pass


def write_csv(rows: list[dict]) -> None:
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def coverage_table(name: str, expected: Optional[int], actual: int, note: str = "") -> str:
    status = "OK"
    if expected is None:
        status = "—"
    elif actual != expected:
        status = "MISMATCH"
    return f"| {name} | {expected if expected is not None else '—'} | {actual} | {status} | {note} |"


def build_report(
    rows: list[dict],
    counts_by_source: dict[str, int],
    expected_counts: dict[str, Optional[int]],
    note_by_source: dict[str, str],
    coverage_passes: bool,
) -> None:
    total = len(rows)
    by_slug: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        slug = r.get("canonical_slug") or ""
        if slug:
            by_slug[slug].append(r)
    unique_slugs = len(by_slug)

    # Source-system distribution of canonical_slug populated
    sources_per_slug: dict[str, set[str]] = defaultdict(set)
    for slug, srows in by_slug.items():
        for r in srows:
            sources_per_slug[slug].add(r["source_system"])
    multi_source = sum(1 for s in sources_per_slug.values() if len(s) >= 2)
    quad_or_more = sum(1 for s in sources_per_slug.values() if len(s) >= 4)

    # Missing-formula counts: a row claims a source but populated no formula
    # content at all. We treat add_formula_primary (e.g. "[dex]") as formula
    # content for fborg 1-ADD entries.
    missing_formula = Counter()
    for r in rows:
        sys = r["source_system"]
        has = bool(
            r.get("fm_formula_raw")
            or r.get("fborg_formula_raw")
            or r.get("passback_reading_raw")
            or r.get("stanford_symbolic")
            or r.get("operational_notation")
            or r.get("notation_primary")
            or r.get("add_formula_primary")
        )
        if not has:
            missing_formula[sys] += 1

    # add_gap distribution
    nonzero_gap = sum(1 for r in rows if r.get("add_gap") and r["add_gap"] != "0")
    zero_gap = sum(1 for r in rows if r.get("add_gap") == "0")

    # Likely alias / merge candidates: slugs with multi-source AND different
    # source_name strings (ignoring case).
    alias_merge_cands: list[tuple[str, set[str]]] = []
    for slug, srows in by_slug.items():
        names = {(r["source_name"] or "").strip().lower() for r in srows if r["source_name"]}
        if len(names) > 1:
            alias_merge_cands.append((slug, names))

    # Conflict count: rows with same canonical_slug differing on official_add /
    # source_add_claim — surface count + 10 examples.
    add_disagreements: list[tuple[str, list[tuple[str, str]]]] = []
    for slug, srows in by_slug.items():
        claims = [(r["source_system"], r.get("source_add_claim")) for r in srows if r.get("source_add_claim")]
        uniq = {c[1] for c in claims}
        if len(uniq) > 1:
            add_disagreements.append((slug, claims))

    # Promotion-ready rows: canonical_active OR backfill candidates
    promotion_ready = sum(
        1 for r in rows
        if r["source_system"] == "canonical_db"
        and r["publication_status"] == "canonical_active"
        and r.get("operational_notation")
    )
    notation_backfill_needed = sum(
        1 for r in rows
        if r["source_system"] == "canonical_db"
        and not r.get("operational_notation")
    )
    curator_review_needed = sum(
        1 for r in rows
        if r.get("parser_status") in {"needs-review", "needs_review"}
        or "doctrine=open" in (r.get("blocker_notes") or "")
    )

    lines: list[str] = []
    lines.append(f"# Comprehensive Symbolic Trick Corpus — Coverage Report ({TODAY})")
    lines.append("")
    lines.append(
        f"This report verifies the comprehensive corpus export at"
        f" `comprehensive_symbolic_trick_corpus_{TODAY}.csv`. Built by"
        f" `build_comprehensive_corpus.py`. Read-only review surface."
    )
    lines.append("")
    lines.append("## Coverage status")
    lines.append("")
    lines.append(f"**Overall:** {'PASS' if coverage_passes else 'FAIL — see source-row mismatches below'}")
    lines.append("")
    lines.append("| Source | Expected | Exported | Status | Notes |")
    lines.append("|---|---:|---:|---|---|")
    for name, actual in counts_by_source.items():
        exp = expected_counts.get(name)
        note = note_by_source.get(name, "")
        lines.append(coverage_table(name, exp, actual, note))
    lines.append("")
    lines.append("## Top-line metrics")
    lines.append("")
    lines.append(f"- Total exported rows: **{total}**")
    lines.append(f"- Unique canonical_slug values: **{unique_slugs}**")
    lines.append(f"- Slugs with ≥2 source-systems: **{multi_source}**")
    lines.append(f"- Slugs with ≥4 source-systems (strong promotion signal): **{quad_or_more}**")
    lines.append("")
    lines.append("## Missing-formula counts by source")
    lines.append("")
    lines.append("A row counted here exists in the source corpus but contributed NO notation/formula content.")
    lines.append("")
    lines.append("| Source | Rows with no formula content |")
    lines.append("|---|---:|")
    for sys, cnt in sorted(missing_formula.items(), key=lambda kv: -kv[1]):
        lines.append(f"| {sys} | {cnt} |")
    lines.append("")
    lines.append("## ADD-claim alignment (vs canonical_db official_add)")
    lines.append("")
    lines.append(f"- Rows where source claim exactly matches official_add: **{zero_gap}**")
    lines.append(f"- Rows where source claim DISAGREES with official_add (numeric gap recorded): **{nonzero_gap}**")
    lines.append(f"- Slugs with conflicting ADD claims across sources: **{len(add_disagreements)}**")
    lines.append("")
    if add_disagreements:
        lines.append("**First 20 ADD-conflict slugs (curator review surface):**")
        lines.append("")
        lines.append("| Slug | Claims |")
        lines.append("|---|---|")
        for slug, claims in add_disagreements[:20]:
            claims_fmt = "; ".join(f"{s}={a}" for s, a in claims)
            lines.append(f"| `{slug}` | {claims_fmt} |")
        lines.append("")
    lines.append("## Likely alias / merge candidates")
    lines.append("")
    lines.append(
        f"Slugs with ≥2 distinct source-name spellings (case-insensitive): **{len(alias_merge_cands)}**"
    )
    lines.append("")
    if alias_merge_cands:
        lines.append("**First 15 examples (curator review surface):**")
        lines.append("")
        lines.append("| Slug | Source names |")
        lines.append("|---|---|")
        for slug, names in alias_merge_cands[:15]:
            lines.append(f"| `{slug}` | {' / '.join(sorted(names))} |")
        lines.append("")
    lines.append("## Promotion-readiness signals")
    lines.append("")
    lines.append(f"- Canonical-DB rows with operational_notation populated (promotion-ready): **{promotion_ready}**")
    lines.append(f"- Canonical-DB rows with NO operational_notation (notation backfill needed): **{notation_backfill_needed}**")
    lines.append(f"- Rows flagged for curator review (parser/doctrine): **{curator_review_needed}**")
    lines.append("")
    lines.append("## Source-system distribution (rows)")
    lines.append("")
    lines.append("| Source system | Rows |")
    lines.append("|---|---:|")
    for sys, cnt in sorted(counts_by_source.items(), key=lambda kv: -kv[1]):
        lines.append(f"| `{sys}` | {cnt} |")
    lines.append("")
    lines.append("## Naming")
    lines.append("")
    lines.append(
        "Per the slice brief, this corpus is named **comprehensive symbolic"
        " corpus** rather than \"master\" until all coverage checks pass and"
        " the curator approves promotion. If `Overall: FAIL` above, the"
        " mismatched-row sources need investigation before the corpus can"
        " be promoted to \"master\" status."
    )
    lines.append("")
    OUT_REPORT.write_text("\n".join(lines), encoding="utf-8")


# ----------------------------- entry point ------------------------------------

def main() -> int:
    print(f"[build_comprehensive_corpus] writing {OUT_CSV}")

    extractors = [
        ("canonical_db", parse_canonical_db),
        ("observational_ts", parse_observational_ts),
        ("tracked_names_ts", parse_tracked_names_ts),
        ("fm_inventory", parse_fm_inventory),
        ("fm_symbolic_grammar", parse_fm_symbolic_grammar),
        ("fborg_text", parse_fborg_text_corpus),
        ("fborg_insert_staging", parse_fborg_insert_staging),
        ("passback_intake", parse_passback_trick_sources),
        ("passback_source_links", parse_passback_source_links),
        ("stanford_corpus", parse_stanford_corpus),
    ]

    expected_counts: dict[str, Optional[int]] = {
        "canonical_db": 184,
        "observational_ts": 62,
        "tracked_names_ts": 558,
        "fm_inventory": 573,
        "fm_symbolic_grammar": 854,
        "fborg_text": None,            # parser-derived; no a-priori target
        "fborg_insert_staging": 82,
        "passback_intake": 282,
        "passback_source_links": 95,
        "stanford_corpus": None,        # parser-derived
    }

    note_by_source: dict[str, str] = {
        "canonical_db": "freestyle_tricks rows (all, including is_active=0)",
        "observational_ts": "freestyleObservationalTricks.ts entries",
        "tracked_names_ts": "freestyleTrackedNames.ts entries (with or without notation)",
        "fm_inventory": "footbagmoves_inventory.csv non-header rows",
        "fm_symbolic_grammar": "SYMBOLIC_GRAMMAR_MASTER.csv non-header rows",
        "fborg_text": "fborg-Nadd.txt + category files (state-machine parser)",
        "fborg_insert_staging": "FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv non-header rows",
        "passback_intake": "passback_trick_sources.csv non-header rows",
        "passback_source_links": "passback_source_links_staging.csv non-header rows",
        "stanford_corpus": "stanford-2.txt parser (one row per name; aliases expanded)",
    }

    all_rows: list[dict] = []
    counts_by_source: dict[str, int] = {}
    for name, fn in extractors:
        rs = fn()
        counts_by_source[name] = len(rs)
        all_rows.extend(rs)
        print(f"  {name}: {len(rs)} rows")

    # Build canonical-DB official_add lookup for add_gap derivation
    official_lookup: dict[str, str] = {
        r["canonical_slug"]: r["official_add"]
        for r in all_rows
        if r["source_system"] == "canonical_db" and r.get("official_add")
    }
    for r in all_rows:
        add_gap_field(r, official_lookup)

    write_csv(all_rows)
    print(f"  TOTAL rows: {len(all_rows)}")

    # Compute coverage_passes: only flag fixed-expectation sources.
    coverage_passes = True
    for name, exp in expected_counts.items():
        if exp is not None and counts_by_source.get(name, 0) != exp:
            coverage_passes = False
            print(
                f"  COVERAGE MISMATCH: {name} expected={exp} got={counts_by_source[name]}"
            )

    build_report(
        all_rows, counts_by_source, expected_counts, note_by_source, coverage_passes,
    )
    print(f"[build_comprehensive_corpus] wrote {OUT_REPORT}")
    return 0 if coverage_passes else 1


if __name__ == "__main__":
    raise SystemExit(main())
