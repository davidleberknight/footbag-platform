# Glossary Architecture Overhaul — 2026-05-21

A staged design for unifying ontology presentation, reducing redundancy,
strengthening dictionary/glossary cohesion, and introducing collapsible
first-class movement-language cards.

**This is a curator-review deliverable.** Phase 1 (this slice) ships
three pure-prose additions that demonstrate the architecture; Phases
2–5 are explicit gates that require curator authorization.

---

## 0. Status + scope

### 0.1 What this revises

R1a–R1h + ET-1/2/3 (2026-05-20 / 2026-05-21) stabilized the ontology
infrastructure (barraging weight, witchdoctor composite reading, mobius
doctrine-locked framing, derivation atlas, first-class cards,
equivalence-topology layer). The glossary has grown to 14 sections
covering canonical reference + symbolic compression + ADD doctrine +
movement-neighborhood topology + run architecture.

The glossary now suffers from:

- Redundancy across §1 / §8 / §9 (mobius doctrine; blur compression;
  whirl-as-attractor framing)
- Section sprawl (14 sections with overlapping pedagogical roles)
- Inconsistent rendering grammar (derivation panels in §1; family
  cards in §5; worked examples in §8; equivalence ladders in §9 —
  five primitive shapes for similar ontology objects)
- Family/trick ambiguity (whirl is an atom AND a family AND a
  connector role; the glossary blurs these)
- Insufficient dictionary↔glossary alignment (browse views at
  `/freestyle/tricks?view=…` have no glossary-side explanation of
  their grouping logic)

This document proposes a staged overhaul that resolves these issues
**without rewriting the ontology**. The work is information
architecture + rendering unification + pedagogical clarity, not
doctrine change.

### 0.2 What stays locked

- Every locked principle from the 2026-05-19 IA refactor + the
  2026-05-20 derivation-first revision: 14-section spine, T1/T2/T3
  badges, sticky sidebar, card primitive, root vs branch family split,
  derivation panel, doctrine note, equivalence chain.
- The four-layer separation: parser layer / editorial layer / canonical
  surface / observational surface. No mixing.
- The reversibility doctrine: TS content modules over SQL while
  ontology is in flight.
- The two-surface contract: every reference object has exactly one
  canonical home; other pages link to it.

### 0.3 What this adds

Six new principles + a staged implementation gate structure:

| # | Principle | Status |
|---|---|---|
| 15 | **Authoritative home + lightweight echoes** — every concept has one canonical home; other sections link in, never re-explain | New, proposed |
| 16 | **Unified first-class card grammar** — derivation panel becomes the universal glossary ontology card; one shape across §1 / §5 / §6 / §9 | New, proposed |
| 17 | **Family-anchor trick** as explicit ontology role — clarifies family vs trick vs atom | New, proposed |
| 18 | **Dictionary-view explanation layer** — for each browse axis, a concise glossary block explains the invariant | New, proposed |
| 19 | **Generative insight surface** — Jobs notation's compositional-completeness framing made explicit | New, proposed |
| 20 | **Reader-orientation surface** — "How to read this glossary" explains canonical / observational / doctrine / equivalence / pending | New, proposed |

---

## 1. Redundancy + section-ownership audit

A targeted audit (independent Explore sweep, 2026-05-21) identifies
**five concepts with material redundancy** (>35% prose overlap across
sections):

| Concept | Authoritative home | Redundant locations | Overlap |
|---|---|---|---:|
| **mobius** (rotational doctrine) | §1 Derivation Atlas panel | §7 decompression narrative; §8 doctrine-locked status; §9 compression worked example | ~60% |
| **blur** (stepping-paradox bridge) | §1 Derivation Atlas panel | §8 ADD worked example; §5 family card; §9 compression ladder | ~45% |
| **compression ladder** (concept) | §9 "Compression ladders vs alternate derivations" | §1 opening philosophy; derivation-panel ladder format | ~50% |
| **doctrine** (rotational continuity) | §1 derivation-panel doctrine note | §8 observational note on mobius; §9 policy-dependent framing | ~50% |
| **whirl** (root atom + family + attractor) | §5 family card | §1 derivation panel; §11 connective panel; §7 notation example | ~35% |

