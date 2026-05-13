# GLOSSARY_V5_FUTURE_CAPABILITIES

**Project:** GLOSSARY-V5-SYNTHESIS — Task I
**Scope:** Exploratory enumeration of capabilities that become possible once the V5 glossary architecture lands. Each capability is sketched at the level of "what becomes possible" with infrastructure dependencies, status of underlying data, risk notes. **Exploratory only.** No implementation, no prioritisation, no commitment.
**Constraints:** Each capability respects the glossary-vs-dictionary boundary (`GLOSSARY_BOUNDARY_STRATEGY.md`), the parser-editorial separation (`feedback_parser_editorial_separation.md`), and the observational-canonical boundary.

---

## 0. The capability multiplier

The V5 glossary architecture isn't just "v3 with more sections." It introduces:

- A **movement-language primer** (§1–§9) — a teachable, sequential text
- A **symbolic-grammar integration surface** (§7 + §9) — where token roles, topologies, archetypes, and equivalence clusters become visible
- A **traditional reference surface** (§10) extended to cover the full primer vocabulary
- A **community / historical reference surface** (§11) — the folk vocabulary's home
- A **pathway system** (§12) — curated reading orders for different learner needs

Each addition opens capabilities the v3 glossary couldn't support. Most capabilities below assume *both* the V5 architecture AND the broader symbolic-grammar layer (which is already shipped or in progress per DSC-1 + DSC-2). The combination is the multiplier.

---

## 1. Browse + Filter capabilities

### 1.1 Browse all hippy dex tricks
> "Show me every trick where the dex is hippy."

| | |
|---|---|
| Status | Conceptual. The hippy/leggy classification is established in `MOVEMENT_LANGUAGE_PRIMER_DRAFT.md` and `CORE_TRICK_GRAMMAR_DRAFT.md`; the dictionary doesn't yet carry a `dex_class` field. |
| Infrastructure | A `dex_class` axis in the symbolic-grammar layer (similar to topology / archetype); curator-tagged. The component view at `/freestyle/tricks?view=component` can include this axis. |
| Already exists | The hippy/leggy framework; the component view design; the trick card. |
| Missing | Curator tagging of each base trick + each compound trick by its primary dex class. |
| Risk | Low. Read-only; observational layer (`dex_class` is not canonical). |

### 1.2 Browse all leggy dex tricks
Same as 1.1, opposite axis value. Same infrastructure dependencies.

### 1.3 Browse all spinning compounds
> "Show me every trick that contains spinning as a modifier."

| | |
|---|---|
| Status | Foundation already exists. `symbolic_modifier_groups.csv` lists `spinning-family` members. The component view at `?view=component#spinning` will browse them once Task E of DSC-1 ships. |
| Infrastructure | Existing `symbolic_modifier_groups.csv`; the component view in `COMPONENT_VIEW_REDESIGN.md`. |
| Already exists | All data; the component-view design. |
| Missing | UI implementation of the component view (deferred to DSC-2 slice 3). |
| Risk | Low. |

### 1.4 Browse all butterfly-wing-topology tricks
> "Show me every trick where the dex finishes with a hippy out shape on a clipper destination."

| | |
|---|---|
| Status | Foundation exists. `symbolic_topology_groups.csv` defines `butterfly-wing-topology`. |
| Infrastructure | Existing topology registry; component view; trick card. |
| Already exists | Topology memberships in `symbolic_group_membership.csv`. |
| Missing | Component view implementation. |
| Risk | Low. |

### 1.5 Browse all whirl-rotational topology tricks
Same as 1.4, opposite topology. Same infrastructure.

### 1.6 Browse all unusual-surface tricks
> "Show me tricks that catch on a surface other than toe / clipper / inside / outside / knee."

| | |
|---|---|
| Status | Partial. The operational notation tokenizer already classifies `unusual_surface` tokens. A curator-defined symbolic group `unusual-surface-topology` (or similar) would consolidate the membership. |
| Infrastructure | Tokenizer classification (shipped); new symbolic group registry row; component view. |
| Already exists | Token classification; component view design. |
| Missing | Curator group definition + memberships. |
| Risk | Low. |

### 1.7 Compositional filter
> "Show me all 4-ADD butterfly-family tricks that use ducking."

