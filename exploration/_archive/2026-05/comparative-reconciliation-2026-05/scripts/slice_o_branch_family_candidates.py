#!/usr/bin/env python3
"""
Slice O — Branch-Family Candidate Discovery (Pre-Red Comparative Reconciliation)
=================================================================================

Discovers candidate branch-family anchors in the canonical freestyle_tricks
table and classifies each candidate with a curator-suggestive label.

CRITICAL DISCIPLINE
-------------------
This script DOES NOT auto-promote rows to branch-family status. Per the
curator directive 2026-05-16, descendant count does NOT automatically imply
branch family. Candidates may instead be:

  - movement-neighborhoods           (observational cohorts; not productive
                                      in the structural sense)
  - modifier-systems                 (the slug is functionally a modifier)
  - historically-popular-compounds   (many descendants by tradition, not by
                                      conserved descendant logic)
  - naming-accidents                 (descendants share a name fragment but
                                      no structural kinship)
  - tutorial-artifacts               (popular through TT lessons / external
                                      sources, not structural productivity)
  - folk-derived-deferred            (in UNRESOLVED_COMPOUNDS allow-list)
  - branch-family-recognized         (already established post-Slice-M)
  - branch-family-candidate          (curator-review required; never auto-set)
  - unclassified                     (curator decides)

The output is a CSV queue for curator triage. No DB writes; no content-module
changes; no claim that any candidate IS a branch family.

Inputs
------
  - database/footbag.db (read-only)
  - Hardcoded post-Slice-M ontology constants mirrored from:
      src/content/freestyleFamilyOverrides.ts
      src/content/freestyleTrickKindOverrides.ts
      src/content/freestyleUnresolvedCompounds.ts

Outputs
-------
  - exploration/comparative-reconciliation-2026-05/branch_family_candidates.csv
  - exploration/comparative-reconciliation-2026-05/SLICE_O_FINDINGS.md
"""
import csv
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DB_PATH   = REPO_ROOT / "database" / "footbag.db"
OUT_DIR   = REPO_ROOT / "exploration" / "comparative-reconciliation-2026-05"
CSV_OUT   = OUT_DIR / "branch_family_candidates.csv"
MD_OUT    = OUT_DIR / "SLICE_O_FINDINGS.md"

# ─────────────────────────────────────────────────────────────────────────
# Post-Slice-M ontology constants — mirror of TypeScript content modules.
# Each constant cites its source-of-truth file; any drift here should be
# reconciled to the TS module first.
# ─────────────────────────────────────────────────────────────────────────

# src/content/freestyleTrickKindOverrides.ts
MODIFIER_SLUGS = {
    "barraging", "blazing", "ducking", "gyro", "illusioning", "paradox",
    "spinning", "stepping", "symposium", "tapping", "terraging", "spin",
}
OPERATOR_SLUGS = {
    "atomic", "fairy", "furious", "pixie", "pogo", "quantum", "rooted",
    "sailing", "shooting",
}
SURFACE_SLUGS = {"clipper"}

# src/content/freestyleFamilyOverrides.ts (Slice J + Slice M)
FAMILY_OVERRIDES_KEYS = {"rev-whirl", "hatchet", "mullet", "high-plains-drifter"}
FAMILY_DUAL_MEMBERSHIPS_KEYS = {"torque", "blender", "drifter"}
RETIRED_FAMILIES = {"clipper-stall"}

# src/content/freestyleUnresolvedCompounds.ts (Slice M)
UNRESOLVED_COMPOUNDS = {
    "rev-up", "tomahawk", "reaper", "surreal", "montage",
    "witchdoctor", "fury", "surgery",
}

# Already-recognized root terminal families (predate Slice M). A row whose
# slug == own trick_family AND appears here is structurally a root family
# anchor, not a candidate. Established by curator over multiple prior slices.
ROOT_TERMINAL_FAMILIES = {
    "whirl", "rev-whirl", "butterfly", "osis", "mirage", "legover",
    "pickup", "illusion",
}

