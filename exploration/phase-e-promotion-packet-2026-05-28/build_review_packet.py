#!/usr/bin/env python3
"""Phase E — promotion review packet (read-only artifact generation).

Turns the Tier-1 + A0 mechanically-derivable candidates into a curator-review
packet that is easy to approve in waves. NO promotions, NO alias merges, NO
parser/DB/route changes — pure read over the Phase E CSVs.

Inputs (exploration/phase-e-implementation-2026-05-28/):
  A0_EXTRAPOLATION.csv      — per-name structural reading + provisional ADD + confidences
  CLASSIFIED_UNIVERSE.csv   — category / ecosystem / parent-family / publication_status
  promotion_tier{1..5}_*.csv + alias_collapse_candidates.csv — tier labels
  doctrine_blocked.csv      — primary block ecosystem + blocking question

Outputs (this directory):
  REVIEW_PACKET.md
  promotion_candidates_clean.csv
  promotion_candidates_curator_confirm.csv
  promotion_candidates_deferred.csv
  ecosystem_wave_plan.md

Six buckets (each candidate in exactly one):
  1 clean mechanical          → clean.csv
  2 high-confidence confirm    ┐
  3 parser-derived / A0        ┘→ curator_confirm.csv
  4 doctrine-sensitive         ┐
  5 alias-collapse             ├→ deferred.csv (deferral_bucket distinguishes)
  6 junk / observational-only  ┘

JOB: the SEMANTIC JOB (canonical name uppercased — the documented mechanical
convention) is proposed. OPERATIONAL bracket notation is NOT fabricated; it is
authored at promotion time via curator-gated chassis substitution.
"""
from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from pathlib import Path

IMPL = Path(__file__).resolve().parents[1] / "phase-e-implementation-2026-05-28"
OUT = Path(__file__).resolve().parent

# ecosystem grouping (collapse triage tags → the curator's wave groups)
ECO_GROUP = {
    "pixie": "pixie", "fairy": "fairy", "stepping": "stepping",
    "quantum": "quantum", "atomic": "atomic", "ducking": "ducking",
    "spinning": "spinning/gyro", "gyro-spyro": "spinning/gyro", "inspinning": "spinning/gyro",
    "symposium": "symposium/paradox", "paradox": "symposium/paradox",
    "whirl-swirl": "whirl/osis/other", "blender-torque": "whirl/osis/other",
    "dragon-rake": "whirl/osis/other", "rail-rooted": "whirl/osis/other",
    "eclipse-hop-over": "whirl/osis/other", "dlo-double-down": "whirl/osis/other",
    "blurry-furious": "blurry/furious", "weaving": "weaving",
    "pogo": "pogo", "shooting": "shooting",
}
ECO_PRIORITY = ["pixie", "fairy", "stepping", "quantum", "atomic", "ducking",
                "spinning/gyro", "symposium/paradox", "whirl/osis/other",
                "blurry/furious", "weaving", "pogo", "shooting"]


def slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower())
    return s.strip("-")


def read_csv(p: Path) -> list[dict]:
    with p.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def eco_group(eco_field: str) -> str:
    groups = {ECO_GROUP.get(e) for e in eco_field.split("|") if e and e in ECO_GROUP}
    for g in ECO_PRIORITY:
        if g in groups:
            return g
    return "(unclassified)"