**Concepts with appropriate single homes** (no >30% redundancy):
ADD accounting (§8); Jobs/operational notation (§7); canonical/
observational distinction (§1 + §5/§11 enforcement); barraging,
paradox, spinning, torque, blender (each in one substantive home with
only lightweight cross-refs elsewhere).

**Total prose overlap across the glossary: ~15% of the document.**
Mostly concentrated in the five concepts above.

### 1.1 The "authoritative home + lightweight echoes" rule

Principle 15: every concept lives in exactly one section that explains
it fully. Other sections may *reference* the concept (deep-link via
anchor, mention by name, use as an example) but never re-explain it.

For each redundant concept above:

| Concept | Home | Other sections become |
|---|---|---|
| mobius rotational doctrine | §1 derivation panel | §7: drop mechanism narration; keep as "see mobius doctrine in §1". §8: same. §9: same. |
| blur as compression bridge | §1 derivation panel | §8: drop redundant decomposition; reference panel. §5: keep family-card lineage. §9: keep as compression-ladder *example* (linking, not re-explaining). |
| compression ladder concept | §9 (the definition lives there) | §1: keep brief mention as "you'll see this pattern repeatedly"; do not redefine. |
| rotational continuity | §1 derivation-panel doctrine note | §8: link only. §9: link only. |
| whirl as attractor | §5 family card (canonical) | §11 connective panel: explicitly mark "observational; canonical in §5". |

### 1.2 Phase scope

- **Phase 2** (curator-gated): apply the home-and-echoes rule. Trim
  redundant prose; replace with deep-links. ~80 lines of net
  reduction expected.

---

## 2. Unified first-class card grammar (Principle 16)

### 2.1 The proposal

Every major first-class trick/family entry across the glossary uses the
same compact card grammar:

```
TITLE                    (compressed community form)
ontology-role badges     (atom · root-family · branch-family · modifier · operator)

Compressed reading       (one line; matches title)
Semantic reading         (one line; structural reading)
Expanded reading         (optional; deeper)

Operational notation     (Jobs notation; one line)
ADD                      (official + breakdown)
Family / topology role
Inherits from            (lineage chain; optional)
Related                  (equivalence chain + neighborhood links)

[advanced] Equivalence topology    (collapsed; from freestyleEquivalenceTopology.ts)
[advanced] Doctrine notes          (collapsed; from freestyleGlossaryAddExamples.ts)
[advanced] Historical notes        (collapsed)
[observational] Observational notes (collapsed)
```

### 2.2 Default-visible vs default-collapsed

| Row | Default state | Reason |
|---|---|---|
| Title + role badges | visible | canonical identity |
| Compressed / semantic readings | visible | the trick at first depth |
| Operational notation | visible | Jobs-notation contract |
| ADD + breakdown | visible | ADD accounting contract |
| Family / topology role | visible | ontology orientation |
| Inherits from, Related | visible | lineage navigation |
| Expanded reading | collapsible if 4+ depth ladder; visible if 2–3 | progressive disclosure |
| Equivalence topology | collapsed | per ET-2 contract; advanced |
| Doctrine notes | collapsed | per §8.7 contract |
| Historical notes | collapsed | preserves searchability without overload |
| Observational notes | collapsed | per Principle 7 (observational visually subordinate) |
| Parser nuance | NEVER public-rendered | per `feedback_parser_editorial_separation` |

The osis-level rendering (the existing first-class Notation summary on
the trick-detail page) is the **target standard**: visible canonical
rows, collapsed advanced rows, no parser exposure.

### 2.3 Existing primitives this builds on

- `derivation-panel.hbs` (used in §1 Derivation Atlas) already
  implements ~70% of this grammar
- `glossary-family-card.hbs` (used in §5) implements ~50%
- `trick-equivalence-topology.hbs` (used on trick-detail) implements
  the collapsed equivalence-topology row

Phase 3 work: unify these three primitives into one with a discriminator
prop (`kind: 'atlas-entry' | 'family-card' | 'modifier-card'`) that
controls which rows surface. Reduce three component files to one.

### 2.4 Phase scope

- **Phase 3** (curator-gated): prototype the unified card on one slug
  (suggested pilot: osis as a family-anchor trick). Curator review.
- **Phase 4**: expand pilot to the eight family-anchor tricks (root
  cohort). Retire `derivation-panel.hbs` after equivalence.
- **Phase 5**: expand to modifier cards in §6.

---

## 3. Family vs trick vs family-anchor clarity (Principle 17)

