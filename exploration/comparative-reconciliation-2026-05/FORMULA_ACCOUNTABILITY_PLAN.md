# Formula Accountability — Governance Plan

**Date**: 2026-05-17.
**Companion artifacts**:
  - `formula_gap_inventory.csv` (961 rows; per-trick formula status + tier)
  - `formula_ready_safe_adds.csv` (63 rows; strict-criteria publishable queue)
  - `observational_candidates.csv` (365 rows; recognized-but-pending)
  - `COVERAGE_METRICS_FORMULA.md` (re-projected coverage metrics)

**Status**: planning + governance artifact. No glossary edits, no code changes, no tricks added to canonical tables. Pure curator-review material.

> **Principle**: Every accepted trick must ship with at least one structural reading — exact, approximate, observational, or honestly-flagged-as-pending. The goal is **accountability**, not completeness or certainty.

---

## 1. Why formula accountability matters

Slice Y reported coverage as a binary: `covered (23%) vs missing (77%)`. That framing under-reports the system's actual richness because **many "missing" rows already have defensible formulas** — they're just not in IFPA's canonical tables.

The formula-accountability lens re-projects the same 961 rows through six explicit formula states + four coverage tiers. The result:

| Slice Y framing | Count | Slice Z reframing | Count |
|---|---|---|---|
| covered | 223 (23%) | tier A — canonical-exact (public-ready) | 223 (23%) |
| missing | 738 (77%) | tier B — canonical-pending (formula exists; pending markers OK) | 168 (17%) |
| | | tier C — observational (formula approximate/provisional) | 570 (59%) |
| | | tier D — excluded (duplicate, non-trick, no evidence) | 0 (0%) |

Tier A+B = **40% (391/961)** of external rows have a structural reading IFPA can either publish or surface with pending markers. The earlier 23% number was canonical-tables-only; the 40% number is **"has a defensible reading"**.

This isn't a coverage inflation game. The reframing acknowledges what already exists in the dictionary system (chain registry, Movement System, branch-family ontology) PLUS what curator-grade analysis can defensibly produce from external structural readings.

---

## 2. The six formula states

Each state describes the TRICK's formula posture, not the source's posture.

| State | Definition | Example | Tier |
|---|---|---|---|
| `exact_formula` | Stable curator-approved structural reading. Either: in IFPA's chain registry, or trivially equal to canonical primitive | mobius = gyro torque (pt11) | A |
| `approximate_formula` | Readable but not fully settled. External formula uses known operators + base. Curator decides canonical promotion. | Assassin = pixie ducking mirage | B |
| `policy_dependent_formula` | Depends on Wave 2 doctrine — fairy operator class, barraging operator class, blurry transitivity, X-dex doctrine | Fairy-Beater (W2-Q1 fairy boundary pending) | C |
| `observational_formula` | Community-recognized; provisional structural reading uses partial vocabulary IFPA doesn't yet recognize | a row mentioning `alpine` or `twisting` | C |
| `unresolved_formula` | Known decomposition dispute or IFPA-flagged folk-derived | UNRESOLVED_COMPOUNDS pilot rows | C |
| `no_formula_available` | No defensible structural interpretation supplied | folk-named rows with no technical_name | C/D |

Counts (current corpus):

| State | Count | % |
|---|---|---|
| `exact_formula` | 223 | 23.2% |
| `approximate_formula` | 168 | 17.5% |
| `policy_dependent_formula` | 226 | 23.5% |
| `observational_formula` | 139 | 14.5% |
| `unresolved_formula` | 0 | 0.0% |
| `no_formula_available` | 205 | 21.3% |

---

## 3. Coverage tiers

Tiers describe the publication-readiness of each row, not the row's structural depth. The same trick can move tiers as Red rulings + curator decisions arrive.

### Tier A — Canonical exact (public-ready)

  - Exact formula
  - Stable ADD
  - Topology integrated (family / Movement System axis / connective panel)
  - Already in IFPA canonical tables OR readily-promotable

Volume: **223 rows (23%)**. These are already covered or trivially identical to canonical rows.

