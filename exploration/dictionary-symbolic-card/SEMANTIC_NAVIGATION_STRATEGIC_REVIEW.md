# SEMANTIC_NAVIGATION_STRATEGIC_REVIEW

**Project:** DICTIONARY-SYMBOLIC-CARD-2 — Strategic review at the topology-shipped checkpoint
**Scope:** Honest architectural assessment of the five-view semantic navigation layer before additional symbolic dimensions ship. Seven sections per the curator-supplied prompt.
**Stance:** Optimize for educational clarity, semantic coherence, and stable long-term architecture. Do NOT optimize for maximal taxonomy complexity.
**Date:** 2026-05-13

---

## EXECUTIVE SUMMARY

The five-view dictionary architecture is structurally sound. Card-uniformity holds; observational-canonical separation is visible to the reader; the partial-based rendering is mechanically tested.

**Three findings worth acting on:**

1. **Two of the six topology groups are redundant** with existing views and should be retired or merged. The view's pedagogical density would *increase* with fewer groups, not more.
2. **Movement archetypes should not yet be public.** They overlap with topology + component, are more subjective, and risk symbolic sprawl. They belong in glossary §9 first (as a concept), not in browse (as an axis).
3. **The next highest-ROI feature is NOT a new browse view.** It's *topology + component memberships surfaced on trick-detail pages* — closing the discovery loop between the views that already exist.

**The single biggest risk** is symbolic sprawl: adding a sixth browse view (archetypes), then a seventh (era / historical), then an eighth (compositional density), each individually defensible, collectively creating a tag-soup dictionary where the reader can't tell which axis matters. The card-uniformity contract solves the rendering question; it doesn't solve the *axis count* question. Curator judgment does.

---

## SECTION A — SEMANTIC NAVIGATION REVIEW

### A.1 The five-view inventory

| View | Layer | Grouping primitive | Strongest job |
|---|---|---|---|
| **By ADD** | Canonical | `adds` value | "What 3-ADD trick can I try next?" |
| **By family** | Canonical | `trick_family` slug | "Show me all whirl-family tricks." |
| **By category** | Canonical | `category` value | (Weakest — see A.4) |
| **By component** | Observational | modifier link slug | "Show me all paradox tricks." |
| **By topology** | Observational | body-mechanics group | "Show me all hippy-dex tricks." |

### A.2 Separation clarity

The canonical/observational split is **visible to the reader** (observational views carry layer badges + footers) but **not yet visible in the view-toggle itself**. A reader scanning the toggle sees five tabs without immediate signal that the last two are observational.

**Recommendation:** Keep the toggle as a single horizontal nav for now. Adding visual separation (a divider, a heading group, or a faint color shift between canonical and observational tabs) is a micro-affordance worth considering — but only if observed reader behaviour suggests confusion. The badge + footer convention inside each observational view is the primary signal.

### A.3 Hidden conceptual overlaps

Three overlaps already exist:

1. **Family `whirl`** (canonical) and **Topology `whirl-swirl-structures`** (observational) — both surface whirl-base tricks. Layer attribution differentiates them, but the reader sees the same set of cards twice across views. The redundancy is acceptable *if* the topology lens adds a body-mechanics frame the family view doesn't. Currently `whirl-swirl-structures` only filters by base, with no biomechanical reframing in the heading. **The topology group adds nothing the family view doesn't.**
2. **Component `pixie`** (observational, modifier link) and **Topology `pixie-uptime-dex`** (observational, computed from same modifier link) — *identical* memberships. Same data; two view slots. This is straight redundancy.
3. **Component `symposium`** vs **Topology `symposium-clipper-structures`** — overlapping but the topology group adds the clipper-landing filter, which IS a genuine biomechanical reframing. Less redundant than #2.

### A.4 Strongest and weakest views

**Strongest pedagogically:**
- **By ADD** — the beginner's natural home. Sort by difficulty, scan by ADD, find the next attainable trick. Universal use case.
- **By family** — the structural mental model. Family is the canonical relationship between tricks and is taught throughout the glossary and modifier-family pages.
- **By component** — answers "show me all X tricks" for the modifiers that drive most learning conversations. High leverage.

