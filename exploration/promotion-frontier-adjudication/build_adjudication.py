#!/usr/bin/env python3
"""Promotion Frontier Adjudication — enumerate the exact blocker for every
candidate outside the published dictionary (layer=frontier in the
observational universe), classified into 6 blocker categories with the
precise missing item, the formula question (missing-formula), and the
doctrine question (doctrine-blocked). Checks each candidate's slug against
the published set so equivalence-duplicates are not mislabeled author-ready.

Read-only. Writes ADJUDICATION.md next to this script.
"""
from __future__ import annotations
import json, re, sqlite3, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UNI = ROOT / "src/content/freestyleObservationalUniverse.ts"
DB = ROOT / "database/footbag.db"
OUT = Path(__file__).resolve().parent / "ADJUDICATION.md"

# Operators settled since the universe snapshot (so a "blocked" flag is stale).
RESOLVED_OPERATORS = {"illusioning"}  # = rev(0) miraging, +1 (2026-05-29 ruling)

src = UNI.read_text()
rows = []
for m in re.finditer(r'\{"name":.*?\},?\s*$', src, re.M):
    try: rows.append(json.loads(m.group(0).rstrip(',')))
    except Exception: pass
frontier = [r for r in rows if r.get("layer") == "frontier"]

# doctrine questions
dq = {}
mq = re.search(r'DOCTRINE_BLOCKING_QUESTIONS[^{]*\{(.*?)\};', src, re.S)
if mq:
    for k, v in re.findall(r'"([^"]+)":\s*"([^"]+)"', mq.group(1)):
        dq[k] = v

# published set
pub = {}
if DB.exists():
    con = sqlite3.connect(str(DB))
    for slug, adds, opn in con.execute(
        "SELECT slug, adds, operational_notation FROM freestyle_tricks WHERE is_active=1"):
        pub[slug] = (adds, opn)
    con.close()

FORMULA_FC = {"unknown-modifier-token", "ambiguous-terminal-mechanic",
              "unresolved-directional-syntax", "parser-ambiguity", "compression-ambiguity"}

def lead_token(name): return (name.split() or [""])[0]

def doctrine_key(r):
    """Return a SPECIFIC contested-policy key, or None. Undefined-operator gaps
    are NOT doctrine-blocked — they are missing-formula (define the operator)."""
    hay = (r.get("name", "") + " " + r.get("ecosystem", "") + " " + r.get("slug", "")).lower()
    for k in ("blurry", "pogo", "weaving", "shooting"):
        if k in hay: return k
    if any(t in hay for t in ("double-down", "double over", "over-down", "down-double",
                              "double-over-down", " dod", " ddd")):
        return "dod-ddd"
    return None

def formula_question(r):
    fc = r.get("failureClass", ""); name = r.get("name", ""); tok = lead_token(name)
    if fc == "unknown-modifier-token":
        return f"Define the operator **{tok}** (ADD weight + notation): it opens \"{name}\" but is not a settled modifier."
    if fc == "ambiguous-terminal-mechanic":
        return f"Which terminal/landing does \"{name}\" resolve to, and how does that terminal score?"
    if fc == "unresolved-directional-syntax":
        return f"Resolve the directional reading (same/op, in/out) in \"{name}\"."
    if fc == "compression-ambiguity":
        return f"Is \"{name}\" the compressed canonical reading, or does it expand to a longer chain? (which depth is canonical?)"
    if fc == "parser-ambiguity":
        return f"Resolve the competing parser readings of \"{name}\"."
    return f"Provide the decomposition/notation for \"{name}\" (currently none)."

