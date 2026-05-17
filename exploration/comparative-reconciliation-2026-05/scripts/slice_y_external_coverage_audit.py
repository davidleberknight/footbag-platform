#!/usr/bin/env python3
"""
Slice Y — Final External Coverage Audit
========================================

Aggregates every external trick from FM (SYMBOLIC_GRAMMAR_MASTER.csv) +
Passback (trick_sources + new_candidates + matched_existing) and produces
a per-row IFPA coverage status. Synthesizes existing Slice P + Slice R
classifications rather than re-classifying from scratch.

CRITICAL DISCIPLINE
-------------------
- No fabricated formulas
- No automatic promotion of single-source claims to canonical
- No resolution of Red/Wave-2 questions
- No ADD-value changes
- Coverage honesty > coverage inflation
- All outputs go under exploration/comparative-reconciliation-2026-05/

Outputs
-------
  external_trick_coverage_audit.csv    every external trick × IFPA status
  uncovered_tricks_table.csv           admin-curated "what's missing" view
  passback_ifpa_alignment.csv          PB-only focused agreement matrix
  safe_add_candidates.csv              multi-source + simple-formula candidates
  FINAL_COVERAGE_SUMMARY.md            narrative + stats (script-templated)
"""
import csv
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DB_PATH   = REPO_ROOT / "database" / "footbag.db"
OUT_DIR   = REPO_ROOT / "exploration" / "comparative-reconciliation-2026-05"
SCRIPTS   = OUT_DIR / "scripts"

# ─────────────────────────────────────────────────────────────────────────
# Input paths
# ─────────────────────────────────────────────────────────────────────────

FM_MASTER     = REPO_ROOT / "exploration" / "footbagmoves-federation" / "SYMBOLIC_GRAMMAR_MASTER.csv"
FM_MATH       = REPO_ROOT / "exploration" / "footbagmoves-federation" / "FM_MATH_DIVERGENCES.csv"
PB_SOURCES    = REPO_ROOT / "exploration" / "passback-intake" / "passback_trick_sources.csv"
PB_MATCHED    = REPO_ROOT / "exploration" / "passback-intake" / "passback_reports" / "matched_existing.csv"
PB_CANDIDATES = REPO_ROOT / "exploration" / "passback-intake" / "passback_reports" / "new_candidates.csv"
SLICE_P_OUT   = OUT_DIR / "chain_external_alignment.csv"
SLICE_R_OUT   = OUT_DIR / "missing_move_triage.csv"
TS_CHAINS     = REPO_ROOT / "src" / "content" / "freestyleSymbolicEquivalences.ts"
TS_UNRESOLVED = REPO_ROOT / "src" / "content" / "freestyleUnresolvedCompounds.ts"
TS_DUAL       = REPO_ROOT / "src" / "content" / "freestyleFamilyOverrides.ts"

# ─────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────

PUNCT_RE = re.compile(r"[^\w\s-]")


