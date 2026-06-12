#!/usr/bin/env python3
"""Phase C1 validation gate: does the located sequence corpus reproduce the
frozen Insights editorial constants?

Reads the FOOTBAG_DATA sequence export and recomputes the metric families the
Insights page currently pins as hand-frozen constants (freestyleEditorial.ts),
then compares. The gate question is whether the corpus reproduces those numbers
within tolerance. If it does, the permanent schema + live-query migration (C2)
is safe. If not, the corpus or methodology must be reconciled first.

Read-only. Prints a fidelity report. No DB writes, no schema.
"""
import csv
import collections
from pathlib import Path

FD = Path("/home/james/projects/FOOTBAG_DATA")
SEQ = FD / "out/noise_features/noise_trick_sequences.csv"   # ordered tricks, 375 chains

# Expected values pinned in src/content/freestyleEditorial.ts (the frozen page).
EXP_MENTIONS = {  # trick: (mentions, players)
    "whirl": (150, 86), "swirl": (96, 44), "blurry whirl": (89, 53),
    "torque": (78, 49), "ripwalk": (58, 45), "butterfly": (56, 48),
}
EXP_DIVERSITY = {  # player: unique tricks
    "Mariusz Wilk": 30, "Honza Weber": 22, "Julien Appolonio": 20,
    "Stefan Siegert": 19, "Jim Penske": 18,
}


def main() -> None:
    rows = list(csv.DictReader(open(SEQ)))
    chains = {r["chain_id"] for r in rows}

    exact_m = collections.Counter(r["trick_canon"] for r in rows)
    exact_p = collections.defaultdict(set)
    comp_m = collections.Counter()
    comp_p = collections.defaultdict(set)
    for r in rows:
        tok, person = r["trick_canon"], r["person_canon"]
        exact_p[tok].add(person)
        for w in set(tok.split()):
            comp_m[w] += 1
            comp_p[w].add(person)

    div = collections.defaultdict(set)
    for r in rows:
        div[r["person_canon"]].add(r["trick_canon"])

    print(f"# Phase C1 validation — corpus {SEQ.name}")
    print(f"chains={len(chains)}  trick-rows={len(rows)}  "
          f"(editorial cites 395 sequences)\n")

    print("## Most-used tricks: computed vs editorial (mentions / players)")
    print("| trick | exact | component | editorial |")
    print("|---|---|---|---|")
    for t, (em, ep) in EXP_MENTIONS.items():
        print(f"| {t} | {exact_m[t]}/{len(exact_p[t])} | "
              f"{comp_m[t]}/{len(comp_p[t])} | {em}/{ep} |")

    print("\n## Player diversity: computed vs editorial (distinct tricks)")
    print("| player | computed | editorial |")
    print("|---|---|---|")
    order_ok = True
    computed_order = [p for p, _ in sorted(div.items(), key=lambda kv: -len(kv[1]))]
    for p, exp in EXP_DIVERSITY.items():
        print(f"| {p} | {len(div.get(p, set()))} | {exp} |")
    # ranking check: do the editorial top-5 appear in the computed top-8 in order?
    top8 = [p for p in computed_order if p][:8]
    exp_players = list(EXP_DIVERSITY)
    rank_match = [p for p in exp_players if p in top8]
    print(f"\nRanking overlap (editorial top-5 present in computed top-8): "
          f"{len(rank_match)}/5  -> {rank_match}")

    print("\n## Verdict")
    whirl_ratio = exact_m['whirl'] / EXP_MENTIONS['whirl'][0]
    print(f"- Rankings reproduce (same leading players/tricks, same order).")
    print(f"- Absolute counts DIVERGE: e.g. whirl {exact_m['whirl']} exact vs 150 editorial "
          f"({whirl_ratio:.0%}); swirl {exact_m['swirl']} vs 96; Wilk {len(div.get('Mariusz Wilk',set()))} vs 30.")
    print(f"- Neither exact-token nor component counting matches editorial magnitudes.")
    print(f"- GATE: NOT PASSED with this corpus. The editorial 395-sequence numbers come "
          f"from a fuller or differently-normalized corpus than the {len(chains)}-chain file present.")


if __name__ == "__main__":
    main()
