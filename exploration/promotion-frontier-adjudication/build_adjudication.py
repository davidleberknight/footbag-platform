#!/usr/bin/env python3
"""Promotion Frontier Adjudication — enumerate the exact blocker for every
candidate outside the published dictionary (layer=frontier in the
observational universe), classified into the derivability buckets with the
precise missing item, the formula question (missing-formula), and the
doctrine question (awaiting-ruling). Checks each candidate's slug AND name
against the published set + its aliases so equivalence-duplicates and
already-aliased names are not mislabeled author-ready.

Buckets:
  Derivable / Backfill Needed   resolved operators + exemplar; author only
  Derivable but ADD-Provisional notation writable now; ADD may move on a ruling
  Missing formula / Missing ADD / Missing classification   curation gaps
  Awaiting Ruling               a genuine contested-policy / open ruling

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
RESOLVED_OPERATORS = {"illusioning"}  # = rev(0) miraging, +1 (curator-ruled)

# Static index of drafted curator packets, so the rollup stays a complete
# picture of open governance work even though the arguments live in the packet.
PACKET_POINTER = [
    "## Active curator packets\n",
    "Drafted rulings awaiting Red, indexed here so this rollup stays a complete "
    "picture of open governance work. Arguments live in the packet, not here.\n",
    "**Blazing / Terraging notation packet** — "
    "`exploration/curator-packet-blazing-terraging-notation/PACKET.md`",
    "- Scope: blazing operator status (+1 confirmation vs distinct operator) and "
    "terraging +3 notation layout.",
    "- Impact: 11 held op_notation backfills (8 blazing, 3 terraging) on already-"
    "published rows; tracked in the separate op_notation-backfill workstream, not "
    "in this frontier doc. ADD changes only if blazing is ruled distinct.\n",
]

DERIVABLE = "Derivable / Backfill Needed"
ADD_PROVISIONAL = "Derivable but ADD-Provisional"
MISSING_FORMULA = "Missing formula"
MISSING_ADD = "Missing ADD"
MISSING_CLASS = "Missing classification"
AWAITING = "Awaiting Ruling"
OTHER = "Other"

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

# published set + alias index. A frontier NAME that is already an alias of a
# published row is resolved (wired to its base), not a promotion candidate.
pub = {}
published_aliases = set()
if DB.exists():
    con = sqlite3.connect(str(DB))
    for slug, adds, opn, aliases in con.execute(
        "SELECT slug, adds, operational_notation, aliases_json FROM freestyle_tricks WHERE is_active=1"):
        pub[slug] = (adds, opn)
        if aliases:
            try:
                for a in json.loads(aliases):
                    published_aliases.add(str(a).strip().lower())
            except Exception:
                pass
    con.close()

FORMULA_FC = {"unknown-modifier-token", "ambiguous-terminal-mechanic",
              "unresolved-directional-syntax", "parser-ambiguity", "compression-ambiguity"}

def lead_token(name): return (name.split() or [""])[0]

def doctrine_key(r):
    """Return a SPECIFIC contested-policy key, or None. Undefined-operator gaps
    are NOT awaiting-ruling — they are missing-formula (define the operator)."""
    hay = (r.get("name", "") + " " + r.get("ecosystem", "") + " " + r.get("slug", "")).lower()
    for k in ("blurry", "pogo", "weaving", "shooting"):
        if k in hay: return k
    if any(t in hay for t in ("double-down", "double over", "over-down", "down-double",
                              "double-over-down", " dod", " ddd")):
        return "dod-ddd"
    return None

def repeated_operator(r):
    """A modifier token applied twice within one chain (e.g. miraging ... miraging)
    has no published or derived precedent and is held until a same-operator-twice
    ruling exists. The operator tokens are the names in the decomposition."""
    toks = re.findall(r'([a-z][a-z-]+)\(', r.get("decomposition", "").lower())
    seen = set()
    for t in toks:
        if t in seen:
            return t
        seen.add(t)
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
        return (MISSING_CLASS, "alias/equivalence unresolved",
                f"Already an active dictionary row (`{slug}`) — stale frontier flag; reconcile/drop.")
    if tok in RESOLVED_OPERATORS:
        return (MISSING_CLASS, "alias/equivalence unresolved",
                f"Operator **{tok}** is now resolved; verify whether \"{name}\" is an equivalence/alias of an "
                f"already-published trick (cf. illusioning legover = eggbeater) before any promotion.")

    # 1. awaiting ruling — a specific contested policy / open ruling
    k = doctrine_key(r)
    if k:
        return (AWAITING, f"depends on the {k} ruling", dq.get(k, dq.get("other", "")))

    # 2. derivable but ADD-provisional — atomic rotational value sits in the held
    #    atomic-Q3 migration; the structure is settled, only the value may move.
    if "+2 rot" in dec.lower():
        return (ADD_PROVISIONAL, "atomic-rotational ADD held (atomic-Q3)",
                "Notation derivable now (resolved atomic chassis + settled base). ADD provisional: "
                "the atomic rotational value (+2) sits in the held atomic-Q3 migration and may drop to +1.")

    if dc == "policy-dependent":
        return (AWAITING, "depends on an unresolved scoring policy", dq.get("other", ""))

    # 3. same-operator-twice — held, no precedent (overrides a promotion-ready flag)
    rep = repeated_operator(r)
    if rep:
        return (AWAITING, "same-operator-twice (no precedent)",
                f"Repeats the **{rep}** operator within one chain; no published or derived precedent for a "
                f"same-operator-twice reading. Held pending a ruling.")

    # 4. promotion-ready -> derivable / backfill needed (no doctrine work remains)
    if bucket == "promotion_ready" and add and dec and dc == "stable":
        return (DERIVABLE, "needs description / movement intuition / relationships / media",
                "ADD, notation, and structure are settled — **no doctrine work remains**; needs editorial authoring only.")

    # 5. missing formula — undefined operator / no decomposition (a curation gap, not a policy)
    if not dec or fc in FORMULA_FC:
        return (MISSING_FORMULA, "notation incomplete / decomposition unresolved", formula_question(r))

    # 6. missing ADD — structure present, ADD not assigned
    if not add:
        return (MISSING_ADD, "ADD not assigned",
                "Structure is present but no ADD is assigned; ADD derives from the bracket count once confirmed.")

    # 7. missing classification — family unresolved
    if not fam:
        return (MISSING_CLASS, "family unresolved",
                f"ADD and notation present but no family/base assignment for \"{name}\".")

    return (OTHER, "uncategorized", f"Bucket={bucket}, fc={fc or 'none'} — needs manual triage.")

# classify all; drop names already wired as aliases of a published row.
groups = collections.OrderedDict((c, []) for c in
    [DERIVABLE, ADD_PROVISIONAL, MISSING_FORMULA, MISSING_ADD, MISSING_CLASS, AWAITING, OTHER])
dropped_aliases = []
for r in frontier:
    nm = r.get("name", "").strip().lower()
    if nm in published_aliases and r.get("slug", "") not in pub:
        dropped_aliases.append(r.get("name", ""))
        continue
    cat, sub, detail = classify(r)
    groups[cat].append((r, sub, detail))

# write artifact
def fmt(r):
    return (r.get("name", ""), r.get("provisionalAdd", "") or "—",
            r.get("decomposition", "") or r.get("semanticJob", "") or "—",
            r.get("parentFamily", "") or "—", r.get("source", "") or "—")

classified = sum(len(v) for v in groups.values())
lines = ["# Promotion Frontier Adjudication\n",
         f"Scope: **{len(frontier)} candidates** with `layer=frontier` in the observational universe "
         "(the promotable set). The ~1,163 archive rows — folk-name opacity and aliases — are not "
         "one-by-one promotion candidates and are excluded.\n",
         "Each candidate shows: name | ADD | notation/decomposition | family | source, then the exact "
         "missing item. **Awaiting Ruling** rows carry a genuine doctrine question; **Derivable / Backfill "
         "Needed** rows have no doctrine work remaining (resolved operators + a published exemplar to "
         "mirror); **Derivable but ADD-Provisional** rows can be notated now but their ADD may move on a "
         "pending ruling; **Missing formula** rows still need a decomposition.\n",
         "Counts by bucket:\n"]
for c, items in groups.items():
    lines.append(f"- **{c}**: {len(items)}")
if dropped_aliases:
    lines.append(f"- _dropped (already wired as aliases of a published row): {len(dropped_aliases)} "
                 f"— {', '.join(sorted(dropped_aliases))}_")
lines.append("")

# Awaiting-Ruling rollup: which ruling unblocks how many (the actionable view).
dblock = collections.Counter(detail for r, sub, detail in groups[AWAITING])
lines.append("**Awaiting-Ruling rollup** — the genuine doctrine blockers collapse to a handful of "
             "rulings; resolving each unblocks the listed count:\n")
for detail, n in dblock.most_common():
    lines.append(f"- **{n}** &mdash; {detail}")
lines.append("")

lines += PACKET_POINTER

for c, items in groups.items():
    if not items: continue
    lines.append(f"\n## {c}  ({len(items)})\n")
    if c == DERIVABLE:
        lines.append("_No doctrine work remains for any row below — editorial authoring only._\n")
    if c == ADD_PROVISIONAL:
        lines.append("_Notation is derivable now (resolved chassis + settled base); these are NOT awaiting "
                     "a ruling. The ADD value is provisional only because it sits in the held atomic-Q3 "
                     "migration (atomic on a rotational base may drop from +2 to +1)._\n")
    lines.append("| Trick | ADD | Notation / decomposition | Family | Source | Exact missing item |")
    lines.append("|---|---|---|---|---|---|")
    for r, sub, detail in sorted(items, key=lambda x: x[0].get("name", "")):
        name, add, dec, fam, srcv = fmt(r)
        lines.append(f"| {name} | {add} | {dec} | {fam} | {srcv} | {detail} |")

OUT.write_text("\n".join(lines) + "\n")
print(f"frontier candidates: {len(frontier)} (classified {classified}, dropped-as-alias {len(dropped_aliases)})")
for c, items in groups.items():
    print(f"  {c}: {len(items)}")
if dropped_aliases:
    print(f"  dropped aliases: {', '.join(sorted(dropped_aliases))}")
print(f"\nwrote {OUT}")
