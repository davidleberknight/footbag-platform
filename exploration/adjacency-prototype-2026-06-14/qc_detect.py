#!/usr/bin/env python3
"""Read-only detector for base_trick / modifier_links defects that break the
adjacency layer (neighbors, ladder rungs, folk-name twins). Emits a worklist.
No writes."""
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parents[2] / "database" / "footbag.db"
GENERIC = {"reverse", "rev", "toe", "clipper", "same", "side", "double", "sole",
           "heel", "head", "knee", "the", "of", "into", "in", "out", "back", "front"}
EXAMPLES = {"mobius", "blur", "torque", "blender", "phoenix", "hatchet", "ripwalk",
            "food-processor", "spinning-ducking-whirl", "spinning-ducking-symposium-whirl"}
BIG_FAMS = {"whirl", "mirage", "legover", "butterfly", "osis", "illusion", "swirl"}


def toks(s):
    return {t for t in (s or "").lower().replace("-", " ").split() if t}


conn = sqlite3.connect(DB)
OPS = {s: (a, r) for s, a, r in conn.execute(
    "SELECT slug, add_bonus, add_bonus_rotational FROM freestyle_trick_modifiers")}
rows = conn.execute("SELECT slug,canonical_name,adds,trick_family,base_trick "
                    "FROM freestyle_tricks WHERE is_active=1").fetchall()
T = {r[0]: {"slug": r[0], "name": r[1] or r[0],
            "adds": int(r[2]) if (r[2] or "").strip().isdigit() else None,
            "fam": r[3] or "", "base": r[4] or "", "links": []} for r in rows}
for s, m in conn.execute("SELECT trick_slug,modifier_slug FROM "
                         "freestyle_trick_modifier_links ORDER BY trick_slug,apply_order"):
    if s in T:
        T[s]["links"].append(m)

flags = []
for r in T.values():
    name_ops = toks(r["name"]) & set(OPS)
    base_ops = toks(r["base"])                      # operators baked into the base
    linked = set(r["links"])
    missing = name_ops - linked - base_ops          # in name, not linked, not in base
    if not missing:
        continue
    base = T.get(r["base"])
    badd = base["adds"] if base else None
    consistent = None
    if badd is not None:
        exp = badd + sum(OPS[o][0] for o in (linked | missing))
        consistent = (exp == r["adds"])
    vis = ("EXAMPLE" if r["slug"] in EXAMPLES else
           "big-family" if r["fam"] in BIG_FAMS else "")
    flags.append((r, sorted(missing), consistent, vis))

# priority: ADD-consistent first (safe), then visibility, then family size
def prio(f):
    r, miss, cons, vis = f
    return (0 if cons else 1, 0 if vis == "EXAMPLE" else 1 if vis else 2, r["name"])
flags.sort(key=prio)

print(f"UNDER-LINKED tricks (name has an operator absent from links and base): {len(flags)}\n")
print(f"{'slug':34s} {'base':16s} {'links':22s} {'+ add':10s} {'cons':4s} {'vis':9s}")
print("-" * 100)
for r, miss, cons, vis in flags:
    print(f"{r['slug']:34s} {r['base']:16s} {','.join(r['links']) or '-':22s} "
          f"{'+'+','.join(miss):10s} {('yes' if cons else 'NO' if cons is False else '?'):4s} {vis:9s}")

# base mis-roots (affect lineage_root / cross-base grouping only)
print("\n\nBASE MIS-ROOT candidates (base points at a landing surface / wrong root):")
SURF = {"clipper-stall", "toe-stall"}
for r in T.values():
    if r["base"] in SURF and r["fam"] not in SURF and "drifter" in r["name"].lower():
        print(f"  {r['slug']:34s} base={r['base']:14s} family={r['fam']}")
