# Occupancy Summary

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. Counts from `generate_matrix.py` over the bounded toe-to-toe triple-dex grammar. No realizability, naming, or promotion claim.

## Generation and normalization

| Quantity | Count |
|---|---|
| Structural bases (leg-side chains, 4 dex tokens cubed) | 64 |
| Generated positional readings (64 bases x 4 terminal labels) | 256 |
| Distinct representable formulas after normalization (64 bases x 2 terminals) | 128 |

## Distinct formulas by classification

| Class | Meaning | Count |
|---|---|---|
| A | existing canonical formula, single active name | 12 |
| B | existing formula, carried by 2+ active names | 7 |
| D | structurally distinct, representable, no active object | 109 |
| **Total distinct formulas** | | **128** |

Nineteen of the 128 distinct formulas are occupied by an active pure triple-dex toe-to-toe trick (12 single-name plus 7 multi-name); 109 are empty but representable coordinates.

## Reading rows by classification

| Class | Meaning | Count |
|---|---|---|
| A | reading resolves to a single-name canonical formula | 12 |
| B | reading resolves to a multi-name formula | 7 |
| C | NEAR/FAR wording collapse (redundant terminal wording; distance nuance representation-ambiguous, E) | 128 |
| D | reading resolves to a distinct unnamed formula | 109 |
| **Total generated readings** | | **256** |

The 128 C rows are the NEAR and FAR readings (two per base). Each collapses onto its same/op twin and carries the representation-ambiguity (E) note for any receiver-distance beyond the terminal foot; none is a separate formula.

## Terminal occupancy across the 64 bases

The core near-versus-far finding, by base:

| Base terminal-naming pattern | Count of bases |
|---|---|
| near (SAME) named, far (OP) unnamed | 13 |
| far (OP) named, near (SAME) unnamed | 2 |
| both terminals named | 2 |
| neither terminal named | 47 |
| **Total** | **64** |
| bases with at least one named terminal | 17 |

The thirteen near-named / far-unnamed bases (each far counterpart is a distinct, empty coordinate):

- `SIN-SIN-SIN` near: triple_around_the_world, pixie_double_pickup_same_side
- `SIN-OIN-OOUT` near: smog, pixie_quantum_legover
- `SIN-OOUT-SOUT` near: pixie_double_switch_over
- `SIN-OOUT-OOUT` near: pigbeater, pixie_eggbeater, sailing_legover
- `SOUT-SOUT-SOUT` near: triple_orbit
- `SOUT-OIN-SIN` near: fairy_double_pickup
- `SOUT-OIN-OOUT` near: fairy_double_leg_over, flog
- `SOUT-OOUT-OOUT` near: fairy_eggbeater
- `OIN-SIN-OOUT` near: toe_flurry
- `OIN-OIN-OOUT` near: quantum_double_leg_over
- `OIN-OOUT-OOUT` near: bedwetter, quantum_eggbeater
- `OOUT-OIN-OOUT` near: predator, tapping_double_leg_over
- `OOUT-OOUT-OOUT` near: bladerunner, tapping_eggbeater, atomic_eggbeater

The two far-named / near-unnamed bases are the barrage family, which lands far: `SOUT-SIN-SIN` (fairy_barrage) and `OOUT-SIN-SIN` (atomic_barrage). The two both-named bases lexicalize the near/far distinction as two named tricks; the clear example is base `SIN-OIN-SIN`, whose near form is pixie_double_pickup and whose far form is pixie_barrage.

## Corpus formulas outside the bounded grammar (reported, not generated)

Fifteen active triple-dex toe-terminal tricks fall outside this bounded IN/OUT toe-launch grammar and are correctly excluded from the matrix rather than forced in (class F, reported here for completeness):

- Backside-token entries: backside_magellan, backside_paste.
- Generic-set or clipper launch with a barraging/stepping/blurry entry: barraging_illusion, barraging_legover, barraging_mirage, barraging_pickup, blurrage, flurry, haze, stepping_double_switch_over, stepping_eggbeater, stepping_reaper, triple_mirage.
- Swirling/symposium dex tokens: reverse_swirling_symposium_mirage, symposium_reverse_swirling_pickup.

Each needs an excluded or non-IN/OUT feature (a backside or swirling direction, a symposium dex, or a clipper/generic-set launch) to be read, so it is classified outside this bounded matrix rather than silently included.

## Headline

Of 128 distinct representable toe-to-toe triple-dex formulas in the bounded grammar, 19 are named (12 singly, 7 under multiple names) and 109 are empty but representable. Of the 17 bases that carry any name, 13 name only the near terminal and leave the far terminal empty, 2 name only the far, and 2 name both. The empty far coordinates are class D, distinct and representable, never class E; the dictionary omits them by not naming them, not by being unable to express them.
