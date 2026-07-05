#!/usr/bin/env python3
"""Before/after demo for the Tier 1+2 batch (17 modifier-link corrections) under
the multiset opset model. Read-only on the live DB: the 'after' state is a temp
copy with the 17 link-sets applied exactly as loader 19 would (parse the edited
red_additions modifier_links pipe-list, enumerate apply_order). No live writes."""
import csv
import importlib.util
import shutil
import sqlite3
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LIVE = ROOT / "database" / "footbag.db"
RED = ROOT / "legacy_data" / "inputs" / "curated" / "tricks" / "red_additions_2026_04_20.csv"

_spec = importlib.util.spec_from_file_location("proto", HERE / "prototype.py")
P = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(P)

BATCH = {
    "inspinning-mirage", "inspinning-osis", "inspinning-butterfly",
    "inspinning-legover", "inspinning-illusion", "inspinning-paradox-mirage",
    "inspinning-paradox-illusion", "inspinning-symposium-mirage",
    "atomic-inspinning-butterfly", "symposium-reverse-whirl", "inspinning-flail",
    "paradox-da-da-curve", "double-spinning-whirl", "double-spinning-mirage",
    "double-spinning-osis", "double-spinning-butterfly", "double-spinning-clipper",
}


def build_after():
    tmp = Path(tempfile.mkdtemp()) / "after.db"
    shutil.copy(LIVE, tmp)
    con = sqlite3.connect(tmp)
    applied = 0
    with open(RED, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            slug = (row["canonical_name"] or "").strip()
            if slug not in BATCH:
                continue
            mods = [m.strip() for m in (row["modifier_links"] or "").split("|") if m.strip()]
            con.execute("DELETE FROM freestyle_trick_modifier_links WHERE trick_slug=?", (slug,))
            for i, m in enumerate(mods, start=1):       # mirror loader 19
                con.execute("INSERT INTO freestyle_trick_modifier_links"
                            "(trick_slug,modifier_slug,apply_order) VALUES(?,?,?)", (slug, m, i))
            applied += 1
    con.commit()
    return tmp, applied


def line(T, slug):
    nb = P.neighbors(T, slug)
    parts = []
    for k in ["base_of", "siblings", "extensions", "operator_kin", "twins"]:
        if nb[k]:
            g = " · ".join(" ≡ ".join(P.display(T, s) for s in grp) for grp in nb[k][:4])
            parts.append(f"{k}: {g}")
    rung = P.msize(T[slug]["opset"])
    return f"rung {rung} | " + "  ||  ".join(parts) if parts else f"rung {rung} | (no neighbors)"


after_db, n = build_after()
before = P.load(sqlite3.connect(LIVE))
after = P.load(sqlite3.connect(after_db))
print(f"applied {n}/17 batch link-sets to the temp DB\n")

for slug in ["double-spinning-whirl", "inspinning-mirage", "mobius"]:
    print(f"=== {slug} ===")
    print(f"  BEFORE  {line(before, slug)}")
    print(f"  AFTER   {line(after, slug)}")
    print()

print("=== whirl ladder — rung 0/1/2 BEFORE vs AFTER (double-spinning-whirl moves) ===")
for tag, T in [("BEFORE", before), ("AFTER", after)]:
    rungs = P.ladder(T, "whirl")
    dsw_rung = next((n for n in rungs for g in rungs[n] if "double-spinning-whirl" in g), None)
    print(f"  {tag}: double-spinning-whirl at rung {dsw_rung}; "
          f"rung-2 size {len(rungs.get(2, []))}")

print("\n=== FALSE-TWIN / COLLAPSE CHECK (after state) ===")
# 1. no empty-opset twin collapse anywhere
bad_empty = []
for s, r in after.items():
    for grp in P.dedupe_struct(after, [u for u in after if after[u]["base"] == r["base"]]):
        if len(grp) > 1 and not after[grp[0]]["opset"]:
            bad_empty.append(grp)
print(f"  empty-opset groups collapsed as twins: {len(bad_empty)} (expect 0)")
# 2. double-spinning-whirl must NOT be a twin/sibling of spinning-whirl, must be its extension
nb = P.neighbors(after, "double-spinning-whirl")
flat = lambda key: {s for grp in nb[key] for s in grp}
print(f"  double-spinning-whirl twins:    {sorted(flat('twins')) or '(none)'}  (expect none)")
print(f"  double-spinning-whirl built_on: {sorted(flat('base_of'))}  (expect spinning-whirl)")
print(f"  spinning-whirl in its twins?    {'spinning-whirl' in flat('twins')}  (expect False)")
# 3. torque/blender still not twins (the original conflation trap)
tb = P.neighbors(after, "torque")
print(f"  torque twins contain blender?   {'blender' in {s for g in tb['twins'] for s in g}}  (expect False)")
