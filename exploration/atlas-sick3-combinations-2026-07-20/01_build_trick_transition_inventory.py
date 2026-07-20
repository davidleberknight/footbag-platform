#!/usr/bin/env python3
"""Atlas research (read-only): canonical trick transition inventory + terminal-parity census.

Research-only artifact. Reads database/footbag.db (read-only URI). Never writes to the
DB, production data, or generated content. Output lands in ./out/ only.

Model: for each active public canonical trick, parse operational_notation into
  entry/set state -> ordered movement events -> terminal foot (relative to set) -> terminal surface.
Terminal-foot relation labels: PRESERVE / SWITCH / VARIABLE / UNRESOLVED.
The terminal relation is read from the actual terminal contact segment's resolved
side chain (component-relative SAME/OP), never inferred from the final dexing leg.
"""
import csv
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parents[1]
DB = REPO / "database" / "footbag.db"
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

SIDE_RE = re.compile(r"^(SAME/OP|OP/SAME|SAME|OP)\b")

# Research classification (NOT production notation): terminals where the
# preserve/switch question has no answer because there is no single terminal
# foot. Ten rows: six dragon-delay compounds (midline surface), two multi-bag
# juggling primitives, the two-footed double kick, and the between-the-thighs
# thigh catch. `squeeze` is deliberately NOT here: it is a one-legged crook
# catch pending an either-side ruling, so it stays UNRESOLVED.
SIDE_NOT_APPLICABLE_SLUGS = {
    "butterfly_dragon": "dragon delay is a midline surface",
    "double_swirl_dragon": "dragon delay is a midline surface",
    "hopover_swirl_dragon": "dragon delay is a midline surface",
    "miraging_dragon": "dragon delay is a midline surface",
    "reverse_swirl_dragon": "dragon delay is a midline surface",
    "swirl_dragon": "dragon delay is a midline surface",
    "2_bag_juggling": "multi-object boundary primitive; no single terminal foot",
    "3_bag_juggling": "multi-object boundary primitive; no single terminal foot",
    "double_kick": "both feet contact simultaneously",
    "thigh_catch": "caught between the thighs; midline two-limb catch",
}
BRACKET_RE = re.compile(r"\[(DEX|BOD|PDX|XBD|DEL|UNS|XDEX|KICK)\]")
PAREN_RE = re.compile(r"\([^)]*\)")

ENTRY_SPECIFICITY = {
    "TOE": "TOE", "CLIP": "CLIP", "SET": "SET",
    "INSIDE": "OTHER_SURFACE", "OUTSIDE": "OTHER_SURFACE", "THIGH": "OTHER_SURFACE",
}

def norm_segments(notation: str):
    # '>>' marks uptime chaining; both separators delimit components identically here.
    s = notation.replace(">>", ">")
    return [seg.strip() for seg in s.split(">") if seg.strip()]

def seg_brackets(seg: str):
    return BRACKET_RE.findall(seg)

def seg_side(seg: str):
    m = SIDE_RE.match(PAREN_RE.sub("", seg).strip())
    if not m:
        return None
    tok = m.group(1)
    return "VAR" if "/" in tok else ("SAME" if tok == "SAME" else "OP")

def seg_surface(seg: str):
    """Surface word in a contact segment (terminal or entry), sans side/parens/brackets."""
    t = PAREN_RE.sub("", seg)
    t = BRACKET_RE.sub("", t)
    t = SIDE_RE.sub("", t.strip()).strip()
    t = re.sub(r"\s+", " ", t)
    return t or None

