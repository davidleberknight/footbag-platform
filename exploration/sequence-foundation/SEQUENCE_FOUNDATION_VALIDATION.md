# Phase C1 — sequence-corpus validation gate

## Result: GATE NOT PASSED with the currently-located corpus

The de-risking gate (reproduce the frozen Insights editorial numbers from the imported
sequence corpus before committing to permanent schema) ran against the sequence export
present in the sibling `FOOTBAG_DATA` repo. Reproduce with
`python3 exploration/sequence-foundation/validate.py`.

**What reproduces:** the rankings. The computed top players match the editorial order
(Mariusz Wilk, Honza Weber, Julien Appolonio, Stefan Siegert all in the computed top-8,
in order), and whirl is the leading trick, as on the live page.

**What does NOT reproduce:** the absolute counts. The corpus present (375 chains) yields
roughly half the editorial magnitudes:

| metric | computed (this corpus) | editorial (live page) |
|---|---|---|
| whirl mentions | 99 exact / 197 component | 150 |
| swirl mentions | 31 | 96 |
| torque mentions | 40 | 78 |
| Mariusz Wilk distinct tricks | 21 | 30 |
| Jim Penske distinct tricks | 9 | 18 |

Neither exact-token counting nor component (substring) counting matches the editorial
magnitudes. The editorial constants cite **395 sequences**; the located file
(`out/noise_features/noise_trick_sequences.csv`) holds **375 chains** but with materially
lower per-trick counts, so the gap is not a small sampling difference. The editorial
numbers were computed from a **fuller or differently-normalized run** than what is in
`FOOTBAG_DATA` today.

## Decision

Per the plan, the gate failing means: **stop, reconcile the corpus before C2.** Do not
create the permanent `freestyle_sequences` schema or re-point the Insights page to live
queries yet. Doing so would make the published numbers change (whirl 150 -> 99, etc.),
which would be a truthfulness regression, not the intended improvement.

## What unblocks C2

One of:

1. **Supply the corpus the editorial was actually computed from** (the fuller 395-sequence
   run). The note that "the data can be brought over from another repo" likely refers to
   this fuller export; the 375-chain file present looks like an earlier run. Re-run
   `validate.py` against it; if magnitudes reproduce within tolerance, proceed to C2.
2. **Or** confirm the exact normalization/decomposition methodology the offline pipeline
   used (component vs exact, which compounds fold into which base) and re-derive the
   editorial constants from the present corpus, accepting the new numbers as the live
   baseline (a deliberate re-baselining of the page, not a silent change).

Until then C2 (permanent schema + loader + live re-point) and E (dictionary injection)
remain blocked. Phase B already reframed the page honestly using the existing constants,
so the page is truthful in the meantime.
