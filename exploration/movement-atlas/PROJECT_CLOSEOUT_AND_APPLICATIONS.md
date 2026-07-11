# Movement Atlas — Project Closeout and Applications Report

Exploration-only. This is not a research summary. It answers one question: what did the
Atlas produce that is now useful, and what should happen with it. It closes the research
and opens a bridge into engineering.

The governing frame, established late and worth stating first: the Atlas is a compiler.
Research computes verified relationship tables, production consumes tables, the interface
visualizes tables, and the Atlas never touches the interface directly. Everything below is
sorted by that discipline.

---

## 1. Major discoveries

Only findings that survived falsification and carry lasting value, sorted by how far they
may travel.

### Production-ready (verified, promotable as-is)

- **The Movement Neighbor v1 relationship.** The complete, audited relationship for the
  bounded eight-trick one-dex toe neighborhood: eight atoms, twelve undirected edges,
  three-regular, each edge labeled with the single movement change it represents. Every
  invariant passed, the edge count was derived rather than assumed, and the relation is
  proven disjoint from the alias and operator relations. This is the one production-quality
  structural relationship the project produced.
- **A repeatable generate-then-audit pipeline.** A read-only generator that reads Atlas
  coordinates and emits verified node, edge, and directed tables, with a self-contained
  audit of every invariant. It is reusable for the next bounded neighborhood without
  redesign.

### Doctrine-ready (settled ideas that may inform public copy or governance, no scaffolding)

- **The Movement Neighbor definition and its invariants.** Two tricks are neighbors when
  they differ by exactly one structural movement choice inside the same bounded
  neighborhood. Durable, testable, and version-extensible.
- **The movement-language framing.** Freestyle is a movement language, not a list of
  names; structure is more fundamental than naming; names are labels on structures; many
  names can point at one structure; a trick is a composition of a set, one or more leg
  circles, and a landing surface.
- **ADD as the count of scored components.** Reaffirmed by the Atlas; already the shipped
  scoring law.
- **The notation is a scoring-and-identity shorthand, not a full physical description.**
  Safe to teach with careful, positive wording.
- **The "eight from three" pedagogy.** The eight foundational one-dex toe tricks are the
  eight combinations of three plain movement choices, taught with named tricks and no
  mathematics.

### Research-only (kept as record, cited only by future research, never public or production)

- The geometric and algebraic models: the dex cube as a cube, the two-dex six-cube, the
  hypercube, the fiber bundle, the surface and taxonomy lattices, the symmetry groups, the
  handoff-state formalism with its monodromy and state transport, and the coordinate
  formalism.
- The uniform-hypercube and orthogonal-taxonomy result (families are imposed by usage, not
  natural structure).
- Any count of possible, unnamed, or impossible movements.

---

## 2. Production assets created

An inventory of everything that now exists because of the Atlas.

| Asset | What it is | Where it lives |
|---|---|---|
| Movement Neighbor doctrine | The durable definition and invariants of a movement neighbor | `exploration/atlas-glossary-integration-2026-07-11/MOVEMENT_NEIGHBOR_DOCTRINE.md` |
| Generated neighbor table | The verified node, edge, and directed CSVs for the eight one-dex toe atoms | `exploration/movement-neighbor-v1-2026-07-11/movement_neighbor_{nodes,edges,directed}.csv` |
| Verified invariants | A reusable invariant suite (closure, one-change, symmetry, irreflexivity, no-parallel, regularity, derived count, label accuracy, relation separation) run as an audit | the generator's audit pass plus `MOVEMENT_NEIGHBOR_QC.md` |
| Reusable generator | The read-only generate-then-audit script, the compiler for future neighborhoods | `exploration/movement-neighbor-v1-2026-07-11/generate_movement_neighbors.py` |
| Movement-language framing | The public-safe framing and the harvest that ruled each Atlas conclusion public, cautious, internal, or research-only | `exploration/movement-atlas/DOCTRINE_HARVEST_AND_GLOSSARY_PROPOSAL.md` and the glossary integration plan |
| Glossary integration plan | The museum-curator plan: one figure, one expander, three wording refinements, and a firm exclusion list | `exploration/atlas-glossary-integration-2026-07-11/INTEGRATION_PLAN.md` |
| Movement Explorer design | The guided-then-free interactive design, powered by the neighbor table, with its risks and governance flag | `exploration/atlas-glossary-integration-2026-07-11/MOVEMENT_EXPLORER_DESIGN.md` |
| Ownership determination | The finding that structural neighbor is already a first-class production concept, and how the movement-neighbor relation fits beside it | `exploration/atlas-glossary-integration-2026-07-11/STRUCTURAL_NEIGHBOR_OWNERSHIP.md` |
| QC opportunities | Atlas-informed production QC: match by structural formula, not by name string or notation, for dedup and promotion | the Atlas production-QC notes (internal doctrine) |

