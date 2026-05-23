#!/usr/bin/env python3
"""
Audit: derive ADD totals from operational_notation / shouty notation and
compare against the official ADD column on freestyle_tricks.

Read-only. No DB writes. No first-class promotion. No UI changes.

Strategic purpose: bridge from manual first-class promotion (hand-author
each ATOMIC_FLAG_DECOMPOSITIONS entry) toward scalable promotion (auto-
derive from curator-published notation when it converges).

Inputs read:
  - database/footbag.db (freestyle_tricks, freestyle_trick_modifiers,
    freestyle_trick_aliases)
  - src/services/freestyleService.ts
      FIRST_CLASS_TIER_1 / FIRST_CLASS_TIER_2     — cohort membership
      ATOMIC_FLAG_DECOMPOSITIONS                  — slug → totalAdd
      DOCTRINE_BLOCKED_SLUGS                      — gate
      FIRST_CLASS_ROTATIONAL_BASES                — rotational vs non
      SUI_GENERIS_SELF_TOKEN_SLUGS                — self-token primitives
  - src/content/freestyleResolvedFormulas.ts
      RESOLVED_FORMULAS_SPRINT_1                  — slug → totalAdd
  - src/content/freestyleTrickKindOverrides.ts
      MODIFIER_SLUGS / OPERATOR_SLUGS /
      SURFACE_SLUGS / PENDING_REVIEW_SLUGS        — kind filtering

Output:
  - exploration/derived-add-audit-YYYY-MM-DD.csv (one row per audited trick)
  - stdout: summary table + top-30 promotion candidates + top-30
    mismatches + top-30 grammar-gap tokens

Classification statuses:
  exact              derived ADD == official ADD
  missing-notation   official ADD exists but notation column is empty
  mismatch           derived ADD differs from official ADD
  doctrine-sensitive mismatch where slug ∈ DOCTRINE_BLOCKED_SLUGS
  unsupported-token  parser hit an unknown token (grammar gap)
  self-token         notation is a bare self-token (sui-generis primitive)
  context-dependent  leading token is in CONTEXT_DEPENDENT_TOKENS (e.g.
                     `double`) — universal +1 rule does not apply;
                     curator-published per-trick decomposition required

Promotion candidates: status='exact' AND not doctrine-blocked AND not
yet first-class. These are the safe-to-promote next-batch.
"""

import argparse
import csv
import re
import sqlite3
from collections import Counter
from datetime import date
from pathlib import Path


# ── Paths ────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
DEFAULT_DB = REPO_ROOT / "database" / "footbag.db"
FREESTYLE_SERVICE_TS = REPO_ROOT / "src" / "services" / "freestyleService.ts"
RESOLVED_FORMULAS_TS = REPO_ROOT / "src" / "content" / "freestyleResolvedFormulas.ts"
KIND_OVERRIDES_TS = REPO_ROOT / "src" / "content" / "freestyleTrickKindOverrides.ts"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "exploration"


# ── TS-source extractors (drift-resistant: re-derive from TS at runtime) ─
SLUG_LITERAL = re.compile(r"'([a-z0-9-]+)'")


def extract_set_literal(content: str, var_name: str) -> set:
    """Pull slugs from `const VAR_NAME ... = new Set([...])` (with or
    without ReadonlySet<string> type annotation; with or without explicit
    <string> generic on Set)."""
    pattern = (
        rf"const\s+{var_name}\b[^=]*=\s*"
        r"new\s+Set(?:<string>)?\(\[(.*?)\]\)"
    )
    m = re.search(pattern, content, re.DOTALL)
    if not m:
        return set()
    return set(SLUG_LITERAL.findall(m.group(1)))


def extract_atomic_decompositions(content: str) -> dict:
    """Pull {slug: totalAdd} from ATOMIC_FLAG_DECOMPOSITIONS map entries.
    Tolerates the inline shape `['<slug>', { decomposition: ..., totalAdd: N, ... }]`."""
    entries = re.findall(
        r"\['([a-z0-9-]+)',\s*\{[\s\S]*?totalAdd:\s*(\d+)",
        content,
    )
    return {slug: int(adds) for slug, adds in entries}


