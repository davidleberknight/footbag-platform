# SCALE-9 Coverage Refresh — Pool Decomposition Against 74-Pilot Baseline

Refresh of `SCALE7_COVERAGE_ANALYSIS.md` reflecting 21 promotions since 2026-05-11
(SCALE-7 of 10 + mobius mini of 1 + SCALE-8 of 10). **No DB writes.**

**Date:** 2026-05-12
**Pilot tier:** 74 of 160 active rows (46.25%)
**Non-pilot eligible pool:** 68 rows (160 active − 18 modifier-stub rows − 74 pilots)

---

## 1. Pool decomposition

| Category | Count | Next-step lane |
|---|--:|---|
| **bridge-extension** | 8 | SCALE-9 highest ROI (rows share modifier(s) with existing pilots OR introduce a new modifier cohort) |
| **foundation candidates** | 5 | SCALE-9 foundation-pass (referenced by pilots / has deps / atomic primitives) |
| **standalone-with-records** | 5 | SCALE-9 viable (record-traffic justifies independent enrichment) |
| **pt12-blocked** | 5 | DEFERRED — awaiting Red answer on transitive-blurry packet (blur / blurry-whirl / blurry-torque / food-processor / blurriest) |
| **baroque-legacy** | 1 | DEFERRED — barraging-osis (CANONICALIZATION_POLICY §3) |
| **future-eligible (exotic-standalone)** | 44 | SCALE-future or skip (stalls / flying-X / dex primitives / direction variants / atomic primitives without records or deps) |
| **total non-pilot eligible** | **68** | |

Immediately SCALE-9 eligible: **18 rows** (8 bridge + 5 foundation + 5 record). Comfortably room for a 10-row batch.

---

## 2. Tier 1 — Bridge candidates (8 rows)

Sorted by pilot-siblings (unique current pilots sharing any modifier with this row). Higher = stronger bridge edge = higher prose ROI.

| Slug | ADD | Family | Modifiers | Pilot-siblings | Bridge role |
|---|--:|---|---|--:|---|
| **surreal** | 6 | whirl | paradox + spinning + stepping | 32 | **flagship 3-mod** (joins Montage / Gauntlet / Mobius / Surge / Surgery — 6th flagship row) |
| **superfly** | 5 | barfly | symposium | 9 | symposium-bridge 8th family base (1st barfly-family pilot via symposium) |
| **plasma** | 5 | plasma | quantum | 2 | quantum-bridge 3rd family base (after tripwalk + legeater) |
| **tapping-whirl** | 4 | whirl | tapping | 2 | tapping-bridge 3rd family base (after tap + spinal-tap) |
| **sumo** | 5 | mirage | nuclear | 1 | nuclear-bridge 2nd family base (after matador) |
| **vortex** | 4 | drifter | gyro | 1 | gyro-bridge 2nd family base (after mobius) |
| **nemesis** | 6 | barfly | furious | 1 | furious-bridge 2nd family base (after fury) |
| **whirling-swirl** | 4 | swirl | whirling | **0** | **whirling-cohort OPENER** (no current whirling pilots) |

**Modifier cohorts that grow:** symposium 9→10, quantum 2→3, tapping 2→3, nuclear 1→2, gyro 1→2, furious 1→2, whirling 0→1. Bridge-cohort span: 8 → 13 modifiers.

---

## 3. Tier 2 — Foundation candidates (5 rows)

Atomic primitives or rows referenced by other dictionary rows. Pilot dependents = current pilot rows that reference this slug as base_trick or in prose.

| Slug | ADD | Pilot deps | Total deps | Strategic value |
|---|--:|--:|--:|---|
| **barfly** | 4 | 1 (venom) | 4 (venom + blurriest + superfly + nemesis) | Foundation; promoting unlocks 2 batch-companions (superfly + nemesis) and 1 pt12-blocked (blurriest); +1 standalone-record |
| **illusion** | 2 | 2 (smudge + flail) | 2 | Foundation; described as base for eggbeater per pt6; referenced by 2 existing pilots' prose |
| **dyno** | 4 | 0 | 0 | Standalone primitive; 2 records; no deps but record-traffic |
| **reverse-drifter** | 3 | 1 (royale) | 1 | Foundation for royale (SCALE-7 pilot); modest ROI |
| **double-leg-over** | 3 | 0 | 0 | Atomic base; 1 record; widely referenced in prose but not via base_trick |

---

## 4. Tier 3 — Standalone-with-records (5 rows)

No modifier-links; not foundation. Has independent record-traffic. Lower bridge ROI but legitimate independent enrichment.

| Slug | ADD | Records | Notes |
|---|--:|--:|---|
| dada-curve | 4 | 1 | No deps; atomic |
| eclipse | 3 | 2 | Atomic |
| jani-walker | 5 | 2 | Atomic primitive |
| ripstein | 4 | 2 | Atomic primitive |
| terrage | 4 | 1 | Terrage-family (limited bridge potential) |

---

## 5. Tier 4 — DEFERRED (6 rows)

Held back from SCALE-9 by external constraints.

