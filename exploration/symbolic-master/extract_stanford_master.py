#!/usr/bin/env python3
"""
extract_stanford_master.py
==========================

Parse exploration/stanford/stanford-2.txt into a structured list of
(stanford_shorthand, trick_name, add_bucket) tuples. Then cross-
reference with existing canonical tricks (DB + content modules) to
emit a master review CSV that preserves every notation system.

This is a read-only research utility. It writes ONLY to
exploration/symbolic-master/symbolic_trick_master_YYYY-MM-DD.csv.

Usage:
  python3 extract_stanford_master.py

Schema (per the slice brief Part B):
  slug, canonical_name, display_name, hashtag,
  publication_status, first_class_tier,
  family, base_trick, modifiers,
  notation_primary, notation_primary_system,
  operational_notation, operational_notation_source,
  stanford_symbolic, stanford_symbolic_normalized,
  stanford_components, stanford_parseable,
  official_add, add_formula_primary, source_add_claim,
  source_primary, source_refs,
  parser_status, shorthand_status, notation_gap, curator_notes
"""

from __future__ import annotations

import csv
import json
import re
import sqlite3
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STANFORD_TXT = ROOT / "exploration" / "stanford" / "stanford-2.txt"
DB_PATH = ROOT / "database" / "footbag.db"
OUT_CSV = ROOT / "exploration" / "symbolic-master" / f"symbolic_trick_master_{date.today().isoformat()}.csv"


def slugify(name: str) -> str:
    """Lowercase + replace whitespace/punctuation with hyphens.

    Mirrors the project's canonical name → slug rule (lowercase, hyphens,
    NFKC-normalized, strip non-alphanumeric except hyphens).
    """
    name = unicodedata.normalize("NFKC", name).lower().strip()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"\s+", "-", name)
    return name


# ───────────────────────────────────────────────────────────────────────────
# Stanford parser: walks the corpus and emits (shorthand, name, add_bucket)
# triples. The corpus structure (per stanford-2.txt 2026-05-23):
#
#   <intro paragraph>
#
#   2 ADD
#   <shorthand line>
#
#   <name line>            ← may include parenthetical alias
#
#   <shorthand line>
#
#   <name line>
#   ...
#
#   3 ADD
#   ...
#
# Some shorthand lines hold the trick name in parens (folk-name alias);
# we capture both name + alias when present.
# ───────────────────────────────────────────────────────────────────────────


_HEADER_LINE = re.compile(r"^\s*([0-9]+)\s+ADD\s*$")
# A shorthand line is non-empty and contains stanford-syntax characters
# (Z, X, L, D, U, R, S, F, H, V, K, *, +, -, ., 0-9, 6, 9, /, \, !, ^, &, _, |, x, w, k, etc.)
# but no full English words. Heuristic: contains at least one of the
# syntactic operators or contains a single-letter set token.
_OPERATOR_CHARS = set("+-/.\\!^&_|*0123456789")
_SET_LETTERS = set("ZXLDURSFHVK")