### 3.1 The vocabulary

The glossary currently uses "family" ambiguously: sometimes the slug
in `freestyle_tricks.trick_family`, sometimes the rendered family card,
sometimes the cohort of tricks sharing a terminal mechanic. Per the
topology-governance skill warnings, family is over-loaded.

**Proposed new term: family-anchor trick.**

> A **family-anchor trick** is a canonical trick that also acts as the
> productive root of a movement family or topology neighborhood. All
> family-anchor tricks are tricks; not every trick is a family-anchor.

Examples (root family-anchors): whirl, butterfly, mirage, osis,
clipper-stall, legover. Examples (branch family-anchors): torque,
blender, drifter, barrage, blur. Counter-examples (tricks that are NOT
family-anchors): flurry, witchdoctor, paradox-mirage.

### 3.2 What this clarifies

- A family-anchor trick has a trick-detail page AND a family card.
- A non-anchor trick has only a trick-detail page.
- Modifiers (paradox, symposium, spinning, ducking) are NOT
  family-anchors; they are operators. The §5 intro currently
  acknowledges this; the family-anchor terminology makes it explicit.
- The §5 root vs branch split becomes "root family-anchor tricks" vs
  "branch family-anchor tricks". Same data, sharper labels.

### 3.3 Phase scope

- **Phase 1** (this slice): add the term + definition + examples to §5
  intro. Pure prose addition.
- **Phase 2** (curator-gated): apply the term consistently across §1 /
  §5 / §11 prose.
- **Phase 3** (curator-gated): consider adding `is_family_anchor` to
  the family-card view-model if cohesion benefits the pilot. Reversible
  by deletion.

---

## 4. Dictionary-view explanation layer (Principle 18)

### 4.1 The proposal

For each major dictionary browse axis at `/freestyle/tricks?view=…`,
the glossary carries a concise "How this dictionary view groups tricks"
block that explains the invariant.

Initial axes:

| Browse view | Invariant explained |
|---|---|
| `?view=family` | Each group shares a conserved terminal mechanic (the family-anchor trick) |
| `?view=movement-system` | Each system shares a modifier or topology axis (spinning system, paradox system, …) |
| `?view=component` | Each group shares a component-token (xbody, dex, stall, spin) |
| `?view=add` | Each group shares an ADD value — clusters by additive structural difficulty, not movement similarity |
| `?view=category` | Each group shares a structural category (atom, compound, modifier) |
| `?view=topology` | Each group shares an observational topology axis (rotational, paradox, hippy/leggy) |

### 4.2 Format

Each block:
- 1-line invariant statement
- 1 worked example (concrete trick or trick pair)
- 1 anti-example (a similar-looking trick that does NOT belong)

Example draft for whirl family:

> **Whirl family.** All tricks preserve the whirl terminal structure:
> `CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]`. The whirl atom is
> visible at the end of the operational chain. Example:
> *paradox-whirl* (paradox modifier + whirl atom; whirl terminal
> preserved). Counter-example: *whirling osis* (whirl appears as a
> *modifier*, not a terminal — belongs in the osis family, not the
> whirl family).

### 4.3 Placement

Two options, both proposed:

**A. Inline in §5 family cards.** Each family card gains a "How this
family groups tricks" details panel. Concise, contextual; reader
opens it when looking at the card.

**B. Centralized in §11 Family & Topology Concepts.** One table-style
summary covering all six axes. Reader visits §11 once to learn the
browse-view literacy.

Recommendation: **both** — A for per-family granularity, B for cross-
axis comparison. Phase 4 work.

### 4.4 Phase scope

- **Phase 4** (curator-gated): author the six invariant blocks + add
  the per-family details panels. Curator input required for the
  invariant text (these are doctrine-adjacent assertions).

---

## 5. Jobs notation / generative theory expansion (Principle 19)

### 5.1 What the glossary currently underplays

§7 introduces Jobs notation as "compact symbolic shorthand for trick
composition." This is correct but pedagogically thin. The original
notation proposal carried a stronger insight:

- A small set of primitive movement operators generates the entire
  freestyle trick space combinatorially.
- The set of nameable tricks is, in principle, **enumerable**: pick a
  starting surface, pick a finite sequence of operators, read off the
  resulting formula.
- The community-named tricks are the formulas the community found
  worth naming. Many unnamed-but-structurally-valid tricks exist.
