# Public Notation Render Hierarchy (NCR-3, brief E3)

Formalizes the 4-tier rendering precedence for notation across every
public freestyle surface. Pins the contract via additional integration
tests; ratifies what was established in the dictionary-coherence
wave's CR-5 and extends it across landing + detail surfaces.

Supports `FINAL_RECOMMENDATION.md` NCR-3.

This doc is **contract-shaped**: it documents the rendering precedence
rule, identifies every surface it applies to, and proposes how to test
the contract so future slices don't drift.

---

## 1. The 4-tier hierarchy (canonical statement)

| Tier | Content | Where it lives | Visible on |
|---|---|---|---|
| **1** | Symbolic equivalence / shorthand compositional reading | Chain registry (`freestyleSymbolicEquivalences.ts`) + alias governance (`freestyleAliasGovernance.ts`) | Dictionary cards `≡` lines; landing card titles |
| **2** | Full operational notation | DB `freestyle_tricks.operational_notation` (parser-derived) for compounds; `CoreTrickSpec.operationalNotation` (curator-authored, post-NCR-1) for atoms | Dictionary cards (muted op-notation tokens when no Tier 1); landing core trick paragraphs (primary, after NCR-1) |
| **3** | Silent fallthrough | -- | Card renders title + ADD chip only; absence is honest |
| **4** | Executable accounting | `CORE_TRICK_SPEC.equivalences[1]` (atoms); `FREESTYLE_ADD_ANALYSIS_CONTENT.derivation` (general) | `/freestyle/add-analysis` (educational); future trick-detail collapsed `<details>` |

### 1.1. The precedence rule

For any given trick on any public surface, render the HIGHEST-tier
content available. Lower tiers are suppressed unless the surface is
explicitly educational (Tier 4 home).

- A trick with chain-registry reading → Tier 1 wins; no Tier 2.
- A trick with operational notation but no chain reading → Tier 2.
- A trick with neither → Tier 3 silent.
- Tier 4 accounting prose appears ONLY on `/freestyle/add-analysis`
  + (future) trick-detail collapsed disclosure. Never on browse
  cards. Never on landing primary surfaces.

### 1.2. Why a hierarchy

Three notation systems coexist by design:

- Symbolic compositional (Tier 1) -- elegant, shorthand, memory-
  friendly for known compounds.
- Operational (Tier 2) -- explicit structural decomposition; teaches
  the mechanic.
- Accounting (Tier 4) -- demonstrates ADD math; useful when learning
  the scoring system.

Each serves a different audience. The hierarchy ensures the user sees
exactly the right one for the surface they're on:

- Browse / dictionary cards: surface the MOST canonical reading
  available.
- Landing core tricks: surface the curator's most teachable form
  (op-notation post NCR-1).
- Detail pages: future tier-4 collapsed disclosure when the user
  opts in.
- `/freestyle/add-analysis`: tier-4 is the page's purpose.

---

## 2. Per-surface application

### 2.1. Dictionary trick cards (`?view=*` browse views)

Partial: `src/views/partials/dictionary-trick-card.hbs`.

Tier 1: `tokenizedEquivalences` non-empty → renders chain reading.
Tier 2: `operationalNotation` non-null → renders op-notation tokens.
Tier 3: neither → silent.
Tier 4: NEVER.

Status: ALIGNED post-CR-5 of the dictionary-coherence wave. No
changes needed.

### 2.2. Landing Core Tricks grid

Partial: `src/views/partials/core-tricks-grid.hbs`.

Pre-wave state:
- Renders both `equivalences[0]` (prose) and `equivalences[1]`
  (accounting) as `≡` lines. Two tier-mixed readings on equal
  hierarchy.
- `symbolicNotation` from DB column null/sparse → no op-notation
  visible.

Post-NCR-1 + NCR-2 state:
- Tier 1: descriptive prose preserved (`equivalences[0]`) as
  `≡ <prose>` -- HEADLINE.
- Tier 2: operational notation (`CoreTrickSpec.operationalNotation`)
  → `<p class="core-trick-notation">` -- STRUCTURAL anchor.
- Tier 4: `equivalences[1]` accounting prose REMOVED from this
  surface (pruned in shaping helper per NCR-2 Path B).

Tier 4 disclosure on this surface: deferred. A future enhancement
could add a small "Show ADD math" toggle on each card; out of scope
this wave.

