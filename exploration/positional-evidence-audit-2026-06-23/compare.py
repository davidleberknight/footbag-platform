#!/usr/bin/env python3
"""Freeze the 72-base polarity registry, derive the implied alias/distinct
verdicts, and diff them against the live system. Read-only.

Registry (frozen): the 72 bases whose canonical operational_notation has EVERY
scored [DEX] on one side (OP or SAME). For each base:
  default OP  -> far-X is an ALIAS of X ; same-side-X is the DISTINCT variant
  default SAME-> same-side-X is an ALIAS of X ; far-X is the DISTINCT variant

Diff: for every positional form of a registry base that exists in the system
(freestyle_trick_aliases / active freestyle_tricks / any freestyle_tricks row),
compare the system's decision to the registry verdict and count mismatches:
  - DISTINCT form recorded as an ALIAS  -> wrongly collapsed (lost a real trick)
  - ALIAS form recorded as a CANONICAL  -> redundant duplicate of the base

Outputs the frozen registry CSV, the alias/distinct table, and a mismatch report.
No staging, no writes outside this exploration folder.
"""
from __future__ import annotations
import csv, re, sqlite3
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CU = REPO / "exploration/phase-e-implementation-2026-05-28/CLASSIFIED_UNIVERSE.csv"
DB = REPO / "database/footbag.db"
HERE = Path(__file__).resolve().parent
FROZEN = HERE / "polarity_registry_frozen.csv"
OUT = HERE / "ALIAS_DISTINCT_DIFF.md"

SIDE_TOKENS = {"ss", "near", "far", "op", "opp", "opposite", "same", "side", "same-side", "opposite-side"}


def slugify(s: str) -> str:
    s = re.sub(r"\((?:ss|op|opp|opposite|near|far|same[ -]side)\)", "", s, flags=re.I)
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def strip_side(slug: str) -> str:
    return "-".join(s for s in slug.split("-") if s not in SIDE_TOKENS)


def positional_side(slug: str):
    segs = set(slug.split("-"))
    if "same-side" in slug or (segs & {"same", "ss", "near"}):
        return "same"
    if segs & {"far", "op", "opp", "opposite"}:
        return "far"
    return None


def all_dex_sides(notation: str):
    toks = notation.split()
    out = []
    for i, t in enumerate(toks):
        if "[DEX]" in t:
            mark = None
            for j in range(i - 1, max(-1, i - 5), -1):
                if toks[j] in ("SAME/OP", "OP", "SAME"):
                    mark = "AMBIG" if toks[j] == "SAME/OP" else toks[j]
                    break
            out.append(mark)
    return out


def base_polarity(notation: str):
    sides = all_dex_sides(notation)
    if not sides:
        return None, "no scored dex"
    u = set(sides)
    if u == {"OP"}:
        return "OP", f"all {len(sides)} dex OP"
    if u == {"SAME"}:
        return "SAME", f"all {len(sides)} dex SAME"
    return None, f"non-unanimous {sides}"


