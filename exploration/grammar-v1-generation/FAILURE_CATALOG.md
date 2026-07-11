# Movement Grammar v1.0 Generation: Failure Catalog

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. Generated evidence from `generate_v1.py`; the per-row data is in `movement_formulas_v1.csv` (base space) and `failure_probes_v1.csv` (probes). This catalog names every failure the frozen grammar produced, with a precise explanation and a representative formula. It classifies; it does not repair.

A "failure" here is any point where Grammar v1.0 cannot cleanly represent, cannot grade, or over-generates a movement. A correct rejection (the grammar refusing an ill-formed move) is **not** a failure and is not catalogued; there are 48 such correct blocks in the base space (all cross-body-launch foreclosures).

## Summary counts

| Where | Failure class | Count | Kind of problem |
|---|---|---|---|
| Base space | duplicate-generation | 24 | over-generation (axis too free) |
| Base space | unresolved-notation | 17 | undefined token (peak surface) |
| Base space | unexpected-redundancy | 8 | over-generation (two descriptions, one coordinate) |
| Base space | internal-contradiction | 5 | scoring law violated (bare-surface kick) |
| Contamination | unresolved-grading | 304 | rotation grade unpinned |
| Contamination | ambiguous-primitive | 152 | paradox parameter-vs-event |
| Contamination | unresolved-posture | 152 | no-plant scored-vs-licensing |
| Structural probe | missing-primitive | 1 concept | pogo (cannot be written) |
| Structural probe | unresolved-notation | 1 | generic `SET` launch |
| Structural probe | unresolved-simultaneity | 1 | the `>>` operator |

## 1. duplicate-generation (24 formulas, base space)

**What it is.** A midline landing surface (head, forehead, neck, cloud) has exactly one central target: there is no same-side versus opposite-side distinction, because the surface sits on the body's midline. But the grammar's terminal-side axis runs over `{SAME, OP}` regardless of the landing's laterality, so it generates two formulas for the one physical target. The opposite-side copy is a duplicate the grammar does not know to suppress.

**Why it is a failure and not hygiene noise.** The terminal-side axis is a real, load-bearing distinction on paired surfaces (it is what separates mirage from pickup). The grammar simply does not gate it by the landing's laterality, so it over-generates precisely on the surfaces where the axis collapses. The fix is a one-line rule (suppress the opposite-side copy when the landing is midline), which is enumeration hygiene, not a grammar change. Until that rule exists, the raw production is inflated by these 24.

**Representative formula.** `TOE > SAME IN [DEX] > OP HEAD [DEL]` duplicates `TOE > SAME IN [DEX] > SAME HEAD [DEL]`: the head is central, so "opposite-side head" names the same landing as "same-side head."

## 2. unresolved-notation, peak surface (17 formulas, base space)

**What it is.** The peak surface is unresolved as either a genuine landing surface (the apex of a set) or a timing marker (a moment in flight rather than a contact). The grammar carries `peak` as a surface token but cannot say which it is, so it cannot say what contact a peak formula represents or whether the landing scores as a delay.

**Where it hits.** One 0-dex stall (`PEAK [DEL]`) and sixteen 1-dex cube vertices that land on peak (eight on the toe launch, eight on the clipper launch). Every one is blocked from clean generation because its terminal role is undefined.

**Representative formula.** `TOE > SAME IN [DEX] > PEAK [DEL]`: valid in shape, but the grammar cannot commit to what `PEAK [DEL]` is until the surface is ruled.

## 3. unexpected-redundancy, toe self-fiber (8 formulas, base space)

**What it is.** A self-fiber is a launch that begins and ends on the same paired plain surface (launch surface equals landing surface). For the toe, the toe self-fiber is identical to the toe-launch reference cube already generated: same launch, same landing, same eight vertices. The grammar generates the same eight coordinates twice, once described as "toe launch" and once as "toe self-fiber."

**Why it is a failure.** It is genuine over-generation: two grammar descriptions collapse to one movement, and nothing in the grammar records that they coincide at the toe. Phase II-A suppressed this by hand; the faithful run emits it to make the redundancy visible as data. The other self-fibers (inside, outside, knee, shoulder) do not collapse this way, because their launch surface differs from the toe reference; only the toe coincides.

**Representative formula.** `TOE > SAME IN [DEX] > SAME TOE [DEL]` generated as a self-fiber is the same coordinate as the toe-launch around-the-world vertex.

## 4. internal-contradiction, bare-surface kick (5 formulas, base space)

**What it is.** A kick off a bare surface (sole, cloud, heel, toe, inside) scores 1 in the corpus, but the formula contains no scored generator: there is no dexterity, no body step, and no held landing to carry the point. The firm scoring law says ADD equals the count of scored generators, which for a bare kick is zero. The corpus says the ADD is one. The grammar contradicts itself: its firmest rule and its data disagree.

**Why it is the most important base failure.** The other three base classes are hygiene or an undefined token. This one is a real hole in the primitive basis: a point exists with no source in any of the four firm generators. It is the bare-surface twin of pogo (Probe 8), and the two together are the candidate missing primitive.

