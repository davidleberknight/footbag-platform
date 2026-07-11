# The Freestyle Movement Atlas: Architecture and Roadmap

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. This is the architectural blueprint for the Atlas project: it defines how every future volume is built, organized, and related to the others, so future work extends one coherent atlas rather than accumulating isolated notes. It is not grammar work, generation work, or doctrine work, and it neither modifies nor expands Atlas Volume I, which is frozen.

## Section 1 — Purpose

### The role of the Atlas

The Atlas is the permanent, name-free coordinate system for the freestyle movement universe. Its job is to give every movement a stable structural address, so that any future investigation, whatever branch it belongs to, can refer to a location rather than to a trick name. A location means the same thing to a doctrine question, a promotion review, a notation decision, a composition study, and a biomechanics study; a trick name does not, because names are historical, uneven, and cover only a fraction of the terrain.

### Four things that are easy to confuse

- **The dictionary** is the community's catalog of named tricks. It is driven by history and popularity, it is live production data, and it is deliberately incomplete relative to the movement space: it labels the movements people chose to name. It answers "what do we call this."
- **The movement language** is the vocabulary of primitives and the fact that they combine: the small basis of generators (a contact, a cross-body contact, a dexterity, a body step) out of which every movement is built. It answers "what is a movement made of."
- **The movement grammar** is the formal rule set that generates well-formed movement formulas from the language, together with the scoring law that assigns difficulty. Grammar v1 is the current, frozen such rule set. It answers "which movements are well-formed, and what is each worth."
- **The movement atlas** is the enumerated map of the space the grammar generates, addressed by a coordinate system, recording every movement whether named or not, and separating real terrain from grammar structure and from unresolved frontier. It answers "where is every movement, and what do we know about it."

These stack: the language supplies the pieces, the grammar supplies the rules, the atlas is the enumerated and addressed output of those rules, and the dictionary is a thin naming layer laid over the atlas. Volume I measured that layer at roughly one named coordinate in seven, clustered on a single fiber.

### Why the atlas is now the coordinate system for future research

Because it is the only surface that sees the whole universe at once. The dictionary sees the named seventh. The grammar generates the space but does not hold a stable, citable enumeration of it. A frozen atlas volume is a fixed reference: a coordinate cited today means the same thing in five years, even as the dictionary grows and the grammar is revised, because revisions produce new volumes rather than rewriting old ones. The atlas is to movement research what a coordinate grid is to geography: not the terrain and not the names, but the addressing that lets everyone talk about the same place.

## Section 2 — Atlas principles

Concise and governing. Every volume obeys these.

1. **Coordinates are primary; names are annotations.** A location is addressed structurally; its trick name, if any, is a field on that address, never the address.
2. **The atlas records structure, not popularity.** Presence on the map is a fact about the grammar, not about how often a movement is performed or whether it is named.
3. **Generation and validation are separate.** One method produces coordinates; a distinct method checks each against the grammar and the schema. A volume states both.
4. **Grammar-valid does not imply physically realizable.** Well-formed under the movement language is the only claim; the body is out of scope until the realizability volume, and even then realizability is a separate annotation.
5. **Absence of a name is not evidence of impossibility.** Unnamed means unlabeled, nothing more. The atlas never reads a blank name as a movement that cannot exist.
6. **Grammar structure is marked, never mistaken for terrain.** Blocked coordinates (the grammar refusing) and artifact coordinates (enumerator duplicates) are labeled and excluded from the real surface; they are the map's projection, not places on the ground.
7. **Uncertain regions are marked, not resolved.** Where the grammar has an open question, the atlas records the uncertainty and stops. It does not settle doctrine to fill a gap.
8. **Every volume has explicit boundaries.** A volume states where it stops, in scope and in knowledge, so no reader mistakes a boundary for a claim.
9. **Previous volumes remain frozen.** A published volume is never rewritten. New discoveries go into later volumes or into published errata that cite the volume they correct.
10. **One coordinate system across all volumes.** The addressing extends to new dimensions; it is never redefined. A Volume I address remains valid and unchanged in every later volume.
11. **The atlas never recommends action.** It does not propose names, promotions, or rulings. It is the input to those decisions, not the decision.

## Section 3 — Atlas organization

