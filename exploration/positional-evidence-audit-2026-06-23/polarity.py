#!/usr/bin/env python3
"""Default-side polarity of base tricks, then a polarity-aware positional re-audit.

Read-only. Corrects the prior audit's neutrality assumption: an unqualified base
is NOT side-neutral. Each base has a default side; the side qualifier that
matches the default is an alias, and the opposite side is the distinct variant.

Evidence per base (strongest first):
  1. Leading-dex SAME/OP marker in the base's canonical operational_notation
     (curator-authored; the primary dexterity's actual side).
  2. Corpus marking: which positional SPELLING the corpus documents. The marked
     (qualified) form is the deviation, so the base defaults to the OTHER side.
       - documented "same side" form  -> same-side is marked -> base defaults OP/far
       - documented "far"/"op" form   -> far is marked       -> base defaults SAME/near
     FootbagMoves ships an explicit same-side inventory; that membership is a
     direct "same-side is marked" signal.
  3. Catch-surface doctrine (fallback): clipper-led -> SAME default;
     toe-led -> OP default.

Classification: OP/far default | SAME/near default | unknown (ambiguous notation,
conflicting signals, or both forms documented). Then every positional name is
re-audited as alias (matches base default) vs distinct (opposes it).

No staging, no writes outside this report.
"""
from __future__ import annotations
import csv, re, sqlite3
from collections import defaultdict, Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CU = REPO / "exploration/phase-e-implementation-2026-05-28/CLASSIFIED_UNIVERSE.csv"
FM_SS = REPO / "legacy_data/out/footbagmoves_inventory_same_side.csv"
DB = REPO / "database/footbag.db"
OUT = Path(__file__).resolve().parent / "POLARITY_REPORT.md"

SIDE_TOKENS = {"ss", "near", "far", "op", "opp", "opposite", "same", "side", "same-side", "opposite-side"}
SAME_WORDS = {"ss", "near", "same"}           # same-side markers
FAR_WORDS = {"far", "op", "opp", "opposite"}  # far/opposite markers


def slugify(s: str) -> str:
    s = re.sub(r"\((?:ss|op|opp|opposite|near|far|same[ -]side)\)", "", s, flags=re.I)
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def strip_side(slug: str) -> str:
    return "-".join(s for s in slug.split("-") if s not in SIDE_TOKENS)


def positional_side(slug: str) -> str | None:
    """Which side does this positional slug assert? 'same' / 'far' / None."""
    segs = set(slug.split("-"))
    if "same-side" in slug or (segs & {"same"}) or (segs & {"ss", "near"}):
        return "same"
    if (segs & {"far"}) or (segs & {"op", "opp", "opposite"}):
        return "far"
    return None


def leading_dex_side(notation: str) -> str | None:
    """SAME / OP / AMBIG (SAME/OP) / None for the first [DEX] in the notation."""
    toks = notation.split()
    for i, t in enumerate(toks):
        if "[DEX]" in t:
            for back in toks[max(0, i - 5):i][::-1]:
                if back == "SAME/OP":
                    return "AMBIG"
                if back == "OP":
                    return "OP"
                if back == "SAME":
                    return "SAME"
            return None
    return None


def terminal_surface(notation: str) -> str | None:
    toks = notation.split()
    idx = max((i for i, t in enumerate(toks) if "[DEL]" in t), default=-1)
    if idx < 0:
        return None
    for back in toks[max(0, idx - 4):idx + 1][::-1]:
        b = back.strip("[]").upper()
        if b in {"TOE", "CLIP", "INSIDE", "OUTSIDE", "SOLE", "HEEL"}:
            return b
    return None


