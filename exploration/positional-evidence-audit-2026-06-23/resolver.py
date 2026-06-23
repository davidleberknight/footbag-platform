#!/usr/bin/env python3
"""Configuration resolver (READ-ONLY). Implements the frozen identity doctrine
(POSITIONAL_IDENTITY_BY_CONFIGURATION.md) as a pure classifier and runs it over
the 14 remaining positional record names to emit a CURATOR WORKLIST. It never
writes aliases or canonicals.

Contract
  input : record trick name (carrying a positional qualifier)
  output: { base_canonical, qualifier, component_count, fixed_relationship,
            resolver_status }
  resolver_status in:
    SAFE_ALIAS                  - resolves to the base. Permitted ONLY when
                                  component_count <= 1, OR an explicit curated
                                  equivalence row maps this positional slug to the
                                  base. NEVER auto-emitted for component_count > 1.
    NEEDS_CURATED_EQUIVALENCE   - looks fixed/redundant but component_count > 1 and
                                  no curated equivalence row exists; a human must
                                  assert the equivalence before it can be an alias
    DISTINCT_VARIANT_CANDIDATE  - multi-component, unique target, new config not
                                  matching any existing canonical
    AMBIGUOUS_MULTI_COMPONENT   - multi-component, the qualifier has >=2 candidate
                                  targets (target undetermined)
    NO_NOTATION                 - base has no operational notation; cannot resolve
    COLLISION                   - derived config equals an existing different
                                  canonical, or the positional slug is already taken

Safety invariant: the resolver MUST NEVER emit SAFE_ALIAS for component_count > 1
unless an explicit curated equivalence row exists. A "fixed relationship" in the
notation can be a notation gap, so a multi-component alias requires human
assertion (a curated equivalence row), never an autonomous resolver call.
"""
from __future__ import annotations
import csv, re, sqlite3
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DB = REPO / "database/footbag.db"
OUT = Path(__file__).resolve().parent / "CURATOR_WORKLIST.md"
CSVOUT = Path(__file__).resolve().parent / "curator_worklist.csv"

SIDE = {"ss", "near", "far", "op", "opp", "opposite", "same", "side", "same-side", "opposite-side"}

# the 14 remaining record names (multi-component / no-notation; the 7 safe were aliased)
REMAINING = [
    "Assassin (ss)", "Double Leg Over (ss)", "Eclipse (ss)", "Eggbeater (ss)",
    "Fairy Double Leg Over (ss)", "Fairy Legover (ss)", "Fairy Pickup (ss)",
    "Paste (ss)", "Pigbeater (ss)", "Pixie DSO (ss)", "Pixie Double Pickup (ss)",
    "Smear (ss)", "Smog (ss)", "Smudge (ss)",
]


def slugify(s):
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
            return ("AMBIG" if toks[j] == "SAME/OP" else toks[j], j)
    return (None, None)


def components(op):
    """Return (dex list of (mark,idx), catch (mark,idx) or None)."""
    toks = op.split()
    dex = []
    for i, t in enumerate(toks):
        if "[DEX]" in t:
            m, j = _mark_before(toks, i)
            dex.append((m, j))
    catch = None
    idx = max((i for i, t in enumerate(toks) if "[DEL]" in t), default=-1)
    if idx >= 0:
        m, j = _mark_before(toks, idx + 1)
        if m:
            catch = (m, j)
    return dex, catch


def safe_or_curated(component_count, pos_slug, base, curated_equiv, why_fixed):
    """SAFETY INVARIANT: SAFE_ALIAS only when component_count <= 1, or an explicit
    curated equivalence row maps this positional slug to the base. Otherwise the
    multi-component case is NEEDS_CURATED_EQUIVALENCE (never auto-aliased)."""
    if component_count <= 1:
        return "SAFE_ALIAS", f"{why_fixed}; single component (<=1) -> base"
    if curated_equiv.get(pos_slug) == base:
        return "SAFE_ALIAS", f"{why_fixed}; multi-component but explicit curated equivalence row present"
    return "NEEDS_CURATED_EQUIVALENCE", f"{why_fixed}; multi-component ({component_count}) with NO curated equivalence row"