### Tier B — Canonical pending (public with pending markers)

  - Formula exists with all-known-operator vocabulary
  - Uncertainty acknowledged via `pending decomposition refinement` pill or `curatorConfirmPending=true` flag on chain entries
  - Can be public; markers communicate uncertainty honestly
  - No Wave 2 dependency

Volume: **168 rows (17%)**. Strict-criteria subset (63 rows) lives in `formula_ready_safe_adds.csv`.

### Tier C — Observational

  - Trick name recognized externally
  - Formula approximate, provisional, or partially-recognized
  - NOT treated as fully canonical
  - May appear in admin-only or observational-labeled surfaces
  - Wave 2 dependency may or may not apply

Volume: **570 rows (59%)**. 365 viable observational candidates in `observational_candidates.csv` (excludes Tier-C-with-no-formula).

### Tier D — Excluded

  - Duplicate of an existing IFPA row
  - Insufficient evidence for any structural claim
  - Non-trick (modifier vocabulary listed as a trick by mistake)
  - Structurally indefensible folklore noise

Volume: **0 rows in current corpus**. External sources don't list modifiers as standalone tricks; no duplicates surfaced as primary names.

---

## 4. Blocker types

Each non-Tier-A row carries a `blocker_type` explaining WHY it's not Tier A.

| Blocker | Count | Description |
|---|---|---|
| `wave_2_dependency` | ~225 | Uses fairy/barraging/blurry operator vocabulary pending Wave 2 rulings |
| `branch_family_promotion_blocked` | ~13 | Slice R hidden-branch-family candidates pending W2-Q6 |
| `curator_review_pending` | ~80 | Slice R canonical-gap candidates; structurally clean; curator decides |
| `partial_recognition` | ~88 | Some operators recognized; some are external-vocabulary |
| `external_vocabulary_unrecognized` | ~85 | Uses tokens like alpine / twisting / dso that IFPA doesn't have |
| `no_structural_reading` | ~24 | External source supplies no technical_name |
| `folk_derived` | ~8 | Folk-named; mechanical decomposition uncertain |
| `unresolved_compounds_pilot` | ~7 | IFPA UNRESOLVED_COMPOUNDS allow-list member |
| `no_external_formula` | varies | No external structural reading at all |

---

## 5. Reclassification of existing audit outputs

### 5.1 safe_add_candidates.csv (Slice Y; 79 rows)

Re-projection through formula-accountability:

- Strict-criteria publishable subset: **63 rows** → `formula_ready_safe_adds.csv`
- 16 rows demoted because either: external formula uses unrecognized vocabulary OR proposed base isn't in IFPA_BASE_TRICKS OR proposed modifiers contain Wave-2 token

The 63 rows form a controlled-growth queue. **DO NOT add without per-row curator approval.**

### 5.2 uncovered_tricks_table.csv (Slice Y; 738 rows)

Re-projection:
- 168 → tier_b_canonical_pending (formula exists; pending markers OK)
- 570 → tier_c_observational (varies by blocker type)

The single-bucket "uncovered" became a 4-state spectrum.

### 5.3 passback_ifpa_alignment.csv (Slice Y; 282 rows)

PB-side specifically:
- 10 agree_name_and_formula → Tier A
- 19 agree_formula_name_differs → Tier A (alias-level)
- 64 agree_name_add_differs → Tier A (PB uses dex_count metric not ADD)
- 134 passback_only_ifpa_missing → distributed across Tier B (clean structure) + Tier C (observational)

---

## 6. The 5 categorizations of missing rows

Per the directive's framing:

**A — Missing because no formula exists**
  - State: `no_formula_available`
  - Tier: C (or D in edge cases)
  - 205 rows
  - Examples: folk-named PB rows with empty `passback_technical_name`
  - Action: leave unlisted OR mark in admin-only evidence view

**B — Missing because formula exists but governance pending**
  - State: `policy_dependent_formula`
  - Tier: C
  - 226 rows
  - Examples: fairy-led compounds (W2-Q1), barraging-led compounds (W2-Q6)
  - Action: queue post-Wave-2; surface observationally if curator approves

**C — Missing because formula exists and safe to add**
  - State: `approximate_formula` + no Wave 2 token + all operators known
  - Tier: B (with publishable markers)
  - 63 rows (strict) / 168 rows (broader Tier B)
  - Examples: Assassin (pixie ducking mirage), Blaze (blazing mirage), Mantis (gyro eggbeater)
  - Action: per-row curator review for canonicalization