**Representative formula.** `SOLE [KICK]`: scores 1 by the corpus, scores 0 by the law, ADD marked `?`.

## 5. unresolved-grading, rotation (304 formulas, contamination probe)

**What it is.** Adding a rotation (whirl or swirl) to any clean dexterity produces a formula the grammar cannot grade, because the rotation-grade rule is unpinned. A grade-neutral reading leaves the ADD unchanged; a grade-raising reading adds a point (a cross-body rotational dex reaches grade 3). The grammar holds both readings and commits to neither.

**Reach.** Applied to all 152 clean 1-dex formulas, at two rotations each: 304 ungradeable variants. This is the single largest failure population in the whole experiment, and it comes from one unresolved rule sitting on the most common dex-parameter.

**Representative formula.** `TOE > OP IN [DEX:whirl] > OP TOE [DEL]`: ADD is 2 (grade-neutral) or 3 (grade-raising); the grammar cannot say which.

## 6. ambiguous-primitive, paradox (152 formulas, contamination probe)

**What it is.** Paradox is a dexterity performed with a double-hip-pivot. It always co-occurs with a dexterity and never floats free, which is consistent with its being a parameter. But whether it is a parameter (a manner, scoring +0) or a distinct scored event (+1) is unresolved. Every paradox formula therefore has an ADD that is one of two values.

**Reach.** One paradox variant on each of the 152 clean 1-dex formulas: 152 ambiguous formulas. The ambiguity is entangled with the pending rules-expert scoring ruling on how a blurry-named trick's extra element is counted.

**Representative formula.** `CLIP > OP IN [DEX] [PDX] > OP CLIP [XBD] [DEL]`: ADD is 3 (paradox as parameter) or 4 (paradox as scored event).

## 7. unresolved-posture, no-plant (152 formulas, contamination probe)

**What it is.** Support-leg posture (planted, no-plant, airborne) is real, per-step, and structural, but whether a no-plant suspension is a scored event in its own right or a licensing parameter (a condition that lets a co-occurring event score) is unresolved. A no-plant variant of a clean formula therefore has an indeterminate ADD.

**Reach.** One no-plant variant on each of the 152 clean 1-dex formulas: 152 formulas. The grade-neutrality claim for posture rests on a single comparison in the corpus, so it is the least-tested of the three parameters.

**Representative formula.** `TOE > OP OUT [DEX] > SAME TOE [DEL] {no-plant}`: ADD is 2 (posture as licensing parameter) or 3 (posture as scored event).

## 8. missing-primitive, pogo (structural probe)

**What it is.** Pogo is a set that adds one scored point with no dexterity, no body step, and no contact. In the four-primitive basis there is no token that carries its point, so the generator cannot emit a well-formed scored formula for it at all: the probe row is `POGO ??? +1`, a placeholder standing in for a string the grammar cannot produce. This is the constructive form of the closure study's conclusion: pogo is not merely uncertain, it is unwritable in v1.0.

**Relation to the bare-surface kick.** Failure 4 (bare-surface kick) and this are the same phenomenon seen twice: a scored point with no scored generator. Both point to a candidate fifth primitive, and both almost certainly resolve together.

## 9. unresolved-notation, generic `SET` launch (structural probe)

**What it is.** A move launched from the generic `SET` token names no entry surface, so the launch contact's `surface` parameter is unbound. The formula is underspecified: the grammar knows a contact begins the move but not on which surface, so entry-dependent reasoning (and any compatibility check that reads the entry) cannot proceed.

**Representative formula.** `SET > SAME IN [DEX] > SAME TOE [DEL]`: the terminal is fully specified, the launch is not.

## 10. unresolved-simultaneity, the `>>` operator (structural probe)

**What it is.** The notation carries a layered-step operator `>>` (seen in fully-notated tricks such as Fog: `CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > ...`), which marks two steps as layered or simultaneous rather than sequential. The grammar does not define whether the two steps each score independently or count as one simultaneous event. The 0-and-1-dexterity scope never forces the operator (a single dex cannot be layered against another), so it is **unexercised, not resolved**: it is carried into any higher-dexterity generation still undefined. Flagged now so it is not mistaken for settled when higher-dex work begins.

**Representative formula.** `... > OP IN [DEX] >> OP IN [DEX] > ...`: the two layered dexes score 2 (independent) or 1 (one simultaneous event); undefined.

## Cross-cutting note: two thresholds

The failures separate into two groups with different consequences, which is the catalog's main structural finding:

- **Grading failures with vast reach:** rotation, paradox, posture (608 formulas across the clean core). Few concepts, but they gate almost the entire parameterized space. These block *usefulness for exploration*.
- **Primitive-floor and notation failures with small fixed reach:** pogo, the bare-surface kick, peak, generic `SET`, simultaneity. These block *closure*, but each touches only a small fixed set of formulas.

The enumeration-hygiene faults (duplicate-generation, redundancy) block neither and are removed by a dedup rule. This is why the paper's final recommendation is to pin the three parameter grades provisionally (clearing the vast-reach group) before, and separately from, ruling pogo's primitive status (which closes the floor).
