# SYMBOLIC_SUBSYSTEM_AUDIT — Per-Surface Inventory

UX-CONSOLIDATION-1 Task A. Inventory of every symbolic-layer surface shipped in UX-SHIP-1 Phases 4-7. Identifies visual rhythm, interaction pattern, density, educational role, and redundancy.

**Status:** audit only. No implementation changes in this document.

**Date:** 2026-05-12

---

## 1. Surface inventory

Four primary surfaces ship in UX-SHIP-1; one supporting service module powers all four.

| # | Surface | Route | Phase | Files |
|--:|---|---|---|---|
| 1 | Related Topology panel | embedded on 8 trick-detail pages | 4 | `partials/symbolic-related-topology.hbs` + shaping in `symbolicTrickPanels.ts` |
| 2 | Walking-family Progression page | `GET /freestyle/progression/walking-family` | 5 | `freestyle/walking-progression.hbs` + `symbolicProgressions.ts` |
| 3 | Spinning Modifier-family page | `GET /freestyle/modifier/spinning` | 6 | `freestyle/modifier-family.hbs` + `symbolicModifierEducation.ts` |
| 4 | Glossary Connective panels | `/freestyle/glossary` §13 | 7 | `freestyle/glossary.hbs` §13 + `symbolicGlossaryPanels.ts` |

Service layer: `symbolicGrammarService.ts` (CSV-staging adapter; serves all four surfaces).

---

## 2. Per-surface visual rhythm

### Surface 1 — Related Topology panel (on 8 trick pages)

**Layout:** section inside `trick-shell.hbs`, between canonical Related Tricks (`<h2>`) and Parallels.
**Heading:** `<h3>` — subordinate to canonical `<h2>` family/related-tricks section.
**Width:** flows full content-column width inside the trick page.
**Density:** **light.** Up to 6 trick chips (capped), each with ADD value + hashtag + name. ~60-100 lines of rendered HTML.
**Palette:** muted background `#fafaf7`, 3px left border `#d6d2c4`.
**Badge:** `observational` chip inline with heading.
**Footer:** disclaimer prose (1 line).

### Surface 2 — Walking-family Progression page (full page)

**Layout:** dedicated page; hero + single section.
**Heading:** page `<h1>` + section `<h2>` + per-step name (linked).
**Width:** `max-width: 920px`.
**Density:** **medium.** 7 step cards stacked vertically, each ~150-200 words of rationale + symbolic note + glossary links.
**Palette:** same muted palette; anchor step (step 1) gets `#f5f1e3` background + `#b8b29a` border accent.
**Badge:** in `<h2>` alongside section heading.
**Footer:** disclaimer prose (1 line) at bottom of section.

### Surface 3 — Spinning Modifier-family page (full page)

**Layout:** dedicated page; hero + 6 sub-sections (mechanical lead / anchor sentence / diagram placeholder / confusions / progression / cross-base / related modifiers).
**Heading:** page `<h1>` (with badge inline) + section `<h2>` × 5.
**Width:** `max-width: 920px`.
**Density:** **high.** Most information-dense surface in the subsystem. Six sections; each section has its own internal structure (confusion cards, progression cards, cross-base list, etc.).
**Palette:** muted background per section block; anchor-sentence elevated with stronger warm-tone border `#b8b29a`; diagram placeholder with dotted border.
**Badge:** in `<h1>` (page-level, not section).
**Footer:** disclaimer prose at end (1 sentence).

### Surface 4 — Glossary Connective panels (section 13 of glossary page)

**Layout:** section inside existing glossary page; 2-column grid on desktop, 1-column on mobile.
**Heading:** section `<h2>` (with badge inline) + per-panel `<h3>`.
**Width:** flows full glossary page width; grid gives each panel ~50% width.
**Density:** **medium-high in aggregate.** Six panels × 4 internal sub-sections each = 24 mini-blocks on one page section.
**Palette:** same muted palette as Surface 1 (panel-card pattern).
**Badge:** one instance in section heading; not per-panel.
**Footer:** disclaimer prose at end of section.

---

## 3. Per-surface interaction patterns

| Surface | Click target | Destination |
|---|---|---|
| 1 (Related Topology panel) | trick name | `/freestyle/tricks/{slug}` (canonical trick page) |
| 1 | hashtag | `/freestyle/tricks/{slug}` (same) |
| 2 (Walking Progression) | step name | `/freestyle/tricks/{slug}` |
| 2 | glossary links | `/freestyle/glossary` (bare; no fragment) |
| 3 (Spinning Modifier) | progression step name | `/freestyle/tricks/{slug}` |
| 3 | cross-base example name | `/freestyle/tricks/{slug}` |
| 3 | "Browse the glossary →" | `/freestyle/glossary` |
| 4 (Glossary Connective) | trick chip | `/freestyle/tricks/{slug}` |
| 4 | "Learn more about Spinning →" (spinning panel only) | `/freestyle/modifier/spinning` |

**Observation:** every surface's clicks lead to either (a) canonical trick page, (b) bare glossary page, or (c) the single modifier-family page (spinning). NO surface currently links to another symbolic page directly except the glossary→spinning deep-link. Symbolic surfaces are largely siloed.

---

## 4. Per-surface density level

| Surface | Density | Lines of rendered HTML (approx.) |
|---|---|--:|
| 1 Related Topology panel | light | 60-100 |
| 2 Walking Progression page | medium | 500-650 |
| 3 Spinning Modifier page | high | 700-900 |
| 4 Glossary Connective panels (section only) | medium-high | 400-550 |

