#!/usr/bin/env python3
"""Adjacency-layer prototype (read-only) for the freestyle dictionary.

Computes, from already-populated columns only (base_trick + the
freestyle_trick_modifier_links join), the three adjacency artifacts:

  1. structural-neighbors block for a trick detail page
  2. ladder ordering within a family / sub-lineage
  3. the +/-1-operator relation that both rest on

No DB writes. No fabricated structure: cross-named equivalences
(e.g. symposium-mobius == big apple) are NOT auto-asserted, because naive
operator expansion would also conflate genuinely distinct named compounds
(torque vs blender both reduce to osis + {}). Only exact same-(base,ops)
duplicates are surfaced automatically.

Usage:
    python exploration/adjacency-prototype-2026-06-14/prototype.py
"""
import sqlite3
from collections import Counter
from pathlib import Path

DB = Path(__file__).resolve().parents[2] / "database" / "footbag.db"

# Canonical operator display/sort order (mirrors the existing component view
# priority so ladders read in a familiar order). Operators not listed sort after,
# alphabetically.
OPERATOR_ORDER = [
    "paradox", "symposium", "spinning", "inspinning", "ducking", "diving",
    "weaving", "gyro", "swirling", "whirling", "stepping", "tapping",
    "pixie", "fairy", "atomic", "quantum", "nuclear", "barraging", "furious",
    "blurry", "blazing", "miraging", "illusioning", "shooting",
]
OP_RANK = {op: i for i, op in enumerate(OPERATOR_ORDER)}

# Generic name tokens that never count as "unexplained" when deciding folk-ness.
GENERIC_TOKENS = {
    "reverse", "rev", "toe", "clipper", "same", "side", "the", "of", "and",
    "into", "out", "in", "double", "sole", "heel", "head", "knee",
}


def load(conn):
    rows = conn.execute(
        "SELECT slug, canonical_name, adds, trick_family, base_trick "
        "FROM freestyle_tricks WHERE is_active=1"
    ).fetchall()
    T = {}
    for slug, name, adds, fam, base in rows:
        T[slug] = {
            "slug": slug, "name": name or slug,
            "adds": int(adds) if (adds or "").strip().isdigit() else None,
            "family": fam or "", "base": base or "",
            "ops": [],
        }
    for slug, mod in conn.execute(
        "SELECT trick_slug, modifier_slug FROM freestyle_trick_modifier_links "
        "ORDER BY trick_slug, apply_order"
    ).fetchall():
        if slug in T:
            T[slug]["ops"].append(mod)
    # Operators are a MULTISET: a repeated operator (e.g. double-spinning =
    # spinning x2) is two instances, so multiplicity must be preserved. opset is
    # a Counter; ops is the ordered list WITH repeats for display.
    for r in T.values():
        r["opset"] = Counter(r["ops"])                       # multiset
        r["ops"] = sorted(r["ops"], key=lambda o: (OP_RANK.get(o, 99), o))
    return T


def msize(c):
    return sum(c.values())


def is_submset(a, b):
    """True if multiset a is contained in multiset b."""
    return not (a - b)


def struct_key(r):
    """Stable structural identity: (base, sorted multiset) when ops exist; else
    keyed on the slug, because with NO operators the NAME is load-bearing and
    distinct names (torque vs blender) must not collapse."""
    if r["opset"]:
        return (r["base"], tuple(sorted(r["opset"].items())))
    return ("__name__", r["slug"])


def lineage_root(T, slug):
    seen, cur = set(), slug
    while cur and cur not in seen:
        seen.add(cur)
        b = T.get(cur, {}).get("base", "")
        if not b or b == cur or b not in T:
            return cur
        cur = b
    return cur


def structural_label(r):
    """base + operators, e.g. 'torque + gyro'. Empty ops -> just the base."""
    base = r["base"] or r["slug"]
    if r["ops"]:
        return f"{base} + " + " + ".join(r["ops"])
    return base


def is_folk(r):
    """A name is folk if a name token is not explained by its base or operators.
    Compositional names ('spinning whirl') are NOT folk; 'mobius' / 'food
    processor' are."""
    name_tokens = {t for t in r["name"].lower().replace("-", " ").split()}
    explained = set(GENERIC_TOKENS)
    explained |= set(r["ops"])
    explained |= set((r["base"] or "").lower().replace("-", " ").split())
    explained |= set(r["slug"].lower().replace("-", " ").split())
    return not name_tokens.issubset(explained)


def display(T, slug, gloss=True):
    r = T[slug]
    add = f"({r['adds']})" if r["adds"] is not None else ""
    label = f"{r['name']}{add}"
    if gloss and is_folk(r):
        label += f"  [= {structural_label(r)}]"
    return label


