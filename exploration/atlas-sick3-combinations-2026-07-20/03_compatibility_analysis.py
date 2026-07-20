#!/usr/bin/env python3
"""Atlas research (read-only): Sick 3 compatibility analysis + statistics.

Instantiates each fully-resolved Sick 3 sequence on an arbitrary physical
starting foot, carries terminal foot + surface forward, and tests each link.
Mirror symmetry is inherent: all state is relative parity, so a left/right
mirror choice can never fail a sequence. Research-only; writes only to ./out/.
"""
import csv
import re
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "out"

INV = {r["slug"]: r for r in csv.DictReader((OUT / "trick_transition_inventory.csv").open(encoding="utf-8"))}
CATALOG = list(csv.DictReader((OUT / "sick3_source_catalog.csv").open(encoding="utf-8")))

SURF_NORM = {
    "TOE": "TOE", "CLIP": "CLIP", "INSIDE": "INSIDE", "OUTSIDE": "OUTSIDE",
    "SET(implicit)": "ANY", "SET": "ANY", "": "ANY",
}

def surf_of(s: str) -> str:
    s = (s or "").strip()
    for k in ("TOE", "CLIP", "INSIDE", "OUTSIDE", "OSIS", "THIGH", "KNEE"):
        if s.upper().startswith(k) or f" {k}" in s.upper():
            return "CLIP" if k == "OSIS" else k
    return SURF_NORM.get(s, s.upper() or "ANY")

def entry_req(inv_row) -> str:
    spec = inv_row["entry_specificity"]
    if spec in ("SET", "NONE", ""):
        return "ANY"
    if spec == "TOE":
        return "TOE"
    if spec == "CLIP":
        return "CLIP"
    return surf_of(inv_row["entry_surface"])

def parity_of(rel: str):
    return {"PRESERVE": 0, "SWITCH": 1}.get(rel)

def link_status(a_slug: str, b_slug: str):
    a, b = INV.get(a_slug), INV.get(b_slug)
    if not a or not b:
        return "NOT_MODELED", "trick missing from inventory"
    if a["terminal_kind"] != "DELAY":
        return "NOT_MODELED", f"A terminal is {a['terminal_kind'] or 'unparsed'}, no carried delay state"
    if a["terminal_relation"] == "UNRESOLVED":
        return "AMBIGUOUS", "A terminal foot unresolved"
    a_surf = surf_of(a["terminal_surface"])
    need = entry_req(b)
    if need == "ANY":
        return "COMPATIBLE_VIA_FLEXIBLE_SET", f"A ends {a_surf}; B entry is a generic set"
    if a_surf == need:
        return "COMPATIBLE", f"A ends {a_surf}; B enters {need}"
    # positional-variant check: any active sibling of B (same trailing name) whose entry matches
    base = b_slug.split("_", 1)[-1]
    for slug2, r2 in INV.items():
        if slug2 != b_slug and slug2.endswith(base) and entry_req(r2) in (a_surf, "ANY"):
            return "COMPATIBLE_WITH_POSITIONAL_VARIANT", f"B entry {need} != {a_surf}, but sibling {slug2} fits"
    return "APPARENTLY_INCOMPATIBLE", f"A ends {a_surf}; B requires {need} entry"

def seq_analysis(slugs):
    vec, notes = [], []
    parity = 0  # start foot arbitrary; parity relative to it
    known = True
    for s in slugs:
        r = INV.get(s)
        rel = r["terminal_relation"] if r else "UNRESOLVED"
        vec.append({"PRESERVE": "P", "SWITCH": "S", "VARIABLE": "V", "UNRESOLVED": "U"}[rel])
        p = parity_of(rel)
        if p is None:
            known = False
        elif known:
            parity ^= p
    l1, why1 = link_status(slugs[0], slugs[1])
    l2, why2 = link_status(slugs[1], slugs[2])
    chain = []
    for s in slugs:
        r = INV.get(s)
        chain.append(f"{entry_req(r) if r else '?'}->{surf_of(r['terminal_surface']) if r else '?'}")
    return {
        "parity_vector": "".join(vec),
        "sequence_parity": ("SAME_FOOT" if parity == 0 else "OPPOSITE_FOOT") if known else "UNDETERMINED",
        "link1": l1, "link1_note": why1,
        "link2": l2, "link2_note": why2,
        "surface_chain": " | ".join(chain),
    }


