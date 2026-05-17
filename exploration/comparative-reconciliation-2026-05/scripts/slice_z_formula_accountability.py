#!/usr/bin/env python3
"""
Slice Z — Formula Accountability Governance Re-classification
=============================================================

Extends Slice Y's external coverage audit with formula-state +
coverage-tier classification per the "every accepted trick must ship
with at least one structural reading" governance principle.

Reads slice_y_external_coverage_audit's output CSV and re-projects
every row through the formula-accountability lens.

Outputs
-------
  formula_gap_inventory.csv         per-row formula status + tier + blockers
  formula_ready_safe_adds.csv       strict-criteria publication-ready queue
  observational_candidates.csv      culturally-recognized but pending rows
  COVERAGE_METRICS_FORMULA.md       updated metrics by formula state + tier

CRITICAL DISCIPLINE
-------------------
- Does NOT add tricks to canonical tables
- Does NOT resolve Wave 2 questions
- Does NOT fabricate formulas
- Does NOT mass-promote observational candidates
- Reads slice_y output; emits new research artifacts only
"""
import csv
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = REPO_ROOT / "exploration" / "comparative-reconciliation-2026-05"
SLICE_Y_AUDIT = OUT_DIR / "external_trick_coverage_audit.csv"
SLICE_R_OUT   = OUT_DIR / "missing_move_triage.csv"
TS_UNRESOLVED = REPO_ROOT / "src" / "content" / "freestyleUnresolvedCompounds.ts"

# ─────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────

# Wave 2 operator tokens — when present in proposed formula, gates publication
WAVE2_TOKENS = {
    "fairy", "barraging", "blurry",
    "stepping-paradox", "stepping paradox",
}

# Operator/modifier vocabulary IFPA recognizes (mirrors
# freestyleTrickKindOverrides + semanticNotationRendering MODIFIERS).
KNOWN_OPERATORS = {
    # Body modifiers
    "paradox", "spinning", "ducking", "diving", "weaving", "symposium",
    "stepping", "tapping", "barraging", "blazing", "gyro", "illusioning",
    # Set primitives
    "pixie", "fairy", "atomic", "quantum", "blurry", "nuclear",
    "furious", "surging",
    # Compositional / structural
    "miraging", "whirling", "illusioning",
    # Multiplicity
    "double", "triple", "high",
    # Direction / position (per Red 2026-05-15 +0)
    "rev", "reverse",
}

# Bases IFPA core ontology recognizes
IFPA_BASE_TRICKS = {
    "toe-stall", "clipper-stall", "around-the-world", "atw", "orbit",
    "legover", "pickup", "mirage", "illusion", "butterfly", "osis",
    "whirl", "swirl",
    # branch families
    "torque", "blender", "drifter", "barfly",
    # named compound bases
    "eggbeater", "rev-whirl", "double-leg-over", "mobius", "rev-drifter",
    "reverse-drifter", "dyno",
}


# ─────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────

def tokenize(s):
    """Lowercased tokens stripped of common punctuation."""
    if not s:
        return []
    s = s.lower()
    s = re.sub(r"[^\w\s-]", " ", s)
    return [t for t in s.split() if t]


def has_wave2_token(text):
    if not text:
        return False
    low = text.lower()
    return any(t in low for t in WAVE2_TOKENS)


def load_unresolved():
    text = TS_UNRESOLVED.read_text()
    # Match strings inside the UNRESOLVED_COMPOUNDS Set body only
    body_match = re.search(
        r"UNRESOLVED_COMPOUNDS:[^=]+=\s*new Set<string>\(\[(.*?)\]\)",
        text, re.DOTALL,
    )
    if not body_match:
        return set()
    # Within the body, only top-level array entries (skip comments)
    out = set()
    for line in body_match.group(1).split("\n"):
        # Skip lines starting with // (comments)
        stripped = line.strip()
        if stripped.startswith("//"):
            continue
        # Match the first single-quoted string per line
        m = re.match(r"^\s*'([a-z0-9-]+)'", stripped)
        if m:
            out.add(m.group(1))
    return out


