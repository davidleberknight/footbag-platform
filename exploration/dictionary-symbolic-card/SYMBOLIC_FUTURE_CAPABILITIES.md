# SYMBOLIC_FUTURE_CAPABILITIES

**Project:** DICTIONARY-SYMBOLIC-CARD-1 — Task H
**Scope:** Exploratory enumeration of future capabilities unlocked by the symbolic card system and the 8-layer representation model. Each capability is described with its **infrastructure dependencies**, what **already exists** in the codebase, what **is missing**, and a **risk note**. This is not a roadmap; no implementation order is mandated. The deliverable is a vocabulary of *what becomes possible* once Batches 1-2 ship.
**Companion docs:** all of Batch 1 + Batch 2.
**Out of scope:** Implementation, prioritisation, dev-day estimates, schema designs.

---

## 0. The two enabling foundations

Every capability in this document leans on at least one of two structural foundations:

1. **The symbolic card system** (`SYMBOLIC_CARD_SPEC.md`): one renderer, progressive density, operational notation as the visual center of gravity. Any view that surfaces tricks consumes the same card.

2. **The 8-layer representation model** (`NOTATION_LAYER_STRATEGY.md` §0): canonical name, semantic compressed, semantic expanded, operational, folk, PassBack rendering, FootbagMoves rendering, alias. Tricks become resolvable from any layer; surfaces choose which layers to render.

Where a capability also depends on the **symbolic-grammar-2 datasets** (62 symbolic groups + 11 archetypes + 323 memberships + 18 equivalence clusters + 68 crosslinks) or other already-existing service code, that's called out explicitly.

---

## 1. Browse capabilities

### 1.1 Browse all tricks with modifier X
> *"Show me all tricks that have spinning in them."*

| | |
|---|---|
| Status | Foundation shipped via Task E (`COMPONENT_VIEW_REDESIGN.md`); UI implementation pending |
| Infrastructure | `symbolic_group_membership.csv` (323 rows mapping tricks to groups); the `?view=component` route; the shared `<TrickCard>` partial from Task B |
| Already exists | All data; pattern documented in Batch 2 |
| Missing | UI implementation of Task E; the `<TrickCard>` partial |
| Risk | Low. Pure read; no canonical changes. |

### 1.2 Browse all tricks in topology X
> *"Show me everything in the whirl-rotational-topology."*

Same as 1.1 but the group axis is `topology` instead of `modifier`. The component view at `?view=component&axis=topology` already covers this in the Task E design.

### 1.3 Browse all butterfly-wing variants
> *"Show me every trick that ends in a butterfly-wing dex."*

Same pattern, axis = topology, group = `butterfly-wing-topology`. The symbolic-grammar-2 dataset already lists 12 members of this group.

### 1.4 Browse all unusual-surface tricks
> *"Show me tricks that catch on a non-standard surface."*

| | |
|---|---|
| Status | Partial. Operational-notation token-coloring already classifies `unusual_surface` tokens; the data needed is a group-level filter on the operational layer. |
| Infrastructure | Existing `notationRendering.ts` UNUSUAL_SURFACE_TOKENS register; a new symbolic group `unusual-surface-topology` (or similar) in `symbolic_topology_groups.csv` |
| Already exists | Token classification |
| Missing | Curator-defined membership list; new symbolic group registry row |
| Risk | Low. Data-only addition. |

### 1.5 Browse by movement archetype
> *"Show me every uptime-dex-downtime-butterfly trick."*

| | |
|---|---|
| Status | Same pattern as 1.1; axis = archetype |
| Infrastructure | `movement_archetype_registry.csv` (11 archetypes); already maps memberships in `symbolic_group_membership.csv` |
| Already exists | All data |
| Missing | UI implementation |
| Risk | Low. |

---

## 2. Comparison and decomposition

### 2.1 Compare operational structures side-by-side
> *"Show me Phoenix and Mullet next to each other; what differs?"*

| | |
|---|---|
| Status | Conceptual; no precedent on the site yet |
| Infrastructure | Two cards rendered at detail-density; a diff-overlay layer that highlights operational-notation token differences |
| Already exists | The cards (Task B); the operational-notation tokenizer with role-tagged tokens |
| Missing | Diff-overlay UI; comparison-view route; comparison view-model in the service layer |
| Risk | Medium. Diff semantics are not trivially defined for token sequences with different lengths. Need a curator-reviewed comparison-policy doc. |

