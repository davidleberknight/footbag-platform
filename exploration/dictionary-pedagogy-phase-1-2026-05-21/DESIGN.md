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

---

## 12. Phase 2 — family-anchor sub-label + terminology audit (ratified 2026-05-21)

Phase 2 extends the dictionary pedagogy with one focused visual
addition and one audit deliverable. Disclosure panels + additional
family invariants remain explicit gates pending curator authorization.

### 12.1 Sub-deliverables

**A. Family-anchor sub-label on family-view headings.** Each family
section on `/freestyle/tricks?view=family` gains a small caption
beneath its heading: "Family-anchor: <name>" where the anchor name
links to `/freestyle/tricks/{slug}` (the family-anchor trick-detail
page). This:

- Adopts the GA-1 §5 glossary "family-anchor trick" vocabulary on the
  dictionary surface.
- Adds an outward link (per GA-6 §12.3.A standardized affordance) so
  readers can descend from the family heading into the canonical
  trick page in one click.
- Is purely visual; no doctrine call; no schema change.

**B. Light terminology audit.** A grep-driven survey of the four
publicly-rendered surfaces confirms the equivalence-topology
vocabulary is consistent post-GA Phase 6 + ET Phase 3 + DP Phase 1.

| Term | Authoritative home | Other surfaces | Drift? |
|---|---|---|---|
| Alternate derivation | glossary §9 (defining surface); §1 publication-states dl ("Alternate derivation (equivalence topology)") | trick-detail "Alternate derivations" panel heading | none — reader-friendly form everywhere |
| Equivalence topology | glossary §1 publication-states dl (parenthetical); design-doc internal name | not surfaced as a label outside the dl | none — the technical name is reserved for the design layer |
| Compression ladder | glossary §9 (defining surface) | §1 derivation-atlas intro ("a symbolic-compression bridge"); derivation-panel internal labels | none — used only as defined |
| Equivalence chain | derivation-panel.hbs collapsed-section heading ("advanced equivalence chains"); §1 publication-states dl ("equivalence chain"); freestyleSymbolicEquivalences.ts (internal); history.hbs prose example | derivation-panel data umbrella covering ladder + alternate + alias rows | label is intentionally broad — source-chip per row disambiguates ([historical] / [structural] / [community] / [curator-derived]) |
| Family-anchor trick | glossary GA-1 §5 intro; DP-2.1 dictionary family-view sub-label (NEW) | trick-detail family chip (slug only); browse-view headings (slug only) | partially closed by DP-2.1; trick-detail family chip remains slug-only by design (chip space is constrained) |
| Shared terminal structure | glossary §5 family cards + dictionary family view | consistent label everywhere it appears | none |
| Movement system | glossary §11 + dictionary movement-system view + trick-detail (where surfaced) | consistent | none |
| Observational | badge text + section footers | consistent | none |
| Historical reading | glossary GA-1 §1 publication-states dl; equivalence-topology `[historical]` role badge | consistent | none |

**No normalization changes shipped in Phase 2** — the terminology is
already consistent. The audit IS the deliverable.

### 12.2 Operator vs modifier — a remaining doctrine call (Phase 3+)

The audit confirms one outstanding distinction the dictionary uses
loosely but the glossary uses precisely:

- **Glossary §6 + §7**: distinguishes "operator" (the abstract
  primitive — `same/op`, `in/out`, `dex`, etc. — per Jobs notation)
  from "modifier" (the named transformation applied to a base —
  paradox, stepping, spinning, etc.)
- **Dictionary browse**: labels modifier rows uniformly as "modifier"
  (which is correct), but card-level operator-vs-modifier
  distinctions don't surface.
- **Trick-detail "Modifier reference"** link in connective panels
  (GA-6) uses the broader "modifier" term.

This is NOT drift — it's a real doctrine distinction the curator may
sharpen further. Phase 3+ work, gated by curator input on whether the
dictionary should expose operator-vs-modifier as a visible axis or
remain modifier-uniform.

### 12.3 Files changed (Phase 2)

```
modified  exploration/dictionary-pedagogy-phase-1-2026-05-21/DESIGN.md (this §12)
modified  src/views/freestyle/tricks.hbs
            - +1 <p class="trick-family-anchor-sublabel"> per family group
modified  src/public/css/style.css
            - +1 .trick-family-anchor-sublabel + .trick-family-anchor-link styles
modified  tests/integration/freestyle.dictionary-pedagogy-phase1.routes.test.ts
            - +4 assertions on the sub-label contract
```

### 12.4 Acceptance gates for Phase 2