**Weakest pedagogically:**
- **By category** — `dex / body / set / compound`. The split is curator-internal vocabulary that doesn't map cleanly to a learner's question. Most tricks are `compound`; a few are `set primitive`; very few are `dex` or `body` (those are largely modifier-categorized tricks already filtered out). The view largely answers "are these compounds or base tricks?" — which family + ADD already answer better.
- **By topology** — strong concept, mixed execution. Two of the six groups are redundant (A.3). The other four are valuable.

### A.5 Missing symbolic dimensions

Symbolic dimensions that COULD be added, with my recommendation per dimension:

| Dimension | Could surface as | My recommendation |
|---|---|---|
| Archetypes (uptime-dex-downtime-butterfly etc.) | View or glossary | **Glossary first** (section C) |
| Dex direction (in / out) | View | Skip — already implicit; would scatter |
| Landing surface (toe / clipper / inside) | View | Skip — already implicit in family/topology |
| Era / historical | View | Skip — folk metadata, not pedagogical |
| Compositional density (number of modifiers stacked) | View or filter | Skip as standalone view; consider as a future filter |
| Notation length (token count) | Filter | Skip — surface-level proxy for difficulty |
| Equivalence-cluster co-membership | Trick-detail panel | **Yes** — see section F |

**Net recommendation for section A:** the five-view architecture is *roughly* the right count. Retire or merge the two redundant topology groups. Consider visual separation between canonical and observational tabs in the toggle. Do NOT add a sixth view.

---

## SECTION B — TOPOLOGY REVIEW

### B.1 Per-group evaluation

| Group | Educational value | Symbolic coherence | Movement coherence | Maintenance risk | Verdict |
|---|---|---|---|---|---|
| hippy-downtime-dex | **High** | **Strong** | **Strong** | Low | **Keep** |
| leggy-dex | **High** | **Strong** | **Strong** | Low | **Keep** |
| whirl-swirl-structures | Medium | Weak | Good | Low | **Retire or merge** |
| pixie-uptime-dex | Medium | Weak | Good | Low | **Retire** |
| symposium-clipper-structures | Medium | Medium | Good | Low | **Keep** |
| ducking-clipper-structures | Medium | Medium | Good | Low | **Keep** |

**Detailed reasoning:**

**hippy-downtime-dex** is the single best-justified group. It's a body-region distinction a learner can perceive, a biomechanical lens that doesn't exist in any other view, and the membership rule (base ∈ {mirage, butterfly}) is unambiguous and stable. Same for **leggy-dex**.

**whirl-swirl-structures** is a subset of leggy-dex (whirl and swirl are leggy). It exists as a separate group because "rotational dex" feels distinct, but the membership rule is just `base ∈ {whirl, swirl}` — which is the family view filtered to two families. **The group adds nothing the family view doesn't surface, and is a strict subset of leggy-dex.** Recommend retire; or rename and broaden to "rotational dex" (which would include osis / torque / blender families that also carry rotational character — but then the membership computation gets harder and the group risks subjectivity).

**pixie-uptime-dex** is **identical** to the component-view `pixie` group (same membership rule: has pixie modifier link). The topology framing adds "uptime dex" to the name, but the underlying set is the same. **Retire**; it doesn't earn its place.

**symposium-clipper-structures** and **ducking-clipper-structures** are *narrower* than their component-view counterparts (symposium and ducking, respectively) because they filter by clipper-landing base. That's a real biomechanical reframing — the support-leg discipline (symposium) IS most relevant when the trick lands clipper, and a head-dip in the midtime IS especially distinctive on clipper-landing structures. The narrowing is curator-meaningful. **Keep both.**

### B.2 Missing obvious groups

Groups that *could* exist with high-confidence membership rules:

| Candidate | Membership rule | Verdict |
|---|---|---|
| **toe-landing dex tricks** | base ∈ {toe-stall, mirage, illusion, legover, pickup, ATW, orbit} | **Add** if topology view stays |
| **clipper-landing dex tricks** | base ∈ {butterfly, whirl, swirl, osis, blender} | **Add** if topology view stays |
| **paradox-on-base** | has paradox link + base ∈ canonical-active bases | Maybe; large overlap with component view |
| **multi-modifier compounds** | ≥ 3 modifier links | Cute but no pedagogical value |
| **direction-paired-sibling pair** | A and B where one is in-dex of other's out-dex | Conceptually rich but requires curator pairing |

