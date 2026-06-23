#!/usr/bin/env python3
"""Promotion-QC of the 53 READY-NOW positional variants. Read-only, no authoring.

For each (base, side) variant: derive its notation by flipping the unique target
dex, then verify notation completeness, exact ADD (bracket-count == base ADD),
historical source, base_trick, trick_family, and description quality. Classify:
  1 PROMOTION READY          - all checks pass, incl. a usable description
  2 NEEDS DESCRIPTION AUTHORING - structure complete, base description weak/placeholder
  3 NEEDS DATA CLEANUP       - notation / family / base / ADD wiring issue
  4 FALSE POSITIVE           - should not have been READY (no real flip, or structural dup)
"""
from __future__ import annotations
import csv, re, sqlite3
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CU = REPO / "exploration/phase-e-implementation-2026-05-28/CLASSIFIED_UNIVERSE.csv"
GATED = Path(__file__).resolve().parent / "ev_rerun_gated.csv"
DB = REPO / "database/footbag.db"
OUT = Path(__file__).resolve().parent / "QC_BATCH.md"

SIDE = {"ss", "near", "far", "op", "opp", "opposite", "same", "side", "same-side", "opposite-side"}
RECEIVERS = {"mirage", "illusion", "whirl", "torque", "drifter"}
REAL = ("footbagmoves", "fborg", "stanford", "passback")
BRACKETS = ("[DEX]", "[BOD]", "[XBD]", "[PDX]", "[DEL]", "[UNS]", "[XDEX]")
PLACEHOLDER = re.compile(r"^(popular freestyle trick|.+\bmodified\b.+|.+-modified.+)\.?$", re.I)


def slugify(s):
    s = re.sub(r"\((?:ss|op|opp|opposite|near|far|same[ -]side)\)", "", s, flags=re.I)
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def strip_side(slug):
    return "-".join(x for x in slug.split("-") if x not in SIDE)


def pside(n):
    n = " " + n.lower().replace("-", " ") + " "
    if re.search(r"same\s+side|\bsame\b|\bss\b|\bnear\b", n):
        return "same"
    if re.search(r"\bfar\b|\bopposite\b|\bopp\b|\bop\b", n):
        return "far"
    return None


def dex_indices(toks):
    out = []
    for i, t in enumerate(toks):
        if "[DEX]" in t:
            for j in range(i - 1, max(-1, i - 6), -1):
                if toks[j] in ("SAME/OP", "OP", "SAME"):
                    out.append((j, "AMBIG" if toks[j] == "SAME/OP" else toks[j])); break
    return out


def derive(op, side):
    """Flip the unique opposite dex to the asserted side; return (notation, ok)."""
    want = "SAME" if side == "same" else "OP"
    opp = "OP" if want == "SAME" else "SAME"
    toks = op.split()
    di = dex_indices(toks)
    targets = [j for j, m in di if m == opp] + [j for j, m in di if m == "AMBIG"]
    if len(targets) != 1:
        return None, False
    toks[targets[0]] = want
    return " ".join(toks), True


