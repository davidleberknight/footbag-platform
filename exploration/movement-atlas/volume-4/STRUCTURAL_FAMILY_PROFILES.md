# Structural Family Profiles

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. Profiles the eight primary structural families discovered in `VOLUME_IV.md`, from structure alone. No family is defined by a trick name; representative coordinates are atlas addresses, and real-corpus occupancy is observation only. Per-coordinate assignments are in `taxonomy_catalog.csv`.

## The defining axes

Each primary family is the meet of three binary relations between the two dexterities: leg usage (same-leg / alternating-leg), directional relation (parallel / reversed), and receiver behavior (preserved / changed). All eight are equal-sized under the geometry (eight coordinates per clean fiber; 176 or 128 across all valid coordinates, the difference being only the midline-artifact removal). Real-corpus occupancy (of 395 movements) is given per family as an observed, not defining, property.

## The eight primary families

### F1. same-leg / parallel / preserved
- **Structure.** Both dexterities circle on the same side and the same direction, and the bag returns to its entry side. The most self-similar family: two like turns that undo their own displacement.
- **Internal structure.** Contains the repeated-dexterity diagonal (dex1 = dex2) as a special locus, since a repeated dexterity is necessarily same-leg and parallel.
- **Carriage sub-split.** Steady (the bag never leaves its side) versus mid-cross (it crosses and returns).
- **Neighbors.** One facet flip away from F2 (receiver), F3 (direction), F5 (leg).
- **Representative coordinate.** `toe:toe/S.IN.S|S.IN.S` (a repeated same-side inward dexterity, preserved).
- **Occupancy.** 39 of 395 real movements.

### F2. same-leg / parallel / changed
- **Structure.** Same side, same direction, but the bag ends crossed. Two like turns that accumulate a displacement rather than cancel it.
- **Neighbors.** F1 (receiver), F4 (direction), F6 (leg).
- **Representative coordinate.** `toe:toe/S.IN.O|S.IN.O`.
- **Occupancy.** 68 of 395, the most-occupied family: like-turn movements that carry the bag across are the corpus's single largest structural group.

### F3. same-leg / reversed / preserved
- **Structure.** Same side, opposite directions, bag returns. A turn and its counter-turn on one side; the reversal is the family's signature.
- **Neighbors.** F1 (direction), F4 (receiver), F7 (leg).
- **Representative coordinate.** `toe:toe/S.IN.S|S.OUT.S`.
- **Occupancy.** 40 of 395.

### F4. same-leg / reversed / changed
- **Structure.** Same side, opposite directions, bag crosses. A reversal on one side that still nets a crossing.
- **Neighbors.** F2 (direction), F3 (receiver), F8 (leg).
- **Representative coordinate.** `toe:toe/S.IN.O|S.OUT.O`.
- **Occupancy.** 61 of 395.

### F5. alternating-leg / parallel / preserved
- **Structure.** The two dexterities circle on opposite sides but the same direction, and the bag returns. Alternation with directional agreement.
- **Neighbors.** F1 (leg), F6 (receiver), F7 (direction).
- **Representative coordinate.** `toe:toe/S.IN.S|O.IN.S`.
- **Occupancy.** 30 of 395, the least-occupied family.

### F6. alternating-leg / parallel / changed
- **Structure.** Alternating sides, same direction, bag crosses.
- **Neighbors.** F2 (leg), F5 (receiver), F8 (direction).
- **Representative coordinate.** `toe:toe/S.IN.O|O.IN.O`.
- **Occupancy.** 53 of 395.

### F7. alternating-leg / reversed / preserved
- **Structure.** Alternating sides, opposite directions, bag returns. The most fully anti-symmetric family that still preserves the receiver: everything flips except the endpoint.
- **Neighbors.** F3 (leg), F5 (direction), F8 (receiver).
- **Representative coordinate.** `toe:toe/S.IN.S|O.OUT.S`.
- **Occupancy.** 36 of 395.

### F8. alternating-leg / reversed / changed
- **Structure.** Alternating sides, opposite directions, bag crosses. The fully anti-symmetric family: leg, direction, and receiver all differ from F1.
- **Neighbors.** F4 (leg), F6 (direction), F7 (receiver).
- **Representative coordinate.** `toe:toe/S.IN.O|O.OUT.O`.
- **Occupancy.** 65 of 395, the second-most-occupied.

## Cross-cutting observations

- **Internal symmetry.** Every family is closed under the mirror that flips all absolute sides at once (the laterality abstraction of Volume III), because the facets are defined by relations, not absolute values. The dex-swap of Volume II maps a family to itself when the family is symmetric under exchange (the same-leg parallel families contain their own diagonals) and to a partner ordering otherwise.
- **Neighborhood structure.** The eight families sit on the vertices of a cube whose three axes are the three defining facets; each family has exactly three neighbors, one per single facet flip. This is the lattice described in `HIERARCHY.md`.
- **Occupancy gradient.** The receiver-changed families (F2, F4, F6, F8) hold 247 of 395 movements; the receiver-preserved families (F1, F3, F5, F7) hold 145. The corpus leans, structurally, toward movements that carry the bag across. This is observation, not a defining property; the geometry makes the families equal.
