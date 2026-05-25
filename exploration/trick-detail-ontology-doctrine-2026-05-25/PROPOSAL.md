# Flagship Trick Detail Pages — Doctrine + Architecture Proposal (2026-05-25)

**Status: APPROVED in principle** by curator on 2026-05-25 with four refinements applied (see §0.1). Doctrine + architecture ready for Phase A implementation kickoff.

Audit + design doctrine for evolving trick detail pages from "decorated metadata records" into "movement-language ontology exemplars." This document is **strategic doctrine**, not implementation. It identifies what's wrong, what the goal is, and what minimum structural changes the codebase needs.

## 0. The brief (compressed)

The user's directive: detail pages should teach (1) what the movement feels like; (2) what mechanically changes vs. parent structures; (3) why the structure became productive; (4) what compositional systems emerge from it; (5) what ontology tensions it exposes; (6) how the movement-language expands through it.

NOT: more prose, longer prose, decorative writing, encyclopedia bloat.

Goal: movement-language understanding. Build a **formal movement-language reference system**, not a trick catalog.

Tiering: not every trick needs a full ontology essay. **Tier A** = flagship ontology exemplars · **Tier B** = structurally important secondary · **Tier C** = compact catalog/reference.

### 0.1 Refinements from curator review

1. **L2 is the heart of the system.** The "mechanical delta" layer is where paradox / x-dex / nuclear / blurry / furious / rotational escalation / hidden topology changes become understandable. Treated as the deepest-ontology-work locus in this doctrine (§2.3).
2. **L3 / L4 overlap is watched, not eliminated.** Ontology role and productivity narrative sometimes blur naturally — e.g. blur's ontology role IS partly "being a productive stepping-paradox root." Treated as an editorial discipline, not a structural separation (§2.4).
3. **DO NOT mutate DB descriptions** — confirmed. Short placeholder descriptions stay as decomposition labels / provenance artifacts / shorthand records; suppressed visually at render time only (§3.3, §6.5).
4. **Future-tracked layers identified.** L7 "novice misunderstandings / movement failures" and L8 "recognizability preservation under composition" recorded as future expansions, not in initial scope (§12).
5. **Editorial-exemplar phasing.** Before scaling Tier A across the 20-slug roster, author **3 truly exceptional flagship pages** — `mirage`, `paradox-mirage`, `whirl` — as editorial exemplars. These pages define tone, restraint, ontology depth, layering discipline, and pedagogical style. Subsequent Tier A pages follow the exemplar template. See §13 for the discipline and §7 for the updated phasing.

## 1. Audit findings

### 1.1 Concrete evidence of placeholder-prose pattern

Direct sample of the DB `description` field for flagship trick candidates (slug · char count · description):

| Slug | Length | Description (verbatim) |
|---|---|---|
| **paradox-mirage** | 24 | "Paradox-modified mirage." |
| **blur** | 23 | "Blurry-modified mirage." |
| **blender** | 20 | "Whirl-modified osis." |
| **drifter** | 30 | "Mirage-modified clipper stall." |
| **fury** | 32 | "Furious-modified paradox mirage." |
| **mobius** | 21 | "Gyro-modified torque." |
| **ripwalk** | 26 | "Blurry-modified butterfly." |
| **blurriest** | 23 | "Blurry-modified barfly." |
| **food-processor** | 24 | "Blurry-modified blender." |
| **phoenix** | 37 | "Pixie-and-ducking modified butterfly." |
| **surreal** | 31 | "Surging-modified paradox whirl." |
| **ripstein** | 24 | "Popular freestyle trick." ⚠ contentless folk-name |
| **torque** | 28 | "Mirage variation of an osis." |
| **mirage** | 87 | "Toe-set dex'd outside the supporting leg, recaught on the opposite toe (in-to-out dex)." |
| **osis** | 36 | "Inside-to-outside delay combination." |
| **whirl** | 53 | "Rotational body-spin dex; anchor of the whirl family." |
| **atom-smasher** | 78 | "Atomic mirage: outside-then-inside dex sequence, recaught on the opposite toe." |
| **barrage** | 165 | "Standalone trick distinct from the existing 'barraging' modifier; barrage is its own mechanical family. Barraging Paradox Mirage = Fury; Barraging Leg Over = Flurry." |
| **sumo** | 165 | "Nuclear-modified mirage; 5 ADD via an X-Dex escalation on the mirage base. Named exception to the standard +2 nuclear rule…" |

**Pattern:** 11 of 19 flagship-candidate descriptions are ≤37 chars and follow the `<modifier>-modified <base>` template the user explicitly called out. These are factually correct ADD-decomposition labels — and zero movement-language content. The DB description is doing duty it cannot perform.

### 1.2 What infrastructure already exists

Reading `src/views/freestyle/trick-shell.hbs` (the universal shell) and 25 trick-partials confirms the page surface is rich. The shell fires these sections in order (each gating internally on data presence):