| | |
|---|---|
| Status | Conceptual. Filter UI for the dictionary doesn't exist yet. |
| Infrastructure | Multi-axis filter chips on `/freestyle/tricks`; service-side composition over family + ADD + symbolic-group memberships. |
| Already exists | All filter data exists in the dictionary + symbolic-grammar layers. |
| Missing | UI for multi-axis filter; service shape for composed-query. |
| Risk | Medium. UI complexity scales with filter axes; start with 3 axes. |

---

## 2. Decomposition + reading capabilities

### 2.1 Decomposition tree
> "Show me Mobius decomposed all the way down to its base + modifiers, visually."

| | |
|---|---|
| Status | Conceptual. The decomposition data is partly shipped via the editorial-decomposition shape; visualisation surface does not exist. |
| Infrastructure | Existing parser + editorial decomposition; new "tree view" template that walks the decomposition. |
| Already exists | Decomposition data per trick. |
| Missing | Tree-rendering UI; cross-references from the dictionary trick page. |
| Risk | Low. Read-only visualisation. |

### 2.2 Symbolic reading exercise
> "Quiz me on reading a trick's notation."

| | |
|---|---|
| Status | Conceptual. An interactive teaching surface that shows a notation string and asks the reader to identify its components. |
| Infrastructure | New `/freestyle/learn/notation-quiz` route (or similar); quiz state held in-page (no auth needed); curator-authored quiz items. |
| Already exists | Notation rendering; the primer's pedagogical framework. |
| Missing | Quiz UI; curator-authored items. |
| Risk | Medium. Interactive features are larger UI scope than the rest of the V5 surfaces; defer until the static glossary lands. |

### 2.3 Folk-name decoder
> "Type in a folk name (Mobius, Phoenix, Blur), see its decomposed reading."

| | |
|---|---|
| Status | Conceptual. The 8-layer representation model formalises this. |
| Infrastructure | A small search box that resolves a name to a slug + the trick's representation-layer fields. |
| Already exists | The alias resolver and dictionary trick pages. |
| Missing | A dedicated decoder surface; alternatively, this is *just* the dictionary trick page in detail-density mode (per `SYMBOLIC_CARD_SPEC.md` §8.3), which already shows decomposed readings. |
| Risk | Low. May not need a separate surface — the trick-detail page covers most of this. |

---

## 3. Progression + topology maps

### 3.1 Progression map for the walking family
> "Show me how the walking family steps build up to phoenix."

| | |
|---|---|
| Status | Already shipped. `/freestyle/progression/walking-family` is live. |
| Infrastructure | Existing walking-progression service + template. |
| Already exists | Everything. |
| Missing | Nothing — this capability already works. |
| Risk | None. |

### 3.2 Generated progression chains
> "Generate a 5-step progression from butterfly to montage."

| | |
|---|---|
| Status | Conceptual. Hand-authored chains exist; algorithmic generation does not. |
| Infrastructure | A graph walker over topology + archetype memberships; curator review of generated chains before publication. |
| Already exists | Equivalence clusters describe structural neighbourhoods. |
| Missing | The generator; the curator-review workflow. |
| Risk | Medium. Generated content carries different curator policy than hand-authored. |

### 3.3 Topology adjacency map
> "Show me how the whirl-rotational topology relates to the osis-rotational topology."

| | |
|---|---|
| Status | Conceptual. Data exists; surface does not. |
| Infrastructure | Topology groups + equivalence clusters + crosslinks (all in `symbolic-grammar-2`). |
| Already exists | All data. |
| Missing | A visualisation surface — recommended initial form is a **table-based adjacency view** (not an interactive graph) for first-iteration simplicity. |
| Risk | Medium. Graph visualisations are over-engineering-prone; start with a tabular view. |

### 3.4 Topology lens on the trick-detail page
> "On Mobius's detail page, show topologies + archetypes Mobius belongs to."

| | |
|---|---|
| Status | Partial. The related-topology panel already ships on 8 flagship trick pages (`UX-SHIP-1` Phase 4). |
| Infrastructure | Existing panel; allow-list expansion is a one-line constant. |
| Already exists | Panel + memberships data. |
| Missing | Allow-list expansion to all qualifying trick pages; modifier-family parallel panel ("modifiers used"); archetype parallel panel. |
| Risk | Low. Pattern is established. |

---

## 4. Search + symbolic-equivalence capabilities

### 4.1 Symbolic search
> "Type 'spinning' into search; surface every trick that contains spinning at any representation layer."

