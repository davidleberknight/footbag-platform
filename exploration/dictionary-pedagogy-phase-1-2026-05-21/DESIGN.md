# Dictionary Pedagogy Phase 1 — Design — 2026-05-21

Upgrade dictionary browse views into lightweight ontology-pedagogy
surfaces. The dictionary currently *shows* groupings but rarely
*teaches* why the tricks are grouped together. Phase 1 ships
restraint-first additions that close the smallest, highest-value gap.

**Doctrine inherited** from the 2026-05-21 glossary architecture
overhaul §12.1:

> The glossary is a curated conceptual overview layer, not an
> exhaustive enumeration surface. Exhaustive ontology publication
> belongs to per-trick expanded pages and dictionary browse systems.

Dictionary browse views sit between the glossary (conceptual overview)
and the trick-detail page (exhaustive ontology). They are the
*navigation/discovery layer*. Phase 1 adds pedagogy to that layer
without making it an essay surface.

---

## 0. Status + scope

### 0.1 What this revises

GA-1 through GA-6 stabilized the glossary's information architecture
and the equivalence-topology layer. The next gap is the dictionary's
own pedagogical voice: a reader landing on `?view=family` sees a list
of groupings but doesn't immediately learn the *grouping logic*.

This slice adds three small surfaces:

1. Four new entries in `freestyleFamilyInvariants.ts` (butterfly,
   mirage, osis, swirl) extending the Slice-I pilot from 2 families to
   6.
2. A family-view intro paragraph that names the grouping logic.
3. An ADD-view intro paragraph that names the orthogonality of ADD
   and topology.

The slice does **not** rewrite the browse views, add new browse axes,
expose parser internals, or duplicate glossary essays.

### 0.2 What stays locked

- The doctrine statement above.
- The four-layer separation (parser / editorial / canonical /
  observational).
- The reversibility principle (TS content modules over SQL while
  ontology is in flight).
- The topology-governance restraint: terminal families only carry
  invariants; modifier/topology systems do not.
- The existing five browse-view shapes (`?view=add`, `?view=family`,
  `?view=movement-system`, `?view=component`, `?view=topology`,
  `?view=category`). No new view added.

### 0.3 What this adds

| # | Addition | Surface | Lines |
|---|---|---|---:|
| 1 | 4 family-invariant entries (butterfly, mirage, osis, swirl) | `freestyleFamilyInvariants.ts` | ~30 |
| 2 | `familyViewIntro` field on `FreestyleTricksIndexContent` + template wiring | service + template | ~15 |
| 3 | `addViewIntro` field on `FreestyleTricksIndexContent` + template wiring | service + template | ~15 |
| 4 | `.browse-view-intro` CSS class (additive; muted-tone callout) | style.css | ~20 |
| 5 | Integration tests + design doc | tests/ + this file | — |

---

## 1. Family-view pedagogy audit

### 1.1 Current state

`/freestyle/tricks?view=family` renders:

- View-toggle row at the top
- (no intro paragraph)
- One section per family slug, each with:
  - Heading (e.g. "Whirl family")
  - Section count
  - Optional `sharedStructure` invariant line (whirl + rev-whirl only — Slice-I pilot)
  - Optional `crossLink` (butterfly → walking-family progression page)
  - Dictionary trick card stack

### 1.2 The gap

Two pedagogical surfaces are missing or thin:

1. **No view-level intro.** A reader entering this view doesn't know
   that family groupings differ from ADD groupings or movement-system
   groupings until they discover the other views.
2. **Most families have no `sharedStructure`.** Whirl + rev-whirl
   carry curator-authored invariants; butterfly, mirage, osis, swirl,
   torque, blender, drifter, legover, clipper render headings only.

### 1.3 Phase 1 fix

- Add an intro paragraph at the top of the family view:

  > Family groupings cluster tricks that preserve a conserved
  > terminal mechanic. Members of a family share the same shallow
  > structural skeleton (entry + dex + terminator), even when they
  > carry different modifiers or sit at different ADD values. This is
  > distinct from the ADD view (which clusters by structural difficulty
  > regardless of family) and the Movement System view (which clusters
  > by the modifier axes that transform a base). The shared terminal
  > structure under each family heading below is the invariant that
  > makes the cohort cohere.