### 2.3. Trick detail pages (`/freestyle/tricks/:slug`)

Renderer: `src/views/freestyle/trick-shell.hbs` (+ children).

Current state: shows trick name, family, ADD, related tricks,
operational notation, equivalent readings, structural decomposition
(collapsed by default). No accounting prose today.

Post-wave contract:
- Tier 1 + Tier 2 render their existing form.
- Tier 3 silent (already).
- Tier 4 (future): a collapsed `<details>` block titled "ADD math"
  or similar, sourced from a per-trick accounting derivation when
  curator-authored. NOT in scope this wave; documented here so a
  later slice has a clear contract.

### 2.4. `/freestyle/add-analysis`

Template: `src/views/freestyle/add-analysis.hbs`.

Tier 4 is the entire page's purpose. Worked examples render with
`derivation` strings showing accounting math. Stays UNCHANGED.

### 2.5. Glossary `/freestyle/glossary`

Content per section §1-§11. The relevant sections (§3 dex direction,
§7 ops notation) render the operational notation tokens and
compositional readings as educational content. The tiers apply to
content type, not to glossary's pedagogical surface.

The accounting layer (Tier 4) does NOT appear on glossary; glossary
is symbolic/operational/pedagogical.

### 2.6. Future surfaces

When new public surfaces are added (e.g. future executable-accounting
UI), they must declare their tier alignment up front. Default: the
new surface inherits the dictionary-card 2-tier behavior unless
curator approves Tier 4 inclusion explicitly.

---

## 3. Contract enforcement (test plan)

The contract is load-bearing across the public surfaces. NCR-3
recommends pinning it via additional integration tests so future
slices don't drift.

Three test groups:

### 3.1. Tier-suppression contract on dictionary cards

Already exists in `freestyle.dictionary-trick-card.routes.test.ts`
post-CR-5: tests that "Notation pending" prose + `coreAtomLabel`
prose do not render on cards.

NCR-3 addition: add a contract test asserting that on every browse
view (`?view=add`, `family`, `movement-system`, `topology`,
`category`), NO Tier-4 accounting prose patterns render:

- `xbody\(\d`
- `dex\(\d`
- `stall\(\d`
- `(?:=|&#x3D;) \d ADD` (accounting result form)

A regex sweep per view; passes when zero matches.

### 3.2. Landing core tricks tier contract

Post-NCR-1 + NCR-2 land, add a test asserting:

- Each of the 12 atom cards renders its curator-authored
  `operationalNotation` string verbatim (Tier 2 visible).
- No Tier-4 accounting prose patterns appear in the Core Tricks
  grid section (the patterns from §3.1 above).
- The descriptive prose `equivalences[0]` remains visible (Tier 1
  on this surface).

### 3.3. Educational surface preservation

Confirm `/freestyle/add-analysis` still renders the 17 derivation
strings (existing tests in `freestyle.add-analysis.routes.test.ts`).
No change; just confirm the wave doesn't accidentally regress them.

---

## 4. Recommended approach

### 4.1. Contract documentation

This doc itself is the contract. Reference it in:

- `src/views/partials/dictionary-trick-card.hbs` docstring (already
  references the 2-tier scheme post-CR-5; extend reference if
  needed).
- `src/views/partials/core-tricks-grid.hbs` docstring (add a
  reference to the 4-tier contract).
- Service shaping helpers `shapeCoreTrickCard()` and the dictionary
  card shaping path (link via JSDoc).

### 4.2. Test contract pinning

Add or update integration tests per §3 above. Two test files
affected: `freestyle.portal.routes.test.ts` (landing) and
`freestyle.dictionary-trick-card.routes.test.ts` (browse views).

### 4.3. Coupling with prior NCRs

- NCR-1 supplies Tier 2 content on landing.
- NCR-2 prunes Tier 4 leak on landing.
- NCR-3 codifies that the above is correct and pins it via tests.

NCR-3's test-contract slice can land after NCR-1 + NCR-2; it
explicitly tests the post-NCR-1 + NCR-2 state.

---

## 5. Implementation sketch

NOT actual code; enough detail to scope a slice.

### 5.1. Files touched