def main():
    src_by_name = {}
    for r in csv.DictReader(open(CU)):
        src_by_name[r["name"]] = ((r["sources"] or "") + "," + (r["source_corpus"] or "")).lower()

    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    base = {}
    for s, op, adds, bt, fam, desc, act in con.execute(
        "SELECT slug, operational_notation, adds, base_trick, trick_family, description, is_active FROM freestyle_tricks"):
        base[s] = dict(op=op or "", adds=adds, base_trick=bt, fam=fam, desc=desc or "", act=act)
    active_notation = {s: d["op"] for s, d in base.items() if d["act"] == 1 and d["op"]}
    in_system = set()
    for s, d in base.items():
        if d["act"] == 1 and pside(s):
            in_system.add((strip_side(s), pside(s)))
    for (a,) in con.execute("SELECT alias_slug FROM freestyle_trick_aliases"):
        if a and pside(a):
            in_system.add((strip_side(a), pside(a)))
    con.close()

    # reproduce READY-NOW-not-in-system (base, side) from bucket A
    variants = defaultdict(lambda: {"names": [], "redundant": False})
    for r in csv.DictReader(open(GATED)):
        if r["bucket"] != "A":
            continue
        key = (r["base"], r["asserted_side"])
        variants[key]["names"].append(r["name"])
        if "redundant" in r["detail"]:
            variants[key]["redundant"] = True
    ready = []
    for (b, side), v in variants.items():
        if v["redundant"]:
            continue
        if b not in base or base[b]["act"] != 1 or not base[b]["op"]:
            continue
        far_recv = side == "far" and any(t in RECEIVERS for t in b.split("-"))
        if far_recv:
            continue
        if not any(any(k in src_by_name.get(nm, "") for k in REAL) for nm in v["names"]):
            continue
        if (b, side) in in_system:
            continue
        ready.append((b, side, v["names"]))

    rows = []
    for b, side, names in ready:
        d = base[b]
        op = d["op"]
        derived, flip_ok = derive(op, side)
        bracket_add = sum(op.count(tok) for tok in BRACKETS)
        try:
            base_add = int(str(d["adds"]).strip())
        except (TypeError, ValueError):
            base_add = None
        add_exact = base_add is not None and bracket_add == base_add
        family_ok = bool((d["fam"] or "").strip())
        base_ok = bool((d["base_trick"] or "").strip())
        desc_real = bool(d["desc"].strip()) and not PLACEHOLDER.match(d["desc"].strip())
        # structural duplicate: derived notation equals another active trick's notation
        dup = None
        if derived:
            for s2, op2 in active_notation.items():
                if s2 != b and op2.strip() == derived.strip():
                    dup = s2; break

        if not flip_ok or not op.strip() or dup:
            bucket = "4 FALSE POSITIVE"
            reason = ("no unique flip target" if not flip_ok else
                      "empty base notation" if not op.strip() else f"structural duplicate of `{dup}`")
        elif not add_exact or not family_ok or not base_ok:
            bucket = "3 NEEDS DATA CLEANUP"
            probs = []
            if not add_exact: probs.append(f"ADD {base_add} != bracket-count {bracket_add}")
            if not family_ok: probs.append("base trick_family empty")
            if not base_ok: probs.append("base base_trick empty")
            reason = "; ".join(probs)
        elif not desc_real:
            bucket = "2 NEEDS DESCRIPTION AUTHORING"
            reason = "base description placeholder/empty" if d["desc"].strip() else "base has no description"
        else:
            bucket = "1 PROMOTION READY"
            reason = "notation+ADD+family+base+source+description all complete"
        rows.append(dict(base=b, side=side, bucket=bucket, reason=reason, fam=d["fam"], base_add=base_add, bracket_add=bracket_add))

    bc = Counter(r["bucket"] for r in rows)
    L = []
    L.append("# Promotion-QC of the READY-NOW positional batch (2026-06-23)\n")
    L.append(f"Read-only. {len(rows)} candidate variants QC'd against 6 checks. No authoring.\n")
    L.append("Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/qc.py`\n")
    L.append("## Counts\n")
    L.append("| bucket | count |")
    L.append("|---|---:|")
    for k in ["1 PROMOTION READY", "2 NEEDS DESCRIPTION AUTHORING", "3 NEEDS DATA CLEANUP", "4 FALSE POSITIVE"]:
        L.append(f"| {k} | {bc[k]} |")
    L.append("")
    for k in ["1 PROMOTION READY", "2 NEEDS DESCRIPTION AUTHORING", "3 NEEDS DATA CLEANUP", "4 FALSE POSITIVE"]:
        items = sorted([r for r in rows if r["bucket"] == k], key=lambda x: (x["base"], x["side"]))
        L.append(f"## {k} ({len(items)})\n")
        L.append("| base | side | family | reason |")
        L.append("|---|:--:|---|---|")
        for r in items:
            L.append(f"| `{r['base']}` | {r['side']} | `{r['fam']}` | {r['reason']} |")
        L.append("")
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"QC'd {len(rows)} variants")
    for k in ["1 PROMOTION READY", "2 NEEDS DESCRIPTION AUTHORING", "3 NEEDS DATA CLEANUP", "4 FALSE POSITIVE"]:
        print(f"  {k}: {bc[k]}")
    print(f"wrote {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
