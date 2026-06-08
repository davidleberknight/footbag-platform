# Recoverability Validation - Empirical Test of the 172

Read-only. Validates RECOVERABLE_STRUCTURE_AUDIT.md by attempting full publication-contract derivation on a representative sample of the claimed 172 "recoverable-now" structures. Result: the estimate is overstated ~2x; the sample does not clear the 80% threshold, so no promotion packet is built.

## Method
30-structure stratified sample across the claimed-recoverable ecosystems (sailing, railing, double, pixie, stepping, fairy, symposium, inward, bs, bubba, twinspinning, spyro, flailing, double-dex, triple-dex). For each, attempt to derive a contract-valid operational notation from the name + ratified grammar (single clear base with notation, all operators ratified and non-contested, parse-valid, terminal resolves).

## Root cause the audit missed
The 172 came from tokenizing names against a base vocabulary built by splitting canonical slugs. But canonical slugs are **modifier-prefixed** (`gyro-drifter`, `double-leg-over`, `atomic-illusion`), so the split conflates bases with modifiers. A loose vocab counts `atomic`/`nuclear` as bases (false positives); a strict vocab counts `gyro`/`double`/`sailing` as bases (false multi-base negatives). **There is no reliable automated base/modifier separator** without a curated vocabulary, so the 172 cannot be trusted as an estimate.

## Empirical verdicts (manual derivation, 30 sample)
- **SUCCESS ~14 (47%)** - clean ratified composition on a canonical base: Railing Butterfly, Railing Ducking Legover, Sailing Butterfly, Sailing Eggbeater, Double Drifter, Double Bubba, Pixie Double Legover, Spyro Illusion, Twinspinning Illusion, double-dex Butterfly, triple-dex Legover, BS Fusion, Inward Gyro Butterfly, Inward Gyro Flail.
- **FAIL ~8 (27%)** - contested operator or ambiguity: Fairy Atomic (atomic held), Twinspinning nuclear inspinning (nuclear), Flailing Butterfly / far Butterfly (flailing un-ratified), Symposium Bubba Barfly / Beater, Bubba Beater / Butterfly (ambiguous multi-base, notation-less `beater`).
- **UNCERTAIN ~8 (27%)** - held multi-modifier composition or notation-less atom: Stepping Butterfly Reverse Swirl, Stepping Diving Double Legover, Spyro Diving Symposium Whirl, BS Fury, Pixie Da Da Curve, Fairy Beater, double-dex ATW, triple-dex ATW.

**Empirical success rate: ~47% clean; ~73% even if every uncertain multi-modifier case eventually derives. Both below 80%.**

## Failure clusters (where the recoverability claim breaks)
1. **Contested operators** - atomic, nuclear, flailing, fury(furious) appear inside "recoverable" names; they are held/un-ratified, not grammar-derivable.
2. **Held multi-modifier composition** - stepping/spyro + reverse + symposium chains are exactly the territory the composition sprint deferred (side-flip + multi-modifier order).
3. **Ambiguous multi-base names** - "Bubba Butterfly", "Symposium Bubba Beater": two base-family tokens, no clean single chassis.
4. **Notation-less atom bases** - ATW (around-the-world), dada-curve, "beater": the base itself has no notation to compose onto.

## Revised numbers
| metric | audit claim | validated |
|---|---|---|
| folk recoverable-now (A) | 172 | **~80-90** (172 x ~0.47) |
| readiness now | 47.6% | **~42%** (662/1572) |
| folk one-ruling (C) | 111 | unchanged (operator clusters are robust: zulu/symple/alpine/slapping) |

The audit's direction holds - the folk set hides real promotable structure, and ~80-90 is still well above Phase E's zero - but the magnitude was ~2x optimistic.

## Decision
**Sample < 80%: do not build the full promotion packet.** A packet off the unvalidated 172 would carry ~50% rejection. Two valid next steps instead:
1. **Micro-packet (safe):** the ~14 validated-clean structures (single ratified operator on a canonical base) are publication-ready now and could form a small, high-confidence first packet.
2. **Re-estimate properly:** build a *curated* base/family vs modifier/operator vocabulary (the family list + atoms + base_trick names, with operators explicitly separated), then re-tokenize - that is the only way to get a trustworthy recoverable count, and it would let the C-operator clusters (zulu/symple/alpine, ~79) be sized honestly too.

The robust finding survives validation: the largest clean lever remains the **C operator clusters** (one Red ruling each: zulu 29, symple 14, alpine 14, slapping 11), plus verifying **frantic (Pixie-quantum set)** and **neutron (nuclear pt14)** as likely-already-covered.