Glossary connective panels add ~400-550 lines to an already-long glossary page (12 sections preceded; total page now ~1100-1300 rendered lines). **Highest cumulative-density surface = glossary page** post-Phase-7.

---

## 5. Per-surface educational role

| Surface | Teaches | When useful |
|---|---|---|
| 1 Related Topology panel | "tricks that share this mechanical shape" | when reading any of 8 specific trick pages; passive discovery |
| 2 Walking Progression page | "how the walking-family compounds build atop butterfly" | when ready to learn the walking family as a unit |
| 3 Spinning Modifier page | "what spinning IS physically + how it composes" | when curious about a specific modifier; active study |
| 4 Glossary Connective panels | "where this term appears in practice" | when reading glossary; lateral exploration |

Surface 3 (modifier page) is the deepest teaching surface; surfaces 1 + 4 are connective; surface 2 is a curated chain.

---

## 6. Redundancy analysis

### Section header naming overlap

Four different headings surface trick-lists across the subsystem:

| Heading | Surface | What it lists |
|---|---|---|
| "Related Tricks" | trick page (canonical, NOT symbolic) | same-family IFPA-resolved siblings |
| "Related topology tricks" | trick page (symbolic Surface 1) | same-topology siblings |
| "The same idea on other bases" | spinning page (Surface 3) | spinning + other-base examples |
| "Used in these tricks" | glossary panel (Surface 4) | tricks containing this glossary term |

**Verdict:** Each heading is contextually distinct (different lists, different reasoning). No genuine redundancy — but a casual reader could feel "I've seen this kind of list before." Worth keeping headings semantically distinct; not worth flattening.

### Disclaimer footer prose variation (4 distinct versions)

| Surface | Footer prose |
|---|---|
| 1 | "Observational symbolic-grammar layer. Topology groups describe mechanical similarity and may cross-cut the IFPA trick family. Canonical relating lives in the Related Tricks section above." |
| 2 | "Observational symbolic-grammar layer. This progression surfaces mechanical similarity across the butterfly-wing topology. It does not change canonical IFPA family classifications." |
| 3 | "Observational symbolic-grammar layer. This page is educational and describes the {modifier} modifier physically and mechanically. It does not change canonical IFPA family classifications or modifier-table ADD rules." |
| 4 | "Observational symbolic-grammar layer. These panels surface mechanical and educational connections; the canonical glossary sections above are the authoritative reference for terminology." |

**Verdict:** Each begins with the same anchor phrase ("Observational symbolic-grammar layer.") then adds context-specific prose. The common-prefix-plus-context pattern is GOOD; the variations after the prefix are contextual not redundant. **No change recommended** to the structure; possible light prose normalization (see SYMBOLIC_VISUAL_CONSOLIDATION.md).

### Badge tooltip variation (2 versions)

| Tooltip | Surfaces using it |
|---|---|
| "Observational symbolic-grammar layer — does not change IFPA family classifications" | 1, 2, 3 |
| "Observational symbolic-grammar layer — supplementary, non-canonical" | 4 |

**Verdict:** Glossary panel's tooltip diverges. The Glossary tooltip phrasing ("supplementary, non-canonical") is arguably more accurate for the glossary context (canonical glossary content sits ABOVE the panels, not on a sibling layer). The trick-page / progression / modifier tooltip phrasing ("does not change IFPA family classifications") is more accurate for surfaces sitting near the IFPA family taxonomy. **Light cleanup recommended:** normalize both tooltips to a single tooltip that covers both meanings; e.g., "Observational symbolic-grammar layer — supplementary; does not change canonical classifications."

### CSS class duplication

| Pattern | Reused across |
|---|---|
| `background: #fafaf7; border-left: 3px solid #d6d2c4` | `.symbolic-related-topology`, `.symbolic-walking-progression .progression-step`, `.glossary-connective-panel`, `.symbolic-modifier-family .confusion-card`, `.symbolic-modifier-family .diagram-placeholder` |
| `padding: 12px 14px` / `12px 16px` / `14px 18px` | 5+ rules with slight variation |
| `.symbolic-layer-badge` + `.symbolic-layer-footer` | shared as common rules (correctly factored) |

**Verdict:** Duplication of background/border-left declarations across 5+ rules. Worth refactoring into a shared `.symbolic-card` mixin or base class. See SYMBOLIC_VISUAL_CONSOLIDATION.md for the consolidation proposal.

---

## 7. Surface-by-surface summary table

| Surface | Heading level | Density | Educational role | Discoverability | Redundancy risk |
|---|---|---|---|---|---|
| 1 Related Topology panel | h3 (subord.) | light | passive lateral discovery | only on 8 trick pages; no nav | low |
| 2 Walking Progression page | h2 (page) | medium | curated chain study | URL-only; no nav entry | none |
| 3 Spinning Modifier page | h2 (page) | high | active modifier study | one glossary deep-link only | none |
| 4 Glossary Connective panels | h2 (section) | medium-high in aggregate | lateral exploration | reachable only by scrolling glossary to §13 | none |

---

## 8. Cross-references

- Subsystem audit findings drive SYMBOLIC_NAVIGATION_COHERENCE.md (Task B)
- CSS / terminology audit drives SYMBOLIC_VISUAL_CONSOLIDATION.md (Task C)
- Density observations drive SYMBOLIC_DENSITY_AUDIT.md (Task D)
- All four feed LAYER1_SYMBOLIC_INTEGRATION.md (Task E)
- Final recommendation in DELIVERABLES_AND_RECOMMENDATION.md (Task G)