**Recommend ADD only:** `toe-landing dex tricks` and `clipper-landing dex tricks`. These are biomechanically grounded, computable from existing data, and meaningfully different from family/component. They reframe the dictionary along *what surface the trick ends on* — a question the family view doesn't answer directly.

### B.3 Groups that should stay intentionally broad

`hippy-downtime-dex` and `leggy-dex` should NOT be subdivided. The body-region axis is the load-bearing distinction; subdividing it into `hippy-mirage-bases / hippy-butterfly-bases / leggy-toe-tricks / leggy-clipper-tricks / leggy-direction-variants` would be classic taxonomy overfitting.

### B.4 Groups that should NOT yet be public

The advanced CSV-based topology groups (butterfly-wing-topology, whirl-rotational-topology, mirage-topology, drifter-miraging-clipper-topology, blender-rotational-topology, osis-rotational-topology) **stay deferred** for the reasons documented in the topology-view report §4. They're a curator-level taxonomy that hasn't earned public surface.

### B.5 Net topology recommendation

**Trim to 5 groups, then optionally expand to 6:**
- Retire `whirl-swirl-structures` (redundant with leggy-dex + family view)
- Retire `pixie-uptime-dex` (identical to component view)
- Keep `hippy-downtime-dex`, `leggy-dex`, `symposium-clipper-structures`, `ducking-clipper-structures`
- Optionally add `toe-landing-dex` and `clipper-landing-dex` to get back to 6 with stronger pedagogical justification

This is a *reduction* in apparent complexity that *increases* the view's density of insight per group.

---

## SECTION C — MOVEMENT ARCHETYPE STRATEGY

### C.1 The proposed archetype examples

Evaluating the user's proposed list:

| Archetype | Distinct from existing views? | Subjective risk | Verdict |
|---|---|---|---|
| uptime dex | Maybe — overlaps with pixie / stepping uptime groups | Low | Marginal |
| downtime dex | Most tricks — too broad | Low | Skip |
| hippy dex | Identical to topology `hippy-downtime-dex` | Low | **Redundant** |
| leggy dex | Identical to topology `leggy-dex` | Low | **Redundant** |
| set-heavy | What counts as "heavy"? | **High** | Skip |
| dex-heavy | Same | **High** | Skip |
| spinning structures | Already in component view as `spinning` group | Low | **Redundant** |
| flow-heavy | Aesthetic-quality, not structural | **Very High** | Skip |
| support-leg dex | Symposium / symple — already in component | Low | Mostly redundant |

**Five of nine are redundant with existing views; three are too subjective; one is marginal.** None earns public browse-axis status today.

### C.2 Should archetypes go public now?

**No.** Three reasons:

1. **Overlap with existing views.** Most proposed archetypes are renames or near-renames of groupings the topology + component views already surface.
2. **Subjectivity risk.** Archetypes lean toward *qualitative* descriptors (`set-heavy`, `flow-heavy`, `dex-heavy`). The dictionary should stay quantitative-and-structural for now. Subjective dimensions belong in the glossary's prose, not in browse-axis taxonomies.
3. **Symbolic sprawl risk.** Adding a sixth browse view (archetypes) right after the topology view shipped feels like compulsive extension. The dictionary's browse axes are *fundamental dimensions*, not interesting tags.

### C.3 Where archetypes do belong

The `movement_archetype_registry.csv` (11 entries) is the canonical archetype source. Those entries are curator-tagged compositional patterns (`uptime-dex-downtime-butterfly`, `uptime-dex-downtime-osis`, `set-into-dex`). They're more concrete than the user's proposed list — actual patterns that compose multiple structural elements.

**Recommendation:** archetypes surface as a *glossary concept* in V5 §9 (per `GLOSSARY_V5_ARCHITECTURE.md`). The glossary explains "what is a movement archetype?" and lists the 11 curator-tagged archetypes. Each archetype entry can deep-link to the component view filtered to its constituent modifiers. **The browse experience for archetype-style questions is already provided** by component view + topology view; what's missing is the *concept*, not the *axis*.