- The canonical structural form of a footbag trick is:

```
(toe | clip) > [(same | op)(in | out)dexterity]* > (same | op)(toe | clip)
```

  i.e., a surface kick or stall, followed by zero or more dex events,
  closed by a surface kick or stall on either side.

### 5.2 The "Generative Insight" subsection

A short subsection in §7 (after the existing intro, before the
canonical-example battery) that:

- States the generative-completeness insight in two paragraphs
- Shows the canonical formula (above)
- Frames the trick dictionary as a *curated subset* of the formula's
  generative output
- Honors the historical proposal without naming individuals (per
  `feedback_no_individual_names_freestyle_views`, except that the
  Jobs-notation tradition itself is the codified attribution exception)

The "Ben Job" attribution (per Phase-1 design-doc §6.3 of the
2026-05-20 derivation-first revision) is the codified exception:
"articulated most famously in a foundational notation proposal by Ben
Job" — respectful, not biographical.

### 5.3 Phase scope

- **Phase 1** (this slice): add the Generative Insight subsection
  with the canonical formula. Pure prose.
- **Phase 2+**: link the canonical formula to a worked example
  showing how a specific trick (e.g. paradox-mirage) is generated by
  the formula.

---

## 6. Worked-examples overhaul plan (Part 6)

### 6.1 Current worked examples

| Section | Example | Pattern |
|---|---|---|
| §1 | mobius | compression ladder + doctrine |
| §1 | blur | compression bridge |
| §1 | paradox | modifier operator |
| §1 | whirl | root family-anchor |
| §1 | flurry | compound trick |
| §8 | blur, mobius, nuclear, quantum, baroque | ADD accounting compact cards |
| §9 | mobius (3-reading compression) | compression ladder definition |
| §9 | flurry, witchdoctor | equivalence topology (Phase 3) |

Coverage: compression, doctrine, ADD math, equivalence topology.

### 6.2 Coverage gaps

- **Folk-name compression**: a worked example showing how a folk name
  (e.g. blurry, terraging) compresses a multi-operator stack. Not yet
  surfaced as a worked example.
- **Same trick at several depths**: covered (mobius), but only once;
  the pedagogical narrative would benefit from a *second* example
  (suggested: gauntlet = blurry ducking torque ≡ stepping ducking
  paradox torque).
- **Multiple-derivation deep dive**: flurry and witchdoctor in §9 are
  compact; a deeper "compare and contrast" narrative would help
  readers internalize alternate-derivation vs compression-ladder.

### 6.3 Phase scope

- **Phase 4** (curator-gated): add three worked examples to §6, §8,
  and §9. Curator input on which examples are pedagogically optimal.

---

## 7. Observational + doctrine semantics — "How to read this glossary" (Principle 20)

### 7.1 The proposal

A new subsection in §1 ("How to read this glossary") that explicitly
enumerates the publication-state vocabulary:

| State | Visual cue | Meaning |
|---|---|---|
| canonical | default text | community-sanctioned; single-valued; authoritative |
| observational | `[observational]` badge | curator-derived movement-neighborhood lens; supplements canonical |
| doctrine-sensitive | `[doctrine]` badge | reading governed by a published doctrine (e.g. rotational continuity) |
| historical | `[historical]` badge | preserved older reading; not a competing claim |
| pending | `[advanced]` collapsed | curator-confirm-pending; not yet ratified |
| equivalence-topology | `[advanced]` collapsed | alternate-derivation paths for the same trick |
| parser-gap | (never surfaced) | curator decomposition not yet authored; absence is meaningful |

This subsection lives in §1 because it orients the reader on FIRST
encounter. It cross-links to §5 (canonical), §8 (doctrine), §9
(compression / equivalence), §11 (observational).

### 7.2 Phase scope

- **Phase 1** (this slice): add the subsection. Pure prose.

---

## 8. UX / collapsible architecture (Part 8)

### 8.1 Current state

The glossary uses `<details>` collapsibles for:
- §8 worked-example "Why it matters" expandables
- §8 "Discrepancy cases & policy-dependent semantics" expandable
- §11 connective-panel observational sub-panels
- Derivation panel `[advanced]` / `[observational]` rows (§1)

### 8.2 The proposal

- Apply the unified card grammar (§2) consistently → every advanced/
  observational/historical/equivalence row uses the same collapsed
  pattern.
