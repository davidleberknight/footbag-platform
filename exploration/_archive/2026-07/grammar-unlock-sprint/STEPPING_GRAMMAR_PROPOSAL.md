# Stepping Entry Grammar - Proposal for Curator Review

Derived from 31 notation-bearing stepping examples. Nothing written from this yet.

## Recommended grammar
**Stepping replaces the base's set token with `CLIP` and prepends an opposite-side in-dex `OP IN [DEX]` (+1 ADD); the rest of the base core and its terminal are inherited unchanged.**

```
stepping-X  =  CLIP > OP IN [DEX] [sep] <base core of X without its set token>
```

- **Token sequence:** `CLIP` set, then `OP IN [DEX]`.
- **Side:** `OP IN` is the default and is consistent for plain stepping. It shifts to `SAME IN` only when a leading spin is present (see exceptions).
- **Replace vs prepend:** the stepping entry REPLACES the base set with `CLIP` and prepends the one dex. +1 ADD.
- **Terminal:** unchanged, so the family resolves (stepping-whirl ends `OP CLIP [XBD] [DEL]`, stepping-mirage ends `OP TOE [DEL]`, stepping-pickup ends `SAME TOE [DEL]`).

This is the structural mirror of pixie: pixie = `TOE > SAME IN`, stepping = `CLIP > OP IN`. The two entries are distinct at the notation level.

## Evidence by terminal family (representative)
| family | example | notation |
|---|---|---|
| whirl | `stepping-whirl` | `CLIP > OP IN [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` |
| osis | `stepping-osis` | `CLIP > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` |
| butterfly | `sidewalk` | `CLIP > OP IN [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]` |
| double-leg-over | `haze` | `CLIP > OP IN [DEX] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| pickup | `stepping-pickup` | `CLIP > OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]` |
| torque | `grave-digger` | `CLIP > OP IN [DEX] >> SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` |
| drifter | `tombstone` | `CLIP > OP IN [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]` |

31 examples across ~17 families, all opening `CLIP > OP IN [DEX]`.

## Composition (consistent, same as pixie)
ducking/diving insert as `> DUCK/DIVE [BOD] >`; symposium turns the core dex into `(no plant while) ... [BOD]`; paradox tags `[PDX]`; spinning prepends `(back) SPIN [BOD]`.

## Exceptions / open questions
1. **Side shifts to `SAME IN` when a leading spin precedes stepping** (`venom`, `surge`, `surreal`: `CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> ...`). Recommendation: rule stepping = `OP IN` by default, `SAME IN` only after a leading `(back) SPIN [BOD]`. **Curator confirm.**
2. **Separator `>` vs `>>` after the stepping dex is inconsistent** (same ambiguity as pixie). Recommend default `>` (stepping is a planted set), `>>` where a body modifier follows. **Curator confirm.**
3. **Optional `(plant)` marker:** a few notations append `(plant)` to the stepping dex (`stepping-eggbeater`, `stepping-whirling-swirl`); most omit it. Recommend NOT emitting `(plant)` in derivations (it is not ADD-bearing and is inconsistently present), unless the curator wants it standardized.

## Confidence
**MEDIUM-HIGH** for the entry token (`CLIP > OP IN [DEX]`, +1) and terminal inheritance. Two rulings needed: the `OP IN` vs `SAME IN` side rule (spin context) and the separator default.

## Unlock count
18 tricks blocked ONLY by stepping (see `UNLOCK_TABLE.md`).
