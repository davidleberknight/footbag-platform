# Phase C — Canonical Trick-Page Completeness + Ontology Consistency

**Date:** 2026-05-28
**Type:** Audit + implementation-plan report. **NOT a mass-edit pass. No page, content module, or data row is changed by this report.**
**Subject:** all promoted canonical trick-detail pages (`GET /freestyle/tricks/:slug`), measured against the shipped 8-parent family skeleton, the two-line row contract, and the Phase D2 family-doctrine report.
**Inputs consumed:** `freestyleParentFamilies.ts` (live skeleton), `glossary-family-doctrine-2026-05-28/REPORT.md`, `family-ruling-pass-short-2026-05-28`, the stabilized browse-row contract, interpretation/ecosystem/alt-surface doctrine.

Hard constraints honored throughout: **do not fabricate ontology, do not invent formulas**, and preserve the distinction between canonical names / aliases / interpretations / productive modifiers / equivalence topology / observational vocabulary.

---

## 0. Audit universe + method

The detail page is **not** a two-line row — it is the L1–L6 universal-grammar shell (`getTrickDetailPage`, freestyleService.ts:5465). The two-line contract governs the *browse* surface; on the detail page the equivalent question is **slot integrity** across the page's distinct slots:

| Slot | Fed by | Governance |
|---|---|---|
| JOB / operational notation | `resolveOperationalNotationRaw`: CoreTrickSpec (12 atoms) → RESOLVED_FORMULAS → DB `operational_notation` | curator-published |
| Semantic notation | DB `notation` → `shapeSemanticNotation` | per-row |
| ADD accounting | `adds` / computed | per-row + first-class cohort |
| Interpretation (≡) | `freestyleSymbolicEquivalences` (92 chains) + overlays: `interpretation`(1), `compressedFrom`(5), `equivalenceTopology`(2) | curator-locked allowlists |
| Description | DB `description` | per-row prose |
| Family / lineage context | DB `trick_family` (raw) → `familyName`, `familyMembers`, `familyTiers` | **NOT parent-skeleton aware** |
| Intuition / mechanical-delta / transform / primitiveNote | curator content modules (23 / 20 / 5 / atoms) | curator-locked |

**Universe:** 490 active trick rows (categories: compound 446, surface 15, dex 14, body 13, multi-bag 2). Review status: 466 `expert_reviewed`, 24 `curated`. Each has a detail page.

**Baseline completeness (DB):** 100% have `adds`, `trick_family`, and a non-empty `description`; 459/490 have `operational_notation` (DB col; more resolve via CoreTrickSpec/RESOLVED_FORMULAS), 464/490 semantic `notation`, 481/490 `base_trick`. So the gap is **not** empty fields — it is **slot misuse, thin/auto-generated prose, and family-context drift**.

---

## 1. Headline findings

| # | Finding | Scale | Severity |
|---|---|---|---|
| F1 | **Detail-page family context ignores the parent skeleton.** The family block uses raw `trick_family` — no parent-fold, no route-out handling, no descendant-lineage framing. | systemic (all 490) | **HIGH** |
| F2 | **31 pages show a retired route-out label as their family context.** clipper-stall ×20 (incl. drifter, high-plains-drifter), toe-stall ×4, clipper ×2, cross-body-sole-stall ×2, **pixie ×2**, sole-stall ×1. | 31 pages | **HIGH** |
| F3 | **Stale branch-family prose contradicts the skeleton.** `freestyleTrickProgressiveReadings.ts:454` and `freestyleTrickMechanicalDelta.ts:210` assert *"Torque earned its own descendant family / anchors a sub-family"* — but torque now folds into osis as a child. | 2 content entries (torque; audit blender) | **HIGH (doctrine)** |
| F4 | **Decomposition leaks into the description slot.** 78 descriptions are auto-generated `"X-modified Y"` strings (e.g. *"Pixie-modified mirage"*, *"Gyro-modified torque"*, *"Blurry-modified mirage"*). | 78 pages | **MEDIUM** |
| F5 | **Some `"X-modified Y"` descriptions imply productive doctrine for non-productive modifiers** ("Blurry-modified…", "Gyro-modified…") — a productive-modifier reading the doctrine explicitly rejects. | subset of F4 | **MEDIUM (doctrine)** |
| F6 | **Pure placeholder descriptions.** 5 pages read exactly `"Compound trick."` (bullwhip, dyno, paradon, +2); 1 page leaks ADD into description (`"3-ADD named compound"`, eclipse). | 6 pages | **MEDIUM** |
| F7 | **Thin descriptions on doctrine-central tricks.** 140/490 (29%) have <40-char descriptions, including legover, blender, mobius, smear, blur, orbit, magellan, eclipse, paradon. | 140 pages | **LOW–MEDIUM** |
| F8 | **Interpretation overlays are sparse by design but uneven.** ≡ chain registry covers 92 tricks; curator overlays cover few (interpretation 1, compressedFrom 5, equivalence-topology 2). Gaps are mostly *gated*, not drift — but several high-density tricks lack any overlay while low-density ones have them. | n/a | **LOW** |
| F9 | **Media coverage is thin.** 79/490 (16%) pages carry a curator media tag. Sourcing is the gallery track (owner: the primary maintainer), not this pass; only badge *consistency* is in scope here. | 411 pages | **LOW (out-of-track)** |

