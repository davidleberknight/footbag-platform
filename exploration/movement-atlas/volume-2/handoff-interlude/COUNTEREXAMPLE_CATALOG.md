# Counterexample Catalog

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. It lists every movement in the two-dexterity corpus that the four-part handoff state cannot explain cleanly, grouped by the missing structure, with representative slugs read from the live notation. It makes no physical-realizability claim: a counterexample is a movement the four-part model cannot represent from the notation, not a movement that is impossible. Full per-row data is in `handoff_validation_rows.csv`.

The four-part model fails to represent **238 of 395 rows (60%)**, in four groups.

## Group 1: intervening body or orientation event (152 rows, 38.5%)

The largest group and the decisive counterexample. Between the two dexterities the notation carries a body event, an orientation change, or a body-modified dexterity: the body drops, turns, or spins across the join. The four-part model (carriage, frame, leg, stance) has no slot for a body event that mediates the handoff, so it cannot reconstruct the state the second dexterity receives.

Representative slugs: `assassin`, `assassin_same_side`, `atom_bomb`, `atomic_ducking_blender`, `atomic_ducking_mirage`, `atomic_ducking_torque`. In each, a body event (a duck, a spin, or a body-modified dexterity, often co-articulated with an overlap marker) sits in the join, changing the body's posture and orientation before the second dexterity begins.

Smallest missing concept: **a body-and-orientation join event** (the intervening body action, plus the resulting body facing and, where a spin is present, its phase). This concept is notation-visible.

## Group 2: direction beyond the binary (48 rows, 12.2%)

A dexterity's direction is not one of the two the model assumed; it is rotational or backward. The model's binary direction axis cannot label these dexterities, so it cannot place the coordinate.

Representative slugs: `atomic_reverse_swirl`, `atomic_swirl`, `blaze`, `bling_blang`, `butterfly_swirl`, `ducking_butterfly_swirl`.

Smallest missing concept: **a richer direction vocabulary** (the rotational and backward directions the notation already writes on dexterity steps). Notation-visible.

## Group 3: per-dexterity paradox modifier (35 rows, 8.9%)

A dexterity carries a paradox modifier the four-part model does not represent. The dexterity is still a dexterity, but it is qualified in a way the model's coordinates cannot hold.

Representative slugs: `barfry`, `blur`, `blurry_drifter`, `blurry_torque`, `blurry_whirl`, `hurl`.

Smallest missing concept: **a per-dexterity modifier slot** for the paradox qualifier. Notation-visible, though its scoring is a separate, unresolved question kept out of this structural pass.

## Group 4: under-specified dexterity side (3 rows, 0.8%)

The dexterity side is written ambiguously (a same-or-opposite marker), so even the model's own side component cannot be read.

Representative slugs: `fairy_butterfly`, `pogo_butterfly`, `stepping_butterfly`.

Smallest missing concept: none new; this is a **notation or data gap** in the side field, not a missing state variable.

## What the catalog shows

Three of the four groups (Groups 1 to 3, 235 rows) are genuine missing-variable counterexamples, and all three name a notation-visible concept the model omitted, dominated by the body-or-orientation join event. The fourth group is a small notation gap, not a model failure. Crucially, **none of the 395 rows is inconsistent with the four-part model**: the model is never contradicted, only out-slotted. This is why the verdict is correction rather than refutation. It is also why the two notation-invisible components (reference foot, leg parity) generate no counterexamples here: a component the notation never records cannot be contradicted by the notation, which is itself the argument for resolving those two outside this lane.
