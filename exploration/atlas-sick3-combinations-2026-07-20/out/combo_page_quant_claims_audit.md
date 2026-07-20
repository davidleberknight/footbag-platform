# Quantitative-claims audit: every figure rendered on the Combinations page

Audited against exact source artifacts. Three corpora are in play and must not be
conflated:

- **A. The editorial corpus** ("395 sequences across 22 years"): the corpus behind the
  freestyle evolution report, mined by the records scripts; **not present in the repo at
  the claimed size**. The closest located artifact (sequence export in the sibling
  FOOTBAG_DATA prototyping repo) holds 375 chains and reproduces rankings but not
  magnitudes (archived sequence-foundation validation, "GATE NOT PASSED").
- **B. The evolution report** (`legacy_data/inputs/curated/records/FREESTYLE_EVOLUTION_REPORT.md`):
  static prose derived from corpus A; a citation chain, not a regeneration source.
- **C. The Atlas mirror corpus** (this track): 308 records / 117 fully-resolved
  sequences extracted from event result blobs. An INDEPENDENT, smaller sample;
  disagreement with A is not refutation, but it cannot verify A either.

## Per-claim verdicts

| Claim on the page | Source | Regenerable in-repo? | Verdict |
|---|---|---|---|
| "395 sequences across 22 years" (honesty note + launch-node entry) | A | No (375-chain export located, elsewhere) | **Different corpus; replace or re-source.** State the committed corpus's own count once one is committed. |
| Blurry whirl "hub score 0.695" | A (graph metrics) | No | **Remove or replace.** Decimal metric from an absent corpus; the qualitative rank ("strongest launch node") DID reproduce in the archived validation and can stay in words. |
| Whirl "authority score 0.863, PageRank 0.126" | A | No | **Remove or replace** (same reasoning; "strongest attractor" rank reproduced and can stay). |
| Dimwalk "out-degree 23 vs in-degree 15" | A | No | **Remove or replace**; keep the qualitative "throughput trick" claim. |
| blurry whirl -> whirl: "17 documented appearances across 15 players and 14 events, the single most common two-trick transition" | A | No | **Replace or re-source.** Not merely unverifiable: the only in-repo sequence corpus (C) contains this transition ZERO times; C's most common transition is blurry whirl -> paradox symposium whirl (12 records-weighted). The claim likely holds only in corpus A's longer mined chains. |
| smear -> dimwalk: "7 appearances across 7 players" | A | No | **Replace or re-source.** C attests the transition (3 records-weighted) so the qualitative "well-attested" survives; the exact 7/7 does not regenerate. |
| butterfly -> blurry whirl: "3 documented appearances" | A | No | **Replace or re-source.** Zero in C. |
| food processor -> mobius: "3 documented appearances, all 2004-2016" | A | No | **Replace or re-source.** One in C (2007). |
| Greg Solis 22-ADD chain, "7 tricks", "density 3.1", "corpus maximum", "2008" | A (a 7-trick chain cannot come from Sick 3 blobs) | No | **Replace or re-source**; outside C's three-trick scope entirely. |
| Ripwalk "appearing in 45 of 395 sequences" (via report B, if surfaced) | A/B | No | Same class; C shows 12 records-weighted appearances. |
| Density thresholds "5.5 / 5.0 / 4.0 / 3.1", strategy bands ("2-3 tricks averaging 5-6 ADD", "4-7 tricks averaging 3-4 ADD") | A/B analysis prose | No | **Soften to qualitative or re-source.** Analytical constants from the absent corpus. |
| "22 years" (span statements) | A/B | Partially | Consistent with C's year span (2002-2019 observed, wider in A); safe as an approximate span if reworded to cite the committed corpus. |
| Run-quality thresholds (Tiltless 2+, Guiltless 3+, etc.) | Community definitions, not corpus stats | n/a | **Keep.** Definitions, not measurements. |

## Summary

- **Regenerable today:** only the qualitative rankings (blurry whirl = leading launch
  node; whirl = leading attractor; dimwalk = connector), which the archived validation
  reproduced from the located 375-chain export.
- **Different corpus (unverifiable in-repo):** every exact magnitude — the two decimal
  graph metrics, the degree counts, all per-example appearance counts, the 395 total,
  the Solis-chain figures, and the density constants.
- **Must be removed or replaced if the page is to be citable:** the decimal graph
  metrics and the per-example appearance counts, with the blurry whirl -> whirl "single
  most common transition" claim the highest-priority replacement (the only in-repo
  sequence corpus does not contain that transition at all).

No page edits were made. The public Sick 3 section remains unimplemented. The clean
paths forward, in preference order: (1) commit a canonical sequence corpus and
regenerate every figure from it at authoring time; (2) reword the page to qualitative
claims that the archived validation already reproduces; (3) re-source the figures to the
Atlas mirror corpus, accepting its smaller, Sick 3-only scope and re-deriving every
number.
