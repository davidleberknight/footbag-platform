# ADD Analysis Section — Plan

**Date**: 2026-05-17.
**Companion artifacts**:
  - `discrepancy_case_candidates.csv` — vetted case-study row set with safety flags
  - `ADD_ANALYSIS_PROSE_DRAFT.md` — draft prose ready for curator review

**Status**: planning artifact only. No code changes; no glossary.hbs edits. Curator approval gates integration.

> **Discipline**: educational, not doctrinal. Reuses existing Slice Q / Slice P / Wave 1 Red-ruling data. Never invents formulas. Never resolves Wave 2 questions. Preserves four-layer separation.

---

## 1. Recommended integration path

**Recommendation: dedicated `/freestyle/add-analysis` page, linked from glossary §10 and from `/freestyle/history`.**

### Why a dedicated page (not a glossary subsection)

| Criterion | Glossary §10 subsection | Dedicated page |
|---|---|---|
| Current §10 size | 1,925 chars — minimal | Lots of headroom |
| Content volume | Draft is ~340 lines (worked examples + discrepancies) | Naturally absorbs the volume |
| Anchor-numbering risk | New §10 subsections fine; new top-level §11 would renumber §11→§12, breaking inbound anchors | No spine impact |
| Discoverability | Glossary-curious readers find it; History-curious readers don't | Both surfaces can link |
| Curator-edit ergonomics | Embedded in glossary.hbs alongside 11 other sections | Single template, focused edits |
| Section dominance | Doubles glossary §10's size; may overload the section's "run quality + format terms" framing | Clean separation |

Alternative if curator prefers in-glossary: add a single h3 subsection inside §10 ("ADD accounting — a worked walkthrough") with the worked-examples table, and put the full discrepancy section on its own page anyway. This is the hybrid path.

### Anchor strategy

- Page at `/freestyle/add-analysis`
- Linked from glossary §10 (after the run-quality table) and from `/freestyle/history` ADD-system section
- Section anchors: `#how-add-is-built`, `#worked-examples`, `#discrepancies`, `#interpretation-notes`

---

## 2. Section outline

### Part 1 — How ADD is built (mechanical components)

A short framing paragraph + a single illustrative table. Avoids doctrinal language.

The educational frame: "ADD values are constructed from mechanical components contributed by the trick's structural parts. The most reliable contributions are listed below; some interactions are historically debated and addressed in the discrepancy section."

**Component contribution rough guide** (curator-confirmed; educational restraint):

| Component class | Typical ADD contribution | Notes |
|---|---|---|
| Stall on a recognized surface | 1 ADD | toe-stall, clipper-stall, sole-stall, etc. |
| Dexterity | 1 ADD | one bag-foot interaction |
| Unusual / specialized surface (head, neck, etc.) | 1 ADD | per surface curator-confirmed |
| Body modifier (paradox, ducking, symposium, spinning) | +1 ADD on non-rotational bases | base-dependent; see worked examples |
| Set primitive (pixie, stepping) | +1 ADD | base-dependent; some are +0 in certain contexts |
| Atomic | +1 non-rotational, +2 rotational (pt4 / pt10) | base-class-sensitive |
| Nuclear | +2 ADD | structurally = paradox + atomic (pt10) |
| Quantum | +1 ADD | compressed atomic (pt10) |
| Blurry | +1 ADD | = stepping paradox (pt11 transitive expansion) |
| Same-side (ss) / far / near / reverse | +0 ADD | positional; Red 2026-05-11 + 2026-05-15 |
| Hidden / X-dex preservation | base-trick-specific | atom-smasher carries an implicit X-dex from a toe (Red 2026-05-15) |

Hard rule to state explicitly: "**Asserted ADD is editorial truth.** When a row's stated ADD diverges from the additive calculation, the row's stated value is canonical and the calculation is diagnostic. This is the IFPA editorial contract."

### Part 2 — Worked examples

8 examples, ordered low-to-high. Each example: base + modifiers + ADD calculation + 1-line "why" note.

The user-named set: **clipper, mirage, whirl, butterfly, osis, torque, blurry whirl, mobius**.

| Trick | Components | ADD | Why |
|---|---|---|---|
| Clipper | clipper kick (1) | 1 | A 1-ADD body-kick into clipper position. |
| Mirage | base rotational primitive (2) | 2 | Foundational rotational base. |
| Whirl | base rotational primitive (3) | 3 | Foundational rotational base. |
| Butterfly | base rotational primitive (3) | 3 | Foundational rotational base. |
| Osis | base primitive (3) | 3 | Foundational primitive — anchor for an entire family. |
| Torque | miraging osis = miraging (+1) + osis (3) | 4 | pt11-locked: torque IS the canonical reading of "miraging osis". |
| Blurry whirl | stepping (+1) + paradox (+1) + whirl (3) | 5 | pt11 + Wave 1: blurry transitive-expands to stepping paradox. |
| Mobius | gyro torque = gyro (+1) + torque (4) | 5 | Or deeper: spinning ss miraging osis = spinning (+1) + ss (+0) + miraging (+1) + osis (3) = 5. Two readings, same ADD. |

