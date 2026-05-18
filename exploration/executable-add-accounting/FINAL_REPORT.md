# Executable ADD Accounting — Final Report

**Status:** Planning artifact. Synthesis of deliverables D1-D6. No implementation in scope.

**Date:** 2026-05-18

---

## Executive summary

Executable ADD Accounting is a feasible, low-risk, high-pedagogical-value future feature for the freestyle subsystem. It surfaces the implicit per-component breakdown that produces each trick's ADD total — turning "butterfly = 3 ADD" from a memorized fact into a derivable result. The Phase-1 MVP is a single content module + one expander component on trick-detail pages, gated by silent suppression for doctrine-unresolved cases.

**Recommendation: pursue Phase 1.** The implementation complexity is low, the doctrine risk is structurally contained, the parser-architecture rules are clean, and the marquee teaching moment (mobius double-spin emergence) is a single-render demonstration of the entire feature's value.

**MVP scope: 5-trick lead cohort → 20-trick public release.** Lead with mobius, then ripple to butterfly / whirl / osis / torque, then expand to walking-family + gyro-family. Estimated 20-30 tricks comfortably renderable in Phase 1.

**Phase-1 ship does NOT depend on Wave-2 doctrine resolution.** The accounting layer respects the existing doctrine boundary by suppressing silently on the ~60-80 Wave-2-sensitive compounds. The renderable cohort is bounded but substantial; the feature does not need Red availability to ship.

---

## What was produced

Seven planning artifacts, ~3400 lines total, all at `exploration/executable-add-accounting/`:

| File | Role | Lines |
|---|---|---|
| `executable_add_accounting_concept.md` | Framing + three locked decisions | ~260 |
| `add_bearing_symbol_inventory.csv` | 63-token accounting vocabulary | 64 rows |
| `add_bearing_symbol_inventory_notes.md` | D2 grouping analysis + report | ~340 |
| `compressed_atom_expansion_map.md` | Per-trick decomposition reference | ~540 |
| `wave2_sensitive_accounting_cases.md` | Doctrine-unresolved register (26 entries) | ~620 |
| `prototype_accounting_render_examples.md` | Render-shape exploration + bad-example catalog | ~720 |
| `educational_mode_ui_brainstorm.md` | UI surface mockups + Phase-1 / Phase-2 surface inventory | ~720 |

Plus this final report.

---

## The three locked decisions (recap)

**Decision 1 — Surface architecture: B → C, no A initially.**
Phase 1 = per-trick expander on `/freestyle/tricks/:slug`. Phase 2 = glossary + add-analysis integration. Phase 3 = standalone derivation page NOT pursued.

**Decision 2 — Wave-2 doctrine boundary: suppress entirely.**
Tricks whose decomposition depends on unresolved doctrine (paradox internals, symposium internals, ducking, barraging, fairy weighting, hidden X-dex doctrine) render no derivation panel. Trick pages render normal layout + editorial ADD chip. No "pending Red ruling" copy on trick pages.

**Decision 3 — Precedence: editorial > curator-map > parser.**
Editorial `asserted_adds` is authoritative. Curator-maintained breakdown is the render content. Parser is consistency-check only — never authoritative, never user-facing.

---

## Educational value assessment

### Where the value is highest

The marquee teaching moments cluster around **hidden-component emergence**:

| Trick / pairing | The aha moment | Hidden components revealed |
|---|---|---|
| **mobius** | Two distinct spins — gyro contributes one; torque inherits another | 5 |
| osis | Mirage-dex is one compound unit, not two | 3 |
| torque | Torque is osis + spin | 4 |
| whirl + butterfly side-by-side | Same components, different mechanical order | 3 |
| ripwalk + dimwalk side-by-side | Same accounting, different modifier (modifier-set-collapse rule) | 4 |
| reverse-whirl | Positional markers carry zero weight | 3 (+ context) |

**Educational density rule observed:** the value rises with hidden-component count. Atoms with 3+ hidden components deliver the strongest "aha." Single-component atoms (toe-stall, clipper-stall, pickup) deliver nothing and are correctly suppressed (Class B).

### Where the value is bounded

- **Atom-only ADD = 1 cases** (toe-stall, clipper-stall, pickup): no hidden accounting; rendering teaches nothing. ~3 tricks suppressed silently.
- **Wave-2-sensitive compounds**: no curator-attributable breakdown; suppression honors doctrine. ~60-80 compounds suppressed silently.
- **Tricks rarely visited**: low traffic; high authoring cost per pedagogical hour. Cover only if part of a family that's already being authored.

