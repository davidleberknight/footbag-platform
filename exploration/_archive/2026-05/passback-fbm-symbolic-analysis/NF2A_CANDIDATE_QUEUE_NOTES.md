# NF-2A candidate queue -- scoring rationale

`NF2A_CANDIDATE_QUEUE.csv` evaluates 28 operator candidates against six non-frequency axes plus observed_count. Frequency is NOT a primary signal. See `feedback_frequency_not_authority.md`.

## Scoring axes

- **observed_count** -- descriptive only. High count means many corpus rows used the operator. Says nothing about whether the operator should be canon.
- **decomposition_clarity** -- `clear` / `partial` / `unclear` / `polysemous`. Can we state what the operator decomposes to? Sailing = Pixie Atomic is clear. Fairy as an unspecified body-trait is unclear.
- **provenance_quality** -- where the evidence comes from. FM Sets-tab + extract is strongest; FM-only single-instance is weakest.
- **red_dependency** -- does adoption require a Red ruling first? Some candidates cascade (Riffing depends on Blurriest depends on Blurry pt12).
- **pedagogical_risk** -- does adopting this operator create cognitive noise? Patronymics (Bubba) and singletons score high.
- **community_drift_risk** -- is this operator FM-author-attached vs broadly used? Spyro 8/8 from FM with zero PB cross-evidence is high.
- **parser_artifact_risk** -- does the apparent frequency reflect scraping or normalization quirks? None of the 28 candidates show this risk; flagged here for completeness.

## Dispositions

| Disposition | Count | Meaning |
|---|---:|---|
| advance-to-evaluation | 5 | Clean decomposition, low cascading risk, single Red question or by-analogy ruling could close it. Sailing, Frantic, Leaning, Hyper, Inspinning. |
| advance-with-caveat | 1 | Pogo (depends on temporal ADD-by-analogy). |
| evaluate-as-alias | 2 | Gyro and Flailing may not be new operators at all -- they may be aliases for existing locked compositions (Spinning ss; Symposium Atomic). |
| defer-pending-other | 6 | Cascades on another Red item. Slaying (sailing), Phasing (fairy), Quasi (far), Riffing (pt12), Smiling (swirling), Terraging (pt12). |
| defer-to-q4-batch | 8 | FM-vocab operators with no decomposition. Fairy, Barraging, Railing, Surging, Neutron, Blazing, Splicing, Surfing. The Q4 Red packet exists for exactly this batch. |
| defer-or-reject | 1 | Jolimont (singleton, toponym-style). |
| reject-as-modifier | 1 | Dragon (polysemous; surface usage might warrant glossary entry, modifier usage does not). |
| reject-pending-evidence | 1 | Bubba (patronymic; community-specific). |
| reject-pending-fm-disambiguation | 1 | Slicing (FM has two definitions; not IFPA's problem until FM curates). |
| defer-pending-fury-reconciliation | 1 | Furious (pt6 vs FM Fury reading). |

## What this queue is NOT

- It is NOT a promotion plan. None of the 28 candidates should be ingested without explicit Red rulings.
- It is NOT ranked by frequency. The five advance-to-evaluation candidates have counts of 7, 2, 3, 0, 3 -- none are top-frequency. The high-frequency Q4-blocked operators (Fairy 29, Gyro 28, Barraging 19) all defer.
- It is NOT a substitute for the Q4 batch. Q4 covers the structural question (do FM-vocab operators get IFPA add_bonus rows at all?); this queue assumes that question is independent of per-operator scoring.

## Highest-confidence advance candidates (single-question Red asks)

1. **Sailing** = Pixie Atomic. Ask Red whether the recursive Sets-tab compositions are observable / pedagogical equivalences worth surfacing in the educational layer (NOT canonical math).
2. **Frantic** = Pixie Quantum. Same shape as Sailing.
3. **Leaning** = Stepping Inspinning. Requires Inspinning to be recognized as Spinning's directional variant.
4. **Hyper** = Rooted Pixie. pt8 already ruled rooted=0; the rest is locked.
5. **Inspinning** = Front Spin. Direction marker; ADD weight by analogy to Spinning.

These five could be bundled into a single Red packet if the curator wants. None unblock the high-frequency Q4-blocked cohort.
