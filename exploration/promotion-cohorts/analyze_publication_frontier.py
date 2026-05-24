#!/usr/bin/env python3
"""
analyze_publication_frontier.py
================================

Group the comprehensive corpus by canonical_slug. For each slug compute:
  - raw source count (across the 10 source_systems)
  - source-family count (collapsing fm_inventory+fm_symbolic_grammar, etc.)
  - notation availability per source
  - parser_status from stanford_corpus row (when present)
  - ADD-claim spread across sources (doctrine divergence indicator)
  - composite-modifier flag (blurry/surging/furious/gyro)
  - frontier tier (1-3)
  - recommended action

Outputs:
  exploration/promotion-cohorts/publication_frontier_YYYY-MM-DD.csv
    — every slug with ≥4 source-systems and notation present somewhere
  exploration/promotion-cohorts/notation_backfill_wave_YYYY-MM-DD.csv
    — canonical_db rows missing operational_notation that have a candidate
      from at least one other source
  exploration/promotion-cohorts/FRONTIER_ANALYSIS_YYYY-MM-DD.md
    — overview + top-N tables + tier methodology

Read-only. No DB writes; no UI changes; no promotions; no doctrine
auto-resolution.

Usage:
  python3 exploration/promotion-cohorts/analyze_publication_frontier.py
"""

from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[2]
TODAY = date.today().isoformat()

CORPUS_CSV = ROOT / "exploration" / "symbolic-master" / f"comprehensive_symbolic_trick_corpus_{TODAY}.csv"
OUT_FRONTIER_CSV = ROOT / "exploration" / "promotion-cohorts" / f"publication_frontier_{TODAY}.csv"
OUT_BACKFILL_CSV = ROOT / "exploration" / "promotion-cohorts" / f"notation_backfill_wave_{TODAY}.csv"
OUT_REPORT = ROOT / "exploration" / "promotion-cohorts" / f"FRONTIER_ANALYSIS_{TODAY}.md"

# Source-family collapse: 10 raw source_systems → 6 source families.
SOURCE_FAMILY = {
    "canonical_db": "canonical",
    "observational_ts": "internal_ts",
    "tracked_names_ts": "internal_ts",
    "fm_inventory": "fm",
    "fm_symbolic_grammar": "fm",
    "fborg_text": "fborg",
    "fborg_insert_staging": "fborg",
    "passback_intake": "passback",
    "passback_source_links": "passback",
    "stanford_corpus": "stanford",
}

COMPOSITE_MODIFIER_FLAGS = {
    "blurry", "surging", "furious", "gyro",
}

# Modifier slugs that act as compound-prefix tokens in slug formation. We
# detect composite-modifier rows by checking whether the slug starts with
# one of these as a hyphen-separated token.
def has_composite_modifier(slug: str) -> bool:
    if not slug:
        return False
    parts = slug.split("-")
    return any(p in COMPOSITE_MODIFIER_FLAGS for p in parts)


def safe_int(s: str) -> Optional[int]:
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


# ----------------------------- load corpus ------------------------------------

def load_corpus() -> list[dict]:
    if not CORPUS_CSV.exists():
        raise FileNotFoundError(
            f"Corpus CSV not found: {CORPUS_CSV}.\n"
            f"Run build_comprehensive_corpus.py first."
        )
    with CORPUS_CSV.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ----------------------------- grouping ---------------------------------------

def group_by_slug(rows: list[dict]) -> dict[str, list[dict]]:
    by_slug: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        slug = (r.get("canonical_slug") or "").strip()
        if slug:
            by_slug[slug].append(r)
    return by_slug


# ----------------------------- per-slug summary -------------------------------

