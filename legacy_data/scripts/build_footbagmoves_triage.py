#!/usr/bin/env python3
"""build_footbagmoves_triage.py - F2c curator triage preparation.

Reads `legacy_data/reports/footbagmoves_match_preview.csv` (the F2/L6b output)
and partitions the unresolved/conflict/ADD-disagreement rows into 5 curator-
facing buckets:

  A — likely_new_canonical
  B — likely_new_alias
  C — federation_conflict
  D — FM_only_never_canonical
  E — needs_red

Emits one CSV per bucket + an umbrella triage CSV + a summary report at
`legacy_data/reports/footbagmoves_triage*`. Staging only. NO DB writes,
NO canonical mutation, NO alias additions, NO workbook ingest.
"""

import argparse
import csv
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

MULTIPLICITY_TOKENS = {"double", "triple", "quadruple", "quintuple"}


def looks_like_multiplicity_compound(name: str) -> bool:
    tokens = re.sub(r"[^a-z0-9\s]", " ", name.lower()).split()
    return any(t in MULTIPLICITY_TOKENS for t in tokens)


def assign_bucket(row):
    """Return (bucket_code, bucket_name, reason, action_hint) or None if row is already cleanly resolved."""
    add_disagree = row.get("add_agreement", "") == "0"
    conflict_raw = row.get("structural_conflict_flag", "") == "1" or row.get("structural_subtype", "") == "structural_inference_conflict"
    conflict_norm = row.get("structural_conflict_flag_normalized", "") == "1" or row.get("structural_subtype_normalized", "") == "structural_inference_conflict"
    has_conflict = conflict_raw or conflict_norm
    is_matched = bool(row.get("match_layer", ""))
    subtype_norm = row.get("structural_subtype_normalized", "")
    display = row.get("fm_display_name", "")
    tech = row.get("fm_technical_name", "")
    unresolved_tokens = row.get("unresolved_tokens", "")
    candidates_norm = row.get("structural_candidates_normalized", "")
    ifpa_mods = row.get("ifpa_modifier_links", "")

    # Priority 1: ADD disagreement — always needs Red
    if add_disagree:
        return ("E", "needs_red",
                f"ADD value disagreement: FM={row['fm_add_count']} vs IFPA={row.get('ifpa_adds', '')}",
                f"queue for pt12 packet (ADD math); preserve both values; never auto-resolve")

    # Priority 2: Structural conflict — federation tension preserved
    if has_conflict:
        fm_mods_str = "?"
        parse_norm = row.get("structural_parse_normalized", "")
        if "modifiers={" in parse_norm:
            fm_mods_str = parse_norm.split("modifiers={")[-1].split("}")[0]
        return ("C", "federation_conflict",
                f"name-paired (IFPA={row.get('ifpa_slug', '')}) but structural decomp differs: FM={{{fm_mods_str}}} vs IFPA={{{ifpa_mods}}}",
                "preserve both sides; queue for pt12 decomp clarification; never auto-resolve")

    # Already matched cleanly (no conflict, no ADD issue) — out of triage scope
    if is_matched:
        return None

    # Priority 3: L6/L6b structural match (exact or partial) on unmatched display_name → likely new alias
    if subtype_norm in ("structural_inference_exact", "structural_inference_partial"):
        primary_candidate = candidates_norm.split("|")[0] if candidates_norm else "?"
        ambig_note = " (multi-candidate; review ambiguity)" if "|" in candidates_norm else ""
        sub_short = subtype_norm.replace("structural_inference_", "")
        return ("B", "likely_new_alias",
                f"L6/L6b structural match ({sub_short}) to IFPA `{primary_candidate}`{ambig_note}; FM display not yet aliased",
                f"curator review: add `{display}` as alias on `{primary_candidate}`; verify name not already aliased elsewhere")

    # Priority 4: Clean FM parse, no IFPA equivalent → likely new canonical
    if subtype_norm == "structural_inference_unresolved":
        # Heuristic: if the FM technical_name contains multiplicity, reject as canonical (per pt8)
        if tech and looks_like_multiplicity_compound(tech):
            return ("D", "FM_only_never_canonical",
                    f"clean parse but contains multiplicity prefix; rejected per pt8 §10",
                    "do not import; FM-multiplicity-only; preserve as evidence only")
        return ("A", "likely_new_canonical",
                f"clean FM decomp into IFPA-vocab modifiers; no IFPA row with this base+modifier_links combination",
                f"curator review: add as new canonical row OR new alias on related base; structural parse documented in row")

    # Priority 5: Unanalyzable parse → FM-only dialect / never-canonical
    if subtype_norm == "structural_inference_unanalyzable":
        # Detect known FM-only dialect tokens
        FM_DIALECT_TOKENS = {"bubba", "frootie", "fyro", "dragon", "zulu", "spyro", "symple", "neutron",
                             "flapper", "twirl", "phasing", "leaning", "slapping", "motion", "arctic",
                             "atomic", "warping", "shooting", "splicing"}  # some IFPA, some FM-only
        tokens_list = [t for t in unresolved_tokens.split("|") if t]
        has_fm_dialect = any(t in FM_DIALECT_TOKENS for t in tokens_list)
        has_multiplicity_display = looks_like_multiplicity_compound(display)
        if has_multiplicity_display:
            return ("D", "FM_only_never_canonical",
                    f"display_name contains multiplicity prefix (rejected per pt8 §10)",
                    "do not import; FM-multiplicity-only")
        if has_fm_dialect:
            return ("D", "FM_only_never_canonical",
                    f"unresolved tokens include FM-specific dialect: {','.join(t for t in tokens_list if t in FM_DIALECT_TOKENS)}",
                    "do not import; FM-only evidence; preserve raw")
        # Generic unanalyzable — surface to Red for vocabulary classification
        return ("E", "needs_red",
                f"unanalyzable parse; unresolved tokens: {unresolved_tokens or '(none)'}; vocabulary classification needed",
                "queue for pt12 vocabulary clarification")

    return None