def main() -> None:
    cu = list(csv.DictReader(open(CU)))

    # attested positional spellings per base (to scope the registry to real families)
    spell = {}
    for r in cu:
        slug = (r["slug"] or "").strip() or slugify(r["name"])
        side = positional_side(slugify(r["name"])) or positional_side(slug)
        if not side:
            continue
        base = strip_side(slug) or strip_side(slugify(r["name"]))
        if base:
            spell.setdefault(base, set()).add(side)

    notation, active, all_slugs = {}, set(), set()
    alias_rows = []  # (alias_slug, canonical)
    db_positional = []  # (slug, is_active)
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    for slug, op, act in con.execute(
            "SELECT slug, operational_notation, is_active FROM freestyle_tricks"):
        all_slugs.add(slug)
        if act == 1:
            active.add(slug)
        if op:
            notation[slug] = op
        if positional_side(slug):
            db_positional.append((slug, act))
    for a, c in con.execute("SELECT alias_slug, trick_slug FROM freestyle_trick_aliases"):
        if a:
            alias_rows.append((a.strip(), (c or "").strip()))
    con.close()

    # ---- FREEZE the 72-base registry ----
    registry = {}
    for base in sorted(spell):
        op = notation.get(base)
        if not op:
            continue
        pol, ev = base_polarity(op)
        if pol in ("OP", "SAME"):
            registry[base] = (pol, ev)

    with FROZEN.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["base", "default_polarity", "alias_side", "distinct_side", "evidence"])
        for base, (pol, ev) in sorted(registry.items()):
            alias_side = "far" if pol == "OP" else "same"
            distinct_side = "same" if pol == "OP" else "far"
            w.writerow([base, pol, alias_side, distinct_side, ev])

    def verdict(base, side):
        pol = registry[base][0]
        alias_side = "far" if pol == "OP" else "same"
        return "ALIAS" if side == alias_side else "DISTINCT"

    # ---- diff system decisions against registry verdicts ----
    mism_distinct_aliased = []   # DISTINCT form recorded as an alias
    mism_alias_canonical = []    # ALIAS form recorded as an active canonical
    correct_alias = []           # ALIAS form correctly an alias
    correct_distinct = []        # DISTINCT form correctly a canonical
    other_alias = []             # alias whose base is in registry, ALIAS verdict (correct) counted above

    # aliases
    for a, c in alias_rows:
        base = strip_side(a)
        side = positional_side(a)
        if base in registry and side:
            v = verdict(base, side)
            if v == "DISTINCT":
                mism_distinct_aliased.append((a, c, base, side, registry[base][0]))
            else:
                correct_alias.append((a, c, base, side))

    # active canonicals
    alias_slug_set = {a for a, _ in alias_rows}
    for slug in sorted(active):
        base = strip_side(slug)
        side = positional_side(slug)
        if base in registry and side and base != slug:
            v = verdict(base, side)
            if v == "ALIAS":
                mism_alias_canonical.append((slug, base, side, registry[base][0]))
            else:
                correct_distinct.append((slug, base, side))

    # current positional rows in the DB that are NOT yet decided (not active, not alias)
    undecided = []
    for slug, act in db_positional:
        base = strip_side(slug)
        side = positional_side(slug)
        if base in registry and side and act != 1 and slug not in alias_slug_set:
            undecided.append((slug, base, side, verdict(base, side)))

    op_n = sum(1 for b, (p, _) in registry.items() if p == "OP")
    same_n = len(registry) - op_n

    L = []
    L.append("# Implied alias/distinct verdicts vs the live system (2026-06-23)\n")
    L.append("Read-only. The 72-base polarity registry is FROZEN to "
             "`polarity_registry_frozen.csv`. Verdicts: for a base of default OP, `far-X` is an "
             "ALIAS and `X-same-side` is DISTINCT; for default SAME, the reverse.\n")
    L.append("Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/compare.py`\n")
    L.append("## Frozen registry counts\n")
    L.append(f"- Bases: **{len(registry)}** (OP {op_n}, SAME {same_n}). Frozen CSV: `polarity_registry_frozen.csv`.\n")
    L.append("## Mismatch counts (system decision != registry verdict)\n")
    L.append("| mismatch | meaning | count |")
    L.append("|---|---|---:|")
    L.append(f"| DISTINCT-as-ALIAS | a distinct variant was collapsed into an alias (lost trick) | **{len(mism_distinct_aliased)}** |")
    L.append(f"| ALIAS-as-CANONICAL | a redundant default-side form exists as its own active canonical | **{len(mism_alias_canonical)}** |")
    L.append("")
    L.append("## Agreement counts (system already matches the registry)\n")
    L.append(f"- ALIAS form correctly recorded as an alias: **{len(correct_alias)}**")
    L.append(f"- DISTINCT form correctly an active canonical: **{len(correct_distinct)}**")
    L.append(f"- Registry-covered positional rows present but undecided (not active, not alias): **{len(undecided)}**\n")
    L.append("## MISMATCH 1 — DISTINCT variant wrongly recorded as an alias\n")
    if mism_distinct_aliased:
        L.append("| alias_slug | collapsed to | base | asserts | base default |")
        L.append("|---|---|---|:--:|:--:|")
        for a, c, base, side, pol in sorted(mism_distinct_aliased):
            L.append(f"| `{a}` | `{c}` | `{base}` | {side} | {pol} |")
    else:
        L.append("_none_")
    L.append("")
    L.append("## MISMATCH 2 — ALIAS form wrongly an active canonical\n")
    if mism_alias_canonical:
        L.append("| canonical slug | base | asserts | base default |")
        L.append("|---|---|:--:|:--:|")
        for slug, base, side, pol in sorted(mism_alias_canonical):
            L.append(f"| `{slug}` | `{base}` | {side} | {pol} |")
    else:
        L.append("_none_")
    L.append("")
    L.append("## Implied alias/distinct table (frozen registry, all 72)\n")
    L.append("| base | default | alias forms | distinct forms | evidence |")
    L.append("|---|:--:|---|---|---|")
    for base, (pol, ev) in sorted(registry.items()):
        if pol == "OP":
            af, df = f"far-{base} / {base}-op", f"{base}-same-side / {base}-ss"
        else:
            af, df = f"{base}-same-side / {base}-ss", f"far-{base} / {base}-op"
        L.append(f"| `{base}` | {pol} | {af} -> alias of {base} | {df} -> distinct | {ev} |")
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")

    print(f"registry frozen: {len(registry)} bases (OP={op_n} SAME={same_n}) -> {FROZEN.name}")
    print(f"MISMATCH distinct-as-alias={len(mism_distinct_aliased)}  alias-as-canonical={len(mism_alias_canonical)}")
    print(f"agree: alias-correct={len(correct_alias)} distinct-correct={len(correct_distinct)} undecided={len(undecided)}")
    print(f"wrote {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