def extract_resolved_formulas(content: str) -> dict:
    """Pull {slug: totalAdd} from RESOLVED_FORMULAS_SPRINT_1 entries."""
    entries = re.findall(
        r"slug:\s*'([a-z0-9-]+)'[\s\S]*?totalAdd:\s*(\d+)",
        content,
    )
    return {slug: int(adds) for slug, adds in entries}


def load_ts_state() -> dict:
    fs = FREESTYLE_SERVICE_TS.read_text(encoding="utf-8")
    rf = RESOLVED_FORMULAS_TS.read_text(encoding="utf-8")
    ko = KIND_OVERRIDES_TS.read_text(encoding="utf-8")
    return {
        "first_class_tier_1":   extract_set_literal(fs, "FIRST_CLASS_TIER_1"),
        "first_class_tier_2":   extract_set_literal(fs, "FIRST_CLASS_TIER_2"),
        "doctrine_blocked":     extract_set_literal(fs, "DOCTRINE_BLOCKED_SLUGS"),
        "rotational_bases":     extract_set_literal(fs, "FIRST_CLASS_ROTATIONAL_BASES"),
        "sui_generis":          extract_set_literal(fs, "SUI_GENERIS_SELF_TOKEN_SLUGS"),
        "atomic":               extract_atomic_decompositions(fs),
        "resolved":             extract_resolved_formulas(rf),
        "modifier_slugs":       extract_set_literal(ko, "MODIFIER_SLUGS"),
        "operator_slugs":       extract_set_literal(ko, "OPERATOR_SLUGS"),
        "surface_slugs":        extract_set_literal(ko, "SURFACE_SLUGS"),
        "pending_review":       extract_set_literal(ko, "PENDING_REVIEW_SLUGS"),
    }


# ── DB loaders ───────────────────────────────────────────────────────────
def load_tricks(conn):
    return conn.execute("""
        SELECT slug, canonical_name, adds, base_trick, category,
               notation, operational_notation
        FROM freestyle_tricks
        WHERE is_active = 1
        ORDER BY slug
    """).fetchall()


def load_modifier_table(conn) -> dict:
    rows = conn.execute("""
        SELECT slug, add_bonus, add_bonus_rotational
        FROM freestyle_trick_modifiers
    """).fetchall()
    return {r[0]: (int(r[1] or 0), int(r[2] or 0)) for r in rows}


def load_alias_map(conn) -> dict:
    rows = conn.execute("""
        SELECT alias_slug, trick_slug FROM freestyle_trick_aliases
    """).fetchall()
    return {r[0]: r[1] for r in rows}


def load_canonical_adds(conn) -> dict:
    """Map slug → official adds (string form, may not be a digit)."""
    rows = conn.execute("""
        SELECT slug, adds FROM freestyle_tricks WHERE is_active = 1
    """).fetchall()
    return {r[0]: r[1] for r in rows}


# ── Helpers ──────────────────────────────────────────────────────────────
def slugify(token: str) -> str:
    """Mirror trick_name_to_slug in legacy_data loaders."""
    s = token.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def parse_int_add(raw):
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or not s.lstrip("-").isdigit():
        return None
    return int(s)


# Operational-notation bracket flags (ATAM convention; one ADD each).
# Case-insensitive — some op_notation entries use lowercase ([xbd] etc.).
ATAM_FLAGS = ("BOD", "DEX", "XBD", "DEL", "UNS")
BRACKET_FLAG_RE = re.compile(r"\[(BOD|DEX|XBD|DEL|UNS|PDX)\]", re.IGNORECASE)