### 2.2 Symbolic decomposition view
> *"Show me Mobius decomposed into its operational atoms, with each atom linked back to its glossary anchor."*

| | |
|---|---|
| Status | Conceptual; the decomposition data is partially shipped in `structural_parse_json` per `feedback_parser_population_after_rebuild.md` |
| Infrastructure | Token-level linkability on the symbolic card (`SYMBOLIC_CARD_SPEC.md` §7); the parser's structural-parse output for the trick |
| Already exists | Parser output; per-token role classification; glossary anchor resolver |
| Missing | Token-level link rendering on the card (currently each token is a span; could carry `linkHref` for modifiers and base trick references); a decomposition "tree" view route |
| Risk | Low-medium. The parser/editorial separation rule (`feedback_parser_editorial_separation.md`) must remain intact — the decomposition view consumes the editorial-decomposition shape, not parser output directly. |

### 2.3 Multi-layer rendering of a single trick
> *"Show me Mobius across all 8 representation layers at once."*

| | |
|---|---|
| Status | Conceptual; example sketch in `SYMBOLIC_CARD_SPEC.md` §8.3 |
| Infrastructure | Detail-density card; populated representation-layer fields |
| Already exists | Layer 1 (canonical), partial layer 4 (operational where populated), layer 8 (aliases) |
| Missing | Layers 2 + 3 + 5 + 6 + 7 require curator data + service layer + schema (per `NOTATION_LAYER_STRATEGY.md` §10 migration phases) |
| Risk | Low. Each layer is independently shippable. |

---

## 3. Progression and navigation

### 3.1 Generated progression chains
> *"Generate a 5-step progression from butterfly to montage."*

| | |
|---|---|
| Status | Conceptual. Hand-authored chains are already shipped (walking-progression). |
| Infrastructure | Topology / archetype memberships; ADD-ordering within a group; a graph-walker over equivalence clusters |
| Already exists | The hand-authored walking-progression demonstrates the format; the symbolic-grammar-2 equivalence clusters describe structural neighborhoods |
| Missing | Algorithmic chain generator; a UI affordance ("trace a progression from A to B"); curator review of generated chains |
| Risk | Medium. Generated content is a different curator policy than hand-authored. Generated chains may surface non-pedagogical sequences; curator gate is required. |

### 3.2 Topology-graph navigation
> *"Show me a map of which topologies are related; click to drill in."*

| | |
|---|---|
| Status | Conceptual. The data exists; the navigation surface does not. |
| Infrastructure | Topology groups + equivalence clusters + crosslink rows |
| Already exists | The data: 5 topologies, 18 clusters, 68 crosslinks |
| Missing | A visualisation surface; graph rendering library or table view |
| Risk | Medium. Graph visualisations are notorious for over-engineering. Recommend a table-based "topology adjacency" view as the first step; defer interactive graphs. |

### 3.3 Symbolic-relationships-near-X panel
> *"On the trick-detail page for Mobius, show topologies and modifiers Mobius is connected to."*

| | |
|---|---|
| Status | Partial. The related-topology panel on 8 flagship trick pages already does this for topology. |
| Infrastructure | Existing related-topology panel (UX-SHIP-1 Phase 4) |
| Already exists | 8 flagship trick pages have the panel |
| Missing | Allow-list expansion (the 8-slug allow-list is a one-line constant); modifier-family parallel ("Modifiers used") and archetype parallel ("Archetypes in") |
| Risk | Low. Existing pattern; expansion is mechanical. |

### 3.4 Mechanical archetype navigation
> *"Take me to every trick that uses the uptime-dex-downtime-osis archetype."*

Already addressed in 1.5. Mentioned again here because the archetype axis is the natural home for "what does the body do?" questions, distinct from "what modifier is on the trick?" (which is the body-modifier axis).

---

## 4. Search and filter

### 4.1 Symbolic search
> *"Search for 'gyro torque' and route the user to Mobius's detail page."*

