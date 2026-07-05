# Promotion Implementation Packet - 51 verified rows, 5 safe slices

Plan. Concrete write plan to promote the 51 notation-verified observational structures into the canonical dictionary, sliced for safe independent commits. `reverse-whirling-rake` is held out (rake base-notation fix first); `backside-symposium-toe-blizzard` stays FAIL.

## Per-row write contract (applies to every slice)
Each promoted trick needs:
1. **`red_additions_2026_04_20.csv`** row: `canonical_name,adds,base_trick,category,aliases,modifier_links,description,review_status,is_active,review_note`. category = `trick`, review_status = `expert_reviewed`, is_active = `1`, review_note = provenance (source code + "notation derived + verified"; **no individual names**).
2. **`red_corrections_2026_04_20.csv`** notation row: `slug,operational_notation,,<derived notation>,<source_note>`.
3. **`red_corrections` family override** (loader-19): `slug,trick_family,,<family>,<note>` **only when base_trick's literal differs from its family**. Override bases: guay->inside-stall, torque->osis, blender->osis, drifter->clipper-stall, magellan->legover, flurry->legover, ripwalk->butterfly, twirl->osis, smear->mirage. No override when base_trick == family (whirl, mirage, swirl, pickup, legover, osis, butterfly).

Post-write pipeline (once per slice or batched): loader `17_load_trick_dictionary.py` -> `parse_freestyle_notation.py --apply` -> **regenerate observational universe** (`build_observational_universe_content.py`; its canonical dual-gate auto-removes the now-promoted slugs, preserving layer separation) -> `qc_count_sync.py`.

---

## Slice 1 - Group A family-stamp / simple (7 rows, +7)
The guay cohort: one ratified modifier on `guay`, single shared family override **inside-stall**. Lowest ADD, lowest risk - run first.
| slug | canonical_name | adds | base_trick | modifier_links | notation |
|---|---|---|---|---|---|
| inspinning-reverse-guay | inspinning reverse guay | 2 | guay | inspinning, reverse | `SET > SAME IN [DEX] > OP INSIDE [DEL]` |
| ducking-reverse-guay | ducking reverse guay | 3 | guay | ducking, reverse | `SET > DUCK [BOD] > SAME IN [DEX] > OP INSIDE [DEL]` |
| gyro-reverse-guay | gyro reverse guay | 3 | guay | gyro, reverse | `SET > GYRO [BOD] > SAME IN [DEX] > OP INSIDE [DEL]` |
| spinning-reverse-guay | spinning reverse guay | 3 | guay | spinning, reverse | `SET > (back) SPIN [BOD] > SAME IN [DEX] > OP INSIDE [DEL]` |
| pixie-reverse-guay | pixie reverse guay | 3 | guay | pixie, reverse | `TOE > SAME IN [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]` |
| fairy-reverse-guay | fairy reverse guay | 3 | guay | fairy, reverse | `TOE > SAME OUT [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]` |
| stepping-reverse-guay | stepping reverse guay | 3 | guay | stepping, reverse | `CLIP > OP IN [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]` |
- **family override:** all 7 -> `inside-stall`.
- **test:** `tests/unit/promotion-slice1-guay.test.ts` - APPROVED array; exact notation, parse-valid, bracket count == adds, terminal family inside-stall.
- **dictionary:** 629 -> **636**.

## Slice 2 - D1 depth-2 verified (7 rows, +7)
| slug | adds | base_trick | family override |
|---|---|---|---|
| clipper-ducking-symposium-whirl | 5 | whirl | - |
| reverse-swirling-symposium-mirage | 4 | mirage | - |
| reverse-swirling-paradox-torque | 6 | torque | osis |
| symposium-reverse-swirling-pickup | 4 | pickup | - |
| symposium-reverse-whirling-swirl | 5 | swirl | - |
| whirling-gyro-mirage | 4 | mirage | - |
| whirling-paradox-mirage | 4 | mirage | - |
- **test:** `tests/unit/promotion-slice2-depth2.test.ts`. **dictionary:** 636 -> **643**.

## Slice 3 - D2 surging (4 rows, +4)
| slug | adds | base_trick | family override |
|---|---|---|---|
| surging-legover | 4 | legover | - |
| surging-mirage | 4 | mirage | - |
| surging-osis | 5 | osis | - |
| surging-whirl | 5 | whirl | - |
- **test:** `tests/unit/promotion-slice3-surging.test.ts`. **dictionary:** 643 -> **647**.

## Slice 4 - D3 `>>` boundary (5 rows, +5)
| slug | adds | base_trick | family override |
|---|---|---|---|
| reverse-magellan | 3 | magellan | legover |
| toe-flurry | 4 | flurry | legover |
| toe-ripwalk | 4 | ripwalk | butterfly |
| reverse-whirling-twirl | 5 | twirl | osis |
| backside-symposium-smear | 5 | smear | mirage |
- **test:** `tests/unit/promotion-slice4-uptime.test.ts`. **dictionary:** 647 -> **652**.

## Slice 5 - remaining verified PROMOTE_NOW (28 rows, +28)
| family | base_trick | override? | slugs |
|---|---|---|---|
| swirl | swirl | no | rev-swirl, diving-reverse-swirl, fairy-reverse-swirl, pixie-reverse-swirl, spinning-reverse-swirl, stepping-reverse-swirl, swirling-reverse-swirl, toe-symposium-swirl, toe-whirling-swirl |
| whirl | whirl | no | clipper-diving-whirl, clipper-ducking-whirl, clipper-symposium-whirl, fairy-reverse-whirl, pixie-reverse-whirl, spinning-reverse-whirl, stepping-reverse-whirl, whirling-reverse-whirl |
| osis | blender | **osis** | reverse-blender, clipper-ducking-blender, reverse-swirling-blender |
| osis | torque | **osis** | reverse-torque, toe-spinning-torque |
| osis | osis | no | reverse-swirling-osis |
| clipper-stall | drifter | **clipper-stall** | clipper-ducking-drifter |
| mirage | mirage | no | toe-gyro-mirage |
| legover | legover | no | toe-ducking-legover |
| pickup | pickup | no | reverse-swirling-pickup |
| butterfly | butterfly | no | butterfly-gyro-toe |
- **test:** `tests/unit/promotion-slice5-bulk.test.ts`. **dictionary:** 652 -> **680**.

## Held separate (do NOT include)
- **reverse-whirling-rake** (ADD 3, fam rake): ready, blocked on the **rake base-notation fix** (rake notation must become 2 brackets). Follow-up slice paired with the rake `red_corrections` edit.
- **backside-symposium-toe-blizzard:** FAIL - blizzard base-ADD ruling first.

## Totals
| after slice | dictionary | distinct-structure coverage |
|---|---|---|
| 1 | 636 | - |
| 2 | 643 | - |
| 3 | 647 | - |
| 4 | 652 | - |
| **5** | **680** | 507+51 = **558 / 1572 = 35.5%** |

51 promotions take the dictionary from 629 to **680** and distinct-structure coverage from 32.3% to **35.5%**. Commit slice-by-slice; run the post-write pipeline after slice 1 to prove the loader + family-override + observational-regen path before the larger slices.