- Default-collapse the §11 connective panels' tertiary content
  (currently visible-by-default).
- Consider a "Density toggle" preference: compact (all advanced rows
  collapsed) vs comprehensive (advanced rows expanded). Cookie-stored;
  curator-gated.
- Mobile-first: every collapsible has a touch-target ≥44px; tested at
  480px and below per `add-public-page` skill §6 layout review.

### 8.3 Visual hierarchy improvements

- §5 family cards currently render in two grids (root + branch). Add
  a one-line legend above each grid stating the role distinction (one
  sentence; not a full re-explanation).
- §6 modifier reference renders as multiple feel-cards. Group by
  modifier_type (body / set / structural / directional) with sticky
  sub-headings on scroll. Reduces visual flatness.
- §7 glyph quick-reference is dense; add visible spacing between tiers.
- §8 worked-example grid: ensure consistent card heights at 480px
  (currently variable due to optional `observationalNote`).
- §11 connective panels: collapse the "Used in these tricks" list when
  it exceeds 8 entries (current behavior shows all; some lists are
  long).

### 8.4 Phase scope

- **Phase 5** (curator-gated): density toggle + collapsible
  consistency pass. CSS-only; no view-model changes; mobile-tested.

---

## 9. Minimal implementation slice recommendation (Phase 1)

Three pure-prose additions, all of which:
- Address a different Part of the overhaul (Parts 3, 5, 7)
- Require no new schema
- Require no new service shaping
- Require no curator doctrine input (they don't invent doctrine; they
  expose existing structure pedagogically)
- Are reversible by deletion
- Carry test coverage

### 9.1 Phase 1 deliverables

| Addition | Section | Lines | Part addressed |
|---|---|---:|---|
| "How to read this glossary" subsection | §1 (after intro, before derivation atlas) | ~50 | Part 7 |
| Family-anchor trick terminology paragraph | §5 (intro) | ~10 | Part 3 |
| "Generative Insight" subsection with canonical formula | §7 (after intro, before example battery) | ~35 | Part 5 |

Total ~95 lines of static curator-authored prose. No primitives. No
CSS work (reuses existing glossary classes). Integration tests pin
each addition's presence + no curator-internal language leakage.

### 9.2 Phase 2+ — explicit gates

| Phase | Scope | Gate | ROI |
|---|---|---|---|
| 2 | Authoritative home + lightweight echoes — trim redundant prose; deep-link instead | Curator approves removal targets | High; ~80-line net reduction |
| 3 | Unified card grammar prototype (one pilot slug) | Curator picks pilot slug; reviews prototype | Medium; demonstrates the unification |
| 4 | Dictionary-view explanation blocks + worked-examples expansion | Curator authors invariant text | High; teaches browse-view literacy |
| 5 | UX/collapsible consistency + density toggle | CSS-only; mobile-tested | Medium; reduces visual overload |

---

## 10. Risks + failure modes

| Risk | Mitigation |
|---|---|
| Phase 1 prose claims doctrine that isn't curator-locked | Stick to existing structure; describe what IS, not what SHOULD BE. The three additions are pedagogy, not doctrine claims. |
| "How to read this glossary" oversimplifies the publication-state taxonomy | Phase 1 lists exactly the seven states already used in the glossary. No new states invented. |
| Family-anchor terminology collides with existing "family" usage | The new term *supplements* "family"; does not replace it. Existing data stays single-valued. |
| Generative Insight quotes too heavily from historical sources | Per the user's constraint: "paraphrase carefully." Phase 1 surfaces the canonical formula and 2 paragraphs of framing; no biographical content. |
| The 14-section spine ossifies before further iteration | Phase 1 does NOT change the spine. All additions live inside existing sections. |
| Curator-internal language leaks into the new prose | Integration tests pin absence of `curatorConfirmPending`, `curatorNote`, internal filenames, etc. |
| Phase 2 redundancy cleanup deletes prose the curator wanted to keep | Phase 2 is gated; the curator authorizes each removal target. No automatic deletion. |
| Unified card grammar (Phase 3) over-collapses canonical material | Phase 3 ships one pilot for curator review BEFORE expanding. Reversible by primitive substitution. |

### 10.1 Non-goals

