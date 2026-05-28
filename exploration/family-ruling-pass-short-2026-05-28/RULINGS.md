# Family Ruling Pass — SHORT (stabilization)

**Date:** 2026-05-28
**Type:** Governance rulings (documentation). **NOT implementation. NOT the full ontology pass.**
**Inputs:** `family-hierarchy-audit-2026-05-28/REPORT.md`, `family-taxonomy-candidate-matrix-2026-05-28/MATRIX.md`.

> **Objective:** establish a *stable-enough* family skeleton to unblock the next phases — canonical-page consistency (Phase C), glossary doctrine finalization (Phase D pt2), and safe Emerging Vocabulary expansion (Phase E). This pass rules ONLY the high-leverage, obvious questions and **explicitly defers** every controversial edge case. "Stable enough," not "perfect."

> **Non-goals (this pass):** no doctrinal perfection; no settling of blurry / illusioning / eclipse / butterfly-swirl / orbit / down / fusion; no one-off folk-name adjudication; no parser policy; no observational-name governance. No code or data changed.

Each ruling: **Decision · Rationale · Affected labels · Implementation impact · Glossary impact · Further review needed.**

---

## R1 — Approve the canonical parent-family skeleton

**Decision.** Adopt **8 canonical parent families** as the stable skeleton (within the ~8–12 target):

1. **Mirage** (hippy-in dex)
2. **Illusion** (leggy dex) — provisional standalone anchor
3. **Butterfly** (hippy-out → clipper)
4. **Legover** (leggy over)
5. **Pickup** (leggy pickup)
6. **Whirl / Swirl** (rotational → clipper; one combined parent)
7. **Osis** (spin → clipper)
8. **Around-the-world** (ATW rotation)

**Rationale.** All eight are **productive movement lineages**: a base movement with its own terminal mechanic that spawns a family of named compounds. They are the least controversial anchors. Whirl + Swirl are combined per the topology pairing and the explicit merge authorization (R5). Illusion is kept as its own anchor (a *leggy* atom; nesting it under hippy Mirage would be wrong) — marked **provisional** pending the leggy/hippy super-grouping question.

> **Revision (2026-05-28):** `toe-stall` and `clipper-stall` are **removed** from the parent skeleton. They are foundational surface / base primitives, not productive movement lineages in the sense of mirage / whirl / osis / butterfly / legover / pickup. See **R4**.

**Affected labels.** mirage (49), illusion (26), butterfly (35), legover (33), pickup (21), whirl (52) + swirl (12), osis (28), around-the-world (2). (Row counts as of 2026-05-28.)

**Implementation impact.** Define these as the parent set in a reversible content registry (base-trick → parent map); do NOT overwrite `trick_family` destructively.

**Glossary impact.** These become the named parent families in the future §Families rewrite (Phase D pt2). The additive "family labels are transitional" note already shipped covers the interim.

**Further review needed.** YES (lightweight): whether Illusion and a future "Leggy-dex" super-parent absorb each other; whether Whirl/Swirl stays one parent or splits. Provisional, not blocking.

---

## R2 — Approve modifier ecosystems (not families)

**Decision.** Treat the following as **modifier/operator ecosystems** (By Modifier surface), NOT canonical families: **pixie, fairy, stepping, atomic, quantum, ducking, spinning, gyro, symposium, paradox**. Any `trick_family` label that is merely one of these names retires from the family taxonomy.

**Rationale.** An ecosystem transforms *many* bases and has **no terminal mechanic of its own** — it modifies a base that does. That is the family/ecosystem boundary. These already live in the modifier vocabulary (`freestyleMovementSystems.ts` / By Modifier).

**Affected labels** (family labels that exist today and retire): pixie (3), fairy (1), atomic (1), quantum (1), plus the operator/modifier self-labels surging (1), terrage (1), spyro (1), pogo (1), rooted (1), sailing (1), shooting (1), furious (1). (stepping / ducking / spinning / gyro / symposium / paradox are already modifier-only — no family label to retire.)

**Implementation impact.** Remove these from `familyGroups`; they have a home in By Modifier. **Exception to re-home:** the two real tricks currently carrying the `pixie` family label (symposium-pixie, trixie) need a parent-family assignment — DEFERRED to the full pass (do not orphan; temporarily leave their current label until ruled).

**Glossary impact.** Confirms the already-shipped ecosystem framing in §Modifiers.

**Further review needed.** NO for the ecosystem ruling itself; YES only for re-homing symposium-pixie / trixie (deferred).

---

## R3 — Approve Alternative (unusual) Surfaces (not families)