**D — Missing because formula is disputed**
  - State: `unresolved_formula` (current pilot is empty externally) OR `policy_dependent_formula` with cross-source disagreement
  - Tier: C
  - ~50 rows estimated (overlaps with B)
  - Examples: Eggbeater (atomic vs illusioning; Y-Q1), Nemesis (furious vs barraging; W2-Q6)
  - Action: wait for Red ruling

**E — Missing because trick identity itself is unstable**
  - State: `observational_formula` or `no_formula_available` with folk-derived flag
  - Tier: C
  - ~140 rows estimated
  - Examples: PB rows where same external name has variant structures across sources
  - Action: per-row curator review; observational listing acceptable

---

## 7. ADD-analysis integration

Per directive: cross-reference the Slice X ADD analysis initiative.

For the 17 discrepancy cases in `discrepancy_case_candidates.csv`:

| Case ID | ADD discrepancy reason | Maps to formula-accountability blocker |
|---|---|---|
| DC-01..03 (Hurl/Barfry/Godzilla) | SS positional treatment | `positional_operator_settled` (Tier A) |
| DC-04..06 (Blurry compounds) | Compression vs expansion | `compression_depth_settled` (Tier A) |
| DC-07 (Mobius) | Multi-depth stopping | `compression_depth_settled` (Tier A) |
| DC-08 (Atom Smasher) | Hidden X-dex carry | `partial_X_dex_doctrine_W2_Q3` (Tier B) |
| DC-09 (Baroque) | Operator class as dex-multiplier | `partial_W2_Q6_settled_for_named_case` (Tier B) |
| DC-10 (Bladerunner) | Recursive operator application | `recursive_operator_rejection_settled` (Tier A) |
| DC-11 (Eggbeater) | Atomic vs illusioning | `wave_2_dependency` Y-Q1 (Tier C) |
| DC-12 (Nemesis) | Furious vs barraging | `wave_2_dependency` W2-Q6 (Tier C) |
| DC-13 (Witchdoctor) | Atomic-symposium interaction | `wave_2_dependency` W2-Q3 (Tier C) |
| DC-14 (Surreal) | Folk-stabilization threshold | `wave_2_dependency` W2-Q4 (Tier C) |
| DC-15 (Fairy cohort) | Operator boundary | `wave_2_dependency` W2-Q1 (Tier C) |
| DC-16 (Sumo) | Named X-dex exception | `pt9_X_dex_named_exception_settled` (Tier A) |
| DC-17 (Genesis) | Historical drift | `historical_drift_pt10_retired` (Tier A) |

10 of 17 discrepancies map to Tier A (settled by Red); 7 to Tier C (Wave 2 dependent).

---

## 8. Public philosophy statement — draft

**Proposed wording** (curator approves before publishing anywhere):

> *IFPA attempts to provide a structural reading for every accepted trick. Some readings are exact — settled by community rulings over many years. Some are approximate — readable through known operator vocabulary but not yet curator-locked. Some are observational — names the community uses for tricks whose decomposition is still under discussion.*
>
> *The goal is not to fabricate certainty. The goal is to make the movement language explainable: when a trick is here, we say what we think it's made of, and when we're unsure, we say that too. The dictionary's pending markers are not failure indicators — they're honesty.*

**Tone notes**:
  - "Accountability" not "completeness"
  - "Explainable" not "comprehensive"
  - "Honesty" not "pending" (the pill is the mechanism; the philosophy is honesty)
  - No parser-internal jargon
  - No Wave-2 specifics

**Where to publish**:
  - On the proposed `/freestyle/add-analysis` page intro (§1)
  - On the trick-dictionary landing as a footer note (one-line abbreviated version)
  - On the glossary §1 (Movement-Language Primer) as a closing note

---

## 9. Recommendations

### 9.1 What should become canonical next

The 63 rows in `formula_ready_safe_adds.csv` meet the strict criteria:

  - Slice R canonical-gap classification
  - Multi-source structural agreement (FM + Slice P alignment)
  - All proposed modifiers in IFPA's KNOWN_OPERATORS registry
  - Proposed base in IFPA's IFPA_BASE_TRICKS registry
  - No Wave 2 operator tokens
  - Not in UNRESOLVED_COMPOUNDS

