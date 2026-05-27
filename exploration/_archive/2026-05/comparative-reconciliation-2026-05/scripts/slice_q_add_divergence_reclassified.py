#!/usr/bin/env python3
"""
Slice Q — ADD-Divergence Reclassification
==========================================

Re-categorizes existing ADD-divergence rows from
  exploration/footbagmoves-federation/FM_MATH_DIVERGENCES.csv  (22 rows)
  exploration/add-conflict-audit/ADD_CONFLICT_MATRIX.csv       (278 rows)
through the post-Slice-M ontology lens.

The two input sources OVERLAP (the 22 FM-source rows in the matrix
correspond to FM_MATH_DIVERGENCES rows). The script merges by slug
and assigns each row a single Slice Q category + action.

CRITICAL DISCIPLINE
-------------------
This script does NOT modify any canonical ADD value, does NOT write to
the DB, and does NOT change content modules. Output is curator-triage
queue only. The 'recommended_action' column from the prior audits is
preserved verbatim alongside the new slice_q_action column.

Slice Q categories
------------------
  governing-rule-resolved       Already settled per Red 2026-05-11 / earlier
  branch-family-implicit        Divergence implicates a recognized or
                                candidate branch-family member (Slice M + O)
  compressed-vs-expanded-reading  Same trick at different stopping depth
                                  (pt11 Blurry = Stepping Paradox compression)
  hidden-dex-discrepancy        X-dex preservation; multi-dex rows
  unresolved-pending-red        Red Wave 2 dependency
  historical-drift              External source has stabilized a deprecated
                                or internally-inconsistent form
  folk-stabilization            Curator-flagged folk-derived row
                                (UNRESOLVED_COMPOUNDS)
  internal-agreement            Source agrees with IFPA (informational)
  unclassified                  Curator review required

Inputs
------
  exploration/footbagmoves-federation/FM_MATH_DIVERGENCES.csv
  exploration/add-conflict-audit/ADD_CONFLICT_MATRIX.csv

Outputs
-------
  exploration/comparative-reconciliation-2026-05/add_divergence_reclassified.csv
  exploration/comparative-reconciliation-2026-05/SLICE_Q_FINDINGS.md
"""
import csv
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
FM_MATH   = REPO_ROOT / "exploration" / "footbagmoves-federation" / "FM_MATH_DIVERGENCES.csv"
ADD_MTX   = REPO_ROOT / "exploration" / "add-conflict-audit" / "ADD_CONFLICT_MATRIX.csv"
OUT_DIR   = REPO_ROOT / "exploration" / "comparative-reconciliation-2026-05"
CSV_OUT   = OUT_DIR / "add_divergence_reclassified.csv"
MD_OUT    = OUT_DIR / "SLICE_Q_FINDINGS.md"

# ─────────────────────────────────────────────────────────────────────────
# Post-Slice-M ontology mirrors. Keep aligned with TS content modules.
# ─────────────────────────────────────────────────────────────────────────

BRANCH_FAMILY_RECOGNIZED = {"torque", "blender", "drifter"}
BRANCH_FAMILY_CANDIDATES = {"barfly", "double-leg-over"}
RETIRED_FAMILIES         = {"clipper-stall"}
UNRESOLVED_COMPOUNDS     = {
    "rev-up", "tomahawk", "reaper", "surreal", "montage",
    "witchdoctor", "fury", "surgery",
}

# Red-locked governing rules: any row whose governing_rule field mentions
# one of these is already resolved (per Red 2026-05-11 or earlier).
RED_LOCKED_GOVERNING_RULE_TOKENS = (
    "SS=+0",
    "Red 2026-05-11",
    "Red 2026-05-15",
    "pt11",  # Blurry compression locked
    "pt4",   # eggbeater = atomic legover locked
    "pt7",   # smudge / smog locked
    "pt8",   # smoke locked
    "pt12",  # SS-resolution sweep
)

# Operator-token signatures that imply Red Wave 2 dependency. These match
# the Wave 2 packet topics: operator-vs-trick boundary (fairy), barraging
# operator class, blurry transitivity, etc.
WAVE2_OPERATOR_TOKENS = (
    "fairy",
    "barraging",
    "blurry",   # transitivity question
    "stepping-paradox",
    "stepping paradox",
)