| | |
|---|---|
| Status | Foundational capability; partial via the existing alias resolver |
| Infrastructure | All 8 representation-layer fields searchable; alias resolver from `glossaryAnchors.ts` extended to all layers |
| Already exists | Layer 1 + layer 8 search (canonical name + alias) |
| Missing | Layer 2-7 indexing; query parser that recognises operational-notation fragments (`[clip]`, `spinning whirl`, etc.) |
| Risk | Medium. The query parser is the hard part; user-input notation may not match canonical operational notation exactly. Recommend a tolerant matcher that resolves common variants. |

### 4.2 Symbolic filters
> *"Show me 4-ADD tricks in the butterfly family that use ducking."*

| | |
|---|---|
| Status | Conceptual; the filter axes already exist as data |
| Infrastructure | Multi-axis filter UI on `/freestyle/tricks`; service-side AND-composition over group memberships, family, ADD, and operational tokens |
| Already exists | All data; the four browse views demonstrate single-axis grouping |
| Missing | Multi-axis filter chips on the dictionary header; composed-query service shape |
| Risk | Low-medium. UI complexity grows quickly with filter axes. Recommend starting with 3 filter axes (modifier + family + ADD); add more only after observed usage. |

### 4.3 Compositional query
> *"All tricks with paradox + whirl base + 5+ ADD."*

Same shape as 4.2; the query expression is a composition over three filter axes. The compositional-query view in `exploration/symbolic-grammar-2/symbolic_navigation_prototypes/` (5 nav-prototype specs from SG-2) sketches one approach.

### 4.4 Reverse-lookup from notation
> *"User pastes `[clip] > spinning > ss miraging op osis` and the system returns Mobius."*

| | |
|---|---|
| Status | Conceptual. Could be a search-time feature or a dedicated "what trick is this?" surface. |
| Infrastructure | Operational-notation index keyed by canonical form; normalization via the style guide (`OPERATIONAL_NOTATION_STYLE_GUIDE.md`) before lookup |
| Already exists | Operational notation column on `freestyle_tricks` (where populated); the tokenizer |
| Missing | The index; the user-facing surface |
| Risk | Medium. Normalisation gap — user input rarely matches canonical form exactly; the matcher needs tolerance built in (see `OPERATIONAL_NOTATION_STYLE_GUIDE.md` §3 cross-source mapping). |

---

## 5. Rendering and integration

### 5.1 Alternate-notation rendering on trick-detail
> *"On Mobius's detail page, let the reader toggle between operational, semantic compressed, expanded, PassBack, and FM renderings."*

| | |
|---|---|
| Status | Conceptual. The detail-density card in Task B accommodates the slots; the toggle UI does not yet exist. |
| Infrastructure | Detail-density card; populated representation-layer fields; a tab/segmented-control on the detail page |
| Already exists | The card design |
| Missing | Service-shaped representation-layer fields beyond what's currently in DB; the toggle UI |
| Risk | Low-medium. The cognitive load of a toggle could be high; recommend showing all layers stacked at first, then introducing a toggle only if the page becomes too long. |

### 5.2 Federation export rendering
> *"Generate a PassBack-format dump of the dictionary for federation parity check."*

| | |
|---|---|
| Status | Adjacent to existing federation track. `FM_MATH_DIVERGENCES.csv` already tracks parity; a PassBack export complements it. |
| Infrastructure | Representation layer 6 (PassBack rendering); existing federation pipeline (`exploration/footbagmoves-federation/`) |
| Already exists | The federation math divergences workflow |
| Missing | A serialiser that renders trick data in PassBack canonical form |
| Risk | Low. Read-only export; doesn't affect canonical data. |

### 5.3 In-card token linking
> *"On the symbolic card, make each operational-notation token clickable to its glossary anchor."*

| | |
|---|---|
| Status | Sketched in `SYMBOLIC_CARD_SPEC.md` §7 as a future enhancement |
| Infrastructure | Tokenizer needs to emit `linkHref` per token; the card template wraps tokens in `<a>` when href is present |
| Already exists | Tokens with role metadata; glossary anchor resolver |
| Missing | The `linkHref` field on `OperationalToken` shape; the tokenizer's classification → href mapping |
| Risk | Low. Each token's destination is the existing glossary anchor for its role/term. |

### 5.4 Symbolic glossary as multi-layer surface
> *"Each glossary entry is rendered with the full 8-layer representation context for the term."*