def main():
    ap = argparse.ArgumentParser(description="F2c curator triage builder")
    ap.add_argument("--match-preview", default="legacy_data/reports/footbagmoves_match_preview.csv")
    ap.add_argument("--out-dir", default="legacy_data/reports")
    ap.add_argument("--out-prefix", default="footbagmoves_triage")
    args = ap.parse_args()

    rows_in = list(csv.DictReader(open(args.match_preview, encoding="utf-8")))
    triaged = []
    for r in rows_in:
        result = assign_bucket(r)
        if result is None:
            continue
        bucket_code, bucket_name, reason, action = result
        triaged.append({
            "synthetic_external_id": r["synthetic_external_id"],
            "bucket": bucket_code,
            "bucket_name": bucket_name,
            "triage_reason": reason,
            "curator_action_hint": action,
            "fm_display_name": r["fm_display_name"],
            "fm_technical_name": r["fm_technical_name"],
            "fm_add_count": r["fm_add_count"],
            "fm_same_side_variant": r["fm_same_side_variant"],
            "ifpa_slug": r.get("ifpa_slug", ""),
            "ifpa_canonical_name": r.get("ifpa_canonical_name", ""),
            "ifpa_adds": r.get("ifpa_adds", ""),
            "ifpa_modifier_links": r.get("ifpa_modifier_links", ""),
            "match_layer": r.get("match_layer", ""),
            "match_confidence": r.get("match_confidence", ""),
            "structural_subtype": r.get("structural_subtype", ""),
            "structural_subtype_normalized": r.get("structural_subtype_normalized", ""),
            "structural_candidates_normalized": r.get("structural_candidates_normalized", ""),
            "normalization_notes": r.get("normalization_notes", ""),
            "add_agreement": r.get("add_agreement", ""),
        })

    fields = ["synthetic_external_id", "bucket", "bucket_name", "triage_reason", "curator_action_hint",
              "fm_display_name", "fm_technical_name", "fm_add_count", "fm_same_side_variant",
              "ifpa_slug", "ifpa_canonical_name", "ifpa_adds", "ifpa_modifier_links",
              "match_layer", "match_confidence",
              "structural_subtype", "structural_subtype_normalized", "structural_candidates_normalized",
              "normalization_notes", "add_agreement"]

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    def emit(path, rows):
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            for r in rows:
                w.writerow(r)

    emit(out_dir / f"{args.out_prefix}.csv", triaged)
    bucket_groups = defaultdict(list)
    for r in triaged:
        bucket_groups[r["bucket"]].append(r)
    bucket_files = {
        "A": "A_likely_new_canonical",
        "B": "B_likely_new_alias",
        "C": "C_federation_conflict",
        "D": "D_FM_only_never_canonical",
        "E": "E_needs_red",
    }
    for code, suffix in bucket_files.items():
        emit(out_dir / f"{args.out_prefix}_{suffix}.csv", bucket_groups.get(code, []))

    # Report
    total_in = len(rows_in)
    total_triaged = len(triaged)
    clean_resolved = total_in - total_triaged

    rep = []
    rep.append("# FootbagMoves curator triage (F2c)")
    rep.append("")
    rep.append(f"**Run timestamp (UTC):** {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    rep.append(f"**Source:** `{args.match_preview}` ({total_in} rows)")
    rep.append("")
    rep.append("**Federation-not-adoption posture:** read-only triage preparation. No DB writes, no canonical mutation, no alias additions, no workbook ingest. Every bucket recommends curator review, not auto-application. Raw FM data and normalized analysis both preserved per row.")
    rep.append("")
    rep.append("## Bucket distribution")
    rep.append("")
    rep.append("| Bucket | Name | Count | Pct of triage | Pct of inventory |")
    rep.append("|---|---|--:|--:|--:|")
    for code, suffix in bucket_files.items():
        c = len(bucket_groups.get(code, []))
        pct_t = (c / total_triaged * 100) if total_triaged else 0
        pct_i = (c / total_in * 100) if total_in else 0
        rep.append(f"| {code} | {suffix.replace('_', ' ')} | {c} | {pct_t:.1f}% | {pct_i:.1f}% |")
    rep.append("")
    rep.append(f"- Total in triage cohort: **{total_triaged}** rows")
    rep.append(f"- Already cleanly resolved (out of scope): **{clean_resolved}** rows")
    rep.append(f"- Inventory total: **{total_in}** rows")
    rep.append("")

    # Per-bucket samples
    sample_caps = {"A": 15, "B": 15, "C": 10, "D": 10, "E": 15}
    for code, suffix in bucket_files.items():
        rows_in_bucket = bucket_groups.get(code, [])
        rep.append(f"## Bucket {code} — {suffix.replace('_', ' ')} ({len(rows_in_bucket)} rows)")
        rep.append("")
        if not rows_in_bucket:
            rep.append("_(empty)_")
            rep.append("")
            continue
        cap = sample_caps[code]
        rep.append(f"Sample (top {min(cap, len(rows_in_bucket))} of {len(rows_in_bucket)}; full set in `{args.out_prefix}_{suffix}.csv`):")
        rep.append("")
        rep.append("| FM display | FM tech | Adds | IFPA slug | Reason | Action |")
        rep.append("|---|---|--:|---|---|---|")
        for r in rows_in_bucket[:cap]:
            tech = r["fm_technical_name"] or "_(empty)_"
            slug = r["ifpa_slug"] or "—"
            reason = r["triage_reason"][:80]
            action = r["curator_action_hint"][:90]
            rep.append(f"| {r['fm_display_name']} | {tech} | {r['fm_add_count']} | `{slug}` | {reason} | {action} |")
        rep.append("")

    # Specific case elevations
    rep.append("## Specific case elevations")
    rep.append("")
    elevation_targets = ["Fury", "Blurriest", "Gauntlet", "Nemesis", "Marius", "Barfry"]
    rep.append("Cases explicitly flagged for elevation in F2c brief:")
    rep.append("")
    rep.append("| FM display | Bucket | Reason | Curator action |")
    rep.append("|---|:-:|---|---|")
    for target in elevation_targets:
        matched = [r for r in triaged if r["fm_display_name"].lower().startswith(target.lower())]
        if not matched:
            rep.append(f"| {target} | — | _(no row in triage cohort; either cleanly resolved or absent from inventory)_ | — |")
            continue
        for r in matched[:2]:
            rep.append(f"| {r['fm_display_name']} | **{r['bucket']}** | {r['triage_reason']} | {r['curator_action_hint']} |")
    rep.append("")

    # Same-side cohort summary
    ss_triaged = [r for r in triaged if r["fm_same_side_variant"] == "1"]
    ss_buckets = Counter(r["bucket"] for r in ss_triaged)
    rep.append("### Same-side cohort triage")
    rep.append("")
    rep.append(f"Total same-side rows in triage: **{len(ss_triaged)}** (of 54-row same-side cohort).")
    rep.append("")
    rep.append("| Bucket | Same-side rows |")
    rep.append("|:-:|--:|")
    for code in ["A", "B", "C", "D", "E"]:
        rep.append(f"| {code} | {ss_buckets.get(code, 0)} |")
    rep.append("")
    rep.append("Pattern: same-side variants where IFPA has the base-side equivalent surface as Bucket B (likely_new_alias); same-side variants without IFPA base equivalent surface as Bucket A (likely_new_canonical); same-side variants with FM-dialect tokens surface as Bucket D.")
    rep.append("")

    # Top recommendations
    rep.append("## Recommended first reviews")
    rep.append("")
    rep.append("### Best first canonical candidates (Bucket A; top 8)")
    rep.append("")
    rep.append("Rows with clean structural decomposition into IFPA modifier vocabulary AND a meaningful technical_name AND no IFPA equivalent yet. Curator chooses: add as new canonical row, OR add as alias on an existing IFPA row, OR reject if not stable enough.")
    rep.append("")
    rep.append("| FM display | FM tech | Adds | Suggested IFPA base | Suggested IFPA modifiers |")
    rep.append("|---|---|--:|---|---|")
    a_rows = bucket_groups.get("A", [])
    # Sort by: has technical_name, then add_count ascending (simpler tricks first)
    a_rows_sorted = sorted(a_rows, key=lambda r: (not r["fm_technical_name"], int(r["fm_add_count"])))
    for r in a_rows_sorted[:8]:
        parse_n = r.get("structural_subtype_normalized", "")
        # Extract base + modifiers from structural_parse (via match_preview's columns? not in triage CSV)
        # Instead use candidates from L6/L6b — but unresolved rows have no candidate
        # Best we can do is show fm_technical_name as the decomposition cue
        tech = r["fm_technical_name"] or "_(empty)_"
        rep.append(f"| {r['fm_display_name']} | {tech} | {r['fm_add_count']} | _(tokenize tech for base)_ | _(tokenize tech for modifiers)_ |")
    rep.append("")
    rep.append("### Best first alias candidates (Bucket B; top 8)")
    rep.append("")
    rep.append("Rows where L6/L6b structural analysis found an exact or partial match to an existing IFPA canonical, but the FM display_name isn't yet aliased on that canonical. Lowest-risk additions — IFPA row already exists, just adds a community-recognized alias.")
    rep.append("")
    rep.append("| FM display | FM tech | Adds | IFPA canonical | Subtype |")
    rep.append("|---|---|--:|---|---|")
    b_rows = bucket_groups.get("B", [])
    b_rows_sorted = sorted(b_rows, key=lambda r: (
        0 if r["structural_subtype_normalized"] == "structural_inference_exact" else 1,
        len(r["structural_candidates_normalized"]),
        r["fm_display_name"]
    ))
    for r in b_rows_sorted[:8]:
        tech = r["fm_technical_name"] or "_(empty)_"
        candidate = r["structural_candidates_normalized"].split("|")[0]
        sub_short = r["structural_subtype_normalized"].replace("structural_inference_", "")
        rep.append(f"| {r['fm_display_name']} | {tech} | {r['fm_add_count']} | `{candidate}` | {sub_short} |")
    rep.append("")
    rep.append("### Highest-risk ontology candidates (Bucket C; all)")
    rep.append("")
    rep.append("Rows where FM and IFPA agree on the conceptual identity (Layer 1-5 match exists) but DISAGREE on structural decomposition. Each surface is a federation tension requiring Red adjudication — never auto-resolve.")
    rep.append("")
    rep.append("| FM display | IFPA slug | IFPA modifier_links | FM-inferred modifiers | Reason |")
    rep.append("|---|---|---|---|---|")
    for r in bucket_groups.get("C", []):
        fm_mods = "?"
        # Re-derive FM mods from triage_reason
        if "FM={" in r["triage_reason"]:
            fm_mods = r["triage_reason"].split("FM={")[-1].split("}")[0]
        rep.append(f"| {r['fm_display_name']} | `{r['ifpa_slug']}` | `{r['ifpa_modifier_links']}` | `{fm_mods}` | {r['triage_reason'][:100]} |")
    rep.append("")
    rep.append("### Highest-value pt12 Red questions (Bucket E; consolidated)")
    rep.append("")
    rep.append("Questions to compose into the next Red expert-review packet (pt12). Each question preserves both FM and IFPA positions; Red rules on the canonical resolution.")
    rep.append("")
    rep.append("| Topic | FM evidence | IFPA position | Question for Red |")
    rep.append("|---|---|---|---|")
    rep.append("| **ADD math: Atomsmasher** | FM Atomsmasher = 3 (tech: Atomic Mirage) | IFPA atom-smasher = 4 (per pt1: X-Dex inclusion) | Confirm Atomsmasher includes X-Dex ADD? FM omits it. |")
    rep.append("| **ADD math: Sumo/Nuclear Mirage** | FM Nuclear Mirage = 4 | IFPA sumo = 5 (pt9: X-Dex on Mirage) | Same X-Dex inclusion question as Atomsmasher. |")
    rep.append("| **Fury decomp** | FM tech: Furious Mirage (modifiers={furious}) | IFPA modifier_links={furious, paradox} (pt6) | Should furious Mirage = 5 ADD include the paradox modifier explicitly? |")
    rep.append("| **Marius decomp** | FM tech: Spinning Paradox Torque (modifiers={spinning, paradox}) | IFPA spinning-torque modifier_links={spinning} | Is Marius a new canonical (Spinning Paradox Torque distinct from spinning-torque)? |")
    rep.append("| **Whirlwind decomp** | FM tech: Spinning Paradox Symposium Whirl | IFPA modifier_links={spinning, symposium} | Same pattern as Marius — Whirlwind = Spinning Paradox Symposium Whirl distinct? |")
    rep.append("| **Blurriest decomp** | FM tech: Stepping Barfly (modifiers={stepping}) | IFPA modifier_links={blurry} | FM and IFPA disagree on which modifier produces Blurriest. |")
    rep.append("| **Gauntlet decomp** | FM tech: Blurry Ducking Torque | IFPA modifier_links={ducking, paradox, stepping} | Three-way decomposition disagreement; clarify. |")
    rep.append("| **Nemesis decomp** | FM tech: Barraging Barfly (modifiers={barraging}) | IFPA modifier_links={furious} | Major decomp disagreement; FM tech doesn't match IFPA at all. |")
    rep.append("| **Barfry / Nuclear ss Butterfly** | FM ADD = 4 | Bare nuclear(+2)+butterfly(3) = 5 | What is the ADD weight of `ss` (same-side)? Resolves Barfry inclusion. |")
    rep.append("| **Spinning-torque ADD** | FM Marius = 6 | IFPA spinning-torque = 5 (pt10) but inventory still shows 6 | Confirm pt10 normalization extends to spinning-torque asserted_adds=5. |")
    rep.append("| **Frigidosis decomp** | FM uses Frigidosis as cross-trick reference | IFPA has no Frigidosis row | (pt11 deferred) — Red's preferred decomp? |")
    rep.append("")

    rep.append("## Outputs")
    rep.append("")
    rep.append(f"- `{out_dir}/{args.out_prefix}.csv` — umbrella triage ({total_triaged} rows × 20 fields)")
    for code, suffix in bucket_files.items():
        c = len(bucket_groups.get(code, []))
        rep.append(f"- `{out_dir}/{args.out_prefix}_{suffix}.csv` — bucket {code} ({c} rows)")
    rep.append(f"- `{out_dir}/{args.out_prefix}_report.md` — this report")
    rep.append("")
    rep.append("## Contract preservations")
    rep.append("")
    rep.append("- ✓ Read-only triage. No DB writes; no canonical mutation; no alias additions.")
    rep.append("- ✓ Federation-not-adoption: every bucket recommends curator review; never auto-apply.")
    rep.append("- ✓ Raw FM data preserved (display_name, technical_name, ADD values unchanged in triage CSVs).")
    rep.append("- ✓ Normalized FM analysis preserved (`structural_subtype_normalized`, `normalization_notes` carried through).")
    rep.append("- ✓ Conflict transparency: Bucket C shows both FM-inferred mods and IFPA modifier_links side-by-side.")
    rep.append("- ✓ No edits to `external_name_mappings.csv`; no promotion to `legacy_data/out/`; no workbook ingest.")
    rep.append("- ✓ Productive multiplicity rejected per pt8 (Bucket D placement); never promoted as canonical.")

    Path(out_dir / f"{args.out_prefix}_report.md").write_text("\n".join(rep) + "\n", encoding="utf-8")

    print(f"[build_footbagmoves_triage] Wrote 7 artifacts to {out_dir}/")
    print(f"  total rows in: {total_in}")
    print(f"  triage cohort: {total_triaged}")
    print(f"  already resolved: {clean_resolved}")
    for code, suffix in bucket_files.items():
        c = len(bucket_groups.get(code, []))
        print(f"  Bucket {code} ({suffix.split('_', 1)[1]}): {c}")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