- Not a doctrine rewrite.
- Not a parser-exposure surface.
- Not a movement-similarity engine.
- Not a multi-family schema migration (per topology-governance skill).
- Not a top-level navigation change.
- Not a search/browse surface change.

---

## 11. Closing

The glossary's job is to teach the movement language. The 14-section
spine and the existing primitives are sound; the issue is information
architecture, not ontology. This overhaul ships in phases so each
slice is reviewable, reversible, and pedagogically self-contained.

Phase 1 (this slice) adds 95 lines of pure prose that establish three
foundational reader-orientation surfaces: how to read the publication
states, what a family-anchor trick is, why the compositional grammar
is generative. The rest of the overhaul — redundancy cleanup, card
unification, browse-view literacy, worked-examples deepening, UX
collapsibles — waits for curator authorization.

Restraint-first. Reversible by deletion. Curator-paced.

---

## 12. Phase 6 — Glossary ↔ Trick-Detail Convergence (ratified 2026-05-21)

Phase 6 converges the glossary's card primitives and the trick-detail
page into a coherent two-depth publication system. Where Phases 1–5
shaped the glossary's interior, Phase 6 shapes the glossary's
*relationship* with the rest of the public surface.

### 12.1 Load-bearing doctrine statement

> **The glossary is a curated conceptual overview layer, not an
> exhaustive enumeration surface. Exhaustive ontology publication
> belongs to per-trick expanded pages and dictionary browse systems.**

This sentence is the architectural commitment that gates every
subsequent decision about glossary content depth, card grammar, and
outward navigation. When in doubt: summarize in the glossary; expand
on the trick-detail page; enumerate in the dictionary.

The doctrine resolves the "should this go in the glossary or on the
trick-detail page?" question at the design layer. Cards that exceed
the doctrine's bound (too much depth, too much enumeration, too much
prose) are restructured toward the trick-detail page.

### 12.2 Convergence audit (pre-Phase-6 state)

**Five distinct primitive shapes for similar ontology objects:**

| Primitive | Used in | Outward-link state | Convergence target |
|---|---|---|---|
| `derivation-panel.hbs` | §1 atlas | none | add "View full ontology →" |
| `glossary-family-card.hbs` | §5 root + branch | "View family →" (browse) | add "View full ontology →" (trick-detail) + keep browse link |
| `freestyle-modifier-reference.hbs` | §6 feel-cards | "See tricks using {Name} →" | normalize to "Browse {Name} tricks →" |
| `glossary-add-example-card` (inline) | §8 worked-examples | none | doctrine-prose cleanup; cross-link only |
| `glossary-connective-panel` (inline) | §11 neighborhoods | "Learn more about {displayName} →" | normalize to "Modifier reference →" (when modifierFamilyHref present) |

### 12.3 Phase 6 sub-deliverables (this slice)

**A. Outward-link convergence.** Single phrasing per destination type:

| Destination | Phrasing |
|---|---|
| Family-anchor trick-detail page | "View full ontology →" |
| Family browse view in dictionary | "View family →" (existing on family cards; preserve) |
| Modifier browse view in dictionary | "Browse {Name} tricks →" (was "See tricks using {Name} →") |
| Modifier family page | "Modifier reference →" (was "Learn more about {displayName} →") |

Single CSS class `.glossary-outward-link` controls placement and tone.
Forbidden variants retired: "See tricks using…", "Learn more about…",
"Click here", or any phrasing not on the table above.

**B. Collapse tuning on the derivation atlas.** The atlas panels
currently render the full 4-rung ladder + equivalence chains +
doctrine context all default-visible. Phase 6:

- Expanded + deep ladder rungs → collapsed behind `[advanced]` `<details>`
- Equivalence-chain section → collapsed behind `[advanced]` `<details>`
- Doctrine-note context prose → collapsed (headline + reading-A / reading-B / mechanism / status stay visible; context paragraph moves to `<details>`)
- Default-visible rows: compressed + semantic readings, operational notation, ADD ledger, family + inherits + related

The "osis-level rendering quality" target (Principle 16) is preserved:
canonical identity always visible, advanced layers progressively
disclosed.

**C. Doctrine-lighting cleanup.** §8 ADD worked-examples mobius card
currently duplicates the §1 derivation-atlas doctrine-note prose
about rotational-frame continuity. Phase 6 replaces the duplicate
with a one-line summary + cross-link to §1. Other §8 worked-examples
(blur, nuclear, quantum, baroque) are pedagogically distinct and
remain unchanged.