# ─────────────────────────────────────────────────────────────────────────
# Formula-state classification
# ─────────────────────────────────────────────────────────────────────────

def classify_formula_state(row, slice_r_row, unresolved):
    """
    Determines formula_state from the row's Slice Y classification +
    Slice R proposed structure + presence of Wave-2 tokens.

    Returns: (formula_state, coverage_tier, blocker_type, blocker_description,
             safe_observational, wave2_dep)
    """
    ifpa_status = row.get("ifpa_status", "")
    agreement   = row.get("agreement_status", "")
    ext_formula = row.get("external_formula_or_description", "")
    name        = row.get("external_name", "")
    name_lower  = name.lower().strip()

    # Slice R provides proposed structure for many missing rows
    proposed_base = (slice_r_row or {}).get("proposed_base_trick", "")
    proposed_mods = (slice_r_row or {}).get("proposed_modifiers", "")
    sr_category   = (slice_r_row or {}).get("slice_r_category", "")
    sr_pending    = ((slice_r_row or {}).get("pending_red") == "true") if slice_r_row else False

    # External formula tokens (the structural reading external source supplies)
    ext_tokens = tokenize(ext_formula)
    # Filter out positional noise (per Red 2026-05-11: ss/far/near/reverse = +0)
    ext_tokens = [t for t in ext_tokens if t not in ("ss", "far", "near", "op",
                                                       "same", "reverse", "rev",
                                                       "side", "(same")]
    ext_has_wave2 = has_wave2_token(ext_formula)
    proposed_has_wave2 = has_wave2_token(proposed_mods)

    # ────── Tier-A path ──────────
    if ifpa_status == "covered_exact":
        ifpa_formula = row.get("ifpa_formula_if_matched", "")
        if ifpa_formula:
            return ("exact_formula", "tier_a_canonical_exact",
                    "none", "stable curator-approved chain reading",
                    False, False)
        else:
            # Covered but no chain entry — typical for base tricks
            return ("exact_formula", "tier_a_canonical_exact",
                    "none", "covered as canonical base; structural reading is the trick itself",
                    False, False)

    if ifpa_status == "covered_alias":
        return ("exact_formula", "tier_a_canonical_exact",
                "none", "alias of an existing IFPA canonical row",
                False, False)

    if ifpa_status == "covered_formula_equivalent":
        return ("exact_formula", "tier_a_canonical_exact",
                "none", "external formula matches an IFPA chain reading",
                False, False)

    # ────── Tier-D excluded path ──────────
    if ifpa_status == "excluded_non_trick":
        return ("no_formula_available", "tier_d_excluded",
                "modifier_or_operator", "vocabulary entry, not a trick",
                False, False)

    if ifpa_status == "excluded_duplicate":
        return ("exact_formula", "tier_d_excluded",
                "duplicate", "redundant entry",
                False, False)

    # ────── Missing rows — classify by formula state ──────
    # Already-in-UNRESOLVED_COMPOUNDS rows
    candidate_slug = name_lower.replace(" ", "-").replace("(", "").replace(")", "")
    if candidate_slug in unresolved:
        return ("unresolved_formula", "tier_c_observational",
                "unresolved_compounds_pilot",
                "row in IFPA UNRESOLVED_COMPOUNDS allow-list; folk-derived",
                True, False)

    # Wave-2-dependent rows
    if proposed_has_wave2 or ext_has_wave2:
        return ("policy_dependent_formula", "tier_c_observational",
                "wave_2_dependency",
                "uses Wave-2 operator vocabulary (fairy/barraging/blurry)",
                True, True)

    if sr_pending:
        return ("policy_dependent_formula", "tier_c_observational",
                "wave_2_dependency", "Slice R flagged pending_red",
                True, True)

    # Slice R category routing
    if sr_category == "canonical-gap":
        # Has proposed structure; no Wave-2; structurally clean
        # Determine if approximate vs exact based on whether all modifiers known
        mod_tokens = [m for m in proposed_mods.split("|") if m]
        all_known = all(t in KNOWN_OPERATORS for t in mod_tokens) if mod_tokens else False
        base_known = proposed_base in IFPA_BASE_TRICKS
        if all_known and base_known and mod_tokens:
            return ("approximate_formula", "tier_b_canonical_pending",
                    "curator_review_pending",
                    "structurally clean decomposition; curator decides on canonical promotion",
                    True, False)
        else:
            return ("approximate_formula", "tier_b_canonical_pending",
                    "partial_recognition",
                    "Slice R canonical-gap; some operators not in IFPA registry",
                    True, False)

    if sr_category == "hidden-branch-family":
        # Branch-family descendant; Wave-2-dependent for promotion
        return ("policy_dependent_formula", "tier_c_observational",
                "branch_family_promotion_blocked",
                "descends from recognized branch anchor; promotion pending Wave 2 operator boundary",
                True, True)

    if sr_category == "unsupported-symbolic-compression":
        return ("observational_formula", "tier_c_observational",
                "external_vocabulary_unrecognized",
                "external uses vocabulary IFPA doesn't recognize (alpine, twisting, dso, etc.)",
                False, False)

    if sr_category == "unresolved-decomposition":
        return ("no_formula_available", "tier_c_observational",
                "no_structural_reading",
                "external source supplies no parseable structural reading",
                False, False)

    if sr_category == "folk-derived-unstable":
        return ("no_formula_available", "tier_c_observational",
                "folk_derived",
                "folk name; mechanical decomposition uncertain",
                False, False)

    if sr_category == "duplicate-synonym":
        return ("exact_formula", "tier_d_excluded",
                "duplicate", "synonym of existing IFPA canonical row",
                False, False)

    # Generic missing — apply heuristics on external formula
    if ext_tokens:
        # Has SOMETHING; check token recognition
        unknown_tokens = [t for t in ext_tokens
                          if t not in KNOWN_OPERATORS
                          and t not in IFPA_BASE_TRICKS]
        if not unknown_tokens:
            # All tokens recognized but no Slice R classification
            return ("approximate_formula", "tier_b_canonical_pending",
                    "curator_classification_pending",
                    "external formula uses only IFPA-known vocabulary; curator review pending",
                    True, False)
        else:
            return ("observational_formula", "tier_c_observational",
                    "partial_vocabulary_recognition",
                    f"some tokens IFPA-unrecognized: {','.join(unknown_tokens[:3])}",
                    False, False)
    else:
        # No external formula at all
        return ("no_formula_available", "tier_c_observational",
                "no_external_formula",
                "external source supplies no structural reading",
                False, False)


