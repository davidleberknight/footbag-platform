# Observational / un-curated layer — visibility + framing plan

Lightweight planning doc per the Freestyle Public Coherence Wave brief
(2026-05-18). Implementation deferred.

## Current state

Three distinct symbolic-grammar layers ship on freestyle surfaces, with
inconsistent visibility framing:

1. **Topology layer** (`/freestyle/tricks?view=topology`, "Movement
   Neighborhoods") — symbolic-grammar groupings cutting across
   families. Memory: 62 symbolic groups × 5 axes shipped under
   SYMBOLIC-GRAMMAR-2 (2026-05-12).
2. **Movement System layer** (`/freestyle/tricks?view=movement-system`)
   — 4-axis × 11-modifier pilot from Slices L1/L2.
3. **Connective-tissue panels** on individual trick-detail pages
   (`freestyleService.ts:2207` area) — symbolic adjacency rendering.

All three are derived from FootbagMoves-federation observation, not
IFPA-canonical taxonomy. The user-facing framing varies:

- Topology view: footer `tricks.hbs:249` says "Observational
  symbolic-grammar layer. These groupings surface body mechanics
  across families and do not override canonical IFPA family
  classifications."
- Movement System view: similar footer, separate wording
- Trick-detail panels: implicit (no consistent labeling)

## Problem

1. **Inconsistent labeling**. Users see "observational" / "symbolic" /
   "movement system" / "topology" / "Movement Neighborhoods" — five
   names for one underlying concept.
2. **Framing is in footers**. A user scrolls through symbolic groupings
   without context for what they're looking at; the "this is
   observational, not canonical" disclaimer arrives last.
3. **No standardized badge**. The four-layer separation forever-rule
   (canonical / educational / symbolic / operational) per memory
   `project_freestyle_federation` is mechanically clean but isn't
   surfaced in any user-facing visual treatment.

## Goal

Standardize a single user-facing label + visual badge for the
symbolic/observational layer across all surfaces. Promote framing
above the data, not below. Keep the four-layer separation invariant
intact (no canonical content gets re-labeled as observational; no
observational content gets promoted to canonical).

## Proposed shape

1. **Single label**: settle on one user-facing term. Three candidates:
   - **"Symbolic groupings"** — neutral, descriptive
   - **"Movement neighborhoods"** — already used for topology view;
     evocative but less precise
   - **"Observational layer"** — accurate to the four-layer ontology
     but jargon for beginners

   Recommendation: **"Symbolic groupings"** for user-facing label,
   with a parenthetical "(observational)" on first appearance per
   surface.

2. **Standardized header badge** on every symbolic-layer surface:
   ```
   [Symbolic groupings · observational]
     These groupings observe body-mechanic similarities across
     families. They do not override canonical IFPA family
     classifications. For the canonical structural source see
     [By family →].
   ```
   Same wording on `?view=topology`, `?view=movement-system`, and
   any trick-detail panel that surfaces symbolic adjacency.

3. **Visual consistency**: a single CSS class (e.g.
   `symbolic-layer-frame`) wrapping the badge + intro paragraph,
   applied uniformly across all three surfaces.

## Doctrinal safety

- **Forever-rule preserved**: the four-layer separation
  (canonical / educational / symbolic / operational) per
  `project_freestyle_federation` is the underlying contract. Surfacing
  the symbolic layer more clearly INCREASES visibility of that
  separation; it does not blur the layers.
- **Safe**: no data changes, no classification changes, no Wave-2
  commitments. Pure labeling + visual standardization.
- **Care**: any surface that currently labels symbolic-layer content
  ambiguously (e.g. mixed into family-view rendering without a
  disclaimer) needs the badge added. Audit all symbolic-layer render
  sites before implementing.

## Files affected

- `src/views/freestyle/tricks.hbs` — promote footer disclaimer to
  top header for `?view=topology` and `?view=movement-system`
- `src/views/freestyle/partials/` — possibly add a shared
  `symbolic-layer-badge.hbs` partial
- `src/public/css/style.css` — add `.symbolic-layer-frame` class
- Trick-detail surfaces that render connective-tissue panels — audit
  and add badge consistently
- Tests: pin the standardized label string + badge presence

## Dependencies

- Pairs with **movement-system-consolidation.md** (footer-to-top
  framing promotion)
- Pairs with **component-view-retirement.md** (one fewer symbolic-
  layer surface to label)

## Out of scope

- Adding new symbolic groupings beyond the existing 62 from
  SYMBOLIC-GRAMMAR-2
- Changing the four-layer ontology itself
- Promoting any observational reading to canonical status

## Review approval

Approve the user-facing label choice + badge wording. Pre-implementation
slice will produce template diffs + a CSS class proposal for re-review.