Every future volume is defined by five things: its scope, its coordinate system (how it extends the addressing), its assumptions, its boundaries, and its relationship to earlier volumes. The recommended roadmap follows, adjusted from the example where the dependency evidence suggests a cleaner sequence.

### The dependency logic behind the sequence

Two facts shape the order. First, composition and biomechanics both take the atlas of single movements as their input: composition draws edges between movement locations, and biomechanics attaches a judgment to each location, so both must come after the single-movement atlas is reasonably complete. Second, the parameter and body-operator layers (rotation, paradox, posture, body steps) are overlays that multiply any single-movement skeleton without changing its dexterity count, so they are naturally their own volume rather than being folded into the dex-count volumes. This gives: finish the single-movement skeletons (dex count), then the overlay layer, then the two layers that build on the whole single-movement atlas.

### Volume I — Zero- and one-dexterity movement universe (complete, frozen)

- **Scope.** Every movement with zero or one dexterity, on established surfaces.
- **Coordinate system.** The surface-fiber bundle: a base point is a launch-and-landing surface pair; over it sits the eight-vertex dex cube; a movement is a fiber plus a vertex.
- **Assumptions.** The four-generator basis; ADD equals the count of scored generators; plain, planted, non-rotational, non-paradox core.
- **Boundaries.** Higher dexterity, composition, naming, unresolved primitives, the peak surface, parameter grades, physical realizability.
- **Relationship.** The root volume; every later address is an extension of its addressing.

### Volume II — Two-dexterity movement universe

- **Scope.** Movements with exactly two dexterities, on the frozen basis.
- **Coordinate system.** A fiber carrying a pair of cube vertices, constrained by the internal handoff (the first dexterity's terminal state must feed the second's entry). This is a product-of-cubes with a transition constraint, not a free 64-vertex product.
- **Assumptions.** Same four-generator basis and scoring law as Volume I. The unresolved simultaneity operator (the layered-step marker) and the parameter grades are marked uncertain, exactly as Volume I marked peak and the bare-surface kick, rather than resolved.
- **Boundaries.** Three-and-higher dexterity; the overlay layer; composition; realizability.
- **Relationship.** Extends Volume I's cube to an ordered pair of cubes; every Volume I coordinate reappears as the degenerate one-dex case.

### Volume III — Body-operator and parameter topology (the overlay layer)

- **Scope.** The modifiers that stack on any movement skeleton without adding a dexterity: body operators (spin, duck, dive, and their kin), rotation, paradox, posture, and the far-receiver X-dex condition.
- **Coordinate system.** An overlay on the existing addressing: a base coordinate from Volume I or II plus an overlay vector of parameter settings. It adds fields to an address; it does not create a new base geometry.
- **Assumptions.** The parameter grades must be settled or explicitly marked uncertain; this volume is where the rotation, paradox, and posture grade questions are mapped as a region rather than silently scored.
- **Boundaries.** Composition; realizability. Does not introduce new dexterity structure.
- **Relationship.** Multiplies the single-movement volumes; orthogonal to dexterity count, which is why it is its own volume rather than folded into I or II.

### Volume IV — Movement composition (the transition layer)

- **Scope.** Sequences of movements: which movement can follow which, and why some cannot.
- **Coordinate system.** Edges over the single-movement atlas. A composition is a path through movement locations; the node set is Volumes I through III, and an edge exists when one location's terminal state can serve as the next location's entry state.
- **Assumptions.** The single-movement atlas is the fixed node set; a curator-seeded transition-compatibility matrix is the one input the grammar cannot supply. The concept is already drafted as the state-transition checker note under `exploration/`.
- **Boundaries.** Realizability; it judges connectability, not performability.
- **Relationship.** Builds strictly on top of the single-movement atlas; adds edges, never new nodes.

### Volume V — Biomechanical realizability

- **Scope.** Which atlas locations a human body can actually perform.
- **Coordinate system.** A realizability annotation attached to each existing location; it adds no new addresses.
- **Assumptions.** The full single-movement atlas (and, for combos, Volume IV) is the substrate. Realizability is an independent judgment, never inferred from grammar-validity or from the presence or absence of a name.
- **Boundaries.** This is the hard edge Volume I refused to cross; it is deliberately last, because it needs the whole map beneath it and because it is the only layer that leaves pure movement-language territory for the body.
- **Relationship.** The outermost layer; annotates everything below it and changes no earlier address or status.

