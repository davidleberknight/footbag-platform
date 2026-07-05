# Side-Flip Ruling (Bounded) - Confirmed

Read-only documentation. One bounded composition ruling, extracted from corpus pairs, applied to six verified unlocks. Records the ruling and its limits; the derivations themselves live in red_corrections.

## Ruling (bounded)
For notation derivation in this sprint, when a corpus-supported leading spin or stepping entry precedes a single clear core dex, the first following core dex may flip `OP -> SAME`. Toe/stall catches follow the flipped dex. Clipper-family catches keep their cross-body clipper terminal.

The crossing or rotation reorients the body, so the next kick lands on the same side. The flip is directional only (`OP IN -> SAME IN`, `OP OUT -> SAME OUT`); ADD is unchanged.

## Scope (limits, as confirmed)
- Applies only to single-target core-dex compositions.
- Applies only where the set/body trigger is leading, not internal.
- Does not auto-apply to multi-core-dex bases.
- Does not auto-apply to depth-4 stacks.
- Does not resolve `margaritaville` or `spinning-miraging-symposium-torque`.
- Must be parser / ADD / terminal verified case by case.

## Evidence (no-flip base vs flipped composition)
| base (no lead) | composition (lead spin / stepping) | flip |
|---|---|---|
| `torque`: `SET > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | `grave-digger` (stepping): `CLIP > OP IN [DEX] >> SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | OP IN -> SAME IN |
| `symposium-torque`: `SET > (no plant while) OP IN [DEX] [BOD] > ...` | `gyro-symposium-torque` (lead spin): `CLIP > (back) SPIN [BOD] > (no plant while) SAME IN [BOD] [DEX] > ...` | OP IN -> SAME IN |
| `mirage`: `SET > OP IN [DEX] > OP TOE [DEL]` | `stepping-ducking-mirage`: `CLIP > OP IN [DEX] > DUCK [BOD] > SAME IN [DEX] > SAME TOE [DEL]` | OP IN -> SAME IN, OP TOE -> SAME TOE |

`venom` and `surge` (spinning+stepping) confirm the same: the stepping dex is written `SAME IN` under a leading spin.

## Catch behaviour
- Toe / stall catches (mirage, legover, illusion) follow the flipped dex: `OP TOE -> SAME TOE`.
- Clipper catches (whirl, torque, butterfly, osis, drifter) keep the family cross-body clipper (`OP CLIP` / `SAME CLIP`), unchanged.

## Approved unlocks (six, derived on verify-then-confirm)
| slug | ADD | notation |
|---|---|---|
| `stepping-diving-mirage` | 4 | `CLIP > OP IN [DEX] > DIVE [BOD] > SAME IN [DEX] > SAME TOE [DEL]` |
| `stepping-diving-butterfly` | 5 | `CLIP > OP IN [DEX] > DIVE [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]` |
| `stepping-ducking-drifter` | 5 | `CLIP > OP IN [DEX] > DUCK [BOD] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]` |
| `stepping-paradox-torque` | 6 | `CLIP > OP IN [DEX] >> SAME IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` |
| `spinning-symposium-flux` | 6 | `TOE > (back) SPIN [BOD] > (no plant while) SAME OUT [BOD] [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]` |
| `bigwalk` | 5 | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]` |

## Held (residual complexity, beyond this ruling)
- `margaritaville` and `spinning-miraging-symposium-torque`: a two-prepend ordering question remains on top of the flip; not resolved here.