def main() -> None:
    a0 = {r["slug"]: r for r in read_csv(IMPL / "A0_EXTRAPOLATION.csv")}
    classified = {r["slug"]: r for r in read_csv(IMPL / "CLASSIFIED_UNIVERSE.csv")}

    tier_of: dict[str, str] = {}
    for fn, label in [("promotion_tier1_mechanical.csv", "T1"),
                      ("promotion_tier2_curator_review.csv", "T2"),
                      ("promotion_tier3_doctrine_blocked.csv", "T3"),
                      ("promotion_tier4_observational_only.csv", "T4"),
                      ("promotion_tier5_junk.csv", "T5"),
                      ("alias_collapse_candidates.csv", "alias")]:
        for r in read_csv(IMPL / fn):
            tier_of[r["slug"]] = label

    doctrine_info = {r["slug"]: (r["primary_block_ecosystem"], r["blocking_question"])
                     for r in read_csv(IMPL / "doctrine_blocked.csv")}

    clean, confirm, deferred = [], [], []
    bucket_counter: Counter[int] = Counter()
    eco_matrix: dict[str, Counter[str]] = defaultdict(Counter)

    for slug, a in a0.items():
        c = classified.get(slug, {})
        cat = c.get("category", "")
        pub = c.get("publication_status", "")
        fc = a["failure_class"]
        dc = a["doctrine_confidence"]
        mech = a["mechanically_derivable"] == "True"
        struct = a["structurally_readable"] == "True"
        pconf = a["parser_confidence"]
        add = a["provisional_add"].strip()
        src_vals = {v.strip() for v in a["source_adds"].split(",") if v.strip()}
        conflict = bool(add) and bool(src_vals) and add not in src_vals
        corrob = bool(add) and add in src_vals
        self_atom = "[self-atom]" in a["decomposition"]   # name reduces to an existing canonical
        has_mod = bool(a["modifier_stack"].strip())        # a real modifier applied to a base
        eco = eco_group(c.get("ecosystems", ""))
        cleaned = a["cleaned_for_parse"]
        prop_slug = slugify(cleaned) if cleaned else slug
        prop_job = cleaned.upper() if cleaned else ""

        # ── bucket assignment (priority-ordered; one bucket per row) ──
        if cat == "B":
            bucket = 5
        elif cat == "E" or fc == "folk-name-opacity":
            bucket = 6
        elif dc in ("blocked", "policy-dependent"):
            bucket = 4
        elif self_atom:
            bucket = 5          # name reduces to an existing canonical (positional/directional variant) → collapse, not promote
        elif mech and dc == "stable" and pconf == "high" and has_mod and not conflict:
            bucket = 1          # genuine modifier+base compound, ADD closed, uncontradicted
        elif mech and dc == "stable":
            bucket = 2          # source-ADD conflict, OR base-only/surface (no modifier contribution) → confirm
        elif pub == "first_class_ready":
            bucket = 2          # curator-vetted ready even if A0 couldn't close it
        elif struct:
            bucket = 3          # structure readable, ADD not closed
        else:
            bucket = 6          # unknown-modifier / ambiguous-terminal → not yet interpretable
        bucket_counter[bucket] += 1
        eco_matrix[eco][{1: "clean", 2: "confirm", 3: "confirm",
                         4: "deferred", 5: "deferred", 6: "deferred"}[bucket]] += 1

        base = a["base_trick"]
        mods = a["modifier_stack"]
        common = {
            "name": a["name"], "proposed_slug": prop_slug,
            "source_corpus": a["source_corpus"], "provenance": a["provenance"],
            "proposed_job_semantic": prop_job,
            "proposed_add": add, "add_accounting": a["decomposition"],
            "decomposition": (f"{mods} > {base}" if mods else base),
            "parser_confidence": pconf, "doctrine_confidence": dc,
            "parent_family": c.get("parent_family", ""), "ecosystem": eco,
            "promotion_tier": tier_of.get(slug, ""),
        }

        if bucket == 1:
            why = (f"Mechanically derived: {a['decomposition']}; doctrine-stable; "
                   f"all modifier weights known"
                   + ("; ADD corroborated by source claim" if corrob else
                      ("; no source ADD to corroborate" if not src_vals else "")))
            clean.append({**common, "reason": why})
        elif bucket in (2, 3):
            if bucket == 2 and mech and conflict:
                why = (f"Derived ADD {add} but source claims {sorted(src_vals)} — "
                       "curator adjudicates the divergence")
                sub = "2-confirm-add-divergence"
            elif bucket == 2 and mech and not has_mod:
                why = (f"Base resolves to '{base}' but no modifier applied — surface/positional "
                       "terminal not reflected in ADD; curator confirms reading")
                sub = "2-confirm-base-only"
            elif bucket == 2:
                why = "Curator-vetted (publication_status=first_class_ready); A0 did not close ADD — confirm reading"
                sub = "2-confirm-curator-ready"
            else:
                miss = a["missing_modifier_weights"]
                why = ("Structure readable but ADD not closed: "
                       + (f"unregistered modifier weight ({miss})" if miss
                          else f"{fc or 'base ADD unresolved'}"))
                sub = "3-parser-derived"
            confirm.append({**common, "confirm_class": sub, "reason": why})
        else:
            if bucket == 4:
                db = doctrine_info.get(slug, (eco, "curator/Red ruling pending"))
                dbucket, why = "doctrine-sensitive", f"Doctrine-blocked ({db[0]}): {db[1]}"
            elif bucket == 5:
                dbucket = "alias-collapse"
                why = (f"Positional/directional variant resolving to existing canonical '{base}' "
                       "— collapse, not a new trick" if self_atom
                       else "Alias / compression candidate — collapse to canon, do not promote")
            else:
                dbucket = "junk-or-observational-only"
                why = ("Folk-name opaque (no compositional structure)"
                       if fc == "folk-name-opacity" or cat == "E"
                       else f"Not yet interpretable: {fc or 'no recognizable base'}")
            deferred.append({
                "name": a["name"], "slug": slug, "source_corpus": a["source_corpus"],
                "ecosystem": eco, "deferral_bucket": dbucket, "failure_class": fc,
                "doctrine_confidence": dc, "reason": why,
            })

    # ── write CSVs ──
    clean_cols = ["name", "proposed_slug", "source_corpus", "provenance",
                  "proposed_job_semantic", "proposed_add", "add_accounting",
                  "decomposition", "parser_confidence", "doctrine_confidence",
                  "parent_family", "ecosystem", "promotion_tier", "reason"]
    confirm_cols = clean_cols[:1] + ["confirm_class"] + clean_cols[1:]
    deferred_cols = ["name", "slug", "source_corpus", "ecosystem",
                     "deferral_bucket", "failure_class", "doctrine_confidence", "reason"]

    def w(path, rows, cols):
        with (OUT / path).open("w", encoding="utf-8", newline="") as f:
            wr = csv.DictWriter(f, fieldnames=cols, quoting=csv.QUOTE_ALL, extrasaction="ignore")
            wr.writeheader()
            wr.writerows(rows)

    clean.sort(key=lambda r: (r["ecosystem"], r["proposed_add"] or "9", r["name"].lower()))
    confirm.sort(key=lambda r: (r["confirm_class"], r["ecosystem"], r["name"].lower()))
    deferred.sort(key=lambda r: (r["deferral_bucket"], r["ecosystem"], r["name"].lower()))
    w("promotion_candidates_clean.csv", clean, clean_cols)
    w("promotion_candidates_curator_confirm.csv", confirm, confirm_cols)
    w("promotion_candidates_deferred.csv", deferred, deferred_cols)

    # ── REVIEW_PACKET.md ──
    L = []
    L.append("# Phase E — Promotion Review Packet")
    L.append("")
    L.append("**Read-only.** No promotions, alias merges, parser/DB/route changes. This packet "
             "answers: *what can we safely promote next, in what order, and why?*")
    L.append("")
    L.append(f"Candidate universe: **{len(a0)}** unresolved observational names (A0 pass).")
    L.append("")
    L.append("## Buckets")
    L.append("")
    L.append("| # | Bucket | Count | Goes to |")
    L.append("|---|---|---:|---|")
    L.append(f"| 1 | Clean mechanical promotions | {bucket_counter[1]} | `promotion_candidates_clean.csv` |")
    L.append(f"| 2 | High-confidence, curator-confirm | {bucket_counter[2]} | `promotion_candidates_curator_confirm.csv` |")
    L.append(f"| 3 | Parser-derived / A0 extrapolated | {bucket_counter[3]} | `promotion_candidates_curator_confirm.csv` |")
    L.append(f"| 4 | Doctrine-sensitive exclusions | {bucket_counter[4]} | `promotion_candidates_deferred.csv` |")
    L.append(f"| 5 | Alias-collapse candidates | {bucket_counter[5]} | `promotion_candidates_deferred.csv` |")
    L.append(f"| 6 | Junk / observational-only | {bucket_counter[6]} | `promotion_candidates_deferred.csv` |")
    L.append("")
    L.append("## Per-ecosystem matrix (promotable vs deferred)")
    L.append("")
    L.append("| Ecosystem | clean | confirm | deferred |")
    L.append("|---|---:|---:|---:|")
    for g in ECO_PRIORITY + ["(unclassified)"]:
        if g in eco_matrix:
            m = eco_matrix[g]
            L.append(f"| {g} | {m['clean']} | {m['confirm']} | {m['deferred']} |")
    L.append("")
    L.append("## Per-field contract (every candidate row carries)")
    L.append("")
    L.append("name · source(s) · proposed canonical slug · proposed **semantic** JOB "
             "(name uppercased; operational bracket notation deferred to promotion) · "
             "proposed ADD + accounting · decomposition · parser_confidence · "
             "doctrine_confidence · parent-family/ecosystem · promotion tier · "
             "reason it is safe / needs confirm.")
    L.append("")
    L.append("## Clean-bucket examples by ecosystem (full lists in the CSV)")
    L.append("")
    by_eco_clean: dict[str, list[dict]] = defaultdict(list)
    for r in clean:
        by_eco_clean[r["ecosystem"]].append(r)
    for g in ECO_PRIORITY:
        rows = by_eco_clean.get(g, [])
        if not rows:
            continue
        L.append(f"### {g} — {len(rows)} clean")
        L.append("")
        L.append("| name | ADD | accounting |")
        L.append("|---|---:|---|")
        for r in rows[:8]:
            L.append(f"| {r['name']} | {r['proposed_add']} | `{r['add_accounting']}` |")
        if len(rows) > 8:
            L.append(f"| … +{len(rows)-8} more | | |")
        L.append("")
    L.append("## Notation + family discipline")
    L.append("")
    L.append("- **JOB:** only the semantic JOB (uppercased canonical name) is proposed — the "
             "documented mechanical convention. Operational bracket notation is authored at "
             "promotion via chassis substitution; not fabricated here.")
    L.append("- **Family skeleton respected:** `parent_family` resolves children to the 8 "
             "canonical parents; retired route-out families are never regenerated.")
    L.append("- **ADD:** provisional, parser-derived; corroborated against source claims where a "
             "source ADD exists. Divergences route to curator-confirm, never silently overwritten.")
    (OUT / "REVIEW_PACKET.md").write_text("\n".join(L) + "\n", encoding="utf-8")

    # ── ecosystem_wave_plan.md ──
    W = []
    W.append("# Phase E — Ecosystem Wave Plan")
    W.append("")
    W.append("Recommended promotion order = clean-heavy, doctrine-light first. Each wave is "
             "curator-reviewed before the next. Deferred buckets (doctrine / alias / junk) are "
             "NOT in the wave plan.")
    W.append("")
    # rank promotable ecosystems by clean desc, then confirm desc, excluding pure-doctrine ones
    DOCTRINE_ECOS = {"blurry/furious", "weaving", "pogo", "shooting"}
    rankable = [(g, eco_matrix[g]) for g in eco_matrix
                if g not in DOCTRINE_ECOS and (eco_matrix[g]["clean"] or eco_matrix[g]["confirm"])]
    rankable.sort(key=lambda kv: (kv[0] == "(unclassified)", -kv[1]["clean"], -kv[1]["confirm"]))
    W.append("| Wave | Ecosystem | clean | confirm | gating notes |")
    W.append("|---:|---|---:|---:|---|")
    for i, (g, m) in enumerate(rankable, 1):
        note = "low doctrine risk" if m["deferred"] == 0 else f"{m['deferred']} deferred (doctrine/alias/junk) held back"
        W.append(f"| {i} | {g} | {m['clean']} | {m['confirm']} | {note} |")
    W.append("")
    W.append("## Excluded until doctrine rulings")
    W.append("")
    for g in ["blurry/furious", "weaving", "pogo", "shooting"]:
        if g in eco_matrix:
            W.append(f"- **{g}** — {eco_matrix[g]['deferred']} names blocked; awaits Red ruling "
                     "(see `phase-e-implementation-2026-05-28/DOCTRINE_BLOCK_REPORT.md`).")
    W.append("")
    W.append("## Wave mechanics (per existing W1-W9 precedent)")
    W.append("")
    W.append("Per wave: take the clean bucket for the ecosystem → verify each bracket-count == ADD "
             "→ author operational notation by chassis substitution → curator sign-off → promote via "
             "red_additions/red_corrections CSV + loader 19. Curator-confirm rows follow once their "
             "single open question is answered.")
    (OUT / "ecosystem_wave_plan.md").write_text("\n".join(W) + "\n", encoding="utf-8")

    # ── stdout ──
    print("Buckets:", dict(sorted(bucket_counter.items())))
    print(f"  clean.csv:           {len(clean)}")
    print(f"  curator_confirm.csv: {len(confirm)}")
    print(f"  deferred.csv:        {len(deferred)}")
    print("Per-ecosystem (clean/confirm/deferred):")
    for g in ECO_PRIORITY + ["(unclassified)"]:
        if g in eco_matrix:
            m = eco_matrix[g]
            print(f"  {g:<20s} {m['clean']:>4d} / {m['confirm']:>4d} / {m['deferred']:>4d}")
    print("\nWrote REVIEW_PACKET.md, ecosystem_wave_plan.md, 3 CSVs")


if __name__ == "__main__":
    main()