| | |
|---|---|
| Status | Conceptual; aligns with the v4 glossary architecture (4 layers: canonical / educational / symbolic / operational) |
| Infrastructure | Per-term layer mapping; existing §13 connective panels are the first iteration |
| Already exists | §13 panels for 6 terms; v4 architecture documented |
| Missing | Per-term layer fields; UI for layered glossary entries |
| Risk | Low. Curator-led growth; aligns with the GLOSSARY-SYNTHESIS-1 trajectory. |

---

## 6. Parser and tooling

### 6.1 Operational-notation linter
> *"Run a script over `freestyle_tricks.operational_notation` and flag rows that don't conform to the style guide."*

| | |
|---|---|
| Status | Sketched in `OPERATIONAL_NOTATION_STYLE_GUIDE.md` §13 |
| Infrastructure | The tokenizer (already accepts/rejects per its grammar); a CSV output reporting non-conformant rows |
| Already exists | Tokenizer; existing audit-script patterns in `legacy_data/scripts/` |
| Missing | The linter script |
| Risk | Low. Read-only; produces a CSV like the alias-resolver audits. |

### 6.2 Semantic → operational synthesis
> *"Given semantic notation `spinning ss miraging op osis`, generate the operational form `[clip] > spinning > ss miraging op osis`."*

| | |
|---|---|
| Status | Speculative. Synthesis from semantic to operational is partial: entry bracket and sequence operators are mechanical inserts; some compounds need curator input. |
| Infrastructure | Semantic-form storage; transformation rules per `NOTATION_LAYER_STRATEGY.md` §4.3 |
| Already exists | Semantic parser; modifier-link composition logic |
| Missing | The synthesis pass; curator review of generated operational forms |
| Risk | High. Lossy/incomplete synthesis would produce wrong notation; curator-gated only. |

### 6.3 Curator UI for representation-layer authoring
> *"An admin surface that shows each trick's layers and lets curators fill in missing layer values."*

| | |
|---|---|
| Status | Conceptual. Currently curator-authoring happens via direct DB edit or CSV import. |
| Infrastructure | Admin/internal route per `feedback_internal_only_constraint.md`; per-trick form with 8 layer fields |
| Already exists | Internal-only-route convention; trick-detail data shape |
| Missing | The form UI; service-side write paths |
| Risk | Medium. Internal-only; curator-authorised. The standard `db-write-safety` rules apply. |

---

## 7. Cross-cutting capabilities

### 7.1 The symbolic dashboard
> *"A single page showing dictionary coverage across each representation layer."*

| | |
|---|---|
| Status | Conceptual. A health/coverage view rather than a user-facing surface. |
| Infrastructure | Aggregate counts per layer; current vs target populations |
| Already exists | Per-layer data fields (those that exist) |
| Missing | The dashboard view; the curator-target definition |
| Risk | Low. Read-only; internal-only audience. |

### 7.2 The symbolic-grammar map
> *"A single navigable surface showing every symbolic group, its members, and its crosslinks."*

| | |
|---|---|
| Status | Conceptual. The data exists; the map does not. |
| Infrastructure | Groups + memberships + clusters + crosslinks (all in symbolic-grammar-2 CSVs) |
| Already exists | All data |
| Missing | The map surface (whether tabular, graphical, or hybrid) |
| Risk | Medium. Graph visualisations are easy to over-engineer. Start with a structured tabular index; defer interactive maps. |

### 7.3 Reference-media surfacing on cards
> *"When a trick has reference media (TT series, AnzTrikz, etc.), surface a small media chip on the card."*

| | |
|---|---|
| Status | Adjacent to existing media-storage work. Already present on "By Sets" view. |
| Infrastructure | Media chip on the card (extends `SYMBOLIC_CARD_SPEC.md` shape with optional `referenceMedia` field) |
| Already exists | Media storage adapter; tag-grouped gallery |
| Missing | Optional `referenceMedia` slot on the card; service-layer aggregation per trick |
| Risk | Low. Optional slot; renders only when populated. |

### 7.4 Comparison with FM federation
> *"On a trick-detail page, surface the FM federation parity status: matched, divergent, missing."*

| | |
|---|---|
| Status | Federation track is shipped; surfacing on cards is the next step. |
| Infrastructure | `FM_MATH_DIVERGENCES.csv` (22 rows); per-trick federation status |
| Already exists | Federation data; trick-detail page |
| Missing | The federation status badge on cards / detail pages |
| Risk | Low. Read-only display. |

