# Atomic Swirl / Atomic Reverse Swirl — entry-transformation review

**Status: CURATOR REVIEW. Not in `red_additions`. Not a positional question** (kept
separate from `POSITIONAL_RESOLUTION_QUEUE.md`). These two are genuinely new rows
whose ADD and decomposition are settled; the only open question is one focused
curator ruling on how the atomic transformation handles a clipper-anchored base.

## The one question

> Does the atomic entry transformation demonstrated by `atomic_barrage` legitimately
> apply to `swirl` and `rev_swirl`?

ADD (4) and bracket-count are not at issue either way. Only the entry handling is.

## Evidence

**The atomic entry rule (consistent across every active `atomic_*`):** set the base
entry to `TOE`, prepend `OP OUT [DEX]`, keep the rest (adds exactly one `[DEX]` = +1).

| Base entry | Bases | `atomic_*` entry |
|---|---|---|
| `SET` | guay, butterfly, illusion, eclipse, flail, blender, torque, drifter | `TOE` |
| `TOE` | eggbeater | `TOE` |
| **`CLIP`** | **barrage** | **`TOE`** |

`atomic_barrage` is the precedent that atomic over a `CLIP`-entry base imposes `TOE`:
- `atomic_barrage` = `TOE > OP OUT [DEX] > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]`

**The swirl-family bases (also `CLIP`-entry):**
- `swirl` = `CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]`
- `rev_swirl` = `CLIP > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]`

**Proposed rows, if the barrage precedent applies:**
- `atomic_swirl` (4 ADD) = `TOE > OP OUT [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]`
- `atomic_reverse_swirl` (4 ADD) = `TOE > OP OUT [DEX] > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]`

## The concern that makes this a ruling, not a mechanical apply

`atomic_barrage`'s `CLIP` is just an **opening** stall — the trick neither lands on
clipper nor takes its identity from it. The swirl family's `CLIP` is a
**clipper-open / clipper-close** structure: the trick starts on clipper, ends on
`SAME CLIP [XBD] [DEL]`, and its identity is the clipper-anchored back-swirl. Imposing
a `TOE` launch (per barrage) keeps the clipper *landing* but removes the clipper
*entry*. The curator decides whether that is the correct `atomic_swirl`, or whether
atomic over a clipper-anchored base needs different handling than the barrage
precedent.

## If approved

Both append to `red_additions_2026_04_20.csv` (`modifier_links=atomic`;
`atomic_reverse_swirl` needs a paired `red_corrections` `trick_family=swirl` override
because its `base_trick=rev_swirl` would otherwise default the family to `rev_swirl`)
→ loader 19 → `parse_freestyle_notation.py --apply` → build + tests → stage. Nothing
runs until the ruling lands.