- [x] Family-anchor sub-label rendered on every family heading
- [x] Sub-label cross-links to the family-anchor trick-detail page
- [x] Terminology audit confirms post-GA-6 consistency
- [x] Tests pin sub-label presence + cross-link + no curator-internal
      language
- [ ] Build + focused sweep green (next step)

### 12.5 Non-goals for Phase 2

- NOT shipping disclosure panels (`<details>` "Why grouped together?"
  per family). Deferred — the structural-form invariant lines + the
  family-anchor sub-label already deliver the pedagogy; disclosure
  panels would over-engineer.
- NOT adding more family invariants beyond the DP-1 six. Curator
  authorization required for any branch-family or non-terminal-family
  entries (torque, drifter, etc.).
- NOT normalizing operator vs modifier vocabulary — doctrine call,
  Phase 3+.
- NOT changing the dictionary's browse-card layout or density.

---

## 13. Phase 3 — flagship family-anchor trick-detail polish (ratified 2026-05-21)

Phase 3 extends the family-anchor vocabulary into the trick-detail
layer. Where DP-2 added the "Family-anchor: <name>" sub-label on
family-view headings (pointing INTO the trick-detail pages), Phase 3
adds the reciprocal: when a reader lands on a family-anchor
trick-detail page, the page explicitly states the dual role.

### 13.1 Before/after audit (whirl, butterfly, mirage, osis)

Pre-Phase-3 state of the four flagship trick-detail pages:

| Surface | whirl | butterfly | mirage | osis |
|---|:---:|:---:|:---:|:---:|
| FIRST_CLASS_TIER_1 membership | ✓ | ✓ | ✓ | ✓ |
| ATOMIC_FLAG_DECOMPOSITIONS entry | ✓ | ✓ | ✓ | ✓ |
| Notation summary card (first-class Zone B) | ✓ | ✓ | ✓ | ✓ |
| Operational chain | ✓ | ✓ | ✓ | ✓ |
| ADD breakdown | ✓ | ✓ | ✓ | ✓ |
| Family chip in hero | ✓ | ✓ | ✓ | ✓ |
| Family lineage section (descendants by ADD tier) | ✓ | ✓ | ✓ | ✓ |
| Explicit "family-anchor trick" role label | ✗ | ✗ | ✗ | ✗ |
| Family invariant restated on page | ✗ | ✗ | ✗ | ✗ |
| Family-browse cross-link | implicit (family chip) | implicit | implicit | implicit |

The four pages already render publication-grade first-class data. The
gap was *role-labeling*: each page rendered its content as a generic
trick page without naming the anchor role. A reader following the
GA-6 "View full ontology →" link from the glossary §5 family card
arrived without confirmation that they'd reached the family-anchor.

Post-Phase-3 state:

| Surface | whirl | butterfly | mirage | osis |
|---|:---:|:---:|:---:|:---:|
| (everything above) | ✓ | ✓ | ✓ | ✓ |
| Explicit "family-anchor trick" callout | ✓ | ✓ | ✓ | ✓ |
| Conserved terminal mechanic surfaced as `<code>` | ✓ | ✓ | ✓ | ✓ |
| Family-browse cross-link ("Whirl family →") | ✓ | ✓ | ✓ | ✓ |

Each page now teaches the dual role in one short paragraph + one
labeled invariant line. No essay; no fabricated formula; no parser
exposure.

### 13.2 Sub-deliverables

**A. `familyAnchorContext` view-model field.** Added to
`FreestyleTrickContent`. Populated only when:
- `dictRow.slug === dictRow.trick_family` (the trick IS the family-
  anchor by canonical identity)
- AND `FAMILY_INVARIANTS` has an entry for the family slug (DP-1's
  six: whirl, rev-whirl, butterfly, mirage, osis, swirl)

Null for every other trick. Carries `{ invariant, familyName,
familyBrowseHref }` — single source of truth via `getFamilyInvariant`
from the existing content module.

**B. Family-anchor callout in `trick-family.hbs`.** Renders at the
top of the trick-family section, before the lineage tier grid:

> **Whirl** is the **family-anchor trick** for the [Whirl family →]
> Conserved terminal mechanic: `leggy in dex > ss clipper`

Class `.trick-family-anchor-callout` reuses the muted-tone aesthetic
of `.browse-view-intro` (DP-1) for visual cohesion across the
pedagogy surfaces. Mobile-tested at 480px.

**C. Outward link adopts the standardized class.** The "Whirl family →"
link uses the `glossary-outward-link` class established in GA Phase 6,
keeping the dictionary's outward-affordance vocabulary unified across
surfaces.