def summarize_slug(slug: str, srows: list[dict]) -> dict:
    summary: dict = {"canonical_slug": slug}
    source_systems = {r["source_system"] for r in srows}
    source_families = {SOURCE_FAMILY.get(s, "other") for s in source_systems}
    summary["raw_source_count"] = len(source_systems)
    summary["source_family_count"] = len(source_families)
    summary["source_systems"] = ",".join(sorted(source_systems))
    summary["source_families"] = ",".join(sorted(source_families))

    # Canonical-DB anchor
    canon_rows = [r for r in srows if r["source_system"] == "canonical_db"]
    if canon_rows:
        cr = canon_rows[0]
        summary["in_canonical_db"] = "1"
        summary["canonical_publication_status"] = cr.get("publication_status", "")
        summary["canonical_display_name"] = cr.get("source_name", "")
        summary["canonical_official_add"] = cr.get("official_add", "")
        summary["canonical_has_notation"] = "1" if cr.get("notation_primary") else "0"
        summary["canonical_has_op_notation"] = "1" if cr.get("operational_notation") else "0"
    else:
        summary["in_canonical_db"] = "0"
        summary["canonical_publication_status"] = ""
        summary["canonical_display_name"] = ""
        summary["canonical_official_add"] = ""
        summary["canonical_has_notation"] = "0"
        summary["canonical_has_op_notation"] = "0"

    # Notation by source family
    fam_notation: dict[str, str] = {}
    for r in srows:
        fam = SOURCE_FAMILY.get(r["source_system"], "other")
        notation = (
            r.get("operational_notation")
            or r.get("notation_primary")
            or r.get("fm_formula_raw")
            or r.get("fborg_formula_raw")
            or r.get("passback_reading_raw")
            or r.get("stanford_symbolic")
            or r.get("add_formula_primary")
        )
        if notation and fam not in fam_notation:
            fam_notation[fam] = notation
    for fam in ("canonical", "fm", "fborg", "passback", "stanford", "internal_ts"):
        summary[f"notation_{fam}"] = fam_notation.get(fam, "")
    summary["notation_source_count"] = str(len(fam_notation))

    # Parser status (from Stanford row when present)
    stanford_rows = [r for r in srows if r["source_system"] == "stanford_corpus"]
    if stanford_rows:
        ps = stanford_rows[0].get("parser_status", "")
        summary["parser_status"] = ps or "unknown"
    else:
        summary["parser_status"] = "no-stanford"

    # ADD-claim spread across sources (only when ≥2 numeric claims)
    claims_by_family: dict[str, list[int]] = defaultdict(list)
    for r in srows:
        fam = SOURCE_FAMILY.get(r["source_system"], "other")
        n = safe_int(r.get("source_add_claim", ""))
        if n is not None:
            claims_by_family[fam].append(n)
    # Use median per family to dampen intra-family noise.
    per_family_claim = {f: sorted(vs)[len(vs) // 2] for f, vs in claims_by_family.items() if vs}
    summary["per_family_add_claims"] = ";".join(
        f"{f}={v}" for f, v in sorted(per_family_claim.items())
    )
    if per_family_claim:
        claim_values = list(per_family_claim.values())
        summary["add_claim_min"] = str(min(claim_values))
        summary["add_claim_max"] = str(max(claim_values))
        summary["add_claim_spread"] = str(max(claim_values) - min(claim_values))
    else:
        summary["add_claim_min"] = ""
        summary["add_claim_max"] = ""
        summary["add_claim_spread"] = ""

    # Doctrine divergence tier
    spread = safe_int(summary["add_claim_spread"]) or 0
    if not per_family_claim:
        summary["doctrine_divergence_tier"] = "unknown"
    elif spread == 0:
        summary["doctrine_divergence_tier"] = "none"
    elif spread <= 1:
        summary["doctrine_divergence_tier"] = "small"
    else:
        summary["doctrine_divergence_tier"] = "large"

    # Composite-modifier flag
    summary["composite_modifier_flag"] = "1" if has_composite_modifier(slug) else "0"

    # Frontier tier — operating definition matches user's framing.
    # Tier 1 (safest publication frontier):
    #   raw_source_count >= 4 AND has_notation_anywhere AND parser_status in
    #   {parser-clean, no-stanford} AND doctrine_divergence_tier in
    #   {none, small} AND composite_modifier_flag == 0
    # Tier 2 (curator-paced review):
    #   raw_source_count >= 4 but fails one filter
    # Tier 3 (multi-source but not frontier-ready):
    #   raw_source_count >= 4 but fails multiple filters OR composite_modifier
    has_notation = bool(fam_notation)
    in_canon = summary["in_canonical_db"] == "1"
    if summary["raw_source_count"] < 4:
        summary["frontier_tier"] = "below_threshold"
    else:
        failures: list[str] = []
        if not has_notation:
            failures.append("no_notation")
        if summary["parser_status"] not in {"parser-clean", "no-stanford"}:
            failures.append("parser_unclean")
        if summary["doctrine_divergence_tier"] == "large":
            failures.append("divergence_large")
        if summary["composite_modifier_flag"] == "1":
            failures.append("composite_modifier")
        summary["frontier_failures"] = ",".join(failures)
        if not failures:
            summary["frontier_tier"] = "1_safest"
        elif len(failures) == 1:
            summary["frontier_tier"] = "2_curator_review"
        else:
            summary["frontier_tier"] = "3_deferred"

    # Recommended action
    if summary["frontier_tier"] == "1_safest":
        if in_canon and summary["canonical_has_op_notation"] == "1":
            summary["recommended_action"] = "publish_as_is"
        elif in_canon and has_notation:
            summary["recommended_action"] = "backfill_canonical_op_notation"
        elif has_notation:
            summary["recommended_action"] = "promote_with_notation"
        else:
            summary["recommended_action"] = "promote_pending_notation"
    elif summary["frontier_tier"] == "2_curator_review":
        summary["recommended_action"] = "curator_review_single_filter"
    elif summary["frontier_tier"] == "3_deferred":
        summary["recommended_action"] = "defer_multi_filter"
    else:
        summary["recommended_action"] = ""

    return summary


# ----------------------------- frontier CSV -----------------------------------

FRONTIER_COLUMNS = [
    "canonical_slug",
    "canonical_display_name",
    "frontier_tier",
    "frontier_failures",
    "recommended_action",
    "raw_source_count",
    "source_family_count",
    "source_families",
    "source_systems",
    "in_canonical_db",
    "canonical_publication_status",
    "canonical_official_add",
    "canonical_has_notation",
    "canonical_has_op_notation",
    "notation_source_count",
    "notation_canonical",
    "notation_fm",
    "notation_fborg",
    "notation_passback",
    "notation_stanford",
    "notation_internal_ts",
    "parser_status",
    "per_family_add_claims",
    "add_claim_min",
    "add_claim_max",
    "add_claim_spread",
    "doctrine_divergence_tier",
    "composite_modifier_flag",
]


def write_frontier_csv(summaries: list[dict]) -> int:
    rows = [s for s in summaries if s["raw_source_count"] >= 4]
    # Sort by tier (safest first), then by source count desc, then by slug.
    tier_order = {"1_safest": 0, "2_curator_review": 1, "3_deferred": 2}
    rows.sort(
        key=lambda r: (
            tier_order.get(r["frontier_tier"], 99),
            -int(r["raw_source_count"]),
            r["canonical_slug"],
        )
    )
    with OUT_FRONTIER_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FRONTIER_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FRONTIER_COLUMNS})
    return len(rows)