def classify(notation: str):
    """Returns dict of parsed fields; honest UNRESOLVED on anything unparseable."""
    out = {
        "entry_surface": None, "entry_specificity": None,
        "terminal_surface": None, "terminal_kind": None,
        "terminal_relation": None, "variable_at": "",
        "dex_count": 0, "bracket_total": 0, "parse_ok": False, "parse_note": "",
    }
    segs = norm_segments(notation)
    if not segs:
        out["terminal_relation"] = "UNRESOLVED"
        out["parse_note"] = "empty"
        return out

    all_br = BRACKET_RE.findall(notation)
    out["dex_count"] = all_br.count("DEX")
    out["bracket_total"] = len(all_br)

    # --- entry ---
    first = segs[0]
    fside = seg_side(first)
    fsurf = seg_surface(first)
    fbr = seg_brackets(first)
    if fside is not None or "BOD" in fbr or "DEX" in fbr or "KICK" in fbr:
        # First segment is a movement/side-marked component: the set is implicit/generic.
        out["entry_surface"] = "SET(implicit)"
        out["entry_specificity"] = "SET"
        move_segs = segs
    else:
        out["entry_surface"] = fsurf or "SET(implicit)"
        key = (fsurf or "SET").split()[0]
        out["entry_specificity"] = ENTRY_SPECIFICITY.get(key, "OTHER")
        move_segs = segs[1:]

    # --- terminal segment: last [DEL], else last [KICK] ---
    term_idx = None
    for i in range(len(segs) - 1, -1, -1):
        if "DEL" in seg_brackets(segs[i]):
            term_idx = i
            out["terminal_kind"] = "DELAY"
            break
    if term_idx is None:
        for i in range(len(segs) - 1, -1, -1):
            if "KICK" in seg_brackets(segs[i]):
                term_idx = i
                out["terminal_kind"] = "KICK"
                break
    if term_idx is None:
        out["terminal_relation"] = "UNRESOLVED"
        out["parse_note"] = "no [DEL]/[KICK] terminal"
        return out
    out["terminal_surface"] = seg_surface(segs[term_idx]) or "?"

    # --- component-relative side-chain resolution up to and including the terminal ---
    # parity: 0 = set foot, 1 = other foot, None = variable (canonically either).
    parity = 0
    variable_hit = ""
    for i, seg in enumerate(segs):
        if i == 0 and seg is segs[0] and seg_side(seg) is None and not (
            set(seg_brackets(seg)) & {"DEX", "BOD", "KICK"}
        ):
            continue  # pure set segment anchors parity 0
        side = seg_side(seg)
        if side is None:
            continue  # non-side-bearing component (DUCK/SPIN/DIVE etc.)
        if side == "VAR":
            variable_hit = "terminal" if i == term_idx else (variable_hit or "mid-chain")
            parity = None
        elif parity is not None:
            parity = parity if side == "SAME" else 1 - parity
        if i == term_idx:
            break

    if parity is None:
        out["terminal_relation"] = "VARIABLE"
        out["variable_at"] = variable_hit
    else:
        # If the terminal segment itself carries no side marker, the contact side is
        # not stated; treat an unmarked DELAY terminal as unresolved rather than guessed.
        if seg_side(segs[term_idx]) is None:
            out["terminal_relation"] = "UNRESOLVED"
            out["parse_note"] = "terminal has no side marker"
        else:
            out["terminal_relation"] = "PRESERVE" if parity == 0 else "SWITCH"
    out["parse_ok"] = True
    return out


