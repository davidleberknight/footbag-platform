# Phase D2 — Glossary Family-Doctrine Integration

**Date:** 2026-05-28
**Type:** Doctrine + explanatory-architecture design/governance report. **NOT a glossary rewrite. NOT a taxonomy change.**
**Subject:** `src/views/freestyle/glossary.hbs` (16 sections) read against the now-implemented parent-family skeleton and the deepened family doctrine.
**Builds on:** `glossary-doctrine-sync-audit-2026-05-28` (the section-by-section audit), `family-ruling-pass-short-2026-05-28` (the 8-parent ruling), `family-hierarchy-audit-2026-05-28`, `family-taxonomy-candidate-matrix-2026-05-28`.

This report does not restate the section-by-section audit; it consumes it. Read §0 for what changed, then the deliverables.

---

## 0. What changed since the doctrine-sync audit

The sync audit (same day, earlier) held two things back. Both are now unblocked:

1. **The additive framing trio shipped.** `#section-reading-the-dictionary` is live: the two-line row-contract explainer, the six-view browse-semantics table, the five-way ontology table (canonical family / modifier ecosystem / alternative surface / movement neighborhood / alias-decomposition), the "family labels are transitional" note, and the modifier-ecosystem paragraph in §modifiers. Deliverables that the audit filed under "ADD net-new framing" are mostly **done**; this report does not re-proposes them.

2. **The family-hierarchy ruling is no longer hypothetical — it is implemented.** The 8-parent skeleton is live in code (reversible TS content map, no `trick_family` overwrite):
   - **8 parent families:** mirage, illusion, butterfly, legover, pickup, whirl (displays **"Whirl / Swirl"**), osis, around-the-world.
   - **Children folded subordinate into parents:** whirl ← swirl/twirl/rev-whirl/whirling-swirl; osis ← torque/blender/mobius; legover ← double-leg-over/guay/eggbeater; pickup ← double-pickup; around-the-world ← atw/double-around-the-world; mirage ← paradox-mirage/paradox-illusion.
   - **Route-outs (hidden from the family view):** foundational surfaces (toe-stall, clipper-stall, clipper); modifier ecosystems (pixie, fairy, atomic, quantum, surging, …); alternative surfaces (cross-body-sole-stall, sole-stall, …); multi-bag/kick primitives.
   - **Deferred labels still render as their own family group** (≈15): drifter, reverse-drifter, eclipse, butterfly-swirl, barrage, paradon, flurry, dyno, dada-curve, barfly, flail, double-over-down, down-double-down, infinity, superfly.
   - Rendered grouping count is now **23** (8 parents + 15 deferred), down from 89 raw labels.

The sync audit's one coupled item — *"hold the §families rewrite until the ruling is scoped"* — is therefore **released**. This report is that rewrite's doctrine input, deepened with five doctrine moves the audit did not yet have: the **productive-lineage family definition**, the **descendant-lineage middle tier**, **implicit contacts**, **fuzzy-boundary honesty**, and the **family-determination criteria**.

**Two inherited hard constraints still bind every proposal:** do not collapse ontology distinctions for pedagogical simplicity; always explain the WHY of separation (older vocabularies flattened family / surface / modifier / alias into one name-space).

A live-state note the rewrite must fix: §families prose currently lists **torque, blender, drifter, barrage, blur** as "family-anchor tricks" and uses the **root terminal / branch families** cohort model. The skeleton supersedes this — torque/blender are now osis children; drifter/barrage are descendant lineages, not parent anchors. This is the single largest doctrine→prose drift to repair.

---

## 1. Core ontology principle — what *is* a family?

The doctrine the glossary must teach, stated once:

> A **family** is a **productive movement lineage** with a **recognizable terminal mechanic**, a **structural identity**, and a **substantial descendant ecosystem**. A family is **not** merely "any trick that has descendants."

Five criteria; a parent family scores high on most, not necessarily all:

| Criterion | Question | Why it matters |
|---|---|---|
| **Recognizable terminal mechanic** | Does it end on a conserved, namable structure (e.g. *leggy-in dex → ss clipper*)? | The mechanic is what siblings share; it is the spine of the lineage. |
| **Structural coherence** | Do members decompose into the same skeleton, varying only by modifier/entry? | Distinguishes a lineage from a loose folk cluster. |
| **Descendant density** | Are there *many* productive descendants, not one or two? | Density is evidence, not authority (frequency ≠ canon), but a one-member "family" is a label, not a lineage. |
| **Educational usefulness** | Does grouping here help a learner build a mental model? | The browse exists to teach; a family that buries 60 unrelated tricks teaches nothing (the toe-stall failure mode). |
| **Cultural recognition** | Does the community already name and reason about this lineage? | Names that players already use are real ontology; invented "completeness" families are not. |

The two failure modes the criteria rule out:

- **Too broad (foundational surface):** toe-stall and clipper-stall *have* a terminal mechanic and enormous descendant density — but nearly every trick terminates on toe or clipper, so grouping by them has near-zero educational usefulness. They fail criterion 4. → **foundational surfaces, not families** (§2 below, and already route-outed in the skeleton).
- **No terminal mechanic of its own (modifier ecosystem):** pixie transforms hundreds of bases but ends on whatever the base ends on; it has no terminal mechanic. It fails criterion 1. → **modifier ecosystem, not a family**.

---

## 2. The integrated structural-object model

The sync audit's five-way distinction (family / ecosystem / surface / neighborhood / alias) is correct but *flat*. The deepened doctrine adds a **middle tier between "parent family" and "not a family"**: the **productive descendant lineage**. The integrated model the glossary should teach is three tiers of structural object, plus the three non-structural axes.

```
STRUCTURAL OBJECTS (the "By family" axis)
  ├─ Parent family            8 today, ~8–20 eventually.
  │                            High on all 5 criteria. Own terminal mechanic.
  │                            e.g. whirl, osis, mirage, butterfly, legover,
  │                            pickup, illusion, around-the-world.
  │
  ├─ Productive descendant     Compositional in origin (derives from a parent
  │   lineage                  or a chain), BUT culturally named and itself
  │                            productive — has its own recognizable
  │                            descendants. NOT a parent family.
  │                            e.g. drifter (≡ miraging clipper; →
  │                            reverse-drifter, high-plains-drifter),
  │                            barrage, paradon, flurry, blur/blurry.
  │
  └─ Child / sub-family        Folds INTO a parent; subordinate, not top-level.
                               e.g. swirl/twirl → whirl; torque/blender → osis.

NON-FAMILY AXES (separate browse systems; a trick lives in several at once)
  ├─ Modifier ecosystem       pixie/fairy/stepping/atomic/quantum/ducking/
  │                            gyro-spinning/symposium/paradox. Transforms many
  │                            bases; no terminal mechanic. → "By modifier".
  ├─ Foundational surface      toe-stall, clipper-stall, clipper. The contact
  │                            primitives most tricks terminate on. → §surfaces
  │                            + notation + neighborhoods, NOT "By family".
  ├─ Alternative surface       sole/heel/inside/outside/head-neck-shoulder/
  │                            cloud-knee/flying. An unusual *contact*, not a
  │                            lineage. → "By movement system" alt-surfaces.
  └─ Movement neighborhood     "feels mechanically similar" exploratory grouping.
                               → "By movement neighborhood" (topology).
```

The descendant-lineage tier is the doctrine's most load-bearing new idea: it lets the glossary say "drifter is a *real, named lineage* you can browse" **without** lying that it is a primitive parent family on par with whirl. It also gives the ≈15 currently-deferred labels a principled home: most are descendant lineages awaiting a formal lineage ruling, not parent-family candidates.

---

## 3. Section-level disposition (rewrite / additive / new)

Disposition of the 16 live sections for the *doctrine* integration specifically (the framing-trio dispositions from the sync audit are already shipped and omitted here).