| Slug | ADD | Reason |
|---|--:|---|
| blur | 4 | pt12 transitive-blurry Q (Red-pending) — pilot promotion would predetermine the Red answer |
| blurry-whirl | 5 | pt12 transitive-blurry Q (TRIAGED 2026-05-12) |
| blurry-torque | 6 | pt12 transitive-blurry Q (TRIAGED 2026-05-12) |
| food-processor | 6 | pt12 transitive-blurry Q (TRIAGED 2026-05-12) |
| blurriest | 5 | pt12 transitive-blurry Q (blurry-on-barfly; depends on Q1 outcome AND barfly pilot promotion) |
| barraging-osis | 5 | Baroque-legacy DEFERRED 2026-05-12 (CANONICALIZATION_POLICY §3) |

Once Red answers Q1=transitive: blur + blurry-whirl + blurry-torque + food-processor become immediately SCALE-eligible (their decompositions resolve). Blurriest becomes eligible once barfly is also pilot.

---

## 6. Tier 5 — Future-eligible exotic-standalone (44 rows; not detailed)

Atomic dex/body/set primitives with no modifier-links, no records, no pilot deps. Promotable but low ROI per row: stalls (head/neck/knee/shoulder/heel/sole/inside/outside/toe/forehead/cloud), flying-X (clipper/inside/outside), atomic kicks (cloud-kick/sole-kick/hop-over/walk-over), direction variants (reverse-around-the-world/rev-up/rev-whirl/rev-drifter), spin/sailing/refraction/paradon/pendulum/squeeze/surging/spyro/guay/double-spin/dragonfly-kick/bullwhip/parkwalk/omelette/fusion/knee-clipper/barrage/double-around-the-world/clipper/flurry/cross-body-sole-stall. List preserved for SCALE-10+ planning; not load-bearing for SCALE-9.

---

## 7. Recommended SCALE-9 composition (sketch for Phase 2)

Mixed bridge-foundation-flagship batch matching SCALE-7/SCALE-8 cadence. 10 rows total.

| # | Slug | Class | Strategic role |
|--:|---|---|---|
| 1 | **barfly** | foundation | Unlocks 3 in this batch (superfly/nemesis); 1 outside batch (venom — already pilot); 1 pt12-deferred (blurriest); +1 standalone-record value |
| 2 | **superfly** | bridge | Symposium 8th base; 1st barfly-family pilot via symposium |
| 3 | **nemesis** | bridge | Furious 2nd base; barfly-family extension |
| 4 | **sumo** | bridge | Nuclear 2nd base (after matador); pt9 X-Dex teaching case |
| 5 | **vortex** | bridge | Gyro 2nd base (after mobius); first non-mobius gyro pilot |
| 6 | **whirling-swirl** | bridge-OPENER | Whirling cohort 1st pilot (currently 0 whirling pilots) |
| 7 | **tapping-whirl** | bridge | Tapping 3rd base (after tap + spinal-tap); first non-tap-family tapping pilot |
| 8 | **plasma** | bridge | Quantum 3rd base (after tripwalk + legeater) |
| 9 | **surreal** | flagship | 3-mod density (paradox + spinning + stepping on whirl); 6th flagship row |
| 10 | **illusion** | foundation | Pilot dep of smudge + flail; pt6 referenced as eggbeater's component |

**Post-SCALE-9 projection:**
- Pilot tier: **74 → 84 of 160 (52.5%)** — crosses 50% threshold
- Modifier-bridge cohort: 8 → 13 modifiers (+5: gyro, nuclear, whirling, tapping, furious all extend or open)
- Flagship-density rows: 5 → 6 (surreal joins)
- Foundation rows: +2 (barfly, illusion); barfly unlocks 3 batch rows
- Prereq references closed on existing pilot pages: ~11 (estimate; will count precisely in Phase 2)

---

## 8. Open questions for Phase 2

- **Batch size posture.** 10 rows matches SCALE-7/8 cadence. After SCALE-9, the SCALE-eligible pool drops from 18 → 8 (5 bridge-or-foundation leftover + 3 standalone-with-records: dada-curve / eclipse / jani-walker / ripstein / terrage). SCALE-10 would be a smaller batch. Alternative: SCALE-9 at 12 rows pulls in 2 of the standalone-with-records; closes the "immediately-SCALE-eligible" pool entirely. Tradeoff: 12-row batch breaks consistent cadence + lowers family-coherence; 10-row matches pattern.
- **Surreal trick_family.** Currently classified as `whirl` family in DB but is a paradox+spinning+stepping compound. Decision: keep as whirl (base-derived) per pt8 multiplicity rule OR re-classify as a multi-family compound. Likely keep as-is; surface in Phase 2 prose if material.
- **Whirling-swirl as bridge-opener.** Whirling is a registered modifier (+1 universal) but has 0 pilots. Promoting whirling-swirl simultaneously opens the modifier cohort AND establishes the only family-base for it (swirl). Less "bridge" character; more "foundation for future whirling rows" character. Worth flagging in the prose framing.

---

## Cross-references

- `SCALE7_COVERAGE_ANALYSIS.md` — prior coverage analysis (53-pilot baseline)
- `SCALE7_COVERAGE_MATRIX.csv` — prior matrix (now stale; not regenerated for SCALE-9)
- `project_freestyle_state.md` — pt12 queue + modifier-bridge cohort tracking
- `feedback_modifier_public_visibility.md` — 18 modifier-stub rows excluded
- `feedback_phased_scope_control.md` — phased workflow rules
- `feedback_paused_crosstrack_no_writes.md` — pt12-blocked rows held back per cross-track discipline