| Order | Partial | What it surfaces today |
|---|---|---|
| 1 | trick-hero | Name, hashtag, ADD chip |
| 2 | trick-comparative-row | Position vs siblings |
| 3 | trick-featured-preview | UX2 pilot featured media |
| 4 | **trick-about** | DB description + ADD composition + aliases + family note |
| 5 | **trick-intuition** | Curator-authored movement prose — **7 entries only** |
| 6 | trick-primitive-note | Curator-locked overlay (per memory) |
| 7 | trick-notation | Movement notation / Set notation |
| 8 | trick-transform | ALT readings (5 entries, curator-locked) |
| 9 | trick-operational | Operational notation tokens |
| 10 | trick-modifier-layering | Modifier-link breakdown |
| 11 | trick-add-analysis | ADD arithmetic |
| 12 | trick-scoring-notes | Doctrine-divergence notes |
| 13 | trick-equivalence-topology | Topology/observational labels |
| 14 | trick-family | Family members by ADD tier (no branching narrative) |
| 15 | trick-related | Generic related tricks |
| 16 | symbolic-related-topology | Symbolic neighbors |
| 17 | trick-semantic-memberships | Glossary clusters |
| 18 | trick-parallels | Cross-family parallels |
| 19 | trick-substitutions | Modifier-substitution table |
| 20 | (media block) | Reference media grid |
| 21 | trick-pathways | Learn pathways |
| 22-25 | trick-previous/next/records/progression | Navigation |
| 26 | trick-structural | Parser AST, collapsed |

### 1.3 Specific structural weaknesses (mapped to user's complaints)

| User's complaint | Where it manifests | Root cause |
|---|---|---|
| "Placeholder prose: X-modified Y" | DB `description` field on 11+ flagship rows | `trick-about` partial renders DB description literally; no ontology-essay layer takes over when description is placeholder |
| "Equivalence sections that merely restate notation" | `trick-transform`, `trick-equivalence-topology`, `trick-substitutions` | No `progressiveReadings` field; sections each fire independently; no "simple parent → topology transformation → compositional extension → compressed shorthand → descendant systems" unfolding |
| "Family sections that group mechanically but do not explain branching" | `trick-family` partial | Just renders members-by-ADD-tier; no `familyEvolutionNarrative` field |
| "Modifier substitutions expose major ontology concepts but receive little interpretation" | `trick-substitutions` | Substitution table is data-only; no `ontologyInterpretation` field per substitution |
| "Topology/observational labels leaking internal taxonomy without explanation" | `trick-equivalence-topology`, `trick-semantic-memberships` | Labels render verbatim from content modules without per-label "what this membership means for this trick" context |
| "Pages explaining ADD arithmetic more clearly than movement meaning" | `trick-add-analysis` is rich; `trick-intuition` only fires for 7 slugs | The ADD-math surface is structurally complete; the movement-meaning surface is sparse |
| "Paradox-mirage as 'paradox-modified mirage' rather than flagship for paradox topology itself" | trick-about + missing intuition entry + no doctrine-divergence pull-through | No `ontologyRole` field surfacing "this trick is the foundational exemplar for paradox topology" |

### 1.4 Existing content modules — coverage map

| Module | Purpose | Entries today | Flagship coverage |
|---|---|---|---|
| `freestyleTrickIntuition.ts` `TRICK_INTUITION_ENTRIES` | Movement-intuition prose | **7** | toe-stall · mirage · whirl · butterfly · osis · illusion · mobius |
| `freestyleTrickDoctrine.ts` `DOCTRINE_DIVERGENCE_REGISTRY` | ADD doctrine divergences | varies | doctrine-grade entries only; no ontology-role field |
| `freestyleResolvedFormulas.ts` | Per-trick provenance string | many | provenance lines are math-shaped: `"paradox = +1 body modifier; mirage = 2 ADD core atom"` |
| `freestyleSemanticOverrides.ts` rev(0) | 5 curator-locked ALT readings | 5 | locked at 5 entries (per memory) |
| `freestyleEquivalenceTopology.ts` | Observational topology | many | labels leak without context |
| `freestyleCanonicalSets.ts` (Phase A/B) | Set ontology objects | 43 sets | new pattern — first-class ontology per item |

**Read:** The set-system refactor (Phase A/B, just-shipped) is the architectural precedent for what flagship trick pages should become. We did for sets what we now need to do for tricks: elevate each entry into a first-class ontology object with curator-authored fields that make it teach.

## 2. Flagship doctrine — what makes a Tier A page

A **Tier A flagship trick detail page** teaches across six layers, in this priority order. Each layer is its own page section with its own curator-authored content field.

### 2.1 Six teaching layers (priority-ordered)