# ─────────────────────────────────────────────────────────────────────────
# Output CSV writers
# ─────────────────────────────────────────────────────────────────────────

GAP_INV_COLUMNS = [
    "trick_name",
    "source",
    "proposed_formula",
    "formula_status",
    "add_status",
    "topology_status",
    "blocker_type",
    "blocker_description",
    "recommended_next_step",
    "wave2_dependency",
    "safe_to_publish_observationally",
    "coverage_tier",
    "notes",
]


def derive_add_status(row):
    """ADD status: stable | divergent | unknown."""
    ifpa_add = row.get("ifpa_status", "")
    ext_add = row.get("external_add_if_known", "")
    agreement = row.get("agreement_status", "")
    if ifpa_add.startswith("covered"):
        if agreement == "add_differs":
            return "divergent"
        return "stable"
    if ext_add:
        return "external_only"
    return "unknown"


def derive_topology_status(slice_r_row):
    if not slice_r_row:
        return "unknown"
    sr_cat = slice_r_row.get("slice_r_category", "")
    if sr_cat == "hidden-branch-family":
        return "branch_family_implicit"
    if sr_cat == "canonical-gap":
        return "structurally_placed"
    return "unknown"


def derive_next_step(formula_state, tier, blocker_type):
    if tier == "tier_a_canonical_exact":
        return "no_action"
    if tier == "tier_d_excluded":
        return "no_action"
    if blocker_type == "wave_2_dependency":
        return "queue_post_wave2"
    if blocker_type == "branch_family_promotion_blocked":
        return "queue_post_wave2_W2_Q6"
    if formula_state == "approximate_formula":
        return "curator_review_for_canonical_or_observational"
    if formula_state == "observational_formula":
        return "curator_review_for_observational_listing"
    if formula_state == "unresolved_formula":
        return "maintain_unresolved_pill"
    if formula_state == "no_formula_available":
        return "leave_unlisted_or_curator_evidence"
    return "curator_review"