### Recommended order

Volume I (done), then II, then III, then IV, then V. The single-movement skeletons (I, II) come first; the overlay layer (III) follows because it multiplies those skeletons; composition (IV) and realizability (V) come last because each takes the completed single-movement atlas as its input. Volume III may in practice proceed in parallel with II, since it is orthogonal to dexterity count, but it is numbered after II so the base skeletons exist before the overlay is mapped onto them.

## Section 4 — Atlas standards

Every volume, without exception, contains the following, in this order. This is the standard template; a new volume is a fill-in of this skeleton, not a fresh format.

### Required contents

1. **Coordinate system.** How this volume addresses its movements, and how that addressing extends (never redefines) the earlier volumes.
2. **Assumptions.** The basis, scoring law, and any frozen-grammar facts the volume relies on; and every open question it chooses to mark uncertain rather than resolve.
3. **Generation method.** The exact procedure that produces the coordinates, stated so it is reproducible, reading only from within `exploration/` and never from production.
4. **Validation method.** The distinct procedure that checks each coordinate against the grammar and the schema, kept separate from generation.
5. **Census.** The counts: total coordinates, and the breakdown by grammar status (valid, blocked, artifact, uncertain) and by representation status (named, folk-named, unnamed).
6. **Occupancy analysis.** Where names and terrain sit across the coordinate space: which regions are dense, which empty, which fully structured.
7. **Symmetry analysis.** The regularities the coordinate space exposes: symmetry groups, fiber structure, and any invariants the existing names respect.
8. **Known boundaries.** Where the volume stops, split into edges of scope and edges of knowledge, plus the hard realizability edge.
9. **Unresolved questions.** The open questions the volume surfaced but did not answer, each routed to the branch that owns it.
10. **Machine-readable catalog.** One row per coordinate, with the structural address, formula, status fields, and name annotation. The catalog is the volume's ground truth; the prose reads from it.

### Standard volume file layout

Each volume lives in its own folder under `exploration/movement-atlas/` and carries the same file set:

```
exploration/movement-atlas/volume-N/
  generate_volume_N.py     generation + validation + census (reads only exploration/)
  volume_N_catalog.csv      the machine-readable catalog (required content 10)
  VOLUME_N.md               the canonical volume (contents 1-8, with the final question)
  VOLUME_N_GUIDE.md         reader's guide: how to read a coordinate and each status
  VOLUME_N_ANALYSIS.md      landscape narrative (occupancy, symmetry, what it reveals)
  VOLUME_N_BOUNDARIES.md    known boundaries and unresolved questions (contents 8-9)
```

Volume I already realizes this layout; it is the reference implementation of the template.

## Section 5 — Research workflow

Future work falls into eight kinds of activity. The governing rule is simple: **only atlas expansion writes the atlas; every other activity references it.** A published volume is frozen, so nothing on this list edits an existing volume; the ones that would change what the atlas should say instead trigger a new volume or a published erratum.

- **Grammar research.** Modifies the movement language or grammar, which sit upstream of the atlas. It never edits a frozen volume. When the grammar changes, the change is realized by issuing a new volume (or an erratum) built on the revised grammar; the old volume stays as the record of the old grammar.
- **Atlas expansion.** The only activity that writes the atlas. It produces a new volume against the template, or a published erratum that cites the volume it corrects. Freezing on publication is what makes citation stable.
- **Doctrine work.** References atlas locations and may resolve a region the atlas marked uncertain (for example the primitive-floor or peak questions). Resolving an uncertain region does not rewrite the volume that marked it; it unblocks the next volume, which maps the now-settled region.
- **Promotion work.** References atlas locations. It changes the dictionary (turning an unnamed coordinate into a named one), not the atlas. The atlas's naming annotation catches up in the next volume or erratum, never retroactively in a frozen one.
- **Parser work.** References the atlas: it maps a notation string to a coordinate. It consumes the coordinate system and does not modify it.
- **Historical research.** References atlas locations: which coordinates carry folk names, and when they were named. It annotates history onto locations; it does not change them.
- **Movement composition.** References atlas locations as its node set and builds the transition layer (Volume IV) on top. It adds edges between existing locations; it creates no new single-movement coordinates.
- **Biomechanics.** References atlas locations and attaches realizability (Volume V). It adds a judgment to each location and changes no address or status beneath it.

