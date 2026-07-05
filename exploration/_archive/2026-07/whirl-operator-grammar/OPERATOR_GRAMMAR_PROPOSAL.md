# Operator-Modifier Notation Grammar - Proposal for Curator Review

Derived from the existing notation corpus and the modifier registry. **Nothing is written from this yet.** Each operator's grammar is proposed so the curator can confirm or correct it before it drives any notation derivation (the six whirl operator targets, and operator-bearing tricks in other families).

Token counting note: ADD = count of add-bearing bracket tokens (`[DEX] [BOD] [DEL] [XBD] [PDX] [XDEX]`), validated to equal `adds` for all 50 whirl-family notations.

## 1. miraging (+1) - CONFIDENT
**Grammar:** insert a single `OP IN [DEX]` mirage dex as the entry dex into the base.
**Evidence:**
- `miraging-clipper` (3): `SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]`
- `miraging-osis` (4): `SET > OP IN [DEX] > (back) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]`
- `miraging-dyno` (5): `SET > OP IN [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`

Three consistent examples; matches the registry note ("miraging clipper = drifter, miraging osis = torque"). The mirage dex leads, then the base core follows.

## 2. barraging (+2) - CONFIDENT (Red-adjudicated)
**Grammar:** prepend a two-dex set `OP IN [DEX] > SAME IN [DEX]` ahead of the base.
**Evidence:**
- `barraging-osis` (5): `CLIP > OP IN [DEX] > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]`

Registry: "+2 as a two-dex set per Red 2026-05-20." Only one notation example exists, but the Red adjudication backs the +2 two-dex structure.

## 3. whirling (+1) - REVISED: named whirl dex, structurally distinct from miraging
**Grammar:** insert a **named whirl dex** `OP FRONT WHIRL [DEX]` (side OP/SAME by context, FRONT the default), NOT a plain `OP IN [DEX]`. The `WHIRL` token carries the whirl's cross-body identity and is distinct at the notation level from miraging's mirage dex. +1.

**Evidence:** the named `WHIRL [DEX]` token is corpus-established across ~25 notations:
- `feral` (4): `TOE > SAME OUT [DEX] >> OP FRONT WHIRL [DEX] > OP CLIP [XBD] [DEL]`
- `hatchet` (4): `CLIP >> DIVE [BOD] > SAME FRONT WHIRL [DEX] > OP CLIP [XBD] [DEL]`
- `bling-blang` (4): `CLIP > OP FRONT WHIRL [DEX] >> SAME BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]`

**Finding (separate notation correction, not derived here):** the only two notations that carry the `whirling` *modifier* - `whirling-swirl` and `gyro-whirling-swirl` - encode the whirling as a plain `OP IN [DEX]`, not the named whirl dex. That is the collapse the curator rejected. To keep the operator distinguishable they should be corrected to `OP FRONT WHIRL [DEX]`:
- `whirling-swirl` is currently `CLIP > OP IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]`; corrected: `CLIP > OP FRONT WHIRL [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` (ADD still 4).
This is flagged for curator decision, not applied.

## 4. swirling (+1) - named swirl dex, structurally distinct
**Grammar:** insert a **named swirl dex** `[side] BACK SWIRL [DEX]`, parallel to whirling's named whirl dex and equally distinct from a mirage dex. +1.
**Evidence:** the swirl base is `CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]`, and the `[side] BACK SWIRL [DEX]` token recurs (`whirling-swirl`, `bling-blang`). Registry: "+1 body-spin, parallel to spinning."
**Open question:** no trick carries the `swirling` *modifier* with notation, so the side (OP vs SAME) and insertion point are inferred from the token's corpus usage rather than a direct example. Curator confirm.

## Distinguishability (the point of the revision)
The three +1 dex operators now carry three distinct tokens, so `miraging-X`, `whirling-X`, and `swirling-X` are separable at the notation level, not just by family:

| operator | inserted token |
|---|---|
| miraging | `OP IN [DEX]` (mirage dex) |
| whirling | `OP FRONT WHIRL [DEX]` (named whirl dex) |
| swirling | `[side] BACK SWIRL [DEX]` (named swirl dex) |

## 5. blurry (+1 flat) - NEEDS RESOLUTION (two issues)
**Proposed grammar:** prepend `OP IN [DEX] >>`, where `>>` marks the blurry no-plant double-time.
**Evidence:**
- `ripwalk` (blurry + butterfly, 4): `CLIP > OP IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]` (butterfly 3 + 1)
- `blur` (blurry + mirage, 4): `CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]`
- `blurriest` (blurry + barfly, 5): `CLIP > OP IN [DEX] >> OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]`

Registry: "+1 as a set modifier."

**Issue A - doctrine divergence.** `blur`'s own provenance records that blurry has a contested **+2 rotational** reading (FM "Blurry Mirage") versus a **+1 flat** reading (IFPA). The notation must commit to one; the evidence above reads as +1 flat. Confirm IFPA +1.

**Issue B - data discrepancy on the target.** `blurry-whirl` is stated at **adds=5**, but whirl (3) + blurry (+1) = **4**. So either `blurry-whirl`'s ADD is wrong, or it carries a hidden second modifier. **This must be resolved before `blurry-whirl` can be derived** - the grammar and the stated ADD currently disagree.

---

## What confirming this unlocks
With miraging / barraging / whirling / swirling confirmed, these whirl operator targets become derivable (ADD permitting):
- `swirling-whirl`, `whirling-whirl`, `barraging-whirl`, `miraging-symposium-whirl`, `swirling-symposium-whirl`.

`blurry-whirl` is blocked on Issue B regardless of the grammar.

The same grammar also unlocks operator-bearing notation-less tricks in other families (the coverage sprint's broader gap), so confirming it is high-leverage beyond whirl.

## Requested decisions
1. miraging `OP IN [DEX]` prepend (+1) - confirm.
2. barraging `OP IN [DEX] > SAME IN [DEX]` two-dex prepend (+2) - confirm.
3. whirling inserts the named `OP FRONT WHIRL [DEX]` (distinct from miraging) - confirm; and decide whether to correct `whirling-swirl` / `gyro-whirling-swirl` from their current plain `OP IN [DEX]` encoding.
4. swirling inserts the named `[side] BACK SWIRL [DEX]` (+1) - confirm side/position.
5. blurry: confirm IFPA +1 flat (Issue A); resolve `blurry-whirl` adds=5 vs the +1 grammar (Issue B).
