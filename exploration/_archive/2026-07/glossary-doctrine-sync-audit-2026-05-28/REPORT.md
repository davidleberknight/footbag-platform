# Glossary ↔ Doctrine Synchronization Audit

**Date:** 2026-05-28
**Type:** Audit / design / governance report. **NOT a glossary rewrite. NOT the curator ruling pass.**
**Subject:** `src/views/freestyle/glossary.hbs` (~1,649 lines, 16 sections) + its service/content shaping, measured against the current platform ontology.

---

## 0. Reframed evaluative standard

The glossary was built to teach **notation** (surfaces, dexes, timing, JOB, ADD). The platform has since grown an **ontology**: a uniform two-line trick-row contract across six browse views, an interpretation/decomposition layer, a canonical-vs-observational governance model, and an emerging family taxonomy that separates families from modifier ecosystems, movement neighborhoods, and alternative surfaces.

Per curator direction (2026-05-28), the glossary's job is now to explain:

1. **Ontology layers** — what kind of object each thing is (canonical trick · modifier · surface · neighborhood · interpretation reading · observational name).
2. **Governance boundaries** — canonical vs observational, promotion states, why the platform tracks more names than it canonizes.
3. **Interpretation doctrine** — historical derivation, compositional interpretation, equivalence topology, and why an interpretation reading is *descriptive*, NOT a productive/generative modifier system.
4. **Ecosystem theory** — pixie / fairy / stepping / quantum / atomic / ducking / gyro / spinning as modifier *ecosystems* (systems that transform many bases), not trick families.
5. **Browse semantics** — what each of the six views (ADD / family / modifier / movement system / neighborhoods / dex count) is *intended to reveal*.

**Two hard constraints on every recommendation below:**

- **Do not collapse ontology distinctions for pedagogical simplicity.** The glossary must *clarify* distinctions, not blur them. Where a concept is hard, add scaffolding — do not merge the concept into a neighbor.
- **Explain the WHY of separation.** Older footbag vocabularies routinely conflated family / modifier / surface / alias / decomposition into one flat name-space. The glossary should state *why* the platform separates them (different objects, different governance, different productivity), so the distinctions read as principled rather than arbitrary.

The audit measures the glossary against this standard, not against a prose-quality bar.

---

## 1. Coverage scorecard (the 10 focus areas)

Mention counts from a term scan of `glossary.hbs`; severity is conceptual-coverage, not word-count.

