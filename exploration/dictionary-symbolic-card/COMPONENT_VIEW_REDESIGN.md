# COMPONENT_VIEW_REDESIGN

**Project:** DICTIONARY-SYMBOLIC-CARD-1 — Task E
**Scope:** Repurpose the existing `/freestyle/tricks?view=sets` route into a component-and-modifier browse view. Every entry renders as a symbolic trick card. No prose-heavy rendering. No glossary-style rendering.
**Companion docs:** [`SYMBOLIC_CARD_SPEC.md`](./SYMBOLIC_CARD_SPEC.md) defines the card. [`NOTATION_LAYER_STRATEGY.md`](./NOTATION_LAYER_STRATEGY.md) defines the representation layers. [`OPERATIONAL_NOTATION_STYLE_GUIDE.md`](./OPERATIONAL_NOTATION_STYLE_GUIDE.md) governs notation rendering.
**Out of scope:** Implementation, route changes, service refactors, schema modifications. This document specifies the *target view*; later phases ship it.

---

## 1. The rename

The view currently at `/freestyle/tricks?view=sets` is repurposed.

| Current | Target |
|---|---|
| Label: "By sets" | "By component" (or "By modifier & set") |
| Content: tricks grouped by set primitive | Tricks grouped by component (modifiers + set primitives + topology + archetype as available) |
| Card: name + ADD + family chip + media chip | Symbolic card (Title / ADD / Operational notation / Aliases) |
| Notation: not shown | Shown on every card as primary visual element |

The new label **"By component"** captures the broader scope. "By modifier & set" is an acceptable alternative when the audience needs the explicit signal. Either way: this view browses tricks **grouped by the structural ingredient they share** — not by their family-of-origin (that's "By family") and not by difficulty rank (that's "By ADD").

The renamed view becomes the primary surface for questions like *"show me all tricks with paradox"* or *"show me everything that uses a pixie set"* — questions that the existing browse views answer poorly or not at all.

---

## 2. What "component" means in this view

A **component** is any structural ingredient a trick is composed of. From the existing data, components fall into four axes (corresponding to the symbolic-grammar-2 modifier / set / topology / archetype registries):

| Axis | Examples | Source registry |
|---|---|---|
| **Body modifiers** | paradox, spinning, ducking, symposium, weaving, diving, zulu, alpine | `symbolic_modifier_groups.csv` (rows where `axis = modifier` and the group represents a body modifier) |
| **Set modifiers / set primitives** | pixie, fairy, atomic, quantum, nuclear, stepping, furious | `symbolic_modifier_groups.csv` (axis = modifier, set-family rows) |
| **Topology groups** | butterfly-wing-topology, whirl-rotational-topology, mirage-topology, drifter-miraging-clipper-topology, blender-rotational-topology | `symbolic_topology_groups.csv` |
| **Movement archetypes** | uptime-dex-downtime-butterfly, uptime-dex-downtime-osis, set-into-dex | `movement_archetype_registry.csv` |

These four axes already exist in the staged CSVs the platform reads. The component view is not inventing a new data source — it's exposing what's already populated.

A trick may appear under **multiple components**. Montage, for example, appears under paradox-family AND ducking-family AND spinning-family AND symposium-family AND whirl-rotational-topology. The view shows the same card five times across five groups. This is **intentional duplication**: each group offers a different browse path through the same set of tricks.

---

## 3. Grouping strategy

### 3.1 Group order (top-to-bottom of the page)

The view renders a list of component groups, each with its own heading and stack of cards. Groups appear in this order:

1. **Body modifiers** (alphabetical within axis): atomic, alpine, ducking, diving, paradox, spinning, stepping, symposium, weaving, zulu, ...
2. **Set primitives** (alphabetical within axis): fairy, furious, nuclear, pixie, quantum, ...
3. **Topology groups** (alphabetical within axis): blender-rotational-topology, butterfly-wing-topology, drifter-miraging-clipper-topology, mirage-topology, whirl-rotational-topology
4. **Movement archetypes** (alphabetical within axis): set-into-dex, uptime-dex-downtime-butterfly, uptime-dex-downtime-osis

Axes are visually demarcated by a section divider; groups within an axis are alphabetical. This puts the most-commonly-cited components (body modifiers) at the top of the page where users scroll first.

**Alternative ordering (deferred):** by popularity (number of trick members), highest first. Useful if the alphabetical default proves uneven. Track as a future enhancement.