- Extend `FAMILY_INVARIANTS` with the four remaining terminal-family
  candidates named in the topology-governance skill (butterfly, mirage,
  osis, swirl). Structural-form lines follow the established whirl /
  rev-whirl pedagogical convention.

### 1.4 What Phase 1 deliberately does NOT do

- Does not add invariants for torque, blender, drifter, legover, clipper.
  These are NOT terminal families per the topology-governance skill;
  they are branch families or foundational atoms with different
  structural roles. The Slice-I module commentary explicitly lists
  them as out-of-scope.
- Does not invent prose pedagogy per family. The terse structural-form
  lines are the curator-authored pedagogy; longer prose would
  duplicate the glossary's §5 family cards.
- Does not change the family-view CSS layout, card density, or
  cross-link affordances.

---

## 2. Component / system / ADD explanation proposals

### 2.1 Component view (`?view=component`)

**Status:** Soft-retired 2026-05-18 per the
`component_view_retirement_audit`. The view-toggle entry was removed;
only bookmarks reach this view. The page already renders a retirement
notice pointing to Movement System as the canonical modifier-grouped
surface.

**Phase 1 action:** none. The retirement notice IS the pedagogy.
Adding more explanation would extend a deprecated surface.

### 2.2 Movement-system view (`?view=movement-system`)

**Status:** well-served. Four layers of pedagogy already render:

- Top-level `observationalNote` (four-axis intro paragraph)
- Per-axis `axisDefinition`
- Per-modifier `bodyDefinition`
- Per-modifier `compositionGloss`

**Phase 1 action:** none.

### 2.3 ADD view (`?view=add`)

**Status:** headings + cards only; no intro.

**Phase 1 fix:**

> ADD groups cluster tricks by additive structural difficulty, not
> movement similarity. Tricks at the same ADD may belong to entirely
> different families and use entirely different modifier stacks;
> topology and ADD are orthogonal axes. For family-cohesion grouping,
> use the By family view; for modifier-axis grouping, use the By
> movement system view.

### 2.4 Topology view (`?view=topology`)

**Status:** the view already carries a `symbolic-layer-footer`
explaining "Movement Neighborhoods are observational groupings…" —
sufficient for Phase 1.

**Phase 1 action:** none.

---

## 3. Terminology consistency findings (Part 5 audit, Phase 2 work)

A scan of glossary / dictionary / trick-detail terminology surfaced
the following vocabulary candidates for normalization (Phase 2+):

| Concept | Glossary uses | Dictionary uses | Trick-detail uses | Drift? |
|---|---|---|---|---|
| family-anchor trick | "family-anchor trick" (GA-1 §5 intro) | not explicitly named in browse headings | "family chip" + slug | yes — dictionary headings could adopt "Family-anchor: whirl" |
| shared terminal structure | "Shared terminal structure" (§5 cards + family view) | "Shared terminal structure:" label | not surfaced | consistent within glossary; absent from trick-detail |
| invariant | "the invariant under each family heading" (Phase 1 intro) | "Shared terminal structure" | not surfaced | partial — "invariant" appears only in pedagogical prose, not as a structural label |
| movement system | "movement system" (§11) | "Movement System" axis (capitalized) | "movement system" | consistent |
| operator | "operator" (§7) + "modifier" (§6) | "modifier" labels on cards | "modifier" links | "operator" / "modifier" used somewhat interchangeably; clarifying which is which is a Phase 2 doctrine call |
| topology | "topology" (§11) | "topology" axis | "Related topology" panel | consistent |
| equivalence | "equivalence chain" (§9) + "equivalence topology" (Phase 3) | not surfaced in browse | "Alternate derivations" panel | three different surfaces use three different labels for related concepts — Phase 2 sweep candidate |
| observational | "observational" badge | "observational" footer on topology view | observational badge on connective panels | consistent |
| historical reading | "historical reading" (GA-1 §1) | not surfaced | role badge on equivalence-topology rows | consistent (historical role badge matches glossary phrase) |

**Phase 2 candidate:** unify "operator" vs "modifier" vocabulary;
unify "equivalence chain" (compression-ladder context) vs "equivalence
topology" (alternate-derivation context) so readers don't conflate
the two.

**Restraint:** terminology sweep ≠ doctrine rewrite. Phase 2 normalizes
labels without changing what the labels denote.