def main():
    full = [r for r in CATALOG if r["resolution"] == "full"]
    seqs = {}
    for r in full:
        key = (r["canon_1"], r["canon_2"], r["canon_3"])
        seqs.setdefault(key, []).append(r)

    rows = []
    for key, rs in seqs.items():
        a = seq_analysis(list(key))
        adds = [rs[0][f"canon_{n}_add"] for n in (1, 2, 3)]
        rows.append({
            "t1": key[0], "t2": key[1], "t3": key[2],
            "occurrences": len(rs),
            "years": "|".join(sorted({x["event_year"] for x in rs if x["event_year"]})),
            "players": "|".join(sorted({x["player"] for x in rs if x["player"]})[:4]),
            "add_1": adds[0], "add_2": adds[1], "add_3": adds[2],
            "current_total_add": rs[0]["current_total_add"],
            "raw_total_reported": "|".join(sorted({x["raw_total"] for x in rs if x["raw_total"]})),
            **a,
        })
    rows.sort(key=lambda r: (-int(r["current_total_add"] or 0), r["t1"]))
    with (OUT / "sick3_compatibility.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    # ---------- statistics ----------
    L = []
    L.append("# Sick 3 statistics (Atlas research; read-only)\n")
    L.append(f"- Source records (all resolutions): {len(CATALOG)}")
    res = Counter(r["resolution"] for r in CATALOG)
    L.append(f"- Resolution: full {res['full']}, partial {res['partial']}, none {res['none']}"
             f" (canonical-resolution rate, per-record full: {100*res['full']/len(CATALOG):.0f}%)")
    L.append(f"- Fully-resolved unique sequences analyzed: {len(rows)}")
    uniq_tricks = Counter()
    for r in rows:
        for n in ("t1", "t2", "t3"):
            uniq_tricks[r[n]] += 1
    L.append(f"- Unique tricks across resolved sequences: {len(uniq_tricks)}\n")
    L.append("## Most common tricks (in resolved sequences)\n")
    weighted = Counter()
    for r in rows:
        for n in ("t1", "t2", "t3"):
            weighted[r[n]] += int(r["occurrences"])
    for t, c in weighted.most_common(15):
        fam = INV.get(t, {}).get("family", "?")
        L.append(f"- {t} ({fam}): {c}")
    L.append("\n## Families (weighted by occurrence)\n")
    fam = Counter()
    for t, c in weighted.items():
        fam[INV.get(t, {}).get("family", "?") or "(none)"] += c
    for k, c in fam.most_common(12):
        L.append(f"- {k}: {c}")
    L.append("\n## Current total-ADD distribution (unique sequences)\n")
    tot = Counter(r["current_total_add"] for r in rows if r["current_total_add"])
    for k in sorted(tot, key=lambda x: int(x)):
        L.append(f"- {k} ADD: {tot[k]}")
    L.append("\n## Historical vs current ADD\n")
    both = [(r, int(r["raw_total_reported"].split('|')[0]), int(r["current_total_add"]))
            for r in rows if r["raw_total_reported"].split('|')[0].isdigit() and str(r["current_total_add"]).isdigit()]
    same = sum(1 for _, h, c in both if h == c)
    L.append(f"- Sequences with a reported historical total: {len(both)}; matching current total: {same}")
    for r, h, c in [x for x in both if x[1] != x[2]][:10]:
        L.append(f"  - {r['t1']}>{r['t2']}>{r['t3']}: historical {h} vs current {c}")
    L.append("\n## Parity\n")
    pv = Counter(r["parity_vector"] for r in rows)
    L.append("Three-trick parity patterns (P=preserve, S=switch, V=variable, U=unresolved):")
    for k, c in pv.most_common():
        L.append(f"- {k}: {c}")
    sp = Counter(r["sequence_parity"] for r in rows)
    L.append(f"\nWhole-sequence start-vs-final foot: {dict(sp)}")
    L.append("\n## Link compatibility — DIRECT-LINK COMPATIBILITY UNDER CURRENT CANONICAL NOTATION\n")
    L.append("This metric assumes the three nominated tricks link directly (the delay ending one "
             "trick is the set of the next) and reads entries/terminals from current canonical "
             "operational notation. A rules ruling that Sick 3 allowed an unnamed setup contact "
             "between tricks would demote this metric from normative to descriptive.\n")
    l1 = Counter(r["link1"] for r in rows)
    l2 = Counter(r["link2"] for r in rows)
    L.append(f"- Link 1 (t1->t2): {dict(l1)}")
    L.append(f"- Link 2 (t2->t3): {dict(l2)}")
    ok = {"COMPATIBLE", "COMPATIBLE_VIA_FLEXIBLE_SET", "COMPATIBLE_WITH_POSITIONAL_VARIANT"}
    both_ok = sum(1 for r in rows if r["link1"] in ok and r["link2"] in ok)
    L.append(f"- Sequences with BOTH links compatible: {both_ok}/{len(rows)} ({100*both_ok/len(rows):.0f}%)")
    L.append("\n## Chronology (mean current total ADD by year, resolved sequences)\n")
    by_year = defaultdict(list)
    for r in rows:
        for y in (r["years"] or "").split("|"):
            if y and str(r["current_total_add"]).isdigit():
                by_year[y].append(int(r["current_total_add"]))
    for y in sorted(by_year):
        v = by_year[y]
        L.append(f"- {y}: n={len(v)}, mean {sum(v)/len(v):.1f}, max {max(v)}")
    L.append("\n## Highest-ADD fully compatible sequences\n")
    top = [r for r in rows if r["link1"] in ok and r["link2"] in ok and str(r["current_total_add"]).isdigit()]
    for r in top[:10]:
        L.append(f"- {r['current_total_add']} ADD: {r['t1']} > {r['t2']} > {r['t3']} "
                 f"({r['parity_vector']}, {r['years']})")
    L.append("\n## Sequences the current model calls APPARENTLY_INCOMPATIBLE (historical evidence to weigh)\n")
    bad = [r for r in rows if r["link1"] == "APPARENTLY_INCOMPATIBLE" or r["link2"] == "APPARENTLY_INCOMPATIBLE"]
    for r in bad[:20]:
        which = "link1" if r["link1"] == "APPARENTLY_INCOMPATIBLE" else "link2"
        L.append(f"- {r['t1']} > {r['t2']} > {r['t3']} ({r['years']}; x{r['occurrences']}): {r[which + '_note']}")
    L.append(f"\nTotal apparently-incompatible sequences: {len(bad)}")
    L.append("\n## Coverage caveats\n")
    L.append("- Corpus: mirror event pages only (manually-entered result blobs); partial/none-resolution "
             "records are preserved in the source catalog but not analyzed here.")
    L.append("- Sample sizes per year are small; chronology is indicative, not conclusive.")
    (OUT / "sick3_statistics.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"unique resolved sequences: {len(rows)}; both-links-compatible: {both_ok}; incompatible: {len(bad)}")
    print(f"parity vectors: {dict(pv.most_common(8))}")


if __name__ == "__main__":
    main()