| | |
|---|---|
| Status | Foundational; partial via the alias resolver. |
| Infrastructure | An index over all 8 representation layers; extended alias resolver in `glossaryAnchors.ts` / a new search service. |
| Already exists | Canonical-name + alias resolution. |
| Missing | Layer 2 / 3 / 4 / 6 / 7 indexing; query parser that recognises operational-notation fragments. |
| Risk | Medium. Tolerant matching is the hard part; user-input notation rarely matches canonical form exactly. |

### 4.2 Symbolic equivalence reveal
> "Show me that 'gyro torque' and 'mobius' refer to the same trick."

| | |
|---|---|
| Status | Conceptual. The 8-layer model formalises the equivalence. |
| Infrastructure | The representation-layer fields populated; a small inline disambiguator that surfaces the equivalence when a user searches. |
| Already exists | The conceptual framework. |
| Missing | Curator-authored layer-2 (semantic compressed) data for the equivalence-distinct tricks (~10 priority compounds). |
| Risk | Low. Curator-led data entry. |

### 4.3 Reverse-lookup from operational notation
> "Paste `[clip] > spinning > ss miraging op osis` into search; system returns Mobius."

| | |
|---|---|
| Status | Conceptual. |
| Infrastructure | Normalisation + an operational-notation-keyed index. |
| Already exists | Operational notation column on populated tricks. |
| Missing | The index; tolerant matcher. |
| Risk | Medium. |

---

## 5. Glossary-specific capabilities

### 5.1 Pathway-driven reading with anchored progress (static)
> "I declared 'I'm new'; the glossary shows me §1 → §3 → §5 as a clear sequence."

| | |
|---|---|
| Status | Conceptual; addressed in `GLOSSARY_V5_NAVIGATION.md` §2.2 as static pathways. |
| Infrastructure | The pathway picker; deep-anchored URLs; "Next" footers at section boundaries. |
| Already exists | All design specified. |
| Missing | The UI implementation (curator-authored pathway content + the pathway picker template). |
| Risk | Low. Pure static HTML. |

### 5.2 Pathway-driven reading with client-side progress tracking
> "Same as 5.1, but the page remembers which sections I've read."

| | |
|---|---|
| Status | Deferred. V5 navigation specifies static pathways (no JS); this is a future enhancement. |
| Infrastructure | Client-side localStorage; small JS for progress marking. |
| Already exists | Static pathways. |
| Missing | The JS layer; curator decision on whether tracking adds value. |
| Risk | Low (additive); curator decision-cost is moderate. |

### 5.3 Inline term tooltips
> "Hover over 'paradox' in the primer; see its §10 definition without leaving the page."

| | |
|---|---|
| Status | Conceptual. Tokens already carry `title` attributes for tooltips. |
| Infrastructure | The `title` attribute machinery already exists on `op-token` spans; extending it to inline primer terms is a small CSS + curator content task. |
| Already exists | Tooltip infrastructure. |
| Missing | Curator-authored inline definitions for primer terms; CSS for tooltip rendering on hover/focus. |
| Risk | Low. Progressive enhancement; works without JS. |

### 5.4 Reading exercises within the primer
> "After §1, give me a short exercise to verify I understood the skeleton."

| | |
|---|---|
| Status | Conceptual. Within-primer exercises would be a major addition to the architecture. |
| Infrastructure | Curator-authored exercise items + an in-page exercise template. |
| Already exists | The primer prose. |
| Missing | Exercise items; UI; curator review of pedagogical correctness. |
| Risk | High. Educational interactivity is a different problem space than reading; defer until the V5 reading surface is well-validated. |

---

## 6. Movement-language lesson capabilities

### 6.1 Modifier-family page expansion
> "Add modifier-family pages for atomic, nuclear, alpine, etc."

| | |
|---|---|
| Status | Conceptual; pattern established by spinning / paradox / ducking pages. |
| Infrastructure | Existing modifier-family service + template; consistent pedagogy framework. |
| Already exists | The pattern. |
| Missing | Curator-authored content per modifier (mechanical lead, anchor sentence, common confusions, progression, cross-base examples, related modifiers). |
| Risk | Low. Same pattern, more pages. |

### 6.2 Walking-family progression for other families
> "Add progression chains for the whirl family, mirage family, osis family."