---

## 4. Lightweight visual hierarchy recommendations (Part 6, Phase 2)

Phase 1 ships ONE new visual element: the `.browse-view-intro` muted-
tone callout (light background + left border). It sits between the
view-toggle row and the first card grid; doesn't compete with section
headings; mobile-collapses at 480px.

**Phase 2 candidates** (not shipped):

- Family heading style: subtle "Family-anchor: <name>" sub-label
  beneath each family heading. Mirrors the glossary §5 family card
  vocabulary.
- "Why grouped together?" disclosable panels per family — deferred
  unless the family-invariant lines prove insufficient.
- Card-stack density toggle — already proposed in GA Phase 5.
- ADD heading style: small "N ADD" chip + tier-name labels (`Beginner`
  / `Intermediate` / `Advanced` / `Master` bands) — requires curator
  input on tier boundaries.

---

## 5. Flagship family-anchor audit (Part 7, Phase 3)

The Phase 7 question is which trick-detail pages should become the
"publication-complete" exemplars that the rest of the site can point
at as the standard.

### 5.1 Current state of flagship candidates

| Slug | Has equivalence-topology? | Has first-class Notation summary? | Has reference media? | Phase 3 priority |
|---|:---:|:---:|:---:|---|
| osis | n/a | ✓ (pilot member) | yes | **high — already exemplar; document as standard** |
| paradox-mirage | n/a | ✓ (pilot member) | yes | high — exemplar |
| symposium-mirage | n/a | ✓ (pilot member) | partial | medium |
| atomic-butterfly | n/a | ✓ (pilot member) | partial | medium |
| ripwalk | n/a | ✓ (pilot member) | yes | medium |
| whirl | n/a | partial | partial | **high — root family-anchor** |
| butterfly | n/a | partial | partial | **high — root family-anchor** |
| mirage | n/a | partial | partial | **high — root family-anchor** |
| torque | n/a | partial | partial | medium — branch family-anchor |
| blender | n/a | partial | partial | medium — branch family-anchor |
| blur | n/a | thin | minimal | medium — symbolic-compression bridge; needs more depth |
| flurry | ✓ (Phase 2) | n/a | thin | low — equivalence-topology already exemplifies |
| witchdoctor | ✓ (Phase 2) | n/a | minimal | low — equivalence-topology + composite-base ruling already documented |
| mobius | n/a | n/a (gyro doctrine blocks H6) | partial | medium — doctrine-card path |
| barrage | n/a | partial | minimal | low |

### 5.2 Phase 3 recommendation

**High priority (next slice):** whirl, butterfly, mirage trick-detail
pages. These are the root family-anchor tricks; their pages should be
the publication-complete exemplars the rest of the site points at as
the standard.

**Out of scope for Phase 3:** content authorship is curator-paced.
The audit identifies targets; the curator authorizes content.

---

## 6. Scalability analysis (Part 8)

### 6.1 At current scale (~30 family-anchor tricks, ~300 dictionary tricks)

| Surface | Lines of pedagogy | Mobile-safe? | Scales? |
|---|---|:---:|:---:|
| Glossary §5 family cards | 6 cards × ~6 fields each | yes (480px tested) | scales: cap on family-anchor cohort |
| Family view sharedStructure | 6/14 families have invariants today | yes | scales: one curator-authored line per terminal family |
| Family view intro (Phase 1) | 1 paragraph | yes | constant |
| ADD view intro (Phase 1) | 1 paragraph | yes | constant |
| Movement-system view (existing) | 4 axes × 1 paragraph + per-modifier defs | yes | scales: linear in modifier count |
| Trick-detail equivalence-topology | 2 entries today (flurry, witchdoctor) | yes | scales: per-trick entries gated by curator |

### 6.2 At projected scale (every meaningful trick first-class; ~100–300 publication-complete tricks)

| Risk | Mitigation |
|---|---|
| Family view becomes a wall | Cap family list at curator-confirmed cohort; non-terminal families don't render invariants (per topology-governance skill) |
| Family invariants ossify and over-classify | One invariant per slug; absence = silence; curator-confirmed only; reversible by deletion |
| Browse-view intros become essays | Phase 1 intros capped at 1 paragraph each; longer prose belongs in the glossary |
| Terminology saturation (operator vs modifier vs component) | Phase 2 terminology sweep; standardize labels without changing denotations |
| Trick-detail pages diverge in pedagogy quality | Phase 3 flagship audit identifies exemplars; rest of dictionary points at them as the standard |
| The "View full ontology →" affordance fails to scale | Already standardized in GA Phase 6; works at any trick count |