def resolve(record_name, notation, active_notation, active_slugs, alias_slugs, curated_equiv):
    base = strip_side(slugify(record_name))
    qualifier = pside(record_name)
    pos_slug = slugify(record_name)
    op = notation.get(base)
    out = dict(record=record_name, base_canonical=base, qualifier=qualifier,
               component_count=None, fixed_relationship=None, resolver_status=None, note="")
    if not op:
        out.update(resolver_status="NO_NOTATION", component_count=0, fixed_relationship=None,
                   note="base has no operational notation"); return out
    dex, catch = components(op)
    comps = [m for m, _ in dex] + ([catch[0]] if catch else [])
    out["component_count"] = len(comps)
    has_ambig = any(c == "AMBIG" for c in comps)
    meaningful = (len(dex) >= 2 or has_ambig) and len(comps) >= 2
    out["fixed_relationship"] = not meaningful
    if not meaningful:
        st, note = safe_or_curated(len(comps), pos_slug, base, curated_equiv, "fixed relationship")
        out.update(resolver_status=st, note=note)
        return out
    # variable targets the qualifier would set
    want = "SAME" if qualifier == "same" else "OP"
    opp = "OP" if want == "SAME" else "SAME"
    targets = []
    if len(dex) >= 2:
        targets += [("dex", j) for (m, j) in dex if m == opp]
    targets += [("dex", j) for (m, j) in dex if m == "AMBIG"]
    if catch and catch[0] == "AMBIG":
        targets += [("catch", catch[1])]
    if len(targets) == 0:
        st, note = safe_or_curated(len(comps), pos_slug, base, curated_equiv, "qualifier redundant (config already satisfied)")
        out.update(resolver_status=st, note=note)
        return out
    if len(targets) >= 2:
        out.update(resolver_status="AMBIGUOUS_MULTI_COMPONENT",
                   note=f"{len(targets)} candidate targets for '{qualifier}'")
        return out
    # unique target -> derive config and check for collision
    toks = op.split()
    toks[targets[0][1]] = want
    derived = " ".join(toks)
    pos_slug = slugify(record_name)
    dup = next((s for s, o in active_notation.items() if s != base and o.strip() == derived.strip()), None)
    if dup:
        out.update(resolver_status="COLLISION", note=f"config equals existing canonical `{dup}`")
    elif pos_slug in active_slugs or pos_slug in alias_slugs:
        out.update(resolver_status="COLLISION", note=f"positional slug `{pos_slug}` already taken")
    else:
        out.update(resolver_status="DISTINCT_VARIANT_CANDIDATE",
                   note=f"unique target; new config `{derived}`")
    return out


def load_db_aliases():
    """Materialized curator-owned equivalences: {alias_slug -> trick_slug} from the
    rebuilt freestyle_trick_aliases (sourced from trick_aliases.csv + red_additions).
    The resolver READS this; it never writes it. Presence here is what licenses
    SAFE_ALIAS for component_count > 1, and marks already-wired names RESOLVED."""
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    out = {a: t for a, t in con.execute("SELECT alias_slug, trick_slug FROM freestyle_trick_aliases") if a}
    con.close()
    return out


