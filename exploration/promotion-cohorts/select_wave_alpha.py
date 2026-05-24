#!/usr/bin/env python3
"""
select_wave_alpha.py
====================

From the Tier 1 publication frontier, select the SAFEST 20-40 candidate
promotions ("Wave Alpha") grouped by coherent symbolic family, AND
generate a parallel notation-backfill checklist for the existing
canonical-DB rows.

Selection rules — only Tier 1 candidates qualify, and we further filter:
  - Wave Alpha promotion candidates ("promote_with_notation"):
      * canonical-bracket notation form (SET-arc + UPPERCASE [TOKEN])
        scores highest. fm-parens form scores lower (convention
        translation needed). Passback / Stanford scores lowest.
      * structurally simple: ≤1 modifier-prefix token.
      * family-grouped: prefer families with ≥3 members for batch
        curator review.
  - Notation-backfill checklist ("backfill_canonical_op_notation"):
      * presented as a clean curator-ready checklist with all per-source
        notation candidates side-by-side.

Outputs:
  exploration/promotion-cohorts/wave_alpha_promotions_YYYY-MM-DD.csv
  exploration/promotion-cohorts/wave_alpha_notation_backfill_YYYY-MM-DD.csv
  exploration/promotion-cohorts/WAVE_ALPHA_2026-05-23.md

Read-only. No DB writes; no UI changes; no promotions.

Usage:
  python3 exploration/promotion-cohorts/select_wave_alpha.py
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

FRONTIER_CSV = ROOT / "exploration" / "promotion-cohorts" / f"publication_frontier_{TODAY}.csv"
OUT_PROMO_CSV = ROOT / "exploration" / "promotion-cohorts" / f"wave_alpha_promotions_{TODAY}.csv"
OUT_BACKFILL_CSV = ROOT / "exploration" / "promotion-cohorts" / f"wave_alpha_notation_backfill_{TODAY}.csv"
OUT_REPORT = ROOT / "exploration" / "promotion-cohorts" / f"WAVE_ALPHA_{TODAY}.md"

# Modifier tokens used in slug formation. Used to compute modifier-depth.
MODIFIERS = {
    "paradox", "ducking", "spinning", "stepping", "whirling", "blurry",
    "symposium", "pixie", "fairy", "atomic", "quantum", "nuclear", "gyro",
    "tapping", "flying", "double", "rev", "reverse", "near", "far",
    "frigid", "barraging", "blazing", "inspinning",
}

# Canonical-bracket notation pattern: SET-arc + [UPPERCASE TOKEN] form.
CANON_BRACKET_RE = re.compile(
    r"^(?:SET|TOE|CLIP|INSIDE|OUTSIDE|DRAGON|JUMP|FRIGIDOSIS|OP|SAME|"
    r"PIXIE|FAIRY|ATOMIC|NUCLEAR|QUASI|QUANTUM)\b.*\[[A-Z]+\]",
    re.IGNORECASE,
)
HAS_BRACKETS_RE = re.compile(r"\[[A-Z]+\]")
HAS_PARENS_TOKEN_RE = re.compile(r"\([A-Za-z]+\)")
LOOKS_LIKE_FORMULA_RE = re.compile(r"-->\s*\d+\s*ADD", re.IGNORECASE)


def modifier_count(slug: str) -> int:
    return sum(1 for p in slug.split("-") if p in MODIFIERS)


def is_canonical_bracket(notation: str) -> bool:
    if not notation:
        return False
    if LOOKS_LIKE_FORMULA_RE.search(notation):
        return False
    # Must have SET-arc style chain and uppercase bracket flags.
    if not HAS_BRACKETS_RE.search(notation):
        return False
    if " > " not in notation.upper():
        return False
    # Reject pure FM-parens entries (e.g. "Clip > Op In (DEX) ...")
    if HAS_PARENS_TOKEN_RE.search(notation):
        # Mixed bracket+parens; check whether the brackets dominate
        brackets = len(HAS_BRACKETS_RE.findall(notation))
        parens = len(HAS_PARENS_TOKEN_RE.findall(notation))
        if parens > brackets:
            return False
    return True


def is_fm_parens(notation: str) -> bool:
    if not notation:
        return False
    if LOOKS_LIKE_FORMULA_RE.search(notation):
        return False
    return bool(HAS_PARENS_TOKEN_RE.search(notation)) and " > " in notation


def infer_family(slug: str) -> str:
    """Derive the family-anchor token. Strip recognized modifier prefixes."""
    parts = slug.split("-")
    while parts and parts[0] in MODIFIERS:
        parts = parts[1:]
    if not parts:
        return slug.split("-")[-1]
    # Reattach: last 1-2 non-modifier tokens form the base
    return "-".join(parts)


def score_candidate(row: dict) -> tuple[int, str]:
    """Return (score, reason). Higher = safer."""
    score = 0
    reasons: list[str] = []
    fborg = row.get("notation_fborg", "")
    fm = row.get("notation_fm", "")
    pb = row.get("notation_passback", "")
    sf = row.get("notation_stanford", "")
    if is_canonical_bracket(fborg):
        score += 3
        reasons.append("fborg-bracket")
    elif is_canonical_bracket(fm):
        # Some fm rows are already in bracket form (rare)
        score += 3
        reasons.append("fm-bracket")
    elif is_fm_parens(fm):
        score += 2
        reasons.append("fm-parens-needs-translate")
    elif is_fm_parens(fborg):
        score += 2
        reasons.append("fborg-parens-needs-translate")
    elif pb:
        score += 1
        reasons.append("passback-only")
    elif sf:
        score += 1
        reasons.append("stanford-only")
    mc = modifier_count(row["canonical_slug"])
    if mc == 0:
        score += 2
        reasons.append("standalone")
    elif mc == 1:
        score += 1
        reasons.append("single-modifier")
    else:
        score -= 2
        reasons.append("multi-modifier-deep-compound")
    # Doctrine divergence bonus
    if row.get("doctrine_divergence_tier") == "none":
        score += 1
        reasons.append("doctrine-quiet")
    # Parser bonus
    if row.get("parser_status") == "parser-clean":
        score += 1
        reasons.append("parser-clean")
    return score, ",".join(reasons)


def pick_best_notation(row: dict) -> tuple[str, str, str]:
    """Return (notation, source, convention)."""
    fborg = row.get("notation_fborg", "")
    fm = row.get("notation_fm", "")
    pb = row.get("notation_passback", "")
    sf = row.get("notation_stanford", "")
    if is_canonical_bracket(fborg):
        return fborg, "fborg", "canonical_brackets"
    if is_canonical_bracket(fm):
        return fm, "fm", "canonical_brackets"
    if is_fm_parens(fm):
        return fm, "fm", "fm_parens"
    if is_fm_parens(fborg):
        return fborg, "fborg", "fm_parens"
    if pb:
        return pb, "passback", "observational"
    if sf:
        return sf, "stanford", "stanford_shorthand"
    return "", "", ""


# ----------------------------- main selection ---------------------------------

def main() -> int:
    if not FRONTIER_CSV.exists():
        raise FileNotFoundError(
            f"Frontier CSV not found: {FRONTIER_CSV.name}. Run"
            f" analyze_publication_frontier.py first."
        )
    with FRONTIER_CSV.open(newline="", encoding="utf-8") as f:
        all_rows = list(csv.DictReader(f))

    t1 = [r for r in all_rows if r["frontier_tier"] == "1_safest"]

    # ----- Wave Alpha promotion candidates -----
    promotes = [r for r in t1 if r["recommended_action"] == "promote_with_notation"]
    scored = []
    for r in promotes:
        score, reason = score_candidate(r)
        # Filter out candidates that scored < 3 (multi-modifier with weak notation source).
        if score < 3:
            continue
        notation, source, convention = pick_best_notation(r)
        if not notation:
            continue
        fam = infer_family(r["canonical_slug"])
        scored.append({
            "canonical_slug": r["canonical_slug"],
            "family_anchor": fam,
            "wave_alpha_score": score,
            "score_reasons": reason,
            "raw_source_count": r["raw_source_count"],
            "doctrine_divergence_tier": r["doctrine_divergence_tier"],
            "parser_status": r["parser_status"],
            "best_notation": notation,
            "best_notation_source": source,
            "best_notation_convention": convention,
            "all_notation_candidates": "; ".join(
                f"{fam}={r.get(f'notation_{fam}', '')[:60]}"
                for fam in ("fborg", "fm", "passback", "stanford")
                if r.get(f"notation_{fam}")
            ),
        })

    # Group by family_anchor; emit families with ≥3 members first.
    by_family: dict[str, list[dict]] = defaultdict(list)
    for s in scored:
        by_family[s["family_anchor"]].append(s)
    family_counts = Counter({fam: len(members) for fam, members in by_family.items()})

    selected: list[dict] = []
    family_selection_log: list[tuple[str, int]] = []

    # Phase 1: families with ≥3 members (coherent cohorts)
    for fam, _ in sorted(family_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        members = sorted(by_family[fam], key=lambda r: -r["wave_alpha_score"])
        if len(members) < 3:
            continue
        # Take up to 6 from this family to avoid over-concentration
        take = members[:6]
        selected.extend(take)
        family_selection_log.append((fam, len(take)))
        if len(selected) >= 30:
            break

    # Phase 2: if we have headroom (<25), fill with high-score standalone rows
    if len(selected) < 25:
        already_selected = {s["canonical_slug"] for s in selected}
        standalone = [
            s for s in scored
            if s["canonical_slug"] not in already_selected
            and s["wave_alpha_score"] >= 5
        ]
        standalone.sort(key=lambda r: -r["wave_alpha_score"])
        for s in standalone:
            selected.append(s)
            family_selection_log.append((s["family_anchor"], 1))
            if len(selected) >= 30:
                break

    # Sort final selection by family then score
    selected.sort(key=lambda r: (r["family_anchor"], -r["wave_alpha_score"]))

    # Write promotion CSV
    promo_cols = [
        "canonical_slug",
        "family_anchor",
        "wave_alpha_score",
        "score_reasons",
        "raw_source_count",
        "doctrine_divergence_tier",
        "parser_status",
        "best_notation",
        "best_notation_source",
        "best_notation_convention",
        "all_notation_candidates",
    ]
    with OUT_PROMO_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=promo_cols)
        w.writeheader()
        for r in selected:
            w.writerow(r)

    # ----- Backfill checklist -----
    backfills = [r for r in t1 if r["recommended_action"] == "backfill_canonical_op_notation"]
    backfill_rows: list[dict] = []
    for r in backfills:
        notation, source, convention = pick_best_notation(r)
        backfill_rows.append({
            "canonical_slug": r["canonical_slug"],
            "canonical_display_name": r["canonical_display_name"],
            "official_add": r["canonical_official_add"],
            "doctrine_divergence_tier": r["doctrine_divergence_tier"],
            "raw_source_count": r["raw_source_count"],
            "best_notation": notation,
            "best_notation_source": source,
            "best_notation_convention": convention,
            "candidate_fborg": r["notation_fborg"][:200] if r["notation_fborg"] else "",
            "candidate_fm": r["notation_fm"][:200] if r["notation_fm"] else "",
            "candidate_passback": r["notation_passback"][:200] if r["notation_passback"] else "",
            "candidate_stanford": r["notation_stanford"][:200] if r["notation_stanford"] else "",
            "curator_action": "translate-to-bracket" if convention != "canonical_brackets" else "copy-as-is",
        })
    # Sort: divergence none first, then by source count desc, then alpha
    div_order = {"none": 0, "small": 1, "large": 2, "unknown": 3, "": 4}
    backfill_rows.sort(key=lambda r: (
        div_order.get(r["doctrine_divergence_tier"], 99),
        -int(r["raw_source_count"]),
        r["canonical_slug"],
    ))

    backfill_cols = [
        "canonical_slug",
        "canonical_display_name",
        "official_add",
        "doctrine_divergence_tier",
        "raw_source_count",
        "best_notation",
        "best_notation_source",
        "best_notation_convention",
        "curator_action",
        "candidate_fborg",
        "candidate_fm",
        "candidate_passback",
        "candidate_stanford",
    ]
    with OUT_BACKFILL_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=backfill_cols)
        w.writeheader()
        for r in backfill_rows:
            w.writerow(r)

    # ----- Markdown report -----
    lines: list[str] = []
    lines.append(f"# Tier-1 Wave Alpha — Promotion + Notation-Backfill ({TODAY})")
    lines.append("")
    lines.append(
        "Curator-paced promotion wave from the Tier-1 publication frontier"
        f" (236 candidates). Wave Alpha selects {len(selected)} safe"
        " new-promotion candidates grouped by symbolic family, and presents"
        f" the {len(backfill_rows)} parallel notation-backfill rows as a"
        " curator-ready checklist. Read-only research artifact; no DB"
        " writes, no promotions."
    )
    lines.append("")
    lines.append("## Wave Alpha — selection summary")
    lines.append("")
    lines.append("| Stage | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Tier 1 promote_with_notation pool | {len(promotes)} |")
    lines.append(f"| Scored (score >= 3) | {len(scored)} |")
    lines.append(f"| Selected for Wave Alpha | **{len(selected)}** |")
    lines.append(f"| Tier 1 backfill_canonical_op_notation pool | {len(backfills)} |")
    lines.append("")
    lines.append("## Wave Alpha — selection rule")
    lines.append("")
    lines.append("Each Tier 1 promote_with_notation row is scored:")
    lines.append("")
    lines.append("| Signal | Score |")
    lines.append("|---|---:|")
    lines.append("| Notation in canonical-bracket form (no translation needed) | +3 |")
    lines.append("| Notation in fm-parens form (curator translates per dual-convention rule) | +2 |")
    lines.append("| Notation only in passback or stanford | +1 |")
    lines.append("| Standalone slug (no modifier prefix) | +2 |")
    lines.append("| Single-modifier prefix slug | +1 |")
    lines.append("| Multi-modifier deep compound | -2 |")
    lines.append("| Doctrine divergence = none | +1 |")
    lines.append("| Stanford parser-clean | +1 |")
    lines.append("")
    lines.append("Selection: rows with score ≥3, then preferentially fill from")
    lines.append("families with ≥3 members (for batch curator review), capped at 30.")
    lines.append("")
    lines.append("## Wave Alpha — selected families")
    lines.append("")
    lines.append("| Family | Members in Wave Alpha |")
    lines.append("|---|---:|")
    family_picks = Counter(s["family_anchor"] for s in selected)
    for fam, cnt in sorted(family_picks.items(), key=lambda kv: -kv[1]):
        lines.append(f"| `{fam}` | {cnt} |")
    lines.append("")
    lines.append("## Wave Alpha — full candidate list")
    lines.append("")
    lines.append("| Slug | Family | Score | Sources | Best notation | From |")
    lines.append("|---|---|---:|---:|---|---|")
    for s in selected:
        notation = s["best_notation"][:80].replace("|", "\\|")
        lines.append(
            f"| `{s['canonical_slug']}` | `{s['family_anchor']}` |"
            f" {s['wave_alpha_score']} | {s['raw_source_count']} |"
            f" `{notation}` | {s['best_notation_source']} |"
        )
    lines.append("")
    lines.append("## Wave Alpha — by-family detail")
    lines.append("")
    for fam in sorted({s["family_anchor"] for s in selected}):
        members = [s for s in selected if s["family_anchor"] == fam]
        if len(members) < 2:
            continue
        lines.append(f"### `{fam}` family ({len(members)} members)")
        lines.append("")
        for m in members:
            notation = m["best_notation"][:100].replace("|", "\\|")
            lines.append(
                f"- **`{m['canonical_slug']}`** (score {m['wave_alpha_score']},"
                f" {m['raw_source_count']} sources, {m['best_notation_source']}):"
                f" `{notation}`"
            )
        lines.append("")
    lines.append("")
    lines.append("## Parallel notation-backfill checklist")
    lines.append("")
    lines.append(
        "These are the already-canonical rows missing `operational_notation`"
        " with a candidate notation in at least one other source. Sorted"
        " divergence-quiet first."
    )
    lines.append("")
    lines.append("| Slug | Official ADD | Divergence | Action | Best notation | From |")
    lines.append("|---|---:|---|---|---|---|")
    for r in backfill_rows:
        notation = (r["best_notation"] or "")[:80].replace("|", "\\|")
        lines.append(
            f"| `{r['canonical_slug']}` | {r['official_add']} |"
            f" {r['doctrine_divergence_tier']} | {r['curator_action']} |"
            f" `{notation}` | {r['best_notation_source']} |"
        )
    lines.append("")
    lines.append("## Curator workflow")
    lines.append("")
    lines.append("**For Wave Alpha promotions:**")
    lines.append("")
    lines.append("1. Open `wave_alpha_promotions_{TODAY}.csv` and review by family.".replace("{TODAY}", TODAY))
    lines.append("2. For each family, decide whether ALL members deserve canonical rows")
    lines.append("   per the canonical-vs-compositional rule (named identity / non-")
    lines.append("   decomposable / historical / structural-ambiguity-resolver).")
    lines.append("3. For approved members, copy `best_notation` into the active")
    lines.append("   `red_additions_2026_*.csv` (or equivalent) as the canonical")
    lines.append("   bracket-form. Translate fm-parens → canonical-brackets per the")
    lines.append("   dual-convention rule.")
    lines.append("4. Stage + commit per the standard workflow.")
    lines.append("")
    lines.append("**For notation-backfill:**")
    lines.append("")
    lines.append("1. Open `wave_alpha_notation_backfill_{TODAY}.csv` and start with".replace("{TODAY}", TODAY))
    lines.append("   `doctrine_divergence_tier == none` rows (cleanest).")
    lines.append("2. Copy `best_notation` into the `operational_notation` field via")
    lines.append("   `red_corrections_2026_04_20.csv` (or equivalent corrections file).")
    lines.append("3. Run `python3 scripts/parse_freestyle_notation.py --apply` after")
    lines.append("   DB rebuild to refresh structural_parse_json.")
    lines.append("")
    lines.append("## What this slice does NOT do")
    lines.append("")
    lines.append("- ❌ No DB writes")
    lines.append("- ❌ No UI changes")
    lines.append("- ❌ No promotions executed")
    lines.append("- ❌ No automatic notation translation (curator translates conventions)")
    lines.append("- ❌ No doctrine adjudication")
    lines.append("")
    OUT_REPORT.write_text("\n".join(lines), encoding="utf-8")

    print(f"[select_wave_alpha] outputs:")
    print(f"  promote pool: {len(promotes)} → scored: {len(scored)} → selected: {len(selected)}")
    print(f"  backfill checklist: {len(backfill_rows)}")
    print(f"  - {OUT_PROMO_CSV.name}")
    print(f"  - {OUT_BACKFILL_CSV.name}")
    print(f"  - {OUT_REPORT.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