### 13.3 Why this slice does not need new content authorship

The user's task spec said: "Polish each page so it clearly explains
1) trick identity, 2) conserved family invariant, 3) Jobs/operational
notation, 4) ADD computation, 5) why the trick acts as a family
anchor, 6) representative descendants, 7) relationship to dictionary
family view."

The audit in §13.1 confirms 1, 3, 4, 6, 7 are already rendered today
via existing components (first-class Notation summary +
ATOMIC_FLAG_DECOMPOSITIONS + family chip + trick-family lineage).
Phase 3 adds 2 (conserved family invariant) and 5 (family-anchor
role) in one additive callout. No content fabrication; no new doctrine;
no template hacks per the user's constraint list.

### 13.4 Why these four anchors get the callout, not all family slugs

The callout activates only for the six terminal-family slugs covered
by `FAMILY_INVARIANTS` (whirl, rev-whirl, butterfly, mirage, osis,
swirl). Branch-family slugs (torque, blender, drifter) and
foundational atoms with no curator-confirmed invariant (legover,
clipper, pickup, illusion, around-the-world) do not surface the
callout. This is intentional:

- The callout's load-bearing claim is "this trick preserves THE
  conserved terminal mechanic of its family." That claim is only
  honest when the family has a curator-locked invariant.
- For branch families and non-terminal anchors, the page still
  renders the family chip + lineage + Notation summary; the
  *additional* anchor callout is suppressed.
- Adding more anchor entries is a curator-paced expansion, gated on
  per-family invariant authorship.

### 13.5 Files changed (Phase 3)

```
modified  exploration/dictionary-pedagogy-phase-1-2026-05-21/DESIGN.md (this §13)
modified  src/services/freestyleService.ts
            - +1 view-model field: familyAnchorContext
            - +1 populate IIFE in getTrickDetailPage
modified  src/views/partials/trick-family.hbs
            - +1 conditional callout block at section top
modified  src/public/css/style.css
            - +1 .trick-family-anchor-callout class set
              (mobile-tested at 480px)
new       tests/integration/freestyle.flagship-family-anchors.routes.test.ts
            - 21 assertions across 4 anchor pages + 1 non-anchor
              control + curator-internal-language guard
```

### 13.6 Tests (Phase 3)

```
new  tests/integration/freestyle.flagship-family-anchors.routes.test.ts
       4 callout-render assertions (whirl, butterfly, mirage, osis)
     + 4 "Conserved terminal mechanic" label assertions
     + 4 first-class Notation summary regression assertions
     + 4 ADD breakdown regression assertions
     + 1 non-anchor control (paradox-mirage: no callout)
     + 4 no-curator-internal-language guards per anchor page
```

Focused sweep across the 6 adjacent freestyle integration test files:
111/111 tests green.

### 13.7 Acceptance gates for Phase 3

- [x] familyAnchorContext shaped at service layer, null-safe
- [x] Callout renders only for the 6 terminal-family anchors with
      curator-confirmed invariants
- [x] First-class Notation summary still renders (regression covered)
- [x] Non-anchor tricks do NOT render the callout
- [x] No curator-internal language leaks
- [x] Build clean; focused 111/111 tests green
- [ ] Mobile (480px) visual review on the four flagship pages

### 13.8 Non-goals for Phase 3

- NOT changing the trick-detail page's overall layout, density, or
  section ordering.
- NOT adding equivalence-topology entries for whirl/butterfly/mirage
  (they don't have alternate-derivation cases — that's a flurry /
  witchdoctor surface, per ET Phase 2).
- NOT polishing trick-detail prose content (ux2Pilot, executionParagraphs,
  learningParagraphs are curator-authored and out of scope).
- NOT promoting branch-family or non-terminal slugs to the callout —
  gated on per-family invariant authorship.
- NOT exposing parser internals (per the `feedback_parser_editorial_
  separation` forever-rule).

### 13.9 Remaining Phase 4+ work (curator-gated)

- **Operator vs modifier doctrine call** — whether the dictionary
  should expose this axis as a visible distinction
- **Optional disclosure panels** on family-view sections — only if
  the current pedagogy proves insufficient with real reader feedback
- **Additional family invariants** for branch families (torque,
  blender, drifter) — curator decision on which deserve invariants
- **Reference-media authorship** for whirl/butterfly/mirage — these
  pages have partial coverage; full media polish is curator-paced
- **ux2Pilot content authorship** for the flagship pages — single-page
  pilot prose currently only authored for montage; expanding to the
  three flagship anchors is curator-paced