# ----------------------------- backfill CSV -----------------------------------

BACKFILL_COLUMNS = [
    "canonical_slug",
    "canonical_display_name",
    "canonical_official_add",
    "canonical_publication_status",
    "raw_source_count",
    "doctrine_divergence_tier",
    "add_claim_spread",
    "composite_modifier_flag",
    "best_candidate_source",
    "best_candidate_notation",
    "candidate_fm",
    "candidate_fborg",
    "candidate_passback",
    "candidate_stanford",
    "candidate_internal_ts",
    "parser_status",
    "backfill_readiness",
    "recommended_action",
]


def write_backfill_csv(summaries: list[dict]) -> int:
    rows: list[dict] = []
    for s in summaries:
        if s["in_canonical_db"] != "1":
            continue
        if s["canonical_has_op_notation"] == "1":
            continue
        # Need at least one non-canonical candidate notation
        candidates = {
            fam: s.get(f"notation_{fam}", "")
            for fam in ("fm", "fborg", "passback", "stanford", "internal_ts")
            if s.get(f"notation_{fam}", "")
        }
        if not candidates:
            continue
        # Best candidate preference: fborg > fm > passback > stanford > internal_ts
        # Rationale: fborg has the cleanest [BRACKET] convention; fm has the
        # most-authored notation but uses (parens); passback is observational;
        # stanford is shorthand needing translation; internal_ts is curator
        # working notation. Order is curator-paced preference; never an
        # automatic translation.
        for fam in ("fborg", "fm", "passback", "stanford", "internal_ts"):
            if fam in candidates:
                best_fam = fam
                best_notation = candidates[fam]
                break
        # Readiness scoring
        ok = []
        if s["doctrine_divergence_tier"] in {"none", "small"}:
            ok.append("doctrine_ok")
        if s["parser_status"] in {"parser-clean", "no-stanford"}:
            ok.append("parser_ok")
        if s["composite_modifier_flag"] == "0":
            ok.append("no_composite_modifier")
        if best_fam in {"fborg", "fm"}:
            ok.append("strong_source")
        score = len(ok)
        if score >= 3:
            readiness = "high"
        elif score == 2:
            readiness = "medium"
        else:
            readiness = "low"
        row = {
            "canonical_slug": s["canonical_slug"],
            "canonical_display_name": s.get("canonical_display_name", ""),
            "canonical_official_add": s.get("canonical_official_add", ""),
            "canonical_publication_status": s.get("canonical_publication_status", ""),
            "raw_source_count": s["raw_source_count"],
            "doctrine_divergence_tier": s["doctrine_divergence_tier"],
            "add_claim_spread": s.get("add_claim_spread", ""),
            "composite_modifier_flag": s["composite_modifier_flag"],
            "best_candidate_source": best_fam,
            "best_candidate_notation": best_notation,
            "candidate_fm": candidates.get("fm", ""),
            "candidate_fborg": candidates.get("fborg", ""),
            "candidate_passback": candidates.get("passback", ""),
            "candidate_stanford": candidates.get("stanford", ""),
            "candidate_internal_ts": candidates.get("internal_ts", ""),
            "parser_status": s["parser_status"],
            "backfill_readiness": readiness,
            "recommended_action": (
                "backfill_high_confidence" if readiness == "high"
                else "backfill_curator_review" if readiness == "medium"
                else "backfill_defer"
            ),
        }
        rows.append(row)
    # Sort: readiness high first, then doctrine_ok, then alphabetical
    readiness_order = {"high": 0, "medium": 1, "low": 2}
    rows.sort(
        key=lambda r: (
            readiness_order.get(r["backfill_readiness"], 99),
            r["canonical_slug"],
        )
    )
    with OUT_BACKFILL_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=BACKFILL_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    return len(rows)