| Section (id) | Disposition | What the doctrine integration requires |
|---|---|---|
| §section-reading-the-dictionary | **ADDITIVE** | Already carries the five-way table + browse semantics. Add one row/footnote naming the **descendant-lineage** middle tier so the five-way table becomes a three-tier-plus-axes map. Add the one-line educational-browse "why the same trick appears in several systems" statement if not already explicit. |
| §section-surfaces | **ADDITIVE → small REWRITE** | Host the **Implicit-contacts explainer** (§4b) as a new subsection. Sharpen the existing "Foundational surfaces" subsection with the WHY: *foundational surfaces are not browse families* (most tricks terminate here). Cross-link to the family doctrine. |
| §section-families | **REWRITE (core)** | The main work. Replace "root terminal / branch families" with **parent family / child sub-family / descendant lineage**. Embed the **"What makes a family?" explainer** (§4a). Re-sort the anchor list (drop torque/blender as anchors; demote drifter/barrage to descendant lineages). Add the **fuzzy-boundary honesty** note (§ deliverable 6). Reconcile prose with the live 8-parent skeleton. |
| §section-modifiers | **ADDITIVE** | Already has the "ecosystems, not families" paragraph. Add the **"Productive lineages vs ecosystems" explainer** (§4c) — the contrast table that makes the parent-vs-ecosystem boundary explicit and adds symposium/paradox as the hard cases. |
| §section-composition | **REWRITE (interpretation doctrine)** | Unchanged recommendation from the sync audit (name interpretation doctrine; eggbeater flagship; descriptive-not-productive boundary). Now also the home to explain that a descendant lineage's *origin* is a chain reading (drifter ≡ miraging clipper) even though it is browseable as a lineage. |
| §section-core-concepts (12 atoms) | **ADDITIVE** | Add a forward-link: the 12 core atoms are the parent-family anchor candidates; not every atom is a parent family (clipper-stall is a foundational surface). |
| §notation, §add-accounting | **ADDITIVE** | Sync-audit bridges only ("JOB/ADD are line 2"). No new family doctrine. |
| §dexterities, §timing-sets, §run-architecture, §advanced-reference, §community, §historical, §sources | **KEEP** | No family-doctrine change. §community/§historical remain the right place to anchor the *older-vocabulary-conflation* WHY and the fuzzy-boundary cultural examples. |

Net: **2 rewrites** (§families core, §composition interpretation), **1 small rewrite + additive** (§surfaces), **the rest additive or keep**. No section is deleted; no new top-level section is strictly required — the three new explainers nest inside existing sections (families / surfaces / modifiers), which keeps the rewrite surgical.

---

## 4. Proposed explainers (draft content — proposals, not inserted)

### 4a. "What makes a family?" — for §families