# ── Parser vocabulary maps (curator-governed; expand cautiously) ─────────
# These four small maps encode parser-side knowledge that isn't (or
# shouldn't be) carried by the freestyle_trick_modifiers table. They're
# kept here rather than in the DB so the audit stays inspectable and the
# rules are easy to review.

# Token alias map: parser-side normalization for shouty-form tokens that
# aren't canonical modifier-table slugs. Resolves variant spellings to
# their canonical bucket/modifier slug for lookup.
MODIFIER_TOKEN_ALIASES = {
    # Curator 2026-05-22: cross-body normalizes to the xbody bucket for
    # parser/audit purposes (cross-body-sole-stall → xbody + sole-stall).
    'cross-body': 'xbody',
}

# Bucket-token weights: tokens that carry an ADD weight (the core
# foundational buckets — stall, dex, xbody, unusual surface, flying) but
# are NOT rows in freestyle_trick_modifiers. They appear inside curator
# decomposition strings (e.g. 'xbody(1) + stall(1) = 2 ADD') and in
# shouty notation as token-level annotations. Each = 1 ADD universally
# (no rotational/non-rotational distinction; the rotational distinction
# is for modifier-table modifiers only).
BUCKET_TOKEN_WEIGHTS = {
    'xbody': 1,
    'xbod':  1,  # alt spelling seen in osis decomposition
}

# Directional / alternate-notation tokens: descriptive markers that
# carry NO ADD weight by themselves. Recognized as zero-ADD in compound
# parses so the rest of the notation can derive cleanly; appear in the
# breakdown as `[directional: ...]` for transparency. Curator 2026-05-22:
# rev/reverse are alternate directional notation, not ADD operators —
# any ADD impact is already captured in the host trick's official total.
DIRECTIONAL_TOKENS = {
    'rev',
    'reverse',
}

# Context-dependent tokens: when present as a leading modifier, the
# trick requires a curator-published per-trick decomposition rather
# than a universal +1 rule. Curator 2026-05-22: `double` reads as
# multiplier / repeated / composite-marker depending on the host trick
# (double-leg-over is mirage+legover style, double-spin is rotation
# count, double-fairy may follow an equivalence). Parser refuses to
# invent a number and classifies as context-dependent for review.
CONTEXT_DEPENDENT_TOKENS = {
    'double',
}


def normalize_token(token: str, alias_map: dict) -> str:
    """Slugify a raw shouty-form token and walk parser-side + DB alias
    maps to its canonical lookup form."""
    s = slugify(token)
    s = MODIFIER_TOKEN_ALIASES.get(s, s)
    s = alias_map.get(s, s)
    return s


def strip_bracket_noise(text: str) -> str:
    """Drop bracket flags like [DEX] [BOD] from a notation string before
    token-based parsing (they're operational-form noise on the shouty
    column)."""
    return BRACKET_FLAG_RE.sub("", text)


def resolve_token(token: str, alias_map: dict, modifier_table: dict, canonical_adds: dict) -> str:
    """Resolve a raw token to a canonical slug, walking aliases. Returns
    the resolved slug (which may still be unknown to the modifier/canonical
    tables; the caller handles classification)."""
    s = slugify(token)
    # Alias walks one hop (alias tables in this codebase don't chain).
    return alias_map.get(s, s)


