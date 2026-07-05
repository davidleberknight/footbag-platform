#!/usr/bin/env python3
"""Op-notation Backfill Tracker — every ALREADY-PUBLISHED dictionary row
(is_active) that is missing operational_notation, classified by how
actionable the backfill is. This is the workstream the promotion-frontier
doc points at but deliberately does NOT contain: the frontier doc is about
unpublished candidates; this is about canonical rows that exist but lack a
structural notation.

Buckets:
  Clean-derivable        resolved operators + a published exemplar to mirror;
                         author the notation now (bracket-count == ADD)
  Packet-held            blocked on a drafted curator packet (blazing/terraging)
  Double-operator held   repeats an operator the base already carries; no precedent
  Operator/base defn     the row IS an operator/atom/base definition; notation optional
  Needs decomposition    folk name or unresolved operator; no derivation yet

Read-only. Writes OP_NOTATION_BACKFILL.md next to this script.
"""
from __future__ import annotations
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "database/footbag.db"
OUT = Path(__file__).resolve().parent / "OP_NOTATION_BACKFILL.md"

# Operators with a settled ADD weight in resolved canon (the ones whose
# contribution we can mirror from a published exemplar). Excludes the
# still-open operators: blurry (rotational), furious (non-rotational),
# fairy / gyro / blazing / shooting (Q4 / undefined).
RESOLVED_OPERATORS = {
    "ducking", "paradox", "spinning", "stepping", "symposium", "tapping",
    "diving", "pixie", "quantum", "atomic", "nuclear", "miraging", "whirling",
    "illusioning", "terraging", "barraging", "surging", "inspinning",
}
KNOWN_UNRESOLVED_OPERATORS = {"fairy", "gyro", "blazing", "shooting"}

PACKET_HELD_PREFIX = ("blazing-", "terraging-")

# Named compounds whose canonical equivalence (resolved canon) is an already-
# notated row — the notation is that twin's, so they are clean-derivable.
EQUIV_TWIN = {
    "omelette": "atomic-illusion",
    "plasma": "quantum-double-over-down",
    "witchdoctor": "symposium-atomic-butterfly",
}

# Repeats an operator the base already carries (eggbeater = atomic-legover;
# blur = stepping-paradox-mirage); no same-operator-twice precedent.
DOUBLE_OPERATOR_HELD = {"atomic-eggbeater", "paradox-blur"}

# Rows that ARE an operator / atom / base definition rather than a compound;
# a structural op_notation is optional for these.
BARE_DEFINITIONAL = {
    "atomic", "barraging", "blazing", "ducking", "gyro", "illusioning",
    "paradox", "pogo", "quantum", "rooted", "shooting", "spinning", "stepping",
    "symposium", "tapping", "terraging", "spyro", "furious", "terrage",
    "hop-over", "down-double-down",
}

CLEAN = "Clean-derivable"
PACKET = "Packet-held"
DOUBLE = "Double-operator held"
DEFN = "Operator/base definitional"
NEEDS = "Needs decomposition"

con = sqlite3.connect(str(DB))
empty = []          # (slug, adds, base_trick)
has_op_prefixes = set()
for slug, adds, base, opn in con.execute(
    "SELECT slug, adds, base_trick, operational_notation FROM freestyle_tricks WHERE is_active=1"):
    if opn is None or opn == "":
        empty.append((slug, adds or "—", base or "—"))
    else:
        # leading token of a notated slug = an operator we have an exemplar for
        has_op_prefixes.add(slug.split("-")[0])
con.close()

def exemplar_for(op):
    return op if op in has_op_prefixes else None

def classify(slug, adds, base):
    if slug.startswith(PACKET_HELD_PREFIX):
        return (PACKET, "Blazing / Terraging notation packet — operator status / notation layout open.")
    if slug in DOUBLE_OPERATOR_HELD:
        return (DOUBLE, "Repeats an operator the base already carries; held until a same-operator-twice ruling.")
    if slug in EQUIV_TWIN:
        twin = EQUIV_TWIN[slug]
        ex = "published" if twin.split("-")[0] in has_op_prefixes else "(twin not notated)"
        return (CLEAN, f"Canonical equivalence of `{twin}` ({ex}); notation mirrors the twin.")
    if slug in BARE_DEFINITIONAL:
        return (DEFN, "Row is an operator/atom/base definition; structural op_notation optional.")
    lead = slug.split("-")[0]
    if lead in RESOLVED_OPERATORS and exemplar_for(lead):
        return (CLEAN, f"Leading `{lead}` resolved + `{lead}-*` exemplar published; mirror it (bracket-count == ADD).")
    if lead in KNOWN_UNRESOLVED_OPERATORS:
        return (NEEDS, f"Leading operator `{lead}` is unresolved (Q4 / undefined); no derivation until ruled.")
    return (NEEDS, "Folk / standalone name with no operator-prefixed derivation; needs a decomposition.")

groups = {k: [] for k in (CLEAN, PACKET, DOUBLE, DEFN, NEEDS)}
for slug, adds, base in sorted(empty):
    cat, note = classify(slug, adds, base)
    groups[cat].append((slug, adds, base, note))

ORDER = [CLEAN, PACKET, DOUBLE, NEEDS, DEFN]
BLURB = {
    CLEAN: "Resolved operators + a published exemplar (or a notated canonical twin). Author the "
           "operational_notation now; bracket-count must equal ADD. No ruling needed.",
    PACKET: "Blocked on a drafted curator packet awaiting Red. Do not author until the ruling lands.",
    DOUBLE: "The operator is resolved, but the row repeats an operator its base already carries; held "
            "until a same-operator-twice ruling exists.",
    NEEDS: "No derivation available yet — a folk/standalone name with no structural decomposition, or a "
           "leading operator that is still unresolved.",
    DEFN: "The row defines an operator / atom / base rather than a compound; a structural notation is "
          "optional and low-priority.",
}

lines = ["# Op-notation Backfill Tracker\n",
         f"**{len(empty)} active dictionary rows** carry an empty `operational_notation`. These are "
         "already-published canonical rows missing a structural notation — a separate workstream from "
         "the promotion frontier (which tracks *unpublished* candidates). Each row is classified by how "
         "actionable the backfill is.\n",
         "Counts by bucket:\n"]
for c in ORDER:
    lines.append(f"- **{c}**: {len(groups[c])}")
lines.append("")

for c in ORDER:
    items = groups[c]
    if not items: continue
    lines.append(f"\n## {c}  ({len(items)})\n")
    lines.append(f"_{BLURB[c]}_\n")
    lines.append("| Slug | ADD | Base | Note |")
    lines.append("|---|---|---|---|")
    for slug, adds, base, note in items:
        lines.append(f"| `{slug}` | {adds} | {base} | {note} |")

OUT.write_text("\n".join(lines) + "\n")
print(f"empty-op_notation active rows: {len(empty)}")
for c in ORDER:
    print(f"  {c}: {len(groups[c])}")
print(f"\nwrote {OUT}")