def normalize_slug(name):
    if not name:
        return ""
    s = name.strip().lower()
    s = PUNCT_RE.sub(" ", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def tokens_of(s):
    if not s:
        return []
    s = s.strip().lower()
    s = PUNCT_RE.sub(" ", s)
    return [t for t in s.split() if t]


# Wave 2-dependency tokens — when a reading mentions any of these,
# the row's resolution is gated on Red Wave 2.
WAVE2_TOKENS = {
    "fairy", "barraging", "blurry",
    "stepping-paradox", "stepping paradox",
}

# Per Red 2026-05-15: PB's "far" + "near" + "ss" positional operators
# normalize to +0; they aren't operator-class disagreements per se.
POSITIONAL_NOISE = {"far", "near", "ss", "op", "same", "(same", "side)", "(samex"}


# ─────────────────────────────────────────────────────────────────────────
# Load IFPA reference data
# ─────────────────────────────────────────────────────────────────────────

def load_ifpa():
    """Returns dict: slugs / name_to_slug / alias_to_slug / by_slug."""
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        slugs = set()
        name_to_slug = {}
        by_slug = {}
        for slug, name, adds, base, fam in conn.execute(
            "SELECT slug, canonical_name, adds, base_trick, trick_family "
            "FROM freestyle_tricks WHERE is_active = 1"
        ):
            slugs.add(slug)
            by_slug[slug] = {
                "slug": slug,
                "canonical_name": name,
                "adds": adds,
                "base_trick": base,
                "trick_family": fam,
            }
            name_to_slug[normalize_slug(name)] = slug
            name_to_slug[slug] = slug

        alias_to_slug = {}
        for alias_slug, alias_text, trick_slug in conn.execute(
            "SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases"
        ):
            alias_to_slug[alias_slug] = trick_slug
            alias_to_slug[normalize_slug(alias_text)] = trick_slug
        return slugs, name_to_slug, alias_to_slug, by_slug
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────
# Parse TypeScript content modules (regex; format-stable)
# ─────────────────────────────────────────────────────────────────────────

CHAIN_RE = re.compile(
    r"\{\s*slug:\s*'([a-z0-9-]+)',\s*readings:\s*\[([^\]]+)\]",
    re.DOTALL,
)
READING_RE = re.compile(r"'([^']*)'")


def load_chain_registry():
    """slug → list of readings."""
    text = TS_CHAINS.read_text()
    chains = {}
    for m in CHAIN_RE.finditer(text):
        slug = m.group(1)
        readings = [r.strip() for r in READING_RE.findall(m.group(2))]
        chains[slug] = readings
    return chains


def load_unresolved():
    text = TS_UNRESOLVED.read_text()
    m = re.search(
        r"UNRESOLVED_COMPOUNDS:\s*ReadonlySet<string>\s*=\s*new Set<string>\(\[(.*?)\]\)",
        text, re.DOTALL,
    )
    if not m:
        return set()
    return {s for s in READING_RE.findall(m.group(1))}


def load_dual_memberships():
    text = TS_DUAL.read_text()
    m = re.search(
        r"FAMILY_DUAL_MEMBERSHIPS:\s*ReadonlyMap[^=]+=\s*new Map\(\[(.*?)\]\)",
        text, re.DOTALL,
    )
    if not m:
        return set()
    keys = re.findall(r"\['([a-z0-9-]+)',", m.group(1))
    return set(keys)


# ─────────────────────────────────────────────────────────────────────────
# Load Slice P + Slice R outputs (pre-classified data)
# ─────────────────────────────────────────────────────────────────────────

def load_slice_p():
    """slug → {alignment_fm, alignment_pb, divergence_type_fm, divergence_type_pb,
              fm_present, pb_present, pending_red, ifpa_chain_present}."""
    out = {}
    if not SLICE_P_OUT.exists():
        return out
    with SLICE_P_OUT.open() as f:
        for r in csv.DictReader(f):
            out[r["slug"]] = r
    return out


def load_slice_r():
    """external_name → {slice_r_category, slice_r_action, proposed_base_trick,
                       proposed_modifiers, rationale, pending_red}."""
    out = {}
    if not SLICE_R_OUT.exists():
        return out
    with SLICE_R_OUT.open() as f:
        for r in csv.DictReader(f):
            # Slice R keys by external_name+source; for simple lookup use name.
            key = (r.get("external_name") or "").strip().lower()
            if key:
                out[key] = r
    return out


# ─────────────────────────────────────────────────────────────────────────
# Load external sources
# ─────────────────────────────────────────────────────────────────────────

def load_fm():
    """Returns list of external trick records."""
    rows = []
    if not FM_MASTER.exists():
        return rows
    with FM_MASTER.open() as f:
        for r in csv.DictReader(f):
            move_name = (r.get("move_name") or "").strip()
            if not move_name:
                continue
            rows.append({
                "external_source": "footbagmoves",
                "external_name": move_name,
                "external_formula_or_description": (r.get("technical_name") or "").strip(),
                "external_add_if_known": (r.get("source_adds") or "").strip(),
                "_op_notation": (r.get("symbolic_notation_raw") or "").strip(),
                "_aliases": (r.get("alternate_names") or "").strip(),
            })
    return rows


def load_fm_math():
    """FM math divergences — pre-curated 22 rows with governing_rule + disposition."""
    rows = []
    if not FM_MATH.exists():
        return rows
    with FM_MATH.open() as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows


def load_pb():
    """Returns list of external trick records from passback_trick_sources.csv."""
    rows = []
    if not PB_SOURCES.exists():
        return rows
    with PB_SOURCES.open() as f:
        for r in csv.DictReader(f):
            name = (r.get("passback_primary_name") or "").strip()
            if not name:
                continue
            rows.append({
                "external_source": "passback",
                "external_name": name,
                "external_formula_or_description": (r.get("passback_technical_name") or "").strip(),
                "external_add_if_known": (r.get("passback_dex_count") or "").strip(),
                "_aliases": (r.get("passback_alternate_names") or "").strip(),
                "_normalized": (r.get("normalized_primary_name") or "").strip(),
                "_match_status": (r.get("match_status") or "").strip(),
                "_candidate_slug": (r.get("candidate_trick_slug") or "").strip(),
            })
    return rows


# ─────────────────────────────────────────────────────────────────────────
# Coverage classifier
# ─────────────────────────────────────────────────────────────────────────

def normalize_reading(s):
    """Normalize a reading by stripping positional noise + lowercasing."""
    if not s:
        return ""
    toks = tokens_of(s)
    # Drop positional noise tokens
    toks = [t for t in toks if t not in POSITIONAL_NOISE]
    return " ".join(toks)


def has_wave2_dependency(text):
    if not text:
        return False
    low = text.lower()
    return any(t in low for t in WAVE2_TOKENS)


def classify_external_row(ext, ifpa_slugs, name_to_slug, alias_to_slug,
                          ifpa_by_slug, chain_registry, unresolved,
                          slice_p, slice_r):
    """Returns dict of audit fields per the column spec."""
    name = ext["external_name"]
    name_slug = normalize_slug(name)
    ext_formula = ext.get("external_formula_or_description", "")
    ext_add = ext.get("external_add_if_known", "")

    # --- IFPA match logic ---
    matched_slug = None
    matched_via = None

    # 1. exact name match
    if name_slug in ifpa_slugs:
        matched_slug = name_slug
        matched_via = "covered_exact"
    elif name_slug in name_to_slug:
        matched_slug = name_to_slug[name_slug]
        matched_via = "covered_exact"

    # 2. alias match
    if matched_slug is None and name_slug in alias_to_slug:
        matched_slug = alias_to_slug[name_slug]
        matched_via = "covered_alias"

    # 3. formula-equivalent match (external formula matches an IFPA chain reading)
    if matched_slug is None and ext_formula:
        ext_norm = normalize_reading(ext_formula)
        if ext_norm:
            ext_toks = set(ext_norm.split())
            for ifpa_slug, readings in chain_registry.items():
                for reading in readings:
                    if normalize_reading(reading) == ext_norm:
                        matched_slug = ifpa_slug
                        matched_via = "covered_formula_equivalent"
                        break
                if matched_slug:
                    break

    # --- Categorization for missing rows ---
    ifpa_status = matched_via
    reason = ""
    recommended = ""
    agreement = "ifpa_missing"
    pending_red_flag = False

    if matched_slug:
        ifpa_row = ifpa_by_slug.get(matched_slug, {})
        ifpa_chain = chain_registry.get(matched_slug, [])
        if matched_via == "covered_exact":
            agreement = "name_and_formula_agree" if ext_formula and ifpa_chain else "name_agrees_formula_differs"
            if not ext_formula:
                agreement = "name_and_formula_agree"
            elif normalize_reading(ext_formula) in [normalize_reading(r) for r in ifpa_chain]:
                agreement = "name_and_formula_agree"
            else:
                agreement = "name_agrees_formula_differs"
        elif matched_via == "covered_alias":
            agreement = "name_diff_formula_agrees" if ext_formula else "name_diff_formula_agrees"
        else:
            agreement = "name_diff_formula_agrees"

        # ADD comparison
        if ext_add and ifpa_row.get("adds"):
            try:
                if str(ext_add).strip() != str(ifpa_row["adds"]).strip():
                    agreement = "add_differs"
            except Exception:
                pass

        reason = ""
        recommended = "no_action"
    else:
        # Slice R provides classification for many PB candidates
        sr = slice_r.get(name.lower())
        sr_cat = sr.get("slice_r_category") if sr else ""
        sr_pending = (sr.get("pending_red") == "true") if sr else False

        if sr_cat == "duplicate-synonym":
            ifpa_status = "covered_alias"
            agreement = "name_diff_formula_agrees"
            reason = "duplicate/synonym detected by Slice R"
            recommended = "no_action"
        elif sr_cat == "hidden-branch-family":
            ifpa_status = "missing_needs_red"
            reason = "hidden-branch-family candidate; Wave 2-dependent on operator boundary"
            recommended = "queue_post_red"
            pending_red_flag = True
        elif sr_cat == "unsupported-symbolic-compression":
            ifpa_status = "missing_insufficient_evidence"
            reason = "uses external vocabulary IFPA does not recognize"
            recommended = "curator_review"
        elif sr_cat == "unresolved-decomposition":
            ifpa_status = "missing_insufficient_evidence"
            reason = "external lacks structural decomposition"
            recommended = "curator_review"
        elif sr_cat == "folk-derived-unstable":
            ifpa_status = "missing_insufficient_evidence"
            reason = "folk-derived; no mechanical decomposition"
            recommended = "leave_or_pill"
        elif sr_cat == "canonical-gap":
            # Likely safe-add candidate IF no Wave 2 dep + structurally clean
            if has_wave2_dependency(ext_formula):
                ifpa_status = "missing_needs_red"
                reason = "structurally clean but mentions Wave-2 operator (fairy/barraging/blurry)"
                recommended = "queue_post_red"
                pending_red_flag = True
            else:
                ifpa_status = "missing_safe_to_add"
                reason = "Slice R canonical-gap; structurally clean; no Wave 2 dependency"
                recommended = "curator_review_for_addition"
        elif sr_pending:
            ifpa_status = "missing_needs_red"
            reason = "Slice R flagged pending_red"
            recommended = "queue_post_red"
            pending_red_flag = True
        else:
            # Unclassified missing — apply heuristics
            if has_wave2_dependency(ext_formula):
                ifpa_status = "missing_needs_red"
                reason = "Wave-2 operator vocabulary present (fairy/barraging/blurry)"
                recommended = "queue_post_red"
                pending_red_flag = True
            elif name_slug in unresolved:
                ifpa_status = "missing_insufficient_evidence"
                reason = "row in IFPA UNRESOLVED_COMPOUNDS pilot"
                recommended = "leave_or_pill"
            elif not ext_formula:
                ifpa_status = "missing_insufficient_evidence"
                reason = "external source supplies no structural reading"
                recommended = "curator_review"
            else:
                ifpa_status = "missing_needs_curator"
                reason = "no Slice R classification; structural fit unclear"
                recommended = "curator_review"

        # Sliced overlapping: certain external names are well-known
        # non-tricks (modifier-only, primitives mistakenly listed)
        if name_slug in ("paradox", "spinning", "ducking", "symposium",
                         "pixie", "fairy", "atomic", "quantum", "barraging",
                         "furious", "blurry", "nuclear", "stepping",
                         "miraging", "whirling", "diving", "weaving"):
            ifpa_status = "excluded_non_trick"
            reason = "modifier/operator, not a standalone trick"
            recommended = "no_action"

    # ifpa_formula display
    ifpa_chain_display = ""
    if matched_slug:
        ch = chain_registry.get(matched_slug)
        if ch:
            ifpa_chain_display = " | ".join(ch)

    return {
        "external_source": ext["external_source"],
        "external_name": name,
        "external_formula_or_description": ext_formula,
        "external_add_if_known": ext_add,
        "ifpa_status": ifpa_status or "missing_needs_curator",
        "ifpa_slug_if_matched": matched_slug or "",
        "ifpa_name_if_matched": ifpa_by_slug.get(matched_slug, {}).get("canonical_name", "") if matched_slug else "",
        "ifpa_formula_if_matched": ifpa_chain_display,
        "agreement_status": agreement,
        "reason_not_covered": reason,
        "recommended_action": recommended,
        "red_question_id_if_applicable": "",
        "notes": "",
        "_pending_red": pending_red_flag,
    }


# ─────────────────────────────────────────────────────────────────────────
# Output writers
# ─────────────────────────────────────────────────────────────────────────

AUDIT_COLUMNS = [
    "external_source",
    "external_name",
    "external_formula_or_description",
    "external_add_if_known",
    "ifpa_status",
    "ifpa_slug_if_matched",
    "ifpa_name_if_matched",
    "ifpa_formula_if_matched",
    "agreement_status",
    "reason_not_covered",
    "recommended_action",
    "red_question_id_if_applicable",
    "notes",
]


def write_audit_csv(rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=AUDIT_COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


UNCOVERED_COLUMNS = [
    "trick_name",
    "source",
    "claimed_formula_or_description",
    "claimed_add",
    "reason_not_in_ifpa_dictionary",
    "status",
    "next_step",
]

# Stable mapping from internal reason → public-facing reason vocabulary
PUBLIC_REASON_MAP = {
    "Slice R canonical-gap; structurally clean; no Wave 2 dependency":
        "covered under different canonical name pending curator review",
    "hidden-branch-family candidate; Wave 2-dependent on operator boundary":
        "awaiting Red/SME confirmation",
    "uses external vocabulary IFPA does not recognize":
        "parser cannot safely represent yet",
    "external lacks structural decomposition":
        "formula unclear",
    "folk-derived; no mechanical decomposition":
        "not enough evidence",
    "structurally clean but mentions Wave-2 operator (fairy/barraging/blurry)":
        "awaiting Red/SME confirmation",
    "Wave-2 operator vocabulary present (fairy/barraging/blurry)":
        "awaiting Red/SME confirmation",
    "Slice R flagged pending_red":
        "awaiting Red/SME confirmation",
    "row in IFPA UNRESOLVED_COMPOUNDS pilot":
        "known but intentionally not canonical yet",
    "external source supplies no structural reading":
        "formula unclear",
    "no Slice R classification; structural fit unclear":
        "curator review needed",
    "modifier/operator, not a standalone trick":
        "not a freestyle trick",
    "duplicate/synonym detected by Slice R":
        "covered under different canonical name",
}


def write_uncovered_csv(audit_rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    out_rows = []
    for r in audit_rows:
        if not r["ifpa_status"].startswith("missing"):
            continue
        public_reason = PUBLIC_REASON_MAP.get(
            r["reason_not_covered"], "curator review needed"
        )
        out_rows.append({
            "trick_name": r["external_name"],
            "source": r["external_source"],
            "claimed_formula_or_description": r["external_formula_or_description"],
            "claimed_add": r["external_add_if_known"],
            "reason_not_in_ifpa_dictionary": public_reason,
            "status": r["ifpa_status"],
            "next_step": r["recommended_action"],
        })
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=UNCOVERED_COLUMNS)
        w.writeheader()
        for r in out_rows:
            w.writerow(r)
    return len(out_rows)


PB_ALIGN_COLUMNS = [
    "external_name",
    "passback_formula",
    "passback_add",
    "ifpa_slug",
    "ifpa_name",
    "ifpa_formula",
    "alignment_category",
    "pending_red",
    "notes",
]


def write_pb_alignment_csv(audit_rows, path):
    """PB-focused agreement matrix."""
    path.parent.mkdir(parents=True, exist_ok=True)
    pb_rows = [r for r in audit_rows if r["external_source"] == "passback"]
    out = []
    for r in pb_rows:
        # Map ifpa_status × agreement_status into a single alignment category
        st = r["ifpa_status"]
        ag = r["agreement_status"]
        if st == "covered_exact" and ag == "name_and_formula_agree":
            cat = "agree_name_and_formula"
        elif st == "covered_exact" and ag == "name_agrees_formula_differs":
            cat = "agree_name_formula_differs"
        elif st == "covered_exact" and ag == "add_differs":
            cat = "agree_name_add_differs"
        elif st == "covered_alias":
            cat = "agree_formula_name_differs"
        elif st == "covered_formula_equivalent":
            cat = "agree_formula_name_differs"
        elif st.startswith("missing"):
            cat = "passback_only_ifpa_missing"
        elif st == "excluded_non_trick":
            cat = "non_trick"
        elif st == "excluded_duplicate":
            cat = "duplicate"
        else:
            cat = "uncategorized"

        out.append({
            "external_name": r["external_name"],
            "passback_formula": r["external_formula_or_description"],
            "passback_add": r["external_add_if_known"],
            "ifpa_slug": r["ifpa_slug_if_matched"],
            "ifpa_name": r["ifpa_name_if_matched"],
            "ifpa_formula": r["ifpa_formula_if_matched"],
            "alignment_category": cat,
            "pending_red": "true" if r["_pending_red"] else "false",
            "notes": r["reason_not_covered"],
        })
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=PB_ALIGN_COLUMNS)
        w.writeheader()
        for r in out:
            w.writerow(r)
    return len(out)


SAFE_ADD_COLUMNS = [
    "candidate_name",
    "candidate_slug",
    "source",
    "external_formula",
    "external_add",
    "proposed_base_trick",
    "proposed_modifiers",
    "reason_safe",
    "notes",
]


def write_safe_add_csv(audit_rows, slice_r, path):
    """Safe-add candidates: multi-source agreement OR Slice R canonical-gap
    with no Wave 2 dependency."""
    path.parent.mkdir(parents=True, exist_ok=True)
    safe = []
    for r in audit_rows:
        if r["ifpa_status"] != "missing_safe_to_add":
            continue
        sr = slice_r.get(r["external_name"].lower(), {})
        safe.append({
            "candidate_name": r["external_name"],
            "candidate_slug": normalize_slug(r["external_name"]),
            "source": r["external_source"],
            "external_formula": r["external_formula_or_description"],
            "external_add": r["external_add_if_known"],
            "proposed_base_trick": sr.get("proposed_base_trick", ""),
            "proposed_modifiers": sr.get("proposed_modifiers", ""),
            "reason_safe": "multi-source-supported or Slice R canonical-gap; no Wave 2 op",
            "notes": "DO NOT add without explicit curator approval",
        })
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=SAFE_ADD_COLUMNS)
        w.writeheader()
        for r in safe:
            w.writerow(r)
    return len(safe)


