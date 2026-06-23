#!/usr/bin/env python3
"""Promotion-readiness of bucket A under the FROZEN doctrine (EV_RERUN_GATED.md).

No authoring, no new canonicals, no polarity revisit. For each bucket-A positional
variant (deduped to a distinct (base, asserted-side) so name duplicates don't
inflate yield), verify:
  1. historical attestation (>=1 real source corpus),
  2. base active and not pending notation,
  3. target component unique (bucket-A property; redundant 'alias' entries excluded),
  4. no unresolved X-Dex dependency (far variant landing on a rotational receiver),
  5. no unresolved ambiguity (bucket-A property).

Emit: READY NOW / NEEDS NOTATION / NEEDS X-DEX / NEEDS CURATOR REVIEW + the
already-in-system count, and the largest bottleneck.
"""
from __future__ import annotations
import csv, re, sqlite3
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CU = REPO / "exploration/phase-e-implementation-2026-05-28/CLASSIFIED_UNIVERSE.csv"
GATED = Path(__file__).resolve().parent / "ev_rerun_gated.csv"
DB = REPO / "database/footbag.db"
OUT = Path(__file__).resolve().parent / "READINESS.md"

SIDE = {"ss", "near", "far", "op", "opp", "opposite", "same", "side", "same-side", "opposite-side"}
RECEIVERS = {"mirage", "illusion", "whirl", "torque", "drifter"}  # per the frozen glossary X-Dex list
REAL = ("footbagmoves", "fborg", "stanford", "passback")


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


def main():
    # attestation per name from the corpus census
    src_by_name = {}
    for r in csv.DictReader(open(CU)):
        src_by_name[r["name"]] = ((r["sources"] or "") + "," + (r["source_corpus"] or "")).lower()

    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    active = {s for (s,) in con.execute("SELECT slug FROM freestyle_tricks WHERE is_active=1")}
    has_notation = {s for (s, op) in con.execute(
        "SELECT slug, operational_notation FROM freestyle_tricks WHERE operational_notation IS NOT NULL AND operational_notation<>''")}
    in_system = set()  # (base, side) already an active canonical or alias
    for (s,) in con.execute("SELECT slug FROM freestyle_tricks WHERE is_active=1"):
        if pside(s):
            in_system.add((strip_side(s), pside(s)))
    for (a,) in con.execute("SELECT alias_slug FROM freestyle_trick_aliases"):
        if a and pside(a):
            in_system.add((strip_side(a), pside(a)))
    con.close()

    # collapse bucket-A names to distinct (base, side) variants
    variants = defaultdict(lambda: {"names": [], "redundant": False})
    for r in csv.DictReader(open(GATED)):
        if r["bucket"] != "A":
            continue
        key = (r["base"], r["asserted_side"])
        variants[key]["names"].append(r["name"])
        if "redundant" in r["detail"]:
            variants[key]["redundant"] = True

    rows = []
    for (base, side), v in variants.items():
        attested = any(any(k in src_by_name.get(nm, "") for k in REAL) for nm in v["names"])
        base_ok = base in active and base in has_notation
        far_recv = side == "far" and any(t in RECEIVERS for t in base.split("-"))
        already = (base, side) in in_system
        # priority: redundant(alias) -> review; far-on-receiver -> x-dex; base inactive -> notation;
        # unattested -> review; else ready
        if v["redundant"]:
            bucket = "NEEDS CURATOR REVIEW"; reason = "qualifier redundant (matches default) — an alias decision, not a distinct variant"
        elif not base_ok:
            bucket = "NEEDS NOTATION"; reason = ("base not active" if base not in active else "base has no notation")
        elif far_recv:
            bucket = "NEEDS X-DEX"; reason = "far variant lands on a rotational receiver; X-Dex scoring unresolved"
        elif not attested:
            bucket = "NEEDS CURATOR REVIEW"; reason = "no source attestation in corpus"
        else:
            bucket = "READY NOW"; reason = "attested, base active+notated, unique target, no X-Dex"
        rows.append(dict(base=base, side=side, bucket=bucket, reason=reason,
                         already=already, names=len(v["names"])))

    bc = Counter(r["bucket"] for r in rows)
    ready = [r for r in rows if r["bucket"] == "READY NOW"]
    ready_new = [r for r in ready if not r["already"]]
    ready_done = [r for r in ready if r["already"]]

    L = []
    L.append("# Bucket-A promotion readiness under the frozen doctrine (2026-06-23)\n")
    L.append("Read-only. Doctrine frozen per EV_RERUN_GATED.md. Bucket-A names collapsed to "
             f"**{len(rows)} distinct (base, side) variants**. No authoring.\n")
    L.append("Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/readiness.py`\n")
    L.append("## Readiness counts (distinct variants)\n")
    L.append("| bucket | count |")
    L.append("|---|---:|")
    for k in ["READY NOW", "NEEDS NOTATION", "NEEDS X-DEX", "NEEDS CURATOR REVIEW"]:
        L.append(f"| {k} | {bc[k]} |")
    L.append("")
    L.append(f"- Of READY NOW ({bc['READY NOW']}): **{len(ready_new)} not yet in the system "
             f"(the immediate promotion yield)**; {len(ready_done)} already active/aliased.\n")
    # bottleneck
    blockers = {k: bc[k] for k in ["NEEDS NOTATION", "NEEDS X-DEX", "NEEDS CURATOR REVIEW"]}
    top = max(blockers, key=blockers.get)
    L.append(f"**Largest bottleneck: {top} ({blockers[top]} variants).**\n")
    for k in ["READY NOW", "NEEDS NOTATION", "NEEDS X-DEX", "NEEDS CURATOR REVIEW"]:
        items = sorted([r for r in rows if r["bucket"] == k], key=lambda x: (x["base"], x["side"]))
        L.append(f"## {k} ({len(items)})\n")
        L.append("| base | side | in system | reason |")
        L.append("|---|:--:|:--:|---|")
        for r in items:
            L.append(f"| `{r['base']}` | {r['side']} | {'yes' if r['already'] else ''} | {r['reason']} |")
        L.append("")
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"distinct variants in A: {len(rows)}")
    for k in ["READY NOW", "NEEDS NOTATION", "NEEDS X-DEX", "NEEDS CURATOR REVIEW"]:
        print(f"  {k}: {bc[k]}")
    print(f"READY NOW not-yet-in-system (immediate yield): {len(ready_new)}  | already in system: {len(ready_done)}")
    print(f"largest bottleneck: {top} ({blockers[top]})")


if __name__ == "__main__":
    main()