def classify(r):
    slug = r.get("slug", ""); add = r.get("provisionalAdd", ""); dec = r.get("decomposition", "")
    fc = r.get("failureClass", ""); dc = r.get("doctrineConfidence", ""); bucket = r.get("intakeBucket", "")
    fam = r.get("parentFamily", ""); name = r.get("name", "")
    tok = lead_token(name).lower()

    # 0. already published / equivalence to published
    if slug in pub:
        return ("4 Missing classification", "alias/equivalence unresolved",
                f"Already an active dictionary row (`{slug}`) — stale frontier flag; reconcile/drop.")
    if tok in RESOLVED_OPERATORS:
        return ("4 Missing classification", "alias/equivalence unresolved",
                f"Operator **{tok}** is now resolved; verify whether \"{name}\" is an equivalence/alias of an "
                f"already-published trick (cf. illusioning legover = eggbeater) before any promotion.")

    # 5. doctrine blocked — ONLY a specific contested policy / open ruling
    k = doctrine_key(r)
    if k:
        return ("5 Doctrine blocked", f"depends on the {k} ruling", dq.get(k, dq.get("other", "")))
    if "+2 rot" in dec.lower() or "(+2 rot" in dec.lower():
        return ("5 Doctrine blocked", "depends on the atomic-rotational (atomic-Q3) ruling, held",
                "ADD uses the +2-rotational atomic/quantum value, which Red superseded (atomic/quantum = +1) "
                "but is held pending the atomic-Q3 greenlight; the ADD is not final.")
    if dc == "policy-dependent":
        return ("5 Doctrine blocked", "depends on an unresolved scoring policy", dq.get("other", ""))

    # 1. promotion-ready -> missing authoring (no doctrine work remains)
    if bucket == "promotion_ready" and add and dec and dc == "stable":
        return ("1 Missing authoring", "needs description / movement intuition / relationships / media",
                "ADD, notation, and structure are settled — **no doctrine work remains**; needs editorial authoring only.")

    # 2. missing formula — undefined operator / no decomposition (a curation gap, not a policy)
    if not dec or fc in FORMULA_FC:
        return ("2 Missing formula", "notation incomplete / decomposition unresolved", formula_question(r))

    # 3. missing ADD — structure present, ADD not assigned
    if not add:
        return ("3 Missing ADD", "ADD not assigned",
                "Structure is present but no ADD is assigned; ADD derives from the bracket count once confirmed.")

    # 4. missing classification — family unresolved
    if not fam:
        return ("4 Missing classification", "family unresolved",
                f"ADD and notation present but no family/base assignment for \"{name}\".")

    return ("6 Other", "uncategorized", f"Bucket={bucket}, fc={fc or 'none'} — needs manual triage.")

# classify all
groups = collections.OrderedDict((c, []) for c in
    ["1 Missing authoring", "2 Missing formula", "3 Missing ADD",
     "4 Missing classification", "5 Doctrine blocked", "6 Other"])
for r in frontier:
    cat, sub, detail = classify(r)
    groups[cat].append((r, sub, detail))

# write artifact
def fmt(r):
    return (r.get("name", ""), r.get("provisionalAdd", "") or "—",
            r.get("decomposition", "") or r.get("semanticJob", "") or "—",
            r.get("parentFamily", "") or "—", r.get("source", "") or "—")

lines = ["# Promotion Frontier Adjudication\n",
         f"Scope: **{len(frontier)} candidates** with `layer=frontier` in the observational universe "
         "(the promotable set). The ~1,163 archive rows — folk-name opacity and aliases — are not "
         "one-by-one promotion candidates and are excluded.\n",
         "Each candidate shows: name | ADD | notation/decomposition | family | source, then the exact "
         "missing item. Missing-formula rows carry the formula question; doctrine-blocked rows carry the "
         "doctrine question; missing-authoring rows have **no doctrine work remaining**.\n",
         "Counts by blocker:\n"]
for c, items in groups.items():
    lines.append(f"- **{c}**: {len(items)}")
lines.append("")

# Doctrine-blocked rollup: which ruling unblocks how many (the actionable view).
dblock = collections.Counter(detail for r, sub, detail in groups["5 Doctrine blocked"])
lines.append("**Doctrine-blocked rollup** — the 5-category-5 rows collapse to a handful of rulings; "
             "resolving each unblocks the listed count:\n")
for detail, n in dblock.most_common():
    lines.append(f"- **{n}** &mdash; {detail}")
lines.append("")

for c, items in groups.items():
    if not items: continue
    lines.append(f"\n## {c}  ({len(items)})\n")
    if c.startswith("1"):
        lines.append("_No doctrine work remains for any row below — editorial authoring only._\n")
    lines.append("| Trick | ADD | Notation / decomposition | Family | Source | Exact missing item |")
    lines.append("|---|---|---|---|---|---|")
    for r, sub, detail in sorted(items, key=lambda x: x[0].get("name", "")):
        name, add, dec, fam, srcv = fmt(r)
        lines.append(f"| {name} | {add} | {dec} | {fam} | {srcv} | {detail} |")

OUT.write_text("\n".join(lines) + "\n")
print(f"frontier candidates: {len(frontier)}")
for c, items in groups.items():
    print(f"  {c}: {len(items)}")
print(f"\nwrote {OUT}")