# ── Parser ───────────────────────────────────────────────────────────────
def parse_notation_compound(
    notation: str,
    own_slug: str,
    canonical_adds: dict,
    modifier_table: dict,
    alias_map: dict,
    rotational_bases: set,
):
    """Parse shouty-form notation (e.g. 'STEPPING PARADOX MIRAGE') and
    derive an ADD total. Returns
        (derived_add, breakdown_str, unsupported_tokens, base_slug)
    derived_add is None if no real-compound parse exists.

    Strategy: try take=1 then take=2 for the base trick. Prefer the
    candidate that yields a REAL COMPOUND (leading tokens are all
    recognized as modifiers, AND there is at least one leading token)
    over one that is a SELF-TAUTOLOGY (notation matches own slug with no
    leading modifiers). On self-tautology, return None so the caller
    can fall through to the self-token classifier — single-word slug-
    matching notations like 'BLENDER' or 'HOP OVER' should classify as
    self-token, not as a trivial exact-match via their own ADD lookup.
    """
    cleaned = strip_bracket_noise(notation)
    raw_tokens = [t for t in cleaned.split() if t.strip()]
    if not raw_tokens:
        return None, "", [], None

    # Search for a real-compound parse first (leading modifiers + known
    # base); shortest-base preferred so the modifier list is maximized.
    # Fall back to a self-tautology recognition (base == whole notation)
    # only if no real compound exists. Last resort: a partial parse with
    # unsupported leading tokens (drives 'unsupported-token' classification).
    real_compound = None
    self_tautology = None
    unsupported_partial = None
    context_dependent = None  # leading tokens include a context-dependent token (e.g. DOUBLE)

    def _classify_leading(leading_slugs):
        """Return (all_recognized, has_context_dependent) for a leading
        slug list. A slug is recognized if it's a modifier-table entry,
        a bucket-weighted token (xbody etc.), or a directional token
        (rev/reverse, zero ADD)."""
        if not leading_slugs:
            return False, False
        has_cd = any(s in CONTEXT_DEPENDENT_TOKENS for s in leading_slugs)
        if has_cd:
            return False, True
        all_ok = all(
            (s in modifier_table)
            or (s in BUCKET_TOKEN_WEIGHTS)
            or (s in DIRECTIONAL_TOKENS)
            for s in leading_slugs
        )
        return all_ok, False

    for take in (1, 2):
        if len(raw_tokens) < take:
            continue
        cand = "-".join(slugify(t) for t in raw_tokens[-take:])
        cand = alias_map.get(cand, cand)
        if cand not in canonical_adds:
            continue
        cand_adds = parse_int_add(canonical_adds[cand])
        if cand_adds is None:
            continue

        leading = raw_tokens[:-take]
        leading_slugs = [normalize_token(t, alias_map) for t in leading]
        all_recognized, has_cd = _classify_leading(leading_slugs)

        if has_cd and context_dependent is None:
            context_dependent = (cand, cand_adds, leading, leading_slugs)
            continue  # do not accept; try the other take or fall through

        if all_recognized:
            real_compound = (cand, cand_adds, leading, leading_slugs)
            break  # shortest-base real compound wins; stop searching
        if not leading and self_tautology is None:
            self_tautology = (cand, cand_adds)
        if leading and unsupported_partial is None:
            unsupported_partial = (cand, cand_adds, leading, leading_slugs)

    if real_compound:
        base_slug, base_adds, _, leading_slugs = real_compound
        is_rotational = base_slug in rotational_bases
        total = base_adds
        breakdown_parts = []
        for mod_slug in leading_slugs:
            if mod_slug in modifier_table:
                ab, ab_rot = modifier_table[mod_slug]
                bonus = ab_rot if is_rotational else ab
                total += bonus
                breakdown_parts.append(f"{mod_slug}(+{bonus})")
            elif mod_slug in BUCKET_TOKEN_WEIGHTS:
                bonus = BUCKET_TOKEN_WEIGHTS[mod_slug]
                total += bonus
                breakdown_parts.append(f"{mod_slug}(+{bonus})")
            else:  # DIRECTIONAL_TOKENS — recognized, zero ADD
                breakdown_parts.append(f"[directional: {mod_slug}]")
        breakdown = " + ".join(breakdown_parts + [f"{base_slug}({base_adds})"]) + f" = {total} ADD"
        return total, breakdown, [], base_slug

    if context_dependent:
        # A leading token (currently `double`) is context-dependent.
        # Per curator policy: do NOT invent a derivation; surface as
        # needing curator-published per-trick decomposition.
        cand, cand_adds, leading, leading_slugs = context_dependent
        cd_tokens = sorted(set(s for s in leading_slugs if s in CONTEXT_DEPENDENT_TOKENS))
        breakdown = (
            f"context-dependent token(s) in leading: {','.join(cd_tokens)}"
            f" — needs curator-published per-trick decomposition"
        )
        # Sentinel: caller detects breakdown prefix to classify.
        return None, breakdown, [], cand

    if self_tautology:
        # Notation equals own slug with no modifiers — not a real
        # derivation. Signal failure so the caller classifies as self-
        # token (or applies a later fallback path).
        return None, "self-tautology (notation = own slug)", [], own_slug

    if unsupported_partial:
        base_slug, base_adds, leading, leading_slugs = unsupported_partial
        unsupported = [
            tok for tok, slug in zip(leading, leading_slugs)
            if slug not in modifier_table
                and slug not in BUCKET_TOKEN_WEIGHTS
                and slug not in DIRECTIONAL_TOKENS
                and slug not in CONTEXT_DEPENDENT_TOKENS
        ]
        breakdown = (
            " + ".join(
                [f"{s}(?)" for s in leading_slugs]
                + [f"{base_slug}({base_adds})"]
            )
            + f"  [unsupported: {','.join(unsupported)}]"
        )
        return None, breakdown, unsupported, base_slug

    return None, f"unknown base from tokens: {raw_tokens!r}", [raw_tokens[-1]], None


