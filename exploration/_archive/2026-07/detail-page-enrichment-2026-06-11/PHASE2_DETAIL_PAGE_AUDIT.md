# Freestyle Detail-Page Completeness — Phase 2 Audit

Read-only. **No content edits, no promotions, no doctrine changes.** Companion data:
`detail_enrichment_candidates.csv`, `fb_org_comparison_priorities.csv`.

## Corrected relationship ontology (the load-bearing change)

The detail page must express **five distinct relationship categories** — not collapse them into "family."
Each needs a WHY explanation, not a bare list.

| category | definition | example | current detail-page surface |
|---|---|---|---|
| **Family** | shared terminal identity + structural lineage + parent/child derivation | Mobius ∈ Osis **and** Torque families | family ladder + chip + branch→root "Also a member of" chips |
| **Modifier** | an operator applied to a base | Spinning / Ducking / Atomic / Quantum / Symposium | "Modifiers on this trick" block (cluster + axis + optional gloss) |
| **Movement System** | the 4 pedagogical axes + Alternative Surfaces | Midtime Body, No-Plant Suspension | axis chip per classified modifier |
| **Quantity Ladder** | same base at increasing repetition count — **NOT a family** | Spin → Double Spin → Triple Spin | **none — does not exist** |
| **Movement Neighbors** | similar mechanics, **not lineage** | Pendulum ↔ Rake; Double Kick ↔ Double Knee | `EXPLICIT_NEIGHBORS` → related list, rule="neighborhood" |