### 3.2 Group heading

Each group renders a single heading row above its card stack:

```
PARADOX                                              5 tricks
+1 body modifier; hip pivot between two dexes on the same set.
```

| Slot | Content |
|---|---|
| Heading text | Component name in uppercase display-cased form (`PARADOX`, `BUTTERFLY-WING-TOPOLOGY`) |
| Count chip | Right-aligned: `N tricks` where N is post-filter member count |
| Subhead | One-line definition pulled from `symbolic_modifier_groups.csv` `definition_short` or equivalent CSV field. No prose paragraphs. |
| Cross-link | Optional inline link to `/freestyle/modifier/{slug}` for the body-modifier groups that have pedagogy pages (spinning, paradox, ducking shipped) |

The subhead is a **single coach-tone sentence** drawn from the existing symbolic-grammar-2 registry. Never multi-paragraph. Never tutorial-style. The job of teaching the component lives on the modifier-family page; the job of this heading is orientation.

### 3.3 Why not nest by axis?

A flat list of axis-separated sections (rather than a nested expandable tree) is the right default because:

- Browse is a scan-and-stop activity, not a navigate-and-drill activity. Scanning works better with linear scrolls than with expand-collapse interactions.
- The axis count is small (4 axes); a list with 4 visual breaks scrolls fast.
- The number of groups per axis is small (~10 body modifiers; ~6 set primitives; 5 topologies; 5 archetypes ≈ 26 groups total). All fit in a single scrollable page.

A future enhancement can add axis-jump anchors at the page header (`Body modifiers | Set primitives | Topology | Archetypes`) for navigation without scrolling.

---

## 4. Ordering strategy (within each group)

Within a single component group, cards sort by:

1. **ADD ascending** as primary sort. Lowest-ADD tricks first; this keeps the cognitive load light at the top of each group.
2. **Trick name alphabetical** as secondary sort within identical ADD values.

Rationale: a learner scanning "paradox" likely wants to see the easiest paradox compounds first (paradox-mirage at 3 ADD) before reaching the flagship compounds (montage at 7 ADD). The structural progression from low to high ADD becomes self-evident.

Exceptions:

- **Anchor placement:** when a base trick is a member of its own topology group (e.g., `butterfly` is a member of `butterfly-wing-topology`), the base trick renders **first**, regardless of ADD. The anchor is the "you are here" of the topology and reads more naturally at the top.
- **Modifier-stub rows excluded:** the 18 modifier-stub rows per `feedback_modifier_public_visibility` are filtered out of every group. This is enforced at the service layer; the view never sees them.

---

## 5. Density strategy

### 5.1 Per-card density

Every card renders at `browse` density (`SYMBOLIC_CARD_SPEC.md` §8.1):

```
PARADOX MIRAGE                                       3 ADD
[set] > hippy in dex > op toe
aliases: pdx mirage
```

The same four required slots: title, ADD, operational notation, aliases. Detail density is not used in browse contexts.

### 5.2 Inter-card density (within a group)

Cards within a group stack vertically with **24px vertical rhythm**. No alternating row colours. No card borders. Each card reads as a discrete unit; the rhythm of the operational notation across consecutive cards is the visual pattern that emerges.

When a group has ~5 cards, the stack feels compact. When a group has 15+ cards (whirl-rotational-topology has 17 members), the stack scrolls; the heading row should be sticky or anchored so the group identity stays visible while scrolling.

### 5.3 Inter-group density (between groups)

Vertical rhythm between groups is larger than within: **48px between groups, 64px between axes**. The page reads as four major sections, each with a vertical list of subsections.

### 5.4 Empty groups

A component group with zero current members renders as an empty-state row:

```
ATOMIC                                              0 tricks
+1 set modifier; atomic x-dex pre-base.
(No tricks currently registered under atomic.)
```

This signals to curators / advanced users that the registry knows about a component but no tricks have been mapped to it yet. The row is not hidden; absence is itself information.

---

## 6. Mobile behavior

### 6.1 Single-column always

The component view is single-column on every viewport. Multi-column grids of operational notation strings do not work — the notation needs horizontal room to breathe.

### 6.2 Group heading collapses on mobile

On narrow viewports (< 480px), the group heading row stacks vertically:

```
PARADOX
5 tricks
+1 body modifier; hip pivot between two
dexes on the same set.
```

The count chip moves below the heading; the subhead wraps freely.