### C.4 First safe archetypes

If, after curator validation, archetypes DO eventually go public, the first safe set is the existing 11 curator-tagged archetypes — not the user-proposed list. The curator-tagged ones are:

- compositional (specific component-pattern recipes)
- already-validated by SYMBOLIC-GRAMMAR-2 phase
- bounded — there are 11, not "any pattern we can name"
- have associated memberships in the data layer

The proposed list mixes specific patterns with subjective qualitative descriptors. Start specific.

### C.5 Net archetype recommendation

**Defer all archetypes from browse.** Add the *concept of movement archetypes* to glossary §9 as an explanation. Deep-link archetypes (when surfaced there) to the relevant component/topology views.

---

## SECTION D — SYMBOLIC NOTATION COMPLETION

### D.1 Coverage gaps

Operational notation coverage is sparse. Many dictionary rows have `operational_notation = NULL`. Without observed data on production-coverage numbers, the gap is real but the size is unknown.

**Recommendation:** Run a coverage audit (curator script) that emits a CSV:
- Each dictionary trick row
- Whether operational notation is populated
- Whether semantic notation is populated
- The base trick (for membership in symbolic groups)
- The trick's modifier-link count

Identify the "high-leverage gaps" — flagship tricks that lack notation but appear in many compound names. Fill those first.

### D.2 Missing operators / modifier semantics

Items that are real gaps:

| Concern | Status | Recommendation |
|---|---|---|
| Four-way head-motion family flags | `[BOD]` exists; `[DUCK]`, `[WEAVE]`, `[DIVE]`, `[ZULU]` don't | Decide whether the bracketed flags should distinguish the four siblings; if yes, extend tokenizer + style guide |
| Multi-modifier ordering canonicalization | Cultural variation; not enforced | Curator decision; recommend documenting accepted variations in style guide §9 rather than enforcing |
| Symposium variants (symp / symple / muted) | Three operators in `MODIFIER_OPERATOR_FRAMEWORK.md` §6.8; tokenizer treats `symp` as ambiguous | Clarify in operational-notation style guide which form the tokenizer should normalize to |
| Side-flag defaults | Documented in primer §1.4 | Should be enforced by a linter, not by tokenizer |
| Direction-variant fusion (front whirl / back swirl etc.) | Tokenized correctly | No action; in good shape |

### D.3 Unstable decomposition areas

Memory entries flag several active decomposition uncertainties:

- **Blurry whirl / Blurry torque** under the +1 rotational rule (pt12 follow-up) — math breaks
- **Barfry** = Nuclear ss Butterfly — pending ADD math clarification (pt12 Q3)
- **Fusion / omelette / flurry** — data debt flagged by SCALE-11 verification

These are curator-resolution items, not architectural concerns. The infrastructure (parser + editorial layer separation) handles them correctly; the curator track resolves the actual math.

### D.4 Likely automation opportunities

**HIGH-LEVERAGE:**
1. **Operational-notation linter** (per `OPERATIONAL_NOTATION_STYLE_GUIDE.md` §13). A script that scans every `operational_notation` row and flags style-guide violations. Read-only; produces a CSV report; curator-led correction.
2. **Coverage audit script** (per D.1).

**MEDIUM-LEVERAGE:**
3. **Semantic → operational synthesis** for trivially-derivable cases. Drop default side flags; insert standard sequence operators. Curator-gated; partial output (not all tricks).
4. **Decomposition tree visualizer** as an internal tool. Surface where the parser disagrees with the editorial decomposition.

**LOW-PRIORITY:**
5. **Federation export (PassBack / FM)** — useful but cross-track; not on the symbolic notation completion path.

---

## SECTION E — ADD DERIVATION POLICY

### E.1 The principle

`canonical_add == symbolic_formula_add` is the invariant. When they disagree, one of four things is true:

1. **Bad notation** — the structural decomposition is wrong; fix the notation
2. **Incomplete decomposition** — the formula doesn't capture all components; extend the decomposition rules
3. **Historical ADD inconsistency** — the canonical ADD predates the formula; curator decides which gives
4. **Symbolic edge case** — the formula's rules don't yet handle the case; refine the rule

