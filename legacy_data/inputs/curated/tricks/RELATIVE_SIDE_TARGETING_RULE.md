# Relative-Side Targeting Rule

Companion to RELATIVE_SIDE_RELATIONSHIPS.md. That note establishes that a side
qualifier (near/same-side = `SAME`, far/opposite = `OP`) modifies a side-bearing
element of a trick. This note fixes *which* element, when the base has more than
one dex.

## The rule

**The relative-side qualifier modifies the unique off-side side-bearing element**
(the one element whose side differs from the qualifier):

- **Rule A — dex modify.** If exactly one dex is the unique off-side element,
  the qualifier modifies that dex.
- **Rule B — catch modify.** Otherwise, if the catch is the unique off-side
  element, the qualifier modifies the catch.

Rule A and Rule B are not two separate conventions; they are the same rule
("modify the unique off-side element") applied to whichever element type is
uniquely off-side.

## Evidence (active corpus)

Rule A — the qualifier flips one dex, the catch is left unchanged:

- `fairy-same-side-mirage` = `TOE > SAME OUT [DEX] > SAME IN [DEX] > OP TOE [DEL]`
  (the second dex is `SAME`; the catch stays `OP`)
- `fairy-same-side-whirl` = `TOE > SAME OUT [DEX] > SAME IN [DEX] > OP CLIP [XBD] [DEL]`
- `pixie-same-side-illusion` = `TOE > SAME IN [DEX] >> SAME OUT [DEX] > OP TOE [DEL]`

Rule B — the dexes are all on one side, so the qualifier toggles the catch:

- `terraging-same-clipper` = `... SAME IN [DEX] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]`
  vs `terraging-opposite-clipper` = `... > OP CLIP [XBD] [DEL]`
- `pixie-same-clipper` = `... SAME IN [DEX] > SAME CLIP [XBD] [DEL]`
  vs `pixie-opposite-clipper` = `... > OP CLIP [XBD] [DEL]`

No active example contradicts the rule.

## Scope

- This convention resolves **34** currently blocked multi-dex entries (30 by
  Rule A, 4 by Rule B).
- It does **not** resolve the **11** multi-off-side cases (two or more dexes on
  the off-side, e.g. `atomic-butterfly-same-side` with dexes `OP, OP`). Those
  stay ambiguous; the corpus does not establish which off-side dex the qualifier
  pins.

## Boundary with X-Dex

This rule fixes *which element* the qualifier modifies. It does **not** decide
scoring. Whether a far/`OP` form scores +1 remains the separate, receiver-gated
X-Dex question (RELATIVE_SIDE_RELATIONSHIPS.md): a far variant of a rotational
receiver (mirage/illusion/whirl/torque/drifter/dyno/swirl) has its target
element fixed by this rule but its X-Dex still pending.