---

## 3. Immediate applications

For each production-ready result, where it can be applied.

### The Movement Neighbor table

- **Glossary:** the Movement Explorer, a Nearby Movements view, the "eight from three"
  figure's relationships, and a Compare Two Tricks feature all read this one table.
- **Trick pages:** a distinct "one movement change away" block on the eight atom pages,
  kept separate from the existing operator-based structural-neighbor block, and Compare
  Two Tricks.
- **Search and browse:** a "near this trick," did-you-mean, or more-like-this affordance.
  This is the surface most likely to justify a queryable form later.
- **Teaching:** a guided learning mode that walks one change at a time.
- **Promotion analysis:** a completeness lens. If a proposed new trick is one attribute
  away from an existing named trick inside a bounded neighborhood, that is evidence about
  whether it is a genuine addition or a restatement.
- **Emerging Vocabulary:** the same lens distinguishes a real new movement from a
  one-change relabel of something already named.
- **Parser and QC:** formula-identity as a merge guard. Match tricks by structure, never by
  name string or by notation equality, when deduping or promoting.

### The movement-language framing

- **Glossary:** the wording refinements and the teaching progression from surface to
  neighbors.
- **Teaching:** the frame that makes the whole vocabulary feel systematic rather than
  memorized.

---

## 4. Research branches

Clearly marked so no one reopens settled ground or mistakes a dead end for an opportunity.

- **Atlas Volumes I to IV — complete.** Frozen. Applied, not extended.
- **Movement Composition (combos and transitions) — parked.** A concept spec exists; it
  needs a curator-seeded transition matrix and was intentionally not made a volume.
- **Higher-dimensional generation (two-dex neighborhoods, the hypercube) — deferred.** The
  clean two-dex structure was falsified, and the space is large and unresolved. A verified
  neighbor table cannot yet be built there.
- **Biomechanics and realizability — future.** The Atlas maps what the grammar can
  describe, not what a body can perform. Whether a describable movement is physically
  possible is out of scope and unstarted.
- **Explicitly retired (kept only as the record of what was tested and rejected):** the
  free-product two-dex six-cube; the claim that notation can reconstruct a movement; the
  claim that the movement universe partitions into natural families; the handoff-state
  model as complete or recoverable from notation; and the two false positional distinctions
  (pixie same-side eggbeater and pixie same-side double leg over, which collapse into their
  ordinary variants). These stay in exploration as falsified findings, never revived as
  fact.

---

## 5. Recommended implementation order

Turning the Atlas from research into engineering. Each step is independently valuable and
gated; none authorizes the next automatically.

1. **Promote Movement Neighbor v1 into production (generated data only).** Emit a
   generated, checked-in TypeScript resource from the verified tables, loaded by the
   service layer, under a distinct reader-facing name that keeps it separate from the
   operator-based structural-neighbor concept. No UI. This gates everything downstream. The
   naming decision is the one thing to settle first.
2. **Add glossary movement-language improvements.** The low-risk wording refinements:
   sharpen the object-separation framing, prefer foundational over primitive for the atoms,
   and add the careful notation-is-shorthand note. Pure replacement, minimal footprint.
3. **Build the static "eight from three" illustration.** A collapsed advanced figure in the
   Dexterities chapter, showing the eight named tricks and the three choices with no
   mathematics. The no-JavaScript fallback for step 4.
4. **Add the interactive "one movement change away" explorer.** The guided-then-free
   experience, a progressive enhancement over the static figure, reading the promoted
   table. Needs an explicit maintainer decision, since it would be the glossary's first
   interactive widget and sits against the symbolic-restraint posture.
5. **Apply Atlas-derived QC to promotions and Emerging Vocabulary.** Use formula-identity
   and the neighbor lens to catch one-change relabels and structural duplicates before they
   are promoted.
6. **Park the remaining Atlas research until a new approved phase.** Movement composition,
   higher-dimensional generation, and realizability stay parked. No further Atlas expansion
   until the applications above are implemented.

---

## Assessment

The Atlas project achieved its objective. It established a structural language for
reasoning about freestyle movements, produced one verified production-quality relationship
in Movement Neighbor, identified a small set of educational improvements for the glossary,
and created a repeatable pipeline for converting exploratory research into production-safe
knowledge. The falsified branches were retired honestly and remain as a record of what was
tested. Further Atlas expansion is not recommended until the current applications have been
implemented. The research is closed; the engineering can begin.