# ----------------------------- markdown report --------------------------------

def write_report(
    summaries: list[dict],
    frontier_count: int,
    backfill_count: int,
) -> None:
    multi = [s for s in summaries if s["raw_source_count"] >= 4]
    tier1 = [s for s in multi if s["frontier_tier"] == "1_safest"]
    tier2 = [s for s in multi if s["frontier_tier"] == "2_curator_review"]
    tier3 = [s for s in multi if s["frontier_tier"] == "3_deferred"]

    # Subdivide tier 1 by recommended_action
    by_action = Counter(s["recommended_action"] for s in tier1)

    # Doctrine spread distribution across tier 1
    div_dist = Counter(s["doctrine_divergence_tier"] for s in tier1)

    # In-canonical vs not, within tier 1
    in_canon_tier1 = sum(1 for s in tier1 if s["in_canonical_db"] == "1")
    not_canon_tier1 = len(tier1) - in_canon_tier1

    lines: list[str] = []
    lines.append(f"# Publication Frontier + Notation Backfill Wave ({TODAY})")
    lines.append("")
    lines.append(
        "Sharpens the prior cohort analysis by using the 4,178-row"
        " comprehensive corpus and prioritizing slugs that appear in"
        " **≥4 source systems** (the strong cross-source signal)."
        " Read-only. Curator-paced. No DB writes; no promotions."
    )
    lines.append("")
    lines.append("## Funnel")
    lines.append("")
    lines.append("| Stage | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Total unique canonical_slugs in corpus | {len(summaries)} |")
    lines.append(f"| Slugs in ≥4 source systems (the \"gold\" set) | {len(multi)} |")
    lines.append(f"| Tier 1 — safest publication frontier (all filters pass) | {len(tier1)} |")
    lines.append(f"| Tier 2 — curator review (single filter fails) | {len(tier2)} |")
    lines.append(f"| Tier 3 — deferred (multiple filters fail) | {len(tier3)} |")
    lines.append(f"| Notation-backfill wave candidates (canonical, no op_notation, ≥1 source) | {backfill_count} |")
    lines.append("")
    lines.append("## Tier 1 filter cascade")
    lines.append("")
    lines.append("A slug is **Tier 1 (safest publication frontier)** when ALL of:")
    lines.append("")
    lines.append("1. `raw_source_count >= 4` (the user's gold-signal floor)")
    lines.append("2. Has notation in at least one source family")
    lines.append("3. `parser_status` is `parser-clean` or `no-stanford` (no parser failure)")
    lines.append("4. `doctrine_divergence_tier` is `none` or `small` (ADD-claim spread ≤ 1)")
    lines.append("5. `composite_modifier_flag` is 0 (slug does NOT contain blurry/surging/furious/gyro)")
    lines.append("")
    lines.append("These filters are conservative on purpose. The user's framing was")
    lines.append("\"safest large-scale publication frontier\" — the cascade narrows the")
    lines.append("393 multi-source pool to the rows where curator-time is most likely")
    lines.append("to convert cleanly into canonical promotions.")
    lines.append("")
    lines.append("## Tier 1 breakdown")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Already in canonical_db with op_notation (publish_as_is) | {by_action.get('publish_as_is', 0)} |")
    lines.append(f"| In canonical_db, missing op_notation (backfill_canonical_op_notation) | {by_action.get('backfill_canonical_op_notation', 0)} |")
    lines.append(f"| NOT in canonical_db, has notation (promote_with_notation) | {by_action.get('promote_with_notation', 0)} |")
    lines.append(f"| NOT in canonical_db, no notation (promote_pending_notation) | {by_action.get('promote_pending_notation', 0)} |")
    lines.append("")
    lines.append("Doctrine-divergence distribution within Tier 1:")
    lines.append("")
    lines.append("| Spread tier | Count |")
    lines.append("|---|---:|")
    for tier, cnt in sorted(div_dist.items()):
        lines.append(f"| {tier} | {cnt} |")
    lines.append("")
    lines.append("## Top 30 — safest frontier (publish-as-is + backfill-canon)")
    lines.append("")
    publish_as_is = [s for s in tier1 if s["recommended_action"] == "publish_as_is"]
    backfill_canon = [s for s in tier1 if s["recommended_action"] == "backfill_canonical_op_notation"]
    lines.append("These are already in canonical_db. The first table needs nothing;")
    lines.append("the second is the notation-backfill wave anchor.")
    lines.append("")
    lines.append("### Already complete — `publish_as_is` (top 15)")
    lines.append("")
    lines.append("| Slug | Display | Sources | ADD | Op-notation |")
    lines.append("|---|---|---:|---|---|")
    for s in publish_as_is[:15]:
        op = s.get("notation_canonical", "")[:80]
        lines.append(
            f"| `{s['canonical_slug']}` | {s['canonical_display_name']} |"
            f" {s['raw_source_count']} | {s.get('canonical_official_add', '')} |"
            f" `{op}` |"
        )
    lines.append("")
    lines.append(f"({len(publish_as_is)} total publish_as_is — full list in `publication_frontier_{TODAY}.csv`.)")
    lines.append("")
    lines.append("### Notation-backfill wave anchor — `backfill_canonical_op_notation` (top 15)")
    lines.append("")
    lines.append("| Slug | Sources | Official ADD | Best candidate (source) | Notation |")
    lines.append("|---|---:|---|---|---|")
    for s in backfill_canon[:15]:
        # Use fborg first, then fm, then passback
        candidate = ""
        candidate_source = ""
        for fam in ("fborg", "fm", "passback", "stanford"):
            if s.get(f"notation_{fam}"):
                candidate = s[f"notation_{fam}"][:80]
                candidate_source = fam
                break
        lines.append(
            f"| `{s['canonical_slug']}` | {s['raw_source_count']} |"
            f" {s.get('canonical_official_add', '')} | {candidate_source} |"
            f" `{candidate}` |"
        )
    lines.append("")
    lines.append(f"({len(backfill_canon)} total — see `notation_backfill_wave_{TODAY}.csv`.)")
    lines.append("")
    lines.append("## Top 20 — Tier 2 (single-filter failures, curator review)")
    lines.append("")
    lines.append("| Slug | Sources | Failure | Display |")
    lines.append("|---|---:|---|---|")
    for s in tier2[:20]:
        lines.append(
            f"| `{s['canonical_slug']}` | {s['raw_source_count']} |"
            f" {s.get('frontier_failures', '')} | {s['canonical_display_name']} |"
        )
    lines.append("")
    lines.append(f"({len(tier2)} total — full list in publication_frontier CSV.)")
    lines.append("")
    lines.append("## Top 20 — Tier 3 (deferred, multi-filter)")
    lines.append("")
    lines.append("| Slug | Sources | Failures |")
    lines.append("|---|---:|---|")
    for s in tier3[:20]:
        lines.append(
            f"| `{s['canonical_slug']}` | {s['raw_source_count']} |"
            f" {s.get('frontier_failures', '')} |"
        )
    lines.append("")
    lines.append(f"({len(tier3)} total — full list in publication_frontier CSV.)")
    lines.append("")
    lines.append("## Notation-backfill wave — readiness distribution")
    lines.append("")
    lines.append(
        "Canonical-DB rows missing `operational_notation` that have a"
        " candidate from at least one other source. Best-candidate"
        " preference order: fborg > fm > passback > stanford > internal_ts"
        " (cleanest-convention first; never auto-translated)."
    )
    lines.append("")
    # Re-read the backfill CSV to count readiness tiers (cheap):
    if OUT_BACKFILL_CSV.exists():
        with OUT_BACKFILL_CSV.open(newline="", encoding="utf-8") as f:
            rd = list(csv.DictReader(f))
        rdist = Counter(r["backfill_readiness"] for r in rd)
        sdist = Counter(r["best_candidate_source"] for r in rd)
        ddist = Counter(r["doctrine_divergence_tier"] for r in rd)
        lines.append("| Readiness | Count |")
        lines.append("|---|---:|")
        for tier in ("high", "medium", "low"):
            lines.append(f"| {tier} | {rdist.get(tier, 0)} |")
        lines.append("")
        lines.append("| Best-candidate source | Count |")
        lines.append("|---|---:|")
        for src, cnt in sdist.most_common():
            lines.append(f"| {src} | {cnt} |")
        lines.append("")
        lines.append("| Doctrine divergence | Count |")
        lines.append("|---|---:|")
        for tier, cnt in sorted(ddist.items()):
            lines.append(f"| {tier} | {cnt} |")
        lines.append("")
    lines.append("## Methodology — source-family collapse")
    lines.append("")
    lines.append("The 10 source_systems in the comprehensive corpus collapse into 6 families:")
    lines.append("")
    lines.append("| Family | Source systems |")
    lines.append("|---|---|")
    family_to_systems: dict[str, list[str]] = defaultdict(list)
    for sys, fam in SOURCE_FAMILY.items():
        family_to_systems[fam].append(sys)
    for fam in ("canonical", "fm", "fborg", "passback", "stanford", "internal_ts"):
        lines.append(f"| {fam} | {', '.join(sorted(family_to_systems[fam]))} |")
    lines.append("")
    lines.append(
        "The user's \"≥4 source systems\" framing operates on the **raw** 10-system"
        " count (the 393 figure cited). Both `raw_source_count` and"
        " `source_family_count` are preserved in the frontier CSV; the curator"
        " can re-filter on either."
    )
    lines.append("")
    lines.append("## What this slice does NOT do")
    lines.append("")
    lines.append("- ❌ No DB writes")
    lines.append("- ❌ No UI changes")
    lines.append("- ❌ No automatic promotions")
    lines.append("- ❌ No auto-translation between notation conventions")
    lines.append("- ❌ No doctrine adjudication (large-divergence rows surfaced, not resolved)")
    lines.append("- ❌ PassBack ADD claims still treated as observational, not canonical")
    lines.append("")
    lines.append("## Suggested curator workflow")
    lines.append("")
    lines.append(f"1. Open `publication_frontier_{TODAY}.csv`, filter `frontier_tier == 1_safest`")
    lines.append("   AND `recommended_action == backfill_canonical_op_notation`. That's the")
    lines.append("   notation-backfill wave shortlist (concrete next-action set).")
    lines.append(f"2. For each row, open `notation_backfill_wave_{TODAY}.csv` to see the")
    lines.append("   per-source candidates side-by-side.")
    lines.append("3. Pick the cleanest candidate (fborg-bracket form preferred). Author the")
    lines.append("   final canonical-bracket form into `red_corrections_2026_04_20.csv` (or")
    lines.append("   the active corrections file).")
    lines.append("4. Treat Tier 2 rows as a parallel curator-review queue (single-filter")
    lines.append("   failures usually resolve with a quick judgment call).")
    lines.append("5. Defer Tier 3 until the relevant doctrine question (e.g. blurry-family")
    lines.append("   composition) lands.")
    lines.append("")
    OUT_REPORT.write_text("\n".join(lines), encoding="utf-8")


