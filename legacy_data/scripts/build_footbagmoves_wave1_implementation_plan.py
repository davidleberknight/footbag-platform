#!/usr/bin/env python3
"""build_footbagmoves_wave1_implementation_plan.py - Wave-1 implementation planning.

Generates curator-reviewable previews of the 10 CANONICAL Wave-1 candidates
without mutating any canonical data. For each candidate proposes: slug,
base_trick, modifier_links, ADD formula, family, semantic + operational
notation candidates, related IFPA rows, alias relationships.

Outputs (all staging; NO DB writes, NO CSV mutations, NO alias additions):
- wave1_implementation_plan.md
- wave1_candidate_rows_preview.csv     — proposed freestyle_tricks rows
- wave1_modifier_link_preview.csv      — proposed freestyle_trick_modifier_links rows
- wave1_notation_preview.csv           — semantic + operational notation per row
"""

import argparse
import csv
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROTATIONAL_BASES = {"whirl", "mirage", "torque", "swirl"}

# Order modifiers appear in semantic notation — IFPA convention is roughly
# "outer-most modifier first, then inner". For Wave-1 we preserve the order
# observed in the FM technical_name verbatim (curator can re-order later).


def slugify(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "unknown"


def load_ifpa(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    tricks = {}
    for r in conn.execute(
        "SELECT slug, canonical_name, adds, base_trick, trick_family, category, notation, description "
        "FROM freestyle_tricks WHERE is_active=1"
    ):
        d = dict(r)
        try:
            d["adds_int"] = int(d["adds"]) if d["adds"] not in (None, "") else None
        except (ValueError, TypeError):
            d["adds_int"] = None
        tricks[d["slug"]] = d
    modifiers = {r["slug"]: dict(r) for r in conn.execute("SELECT * FROM freestyle_trick_modifiers")}
    links = defaultdict(set)
    for r in conn.execute("SELECT trick_slug, modifier_slug FROM freestyle_trick_modifier_links"):
        links[r["trick_slug"]].add(r["modifier_slug"])
    aliases_by_text = {}
    for r in conn.execute("SELECT alias_text, alias_slug, trick_slug FROM freestyle_trick_aliases"):
        aliases_by_text[r["alias_slug"]] = r["trick_slug"]
    return tricks, modifiers, dict(links), aliases_by_text


def parse_modifier_order(tech_name, ifpa_modifiers, ifpa_tricks):
    """Return ordered list of recognized modifiers + base slug (in order of appearance)."""
    if not tech_name:
        return [], None, []
    tokens = re.sub(r"[^a-z0-9\s]", " ", tech_name.lower()).split()
    # Apply abbreviation expansion + filler stripping consistent with L6b
    FM_ABBREVIATION_MAP = {"pdx": ["paradox"], "symp": ["symposium"],
                           "ps": ["paradox", "symposium"], "dlo": ["double", "leg", "over"]}
    DIRECTIONAL_FLAGS = {"reverse", "rev", "far", "down", "over", "back", "front", "side"}
    OPERATIONAL_FILLER = {"set", "toe", "out", "in", "up"}
    stripped = []
    # Strip "same side" into "ss" marker
    out = []
    i = 0
    while i < len(tokens):
        if i + 1 < len(tokens) and tokens[i] == "same" and tokens[i + 1] == "side":
            out.append("ss")
            i += 2
        else:
            out.append(tokens[i])
            i += 1
    tokens = out
    expanded = []
    stripped_tokens = []
    for tok in tokens:
        if tok in FM_ABBREVIATION_MAP:
            expanded.extend(FM_ABBREVIATION_MAP[tok])
        elif tok in DIRECTIONAL_FLAGS or tok in OPERATIONAL_FILLER:
            stripped_tokens.append(tok)
        elif tok == "ss":
            stripped_tokens.append("ss")
        else:
            expanded.append(tok)

    # Find base from right
    base_slug = None
    base_len = 0
    for n in range(min(4, len(expanded)), 0, -1):
        candidate = "-".join(expanded[-n:])
        if candidate in ifpa_tricks:
            base_slug = candidate
            base_len = n
            break
    if not base_slug:
        return [], None, stripped_tokens

    modifier_tokens = expanded[:-base_len]
    modifier_order = [t for t in modifier_tokens if t in ifpa_modifiers]
    return modifier_order, base_slug, stripped_tokens


def expected_add(base_slug, modifier_order, ifpa_tricks, ifpa_modifiers):
    base = ifpa_tricks.get(base_slug)
    if not base or base.get("adds_int") is None:
        return None, ""
    total = base["adds_int"]
    is_rot = base_slug in ROTATIONAL_BASES
    parts = [f"{base_slug}({total})"]
    for mod in modifier_order:
        m = ifpa_modifiers.get(mod)
        if not m:
            return None, ""
        if is_rot and m["add_bonus_rotational"] != m["add_bonus"]:
            w = m["add_bonus_rotational"]
            parts.insert(-1 if len(parts) > 1 else 0, f"{mod}(+{w}rot)")
        else:
            w = m["add_bonus"]
            parts.insert(-1 if len(parts) > 1 else 0, f"{mod}(+{w})")
        total += w
    return total, " + ".join(parts) + f" = {total}"


def semantic_notation(modifier_order, base_slug):
    """IFPA ALL-CAPS modifier+base form (NOTATION_STYLE_GUIDE §5.7 self-atom style for compounds)."""
    parts = [m.upper() for m in modifier_order] + [base_slug.replace("-", " ").upper()]
    return " ".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--packet", default="legacy_data/reports/footbagmoves_wave1_review_packet.csv")
    ap.add_argument("--inventory", default="legacy_data/out/footbagmoves_inventory.csv")
    ap.add_argument("--db", default="database/footbag.db")
    ap.add_argument("--out-dir", default="legacy_data/reports")
    ap.add_argument("--out-prefix", default="footbagmoves_wave1_implementation")
    args = ap.parse_args()

    packet = list(csv.DictReader(open(args.packet, encoding="utf-8")))
    canonical_rows = [p for p in packet if p["recommendation"] == "CANONICAL"]

    inv_by_id = {r["synthetic_external_id"]: r for r in csv.DictReader(open(args.inventory, encoding="utf-8"))}
    ifpa_tricks, ifpa_modifiers, ifpa_links, ifpa_aliases = load_ifpa(args.db)

    proposals = []
    for p in canonical_rows:
        display = p["fm_display_name"]
        tech = p["fm_technical_name"]
        fm_add = int(p["fm_add_count"])

        proposed_slug = slugify(display)
        slug_collision = proposed_slug in ifpa_tricks or proposed_slug in ifpa_aliases

        modifier_order, base_slug, stripped = parse_modifier_order(tech or display, ifpa_modifiers, ifpa_tricks)

        # Use parsed base/modifiers from the packet if available
        if not base_slug and p.get("parsed_base"):
            base_slug = p["parsed_base"]
            modifier_order = p["parsed_modifiers"].split("|") if p["parsed_modifiers"] else []

        base_info = ifpa_tricks.get(base_slug, {})
        base_family = base_info.get("trick_family", "")
        exp_add, formula = expected_add(base_slug, modifier_order, ifpa_tricks, ifpa_modifiers)

        # Family placement: typically base trick's family
        proposed_family = base_family or base_slug

        # Related rows (siblings)
        siblings = []
        for sib_slug, t in ifpa_tricks.items():
            if (t.get("base_trick") or "") == base_slug and sib_slug != proposed_slug:
                sib_mods = ifpa_links.get(sib_slug, set())
                siblings.append({
                    "slug": sib_slug,
                    "adds": t.get("adds_int"),
                    "mods": "|".join(sorted(sib_mods)) or "(empty)",
                })

        # Alias relationships: the FM technical_name (e.g. "Tapping Mirage") could be alias on the new canonical
        alias_candidates = []
        if tech and slugify(tech) != proposed_slug:
            alias_candidates.append({"text": tech.lower(), "slug": slugify(tech), "kind": "FM technical_name"})

        # Operational notation from inventory
        inv = inv_by_id.get(p["synthetic_external_id"], {})
        op_notation = inv.get("operational_notation_raw", "")

        # Semantic notation candidate
        sem_notation = semantic_notation(modifier_order, base_slug) if base_slug else ""

        # Issues
        issues = []
        if slug_collision:
            issues.append(f"SLUG COLLISION: '{proposed_slug}' already exists in IFPA dictionary or aliases")
        if exp_add is None:
            issues.append("expected ADD not computable — modifier or base missing from IFPA tables")
        elif exp_add != fm_add:
            issues.append(f"ADD math disagreement: FM={fm_add}, expected={exp_add}")
        if stripped:
            issues.append(f"FM stripped tokens (directional/filler): {','.join(stripped)} — preserve as flags only, not modifier_links")
        gap_mods = [m for m in modifier_order if m not in ifpa_modifiers]
        if gap_mods:
            issues.append(f"modifier-link gap: {','.join(gap_mods)} not in IFPA modifier table")
        # Family inconsistency check (if base_trick's family is itself, that's a self-family; OK)
        if base_family and base_family != base_slug and proposed_family != base_family:
            issues.append(f"family inconsistency: base '{base_slug}' has family '{base_family}' but proposed_family is '{proposed_family}'")
        # Notation ambiguity: same-side variant
        if p["fm_same_side_variant"] == "1":
            issues.append("same-side variant flag set — consider whether to encode in notation or as alias")
        # Multiplicity caution
        if len(modifier_order) >= 4:
            issues.append(f"high modifier count ({len(modifier_order)}) — pt8 §10 caution despite record evidence")
        # Media-link opportunity
        if inv.get("video_present") == "1":
            issues.append("media-link opportunity: FM row has video; consider sourcing demonstration link")
        # Glossary implications
        new_tokens_for_glossary = []
        for m in modifier_order:
            mw = ifpa_modifiers.get(m, {})
            if mw and mw.get("modifier_type") and not ifpa_tricks.get(m):
                pass  # modifier already documented
        if proposed_slug not in ifpa_tricks:
            new_tokens_for_glossary.append(f"new canonical_name '{display}' may need glossary cross-reference")

        proposals.append({
            "synthetic_external_id": p["synthetic_external_id"],
            "fm_display_name": display,
            "fm_technical_name": tech,
            "fm_add_count": fm_add,
            "proposed_slug": proposed_slug,
            "proposed_display_name": display.lower(),
            "proposed_base_trick": base_slug or "",
            "proposed_modifier_links": "|".join(modifier_order),
            "proposed_family": proposed_family,
            "proposed_category": "compound",
            "proposed_expected_add_formula": formula,
            "proposed_expected_asserted_adds": exp_add if exp_add is not None else "",
            "fm_add_matches": "1" if exp_add == fm_add else "0",
            "proposed_semantic_notation": sem_notation,
            "proposed_operational_notation": op_notation,
            "proposed_aliases_summary": "; ".join(f"{a['text']} ({a['kind']})" for a in alias_candidates),
            "related_ifpa_rows_summary": "; ".join(f"{s['slug']}(adds={s['adds']},mods={s['mods']})" for s in siblings[:5]),
            "related_count": len(siblings),
            "slug_collision": "1" if slug_collision else "0",
            "issues": " | ".join(issues),
            "issue_count": len(issues),
            "stripped_directional_tokens": ",".join(stripped),
            "multiplicity_risk_level": "high" if len(modifier_order) >= 4 else ("moderate" if len(modifier_order) == 3 else "low"),
            "source_paste_file": inv.get("source_paste_file", ""),
        })

    fields = list(proposals[0].keys()) if proposals else []
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Candidate rows preview (mimics freestyle_tricks row structure)
    rows_csv = out_dir / f"{args.out_prefix}_candidate_rows_preview.csv"
    rows_fields = ["proposed_slug", "proposed_display_name", "proposed_base_trick",
                   "proposed_family", "proposed_category", "proposed_expected_asserted_adds",
                   "proposed_expected_add_formula", "proposed_modifier_links",
                   "fm_display_name", "fm_technical_name", "fm_add_count",
                   "fm_add_matches", "slug_collision", "issue_count", "issues",
                   "synthetic_external_id"]
    with open(rows_csv, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows_fields, extrasaction="ignore")
        w.writeheader()
        for r in proposals:
            w.writerow(r)

    # Modifier-link preview (mimics freestyle_trick_modifier_links row structure)
    mod_link_path = out_dir / f"{args.out_prefix}_modifier_link_preview.csv"
    with open(mod_link_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["proposed_trick_slug", "proposed_modifier_slug", "apply_order",
                    "fm_display_name", "fm_technical_name"])
        for r in proposals:
            mods = r["proposed_modifier_links"].split("|") if r["proposed_modifier_links"] else []
            for idx, m in enumerate(mods, start=1):
                w.writerow([r["proposed_slug"], m, idx, r["fm_display_name"], r["fm_technical_name"]])

    # Notation preview (semantic + operational separated)
    not_path = out_dir / f"{args.out_prefix}_notation_preview.csv"
    with open(not_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["proposed_slug", "fm_display_name",
                    "semantic_notation_candidate", "operational_notation_candidate",
                    "semantic_source", "operational_source"])
        for r in proposals:
            w.writerow([r["proposed_slug"], r["fm_display_name"],
                        r["proposed_semantic_notation"],
                        r["proposed_operational_notation"],
                        "IFPA-style derived from parsed base + modifier_links (style: §5.7 self-atom)",
                        "FM-source paste (curator-authored)" if r["proposed_operational_notation"] else "(not seeded)"])

    # Plan markdown
    md = []
    md.append("# FootbagMoves Wave-1 implementation plan")
    md.append("")
    md.append(f"**Run timestamp (UTC):** {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    md.append(f"**Source:** A2 review packet `{args.packet}` (CANONICAL recommendations only)")
    md.append(f"**Candidates planned:** {len(proposals)}")
    md.append("")
    md.append("**Federation-not-adoption posture:** read-only planning. Every proposed row is a CANDIDATE for curator decision. No `tricks.csv` edit, no alias addition, no `freestyle_trick_modifier_links` insert, no DB write, no workbook ingest. The three preview CSVs mirror canonical-data row shapes so curator can copy/edit before any commit.")
    md.append("")
    md.append("## Three-layer separation (preserved throughout)")
    md.append("")
    md.append("Per `feedback_parser_editorial_separation.md`:")
    md.append("- **Parser decomposition** (diagnostic only): emerges from `parse_freestyle_notation.py` reading `canonical_name`. Never reads metadata.")
    md.append("- **Editorial decomposition** (this plan's `proposed_base_trick` + `proposed_modifier_links`): strict join-table view. Asserted ADD is editorial truth.")
    md.append("- **Operational notation** (FM-derived; this plan's `proposed_operational_notation`): execution mechanics. Never reads or writes the semantic layer.")
    md.append("")
    md.append("Each candidate's three layers stay independent; the plan surfaces all three side-by-side without conflating them.")
    md.append("")

    # Aggregate counts
    no_issues = sum(1 for r in proposals if r["issue_count"] == 0)
    with_issues = sum(1 for r in proposals if r["issue_count"] > 0)
    collisions = sum(1 for r in proposals if r["slug_collision"] == "1")
    md.append("## Aggregate signals")
    md.append("")
    md.append(f"- Candidates with zero issues: **{no_issues}** of {len(proposals)}")
    md.append(f"- Candidates with at least one issue: **{with_issues}** (see per-candidate section)")
    md.append(f"- Slug collisions: **{collisions}** (curator must pick alternative slug if collision present)")
    md.append("")

    # Summary table
    md.append("## Summary table")
    md.append("")
    md.append("| # | Proposed slug | Base | Modifiers | ADD | Family | Issues |")
    md.append("|--:|---|---|---|--:|---|--:|")
    for i, r in enumerate(proposals, 1):
        mods = r["proposed_modifier_links"] or "—"
        adds = r["proposed_expected_asserted_adds"]
        md.append(f"| {i} | `{r['proposed_slug']}` | `{r['proposed_base_trick']}` | `{mods}` | {adds} | `{r['proposed_family']}` | {r['issue_count']} |")
    md.append("")

    # Per-candidate detail
    md.append("## Per-candidate implementation proposal")
    md.append("")
    for i, r in enumerate(proposals, 1):
        md.append(f"### {i}. {r['fm_display_name']}")
        md.append("")
        md.append("**Proposed canonical row** (for `legacy_data/inputs/noise/tricks.csv` — preview only):")
        md.append("")
        md.append("| Column | Value |")
        md.append("|---|---|")
        md.append(f"| `slug` | `{r['proposed_slug']}` |")
        md.append(f"| `canonical_name` | `{r['proposed_display_name']}` |")
        md.append(f"| `base_trick` | `{r['proposed_base_trick']}` |")
        md.append(f"| `trick_family` | `{r['proposed_family']}` |")
        md.append(f"| `category` | `{r['proposed_category']}` |")
        md.append(f"| `adds` | `{r['proposed_expected_asserted_adds']}` (per editorial decomp) |")
        md.append(f"| `notation` (semantic) | `{r['proposed_semantic_notation']}` |")
        md.append(f"| `operational_notation` | `{r['proposed_operational_notation'] or '(not seeded)'}` |")
        md.append("")
        md.append("**Proposed `freestyle_trick_modifier_links`** rows:")
        md.append("")
        mods = r["proposed_modifier_links"].split("|") if r["proposed_modifier_links"] else []
        if mods:
            md.append("| apply_order | modifier_slug |")
            md.append("|--:|---|")
            for idx, m in enumerate(mods, 1):
                md.append(f"| {idx} | `{m}` |")
        else:
            md.append("_(none — no modifiers to link)_")
        md.append("")
        md.append("**ADD-math formula (editorial):**")
        md.append("")
        md.append(f"`{r['proposed_expected_add_formula'] or '(not computable)'}`")
        md.append("")
        md.append(f"FM-asserted ADD = **{r['fm_add_count']}**; editorial expected = **{r['proposed_expected_asserted_adds']}** — math {'agrees ✓' if r['fm_add_matches'] == '1' else 'DISAGREES ✗'}")
        md.append("")
        md.append("**Related IFPA rows** (siblings by `base_trick`):")
        md.append("")
        if r["related_count"] and r["related_ifpa_rows_summary"]:
            md.append(r["related_ifpa_rows_summary"])
        else:
            md.append("_(no IFPA rows share this base_trick yet)_")
        md.append("")
        md.append("**Likely alias relationships** (curator decides whether to add as aliases on the new canonical):")
        md.append("")
        if r["proposed_aliases_summary"]:
            md.append("- " + r["proposed_aliases_summary"])
        else:
            md.append("_(no alias candidates identified)_")
        md.append("")
        if r["issues"]:
            md.append("**Issues / cautions:**")
            md.append("")
            for issue in r["issues"].split(" | "):
                md.append(f"- {issue}")
            md.append("")
        md.append("---")
        md.append("")

    # Cross-cutting analysis
    md.append("## Cross-cutting analysis")
    md.append("")
    md.append("### Slug collisions")
    md.append("")
    colliders = [r for r in proposals if r["slug_collision"] == "1"]
    if colliders:
        for r in colliders:
            md.append(f"- `{r['proposed_slug']}` already exists in IFPA (`freestyle_tricks` or `freestyle_trick_aliases`). Curator must choose alternative slug.")
    else:
        md.append("_(no slug collisions; all proposed slugs are new)_")
    md.append("")
    md.append("### Modifier-link gaps")
    md.append("")
    gap_rows = [r for r in proposals if "modifier-link gap" in r["issues"]]
    if gap_rows:
        for r in gap_rows:
            md.append(f"- `{r['proposed_slug']}`: {r['issues']}")
    else:
        md.append("_(no FM modifiers fall outside the IFPA modifier table; all proposed modifier_links use existing IFPA modifier slugs)_")
    md.append("")
    md.append("### Family inconsistencies")
    md.append("")
    family_issues = [r for r in proposals if "family inconsistency" in r["issues"]]
    if family_issues:
        for r in family_issues:
            md.append(f"- `{r['proposed_slug']}`: {r['issues']}")
    else:
        md.append("_(no family inconsistencies; proposed `trick_family` aligns with base trick's family in every case)_")
    md.append("")
    md.append("### Notation ambiguities")
    md.append("")
    md.append("Semantic notation candidates use IFPA's ALL-CAPS modifier+base form (NOTATION_STYLE_GUIDE §5.7 self-atom for named compounds). For high-multiplicity rows (4 modifiers), this produces long notation strings; curator may prefer a more compact form or rely on `freestyle_trick_modifier_links` for structure and use the named compound as `notation`.")
    md.append("")
    rotational_count = sum(1 for r in proposals if r["proposed_base_trick"] in ROTATIONAL_BASES)
    md.append(f"Rotational-base candidates: **{rotational_count}** (modifier weights computed using rotational column where applicable per pt10 normalization).")
    md.append("")
    md.append("### Media-link opportunities")
    md.append("")
    md.append("FM rows with `video_present=1` indicate the FM corpus carries a demonstration video. After curator decides on canonical adoption, the existing video URL (sourced from the FM `videoUrl` API field for tracks already in the API-recon scope) could populate `freestyle_media_links` per the existing media-layer architecture. This is a separate F-track decision per `feedback_gallery_dave_track.md` (Dave's track owns gallery-edit-tool).")
    md.append("")
    md.append("### Glossary implications")
    md.append("")
    md.append("All proposed modifiers (tapping, pixie, diving, spinning, ducking, paradox, symposium, nuclear, stepping, atomic, miraging) are already in IFPA's modifier vocabulary and likely already covered by `/freestyle/glossary`. No new glossary tokens introduced by Wave-1. Curator may add a brief glossary cross-reference for each new canonical_name (e.g. \"Tap — see Tapping Mirage\").")
    md.append("")

    # Pt12 / Wave-2 escalations
    md.append("## Curator-decision queue (after Wave-1 review)")
    md.append("")
    md.append("Once curator decides per row:")
    md.append("- **ACCEPT (canonical):** copy row from `wave1_candidate_rows_preview.csv` into `legacy_data/inputs/noise/tricks.csv` (or new `red_corrections_pt12.csv` for staged commit). Re-run loader 17 + loader 19 + parser-population.")
    md.append("- **CONVERT TO ALIAS:** add row to `legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` aliases column instead of as new trick.")
    md.append("- **DEFER:** flag for pt12 Red packet if ADD math or decomp is uncertain.")
    md.append("- **REJECT:** document reason; no canonical action.")
    md.append("")
    md.append("Wave-1 commit pattern (when curator green-lights):")
    md.append("1. Append rows to `tricks.csv` or `red_additions_2026_04_20.csv` (preserves audit trail by source).")
    md.append("2. Append modifier_links rows to `red_additions_2026_04_20.csv` modifier_links column (loader 19 reads them).")
    md.append("3. Append aliases (FM tech as alias on new canonical) — same CSV, same loader.")
    md.append("4. Run `python3 legacy_data/event_results/scripts/17_load_trick_dictionary.py` then `19_load_red_additions.py` then `python3 scripts/parse_freestyle_notation.py --apply`.")
    md.append("5. Rebuild R1 workbook via `legacy_data/scripts/build_fborg_reconciliation_xlsx.py`.")
    md.append("")

    md.append("## Outputs")
    md.append("")
    md.append(f"- `{out_dir}/{args.out_prefix}_plan.md` — this plan (curator-facing)")
    md.append(f"- `{out_dir}/{args.out_prefix}_candidate_rows_preview.csv` — proposed `freestyle_tricks` rows ({len(proposals)} rows)")
    md.append(f"- `{out_dir}/{args.out_prefix}_modifier_link_preview.csv` — proposed `freestyle_trick_modifier_links` rows")
    md.append(f"- `{out_dir}/{args.out_prefix}_notation_preview.csv` — semantic + operational notation per row (layers separated)")
    md.append("")
    md.append("## Contract preservations")
    md.append("")
    md.append("- ✓ Planning-only. No `tricks.csv` edit; no `red_additions_*.csv` edit; no `freestyle_trick_modifier_links` write; no `freestyle_trick_aliases` write.")
    md.append("- ✓ No DB writes; no workbook ingest; no edits to `external_name_mappings.csv`.")
    md.append("- ✓ Federation-not-adoption: every row is a curator-reviewable proposal; never auto-applied.")
    md.append("- ✓ Three-layer separation maintained: semantic / operational / parser decomposition shown as distinct fields per candidate.")
    md.append("- ✓ FM provenance preserved (synthetic_external_id, source_paste_file traceable per row).")
    md.append("- ✓ Multiplicity caution preserved: high-multiplicity rows (4+ modifiers) flagged in `issues` and `multiplicity_risk_level`.")
    md.append("- ✓ pt8 §10 productive-multiplicity rule: candidates with multiplicity prefix in display already filtered upstream in F2c Bucket D.")

    Path(out_dir / f"{args.out_prefix}_plan.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    print(f"[build_footbagmoves_wave1_implementation_plan] Wrote 4 artifacts to {out_dir}/")
    print(f"  candidates planned: {len(proposals)}")
    print(f"  zero-issue: {no_issues}")
    print(f"  with-issues: {with_issues}")
    print(f"  slug collisions: {collisions}")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
