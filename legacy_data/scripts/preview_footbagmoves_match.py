#!/usr/bin/env python3
"""preview_footbagmoves_match.py - F2 matching preview.

Layered IFPA ↔ FootbagMoves name match on the F1b promoted inventory.
Read-only. NO DB writes, NO canonical mutation, NO alias auto-import.
Outputs preview CSV + audit reports to legacy_data/reports/ (staging).

Match layers (priority order; first match wins):
  Layer 1: exact slug match on display_name (slugify(fm.display_name) == ifpa.slug)
  Layer 2: alias match — fm.display_name (normalized) ∈ IFPA aliases
  Layer 3: technical_name slug/alias match
  Layer 4: same-side variant base match (strip (same-side), retry Layers 1-2)
  Layer 5: external_name_mappings.csv (FM-keyed entries)
  Layer 6: structural-alias inference — tokenize FM technical_name into IFPA
          modifier vocabulary + base, set-equality match against IFPA
          freestyle_trick_modifier_links. Productive multiplicity prefixes
          (double/triple) rejected per pt8. Inline `ss` token recognized as
          same-side flag (does not count toward modifier set).
"""

import argparse
import csv
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

SAME_SIDE_RE = re.compile(r"\(same[ -]?side\)", re.IGNORECASE)


def slugify(name: str) -> str:
    s = name.lower()
    s = SAME_SIDE_RE.sub("-same-side", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def normalize_text(name: str) -> str:
    return re.sub(r"\s+", " ", name.lower().strip())


def load_ifpa(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    tricks = {}
    for r in conn.execute(
        "SELECT slug, canonical_name, adds, base_trick, trick_family, category FROM freestyle_tricks WHERE is_active=1"
    ):
        d = dict(r)
        try:
            d["adds_int"] = int(d["adds"]) if d["adds"] not in (None, "") else None
        except (ValueError, TypeError):
            d["adds_int"] = None
        tricks[d["slug"]] = d
    aliases = {}
    for r in conn.execute(
        "SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases"
    ):
        aliases[r["alias_slug"]] = r["trick_slug"]
        aliases[normalize_text(r["alias_text"])] = r["trick_slug"]
    modifiers = {r["slug"] for r in conn.execute("SELECT slug FROM freestyle_trick_modifiers")}
    links_by_trick = defaultdict(set)
    for r in conn.execute("SELECT trick_slug, modifier_slug FROM freestyle_trick_modifier_links"):
        links_by_trick[r["trick_slug"]].add(r["modifier_slug"])
    tricks_by_base = defaultdict(list)
    for slug, t in tricks.items():
        base = (t.get("base_trick") or "").strip()
        if base:
            tricks_by_base[base].append(slug)
    return tricks, aliases, modifiers, dict(links_by_trick), dict(tricks_by_base)


MULTIPLICITY_TOKENS = {"double", "triple", "quadruple", "quintuple"}

# L6b FM-vocabulary normalization (matching-side only; never mutates IFPA ontology).
# Each entry maps an FM token to a list of IFPA-equivalent tokens; multi-token
# expansion preserves the structural decomposition the FM tech is asserting.
FM_ABBREVIATION_MAP = {
    "pdx": ["paradox"],
    "symp": ["symposium"],
    "ps": ["paradox", "symposium"],
    "dlo": ["double", "leg", "over"],
}
# Directional tokens that carry no ADD weight and are not IFPA modifiers.
DIRECTIONAL_FLAGS = {"reverse", "rev", "far", "down", "over", "back", "front", "side"}
# Operational filler tokens (set / surface markers) that aren't IFPA modifiers.
OPERATIONAL_FILLER = {"set", "toe", "out", "in", "up"}


def normalize_fm_tokens(tokens):
    """L6b normalization. Returns (normalized_tokens, notes_list).

    Order: (1) merge `same side` two-token sequences -> `ss`; (2) expand
    FM abbreviations to IFPA-equivalent tokens; (3) strip directional flags
    and operational filler.
    """
    notes = []
    # Step 1: 'same side' -> 'ss'
    out = []
    i = 0
    while i < len(tokens):
        if i + 1 < len(tokens) and tokens[i] == "same" and tokens[i + 1] == "side":
            out.append("ss")
            notes.append("'same side'->ss")
            i += 2
        else:
            out.append(tokens[i])
            i += 1
    tokens = out

    # Step 2: abbreviation expansion
    expanded = []
    for tok in tokens:
        if tok in FM_ABBREVIATION_MAP:
            expanded.extend(FM_ABBREVIATION_MAP[tok])
            notes.append(f"'{tok}'->'{' '.join(FM_ABBREVIATION_MAP[tok])}'")
        else:
            expanded.append(tok)

    # Step 3: strip directional + filler
    final = []
    for tok in expanded:
        if tok in DIRECTIONAL_FLAGS:
            notes.append(f"strip-direction:'{tok}'")
        elif tok in OPERATIONAL_FILLER:
            notes.append(f"strip-filler:'{tok}'")
        else:
            final.append(tok)
    return final, notes


def parse_technical_for_layer6(text, ifpa_tricks, ifpa_modifiers, apply_normalization=False):
    """Tokenize `text` and return (base_slug, modifier_set, same_side_flag) or None.

    Accepts inline `ss` as same-side flag (does not count toward modifier set).
    Rejects multiplicity prefixes (per pt8). Rejects any unknown token.
    Tries multi-token bases from the right (4 → 3 → 2 → 1).
    """
    if not text:
        return None, []
    cleaned = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    tokens = cleaned.split()
    if not tokens:
        return None, []

    norm_notes = []
    if apply_normalization:
        tokens, norm_notes = normalize_fm_tokens(tokens)
        if not tokens:
            return None, norm_notes

    same_side = "ss" in tokens
    if same_side:
        tokens = [t for t in tokens if t != "ss"]
    if not tokens:
        return None, norm_notes

    base_slug = None
    base_len = 0
    for n in range(min(4, len(tokens)), 0, -1):
        candidate = "-".join(tokens[-n:])
        if candidate in ifpa_tricks:
            base_slug = candidate
            base_len = n
            break
    if not base_slug:
        return None, norm_notes

    modifier_tokens = tokens[:-base_len]
    if not modifier_tokens:
        return None, norm_notes

    modifiers = set()
    for tok in modifier_tokens:
        if tok in ifpa_modifiers:
            modifiers.add(tok)
        elif tok in MULTIPLICITY_TOKENS:
            return None, norm_notes
        else:
            return None, norm_notes
    return (base_slug, modifiers, same_side), norm_notes


def layer6_match(fm_row, ifpa_tricks, ifpa_modifiers, ifpa_links_by_trick, ifpa_tricks_by_base):
    tech = (fm_row.get("technical_name") or "").strip()
    source_field = "technical_name"
    if not tech:
        tech = (fm_row.get("display_name") or "").strip()
        source_field = "display_name"
    parse, _ = parse_technical_for_layer6(tech, ifpa_tricks, ifpa_modifiers)
    if not parse:
        return None
    base_slug, modifier_set, same_side = parse

    candidates = ifpa_tricks_by_base.get(base_slug, [])
    matches = []
    for ifpa_slug in candidates:
        if ifpa_links_by_trick.get(ifpa_slug, set()) == modifier_set:
            matches.append(ifpa_slug)

    mods_str = "{" + ", ".join(sorted(modifier_set)) + "}"
    ss_str = " [same-side]" if same_side else ""
    if len(matches) == 1:
        return {"ifpa_slug": matches[0], "layer": 6, "confidence": "MEDIUM",
                "notes": f"structural inference via {source_field}: base={base_slug} + modifiers={mods_str}{ss_str}"}
    if len(matches) > 1:
        return {"ifpa_slug": sorted(matches)[0], "layer": 6, "confidence": "LOW",
                "notes": f"structural inference (AMBIGUOUS: {len(matches)} candidates={sorted(matches)}): base={base_slug} + modifiers={mods_str}{ss_str}"}
    return None


def analyze_structurally(fm_row, ifpa_tricks, ifpa_modifiers, ifpa_links_by_trick,
                        ifpa_tricks_by_base, existing_match_slug, apply_normalization=False):
    """Full structural analysis.

    apply_normalization=True activates the L6b FM-vocabulary normalization layer
    before structural comparison. Returns dict with structural_parse, subtype,
    candidates, conflict_flag, unresolved_tokens, normalization_notes.
    """
    tech = (fm_row.get("technical_name") or "").strip()
    source_field = "technical_name"
    if not tech:
        tech = (fm_row.get("display_name") or "").strip()
        source_field = "display_name"

    cleaned = re.sub(r"[^a-z0-9\s]", " ", tech.lower())
    raw_tokens = cleaned.split()
    parse, norm_notes = parse_technical_for_layer6(tech, ifpa_tricks, ifpa_modifiers, apply_normalization)

    # Always compute structural_conflict signal vs existing match
    structural_conflict = False
    if existing_match_slug and existing_match_slug in ifpa_tricks and parse:
        existing_mods = ifpa_links_by_trick.get(existing_match_slug, set())
        existing_base = (ifpa_tricks[existing_match_slug].get("base_trick") or "").strip()
        fm_base, fm_mods, _ = parse
        if existing_mods and existing_base == fm_base and existing_mods != fm_mods:
            structural_conflict = True

    norm_notes_str = "|".join(norm_notes)

    if not parse:
        tokens_no_ss = [t for t in raw_tokens if t != "ss"]
        unresolved = []
        for tok in tokens_no_ss:
            if (tok not in ifpa_modifiers
                and tok not in ifpa_tricks
                and tok not in MULTIPLICITY_TOKENS
                and (not apply_normalization or tok not in FM_ABBREVIATION_MAP)
                and (not apply_normalization or tok not in DIRECTIONAL_FLAGS)
                and (not apply_normalization or tok not in OPERATIONAL_FILLER)):
                unresolved.append(tok)
        return {
            "structural_parse": f"unanalyzable (raw: '{tech}'; source: {source_field})",
            "structural_subtype": "structural_inference_unanalyzable",
            "structural_candidates": "",
            "structural_conflict_flag": "1" if structural_conflict else "0",
            "unresolved_tokens": "|".join(unresolved),
            "normalization_notes": norm_notes_str,
        }

    base_slug, modifier_set, same_side = parse
    parse_str = (f"base={base_slug}; modifiers={{{','.join(sorted(modifier_set)) if modifier_set else 'none'}}}"
                 f"{' [ss]' if same_side else ''} (source: {source_field})")

    candidates = ifpa_tricks_by_base.get(base_slug, [])
    exact = []
    partial = []
    for c in candidates:
        c_mods = ifpa_links_by_trick.get(c, set())
        if c_mods == modifier_set:
            exact.append(c)
        elif c_mods and modifier_set and (c_mods & modifier_set):
            partial.append(c)

    if exact:
        return {
            "structural_parse": parse_str,
            "structural_subtype": "structural_inference_exact",
            "structural_candidates": "|".join(sorted(exact)),
            "structural_conflict_flag": "1" if structural_conflict else "0",
            "unresolved_tokens": "",
            "normalization_notes": norm_notes_str,
        }
    if structural_conflict:
        return {
            "structural_parse": parse_str,
            "structural_subtype": "structural_inference_conflict",
            "structural_candidates": "|".join(sorted(partial)) if partial else "",
            "structural_conflict_flag": "1",
            "unresolved_tokens": "",
            "normalization_notes": norm_notes_str,
        }
    if partial:
        return {
            "structural_parse": parse_str,
            "structural_subtype": "structural_inference_partial",
            "structural_candidates": "|".join(sorted(partial)),
            "structural_conflict_flag": "0",
            "unresolved_tokens": "",
            "normalization_notes": norm_notes_str,
        }
    return {
        "structural_parse": parse_str,
        "structural_subtype": "structural_inference_unresolved",
        "structural_candidates": "",
        "structural_conflict_flag": "0",
        "unresolved_tokens": "",
        "normalization_notes": norm_notes_str,
    }


def load_external_mappings(path):
    if not Path(path).is_file():
        return {}
    mappings = {}
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            src = row.get("source", "").strip().lower()
            if src in ("footbagmoves.com", "footbagmoves", "footbag-moves"):
                key = row.get("normalized_external_name", "").strip().lower()
                if key:
                    mappings[key] = {
                        "canonical_slug": row["canonical_slug"],
                        "match_type": row.get("match_type", ""),
                        "confidence": row.get("confidence", ""),
                        "notes": row.get("notes", ""),
                    }
    return mappings


def try_match(fm_row, ifpa_tricks, aliases, ext_mappings, ifpa_modifiers, ifpa_links_by_trick, ifpa_tricks_by_base):
    display = fm_row["display_name"]
    tech = fm_row.get("technical_name", "")
    is_ss = fm_row.get("same_side_variant") == "1"

    slug = slugify(display)
    if slug in ifpa_tricks:
        return {"ifpa_slug": slug, "layer": 1, "confidence": "HIGH",
                "notes": "exact slug match on display_name"}

    norm = normalize_text(display)
    if norm in aliases:
        return {"ifpa_slug": aliases[norm], "layer": 2, "confidence": "HIGH",
                "notes": f"display_name matches IFPA alias text"}
    if slug in aliases:
        return {"ifpa_slug": aliases[slug], "layer": 2, "confidence": "HIGH",
                "notes": f"display_name slug matches IFPA alias slug"}

    if tech:
        tech_slug = slugify(tech)
        if tech_slug in ifpa_tricks:
            return {"ifpa_slug": tech_slug, "layer": 3, "confidence": "MEDIUM",
                    "notes": f"technical_name slug '{tech_slug}' matches IFPA slug"}
        tech_norm = normalize_text(tech)
        if tech_norm in aliases:
            return {"ifpa_slug": aliases[tech_norm], "layer": 3, "confidence": "MEDIUM",
                    "notes": f"technical_name '{tech}' matches IFPA alias text"}
        if tech_slug in aliases:
            return {"ifpa_slug": aliases[tech_slug], "layer": 3, "confidence": "MEDIUM",
                    "notes": f"technical_name slug matches IFPA alias slug"}

    if is_ss:
        base_name = SAME_SIDE_RE.sub("", display).strip()
        base_slug = slugify(base_name)
        if base_slug in ifpa_tricks:
            return {"ifpa_slug": base_slug, "layer": 4, "confidence": "MEDIUM",
                    "notes": f"same-side variant; base '{base_name}' matches IFPA slug (IFPA has no same-side row)"}
        base_norm = normalize_text(base_name)
        if base_norm in aliases:
            return {"ifpa_slug": aliases[base_norm], "layer": 4, "confidence": "MEDIUM",
                    "notes": f"same-side variant; base '{base_name}' matches IFPA alias"}

    if norm in ext_mappings:
        m = ext_mappings[norm]
        return {"ifpa_slug": m["canonical_slug"], "layer": 5,
                "confidence": m["confidence"] or "MEDIUM",
                "notes": f"external mapping: {m['notes']}"}

    l6 = layer6_match(fm_row, ifpa_tricks, ifpa_modifiers, ifpa_links_by_trick, ifpa_tricks_by_base)
    if l6:
        return l6

    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="database/footbag.db")
    ap.add_argument("--inventory", default="legacy_data/out/footbagmoves_inventory.csv")
    ap.add_argument("--ext-mappings", default="legacy_data/inputs/curated/tricks/external_name_mappings.csv")
    ap.add_argument("--out-dir", default="legacy_data/reports")
    ap.add_argument("--out-prefix", default="footbagmoves_match_preview")
    args = ap.parse_args()

    inventory = list(csv.DictReader(open(args.inventory, encoding="utf-8")))
    ifpa_tricks, aliases, ifpa_modifiers, ifpa_links_by_trick, ifpa_tricks_by_base = load_ifpa(args.db)
    ext_mappings = load_external_mappings(args.ext_mappings)

    rows = []
    for fm in inventory:
        match = try_match(fm, ifpa_tricks, aliases, ext_mappings, ifpa_modifiers, ifpa_links_by_trick, ifpa_tricks_by_base)
        ifpa_slug = match["ifpa_slug"] if match else ""
        ifpa_row = ifpa_tricks.get(ifpa_slug) if ifpa_slug else None
        ifpa_adds = ifpa_row["adds_int"] if ifpa_row else None
        fm_adds = int(fm["add_count"])
        add_agree = ""
        if ifpa_adds is not None:
            add_agree = "1" if ifpa_adds == fm_adds else "0"
        ifpa_modifier_links_str = ""
        if ifpa_slug:
            ifpa_modifier_links_str = "|".join(sorted(ifpa_links_by_trick.get(ifpa_slug, set())))
        struct_raw = analyze_structurally(fm, ifpa_tricks, ifpa_modifiers, ifpa_links_by_trick,
                                          ifpa_tricks_by_base, ifpa_slug, apply_normalization=False)
        struct_norm = analyze_structurally(fm, ifpa_tricks, ifpa_modifiers, ifpa_links_by_trick,
                                           ifpa_tricks_by_base, ifpa_slug, apply_normalization=True)
        rows.append({
            "synthetic_external_id": fm["synthetic_external_id"],
            "fm_display_name": fm["display_name"],
            "fm_technical_name": fm["technical_name"],
            "fm_add_count": fm["add_count"],
            "fm_same_side_variant": fm["same_side_variant"],
            "ifpa_slug": ifpa_slug,
            "ifpa_canonical_name": ifpa_row["canonical_name"] if ifpa_row else "",
            "ifpa_adds": str(ifpa_adds) if ifpa_adds is not None else "",
            "ifpa_modifier_links": ifpa_modifier_links_str,
            "match_layer": str(match["layer"]) if match else "",
            "match_confidence": match["confidence"] if match else "",
            "add_agreement": add_agree,
            "structural_parse": struct_raw["structural_parse"],
            "structural_subtype": struct_raw["structural_subtype"],
            "structural_candidates": struct_raw["structural_candidates"],
            "structural_conflict_flag": struct_raw["structural_conflict_flag"],
            "unresolved_tokens": struct_raw["unresolved_tokens"],
            "normalization_notes": struct_norm["normalization_notes"],
            "structural_parse_normalized": struct_norm["structural_parse"],
            "structural_subtype_normalized": struct_norm["structural_subtype"],
            "structural_candidates_normalized": struct_norm["structural_candidates"],
            "structural_conflict_flag_normalized": struct_norm["structural_conflict_flag"],
            "match_notes": match["notes"] if match else "",
        })

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    fields = ["synthetic_external_id", "fm_display_name", "fm_technical_name", "fm_add_count",
              "fm_same_side_variant", "ifpa_slug", "ifpa_canonical_name", "ifpa_adds",
              "ifpa_modifier_links", "match_layer", "match_confidence", "add_agreement",
              "structural_parse", "structural_subtype", "structural_candidates",
              "structural_conflict_flag", "unresolved_tokens",
              "normalization_notes", "structural_parse_normalized",
              "structural_subtype_normalized", "structural_candidates_normalized",
              "structural_conflict_flag_normalized",
              "match_notes"]

    def emit(path, rows_):
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            for r in rows_:
                w.writerow(r)

    emit(out_dir / f"{args.out_prefix}.csv", rows)
    unmatched = [r for r in rows if not r["match_layer"]]
    disagreements = [r for r in rows if r["add_agreement"] == "0"]
    l6_matched = [r for r in rows if r["match_layer"] == "6"]
    l6_partial = [r for r in rows if r["structural_subtype"] == "structural_inference_partial"]
    l6_conflicts = [r for r in rows if r["structural_subtype"] == "structural_inference_conflict" or r["structural_conflict_flag"] == "1"]
    l6_unresolved = [r for r in rows if r["structural_subtype"] == "structural_inference_unresolved"]
    l6_unanalyzable = [r for r in rows if r["structural_subtype"] == "structural_inference_unanalyzable" and r["unresolved_tokens"]]
    emit(out_dir / f"{args.out_prefix}_unmatched.csv", unmatched)
    emit(out_dir / f"{args.out_prefix}_add_disagreements.csv", disagreements)
    emit(out_dir / f"{args.out_prefix}_l6_matched.csv", l6_matched)
    emit(out_dir / f"{args.out_prefix}_l6_partial.csv", l6_partial)
    emit(out_dir / f"{args.out_prefix}_l6_conflicts.csv", l6_conflicts)
    emit(out_dir / f"{args.out_prefix}_l6_unresolved.csv", l6_unresolved)
    emit(out_dir / f"{args.out_prefix}_l6_unresolved_tokens.csv", l6_unanalyzable)

    # L6b delta cohorts
    l6b_newly_analyzable = [
        r for r in rows
        if r["structural_subtype"] == "structural_inference_unanalyzable"
        and r["structural_subtype_normalized"] != "structural_inference_unanalyzable"
    ]
    l6b_newly_matched = [
        r for r in rows
        if r["structural_subtype"] not in ("structural_inference_exact", "structural_inference_partial")
        and r["structural_subtype_normalized"] in ("structural_inference_exact", "structural_inference_partial")
    ]
    l6b_new_conflicts = [
        r for r in rows
        if r["structural_conflict_flag"] == "0" and r["structural_conflict_flag_normalized"] == "1"
    ]
    l6b_unresolved_survivors = [
        r for r in rows
        if r["structural_subtype_normalized"] == "structural_inference_unresolved"
    ]
    emit(out_dir / f"{args.out_prefix}_l6b_newly_analyzable.csv", l6b_newly_analyzable)
    emit(out_dir / f"{args.out_prefix}_l6b_newly_matched.csv", l6b_newly_matched)
    emit(out_dir / f"{args.out_prefix}_l6b_new_conflicts.csv", l6b_new_conflicts)
    emit(out_dir / f"{args.out_prefix}_l6b_unresolved_survivors.csv", l6b_unresolved_survivors)

    by_layer = Counter(r["match_layer"] or "unmatched" for r in rows)
    matched = len(rows) - by_layer.get("unmatched", 0)
    match_pct = matched / len(rows) * 100 if rows else 0

    add_pop = sum(1 for r in rows if r["add_agreement"])
    add_agree_count = sum(1 for r in rows if r["add_agreement"] == "1")
    agree_pct = (add_agree_count / add_pop * 100) if add_pop else 0

    rep = []
    rep.append("# FootbagMoves matching preview (F2)")
    rep.append("")
    rep.append(f"**Run timestamp (UTC):** {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    rep.append(f"**Inventory:** `{args.inventory}` ({len(inventory)} rows)")
    rep.append(f"**IFPA active tricks:** {len(ifpa_tricks)} | **IFPA aliases:** {len(aliases)} | **FM-keyed external mappings:** {len(ext_mappings)}")
    rep.append("")
    rep.append("**Federation-not-adoption posture:** read-only preview. No DB writes, no canonical mutation, no alias auto-import. Curator reviews matches; new IFPA rows or aliases are separate manual steps.")
    rep.append("")
    rep.append("## Match counts by layer")
    rep.append("")
    rep.append("| Layer | Description | Count | Pct | Confidence |")
    rep.append("|--:|---|--:|--:|---|")
    layer_desc = {
        "1": ("Exact slug on display_name", "HIGH"),
        "2": ("Alias match (display_name)", "HIGH"),
        "3": ("Technical_name slug/alias", "MEDIUM"),
        "4": ("Same-side variant base", "MEDIUM"),
        "5": ("External name mappings (FM-keyed)", "varies"),
        "6": ("Structural inference (base + modifier set)", "MEDIUM/LOW"),
        "unmatched": ("(no match)", "—"),
    }
    for layer in ["1", "2", "3", "4", "5", "6", "unmatched"]:
        desc, conf = layer_desc[layer]
        c = by_layer.get(layer, 0)
        pct = c / len(rows) * 100 if rows else 0
        rep.append(f"| {layer} | {desc} | {c} | {pct:.1f}% | {conf} |")
    rep.append("")
    rep.append(f"**Matched: {matched} of {len(rows)} ({match_pct:.1f}%)**")
    rep.append("")
    rep.append("## ADD agreement (matched rows with both ADD values present)")
    rep.append("")
    rep.append(f"- Matched rows with both ADDs populated: **{add_pop}**")
    rep.append(f"- Agreement (FM == IFPA): **{add_agree_count}** ({agree_pct:.1f}%)")
    rep.append(f"- Disagreement: **{add_pop - add_agree_count}** rows — see `{args.out_prefix}_add_disagreements.csv`")
    rep.append("")
    if disagreements:
        rep.append("### Top ADD disagreements (sample, up to 20)")
        rep.append("")
        rep.append("| FM display | FM tech | FM adds | IFPA slug | IFPA adds | Layer | Notes |")
        rep.append("|---|---|--:|---|--:|--:|---|")
        for r in disagreements[:20]:
            tech = r["fm_technical_name"] or "_(empty)_"
            rep.append(f"| {r['fm_display_name']} | {tech} | {r['fm_add_count']} | {r['ifpa_slug']} | {r['ifpa_adds']} | {r['match_layer']} | {r['match_notes']} |")
        rep.append("")
    rep.append("## Unmatched cohort")
    rep.append("")
    rep.append(f"- Total: **{by_layer.get('unmatched', 0)}** rows ({100 * by_layer.get('unmatched', 0) / len(rows):.1f}% of inventory)")
    rep.append(f"- Full list: `{args.out_prefix}_unmatched.csv`")
    rep.append("")
    rep.append("Common unmatched categories (heuristic, top 20):")
    rep.append("")
    rep.append("| FM display | FM tech | FM adds | Same-side? |")
    rep.append("|---|---|--:|--:|")
    for r in unmatched[:20]:
        tech = r["fm_technical_name"] or "_(empty)_"
        ss = "yes" if r["fm_same_side_variant"] == "1" else "no"
        rep.append(f"| {r['fm_display_name']} | {tech} | {r['fm_add_count']} | {ss} |")
    rep.append("")
    rep.append("## Layer 6 structural-inference analytics")
    rep.append("")
    rep.append("Layer 6 tokenizes FM `technical_name` (falling back to `display_name` when empty) into IFPA modifier vocabulary + base trick, then performs set-based comparison against IFPA's `freestyle_trick_modifier_links`.")
    rep.append("")
    rep.append("Four subtypes (column `structural_subtype`):")
    rep.append("- `structural_inference_exact` — FM modifiers == IFPA modifiers for at least one IFPA row with same base. Resolves Layer 6 match.")
    rep.append("- `structural_inference_partial` — base agrees + modifier-set overlap (not exact). Surfaces candidate; not claimed as match.")
    rep.append("- `structural_inference_conflict` — earlier-layer match exists, but IFPA's modifier_links disagree with FM's tokenized structure (FM richer / underspecified / different).")
    rep.append("- `structural_inference_unresolved` — FM decomposes cleanly into IFPA vocab but **no IFPA row** shares the base + modifier set. Candidate for new IFPA canonical or alias.")
    rep.append("- `structural_inference_unanalyzable` — FM has FM-specific or non-vocab tokens; parse fails. Unresolved-token analytics surface FM vocabulary not in IFPA.")
    rep.append("")
    by_subtype = Counter(r["structural_subtype"] for r in rows)
    rep.append("| Structural subtype | Count | Pct |")
    rep.append("|---|--:|--:|")
    for st in [
        "structural_inference_exact",
        "structural_inference_partial",
        "structural_inference_conflict",
        "structural_inference_unresolved",
        "structural_inference_unanalyzable",
    ]:
        c = by_subtype.get(st, 0)
        pct = c / len(rows) * 100 if rows else 0
        rep.append(f"| `{st}` | {c} | {pct:.1f}% |")
    rep.append("")
    rep.append(f"**Sister CSVs:**")
    rep.append(f"- `{args.out_prefix}_l6_matched.csv` — Layer 6 exact matches ({len(l6_matched)} rows; these are NEW matches not caught by Layers 1-5)")
    rep.append(f"- `{args.out_prefix}_l6_partial.csv` — partial structural overlap candidates ({len(l6_partial)} rows)")
    rep.append(f"- `{args.out_prefix}_l6_conflicts.csv` — name-matched rows with structural disagreement ({len(l6_conflicts)} rows)")
    rep.append(f"- `{args.out_prefix}_l6_unresolved.csv` — clean FM parse, no IFPA equivalent ({len(l6_unresolved)} rows — candidates for new IFPA canonicals/aliases)")
    rep.append(f"- `{args.out_prefix}_l6_unresolved_tokens.csv` — unanalyzable rows with FM-specific tokens ({len(l6_unanalyzable)} rows)")
    rep.append("")

    # pt11 test case verification
    pt11_cases = [
        ("Whirling Osis", "blender", "blender has empty modifier_links → expected unresolved/conflict"),
        ("Miraging Osis", "torque", "torque has empty modifier_links → expected unresolved/conflict"),
        ("Spinning Torque", "mobius", "mobius has modifier_links={gyro}, spinning-torque has {spinning} → exact will match spinning-torque, not mobius"),
        ("Stepping Butterfly", "ripwalk", "ripwalk has modifier_links={blurry} → expected unresolved/conflict"),
        ("Stepping Paradox Mirage", "blur", "blur has modifier_links={blurry} → expected unresolved/conflict"),
        ("Nuclear ss Butterfly", "barfry", "barfry not in IFPA yet (pt11 deferred) → expected unresolved"),
    ]
    rep.append("## pt11 test case verification")
    rep.append("")
    rep.append("Cases where pt11 surfaced semantic decompositions; expected behavior per current IFPA structural data:")
    rep.append("")
    rep.append("| FM tech / probe | pt11 target | Observed in inventory | Subtype | Layer 6 ifpa_slug | Notes |")
    rep.append("|---|---|---|---|---|---|")
    tech_lookup = {r["fm_technical_name"].lower(): r for r in rows if r["fm_technical_name"]}
    for tech, target, expected in pt11_cases:
        observed = tech_lookup.get(tech.lower())
        if observed:
            obs_str = f"{observed['fm_display_name']} (id `{observed['synthetic_external_id']}`)"
            subtype_short = observed["structural_subtype"].replace("structural_inference_", "")
            l6_slug = observed["structural_candidates"] or observed["ifpa_slug"] or "—"
        else:
            obs_str = "_(no FM row with this exact tech in inventory)_"
            subtype_short = "n/a"
            l6_slug = "—"
        rep.append(f"| `{tech}` | `{target}` | {obs_str} | `{subtype_short}` | `{l6_slug}` | {expected} |")
    rep.append("")

    # Unresolved-token analytics
    if l6_unanalyzable:
        token_freq = Counter()
        for r in l6_unanalyzable:
            for t in r["unresolved_tokens"].split("|"):
                if t:
                    token_freq[t] += 1
        rep.append("## Unresolved token frequency (FM vocabulary not in IFPA)")
        rep.append("")
        rep.append(f"Total unanalyzable rows: {len(l6_unanalyzable)}. Top 30 unresolved tokens:")
        rep.append("")
        rep.append("| Token | Frequency | Likely category |")
        rep.append("|---|--:|---|")
        category_hint = {
            "double": "multiplicity prefix",
            "triple": "multiplicity prefix",
            "reverse": "direction",
            "rev": "direction abbrev",
            "back": "direction",
            "front": "direction",
            "side": "direction",
            "out": "direction component",
            "down": "direction component",
            "over": "direction component",
            "in": "direction component",
            "up": "direction component",
            "swirl": "base trick (may need slug-form check)",
            "whirl": "base trick (may need slug-form check)",
        }
        for tok, n in token_freq.most_common(30):
            cat = category_hint.get(tok, "(FM-specific or unknown)")
            rep.append(f"| `{tok}` | {n} | {cat} |")
        rep.append("")

    # Layer 6 exact matches detail
    if l6_matched:
        rep.append("## Layer 6 exact matches (sample)")
        rep.append("")
        rep.append("| FM display | FM tech | IFPA slug | IFPA mods | Subtype |")
        rep.append("|---|---|---|---|---|")
        for r in l6_matched[:20]:
            tech = r["fm_technical_name"] or "_(empty)_"
            rep.append(f"| {r['fm_display_name']} | {tech} | `{r['ifpa_slug']}` | `{r['ifpa_modifier_links']}` | exact |")
        rep.append("")

    # Conflicts
    if l6_conflicts:
        rep.append("## Structural conflicts (top 20)")
        rep.append("")
        rep.append("FM rows where a Layer 1-5 match exists but FM's structural decomp disagrees with IFPA's `modifier_links`. Signal: FM and IFPA agree on the conceptual identity but encode it differently.")
        rep.append("")
        rep.append("| FM display | FM tech | matched IFPA | IFPA mods | FM-inferred mods | Subtype |")
        rep.append("|---|---|---|---|---|---|")
        for r in l6_conflicts[:20]:
            tech = r["fm_technical_name"] or "_(empty)_"
            fm_mods = r["structural_parse"].split("modifiers={")[-1].split("}")[0] if "modifiers={" in r["structural_parse"] else "_(parse failed)_"
            subtype_short = r["structural_subtype"].replace("structural_inference_", "")
            rep.append(f"| {r['fm_display_name']} | {tech} | `{r['ifpa_slug']}` | `{r['ifpa_modifier_links']}` | `{fm_mods}` | {subtype_short} |")
        rep.append("")

    # L6b — FM-vocabulary normalization delta
    rep.append("## Layer 6b — FM-vocabulary normalization delta")
    rep.append("")
    rep.append("Lightweight FM-normalization layer applied BEFORE structural comparison (raw analysis preserved in the existing columns; normalized analysis in `*_normalized` columns). Normalization rules:")
    rep.append("")
    rep.append("| Input token(s) | Action | Notes |")
    rep.append("|---|---|---|")
    rep.append("| `pdx` | expand → `paradox` | unambiguous FM abbreviation |")
    rep.append("| `symp` | expand → `symposium` | unambiguous |")
    rep.append("| `ps` | expand → `paradox symposium` | combined modifier |")
    rep.append("| `dlo` | expand → `double leg over` | named compound |")
    rep.append("| `same side` (2 tokens) | merge → `ss` | feeds existing ss-handling |")
    rep.append("| `reverse` / `rev` / `far` / `down` / `over` / `back` / `front` / `side` | strip (directional) | no ADD weight; not IFPA modifier |")
    rep.append("| `set` / `toe` / `out` / `in` / `up` | strip (operational filler) | not IFPA modifier |")
    rep.append("")
    rep.append("### Subtype distribution before/after normalization")
    rep.append("")
    by_subtype_norm = Counter(r["structural_subtype_normalized"] for r in rows)
    rep.append("| Subtype | Raw | Normalized | Δ |")
    rep.append("|---|--:|--:|--:|")
    for st in [
        "structural_inference_exact",
        "structural_inference_partial",
        "structural_inference_conflict",
        "structural_inference_unresolved",
        "structural_inference_unanalyzable",
    ]:
        raw_c = by_subtype.get(st, 0)
        norm_c = by_subtype_norm.get(st, 0)
        delta = norm_c - raw_c
        rep.append(f"| `{st}` | {raw_c} | {norm_c} | {delta:+d} |")
    rep.append("")
    rep.append("### Delta cohorts")
    rep.append("")
    rep.append(f"- **Newly analyzable** (was unanalyzable → now classifiable): **{len(l6b_newly_analyzable)}** rows (`_l6b_newly_analyzable.csv`)")
    rep.append(f"- **Newly matched** (gained exact/partial classification): **{len(l6b_newly_matched)}** rows (`_l6b_newly_matched.csv`)")
    rep.append(f"- **New conflicts surfaced** (normalization revealed earlier-match structural disagreement): **{len(l6b_new_conflicts)}** rows (`_l6b_new_conflicts.csv`)")
    rep.append(f"- **Unresolved survivors** (clean normalized parse but still no IFPA match): **{len(l6b_unresolved_survivors)}** rows (`_l6b_unresolved_survivors.csv`)")
    rep.append("")
    if l6b_newly_analyzable:
        rep.append("### Newly analyzable (sample, up to 15)")
        rep.append("")
        rep.append("| FM display | FM tech | Normalization | Normalized parse | Subtype |")
        rep.append("|---|---|---|---|---|")
        for r in l6b_newly_analyzable[:15]:
            tech = r["fm_technical_name"] or "_(empty)_"
            short = r["structural_subtype_normalized"].replace("structural_inference_", "")
            parse_short = r["structural_parse_normalized"].split(" (source:")[0]
            rep.append(f"| {r['fm_display_name']} | {tech} | {r['normalization_notes']} | {parse_short} | {short} |")
        rep.append("")
    if l6b_newly_matched:
        rep.append("### Newly matched (sample, up to 15)")
        rep.append("")
        rep.append("| FM display | FM tech | Normalization | Normalized candidates | Subtype |")
        rep.append("|---|---|---|---|---|")
        for r in l6b_newly_matched[:15]:
            tech = r["fm_technical_name"] or "_(empty)_"
            short = r["structural_subtype_normalized"].replace("structural_inference_", "")
            rep.append(f"| {r['fm_display_name']} | {tech} | {r['normalization_notes']} | `{r['structural_candidates_normalized']}` | {short} |")
        rep.append("")
    if l6b_new_conflicts:
        rep.append("### New conflicts surfaced (normalization revealed structural disagreement)")
        rep.append("")
        rep.append("| FM display | FM tech | matched IFPA | IFPA mods | FM-inferred mods (normalized) |")
        rep.append("|---|---|---|---|---|")
        for r in l6b_new_conflicts[:15]:
            tech = r["fm_technical_name"] or "_(empty)_"
            fm_mods = r["structural_parse_normalized"].split("modifiers={")[-1].split("}")[0] if "modifiers={" in r["structural_parse_normalized"] else "_(parse failed)_"
            rep.append(f"| {r['fm_display_name']} | {tech} | `{r['ifpa_slug']}` | `{r['ifpa_modifier_links']}` | `{fm_mods}` |")
        rep.append("")

    # Named-case evaluation
    rep.append("### Specific case evaluation")
    rep.append("")
    cases = ["Blender", "Torque", "Mobius", "Marius", "Blurriest", "Gauntlet", "Barfry"]
    rep.append("| FM display target | Inventory rows found | Raw subtype | Normalized subtype | Match layer | IFPA slug |")
    rep.append("|---|--:|---|---|--:|---|")
    for case_name in cases:
        matches_for_case = [r for r in rows if r["fm_display_name"].lower().startswith(case_name.lower())]
        if not matches_for_case:
            rep.append(f"| {case_name} | 0 | — | — | — | — |")
            continue
        for r in matches_for_case[:3]:
            raw_short = r["structural_subtype"].replace("structural_inference_", "")
            norm_short = r["structural_subtype_normalized"].replace("structural_inference_", "")
            rep.append(f"| {r['fm_display_name']} | 1 | {raw_short} | {norm_short} | {r['match_layer'] or '—'} | `{r['ifpa_slug'] or '—'}` |")
    rep.append("")

    # Same-side cohort effects
    ss_rows = [r for r in rows if r["fm_same_side_variant"] == "1"]
    ss_raw_unanalyzable = sum(1 for r in ss_rows if r["structural_subtype"] == "structural_inference_unanalyzable")
    ss_norm_unanalyzable = sum(1 for r in ss_rows if r["structural_subtype_normalized"] == "structural_inference_unanalyzable")
    ss_raw_matched = sum(1 for r in ss_rows if r["structural_subtype"] in ("structural_inference_exact", "structural_inference_partial"))
    ss_norm_matched = sum(1 for r in ss_rows if r["structural_subtype_normalized"] in ("structural_inference_exact", "structural_inference_partial"))
    rep.append("### Same-side cohort effects")
    rep.append("")
    rep.append(f"- Same-side cohort total: **{len(ss_rows)}** rows")
    rep.append(f"- Unanalyzable: **{ss_raw_unanalyzable}** raw → **{ss_norm_unanalyzable}** normalized ({ss_norm_unanalyzable - ss_raw_unanalyzable:+d})")
    rep.append(f"- Matched (exact + partial): **{ss_raw_matched}** raw → **{ss_norm_matched}** normalized ({ss_norm_matched - ss_raw_matched:+d})")
    rep.append("")

    # Abbreviation safety recommendation
    rep.append("### Abbreviation safety recommendation")
    rep.append("")
    rep.append("| Token / class | Recommendation | Rationale |")
    rep.append("|---|---|---|")
    rep.append("| `pdx` → paradox | **SAFE permanent normalization** | Unambiguous; FM uses pdx as paradox abbreviation consistently |")
    rep.append("| `symp` → symposium | **SAFE permanent normalization** | Unambiguous |")
    rep.append("| `ps` → paradox symposium | **SAFE permanent normalization** | Combined-modifier shorthand; matches IFPA's `paradox-symposium-whirl` etc. |")
    rep.append("| `dlo` → double leg over | **SAFE permanent normalization** | Named compound; matches IFPA `double-leg-over` slug |")
    rep.append("| `ss` / `same side` | **SAFE permanent normalization** | Existing ss-handling already recognizes the marker |")
    rep.append("| `reverse` / `far` / direction tokens | **SAFE to STRIP** | No ADD weight; non-IFPA-modifier; well-understood directional flag |")
    rep.append("| `set` / `toe` / `out` / `in` / `up` (operational filler) | **SAFE to STRIP** | Surface markers; not IFPA modifiers |")
    rep.append("| `os` | **FM-only dialect; NOT for normalization** | Unclear semantic; could be 'other-side' or surface-specific; needs curator ruling |")
    rep.append("| `bubba` / `frootie` / `fyro` / `dragon` / `zulu` | **NEVER influence IFPA ontology** | FM-specific named-compound parts; ontology import forbidden |")
    rep.append("| `motion` / `twirl` / `phasing` / `slapping` / `leaning` | **FM-only dialect** | Could be modifier-class but unknown; preserve as unresolved until Red rules |")
    rep.append("| `rake` | **POTENTIAL IFPA base** | Appears 10× in unresolved; check whether xbd-rake or rake is IFPA-canonical; pt12 candidate |")
    rep.append("")

    # Existing unresolved candidates section
    if l6_unresolved:
        rep.append("## Unresolved candidates (clean FM parse, no IFPA equivalent — pt12 input)")
        rep.append("")
        rep.append(f"Total: **{len(l6_unresolved)}** rows. These FM technicals tokenize into IFPA vocabulary but have NO IFPA row with matching base + modifier set. They are candidates for either:")
        rep.append("- New IFPA canonical row (if community-recognized as a stable named compound)")
        rep.append("- New IFPA alias on an existing row (if FM is a folk name for an existing IFPA trick)")
        rep.append("- FM-only-never-canonical (if FM-specific, joke/tribute, or productive-multiplicity rejected per pt8)")
        rep.append("")
        rep.append("Top 20 (full set in `_l6_unresolved.csv`):")
        rep.append("")
        rep.append("| FM display | FM tech / parse | FM adds |")
        rep.append("|---|---|--:|")
        for r in l6_unresolved[:20]:
            tech = r["fm_technical_name"] or "_(empty)_"
            rep.append(f"| {r['fm_display_name']} | {tech} | {r['fm_add_count']} |")
        rep.append("")
    rep.append("## Recommended next steps (curator-paced)")
    rep.append("")
    rep.append("1. **Review HIGH-confidence Layer 1+2 matches** for spot-check accuracy. These should be safe to treat as authoritative FM↔IFPA correspondences.")
    rep.append("2. **Adjudicate Layer 3+4 matches** (MEDIUM confidence). Same-side variants in Layer 4 are interesting for the pt12 Barfry \"ss\" question.")
    rep.append("3. **Review ADD disagreements** for the FM↔IFPA ontology-conflict cases (pt11 set: Blur, Ripwalk, Blender, Torque, Mobius — all expected; new disagreements are signal).")
    rep.append("4. **Triage unmatched cohort** for:")
    rep.append("   - New IFPA canonical rows (FM moves not yet in IFPA dictionary)")
    rep.append("   - New IFPA aliases (FM names for already-canonical IFPA tricks)")
    rep.append("   - Deferred (no clear path; may require Red follow-up)")
    rep.append("5. **Populate `external_name_mappings.csv`** with FM-keyed entries for curator-confirmed matches — this raises the bar for Layer 5 on future runs.")
    rep.append("6. **Build Layer 6** (structural inference) once unmatched-cohort triage clarifies how often FM technical_name decomposes cleanly into IFPA modifier vocabulary.")
    rep.append("")
    rep.append("## Outputs")
    rep.append("")
    rep.append(f"- `{out_dir}/{args.out_prefix}.csv` — full preview ({len(rows)} rows × 12 fields)")
    rep.append(f"- `{out_dir}/{args.out_prefix}_unmatched.csv` — unmatched cohort")
    rep.append(f"- `{out_dir}/{args.out_prefix}_add_disagreements.csv` — matched with ADD mismatch")
    rep.append(f"- `{out_dir}/{args.out_prefix}_report.md` — this report")
    rep.append("")
    rep.append("## Contract preservations")
    rep.append("")
    rep.append("- ✓ Read-only preview. No DB writes, no canonical mutation, no alias auto-import.")
    rep.append("- ✓ Federation-not-adoption: every match is curator-reviewable; never auto-resolved.")
    rep.append("- ✓ ADD disagreements flagged; FM never overwrites IFPA's `freestyle_tricks.adds`.")
    rep.append("- ✓ Staging only — promotion to `legacy_data/out/` is a separate manual step.")
    rep.append("- ✓ No parser hooks; no schema changes; no workbook ingest.")

    Path(out_dir / f"{args.out_prefix}_report.md").write_text("\n".join(rep) + "\n", encoding="utf-8")

    print(f"[preview_footbagmoves_match] Wrote 4 artifacts to {out_dir}/")
    print(f"  matched: {matched}/{len(rows)} ({match_pct:.1f}%)")
    print(f"  ADD disagreements: {len(disagreements)}")
    print(f"  unmatched: {len(unmatched)}")


if __name__ == "__main__":
    sys.exit(main() or 0)