In one line: grammar research feeds new volumes; atlas expansion is the only writer; doctrine unblocks the next volume; promotion, parser, historical, composition, and biomechanics all read the atlas and build beside or above it.

## Section 6 — Readiness for Volume II

The determination, not the work. Volume II is not begun here.

### Prerequisites already satisfied

- The coordinate system, which extends to two dexterities as an ordered pair of cubes with an internal handoff constraint, with no redefinition of Volume I's addressing.
- The frozen Grammar v1 basis and scoring law, which carry forward unchanged.
- The generation-and-validation methodology, kept separate, proven in Volume I.
- The classification taxonomy: valid, blocked, artifact, uncertain for grammar status; named, folk-named, unnamed for representation. Volume II reuses it verbatim.
- The uncertain-marking discipline, which lets Volume II proceed on the frozen basis by marking the open questions rather than resolving them.
- The boundaries discipline and the standard template, so Volume II has a fixed shape to fill.

### Assumptions that carry forward unchanged

The four-generator basis; ADD equals the count of scored generators; the surface lattice; the dex cube as the unit of dexterity structure; the fiber-bundle framing; and the name-free addressing. Volume II changes none of these; it composes two copies of the cube under the frozen rules.

### New structural questions that appear only with two dexterities

These are genuinely absent at one dexterity and are the substance of Volume II:

- **Ordering and non-commutativity.** With two dexterities in sequence, does order matter: is the first-then-second movement structurally distinct from second-then-first? One dexterity cannot pose this.
- **The internal handoff constraint.** The second dexterity must begin from the state the first leaves. This constraint is what makes the two-dex space a constrained product of cubes rather than a free sixty-four-vertex product, and it is the first place the atlas meets a within-move transition rule.
- **Simultaneity versus sequence.** The layered-step operator (two dexterities performed together rather than in order) is unresolved in the frozen grammar and is never exercised at one dexterity. Volume II is where it first bites, and it must be marked uncertain until ruled.
- **Cross-dexterity grade interaction.** Whether the second dexterity's grade depends on the first (the far-receiver condition is a cross-dexterity relationship), which cannot arise with a single dexterity.
- **Symmetry growth.** Whether the Klein-four symmetry of the single cube extends to a larger group on the ordered pair, or breaks under the handoff constraint.
- **The one-move-versus-two-moves boundary.** A two-dexterity movement is itself a tiny sequence, which raises the definitional question of where a single move ends and a composition begins. This must be settled as a scope decision for Volume II before it can be distinguished cleanly from Volume IV.

### Mistakes to avoid, from Volume I

- **Do not let the enumerator over-generate silently.** Volume I's midline artifacts and self-fiber redundancy showed that the raw cross-product contains non-distinct coordinates; the two-dex product will contain far more, since the handoff constraint blocks many pairings. Mark them as artifact or blocked; never hide them and never count them as terrain.
- **Do not mistake grammar structure for terrain.** Keep blocked and artifact coordinates separated from the valid surface, as Volume I did, so the real count is honest.
- **Do not resolve uncertain regions inside the atlas.** Mark the simultaneity rule and the parameter grades uncertain and stop; resolving them is doctrine work that unblocks a later volume, not atlas work.
- **Do not organize by trick name.** Organize by structure, as Volume I did; the two-dex naming layer will be even thinner and even more clustered, so name-first organization would hide almost the entire space.
- **Keep generation and validation separate**, freeze the volume on publication, and state plainly that physical realizability is out of scope.

### The determination

The project is ready to begin Volume II deliberately. Every methodological prerequisite is satisfied, the assumptions carry forward without change, and the new structural questions are identified in advance so they can be mapped rather than stumbled into. The one standing condition is the uncertain-marking discipline: Volume II proceeds on the frozen basis and marks the simultaneity rule, the parameter grades, and the primitive floor as uncertain regions, exactly as Volume I marked its own open questions. Beginning it is a future decision; this blueprint ensures that when it begins, it extends one coherent atlas rather than starting over.
