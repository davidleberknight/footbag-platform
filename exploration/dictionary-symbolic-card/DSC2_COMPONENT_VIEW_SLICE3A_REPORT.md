# DSC2_COMPONENT_VIEW_SLICE3A_REPORT

**Project:** DICTIONARY-SYMBOLIC-CARD-2 — Implementation slice 3A
**Scope:** Migrate `?view=sets` → `?view=component` as a server-side rename + legacy alias. **Slice-3A activation:** body-modifier axis + set-modifier axis only. Topology and movement-archetype axes deferred to a later slice. Same shared symbolic trick-card partial; intentional duplication preserved; empty groups hidden; axis-jump nav.
**Date:** 2026-05-13
**Result:** Shipped; 2851 / 2851 unit+integration tests pass; tsc clean.

---

## 1. Before / after

### 1.1 Before — `?view=sets`

The legacy view rendered a flat list of `<section class="trick-set-group">` entries, one per modifier with linked tricks. Each section carried a heading like `paradox (body)` and an inline `<ul class="trick-list">` of `<li class="trick-row">` entries. Each row carried name + ADD chip + family chip + media chip + description (when present). The view did not separate body modifiers from set modifiers; all modifiers were inlined in source order. The static set-notation reference page was deep-linked from the view intro.

### 1.2 After — `?view=component`

The view label changes to **"By component"** in the dictionary view toggle. The page renders:

1. A short explanatory note about intentional duplication
2. An axis-jump nav at top of page (`Body modifiers · Set modifiers`)
3. Two `<section class="trick-component-axis">` containers (one per axis)
4. Within each axis section, a vertical stack of `<section class="trick-component-group">` entries — one per *populated* modifier — in priority-then-alphabetical order
5. Each group section carries:
   - A heading row with the modifier name wrapped in a self-anchored `<a>` link + count chip
   - A one-line body-mechanics definition (when curator-authored)
   - A `<div class="dict-card-stack">` rendering the shared `dictionary-trick-card.hbs` partial

`?view=sets` continues to resolve server-side to the new component view (alias). The view toggle's "By component" label is active for both URLs.

Topology and movement-archetype axes are **not rendered** in slice 3A. Their underlying data exists in `symbolic-grammar-2`, but the UI exposure is deferred per the user-directed slice-3A scope.

---

## 2. Activation matrix

The current data shapes the following axis × group activation:

### 2.1 Body modifiers axis

Priority order (per user spec): `paradox → symposium → spinning → ducking → diving → weaving → gyro → stepping`. Any remaining body modifiers fall through alphabetical.

| Position | Slug | Priority status | Group renders when ≥1 trick has this modifier link |
|---:|---|---|---|
| 1 | paradox | Priority | ✓ (whenever ≥1 paradox link exists) |
| 2 | symposium | Priority | ✓ |
| 3 | spinning | Priority | ✓ |
| 4 | ducking | Priority | ✓ |
| 5 | diving | Priority | ✓ (hidden when zero member tricks — most production data) |
| 6 | weaving | Priority | ✓ (hidden when zero) |
| 7 | gyro | Priority | ✓ (hidden when zero) |
| 8 | stepping | Priority | ✓ |
| 9+ | _any other_ | Alphabetical fallthrough | ✓ |

Each group's heading carries a one-line body-mechanics definition pulled from a curator-tagged map in `freestyleService.ts`. Slice 3A authored definitions for all 8 priority body modifiers.

### 2.2 Set modifiers axis

Priority order (per user spec): `pixie → atomic → quantum → nuclear → fairy → furious`. Remaining set modifiers alphabetical.

| Position | Slug | Priority status | Group renders when ≥1 trick has this modifier link |
|---:|---|---|---|
| 1 | pixie | Priority | ✓ |
| 2 | atomic | Priority | ✓ |
| 3 | quantum | Priority | ✓ (hidden when zero) |
| 4 | nuclear | Priority | ✓ (hidden when zero) |
| 5 | fairy | Priority | ✓ (hidden when zero) |
| 6 | furious | Priority | ✓ (hidden when zero) |
| 7+ | _any other_ | Alphabetical fallthrough | ✓ |

Each group's heading carries a one-line set-modifier definition.

### 2.3 Deferred axes

- **Topology axis** — `symbolic_topology_groups.csv` (6 groups: butterfly-wing-topology, whirl-rotational-topology, mirage-topology, drifter-miraging-clipper-topology, blender-rotational-topology, osis-rotational-topology). Deferred to a "By topology" or advanced symbolic browse view.
- **Movement-archetype axis** — `movement_archetype_registry.csv` (11 archetypes). Same deferral.

Both axes have shipped data; both are intentionally not rendered in slice 3A.

---

## 3. Within-group ordering

Cards sort by:

1. **ADD ascending** (tricks with `parseAddNumeric(adds) === null` sink to the bottom via `POSITIVE_INFINITY` substitution)
2. **Trick name alphabetical** as tiebreaker (case-insensitive)

This gives every group a beginner-friendly top: the lowest-ADD trick using that modifier renders first, the highest renders last. Within an ADD value, alphabetical name keeps the order deterministic.

