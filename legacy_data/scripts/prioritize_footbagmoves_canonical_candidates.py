#!/usr/bin/env python3
"""prioritize_footbagmoves_canonical_candidates.py - A1 prioritization.

Reads Bucket A (likely_new_canonical) from F2c triage + the F1b inventory + IFPA DB.
Scores each row using multi-signal heuristic and partitions into 4 priority cohorts:

  A1a — strong canonical candidates (score >= 4 OR IFPA record match)
  A1b — probable canonical candidates (score 2-3)
  A1c — productive-multiplicity caution (3+ modifiers; pt8 risk)
  A1d — unclear semantic identity (score <= 1)

Staging only. NO DB writes, NO canonical mutation, NO alias additions.
"""

import argparse
import csv
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

MULTIPLICITY_TOKENS = {"double", "triple", "quadruple", "quintuple"}


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.lower().strip())


def count_modifiers(parse_str: str) -> int | None:
    if not parse_str or "modifiers={" not in parse_str:
        return None
    mods_str = parse_str.split("modifiers={")[-1].split("}")[0]
    if mods_str == "none" or not mods_str:
        return 0
    return len([m.strip() for m in mods_str.split(",") if m.strip()])


def load_ifpa_signals(db_path):
    conn = sqlite3.connect(db_path)
    record_names = set()
    for r in conn.execute("SELECT DISTINCT trick_name FROM freestyle_records WHERE trick_name IS NOT NULL"):
        record_names.add(normalize_name(r[0]))
    descriptions = []
    for r in conn.execute(
        "SELECT slug, canonical_name, description FROM freestyle_tricks WHERE is_active=1 AND description IS NOT NULL"
    ):
        descriptions.append((r[0], normalize_name(r[1] or ""), (r[2] or "").lower()))
    aliases = set()
    for r in conn.execute("SELECT alias_text FROM freestyle_trick_aliases"):
        aliases.add(normalize_name(r[0]))
    return record_names, descriptions, aliases


def name_mentioned_in_descriptions(name, descriptions):
    norm = normalize_name(name)
    if not norm:
        return None
    # Must be a whole-word match in description to count
    pattern = re.compile(r"\b" + re.escape(norm) + r"\b")
    for slug, canonical_norm, desc in descriptions:
        if pattern.search(desc):
            return slug
    return None


def score_row(triage_row, inventory_row, ifpa_records, ifpa_descriptions, ifpa_aliases):
    score = 0
    notes = []

    display = triage_row["fm_display_name"]
    tech = triage_row.get("fm_technical_name", "")
    display_norm = normalize_name(display)
    tech_norm = normalize_name(tech) if tech else ""

    # Signal 1: technical_name presence (structural cue)
    if tech:
        score += 1
        notes.append("+1 tech")

    # Signal 2: operational notation present (FM-curator-reviewed)
    if inventory_row and inventory_row.get("operational_notation_raw"):
        score += 2
        notes.append("+2 op-notation")

    # Signal 3: video present (community demo exists)
    if inventory_row and inventory_row.get("video_present") == "1":
        score += 1
        notes.append("+1 video")

    # Signal 4: IFPA freestyle_records contains this trick name
    if display_norm in ifpa_records:
        score += 3
        notes.append("+3 IFPA-record(display)")
    elif tech_norm and tech_norm in ifpa_records:
        score += 2
        notes.append("+2 IFPA-record(tech)")

    # Signal 5: display name mentioned in IFPA descriptions (whole-word)
    desc_slug = name_mentioned_in_descriptions(display, ifpa_descriptions)
    if desc_slug:
        score += 1
        notes.append(f"+1 desc-mention:{desc_slug}")

    # Signal 6: same-side variant penalty (more likely alias than canonical)
    if triage_row.get("fm_same_side_variant") == "1":
        score -= 1
        notes.append("-1 ss-variant")

    # Signal 7: modifier complexity
    parse_str = triage_row.get("structural_parse_normalized") or triage_row.get("structural_parse", "")
    mod_count = count_modifiers(parse_str)
    if mod_count is not None:
        if mod_count == 1:
            score += 1
            notes.append("+1 1-mod")
        elif mod_count == 2:
            notes.append("+0 2-mod")
        elif mod_count >= 3:
            score -= 1
            notes.append(f"-1 {mod_count}-mod-risk")

    # Signal 8: short single-word display (cultural primacy signal)
    if " " not in display and len(display) <= 14 and not any(c in display for c in "()/&"):
        score += 1
        notes.append("+1 short-name")

    # Signal 9: low ADD band (more central trick)
    try:
        adds = int(triage_row["fm_add_count"])
        if adds <= 4:
            score += 1
            notes.append("+1 low-ADD")
    except (ValueError, KeyError):
        pass

    # Signal 10: productive-multiplicity penalty (defensive; D bucket should have caught these)
    if any(t in display.lower().split() for t in MULTIPLICITY_TOKENS):
        score -= 2
        notes.append("-2 multiplicity-in-name")

    return score, "; ".join(notes), mod_count


