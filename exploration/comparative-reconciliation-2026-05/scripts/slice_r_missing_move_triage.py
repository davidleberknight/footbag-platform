#!/usr/bin/env python3
"""
Slice R — Missing-Move Triage Pass
===================================

For every external-only row in
  exploration/passback-intake/passback_reports/new_candidates.csv     (PB)
  exploration/footbagmoves-federation/WAVE2_INSERTION_MATRIX.csv      (FM Wave-2)
apply the 8-category taxonomy from RECONCILIATION_AUDIT_PLAN.md §6.

CRITICAL DISCIPLINE
-------------------
- No additions to `freestyle_tricks`
- No additions to `UNRESOLVED_COMPOUNDS`
- No content-module edits
- No DB writes
- No claim that any candidate IS canonical
- Curator decides every row; `curator_action` column blank on output

Categories (RECONCILIATION_AUDIT_PLAN.md §6)
--------------------------------------------
  duplicate-synonym                  Different name, identical IFPA structure
  unresolved-decomposition           Structure unclear; no technical reading
  folk-derived-unstable              Folk name; no op-notation; mechanically uncertain
  hidden-branch-family               Candidate descends from a recognized
                                     branch anchor IFPA lacks productive coverage on
  unsupported-symbolic-compression   External uses shorthand IFPA doesn't recognize
  parser-limitation                  Exists but op-notation parser can't tokenize
  intentional-omission               Curator already decided to exclude (rare)
  canonical-gap                      Legitimate gap — proposable addition

Outputs
-------
  exploration/comparative-reconciliation-2026-05/missing_move_triage.csv
  exploration/comparative-reconciliation-2026-05/SLICE_R_FINDINGS.md
"""
import csv
import re
import sqlite3
import sys
from pathlib import Path

REPO_ROOT  = Path(__file__).resolve().parents[3]
DB_PATH    = REPO_ROOT / "database" / "footbag.db"
PB_CANDS   = REPO_ROOT / "exploration" / "passback-intake" / "passback_reports" / "new_candidates.csv"
WAVE2_MTX  = REPO_ROOT / "exploration" / "footbagmoves-federation" / "WAVE2_INSERTION_MATRIX.csv"
OUT_DIR    = REPO_ROOT / "exploration" / "comparative-reconciliation-2026-05"
CSV_OUT    = OUT_DIR / "missing_move_triage.csv"
MD_OUT     = OUT_DIR / "SLICE_R_FINDINGS.md"

# ─────────────────────────────────────────────────────────────────────────
# Recognized IFPA vocabulary (mirrors content modules + curator-locked
# operator inventory). Used to detect whether a candidate's technical
# reading decomposes through IFPA-known tokens.
# ─────────────────────────────────────────────────────────────────────────

# Body modifiers (src/content/freestyleTrickKindOverrides.ts MODIFIER_SLUGS)
KNOWN_MODIFIERS = {
    "paradox", "spinning", "ducking", "diving", "weaving",
    "symposium", "stepping", "tapping", "barraging", "blazing",
    "gyro", "illusioning", "blurry", "miraging", "whirling",
    "atomic", "nuclear", "high", "double", "rev", "reverse",
    "furious", "tapping",
    # Set primitives (kind=operator)
    "pixie", "fairy", "atomic", "surging", "sailing", "shooting",
    "rooted", "pogo", "quantum",
    # PB-side dialect tokens (per Red 2026-05-15 far/reverse=+0 ruling)
    "far", "near", "ss", "op", "same",
    # Compound operator words
    "symp", "symp.",   # PB shorthand for symposium
    "pdx",             # PB shorthand for paradox
    "duck",
    "x-dex", "xdex", "x", "in", "out", "front", "back",
    "side", "leggy", "hippy",
    "twisting", "whipping", "flailing", "phasing", "railing",
    "leaning",         # FM-only modifier vocab (not in IFPA today)
}

