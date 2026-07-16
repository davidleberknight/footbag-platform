# Atlas Production Handoff

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. A prioritized handoff of the Atlas conclusions mature enough to improve production, in four lanes. It proposes; it implements nothing. Every item states why it is justified, its evidence level, affected surfaces, size, whether it blocks launch, and its close condition. No item blocks launch.

## A. Glossary content

### A1. Add the proposed "Movement Language" glossary section
- **What:** add the four-paragraph section drafted in `DOCTRINE_HARVEST_AND_GLOSSARY_PROPOSAL.md` to the public glossary, with cross-links to the alias explanation, the structural-analysis chapter, and the dictionary-reading chapter.
- **Why justified:** it names, in one place, the movement-language framing the dictionary already uses everywhere; it is entirely composed of PUBLIC-NOW and carefully-worded PUBLIC-CAUTIOUS conclusions; it teaches players to separate a name from a movement, which is the single most useful takeaway of the whole research.
- **Evidence level:** high (every claim in the copy is already reflected in live production content).
- **Affected surfaces:** `src/views/freestyle/glossary.hbs` (one new section), and the glossary content module if the copy is service-shaped; no schema, no new page.
- **Size:** small (one glossary section plus three internal cross-links).
- **Blocks launch:** no.
- **Close condition:** the section is curator-approved as public copy, added to the glossary in the existing chapter architecture, and its cross-links resolve; no banned vocabulary present.

## B. Production QC

### B1. Soften the "every possible variation" history claim
- **What:** reword `freestyleHistoryNarrative.ts:105` so it does not claim the notation generates every possible variation.
- **Why justified:** grammar-describable is not exhaustive or physically realizable; the claim over-reaches a settled boundary of the research.
- **Evidence level:** high. **Surfaces:** `src/content/freestyleHistoryNarrative.ts`. **Size:** trivial (one clause). **Blocks launch:** no.
- **Close condition:** the sentence states a wide range of variations beyond the named, with no completeness or realizability claim, and its route test (if any) passes.

### B2. Optional: prefer "foundational/anchor" over "primitive" in public atom/set copy
- **What:** where public copy calls an atom or a set a "primitive," prefer "foundational" or "anchor."
- **Why justified:** the atoms are compositions; "primitive" mildly implies irreducibility. Low urgency because "foundational" is the intended pedagogical sense.
- **Evidence level:** medium (internal closure result; public impact minor). **Surfaces:** `freestyleLandingContent.ts`, `freestyleMovementSystems.ts`. **Size:** trivial. **Blocks launch:** no.
- **Close condition:** public copy avoids implying atoms are irreducible; the internal "atoms are compositions" doctrine is recorded but not asserted to visitors.

## C. Resolver and promotion implications

### C1. Guard: formula/slug identity supersedes literal-name and notation equality
- **What:** add a regression test (and confirm existing behavior) that no dedup, related-trick, or promotion path uses raw `operational_notation` equality or literal `canonical_name` equality as a merge key; alias-and-slug resolution is the sole identity path. Preserve all existing curator review and governance.
- **Why justified:** the live data has 36 notation strings shared by 2+ distinctly-named tricks (72 rows); a notation-equality or literal-name merge would collapse distinct dictionary objects. The current service already behaves correctly (slug-keyed, alias-aware); this makes that behavior a pinned invariant rather than an implicit one.
- **Evidence level:** high (the 72 collisions are measured live data). **Surfaces:** `freestyleService.ts` dedup/related paths, the promotion/loader path, and a new test. **Size:** small (a guard test; no behavior change expected). **Blocks launch:** no.
- **Close condition:** a test asserts the invariant and passes; any path found using notation or literal-name equality as an identity key is routed through alias/slug resolution instead, with curator review intact.

### C2. Doctrine note: distinct objects may share a notation
- **What:** record, as internal doctrine (not public copy), that identical operational notation does not imply identical dictionary objects, so notation is not an identity key.
- **Why justified:** prevents a future contributor from treating notation as a unique fingerprint. **Evidence level:** high. **Surfaces:** internal doctrine/skill reference (not a public surface). **Size:** trivial. **Blocks launch:** no.
- **Close condition:** the note lives with the freestyle identity doctrine; no public surface asserts notation-as-identity.

## D. Research-only findings (must stay out of production)

These are conclusions the research produced that are **not** for the public dictionary or its doctrine, recorded here so no one promotes them by accident:

- **The geometric models** (cube, hypercube, fiber bundle, lattice, symmetry group, handoff-state formalism, topology, monodromy). Mathematical scaffolding; several are upper bounds or had specific forms falsified. Never public, never doctrine.
- **The uniform-hypercube and orthogonal-taxonomy results** (Volume IV). Interesting structure, not visitor education.
- **The falsification and handoff-state findings** (Volume II erratum and interlude), including the frame-transport and leg-parity gaps. Internal research context for any future volume, not production.
- **Any count of "possible movements."** The Atlas produces upper bounds over a describable space, not counts of performable tricks; no such number should reach a public surface.

Close condition for lane D: these remain in `freestyle/research/movement-atlas/` and are cited only by future research, never by production content, doctrine, or tests.

## Priority and sequencing

None blocks launch, so all of this is post-launch or opportunistic. If sequenced: A1 (the glossary section) is the highest-value single item, because it turns the research's central lesson into player education; C1 (the identity guard test) is the highest-value safety item, because it pins an invariant the live data already depends on; B1 and B2 are trivial wording cleanups to fold into any nearby content pass; C2 and lane D are recording actions, not build work. Every item preserves existing governance and curator review, and none touches the grammar, the notation, or the movement data itself.
