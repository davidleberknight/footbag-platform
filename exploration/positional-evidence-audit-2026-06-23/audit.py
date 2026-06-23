#!/usr/bin/env python3
"""Corpus + evidence audit of the remaining positional trick names.

Read-only. The doctrine question is settled (same-side == near, far == opposite,
SAME/OP/PDX encode it, X-Dex is a separate receiver-gated rule). The question
here is HISTORICAL EXISTENCE, not mechanical derivability: for each remaining
positional name, what source evidence (if any) attests it as a recognized trick?

Candidate set: positional-NAMED rows in the corpus census that are NOT already
canonical (not promoted, not in the live DB). Each is classified:

  A  Historically documented   - attested in >=1 real source corpus
                                 (footbag.org / FootbagMoves / Stanford /
                                 PassBack / tournament records)
  B  Existing alias / variant  - the form resolves to an established trick
                                 (alias_overlap or equivalent_to set)
  C  Derivable, not evidenced  - no source attestation; exists only as a
                                 doctrine-derivable form
  D  Genuine unresolved conflict - name asserts a side the notation contradicts

A second "derivable-frontier" view probes the relative-side targeting-rule
candidates against corpus attestation, so C is measured rather than assumed.

No staging, no writes outside this report.
"""
from __future__ import annotations
import csv, re, sqlite3
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CU = REPO / "exploration/phase-e-implementation-2026-05-28/CLASSIFIED_UNIVERSE.csv"
PERSLUG = REPO / "exploration/emerging-vocab-audit-2026-06-22/per_slug_classification.csv"
FM_SS = REPO / "legacy_data/out/footbagmoves_inventory_same_side.csv"
FBORG = REPO / "legacy_data/out/scraped_footbag_moves.csv"
DB = REPO / "database/footbag.db"
OUT = Path(__file__).resolve().parent / "REPORT.md"

# Known name/notation conflicts (reconciliation 2026-06-22): name asserts
# same-side but the operational notation shows OP only.
CONFLICTS = {"inspinning-same-side-illusion", "inspinning-same-side-mirage", "whirl-same-side"}

REAL_CORPORA = {"fborg", "footbagmoves", "stanford", "passback"}


def slugify(s: str) -> str:
    s = re.sub(r"\((?:ss|op|opp|opposite|near|far|same[ -]side)\)", "", s, flags=re.I)
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def is_positional_name(name: str) -> bool:
    n = " " + name.lower().replace("-", " ") + " "
    return bool(re.search(r"\(?\b(ss|op|opp|opposite|near|far)\b\)?|same\s+side", n))


def is_positional_slug(slug: str) -> bool:
    segs = slug.split("-")
    if any(s in {"ss", "op", "opp", "opposite", "near", "far"} for s in segs):
        return True
    return "same-side" in slug or "opposite-side" in slug


def sources_of(row: dict) -> set[str]:
    raw = (row.get("sources") or "") + "," + (row.get("source_corpus") or "")
    out = set()
    for tok in re.split(r"[,;|]", raw):
        tok = tok.strip().lower()
        if tok and tok != "multi":
            out.add(tok)
    return out


