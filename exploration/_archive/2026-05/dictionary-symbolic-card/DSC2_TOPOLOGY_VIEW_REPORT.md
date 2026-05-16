# DSC2_TOPOLOGY_VIEW_REPORT

**Project:** DICTIONARY-SYMBOLIC-CARD-2 — Topology view (`?view=topology`)
**Scope:** Add the topology axis as a separate browse view. Slice deliberately starts small per strategic guidance: six pedagogically-grounded educational groups, computed from existing data, observational-layer attributed. No advanced taxonomy. No hyper-fractal overfitting.
**Date:** 2026-05-13
**Result:** Shipped; 2882 / 2882 unit+integration tests pass; tsc clean.

---

## 1. Strategic frame

The slice was planned to load the existing `symbolic_topology_groups.csv` (6 advanced taxonomic groups: butterfly-wing-topology, whirl-rotational-topology, mirage-topology, drifter-miraging-clipper-topology, blender-rotational-topology, osis-rotational-topology). Mid-build the curator redirected:

> **MY MAIN STRATEGIC ADVICE**
> Do NOT rush topology/archetypes into giant exhaustive taxonomies. Start small, obvious, educational, high-confidence.
> Good initial topology groups: hippy downtime dex, leggy dex, symposium clipper, whirl/swirl structures, pixie uptime dex, ducking clipper structures.
> Avoid hyper-fractal symbolic overfitting.

The slice pivoted to a **curated set of six biomechanically-grounded groups** that learners can recognise and that the existing data can deterministically populate. The advanced CSV-based taxonomy is deferred; it stays in the codebase for the related-topology panel on trick-detail pages (UX-SHIP-1 Phase 4) but is **not surfaced** in this view.

---

## 2. The six pedagogical groups

| # | Slug | Display name | Membership rule | Body-mechanics anchor |
|--:|---|---|---|---|
| 1 | `hippy-downtime-dex` | Hippy downtime dex | `base_trick ∈ {mirage, butterfly}` | The thigh swings broadly around the bag while the chest opens. |
| 2 | `leggy-dex` | Leggy dex | `base_trick ∈ {legover, pickup, whirl, swirl, illusion}` | The calf circles the bag while the thigh stays composed. |
| 3 | `whirl-swirl-structures` | Whirl / swirl structures | `base_trick ∈ {whirl, swirl}` | The rotational dex pair — leggy in to clipper (whirl) and leggy out crossbody to clipper (swirl). |
| 4 | `pixie-uptime-dex` | Pixie uptime dex | Has `pixie` modifier link | Compressed pre-base uptime set; tight motion. |
| 5 | `symposium-clipper-structures` | Symposium clipper structures | Has `symposium` link + `base_trick ∈ {butterfly, whirl, swirl, osis, blender}` | Support leg leaves the ground during the dex on a clipper-landing trick. |
| 6 | `ducking-clipper-structures` | Ducking clipper structures | Has `ducking` link + clipper-landing base | Head dips in midtime; bag passes around the neck. |

Each group has:

- A stable anchor ID (`#topology-{slug}`)
- A heading-wrapped self-anchored link + count chip
- A one-line body-mechanics definition under the heading
- Cards sorted ADD ascending then trick name
- Members computed deterministically; no curator-authored memberships per trick

Empty groups are hidden by the `g.memberCount > 0` filter.

---

## 3. Why these six, and not more

The choice is deliberate. Each group satisfies four criteria:

1. **Biomechanically obvious.** A learner can watch a trick and tell which group it belongs to. "Hippy vs leggy" is a body-region distinction that doesn't require a notation system to perceive.
2. **Computable from existing data.** No new schema, no new CSV, no curator-tagged memberships per trick. The membership functions read base_trick + modifier_links + a small dex-class base set (curator-tagged for hippy/leggy bases per `CORE_TRICK_GRAMMAR_DRAFT.md`).
3. **High-confidence.** Each rule covers a well-established biomechanical pattern. There are no edge-case classifications; every active dictionary trick either matches or doesn't match.
4. **Educational.** Each group surfaces a pattern a learner *should* be able to recognise after reading the primer (`MOVEMENT_LANGUAGE_PRIMER_DRAFT.md`). The groups reinforce the primer's body-mechanics framework.