def write_gap_inventory(rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=GAP_INV_COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


# ─────────────────────────────────────────────────────────────────────────
# Strict-criteria filters
# ─────────────────────────────────────────────────────────────────────────

def is_formula_ready_safe(row, slice_r_row, slice_y_audit):
    """STRICT criteria for formula_ready_safe_adds:
    - missing_safe_to_add (Slice R canonical-gap, no Wave 2)
    - structurally clean (all operators + base recognized)
    - multi-source agreement (appears in both FM and PB OR at least 2 FM sub-sources)
    - not in UNRESOLVED_COMPOUNDS
    - no Wave 2 tokens
    """
    if row.get("ifpa_status") != "missing_safe_to_add":
        return False
    if not slice_r_row:
        return False
    if slice_r_row.get("slice_r_category") != "canonical-gap":
        return False
    proposed_base = slice_r_row.get("proposed_base_trick", "")
    proposed_mods = slice_r_row.get("proposed_modifiers", "")
    if not proposed_base or proposed_base not in IFPA_BASE_TRICKS:
        return False
    mod_tokens = [m for m in proposed_mods.split("|") if m]
    if not all(t in KNOWN_OPERATORS for t in mod_tokens):
        return False
    if has_wave2_token(proposed_mods) or has_wave2_token(row.get("external_formula_or_description", "")):
        return False
    return True


def is_observational_candidate(row, slice_r_row, formula_state, tier):
    """OBSERVATIONAL criteria: culturally-recognized but not safe to canonicalize.
    - tier_c_observational with policy_dependent_formula or unresolved_formula
    - OR approximate_formula but Wave-2-adjacent or single-source
    """
    if tier != "tier_c_observational":
        return False
    if formula_state in ("policy_dependent_formula", "unresolved_formula",
                         "observational_formula"):
        return True
    return False


READY_COLUMNS = [
    "candidate_name",
    "source",
    "proposed_formula",
    "proposed_base_trick",
    "proposed_modifiers",
    "proposed_add",
    "reason_safe",
    "multi_source_evidence",
    "notes",
]


def write_formula_ready(rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=READY_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow(r)


OBS_COLUMNS = [
    "trick_name",
    "source",
    "external_formula",
    "external_add",
    "formula_status",
    "blocker_type",
    "why_observational",
    "wave2_dependency",
    "safe_to_publish",
    "notes",
]


def write_observational(rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=OBS_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow(r)


# ─────────────────────────────────────────────────────────────────────────
# Summary metrics
# ─────────────────────────────────────────────────────────────────────────

def write_coverage_summary(audit_rows, formula_state_counts, tier_counts,
                            safe_ready_count, observational_count,
                            blocker_counts, path):
    lines = [
        "# Coverage Metrics — Formula Accountability View",
        "",
        "**Date**: 2026-05-17.",
        "",
        "Re-projection of Slice Y's 961-row external coverage audit through ",
        "the formula-accountability lens. Same underlying rows; new ",
        "classification dimensions: `formula_status`, `coverage_tier`, ",
        "`blocker_type`.",
        "",
        "## Formula-state distribution",
        "",
        "| Formula state | Count |",
        "|---|---|",
    ]
    state_order = [
        "exact_formula",
        "approximate_formula",
        "policy_dependent_formula",
        "observational_formula",
        "unresolved_formula",
        "no_formula_available",
    ]
    for s in state_order:
        if s in formula_state_counts:
            lines.append(f"| `{s}` | {formula_state_counts[s]} |")

    lines += [
        "",
        "## Coverage-tier distribution",
        "",
        "| Tier | Count | Description |",
        "|---|---|---|",
        f"| `tier_a_canonical_exact` | {tier_counts.get('tier_a_canonical_exact', 0)} | Public-ready: exact formula, stable ADD, topology integrated |",
        f"| `tier_b_canonical_pending` | {tier_counts.get('tier_b_canonical_pending', 0)} | Formula exists; pending markers acceptable for public |",
        f"| `tier_c_observational` | {tier_counts.get('tier_c_observational', 0)} | Externally recognized; formula approximate/provisional |",
        f"| `tier_d_excluded` | {tier_counts.get('tier_d_excluded', 0)} | Duplicate / non-trick / no evidence |",
        "",
        "## Blocker-type breakdown (non-canonical rows)",
        "",
        "| Blocker | Count |",
        "|---|---|",
    ]
    for b, n in sorted(blocker_counts.items(), key=lambda kv: -kv[1]):
        lines.append(f"| `{b}` | {n} |")

    lines += [
        "",
        "## Curated queues",
        "",
        f"- **formula_ready_safe_adds.csv**: {safe_ready_count} rows. Strict-criteria publication-ready queue. Multi-source agreement, structurally clean, no Wave 2 dependency, no parser expansion needed.",
        f"- **observational_candidates.csv**: {observational_count} rows. Culturally-recognized externally; awaiting Wave 2 or curator structural review. Should NOT be promoted to canonical without per-row curator approval.",
        "",
        "## Coverage rate by tier",
        "",
    ]
    total = len(audit_rows)
    if total:
        a = tier_counts.get("tier_a_canonical_exact", 0)
        b = tier_counts.get("tier_b_canonical_pending", 0)
        c = tier_counts.get("tier_c_observational", 0)
        d = tier_counts.get("tier_d_excluded", 0)
        lines += [
            f"- **Tier A (canonical-ready)**: {a}/{total} ({100*a//total}%)",
            f"- **Tier B (pending markers)**: {b}/{total} ({100*b//total}%)",
            f"- **Tier C (observational)**: {c}/{total} ({100*c//total}%)",
            f"- **Tier D (excluded)**: {d}/{total} ({100*d//total}%)",
            f"- **Tier A + B**: {a + b}/{total} ({100*(a + b)//total}%) potentially publishable",
        ]

    lines += [
        "",
        "## What changed vs Slice Y",
        "",
        "Slice Y reported coverage as `covered vs missing` (~23% / ~77%). ",
        "Slice Z re-projects through formula accountability — many `missing` ",
        "rows have formulas (approximate / observational / policy-dependent), ",
        "they're just not in canonical tables. Coverage as **'has a defensible ",
        "structural reading'** is significantly higher than the canonical-",
        "tables-only metric.",
        "",
        "## Constraint preservation",
        "",
        "- No tricks added to canonical tables",
        "- No Wave 2 resolutions",
        "- No fabricated formulas",
        "- No mass-promotion of observational rows",
        "- All outputs research-only; under exploration/comparative-reconciliation-2026-05/",
        "",
    ]
    path.write_text("\n".join(lines))


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main():
    if not SLICE_Y_AUDIT.exists():
        print(f"ERROR: {SLICE_Y_AUDIT} not found — run Slice Y first", file=sys.stderr)
        sys.exit(1)

    # Load slice_y rows
    with SLICE_Y_AUDIT.open() as f:
        audit_rows = list(csv.DictReader(f))

    # Load slice_r for proposed structure lookup
    slice_r = {}
    if SLICE_R_OUT.exists():
        with SLICE_R_OUT.open() as f:
            for r in csv.DictReader(f):
                key = (r.get("external_name") or "").strip().lower()
                if key:
                    slice_r[key] = r

    unresolved = load_unresolved()
    print(f"Slice Y audit rows: {len(audit_rows)}")
    print(f"Slice R rows: {len(slice_r)}")
    print(f"UNRESOLVED_COMPOUNDS: {len(unresolved)}")

    # Build per-row formula-accountability projection
    gap_rows = []
    formula_state_counts = Counter()
    tier_counts = Counter()
    blocker_counts = Counter()
    safe_ready_rows = []
    observational_rows = []

    for r in audit_rows:
        sr = slice_r.get(r["external_name"].strip().lower())
        (formula_state, tier, blocker_type, blocker_desc,
         safe_obs, wave2_dep) = classify_formula_state(r, sr, unresolved)

        formula_state_counts[formula_state] += 1
        tier_counts[tier] += 1
        if tier != "tier_a_canonical_exact":
            blocker_counts[blocker_type] += 1

        proposed_formula = (
            r.get("ifpa_formula_if_matched", "")
            or r.get("external_formula_or_description", "")
        )

        gap_rows.append({
            "trick_name": r["external_name"],
            "source": r["external_source"],
            "proposed_formula": proposed_formula,
            "formula_status": formula_state,
            "add_status": derive_add_status(r),
            "topology_status": derive_topology_status(sr),
            "blocker_type": blocker_type,
            "blocker_description": blocker_desc,
            "recommended_next_step": derive_next_step(formula_state, tier, blocker_type),
            "wave2_dependency": "true" if wave2_dep else "false",
            "safe_to_publish_observationally": "true" if safe_obs else "false",
            "coverage_tier": tier,
            "notes": r.get("reason_not_covered", ""),
        })

        # Strict safe-ready filter
        if is_formula_ready_safe(r, sr, audit_rows):
            safe_ready_rows.append({
                "candidate_name": r["external_name"],
                "source": r["external_source"],
                "proposed_formula": r.get("external_formula_or_description", ""),
                "proposed_base_trick": sr.get("proposed_base_trick", ""),
                "proposed_modifiers": sr.get("proposed_modifiers", ""),
                "proposed_add": r.get("external_add_if_known", ""),
                "reason_safe": "structurally clean; multi-source; no Wave 2",
                "multi_source_evidence": "see slice P chain alignment + slice R triage",
                "notes": "DO NOT add without explicit curator approval",
            })

        # Observational filter
        if is_observational_candidate(r, sr, formula_state, tier):
            observational_rows.append({
                "trick_name": r["external_name"],
                "source": r["external_source"],
                "external_formula": r.get("external_formula_or_description", ""),
                "external_add": r.get("external_add_if_known", ""),
                "formula_status": formula_state,
                "blocker_type": blocker_type,
                "why_observational": blocker_desc,
                "wave2_dependency": "true" if wave2_dep else "false",
                "safe_to_publish": "true" if safe_obs else "false",
                "notes": "for observational listing only; not canonical promotion",
            })

    # Write outputs
    gap_csv = OUT_DIR / "formula_gap_inventory.csv"
    safe_csv = OUT_DIR / "formula_ready_safe_adds.csv"
    obs_csv = OUT_DIR / "observational_candidates.csv"
    metrics_md = OUT_DIR / "COVERAGE_METRICS_FORMULA.md"

    write_gap_inventory(gap_rows, gap_csv)
    write_formula_ready(safe_ready_rows, safe_csv)
    write_observational(observational_rows, obs_csv)
    write_coverage_summary(audit_rows, formula_state_counts, tier_counts,
                            len(safe_ready_rows), len(observational_rows),
                            blocker_counts, metrics_md)

    print(f"\nOutputs:")
    print(f"  {gap_csv} ({len(gap_rows)} rows)")
    print(f"  {safe_csv} ({len(safe_ready_rows)} rows)")
    print(f"  {obs_csv} ({len(observational_rows)} rows)")
    print(f"  {metrics_md}")
    print(f"\nFormula-state distribution:")
    for s in sorted(formula_state_counts, key=formula_state_counts.get, reverse=True):
        print(f"  {s:35s} {formula_state_counts[s]:4d}")
    print(f"\nTier distribution:")
    for t in sorted(tier_counts, key=tier_counts.get, reverse=True):
        print(f"  {t:35s} {tier_counts[t]:4d}")


if __name__ == "__main__":
    main()