Verified by integration test: in the seeded fixture, the paradox group renders `paradox-mirage (3 ADD) → paradox-whirl (4 ADD) → paradox-blender (5 ADD)` in that order.

---

## 4. Intentional duplication — preserved and verified

The component view's load-bearing UX choice is that a trick with multiple modifier links appears in **every group it belongs to**. Verified by integration tests:

- **Montage** (4 modifier links: spinning + ducking + paradox + symposium) renders in **all four body-modifier groups**. The card is identical in each appearance (same partial, same data); only the surrounding group changes.
- **Phoenix** (2 modifier links: ducking [body] + pixie [set]) renders in **both axes** — the ducking body-modifier group AND the pixie set-modifier group.

The explanatory note above the axes reads:

> Compounds appear in every component group they belong to. A trick with paradox AND spinning shows up under both — the duplication is intentional, since each grouping is a separate browse path.

This note is the entire "explain duplication to readers" surface in slice 3A. No additional chips, badges, or de-duplication affordances. The intent is for duplication to feel like a feature (multiple browse paths to the same trick) rather than a defect.

---

## 5. Empty groups — hidden

Per the user spec, slice 3A **hides empty groups**. The implementation: each axis filter is `b.entries.length > 0` before a group is rendered. Verified by integration tests — `diving`, `weaving`, `gyro`, `quantum`, `nuclear`, `fairy`, `furious` are all in the priority list but render as absent (`#component-{slug}` anchor not in HTML) when no fixture tricks link to them.

If a curator adds new modifier links pointing to one of these slugs, the group will activate without code changes. The empty-state behavior is a **content-driven invariant**, not a hard-coded suppression.

---

## 6. Files changed

| File | Change |
|---|---|
| `src/services/freestyleService.ts` | Added `ComponentGroup`, `ComponentAxis`, `ComponentBrowseView` interfaces; extended `FreestyleTricksIndexContent` with `componentView`; added priority maps + definitions map + `componentSortByAddThenName` + `buildComponentGroup` + `orderByPriorityThenAlpha` helpers; built the two-axis `componentView` alongside the existing `setGroups` shape; extended `FreestyleTricksActiveView` with `'component'` + server-side alias resolution for `'sets' → 'component'`. ~+150 lines. |
| `src/views/freestyle/tricks.hbs` | View-toggle's fourth tab label changes from "By sets" to "By component" with href `?view=component`. Sets branch retired; component branch renders the new structure (axis-jump nav + axis sections + group sections + dict-card-stack via the shared partial). ~−40 / +35 lines. |
| `src/public/css/style.css` | New `.component-view-note`, `.component-axis-jump`, `.trick-component-axis`, `.trick-component-group`, `.component-group-heading`, `.component-group-definition` rules + mobile media query. +75 lines. |
| `tests/integration/freestyle.component-view.routes.test.ts` | **NEW.** 18 integration tests: route + alias; axes + axis-jump nav; priority ordering on both axes; empty-group hiding; group rendering (definitions, anchor links, cards); intentional duplication (montage in 4 groups; phoenix in 2 axes). |
| `tests/integration/freestyle.tricks-insights.routes.test.ts` | Updated view-toggle assertion (now expects `view=component` href); converted the six "?view=sets" tests to two slice-3A-aware tests (alias resolution + retired-assertion stub). |
| `tests/integration/freestyle.dictionary-trick-card.routes.test.ts` | Updated regression-guard tests to recognize `?view=component` AND `?view=sets` as migrated (both render `dict-card-stack`); only `?view=category` remains flagged unmigrated. Seed extended with minimal modifier-link rows so the component view renders dict-cards. |

---

## 7. Tests passed

- New: `freestyle.component-view.routes.test.ts` → 18 / 18
- Updated regression: `freestyle.tricks-insights.routes.test.ts`, `freestyle.dictionary-trick-card.routes.test.ts`
- Full unit+integration: **2851 / 2851** pass (156 test files)
- `tsc -p tsconfig.json --noEmit` → clean

Test coverage axes:

| Axis | Tests |
|---|---|
| Route + alias (`?view=component` + `?view=sets`) | 3 |
| Axes + axis-jump nav | 5 |
| Group ordering (priority then alphabetical) | 2 |
| Empty group hiding | 2 |
| Group rendering (heading, definition, cards, sort) | 4 |
| Intentional duplication | 2 |

---

## 8. Worked example — what the page looks like rendered

Approximate HTML structure (abbreviated; one trick per group shown):