### E.2 Current state

`freestyle_tricks.computed_adds` + `add_formula_status` already exist as columns. The parser populates them. The values vs `canonical_add` are visible to curators via the existing internal tooling.

What's missing:
- A formal *policy* document defining the four categories and the resolution path for each
- A *review queue* surfacing tricks where `computed_adds !== canonical_adds`
- A *resolution log* tracking the curator decisions

### E.3 Likely conflict patterns

Predictions based on memory entries:

| Pattern | Likely cause | Frequency |
|---|---|---|
| `paradox + base` rolls off-by-one for old folk-named compounds | Historical inconsistency | Few; pt-rulings have closed most |
| `symp` variants (symposium / symple / muted) | Symbolic edge case | Several; the shorthand collapses three operators |
| `blurry` family under the +1 rotational rule | Symbolic edge case | Documented in pt11 / pt12; awaiting Red |
| Direction-variant pairings (drifter / reverse-drifter) | Historical or curator-style preference | Few; the patches close them per pair |
| Compounds with `(no plant while)` pre-state | Bad notation (the pre-state isn't a modifier) | Edge case; tokenizer-side |

### E.4 Recommended conflict policy

**Three-level policy:**

1. **Class A — auto-resolvable.** Discrepancies < 1 ADD where the formula's edge-case is documented as known. Auto-flag, no curator action.
2. **Class B — review queue.** Discrepancies = 1 ADD or pattern matches a known historical-inconsistency motif. Land in a curator review queue; categorise into one of the four buckets above; resolve case-by-case.
3. **Class C — escalation.** Discrepancies > 1 ADD or where the four-category classification is ambiguous. Escalate to a pt-ruling-style adjudication packet (Red review queue, per the existing curator workflow).

**Policy artifact:**
- Document the four categories in a new `ADD_DERIVATION_POLICY.md` (curator-internal; lives in `legacy_data/` or `exploration/`).
- The internal tooling surfaces the review queue.
- Resolution log is curator-authored CSV like other pt-rulings.

**One-line invariant:** *Every dictionary trick eventually has a documented status: in agreement, in pending review, or escalated to a pt-ruling.* No silent disagreements.

---

## SECTION F — NEXT HIGH-ROI FEATURES

### F.1 Ranking

| Rank | Feature | Leverage | Educational value | Ontology stability | Effort |
|--:|---|---|---|---|---|
| 1 | **Topology + component memberships on trick-detail pages** | **Highest** | **Highest** | Preserves observational/canonical separation | ~1 dev-day |
| 2 | **Token-level glossary linking on cards** | **High** | **Highest** | Reuses existing anchors | ~1 dev-day |
| 3 | **Operational-notation coverage audit + linter** | **High** (curator-side) | Medium (curator-internal) | High | ~2 dev-days |
| 4 | **Trim topology view to 4 groups (retire whirl-swirl + pixie-uptime; optionally add toe-landing + clipper-landing)** | **High** | High | High | <1 dev-day |
| 5 | **Modifier-family pages for stepping, atomic, nuclear, gyro, weaving, diving, zulu** | Medium-High | High | High | ~5 dev-days (curator-led content) |
| 6 | **Progression-path pages for whirl-rotational, mirage-topology, osis-rotational** | Medium | Medium-High | High | ~5 dev-days (curator-led) |
| 7 | **ADD Derivation Policy + review queue** | Medium-High (curator-side) | Medium | High | ~2 dev-days |
| 8 | **Visual separation in view-toggle (canonical vs observational)** | Low-Medium | Medium | High | <1 dev-day |
| 9 | **Symbolic neighborhoods on trick-detail (equivalence-cluster memberships)** | Medium | Medium | High | ~1 dev-day |
| 10 | **Decomposition tree visualizations** | Low-Medium | Medium | High | ~3 dev-days |
| 11 | **Archetypes (browse axis)** | Low | Low (per section C) | **At risk** | Skip |
| 12 | **Red adjudication packet generator** | Medium (curator-side) | Low (public) | High | ~3 dev-days |
| 13 | **footbagmoves mining pipeline** | Low (different track) | Low | n/a | n/a |

### F.2 Top recommendation

**Build features 1 + 2 together as a single phase.**

**Feature 1 — Topology + component memberships on trick-detail pages:**
- A trick-detail page currently shows family, related tricks, related topology (limited to 8 flagship slugs)
- Extend: every trick page surfaces its memberships across both observational views (the topology groups it belongs to + the component groups it belongs to)
- Renders as a small panel near the existing related-topology panel
- Closes the discovery loop: a learner who arrives at a trick page can navigate to the lens that contains it

**Feature 2 — Token-level glossary linking:**
- Each operational-notation token (`[clip]`, `op`, `in`, `dex`, `butterfly wing`, etc.) becomes a hyperlink to its glossary anchor
- Tokenizer gains an optional `linkHref` field per token; card template wraps tokens in `<a>` when present
- Pedagogical payoff: notation becomes self-explaining

Combined effort: ~2 dev-days. Combined leverage: high. Both are extensions of shipped infrastructure.

### F.3 Why these two over the others

The third-ranked option (`operational-notation coverage audit + linter`) is high-leverage *for curators* but invisible to readers. The fourth option (`trim topology view`) is small and worth doing but can be a sub-task within feature 1's phase. The fifth and sixth options (more modifier-family pages, more progressions) are *content* work, not infrastructure — they earn rank only once the curator decides what content to author.

Features 1 + 2 maximize *user-facing pedagogical value per dev-day* given what's already shipped.

---

## SECTION G — DANGERS / FAILURE MODES

### G.1 Top risks

| Risk | Severity | Symptoms (early signs) | Safeguard |
|---|---|---|---|
| **Symbolic sprawl** | High | A sixth/seventh browse view added before observed reader behaviour justifies it | Hard limit: no new browse view without curator review + observed user research |
| **Ontology drift** | High | Observational topology groups starting to override `trick_family` in service code or templates | Lint rule: services that consume `trick_family` must not consume `symbolic_group_membership.csv` for canonical decisions |
| **Parser leakage into UX** | Medium | Tokenizer internal state surfaces in user-facing prose | `feedback_parser_editorial_separation.md` enforced; existing rule |
| **Topology confusion** | Medium | Reader interprets duplication-across-views as authoritative classification | Layer attribution badges + footers (already shipped); reinforced by the explanatory note above the component view |
| **Overclassification** | Medium | Trick belongs to 6+ memberships; the data becomes tag soup | Hard limit on number of curator-tagged taxonomies per dimension; archetypes excluded from browse |
| **Educational overload** | Medium | New learner doesn't know where to start; the five views feel like a maze | Pathway picker on `/freestyle/learn` (already designed in GLOSSARY-V5); decorate the view-toggle with role hints (canonical vs observational) |
| **Unstable notation** | Low-Medium | Operational notation conventions changed without coordinated style-guide update | The style guide is shipped; linter enforces it; future tokenizer changes trigger style-guide review |
| **Premature formalization** | Medium | Operators codified before community usage stabilizes (e.g., `crispy`, `alpha/beta/gamma`) | GLOSSARY V5 §11 holds folk variants; canonical operators are curator-promoted only |

### G.2 The biggest single danger

**Symbolic sprawl.** The temptation to add archetypes as a sixth browse view, then era as a seventh, then compositional density as an eighth, is *real and immediate*. Each is individually defensible. Together they break the cognitive model the dictionary should sustain.

The card-uniformity contract solves the *rendering question* — every browse view renders the same card — but doesn't solve the *axis count question*. Curators must.

### G.3 Recommended safeguards

1. **Five-view ceiling (for now).** Any sixth view requires:
   - A documented pedagogical justification distinct from existing views
   - Observed user research suggesting the existing views are insufficient
   - Curator approval at the architecture level

2. **Glossary-first for new symbolic concepts.** Movement archetypes go to glossary §9 before they go to browse (if they ever go to browse). The glossary teaches the *concept*; the dictionary surfaces it via existing axes when possible.

3. **Mechanical card-uniformity test stays.** The regression guard in `freestyle.dictionary-trick-card.routes.test.ts` enforces the contract; any new browse view must pass it (and the addition triggers explicit curator review).

4. **Observational-canonical lint.** A service-side audit script that verifies no observational data is being consumed by canonical service paths. Runs on CI; fails when observational-grammar data leaks into canonical-classification logic.

5. **Sunsetting plan for redundant groups.** When a curator-tagged taxonomy proves redundant (whirl-swirl-structures vs leggy-dex), it should be *retired*, not coexist. The dictionary's clarity comes from having one canonical axis per question.

6. **The CSV-defined advanced topology taxonomy stays deferred.** Surfacing it would re-introduce the very symbolic sprawl this review is warning against.

7. **Documented dependency chain for archetypes.** The next time archetypes come up for browse-promotion, the curator team checks against:
   - Distinct from existing views? (per section C.1)
   - Computable from existing data? (yes)
   - Subjective? (yes — high risk)
   - Glossary-first viable? (yes)

---

## H. WHAT NOT TO DO (CONCISE)

- **Do not add a sixth browse view** without observed reader research + architecture-level approval
- **Do not promote movement archetypes to browse** in 2026; surface them as a glossary concept first
- **Do not surface the advanced CSV topology taxonomy** in `?view=topology`
- **Do not unify component view + topology view** (the layer-attribution distinction matters even when memberships overlap)
- **Do not retire By Category yet** (it's the weakest but stable; retire only after observed reader data confirms no one uses it)
- **Do not implement decomposition trees** until features 1 + 2 ship + observed usage tells us a tree is needed

---

## I. WHAT TO DO NEXT (CONCISE)

In priority order:

1. **Trim topology view** to 4 groups (retire `whirl-swirl-structures` + `pixie-uptime-dex`); optionally add `toe-landing-dex` + `clipper-landing-dex` to return to 6 with stronger pedagogical justification. ~1 dev-day.
2. **Ship topology + component memberships on trick-detail pages.** ~1 dev-day. Highest pedagogical leverage of any available feature.
3. **Ship token-level glossary linking on cards.** ~1 dev-day. Pairs naturally with #2.
4. **Run an operational-notation coverage audit** (curator-side; not user-facing). ~1 dev-day. Output is a curator triage list, not a public feature.
5. **Document the ADD derivation policy.** ~1 dev-day. Curator-internal.
6. **Begin GLOSSARY-V5 architecture migration** (per the just-shipped V5 synthesis package). Multi-week curator-led content authoring.

Items 1–5 are all small enough to ship in a single phase if the curator wants. Item 6 is the long-running content effort.

---

## J. CLOSING

The dictionary is in good shape. Five views; one card; observational separation visible. The next *infrastructure* milestones are small and well-defined. The next *content* milestone (GLOSSARY-V5 migration) is the larger investment.

The risk is not running out of things to build — it's building too many things. This review's strongest single recommendation is **resistance to additional symbolic dimensions** until the existing five have been observed in real use, evaluated against actual reader needs, and either trimmed or extended on evidence rather than enthusiasm.

The current architecture supports that restraint. The card-uniformity contract makes any future view structurally cheap; that's a feature, not a license to multiply axes.

---

## K. CROSS-REFERENCES

- `DSC2_TOPOLOGY_VIEW_REPORT.md` — the topology slice this review evaluates
- `DSC2_COMPONENT_VIEW_SLICE3A_REPORT.md` — the component slice
- `UNIFIED_DICTIONARY_VIEW_PLAN.md` — the unified view plan this architecture implements
- `NOTATION_LAYER_STRATEGY.md` — the 8-layer representation model
- `SYMBOLIC_FUTURE_CAPABILITIES.md` — capability catalogue (section F draws from this)
- `GLOSSARY_V5_ARCHITECTURE.md` — the glossary V5 design (section C recommends archetypes belong here)
- `GLOSSARY_V5_FUTURE_CAPABILITIES.md` — parallel future-capabilities document for the glossary
- `feedback_parser_editorial_separation.md` — the parser/editorial layer rule (section G)
- `feedback_modifier_public_visibility.md` — modifier-stub exclusion (consumed by every browse view)

---

*End of SEMANTIC_NAVIGATION_STRATEGIC_REVIEW.md*