# ── Classification ───────────────────────────────────────────────────────
def classify(row, ts_state, canonical_adds, modifier_table, alias_map):
    slug = row["slug"]
    canonical_name = row["canonical_name"]
    official_add = parse_int_add(row["adds"])
    notation = (row["notation"] or "").strip()
    op_notation = (row["operational_notation"] or "").strip()

    # Skip non-trick kinds.
    non_trick_slugs = (
        ts_state["modifier_slugs"] | ts_state["operator_slugs"]
        | ts_state["surface_slugs"] | ts_state["pending_review"]
    )
    if slug in non_trick_slugs:
        return None
    if (row["adds"] or "").strip() == "modifier":
        return None
    if official_add is None:
        # Tricks without numeric ADDs (e.g. 'unrated') aren't auditable.
        return None

    in_atomic = slug in ts_state["atomic"]
    in_resolved = slug in ts_state["resolved"]
    in_doctrine_blocked = slug in ts_state["doctrine_blocked"]
    in_first_class = slug in (ts_state["first_class_tier_1"] | ts_state["first_class_tier_2"])
    in_sui_generis = slug in ts_state["sui_generis"]

    unsupported = []
    derived_add = None
    breakdown = ""
    status = None

    # ── Precedence 1: curator-locked sources (ATOMIC + RESOLVED) ─────────
    if in_atomic:
        derived_add = ts_state["atomic"][slug]
        breakdown = f"[ATOMIC_FLAG_DECOMPOSITIONS] totalAdd={derived_add}"
        status = "exact" if derived_add == official_add else "mismatch"
    elif in_resolved:
        derived_add = ts_state["resolved"][slug]
        breakdown = f"[RESOLVED_FORMULAS_SPRINT_1] totalAdd={derived_add}"
        status = "exact" if derived_add == official_add else "mismatch"
    elif in_sui_generis:
        status = "self-token"
        breakdown = f"sui-generis self-token: {notation or canonical_name}"

    # ── Precedence 2: try compound parse on the shouty notation column ───
    if status is None and notation:
        derived_add, breakdown, unsupported, _ = parse_notation_compound(
            notation, slug, canonical_adds, modifier_table, alias_map,
            ts_state["rotational_bases"],
        )
        if derived_add is not None and not unsupported:
            status = "exact" if derived_add == official_add else "mismatch"
        elif breakdown.startswith("context-dependent"):
            status = "context-dependent"

    # ── Precedence 3: ATAM bracket-flag count on operational_notation ────
    # Each [BOD]/[DEX]/[XBD]/[DEL]/[UNS]/[PDX] flag = 1 ADD per the atom
    # flag-decomposition doctrine. Fires when the shouty notation didn't
    # resolve (or doesn't exist) but the operational chain carries flags.
    if status is None and op_notation:
        flags = BRACKET_FLAG_RE.findall(op_notation)
        if flags:
            derived_add = len(flags)
            breakdown = f"[ATAM bracket-flag count] {' + '.join('[' + f + ']' for f in flags)} = {derived_add} ADD"
            unsupported = []
            status = "exact" if derived_add == official_add else "mismatch"

    # ── Precedence 4: bare self-token fallback for joined-slug match ─────
    # If we still haven't resolved AND the notation is a short string whose
    # slugified-joined form equals the trick's own slug (e.g. 'MOBIUS' /
    # 'HOP OVER'), classify as self-token rather than missing.
    if status is None and notation:
        cleaned = strip_bracket_noise(notation)
        joined = "-".join(slugify(t) for t in cleaned.split() if t.strip())
        if joined and joined == slug:
            status = "self-token"
            breakdown = f"self-token: {notation}"
            derived_add = None
            unsupported = []

    # ── Precedence 5: classify remainder by failure mode ─────────────────
    if status is None:
        if not notation:
            status = "missing-notation"
        elif unsupported:
            status = "unsupported-token"
        else:
            status = "missing-notation"

    # Doctrine override: mismatch on a doctrine-blocked slug is sensitive.
    if in_doctrine_blocked and status == "mismatch":
        status = "doctrine-sensitive"

    return _build_row(slug, canonical_name, official_add, op_notation,
                      derived_add, breakdown, status, unsupported,
                      in_doctrine_blocked, in_first_class)