JOB and ADD slot integrity is otherwise **clean**: no evidence of JOB notation leaking into the description slot, no duplicated JOB prose, no compound notation in the wrong layer. The slot-integrity problem is concentrated in the **description slot** (F4–F6) and the **family slot** (F1–F3).

---

## 2. Item-by-item audit (against the 10 requested checks)

**1. Two-line row consistency.** Browse surface is stabilized (prior slices); spot-checks of detail pages show no legacy `dict-card`/green-chip leakage. The detail page is intentionally the L1–L6 shell, not a two-line row. **No action**; the equivalent concern is slot integrity below.

**2. Interpretation-layer consistency.** The ≡ layer is two-tier: the broad **chain registry** (92 entries, drives line-1 ≡ across browse + the detail interpretation reading) and **curator-locked overlays** (interpretation: eggbeater; compressedFrom: smear/ripwalk/atom-smasher/eggbeater/mobius; equivalence-topology: flurry/witchdoctor). Missing overlays are **by design** (gated), not drift. The real issue is F4/F5 — the 78 `"X-modified Y"` descriptions form a **shadow interpretation layer in the wrong slot**, and some imply productive doctrine. Named-trick spot check:

| Trick | family (raw) | ≡ / overlay state | Issue |
|---|---|---|---|
| eggbeater | legover ✓ | interpretation + compressedFrom (`≡ atomic legover`) | clean (the flagship) |
| drifter | **clipper-stall** | chain `≡ miraging clipper`; intuition entry | F2 family context = retired surface |
| torque | osis ✓ | chain `≡ miraging osis`; intuition; **branch-family prose F3** | F3 prose; desc "Mirage variation of an osis." (F4) |
| mobius | **torque** | compressedFrom; intuition | family context = child label (should be osis); desc "Gyro-modified torque." (F4/F5) |
| blur | mirage ✓ | intuition | desc "Blurry-modified mirage." (F5 productive-implication) |
| blurriest | **barfly** | intuition | family context = deferred label; thin desc |
| paradon | paradon (deferred) | — | desc "Compound trick." (F6) |
| barrage | barrage (deferred) | intuition | no semantic notation; OK desc |
| flurry | legover ✓ | equivalence-topology; intuition | OK |
| atom-smasher | mirage ✓ | compressedFrom; intuition | clean |
| quantum-mirage/osis/whirl | mirage/osis/whirl ✓ | chain | **correct** — quantum compounds inherit base family, not a "quantum" family |

**3. Formula-slot integrity.** JOB and ADD slots are clean. The description slot is not: 78 decomposition strings (F4), 1 ADD-in-description (F6), 5 placeholders (F6). Recommendation: decomposition belongs in the ≡/interpretation layer (already chain-backed for most); the description slot should carry *descriptive* prose or be left to curator.

**4. Family/ecosystem consistency.** The core Phase C problem (F1–F3). The skeleton was applied to the family *browse* view (`familyMap` parent-fold + route-out skip) but **not** to the detail-page family block. Result: detail pages and the browse view disagree —
- drifter detail page links `?family=clipper-stall` (a retired foundational surface); browse shows drifter as its own lineage.
- the 2 pixie-family tricks present "Pixie" as a family (ecosystem-as-family, contradicts doctrine).
- torque/mobius compounds present child-label family context ("Torque") rather than the osis parent.

**5. Modifier ecosystem consistency.** pixie appears as a `trick_family` on 2 rows → presents as a family on those detail pages (F2/F5). quantum compounds are correct (inherit base family). No `spinning`/`ducking`/`gyro`/`symposium`/`paradox` rows carry those as `trick_family` (good — they live in modifier links/ecosystems, not family). The lone ecosystem-as-family leak is **pixie**.

**6. Canonical-page completeness.** All fields populated; the gap is *quality*: 140 thin descriptions (F7), 5 placeholders (F6), 31 missing op-notation (DB col), 26 missing semantic notation, 9 missing base_trick. **Do not fabricate** the 31/26/9 — flag for curator. Prioritize by centrality (see §4).