### Educational value vs cost

The 20-30 renderable Phase-1 cohort delivers the bulk of pedagogical value. Going beyond ~30 tricks in Phase 1 has diminishing returns — most marginal additions are family-extensions of already-illustrated patterns.

**Recommendation:** stop authoring after the gyro-family + walking-family cohorts. Re-evaluate after public ship.

---

## Doctrine-risk assessment

### What's protected

| Risk | Protection |
|---|---|
| Anchoring an unconfirmed paradox decomposition in user memory | Silent suppression (Decision 2) |
| Hardcoding fairy weighting in compound contexts | Inventory `wave2_sensitive=true` on fairy in U5 cluster |
| Inventing a multiplier convention for revolution-counting | Eggbeater / DATW / TATW in U8 cluster — suppressed |
| Force-resolving drifter manifestation | Contextual classification (U7) — suppressed |
| Editorial / curator-map drift | Diagnostic emission on disagreement; suppress panel on mismatch |
| Parser drift overriding editorial truth | Architecture C rejected; parser is consistency-check only |
| Public render anchoring Wave-2 doctrine | Trick pages stay silent; `/freestyle/add-analysis` is the doctrine-status home |

### What's NOT protected (acknowledged)

| Risk | Mitigation status |
|---|---|
| Silent suppression confusion (users don't realize derivation exists on some pages but not others) | Mitigated in Phase 2 via glossary teaching surfaces; unmitigated between Phase-1 ship and Phase-2 ship |
| Curator burnout from 26-entry Wave-2 register | Register is the *why*; production gating reads only the inventory `wave2_sensitive` column |
| Stale register entries as Red rulings land | Doc-sync skill catches inventory ↔ register divergence; requires diligent change-set discipline |
| Component-glossary entries missing for xbody / set / mirage-dex | Doc-sync identifies at implementation time; curator adds in same change set |

### Doctrine-risk verdict

**Contained.** The architectural posture (Decision 2 + Decision 3) reduces the surface area of doctrine-related risks to "users don't realize a feature exists on some pages." That is an acceptable trade for the educational value the renderable cohort delivers.

---

## Feasibility assessment

### Implementation complexity: LOW

The Phase-1 MVP touches:

| Component | Estimated scope |
|---|---|
| New content module `src/content/freestyleAddAccounting.ts` | ~200 lines (20-trick cohort) |
| Existing service shaping in `src/services/freestyleService.ts` — `getTrickDetail` extension | ~50 lines |
| New Handlebars partial `src/views/partials/freestyle-add-derivation.hbs` | ~30 lines |
| New CSS in `src/public/css/style.css` | ~40 lines |
| Component-glossary cross-links in the partial | ~10 lines |
| Integration tests for renderable + suppressed cases | ~150 lines, 8-10 specs |
| Glossary §3 entries (if missing) for xbody / set / mirage-dex | curator-authored, small |

**Total: ~500 lines across ~6 files.** Single slice, no architectural changes, no schema work, no migration.

### Schema risk: ZERO

No DB schema changes. The curator-map is a TypeScript content module — same pattern as `freestyleResolvedFormulas.ts`.

### Ontology risk: ZERO

Read-only render. The accounting layer reads editorial `asserted_adds` and curator-authored breakdowns; it does not write to canonical tables, the alias graph, the operator board, or the equivalence registry.

### Curator-effort risk: MEDIUM

Authoring the 20-trick lead cohort requires the curator to:

1. Confirm per-atom internal-component breakdowns (12 atoms; orbit pending).
2. Confirm operator-to-component manifestation rules (stepping → set, gyro → spin, etc.).
3. Confirm component order per atom (butterfly vs whirl distinction).
4. Confirm `mirage-dex` granularity (one unit, not two — concept doc Open Q3).
5. Author the curator-map content for ~20 tricks.

Estimated effort: a focused curator session of a few hours. Not blocking; curator-paced.

### Test-coverage risk: LOW

The existing trick-detail integration tests provide the scaffolding. New specs:

- Renderable trick: panel renders with N component rows and correct total
- Suppressed trick (Class B, ADD ≤ 1): no panel
- Suppressed trick (Class D, Wave-2): no panel
- Class C trick: panel renders with context caption
- Component-glossary link presence
- Mobile-collapse behavior (assertable via DOM presence)

~8-10 new specs. Standard pattern.

### CI risk: LOW

No new build steps. Convention gate already supports content modules. The accounting render path is new but follows existing patterns; the existing CI pipeline catches drift via standard build + type-check + test.

### Build-time gate (optional)

A build-time diagnostic emitter (curator-map vs editorial total disagreement) could be added as a CI check. Phase-1-deferrable — can ship without, add later.

### Feasibility verdict

**Phase 1 is the smallest meaningful surface this feature can ship at.** Lower-cost alternatives (e.g., glossary-only without trick-page) would lose the per-trick "aha" moment that justifies the whole feature.

---

## Parser dependencies

### Parser plays no authoritative role

Per Decision 3, the parser is a consistency-check signal — never authoritative, never user-facing. The accounting layer reads `freestyle_tricks.asserted_adds` (editorial) and the curator-map (content module). Parser output is consulted only by curator workbench (deferred to Phase 2).

### Parser disagreements that are EXPECTED and HARMLESS

| Pattern | Why parser disagrees | Handling |
|---|---|---|
| Parser splits `mirage-dex` into `mirage + dex` | Parser tokenizes at the modifier boundary | Curator-map is authoritative; parser disagrees → total-only check tolerates |
| Parser names set-component as "stepping" | Parser uses notation tokens, not accounting components | Total-only check tolerates |
| Parser computes ADDs for Wave-2 compounds | Parser doesn't know about doctrine | Suppression gates on inventory `wave2_sensitive=true`, NOT parser silence |
| Parser produces different component order | Parser may sort alphabetically | Component order is curator-map authoritative |

### Parser disagreements that should emit DIAGNOSTICS

| Pattern | Action |
|---|---|
| Curator-map total ≠ editorial `asserted_adds` | Suppress panel + emit curator-only diagnostic |
| Parser total ≠ editorial `asserted_adds` AND curator-map agrees with editorial | Informational; not actionable; not user-facing |
| Curator-map present for a trick marked `wave2_sensitive=true` | Build-time warning; possible curator-map error |

### Architecture C reaffirmed-rejected

The parser does NOT seed the curator-map. The curator-map is hand-authored. Parser metadata flowing into the accounting render path is permanently forbidden per [[feedback_parser_editorial_separation]].

### Parser future work: none required

Phase-1 ships without any parser changes. Phase-2 may surface parser-disagreement counts on the curator workbench but does not require parser improvements.

---

## Recommended future sequencing

### Phase 1 — per-trick expander (B)

| Step | Owner | Effort | Output |
|---|---|---|---|
| Curator confirms 12-atom internal breakdowns (orbit pending) | curator | low | atom decomposition table ratified |
| Curator confirms operator manifestation rules (stepping → set, etc.) | curator | low | manifestation table ratified |
| Glossary §3 entries added for xbody / set / mirage-dex (if missing) | curator + implementer | low | glossary entries live |
| Author `freestyleAddAccounting.ts` content module with 20-trick lead cohort | implementer | medium | content module shipped |
| Add `getTrickAddDerivation()` service method | implementer | low | service method shipped |
| Add Handlebars partial for derivation panel | implementer | low | partial shipped |
| Add CSS for panel styling | implementer | low | styles shipped |
| Add component-glossary cross-links | implementer | low | links live |
| Add Class-C context-caption logic | implementer | low | captions render |
| Add integration tests (renderable + suppressed + context-caption + mobile) | implementer | medium | ~10 new specs |
| Mobile responsive validation | manual review | low | layout confirmed |
| Accessibility validation (keyboard, screen reader) | manual review | low | a11y confirmed |
| Ship Phase 1 | — | — | feature live on `/freestyle/tricks/:slug` |

**Phase-1 ship criteria:** all 9 success criteria from the concept doc (≥20 trick cohort, no canonical mutation, mobile-safe, accessibility-compliant, no parser changes, etc.).

### Tier-1 quick wins (post-ship; curator-paced)

Following Phase-1 ship, resolve Tier-1 Wave-2 quick wins to unblock additional tricks:

1. **Orbit baseline** — single curator decision; unblocks orbit + reverse-orbit + gyro-orbit + orbit-family compounds.
2. **Ducking manifestation** — single curator decision; unblocks ducking-butterfly + pixie-ducking-butterfly + ducking-osis + ducking-whirl.
3. **Smear data** — curator review of existing dictionary sources.
4. **Fairy compound weighting** — per-compound curator decisions on FAIRY DRIFTER, FAIRY ATOMIC.

Each adds 3-5 tricks to the renderable cohort.

### Phase 2 — glossary integration (C)

After Phase 1 stabilizes:

| Step | Output |
|---|---|
| Glossary §3 component entries enhanced with ADD context | per-component accounting role surfaced |
| Glossary §7 symbolic-notation accounting subsection | worked examples (lead: mobius) |
| Glossary §8 walking-family side-by-side layout | modifier-set-collapse callout |
| `/freestyle/add-analysis` enrichment | derivation rendering in resolved-formula blocks; Wave-2 doctrine-status content |
| Mobile inheritance-annotation secondary disclosure | "Where does each part come from?" tap-to-reveal |
| Curator workbench (`/internal/freestyle/accounting-diagnostics`) | suppression queue + disagreement diagnostics — possibly deferred |

### Tier-2 / Tier-3 Wave-2 unblockings

Curator-paced; ROI per the D4 cluster-impact analysis:

- Tier 2 (medium complexity): drifter manifestation table, multiplier convention, blender weighting.
- Tier 3 (Red-ruling territory): barraging internals, blurry decomposition, symposium internals, paradox internals, atomsmasher.

U1 (paradox internals) is the single highest-impact Red unblock — 20+ compounds + downstream U4 cascade.

### Phase 3 / deferred

Per Decision 1, Architecture A (standalone `/freestyle/derivation` page) is NOT pursued initially. Revisit only if Phase 2 surfaces sustained demand.

Other deferred surfaces: search-by-derivation, "build a trick" composer, derivation diff view, component-frequency analytics.

---

## Minimum viable prototype recommendation

### The smallest shippable Phase-1 surface

**Lead cohort: 5 tricks.** Author these first as a validation pass:

1. **mobius** — the marquee teaching case (double-spin emergence)
2. **butterfly** — foundational atom; component-order distinction
3. **whirl** — foundational atom; paired teaching with butterfly
4. **osis** — first mirage-dex appearance
5. **torque** — first compound-atom inheritance

Validation pass: confirm the render shape works, accessibility holds, mobile reduction is clean, component-glossary links land correctly.

### After validation: 15 more tricks

Author the rest of the public-release cohort once the lead cohort is confirmed:

- **Walking family** (5): ripwalk, dimwalk, sidewalk, matador, nuclear-butterfly
- **Gyro family** (3): gyro-whirl, gyro-osis, gyro-illusion (mobius is gyro-torque, already covered)
- **Mirage family** (2): miraging-butterfly, miraging-osis (= torque, already covered)
- **Other atoms** (3): atw, mirage, illusion
- **Reverse variants** (2): reverse-whirl (Class C), reverse-atw (Class C)

### Total public-release scope

**20 tricks.** Comfortably within the concept-doc Phase-1 success criterion ("≥ 20 tricks").

### What ships in MVP

1. `freestyleAddAccounting.ts` content module with 20 entries.
2. Per-trick expander on `/freestyle/tricks/:slug` pages — opt-in, click-to-expand, no animation.
3. Silent suppression for Class B (atom-only ADD ≤ 1) + Class D (Wave-2 / contextual / insufficient data).
4. Class-C context caption ("Context: reverse") for tricks with positional / timing markers.
5. Component-glossary cross-links (xbody / set / mirage-dex / stall / dex / spin) — requires glossary §3 entries to exist.
6. Mobile-responsive layout (inheritance annotations hide on phones in Phase 1).
7. Keyboard / screen-reader / contrast support.
8. Integration tests covering renderable, suppressed-B, suppressed-D, Class-C, and component-link presence.

### What does NOT ship in MVP

- Curator workbench / diagnostics dashboard — Phase 2 / deferred.
- Glossary §3 / §7 / §8 accounting surfaces — Phase 2.
- `/freestyle/add-analysis` enrichment — Phase 2.
- Animation / transitions — never (in keeping with the "no animation" decision).
- Mobile tap-to-reveal for inheritance annotations — Phase 2.
- Hover-reveal glossary mini-cards — Phase 2 / deferred.
- Standalone derivation page — not pursued.
- Search by derivation — Phase 3+.
- Composer / interactive builder — never (ontology-authority risk).

### MVP go/no-go gates

Phase 1 ships when:

| Gate | Pass criterion |
|---|---|
| Curator-map content authored | 20 trick entries with curator-confirmed breakdowns |
| Glossary §3 entries present | xbody, set, mirage-dex (and any others linked) exist |
| Tests pass | `npm test` clean; ≥ 8 new specs covering accounting paths |
| Build clean | `npm run build` no errors; convention gate clean |
| Mobile responsive | manual browser check at 375px width; layout confirmed |
| Accessibility | keyboard nav + screen reader spot-check on mobius |
| Doc-sync | VIEW_CATALOG / SERVICE_CATALOG updated for new partial / service method |
| Suppression sanity | Class B + Class D trick pages render normally with no derivation panel |

---

## Open questions for curator

Carried forward from D1-D6. These need curator decisions before MVP authoring proceeds:

1. **Orbit baseline ADD components** (concept doc Open Q1; D3 A1; D4 A1). Does orbit decompose to `spin(+1) + stall(+1) = 2` or something else?

2. **Mirage-dex granularity** (concept doc Open Q3; D2 inventory; D3). Locked as one unit in current artifacts. Confirm before MVP.

3. **Mobius pre-Red ruling** (D3 Case 3). The ruling is "approximately equal" (≈), not strict equality. Confirm whether mobius carries any additional component beyond `gyro torque` before this row hardens.

4. **Single-component atom suppression rule** (concept doc Open Q2; D3 Section 1; D5 §11). Locked: atoms with ADD ≤ 1 suppress. Confirm acceptable.

5. **Drifter manifestation per-compound table** (D3 Section 4; D4 U7). Lock the table OR ratify continued suppression for all drifter compounds.

6. **Eggbeater multiplier convention** (D3 Case 8; D4 U8). Establish notation OR ratify continued suppression.

7. **Smear classification** (D3 Case 11; D4 T6). Confirm family-base from existing dictionary sources OR ratify continued suppression.

8. **Component vocabulary in glossary §3** (D6 Surface 2). Does §3 need new entries for xbody / set / mirage-dex, or are existing entries sufficient? Doc-sync to verify at implementation time.

9. **Operator-board cross-link policy** (concept doc Open Q5). Does the derivation panel link out to the operator board when a component (e.g. torque) appears there? Recommend: not in Phase 1; revisit Phase 2.

10. **Curator diagnostic destination** (concept doc Open Q4; D6 curator workbench). Phase-1 default: build-time CI log. Phase 2: `/internal/freestyle/accounting-diagnostics` page. Confirm preference.

---

## Cross-cutting risks (consolidated)

### Educational risks

| Risk ID | Risk | Severity | Mitigation |
|---|---|---|---|
| E1 | Manifestation ambiguity (stepping → set, gyro → spin) confuses learners | medium | Component-glossary links bridge to definitions |
| E2 | Mobius double-spin nesting depth confuses parsing | low | Visual emphasis on two distinct spins; D5 styling priority |
| E3 | Silent suppression reads as "broken" not "doctrine-respect" | medium | Phase-2 glossary surfaces teach the pattern |
| E4 | Component vocabulary diverges between curator-map and glossary | low | Doc-sync skill catches divergence |
| U1 | Silent suppression confusion (no on-page hint) | medium-low | Honors Decision 2; Phase-2 teaching surfaces mitigate |
| U2 | Low expander discoverability | low | Phase-2 A/B can iterate affordance |
| U3 | Mobile inheritance-annotation loss | medium | Phase-2 secondary disclosure restores |

### Doctrine risks

| Risk ID | Risk | Severity | Mitigation |
|---|---|---|---|
| W1 | Curator burnout from 26-entry register | low | Production reads inventory column, not register doc |
| W2 | "Suppress" inferred as "broken" | medium-low | Decision 2 silence is intentional |
| W3 | Stale register entries as rulings land | medium | Doc-sync + change-set discipline |

### Parser risks

| Risk ID | Risk | Severity | Mitigation |
|---|---|---|---|
| P1 | Parser computed_adds agreement by accident | low | Total-only check; component-attribution is curator-authoritative |
| P2 | Parser silent computation for Wave-2 cases | mitigated | Suppression gates on `wave2_sensitive`, not parser silence |
| P3 | Parser doesn't know manifestation rules | not-a-risk | Total-only check; manifestation is curator territory |
| P4 | Parser changes destabilize diagnostic signal | low | Diagnostic destination is curator-only |

### Implementation risks

| Risk ID | Risk | Severity | Mitigation |
|---|---|---|---|
| U4 | Glossary §3 entries missing for components | low | Doc-sync identifies at implementation time |
| U5 | Curator workbench scope creep | medium-low | Phase-2 ships minimum; expand if useful |

### Net risk verdict

**Low overall.** No risk in the catalog rises above "medium" severity. The architectural posture (Decisions 1-3) contains the highest-impact risks (doctrine anchoring, parser drift, schema mutation). The remaining risks are either Phase-2 mitigation candidates or acceptable trade-offs for the educational value delivered.

---

## What's explicitly out of scope (preserved)

This list is preserved verbatim from D1-D6 for clarity.

### Out of scope — Phase 1

- Standalone `/freestyle/derivation` page (Architecture A — not pursued)
- Curator workbench / diagnostics dashboard (Phase 2 / deferred)
- Glossary integration (Phase 2 / Surface C)
- `/freestyle/add-analysis` enrichment (Phase 2)
- Hover-reveal glossary mini-cards (Phase 2 / desktop)
- Mobile tap-to-reveal for inheritance annotations (Phase 2)
- Animation / transitions (never)
- Persisted expand state (never; page reload returns to compact)
- Component-frequency dashboards (Phase 3+)
- Search by derivation (Phase 3+)
- Composer / interactive builder (never — ontology-authority risk)
- Per-component ADD weighting changes
- Doctrine resolution (paradox, symposium, etc.)
- Schema mutation
- Parser changes
- Alias-graph changes
- Operator-board glyph renames

### Out of scope — entire feature

- Public AST serialization
- Parser-authoritative decomposition
- Auto-derivation generation
- Public ontology mutation through decomposition
- Force-resolution of Wave-2 doctrine
- Individual-contributor naming in any rendered surface (per [[feedback_no_individual_names_freestyle_views]])

---

## Final recommendation

**Build Phase 1.** The combination of:

- High educational value (mobius double-spin alone justifies the feature)
- Low implementation complexity (~500 lines, single slice)
- Zero schema / ontology / canonical-data risk
- Clean architectural separation (read-only render, parser-subordinate, doctrine-respecting)
- Bounded curator effort (20-trick lead cohort, curator-paced)
- Renderable cohort already substantial without Wave-2 resolution

...produces an unusually favorable risk / reward profile.

**Author the 5-trick lead cohort first** (mobius, butterfly, whirl, osis, torque) to validate the render shape and curator-authoring workflow before scaling to 20.

**Defer Phase 2** until Phase 1 stabilizes. The glossary integration is a natural next step but should not block Phase 1 ship.

**Pursue Tier-1 Wave-2 quick wins opportunistically** post-ship — orbit baseline + ducking manifestation + smear classification each unblock 3-5 additional tricks at low curator effort.

**Hold Tier-3 Wave-2 unblockings** (paradox, symposium, blurry, atomsmasher) until Red availability. These are the highest-impact unblocks per cluster but require external authority and are correctly deferred.

This feature is ready to move from exploration to implementation slice when the curator has time to ratify the open questions listed above.

---

## Cross-references

- D1: `executable_add_accounting_concept.md` — framing + three locked decisions
- D2: `add_bearing_symbol_inventory.csv` + `add_bearing_symbol_inventory_notes.md` — token vocabulary
- D3: `compressed_atom_expansion_map.md` — per-trick decomposition reference
- D4: `wave2_sensitive_accounting_cases.md` — doctrine-unresolved register (26 entries)
- D5: `prototype_accounting_render_examples.md` — render shapes + bad-example catalog
- D6: `educational_mode_ui_brainstorm.md` — UI surface mockups + Phase-1 / Phase-2 inventory

- [[project_freestyle_state]] — current freestyle subsystem state
- [[project_freestyle_core_atoms]] — 12-atom registry
- [[feedback_parser_editorial_separation]] — Architecture C rejected
- [[feedback_reversible_content_governance]] — TS content modules > SQL during ontology refinement
- [[feedback_no_individual_names_freestyle_views]] — attribution hygiene
- [[feedback_internal_only_constraint]] — curator workbench placement

---

## Status

This exploration is complete. The package at `exploration/executable-add-accounting/` is ready for curator review. Implementation may proceed once the 10 open questions are resolved.

No further deliverables planned in this exploration cycle.