### 6.3 The publication-complete trajectory

The doctrine statement in §0 — "glossary = curated overview;
trick-detail = exhaustive" — is the scalability commitment. The
glossary stays a curated subset; the dictionary stays a browse layer;
trick-detail pages absorb depth. Every Phase deepens the trick-detail
layer (where depth lives) without bloating the glossary or the
dictionary.

---

## 7. Files changed (Phase 1)

```
modified  exploration/dictionary-pedagogy-phase-1-2026-05-21/DESIGN.md (new)
modified  src/content/freestyleFamilyInvariants.ts
            - +4 entries: butterfly, mirage, osis, swirl
modified  src/services/freestyleService.ts
            - +2 view-model fields: familyViewIntro, addViewIntro
            - +2 populated paragraphs in getFreestyleTricksIndexPage
modified  src/views/freestyle/tricks.hbs
            - +2 conditional <p class="browse-view-intro"> blocks
modified  src/public/css/style.css
            - +1 .browse-view-intro class (mobile-tested at 480px)
new       tests/integration/freestyle.dictionary-pedagogy-phase1.routes.test.ts
            - assertions for new invariants + intros + no-leak
```

## 8. Tests (Phase 1)

```
new       tests/integration/freestyle.dictionary-pedagogy-phase1.routes.test.ts
            - family-view intro present + paragraph text
            - ADD-view intro present + paragraph text
            - new family invariants render: butterfly, mirage, osis,
              swirl
            - existing whirl / rev-whirl invariants preserved
            - no curator-internal language (no pt##, no Slice X, no
              Wave-N references)
            - no parser-internal leakage
```

---

## 9. Non-goals + risks

### 9.1 Non-goals

- Not a dictionary UI rewrite.
- Not a new browse axis.
- Not a per-family disclosable "Why grouped" panel (Phase 2 candidate).
- Not a terminology sweep (Phase 2).
- Not a flagship trick-detail content authorship (Phase 3).
- Not a movement-system pedagogy change (already well-served).
- Not a component-view extension (soft-retired).

### 9.2 Risks

| Risk | Mitigation |
|---|---|
| The 4 new family invariants over-claim about families that haven't received curator review | All four are explicitly named in the topology-governance skill as terminal-family candidates; structural-form lines mirror the curator-locked whirl / rev-whirl pattern |
| The Phase 1 intros duplicate the glossary's §5 family-card explanations | Intros are one paragraph each; the glossary §5 cards remain the authoritative substantive surface |
| Future Phase 2 terminology sweep changes the labels in the Phase 1 intros | Phase 2 normalizes labels without changing denotations; the Phase 1 prose remains semantically valid |
| Mobile rendering of the `.browse-view-intro` block crowds the view-toggle row | 480px media query reduces font-size and padding; tested |

---

## 10. Acceptance gates

### Phase 1 (this slice)

- [x] 4 new family invariants authored
- [x] family-view + ADD-view intros wired
- [x] Tests pin presence + no curator-internal language
- [ ] Build + focused sweep green (next step)

### Phase 2 (curator-gated)

- Family heading "Family-anchor: <name>" sub-label
- Terminology sweep (operator vs modifier; equivalence chain vs
  equivalence topology)
- Optional "Why grouped together?" disclosure panels
- Possible additional family invariants if curator authorizes
  (drifter, swirl-as-branch, etc.)

### Phase 3 (curator-gated; content authorship)

- whirl / butterfly / mirage trick-detail content polish
- Establish them as publication-complete exemplars
- Document the exemplar pattern as the standard

---

## 11. Closing

Phase 1 closes the smallest, highest-value pedagogical gap in the
dictionary: readers learn the family-grouping logic in one paragraph
and the ADD-orthogonality fact in another, and the family view itself
gains four new structural invariants that explain what each family
preserves. Everything else (terminology sweep, visual hierarchy,
flagship audit, schema scalability) is named, scoped, and deferred to
explicit gates.

Restraint-first. Reversible by deletion. Curator-paced.
