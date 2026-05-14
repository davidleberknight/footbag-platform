# Auto-Resolvable Conflict Candidates

Conflicts in the audit that can be closed by existing operator policy without a new Red ruling. Each row here is descriptively classified -- the closure is documenting the existing rule, not legislating a new one.

## A. PassBack `dex_count != ADD` metric mismatch (25 rows)

**Rule applied:** PassBack records `passback_dex_count` (number of dexes performed), not ADD. These are different metrics. Direct numeric comparison is unit-confusion, not ontology conflict.

**Resolution:** When the formula run against PB's `passback_technical_name` produces the same ADD as IFPA stated, the row is structurally consistent. The dex_count mismatch is descriptive metadata.

**Closed rows:** 25 PassBack rows under `pb-metric-mismatch-structurally-agree`. Representative examples:

- Barfly, Blender, Bullwhip, Blurriest, Barrage, Catacomb, Drifter, Eclipse, Flux, Mobius, Pickle, Pinwheel, Predator, Tornado, Vortex (and similar)

For each, PB's dex_count differs from IFPA's adds, but our formula on PB's notation gives IFPA's stated ADD. No action needed.

## B. PassBack rows where ADD-from-formula matches (15 rows)

**Rule applied:** Same as A but in cases where dex_count happens to equal IFPA stated (coincidental alignment). Same closure: structurally consistent; no action.

## C. Nuclear-ss cohort (Hurl, Barfry, Godzilla) -- 3 rows

**Rule applied:** SS=+0 universal (Red 2026-05-11 ruling). FM's stated ADD is consistently 1 lower than IFPA's stated ADD on rows of the shape `Nuclear ss <base>`. The FM-IFPA delta is FM convention, not arithmetic error.

**Resolution:** Already documented in `FM_MATH_DIVERGENCES.csv` as `federation_math_divergence`. The rule reads: preserve FM stated as folk-evidence; do not adopt FM ADD into IFPA. Note: Hurl, Barfry, Godzilla are NOT in `freestyle_tricks` -- they exist only as FM folk names.

**No action needed.** The audit corroborates the existing classification.

## D. Bladerunner / Merlin FM-over divergences (2 rows)

**Rule applied:** FM stated diverges from IFPA-additive formula by +1 (FM-over direction). The IFPA-side formula is computable cleanly with locked operators; FM's stated value is the outlier.

**Resolution:** Both already in `FM_MATH_DIVERGENCES.csv` as `federation_math_divergence`. FM's reading uses different conventions; treat as folk-evidence, do not adopt.

**No action needed.**

## E. PassBack rows with empty technical_name

**Rule applied:** No decomposition string → no formula to evaluate. Not a conflict; a coverage gap.

**Resolution:** Document but do not action. If PB source files later add technical_name strings, re-run the analyzer.

## F. IFPA rows with empty `notation` AND core-atom base

For tricks that ARE primitive (toe-stall, clipper-stall, the 13 is_core=1 rows + ATW + drifter + torque + blender at the canonical-base tier), self-atom formula is correct. `add_formula_status='exact_self_atom'` is the right classification.

**No action needed.** These rows are correctly self-atomed.

## G. Stall-tier tricks (toe-stall, heel-stall, inside-stall, outside-stall, etc.)

**Rule applied:** Stalls are 1-ADD primitives. The trick name encodes the stall variant; no further decomposition.

**Resolution:** Self-atom with stated=1 is correct. The "unresolved-tokens" flag in the matrix is a false positive (the parser doesn't recognize 'stall' as a known token).

**No action needed at audit level.** Optional cosmetic fix: extend the analyzer's BASE_ADD table to include stall slugs (toe-stall, heel-stall, etc.) so the parser doesn't flag them as unresolved.

## H. Walk-over / hop-over / dragonfly-kick / flying-X (sui generis tricks)

**Rule applied:** Some canonical trick rows describe execution patterns that aren't compositions of operators on bases (walk-over moves bag with foot placed on ground; hop-over uses a hop; dragonfly-kick is a kick variant). These have stated ADDs but no operator-formula decomposition is meaningful.

**Resolution:** Document as sui generis. Self-atom is correct. The "unresolved-tokens" flag is a false positive.

**No action needed at audit level.**

## I. Already-canonical equivalences (FM)

Rows where FM math agrees with IFPA-additive math AFTER applying SS=+0 (Maverick, Catacomb, Tap Dance):

**Rule applied:** SS=+0 closes the math. Both sides compute the same ADD.

**Resolution:** Already in `FM_MATH_DIVERGENCES.csv` as `canonical_equivalent`. No action.

## Summary

| Closure mechanism | Rows | Action |
|---|---:|---|
| Metric mismatch (PB dex_count vs ADD) | 25 + 15 | Document; no Red |
| FM SS=+0 federation_math_divergence | 3-4 | Preserve as folk-evidence; no Red |
| FM-over arithmetic (Bladerunner, Merlin) | 2 | Preserve as folk-evidence; no Red |
| Core-atom / stall / sui-generis self-atom | ~45 | Already correctly self-atomed |
| PB empty technical_name | ~10 | Re-run if source files update |
| Already canonical-equivalent | 3 | No action |

**Total auto-resolvable rows: ~100 of 277.**

None of these need a Red ruling. All are closed by existing policy (SS=+0 pt12, metric definitions, self-atom convention for primitives, FM federation_math_divergence rule).