This is **pedagogical scaffolding**, not a parser walk. The point is to show the reader HOW the count is constructed, not to enforce a unique decomposition.

### Part 3 — Discrepancies & why they happen

Frame: "Different sources count the same trick differently — sometimes because they decompose the structure differently, sometimes because they treat a modifier differently, sometimes because the trick's history pre-dates the modern operator vocabulary. The cases below illustrate the most common patterns."

Subsection structure per case study:

```
### {Trick name}

  - IFPA ADD: {value}
  - External (source): {value}
  - Decomposition difference: {one-line summary}
  - Pattern: {historical / semantic / modifier-class / positional / hidden-dex}
  - IFPA status: {settled by Red ruling X / pending Red Wave 2}
```

10 cases selected, vetted, prioritized below.

### Part 4 — Interpretation notes (closing)

Three short paragraphs:

1. **Asserted ADD is editorial truth.** Re-state the contract.
2. **The system is incomplete by design.** Some compounds are folk-named without curator-confirmed decomposition; they carry a "pending decomposition refinement" indicator on the trick card.
3. **Where to go next.** Link to the trick dictionary, glossary §7 (notation), `/internal/coverage` (if shipped), and the [external reconciliation queues](this-doc).

---

## 3. Discrepancy case study safety classification

### 3a. SHIP-NOW SAFE cases (Red-ruled; settled; pedagogically rich)

Each case below is closed by a curator-locked Red ruling (pt1-pt12 + Wave 1 batch 2026-05-15). They illustrate the discrepancy mechanism without exposing contested doctrine.

1. **Hurl (Nuclear ss Whirl)** — IFPA=5, FM=4 (Δ=-1). Mechanism: SS=+0 universal (Red 2026-05-11). Pattern: positional operator treated as ADD-contributor by FM, ADD-zero by IFPA.

2. **Barfry (Nuclear ss Butterfly)** — IFPA=5, FM=4 (Δ=-1). Same SS pattern as Hurl.

3. **Godzilla (Nuclear ss Dyno)** — IFPA=6, FM=5 (Δ=-1). Same SS pattern.

4. **Blurry Whirl (= Stepping Paradox Whirl)** — IFPA=5. Mechanism: blurry transitively expands to stepping paradox (pt11 + Wave 1 2026-05-15). Pattern: compression-vs-expansion alternatives at different stopping depths.

5. **Blurry Torque (= Stepping Paradox Torque)** — IFPA=6. Same transitive expansion.

6. **Food Processor (= Stepping Paradox Blender)** — IFPA=6. Same; this one is interesting because it transitive-expands a compound base (blender = whirling osis).

7. **Mobius (= Gyro Torque ≈ Spinning ss Miraging Osis)** — IFPA=5. Mechanism: multi-depth decomposition; same ADD via two routes. Pattern: stopping-depth ambiguity at the language level.

8. **Atom Smasher (= Atomic Mirage)** — IFPA=4. Mechanism: atomic carries an X-dex like paradox from a toe (Red 2026-05-15). Pattern: hidden mechanism preserves a +1 contribution that's not visible in the surface name.

9. **Baroque (Barraging Osis) = Two dexes + Osis** — IFPA=5. Mechanism: barraging contributes through structural dex-multiplication rather than as a modifier (Red 2026-05-15). Pattern: operator-class question (modifier vs structural).

10. **Bladerunner (FM: Atomic Eggbeater)** — IFPA=4, FM=5 (Δ=+1). Mechanism: pt4 ruling makes eggbeater = atomic legover already; FM's "Atomic Eggbeater" recursively applies atomic a second time. Pattern: recursive-operator-application not allowed in IFPA canonical math.

### 3b. CONTROVERSIAL / Wave-2-blocked cases (NOT for public surface)

These illustrate live disputes — including them in a public educational surface would be premature. Defer until Wave 2 lands.

- **Eggbeater (atomic legover vs illusioning legover)** — Y-Q1 pending; both FM and PB say illusioning, IFPA says atomic (pt4). Including would frame IFPA's ruling as contested without curator endorsement.
- **Nemesis (furious barfly vs barraging barfly)** — W2-Q6 pending (barraging operator class).
- **Witchdoctor (atomic symposium mirage)** — W2-Q3 + W2-Q4 pending (X-dex doctrine + folk-stabilization threshold).
- **Fairy-led compounds** — W2-Q1 pending (operator boundary).
- **Surreal / Montage / Surge** — folk-stabilization candidates pending W2-Q4.

### 3c. Edge cases (mention briefly; do not deep-dive)

These have answers but the answers are subtle. Mention via single-line summary in §3 case-studies, not full case study.