def main():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    notation = {s: op for s, op in con.execute(
        "SELECT slug, operational_notation FROM freestyle_tricks WHERE operational_notation IS NOT NULL")}
    active_notation = {s: op for s, op in con.execute(
        "SELECT slug, operational_notation FROM freestyle_tricks WHERE is_active=1 AND operational_notation IS NOT NULL AND operational_notation<>''")}
    active_slugs = {s for (s,) in con.execute("SELECT slug FROM freestyle_tricks WHERE is_active=1")}
    alias_slugs = {a for (a,) in con.execute("SELECT alias_slug FROM freestyle_trick_aliases") if a}
    con.close()
    curated = load_db_aliases()

    rows = [resolve(nm, notation, active_notation, active_slugs, alias_slugs, curated) for nm in REMAINING]
    # Resolution overlay: a name already wired as a DB alias is RESOLVED (tracking
    # status), regardless of its config classification (e.g. fairy-legover-ss is now
    # aliased to double-orbit). This is what drops it from the unresolved worklist.
    for r in rows:
        ps = slugify(r["record"])
        if ps in curated:
            r["resolver_status"] = "RESOLVED"
            r["note"] = f"already wired: alias `{ps}` -> `{curated[ps]}`"
    counts = Counter(r["resolver_status"] for r in rows)

    # REGRESSION GUARD (raises if the invariant is violated): the resolver must
    # never emit SAFE_ALIAS for component_count > 1 unless a curated equivalence row
    # maps the positional slug to the base.
    for r in rows:
        if r["resolver_status"] == "SAFE_ALIAS" and (r["component_count"] or 0) > 1:
            ps = slugify(r["record"])
            assert curated.get(ps) == r["base_canonical"], \
                f"INVARIANT VIOLATION: SAFE_ALIAS for component_count>1 without curated equivalence: {r}"

    # Guard demonstration over the 7 previously-added aliases (config classifier
    # only, no resolution overlay): clipper-stall-ss is single-component (SAFE_ALIAS
    # unconditionally); the 6 are component_count>1 and SAFE_ALIAS ONLY because their
    # curated equivalence rows exist. With curated={} they are NEEDS_CURATED_EQUIVALENCE.
    SEVEN = ["Clipper Stall (ss)", "Dyno (op)", "Flail (ss)", "Pickup (ss)",
             "Rev Whirl (op)", "Symposium Mirage (ss)", "Symposium Swirl (op)"]
    guard_with = [resolve(nm, notation, active_notation, active_slugs, alias_slugs, curated) for nm in SEVEN]
    guard_without = [resolve(nm, notation, active_notation, active_slugs, alias_slugs, {}) for nm in SEVEN]
    for r in guard_without:
        assert not (r["resolver_status"] == "SAFE_ALIAS" and (r["component_count"] or 0) > 1), \
            f"INVARIANT VIOLATION (autonomous): {r}"

    with CSVOUT.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["record", "base_canonical", "qualifier", "component_count",
                    "fixed_relationship", "resolver_status", "note"])
        for r in rows:
            w.writerow([r["record"], r["base_canonical"], r["qualifier"], r["component_count"],
                        r["fixed_relationship"], r["resolver_status"], r["note"]])

    L = []
    L.append("# Curator worklist — remaining 14 positional names (2026-06-23)\n")
    L.append("Read-only output of the configuration resolver. No aliases or canonicals written.\n")
    L.append("Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/resolver.py`. CSV: `curator_worklist.csv`.\n")
    L.append("## Status counts\n")
    L.append("| resolver_status | count | curator action |")
    L.append("|---|---:|---|")
    ACTION = {
        "RESOLVED": "done — alias already wired in the DB (removed from the unresolved worklist)",
        "DISTINCT_VARIANT_CANDIDATE": "decide: author as a new canonical (needs attestation + ADD/notation) or alias",
        "AMBIGUOUS_MULTI_COMPONENT": "decide which component the qualifier targets before any identity is assigned",
        "COLLISION": "wire an alias to the existing canonical named in the note (not the base)",
        "NEEDS_CURATED_EQUIVALENCE": "multi-component: a human must add an explicit curated equivalence row before it can be a SAFE_ALIAS",
        "SAFE_ALIAS": "alias to base (single-component, or curated equivalence row exists)",
        "NO_NOTATION": "author base notation first (blocked until then)",
    }
    for st in ["RESOLVED", "DISTINCT_VARIANT_CANDIDATE", "AMBIGUOUS_MULTI_COMPONENT", "COLLISION",
               "NEEDS_CURATED_EQUIVALENCE", "NO_NOTATION", "SAFE_ALIAS"]:
        if counts.get(st):
            L.append(f"| {st} | {counts[st]} | {ACTION[st]} |")
    L.append("")
    L.append("## Safety-invariant guard demonstration (the 7 previously-added aliases)\n")
    L.append("SAFE_ALIAS for component_count > 1 requires a curated equivalence row. The 6 multi-"
             "component aliases were explicitly human-approved last turn (their curated rows now exist "
             "in trick_aliases.csv); without those rows the resolver yields NEEDS_CURATED_EQUIVALENCE.\n")
    L.append("| record | components | with curated rows | with curated={} (autonomous) |")
    L.append("|---|:--:|---|---|")
    for a, b in zip(guard_with, guard_without):
        L.append(f"| {a['record']} | {a['component_count']} | {a['resolver_status']} | {b['resolver_status']} |")
    L.append("")
    L.append("## Worklist\n")
    L.append("| record | base_canonical | qualifier | components | fixed? | resolver_status | note |")
    L.append("|---|---|:--:|:--:|:--:|---|---|")
    for r in sorted(rows, key=lambda x: (x["resolver_status"], x["base_canonical"])):
        L.append(f"| {r['record']} | `{r['base_canonical']}` | {r['qualifier']} | {r['component_count']} | "
                 f"{r['fixed_relationship']} | **{r['resolver_status']}** | {r['note']} |")
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("resolver over 14:", dict(counts))
    print(f"wrote {OUT.name}, {CSVOUT.name}")


if __name__ == "__main__":
    main()
