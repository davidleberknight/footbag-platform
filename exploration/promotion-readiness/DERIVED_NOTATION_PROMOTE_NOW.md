# Derived Notation - PROMOTE_NOW (35 of 37)

Read-only review artifact. No data written, no promotions. Derives the operational notation for the 37 PROMOTE_NOW candidates. Each notation's ADD bracket count (`[DEX]|[BOD]|[DEL]|[XBD]|[PDX]|[XDEX]`) is verified == the stated ADD.

**2 of the 37 dropped to AFTER_REVIEW** when derivation exposed a base-notation/decomposition ADD conflict the contract audit could not see (it checked decomposition-internal consistency only). The remaining **35 derive cleanly and verify**.

## Derivation conventions (for curator confirmation)
- **reverse / rev:** mirror the trick - swap OP <-> SAME on the affected dex/catch. No ADD change.
- **entry surface (toe / clipper):** replace the base's leading `SET` with `TOE` / `CLIP`. No ADD change.
- **entry operator (pixie / fairy / stepping):** prepend the entry dex with `>>` (pixie `TOE > SAME IN [DEX] >>`, fairy `TOE > SAME OUT [DEX] >>`, stepping `CLIP > OP IN [DEX] >>`). +1 [DEX].
- **body (ducking / diving / spinning / gyro):** insert `<MOD> [BOD]` after the entry. +1 [BOD].
- **dex op (swirling / whirling / symposium):** insert `<MOD> [DEX]` before the terminal. +1 [DEX].
- **inspinning (this cohort):** 0-ADD inward-spin qualifier on reverse-guay (its decomposition is `guay(2) = 2`).

## ADD 2 (1)
| slug | derived notation |
|---|---|
| inspinning-reverse-guay | `SET > SAME IN [DEX] > OP INSIDE [DEL]` |

## ADD 3 (10)
| slug | derived notation |
|---|---|
| ducking-reverse-guay | `SET > DUCK [BOD] > SAME IN [DEX] > OP INSIDE [DEL]` |
| gyro-reverse-guay | `SET > GYRO [BOD] > SAME IN [DEX] > OP INSIDE [DEL]` |
| spinning-reverse-guay | `SET > (back) SPIN [BOD] > SAME IN [DEX] > OP INSIDE [DEL]` |
| pixie-reverse-guay | `TOE > SAME IN [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]` |
| fairy-reverse-guay | `TOE > SAME OUT [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]` |
| stepping-reverse-guay | `CLIP > OP IN [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]` |
| rev-swirl | `CLIP > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]` |
| reverse-swirling-pickup | `SET > SAME SWIRL [DEX] > SAME IN [DEX] > OP TOE [DEL]` |
| toe-gyro-mirage | `TOE > GYRO [BOD] > OP IN [DEX] > OP TOE [DEL]` |
| toe-ducking-legover | `TOE > DUCK [BOD] > OP OUT [DEX] > SAME TOE [DEL]` |

## ADD 4 (21)
| slug | derived notation |
|---|---|
| butterfly-gyro-toe | `TOE > GYRO [BOD] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]` |
| clipper-diving-whirl | `CLIP > DIVE [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]` |
| clipper-ducking-drifter | `CLIP > DUCK [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]` |
| clipper-ducking-whirl | `CLIP > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]` |
| clipper-symposium-whirl | `CLIP > SAME SYMP [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` |
| diving-reverse-swirl | `CLIP > DIVE [BOD] > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]` |
| fairy-reverse-swirl | `TOE > SAME OUT [DEX] >> OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]` |
| fairy-reverse-whirl | `TOE > SAME OUT [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]` |
| pixie-reverse-swirl | `TOE > SAME IN [DEX] >> OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]` |
| pixie-reverse-whirl | `TOE > SAME IN [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]` |
| reverse-blender | `SET > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` |
| reverse-swirling-osis | `SET > OP SWIRL [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]` |
| reverse-torque | `SET > SAME IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` |
| spinning-reverse-swirl | `CLIP > (back) SPIN [BOD] > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]` |
| spinning-reverse-whirl | `SET > (back) SPIN [BOD] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]` |
| stepping-reverse-swirl | `CLIP > OP IN [DEX] >> OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]` |
| stepping-reverse-whirl | `CLIP > OP IN [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]` |
| swirling-reverse-swirl | `CLIP > OP BACK SWIRL [DEX] > SAME SWIRL [DEX] > OP CLIP [XBD] [DEL]` |
| toe-symposium-swirl | `TOE > SAME SYMP [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` |
| toe-whirling-swirl | `TOE > OP WHIRL [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` |
| whirling-reverse-whirl | `SET > SAME IN [DEX] > OP WHIRL [DEX] > SAME CLIP [XBD] [DEL]` |

## ADD 5 (3)
| slug | derived notation |
|---|---|
| clipper-ducking-blender | `CLIP > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` |
| reverse-swirling-blender | `SET > SAME SWIRL [DEX] > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` |
| toe-spinning-torque | `TOE > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` |

## Dropped to AFTER_REVIEW - base-notation/decomposition ADD conflict (2)
| slug | ADD | conflict | resolution needed |
|---|---|---|---|
| reverse-whirling-rake | 3 | decomposition assumes `rake(2)`, but the canonical `rake` notation `SET > SWING TOE [DEL]` is **1** bracket; derived = 1+1 = 2, not 3 | reconcile rake's base ADD (is rake 1 or 2?) before deriving |
| symposium-blizzard | 4 | decomposition assumes `blizzard(3)`, but canonical `blizzard` is **4** brackets; derived = 4+1 = 5, not 4 | reconcile blizzard's base ADD before deriving |

## Verification
All 35 derived notations: bracket count == stated ADD (35/35). Conventions applied uniformly; direction (OP/SAME) and entry-surface choices are curator-confirmable. **This is a review artifact - promotion (writing notation to `red_additions`/`red_corrections` and running the loader) is a separate approved step.** Recommend curator/parser confirmation of the 35, plus a rake/blizzard base-ADD ruling for the 2 dropped.
