# Landing Density Cleanup (NCR-4 + NCR-5, brief E5 + E6)

Reorganizes the `/freestyle` landing surface to lead with orientation
before teaching the symbolic vocabulary; condenses vertical spacing;
expands the Trick Dictionary portal-card body to preview the six
perspectives.

Supports `FINAL_RECOMMENDATION.md` NCR-4 + NCR-5. Bakes in curator
decisions #1 and #2 locked 2026-05-18:
- Decision #1 (E5 Reading A): move the "Language of Freestyle Footbag"
  teaching block BELOW Featured and ABOVE Core Tricks.
- Decision #2 (E6 perspective list): include "Operators & Components"
  as supporting vocabulary (not as a dictionary browse mode).

---

## 1. Current state (recon-grounded)

`src/views/freestyle/landing.hbs` section order today:

| # | Section | Class / Anchor | Line range |
|---|---|---|---|
| 1 | Hero + intro + autoplay demo | `.freestyle-language-intro` | 26-40 |
| 2 | Jump nav | `.page-jump-nav` | 45-50 |
| 3 | Portal cards (8 cards: Tutorials, Glossary, Operators, Dictionary, Records, Competition, History+ADD, Insights) | `.card-grid-2col` | 56-172 |
| 4 | Featured demonstrations | `.freestyle-featured` (`#featured`) | 179-194 |
| 5 | Core Tricks grid (12 atoms) | `.freestyle-core-tricks` (`#core-tricks`) | 201-206 |
| 6 | Basic Components (Contact, Set, Dex, Spin, Duck, Delay) | `.freestyle-basic-components` (`#basic-components`) | 210-228 |
| 7 | Operator Board | operator-board partial | 237 |
| 8 | Get Started tiles | `.get-started-tiles` | 245-255 |

The "Language of Freestyle Footbag" teaching block, per the curator's
brief framing, comprises sections 6 + 7 (Basic Components + Operator
Board). The class `.freestyle-language-intro` at the hero (section 1)
is the section's introductory lede, not the teaching content itself.

---

## 2. Problem evidence (brief-validated)

Brief E5 says:

> The Language of Freestyle Footbag section appears too early and
> visually dominates.

The brief notes the teaching content (Basic Components + Operator
Board) currently sits AFTER Core Tricks. Visually, by the time the
user has scrolled past the portal cards + Featured + Core Tricks grid,
they encounter Basic Components and Operator Board. These sections
ARE structurally rich and visually weighty.

Brief E5 mandate:

> Move BELOW the menu/navigation cards, BELOW Featured, ABOVE Core
> Tricks.

Reading A (locked decision #1): place the teaching block (Basic
Components + Operator Board) BETWEEN Featured (section 4) and Core
Tricks (section 5).

The pedagogical logic: portals teach where to go; Featured shows
examples; THEN the user learns the structural vocabulary; THEN the
12 atom cards arrive as the synthesis of that vocabulary.

Brief also calls out density:

> condense vertical spacing throughout: Core Tricks, Basic Components,
> Operators. Improve density and readability.

---

## 3. Reading A vs Reading B (decided)

