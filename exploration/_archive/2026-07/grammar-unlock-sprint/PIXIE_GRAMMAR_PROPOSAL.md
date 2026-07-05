# Pixie Entry Grammar - Proposal for Curator Review

Derived from 45 notation-bearing pixie examples. Nothing written from this yet.

## Recommended grammar
**Pixie replaces the base's set token with `TOE` and prepends a same-side in-dex `SAME IN [DEX]` (+1 ADD); the rest of the base core and its terminal are inherited unchanged.**

```
pixie-X  =  TOE > SAME IN [DEX] [sep] <base core of X without its set token>
```

- **Token sequence:** `TOE` set, then `SAME IN [DEX]`.
- **Side:** `SAME IN` is consistent across every pixie example (no exceptions found).
- **Replace vs prepend:** the pixie entry REPLACES the base set (whatever it was, becomes `TOE`) and prepends the one dex. +1 ADD.
- **Terminal:** unchanged, so the family still resolves (pixie-whirl ends `OP CLIP [XBD] [DEL]`, pixie-mirage ends `OP TOE [DEL]`, etc.).

## Evidence by terminal family (representative)
| family | example | notation |
|---|---|---|
| whirl | `pixie-whirl` | `TOE > SAME IN [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` |
| mirage | `assassin` | `TOE > SAME IN [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP TOE [DEL]` |
| butterfly | `dimwalk` | `TOE > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]` |
| legover | `magellan` | `TOE > SAME IN [DEX] >> SAME OUT [DEX] > SAME TOE [DEL]` |
| pickup | `paste` | `TOE > SAME IN [DEX] >> OP IN [DEX] > SAME TOE [DEL]` |
| illusion | `smudge` | `TOE > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL]` |
| osis | `pixie-osis` | `TOE > SAME IN [DEX] >> (front) SPIN [BOD] > OP CLIP [XBD] [DEL]` |

45 examples across ~20 families, all opening `TOE > SAME IN [DEX]`.

## Composition with other modifiers (consistent)
- **ducking / diving:** insert after the pixie dex as `>> DUCK/DIVE [BOD] >>` (assassin, phoenix, pixie-diving-mirage).
- **symposium:** turns the core dex into `(no plant while) ... [BOD]` (pixie-symposium-whirl).
- **paradox:** tags the core dex `[PDX]`.
- **spinning:** prepends `(back) SPIN [BOD]` before the pixie dex.

## Exceptions / open questions
1. **Separator `>` vs `>>` after the pixie dex is inconsistent** even within a family (pixie-whirl `>`, dimwalk `>>`). This is the one real ambiguity. Recommendation: default `>>` (the pixie no-plant attack), overridden to `>` only where a body modifier does not follow and the base is single-dex. **Curator confirm the default.**
2. `pixie-eclipse`: `TOE > SAME IN [DEX] JUMP [BOD] > ...` omits the separator before `JUMP` (irregular; treat as a one-off, not the rule).
3. `pixie-paradon`, `pixie-mobius`: carry extra dexes beyond the entry; their structure is named-trick-specific, not pure pixie composition (already excluded from the unlock set).

## Confidence
**HIGH** for the entry token (`TOE > SAME IN [DEX]`, +1) and the terminal inheritance; **the separator default is the only item needing a ruling.**

## Unlock count
14 tricks blocked ONLY by pixie (see `UNLOCK_TABLE.md`).