### 6.3 Sticky group heading (proposed)

When scrolling through a long group, the group heading sticks to the top of the viewport. The reader always knows which component they're inside.

Implementation note: CSS `position: sticky; top: 0; background: ...` on the heading row, with appropriate z-index. Browser support is broad enough for this to be a reasonable default.

### 6.4 Pagination?

No. The browse views are designed to be scrolled, not paginated. The total card count across all components is bounded by the dictionary size (~150 active tricks × ~5 average group memberships ≈ ~750 card renders). With browse-density cards (~120px tall on desktop), the full view scrolls in under a minute. Pagination would obscure the structural relationships the view exists to reveal.

If page-weight becomes a problem, virtualised rendering is the optimisation; pagination is not the model.

---

## 7. URL structure (proposed)

The view lives at the existing route with a new query value:

| URL | Renders |
|---|---|
| `/freestyle/tricks?view=component` | Full component view (all axes) |
| `/freestyle/tricks?view=component&axis=modifier` | Body modifiers axis only |
| `/freestyle/tricks?view=component&axis=set` | Set primitives axis only |
| `/freestyle/tricks?view=component&axis=topology` | Topology axis only |
| `/freestyle/tricks?view=component&axis=archetype` | Movement archetypes axis only |
| `/freestyle/tricks?view=component#paradox` | Full view, scrolled to the paradox group |
| `/freestyle/tricks?view=sets` | **Redirect** → `/freestyle/tricks?view=component` (preserve external link compatibility) |

Anchored group jumps via URL hash let learners share specific component groups (e.g., "look at the paradox tricks: /freestyle/tricks?view=component#paradox").

---

## 8. What this view replaces (and what it does not)

### 8.1 Replaces

- The existing `/freestyle/tricks?view=sets` browse. Existing route is preserved via 301 redirect to `/freestyle/tricks?view=component`.
- Inline trick-list discovery via prose ("paradox mirage, paradox whirl, paradox blender are all members of the paradox family") — these prose sentences can be replaced by deep-links to the component view.

### 8.2 Does NOT replace

- **`/freestyle/modifier/{slug}`** pedagogy pages. Those teach the component physically and mechanically; the component view *browses* tricks that share the component. They serve different jobs and the URLs make the distinction explicit.
- **`/freestyle/glossary`** entries. The glossary defines terminology; the component view browses tricks. Glossary remains the place to *learn what a component is*; the component view is the place to *see which tricks use it*.
- **By ADD / By family / By category browse views.** Each remains a separate browse mode. The component view is an addition, not a replacement.

---

## 9. Worked example — what the page looks like rendered

```
─────────────────────────────────────────────────────────────────────
BROWSE BY COMPONENT

Body modifiers ──────────────────────────────────────────────────────

PARADOX                                                     5 tricks
+1 body modifier; hip pivot between two dexes on the same set.
Learn more on the paradox modifier page →

  PARADOX MIRAGE                                              3 ADD
  [set] > hippy in dex > op toe
  aliases: pdx mirage

  PARADOX WHIRL                                               4 ADD
  [clip] > paradox > front whirl > ss clipper

  PARADOX DRIFTER                                             4 ADD
  [set] > paradox > miraging clipper

  PARADOX BLENDER                                             5 ADD
  [set] > paradox > whirling op osis

  PARADOX TORQUE                                              5 ADD
  [clip] > paradox > ss miraging op osis
  aliases: gauntlet (with ducking on top)

SPINNING                                                    8 tricks
+1 body modifier; full-body 360° rotation carried through the dex.
Learn more on the spinning modifier page →

  SPINNING WHIRL                                              4 ADD
  [clip] > spinning > front whirl > ss clipper

  MOBIUS                                                      5 ADD
  [clip] > spinning > ss miraging op osis
  aliases: gyro torque

  ...

DUCKING                                                     6 tricks
+1 body modifier; head dip — head toward bag, bag opposite.
Learn more on the ducking modifier page →

  DUCKING CLIPPER                                             3 ADD
  [set] > duck > ss clipper

  DUCKING BUTTERFLY                                           4 ADD
  [clip] > duck > butterfly wing > ss clipper

  ...

Set primitives ──────────────────────────────────────────────────────

PIXIE                                                       7 tricks
Pre-base set treatment; compresses uptime.

  PHOENIX                                                     5 ADD
  [clip] > pixie > duck > butterfly wing > ss clipper

  DIMWALK                                                     4 ADD
  [clip] > pixie > butterfly wing > ss clipper

  ...

Topology ────────────────────────────────────────────────────────────

WHIRL-ROTATIONAL-TOPOLOGY                                  17 tricks
Tricks whose primary uptime mechanic is a full-body rotational dex.

  WHIRL                                                       3 ADD
  [clip] > front whirl > ss clipper

  SPINNING WHIRL                                              4 ADD
  [clip] > spinning > front whirl > ss clipper

  ...

Movement archetypes ─────────────────────────────────────────────────

UPTIME-DEX-DOWNTIME-BUTTERFLY                              10 tricks
Movement archetype: uptime dex into a butterfly-wing downtime finish.

  RIPWALK                                                     4 ADD
  [clip] > op in dex > butterfly wing > ss clipper

  ...

─────────────────────────────────────────────────────────────────────
```