**7. Equivalence-topology consistency.** 2 ratified topology entries + 92 chains. Spot-checks (drifter ≡ miraging clipper, torque ≡ miraging osis, eggbeater ≡ atomic legover) are coherent and non-contradictory. The only topology↔family contradiction is F2 (drifter's chain says "miraging clipper" — compositional descendant — while its family slot says it *belongs to* clipper-stall). No false-derivation or misleading-compression found in the named set.

**8. Media consistency.** 79/490 pages carry media. Badge logic (`tutorialMedia`/`demoMedia`, heading selection) is already centralized in the service and renders consistently; no badge-ordering drift found. Coverage *expansion* is the gallery track (out of scope). In-scope: confirm badge wording/order stays service-owned (it is). **No action this pass beyond noting the coverage stat.**

**9. Canonical exemplars.** See §6.

---

## 3. Severity + prioritization

| Severity | Findings | Why |
|---|---|---|
| **HIGH (doctrine)** | F1, F2, F3 | Detail pages actively contradict the shipped skeleton + family doctrine; visible to readers; undermines the ontology-consistency goal. |
| **MEDIUM** | F4, F5, F6 | Slot misuse + doctrine-implying prose; not contradictory but degrades pedagogy and blurs the interpretation/description boundary. |
| **LOW–MEDIUM** | F7 | Thin prose on central tricks; pedagogical, not incorrect. |
| **LOW / out-of-track** | F8, F9 | Gated-by-design (overlays) or owned by the gallery track (media). |

Highest leverage: **F1 fixes F2 and the pixie/torque/mobius/drifter family-context problems at once**, because they are all the same root cause (detail page ignores the skeleton).

---

## 4. Proposed fixes

### 4a. F1/F2 — make the detail-page family block skeleton-aware (single coded slice, highest leverage)
The family-context block should reuse the **same** reversible content map the browse view uses:
- resolve `trick_family` through `resolveParentFamily` before deriving `familyName` / `familyMembers` (so torque/mobius show the **Osis** parent and its lineage);
- when the raw family is a **route-out** (`isRetiredFamily`), suppress the "family" framing and instead present the appropriate axis: foundational-surface note (toe/clipper), ecosystem note (pixie), or alternative-surface note (cross-body-sole-stall);
- when the raw family is a **deferred descendant lineage** (drifter, barrage, paradon, …), present it as a *descendant lineage* (per the Phase D2 three-tier model), not as a primitive family.

This is a deterministic service change driven by the existing content map — **not** mass page-editing. drifter's `trick_family='clipper-stall'` is then handled at render time without a data migration (consistent with the "reversible content, no `trick_family` overwrite" rule).

### 4b. F3 — reconcile the branch-family prose (curator)
`progressiveReadings.ts:454` + `mechanicalDelta.ts:210` assert torque "earned its own descendant family." The skeleton folded torque into osis. **Doctrine-sensitive:** either (a) reword to "torque is a productive osis-lineage compound (mobius, paradox-torque, atomic-torque) that folds under the osis parent," or (b) curator decides torque is a *descendant lineage* (middle tier) and the skeleton keeps a torque sub-group. Do not mechanically edit — this is a real classification call. Audit blender for the same prose.

### 4c. F4/F5/F6 — description-slot cleanup (curator, batched by pattern)
- **5 `"Compound trick."` placeholders** → curator prose (or a neutral structural sentence). Safe to template a better default, but the content is curator-owned.
- **78 `"X-modified Y"`** → for productive-modifier cases the decomposition already lives in the ≡ chain; the description can become descriptive prose or defer to the ≡ reading. For **non-productive** modifiers (blurry-, gyro-, whirl-as-modifier) the wording must change (F5) because it implies a productive modifier the doctrine rejects. Batch by modifier; curator approves wording.
- **1 `"3-ADD named compound"` (eclipse)** → move ADD to the ADD slot (already present); replace description with prose.

### 4d. F6/F7 missing/thin — curator, do not fabricate
31 missing op-notation, 26 missing semantic notation, 9 missing base_trick, 140 thin descriptions. **No fabrication.** Flag the central ones (next section) for curator authoring; leave the long tail.

---

## 5. Page classification

**Safe for mechanical / coded cleanup (deterministic, no new ontology):**
- F1/F2 family-context resolution (one service slice; reuses `resolveParentFamily` + `isRetiredFamily`). Fixes all 31 retired-context pages + all parent-fold pages at once.
- Badge ordering/wording (already service-owned; verify only).
- The single eclipse ADD-in-description move.

**Require curator review (judgment / prose / authoring):**
- The 78 `"X-modified Y"` description rewrites (esp. the non-productive-modifier subset, F5).
- The 5 `"Compound trick."` placeholders.
- Missing op-notation (31) / semantic notation (26) / base_trick (9) — **never fabricate**.
- Thin descriptions on the central tricks (§6 weak list).

**Doctrine-sensitive (blocked on / needs explicit ruling):**
- F3 torque "earned its own family" — child vs descendant-lineage (also blender).
- drifter family classification — compositional descendant vs clipper-stall member (the Phase D2 middle-tier question, applied to data).
- Which deferred labels (barrage, paradon, blurriest/barfly, eclipse, dyno, …) are *recognized descendant lineages* vs labels awaiting compression/merge — governs how their detail pages frame "family."
- pixie-as-`trick_family` on 2 rows — confirm re-home (the rows should derive their base family, like quantum compounds do) — needs the per-row base decided.

---

## 6. Canonical exemplars

**Strongest (use as ontology exemplars / templates for the rest):**
- **whirl, mirage, butterfly, osis, illusion** — the L1–L6 flagships: intuition + mechanical-delta + transform/primitiveNote + clean family context. The model for what a complete page looks like.
- **eggbeater** — the interpretation flagship: clean `≡ atomic legover`, compressedFrom, correct legover family, descriptive-not-productive framing intact.
- **mobius** — strong overlay set (compressedFrom + intuition), *except* its family context (F1).

**Weakest high-priority (fix first, in this order):**
1. **drifter** — retired family context (F2) + thin desc + doctrine-sensitive classification. Central, high-descendant-density.
2. **torque** — stale branch-family prose (F3) + decomposition description (F4). Central osis-lineage node.
3. **blur** — non-productive-modifier description (F5); a named lineage anchor.
4. **legover** — parent family anchor with a 19-char description ("Leg-over dexterity."); a parent page should not be thin.
5. **paradon, blurriest, the 5 "Compound trick." placeholders** — own-label deferred lineages with no real prose.

**Suitable as future ecosystem/lineage exemplars** once fixed: drifter (descendant-lineage exemplar), pixie-family rows (ecosystem-not-family exemplar), torque (child-folds-into-parent exemplar).

---

## 7. Implementation sequencing (for future slices — NOT now)

1. **F1/F2 family-context coded slice (HIGH, do first).** Make the detail-page family block skeleton-aware (parent-fold + route-out + descendant-lineage framing) via the existing content map. One service change + template wording + tests. Resolves 31 retired-context pages + all parent-fold pages deterministically. Independent of any new ruling for the parent/route-out cases; descendant-lineage framing for deferred labels can ship as a neutral default and harden after §5 rulings.
2. **F3 branch-family prose reconciliation (curator ruling, then 2-entry edit).** Blocks on the torque child-vs-lineage decision.
3. **F6 placeholders + eclipse ADD-move (curator prose, small).** 6 pages.
4. **F4/F5 description batch (curator, by modifier).** 78 pages; sequence the non-productive-modifier subset first (doctrine risk).
5. **F7/F6 central-trick authoring (curator).** Weak list in §6; long tail deferred.
6. **doc-sync (with approval)** if the family-context behavior or any canonical concept changes — VIEW_CATALOG / SERVICE_CATALOG.

Steps 2, 4, 5 are curator-content work and do not block step 1. Step 1 is the only coded slice and is the highest-leverage single move.

---

## 8. Estimated stabilization completeness

| Dimension | Today | After step 1 (coded) | After steps 1–4 (coded + curator batches) |
|---|---|---|---|
| Two-line / browse-row contract | ~100% | 100% | 100% |
| JOB / ADD slot integrity | ~99% | 99% | ~100% |
| **Family/ecosystem consistency** | **~84%** (31/490 wrong context + parent-fold drift) | **~99%** | ~100% |
| Interpretation-layer (no wrong-slot leakage) | ~84% (78 desc leaks) | 84% | ~98% |
| Description quality (non-thin, non-placeholder) | ~71% | 71% | ~90%+ (central tricks; long tail deferred) |
| Media coverage | 16% | 16% | 16% (gallery track) |

**Overall canonical-page ontology consistency ≈ 80% today.** The single coded slice (step 1) lifts the family/ecosystem dimension from ~84% to ~99% and is the highest-leverage move. Full stabilization (~95%+, excluding the gallery-owned media dimension and the deliberately-gated overlay coverage) is reached after the curator description/prose batches. No page, content module, or data row has been changed by this audit.