| File | Change |
|---|---|
| `src/views/partials/core-tricks-grid.hbs` | Docstring extension referencing the 4-tier contract |
| `src/views/partials/dictionary-trick-card.hbs` | Docstring extension (or no change if already comprehensive) |
| `tests/integration/freestyle.portal.routes.test.ts` | Add Tier-4-prose-absence test for Core Tricks grid; add Tier-2 op-notation contract per atom |
| `tests/integration/freestyle.dictionary-trick-card.routes.test.ts` | Add per-view Tier-4-prose-absence test (existing test asserts on "Notation pending"; extend to cover accounting patterns) |
| `tests/integration/freestyle.add-analysis.routes.test.ts` | Regression-confirm; no new assertions needed unless drift surfaces |

### 5.2. No source-code changes

NCR-3 is a contract + test slice, not a code change. The contract
already reflects code behavior after NCR-1 + NCR-2 land. NCR-3's
implementation is purely a test-pinning + docstring exercise.

### 5.3. Order of operations

1. NCR-1 + NCR-2 land first (one atomic slice).
2. NCR-3's tests land after, confirming the post-NCR-1 + NCR-2
   state holds.

If NCR-3 lands before NCR-1 + NCR-2, the Tier 2 assertions for
landing core tricks would fail (no op-notation rendered yet).
Sequence per locked priority.

---

## 6. Curator decision points

- **(DECIDED at session-level)** Pin contract via additional tests
  (NCR-3 separate slice).
- **(DEFER)** Whether to add a "show accounting" toggle on landing
  core tricks for Tier 4 disclosure. Out of scope; potential future
  enhancement.
- **(DEFER)** Whether to add Tier 4 disclosure to trick-detail
  pages. Documented as future surface; implementation curator-paced.
- **(DEFER)** Whether to expose Tier 4 (accounting) on dictionary
  cards for compounds via a collapsed disclosure. Currently NO;
  doctrine D restraint applies.

---

## 7. Risks and mitigations

### 7.1. Risk: Future slices add Tier 4 prose to browse cards

Mitigation: NCR-3 test contract catches the regression. The
no-accounting-prose assertion sweeps the rendered output and fails
loudly on first leak.

### 7.2. Risk: Curator wants to add a custom 5th tier

Mitigation: 4 tiers is curator-locked (brief E3). A future addition
would require explicit curator decision; the contract can extend
without breaking.

### 7.3. Risk: Test contract over-constrains future authoring

Mitigation: contract asserts ABSENCE of accounting prose patterns,
not presence of specific Tier 1/2 content. Adding new chain
registry entries or new op-notation strings doesn't violate the
contract. The contract guards against accounting prose only.

### 7.4. Risk: Test patterns false-positive on legitimate content

Mitigation: the accounting-prose patterns (`xbody\(\d`, `dex\(\d`,
etc.) are implementation language specific to accounting
derivations. No legitimate dictionary content uses these patterns.
Validated against current corpus.

---

## 8. Out of scope

- Adding Tier 4 to additional surfaces.
- Removing accounting from `/freestyle/add-analysis`.
- New notation systems (5th tier).
- Schema columns for tier metadata.
- Renderer changes (NCR-3 is contract + test, not code).
- The shaping helper changes for NCR-1 + NCR-2 (those land
  separately).

---

## 9. Cross-references

- `FINAL_RECOMMENDATION.md` -- NCR-3; the contract surfaced here.
- `core_trick_notation_completion_audit.md` -- NCR-1; supplies
  Tier 2 content on landing.
- `compound_notation_strategy.md` -- NCR-2; prunes Tier 4 leak
  from landing.
- `landing_density_cleanup.md` -- NCR-4 + NCR-5; landing reorg;
  unrelated to tier hierarchy contract.
- `family_ordering_audit.md` -- NCR-6; audit only.
- Skill `footbag-freestyle-dictionary` doctrine A (four-layer
  ontology separation). The 4 tiers here are RENDERING tiers per
  surface; doctrine A's 4 ontology layers (canonical names /
  symbolic decomposition / glossary pedagogy / embodied movement
  analogy) are different but compatible. Both apply simultaneously.

---

## 10. Summary

Four notation tiers exist: symbolic equivalence, operational
notation, silent, executable accounting. The hierarchy enforces
"highest available tier wins" on every public surface. Browse
cards: tiers 1-3 only. Landing core tricks: tiers 1-2 only post
NCR-1 + NCR-2. Detail pages: tiers 1-3 today; tier 4 deferred
disclosure surface. `/freestyle/add-analysis`: tier 4 is the page.
Contract enforcement via additional integration tests; no source
code changes. Brief E3 satisfied; foundation for E4 layering held.
