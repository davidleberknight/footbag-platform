#!/usr/bin/env python3
"""FM <-> Stanford lineage-independence audit. READ-ONLY.

Quantifies overlap structure between the FootbagMoves (FM) corpus and the
Stanford shorthand move list within the symbolic master corpus, to weight
whether FM+Stanford co-occurrence is strong/partial/weak corroboration.

Signals:
  - Jaccard overlap of the two trick sets (by canonical_slug)
  - name-identity rate on shared tricks (identical spelling => shared upstream / derivation;
    divergent naming for same structure => independent observation)
  - the "FM+Stanford ONLY" rare set (attested by these two and nothing else) and its
    name-identity rate (obscure shared tricks with identical names are the strongest
    derivation signal)
"""
import csv, re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "exploration/symbolic-master/comprehensive_symbolic_trick_corpus_2026-05-23.csv"

def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").strip().lower()).strip("-")

FM_SYS = {"fm_inventory", "fm_symbolic_grammar"}
ST_SYS = {"stanford_corpus"}
# real independent source families (for the "what else attests" check)
FAMILY = {"fm_inventory":"FM","fm_symbolic_grammar":"FM","stanford_corpus":"Stanford",
          "fborg_text":"fborg","fborg_insert_staging":"fborg",
          "passback_intake":"PB","passback_source_links":"PB",
          "canonical_db":"(db)","tracked_names_ts":"(derived)","observational_ts":"(derived)"}
DERIVED = {"(db)","(derived)"}

fm_names = defaultdict(set)   # slug -> {source_name}
st_names = defaultdict(set)
slug_families = defaultdict(set)
with MASTER.open(newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        sysn = (r.get("source_system") or "").strip()
        slug = (r.get("canonical_slug") or "").strip()
        nm = (r.get("source_name") or "").strip()
        if not slug: continue
        fam = FAMILY.get(sysn, sysn)
        slug_families[slug].add(fam)
        if sysn in FM_SYS and nm: fm_names[slug].add(nm)
        if sysn in ST_SYS and nm: st_names[slug].add(nm)

fm = set(fm_names); st = set(st_names)
inter = fm & st
union = fm | st
jac = len(inter) / len(union) if union else 0

print(f"FM tricks (distinct slugs):        {len(fm)}")
print(f"Stanford tricks (distinct slugs):  {len(st)}")
print(f"Intersection (FM & Stanford):      {len(inter)}")
print(f"FM-only:                           {len(fm - st)}")
print(f"Stanford-only:                     {len(st - fm)}")
print(f"Jaccard overlap:                   {jac:.2f}")
print(f"Share of Stanford also in FM:      {len(inter)/len(st)*100:.0f}%")
print(f"Share of FM also in Stanford:      {len(inter)/len(fm)*100:.0f}%")

# name-identity on shared tricks
ident = diverge = 0
for slug in inter:
    fns = {slugify(n) for n in fm_names[slug]}
    sns = {slugify(n) for n in st_names[slug]}
    if fns & sns: ident += 1
    else: diverge += 1
print(f"\nShared tricks with IDENTICAL naming:  {ident}/{len(inter)} ({ident/len(inter)*100:.0f}%)")
print(f"Shared tricks with DIVERGENT naming:  {diverge}/{len(inter)} ({diverge/len(inter)*100:.0f}%)")

# rare set: attested ONLY by FM + Stanford (no fborg/PB/db-independent)
rare = [s for s in inter if (slug_families[s] - DERIVED) <= {"FM","Stanford"}]
rare_ident = sum(1 for s in rare if {slugify(n) for n in fm_names[s]} & {slugify(n) for n in st_names[s]})
print(f"\n'FM+Stanford ONLY' rare set (no other independent source): {len(rare)}")
if rare:
    print(f"  of which identical naming: {rare_ident}/{len(rare)} ({rare_ident/len(rare)*100:.0f}%)")
    print("  sample:", ", ".join(sorted(rare)[:15]))