# Modifier shorthand alias mapping (PB / FM → IFPA canonical)
MODIFIER_ALIASES = {
    "symp":  "symposium",
    "symp.": "symposium",
    "pdx":   "paradox",
    "duck":  "ducking",
    "dlo":   "double-leg-over",
    "atw":   "around-the-world",
    "near":  "paradox",   # contextual; far/near map per Red 2026-05-15
    "far":   "paradox",   # contextual
}

def normalize_slug(name):
    if not name:
        return ""
    s = name.strip().lower()
    s = re.sub(r"[^\w\s-]", " ", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def tokens_of(reading):
    """Lowercased word tokens of a reading. Strips punctuation."""
    if not reading:
        return []
    s = reading.strip().lower()
    s = re.sub(r"[^\w\s-]", " ", s)
    return [t for t in s.split() if t]


# ─────────────────────────────────────────────────────────────────────────
# Load IFPA reference data
# ─────────────────────────────────────────────────────────────────────────

def load_ifpa_canonical():
    """Returns (slugs_set, name_to_slug, alias_to_slug, base_tricks)."""
    if not DB_PATH.exists():
        print(f"WARN: {DB_PATH} not found; running with no IFPA reference",
              file=sys.stderr)
        return set(), {}, {}, set()

    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        slugs = set()
        name_to_slug = {}
        alias_to_slug = {}
        base_tricks = set()
        for slug, name, base in conn.execute(
            "SELECT slug, canonical_name, base_trick FROM freestyle_tricks WHERE is_active=1"
        ):
            slugs.add(slug)
            name_to_slug[normalize_slug(name)] = slug
            name_to_slug[slug] = slug
            if base:
                base_tricks.add(base)
        for alias_slug, alias_text, trick_slug in conn.execute(
            "SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases"
        ):
            alias_to_slug[alias_slug] = trick_slug
            alias_to_slug[normalize_slug(alias_text)] = trick_slug
        return slugs, name_to_slug, alias_to_slug, base_tricks
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────
# Load external candidate sources
# ─────────────────────────────────────────────────────────────────────────

def load_pb_candidates():
    rows = []
    with PB_CANDS.open() as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({
                "source":             "passback",
                "external_name":      r.get("passback_primary_name", "").strip(),
                "alternate_names":    r.get("passback_alternate_names", "").strip(),
                "technical_name":     r.get("passback_technical_name", "").strip(),
                "uptime_component":   r.get("passback_uptime_component", "").strip(),
                "downtime_component": r.get("passback_downtime_component", "").strip(),
                "dex_count":          r.get("passback_dex_count", "").strip(),
                "candidate_slug":     normalize_slug(r.get("normalized_primary_name", "")),
            })
    return rows


def load_wave2_candidates():
    rows = []
    if not WAVE2_MTX.exists():
        return rows
    with WAVE2_MTX.open() as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({
                "source":             "fm-wave2",
                "external_name":      r.get("fm_display_name", "").strip() or r.get("canonical_name", ""),
                "alternate_names":    r.get("aliases", "").strip(),
                "technical_name":     r.get("fm_technical_name", "").strip() or r.get("canonical_name", ""),
                "uptime_component":   "",
                "downtime_component": "",
                "dex_count":          r.get("adds", "").strip(),
                "candidate_slug":     r.get("slug", "").strip(),
                # Wave-2 specific fields:
                "wave2_canonical":    r.get("canonical_name", "").strip(),
                "wave2_base_trick":   r.get("base_trick", "").strip(),
                "wave2_modifiers":    r.get("modifier_links", "").strip(),
                "wave2_decomp":       r.get("structural_decomp_check", "").strip(),
            })
    return rows


# ─────────────────────────────────────────────────────────────────────────
# Classifier
# ─────────────────────────────────────────────────────────────────────────

def tokens_recognized(tokens, ifpa_slugs, base_tricks):
    """Returns (recognized_count, total, unknown_tokens, base_token)."""
    unknown = []
    base_token = None
    for t in tokens:
        canonical = MODIFIER_ALIASES.get(t, t)
        if canonical in KNOWN_MODIFIERS:
            continue
        if canonical in ifpa_slugs or canonical in base_tricks:
            base_token = canonical
            continue
        # Singletons like 'down', 'over', etc.
        if t in ("down", "over", "set", "kick", "stall"):
            continue
        unknown.append(t)
    return (len(tokens) - len(unknown), len(tokens), unknown, base_token)


def classify(row, ifpa_slugs, name_to_slug, alias_to_slug, base_tricks):
    """
    Returns (category, confidence, action, proposed_slug, proposed_base,
              proposed_modifiers, rationale).
    """
    source = row["source"]
    name   = row["external_name"]
    tech   = row["technical_name"]
    cand_slug = row.get("candidate_slug", "")

    # FM Wave-2 rows are pre-curated for canonical insertion.
    if source == "fm-wave2":
        proposed_slug = row.get("candidate_slug", "")
        # Check whether the slug is now in IFPA DB (some Wave-2 rows may
        # have already been promoted).
        if proposed_slug in ifpa_slugs:
            return ("duplicate-synonym", "red-locked", "no-action",
                    proposed_slug, row.get("wave2_base_trick", ""), row.get("wave2_modifiers", ""),
                    f"Wave-2 Tier-1 candidate already in IFPA DB as '{proposed_slug}'")
        return ("canonical-gap", "curator-prose-confirmed", "curator-decide-post-wave2",
                proposed_slug, row.get("wave2_base_trick", ""), row.get("wave2_modifiers", ""),
                f"Wave-2 Tier-1 candidate; structural decomp: {row.get('wave2_decomp','')}")

    # 1. duplicate-synonym — candidate slug or normalized name matches
    #    an IFPA canonical or alias.
    if cand_slug and cand_slug in ifpa_slugs:
        return ("duplicate-synonym", "red-locked", "no-action",
                cand_slug, "", "",
                f"candidate slug '{cand_slug}' is an existing IFPA canonical row")
    if cand_slug in alias_to_slug:
        return ("duplicate-synonym", "red-locked", "no-action",
                alias_to_slug[cand_slug], "", "",
                f"'{cand_slug}' is an alias of IFPA '{alias_to_slug[cand_slug]}'")
    if cand_slug in name_to_slug:
        return ("duplicate-synonym", "pattern-derived", "no-action",
                name_to_slug[cand_slug], "", "",
                f"'{cand_slug}' normalizes to IFPA canonical '{name_to_slug[cand_slug]}'")

    # 2. unresolved-decomposition — no technical reading at all.
    if not tech:
        return ("unresolved-decomposition", "speculative", "defer",
                "", "", "",
                "no passback_technical_name supplied; structure unclear")

    # Tokenize the technical reading and check token recognition.
    tech_tokens = tokens_of(tech)
    recognized, total, unknown, base_token = tokens_recognized(
        tech_tokens, ifpa_slugs, base_tricks
    )

    # 3. unsupported-symbolic-compression — any unknown tokens
    #    in the reading. PB introduces vocabulary like 'refraction',
    #    'baroque', 'flailing' that IFPA hasn't ratified.
    if unknown:
        return ("unsupported-symbolic-compression", "pattern-derived", "defer",
                cand_slug, base_token or "", "|".join(t for t in tech_tokens if MODIFIER_ALIASES.get(t,t) in KNOWN_MODIFIERS),
                f"unknown tokens in reading: {','.join(unknown)} — external uses vocabulary IFPA doesn't recognize")

    # 4. hidden-branch-family — base anchor is a recognized branch family
    #    or a Slice O candidate. The PB row reveals a descendant we lack.
    BRANCH_ANCHORS = {"torque", "blender", "drifter", "barfly"}
    if base_token in BRANCH_ANCHORS:
        modifiers_in_reading = [
            MODIFIER_ALIASES.get(t, t) for t in tech_tokens
            if MODIFIER_ALIASES.get(t, t) in KNOWN_MODIFIERS
        ]
        return ("hidden-branch-family", "pattern-derived", "curator-decide-post-wave2",
                cand_slug, base_token, "|".join(modifiers_in_reading),
                f"candidate descends from branch anchor '{base_token}'; "
                f"reveals additional family member not yet in IFPA")

    # 5. canonical-gap — all tokens recognized AND base trick is a known
    #    IFPA row. This is a clean structural decomposition that the
    #    curator could propose adding.
    if base_token and base_token in ifpa_slugs:
        modifiers_in_reading = [
            MODIFIER_ALIASES.get(t, t) for t in tech_tokens
            if MODIFIER_ALIASES.get(t, t) in KNOWN_MODIFIERS
        ]
        return ("canonical-gap", "pattern-derived", "curator-decide",
                cand_slug, base_token, "|".join(modifiers_in_reading),
                f"clean structural decomposition with base '{base_token}'; "
                f"curator decides whether to add as canonical row")

    # 6. folk-derived-unstable — recognizable folk name pattern: no base
    #    token even though all tokens are recognized (rare; usually only
    #    operators in the reading).
    if not base_token and recognized == total:
        return ("folk-derived-unstable", "speculative", "defer",
                cand_slug, "", "",
                "all reading tokens recognized but no IFPA base trick anchor; "
                "candidate may be a folk-named compound without canonical root")

    # 7. fall-through — partial recognition but ambiguous.
    return ("unresolved-decomposition", "speculative", "curator-review",
            cand_slug, base_token or "", "",
            "structural reading is partially recognized but does not match "
            "any clean classifier pattern")


# ─────────────────────────────────────────────────────────────────────────
# Output writers
# ─────────────────────────────────────────────────────────────────────────

CSV_COLUMNS = [
    "candidate_slug",
    "external_name",
    "source",
    "alternate_names",
    "technical_name",
    "dex_count",
    "ifpa_match",
    "slice_r_category",
    "confidence",
    "slice_r_action",
    "proposed_base_trick",
    "proposed_modifiers",
    "rationale",
    "pending_red",
    "curator_action",
    "notes",
]


def write_csv(rows):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def md_cell(s, limit=70):
    if not s:
        return "—"
    s = s.replace("|", "\\|").replace("\n", " ")
    if len(s) > limit:
        s = s[:limit - 1] + "…"
    return s


def write_summary(rows):
    by_category = {}
    by_action   = {}
    by_source   = {}
    for r in rows:
        by_category.setdefault(r["slice_r_category"], []).append(r)
        by_action.setdefault(r["slice_r_action"], []).append(r)
        by_source.setdefault(r["source"], []).append(r)

    pending_red = [r for r in rows if r["pending_red"] == "true"]
    canonical_gaps = by_category.get("canonical-gap", [])
    hidden_branch  = by_category.get("hidden-branch-family", [])
    duplicates     = by_category.get("duplicate-synonym", [])

    lines = [
        "# Slice R — Missing-Move Triage Pass — Findings",
        "",
        "Generated by `scripts/slice_r_missing_move_triage.py`. Applies the "
        f"8-category taxonomy from RECONCILIATION_AUDIT_PLAN.md §6 to "
        f"{sum(1 for r in rows if r['source']=='passback')} Passback "
        f"`new_candidates.csv` rows + {sum(1 for r in rows if r['source']=='fm-wave2')} "
        "FM Wave-2 insertion-matrix rows.",
        "",
        "No additions to `freestyle_tricks`, no additions to "
        "`UNRESOLVED_COMPOUNDS`, no content-module edits. Curator-triage "
        "queue only.",
        "",
        "## Headline metrics",
        "",
        f"- **Total rows triaged**: {len(rows)}",
        f"- **Canonical-gap candidates** (curator-actionable): {len(canonical_gaps)}",
        f"- **Hidden-branch-family candidates**: {len(hidden_branch)}",
        f"- **Duplicate-synonym (already in IFPA)**: {len(duplicates)}",
        f"- **Pending Red Wave 2**: {len(pending_red)}",
        "",
        "## Category breakdown",
        "",
        "| Category | Count | Typical Action |",
        "|---|---|---|",
    ]
    category_order = [
        "canonical-gap",
        "hidden-branch-family",
        "duplicate-synonym",
        "unsupported-symbolic-compression",
        "unresolved-decomposition",
        "folk-derived-unstable",
        "parser-limitation",
        "intentional-omission",
    ]
    for cat in category_order:
        if cat in by_category:
            action = by_category[cat][0]["slice_r_action"]
            lines.append(f"| `{cat}` | {len(by_category[cat])} | `{action}` |")
    for cat in by_category:
        if cat not in category_order:
            action = by_category[cat][0]["slice_r_action"]
            lines.append(f"| `{cat}` | {len(by_category[cat])} | `{action}` |")

    lines += [
        "",
        "## Source distribution",
        "",
        "| Source | Count |",
        "|---|---|",
    ]
    for src, lst in sorted(by_source.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"| `{src}` | {len(lst)} |")

    # FM Wave-2 candidates: curator-actionable insertion-ready rows.
    if hidden_branch:
        lines += [
            "",
            "## Hidden-branch-family candidates (highest curator priority)",
            "",
            "External candidates that descend from a recognized branch "
            "anchor (torque, blender, drifter, barfly). Each reveals a "
            "family member IFPA lacks.",
            "",
            "| External name | Base anchor | Modifiers | Reading |",
            "|---|---|---|---|",
        ]
        for r in hidden_branch[:30]:
            lines.append(
                f"| {md_cell(r['external_name'])} | `{r['proposed_base_trick']}` | "
                f"{md_cell(r['proposed_modifiers'])} | "
                f"{md_cell(r['technical_name'])} |"
            )
        if len(hidden_branch) > 30:
            lines.append(f"| ... | | | _(+{len(hidden_branch)-30} more)_ |")

    if canonical_gaps:
        lines += [
            "",
            "## Canonical-gap candidates (curator-decide queue)",
            "",
            "External rows with clean structural decompositions on an "
            "IFPA-known base trick. Curator decides whether to add each as "
            "a canonical row.",
            "",
            "| Slug | External name | Source | Base | Modifiers | Reading |",
            "|---|---|---|---|---|---|",
        ]
        for r in canonical_gaps[:40]:
            lines.append(
                f"| `{r['candidate_slug']}` | {md_cell(r['external_name'])} | "
                f"{r['source']} | `{r['proposed_base_trick']}` | "
                f"{md_cell(r['proposed_modifiers'], 40)} | "
                f"{md_cell(r['technical_name'])} |"
            )
        if len(canonical_gaps) > 40:
            lines.append(f"| ... | | | | | _(+{len(canonical_gaps)-40} more in CSV)_ |")

    # Unsupported-symbolic-compression: show what vocabulary IFPA doesn't recognize
    unsup = by_category.get("unsupported-symbolic-compression", [])
    if unsup:
        unknown_tokens = {}
        for r in unsup:
            # rationale contains "unknown tokens in reading: X,Y,Z"
            match = re.search(r"unknown tokens in reading: ([^—]+)", r["rationale"])
            if match:
                for tok in match.group(1).split(","):
                    tok = tok.strip()
                    if tok:
                        unknown_tokens[tok] = unknown_tokens.get(tok, 0) + 1
        if unknown_tokens:
            lines += [
                "",
                "## Unsupported external vocabulary (frequency in candidates)",
                "",
                "Tokens external sources use that IFPA doesn't currently "
                "recognize. Frequency = number of candidate rows where the "
                "token appears. Curator decides whether each is:",
                "  - a folk synonym (alias to existing operator)",
                "  - a Wave-2-pending new operator",
                "  - a structural compression IFPA should adopt",
                "  - just noise (single-row appearance)",
                "",
                "| Token | Frequency |",
                "|---|---|",
            ]
            for tok, n in sorted(unknown_tokens.items(), key=lambda kv: -kv[1])[:30]:
                lines.append(f"| `{tok}` | {n} |")
            if len(unknown_tokens) > 30:
                lines.append(f"| ... | _(+{len(unknown_tokens)-30} more)_ |")

    lines += [
        "",
        "## Discipline preserved",
        "",
        "- ❌ No additions to `freestyle_tricks`",
        "- ❌ No additions to `UNRESOLVED_COMPOUNDS`",
        "- ❌ No content-module edits",
        "- ❌ No DB writes",
        "- ❌ No claim that any candidate IS canonical",
        "- ❌ No promotion of unrecognized external vocabulary",
        "- ❌ No resolution of Wave 2 dependencies",
        "",
        "## Pending Red Wave 2",
        "",
        f"{len(pending_red)} of {len(rows)} rows carry `pending_red=true`. "
        "All hidden-branch-family + FM Wave-2 candidates depend on Wave 2 "
        "rulings (operator-vs-trick boundary, branch-family invariants).",
        "",
        "## Next slice",
        "",
        "**Slice S — Set-System Embodied-Analogy Notes.** Lowest-priority "
        "observational doc only (no CSV, no code, no content module). "
        "Final research-output of the comparative-reconciliation phase. "
        "After Slice S, the curator triages O–R outputs at their own pace; "
        "no further automated work in this phase.",
        "",
    ]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MD_OUT.write_text("\n".join(lines))


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main():
    if not PB_CANDS.exists():
        print(f"ERROR: {PB_CANDS} not found", file=sys.stderr)
        sys.exit(1)

    ifpa_slugs, name_to_slug, alias_to_slug, base_tricks = load_ifpa_canonical()
    pb_rows   = load_pb_candidates()
    wave2_rows = load_wave2_candidates()

    all_inputs = pb_rows + wave2_rows
    out_rows = []
    for r in all_inputs:
        cat, conf, action, proposed_slug, proposed_base, proposed_mods, rationale = classify(
            r, ifpa_slugs, name_to_slug, alias_to_slug, base_tricks
        )
        pending_red = action in ("curator-decide-post-wave2",) or cat in (
            "hidden-branch-family", "unsupported-symbolic-compression"
        )
        out_rows.append({
            "candidate_slug":      proposed_slug or r.get("candidate_slug", ""),
            "external_name":       r["external_name"],
            "source":              r["source"],
            "alternate_names":     r.get("alternate_names", ""),
            "technical_name":      r.get("technical_name", ""),
            "dex_count":           r.get("dex_count", ""),
            "ifpa_match":          proposed_slug if cat == "duplicate-synonym" else "",
            "slice_r_category":    cat,
            "confidence":          conf,
            "slice_r_action":      action,
            "proposed_base_trick": proposed_base,
            "proposed_modifiers":  proposed_mods,
            "rationale":           rationale,
            "pending_red":         "true" if pending_red else "false",
            "curator_action":      "",
            "notes":               "",
        })

    write_csv(out_rows)
    write_summary(out_rows)

    print(f"Slice R triaged {len(out_rows)} rows")
    print(f"  Passback new-candidate rows: {len(pb_rows)}")
    print(f"  FM Wave-2 insertion rows:    {len(wave2_rows)}")
    print(f"  IFPA reference slugs:        {len(ifpa_slugs)}")
    print(f"  IFPA reference aliases:      {len(alias_to_slug)}")
    print(f"  Output → {CSV_OUT}")
    print(f"  Summary → {MD_OUT}")


if __name__ == "__main__":
    main()