def main() -> int:
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """SELECT slug, canonical_name, adds, trick_family, base_trick, category,
                  operational_notation
             FROM freestyle_tricks
            WHERE is_active = 1 AND (category IS NULL OR category <> 'modifier')
            ORDER BY slug"""
    ).fetchall()
    excluded = con.execute(
        "SELECT COUNT(*) FROM freestyle_tricks WHERE is_active=1 AND category='modifier'"
    ).fetchone()[0]
    links = defaultdict(list)
    for r in con.execute(
        "SELECT trick_slug, modifier_slug FROM freestyle_trick_modifier_links ORDER BY trick_slug, apply_order"
    ):
        links[r["trick_slug"]].append(r["modifier_slug"])
    mod_types = {
        r["slug"]: (r["modifier_type"] or "")
        for r in con.execute("SELECT slug, modifier_type FROM freestyle_trick_modifiers")
    }

    inv = []
    for r in rows:
        notation = (r["operational_notation"] or "").strip()
        if notation:
            c = classify(notation)
            # Research-only reclassification: a non-single-foot terminal is a
            # different fact from "evidence does not determine the side".
            if r["slug"] in SIDE_NOT_APPLICABLE_SLUGS and c["terminal_relation"] == "UNRESOLVED":
                c["terminal_relation"] = "SIDE_NOT_APPLICABLE"
                c["parse_note"] = SIDE_NOT_APPLICABLE_SLUGS[r["slug"]]
        else:
            c = {
                "entry_surface": "", "entry_specificity": "NONE",
                "terminal_surface": "", "terminal_kind": "",
                "terminal_relation": "UNRESOLVED", "variable_at": "",
                "dex_count": "", "bracket_total": "", "parse_ok": False,
                "parse_note": "no operational_notation",
            }
        mods = links.get(r["slug"], [])
        op_classes = sorted({mod_types.get(m, "unlinked") for m in mods}) if mods else []
        inv.append({
            "slug": r["slug"],
            "canonical_name": r["canonical_name"],
            "current_add": r["adds"] or "",
            "operational_notation": notation,
            "entry_surface": c["entry_surface"] or "",
            "entry_specificity": c["entry_specificity"] or "",
            "terminal_surface": c["terminal_surface"] or "",
            "terminal_kind": c["terminal_kind"] or "",
            "terminal_relation": c["terminal_relation"],
            "variable_at": c["variable_at"],
            "dex_count": c["dex_count"],
            "family": r["trick_family"] or "",
            "base_trick": r["base_trick"] or "",
            "category": r["category"] or "",
            "modifier_links": "|".join(mods),
            "operator_classes": "|".join(op_classes),
            "foot_tracking_straightforward": "yes" if (c["parse_ok"] and c["terminal_relation"] in ("PRESERVE", "SWITCH")) else "no",
            "ambiguity_note": c["parse_note"],
        })

    inv_path = OUT / "trick_transition_inventory.csv"
    with inv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(inv[0].keys()))
        w.writeheader()
        w.writerows(inv)

    # ---- census ----
    def dist(key):
        return Counter(row[key] for row in inv)

    rel = dist("terminal_relation")
    lines = []
    lines.append("# Terminal-parity census (Atlas research; read-only)\n")
    lines.append(f"Active public canonical tricks classified: **{len(inv)}**")
    lines.append(f"Excluded: {excluded} active `category='modifier'` rows (operators, not tricks).")
    no_notation = sum(1 for i in inv if i["ambiguity_note"] == "no operational_notation")
    lines.append(f"Rows without operational notation: {no_notation} (all UNRESOLVED).\n")
    lines.append("## Terminal-foot relation to set\n")
    for k in ("PRESERVE", "SWITCH", "VARIABLE", "SIDE_NOT_APPLICABLE", "UNRESOLVED"):
        lines.append(f"- {k}: {rel.get(k, 0)}")
    lines.append("  - SIDE_NOT_APPLICABLE is a research classification only (midline, two-limb,")
    lines.append("    or multi-object terminals where no single terminal foot exists); production")
    lines.append("    notation is unchanged. squeeze stays UNRESOLVED pending its either-side ruling.")
    var_where = Counter(i["variable_at"] for i in inv if i["terminal_relation"] == "VARIABLE")
    lines.append(f"  - VARIABLE at terminal contact: {var_where.get('terminal', 0)}; mid-chain: {var_where.get('mid-chain', 0)}\n")

    def table(title, key, top=None):
        lines.append(f"## {title}\n")
        cross = defaultdict(Counter)
        for i in inv:
            cross[str(i[key])][i["terminal_relation"]] += 1
        items = sorted(cross.items(), key=lambda kv: -sum(kv[1].values()))
        if top:
            items = items[:top]
        lines.append("| value | n | PRESERVE | SWITCH | VARIABLE | SIDE_N/A | UNRESOLVED |")
        lines.append("|---|---|---|---|---|---|---|")
        for val, c in items:
            lines.append(
                f"| {val or '(none)'} | {sum(c.values())} | {c['PRESERVE']} | {c['SWITCH']} | {c['VARIABLE']} | {c['SIDE_NOT_APPLICABLE']} | {c['UNRESOLVED']} |"
            )
        lines.append("")

    table("By ADD", "current_add")
    table("By family (top 25)", "family", top=25)
    table("By entry surface", "entry_specificity")
    table("By terminal surface (top 15)", "terminal_surface", top=15)
    table("By dexterity count", "dex_count")
    table("By operator class set (top 15)", "operator_classes", top=15)

    # Dex-parity vs foot-parity: tested, not assumed.
    lines.append("## Dexterity parity vs terminal-foot parity (tested)\n")
    tab = defaultdict(Counter)
    for i in inv:
        if i["terminal_relation"] in ("PRESERVE", "SWITCH") and i["dex_count"] != "":
            tab["even" if int(i["dex_count"]) % 2 == 0 else "odd"][i["terminal_relation"]] += 1
    lines.append("| dex parity | PRESERVE | SWITCH | agreement with 'odd dex => switch' |")
    lines.append("|---|---|---|---|")
    for p in ("even", "odd"):
        c = tab[p]
        tot = c["PRESERVE"] + c["SWITCH"]
        agree = (c["PRESERVE"] if p == "even" else c["SWITCH"])
        pct = f"{100*agree/tot:.1f}%" if tot else "n/a"
        lines.append(f"| {p} | {c['PRESERVE']} | {c['SWITCH']} | {pct} |")
    lines.append("\nCounter-examples (dex parity does NOT determine terminal foot):")
    ce = [i for i in inv if i["terminal_relation"] in ("PRESERVE", "SWITCH") and i["dex_count"] != ""
          and ((int(i["dex_count"]) % 2 == 0) != (i["terminal_relation"] == "PRESERVE"))]
    for i in ce[:12]:
        lines.append(f"- {i['slug']} (dex={i['dex_count']}, {i['terminal_relation']}): `{i['operational_notation']}`")
    lines.append(f"\nTotal counter-examples: {len(ce)} of {sum(sum(c.values()) for c in tab.values())} resolved rows.")

    (OUT / "terminal_parity_census.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"inventory rows: {len(inv)} -> {inv_path}")
    print(f"relations: {dict(rel)}")
    print(f"counter-examples (dex parity vs foot): {len(ce)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