def main() -> None:
    cu = list(csv.DictReader(open(CU)))

    # ── extra-corpus evidence sets ──
    fm_ss = {slugify(r["display_name"]) for r in csv.DictReader(open(FM_SS))}
    fborg = set()
    for r in csv.DictReader(open(FBORG)):
        for k in ("source_name", "alt_name"):
            if r.get(k):
                fborg.add(slugify(r[k]))
    rec_pos = set()
    alias_slugs: set[str] = set()
    active_slugs: set[str] = set()
    if DB.exists():
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
        for (nm,) in con.execute("SELECT DISTINCT trick_name FROM freestyle_records WHERE trick_name IS NOT NULL"):
            if nm and is_positional_name(nm):
                rec_pos.add(slugify(nm))
        for (s,) in con.execute("SELECT alias_slug FROM freestyle_trick_aliases"):
            if s:
                alias_slugs.add(s.strip())
        for (s,) in con.execute("SELECT slug FROM freestyle_tricks WHERE is_active=1"):
            if s:
                active_slugs.add(s.strip())
        con.close()

    def strip_side(slug: str) -> str:
        segs = [s for s in slug.split("-") if s not in {"ss", "near", "far", "op", "opp", "opposite", "same", "side"}]
        return "-".join(segs)

    # ── candidate set: positional-named, NOT already canonical ──
    cands = [r for r in cu
             if is_positional_name(r["name"])
             and r.get("promoted") != "True"
             and r.get("in_db_live") != "True"]

    rows = []
    for r in cands:
        slug = (r["slug"] or "").strip()
        name = r["name"]
        srcs = sources_of(r)
        real = srcs & REAL_CORPORA
        in_fm_ss = slugify(name) in fm_ss or slug in fm_ss
        in_fborg = slugify(name) in fborg or slug in fborg
        in_rec = slugify(name) in rec_pos or slug in rec_pos
        alias = (
            r.get("alias_overlap") == "True"
            or bool((r.get("equivalent_to") or "").strip())
            or "alias" in (r.get("in_db") or "").lower()
            or slug in alias_slugs
            or slugify(name) in alias_slugs
        )
        try:
            n = int(r.get("n_sources") or 0)
        except ValueError:
            n = 0

        evidenced = bool(real) or in_fm_ss or in_fborg or in_rec or n >= 1
        # Informational: the qualifier-stripped base is itself an active canonical
        # (the positional form may read as a naming variant of that base).
        base_active = strip_side(slug) in active_slugs and strip_side(slug) != slug

        if slug in CONFLICTS:
            cat = "D"
        elif alias:
            cat = "B"
        elif evidenced:
            cat = "A"
        else:
            cat = "C"
        rows.append(dict(slug=slug, name=name, cat=cat, srcs=sorted(real),
                         n=n, fm_ss=in_fm_ss, fborg=in_fborg, rec=in_rec,
                         alias=alias, base_active=base_active,
                         equiv=(r.get("equivalent_to") or "").strip()))

    bycat = Counter(r["cat"] for r in rows)
    src_in_A = Counter(s for r in rows if r["cat"] == "A" for s in r["srcs"])
    multi_A = sum(1 for r in rows if r["cat"] == "A" and r["n"] >= 2)
    rec_A = sum(1 for r in rows if r["cat"] == "A" and r["rec"])
    fmss_A = sum(1 for r in rows if r["cat"] == "A" and r["fm_ss"])
    base_active_A = sum(1 for r in rows if r["cat"] == "A" and r["base_active"])

    # ── derivable-frontier probe: targeting-rule candidates vs corpus attestation ──
    cu_slugs = {(r["slug"] or "").strip() for r in cu}
    cu_names = {slugify(r["name"]) for r in cu}
    perslug = list(csv.DictReader(open(PERSLUG)))
    targeting = [r for r in perslug
                 if "targeting Rule" in (r.get("reason") or "")]
    probe = []
    for r in targeting:
        slug = (r["slug"] or "").strip()
        attested = slug in cu_slugs or slug in cu_names or slug in fm_ss or slug in fborg or slug in rec_pos
        probe.append((slug, attested))
    probe_attested = sum(1 for _, a in probe if a)
    probe_derivable_only = len(probe) - probe_attested

    # ── emit report ──
    L = []
    L.append("# Positional names — corpus & evidence audit (2026-06-23)\n")
    L.append("Read-only. Doctrine settled; question is historical existence, not derivability.\n")
    L.append(f"Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/audit.py`\n")
    L.append("## Candidate set\n")
    L.append("Positional-NAMED rows in the corpus census (`CLASSIFIED_UNIVERSE.csv`) that are "
             "not already canonical (not promoted, not in the live DB).\n")
    L.append(f"- Total remaining positional candidates: **{len(rows)}**\n")
    L.append("## Classification counts\n")
    L.append("| Class | Meaning | Count |")
    L.append("|---|---|---:|")
    L.append(f"| A | Historically documented | **{bycat['A']}** |")
    L.append(f"| B | Existing alias / naming variant | **{bycat['B']}** |")
    L.append(f"| C | Derivable but not evidenced | **{bycat['C']}** |")
    L.append(f"| D | Genuine unresolved conflict | **{bycat['D']}** |")
    L.append("")
    L.append("## A — historical evidence breakdown\n")
    L.append(f"- Multi-source corroborated (n_sources >= 2): **{multi_A}**")
    L.append(f"- Attested in tournament records: **{rec_A}**")
    L.append(f"- In the FootbagMoves same-side inventory: **{fmss_A}**")
    L.append(f"- Alias-suspect (qualifier-stripped base is itself an active canonical): **{base_active_A}** "
             f"(documented, but may read as a naming variant of the base rather than a distinct trick; curator call)")
    L.append("- By source corpus (A rows, a name may have several):")
    for s, c in src_in_A.most_common():
        L.append(f"  - {s}: {c}")
    L.append("")
    L.append("## D — genuine conflicts\n")
    L.append("Name asserts same-side; operational notation shows OP only.\n")
    for r in rows:
        if r["cat"] == "D":
            L.append(f"- `{r['slug']}` — {r['name']}")
    L.append("- `whirl-same-side` — Whirl (same side) (the third conflict; already in the live DB, "
             "so outside the remaining-candidate set, but still an unresolved name/notation conflict)")
    L.append("")
    L.append("## Derivable-frontier probe (targeting-rule candidates vs corpus)\n")
    L.append("The relative-side targeting rule yields mechanically-derivable forms. This probe "
             "checks each against corpus attestation, so C is measured, not assumed.\n")
    L.append(f"- Targeting-rule candidates probed: **{len(probe)}**")
    L.append(f"- Corpus-attested (would be A): **{probe_attested}**")
    L.append(f"- Derivable-only, no attestation (would be C): **{probe_derivable_only}**")
    L.append("")
    L.append("### Targeting candidates with NO corpus attestation (true C — do not author):")
    for slug, a in sorted(probe):
        if not a:
            L.append(f"- `{slug}`")
    L.append("")
    L.append("> Caveat: attestation is matched on the exact positional slug/name. A C entry may be "
             "an alternative SPELLING of a form attested under another spelling (the same spelling "
             "collisions flagged earlier); slug normalization is frozen, so these are reported as-is.")
    L.append("")
    # ── batch-1 cross-check ── the 6 already-staged entries vs attestation.
    BATCH1 = ["blender-same-side", "butterfly-same-side", "far-butterfly",
              "stepping-clipper-same-side", "stepping-osis-same-side", "surging-ss-osis"]
    cu_slugs2 = {(r["slug"] or "").strip() for r in cu}
    cu_names2 = {slugify(r["name"]) for r in cu}
    L.append("## Batch-1 cross-check (already staged to red_additions; NOT yet in live DB)\n")
    L.append("Re-checking the 6 entries already authored against historical attestation, now that "
             "the bar is evidence rather than derivability:\n")
    L.append("| slug | corpus-attested? | class |")
    L.append("|---|:--:|:--:|")
    for b in BATCH1:
        att = b in cu_slugs2 or b in cu_names2 or b in fm_ss or b in fborg or b in rec_pos
        L.append(f"| `{b}` | {'YES' if att else 'NO'} | {'A' if att else 'C'} |")
    L.append("")
    L.append("`far-butterfly` and `stepping-clipper-same-side` have no standalone historical "
             "attestation: \"far butterfly\" / \"stepping clipper (ss)\" appear only as substrings "
             "inside larger compound names, never as a documented trick on their own. They were "
             "authored on derivability alone. None of the 6 are loaded into the live DB yet, so they "
             "remain pullable from `red_additions` before any rebuild. (Report only; nothing changed.)")
    L.append("")
    L.append("## Full candidate table\n")
    L.append("| slug | class | name | sources | n | rec | fm_ss | alias→ |")
    L.append("|---|---|---|---|--:|:--:|:--:|---|")
    for r in sorted(rows, key=lambda x: (x["cat"], x["slug"])):
        L.append(f"| `{r['slug']}` | {r['cat']} | {r['name']} | {','.join(r['srcs'])} | "
                 f"{r['n']} | {'Y' if r['rec'] else ''} | {'Y' if r['fm_ss'] else ''} | {r['equiv']} |")
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")

    print(f"candidates={len(rows)}  A={bycat['A']} B={bycat['B']} C={bycat['C']} D={bycat['D']}")
    print(f"probe: n={len(probe)} attested={probe_attested} derivable_only={probe_derivable_only}")
    print(f"wrote {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