**Decision.** The following unusual-surface / kick `trick_family` labels move to **Alternative Surfaces** (already curated on the `?view=movement-system` alt-surfaces section) and retire from the family taxonomy:

- **Sole and heel:** cross-body-sole-stall, sole-stall, heel-stall, sole-kick
- **Inside and outside:** inside-stall, outside-stall
- **Head, neck, shoulder:** head-stall, neck-stall, shoulder-stall, forehead-stall
- **Cloud and knee:** cloud-stall, cloud-kick, knee-stall
- **Flying / airborne:** flying-inside, flying-outside, dragonfly-kick

**Rationale.** A catch surface is not a movement lineage. These are already grouped on the Alternative Surfaces surface; the family labels are pure redundancy (the curator's `cross-body-sole-stall should NOT be a family` is the representative case).

**Affected labels.** The 16 listed above (all singletons except cross-body-sole-stall = 2).

**Implementation impact.** Remove from `familyGroups`; no new surface needed (they already render under Alternative Surfaces).

**Glossary impact.** Confirms the already-shipped Alternative-Surfaces explainer; §Surfaces rewrite (Phase D pt2) will reference these groups.

**Further review needed.** NO. (The `clipper` bare-surface label vs the clipper-stall primitive is handled by R4.)

---

## R4 — Reclassify toe-stall and clipper-stall as FOUNDATIONAL base surfaces (not families, not "alternative")

**Decision.** `toe-stall` and `clipper-stall` are **foundational base-surface concepts**, NOT top-level parent families and NOT "alternative" surfaces. They are the two primary contact surfaces of the sport: highly visible in the glossary and ontology, but they do not anchor a productive movement family.

**Rationale.** Unlike mirage/whirl/osis (which spawn productive compound lineages with a conserved *terminal mechanic of motion*), toe and clipper are **surfaces** — the place the bag is caught — not movements. They are foundational (more central than the "alternative" surfaces in R3), so they are NOT demoted into the Alternative-Surfaces bucket; they sit in the glossary's **Foundational Surfaces** concept instead.

**Affected labels.** toe-stall (4), clipper-stall (20), and the bare `clipper` surface label (2).

**Implementation impact.** Remove toe-stall / clipper-stall / clipper from `familyGroups`. Keep their relationships discoverable through the layers that already carry them: **surfaces** (glossary Foundational Surfaces), **JOB notation** (the `[toe]` / `[clip]` tokens), **interpretations** (≡ readings), **Movement Neighborhoods**, and **equivalence topology** — not through a family heading.

**Glossary impact.** The glossary already has a "Foundational surfaces" subsection (toe, clipper) under §Surfaces — that is their home. The §Families rewrite (Phase D pt2) must NOT list toe/clipper as families. The shipped five-way ontology table already separates "alternative surface" from "canonical family"; a note should clarify that toe/clipper are *foundational* surfaces (distinct from both families and alternative surfaces).

**Further review needed.** NO (the reclassification). Knock-on for the drifter lineage → R6.

---

## R5 — Approve obvious hierarchy merges (children under parents)

**Decision.** Nest the following as **child sub-families** under their parent (they render as sub-sections under the parent, not as top-level families):

| Parent | Children (merged this pass) |
|---|---|
| **Osis** | torque, blender, mobius |
| **Whirl / Swirl** | swirl, twirl, rev-whirl, whirling-swirl |
| **Legover** | double-leg-over, guay, eggbeater |
| **Pickup** | double-pickup |
| **Around-the-world** | double-around-the-world; **atw** (alias-merge into around-the-world) |
| **Mirage** | paradox-mirage, paradox-illusion (single-compound rows; fold in, not own families) |

**Rationale.** Each merge follows an established lineage: torque/blender ≡ miraging/whirling osis; mobius ≡ gyro-torque; eggbeater ≡ atomic legover; double-/reverse-variants are explicit compounds of their base. `atw` and `around-the-world` are the same lineage split across two labels (a data quirk) — merge. These are the merges the curator explicitly authorized.

> **Note:** the **drifter** lineage is NOT merged under a clipper-stall family (clipper-stall is no longer a family per R4). See **R6**.

**Affected labels.** torque (18), blender (18), mobius (3), swirl (12), twirl (3), rev-whirl (1), whirling-swirl (2), double-leg-over (15), guay (4), eggbeater (10), double-pickup (2), double-around-the-world (1), atw (2), paradox-mirage (1), paradox-illusion (1).

**Implementation impact.** These map to a parent in the registry; the family view renders them as child sub-sections. Reuse the existing `FAMILY_DUAL_MEMBERSHIPS` mechanism for any dual-membership cases (torque/blender already dual-listed under osis).

**Glossary impact.** Feeds the parent/child exposition in the deferred §Families rewrite (NOT this pass).

**Further review needed.** Mostly NO. Two flags: **eclipse** (mirage vs osis) and **butterfly-swirl** (whirl/swirl vs butterfly) are NOT merged here — DEFERRED (R8). The `rev-whirl` label/member mismatch (its only member is `surgery`) should be cleaned during implementation.

---

## R6 — Drifter lineage = compositional descendant ("miraging clipper"), NOT a clipper-stall family

**Decision.** `drifter`, `reverse-drifter`, and `high-plains-drifter` are a **compositional / structural descendant lineage** — the "miraging clipper" structure — recognized through the compositional layers, NOT inherited from a (now-removed) clipper-stall family.

**Rationale.** With clipper-stall reclassified as a foundational surface (R4), drifter cannot be a clipper-stall family child. Drifter ≡ *miraging clipper*: the "miraging" operation is mirage-derived and the "clipper" is the catch surface. So drifter is best understood as a derived/descendant structure, surfaced via **interpretation (≡ readings)**, **equivalence topology**, **JOB notation**, and **Movement Neighborhoods** — not as an independent terminal family.

**Affected labels.** drifter (12), reverse-drifter (2), high-plains-drifter (1).

**Implementation impact.** Do NOT route drifter into a clipper-stall family. Two acceptable interim placements (exact choice DEFERRED, light-review): (a) attach the drifter lineage as a **descendant under Mirage** (via the miraging operation), or (b) keep a small standalone "drifter (miraging clipper)" descendant grouping that the equivalence topology links to both mirage and the clipper surface. Until ruled, leave the drifter labels as-is rather than forcing a parent.

**Glossary impact.** Drifter is a good **equivalence-topology / interpretation exemplar** (drifter ≡ miraging clipper) in the deferred §Composition/§Families work — it demonstrates how a structure can be a descendant without being its own terminal family.

**Further review needed.** YES (light): Mirage-descendant vs standalone-descendant placement for the drifter lineage.

---

## R7 — Approve obvious retirements

**Decision.** Retire these obvious non-family labels (beyond R2/R3/R4):

- **Multi-bag → its own category** (not a trick family): 2-bag-juggling (1), 3-bag-juggling (1).
- **Kick primitives → not families** (browse home is a kick grouping; most already sit in Alternative Surfaces): spin (1), double-spin (1), double-knee (1), knee-clipper (1). *(spin/double-spin remain first-class tricks per the kick-doctrine reclassification; only their family LABEL retires.)*

**Rationale.** Juggling and bare kick primitives are not structural trick families.

**Affected labels.** 2-bag-juggling, 3-bag-juggling, spin, double-spin, double-knee, knee-clipper.

**Implementation impact.** Remove from `familyGroups`; multi-bag gets a small category bucket; kicks route to a kick grouping (home detail DEFERRED).

**Glossary impact.** None new beyond the shipped five-way table.

**Further review needed.** YES (small): the kick grouping's browse home (spin/double-spin) — deferred.

---

## R8 — Explicit deferrals (DO NOT rule this pass)

| Deferred item | Why deferred |
|---|---|
| **blurry doctrine** (blur, blurry-* compression bridges) | compression-vs-derivation doctrine; not a family question |
| **illusioning doctrine** (the modifier; distinct from the Illusion *family* approved in R1) | modifier-ecosystem edge; needs movement ruling |
| **eclipse** final status | mirage-lineage vs osis-lineage ambiguous |
| **butterfly-swirl** final status | spans Whirl/Swirl vs Butterfly |
| **orbit** | core atom; standalone vs descendant of Around-the-world |
| **down lineage** (double-over-down, down-double-down) + **fusion** (`dod` → fusion) | "down" paradoxes; label/member mismatches |
| **drifter-lineage placement** | Mirage-descendant vs standalone (R6) |
| **one-off folk names** (barfly, flail, barrage, paradon, dyno, dada-curve, flurry, infinity, superfly, bullwhip, jani-walker, plasma, refraction, ripstein, rake, squeeze, hop-over, walk-over, wrap, blizzard) | novel-base-vs-compound is a per-label movement ruling; `infinity↔barfly` data quirk |
| **re-homing symposium-pixie / trixie** | the 2 real tricks under the retired `pixie` label |
| **kick grouping home** (spin/double-spin) | where bare kicks browse |
| **parser-policy questions** | out of scope |
| **observational-name governance** | out of scope (Phase E) |
| **leggy/hippy super-parents** (Illusion/Pickup/Legover grouping) | R1 anchors are provisional; super-grouping deferred |

---

## Summary outputs

### 1. Approved parent families (8)
Mirage · Illusion (provisional) · Butterfly · Legover · Pickup · Whirl/Swirl · Osis · Around-the-world.
*(toe-stall + clipper-stall removed → foundational base surfaces, R4.)*

### 2. Approved ecosystem categories (By Modifier)
pixie · fairy · stepping · atomic · quantum · ducking · spinning · gyro · symposium · paradox (+ retire operator self-labels surging/terrage/spyro/pogo/rooted/sailing/shooting/furious from family).

### 3. Approved Alternative Surface categories (unusual surfaces)
Sole and heel · Inside and outside · Head/neck/shoulder · Cloud and knee · Flying/airborne.
*(toe-stall + clipper-stall are FOUNDATIONAL surfaces — NOT in this bucket and NOT families; R4.)*

### 4. Approved hierarchy merges
Osis ← torque/blender/mobius · Whirl/Swirl ← swirl/twirl/rev-whirl/whirling-swirl · Legover ← double-leg-over/guay/eggbeater · Pickup ← double-pickup · Around-the-world ← double-around-the-world/atw(alias) · Mirage ← paradox-mirage/paradox-illusion.
*(drifter lineage is a compositional descendant, NOT a clipper-stall child; R6.)*

### 5. Deferred doctrine bucket
blurry · illusioning · eclipse · butterfly-swirl · orbit · down/fusion · drifter-lineage placement · one-off folk mini-families · symposium-pixie/trixie re-home · kick grouping home · parser policy · observational-name governance · leggy/hippy super-parents.

### 6. Estimated family-count reduction (after removing toe-stall + clipper-stall)
From **~90 labels (≈38 rendered)** → a stable skeleton of **8 canonical parent families** (down from 10 before the revision). This pass firmly resolves ~62 of 90 labels: 8 parents + ~15 merged children (nested) + ~36 retired/relocated (ecosystems ~12, alternative surfaces 16, foundational surfaces 3 [toe-stall/clipper-stall/clipper], multi-bag/kick ~6) + the 3-label drifter descendant lineage (recognized, placement deferred). **~25–30 labels remain deferred** and keep their current label until the full pass. Implementing only these rulings cuts the rendered **top-level** family count from ~38 to roughly **8–16** (8 parents + still-unruled deferred labels temporarily retained).

### 7. Recommended implementation order
1. Reversible **parent-family content registry** (base-trick → parent map) for R1 + R5 (no destructive `trick_family` overwrite).
2. **Route out** R2 ecosystems → By Modifier; R3 surfaces → Alternative Surfaces; R4 toe-stall/clipper-stall → Foundational Surfaces concept; R7 multi-bag/kicks → their categories (retire those family labels from `familyGroups`).
3. **Nest** R5 children as parent sub-sections (reuse `FAMILY_DUAL_MEMBERSHIPS`).
4. **Leave deferred labels untouched** (drifter lineage included) — accept a temporary mixed state.
5. **Reconcile counts:** landing "By family" + the family-view scale intro report the parent count (8).
6. **URL aliases:** `?family=<retired-or-merged-slug>` → parent / surface (link stability) before labels change.
7. **Glossary §Families + §Surfaces rewrite + VIEW_CATALOG doc-sync** (Phase D pt2) once the skeleton is implemented — ensure toe/clipper render as foundational surfaces, not families.

### 8. Risks if implemented now
- **Mixed transitional state:** ~25–30 deferred labels (incl. the drifter lineage) still render as flat leaves alongside the new parents. Acceptable for "stable enough," but the family view will not look fully normalized until the full pass.
- **Drifter homelessness:** with clipper-stall gone as a family, drifter/reverse-drifter/high-plains-drifter have no parent until R6 placement is ruled — keep their current label meanwhile (do not strand).
- **URL stability:** retiring/merging ~50 labels (now including toe-stall/clipper-stall/clipper) breaks `?family=<slug>` deep links unless aliases land first (step 6).
- **Provisional anchors:** Illusion-standalone and the Whirl/Swirl combination may be revisited by the full pass — mark them provisional so the rewrite isn't treated as final.
- **Orphan risk:** symposium-pixie / trixie lose their (retired) `pixie` label before re-homing is ruled — keep their current label until then.
- **Topology unaffected:** Movement Neighborhoods key off `base_trick`, not `trick_family`, so this migration does not touch them (low risk there); toe/clipper relationships remain visible there + via notation + interpretation + equivalence topology (R4).
- **Reversibility:** keep `base_trick` unchanged and express parents as a content map, so any deferred ruling can re-route a child (or the drifter lineage) without a data migration.

---

*No code or data changed. Implementation remains a separate, sequenced slice; the deferred bucket awaits the full ruling pass.*
