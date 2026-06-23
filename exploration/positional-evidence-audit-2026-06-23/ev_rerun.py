#!/usr/bin/env python3
"""EV positional frontier re-run under the FROZEN variability doctrine. Read-only.

FROZEN DOCTRINE
  A positional qualifier is meaningful only when the notation contains at least
  two INDEPENDENTLY VARIABLE side-bearing components (dexes and/or catches).
  If all side-bearing components are fixed to a single relationship, the qualifier
  cannot create a distinct variant.

Operationalization (reproduces pixie-(same|opposite)-clipper = OK, same-side
whirl / torque = not, with no special cases):
  side-bearing components = every scored [DEX] marker + the catch marker at [DEL].
  The relationship is NOT fixed (=> variable, qualifier meaningful) when EITHER
    - there are >= 2 dexes (each independently settable, so they can be re-related), OR
    - any component carries an AMBIGUOUS (SAME/OP) marker (an explicitly variable slot),
  AND there are >= 2 side-bearing components total (something to relate against).
  Otherwise the relationship is fixed -> the qualifier is non-distinct.

Buckets:
  WELL-FORMED, unique target      -> A
  WELL-FORMED, >=2 candidate targets -> B (ambiguous target)
  FIXED relationship (not meaningful) -> C (non-distinct)
  base notation absent             -> D (pending)

No staging, no authoring, no classification writes.
"""
from __future__ import annotations
import csv, re, sqlite3
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CU = REPO / "exploration/phase-e-implementation-2026-05-28/CLASSIFIED_UNIVERSE.csv"
DB = REPO / "database/footbag.db"
HERE = Path(__file__).resolve().parent
OUT = HERE / "EV_RERUN_GATED.md"
CSVOUT = HERE / "ev_rerun_gated.csv"

SIDE = {"ss", "near", "far", "op", "opp", "opposite", "same", "side", "same-side", "opposite-side"}


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


def _mark_before(toks, i):
    for j in range(i - 1, max(-1, i - 6), -1):
        if toks[j] in ("SAME/OP", "OP", "SAME"):
            return "AMBIG" if toks[j] == "SAME/OP" else toks[j]
    return None


def components(op):
    """Return (dex_markers list, catch_marker or None)."""
    toks = op.split()
    dex = [_mark_before(toks, i) for i, t in enumerate(toks) if "[DEX]" in t]
    catch = None
    idx = max((i for i, t in enumerate(toks) if "[DEL]" in t), default=-1)
    if idx >= 0:
        catch = _mark_before(toks, idx + 1)
    return dex, catch


def assess(op):
    """(meaningful, n_components, reason)."""
    dex, catch = components(op)
    comps = list(dex) + ([catch] if catch else [])
    nslots = len(comps)
    has_ambig = any(c == "AMBIG" for c in comps)
    variable = (len(dex) >= 2) or has_ambig
    meaningful = variable and nslots >= 2
    why = (f"{len(dex)} dex{'+catch' if catch else ''}; "
           f"{'>=2 dexes' if len(dex) >= 2 else ('ambiguous slot' if has_ambig else 'all slots fixed')}")
    return meaningful, dex, catch, why