The rendered view is dense with operational notation. Reading down a column of `PARADOX` cards, the eye learns the pattern: `paradox` is always the second token in the operational sequence, the base trick varies. Within `WHIRL-ROTATIONAL-TOPOLOGY`, the eye learns that whirl-base tricks share a `> front whirl > ss clipper` ending; the modifiers vary. The view *teaches* by visual juxtaposition.

---

## 10. Service-layer shape (NOT implementation; provisional)

The view consumes a single view-model:

```ts
interface ComponentBrowseViewModel {
  axes: ComponentAxis[];
}

interface ComponentAxis {
  axisKey:    'modifier' | 'set' | 'topology' | 'archetype';
  axisLabel:  string;
  groups:     ComponentGroup[];
}

interface ComponentGroup {
  componentKey:    string;            // 'paradox', 'butterfly-wing-topology'
  componentLabel:  string;            // 'PARADOX', 'BUTTERFLY-WING-TOPOLOGY'
  definitionShort: string;            // one-line definition
  modifierPageHref: string | null;    // '/freestyle/modifier/paradox' or null
  memberCount:     number;            // post-filter, post-deduplication
  cards:           TrickCardViewModel[];  // sorted by ADD asc, then name
}
```

The `TrickCardViewModel` is defined in `SYMBOLIC_CARD_SPEC.md` §11. The service builds this model by walking `symbolic_group_membership.csv` + `symbolic_modifier_groups.csv` + topology + archetype CSVs, resolving each membership to a `freestyle_tricks` row, and applying the modifier-stub filter.

The view template is a Handlebars partial that renders the model literally — no logic, no shaping. The service owns all decisions.

---

## 11. Cross-cutting design rules (recap)

- Same card across all browse modes.
- Only the grouping wrapper differs.
- No prose-heavy rendering.
- No glossary-style rendering.
- Notation is visually central.
- Modifier-stub rows excluded.
- Observational-layer separation: every group's subhead is sourced from the symbolic-grammar-2 registry, marked as observational, and never overrides canonical IFPA classifications.

---

## 12. Constraints honoured

- No canonical-data mutation
- No ontology changes
- No ADD changes
- No alias insertion
- No parser changes
- No schema changes
- No auto-generation
- Operational notation is consumed from existing `operational_notation` column; cards with null operational notation show "notation pending" per `SYMBOLIC_CARD_SPEC.md`
- Observational-layer separation preserved

---

## 13. Cross-references

- `SYMBOLIC_CARD_SPEC.md` — the card consumed here (Task B)
- `NOTATION_LAYER_STRATEGY.md` — the layers each card may surface (Task C)
- `OPERATIONAL_NOTATION_STYLE_GUIDE.md` — operational notation rendering (Task D)
- `NOTATION_SURFACE_AUDIT.md` — current state of the "By sets" view (Task A)
- `UNIFIED_DICTIONARY_VIEW_PLAN.md` — the parallel unification of By family + By ADD (Task F)
- `exploration/symbolic-grammar-2/symbolic_modifier_groups.csv` — body modifiers + set primitives registry
- `exploration/symbolic-grammar-2/symbolic_topology_groups.csv` — topology registry
- `exploration/symbolic-grammar-2/movement_archetype_registry.csv` — movement archetypes
- `exploration/symbolic-grammar-2/symbolic_group_membership.csv` — trick → group mapping (323 rows)
- `feedback_modifier_public_visibility.md` — modifier-stub exclusion rule

---

*End of COMPONENT_VIEW_REDESIGN.md*