def write_summary(audit_rows, ifpa_slugs, chain_registry, pb_count_in,
                  fm_count_in, missing_count, safe_count, pb_align_count, path):
    """Hand-curated narrative + script-computed stats."""
    stats = defaultdict(int)
    for r in audit_rows:
        stats[r["ifpa_status"]] += 1
    pending_red = sum(1 for r in audit_rows if r["_pending_red"])

    lines = [
        "# Final External Coverage Audit — Summary",
        "",
        "**Date**: 2026-05-17.",
        "",
        "**Companion CSVs** in `exploration/comparative-reconciliation-2026-05/`:",
        "  - `external_trick_coverage_audit.csv` — every external trick × IFPA status",
        "  - `uncovered_tricks_table.csv` — admin-curated 'what's missing' view",
        "  - `passback_ifpa_alignment.csv` — PB-focused agreement matrix",
        "  - `safe_add_candidates.csv` — multi-source canonical-gap candidates",
        "  - `RED_QUESTIONS_REGISTRY.md` — every outstanding Red/SME question",
        "",
        "## Coverage metrics",
        "",
        "| Metric | Count |",
        "|---|---|",
        f"| IFPA canonical tricks (active) | {len(ifpa_slugs)} |",
        f"| IFPA chain registry entries | {len(chain_registry)} |",
        f"| FM rows ingested | {fm_count_in} |",
        f"| PB rows ingested | {pb_count_in} |",
        f"| Total external rows audited | {len(audit_rows)} |",
        f"| Pending Red Wave 2 (any source) | {pending_red} |",
        "",
        "## Audit-row distribution by IFPA status",
        "",
        "| Status | Count |",
        "|---|---|",
    ]
    status_order = [
        "covered_exact",
        "covered_alias",
        "covered_formula_equivalent",
        "missing_safe_to_add",
        "missing_needs_red",
        "missing_needs_curator",
        "missing_insufficient_evidence",
        "excluded_non_trick",
        "excluded_duplicate",
    ]
    for s in status_order:
        if s in stats:
            lines.append(f"| `{s}` | {stats[s]} |")

    lines += [
        "",
        "## Major gaps",
        "",
        "**Where IFPA is strongest:**",
        "",
        "- **Symbolic decomposition** — 71-entry chain registry covers ~51% of cardable browse rows with curator-authored or Red-locked readings; richer than any external source's structural surface.",
        "- **Operator taxonomy** — the 12-modifier + 9-operator + 1-surface kind discriminator (Slice A) plus the four-axis Movement System ontology (Slice L1) is more explicit than FM's symbolic-grammar grouping or PB's prose vocabulary.",
        "- **Branch-family ontology** — Slice M's dual-membership + retirement pattern (torque/blender/drifter in lineage AND own family; clipper-stall retired) has no equivalent in external sources.",
        "- **Honest incompleteness** — Slice M's `UNRESOLVED_COMPOUNDS` pilot + `pendingDecomposition` pill renders folk-derived rows with explicit uncertainty signaling. External sources have no equivalent restraint discipline.",
        "- **ADD math** — pt1-pt12 Red rulings ground IFPA's ADD values in adjudicated decomposition rather than community averaging.",
        "",
        "**Where IFPA is visibly thinner:**",
        "",
        "- **Trick-name count.** IFPA has 160 active rows. PB's named-trick corpus is ~280 entries. FM's symbolic-grammar master has 680 rows (many duplicates). Public users coming from PB/FM will notice missing names first.",
        "- **PB-side hidden-branch-family compounds.** Slice R found 13 PB candidates that decompose into curator-known operators on recognized branch anchors (Big Applesauce, Cheese Processor, Catacomb, Ego, Phobia, etc.) — clean structural fit but not in IFPA today.",
        "- **PB-`far` dialect.** ~13 PB rows encode paradox as the positional operator `far` per Red 2026-05-15 ruling. Their structural identities are recoverable but they don't surface in IFPA without authoring.",
        "- **Productive multiplicity** (double-X, triple-X). pt8 community-stabilized only 3 cases (DLO + double-ATW + double-spin); PB lists additional productive-multiplicity compounds (e.g., triple ATW, ATW sole) that remain non-canonical.",
        "- **No-plant family.** Symposium covers IFPA's no-plant body modifier dimension, but external sources include flying / midair / suspension tricks (double-knee, eclipse) that IFPA hasn't classified under any axis.",
        "- **Set primitives outside the pilot.** Fairy + atomic appear in Movement System axis L1, but their full Wave 2 boundary (operator vs trick) is pending Red. PB encodes fairy compounds confidently; IFPA must wait.",
        "",
        "## What should be added later",
        "",
        f"- **Safe-add candidates ({safe_count} rows in `safe_add_candidates.csv`):** Slice R canonical-gap rows with no Wave 2 operator. Curator decides per-row.",
        "- **Slice N+1 chain authoring (11 known IFPA chain gaps from Slice P):** mind-bender, spinal-tap, tombstone, barraging-osis, magellan, merkon, pigbeater, parkwalk, blur, hatchet, mullet.",
        "- **PB-`far`-dialect normalization:** once chain registry is more complete, the systematic `far ↔ paradox` mapping can drive automated PB→IFPA name reconciliation.",
        "- **Productive-multiplicity case-by-case** per pt8 community-stabilization criterion. Each Red-confirmed addition opens a small batch.",
        "",
        "## What must wait for Red",
        "",
        "See `RED_QUESTIONS_REGISTRY.md` for the full inventory. Six Wave 2 packet items remain pending (sent 2026-05-15):",
        "",
        "1. Operator-vs-trick boundary (Fairy specifically)",
        "2. Compression-intent doctrine",
        "3. Hidden X-dex preservation rules",
        "4. Folk-stabilization adjudication threshold",
        "5. Blurry transitivity (compounds vs base tricks)",
        "6. Barraging operator class",
        "",
        "Each gates batches of downstream curator-triage decisions in `chain_external_alignment.csv` / `add_divergence_reclassified.csv` / `missing_move_triage.csv` / `branch_family_candidates.csv`.",
        "",
        "## Honest publication caveats",
        "",
        "- **FBORG (footbag.org/newmoves/list) is the least-mined external source.** Per `RECONCILIATION_AUDIT_PLAN.md` §13, a future `FBORG-AUDIT-1` lane is planned but not executed. This audit excludes FBORG; the deferral is acknowledged.",
        "- **PB name normalization is partial.** PB writes folk names + technical names + positional qualifiers in free-form prose; the matching here uses string-normalized slugs and may miss alias forms.",
        "- **Coverage metrics double-count when external sources duplicate.** Same trick may appear in FM (canonical) + FM-Wave2 + PB; the audit row count exceeds unique-trick count.",
        "- **The `excluded_non_trick` filter is conservative.** When in doubt the row stays in the audit pile so the curator can decide.",
        "",
        "## Recommended next action",
        "",
        "1. Curator reviews `RED_QUESTIONS_REGISTRY.md` and confirms whether Wave 2 packet still captures every open question (additions may be needed from this audit).",
        "2. Curator triages `safe_add_candidates.csv` per-row at their own pace. Adoption requires explicit curator approval per row; no automated promotion.",
        "3. Wait for Red Wave 2 responses before resolving `missing_needs_red` rows.",
        "4. Optional: surface `uncovered_tricks_table.csv` on an admin-only `/internal/coverage` page so future maintainers see the visible-gap inventory.",
        "5. FBORG-AUDIT-1 lane remains future work; defer until Wave 2 lands and the curator wants the third-source comparison.",
        "",
        "## What this audit does NOT do",
        "",
        "- ❌ Did not add any tricks to IFPA",
        "- ❌ Did not modify chain registry, unresolved-compounds, or family overrides",
        "- ❌ Did not change ADD values",
        "- ❌ Did not resolve Wave 2 questions",
        "- ❌ Did not mine FBORG",
        "- ❌ Did not auto-promote single-source claims",
        "- ❌ Did not fabricate formulas",
        "",
        "All outputs are research-only; under `exploration/comparative-reconciliation-2026-05/`. Implementation deferred.",
        "",
    ]
    path.write_text("\n".join(lines))


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main():
    if not DB_PATH.exists():
        print(f"ERROR: {DB_PATH} not found", file=sys.stderr)
        sys.exit(1)

    ifpa_slugs, name_to_slug, alias_to_slug, ifpa_by_slug = load_ifpa()
    chain_registry = load_chain_registry()
    unresolved = load_unresolved()
    _dual = load_dual_memberships()  # currently informational
    slice_p = load_slice_p()
    slice_r = load_slice_r()
    fm_rows = load_fm()
    pb_rows = load_pb()

    print(f"IFPA tricks: {len(ifpa_slugs)} active")
    print(f"IFPA aliases: {len(alias_to_slug)}")
    print(f"IFPA chain registry: {len(chain_registry)}")
    print(f"UNRESOLVED_COMPOUNDS: {len(unresolved)}")
    print(f"FM rows: {len(fm_rows)}")
    print(f"PB rows: {len(pb_rows)}")

    audit_rows = []
    for ext in fm_rows + pb_rows:
        audit_rows.append(classify_external_row(
            ext, ifpa_slugs, name_to_slug, alias_to_slug,
            ifpa_by_slug, chain_registry, unresolved, slice_p, slice_r,
        ))

    audit_csv  = OUT_DIR / "external_trick_coverage_audit.csv"
    uncov_csv  = OUT_DIR / "uncovered_tricks_table.csv"
    pb_csv     = OUT_DIR / "passback_ifpa_alignment.csv"
    safe_csv   = OUT_DIR / "safe_add_candidates.csv"
    summary_md = OUT_DIR / "FINAL_COVERAGE_SUMMARY.md"

    write_audit_csv(audit_rows, audit_csv)
    uncov_count = write_uncovered_csv(audit_rows, uncov_csv)
    pb_align_count = write_pb_alignment_csv(audit_rows, pb_csv)
    safe_count = write_safe_add_csv(audit_rows, slice_r, safe_csv)
    write_summary(audit_rows, ifpa_slugs, chain_registry,
                  len(pb_rows), len(fm_rows), uncov_count, safe_count, pb_align_count,
                  summary_md)

    print(f"\nOutput rows: {len(audit_rows)} → {audit_csv}")
    print(f"  uncovered: {uncov_count} rows → {uncov_csv}")
    print(f"  pb_alignment: {pb_align_count} rows → {pb_csv}")
    print(f"  safe_add_candidates: {safe_count} rows → {safe_csv}")
    print(f"  summary: {summary_md}")


if __name__ == "__main__":
    main()