---

## 8. Dependencies between capabilities

The capabilities above are not all independent. Some unlock others:

| Capability | Depends on |
|---|---|
| 4.1 Symbolic search | 8-layer model populated; alias resolver extension |
| 4.2 Symbolic filters | Shared card + service-shape unification (Tasks E + F) |
| 4.3 Compositional query | 4.2 |
| 4.4 Reverse-lookup | 4.1 + operational normalisation |
| 5.1 Alternate-notation toggle | Layers 2 + 3 + 5 + 6 + 7 populated |
| 5.3 In-card token linking | Tokenizer extension; glossary anchors (shipped) |
| 6.2 Semantic→operational synthesis | Layer 2 + 3 + 4 all present; high curator-review cost |
| 7.2 Symbolic-grammar map | Tasks E + F (the data surfaces underneath) |

**The highest-leverage early capabilities** are 1.1–1.5 (browse-by-component variants), 4.2 (filters), and 5.3 (in-card token linking) — all of these consume already-existing data and ship via UI work only.

**The most expensive capabilities** are 6.2 (semantic→operational synthesis), 2.1 (operational comparison with diff overlay), and 7.2 (symbolic-grammar interactive map). Recommend deferring until earlier capabilities have shipped and observed usage informs the design.

---

## 9. What this list explicitly DOES NOT recommend

Implementation order. The point of this document is to enumerate possibilities, not prioritise them. Prioritisation belongs in a separate roadmap once curator-validation of Batch 1 + Batch 2 designs is complete.

Implementation specs. Each capability above is sketched at the level of "what becomes possible"; none has a complete spec. Each would benefit from its own design pass when chosen.

Implicit promises. Listing a capability here is not a commitment to ship it. The catalogue is exploratory.

---

## 10. The 8-layer model as multiplier

Reading the catalogue back: nearly every capability above either consumes the 8-layer model directly (1.x, 4.x, 5.x, 6.x) or builds on infrastructure that the layer model unifies (2.x decomposition, 3.x progression). The model is the multiplier.

Without the layer model, each capability would invent its own per-feature representation: search would build a denormalised index; filters would build a per-filter shape; decomposition would carry its own structural form. With the layer model, all of these consume one canonical shape — `TrickCardViewModel` extended with populated layer fields — and each capability is a renderer over that shape.

This is what `NOTATION_LAYER_STRATEGY.md` §0 names as *"the conceptual breakthrough that unlocks almost everything downstream."* The catalogue above is the catalogue of "everything downstream."

---

## 11. Constraints honoured

- No implementation; exploratory only
- No canonical-data mutation
- No schema changes proposed (only described as future requirements)
- No prioritisation
- No dev-day estimates
- Each capability respects the boundaries from `GLOSSARY_BOUNDARY_STRATEGY.md` (Task G), the layer model from `NOTATION_LAYER_STRATEGY.md` (Task C), and the card invariant from `SYMBOLIC_CARD_SPEC.md` §1.0 (Task B)

---

## 12. Cross-references

- `SYMBOLIC_CARD_SPEC.md` — the card every capability consumes (Task B)
- `NOTATION_LAYER_STRATEGY.md` — the model every capability builds on (Task C)
- `OPERATIONAL_NOTATION_STYLE_GUIDE.md` — operational normalisation referenced by 4.4, 6.1, 6.2 (Task D)
- `COMPONENT_VIEW_REDESIGN.md` — already implements 1.1–1.5 conceptually (Task E)
- `UNIFIED_DICTIONARY_VIEW_PLAN.md` — the unification capabilities 4.2 + 4.3 lean on (Task F)
- `GLOSSARY_BOUNDARY_STRATEGY.md` — the boundary every capability must respect (Task G)
- `NOTATION_SURFACE_AUDIT.md` — the surface inventory (Task A)
- `exploration/symbolic-grammar-2/` — 62 groups + 11 archetypes + 323 memberships + 18 clusters + 68 crosslinks; the data layer underneath
- `exploration/glossary-synthesis-1/GLOSSARY_ARCHITECTURE_V4.md` — adjacent layer architecture
- `exploration/symbolic-ux-1/` — earlier 7-deliverable UX validation; some capabilities trace back here

---

*End of SYMBOLIC_FUTURE_CAPABILITIES.md*