This corrects two Phase-1 recommendations: the spin ladder is **not** a family-fold (it's a quantity ladder),
and pendulum/rake and double-kick/double-knee are **movement neighbors**, never families.

---

## Report 1 — Detail-page completeness

Render order is a flat partial flow; the target is a 6-section skeleton. Status:

| section | source | status |
|---|---|---|
| About this trick (2–4 paras) | `trick-about` ← terse DB `description` | **THIN** — no multi-para slot; 1-line placeholder or suppressed |
| Movement intuition | `trick-intuition` ← `freestyleTrickIntuition.ts` | **SPARSE** — 27 / 714 pages authored |
| Structural identity | `trick-about`/`trick-modifiers`/`trick-family` | **UNGROUPED & SCATTERED** across non-adjacent partials |
| Notation | `trick-notation`/`-operational`/`-add-analysis`/`-scoring-notes` | **UNGROUPED** (4–5 siblings) |
| Related tricks (the 5 categories above) | `trick-related` flat + `trick-next`/`-previous` separate | **NOT CATEGORY-SPLIT** — one flat list; rule data exists but isn't grouped; quantity ladder absent |
| Media / tutorials / records | media block + `trick-records` | **PRESENT** |

Rich pages (Torque, Mobius) additionally **front-run** the basic sections: the L2–L6 editorial essay partials
(`mechanical-delta`, `ontology-role`, `productivity`, `family-evolution`, `progressive-readings`) render
*before* `trick-about` and Notation — article sprawl ahead of identity. Fix = re-order into a "Deeper reading"
band after Notation (no content deleted).

---

## Report 2 — Family / Modifier / System / Neighborhood gap report

### A. Family completeness
- **Membership + dual-family: PRESENT** (the shipped `additionalFamilies` branch→root chips show e.g. Mobius under both Torque and Osis).
- **WHY text: MISSING for the general case.** The only "why" is the `family-anchor` callout (conserved-terminal-mechanic), which fires **only when the trick IS the family anchor**. A regular member, and every dual-family chip, render with **no explanation of why it belongs**. Mobius shows "Torque family" + "Also a member of: Osis family" but never says *torque is itself an osis derivative (miraging-osis), so mobius inherits the osis terminal*.
- **Gap:** add a per-membership rationale (one line per family the trick belongs to), especially for dual-family rows.

### B. Modifier completeness
- **Listing: PRESENT** for all 28 linked modifiers (`modifierMemberships`).
- **Explanation: MISSING for 22 of 28.** Only **6 modifiers have a composition gloss** (`ducking, paradox, pixie, spinning, stepping, symposium`). The other **22 are listed without any explanation**: `atomic, quantum, nuclear, fairy, gyro, barraging, furious, illusioning, miraging, whirling, swirling, tapping, blurry, diving, inspinning, backside, floating, railing, shooting, splicing, surfing, warping`.
- **Gap:** author one-line composition glosses for the 22 un-glossed modifiers (highest first: atomic, quantum, nuclear, fairy, gyro, miraging, whirling — the high-frequency ones).

### C. Movement System completeness
- **Chip: PRESENT only for classified modifiers.** `resolveAxisForModifier` covers ~15 modifiers across the 4 axes; **15 linked modifiers map to NO axis** (`backside, barraging, blurry, floating, furious, illusioning, inspinning, miraging, railing, shooting, splicing, surfing, swirling, tapping, warping`). A trick whose only modifiers are unclassified gets **no movement-system chip** even if it sits under a system in the browse.
- **WHY: the chip is the axis *name* only** — the axis *definition* ("the support leg stays off the ground during the dex") lives on the browse page, not the detail chip.
- **Gap report:** (i) classify the 15 unaxised modifiers (or mark them out-of-system deliberately); (ii) carry the axis one-line definition onto the detail chip as hover/inline text.

### D. Movement Neighborhood completeness
- **Relationship: PRESENT** where curated (`EXPLICIT_NEIGHBORS`, `NEIGHBORHOOD_GROUPS`); rendered in the flat related list with rule="neighborhood" → label "Movement neighbour".
- **Rationale: MISSING.** The reader sees "Movement neighbour" but **not why** (e.g. pendulum↔rake = swing-element pair; double-kick↔double-knee = both-limb airborne contact). And several obvious neighbors are **un-curated** (see Report 3/4): `double-kick` (empty list), `miraging-kick`→`mirage`, `toe-clipper`→`flying-clipper`.
- **Missing neighbor explanations:** every `NEIGHBORHOOD_GROUPS`/`EXPLICIT_NEIGHBORS` entry needs a one-line rationale field; today there is none.

---

## Report 3 — Quantity-Ladder report

Quantity ladders (same base, increasing count) are **not modeled at all**. Enumerated from the dictionary:

| ladder | members (ADD) | `trick_family` of each | status |
|---|---|---|---|
| **Spin** | spin (1) · double-spin (2) · triple-spin (3) | `spin` · **`double-spin`** · `spin` | **BROKEN** — double-spin in its own family; `buildNextTricks(spin)` returns only triple-spin |
| Around-the-world | atw · double-atw (3) · triple-atw (4) | all `around-the-world` | links (same family) but not labeled as a ladder; double-atw-heel branches off |
| Orbit | orbit · double-orbit (3) · triple-orbit (4) | all `orbit` | same-family; not labeled as ladder |
| partial doubles | double-fairy/-pixie/-illusion/-whirl/-pickup (3–4); triple-mirage (4); triple-swirl (5) | base family | doubles exist without their triple, or vice-versa — incomplete ladders |

**Findings:**
- **Broken links:** the Spin ladder — the canonical example — is split across `spin` / `double-spin` / `spin` families, so the progression surfaces only triple-spin as "next," skipping double-spin, and never reaching the `spinning` *modifier* or spinning-ecosystem tricks.
- **Missing members:** several bases have a double but no triple (double-fairy/-pixie/-illusion/-whirl) or a triple but no double (triple-mirage, triple-swirl) — incomplete ladders.
- **No progression explanation:** ladders are rendered (when same-family) as generic "next tricks" with no "this is the N-count form of X" framing.
- **Recommendation:** a small curated `QUANTITY_LADDERS` overlay (e.g. `['spin','double-spin','triple-spin']`, `['orbit','double-orbit','triple-orbit']`, …) drives a dedicated "Quantity ladder" relationship group with progression rationale — **distinct from family and from next-tricks**, and crucially does NOT require re-homing double-spin's `trick_family` (it stays its own family; the ladder is a cross-family relationship). Plus a `spinning`-modifier cross-link CTA on the spin members.

---

## Report 4 — Pendulum exception report

| axis | finding |
|---|---|
| **Notation** | `pendulum` = `TOE SWING (SET) > SAME TOE [DEL]` — the SWING is an unbracketed **(SET)** element; 2 ADD from **1 bracket** (documented swing-element exception). `rake` = `SET > SWING [DEX] > SAME TOE [DEL]` — same swing notated as a scored **[DEX]** (2 brackets = 2 ADD, clean). |
| **Description** | "Pendulum trick." (placeholder); `rake` = "Rake trick." (placeholder). Both empty of real content. |
| **Family / base** | pendulum: `trick_family=''`, `base_trick=''` (orphan); rake: self-family. |
| **Historical** | earlier this session pendulum was ruled into the set-standalone "set → toe-stall" convention alongside pixie/fairy/surging — but its swing differs structurally from those launch sets. |
| **Similar case** | `rake` is the directional reverse (scoop→toe-stall vs swing→toe-stall); pendulum + rake are the swing-element pair. Provenance for this lives only in `freestyleResolvedFormulas` source notes, rendered nowhere. |

**Recommendation (no data change):** treat pendulum as a **legitimate exception** to the set→toe-stall doctrine.
Unlike pixie/fairy/surging (launch sets that need a terminating surface to be a trick), the **pendulum swing
is itself the completing action** — it may terminate in a toe stall, a kick, a hand catch, or a follow-on trick
without changing identity. The cleanest model: a **"swing-element" category** holding pendulum + rake, with an
**open terminal** (toe stall as the default representative, others identity-preserving). This also resolves the
notation asymmetry by letting pendulum's swing be scored like rake's `SWING [DEX]`. Set-launch primitives
(pixie/fairy/surging) keep their forced toe-stall; the swing-element exception is a *second category*, not a
carve-out of the first. **Pendulum's relation to rake, its swing movement, and its open-terminal status must be
surfaced on the page** (today: nowhere).

---

## Report 5 — fb.org content-merging report

fb.org content classified into: **Description / Movement-intuition / Execution-tips / Historical / Member-tips.**
fb.org carries essentially only the first three (a single technique paragraph); it has **no historical or
member-tip layer**. Verdict per high-priority target:

| trick | fb.org has | verdict | action |
|---|---|---|---|
| **osis** | description + execution ("spin into a clipper; bag passes behind back; eyes on bag") | **THEIRS clearly superior — ours is WRONG** ("inside-to-outside delay combination") | MERGE: replace our mischaracterisation; keep our family role |
| **whirl** | execution ("support-leg circle front-up-over; toes-down tip") | **THEIRS superior — ours mis-cues** ("body-spin dex") | MERGE: fix the body-spin framing; keep family anchor |
| **barfly** | description ("double out-to-in clipper circle") | **THEIRS superior** — ours "Double infinity." opaque | MERGE |
| **mirage** | execution ("swing under then back over from a toe set") | **MERGE** — ours precise, fb.org adds the under-then-over cue + clipper-set-easier |
| **illusion** | execution ("waist-high set; reverse miraging") | **OURS ≥ theirs** (intuition module precise); graft the waist-high cue |
| **fairy / pixie** | description (out-to-in / in-to-out circle, support-leg toe) | **THEIRS superior** — ours are bare modifier notes | MERGE → real descriptions |
| **flying-clipper** | (no fb.org prose) | ours adequate; **author from user ruling** (inside kick, leg tucked behind) | OURS / curator |
| **dragon** | **no fb.org prose** (notation only) | **OURS superior** (our "outside-surface analogue of clipper" is the real content) | keep ours; add intuition |
| **pendulum / rake** | **no fb.org prose** (empty) | neither — **curator content needed** (swing-element) | curator-author |
| **double-spin / triple-spin** | **fb.org name-only, empty description** | neither has prose | curator-author + ladder framing |

Broad scan (`fb_org_comparison_priorities.csv`, 714 rows): **41 THEIRS-STRONGER** (placeholder + fb.org prose),
**98 fb.org-name-only** (need curator content), **17 ours-stronger**. The 22 curated proposals with rewritten
`About` + `Movement intuition` are in `detail_enrichment_candidates.csv` (no verbatim fb.org copied to any
rendered surface).

---

## Report 6 — Prioritized implementation roadmap (by educational value)

Ranked by learner impact, **not** ease:

1. **Fix the accuracy errors (osis, whirl, barfly).** Highest value — these foundational pages are currently
   *wrong/misleading*. Rewrite descriptions/intuition from the merged fb.org execution guidance (candidates CSV).
   *(content overlay; curator-gated.)*
2. **Category-split the Related band into the 5 relationship types**, each with a WHY line — Family / Modifier /
   Movement System / **Quantity Ladder** / Movement Neighbors. Service-side `relatedGroups` from existing `rule`
   data + a new `QUANTITY_LADDERS` overlay + per-row rationale. Makes the whole relationship model legible.
   *(view-model + template; no schema.)*
3. **Author the 22 missing modifier glosses + the dual-family WHY lines.** Turns "listed" into "explained" across
   B and A — broad coverage gain. *(content overlay.)*
4. **Model the Quantity Ladder** (spin/orbit/atw + complete the partial doubles) with progression text and the
   `spinning`-modifier cross-link. Fixes the broken spin ladder. *(overlay + view-model field.)*
5. **Surface the pendulum/rake swing-element exception + open-terminal status**, and the missing neighbor
   rationales (double-kick↔double-knee, miraging-kick→mirage, toe-clipper→flying-clipper). *(overlay one-liners,
   curator-gated; Pendulum pending your exception ruling.)*
6. **Backfill Movement-intuition coverage** (27 → foundational ~60) from the candidates CSV, and **add the
   multi-paragraph `aboutParagraphs` slot**. Long-tail content backlog. *(content overlay + one view-model field.)*
7. **Re-home the Torque/Mobius L2–L6 essay band** below Notation (content-neutral re-order). *(template only.)*
8. **Classify the 15 unaxised modifiers** for movement-system completeness (or mark out-of-system). *(overlay.)*

Every code step is additive view-model/template work; every content/relationship step is a reversible TypeScript
overlay (`EXPLICIT_NEIGHBORS` / `NEIGHBORHOOD_GROUPS` / `QUANTITY_LADDERS` / `MODIFIER_COMPOSITION_GLOSSES` /
`freestyleTrickIntuition` / `FAMILY_OVERRIDES`) — no schema, no SQL, no doctrine change. Slice 2 (the category-split
Related band) is the recommended first build: it scaffolds all five relationship categories at once.