Recapping the curator-locked decision (decision #1):

| | Reading A (LOCKED) | Reading B (rejected) |
|---|---|---|
| Teaching block (Components + Operators) | Above Core Tricks | Below Core Tricks (status quo) |
| Cognitive flow | Portals → Featured → vocabulary primer → atoms (synthesis) → Get Started | Portals → Featured → atoms → vocabulary primer (debrief) → Get Started |
| Rationale | Lead with orientation; teach structure THEN show examples synthesizing the structure | Lead with concrete examples; debrief with the abstract vocabulary |
| Decision | YES per curator (decision #1) | -- |

---

## 4. Recommended approach

### 4.1. Section reorder

Move sections 6 + 7 (Basic Components + Operator Board) to sit
between Featured (section 4) and Core Tricks (section 5). New order:

| # | Section | Notes |
|---|---|---|
| 1 | Hero + intro + autoplay demo | UNCHANGED |
| 2 | Jump nav | UNCHANGED |
| 3 | Portal cards | UNCHANGED |
| 4 | Featured demonstrations | UNCHANGED |
| **5** | **Basic Components** | **MOVED UP from line 210-228** |
| **6** | **Operator Board** | **MOVED UP from line 237** |
| 7 | Core Tricks grid | Now reads as synthesis after vocabulary primer |
| 8 | Get Started tiles | UNCHANGED |

Implementation: template-only cut-and-paste in `landing.hbs`. The
sections are independent (no inter-section data dependencies); the
move is mechanically safe.

Jump nav anchors (`#core-tricks`, `#basic-components`, `#featured`,
etc.) are URL-stable; they continue to resolve to the same content
regardless of source order. No URL-bound regression.

### 4.2. Vertical-spacing density cleanup

Brief E5: "condense vertical spacing throughout: Core Tricks, Basic
Components, Operators."

Current CSS likely has generous `margin-top` / `margin-bottom` /
`padding` values on these sections (typical landing-page treatment).
Recommendation: tighten by roughly 25-35% across:

- `.freestyle-core-tricks` and `.freestyle-core-tricks > .section-heading`
- `.freestyle-basic-components` and its sub-rows
- `.operator-board` partial's outer container

Specific tightening targets (curator-paced; exact values per implementation):

- Section top margin: ~32px → ~22px
- Section bottom margin: ~40px → ~28px
- Card-grid gap within Core Tricks: ~16px → ~12px
- Basic Components row padding: ~14px → ~10px

These are guidelines. The implementer audits the rendered surface
at typical viewport widths and tunes. No JS changes.

### 4.3. Dictionary portal card -- expanded body (NCR-5 + E6)

Current portal card body (per the brief):

> Browse by ADD bucket, by family, or by the set/modifier each
> trick uses.

Expand to preview all browse perspectives. Per decision #2, include
Operators & Components but frame as "supporting vocabulary," not as a
dictionary browse mode.

Recommended new body copy (curator finalizes wording):

> Browse the dictionary by **ADD** (difficulty progression), by
> **Family** (canonical lineages), by **Movement System** (operator
> grammar), by **Movement Neighborhoods** (observational similarity),
> or scan **Observed Tricks** (community-named, pre-canonical). The
> dictionary uses **Operators & Components** -- sets, dexes, surfaces,
> body modifiers -- as supporting vocabulary across every browse mode.

Five browse perspectives in the bolded enumeration; Operators &
Components appears as a sixth distinct paragraph-tail framed as
vocabulary, not a browse mode. Matches the decision #2 framing
exactly.

Authoring location: `freestyleLandingContent.ts` (the portal cards
content array) or wherever the Dictionary portal card body lives.
Audit during implementation to confirm path.

### 4.4. Operator card retention

Per decision #2: Operators & Components retains its own portal card
on the landing (the existing "Operators" card in the 8-card grid).
The Dictionary card mentions Operators as supporting vocabulary;
the Operators portal card remains the primary entry point.

No removal; no demotion of the Operators portal card. The mention in
the Dictionary card is a vocabulary acknowledgment, not a replacement.

### 4.5. What stays unchanged

- Hero section + intro + autoplay demo.
- Jump nav.
- All 8 portal cards' presence + ordering.
- Featured demonstrations block.
- Core Tricks grid CONTENT (the 12 atoms; NCR-1 + NCR-2 separately
  modify per-card rendering).
- Get Started tiles.
- All routing; all anchors; all URLs.

---

## 5. Implementation sketch

NOT actual code; enough detail to scope a slice.

### 5.1. Template changes

`src/views/freestyle/landing.hbs`:

- Cut sections 6 + 7 (Basic Components + Operator Board; lines
  ~210-237) and paste before Core Tricks (line 201).
- Preserve all internal markup; this is a pure section-reorder.

### 5.2. Content-module change

`src/content/freestyleLandingContent.ts` or wherever the portal
cards' content lives (audit during implementation):

- Update the Dictionary portal card body string to the expanded
  copy in §4.3 above.
- Curator-paced; final wording finalizes during the implementation
  slice.

### 5.3. CSS density tuning

`src/public/css/style.css`:

- Tighten margins / padding on `.freestyle-core-tricks`,
  `.freestyle-basic-components`, `.operator-board` containers per
  §4.2 guidelines.
- Audit rendered surface at 1280px, 900px, 480px breakpoints; no
  horizontal overflow; no layout collapse.
- No new CSS classes; modifications to existing rules only.

### 5.4. Tests

- Jump nav anchor tests (if any) -- continue to pass; anchors
  unchanged.
- Section ordering tests -- add to `freestyle.portal.routes.test.ts`
  if not present. Assert order: Featured → Basic Components →
  Operator Board → Core Tricks via `indexOf` checks.
- Dictionary portal card copy test -- assert new body string is
  rendered.
- Existing tests on portal-card grid + Featured + Core Tricks
  internals continue to pass; they don't depend on section ordering.

### 5.5. Layout review at narrow widths

Per add-public-page skill step 6 (responsive review):

- 1280px desktop: section ordering reads naturally; vertical
  spacing tightened but not cramped.
- 900px tablet: portal cards stack to 2 columns (existing pattern);
  Basic Components rows remain horizontal or stack per existing
  CSS; Operator Board partial handles tablet width.
- 480px phone: every flex row / multi-column layout stacks; tight
  spacing remains readable, not collapsed.

Audit during implementation; tune as needed.

---

## 6. Curator decision points

- **(DECIDED at session-level)** Reading A: teaching block above
  Core Tricks.
- **(DECIDED at session-level)** Operators & Components in dictionary
  portal card body as supporting vocabulary, not browse mode.
- **(DEFER)** Final body copy wording for Dictionary portal card
  (§4.3 is the preliminary curator draft).
- **(DEFER)** Exact margin/padding tightening values. Implementation
  decides at view time; curator approves visually post-deploy.
- **(DEFER)** Whether to add a small "you are here" indicator on the
  landing's jump nav highlighting current scroll position. Out of
  scope; potential future enhancement.
- **(DEFER)** Whether to demote the Operators portal card now that
  it's mentioned in the Dictionary card. Recommend NO -- the
  Operators card has its own pedagogical home; mention in Dictionary
  card is acknowledgement, not replacement.

---

## 7. Risks and mitigations

### 7.1. Risk: Section reorder breaks visual rhythm at specific widths

Mitigation: audit at 1280 / 900 / 480 breakpoints during
implementation. The sections are visually independent; the reorder
should be smooth.

### 7.2. Risk: User memory / muscle memory of current landing order

Mitigation: portal cards (the navigational layer) and jump nav
remain UNCHANGED. The only reorder is the teaching block (Basic
Components + Operator Board). Casual users navigating via portals
or jump nav are unaffected.

### 7.3. Risk: Dictionary portal card body grows too long

Mitigation: §4.3 copy is two sentences; comparable to other portal
card bodies. If visually too dense, tighten by removing one
parenthetical descriptor per perspective (e.g. drop "(difficulty
progression)" if needed).

### 7.4. Risk: CSS density tightening goes too far; pages feel cramped

Mitigation: incremental change with viewport audit at each
breakpoint. Targets are guidelines (~25-35%); implementer dials in
the actual values. Easy to revert if over-tight.

### 7.5. Risk: Featured demo block visually overshadows the teaching block when sandwiched between

Mitigation: the Featured block (autoplay demo video) is bounded by
its own container; the teaching block below it begins a clearly
distinct section. CSS section-heading style + spacing tunings can
sharpen the boundary.

### 7.6. Risk: Curator decides post-deploy that Reading A was wrong

Easy revert: template cut-and-paste is mechanically reversible. CSS
density tunings are revertable. Decision can flip back to Reading B
in a single PR.

---

## 8. Out of scope

- Hero section copy or imagery.
- Portal card grid (8 cards, current ordering).
- Featured demonstrations block content.
- Core Tricks grid per-card rendering (NCR-1 + NCR-2 handle that).
- Operator Board partial internals.
- Get Started tiles.
- Routing or URL changes.
- New portal cards or section additions.
- Removing the Operators portal card (decision #2 keeps it).

---

## 9. Cross-references

- `FINAL_RECOMMENDATION.md` -- NCR-4 + NCR-5; decisions #1 + #2.
- `core_trick_notation_completion_audit.md` -- NCR-1; the same
  surface (Core Tricks grid) gets new operational notation content
  in a separate slice.
- `compound_notation_strategy.md` -- NCR-2; the same surface (Core
  Tricks grid) sheds its accounting prose in a separate slice.
- `public_notation_render_hierarchy.md` -- NCR-3 contract; this
  doc's section-reorder doesn't affect the rendering hierarchy.
- Skill `footbag-freestyle-dictionary` doctrine D (restraint);
  density cleanup preserves restraint; no new affordances added.

---

## 10. Summary

Move Basic Components + Operator Board UP between Featured and
Core Tricks per Reading A (decision #1). Tighten vertical spacing
on the three teaching sections per brief E5 guidance. Expand the
Dictionary portal card body to preview the five browse perspectives
plus Operators & Components as supporting vocabulary (decision #2).
Pure template-reorder + CSS tightening + content-module copy edit;
no schema, no route changes, no new affordances. Brief E5 + E6
satisfied.
