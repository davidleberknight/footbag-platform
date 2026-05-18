# /freestyle landing — reorganization plan

Lightweight planning doc per the Freestyle Public Coherence Wave brief
(2026-05-18). Implementation deferred; this doc is review-ready before
any template edits.

## Problem

The current `/freestyle` landing page interleaves orientation, advanced
symbolic detail, and educational navigation. Beginners hit:

1. Hero (orientation) ✓
2. Top-reference-jump nav (duplicates portal-card CTAs below — Dave audit #16)
3. Basic Components (dense symbolic teaching)
4. Core Tricks grid (with newly-added foundational formulas)
5. Operator Board (densest content on the page)
6. Demonstrations (featured media)
7. Portal cards (Tutorials, Trick Dictionary, Glossary, ADD Analysis,
   Combo Analysis, History, Records)

Order issues:
- Most educational/navigational surfaces sit BELOW the densest
  operator/symbolic material.
- Top-reference-jump nav duplicates the portal cards.
- A beginner scrolling for "where do I start?" hits Operator Board
  before any tutorial link.

## Goal

Progressive deepening: orientation/identity/navigation first; symbolic
detail later. Do NOT reduce the page to a pure portal — retain
movement-language identity, conceptual teaching role.

## Desired hierarchy

```
TOP:
  Hero (unchanged)
  Concise movement-language framing (1 short paragraph)
  Featured demonstration (single demo, moved up)
  Immediate educational nav (portal cards)

EARLY:
  Tutorials & Learning, Trick Dictionary, Glossary,
  ADD Analysis, Combo Analysis, History, Records

MID:
  Core Tricks grid (with foundational ADD formulas)
  Basic Components (compact intro framing)

LOWER:
  Operator Board (full I/II/III tier breakdown)
  Demonstration archive (other curated media)
  Advanced movement-system framing
```

## Concrete moves

1. **Strip top-reference-jump nav band** (`landing.hbs:16-19`). The
   portal cards below carry the same Dictionary + Glossary CTAs.
   Removes duplicate CTAs per Dave audit #16.
2. **Move portal cards** (currently below operator board) to right
   after the hero + framing paragraph. They become the primary "where
   do I go?" answer for beginners.
3. **Promote one featured demonstration** (Sam Conlon / Tuan Vu /
   Scott Davidson — curator picks) to immediately after portal cards.
4. **Reorder middle section**: Core Tricks grid + Basic Components
   move below portal cards but above Operator Board. Basic Components
   stays compact (no Operator Board content folded in).
5. **Push Operator Board to LOWER section** (after Core Tricks). The
   full I/II/III tier table stays — just moved later in the scroll.
6. **Demonstration archive** (remaining curated media) lives below
   Operator Board.

## Stance on Dave audit #17

This plan keeps Basic Components + Core Tricks + Operator Board on the
landing page (counter to Dave's recommendation to strip them entirely).
The reorganization addresses the underlying complaint (too much
teaching detail too early) by reordering rather than removing.

## Doctrinal safety

- **Safe**: all moves are template/content reordering. No service
  changes, no Wave-2 commitments, no ontology touches.
- **Care**: the existing Core Tricks grid carries the newly-added
  foundational ADD formulas (2026-05-18 slice). Keep that pairing intact
  — the formulas are the central pedagogical payoff.
- **Care**: portal-card link list must stay in sync with the routes
  that exist. Verify `/freestyle/combo-analysis`, `/freestyle/history`,
  `/freestyle/records` still resolve before the move.

## Files affected

- `src/views/freestyle/landing.hbs` — section ordering
- `src/views/freestyle/partials/operator-board.hbs` — unchanged, just
  rendered later
- Tests: `tests/integration/freestyle.portal.routes.test.ts` likely has
  positional assertions; expect to update ordering checks
- `tests/integration/freestyle.presentation-hierarchy.routes.test.ts`
  may also pin ordering — verify

## Dependencies / blockers

- None blocking — pure template reorganization
- Coordinate with Dave's audit #16 fix (strip top-reference-jump nav)
  if not yet shipped
- Should land AFTER the 2026-05-18 foundational-formula slice that
  introduced ADD formulas on the Core Tricks grid (already shipped)

## Out of scope

- Dave audit #17 (strip teaching sections) — explicitly NOT adopting
- Glossary content changes (separate Phase B slice)
- Operator Board content edits (movement-language analogies for
  pixie/fairy/atomic/quantum — separate slice)
- Hero hero rewrite (orientation paragraph stays as-is unless trivially
  improved)

## Review approval

Approve specific moves above. Pre-implementation slice will produce a
concrete diff of `landing.hbs` for re-review before any template edit.