```html
<!-- View toggle: By ADD · By family · By category · [By component] -->

<p class="component-view-note">
  Compounds appear in every component group they belong to...
</p>

<nav class="component-axis-jump">
  <a href="#axis-body">Body modifiers</a> · <a href="#axis-set">Set modifiers</a>
</nav>

<section class="content-section trick-component-axis" id="axis-body">
  <h2>Body modifiers</h2>

  <section class="trick-component-group" id="component-paradox">
    <h3><a href="?view=component#component-paradox">paradox</a></h3>
    <p class="component-group-definition">A hip pivot between two dexes...</p>
    <div class="dict-card-stack">
      <!-- paradox-mirage (3 ADD), paradox-whirl (4), paradox-blender (5), montage (7) -->
    </div>
  </section>

  <section class="trick-component-group" id="component-symposium">
    <h3><a href="?view=component#component-symposium">symposium</a></h3>
    <p class="component-group-definition">A no-plant body discipline...</p>
    <div class="dict-card-stack"><!-- montage (7) --></div>
  </section>

  <!-- spinning, ducking, stepping groups follow; diving/weaving/gyro hidden -->
</section>

<section class="content-section trick-component-axis" id="axis-set">
  <h2>Set modifiers</h2>

  <section class="trick-component-group" id="component-pixie">
    <h3><a href="?view=component#component-pixie">pixie</a></h3>
    <p class="component-group-definition">A compressed pre-base uptime set...</p>
    <div class="dict-card-stack"><!-- dimwalk (4), phoenix (5) --></div>
  </section>

  <section class="trick-component-group" id="component-atomic">
    <h3><a href="?view=component#component-atomic">atomic</a></h3>
    <p class="component-group-definition">A cross-body uptime set...</p>
    <div class="dict-card-stack"><!-- atom-smasher (4) --></div>
  </section>
</section>
```

The page reads top-to-bottom as: note → axis-jump nav → body axis (5 populated groups) → set axis (2 populated groups). A reader scrolling sees the same `dict-card-stack` rendering they're already familiar with from By ADD and By Family.

---

## 9. Known visual concerns

1. **Definition coverage is sparse.** Slice 3A authored one-line body-mechanics definitions for the 8 priority body modifiers + 6 priority set modifiers (14 total). Modifiers outside the priority lists render their groups without definitions (the `<p class="component-group-definition">` element is conditionally rendered). Curator follow-up: extend `COMPONENT_DEFINITIONS` to cover the long tail.

2. **Group count chip behavior** matches By ADD / By Family. Each group's count reflects post-filter member count after modifier-stub exclusion (`feedback_modifier_public_visibility`) and active-row filtering. Curator-visible if any future filter changes affect the count.

3. **Axis-jump nav is static.** No JS, no IntersectionObserver, no scroll-spy. On a long page the nav doesn't highlight the currently-viewed axis. Sticky-nav + scroll-spy could be added later as progressive enhancement; deferred.

4. **Duplication-counter chip not present.** Some readers might benefit from a `"5 tricks · 1 also in spinning"` style metadata in the count chip; deferred per the user-spec ROI question. Current note above the axes is the only explanation; observe usage before adding chips.

5. **Topology axis empty by design.** A future slice adds the `topology` axis (via `symbolic_topology_groups.csv` + `symbolic_group_membership.csv`) and the `archetype` axis (via `movement_archetype_registry.csv`). The shape supports adding axes — `ComponentAxis[]` is already a list; building two more axis builders is mechanical.

6. **`?view=sets` is a server-side alias only.** No HTTP 301 redirect is performed; the URL stays `?view=sets` for inbound legacy links. Curator decision pending: should we 301-redirect to `?view=component` to consolidate URLs in analytics? Slice 3A keeps the alias as-is.

---

## 10. Constraints honoured

- No schema changes
- No ontology changes
- No parser changes
- No alias insertion
- No ADD-rule changes
- Same `<dictionary-trick-card>` partial used (no special-case templates)
- Intentional duplication preserved
- Empty groups hidden
- Axis-jump nav present (Body modifiers / Set modifiers)
- Educational group ordering (priority then alphabetical)
- One-line body-mechanics definitions on priority modifiers
- Cards sort ADD ascending then name
- `?view=sets` alias preserved
- Topology + archetype axes deferred (not in slice 3A scope)
- Modifier-stub exclusion preserved via the existing filter chain

---

## 11. Recommendation for next slice

**Recommend: ?view=category** as slice 3B.

Reasoning:

- It's the last unmigrated browse view. Migrating it completes the dictionary's surface uniformity.
- The legacy By Category view is a 5-column spreadsheet (`Trick | ADD | Description | Notation | Aliases`) — the visual delta to the symbolic card is the largest of any view, which makes the consolidation visible and demo-able.
- Service-shape work is small: existing `groups: FreestyleTrickGroup[]` becomes `groups: FreestyleTrickGroup & { cards: DictionaryTrickCard[] }`.
- No new conceptual primitives — the slice is mostly mechanical refactor following the slice-1 / slice-2 / slice-3A pattern.

**Then "By topology" (slice 3B+) as a separate symbolic browse:**

- Render `symbolic_topology_groups.csv` + `movement_archetype_registry.csv` as a "By topology" advanced view distinct from "By component" — both surfaces target curious / advanced readers.
- Decision pending curator review: do topologies + archetypes share a view, or get two? Slice 3A's report flags this for the next curator-touch.

---

## 12. Stop confirmation

Per the slice cadence: **stopping after slice 3A.** No work on By Category or the topology axis begins automatically.

---

*End of DSC2_COMPONENT_VIEW_SLICE3A_REPORT.md*