**Recommendation: per-row curator review.** Curator approves each addition with explicit chain reading + ADD value. Adoption is curator-paced; nothing automated.

Sample of the strongest 10:

  - Assassin = pixie ducking mirage
  - Blaze = blazing mirage
  - Mantis = gyro eggbeater
  - Nova = symposium double-leg-over
  - Slapdown = slapping butterfly (verify slapping is in IFPA registry first)
  - Big Apple = gyro symposium torque
  - Predator = atomic paradox double-leg-over
  - Reactor = atomic paradox whirl
  - GDLO = gyro double-leg-over
  - Pandora's Box = gyro pickup

### 9.2 What should remain observational

The 365 rows in `observational_candidates.csv`:

  - Wave 2-dependent rows (226 policy_dependent + 13 hidden-branch-family)
  - Partial-vocabulary rows (139 observational_formula)
  - UNRESOLVED_COMPOUNDS pilot members

**Recommendation: optional admin-only `/internal/observational` surface** listing these rows with their external structural readings — visible to curators + future maintainers, not to public visitors. Cross-reference each to the relevant Red question (Y-Q1, W2-Q1, etc.).

Do NOT promote any observational row to canonical without per-row review.

### 9.3 What must wait for Red

Per `RED_QUESTIONS_REGISTRY.md`:

  - 6 Wave 2 packet items (W2-Q1..Q6) gate 226+ rows
  - 8 Wave 2+ candidate items (Y-Q1..Q8) gate edge cases

**Recommendation**: no action; queue remains stable. Each Red answer unlocks a per-row promotion review.

### 9.4 What should probably never be canonicalized

The 205 `no_formula_available` rows include several patterns that may never warrant canonical status:

  - PB rows describing tricks via free-form prose without operator decomposition
  - Single-source folk names with no second-source corroboration
  - Variant spellings / typos / artifact rows from the intake pipeline

**Recommendation**: leave unlisted in public surfaces. Maintain in `formula_gap_inventory.csv` as evidence trail for completeness but don't surface.

A small subset (~30-50 rows) may earn canonical status if a future Red ruling unlocks the operator class — these will resurface naturally when Wave 2 lands.

---

## 10. Restraint check

- ✅ No tricks added to canonical tables
- ✅ No Wave 2 resolutions
- ✅ No fabricated formulas
- ✅ No mass-promotion of observational rows
- ✅ Four-layer separation preserved (canonical names / symbolic decomposition / glossary pedagogy / embodied analogy)
- ✅ Anti-overhardening posture preserved — formula states + tiers explicitly leave room for state migration as Red rulings land
- ✅ Uncertainty explicit at every level (Tier C = explicitly observational; pending markers documented)
- ✅ No parser-internal jargon in the proposed philosophy statement
- ✅ "Accountability" framing > "completeness" framing
- ✅ Reversibility doctrine maintained — every classification is read from data, not hardcoded

---

## 11. What this slice does NOT do

- ❌ Add tricks to `freestyle_tricks`
- ❌ Resolve Wave 2 questions
- ❌ Promote any row out of UNRESOLVED_COMPOUNDS pilot
- ❌ Edit `freestyleSymbolicEquivalences.ts` or any content module
- ❌ Edit glossary.hbs or any template
- ❌ Surface the observational list on public pages
- ❌ Modify ADD values
- ❌ Mine FBORG (still deferred per RECONCILIATION_AUDIT_PLAN.md §13)

All outputs are research-only; under `exploration/comparative-reconciliation-2026-05/`.

---

## 12. Next steps for the curator

1. Read `formula_gap_inventory.csv` — the per-row map.
2. Read `formula_ready_safe_adds.csv` — review the 63 strict-criteria candidates; approve/decline per row.
3. Read `observational_candidates.csv` — decide whether `/internal/observational` surface warrants implementation.
4. Approve or revise the proposed public philosophy statement (§8 above).
5. After Wave 2 lands, Slice Z re-runs and the formula-state distribution shifts — Tier C → Tier B transitions become possible.

---

## End