def _build_row(slug, canonical_name, official_add, op_notation,
               derived_add, breakdown, status, unsupported,
               in_doctrine_blocked, in_first_class):
    promotion_candidate = (
        status == "exact"
        and not in_doctrine_blocked
        and not in_first_class
    )
    notes = []
    if in_first_class:
        notes.append("already_first_class")
    return {
        "slug": slug,
        "canonical_name": canonical_name,
        "official_add": official_add if official_add is not None else "",
        "operational_notation": op_notation,
        "derived_add": derived_add if derived_add is not None else "",
        "derived_breakdown": breakdown,
        "status": status,
        "unsupported_tokens": ",".join(unsupported),
        "doctrine_note": "in DOCTRINE_BLOCKED_SLUGS" if in_doctrine_blocked else "",
        "promotion_candidate": "1" if promotion_candidate else "0",
        "notes": ";".join(notes),
    }


# ── Reporting ────────────────────────────────────────────────────────────
COLUMNS = [
    "slug", "canonical_name", "official_add", "operational_notation",
    "derived_add", "derived_breakdown", "status",
    "unsupported_tokens", "doctrine_note", "promotion_candidate", "notes",
]


def write_csv(rows, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)


def print_summary(rows, ts_state):
    statuses = Counter(r["status"] for r in rows)
    already_fc = sum(1 for r in rows if "already_first_class" in r["notes"])
    promotion_count = sum(1 for r in rows if r["promotion_candidate"] == "1")

    print()
    print("=" * 72)
    print(f"Audit summary — {date.today().isoformat()}")
    print("=" * 72)
    print(f"Total trick rows audited:       {len(rows)}")
    print(f"  Already first-class:          {already_fc}")
    print()
    for st in ["exact", "missing-notation", "mismatch",
               "doctrine-sensitive", "unsupported-token",
               "self-token", "context-dependent"]:
        print(f"  {st:24s} {statuses.get(st, 0):5d}")
    print()
    print(f"Promotion candidates (exact + not blocked + not already FC): {promotion_count}")

    promos = [r for r in rows if r["promotion_candidate"] == "1"]
    promos.sort(key=lambda r: (r["official_add"] or 0, r["slug"]))

    print()
    print("=" * 72)
    print(f"Next promotion batch (first 30 of {len(promos)})")
    print("=" * 72)
    for r in promos[:30]:
        print(f"  [{r['official_add']:>2} ADD] {r['slug']:32s} {r['derived_breakdown']}")

    mismatches = [r for r in rows if r["status"] == "mismatch"]
    mismatches.sort(key=lambda r: r["slug"])
    print()
    print("=" * 72)
    print(f"Mismatches (curator review queue, first 30 of {len(mismatches)})")
    print("=" * 72)
    for r in mismatches[:30]:
        print(f"  {r['slug']:32s} official={r['official_add']:<3} derived={r['derived_add']:<3} "
              f"{r['derived_breakdown']}")

    # Grammar gaps: tokens the parser doesn't recognize.
    token_freq = Counter()
    for r in rows:
        for tok in (r["unsupported_tokens"] or "").split(","):
            tok = tok.strip()
            if tok:
                token_freq[tok] += 1
    print()
    print("=" * 72)
    print(f"Unsupported tokens (grammar gaps, top 30 of {len(token_freq)})")
    print("=" * 72)
    for tok, n in token_freq.most_common(30):
        print(f"  {tok:32s} {n}")

    doctrine = [r for r in rows if r["status"] == "doctrine-sensitive"]
    if doctrine:
        print()
        print("=" * 72)
        print(f"Doctrine-sensitive rows ({len(doctrine)})")
        print("=" * 72)
        for r in doctrine:
            print(f"  {r['slug']:32s} official={r['official_add']} derived={r['derived_add']}")