| # | Focus area | Current state | Gap severity |
|---|---|---|---|
| 1 | **Trick-row architecture** (line 1 name/#/≡/media · line 2 JOB/ADD) | `two-line`=0, `dict-trick-row`=0, `media badge`=0. The row contract is never explained; JOB + ADD are taught as separate notation topics, not as the two lines of one row. | **HIGH (absent)** |
| 2 | **Interpretation layer doctrine** | `interpretation`=2; `decomposition`=11, `equivalence`=14, `eggbeater`=3. §Composition has a derivation atlas + "four ways trick names relate" — solid raw material, but interpretation is not named as a doctrine, the "≡ reading is descriptive, not a productive modifier" boundary is implicit, and the flagship example is whirl/blur/mobius, **not eggbeater**. | **MEDIUM (present, unsharpened)** |
| 3 | **Family vs modifier vs neighborhood vs surface vs alias** | §Families distinguishes "root vs branch families" and says modifiers/topology "are not terminal families," but does NOT present the modern five-way distinction; `ecosystem`=0, `alternative surface`=0. | **HIGH** |
| 4 | **Modifier ecosystems** | §Modifiers embeds the operator reference; `ecosystem`=0. pixie/fairy/stepping/quantum/atomic/ducking/gyro/spinning are not framed as *ecosystems/systems*. | **HIGH** |
| 5 | **Alternative Surfaces** | §Surfaces lists sole/heel/cloud/knee/etc. as a flat vocabulary; `alternative surface`=0; no link to the `?view=movement-system` Alternative-Surfaces section; not distinguished from families. | **HIGH** |
| 6 | **Movement Neighborhoods** | `neighborhood`=4, but only as a buried "reference/history" lens (below the fold); the exploratory-pedagogical "feels mechanically similar vs canonical taxonomy" intent is stated weakly and not tied to the `?view=topology` browse view + its six groups. | **MEDIUM** |
| 7 | **Canonical vs observational vocabulary** | `observational`=25, `canonical`=33 — **well covered** conceptually. But `governance`=1: promotion/governance *states* (pending / observational / canonical) are not enumerated, and the "why track more than we canonize" rationale is thin. | **LOW–MEDIUM** |
| 8 | **Family hierarchy direction** | Not present. No statement that current family labels are transitional, that a parent/child hierarchy is likely, or that the canonical family count will shrink. (Timely: see the 2026-05-28 family-hierarchy audit + candidate matrix.) | **MEDIUM** |
| 9 | **Browse-system explanation** | No browse-semantics section. `By modifier`=0, `By movement`=0, `By dex`=0; `view=*` refs near-zero. The glossary never explains what each of the six views reveals. | **HIGH** |
| 10 | **Conceptual gaps / drift / leaks** | Several (see §4): "branch families" model conflicts with the family-audit direction; surfaces sit adjacent to families; interpretation vs modifier boundary is implicit; browse vocabulary absent. | **HIGH** |

**Headline:** the glossary is a strong *notation* primer and already carries the hardest single piece (canonical vs observational). The synchronization deficit is concentrated in **ontology framing** (what kind of object each thing is), **browse semantics**, **ecosystem/surface/neighborhood as first-class categories**, and the **two-line row contract** — exactly the layers the platform grew after the glossary was written.

---

## 2. Section-by-section audit of the live glossary

Disposition: **KEEP** (accurate) · **AUGMENT** (add the missing ontology framing) · **REWRITE** (reframe) · **RESTRUCTURE** (move/promote).

| Section (id) | Current role | Disposition | Note |
|---|---|---|---|
| Intro card "How to read this glossary" | 4 reading arcs; explicitly "zero new ontology, pure navigation" | **AUGMENT** | Add a 5th arc / a one-paragraph "what kind of objects this glossary names" ontology-layer orientation. The reader should learn early that surfaces, families, modifiers, neighborhoods, and interpretation readings are *different kinds of thing*. |
| §core-concepts "Movement Basics" + 12 core atoms | foundational; the 12 atoms band | **KEEP** | Accurate and load-bearing; the 12 atoms are the right anchor. Add a forward-link to the family-hierarchy note (atoms are the proposed parent-family anchors). |
| §surfaces | flat surface vocabulary (toe/clipper/inside/outside/sole/heel/knee/.../cloud) | **AUGMENT/REWRITE** | Add an **Alternative Surfaces** explainer: which surfaces form the alt-surface groups (sole-and-heel, inside-outside, head-neck-shoulder, cloud-and-knee, flying-variants), that they are a *surface* axis NOT a family axis, and link to the `?view=movement-system` alt-surfaces section. State the WHY: a catch surface is not a family. |
| §dexterities | hippy/leggy, in/out, windows, quality | **KEEP** | Accurate. Optionally cross-link hippy/leggy to the neighborhood definitions (HIPPY/LEGGY bases). |
| §timing-sets | set/uptime/midtime/downtime/phases | **KEEP** | Accurate. |
| §families "Core Trick Families" | root vs branch families; family-anchor tricks; "modifiers/topology are not families" | **REWRITE** | Reframe around the **five-way distinction** (family / modifier ecosystem / neighborhood / alternative surface / alias-decomposition). Add the **hierarchy-direction note** (labels transitional; parent/child likely; count will shrink). Reconcile "branch families" with the audit (barrage/blur as "branch families" conflicts with the audit's DECIDE/compression classifications). |
| §modifiers "Modifiers & Operators" | embeds the operator reference partial | **AUGMENT** | Add **ecosystem theory**: a modifier ecosystem is a system that transforms *many* bases (pixie/fairy/stepping/quantum/atomic = set ecosystems; ducking/gyro/spinning = body/rotational ecosystems). State WHY an ecosystem is not a family (it has no terminal mechanic of its own; it modifies). |
| §notation (JOB) | large notation reference (~458–884) | **AUGMENT** | Accurate as notation. Add a short bridge: "JOB is **line 2** of every trick row." Tie notation to the row contract instead of leaving it free-floating. |
| §add-accounting | ADD + traditional reference | **AUGMENT** | Same bridge: "ADD is the other half of **line 2**; there is no green per-row ADD chip — the row header carries the grouping count and line 2 carries the formula." |
| §composition "Symbolic Composition" + Derivation atlas + "four ways names relate" | run/shuffle/link; 5-example atlas; alias/compression/equivalent-derivation/ontology-relationship | **REWRITE/AUGMENT** | This is the home for **interpretation doctrine**. Name it. Make **eggbeater the flagship** (eggbeater ≡ atomic legover) and state the boundary explicitly: an interpretation/≡ reading is a *descriptive equivalence*, NOT a productive modifier — you cannot "apply eggbeater" to another base. Keep the four-relationship taxonomy; add equivalence-topology framing. |
| §run-architecture | run-level structure | **KEEP** | Accurate. |
| §connective-panels (movement neighborhoods lens) | neighborhoods as a below-the-fold lens | **RESTRUCTURE** | Promote Movement Neighborhoods to a first-class explainer tied to `?view=topology`: six groups, exploratory/pedagogical "feels mechanically similar," explicitly NOT a canonical taxonomy, and NOT the observational staging layer. |
| §advanced-reference | advanced concepts | **KEEP/AUGMENT** | Candidate home for the equivalence-topology deep dive if §composition gets crowded. |
| §community / §historical / §sources | folk names, history, acknowledgements | **KEEP** | Accurate; the folk/historical names are the right place to note older-vocabulary conflation (a good WHY anchor). |

---

## 3. High-priority missing concepts (net-new explainers)

In rough priority order:

1. **The two-line trick-row contract** (focus area 1) — a short, diagrammatic explainer near the top (or as the 5th reading arc): *line 1* = canonical name · `#hashtag` · optional `≡` interpretation/decomposition · optional media badge; *line 2* = JOB notation · ADD accounting. This is the single most-used surface on the platform and the glossary never describes it. It also unifies the currently-scattered JOB and ADD sections.
2. **Browse semantics map** (focus area 9) — one compact section: what each view reveals.
   - By ADD → difficulty layering;
   - By family → conserved terminal mechanic;
   - By modifier → which set/body modifier transforms the base;
   - By movement system → the four conceptual axes (+ alternative surfaces);
   - Movement Neighborhoods → "feels mechanically similar" (exploratory);
   - By dex count → number of dex events.
   State that all six render the *same* two-line row; only the grouping axis differs.
3. **The ontology-layer map / five-way distinction** (focus areas 3–6) — one table that names each kind of object and *why it is separate*: canonical family · modifier ecosystem · alternative surface · movement neighborhood · alias/decomposition label. This is the spine the curator direction asks for.
4. **Ecosystem theory** (focus area 4) — pixie/fairy/stepping/quantum/atomic (set) and ducking/gyro/spinning (body/rotational) as systems that transform many bases; why that makes them ecosystems, not families.
5. **Alternative Surfaces explainer** (focus area 5) — the five surface groups; surfaces are a different axis from families; link to the browse section.
6. **Governance states + "why track more than we canonize"** (focus area 7) — enumerate pending / observational / canonical; explain the observational layer as deliberate (tracking ≠ endorsing).
7. **Family-hierarchy direction note** (focus area 8) — current family labels are transitional; a parent/child hierarchy is likely; the canonical family count will shrink (cite the 2026-05-28 family-hierarchy audit + candidate matrix as the working proposal, not a ruling).
8. **Interpretation doctrine, named + eggbeater-flagship** (focus area 2) — promote interpretation to a named doctrine with the descriptive-not-productive boundary.

---

## 4. Contradictions, drift, and ontology leaks

| Issue | Where | Recommended resolution |
|---|---|---|
| **"Branch families" vs the family-audit direction** | §families calls barrage / blur "branch families" (productive family anchors). The 2026-05-28 family audit classifies barrage as a DECIDE mini-family and blur as a compression bridge, and proposes ~10 parent families. | Reframe §families to the parent/child + five-way model; mark "branch family" as transitional language pending the ruling pass. Do NOT harden "branch families" as doctrine. |
| **Surfaces sit adjacent to families** | §surfaces is a flat vocabulary with no "this is a different axis from families" statement; alt-surfaces never named. | Add the alternative-surfaces axis + the WHY (a catch surface is not a terminal family mechanic). |
| **Interpretation ≡ reading reads like a transformation** | §composition's "equivalent derivation" can be misread as "apply X to get Y." | State explicitly: a ≡ reading is a descriptive equivalence, not a productive modifier; eggbeater ≡ atomic legover does not make "eggbeater" an operator. |
| **JOB and ADD taught as unrelated topics** | separate large §notation and §add-accounting sections; no row-contract bridge. | Bridge both to "line 2 of the trick row." |
| **Neighborhoods buried as "reference/history"** | §connective-panels sits below the fold under "nothing below is required." | Promote to a browse-semantics explainer; it explains a live primary view (`?view=topology`). |
| **Terminology drift: "family-anchor trick" vs "parent family"** | §families uses "family-anchor trick"; the audit uses "parent family." | Pick one term in the sync rewrite (recommend "parent family" / "family anchor" defined once) to avoid two names for one concept. |
| **Landing/view family-count mismatch is invisible to readers** | glossary doesn't mention that "By family 91" (labels) ≠ ~38 rendered families ≠ ~10 proposed parents. | The hierarchy-direction note should acknowledge the count is transitional and will consolidate. |

---

## 5. Recommended additions / rewrites / restructures (summary)

- **ADD (net-new):** two-line row-contract explainer; browse-semantics map; ontology-layer / five-way distinction table; ecosystem theory; alternative-surfaces explainer; governance-states block; family-hierarchy-direction note; named interpretation doctrine.
- **REWRITE:** §families (five-way model + hierarchy direction, retire hardened "branch families"); §composition (name interpretation doctrine, eggbeater flagship, descriptive-not-productive boundary).
- **RESTRUCTURE:** promote Movement Neighborhoods out of below-the-fold reference into a browse-semantics explainer; bridge §notation + §add-accounting to the row contract; add the ontology orientation to the intro card.
- **KEEP (unchanged):** §dexterities, §timing-sets, §run-architecture, §community, §historical, §sources, the 12-core-atoms band.

All additions must *sharpen* distinctions (per the constraint), e.g. the five-way table should make it impossible to read pixie as a family or cross-body-sole-stall as a family.

---

## 6. Exemplars the glossary should adopt

- **Interpretation flagship → eggbeater** (`eggbeater ≡ atomic legover`): one base, a descriptive equivalence, not a productive modifier. Replaces/augments the current whirl/blur/mobius atlas as the *named* interpretation example.
- **Equivalence-topology examples:** drifter ≡ miraging clipper; torque ≡ miraging osis; smear ≡ pixie mirage (already chain-registry-backed).
- **Ecosystem exemplars:** pixie across pixie-illusion / pixie-mobius / symposium-pixie (one ecosystem, many bases); ducking across ducking-whirl / ducking-guay / ducking-osis.
- **Alternative-surface exemplar:** cross-body-sole-stall as a *surface* object (the curator's canonical "not a family" case), shown under sole-and-heel.
- **Browse-semantics exemplar:** the same trick (e.g. whirl) rendered as the identical two-line row under each view, with only the grouping header differing.
- **Governance-states exemplar:** one canonical trick vs one observational-only name side by side, with their badges.

---

## 7. Implementation sequencing (for a future glossary-rewrite slice — NOT now)

1. **Foundation framing first** (low risk, high clarity): add the two-line row-contract explainer + the ontology-layer/five-way table + the browse-semantics map. These are net-new, self-contained, and unblock the rest.
2. **Reframe the existing ontology sections** (medium): rewrite §families to the five-way + hierarchy-direction model; add ecosystem theory to §modifiers; add the alternative-surfaces explainer to §surfaces. Sequence this AFTER the family-hierarchy ruling pass is at least scoped, so the glossary doesn't harden language the ruling will change — but the *direction* note ("transitional, will consolidate") can land immediately.
3. **Name the interpretation doctrine** (medium): rewrite §composition with eggbeater flagship + the descriptive-not-productive boundary + equivalence topology.
4. **Promote neighborhoods + governance** (low): lift Movement Neighborhoods into browse semantics; add the governance-states block.
5. **Bridges + intro** (low): tie JOB/ADD to line 2; add the ontology orientation to the intro card.
6. **Doc-sync** (with approval): reflect any new canonical glossary concepts in VIEW_CATALOG / a DESIGN_DECISIONS note.

Dependencies: step 2's family rewrite is the only part coupled to the curator ruling pass; everything else can proceed independently. None of this is the ruling pass itself.

---

## 8. Recommendation

Treat the glossary as the platform's **ontology explainer**, not just its notation key. The highest-leverage, lowest-risk first move is the trio of net-new framing pieces (row contract · browse semantics · five-way ontology table), because they are additive, unblock the section rewrites, and directly address the "explain the WHY of separation, do not blur" mandate. Hold the §families *rewrite* until the family-hierarchy ruling is scoped (to avoid hardening transitional language), but land the family-hierarchy *direction note* now. No glossary content has been changed by this audit; the rewrite is a separate, sequenced slice.
