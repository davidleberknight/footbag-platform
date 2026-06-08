# Promotion Contract Audit

Read-only. No promotions, no data writes. Verifies all eight publication-contract dimensions for every candidate in the proposed packet (the 67 Tier-1 decomposition-bearing + 14 Tier-2 manually-validated folk) and classifies each PROMOTE_NOW / PROMOTE_AFTER_REVIEW / HOLD. Goal: the true immediately-promotable count, not the theoretical recoverable count.

## Result
| class | count |
|---|---|
| **PROMOTE_NOW** | **37** |
| PROMOTE_AFTER_REVIEW | 36 |
| HOLD | 8 |
| (candidates audited) | 81 |

**True immediately-promotable count: 37.** Not 70, not 77, not 172. Projected after promoting the 37: dictionary 629 -> 666 names; distinct-structure coverage 507 -> 544 = **34.6%** of 1572 (from 32.3%).

## The eight dimensions, and how each was verified
| dimension | check | how |
|---|---|---|
| decomposition | present | Tier-1 rows carry it; Tier-2 have none (derive-required) |
| notation | derivable | base must have a canonical operational_notation; reject multi->> bases |
| ADD | consistent | decomposition `= N` must equal `provisionalAdd` |
| doctrine | stable | `doctrineConfidence == stable` |
| operator | ratified | every `+N` modifier in the ratified set; reject atomic/nuclear/blurry/furious |
| family | assigned | `parentFamily`/`ecosystem` not unclassified |
| alias/equivalence | distinct | slug not already an active canonical slug |
| source | present | SG/PB/FM/FB attribution on the row |

## Classification rule
- **PROMOTE_NOW** = all eight pass AND depth <= 1 (single ratified modifier or directional on a clean canonical base). Mechanical notation derivation, no composition risk.
- **PROMOTE_AFTER_REVIEW** = one resolvable gap: depth-2/3 multi-modifier (needs verify-then-confirm), `>>`-base (needs collapse-rule application), family unclassified (needs assignment), or Tier-2 folk (notation must be derived from the name first).
- **HOLD** = a hard blocker (no resolvable base notation, multi->> structural base, or un-ratified count-prefix ADD grammar).

## Why the count fell from 77 to 37
1. **Tier-2 folk (14) cannot be PROMOTE_NOW.** None has a stored decomposition; every one needs a notation derivation + verification first. 9 -> AFTER_REVIEW, 5 -> HOLD.
2. **Multi-modifier and `>>`-base Tier-1 (23) are AFTER_REVIEW**, not now - they need verify-then-confirm on the composition.
3. **Family-unclassified (4)** need a family assignment for discoverability.
4. **Hard HOLDs (3 Tier-1):** spyro/sailing set-primitive bases have no notation in the trick table; mobius is a multi->> structural base.

The 37 are the residue that pass every gate mechanically. See PROMOTE_NOW_PACKET.md, PROMOTE_AFTER_REVIEW_PACKET.md, HOLD_PACKET.md.