# ----------------------------- entry point ------------------------------------

def main() -> int:
    print(f"[analyze_publication_frontier] reading {CORPUS_CSV.name}")
    rows = load_corpus()
    print(f"  corpus rows: {len(rows)}")
    by_slug = group_by_slug(rows)
    print(f"  unique slugs: {len(by_slug)}")
    summaries = [summarize_slug(slug, srows) for slug, srows in by_slug.items()]
    multi = [s for s in summaries if s["raw_source_count"] >= 4]
    print(f"  multi-source (>=4) slugs: {len(multi)}")
    frontier_count = write_frontier_csv(summaries)
    backfill_count = write_backfill_csv(summaries)
    write_report(summaries, frontier_count, backfill_count)
    tier1 = sum(1 for s in multi if s["frontier_tier"] == "1_safest")
    tier2 = sum(1 for s in multi if s["frontier_tier"] == "2_curator_review")
    tier3 = sum(1 for s in multi if s["frontier_tier"] == "3_deferred")
    print(f"  Tier 1 (safest): {tier1}")
    print(f"  Tier 2 (curator review): {tier2}")
    print(f"  Tier 3 (deferred): {tier3}")
    print(f"  Backfill wave candidates: {backfill_count}")
    print(f"[analyze_publication_frontier] wrote:")
    print(f"  - {OUT_FRONTIER_CSV.name}")
    print(f"  - {OUT_BACKFILL_CSV.name}")
    print(f"  - {OUT_REPORT.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