def assign_cohort(score, mod_count, has_record_match, has_multiplicity):
    if has_multiplicity:
        return "A1c"  # caution overrides
    if has_record_match:
        return "A1a"  # strong by record-match alone
    if mod_count is not None and mod_count >= 3:
        return "A1c"
    if score >= 4:
        return "A1a"
    if score >= 2:
        return "A1b"
    return "A1d"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bucket-a", default="legacy_data/reports/footbagmoves_triage_A_likely_new_canonical.csv")
    ap.add_argument("--inventory", default="legacy_data/out/footbagmoves_inventory.csv")
    ap.add_argument("--db", default="database/footbag.db")
    ap.add_argument("--out-dir", default="legacy_data/reports")
    ap.add_argument("--out-prefix", default="footbagmoves_canonical_priority")
    args = ap.parse_args()

    bucket_a = list(csv.DictReader(open(args.bucket_a, encoding="utf-8")))
    inv_by_id = {r["synthetic_external_id"]: r for r in csv.DictReader(open(args.inventory, encoding="utf-8"))}
    ifpa_records, ifpa_descriptions, ifpa_aliases = load_ifpa_signals(args.db)

    scored = []
    for r in bucket_a:
        inv = inv_by_id.get(r["synthetic_external_id"], {})
        score, score_notes, mod_count = score_row(r, inv, ifpa_records, ifpa_descriptions, ifpa_aliases)
        display_norm = normalize_name(r["fm_display_name"])
        tech_norm = normalize_name(r.get("fm_technical_name") or "")
        has_record_match = display_norm in ifpa_records or (tech_norm and tech_norm in ifpa_records)
        has_multiplicity = any(t in r["fm_display_name"].lower().split() for t in MULTIPLICITY_TOKENS)
        cohort = assign_cohort(score, mod_count, has_record_match, has_multiplicity)
        scored.append({
            "synthetic_external_id": r["synthetic_external_id"],
            "fm_display_name": r["fm_display_name"],
            "fm_technical_name": r["fm_technical_name"],
            "fm_add_count": r["fm_add_count"],
            "fm_same_side_variant": r["fm_same_side_variant"],
            "priority_score": score,
            "priority_cohort": cohort,
            "score_breakdown": score_notes,
            "modifier_count": "" if mod_count is None else str(mod_count),
            "has_ifpa_record_match": "1" if has_record_match else "0",
            "operational_notation_present": "1" if inv.get("operational_notation_raw") else "0",
            "video_present": inv.get("video_present", ""),
            "structural_parse_normalized": r.get("structural_parse_normalized", ""),
            "normalization_notes": r.get("normalization_notes", ""),
            "source_paste_file": inv.get("source_paste_file", ""),
            "curator_action_hint": r.get("curator_action_hint", ""),
        })

    scored.sort(key=lambda x: (-x["priority_score"], x["fm_display_name"]))

    fields = ["synthetic_external_id", "fm_display_name", "fm_technical_name", "fm_add_count",
              "fm_same_side_variant", "priority_score", "priority_cohort", "score_breakdown",
              "modifier_count", "has_ifpa_record_match", "operational_notation_present",
              "video_present", "structural_parse_normalized", "normalization_notes",
              "source_paste_file", "curator_action_hint"]

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    def emit(path, rows_):
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            for r in rows_:
                w.writerow(r)

    emit(out_dir / f"{args.out_prefix}.csv", scored)

    cohort_rows = defaultdict(list)
    for r in scored:
        cohort_rows[r["priority_cohort"]].append(r)

    cohort_files = {
        "A1a": "A1a_strong",
        "A1b": "A1b_probable",
        "A1c": "A1c_multiplicity_caution",
        "A1d": "A1d_unclear",
    }
    for code, suffix in cohort_files.items():
        emit(out_dir / f"{args.out_prefix}_{suffix}.csv", cohort_rows.get(code, []))

    top50 = scored[:50]
    emit(out_dir / f"{args.out_prefix}_top50.csv", top50)

    # Report
    rep = []
    rep.append("# FootbagMoves canonical-candidate prioritization (A1)")
    rep.append("")
    rep.append(f"**Run timestamp (UTC):** {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    rep.append(f"**Source:** `{args.bucket_a}` ({len(bucket_a)} rows from F2c Bucket A)")
    rep.append("")
    rep.append("**Federation-not-adoption posture:** read-only prioritization. No DB writes, no canonical mutation, no alias additions. Scoring is curator-decision aid; never an auto-promotion threshold. FM provenance preserved per row.")
    rep.append("")
    rep.append("## Scoring signals")
    rep.append("")
    rep.append("| Signal | Weight | Rationale |")
    rep.append("|---|--:|---|")
    rep.append("| Technical_name present | +1 | Structural cue exists |")
    rep.append("| Operational notation seeded | +2 | FM-curator-reviewed structural decomp |")
    rep.append("| Video present | +1 | Community demonstration exists |")
    rep.append("| Display name matches IFPA freestyle_records.trick_name | +3 | Strong community-usage signal — someone holds a record |")
    rep.append("| Technical_name matches IFPA record | +2 | Same signal via tech path |")
    rep.append("| Display name mentioned in IFPA description | +1 | Cross-reference signal |")
    rep.append("| Same-side variant | -1 | More likely alias than canonical |")
    rep.append("| 1 modifier | +1 | Stable decomposition |")
    rep.append("| 2 modifiers | 0 | Moderate complexity |")
    rep.append("| 3+ modifiers | -1 | Productive-multiplicity risk |")
    rep.append("| Short single-word display | +1 | Cultural-primacy signal |")
    rep.append("| ADD ≤ 4 | +1 | More central trick |")
    rep.append("| Multiplicity prefix in name | -2 | Rejected per pt8 §10 |")
    rep.append("")
    rep.append("## Cohort partitioning rules")
    rep.append("")
    rep.append("- **A1a (strong):** IFPA record match OR score ≥ 4. Has historical / record-tracked usage. Highest confidence for canonical or alias adoption.")
    rep.append("- **A1b (probable):** score 2-3, no multiplicity. Stable-looking compounds with moderate evidence.")
    rep.append("- **A1c (multiplicity caution):** ≥ 3 modifiers OR multiplicity prefix in display. Per pt8 §10: productive multiplicity rejected as canonical unless community-stabilized.")
    rep.append("- **A1d (unclear):** score ≤ 1. Ambiguous decomposition, weak evidence, low-priority for curator review.")
    rep.append("")
    rep.append("## Cohort distribution")
    rep.append("")
    rep.append("| Cohort | Count | Pct of A | Highest score |")
    rep.append("|---|--:|--:|--:|")
    for code, suffix in cohort_files.items():
        c = len(cohort_rows.get(code, []))
        pct = c / len(scored) * 100 if scored else 0
        top_score = max((r["priority_score"] for r in cohort_rows.get(code, [])), default=0)
        rep.append(f"| {code} ({suffix.split('_', 1)[1].replace('_', ' ')}) | {c} | {pct:.1f}% | {top_score} |")
    rep.append("")
    rep.append(f"Total Bucket A rows scored: **{len(scored)}**.")
    rep.append("")

    # Top 50 shortlist
    rep.append("## Top-50 shortlist (sorted by priority_score descending)")
    rep.append("")
    rep.append("Curator-facing first-review list. Each row is a Bucket A entry that scored highest by the F2c+A1 signals.")
    rep.append("")
    rep.append("| Rank | FM display | FM tech | Adds | Score | Cohort | Breakdown |")
    rep.append("|--:|---|---|--:|--:|:-:|---|")
    for i, r in enumerate(top50, start=1):
        tech = r["fm_technical_name"] or "_(empty)_"
        cohort_short = r["priority_cohort"]
        breakdown = r["score_breakdown"][:80]
        rep.append(f"| {i} | {r['fm_display_name']} | {tech} | {r['fm_add_count']} | {r['priority_score']} | {cohort_short} | {breakdown} |")
    rep.append("")

    # Strong-cohort first-wave recommendation
    rep.append("## Recommended first-wave canonical-review candidates (A1a top 12)")
    rep.append("")
    rep.append("Strongest signal cohort. For each, curator considers: (a) add as new canonical row in `tricks.csv`, (b) add as new alias on an existing IFPA canonical, or (c) defer/reject.")
    rep.append("")
    rep.append("| FM display | FM tech | Adds | Score | IFPA record match? | Structural decomp |")
    rep.append("|---|---|--:|--:|:-:|---|")
    a1a_rows = cohort_rows.get("A1a", [])
    for r in a1a_rows[:12]:
        tech = r["fm_technical_name"] or "_(empty)_"
        record_match = "✓" if r["has_ifpa_record_match"] == "1" else ""
        parse = r["structural_parse_normalized"].split(" (source:")[0] if r["structural_parse_normalized"] else ""
        rep.append(f"| {r['fm_display_name']} | {tech} | {r['fm_add_count']} | {r['priority_score']} | {record_match} | {parse} |")
    rep.append("")

    # Multiplicity caution list
    rep.append("## Multiplicity caution list (A1c sample)")
    rep.append("")
    rep.append("Rows with 3+ modifiers OR multiplicity prefix. Per pt8 §10, these are presumptively rejected as canonical unless community-stabilized. Curator should be especially conservative here.")
    rep.append("")
    rep.append("| FM display | FM tech | Adds | Mod count | Notes |")
    rep.append("|---|---|--:|--:|---|")
    a1c_rows = cohort_rows.get("A1c", [])
    a1c_sample = sorted(a1c_rows, key=lambda r: (int(r["modifier_count"]) if r["modifier_count"] else 0, -int(r["priority_score"])), reverse=True)
    for r in a1c_sample[:15]:
        tech = r["fm_technical_name"] or "_(empty)_"
        rep.append(f"| {r['fm_display_name']} | {tech} | {r['fm_add_count']} | {r['modifier_count']} | {r['score_breakdown'][:60]} |")
    rep.append("")

    # Historically-important specific elevations
    rep.append("## Specific historically-important elevations")
    rep.append("")
    rep.append("Cases worth highlighting independent of pure score — culturally entrenched named compounds that the curator may already recognize:")
    rep.append("")
    rep.append("| FM display | FM tech | Cohort | Score | Why noteworthy |")
    rep.append("|---|---|:-:|--:|---|")
    historic_cues = ["Apocalypse", "Atomic Drifter", "Atomic Motion", "Atomotion", "Avalanche", "Big Apple",
                     "Blender", "Blurry", "Barfry", "Carousel", "Catacomb", "Colossus", "Cristal",
                     "Genesis", "Gauntlet", "Icarus", "Margaritaville", "Montage", "Nemesis", "Spyro",
                     "Sumo", "Superdeeduperfly", "Warp", "Whirlwind"]
    seen = set()
    for cue in historic_cues:
        matched = [r for r in scored if r["fm_display_name"].lower().startswith(cue.lower())]
        for r in matched[:1]:
            if r["synthetic_external_id"] in seen:
                continue
            seen.add(r["synthetic_external_id"])
            tech = r["fm_technical_name"] or "_(empty)_"
            why = "single-word named compound" if " " not in r["fm_display_name"] else "named compound across FM sample"
            rep.append(f"| {r['fm_display_name']} | {tech} | {r['priority_cohort']} | {r['priority_score']} | {why} |")
    rep.append("")

    # Score distribution
    score_dist = Counter(r["priority_score"] for r in scored)
    rep.append("## Score distribution")
    rep.append("")
    rep.append("| Score | Count |")
    rep.append("|--:|--:|")
    for s in sorted(score_dist.keys(), reverse=True):
        rep.append(f"| {s} | {score_dist[s]} |")
    rep.append("")

    rep.append("## Outputs")
    rep.append("")
    rep.append(f"- `{out_dir}/{args.out_prefix}.csv` — all {len(scored)} scored rows × 16 fields")
    for code, suffix in cohort_files.items():
        c = len(cohort_rows.get(code, []))
        rep.append(f"- `{out_dir}/{args.out_prefix}_{suffix}.csv` — cohort {code} ({c} rows)")
    rep.append(f"- `{out_dir}/{args.out_prefix}_top50.csv` — top-50 shortlist")
    rep.append(f"- `{out_dir}/{args.out_prefix}_report.md` — this report")
    rep.append("")

    rep.append("## Contract preservations")
    rep.append("")
    rep.append("- ✓ Read-only prioritization. No DB writes, no canonical mutation, no alias additions.")
    rep.append("- ✓ Federation-not-adoption: scoring is a curator-decision aid; never auto-canonicalizes.")
    rep.append("- ✓ Conflict transparency: structural parse and normalization notes preserved per row.")
    rep.append("- ✓ FM provenance preserved (source_paste_file, raw display/tech values unchanged).")
    rep.append("- ✓ pt8 §10 multiplicity rule enforced: A1c cohort flags 3+ modifier or multiplicity-named rows.")
    rep.append("- ✓ No edits to `external_name_mappings.csv`, no workbook ingest, no promotion to `legacy_data/out/`.")

    Path(out_dir / f"{args.out_prefix}_report.md").write_text("\n".join(rep) + "\n", encoding="utf-8")

    print(f"[prioritize_footbagmoves_canonical_candidates] Wrote 7 artifacts to {out_dir}/")
    print(f"  total Bucket A: {len(bucket_a)}")
    for code, suffix in cohort_files.items():
        c = len(cohort_rows.get(code, []))
        print(f"  Cohort {code} ({suffix.split('_', 1)[1].replace('_', ' ')}): {c}")
    print(f"  Top score in A1a: {max((r['priority_score'] for r in cohort_rows.get('A1a', [])), default=0)}")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