> **What makes a family?**
> Not every trick with spin-offs is a family. A **family** is a *productive movement lineage*: it has a **terminal mechanic** it always ends on, a **shared skeleton** its members decompose into, and **many** named descendants that the community actually reasons about. Whirl is the model — every whirl ends *leggy-in dexterity into a same-side cross-body clipper*, and dozens of tricks are built on that ending.
>
> Two things look like families but are not. **Foundational surfaces** (toe, clipper) are where *most* tricks end, so grouping by them would bury everything together and teach nothing — they live under [contact surfaces](#section-surfaces), not here. **Modifier ecosystems** (pixie, ducking, spinning) reshape a trick but have no ending of their own — they live under [modifiers](#section-modifiers).
>
> Between a parent family and a one-off trick sits the **descendant lineage**: a named, productive cluster that *descends* from a parent or a chain but has earned its own identity — drifter (a "miraging clipper" that spun off reverse-drifter and high-plains-drifter), barrage, paradon, flurry. The browse shows these as their own groups for now; a parent family they are not.

Anchors used: whirl (positive), toe/clipper (too-broad), pixie/ducking (no-mechanic), drifter (middle tier).

### 4b. "Implicit contacts" — for §surfaces

> **Implied contacts: what the name leaves out.**
> Freestyle names routinely omit a terminal contact the community treats as obvious. Reading the name correctly means restoring the implied part:
>
> - **`spin` means a spinning *kick*.** The kick is implied; "spin" alone names the rotation, and the contact that follows is understood.
> - **`spinning` by itself is *not* a trick.** It is a modifier with no terminal contact — there is nothing to land. A trick needs an ending; "spinning" needs a base to spin.
> - **`clipper` means a clipper *stall*.** The stall is the default reading of a bare surface name (this is why the dictionary treats a bare surface as a stall and makes kicks name themselves).
> - **`flying clipper` means a flying clipper *kick*** — and **`flying clipper stall`** spells out "stall" precisely *because* it has to contrast the implied kick. The explicit word appears only where the default would mislead.
>
> The rule: a bare surface defaults to a **stall**; a rotation or motion word (spin, spinning) implies a **kick** or needs a base; and a name spells out the contact only when the implied reading would be wrong. The 12 [core atoms](#section-core-concepts) each carry their own implied stall or kick — that is part of what makes them atoms.

Anchors used: spin / spinning / clipper / flying clipper / flying clipper stall (all curator-supplied), plus the kick-vs-stall notation convention already in doctrine.

### 4c. "Productive lineages vs ecosystems" — for §modifiers

> **Lineage or ecosystem? A test you can apply.**
> A **lineage** (family or descendant lineage) has an ending of its own; an **ecosystem** is a transformation you apply to someone else's ending.
>
> | | Productive lineage | Modifier ecosystem |
> |---|---|---|
> | Has its own terminal mechanic | **Yes** | **No** |
> | What it contributes | a base trick to build on | a transformation of a base |
> | Spread | a coherent family tree | broadcast across many unrelated bases |
> | Example | whirl, osis, drifter | pixie, ducking, spinning |
>
> The tell: you can do "a whirl." You cannot do "a pixie" — only a *pixie-something* (pixie-illusion, pixie-mobius, symposium-pixie). The ecosystem has no landing of its own.
>
> **Hard cases.** **symposium** and **paradox** behave like ecosystems (they transform many bases and have no terminal mechanic), even though older usage sometimes spoke of them as if they were families. The platform classifies them as ecosystems/systems for that reason. When a name could be read either way, ask the test question: *does it land on its own?*

Anchors used: whirl/osis/drifter (lineages) vs pixie/ducking/spinning (ecosystems); symposium + paradox as the hard cases. Note this sharpens, per the no-blur constraint, exactly the conflation older vocabularies made.

---

## 5. Exemplars to anchor each concept

| Concept | Primary exemplar | Contrast exemplar |
|---|---|---|
| Parent family (productive lineage) | **whirl** — *leggy-in dex → ss clipper*; central network attractor; huge descendant set | a singleton label (e.g. infinity) — a name, not a lineage |
| Foundational surface ≠ family | **clipper-stall / toe-stall** — most tricks terminate here | whirl — terminates *into* clipper but is a distinct lineage |
| Modifier ecosystem ≠ family | **pixie** across pixie-illusion / pixie-mobius / symposium-pixie | whirl — "do a whirl" works; "do a pixie" does not |
| Child / sub-family (folds in) | **swirl, twirl → Whirl / Swirl**; **torque, blender → osis** | osis — the parent the children fold into |
| Productive descendant lineage (middle tier) | **drifter** (≡ miraging clipper → reverse-drifter, high-plains-drifter) | torque (also compositional, but folds into osis rather than standing as a lineage) |
| Implicit contact | **spin = spinning kick**; **clipper = clipper stall** | **flying clipper stall** — spells out "stall" to defeat the implied kick |
| Fuzzy boundary | **whirl / swirl / twirl** (rotational cluster grouped pragmatically); **illusion / pickup / legover** (leggy cluster); **eclipse / butterfly-swirl** | a clean case: mirage's terminal mechanic is unambiguous |
| Educational browse (same trick, many lenses) | **whirl** rendered as the identical two-line row under By ADD / By family / By modifier / neighborhoods | — |

---

## 6. Fuzzy-boundary honesty (the doctrine's humility clause)

The glossary must *not* present the taxonomy as a perfectly rigid tree. A short note in §families:

> **Where the edges blur.** Some groupings are pragmatic, not provable. The rotational cluster **whirl / swirl / twirl** is grouped together because the community reasons about them together, not because there is one airtight mechanic. **illusion / pickup / legover** share a leggy-over feel that resists a single boundary. **rake / pendulum**, **eclipse / butterfly-swirl**, and the **drifter** lineage are historical and cultural clusters as much as structural ones. The browse is a learning aid; some of its lines are drawn by usage and judgement, and a future ruling may move them.

This protects the platform from over-claiming and matches the curator constraint ("avoid pretending the ontology is perfectly rigid"). It also explains *why* deferred labels still render separately — they are exactly the cases where the line is not yet drawn.

---

## 7. Implementation sequencing (for a future glossary-rewrite slice — NOT now)

Ordered low-risk-first; every step is additive or a contained rewrite within one section.

1. **§families anchor-list + cohort-name repair (REWRITE, do first).** Replace "root terminal / branch families" → "parent families / child sub-families / descendant lineages"; re-sort anchors to the live 8 parents; demote torque/blender (now children) and drifter/barrage (now descendant lineages). This removes the active doctrine→prose drift and is the prerequisite for the explainers.
2. **Embed "What makes a family?" (§4a) in §families.** Net-new prose, self-contained.
3. **Add the fuzzy-boundary note (§6) to §families.** One paragraph.
4. **Add "Implicit contacts" (§4b) as a §surfaces subsection** + sharpen the foundational-surfaces WHY. Independent of the family rewrite.
5. **Add "Productive lineages vs ecosystems" (§4c) to §modifiers.** Extends the existing ecosystem paragraph.
6. **Extend §reading-the-dictionary** with the descendant-lineage tier so the five-way table reads as three-tiers-plus-axes.
7. **§composition interpretation-doctrine rewrite** (eggbeater flagship; descriptive-not-productive; chain-origin of descendant lineages). Largest single rewrite; sequence last.
8. **doc-sync (with approval):** reflect any net-new canonical glossary concept (the family definition, the three-tier model, implicit contacts) in VIEW_CATALOG / a DESIGN_DECISIONS note. No canonical-doc edit without explicit approval.

Steps 1–6 are independent of any further ruling and can land as one slice. Step 7 is independent too but larger. **None of this changes the taxonomy or the skeleton** — it is doctrine and prose only.

---

## 8. Glossary sections blocked on future doctrine rulings

These cannot be hardened in the rewrite until the curator rules; the rewrite must use transitional language ("for now", "a future ruling may…") wherever it touches them.

| Blocked item | Open question | Interim glossary stance |
|---|---|---|
| **Descendant-lineage formalization** | Which deferred labels (drifter, barrage, paradon, flurry, blur, reverse-drifter, eclipse, butterfly-swirl, dyno, dada-curve, …) are *recognized* descendant lineages vs mere labels awaiting compression/merge? | Name the tier and give drifter/barrage as examples; do **not** publish a closed list. |
| **symposium / paradox final class** | System vs modifier ecosystem vs (for symposium) something larger? | Classify as ecosystems with the "hard case" caveat in §4c; flag as curator-confirmable. |
| **Child sub-headings under parents** | Should folded children (swirl, torque) show a visible sub-heading inside the parent, or stay merged (current behavior)? | Glossary describes children as "subordinate, shown within the parent"; does not promise sub-headings. |
| **whirl/swirl/twirl internal structure** | Is "Whirl / Swirl" one family with rev-direction children, or a cluster of near-siblings? | Present as a pragmatic cluster (fuzzy-boundary note); do not assert a rigid sub-tree. |
| **illusion / pickup / legover boundary** | Three parents, or one leggy super-family with sub-families? | Keep as three parents (current skeleton) + fuzzy-boundary note; defer any merge. |
| **eclipse / butterfly-swirl** | Independent lineages, or butterfly descendants? | Leave as deferred own-families; name them in the fuzzy-boundary examples. |
| **Foundational-surface visibility** | Should the glossary actively teach "toe/clipper are surfaces not families," or just omit them from family prose? | Teach it explicitly (the educational-value WHY) — this is settled doctrine, not blocked; listed here only to mark it as a deliberate, ruled decision. |

---

## 9. Recommendation

The doctrine-sync audit already shipped the additive framing trio and held only the §families rewrite, pending the ruling. The ruling is done and implemented. The highest-leverage next move is the **§families rewrite (steps 1–3)**, because the live prose now actively contradicts the shipped skeleton (lists torque/blender as anchors). Pair it with the two new self-contained explainers (implicit contacts → §surfaces; lineages-vs-ecosystems → §modifiers), which are independent and low-risk. Hold the descendant-lineage *list* and the symposium/paradox *final class* as transitional language until a ruling. The three-tier model (parent family · descendant lineage · child) is the spine that lets the glossary teach the taxonomy honestly without over-claiming rigidity. No glossary content, taxonomy, or skeleton is changed by this report.
