#!/usr/bin/env python3
"""HIGH-confidence base-trick polarity registry (proposal only; read-only).

Includes ONLY bases whose default side is supported DIRECTLY by operational
notation: the first [DEX] in the base's canonical operational_notation carries
an unambiguous SAME or OP marker. No LOW-confidence corpus inference, no
ambiguous (SAME/OP) notation, no doctrine-only fallback.

For each qualifying base:
  base | default polarity | evidence (the notation) | distinct variant | alias variant

Naming convention (slug normalization is frozen; these are descriptive):
  OP-default base X  -> alias = far-X / X-op ;  distinct = X-same-side / X-ss
  SAME-default base X-> alias = X-same-side / X-ss ;  distinct = far-X / X-op
Attested corpus spellings are listed where the corpus actually documents them.

No staging, no authoring, no writes outside this report.
"""
from __future__ import annotations
import csv, re, sqlite3
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CU = REPO / "exploration/phase-e-implementation-2026-05-28/CLASSIFIED_UNIVERSE.csv"
DB = REPO / "database/footbag.db"
OUT = Path(__file__).resolve().parent / "POLARITY_REGISTRY.md"

SIDE_TOKENS = {"ss", "near", "far", "op", "opp", "opposite", "same", "side", "same-side", "opposite-side"}


def slugify(s: str) -> str:
    s = re.sub(r"\((?:ss|op|opp|opposite|near|far|same[ -]side)\)", "", s, flags=re.I)
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def strip_side(slug: str) -> str:
    return "-".join(s for s in slug.split("-") if s not in SIDE_TOKENS)


def positional_side(slug: str) -> str | None:
    segs = set(slug.split("-"))
    if "same-side" in slug or (segs & {"same", "ss", "near"}):
        return "same"
    if (segs & {"far", "op", "opp", "opposite"}):
        return "far"
    return None


def all_dex_sides(notation: str):
    """Side marker for EVERY [DEX] in the notation, in order: each is 'OP',
    'SAME', 'AMBIG', or None (no marker found). For a compound base the relative-
    side qualifier targets the unique off-side dex, which need not be the first,
    so polarity is trustworthy only when every dex agrees."""
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
    """(polarity, evidence) when ALL dexes agree on a side, else (None, reason)."""
    sides = all_dex_sides(notation)
    if not sides:
        return None, "no scored dex in notation"
    uniq = set(sides)
    if uniq == {"OP"}:
        return "OP", f"all {len(sides)} dex marker(s) OP"
    if uniq == {"SAME"}:
        return "SAME", f"all {len(sides)} dex marker(s) SAME"
    return None, f"dex markers not unanimous: {sides}"


def main() -> None:
    cu = list(csv.DictReader(open(CU)))

    # Attested positional spellings per base, by side.
    spell = defaultdict(lambda: {"same": set(), "far": set()})
    for r in cu:
        name = r["name"]
        slug = (r["slug"] or "").strip() or slugify(name)
        side = positional_side(slugify(name)) or positional_side(slug)
        if not side:
            continue
        base = strip_side(slug) or strip_side(slugify(name))
        if base:
            spell[base][side].add(name)

    # Base notation (active tricks).
    notation, active = {}, set()
    if DB.exists():
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
        for slug, op, act in con.execute(
            "SELECT slug, operational_notation, is_active FROM freestyle_tricks"):
            if act == 1:
                active.add(slug)
            if op:
                notation[slug] = op
        con.close()

    # Registry = bases with (a) an UNAMBIGUOUS leading-dex SAME/OP in canonical
    # notation AND (b) at least one attested positional variant in the corpus, so
    # the polarity adjudicates a real alias/distinct question (not every notation-
    # clear trick — only the bases positional naming actually attaches to).
    rows = []
    excluded_mixed = []
    for base in sorted(spell):
        op = notation.get(base)
        if not op:
            continue
        side, frag = base_polarity(op)
        if side not in ("OP", "SAME"):
            excluded_mixed.append((base, frag))
            continue
        same_named = sorted(spell.get(base, {}).get("same", []))
        far_named = sorted(spell.get(base, {}).get("far", []))
        if side == "OP":
            distinct = same_named or [f"{base}-same-side (proposed; not yet attested)"]
            alias = far_named or [f"far-{base} / {base}-op (would be alias of {base})"]
        else:
            distinct = far_named or [f"far-{base} (proposed; not yet attested)"]
            alias = same_named or [f"{base}-same-side / {base}-ss (would be alias of {base})"]
        rows.append(dict(base=base, pol=side, op=op, frag=frag,
                         distinct=distinct, alias=alias,
                         attested=bool(same_named or far_named)))

    rows.sort(key=lambda r: (r["pol"], r["base"]))
    op_n = sum(1 for r in rows if r["pol"] == "OP")
    same_n = sum(1 for r in rows if r["pol"] == "SAME")
    attested_n = sum(1 for r in rows if r["attested"])

    L = []
    L.append("# HIGH-confidence base polarity registry (PROPOSAL, 2026-06-23)\n")
    L.append("Read-only proposal. Inclusion bar: the base's canonical operational_notation "
             "leads with an UNAMBIGUOUS `SAME` or `OP` dexterity marker. No LOW-confidence "
             "corpus inference, no `SAME/OP`-ambiguous notation, no doctrine-only entries.\n")
    L.append("Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/registry.py`\n")
    L.append("Reading the registry:\n")
    L.append("- OP default -> a `far-X` name is an **alias** of X; `X-same-side` is the **distinct** variant.")
    L.append("- SAME default -> a `X-same-side` name is an **alias** of X; `far-X` is the **distinct** variant.")
    L.append("- \"distinct/alias variant\" lists the corpus-attested spelling(s) where they exist; "
             "otherwise the proposed form (slug normalization is frozen, so spellings are descriptive).\n")
    L.append("## Counts\n")
    L.append(f"- HIGH-confidence registry bases (every scored dex agrees on a side): "
             f"**{len(rows)}** (OP {op_n}, SAME {same_n})")
    L.append(f"- All {len(rows)} carry at least one corpus-attested positional spelling.")
    L.append(f"- Held out (positional family exists, but notation dex markers are NOT unanimous, "
             f"so the targeted element's side is not notation-certain): **{len(excluded_mixed)}** "
             f"— these are NOT in the registry and need per-trick adjudication.\n")
    L.append("## Registry\n")
    L.append("| base | default | evidence (leading dex) | distinct variant(s) | alias variant(s) | base active |")
    L.append("|---|:--:|---|---|---|:--:|")
    for r in rows:
        L.append(f"| `{r['base']}` | {r['pol']} | `{r['frag']}` | "
                 f"{'; '.join(r['distinct'])} | {'; '.join(r['alias'])} | {'Y' if r['base'] in active else ''} |")
    L.append("")
    L.append(f"## Held out — non-unanimous dex markers ({len(excluded_mixed)})\n")
    L.append("Positional families whose base notation has dexes on different sides, so the side "
             "qualifier's target (and thus the default polarity) is not determinable from notation "
             "alone. Excluded from the HIGH-confidence registry pending per-trick adjudication.\n")
    L.append("| base | reason |")
    L.append("|---|---|")
    for base, frag in sorted(excluded_mixed):
        L.append(f"| `{base}` | {frag} |")
    L.append("")
    L.append("## Full operational_notation for each registry base (audit trail)\n")
    for r in rows:
        L.append(f"- `{r['base']}` ({r['pol']}): `{r['op']}`")
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"registry bases={len(rows)} (OP={op_n} SAME={same_n}); held_out_mixed={len(excluded_mixed)}")
    print(f"wrote {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