The strategic guidance specifically warned against "giant exhaustive taxonomies" and "hyper-fractal symbolic overfitting." Six pedagogical groups is the floor; if six proves too few after observed usage, additional groups can be added incrementally with the same constraints.

---

## 4. What's deferred

The existing **6 advanced topology groups** (butterfly-wing-topology, whirl-rotational-topology, mirage-topology, drifter-miraging-clipper-topology, blender-rotational-topology, osis-rotational-topology) from `symbolic_topology_groups.csv`:

- **Not surfaced** in `?view=topology`
- **Still consumed** by the related-topology panel on 8 flagship trick-detail pages (UX-SHIP-1 Phase 4 — `symbolicTrickPanels.ts`)
- **Still available** to `symbolicGrammarService` callers
- **Available for future surfacing** if/when the curator decides

The architectural separation is clean: pedagogical groups live in `freestyleService.ts` (computed from existing data). Advanced taxonomic groups live in `symbolicGrammarService.ts` (loaded from staging CSVs). They don't compete.

The same separation applies to **movement archetypes** (11 entries in `movement_archetype_registry.csv`) — deferred entirely from `?view=topology`. They may surface in a future advanced view if curators decide; nothing in slice 3T forecloses that.

---

## 5. Observational-layer attribution

The view is explicitly observational. The framing carries through three surfaces:

1. **Top-of-page note** (`<p class="topology-view-note">`) — observational badge inline, framing prose declaring "These groupings describe how tricks share body mechanics... observed, not canonical."
2. **Bottom-of-page footer** (`<p class="symbolic-layer-footer">`) — "Observational symbolic-grammar layer... do not override canonical IFPA family classifications. The dictionary's [By family] view remains the canonical structural source."
3. **No CSS class collision with canonical views.** `.trick-topology-group` is distinct from `.trick-family-group` / `.trick-category-group` / `.trick-component-group`; the visual presentation can differ if needed to signal observational status.

The dictionary's canonical structure (family classifications, ADD values, modifier-table data) remains untouched and unchanged. The topology view is **additive observation**; it's a different lens on the same dictionary, not a replacement.

---

## 6. Files changed

| File | Change |
|---|---|
| `src/services/freestyleService.ts` | Added `TopologyGroup` + `TopologyBrowseView` interfaces. Extended `FreestyleTricksIndexContent` with `topologyView`. Extended `FreestyleTricksActiveView` with `'topology'`. Added `HIPPY_BASES`, `LEGGY_BASES`, `CLIPPER_LANDING_BASES` curator-tagged sets. Added `hasModifierLink` helper + 6 group definitions + `buildTopologyGroup`. ~+90 lines. |
| `src/views/freestyle/tricks.hbs` | View-toggle gains "By topology" tab. New `?view=topology` branch renders: observational-badge framing note, per-group section (with self-anchored heading + count chip + body-mechanics definition + dict-card-stack), bottom observational footer. ~+30 lines. |
| `src/public/css/style.css` | `.topology-view-note`, `.trick-topology-group`, `.topology-group-definition` styles. ~+20 lines. |
| `tests/integration/freestyle.topology-view.routes.test.ts` | **NEW.** 20 integration tests covering route + toggle, observational attribution (badge + footer), each of six groups, deferred-CSV-taxonomy negative tests, out-of-topology trick behaviour, group rendering (heading + definition + card sort), intentional cross-group membership (montage in 4 groups), card-uniformity. |

---

## 7. Tests passed

- New: `freestyle.topology-view.routes.test.ts` → 20 / 20
- Full unit+integration: **2882 / 2882** pass (158 test files; +20 from slice 3B)
- `tsc -p tsconfig.json --noEmit` → clean

Test coverage axes:

| Axis | Tests |
|---|---|
| Route + toggle | 3 |
| Observational attribution | 3 |
| Each of six groups | 7 (one per group + the CSV-taxonomy-NOT-surfaced negative test) |
| Out-of-topology behaviour | 1 |
| Group rendering | 4 |
| Cross-group membership | 1 |
| Card-uniformity | 1 |

---

## 8. The dictionary's surface inventory, post-topology

The dictionary now exposes **five distinct browse views**, each rendering the same `<dictionary-trick-card>` partial:

| View | URL | Grouping | Layer |
|---|---|---|---|
| By ADD (default) | `/freestyle/tricks` | ADD value | Canonical |
| By family | `/freestyle/tricks?view=family` | `trick_family` slug, anchor-first within | Canonical |
| By category | `/freestyle/tricks?view=category` | `category` value | Canonical |
| By component | `/freestyle/tricks?view=component` | Body modifiers + Set modifiers (priority ordered) | Observational (modifier links) |
| **By topology** | `/freestyle/tricks?view=topology` | Six pedagogical groups (computed) | **Observational (body mechanics)** |

The card-uniformity contract holds across all five. Only grouping wrappers and layer attributions differ.

A reader scrolling through any of the five sees the same operational-notation cards, the same data-attribute conventions, the same wrapping behaviour, the same mobile layout. The dictionary is now structurally five views over one card.

---

## 9. Known gaps / curator follow-ups

1. **The CSV-defined taxonomic topology groups are still available** via `symbolicGrammarService.getTopologyGroup()` and `getMembersOfGroup()`. They are used by the related-topology panel on flagship trick pages. They are **NOT** rendered in `?view=topology`. Curator decision pending: should we add an "Advanced topology" toggle (or a sub-axis-jump on the topology page) for the CSV-defined taxonomy? Slice 3T does not propose this.

2. **No cross-links from topology groups to modifier-family pages or progression pages yet.** A logical next-step: the hippy-downtime-dex group could deep-link to the walking-family progression (since the walking-family is butterfly-anchored); the ducking-clipper group could deep-link to `/freestyle/modifier/ducking`. Curator decision pending.

3. **Hippy/leggy classification is curator-tagged at the base level only.** The dex-class map (`HIPPY_BASES`, `LEGGY_BASES`) is hardcoded in `freestyleService.ts`. If a base trick is added (or its dex class is revised), the map needs an explicit update. A future schema enhancement could add a `dex_class` column to `freestyle_tricks` (or a parallel CSV) and remove the hardcoded set.

4. **Movement archetypes deferred entirely.** The 11 archetypes in `movement_archetype_registry.csv` are not surfaced anywhere user-facing yet. Decision pending: surface as a sub-axis in topology view, as a separate `?view=archetype` view, or remain curator-internal.

5. **No "what's in this trick?" reverse lookup on a single trick page.** When a learner clicks "montage," they see the trick-detail page but don't see "this trick is a member of leggy-dex / whirl-swirl-structures / symposium-clipper / ducking-clipper / paradox-family / spinning-family / ducking-family / symposium-family / whirl-rotational-topology" all at once. A topology-on-trick-detail panel would close that loop. Future enhancement; not in this slice.

---

## 10. Constraints honoured

- No schema changes
- No ontology changes
- No ADD-rule changes
- No parser changes
- No alias insertion
- Same shared `<dictionary-trick-card>` partial used
- Six pedagogical groups, not advanced taxonomy
- Membership computed deterministically from existing data
- Observational-layer attribution rendered (badge + footer)
- Cards sort ADD ascending then name
- Empty groups hidden
- Curator-tagged dex-class base sets are small and biomechanically grounded
- Cross-group membership preserved (montage in 4 groups; verified by test)

---

## 11. Stop confirmation

Per the slice cadence: **stopping after the topology view.** No further DSC-2 work begins automatically.

The dictionary's surface vocabulary is now structurally complete: five browse views, one card, full card-uniformity contract, observational separation rendered visibly. The remaining work for DSC-2 is curator content authoring (modifier-family pages, walking-progression chains, glossary V5 migration) rather than infrastructure.

---

*End of DSC2_TOPOLOGY_VIEW_REPORT.md*