# Operator-tokens that suggest hidden / multi-dex preservation.
HIDDEN_DEX_MARKERS = (
    "X-dex", "X-DEX", "xdex", "XDEX", "X dex",
    "hidden dex", "hidden-dex",
    "double-dex", "double dex",
)


def normalize_slug(name):
    if not name:
        return ""
    s = name.strip().lower()
    s = re.sub(r"[^\w\s-]", " ", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


# ─────────────────────────────────────────────────────────────────────────
# Load + merge inputs
# ─────────────────────────────────────────────────────────────────────────

def load_fm_math():
    rows = []
    with FM_MATH.open() as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({
                "source":            "fm",
                "slug":              normalize_slug(r["fm_term"]),
                "external_name":     r["fm_term"],
                "external_decomp":   r["fm_description"],
                "ifpa_interp":       r["canonical_ifpa_interpretation"],
                "external_add":      r["fm_add"],
                "ifpa_add":          r["ifpa_add"],
                "delta":             r["delta"],
                "governing_rule":    r["governing_rule"],
                "disposition":       r["disposition"],
                "notes":             r["notes"],
                "operator_tokens":   "",   # not in FM_MATH; pulled from matrix where overlap
                "red_needed":        "",
            })
    return rows


def load_add_matrix():
    rows = []
    with ADD_MTX.open() as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({
                "source":            r["source"],
                "slug":              r["trick_slug"].strip().lower() or normalize_slug(r["external_name"]),
                "external_name":     r["external_name"],
                "our_stated_add":    r["our_stated_add"],
                "our_computed_add":  r["our_computed_add"],
                "external_stated_add": r["external_stated_add"],
                "external_computed_add": r["external_computed_add"],
                "formula_used":      r["formula_used"],
                "operator_tokens":   r["operator_tokens"],
                "difference_type":   r["difference_type"],
                "severity":          r["severity"],
                "recommended_action":r["recommended_action"],
                "red_needed":        r["red_needed"],
                "notes":             r["notes"],
            })
    return rows


def merge_inputs(fm_math, matrix):
    """
    Emit every matrix row, enriched with the FM_MATH overlay when the
    matrix row's source='fm' and a matching slug exists in FM_MATH.
    Matrix rows are NOT deduplicated — the matrix may list multiple
    Passback variants per IFPA slug, and each variant warrants its own
    classification row.

    FM_MATH rows whose slugs do not appear in the matrix (rare) are
    appended at the end.
    """
    fm_math_by_slug = {r["slug"]: r for r in fm_math}
    seen_fm_slugs   = set()
    out = []

    for r in matrix:
        merged = dict(r)
        if r.get("source") == "fm":
            fm_overlay = fm_math_by_slug.get(r["slug"])
            if fm_overlay:
                # FM_MATH supplies curated context (governing_rule,
                # disposition, ifpa_interp). Matrix supplies operator_tokens,
                # severity, recommended_action. Merge — FM_MATH wins on
                # the curated fields, matrix wins on the structural fields.
                for col in ("external_decomp", "ifpa_interp", "delta",
                            "governing_rule", "disposition"):
                    if fm_overlay.get(col):
                        merged[col] = fm_overlay[col]
                # FM_MATH has explicit ifpa_add / external_add fields;
                # carry them over so the classifier and CSV emit values.
                if fm_overlay.get("ifpa_add"):
                    merged["ifpa_add"] = fm_overlay["ifpa_add"]
                if fm_overlay.get("external_add"):
                    merged["external_add"] = fm_overlay["external_add"]
                seen_fm_slugs.add(r["slug"])
        out.append(merged)

    # FM_MATH rows whose slug isn't in the matrix's fm rows (edge case).
    for slug, r in fm_math_by_slug.items():
        if slug not in seen_fm_slugs:
            out.append(r)

    return out


# ─────────────────────────────────────────────────────────────────────────
# Classifier
# ─────────────────────────────────────────────────────────────────────────

def classify(row):
    """Returns (slice_q_category, slice_q_action, slice_q_notes)."""
    slug = row.get("slug", "")
    governing = (row.get("governing_rule") or "")
    operator_tokens = (row.get("operator_tokens") or "").lower()
    notes = (row.get("notes") or "")
    notes_low = notes.lower()
    difference_type = (row.get("difference_type") or "").lower()
    severity = (row.get("severity") or "")
    red_needed = (row.get("red_needed") or "").lower()
    source = (row.get("source") or "").lower()

    # 0. Internal-agreement rows (matrix has many of these).
    if difference_type == "agree-internal" or "agree-internal" in difference_type:
        return ("internal-agreement", "informational-only",
                "matrix row agrees with IFPA stated value")

    # 1. Governing-rule-resolved — already locked by a prior Red ruling.
    if any(tok in governing for tok in RED_LOCKED_GOVERNING_RULE_TOKENS):
        return ("governing-rule-resolved", "no-action",
                f"locked by prior Red ruling: '{governing}'")

    # 2. Branch-family-implicit — slug is a recognized branch member or
    #    candidate. Divergence may stem from operator-class boundary.
    if (slug in BRANCH_FAMILY_RECOGNIZED
            or slug in BRANCH_FAMILY_CANDIDATES
            or any(b in operator_tokens for b in BRANCH_FAMILY_RECOGNIZED | BRANCH_FAMILY_CANDIDATES)):
        return ("branch-family-implicit", "curator-decide-post-wave2",
                f"slug or operator references a branch-family-recognized/candidate row")

    # 3. Hidden-dex-discrepancy — X-dex / multi-dex preservation.
    blob = notes + " " + operator_tokens + " " + governing
    if any(m.lower() in blob.lower() for m in HIDDEN_DEX_MARKERS):
        return ("hidden-dex-discrepancy", "curator-decide-post-wave2",
                "X-dex or multi-dex marker detected; preservation rule pending Wave 2")

    # 4. Compressed-vs-expanded-reading — pt11 Blurry = Stepping Paradox.
    if "blurry" in operator_tokens or "blurry" in notes_low:
        # If pt11 reference is present in governing → governing-rule-resolved
        # (already caught above). Otherwise: Wave 2 transitivity question.
        return ("compressed-vs-expanded-reading", "curator-decide-post-wave2",
                "blurry operator implicates compression depth; Wave 2 transitivity pending")

    # 5. Folk-stabilization — slug is in the UNRESOLVED_COMPOUNDS pilot.
    if slug in UNRESOLVED_COMPOUNDS:
        return ("folk-stabilization", "no-action-pending-curator",
                "row is in UNRESOLVED_COMPOUNDS allow-list; folk-derived")

    # 6. Unresolved-pending-red — explicit red_needed flag OR Wave 2 operator.
    if red_needed in ("yes", "true", "1"):
        return ("unresolved-pending-red", "wave2-blocked",
                "matrix-flagged red_needed=yes")
    if any(t in operator_tokens for t in WAVE2_OPERATOR_TOKENS):
        return ("unresolved-pending-red", "wave2-blocked",
                f"operator_tokens contains Wave 2 dependency: {operator_tokens}")
    if any(t in notes_low for t in WAVE2_OPERATOR_TOKENS):
        return ("unresolved-pending-red", "wave2-blocked",
                "notes mention Wave 2 dependency token")

    # 7. Historical-drift — external source disagrees with itself
    #    (stated ≠ computed) or with curator-known stable form.
    if "fm-internal" in severity.lower() or "fm-internal" in notes_low:
        return ("historical-drift", "informational-only",
                "FM stated value disagrees with FM-internal decomposition")
    if "passback dex_count differs" in severity.lower() or "passback dex_count" in notes_low:
        return ("historical-drift", "informational-only",
                "Passback dex_count is a different metric, not ADD — informational")

    # 8. Defer-needs-operator-definition — matrix marks rows where the operator
    #    isn't yet curator-defined.
    if "defer; needs operator definition" in severity.lower():
        return ("unresolved-pending-red", "wave2-blocked",
                f"operator definition deferred: {severity}")

    # 9. Default: unclassified — curator review.
    return ("unclassified", "curator-review",
            "no classifier rule matched; curator decides")


# ─────────────────────────────────────────────────────────────────────────
# Output writers
# ─────────────────────────────────────────────────────────────────────────

CSV_COLUMNS = [
    "slug",
    "source",
    "external_name",
    "ifpa_add",
    "external_add",
    "delta",
    "operator_tokens",
    "governing_rule",
    "difference_type",
    "severity",
    "recommended_action",
    "slice_q_category",
    "slice_q_action",
    "slice_q_notes",
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


def md_cell(s, limit=80):
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
        by_category.setdefault(r["slice_q_category"], []).append(r)
        by_action.setdefault(r["slice_q_action"], []).append(r)
        by_source.setdefault(r["source"], []).append(r)

    pending_red = [r for r in rows if r["pending_red"] == "true"]

    lines = [
        "# Slice Q — ADD-Divergence Reclassification — Findings",
        "",
        "Generated by `scripts/slice_q_add_divergence_reclassified.py`. "
        "Merges FM_MATH_DIVERGENCES.csv (22 curated FM rows) with "
        "ADD_CONFLICT_MATRIX.csv (278 raw rows), collapsing the 22 FM "
        "rows into the matrix's 22 source='fm' rows. Re-categorizes every "
        "row through the post-Slice-M ontology lens.",
        "",
        "No ADD changes; no DB writes; no content-module edits. Curator-",
        "triage queue only.",
        "",
        "## Headline metrics",
        "",
        f"- **Total rows reclassified**: {len(rows)}",
        f"- **Pending Red Wave 2**: {len(pending_red)}",
        f"- **Internal-agreement rows** (no action): "
        f"{len(by_category.get('internal-agreement', []))}",
        f"- **Substantive divergence rows** (anything not internal-agreement): "
        f"{len(rows) - len(by_category.get('internal-agreement', []))}",
        "",
        "## Reclassification breakdown",
        "",
        "| Slice Q Category | Count | Typical Action |",
        "|---|---|---|",
    ]
    category_order = [
        "internal-agreement",
        "governing-rule-resolved",
        "branch-family-implicit",
        "hidden-dex-discrepancy",
        "compressed-vs-expanded-reading",
        "folk-stabilization",
        "historical-drift",
        "unresolved-pending-red",
        "unclassified",
    ]
    for cat in category_order:
        if cat in by_category:
            sample_action = by_category[cat][0]["slice_q_action"]
            lines.append(f"| `{cat}` | {len(by_category[cat])} | `{sample_action}` |")
    # Append any unexpected categories.
    for cat in by_category:
        if cat not in category_order:
            sample_action = by_category[cat][0]["slice_q_action"]
            lines.append(f"| `{cat}` | {len(by_category[cat])} | `{sample_action}` |")

    lines += [
        "",
        "## Action distribution",
        "",
        "| Slice Q Action | Count |",
        "|---|---|",
    ]
    for action, lst in sorted(by_action.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"| `{action}` | {len(lst)} |")

    lines += [
        "",
        "## Source distribution",
        "",
        "| Source | Count |",
        "|---|---|",
    ]
    for src, lst in sorted(by_source.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"| `{src}` | {len(lst)} |")

    # Highest-curator-value bucket: branch-family-implicit + hidden-dex
    spotlight_keys = ("branch-family-implicit", "hidden-dex-discrepancy",
                      "compressed-vs-expanded-reading")
    spotlight = [r for cat in spotlight_keys for r in by_category.get(cat, [])]
    if spotlight:
        lines += [
            "",
            "## Highest-value curator-triage rows",
            "",
            "Rows in `branch-family-implicit`, `hidden-dex-discrepancy`, and ",
            "`compressed-vs-expanded-reading` categories most directly extend ",
            "Slice M's branch-family work and Slice O's barfly candidate. ",
            "All carry `pending_red=true` because their resolution depends on ",
            "Wave 2 rulings.",
            "",
            "| Slug | Source | Category | Δ ADD | Operator tokens | Notes |",
            "|---|---|---|---|---|---|",
        ]
        for r in spotlight[:40]:
            delta = ""
            if r.get("ifpa_add") and r.get("external_add"):
                try:
                    delta = f"{int(r['external_add']) - int(r['ifpa_add']):+d}"
                except (ValueError, TypeError):
                    delta = r.get("delta", "") or "—"
            else:
                delta = r.get("delta", "") or "—"
            lines.append(
                f"| `{r['slug']}` | {r['source']} | `{r['slice_q_category']}` | "
                f"{delta} | {md_cell(r.get('operator_tokens',''), 30)} | "
                f"{md_cell(r['slice_q_notes'], 60)} |"
            )
        if len(spotlight) > 40:
            lines.append(f"| ... | | | | | _(+{len(spotlight)-40} more in CSV)_ |")

    # Governing-rule-resolved rows: surface a summary by governing rule.
    resolved = by_category.get("governing-rule-resolved", [])
    if resolved:
        rule_count = {}
        for r in resolved:
            rule = r.get("governing_rule", "") or "(unspecified)"
            rule_count[rule] = rule_count.get(rule, 0) + 1
        lines += [
            "",
            "## Governing-rule-resolved rows (no action — informational)",
            "",
            "These rows are already settled by a prior Red ruling. Counts by ",
            "governing rule:",
            "",
            "| Governing rule | Count |",
            "|---|---|",
        ]
        for rule, n in sorted(rule_count.items(), key=lambda kv: -kv[1]):
            lines.append(f"| {md_cell(rule, 80)} | {n} |")

    lines += [
        "",
        "## Discipline preserved",
        "",
        "- ❌ No ADD value changes on any canonical row",
        "- ❌ No DB writes",
        "- ❌ No content-module edits",
        "- ❌ No FM_MATH_DIVERGENCES.csv or ADD_CONFLICT_MATRIX.csv mutation",
        "- ❌ No promotion of external ADD values to IFPA canonical",
        "- ❌ No resolution of Wave 2 dependencies",
        "",
        "## Pending Red Wave 2",
        "",
        f"{len(pending_red)} of {len(rows)} rows carry `pending_red=true`. "
        "Triggers: branch-family-implicit, hidden-dex-discrepancy, "
        "compressed-vs-expanded-reading, folk-stabilization, and "
        "unresolved-pending-red categories all depend on Wave 2 rulings. ",
        "These rows are queued; curator does not act until Wave 2 lands.",
        "",
        "## Next slice",
        "",
        "**Slice R — Missing-Move Triage Pass.** Will apply the 8-category ",
        "taxonomy from RECONCILIATION_AUDIT_PLAN.md §6 to the 187-row ",
        "Passback `new_candidates.csv` queue plus WAVE2_INSERTION_MATRIX ",
        "candidates from the FM federation track. Pure curator-content ",
        "classification work; no DB or content changes.",
        "",
    ]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MD_OUT.write_text("\n".join(lines))


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main():
    if not FM_MATH.exists():
        print(f"ERROR: {FM_MATH} not found", file=sys.stderr)
        sys.exit(1)
    if not ADD_MTX.exists():
        print(f"ERROR: {ADD_MTX} not found", file=sys.stderr)
        sys.exit(1)

    fm_math_rows = load_fm_math()
    matrix_rows  = load_add_matrix()
    merged       = merge_inputs(fm_math_rows, matrix_rows)

    # Classify each row.
    out_rows = []
    for r in merged:
        cat, action, slice_notes = classify(r)
        pending_red = action in ("wave2-blocked", "curator-decide-post-wave2") \
            or cat in ("branch-family-implicit", "hidden-dex-discrepancy",
                       "compressed-vs-expanded-reading", "folk-stabilization",
                       "unresolved-pending-red")
        out_rows.append({
            "slug":               r.get("slug", ""),
            "source":             r.get("source", ""),
            "external_name":      r.get("external_name", ""),
            "ifpa_add":           r.get("ifpa_add") or r.get("our_stated_add", ""),
            "external_add":       r.get("external_add") or r.get("external_stated_add", ""),
            "delta":              r.get("delta", ""),
            "operator_tokens":    r.get("operator_tokens", ""),
            "governing_rule":     r.get("governing_rule", ""),
            "difference_type":    r.get("difference_type", ""),
            "severity":           r.get("severity", ""),
            "recommended_action": r.get("recommended_action") or r.get("disposition", ""),
            "slice_q_category":   cat,
            "slice_q_action":     action,
            "slice_q_notes":      slice_notes,
            "pending_red":        "true" if pending_red else "false",
            "curator_action":     "",
            "notes":              r.get("notes", ""),
        })

    write_csv(out_rows)
    write_summary(out_rows)

    print(f"Slice Q reclassified {len(out_rows)} rows")
    print(f"  FM_MATH input rows: {len(fm_math_rows)}")
    print(f"  ADD_MATRIX input rows: {len(matrix_rows)}")
    print(f"  Merged unique rows: {len(out_rows)}")
    print(f"  Output → {CSV_OUT}")
    print(f"  Summary → {MD_OUT}")


if __name__ == "__main__":
    main()
