# Trick Universe Research, Phase II-A: Enumerating the 0-and-1-Dexterity Movement Grammar

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. No production code was modified, no dictionary row touched, no trick authored, no name generated, and no claim of physical realizability is made. This document and its companion CSV enumerate movement **formulas** only. A formula is the primary object; names, aliases, canonical status, and public authoring are annotations placed on a formula after the fact.

Companion files in this folder:
- `phase_2a_movement_formulas.csv` : every generated movement formula, one per row.
- `UNNAMED_CATALOG.md` : the grammar-valid-but-unnamed formulas grouped by structural family.
- `generate_phase_2a.py` : the read-only enumerator that produced the CSV.

This phase builds directly on Phase I (`exploration/trick-universe-matrix/`, Slices 0-7), which defined the movement grammar from first principles, established the ADD-equals-scored-events invariant across the whole corpus, and mapped the eight-vertex dexterity cube and its surface-fiber lattice. Phase 1.5 (`exploration/ev-formula-identity-audit-2026-07-10/`) validated the movement-language approach against the Emerging Vocabulary backlog. Phase II-A does not re-derive any of that; it uses the completed grammar as a generator.

---

## 1. The question

Phase I described the movement space and placed the observed dictionary inside it. Phase II-A asks a narrower, generative question:

> Within an aggressively limited slice of the grammar, what is *every* structurally valid movement formula, and how does each relate to what the dictionary already names?

This is a grammar-generation problem, not a biomechanics problem. "Grammar-valid" means "expressible under the current movement grammar." It is not a claim that a formula is physically realizable, and "grammar-blocked" is not a claim that a movement is impossible. Those are Phase II-B questions and are not touched here.

## 2. The aggressive limit (Phase II-A scope)

The investigation is deliberately confined so the enumeration is finite, grounded, and complete rather than sprawling. A generated formula must contain:

- zero or one dexterity;
- only established surfaces, roles, and notation (the closed code vocabulary Phase I inventoried);
- no undefined operators, no doctrine-blocked constructs, no parser extensions, no hypothetical notation.

One composition layer is deliberately bracketed. A body operator (paradox, spinning, ducking, symposium, gyro, and the rest) adds a `[BOD]` or `[PDX]` scored event **without** adding a new dexterity, so a one-dexterity formula can legally carry a stack of them (this is why `gyro_ducking_symposium_torque` scores 7 with a single dex). Enumerating that power set is exponential and is exactly the "generate every imaginable trick" trap the mission forbids. Phase II-A therefore enumerates the irreducible **geometric skeletons** (launch, at most one dexterity, terminal) and treats body-operator decoration as a counted composition layer, discussed in section 7 but not expanded row by row.

## 3. The grammar used (carried from Phase I, not invented here)

The generator is the five-dimensional surface lattice from Slice 2B:

```
launch_surface  x  dex_side  x  dex_direction  x  terminal_side  x  landing_surface
```

The three binary middle axes are the **cube**: `dex_side ∈ {SAME, OP}`, `direction ∈ {IN, OUT}`, `terminal_side ∈ {SAME, OP}` — eight vertices. The two surface axes select a **fiber**. Three properties of the two surfaces, read straight from the operational notation, decide what the cube does on each fiber:

- **Grade** of the landing: plain `SURFACE [DEL]` scores 1; hard scores 2, either cross-body `[XBD][DEL]` (clipper) or unusual-surface `[UNS][DEL]` (heel, sole, cloud). A dexterity onto a hard landing therefore lifts the whole cube one grade (a one-dex formula reaches ADD 3).
- **Laterality** of the landing: a paired surface admits both terminal sides; a midline surface (head, forehead, neck, cloud) collapses the terminal-side axis, halving the cube.
- **Symmetry** of the launch: a central launch (toe) opens the full cube; a cross-body launch (clipper) forecloses the SAME dex-side face under bag control.

ADD is the count of scored brackets, the strongest invariant in the theory (892 of 894 corpus tricks in Phase I). Every generated formula carries its ADD by construction.

Established surfaces used (the closed code vocabulary): launches `toe` (central), `clipper` (cross-body), and the self-lateral launches of the paired plain surfaces; landings `toe, inside, outside, knee, shoulder` (plain paired), `head, forehead, neck, peak` (plain midline), `clipper` (hard cross-body paired), `heel, sole` (hard unusual paired), `cloud` (hard unusual midline).

## 4. The generation process

The enumerator (`generate_phase_2a.py`) emits three layers:

1. **Zero-dex stalls** — one held delay per landing surface; ADD equals the landing grade.
2. **Zero-dex body steps and bare kicks** — a single `[BOD]` (spin, duck, dive, flying), and the bare-surface kicks whose scoring is an open Phase I question.
3. **One-dex cube** — for every enumerated `(launch, landing)` fiber, all eight cube vertices, each written as `LAUNCH > dex_side direction [DEX] > terminal`, with the three preservation rules applied to mark each vertex valid, blocked, or uncertain.

The generic `SET` launch is an abstraction and is not emitted as a concrete formula. Contralateral surface-to-surface transfers (for example outside-to-inside), which Slice 2B flags as handedness-breaking, are outside the aggressive limit and are not enumerated; they belong to a wider pass.

## 5. Classification (the five required buckets)

Every generated formula is placed in exactly one bucket. Definitions, so the boundaries are auditable:

1. **Existing formula** — the coordinate is realized by a dictionary trick whose canonical name is its structural description (the eight toe-fiber atoms; the inside/outside around-the-world self-fiber vertices; the named stalls and bare body actions).
2. **Existing under another name** — the coordinate is realized in the dictionary but under an opaque folk name rather than its structural form (`guay` = inside pickup; `inspinning_reverse_guay` = inside pixie; `bubba` = clipper-launched illusion).
3. **Grammar-valid but unnamed** — a fully expressible coordinate with no dictionary label.
4. **Grammar-blocked** — the grammar itself forbids the coordinate: a midline landing's dead terminal-side axis (a duplicate vertex), or a cross-body launch's foreclosed SAME dex-side face.
5. **Grammar-uncertain** — current theory cannot decide validity: the `peak` surface (apex vs timing marker, Slice 2B open question) and bare-surface kick scoring (the one modeling gap Slice 1 flagged).

### Classification summary

| Bucket | Count |
|---|---|
| Existing formula | 22 |
| Existing under another name | 3 |
| Grammar-valid but unnamed | 144 |
| Grammar-blocked | 72 |
| Grammar-uncertain | 22 |
| **Total generated** | **263** |

By layer: 13 zero-dex stalls, 5 zero-dex body steps, 5 zero-dex kicks, 240 one-dex cube formulas.

By ADD: 14 at ADD 1, 188 at ADD 2, 64 at ADD 3, 5 undetermined (the bare kicks).

Grammar-blocked breaks down as 40 cross-body-launch foreclosures and 32 midline-landing dead-axis duplicates. Grammar-uncertain is 17 peak-surface formulas plus 5 bare-surface kicks.

### The reconciliation that matters

The dictionary names **25** formulas inside this slice (22 structural + 3 folk). The grammar validates **169** (25 named + 144 unnamed). So within the 0-and-1-dexterity geometric skeleton alone, and before any body-operator decoration, the named vocabulary occupies roughly **15%** of the grammar-valid coordinates. The other 85% are not missing tricks and not proposals to author anything; they are unlabeled coordinates of the movement space, exactly the Phase I thesis made quantitative one layer at a time.

## 6. Catalog of the unnamed formulas

The full grouped catalog is `UNNAMED_CATALOG.md`. The 144 grammar-valid-but-unnamed formulas cluster into a small number of structural families:

| Structural family | Unnamed count | ADD |
|---|---|---|
| toe-launch / plain-paired cube | 30 | 2 |
| self-fiber / plain-paired cube | 30 | 2 |
| toe-launch / unusual-surface lifted cube | 20 | 3 |
| clipper-launch / plain-paired cube | 19 | 2 |
| toe-launch / plain-midline square | 12 | 2 |
| clipper-launch / unusual-surface lifted cube | 10 | 3 |
| toe-launch / cross-body lifted cube | 8 | 3 |
| clipper-launch / plain-midline square | 6 | 2 |
| clipper-launch / cross-body lifted cube | 4 | 3 |
| unusual / body / stall remnants | 5 | 1-2 |

## 7. Patterns that emerge naturally from the grammar

These are observations about the enumerated space, not recommendations.

- **The named vocabulary is a single fiber, almost.** Of the 25 named coordinates, 8 are the toe-fiber cube, 3 are folk names, and the remainder are stalls and body actions. Every other plain-paired fiber (inside, outside, knee, shoulder, and toe-to-inside) carries a structurally identical eight-vertex cube that the tradition has barely labeled. The gap between dictionary and grammar is overwhelmingly the unfilled plain-paired fibers.

- **The cube is the unit of surprise, not the trick.** The same eight-vertex object recurs on every plain-paired fiber. Once one fiber is named to completion (the toe), naming any other fiber adds no new *structure*, only new *labels*. This is the grammar's clearest economy: the movement universe at this layer is a few surface parameters times one small cube.

- **Hardness lifts, midline halves, cross-body forecloses — and they stack cleanly.** The three surface properties act on three different parts of the cube, so their effects compose without interaction. A hard midline landing (cloud) both lifts to grade 3 and halves; a clipper launch onto a midline landing both forecloses and halves. The blocked count (72) is entirely the arithmetic of these three independent constraints.

- **Grade is a surface fact, not a dexterity fact.** Every one-dex formula on a plain landing is ADD 2; every one on a hard landing is ADD 3. The dexterity contributes a fixed +1; all ADD variation at this layer comes from the terminal surface. Difficulty, at the one-dex layer, is a property of where you land, not of what the leg does.

- **"Zero dexterity" is a real and populated layer.** Thirteen stalls, five body steps, five kicks — the bag can be moved and scored without any dexterity at all. The named atoms sit one layer above this floor; the kicks expose the floor directly.

- **The two genuinely open cells are small and named.** Only two things make a formula uncertain rather than valid or blocked: the status of `peak` as a surface, and how a bare-surface kick earns its single ADD. Both were already flagged in Phase I. The grammar is otherwise decisive across this entire slice.

## 8. Research boundary

Phase II-A ends when the 0-and-1-dexterity geometric grammar is enumerated, which this document and its CSV do. Deliberately not done here, and not to be started yet:

- No body-operator power-set expansion (the counted composition layer of section 2).
- No two-or-more-dexterity enumeration.
- No contralateral-transfer or generic-`SET`-launch enumeration.
- No physical-realizability judgment. Grammar-valid is not physically realizable, and grammar-blocked is not physically impossible. The realizability question — which grammar-valid formulas a human can actually perform with bag control — is Phase II-B and requires biomechanics, video evidence, and expert validation.

Nothing here authors a trick, generates a name, changes the dictionary, or touches production code. The deliverables are this note, the companion catalog, the enumerator script, and `phase_2a_movement_formulas.csv`.