| # | Layer | What it teaches | Backing content field |
|---|---|---|---|
| **L1** | **Movement intuition** | What the trick FEELS like. Body mechanics, rhythm, orientation, directional flow. Coach-tone prose. | `TRICK_INTUITION_ENTRIES` (expand to all Tier A) |
| **L2** ⭐ | **Mechanical delta** (deepest ontology layer — see §2.3) | What changes mechanically from the parent trick(s). What extra directional / topological / postural transition occurs. Where paradox / x-dex / nuclear / blurry / furious / rotational escalation / hidden topology become understandable. | NEW `TRICK_MECHANICAL_DELTA` |
| **L3** | **Ontology role** | What ontology concept this trick exemplifies (paradox topology root · x-dex escalation locus · hidden-paradox interpretive locus · whirl-family anchor · folk-name canonical rescue · etc.). May naturally overlap with L4 — see §2.4. | NEW `TRICK_ONTOLOGY_ROLE` |
| **L4** | **Productivity narrative** | Why the trick became generative. What composes naturally with it. Why it anchors a family / topology / shorthand tradition. May naturally overlap with L3 — see §2.4. | NEW `TRICK_PRODUCTIVITY` |
| **L5** | **Family evolution** | Branching narrative — set reinterpretation, topology intensification, rotational variants, suspension/no-plant variants, body-modifier layering, shorthand compression. NOT a list. Where the dictionary stops being static taxonomy and becomes movement-language history. | NEW `TRICK_FAMILY_EVOLUTION` |
| **L6** | **Progressive equivalence unfolding** | A staircase of readings: simple parent → topology transformation → compositional extension → compressed shorthand → descendant systems. Each step earns its place. | NEW `TRICK_PROGRESSIVE_READINGS` |

### 2.2 Doctrine principles (forever-rules)

1. **L1 movement intuition is the lead.** Every Tier A page opens with "Movement intuition" before notation, ADD, family, or any structural surface.
2. **Movement meaning ranks above ADD arithmetic.** ADD-analysis sections render *after* L1-L6. A reader who skims should leave with movement understanding, not addition.
3. **Layer separation.** L1 (intuition) ≠ L2 (delta) ≠ L3 (ontology role) ≠ L4 (productivity) ≠ L5 (evolution) ≠ L6 (equivalence). Mixing these layers into a single paragraph is what produces "X-modified Y" placeholder prose.
4. **No placeholder-as-prose.** When `description` in the DB is `<X>-modified <Y>`, the `trick-about` section uses a generated ADD-decomposition label, not the literal placeholder. DB description rows are NOT mutated; the suppression is render-only. L1-L6 carry the prose.
5. **Topology > taxonomy.** When the topology distinction matters (paradox topology, x-dex, hidden-paradox interpretive frame), explain the topology. Don't lean on the internal taxonomy label.
6. **Interpretive readings are framed honestly.** When Kenny Shults reads paradox-mirage as "an additional directional transition during the dex cycle" and other shorthand traditions read it as "op-side dex from clipper," surface BOTH; don't promote either to uncontested doctrine.
7. **Pedagogy first; metadata last.** Media, records, pathways, structural AST go AFTER the teaching layers.
8. **Restraint preserved.** No token soup, no AST visuals on Tier A, no symbolic-decoration drift. The current symbolic-restraint doctrine holds.
9. **Tier discipline.** Only ~20-30 trick pages need the full L1-L6 treatment. Tier B and C pages render a subset.

### 2.3 L2 is the heart of the system

The user's review surfaced this clearly: **L2 (mechanical delta) is where the deepest ontology work happens.** Pixe / paradox / x-dex / nuclear / blurry / furious / rotational escalation / hidden topology changes only become understandable in the L2 layer. L1 says what it feels like; L3 says what role it plays in the broader language; but L2 is the layer that explains *why* this trick is structurally distinct from its parent — what extra directional change, what postural shift, what topological transition.

When curator-authored L2 prose for a Tier A page is produced, it should:

- name the specific mechanical transformation relative to the parent trick(s),
- explicitly identify the topology change (paradox topology, x-dex character, etc.) where one is present,
- distinguish between **explicit topology** (the canonical name carries the operator), **interpretive topology** (Kenny's "additional directional transition" reading), and **hidden topology** (where the formula carries the marker without the name doing so),
- avoid generic-modifier framing.

L2 is the layer where this proposal will produce the most pedagogical impact.

### 2.4 L3 / L4 overlap is editorial, not structural

L3 (ontology role) and L4 (productivity narrative) sometimes blur naturally. Example: blur's ontology role IS partly "being a productive stepping-paradox root." The role and the productivity are intertwined.

This is treated as an **editorial discipline**, not a structural separation:

- The two fields stay as separate content slots so the curator has a clear authoring frame.
- When the two genuinely overlap on a specific slug, the curator decides which slot carries the prose; the other slot can stay null (sections suppress when empty per the existing shell discipline).
- We do NOT mechanically enforce non-overlap. Forcing an artificial split would produce worse prose than letting one slot bear both meanings.

Tier B pages don't render L3 / L4 at all, so the question only arises for Tier A.

## 3. Page architecture — section reordering for Tier A

The current shell already mostly reads movement-first → structure-second. The proposal is **add new sections (L2-L6 content fields)** + **reorder slightly** to give the movement-language layers full pride of place.

### 3.1 New section flow (Tier A)

| Order | Section | Renders when | Content source |
|---|---|---|---|
| 1 | trick-hero | always | trick row |
| 2 | trick-comparative-row | always | shaped |
| 3 | **trick-intuition** *(L1)* | Tier A | `TRICK_INTUITION_ENTRIES` |
| 4 | **trick-mechanical-delta** *(L2, NEW)* ⭐ | Tier A | `TRICK_MECHANICAL_DELTA` |
| 5 | **trick-ontology-role** *(L3, NEW)* | Tier A | `TRICK_ONTOLOGY_ROLE` |
| 6 | **trick-productivity** *(L4, NEW)* | Tier A | `TRICK_PRODUCTIVITY` |
| 7 | **trick-family-evolution** *(L5, NEW)* | Tier A | `TRICK_FAMILY_EVOLUTION` |
| 8 | **trick-progressive-readings** *(L6, NEW)* | Tier A | `TRICK_PROGRESSIVE_READINGS` |
| 9 | trick-about | always | DB description (placeholder patterns suppressed; replaced with service-shaped decomposition pill) |
| 10 | trick-primitive-note | curator-locked overlays only | overlay registry |
| 11 | trick-notation | when notation present | trick row |
| 12 | trick-transform | when ALT entry exists | semantic overrides |
| 13 | trick-operational | when op-notation present | trick row |
| 14 | trick-modifier-layering | when modifier-links present | modifier table |
| 15 | trick-add-analysis | always | derived |
| 16 | trick-scoring-notes | doctrine-divergence entries | doctrine registry |
| 17 | trick-equivalence-topology | when topology label present | topology module (per-label context added) |
| 18 | trick-family | always | family rows (narrative lives in L5) |
| 19 | trick-related / parallels / substitutions / semantic-memberships | when data | various |
| 20 | media block | when media present | media |
| 21 | trick-pathways / previous / next / records / progression | always | derived |
| 22 | trick-structural (collapsed) | when parse present | parser AST |

### 3.2 Tier B + Tier C

| Tier | Sections rendered (additions to baseline) | What's NOT rendered |
|---|---|---|
| **B** | L1 (intuition) when authored; L5 (family evolution) when authored | L2-L4, L6 — the deep ontology layers are reserved for Tier A |
| **C** | None of L1-L6; current trick-about / notation / family / etc. only | All new ontology sections |

Tier B/C pages stay structurally identical to today's layout; they just don't get the extra L1-L6 content fields populated.

### 3.3 Trick-about replacement when description is placeholder

When `description` matches the placeholder pattern, the service shapes a **generated** ADD-decomposition label from the modifier-link table instead of rendering the literal description. The DB row is NOT mutated — suppression is render-only.

> **Decomposition:** paradox (+1) · mirage (2 ADD) → **paradox mirage** (3 ADD)

L1-L6 carry the prose; trick-about carries the structured decomposition + aliases + family note.

## 4. Tiering strategy

### 4.1 Tier assignment policy

Tier is a **curator-authored field** on a new content module (`freestyleTrickTier.ts`), NOT derived. The default for every trick is **Tier C**. A curator promotes a trick to Tier B or Tier A by listing its slug. Promotion is non-destructive: a Tier A page renders the new sections IF the relevant content fields are also authored; un-authored sections suppress themselves (the current shell discipline holds).

```typescript
// freestyleTrickTier.ts
export const TIER_A_SLUGS: ReadonlySet<string> = new Set([
  // Foundational ontology exemplars
  'mirage', 'paradox-mirage', 'blur', 'whirl', 'osis', 'butterfly',
  'torque', 'mobius', 'drifter', 'barrage', 'ripwalk', 'fury',
  'atom-smasher', 'sumo', 'surreal', 'ripstein', 'food-processor',
  'phoenix', 'blurriest', 'blender',
]);

export const TIER_B_SLUGS: ReadonlySet<string> = new Set([
  // Structurally important, secondary depth
  // (curator-paced expansion)
]);
```

### 4.2 Why tiered

| Reason | Why it matters |
|---|---|
| **Authorship is curator-time-bounded** | Writing L1-L6 content for 130+ canonical tricks would take quarters. Tiering lets us land the foundational 20 first. |
| **Some tricks are catalog entries, not ontology exemplars** | A specific modifier-rotational-variant chain doesn't need to teach the language — it's a leaf. |
| **Restraint preserved** | The user explicitly said "not every trick requires a full ontology essay." Tier C is the default and stays small/clean. |
| **Pedagogy concentrates** | Tier A is small enough that the cross-references between flagship pages teach the system, not just the trick. |

## 5. Exemplar candidates (initial Tier A roster + rationale)

20-slug Tier A roster aligned to the user's brief:

| Slug | Why Tier A | Ontology concept this page should anchor |
|---|---|---|
| **mirage** ⭐⭐⭐ | **Editorial exemplar #1.** Core atom; entry point to the language | The 2-ADD canonical decomposition; the "in-to-out dex" template |
| **paradox-mirage** ⭐⭐⭐ | **Editorial exemplar #2.** Anchors paradox topology itself | Hip-pivot topology · cross-body transition · explicit-vs-interpretive paradox |
| **blur** | Stepping Paradox compositional family root | Stepping-as-anchor; multi-dex extension of paradox topology |
| **whirl** ⭐⭐⭐ | **Editorial exemplar #3.** Cross-body rotational dex anchor | Whirl-family branching; cross-body-with-stall topology |
| **osis** | Spin-into-clipper canonical | Spin-into-clipper topology; sibling-of-mirage on different terminal |
| **butterfly** | Leg-over canonical | Leg-over family anchor; clipper terminal |
| **torque** | Miraging-osis compositional | Compound-of-canonicals topology; family-anchor for ripwalk |
| **mobius** | Gyro-torque exemplar | Gyro lineage; structural reading "gyro torque"; pt11 ruling |
| **drifter** | Mirage-clipper terminal | Family-anchor for shred lineage |
| **barrage** | Standalone family (NOT modifier) | The naming-disambiguation case (barrage vs barraging); compositional vs modifier semantics |
| **ripwalk** | Blurry-butterfly compositional | Stepping-Paradox layered on a leg-over base; shred-vocabulary root |
| **fury** | Furious-paradox-mirage | Multi-dex paradox extension; productivity exemplar |
| **atom-smasher** | Atomic-mirage with x-dex character | X-dex escalation; outside-then-inside dex sequence |
| **sumo** | Nuclear-mirage 5-ADD exception | Named-exception to standard +2 nuclear rule; x-dex escalation locus |
| **surreal** | Surging-paradox-whirl | Top-of-ladder compositional exemplar; rotational-system layered onto paradox-whirl |
| **ripstein** ⭐ | Folk-name canonical rescue exemplar | The "Popular freestyle trick." → formal ontology pipeline. Currently the worst-offending page; perfect demonstration case for the doctrine. |
| **food-processor** | Blurry-blender | Blurry-as-operator on a compound base; double-compositional |
| **phoenix** | Pixie-ducking-butterfly | Multi-modifier on butterfly; pixie-set entry layered with ducking body |
| **blurriest** | Blurry-barfly superlative | Highest-blurry-compound; family lineage extreme |
| **blender** | Whirl-osis compound | The whirl-as-operator on osis terminal; ontology exemplar for compound-of-canonicals |

This roster covers all six structural families (single-dex / multi-dex / rotational / whirl-swirl / compound-compound / topology-extreme) + the key ontology questions (paradox topology · x-dex character · hidden paradox · shorthand traditions · folk-named-as-canonical).

**Ripstein is specifically named as the folk-name rescue exemplar.** Its current state — `"Popular freestyle trick."` — is exactly what the doctrine is built to fix. The Phase A pipeline should treat it as a demonstration case.

## 6. Minimum structural changes

What code/content the codebase needs to enable Tier A pages. Reversible, no DB schema change, no parser change.

### 6.1 New content modules (6)

| Module | Shape | Initial entries |
|---|---|---|
| `freestyleTrickTier.ts` | `TIER_A_SLUGS: Set<string>` + `TIER_B_SLUGS: Set<string>` | Tier A roster of 20 |
| `freestyleTrickMechanicalDelta.ts` ⭐ | `{ slug, prose, parentSlugs[], directionalChange?, topologyKind? }` | 20 Tier A entries (Phase B+C) |
| `freestyleTrickOntologyRole.ts` | `{ slug, role, interpretiveTraditions[], conflictNotes? }` | 20 Tier A entries (Phase B+C) |
| `freestyleTrickProductivity.ts` | `{ slug, prose, productiveDescendants[] }` | 20 Tier A entries (Phase B+C) |
| `freestyleTrickFamilyEvolution.ts` | `{ slug, narrativeSteps[] }` — each step is `{ branchAxis, prose, exemplarSlugs[] }` | 20 Tier A entries (Phase B+C) |
| `freestyleTrickProgressiveReadings.ts` | `{ slug, readings[] }` — each is `{ stage, reading, citation? }` | 20 Tier A entries (Phase B+C) |

### 6.2 Expand existing module

- `freestyleTrickIntuition.ts` — extend `TRICK_INTUITION_ENTRIES` from 7 to 20 (add the 13 missing Tier A slugs).

### 6.3 Service shape additions

`FreestyleTrickContent` gains optional fields populated only when the trick is Tier A and the relevant content module has an entry:

```typescript
mechanicalDelta?:      { prose, parentLinks[], directionalChange?, topologyKind? };
ontologyRole?:         { role, interpretiveTraditions[], conflictNotes? };
productivity?:         { prose, productiveDescendantLinks[] };
familyEvolution?:      { steps: { branchAxis, prose, exemplarLinks[] }[] };
progressiveReadings?:  { stages: { stage, reading, citation? }[] };
trickTier:             'A' | 'B' | 'C';
```

### 6.4 New template partials (5)

- `trick-mechanical-delta.hbs` ⭐ (the L2 / deepest-ontology partial)
- `trick-ontology-role.hbs`
- `trick-productivity.hbs`
- `trick-family-evolution.hbs`
- `trick-progressive-readings.hbs`

Plus shell update: insert these between trick-intuition and trick-about (per §3.1 ordering).

### 6.5 Placeholder-description suppressor in trick-about

Service-layer logic: when `description` matches the placeholder pattern, suppress the literal description at render time and surface a service-shaped decomposition pill instead. **Patterns to match:** `^[A-Z][a-z-]+(-modified|-and-[a-z]+ modified)\s+[a-z-]+\.?$` AND `^Popular freestyle trick\.?$` (catches ripstein-style minimal-content placeholders).

DB rows are NOT mutated. The placeholder description remains in `freestyle_tricks.description` as a decomposition label / provenance artifact; only the public-facing render suppresses it.

### 6.6 Existing partials — minor adjustments

- `trick-equivalence-topology.hbs`: when a topology label fires, render its glossary-link affordance (a one-line "what this topology means" cross-link). NOT a new prose section — just a contextual link.
- `trick-family.hbs`: when `familyEvolution` is populated for Tier A, the family-tier members section gets a small intro pointing to the new "Family evolution" section above.
- `trick-substitutions.hbs`: when a substitution pair maps onto a curator-tagged ontology concept (paradox-topology shift, x-dex escalation, rotational-vs-non-rotational), surface a one-line tag.

### 6.7 What does NOT change

- DB schema unchanged.
- Existing 7 `TRICK_INTUITION_ENTRIES` stay as-is.
- Existing `freestyleSemanticOverrides.ts` rev(0) stays locked at 5 entries.
- Parser unchanged.
- `freestyleResolvedFormulas.ts` provenance strings stay math-shaped (they're the math layer; movement layer lives in new modules).
- ADD-arithmetic / scoring-notes / modifier-layering / parser-AST sections unchanged.
- Tier C pages render exactly as today.
- DB `description` rows unchanged (placeholders preserved as decomposition labels).

## 7. Phased implementation

Four phases, each independently shippable. Phases A and B are tightly coupled — the infrastructure is wasted without exemplars to validate it, and the exemplars cannot land without infrastructure — so they're expected to ship close in time, but they remain separately reviewable.

### Phase A — Infrastructure (no content yet)

- `freestyleTrickTier.ts` (TIER_A_SLUGS, TIER_B_SLUGS)
- 5 new content modules with empty entry arrays + types
- Service-shape extensions (optional fields)
- 5 new partials with content-gated rendering (suppress when no entry)
- Shell reordering per §3.1
- Placeholder-description suppressor
- Tests pinning: tier gating, suppression-when-empty, shell ordering, placeholder-pattern detection (including the ripstein "Popular freestyle trick." case)
- Build clean

No curator-authored content yet. Pages still look mostly like today. The infrastructure is the deliverable.

### Phase B — Editorial exemplars (mirage · paradox-mirage · whirl)

⭐ **These three pages define the editorial template for everything that follows.** See §13 for the editorial-exemplar discipline.

- Author L1-L6 content for **3 editorial-exemplar slugs**: mirage · paradox-mirage · whirl
- Curator review pass on each page to settle tone, restraint, ontology depth, layering discipline, and pedagogical style
- Tests pinning the rendered sections for each of the three
- Lock the editorial pattern: any subsequent Tier A page that deviates from the established tone / depth / discipline requires curator approval

The 3 exemplars are deliberately a small, high-quality first ship — not a partial Tier A delivery. They set the bar.

### Phase C — Scale Tier A (curator-paced, ~17h author time over several sessions)

- Author L1-L6 content for the remaining 17 Tier A slugs in §5, following the editorial template established in Phase B
- Cross-reference each page back to the three exemplars
- Tier B slug list curator-authored as the work proceeds

Phase C does NOT begin until Phase B's editorial template is locked.

### Phase D — Tier B activation (optional, curator-paced)

- Author L1 + L5 only for a small Tier B roster (~10-15 slugs)
- No L2-L4, L6 — these stay Tier A only

## 8. Open curator questions

| # | Question | Default if no decision |
|---|---|---|
| Q1 | Tier A roster: agree with the 20 in §5? Swap any in / out? Add any (sole-kick, cloud-kick, swirl, etc.)? | Ship as proposed |
| Q2 | Interpretive-traditions handling: when sources disagree (Kenny's "additional directional transition" vs older "op-side dex from clipper" reading on paradox-mirage), surface BOTH in L3 with a `conflictNote`. Acceptable framing? | Surface both honestly |
| Q3 | Tier B roster scope: 10-15 slugs (light depth) or postpone Tier B entirely until Tier A is done? | Postpone Tier B until Tier A done |
| Q4 | Placeholder-pattern suppressor: regex catches `X-modified Y.` and `X-and-Y modified Z.` (phoenix) and `Popular freestyle trick.` (ripstein). Should it catch other minimal-content patterns curator names? | Add patterns curator names; preserve DB row always |
| Q5 | Content-module governance: Phase A's 5 new modules each carry curator-authored prose. Should they be Markdown-formatted (multi-paragraph) or single-paragraph TypeScript-string entries like `TRICK_INTUITION_ENTRIES`? | Single-paragraph TS string (consistent with existing pattern) |
| Q6 | Cross-reference links in L4 productivity prose: when blur's L4 names "fury" and "barrage" as productive descendants, those become hyperlinks. Should the productive-descendant list be a separate structured field (curator authors slugs + labels) or extracted from prose by NLP? | Structured field (`productiveDescendantLinks[]`); curator authors slugs explicitly |
| Q7 | Paradox-mirage as flagship for "paradox topology itself": should the page title eyebrow read "Paradox topology root" or stay simple "Compound"? Same question for whirl ("Whirl family anchor"), osis ("Spin-into-clipper canonical"), ripstein ("Folk-name canonical"), etc. | New eyebrow field on Tier A pages — short curator-authored role descriptor |
| Q8 | Movement intuition prose source: existing 7 entries cite verbatim from fb.org /newmoves. For 13 new entries, do we follow the same pattern (cite where possible; "Curator description" when synthesized)? | Same pattern |
| Q9 | Equivalence-topology label glossary cross-links: which labels get cross-link affordances? All? Or curator-tagged set? | All for now; suppress later if visual clutter |
| Q10 | When the curator-authored L1 prose for a Tier A page is NOT yet written, does the page render Tier A scaffolding (empty sections suppressed) OR fall back to Tier C? | Tier A scaffolding; suppress empty sections per existing shell discipline |
| Q11 | L3/L4 overlap (e.g. blur's role IS partly being a stepping-paradox root): when overlap is genuine on a slug, does the curator pick which slot carries the prose or split awkwardly? | Curator picks the better slot; the other stays null and suppresses |
| Q12 | L7 / L8 future layers (§12): track and revisit later, or schedule a kickoff after Tier A is done? | Track for later; revisit after Tier A is at least 10 slugs deep |

## 9. ROI / scope estimate

| Phase | Engineering effort | Curator-time effort | Reversibility |
|---|---|---|---|
| Phase A — Infrastructure | ~6-8h (5 modules + types + 5 partials + service + suppressor + tests + shell reorder) | none | One PR; revertible |
| Phase B — Editorial exemplars (3 slugs) | ~30min wiring per slug × 3 + curator-review iteration | **~3-5h curator authoring** (60-90min × 3 slugs covering L1-L6 + tone-locking review) | Per-slug; revertible |
| Phase C — Scale Tier A (remaining 17) | ~30min wiring per slug × 17 slugs | **~17h curator authoring** (60min × 17), following Phase B's locked template | Per-slug |
| Phase D — Tier B (optional) | ~30min wiring per slug × ~12 slugs | **~3h** (15min × 12 covering L1 + L5 only) | Per-slug |

All content lives in TypeScript modules. All reversible. No DB / schema / parser change.

## 10. What this proposal does NOT do

- ❌ Touch SQL schema or parser
- ❌ Rewrite any existing 7 `TRICK_INTUITION_ENTRIES`
- ❌ Mutate `description` rows in the DB (only suppress render-time placeholders)
- ❌ Promote any contested interpretive reading to canonical doctrine
- ❌ Replace ADD-analysis / modifier-layering / scoring-notes surfaces — those are the math layer and stay intact
- ❌ Force Tier A treatment on every flagship page in one slice
- ❌ Generate prose with NLP or templates — every L1-L6 entry is curator-authored
- ❌ Implement L7 / L8 layers (those are future-tracked; see §12)

## 11. Cross-references

- The set-system refactor (Phase A/B, 2026-05-25) is the architectural precedent for "first-class ontology objects with curator-authored fields" — see `exploration/set-system-refactor-2026-05-25/PROPOSAL.md`.
- Doctrine-divergence framework at `exploration/doctrine_divergence_framework_2026-05-23.md` defines the historical / doctrine-sensitive / alternate-accounting taxonomy that the L3 ontology-role layer leverages.
- `[[project_trick_detail_editorial_overlay]]` memory: existing 5 curator-locked overlays (primitive-note, scoring-notes, transform, intuition, compound-semantic-descriptions). The new L2-L6 modules ADD to this set; they do NOT replace or expand the locked 5.
- `[[feedback_no_individual_names_freestyle_views]]` memory: L1-L6 prose follows the same depersonalization rule applied to the glossary sources section — feature-attribution prose names ideas / readings / traditions, not individuals. Curator acknowledgements live in the glossary acknowledgements paragraph.

## 12. Future-tracked layers (NOT in initial scope)

Two layers identified by the curator review as pedagogically powerful but not needed in the initial implementation. Tracked here for future expansion after the L1-L6 layers prove out on the Tier A roster.

### L7 — Novice misunderstanding / movement failures

What it would teach: how beginners typically misexecute, what the movement is often mistaken for, why specific failure modes are common.

Especially valuable for: **paradox-mirage** (often confused with op-side dex from clipper), **whirl** (often confused with stepping), **torque** (the miraging-osis pattern is harder to identify), **osis** (the spin-into-clipper coordination), **drifter** (terminal-vs-mid ambiguity).

When this layer is added, it should fire AFTER L1 (intuition) and BEFORE L2 (mechanical delta) — the "what novices get wrong" prose helps the reader anticipate what L2 will then disambiguate.

Effort if pursued later: ~1 new content module + 1 new partial + curator authoring for a subset of Tier A slugs. Not all Tier A pages need L7.

### L8 — Recognizability preservation under composition

What it would teach: structural persistence of a trick's identity under modifier stacking. Some tricks remain recognizable despite heavy compositional layering (mirage stays "obviously a mirage" under most modifiers); others lose identity quickly (some compounds become unrecognizable two modifiers deep).

Why it matters: this is a real ontology question about which structural features are perceptually load-bearing. It would inform glossary entries, family definitions, and shorthand traditions.

This is a future research layer. The data to populate it likely requires curator observation across many compound trick rows, plus possibly community input. Not for the initial doctrine implementation.

## 13. Editorial-exemplar discipline (Phase B)

Phase B authors three pages — `mirage`, `paradox-mirage`, `whirl` — that **define the editorial template for every Tier A page that follows**. These are not "the first three pages." They are the editorial reference set the rest of the Tier A roster will be measured against.

### 13.1 What the exemplars must establish

| Dimension | What the exemplars settle |
|---|---|
| **Tone** | Coach-tone, movement-first, no decorative writing, no encyclopedia bloat, no jargon-as-prose. Pedagogically generous; structurally restrained. |
| **Restraint** | Where prose ends and structure begins. How long each L1-L6 section should be (target: 1-3 short paragraphs per layer, never essays). When suppression is preferable to filler. |
| **Ontology depth** | How explicit to be about paradox topology / x-dex character / hidden topology / interpretive traditions. How much to surface vs. defer to cross-links. |
| **Layering discipline** | The boundary between L1 (intuition) ↔ L2 (mechanical delta) ↔ L3 (ontology role) ↔ L4 (productivity) ↔ L5 (evolution) ↔ L6 (equivalence). Where overlap is acceptable; where separation is enforced. |
| **Pedagogical style** | How the page teaches movement-language through one trick. Cross-references between flagship pages. How equivalence readings unfold without restating notation. |

### 13.2 Why these three slugs

| Slug | Why it's an editorial exemplar |
|---|---|
| **mirage** | Single-trick atom. Forces the doctrine to handle the simplest case well — a 2-ADD core atom with no compositional depth. If mirage's L1-L6 is clear, the doctrine works for primitives. |
| **paradox-mirage** | The compound case. Anchors paradox topology itself. Forces the doctrine to handle interpretive conflict (Kenny vs older readings) honestly. The hardest editorial case. |
| **whirl** | The family-anchor case. Cross-body rotational dex; the whirl family branches widely from here. Forces the doctrine to handle family-evolution narrative (L5) at its most generative. |

Together these three cover: primitive atom · contested compound · family anchor. They span the doctrine's hardest editorial dimensions.

### 13.3 Curator review pass

After the 3 pages are wired and authored, a curator review pass:

1. **Tone-locking review.** Read all three pages end-to-end as a reader would. Adjust prose until tone is consistent across the three.
2. **Cross-reference pass.** mirage links to paradox-mirage and whirl in L5 (family evolution) and L4 (productivity). paradox-mirage links to mirage as parent + to blur / fury / sumo as productive descendants. whirl links to blender / blistering / pogo as productive descendants. The three pages should feel like they teach the system together.
3. **Restraint audit.** Cut any prose that decorates without teaching. Cut any paragraph that exists to fill a section rather than because the content earned the section.
4. **Ontology-depth audit.** Confirm L2 carries the paradox-topology distinction (paradox-mirage), the cross-body-rotational distinction (whirl), and the in-to-out-dex template (mirage). Confirm L3 frames interpretive traditions honestly without promoting one to doctrine.

### 13.4 Lock the template

After the curator review pass, the editorial pattern is **locked**. Phase C pages are measured against the three exemplars; any deviation from the established tone / depth / discipline requires explicit curator approval rather than implementer judgment.

This is the same approval-by-artifact-path discipline applied to the set-system refactor's Phase A roster. Editorial drift is the failure mode this protects against.

---

**Curator review marked APPROVED in §0.1 with five refinements applied:** L2 elevated as deepest ontology layer (§2.3) · L3/L4 overlap treated as editorial discipline (§2.4) · DB-description-no-mutation reaffirmed (§3.3, §6.5, §6.7) · L7/L8 future-tracked layers documented (§12) · editorial-exemplar phasing established with `mirage` · `paradox-mirage` · `whirl` as the Phase B trio (§13).

**Phase A + B implementation kickoff endorsed in principle.** Awaiting explicit "proceed" before any module / partial / service change.