**D. Family-card ontology links.** Every `glossary-family-card.hbs`
gains a "View full ontology →" link pointing at the family-anchor
trick-detail page (`/freestyle/tricks/{slug}`). The existing browse-
view link ("View family →") stays — the two affordances answer
different questions ("teach me this anchor trick" vs "show me the
family in the dictionary").

**E. Phrasing normalization.** Modifier feel-cards (§6) and
connective panels (§11) adopt the standardized phrasings from §12.3.A.

### 12.4 Files changed (Phase 6)

```
modified  exploration/glossary-architecture-overhaul-2026-05-21/DESIGN.md
            - this Phase 6 section (§12)
modified  src/views/partials/derivation-panel.hbs
            - collapse expanded/deep ladder rungs
            - collapse equivalence-chain section
            - collapse doctrine context prose
            - add "View full ontology →" link
modified  src/views/partials/semantic-depth-ladder.hbs (if present)
            - split visible vs collapsed rungs
modified  src/views/partials/glossary-family-card.hbs
            - add "View full ontology →" link
modified  src/views/partials/freestyle-modifier-reference.hbs
            - "See tricks using {Name} →" → "Browse {Name} tricks →"
modified  src/views/freestyle/glossary.hbs
            - §11 connective panels: "Learn more about" → "Modifier reference →"
            - §8 mobius observationalNote: doctrine prose → one-line + cross-link
modified  src/content/freestyleGlossaryAddExamples.ts
            - mobius observationalNote: doctrine prose → terse summary
modified  src/public/css/style.css
            - new .glossary-outward-link class
            - collapsible affordances on derivation panel
            - mobile (480px) media-query touches
```

### 12.5 Tests (Phase 6)

```
modified  tests/integration/freestyle.glossary-derivation-atlas.routes.test.ts
            - assert "View full ontology →" present per atlas panel
            - assert deep ladder rungs are default-collapsed (<details>)
            - assert equivalence chains are default-collapsed
            - assert doctrine context is default-collapsed; headline visible
new       tests/integration/freestyle.glossary-outward-links.routes.test.ts
            - assert "View full ontology →" appears on family cards + atlas panels
            - assert "Browse {Name} tricks →" appears on modifier feel-cards
            - assert forbidden phrasings ("See tricks using…", "Learn more about…") absent
            - assert single .glossary-outward-link CSS class binds all standardized links
```

### 12.6 Non-goals for Phase 6

- Not unifying the five primitives into one component (that's Phase 7+
  — see §13 below). Phase 6 normalizes their *outputs* without merging
  their *implementations*.
- Not changing the derivation-atlas pilot membership (still 5 entries).
- Not adding new trick-detail content. The "View full ontology →"
  link points to the existing trick-detail page; trick-detail content
  scope is governed elsewhere.
- Not touching trick-detail render order or content; only adding
  inbound links from the glossary.

### 12.7 Acceptance gates for Phase 6

- [x] Doctrine statement (§12.1) written
- [ ] All five sub-deliverables (§12.3.A–E) shipped
- [ ] Tests pin the unified outward-link contract + collapsed states
- [ ] Build clean; focused sweep green
- [ ] Mobile (480px) verified: collapse affordances usable, link targets ≥44px touch

---

## 13. Phase 7+ — Primitive Convergence (deferred, gate explicit)

After Phase 6 normalizes the *outputs* of the five primitives, Phase 7
could unify their *implementations* into a single
`glossary-ontology-card.hbs` partial with a `kind` discriminator
(`atlas-entry | family-card | modifier-card | add-example | connective-
panel`). This would reduce the template surface ~40% and centralize
the row vocabulary in one place.

**Gate:** Phase 7 requires the curator to confirm that all five
primitives' Phase-6 outputs have stabilized (≥4 weeks of no churn).
Premature unification creates a single primitive with five conditional
branches and is worse than the current five clean shapes.

**Estimated scope:** ~300 lines of new partial + view-model
normalization at the service layer; ~500 lines of deletions across
the five existing partials/inline blocks; comprehensive integration
test rewrite.

**Restraint:** Phase 7 ships only if Phase 6 demonstrates that the
five outputs are interchangeable. If they remain pedagogically
distinct, the five primitives stay separate.
