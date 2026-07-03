# freestyle/inputs/observational/

Committed inputs for the observational-layer content generators
(`freestyle/scripts/build_observational_universe_content.py` and
`freestyle/scripts/build_tracked_names_content.py`), which emit
`src/content/freestyleObservationalUniverse.ts` and
`src/content/freestyleTrackedNames.ts`. They live under `freestyle/inputs/`
so the living freestyle pipeline stays self-contained and survives the
`legacy_data/` freeze.

| File | What it is |
|---|---|
| `promotion_candidates_clean.csv` | Phase E promotion packet: mechanically coherent candidates, promotable now |
| `promotion_candidates_curator_confirm.csv` | Phase E promotion packet: candidates awaiting curator confirmation |
| `promotion_candidates_deferred.csv` | Phase E promotion packet: deferred rows with failure/deferral classification |
| `CLASSIFIED_UNIVERSE.csv` | Full classified vocabulary universe (governance states, n_sources corroboration) |
| `RECONCILIATION.csv` | Cross-source vocabulary reconciliation: one row per unique documented name, nine governance states. Hand-maintained via `sed` after promotion waves |
| `SYMBOLIC_GRAMMAR_MASTER.csv` | FootbagMoves + PassBack symbolic-grammar master registry (verbatim `symbolic_notation_raw` per name) |

These files were relocated from their original exploration homes
(`exploration/phase-e-promotion-packet-2026-05-28/`,
`exploration/phase-e-implementation-2026-05-28/`,
`exploration/vocabulary-reconciliation-audit-2026-05-21/`,
`exploration/footbagmoves-federation/`); each of those directories now holds
a `MOVED.md` pointer stub so older citations still resolve. This directory is
the single maintained copy.