def main():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    notation = {s: op for s, op in con.execute(
        "SELECT slug, operational_notation FROM freestyle_tricks WHERE operational_notation IS NOT NULL")}
    con.close()

    # ---- doctrine validation against the four named cases (+ butterfly/osis as consequences) ----
    checks = ["pixie-same-clipper", "pixie-opposite-clipper", "whirl-same-side", "torque-same-side",
              "butterfly-same-side", "osis-same-side"]
    validation = []
    for c in checks:
        base = strip_side(c)
        op = notation.get(base)
        if not op:
            validation.append((c, base, "?", "base notation absent")); continue
        meaningful, dex, catch, why = assess(op)
        validation.append((c, base, "OK" if meaningful else "not", why))

    cu = list(csv.DictReader(open(CU)))
    rows = []
    for r in cu:
        nm = r["name"]; slug = (r["slug"] or "").strip() or slugify(nm)
        side = pside(nm) or pside(slug)
        if not side:
            continue
        base = strip_side(slug) or strip_side(slugify(nm))
        op = notation.get(base)
        if op is None:
            rows.append(dict(name=nm, base=base, side=side, bucket="D", detail="base notation absent")); continue
        meaningful, dex, catch, why = assess(op)
        if not meaningful:
            rows.append(dict(name=nm, base=base, side=side, bucket="C", detail=f"fixed relationship ({why})")); continue
        # candidate targets = INDEPENDENTLY variable elements the qualifier must set:
        # dexes opposite the asserted side (only when >=2 dexes are relatable to each
        # other) plus any AMBIGUOUS slot (dex or catch). A FIXED catch is locked to
        # its dex (follows it), so it is NOT a separate target.
        want = "SAME" if side == "same" else "OP"
        opp = "OP" if want == "SAME" else "SAME"
        comps = list(dex) + ([catch] if catch else [])
        opp_dexes = sum(1 for d in dex if d == opp) if len(dex) >= 2 else 0
        ambig = sum(1 for c in comps if c == "AMBIG")
        targets = opp_dexes + ambig
        if targets == 1:
            bucket, detail = "A", f"well-formed, unique target ({why})"
        elif targets == 0:
            bucket, detail = "A", f"well-formed, redundant (qualifier already satisfied) ({why})"
        else:
            bucket, detail = "B", f"well-formed, {targets} candidate targets ({why})"
        rows.append(dict(name=nm, base=base, side=side, bucket=bucket, detail=detail))

    bc = Counter(r["bucket"] for r in rows)
    with CSVOUT.open("w", newline="") as f:
        w = csv.writer(f); w.writerow(["name", "base", "asserted_side", "bucket", "detail"])
        for r in sorted(rows, key=lambda x: (x["bucket"], x["base"], x["name"])):
            w.writerow([r["name"], r["base"], r["side"], r["bucket"], r["detail"]])

    L = []
    L.append("# EV positional frontier — gated re-run (variability doctrine, 2026-06-23)\n")
    L.append("## FROZEN DOCTRINE\n")
    L.append("> A positional qualifier is meaningful only when the notation contains at least two "
             "**independently variable** side-bearing components (dexes and/or catches). If all "
             "side-bearing components are fixed to a single relationship, the qualifier cannot create "
             "a distinct variant.\n")
    L.append("Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/ev_rerun.py`. "
             "Per-name CSV: `ev_rerun_gated.csv`.\n")
    L.append("## Doctrine validation (named cases + consequences)\n")
    L.append("| case | base | verdict | reason |")
    L.append("|---|---|:--:|---|")
    for c, base, v, why in validation:
        mark = "OK" if v == "OK" else ("not" if v == "not" else "?")
        L.append(f"| `{c}` | `{base}` | {mark} | {why} |")
    L.append("")
    L.append("## Buckets (gateable rows: base notation known)\n")
    L.append("| bucket | meaning | count |")
    L.append("|---|---|---:|")
    L.append(f"| **A** | well-formed, unique target | **{bc['A']}** |")
    L.append(f"| **B** | well-formed, ambiguous target (>=2 candidates) | **{bc['B']}** |")
    L.append(f"| **C** | fixed relationship, non-distinct | **{bc['C']}** |")
    L.append(f"| D | pending (base notation not authored) | {bc['D']} |")
    L.append("")
    for key, title in [("A", "Bucket A — well-formed, unique target"),
                       ("B", "Bucket B — well-formed, ambiguous target"),
                       ("C", "Bucket C — fixed relationship, non-distinct")]:
        items = sorted({(r["name"], r["base"], r["detail"]) for r in rows if r["bucket"] == key})
        L.append(f"## {title} ({len(items)})\n")
        L.append("| name | base | detail |")
        L.append("|---|---|---|")
        for nm, base, detail in items:
            L.append(f"| {nm} | `{base}` | {detail} |")
        L.append("")
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("validation:", [(c, v) for c, _, v, _ in validation])
    print(f"A={bc['A']}  B={bc['B']}  C={bc['C']}  D={bc['D']}")
    print(f"wrote {OUT.relative_to(REPO)} and {CSVOUT.name}")


if __name__ == "__main__":
    main()