def looks_like_shorthand(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    # Must have at least one operator char or set-letter, AND must NOT
    # have a word like "Stall", "Mirage", "Toe" (proper-noun trick name).
    # Trick names always have spaces and English words; shorthand may
    # have spaces (e.g. "*. X") but is short.
    if len(s) > 25 and " " in s and s[0].isupper() and any(c.islower() for c in s):
        # Mixed-case long string with spaces → probably a trick name.
        return False
    has_op = any(c in _OPERATOR_CHARS for c in s)
    has_set = any(c in _SET_LETTERS for c in s)
    # English-word heuristic: more than two letters in a row of lowercase
    # alphabetic means it's a word.
    if re.search(r"[a-z]{3,}", s):
        return False
    return has_op or has_set


def parse_stanford(path: Path) -> list[dict]:
    rows: list[dict] = []
    current_add: int | None = None
    pending_shorthand: str | None = None

    lines = path.read_text(encoding="utf-8").splitlines()
    # Skip preamble (lines before first ADD header).
    started = False

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            continue

        m = _HEADER_LINE.match(line)
        if m:
            current_add = int(m.group(1))
            started = True
            pending_shorthand = None
            continue

        if not started or current_add is None:
            continue

        if looks_like_shorthand(stripped) and pending_shorthand is None:
            pending_shorthand = stripped
            continue

        if pending_shorthand is not None:
            # Treat this line as the trick name; aliases may live in parens.
            name = stripped
            primary = re.sub(r"\s*\([^)]*\)\s*", "", name).strip() or name
            alias_match = re.search(r"\(([^)]+)\)", name)
            alias = alias_match.group(1).strip() if alias_match else None
            rows.append({
                "stanford_shorthand": pending_shorthand,
                "trick_name": primary,
                "trick_alias": alias,
                "add_bucket": current_add,
            })
            pending_shorthand = None

    return rows


# ───────────────────────────────────────────────────────────────────────────
# Canonical join: load every active trick from the DB so we can attach
# slug + family + base + op_notation + canonical ADD to the Stanford rows
# by name match (slugified).
# ───────────────────────────────────────────────────────────────────────────


def load_canonical_index() -> dict[str, dict]:
    if not DB_PATH.exists():
        print(f"WARNING: {DB_PATH} not present; canonical join will be empty", file=sys.stderr)
        return {}
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute("""
        SELECT slug, canonical_name, adds, base_trick, trick_family, category,
               notation, operational_notation, operational_notation_source,
               aliases_json, review_status, is_active
        FROM freestyle_tricks
    """).fetchall()
    conn.close()

    index: dict[str, dict] = {}
    for r in rows:
        slug, canonical, adds, base, family, category, notation, op, op_source, aliases_json, review, is_active = r
        try:
            aliases = json.loads(aliases_json) if aliases_json else []
        except Exception:
            aliases = []
        canonical_lc = (canonical or "").lower().strip()
        record = {
            "slug": slug,
            "canonical_name": canonical or "",
            "adds": str(adds) if adds is not None else "",
            "base_trick": base or "",
            "trick_family": family or "",
            "category": category or "",
            "notation": notation or "",
            "operational_notation": op or "",
            "operational_notation_source": op_source or "",
            "aliases": aliases,
            "review_status": review or "",
            "is_active": int(is_active or 0),
        }
        index[canonical_lc] = record
        for alias in aliases:
            alias_lc = alias.lower().strip()
            if alias_lc and alias_lc not in index:
                index[alias_lc] = record
    return index


# ───────────────────────────────────────────────────────────────────────────
# Stanford shorthand → token-level decomposition. Tokens are read in
# source order; emit a JSON-encoded list per row for the
# stanford_components column.
# ───────────────────────────────────────────────────────────────────────────


SET_LETTER_MAP = {
    "Z": "toe-set", "L": "inside-set", "X": "clipper-set", "D": "dragon-set",
    "U": "pendulum", "R": "rake", "S": "sole", "F": "frigid-osis",
    "H": "heel", "V": "pinch", "K": "knee", "*": "any-set",
}

OPERATOR_MAP = {
    "+": "same-side", "-": "opposite-side",
    "/": "forward-spin", "\\": "backward-spin",
    ".": "peak", "_": "plant", "!": "no-plant-while",
    "^": "duck", "&": "dive", "|": "or",
}

DEX_MAP = {
    "0": "out-in-dex", "1": "in-out-dex",
    "6": "back-dex-swirl", "9": "front-dex-reverse-swirl",
}


def tokenize_shorthand(s: str) -> list[str]:
    """Return a list of token labels in source order, per the Stanford
    token map in stanford-1.txt. Unknown characters become 'unknown:<c>'.
    """
    tokens: list[str] = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == " ":
            i += 1
            continue
        # Two-char patterns: 'xZ', 'xR', 'xS', 'xU' (cross-body prefix on a set)
        if c == "x" and i + 1 < len(s) and s[i + 1] in SET_LETTER_MAP:
            tokens.append(f"crossbody-{SET_LETTER_MAP[s[i + 1]]}")
            i += 2
            continue
        if c in SET_LETTER_MAP:
            tokens.append(SET_LETTER_MAP[c])
        elif c in DEX_MAP:
            tokens.append(DEX_MAP[c])
        elif c in OPERATOR_MAP:
            tokens.append(OPERATOR_MAP[c])
        elif c == "k":
            tokens.append("kick-suffix")
        elif c == "w":
            tokens.append("whirl-prefix")
        else:
            tokens.append(f"unknown:{c}")
        i += 1
    return tokens


def stanford_parseable(tokens: list[str]) -> bool:
    return all(not t.startswith("unknown:") for t in tokens)


def normalize_shorthand(s: str) -> str:
    """Lowercase + collapse whitespace. Stanford notation is case-sensitive
    (uppercase = set, lowercase = modifier prefix), so we DON'T lowercase
    the whole string. Just strip extraneous whitespace.
    """
    return re.sub(r"\s+", "", s)


# ───────────────────────────────────────────────────────────────────────────
# Master CSV row builder
# ───────────────────────────────────────────────────────────────────────────


COLUMNS = [
    # Identity
    "slug", "canonical_name", "display_name", "hashtag",
    # Publication
    "publication_status", "first_class_tier",
    # Movement ontology
    "family", "base_trick", "modifiers",
    # Primary notation
    "notation_primary", "notation_primary_system",
    # Job / operational
    "operational_notation", "operational_notation_source", "operational_notation_convention",
    # Stanford shorthand
    "stanford_symbolic", "stanford_symbolic_normalized",
    "stanford_components", "stanford_parseable",
    # Scoring
    "official_add", "add_formula_primary",
    "source_add_claim", "source_add_system",
    "doctrine_divergence_category",
    # Source lineage
    "source_primary", "source_refs",
    # Quality
    "parser_status", "shorthand_status",
    "notation_gap", "curator_notes",
]


def detect_notation_system(notation: str, op_notation: str) -> tuple[str, str]:
    """Return (primary_notation_value, primary_notation_system)."""
    # Prefer operational_notation if present.
    if op_notation:
        if "[" in op_notation and "]" in op_notation:
            return op_notation, "job_bracket"
        if "(" in op_notation and ")" in op_notation:
            return op_notation, "fm_parens"
        return op_notation, "mixed"
    if notation:
        # Compact notation (uppercase canonical name); not the same as JOB.
        return notation, "plain_self_token"
    return "", "missing"


def build_master_rows(stanford_rows: list[dict], canonical: dict[str, dict]) -> list[dict]:
    out: list[dict] = []
    seen_slugs: set[str] = set()

    # Pass 1: every Stanford row → look up canonical, emit master row.
    for s in stanford_rows:
        name_lc = s["trick_name"].lower().strip()
        canonical_match = canonical.get(name_lc)
        # Also try the alias if no direct match.
        if canonical_match is None and s.get("trick_alias"):
            canonical_match = canonical.get(s["trick_alias"].lower().strip())

        shorthand = s["stanford_shorthand"]
        components = tokenize_shorthand(shorthand)
        parseable = stanford_parseable(components)

        if canonical_match:
            slug = canonical_match["slug"]
            seen_slugs.add(slug)
            canonical_name = canonical_match["canonical_name"]
            display_name = canonical_name
            hashtag = "#" + slug.replace("-", "_")
            family = canonical_match["trick_family"]
            base = canonical_match["base_trick"]
            notation = canonical_match["notation"]
            op_notation = canonical_match["operational_notation"]
            op_source = canonical_match["operational_notation_source"]
            official_add = canonical_match["adds"]
            review_status = canonical_match["review_status"]
            is_active = canonical_match["is_active"]
            primary, system = detect_notation_system(notation, op_notation)
            pub_status = (
                "canonical" if is_active else "demoted_inactive"
            )
            source_primary = "canonical_db"
            source_refs = "stanford-2.txt | DB freestyle_tricks"
            curator_notes = ""
            if is_active == 0:
                curator_notes = f"is_active=0 in DB (review_status={review_status})"
            shorthand_status = "stanford_canonical_match" if parseable else "stanford_unparsed_match"
        else:
            # Stanford-only entry — no canonical row.
            slug = slugify(s["trick_name"])
            canonical_name = s["trick_name"]
            display_name = canonical_name
            hashtag = "#" + slug.replace("-", "_")
            family = ""
            base = ""
            notation = ""
            op_notation = ""
            op_source = ""
            official_add = ""
            primary = ""
            system = "missing"
            pub_status = "stanford_only_unpublished"
            source_primary = "stanford"
            source_refs = "stanford-2.txt"
            curator_notes = "stanford-only row; no canonical match by name"
            shorthand_status = "stanford_only" if parseable else "stanford_only_unparsed"

        out.append({
            "slug": slug,
            "canonical_name": canonical_name,
            "display_name": display_name,
            "hashtag": hashtag,
            "publication_status": pub_status,
            "first_class_tier": "",  # left blank; populated downstream by next pass if needed
            "family": family,
            "base_trick": base,
            "modifiers": "",
            "notation_primary": primary,
            "notation_primary_system": system,
            "operational_notation": op_notation,
            "operational_notation_source": op_source,
            "operational_notation_convention": "canonical_bracket" if (op_notation and "[" in op_notation) else (
                "fm_parens" if (op_notation and "(" in op_notation and "[" not in op_notation) else ""
            ),
            "stanford_symbolic": shorthand,
            "stanford_symbolic_normalized": normalize_shorthand(shorthand),
            "stanford_components": json.dumps(components, ensure_ascii=False),
            "stanford_parseable": "true" if parseable else "false",
            "official_add": official_add,
            "add_formula_primary": "",
            "source_add_claim": str(s["add_bucket"]) if pub_status == "stanford_only_unpublished" else "",
            "source_add_system": "stanford" if pub_status == "stanford_only_unpublished" else "",
            "doctrine_divergence_category": "",
            "source_primary": source_primary,
            "source_refs": source_refs,
            "parser_status": "",
            "shorthand_status": shorthand_status,
            "notation_gap": "no-job-no-stanford" if (not op_notation and not parseable) else (
                "no-job-stanford-only" if not op_notation else ""
            ),
            "curator_notes": curator_notes,
        })

    # Pass 2: canonical rows NOT covered by any Stanford line.
    for canonical_lc, rec in canonical.items():
        if rec["slug"] in seen_slugs:
            continue
        if rec["is_active"] != 1:
            continue
        # Skip alias entries (rec object is shared; we only want one row
        # per slug).
        if canonical_lc != rec["canonical_name"].lower().strip():
            continue
        seen_slugs.add(rec["slug"])
        primary, system = detect_notation_system(rec["notation"], rec["operational_notation"])
        out.append({
            "slug": rec["slug"],
            "canonical_name": rec["canonical_name"],
            "display_name": rec["canonical_name"],
            "hashtag": "#" + rec["slug"].replace("-", "_"),
            "publication_status": "canonical",
            "first_class_tier": "",
            "family": rec["trick_family"],
            "base_trick": rec["base_trick"],
            "modifiers": "",
            "notation_primary": primary,
            "notation_primary_system": system,
            "operational_notation": rec["operational_notation"],
            "operational_notation_source": rec["operational_notation_source"],
            "operational_notation_convention": "canonical_bracket" if (rec["operational_notation"] and "[" in rec["operational_notation"]) else "",
            "stanford_symbolic": "",
            "stanford_symbolic_normalized": "",
            "stanford_components": "[]",
            "stanford_parseable": "false",
            "official_add": rec["adds"],
            "add_formula_primary": "",
            "source_add_claim": "",
            "source_add_system": "",
            "doctrine_divergence_category": "",
            "source_primary": "canonical_db",
            "source_refs": "DB freestyle_tricks (no stanford entry)",
            "parser_status": "",
            "shorthand_status": "no_stanford_equivalent",
            "notation_gap": "no-job-no-stanford" if not rec["operational_notation"] else "no-stanford",
            "curator_notes": "",
        })

    out.sort(key=lambda r: (r["publication_status"], r["slug"]))
    return out


def write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> int:
    if not STANFORD_TXT.exists():
        print(f"FATAL: {STANFORD_TXT} not found", file=sys.stderr)
        return 1

    print(f"Parsing {STANFORD_TXT.relative_to(ROOT)} ...")
    stanford_rows = parse_stanford(STANFORD_TXT)
    print(f"  → {len(stanford_rows)} stanford rows")

    print(f"Loading canonical index from {DB_PATH.relative_to(ROOT)} ...")
    canonical = load_canonical_index()
    canonical_slugs = {r["slug"] for r in canonical.values()}
    print(f"  → {len(canonical_slugs)} canonical tricks")

    print("Building master CSV rows ...")
    master = build_master_rows(stanford_rows, canonical)
    print(f"  → {len(master)} master rows")

    print(f"Writing {OUT_CSV.relative_to(ROOT)} ...")
    write_csv(master, OUT_CSV)
    print(f"  → {OUT_CSV.stat().st_size} bytes")

    # Quick stats report.
    stats: dict[str, int] = {}
    parseable = 0
    canonical_match = 0
    stanford_only = 0
    no_op_notation = 0
    for r in master:
        stats[r["publication_status"]] = stats.get(r["publication_status"], 0) + 1
        if r["stanford_parseable"] == "true":
            parseable += 1
        if r["shorthand_status"].startswith("stanford_canonical"):
            canonical_match += 1
        if r["shorthand_status"].startswith("stanford_only"):
            stanford_only += 1
        if not r["operational_notation"]:
            no_op_notation += 1

    print("\nQuick stats:")
    print(f"  publication_status:    {stats}")
    print(f"  stanford parseable:    {parseable} / {len(master)}")
    print(f"  stanford↔canonical:    {canonical_match}")
    print(f"  stanford-only rows:    {stanford_only}")
    print(f"  rows missing JOB:      {no_op_notation}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