def main() -> None:
    cu = list(csv.DictReader(open(CU)))

    # FM same-side inventory -> bases with a documented same-side (marked) form.
    fm_ss_bases = {slugify(strip_side(slugify(r["display_name"]))) for r in csv.DictReader(open(FM_SS))}

    # Corpus positional forms per base: which sides are SPELLED OUT in the census.
    corpus_same: set[str] = set()
    corpus_far: set[str] = set()
    positional_names = []  # (slug, name, base, side)
    for r in cu:
        name = r["name"]
        slug = (r["slug"] or "").strip() or slugify(name)
        side = positional_side(slugify(name)) or positional_side(slug)
        if not side:
            continue
        base = strip_side(slug) or strip_side(slugify(name))
        positional_names.append((slug, name, base, side,
                                 r.get("promoted") == "True" or r.get("in_db_live") == "True"))
        (corpus_same if side == "same" else corpus_far).add(base)

    # Active-trick notation for every candidate base.
    notation: dict[str, str] = {}
    category: dict[str, str] = {}
    active: set[str] = set()
    if DB.exists():
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
        for slug, op, cat, act in con.execute(
            "SELECT slug, operational_notation, category, is_active FROM freestyle_tricks"
        ):
            if act == 1:
                active.add(slug)
            if op:
                notation[slug] = op
            category[slug] = cat or ""
        con.close()

    bases = sorted({b for *_, b, _, _ in [(p) for p in positional_names]} | corpus_same | corpus_far | fm_ss_bases)
    bases = sorted({b for b in bases if b})

    def classify(base: str):
        ev = []
        op = notation.get(base, "")
        ld = leading_dex_side(op) if op else None
        term = terminal_surface(op) if op else None
        same_marked = base in fm_ss_bases or base in corpus_same
        far_marked = base in corpus_far
        if ld == "OP":
            ev.append("leading dex is OP")
        elif ld == "SAME":
            ev.append("leading dex is SAME")
        elif ld == "AMBIG":
            ev.append("leading dex is SAME/OP (ambiguous in notation)")
        if same_marked:
            ev.append("corpus documents a same-side form (marked)")
        if far_marked:
            ev.append("corpus documents a far/op form (marked)")
        if term:
            ev.append(f"catch surface {term.lower()} ({'SAME' if term=='CLIP' else 'OP' if term=='TOE' else '?'} by doctrine)")

        # Decision: notation leading-dex is primary; corpus marking corroborates;
        # doctrine is the fallback. Conflicts and double-marking -> unknown.
        # Confidence: HIGH = notation leading-dex explicit; MED = ambiguous/absent
        # notation resolved by corpus marking + doctrine; LOW = single corpus signal.
        op_signals = (ld == "OP") + (same_marked and not far_marked)
        same_signals = (ld == "SAME") + (far_marked and not same_marked)
        if same_marked and far_marked:
            return "UNKNOWN", "n/a", ev + ["both same-side AND far forms documented"]
        if ld == "OP" and not same_signals:
            return "OP", "HIGH", ev
        if ld == "SAME" and not op_signals:
            return "SAME", "HIGH", ev
        if ld == "AMBIG" and same_marked and not far_marked:
            return "OP", "MED", ev   # ambiguous notation resolved by corpus marking
        if op_signals and not same_signals:
            conf = "MED" if term == "TOE" else "LOW"
            return "OP", conf, ev
        if same_signals and not op_signals:
            conf = "MED" if (term == "CLIP" or base.endswith("clipper")) else "LOW"
            return "SAME", conf, ev
        # Fallbacks for surface-only / no-dex bases.
        if not op and term is None and base in active and ("clip" in base or base.endswith("clipper")):
            return "SAME", "MED", ev + ["clipper-led base, no OP dex (doctrine SAME)"]
        if op_signals and same_signals:
            return "UNKNOWN", "n/a", ev + ["conflicting signals"]
        return "UNKNOWN", "n/a", ev or ["no notation, no corpus marking"]

    pol: dict[str, tuple[str, str, list[str]]] = {b: classify(b) for b in bases}
    groups = defaultdict(list)
    conf_count = defaultdict(lambda: Counter())
    for b, (p, conf, ev) in pol.items():
        groups[p].append((b, conf, ev))
        conf_count[p][conf] += 1

    # Polarity-aware positional re-audit.
    reaudit = []
    for slug, name, base, side, canon in positional_names:
        p = pol.get(base, ("UNKNOWN", "n/a", []))[0]
        if p == "UNKNOWN":
            verdict = "polarity-unknown"
        elif (p == "OP" and side == "far") or (p == "SAME" and side == "same"):
            verdict = "ALIAS (matches base default)"
        else:
            verdict = "DISTINCT variant"
        reaudit.append((slug, name, base, side, p, verdict, canon))

    vc = Counter(v.split(" ")[0] for *_, v, _ in reaudit)

    L = []
    L.append("# Base-trick default-side polarity + positional re-audit (2026-06-23)\n")
    L.append("Read-only. Corrects the neutrality assumption: bases are not side-neutral.\n")
    L.append("Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/polarity.py`\n")
    L.append("Signals: (1) leading-dex SAME/OP in canonical op_notation, (2) corpus marking "
             "(which positional spelling is documented = the deviation), (3) catch-surface doctrine.\n")
    for key, title in [("OP", "1. Bases that default to OP / far"),
                       ("SAME", "2. Bases that default to SAME / near"),
                       ("UNKNOWN", "3. Unknown default")]:
        items = sorted(groups.get(key, []))
        cc = conf_count.get(key, Counter())
        conf_note = f" — confidence: HIGH {cc['HIGH']}, MED {cc['MED']}, LOW {cc['LOW']}" if key != "UNKNOWN" else ""
        L.append(f"## {title} ({len(items)}){conf_note}\n")
        if key == "OP":
            L.append("=> a `far-X` name is an ALIAS of X; `same-side-X` is the distinct variant. "
                     "HIGH = canonical notation leads with an OP dex; LOW = inferred only from a "
                     "documented same-side form.\n")
        elif key == "SAME":
            L.append("=> a `same-side-X` name is an ALIAS of X; `far-X` is the distinct variant. "
                     "HIGH = notation leads SAME; MED = clipper-led doctrine; LOW = inferred only "
                     "from a documented far form.\n")
        L.append("| base | conf | active | evidence |")
        L.append("|---|:--:|:--:|---|")
        for b, conf, ev in items:
            L.append(f"| `{b}` | {conf} | {'Y' if b in active else ''} | {'; '.join(ev)} |")
        L.append("")
    L.append("## 4. Polarity-aware positional re-audit\n")
    L.append(f"- ALIAS (qualifier matches base default; redundant, not a new trick): **{vc['ALIAS']}**")
    L.append(f"- DISTINCT variant (qualifier opposes base default): **{vc['DISTINCT']}**")
    L.append(f"- Polarity-unknown (cannot decide until base polarity is set): **{vc['polarity-unknown']}**\n")
    L.append("### Batch-1 re-read under polarity\n")
    B1 = ["blender-same-side", "butterfly-same-side", "far-butterfly",
          "stepping-clipper-same-side", "stepping-osis-same-side", "surging-ss-osis"]
    L.append("| entry | base | base default | verdict |")
    L.append("|---|---|:--:|---|")
    rmap = {s: (base, p, v) for s, n, base, side, p, v, c in reaudit}
    for b in B1:
        base = strip_side(b)
        p = pol.get(base, ("UNKNOWN", "n/a", []))[0]
        side = positional_side(b)
        if p == "UNKNOWN":
            v = "polarity-unknown"
        elif (p == "OP" and side == "far") or (p == "SAME" and side == "same"):
            v = "ALIAS (matches default)"
        else:
            v = "DISTINCT variant"
        L.append(f"| `{b}` | `{base}` | {p} | {v} |")
    L.append("")
    L.append("### Full positional re-audit table\n")
    L.append("| slug | base | asserts | base default | verdict | already-canonical |")
    L.append("|---|---|:--:|:--:|---|:--:|")
    for slug, name, base, side, p, v, canon in sorted(reaudit, key=lambda x: (x[4], x[2], x[0])):
        L.append(f"| `{slug}` | `{base}` | {side} | {p} | {v} | {'Y' if canon else ''} |")
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")

    print(f"bases={len(bases)}  OP={len(groups['OP'])} SAME={len(groups['SAME'])} UNKNOWN={len(groups['UNKNOWN'])}")
    print(f"positional re-audit: ALIAS={vc['ALIAS']} DISTINCT={vc['DISTINCT']} unknown={vc['polarity-unknown']}")
    print(f"wrote {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