| | |
|---|---|
| Status | Conceptual; pattern established by the walking-family progression. |
| Infrastructure | Existing progression service + template; same shape. |
| Already exists | The pattern. |
| Missing | Curator-authored chains per family. |
| Risk | Low. Same pattern, more pages. |

### 6.3 "Read this trick" interactive
> "Given an operational notation, walk me through it token by token."

| | |
|---|---|
| Status | Conceptual. An interactive companion to §7's worked examples. |
| Infrastructure | New route; in-page state for "which token is currently highlighted"; curator-authored walkthrough text per token. |
| Already exists | The notation tokenisation. |
| Missing | The interactive surface. |
| Risk | Medium. Interactive features add scope; defer until the static primer is validated. |

### 6.4 Notation glossary cross-reference (token → glossary)
> "Each token in a rendered notation links to its glossary entry."

| | |
|---|---|
| Status | Conceptual; sketched in `SYMBOLIC_CARD_SPEC.md` §7. |
| Infrastructure | Each tokenizer-emitted token carries a `linkHref` to its glossary anchor. |
| Already exists | Tokens; glossary anchors. |
| Missing | The `linkHref` per token; the wiring in the symbolic-card partial. |
| Risk | Low. |

---

## 7. Community + folk vocabulary capabilities

### 7.1 Deprecation pathway tracker
> "Show me which folk names have canonical replacements vs which remain unresolved."

| | |
|---|---|
| Status | Conceptual. §11's deprecation entries are the data; a summary surface exposes them. |
| Infrastructure | Curator-tagged status (deprecated / canonical-replacement / ambiguous / specialized) on each §11 entry; a summary view. |
| Already exists | The §11 architecture. |
| Missing | Curator tagging; the summary view. |
| Risk | Low. |

### 7.2 PassBack-to-IFPA mapping table
> "I came from PassBack; show me which terms are the same and which differ."

| | |
|---|---|
| Status | Conceptual. The `GLOSSARY_COMPARISON_MATRIX.csv` from `glossary-synthesis-1` is the underlying data. |
| Infrastructure | The matrix surfaced as a readable table; one entry per PassBack term + IFPA equivalent. |
| Already exists | The matrix data. |
| Missing | The reader-friendly surface (curator-edited from the matrix CSV). |
| Risk | Low. |

---

## 8. Cross-cutting capabilities

### 8.1 Curator UI for glossary entry authoring
> "An internal admin surface for adding / editing §10 entries."

| | |
|---|---|
| Status | Conceptual. Currently glossary content is in `src/views/freestyle/glossary.hbs` (static template). |
| Infrastructure | Internal-only route per `feedback_internal_only_constraint.md`; per-entry form with anchor management; write paths to a glossary-content store (or back to the template). |
| Already exists | Internal-only conventions; the template. |
| Missing | The form UI; write paths. |
| Risk | Medium. Internal-only; curator-authorised. The `db-write-safety` rules apply. |

### 8.2 Glossary entry health dashboard
> "Show me every term that has a primer reference but no §10 entry (or vice versa)."

| | |
|---|---|
| Status | Conceptual. The dual-surface contract from `TRADITIONAL_GLOSSARY_PRESERVATION_PLAN.md` §8 implies consistency invariants. |
| Infrastructure | A static audit script that walks the glossary HTML + the §10 entries + the anchor resolver, reports inconsistencies. |
| Already exists | The convention. |
| Missing | The audit script. |
| Risk | Low. Read-only audit; internal-only output. |

### 8.3 Anchor stability audit
> "List every anchor referenced by the rest of the site; flag any missing from the glossary."

| | |
|---|---|
| Status | Conceptual. Glossary anchors are public API; their stability is critical. |
| Infrastructure | A static audit script that walks `src/` for `/freestyle/glossary#...` references; cross-checks against the live anchors. |
| Already exists | The resolver. |
| Missing | The audit script. |
| Risk | Low. Read-only audit. |

### 8.4 Federation glossary export
> "Generate a PassBack-format or FM-format export of the IFPA glossary."

| | |
|---|---|
| Status | Adjacent to the federation track. |
| Infrastructure | The 8-layer representation model's PassBack / FM rendering layers (layer 6, layer 7); a serialiser. |
| Already exists | The federation track. |
| Missing | The serialiser; curator review of generated output. |
| Risk | Low. Read-only export. |

---

## 9. Dependencies between capabilities

Some capabilities unlock others. A rough map:

| Capability | Depends on |
|---|---|
| 1.1 Browse hippy dex | Curator dex-class tagging |
| 1.7 Compositional filter | Component view UI + filter framework |
| 2.1 Decomposition tree | Decomposition data + tree-rendering template |
| 2.2 Reading-exercise quiz | Static glossary shipped + curator items |
| 3.3 Topology adjacency map | Topology + cluster data (shipped) + tabular view template |
| 4.1 Symbolic search | 8-layer model populated + tolerant matcher |
| 4.3 Reverse-lookup from notation | Symbolic search + normalisation |
| 5.4 Reading exercises in primer | Static primer shipped + curator items |
| 6.3 Read-this-trick interactive | §7 notation primer shipped + curator walkthroughs |
| 6.4 Token-glossary cross-link | Tokenizer `linkHref` extension |

**Highest-leverage early capabilities:**

- 1.3 / 1.4 / 1.5 (browse all spinning / butterfly-wing / whirl-rotational tricks) — already half-shipped via the component view design
- 3.4 (topology lens on trick-detail) — allow-list expansion is a one-line constant change
- 5.3 (inline term tooltips) — progressive enhancement, no infrastructure new work
- 6.1 (more modifier-family pages) — same pattern as shipped ones
- 6.2 (more progressions) — same pattern as the walking-family progression
- 6.4 (token-glossary cross-link) — small tokenizer extension + cross-link wiring

**Most expensive capabilities:**

- 2.2 (interactive reading-exercise quiz) — interactive surface is a different scope
- 3.2 (algorithmic progression generation) — curator-policy + generation logic + review workflow
- 4.3 (operational-notation reverse-lookup) — tolerant matching is the hard problem
- 5.4 (reading exercises within the primer) — interactive scope
- 6.3 (read-this-trick interactive) — interactive scope

---

## 10. Implementation-order constraints

This document explicitly does NOT propose an implementation order. Prioritisation requires:

- Observed reader behaviour after V5 ships (which sections do readers spend time on?)
- Curator review of which capabilities serve which learner needs
- Engineering capacity assessment
- Cross-track coordination (some capabilities — like federation glossary export — touch the FootbagMoves federation track)

The enumeration is exploratory. The curator + engineering team picks the order when V5 ships.

---

## 11. The capability multiplier — recap

Many capabilities above are surface-level UI work over already-existing data. The substantial infrastructure investments — the symbolic-grammar layer, the representation-layer model, the modifier-family pages, the walking-family progression, the operational-notation tokenizer, the glossary-anchor resolver — are all shipped or close to shipped.

The V5 architecture provides the *framework* that makes these capabilities expressable to readers. The infrastructure is the *materials*. The combination is the multiplier: each piece of shipped infrastructure becomes accessible to readers through the V5 surfaces.

This is the conceptual through-line: **V5's job is to make existing infrastructure visible to readers in a way they can use.** The capabilities above are what becomes possible once that visibility is in place.

---

## 12. Constraints honoured

- Exploratory only; no implementation
- No prioritisation
- No dev-day estimates
- No curator commitment to any specific capability
- Glossary-vs-dictionary boundary respected on every capability
- Parser-editorial separation respected (no capability proposes parser-internal logic in the glossary)
- Observational-canonical boundary respected (every capability that surfaces symbolic relationships does so as observation, not as canonical override)
- No PassBack wording reproduced

---

## 13. Cross-references

- `GLOSSARY_V5_ARCHITECTURE.md` — the V5 architecture every capability builds on
- `SYMBOLIC_GLOSSARY_INTEGRATION.md` — defines what symbolic content is surfaced; capabilities respect this boundary
- `TRADITIONAL_GLOSSARY_PRESERVATION_PLAN.md` — the §10 / §11 architecture audit capabilities check against
- `GLOSSARY_V5_NAVIGATION.md` — the navigation surface several capabilities lean on
- `exploration/dictionary-symbolic-card/SYMBOLIC_FUTURE_CAPABILITIES.md` — the parallel future-capabilities enumeration for the dictionary
- `exploration/dictionary-symbolic-card/NOTATION_LAYER_STRATEGY.md` — the 8-layer representation model many capabilities consume
- `exploration/symbolic-grammar-2/` — the underlying data layer
- `feedback_internal_only_constraint.md` — curator UI capabilities respect this constraint

---

*End of GLOSSARY_V5_FUTURE_CAPABILITIES.md*