# ── the +/-1 operator relation ────────────────────────────────────────────────
# Rules locked from the v1 prototype output:
#  R1 base_of: remove exactly one operator -> match the EXACT reduced opset on the
#     same base. If the reduction empties the opset, the parent is the single
#     named anchor (the trick whose slug == base_trick), never "any 0-op sibling".
#  R2 twins (safe equivalence): same base AND same opset, but ONLY when the opset
#     is NON-EMPTY. With an empty opset the NAME is load-bearing (torque vs blender
#     both reduce to osis+{} yet are different moves), so empty-opset matches are
#     NOT asserted as equivalent. Cross-base equivalence stays curated, never derived.
#  R3 extensions: an exact +1 superset on the same base, or a named child whose
#     base == this trick and which adds >=1 operator.
def neighbors(T, slug):
    r = T[slug]
    b, S = r["base"], r["opset"]
    root = lineage_root(T, slug)
    same_base = [u for u in T.values() if u["base"] == b and u["slug"] != slug]

    n = msize(S)
    base_of, siblings, extensions = [], [], []
    if n:
        for u in same_base:
            m = msize(u["opset"])
            if m == n and msize(S - u["opset"]) == 1 and msize(u["opset"] - S) == 1:
                siblings.append(u["slug"])               # swap one instance
            elif n - m == 1 and is_submset(u["opset"], S) and u["opset"]:
                base_of.append(u["slug"])                # -1 instance, still non-empty
            elif m - n == 1 and is_submset(S, u["opset"]):
                extensions.append(u["slug"])             # +1 instance, same base
        # if removing the single remaining instance empties the multiset, the
        # parent is ONLY the named anchor (slug == base)
        if n == 1 and b in T and b != slug:
            base_of.append(b)
    else:
        if b in T and b != slug:
            base_of.append(b)                            # the named base trick
        siblings += [u["slug"] for u in same_base
                     if not u["opset"] and u["slug"] != b]
    # named children: base == this trick, adding >=1 operator instance
    for u in T.values():
        if u["base"] == slug and u["opset"]:
            extensions.append(u["slug"])

    operator_kin = [
        u["slug"] for u in T.values()
        if u["slug"] != slug and u["opset"] == S and S
        and u["base"] != b and lineage_root(T, u["slug"]) == root
    ]
    twins = [                                            # same base + same multiset, non-empty
        u["slug"] for u in T.values()
        if u["slug"] != slug and u["base"] == b and u["opset"] == S and S
    ]
    return {k: dedupe_struct(T, v) for k, v in dict(
        base_of=base_of, siblings=siblings, extensions=extensions,
        operator_kin=operator_kin, twins=twins).items()}


def dedupe_struct(T, slugs):
    """Collapse structurally identical entries (same struct_key) into one group,
    joined by ≡, ordered by ADD then name. struct_key is multiset-aware and never
    merges two distinct 0-operator named compounds."""
    groups = {}
    for s in set(slugs):
        groups.setdefault(struct_key(T[s]), []).append(s)
    out = []
    for members in groups.values():
        members.sort(key=lambda s: (T[s]["adds"] or 99, T[s]["name"]))
        out.append(members)
    out.sort(key=lambda g: (T[g[0]]["adds"] or 99, T[g[0]]["name"]))
    return out


# ── ladder ordering within a sub-lineage ──────────────────────────────────────
def ladder(T, base):
    """A ladder is keyed on a sub-lineage (a base_trick), not a family: the anchor
    is the trick whose slug == base (even if its own family differs), then its
    base==base children by rung. Rung = total operator count WITH multiplicity
    (double-spinning = rung 2); within a rung, order by operator priority, then
    ADD, then name. Structurally identical entries merge."""
    members = [r for r in T.values() if r["base"] == base and r["slug"] != base]
    rungs = {}
    if base in T:
        rungs.setdefault(0, []).append([base])           # anchor (listed once)
    for grp in dedupe_struct(T, [r["slug"] for r in members]):
        rungs.setdefault(msize(T[grp[0]]["opset"]), []).append(grp)
    for n in rungs:
        rungs[n].sort(key=lambda g: (
            tuple(OP_RANK.get(o, 99) for o in T[g[0]]["ops"]),
            T[g[0]]["adds"] or 99, T[g[0]]["name"]))
    return rungs


# ── demonstrations ────────────────────────────────────────────────────────────
def find(T, q):
    q = q.lower()
    for s, r in T.items():
        if r["name"].lower() == q or s == q.replace(" ", "-"):
            return s
    return None


def show_group(T, g):
    """A structural group -> 'name [= gloss]' joined by ≡ when it has aliases."""
    return " ≡ ".join(display(T, s) for s in g)


def demo_neighbors(T, q):
    s = find(T, q)
    print(f"\n{'='*72}\nSTRUCTURAL NEIGHBORS — {display(T, s)}\n{'='*72}")
    nb = neighbors(T, s)
    labels = {
        "base_of": "Built on (-1 operator)",
        "siblings": "Siblings (swap one operator)",
        "extensions": "Extensions (+1 operator)",
        "operator_kin": "Same operator, other base",
        "twins": "Structural twins (same base+ops)",
    }
    for k in ["base_of", "siblings", "extensions", "operator_kin", "twins"]:
        groups = nb[k]
        if not groups:
            continue
        shown = groups[:6]
        more = f"   (+{len(groups)-6} more)" if len(groups) > 6 else ""
        print(f"  {labels[k]:32s}: " + "  ·  ".join(show_group(T, g) for g in shown) + more)


def demo_ladder(T, base):
    print(f"\n{'='*72}\nLADDER — sub-lineage '{base}'\n{'='*72}")
    rungs = ladder(T, base)
    for n in sorted(rungs):
        tag = "anchor" if n == 0 else f"{n} operator(s)"
        print(f"  -- rung {n} ({tag}) --")
        for g in rungs[n]:
            print(f"     {show_group(T, g)}")


if __name__ == "__main__":
    conn = sqlite3.connect(DB)
    T = load(conn)
    print(f"loaded {len(T)} active tricks")
    for q in ["mobius", "blur", "torque", "spinning-ducking-whirl", "hatchet"]:
        demo_neighbors(T, q)
    for base in ["torque", "whirl"]:
        demo_ladder(T, base)