def main():
    parser = argparse.ArgumentParser(description="Derived-ADD audit (read-only).")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite path")
    parser.add_argument("--out", default=None,
                        help="Output CSV (default: exploration/derived-add-audit-{date}.csv)")
    args = parser.parse_args()

    out_path = (Path(args.out) if args.out
                else DEFAULT_OUTPUT_DIR / f"derived-add-audit-{date.today().isoformat()}.csv")

    print(f"Loading TS state from src/services/ + src/content/ ...")
    ts_state = load_ts_state()
    print(f"  FIRST_CLASS_TIER_1:           {len(ts_state['first_class_tier_1'])}")
    print(f"  FIRST_CLASS_TIER_2:           {len(ts_state['first_class_tier_2'])}")
    print(f"  ATOMIC_FLAG_DECOMPOSITIONS:   {len(ts_state['atomic'])}")
    print(f"  RESOLVED_FORMULAS_SPRINT_1:   {len(ts_state['resolved'])}")
    print(f"  DOCTRINE_BLOCKED_SLUGS:       {len(ts_state['doctrine_blocked'])}")
    print(f"  FIRST_CLASS_ROTATIONAL_BASES: {len(ts_state['rotational_bases'])}")
    print(f"  SUI_GENERIS_SELF_TOKEN_SLUGS: {len(ts_state['sui_generis'])}")
    print(f"  MODIFIER_SLUGS:               {len(ts_state['modifier_slugs'])}")
    print(f"  OPERATOR_SLUGS:               {len(ts_state['operator_slugs'])}")

    print()
    print(f"Loading DB from {args.db} ...")
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    tricks = load_tricks(conn)
    modifier_table = load_modifier_table(conn)
    alias_map = load_alias_map(conn)
    canonical_adds = load_canonical_adds(conn)
    conn.close()
    print(f"  freestyle_tricks (is_active=1): {len(tricks)}")
    print(f"  freestyle_trick_modifiers:      {len(modifier_table)}")
    print(f"  freestyle_trick_aliases:        {len(alias_map)}")

    print()
    print("Classifying ...")
    rows = []
    for r in tricks:
        result = classify(r, ts_state, canonical_adds, modifier_table, alias_map)
        if result is not None:
            rows.append(result)

    write_csv(rows, out_path)
    print(f"CSV written: {out_path}")
    print_summary(rows, ts_state)


if __name__ == "__main__":
    main()
