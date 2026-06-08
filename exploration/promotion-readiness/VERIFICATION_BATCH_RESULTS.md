# Verification Batch Results - D1 / D2 / D3

Read-only. No data written. Ran the three highest-yield verification batches over their 16 PASS_WITH_REVIEW candidates. Each derived notation verified: bracket count == stated ADD, parse-valid (entry surface -> terminal `[DEL]`), terminal family resolved. **Result: 16 / 16 PASS** - these convert from PASS_WITH_REVIEW to PASS.

## Composition decisions confirmed (the review items, now resolved)
- **D1 depth-2 order:** entry -> body `[BOD]` -> operators (swirling/whirling/symposium as inserted `[DEX]`, paradox as `[PDX]`) -> base core -> terminal. ADD-correct for all 7.
- **D2 surging side-flip:** surging = stepping entry (`CLIP > OP IN [DEX] >>`) + spinning `[BOD]`, first base dex flipped OP->SAME. ADD-correct for all 4.
- **D3 `>>`-collapse:** the base's internal `>>` (uptime) boundary is preserved; reverse mirrors OP<->SAME across it; toe/clipper only swap the entry surface. ADD-correct for all 5.

## D1 - depth-2 composition (7/7 PASS)
| slug | ADD | verified notation | terminal family |
|---|---|---|---|
| clipper-ducking-symposium-whirl | 5 | `CLIP > DUCK [BOD] > SAME SYMP [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` | whirl |
| reverse-swirling-symposium-mirage | 4 | `SET > SAME SWIRL [DEX] > SAME SYMP [DEX] > SAME IN [DEX] > SAME TOE [DEL]` | mirage |
| reverse-swirling-paradox-torque | 6 | `SET > SAME SWIRL [DEX] > SAME IN [DEX] [PDX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` | osis |
| symposium-reverse-swirling-pickup | 4 | `SET > SAME SWIRL [DEX] > SAME SYMP [DEX] > SAME IN [DEX] > OP TOE [DEL]` | pickup |
| symposium-reverse-whirling-swirl | 5 | `CLIP > OP WHIRL [DEX] > SAME SYMP [DEX] > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]` | swirl |
| whirling-gyro-mirage | 4 | `SET > GYRO [BOD] > OP WHIRL [DEX] > OP IN [DEX] > OP TOE [DEL]` | mirage |
| whirling-paradox-mirage | 4 | `SET > OP WHIRL [DEX] > OP IN [DEX] [PDX] > OP TOE [DEL]` | mirage |

## D2 - surging side-flip (4/4 PASS)
| slug | ADD | verified notation | terminal family |
|---|---|---|---|
| surging-legover | 4 | `CLIP > OP IN [DEX] >> (back) SPIN [BOD] > SAME OUT [DEX] > SAME TOE [DEL]` | legover |
| surging-mirage | 4 | `CLIP > OP IN [DEX] >> (back) SPIN [BOD] > SAME IN [DEX] > OP TOE [DEL]` | mirage |
| surging-osis | 5 | `CLIP > OP IN [DEX] >> (back) SPIN [BOD] > (front) SPIN [BOD] > SAME CLIP [XBD] [DEL]` | osis |
| surging-whirl | 5 | `CLIP > OP IN [DEX] >> (back) SPIN [BOD] > SAME IN [DEX] > OP CLIP [XBD] [DEL]` | whirl |

## D3 - `>>`-collapse boundary (5/5 PASS)
| slug | ADD | verified notation | terminal family |
|---|---|---|---|
| reverse-magellan | 3 | `TOE > OP IN [DEX] >> OP OUT [DEX] > OP TOE [DEL]` | legover |
| toe-flurry | 4 | `TOE > OP IN [DEX] > SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]` | legover |
| toe-ripwalk | 4 | `TOE > OP IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]` | butterfly |
| reverse-whirling-twirl | 5 | `CLIP >> OP FRONT SWIRL [DEX] > OP WHIRL [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` | osis |
| backside-symposium-smear | 5 | `TOE > BS [DEX] > SAME IN [DEX] >> SAME SYMP [DEX] > OP IN [DEX] > OP TOE [DEL]` | mirage |

## Promotion queue (updated)
| set | count | status |
|---|---|---|
| **PROMOTE_NOW verified** | **51** | ready (35 derived + 16 batch) |
| reverse-whirling-rake | 1 | ready **pending rake base-notation fix** (kept separate) |
| remaining PASS_WITH_REVIEW | 15 | named-set 4, depth-3 3, Tier-2 misc 3, inward 2, rake-cohort 2, stacked-paradox 1 |
| FAIL | 1 | backside-symposium-toe-blizzard (blizzard base-ADD) |

Implementation plan for the 51 in PROMOTION_IMPLEMENTATION_PACKET.md. Still a review artifact - no writes to red_additions/red_corrections.
