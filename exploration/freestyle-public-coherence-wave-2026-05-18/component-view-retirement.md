# /freestyle/tricks?view=component — retirement plan

Lightweight planning doc per the Freestyle Public Coherence Wave brief
(2026-05-18). Implementation deferred.

## Current state

`/freestyle/tricks?view=component` is one of seven view-toggle modes
on the trick dictionary (`tricks.hbs:73` link entry). It groups tricks
by the structural component (body / set modifier) they share. Shaped
by `freestyleService.ts` `componentView: ComponentBrowseView` field
(DSC-2 slice 3A per memory).

Inbound link points:
- `tricks.hbs:73` view-toggle link "By component"
- `tricks.hbs:168` per-card heading link on the component view itself
- `glossary.hbs:460` modifier card "See tricks using {name} →" (§6
  Surface A modifier feel cards)
- `glossary.hbs:479` modifier card "See tricks using {name} →" (§6
  Surface B advanced reference)

## Problem

The component view is structurally redundant with `?view=movement-system`:

1. **Same data, different shape**. Both views group tricks by the
   modifier-style component they share. Movement-system organizes
   them under the 4-axis framing (Slice L1/L2); component view
   shows the same modifier-trick relationships without the axis
   layer.
2. **Movement-system view is more informative**. The 4-axis grouping
   gives modifier-trick relationships pedagogical scaffolding the
   bare component view lacks.
3. **Two view-toggle entries for the same underlying data** dilutes
   the view-toggle row's clarity. Beginners see "By component" and
   "By movement system" as distinct options when functionally they
   browse the same modifier relationships.

## Goal

Retire `?view=component` in favor of `?view=movement-system`. Re-point
all inbound links. Remove the view-toggle entry. Service-layer code
that powers the component view either consolidates with
movement-system or gets removed.

## Proposed shape

1. **Re-point inbound links** to `?view=movement-system` with
   appropriate anchors:
   - `glossary.hbs:460` and `:479`: change
     `?view=component#component-{slug}` →
     `?view=movement-system#{modifier-anchor}` (the modifier-anchor
     pattern in movement-system view)
   - Any other crawled inbound links: audit + redirect
2. **Remove the view-toggle entry** `tricks.hbs:73`
3. **Remove the component-view template block** in `tricks.hbs`
   (rendered when `activeView === 'component'`)
4. **Remove or consolidate service code**:
   - `FreestyleTricksActiveView` type loses `'component'` literal
   - `componentView: ComponentBrowseView` field — either delete from
     the page view-model or repurpose for movement-system if there's
     useful infrastructure
   - `shapeComponentView` (or similar) shaper function — remove
5. **Add a 301 redirect** at the controller level: incoming
   `?view=component` URLs redirect to `?view=movement-system`. Per
   DD §5.2 redirects-policy, URL-rename redirects are debatable
   (see Dave audit #3) — alternative is to just remove the route
   handling for that query param and let it fall through to the
   default view.

## Doctrinal safety

- **Safe**: no ontology changes, no data classification changes.
- **Care**: confirm movement-system view has anchors for every
  modifier currently surfaced by component view, so the re-pointed
  glossary links don't 404 visually.
- **Care**: any operator board or trick-detail page that links into
  component view's anchors needs the same re-point treatment.
- **Note**: component view shipped in DSC-2 slice 3A (per memory
  `project_symbolic_ux_rollout`). Retiring it isn't a contract
  reversal — DSC-2 was an exploration with multiple slices; component
  view served its purpose during the symbolic-UX rollout.

## Files affected

- `src/views/freestyle/tricks.hbs` — remove view-toggle entry + view
  block
- `src/views/freestyle/glossary.hbs:460,479` — re-point modifier
  cross-links
- `src/services/freestyleService.ts` —
  - drop `'component'` from `FreestyleTricksActiveView`
  - remove `componentView: ComponentBrowseView` field (or repurpose)
  - remove component-view shaper
- Controller — if redirect path chosen, add a redirect; otherwise
  remove query-param handling
- Tests: any test pinning `?view=component` or "By component" toggle
  needs updating

## Dependencies

- **Movement System consolidation** plan must land first OR
  concurrently — re-pointed glossary links land on a more cohesive
  destination
- Coordinate with Dave audit #3 (redirect policy) if choosing
  redirect over plain removal

## Out of scope

- Retiring other view-toggle modes (ADD / family / category / sets /
  topology) — those remain
- Re-organizing glossary §6 modifier cards — separate concern

## Review approval

Approve the consolidation direction (retire vs. keep). If approved,
pre-implementation slice will produce a service-method removal
proposal + template diff + redirect/no-redirect decision for re-review.