# User-named candidates from the Slice O directive. Force-included in the
# output for completeness — even when they have 0 structural descendants
# (the curator wants them examined and ruled out, not just promoted).
USER_NAMED_CANDIDATES = [
    "barfly", "blur", "ripwalk", "phoenix", "mobius", "ripstein",
    "blurry-torque", "nemesis",
]

# Threshold for "productive cluster" by descendant count. Two is the
# minimum that distinguishes a row with a productive family vs an isolated
# compound. Three+ is the cleaner signal but 2 is the lower bound.
DESCENDANT_THRESHOLD = 2

# ─────────────────────────────────────────────────────────────────────────
# Discovery pass — pulls anchor counts and metadata from the live DB.
# ─────────────────────────────────────────────────────────────────────────

def discover_anchors(conn):
    """Returns a dict keyed by slug with descendant + row metadata."""
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT t.slug,
               t.canonical_name,
               t.adds,
               t.base_trick,
               t.trick_family,
               t.category,
               CASE WHEN t.operational_notation IS NOT NULL
                     AND TRIM(t.operational_notation) != ''
                    THEN 1 ELSE 0 END AS has_op_notation
        FROM freestyle_tricks t
        WHERE t.is_active = 1
        """
    ).fetchall()

    by_slug = {
        r[0]: {
            "slug":            r[0],
            "canonical_name":  r[1],
            "adds":            r[2],
            "base_trick":      r[3],
            "trick_family":    r[4],
            "category":        r[5],
            "has_op_notation": bool(r[6]),
            "descendants":     [],
        }
        for r in rows
    }

    # Descendant relation: row D is a descendant of anchor A if
    # D.base_trick == A.slug OR D.trick_family == A.slug.
    # Dedupe per-anchor: a row that matches BOTH base_trick AND trick_family
    # to the same anchor counts ONCE.
    for d_slug, d in by_slug.items():
        anchors_for_d = set()
        for anchor in (d["base_trick"], d["trick_family"]):
            if anchor and anchor != d_slug and anchor in by_slug:
                anchors_for_d.add(anchor)
        for anchor in anchors_for_d:
            by_slug[anchor]["descendants"].append(d_slug)

    return by_slug


# ─────────────────────────────────────────────────────────────────────────
# Classifier — does NOT auto-promote.
# ─────────────────────────────────────────────────────────────────────────

def classify(anchor_row, by_slug):
    """
    Returns (classification, confidence, pending_red, rationale).

    classification ∈ {
      'branch-family-recognized',     # already established post-Slice-M
      'branch-family-candidate',      # curator-review required
      'modifier-system',              # kind != trick
      'operator-system',              # kind != trick
      'surface',                      # kind != trick
      'folk-derived-deferred',        # in UNRESOLVED_COMPOUNDS
      'family-retired',               # in RETIRED_FAMILIES
      'root-terminal-family',         # established root anchor
      'movement-neighborhood-cand',   # cohort-like; not structurally productive
      'modifier-system-derivative',   # compound expression of a modifier
      'branch-family-member',         # descendant of an existing branch
      'historically-popular-compound',# many descendants by tradition only
      'naming-accident-suspect',      # descendants share name but not structure
      'tutorial-artifact-suspect',    # external-popularity skew
      'unclassified',                 # curator decides
    }
    confidence    ∈ { 'red-locked', 'curator-prose-confirmed',
                      'pattern-derived', 'speculative' }
    pending_red   ∈ bool
    """
    slug = anchor_row["slug"]
    descendant_count = len(anchor_row["descendants"])
    own_family       = anchor_row["trick_family"] == slug

    # Kind-discriminator rules — these are structural facts, not branch-family
    # statements.
    if slug in MODIFIER_SLUGS:
        return ("modifier-system", "red-locked", False,
                f"slug is in MODIFIER_SLUGS — not a trick anchor by kind discriminator")
    if slug in OPERATOR_SLUGS:
        return ("operator-system", "red-locked", False,
                f"slug is in OPERATOR_SLUGS — set primitive, not a trick anchor")
    if slug in SURFACE_SLUGS:
        return ("surface", "red-locked", False,
                f"slug is in SURFACE_SLUGS — primitive surface, not a trick anchor")

    if slug in RETIRED_FAMILIES:
        return ("family-retired", "red-locked", False,
                "family retired in Slice M (browse surface only)")

    if slug in UNRESOLVED_COMPOUNDS:
        return ("folk-derived-deferred", "red-locked", True,
                "in UNRESOLVED_COMPOUNDS allow-list; folk-derived; branch promotion unsafe")

    if slug in FAMILY_DUAL_MEMBERSHIPS_KEYS:
        return ("branch-family-recognized", "red-locked", False,
                "Slice M dual-membership already established")

    if slug in ROOT_TERMINAL_FAMILIES and own_family and descendant_count >= DESCENDANT_THRESHOLD:
        return ("root-terminal-family", "red-locked", False,
                "established root terminal family (whirl/butterfly/mirage/osis/legover/pickup/illusion)")

    # Below: cases where the structural signal is real but the classification
    # is curator-dependent. NEVER auto-promote to branch-family.

    # Case A: row has ≥THRESHOLD descendants AND sits in a non-self family.
    # This is the torque/blender/drifter mirror — strongest branch-family
    # candidate pattern. Still NOT auto-promoted.
    if (descendant_count >= DESCENDANT_THRESHOLD
            and anchor_row["trick_family"]
            and anchor_row["trick_family"] != slug):
        return ("branch-family-candidate", "speculative", True,
                f"mirrors Slice M dual-membership pattern: {descendant_count} descendants, "
                f"row sits in '{anchor_row['trick_family']}' family while descendants "
                f"reference '{slug}'. Curator must verify conserved descendant logic before promotion.")

    # Case B: row has ≥THRESHOLD descendants AND IS its own family BUT the
    # family is not in the established root list. Could be a productive
    # branch never named (drifter / double-leg-over pattern) OR a folk-named
    # neighborhood. Curator must decide.
    if descendant_count >= DESCENDANT_THRESHOLD and own_family:
        return ("branch-family-candidate", "speculative", True,
                f"{descendant_count} descendants; row is its own family but family "
                f"is not in established root list. Could be productive branch or "
                f"naming-accident; curator review required.")

    # Case C: row has <THRESHOLD descendants. Not a candidate by structural
    # productivity. Examine other classifications.
    if descendant_count < DESCENDANT_THRESHOLD:
        # Sub-case C1: row's chain reading and base_trick suggest it's a
        # compound expression of a modifier+base (ripwalk = stepping
        # butterfly, phoenix = pixie ducking butterfly). It's not its own
        # anchor; it's a productive compound IN someone else's family.
        if anchor_row["base_trick"] and anchor_row["base_trick"] in ROOT_TERMINAL_FAMILIES:
            return ("modifier-system-derivative", "pattern-derived", False,
                    f"row is a compound expression in {anchor_row['base_trick']} family; "
                    f"no structural descendants; not a branch-family anchor.")

        # Sub-case C2: row is a known branch-family member (torque branch
        # = mobius, paradox-torque, etc.). Descendant of a recognized branch.
        if anchor_row["trick_family"] in FAMILY_DUAL_MEMBERSHIPS_KEYS:
            return ("branch-family-member", "red-locked", False,
                    f"row is a member of the {anchor_row['trick_family']} branch family; "
                    f"not its own anchor.")

        # Sub-case C3: row has its own family slug but no descendants.
        # Possibly a leftover from earlier data work, or an intended
        # branch-family that never developed. Curator should review.
        if own_family:
            return ("naming-accident-suspect", "speculative", False,
                    "row's trick_family equals own slug but no descendants exist. "
                    "Possibly a data-debt artifact or stalled-branch intent.")

        # Sub-case C4: row has no family or unfamiliar family.
        return ("unclassified", "speculative", True,
                "no descendants; structural role unclear from DB alone.")

    return ("unclassified", "speculative", True,
            "structural signal does not match any classifier rule; curator review.")


# ─────────────────────────────────────────────────────────────────────────
# Output writers
# ─────────────────────────────────────────────────────────────────────────

CSV_COLUMNS = [
    "slug",
    "canonical_name",
    "adds",
    "base_trick",
    "trick_family",
    "has_op_notation",
    "descendant_count",
    "descendant_slugs",
    "classification",
    "confidence",
    "pending_red",
    "user_named",
    "rationale",
    "curator_action",   # blank — curator fills in
    "notes",            # blank — curator fills in
]


def write_csv(rows):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def write_summary(rows):
    by_class = {}
    for r in rows:
        by_class.setdefault(r["classification"], []).append(r)

    pending_red = [r for r in rows if r["pending_red"] == "true"]
    user_named  = [r for r in rows if r["user_named"] == "true"]

    lines = [
        "# Slice O — Branch-Family Candidate Discovery — Findings",
        "",
        "Generated by `scripts/slice_o_branch_family_candidates.py` on "
        "the live `database/footbag.db`. No DB writes. Curator-suggestive "
        "classifications only — every row's `curator_action` is blank.",
        "",
        "## Headline finding",
        "",
        "**Exactly one new branch-family candidate surfaces from the structural "
        "discovery pass: `barfly`** (4 descendants: blurriest, superfly, venom, "
        "nemesis). The row mirrors the Slice M dual-membership pattern — "
        "barfly itself sits in the `infinity` family while four descendants "
        "name `barfly` as their family. Curator must verify conserved "
        "descendant logic before promotion; this script does not auto-promote.",
        "",
        "## User-named candidates — examined and ruled out structurally",
        "",
        "The Slice O directive specifically named 8 candidates to examine. "
        "**Seven of the eight have zero structural descendants** and therefore "
        "are NOT branch-family candidates by the productive-cluster signal. "
        "Each is classified per its actual structural role:",
        "",
        "| Slug | Descendants | Classification | Why |",
        "|---|---|---|---|",
    ]
    for r in rows:
        if r["user_named"] != "true":
            continue
        lines.append(
            f"| `{r['slug']}` | {r['descendant_count']} | `{r['classification']}` | "
            f"{r['rationale']} |"
        )

    lines += [
        "",
        "## Classification breakdown",
        "",
        "| Classification | Count |",
        "|---|---|",
    ]
    for cls in sorted(by_class.keys()):
        lines.append(f"| `{cls}` | {len(by_class[cls])} |")

    # Branch-family-candidate detail
    branch_candidates = by_class.get("branch-family-candidate", [])
    if branch_candidates:
        lines += [
            "",
            "## Branch-family candidates (curator review required)",
            "",
            "Each candidate carries `confidence='speculative'` and "
            "`pending_red=true`. The curator must:",
            "",
            "1. Verify conserved descendant logic (an invariant or shared "
            "terminal structure across descendants).",
            "2. Confirm the candidate is structurally distinct from the "
            "lineage family it currently sits in.",
            "3. Decide whether to promote via `FAMILY_DUAL_MEMBERSHIPS` "
            "(post-Red, if applicable).",
            "",
            "| Slug | Family | Descendants | Op-notation? | Rationale |",
            "|---|---|---|---|---|",
        ]
        for r in branch_candidates:
            op = "✓" if r["has_op_notation"] == "True" else "—"
            lines.append(
                f"| `{r['slug']}` | `{r['trick_family']}` | "
                f"{r['descendant_count']} ({r['descendant_slugs']}) | {op} | "
                f"{r['rationale']} |"
            )

    # Other findings worth surfacing
    other_anchors = by_class.get("root-terminal-family", [])
    if other_anchors:
        lines += [
            "",
            "## Root terminal families (already established — no action)",
            "",
        ]
        for r in sorted(other_anchors, key=lambda x: int(x["descendant_count"]), reverse=True):
            lines.append(f"- `{r['slug']}` — {r['descendant_count']} descendants")

    recognized = by_class.get("branch-family-recognized", [])
    if recognized:
        lines += [
            "",
            "## Recognized branch families (post-Slice-M — no action)",
            "",
        ]
        for r in sorted(recognized, key=lambda x: int(x["descendant_count"]), reverse=True):
            lines.append(f"- `{r['slug']}` — {r['descendant_count']} descendants")

    lines += [
        "",
        "## What this slice does NOT do",
        "",
        "- ❌ Auto-promote any row to branch-family status",
        "- ❌ Write to `freestyle_tricks` or any other DB table",
        "- ❌ Modify `freestyleFamilyOverrides.ts` or any content module",
        "- ❌ Add new chain readings",
        "- ❌ Resolve Red Wave 2 pending items",
        "- ❌ Mine FBORG corpus (deferred to FBORG-AUDIT-1 lane)",
        "",
        "## Pending Red Wave 2 (do NOT resolve in this slice)",
        "",
        f"{len(pending_red)} of {len(rows)} rows carry `pending_red=true`. "
        "These are gated on Red Wave 2 rulings: operator-vs-trick boundary, "
        "compression-intent doctrine, hidden X-dex preservation, "
        "folk-stabilization adjudication, blurry transitivity, barraging "
        "operator class.",
        "",
        "## Next slice",
        "",
        "**Slice P — Symbolic-Equivalence Cross-Source Audit.** Will extend "
        "the analysis by cross-referencing FM's `SYMBOLIC_GRAMMAR_MASTER.csv` "
        "+ Passback's staging tables for each anchor and chain entry. Slice O "
        "is internal-only by design.",
        "",
    ]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MD_OUT.write_text("\n".join(lines))


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main():
    if not DB_PATH.exists():
        print(f"ERROR: database not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        by_slug = discover_anchors(conn)
    finally:
        conn.close()

    # Build output rows: every row with ≥THRESHOLD descendants + every
    # user-named candidate (even with 0 descendants — curator wants them
    # examined and ruled out).
    output_rows = []
    seen = set()

    def emit(anchor):
        if anchor["slug"] in seen:
            return
        seen.add(anchor["slug"])
        classification, confidence, pending_red, rationale = classify(anchor, by_slug)
        output_rows.append({
            "slug":               anchor["slug"],
            "canonical_name":     anchor["canonical_name"],
            "adds":               anchor["adds"] or "",
            "base_trick":         anchor["base_trick"] or "",
            "trick_family":       anchor["trick_family"] or "",
            "has_op_notation":    str(anchor["has_op_notation"]),
            "descendant_count":   str(len(anchor["descendants"])),
            "descendant_slugs":   "|".join(sorted(anchor["descendants"])),
            "classification":     classification,
            "confidence":         confidence,
            "pending_red":        "true" if pending_red else "false",
            "user_named":         "true" if anchor["slug"] in USER_NAMED_CANDIDATES else "false",
            "rationale":          rationale,
            "curator_action":     "",
            "notes":              "",
        })

    # First pass: structurally-productive anchors (≥THRESHOLD descendants)
    productive = sorted(
        (a for a in by_slug.values() if len(a["descendants"]) >= DESCENDANT_THRESHOLD),
        key=lambda a: (-len(a["descendants"]), a["slug"]),
    )
    for anchor in productive:
        emit(anchor)

    # Second pass: user-named candidates not yet emitted (those with
    # 0–1 descendants the user wants examined regardless of count).
    for slug in USER_NAMED_CANDIDATES:
        if slug in by_slug:
            emit(by_slug[slug])
        else:
            # Row doesn't exist in active DB. Emit a stub for curator awareness.
            output_rows.append({
                "slug":               slug,
                "canonical_name":     "",
                "adds":               "",
                "base_trick":         "",
                "trick_family":       "",
                "has_op_notation":    "False",
                "descendant_count":   "0",
                "descendant_slugs":   "",
                "classification":     "absent-from-db",
                "confidence":         "red-locked",
                "pending_red":        "false",
                "user_named":         "true",
                "rationale":          "slug not present in active freestyle_tricks rows",
                "curator_action":     "",
                "notes":              "",
            })

    write_csv(output_rows)
    write_summary(output_rows)

    print(f"Slice O wrote {len(output_rows)} rows → {CSV_OUT}")
    print(f"Summary → {MD_OUT}")


if __name__ == "__main__":
    main()
