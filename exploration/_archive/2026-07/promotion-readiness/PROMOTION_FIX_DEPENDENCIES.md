# Promotion Fix Dependencies

Read-only. Groups the 31 PASS_WITH_REVIEW candidates by blocking dependency, counts the promotion yield of each fix, and solves for the smallest set of fixes that converts the most candidates to PASS. A candidate becomes PASS only when ALL of its dependencies are cleared.

## The dependencies (candidate lists + co-dependencies)

**D1 - depth-2 composition verification** (ratified composition-order grammar; needs parser + curator confirm per trick). Primary for 7; co-dependency for 3 more.
- clipper-ducking-symposium-whirl, reverse-swirling-symposium-mirage, reverse-swirling-paradox-torque, symposium-reverse-swirling-pickup, symposium-reverse-whirling-swirl, whirling-gyro-mirage, whirling-paradox-mirage.

**D2 - surging side-flip verification** (confirm the spinning+stepping side-flip notation once). 6 total.
- surging-legover, surging-mirage, surging-osis, surging-whirl; **+D8:** surging-ducking-blender, surging-ducking-torque.

**D3 - `>>`-collapse boundary verification**. 7 total.
- reverse-magellan, toe-flurry, toe-ripwalk; **+D1:** reverse-whirling-twirl, backside-symposium-smear; **+D9:** paradox-blur; **+D4:** Sailing Eggbeater.

**D4 - named-set cohort tokenization** (railing/sailing expandedNotation). 4 total.
- Railing Butterfly, Railing Ducking Legover, Sailing Butterfly; **+D3:** Sailing Eggbeater.

**D5 - inward directional confirmation**. 2.
- Inward Gyro Butterfly, Inward Gyro Flail.

**D6 - Tier-2 misc derivation** (double-spin, bs-tokenization, clean entry+base). 3.
- Pixie Double Legover, Twinspinning Illusion, BS Fusion.

**D7 - rake base correction** (rake notation -> 2 brackets). 2, both gated.
- paradox-whirling-rake **(+D1)**, paradox-symposium-whirling-rake **(+D8)**. Also recovers the dropped `reverse-whirling-rake`.

**D8 - depth-3 composition verification**. 1 pure + 3 gated.
- reverse-swirling-paradox-symposium-whirl; (gates surging-ducking x2 via D2, paradox-symposium-whirling-rake via D7).

**D9 - stacked-paradox handling** (two `[PDX]` in one chain). 1.
- paradox-blur **(+D3)**.

**D10 - blizzard ADD reconciliation** (converts the 1 FAIL, not a PWR): backside-symposium-toe-blizzard - blizzard base ADD 4 (notation) vs 3 (decomposition).

## Dependencies ranked by promotion yield
Yield = candidates that become PASS when this fix is applied **and all their other deps are already cleared** (greedy order below). "Reach" = total candidates touched.

| rank | fix | type | reach | marginal yield (greedy) |
|---|---|---|---|---|
| 1 | D1 depth-2 verification | verify | 10 | **7** |
| 2 | D2 surging side-flip | verify | 6 | **4** |
| 3 | D3 `>>`-collapse | verify | 7 | **5** (3 + 2 freed by D1) |
| 4 | D4 named-set tokenization | tokenize | 4 | **3** |
| 5 | D8 depth-3 verification | verify | 4 | **3** (1 + 2 freed by D2) |
| 6 | D6 Tier-2 misc | derive | 3 | **3** |
| 7 | D5 inward directional | confirm | 2 | **2** |
| 8 | D7 rake base correction | correct | 2 | **2** (freed by D1+D8) |
| 9 | D9 stacked paradox | confirm | 1 | **1** (freed by D3) |

## Smallest set of fixes for the largest yield (greedy cover)
| fixes applied (cumulative) | candidates -> PASS | % of 31 |
|---|---|---|
| D1 | 7 | 23% |
| D1 + D2 | 11 | 35% |
| **D1 + D2 + D3** | **16** | **52%** |
| + D4 | 19 | 61% |
| + D8 | 22 | 71% |
| + D6 | 25 | 81% |
| + D5 | 27 | 87% |
| + D7 | 29 | 94% |
| + D9 | 31 | 100% |

## Recommendation
- **3 fixes clear a majority.** D1 (depth-2 verification) + D2 (surging side-flip) + D3 (`>>`-collapse) convert **16 of 31 (52%)** - and all three are *verification batches against already-ratified grammar*, not new doctrine. This is the cheapest high-yield move.
- **5 fixes reach 71%.** Add D4 (named-set tokenization) + D8 (depth-3 verification) for 22/31.
- **The four verification fixes (D1, D2, D3, D8) alone convert 22** - the bulk of the work is confirmation, not rulings.
- **One base correction has outsized leverage:** D7 (rake -> 2 brackets) is a single canonical-notation edit that, once D1/D8 land, promotes 2 PWR *and* recovers the dropped `reverse-whirling-rake` from PROMOTE_NOW - fix it early since it is independent of the verification batches.
- **Separate track:** D10 (blizzard ADD reconciliation) converts the lone FAIL; pair it with D7 as the two "base-ADD" rulings to take to the curator together.

**Bottom line: 3 verification batches = 52%, 5 fixes = 71%, and the only hard rulings needed are the two base-ADD reconciliations (rake, blizzard).**
