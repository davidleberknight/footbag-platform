#!/usr/bin/env python3
"""build_footbagmoves_wave1_review_packet.py - A2 first-wave curator review packet.

Assembles a 10-15 candidate review packet from A1a strong candidates. For each
candidate: parses FM technical_name structurally, computes expected ADD via
IFPA modifier weights, queries IFPA freestyle_records for community-evidence
count, and surfaces related IFPA rows sharing the same base_trick.

Output: markdown packet + CSV + supporting evidence appendix.

Staging only. NO DB writes, NO canonical mutation, NO alias additions.
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
MULTIPLICITY_TOKENS = {"double", "triple", "quadruple", "quintuple"}

FM_ABBREVIATION_MAP = {
    "pdx": ["paradox"],
    "symp": ["symposium"],
    "ps": ["paradox", "symposium"],
    "dlo": ["double", "leg", "over"],
}
DIRECTIONAL_FLAGS = {"reverse", "rev", "far", "down", "over", "back", "front", "side"}
OPERATIONAL_FILLER = {"set", "toe", "out", "in", "up"}


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.lower().strip())


def tokenize_normalized(text):
    cleaned = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    tokens = cleaned.split()
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
    for tok in tokens:
        if tok in FM_ABBREVIATION_MAP:
            expanded.extend(FM_ABBREVIATION_MAP[tok])
        else:
            expanded.append(tok)
    return [t for t in expanded if t not in DIRECTIONAL_FLAGS and t not in OPERATIONAL_FILLER]


def parse_structurally(text, ifpa_tricks, ifpa_modifiers):
    if not text:
        return None
    tokens = tokenize_normalized(text)
    same_side = "ss" in tokens
    if same_side:
        tokens = [t for t in tokens if t != "ss"]
    if not tokens:
        return None
    base_slug = None
    base_len = 0
    for n in range(min(4, len(tokens)), 0, -1):
        candidate = "-".join(tokens[-n:])
        if candidate in ifpa_tricks:
            base_slug = candidate
            base_len = n
            break
    if not base_slug:
        return None
    modifier_tokens = tokens[:-base_len]
    modifiers = []
    for tok in modifier_tokens:
        if tok in ifpa_modifiers:
            modifiers.append(tok)
        elif tok in MULTIPLICITY_TOKENS:
            return ("multiplicity_blocked", None, None, [], same_side)
        else:
            return ("unknown_token:" + tok, None, None, [], same_side)
    return ("ok", base_slug, set(modifiers), modifiers, same_side)


def compute_expected_add(base_slug, modifier_set, ifpa_base_adds, ifpa_modifiers):
    base_add = ifpa_base_adds.get(base_slug)
    if base_add is None:
        return None, "base ADD not in IFPA dictionary"
    total = base_add
    is_rotational = base_slug in ROTATIONAL_BASES
    breakdown = [f"{base_slug}({base_add})"]
    for mod in sorted(modifier_set):
        m = ifpa_modifiers.get(mod)
        if not m:
            return None, f"modifier '{mod}' not in IFPA modifier table"
        if is_rotational and m["add_bonus_rotational"] != m["add_bonus"]:
            w = m["add_bonus_rotational"]
            breakdown.append(f"{mod}(+{w}rot)")
        else:
            w = m["add_bonus"]
            breakdown.append(f"{mod}(+{w})")
        total += w
    return total, " + ".join(breakdown)


def load_ifpa_data(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    tricks = {}
    base_adds = {}
    for r in conn.execute("SELECT slug, canonical_name, adds, base_trick, trick_family, category FROM freestyle_tricks WHERE is_active=1"):
        d = dict(r)
        try:
            d["adds_int"] = int(d["adds"]) if d["adds"] not in (None, "") else None
        except (ValueError, TypeError):
            d["adds_int"] = None
        tricks[d["slug"]] = d
        if d["adds_int"] is not None:
            base_adds[d["slug"]] = d["adds_int"]
    modifiers = {}
    for r in conn.execute("SELECT slug, add_bonus, add_bonus_rotational, modifier_type FROM freestyle_trick_modifiers"):
        modifiers[r["slug"]] = dict(r)
    links_by_trick = defaultdict(set)
    for r in conn.execute("SELECT trick_slug, modifier_slug FROM freestyle_trick_modifier_links"):
        links_by_trick[r["trick_slug"]].add(r["modifier_slug"])
    tricks_by_base = defaultdict(list)
    for slug, t in tricks.items():
        b = (t.get("base_trick") or "").strip()
        if b:
            tricks_by_base[b].append(slug)
    record_counts = defaultdict(int)
    record_holders = defaultdict(set)
    for r in conn.execute("SELECT trick_name, person_id FROM freestyle_records WHERE trick_name IS NOT NULL"):
        key = normalize_name(r["trick_name"])
        record_counts[key] += 1
        if r["person_id"]:
            record_holders[key].add(r["person_id"])
    return tricks, base_adds, modifiers, dict(links_by_trick), dict(tricks_by_base), dict(record_counts), dict(record_holders)


def find_related_ifpa_rows(base_slug, modifier_set, tricks_by_base, links_by_trick, ifpa_tricks):
    related = []
    for sib in tricks_by_base.get(base_slug, []):
        sib_mods = links_by_trick.get(sib, set())
        overlap = sib_mods & modifier_set
        if sib_mods == modifier_set:
            relation = "exact-match"
        elif overlap and not (sib_mods - modifier_set):
            relation = "fm-superset"
        elif overlap and not (modifier_set - sib_mods):
            relation = "fm-subset"
        elif overlap:
            relation = "partial-overlap"
        else:
            relation = "same-base"
        sib_add = ifpa_tricks[sib].get("adds_int")
        related.append({
            "slug": sib,
            "adds": sib_add,
            "modifier_links": "|".join(sorted(sib_mods)) or "(empty)",
            "relation": relation,
        })
    return related


def assess_recommendation(parse_status, fm_add, expected_add, mod_count, has_record_match,
                          record_holder_count, has_op_notation, related, is_same_side):
    if parse_status != "ok":
        return ("DEFER", f"parse incomplete ({parse_status}); cannot recommend structurally")
    if expected_add is None:
        return ("DEFER", "expected ADD not computable (missing IFPA modifier/base data)")
    delta = fm_add - expected_add
    has_exact_relation = any(r["relation"] == "exact-match" for r in related)
    if has_exact_relation and delta == 0:
        ex = [r["slug"] for r in related if r["relation"] == "exact-match"]
        return ("ALIAS", f"structurally exact-match to IFPA `{ex[0]}`; recommend adding FM display as alias")
    if delta != 0:
        return ("DEFER", f"ADD math disagreement (FM={fm_add}, expected={expected_add}, Δ={delta:+}); pt12 packet candidate")
    if is_same_side:
        return ("ALIAS", "same-side variant; recommend alias on base-side IFPA row rather than new canonical")
    if mod_count >= 4:
        return ("DEFER", f"{mod_count}-modifier compound; high complexity; pt8 §10 caution despite record match")
    if not has_record_match:
        return ("DEFER", "no IFPA freestyle_records evidence; defer until community usage confirmed")
    return ("CANONICAL", f"clean ADD math, {mod_count}-mod compound, {record_holder_count} record holder(s); strong canonical candidate")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--priority", default="legacy_data/reports/footbagmoves_canonical_priority.csv")
    ap.add_argument("--inventory", default="legacy_data/out/footbagmoves_inventory.csv")
    ap.add_argument("--db", default="database/footbag.db")
    ap.add_argument("--out-dir", default="legacy_data/reports")
    ap.add_argument("--out-prefix", default="footbagmoves_wave1_review_packet")
    args = ap.parse_args()

    priority = list(csv.DictReader(open(args.priority, encoding="utf-8")))
    inv_by_id = {r["synthetic_external_id"]: r for r in csv.DictReader(open(args.inventory, encoding="utf-8"))}
    ifpa_tricks, ifpa_base_adds, ifpa_modifiers, links_by_trick, tricks_by_base, record_counts, record_holders = load_ifpa_data(args.db)

    must_include = ["Tap", "Paste", "Hatchet", "Pigbeater", "Genesis", "Montage", "Mullet", "Spender", "Enterrage", "Whirlygig"]
    selected_ids = set()
    selected_rows = []
    for target in must_include:
        match = next((r for r in priority if r["fm_display_name"].lower() == target.lower()), None)
        if match and match["synthetic_external_id"] not in selected_ids:
            selected_rows.append(match)
            selected_ids.add(match["synthetic_external_id"])
    for r in priority:
        if len(selected_rows) >= 15:
            break
        if r["priority_cohort"] != "A1a":
            continue
        if r["synthetic_external_id"] in selected_ids:
            continue
        selected_rows.append(r)
        selected_ids.add(r["synthetic_external_id"])

    packet = []
    for r in selected_rows:
        display = r["fm_display_name"]
        tech = r["fm_technical_name"]
        fm_add = int(r["fm_add_count"])
        is_ss = r["fm_same_side_variant"] == "1"
        display_norm = normalize_name(display)
        tech_norm = normalize_name(tech) if tech else ""

        parse = parse_structurally(tech or display, ifpa_tricks, ifpa_modifiers)
        if parse is None:
            parse_status = "no_parse"
            base_slug, mod_set, mod_list, same_side = None, set(), [], False
        else:
            parse_status, base_slug, mod_set, mod_list, same_side = parse
            mod_set = mod_set or set()
            mod_list = mod_list or []

        if parse_status == "ok" and base_slug:
            expected_add, math_breakdown = compute_expected_add(base_slug, mod_set, ifpa_base_adds, ifpa_modifiers)
            related = find_related_ifpa_rows(base_slug, mod_set, tricks_by_base, links_by_trick, ifpa_tricks)
        else:
            expected_add, math_breakdown = None, ""
            related = []

        record_count = record_counts.get(display_norm, 0)
        if record_count == 0 and tech_norm:
            record_count = record_counts.get(tech_norm, 0)
        holder_count = len(record_holders.get(display_norm, set()))
        if holder_count == 0 and tech_norm:
            holder_count = len(record_holders.get(tech_norm, set()))

        inv = inv_by_id.get(r["synthetic_external_id"], {})
        has_op_notation = bool(inv.get("operational_notation_raw"))

        recommendation, recommendation_reason = assess_recommendation(
            parse_status, fm_add, expected_add, len(mod_list),
            record_count > 0, holder_count, has_op_notation, related, is_ss or same_side,
        )

        related_summary = "; ".join(
            f"{rel['slug']}(adds={rel['adds']}, mods={rel['modifier_links']}, rel={rel['relation']})"
            for rel in related[:5]
        )

        packet.append({
            "synthetic_external_id": r["synthetic_external_id"],
            "fm_display_name": display,
            "fm_technical_name": tech,
            "fm_add_count": fm_add,
            "fm_same_side_variant": "1" if is_ss else "0",
            "priority_score": r["priority_score"],
            "priority_cohort": r["priority_cohort"],
            "parsed_base": base_slug or "",
            "parsed_modifiers": "|".join(sorted(mod_set)),
            "modifier_count": str(len(mod_list)),
            "is_rotational_base": "1" if base_slug in ROTATIONAL_BASES else "0",
            "expected_add": str(expected_add) if expected_add is not None else "",
            "add_math_breakdown": math_breakdown,
            "add_math_agrees": "1" if expected_add is not None and expected_add == fm_add else ("0" if expected_add is not None else ""),
            "ifpa_record_count": str(record_count),
            "ifpa_record_holders": str(holder_count),
            "has_operational_notation": "1" if has_op_notation else "0",
            "operational_notation_raw": inv.get("operational_notation_raw", ""),
            "related_ifpa_rows": related_summary,
            "related_count": str(len(related)),
            "multiplicity_risk": "high" if len(mod_list) >= 4 else ("moderate" if len(mod_list) == 3 else "low"),
            "recommendation": recommendation,
            "recommendation_reason": recommendation_reason,
            "source_paste_file": inv.get("source_paste_file", ""),
        })

    fields = list(packet[0].keys()) if packet else []
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / f"{args.out_prefix}.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in packet:
            w.writerow(r)

    # Markdown packet
    md = []
    md.append("# FootbagMoves Wave-1 canonical review packet (A2)")
    md.append("")
    md.append(f"**Run timestamp (UTC):** {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    md.append(f"**Source:** A1a strong candidates from `{args.priority}`")
    md.append(f"**Candidates included:** {len(packet)} (10 user-specified + {len(packet) - 10 if len(packet) > 10 else 0} additional A1a top)")
    md.append("")
    md.append("**Federation-not-adoption posture:** read-only review preparation. No DB writes, no canonical mutation, no alias additions, no workbook ingest. Every recommendation requires curator judgment; this packet aggregates evidence, not decisions.")
    md.append("")
    md.append("## Recommendation key")
    md.append("")
    md.append("- **CANONICAL** — clean ADD math, IFPA record evidence, low complexity. Add new row to `tricks.csv`.")
    md.append("- **ALIAS** — structurally maps to existing IFPA row (exact modifier-links match) OR same-side variant of existing row. Add alias rather than new canonical.")
    md.append("- **DEFER** — ADD math disagreement, high modifier count, or missing evidence. Queue for pt12 Red consultation or additional research.")
    md.append("- **REJECT** — FM-only dialect or productive-multiplicity. (No row in this packet should reach REJECT; A1c/D filter those upstream.)")
    md.append("")
    md.append("## Summary table")
    md.append("")
    md.append("| # | FM display | FM tech | Adds | Expected | Math? | Records | Recommendation |")
    md.append("|--:|---|---|--:|--:|:-:|--:|---|")
    for i, p in enumerate(packet, 1):
        agrees = "✓" if p["add_math_agrees"] == "1" else ("✗" if p["add_math_agrees"] == "0" else "—")
        tech = p["fm_technical_name"] or "_(empty)_"
        exp = p["expected_add"] or "—"
        md.append(f"| {i} | {p['fm_display_name']} | {tech} | {p['fm_add_count']} | {exp} | {agrees} | {p['ifpa_record_count']} | **{p['recommendation']}** |")
    md.append("")

    # Per-candidate detail
    md.append("## Per-candidate detail")
    md.append("")
    for i, p in enumerate(packet, 1):
        md.append(f"### {i}. {p['fm_display_name']} (FM ADD {p['fm_add_count']})")
        md.append("")
        md.append(f"**Recommendation:** **{p['recommendation']}** — {p['recommendation_reason']}")
        md.append("")
        md.append("| Attribute | Value |")
        md.append("|---|---|")
        md.append(f"| FM display name | `{p['fm_display_name']}` |")
        md.append(f"| FM technical_name | `{p['fm_technical_name']}` |" if p['fm_technical_name'] else "| FM technical_name | _(empty)_ |")
        md.append(f"| FM ADD value | {p['fm_add_count']} |")
        md.append(f"| Same-side variant | {'yes' if p['fm_same_side_variant'] == '1' else 'no'} |")
        md.append(f"| Operational notation seeded | {'yes (see appendix)' if p['has_operational_notation'] == '1' else 'no'} |")
        md.append(f"| Parsed base | `{p['parsed_base'] or '—'}` |")
        md.append(f"| Parsed modifiers | `{p['parsed_modifiers'] or '—'}` ({p['modifier_count']} modifier{'s' if p['modifier_count'] != '1' else ''}) |")
        md.append(f"| Rotational base | {'yes' if p['is_rotational_base'] == '1' else 'no'} |")
        md.append(f"| Expected ADD (IFPA weights) | {p['expected_add'] or '—'} |")
        md.append(f"| ADD math breakdown | `{p['add_math_breakdown']}` |")
        md.append(f"| FM vs expected | {'agrees' if p['add_math_agrees'] == '1' else ('DISAGREES — pt12 candidate' if p['add_math_agrees'] == '0' else 'not computable')} |")
        md.append(f"| IFPA records (community evidence) | {p['ifpa_record_count']} records, {p['ifpa_record_holders']} distinct holder(s) |")
        md.append(f"| Multiplicity risk | {p['multiplicity_risk']} |")
        md.append(f"| Priority score | {p['priority_score']} (cohort {p['priority_cohort']}) |")
        md.append(f"| FM source paste file | `{p['source_paste_file']}` |")
        md.append("")
        if p["related_ifpa_rows"]:
            md.append("**Related IFPA rows (same base_trick):**")
            md.append("")
            md.append("| Sibling slug | ADD | modifier_links | Relation to FM |")
            md.append("|---|--:|---|---|")
            for rel_part in p["related_ifpa_rows"].split("; "):
                if not rel_part:
                    continue
                # Parse the formatted string back; not pretty but functional
                m = re.match(r"(\S+)\(adds=(\S+?), mods=(.*?), rel=(.*)\)$", rel_part)
                if m:
                    sib, adds, mods, rel = m.groups()
                    md.append(f"| `{sib}` | {adds} | `{mods}` | {rel} |")
            md.append("")
        md.append("---")
        md.append("")

    # Appendix
    md.append("## Appendix — supporting evidence")
    md.append("")
    md.append("### Operational notation (FM-source paste text)")
    md.append("")
    seeded = [p for p in packet if p["has_operational_notation"] == "1"]
    if seeded:
        for p in seeded:
            md.append(f"- **{p['fm_display_name']}**: `{p['operational_notation_raw']}`")
        md.append("")
    else:
        md.append("_(no candidates with seeded operational notation; FM did not provide structural decomp text for these rows in the paste)_")
        md.append("")
    md.append("### IFPA-record evidence summary")
    md.append("")
    md.append("Row count comes from `freestyle_records.trick_name` matching FM display_name (or technical_name as fallback). Higher counts indicate the trick has been used in formal record submissions — strong community-usage signal.")
    md.append("")
    md.append("| FM display | Record count | Holder count |")
    md.append("|---|--:|--:|")
    for p in packet:
        md.append(f"| {p['fm_display_name']} | {p['ifpa_record_count']} | {p['ifpa_record_holders']} |")
    md.append("")
    md.append("### ADD math reference")
    md.append("")
    md.append("Modifier weights used in expected-ADD computation (queried from `freestyle_trick_modifiers` at run time):")
    md.append("")
    md.append("| Modifier | flat | rotational |")
    md.append("|---|--:|--:|")
    used_mods = set()
    for p in packet:
        for m in p["parsed_modifiers"].split("|"):
            if m:
                used_mods.add(m)
    for m in sorted(used_mods):
        mw = ifpa_modifiers.get(m)
        if mw:
            md.append(f"| `{m}` | +{mw['add_bonus']} | +{mw['add_bonus_rotational']} |")
    md.append("")
    md.append("Base trick ADDs used:")
    md.append("")
    md.append("| Base | ADD | Rotational? |")
    md.append("|---|--:|:-:|")
    used_bases = {p["parsed_base"] for p in packet if p["parsed_base"]}
    for b in sorted(used_bases):
        ba = ifpa_base_adds.get(b)
        rot = "yes" if b in ROTATIONAL_BASES else "no"
        md.append(f"| `{b}` | {ba} | {rot} |")
    md.append("")

    # Outputs + contract
    md.append("## Outputs")
    md.append("")
    md.append(f"- `{out_dir}/{args.out_prefix}.csv` — machine-readable packet ({len(packet)} rows × {len(fields)} fields)")
    md.append(f"- `{out_dir}/{args.out_prefix}.md` — this curator-facing review packet")
    md.append("")
    md.append("## Contract preservations")
    md.append("")
    md.append("- ✓ Read-only review preparation. No DB writes, no canonical mutation, no alias additions, no edits to `external_name_mappings.csv`.")
    md.append("- ✓ Federation-not-adoption: every recommendation requires curator decision; never auto-applied.")
    md.append("- ✓ Conflict transparency: ADD math disagreements flagged explicitly; FM and IFPA values both shown.")
    md.append("- ✓ FM provenance preserved: source_paste_file, raw display/tech values unchanged.")
    md.append("- ✓ ADD math computed against current IFPA modifier weights (post-pt10/pt11) — surfaces pt12 candidates.")
    md.append("- ✓ Same-side variants recommended as alias rather than canonical (federation-not-adoption-aware).")
    md.append("- ✓ No workbook ingest; no promotion to `legacy_data/out/`; no ontology mutation.")

    Path(out_dir / f"{args.out_prefix}.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    print(f"[build_footbagmoves_wave1_review_packet] Wrote 2 artifacts to {out_dir}/")
    print(f"  candidates in packet: {len(packet)}")
    rec_counts = defaultdict(int)
    for p in packet:
        rec_counts[p["recommendation"]] += 1
    for rec, c in sorted(rec_counts.items()):
        print(f"    {rec}: {c}")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