- **Sumo (Nuclear Mirage) = 5** via X-Dex named exception (pt9). Mention as: "Sumo's X-Dex exception is a named pt9 ruling — see records_master for the source citation."
- **Genesis (FM: Furious Whirl) FM=7 vs IFPA=5** — Δ=+2; FM-over from FM's rotational-escalation rule which IFPA doesn't apply post-pt10. Mention but don't deep-dive.

---

## 4. Suggested wording for uncertainty / disagreement

The user explicitly asked to NOT frame disagreements as "the other source is wrong." The proposed lexicon:

| Phrase to AVOID | Phrase to USE |
|---|---|
| "{Source} has it wrong" | "{Source} decomposes this differently" |
| "the correct ADD is..." | "IFPA's canonical math arrives at..." |
| "{Source} is outdated" | "{Source} reflects an earlier convention" |
| "incorrect" | "different interpretation" |
| "fixed" | "settled by a recent ruling" |
| "should be X" | "in IFPA's framing, X" |
| "wrong base" | "different choice of structural base" |
| "missing modifier" | "treats modifier X as positional rather than additive" |
| "outdated count" | "uses a historical convention that the modern operator vocabulary refines" |

Standardized closer for each case: **"IFPA's status: settled by {Red ruling} / pending {Wave 2 question}."**

---

## 5. Ship-now vs post-Red split

### Ship-now (with curator approval after reading the draft)

- The full educational section (Part 1: components, Part 2: worked examples)
- The 10 SHIP-NOW SAFE case studies (§3a) — all Red-settled
- The two edge cases (§3c) as brief mentions
- The interpretation-notes closing (Part 4)

### Defer to post-Red

- All 5 controversial cases (§3b)
- Any discrepancy involving fairy, barraging-operator-class, blurry-transitivity-on-base-trick, atomic-vs-illusioning, hidden-dex-doctrine, or folk-stabilization-threshold
- Productive-multiplicity questions
- Operator-vs-trick boundary cases

### Hard never-ship (curator restraint)

- Single-source claims without IFPA corroboration treated as facts
- Resolution of any of the 6 Wave 2 packet items
- Claims about "the correct ADD" — always frame as IFPA-canonical-math vs source-X-convention

---

## 6. Recommended implementation phasing

If the curator approves the dedicated-page path:

**Phase 1 (single slice)**:
- New route `/freestyle/add-analysis` + minimal controller
- Add `getAddAnalysisPage()` to `freestyleService.ts` returning curator-content
- New template `src/views/freestyle/add-analysis.hbs`
- Curator content lives in `src/content/freestyleAddAnalysisContent.ts` per [[feedback_reversible_content_governance]]
- Glossary §10 + history page each gain a single cross-link
- 1 small integration test

Estimated scope: ~250 lines of TS content + ~30 lines of service + ~120 lines of template + ~50 lines of test = ~450 lines net additions. No schema, no SQL, no parser, no ADD changes.

**Phase 2 (deferred to curator-paced authoring)**:
- Curator vets case-study prose against the proposed wording lexicon (§4)
- Add Phase 3c discrepancies as Wave 2 answers land

**Phase 3 (long-tail)**:
- Embedded inline cross-links from each worked example to the trick-detail page
- Glossary §7 (Symbolic Notation) cross-link back to the discrepancy examples

---

## 7. Restraint check

- ✅ No ADD value changes
- ✅ No Wave 2 resolutions
- ✅ No fabricated formulas
- ✅ No parser internals exposed
- ✅ Contested doctrine excluded from public surface
- ✅ Four-layer separation preserved (this is GLOSSARY PEDAGOGY layer — Layer 3 — not canonical ontology)
- ✅ Asserted-ADD-is-editorial-truth contract restated
- ✅ Honest incompleteness via "pending decomposition" link to UNRESOLVED_COMPOUNDS pilot
- ✅ Reversible content module pattern recommended

---

## 8. What this slice does NOT do

- ❌ No glossary.hbs edits
- ❌ No new routes
- ❌ No new content modules
- ❌ No code changes whatsoever this slice
- ❌ No tests
- ❌ No Wave 2 dependency resolution
- ❌ No new template

Deliverables this slice: 3 artifacts (this plan + the CSV + the prose draft). Implementation gated on curator approval.

---

## 9. Recommendation summary for the curator

1. **Approve the dedicated-page approach.** ADD analysis content is too large for §10 and too cross-cutting (links to history, glossary, trick dictionary) to live in any single section.
2. **Review `ADD_ANALYSIS_PROSE_DRAFT.md`** and edit any wording before integration.
3. **Approve the 10 SHIP-NOW SAFE cases** + 2 edge-case brief mentions.
4. **Defer the 5 controversial cases** until Wave 2 lands.
5. **Once approved**, the implementation phase (Phase 1 above) is a clean, ~450-line slice with no Wave 2 or ontology dependencies.

---

## End
