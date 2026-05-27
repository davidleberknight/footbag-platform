# Movement System view — consolidation plan

Lightweight planning doc per the Freestyle Public Coherence Wave brief
(2026-05-18). Implementation deferred; this doc is review-ready before
any service or template edits.

## Current state

`/freestyle/tricks?view=movement-system` is one of seven view-toggle
modes on the trick dictionary (`tricks.hbs:60` link entry). It surfaces
the 4-axis × 11-modifier pilot from Slices L1/L2 (per memory
`project_freestyle_state`).

Current shape:
- 11 modifier cards, each linking to `?view=movement-system#{anchor}`
- An "observational symbolic-grammar layer" footer warns the grouping
  doesn't override canonical IFPA family classifications
  (`tricks.hbs:249`)
- The 4-axis framing (component / window / quality / motion?) is
  service-shaped but not visually tiered in the template

## Problem

Three coherence issues:

1. **Axis structure is invisible**. The 4-axis framing exists in
   service code but renders as a flat list of 11 modifier cards. A
   user can't tell which modifiers belong to which axis without
   reading the glossary §3 (where axes are explained).
2. **Observational framing is buried**. The "observational layer"
   footer appears only at the bottom of the view. Beginners reach the
   end without context for what they just scrolled past.
3. **Cross-link asymmetry**. Glossary §6 modifier cards link to
   `?view=component` (legacy view we're proposing to retire — see
   `component-view-retirement.md`). The Movement System view is a
   better destination; the cross-links should point here instead.

## Goal

Consolidate the 4-axis structure as the primary organizing principle
of `?view=movement-system`. Surface the axes visually. Move the
observational framing to the top. Re-point glossary §6 cross-links
here.

## Proposed shape

```
[H1 + section-intro: "Movement System view"]

[Observational-layer framing — moved from footer to TOP]
"These groupings surface body mechanics that cut across families.
 They observe how tricks feel similar in motion; they don't
 override canonical IFPA family classifications."

[Axis 1: Component]
  modifier cards grouped under "component" axis label

[Axis 2: Window]
  modifier cards grouped under "window" axis label

[Axis 3: Quality]
  modifier cards grouped under "quality" axis label

[Axis 4: Motion]
  modifier cards grouped under "motion" axis label

[Footer with link back to /freestyle/glossary §3 for axis definitions]
```

Each modifier card keeps its existing shape (name, glossary link, tag
chips, "tricks using this modifier" list).

## Doctrinal safety

- **Safe**: the 4-axis assignment per modifier is already service-shaped
  (per Slice L1 — data-only). This slice surfaces existing data
  visually, no new classifications introduced.
- **Safe**: the "observational, not overriding canonical IFPA family"
  contract is preserved — just promoted to the top of the view.
- **Care**: if any modifier isn't yet assigned to one of the 4 axes,
  surface it under a clearly-marked "Unassigned" or "Pending axis"
  bucket rather than picking arbitrarily.

## Files affected

- `src/services/freestyleService.ts` — extend movement-system shaper
  to group modifiers by axis (if not already)
- `src/views/freestyle/tricks.hbs:270-290` — rewrite the movement-system
  view block to render axis groups
- `src/views/freestyle/glossary.hbs:460,479` — re-point modifier
  cross-links from `?view=component#component-{slug}` to
  `?view=movement-system#{modifier-anchor}` (coordinates with
  component-view retirement)
- Tests: `tests/integration/freestyle.tricks-insights.routes.test.ts`
  or freestyle.routes.test.ts likely has movement-system view tests

## Dependencies

- Coordinates with **component-view retirement** plan (re-pointing
  glossary §6 links).
- Should land AFTER glossary §3 axis-vocabulary refinement if any.

## Out of scope

- Adding new modifiers to the 11-modifier pilot
- Adding new axes beyond the existing 4
- Changing the axis definitions themselves (those live in glossary §3
  and require curator authority)

## Review approval

Approve the 4-axis grouping shape + observational-framing promotion.
Pre-implementation slice will produce a service-method signature
change proposal + template diff for re-review.
