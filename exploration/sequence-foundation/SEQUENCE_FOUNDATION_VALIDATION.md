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

## Comparison table (editorial vs located 375-chain corpus)

| Metric | Editorial | 375-chain | delta |
|---|---|---|---|
| Chains | 395 | 375 | -5% |
| Whirl mentions | 150 | 99 | -34% |
| Swirl mentions | 96 | 31 | -68% |
| blurry whirl mentions | 89 | 70 | -21% |
| Torque mentions | 78 | 40 | -49% |
| Ripwalk mentions | 58 | 45 | -22% |
| Butterfly mentions | 56 | 42 | -25% |
| Wilk diversity | 30 | 21 | -30% |
| Penske diversity | 18 | 9 | -50% |

The deltas are non-uniform (-5% to -68%). A simple "20 missing chains" would drop every
metric by roughly the same -5%, so that is ruled out.

## Diagnosis: broader source extraction, not missing chains or normalization

The frozen editorial aggregate survives at `FOOTBAG_DATA/freestyle_insights.csv` (it carries
the exact `freestyleEditorial.ts` numbers, including per-trick event coverage). The raw
per-sequence corpus that produced it does NOT survive; the only raw export present is a
leaner re-run, and FOOTBAG_DATA git history shows no fuller version.

The decisive signal is COVERAGE, not counts:

| | whirl mentions | whirl players | whirl events |
|---|---|---|---|
| editorial | 150 | 86 | 54 |
| current corpus | 99 | 64 | 45 |

Player and event coverage both dropped (86 -> 64 players, 54 -> 45 events). Normalization
cannot reduce how many distinct players/events a trick spans; only a narrower source
extraction can. So the editorial run **covered more events and players** (a broader
extraction / additional sources merged in). The current corpus is a narrower re-run, which
is why every count lands at roughly two thirds of editorial.

## Decision (the raw 395 corpus is unrecoverable from the repos)

C2 needs a raw corpus that reproduces the live page. Since that corpus is gone, the choices:

1. **Recover or regenerate the fuller corpus** — re-run the FOOTBAG_DATA noise-mining
   extraction at the original breadth (the ~54-event whirl coverage), or supply the export
   from wherever the editorial run was actually computed. Then re-run `validate.py`; if it
   reproduces, proceed to C2. Recommended if the broader source data still exists.
2. **Re-baseline deliberately** — regenerate the constants from the present 375-chain corpus
   and make those live via C2. The page numbers drop (whirl 150 -> 99), but become live,
   reproducible, and honest. A visible, documented change, not a silent one.
3. **Stop at Phase B** — keep the honest reframe already shipped; leave the constants frozen
   with `freestyle_insights.csv` as their provenance. The page is truthful as-is; no C2/E.

C2 (schema + loader + live re-point) and E (dictionary injection) remain blocked pending
this call.
