# SYMBOLIC-GRAMMAR-2 — Analysis (Deliverable I)

Educational symbolic-grammar integration layer built atop SYMBOLIC-GRAMMAR-1 + GRAMMAR-GLOSSARY-1 + PassBack intake. **Observational + non-authoritative.** Companion to `SYMBOLIC_GRAMMAR_2_DESIGN.md`.

**Date:** 2026-05-12

---

## 1. Symbolic group inventory summary

**62 symbolic groups across 5 classification axes.** Distribution:

| Axis | Groups | Coverage purpose |
|---|--:|---|
| Topology (shape + mechanics) | 18 | Where the kick lands and what the body does |
| Modifier (set + body marker) | 17 | Which named modifier the trick carries |
| Contact (start + finish position) | 6 | Where the trick begins and lands |
| Dex mechanic | 10 | How the dex moment is executed |
| Execution pattern | 11 | Multi-beat / compositional / temporal / positional |

**Group definitions are stable.** Each row carries a stable `symbolic_group_id` that survives re-runs (no auto-renumbering). Future expansions add new IDs without renumbering existing groups.

**Coverage:** 142 non-modifier-stub IFPA active rows have **at least one symbolic group membership**. Most have 2-5 (avg 2.3). The 18 IFPA modifier-stub rows are excluded by design (per `feedback_modifier_public_visibility.md`).

---

## 2. Topology clusters discovered

### 2.1 Eleven perfectly-coherent multi-member IFPA families

These IFPA families have ≥3 members AND all members map to the same primary topology group (coherence score = 1.0):

| IFPA family | Size | Pilots | Primary topology |
|---|--:|--:|---|
| whirl | 17 | 15 | `whirl-rotational-topology` |
| butterfly | 12 | 12 | `butterfly-wing-topology` |
| mirage | 11 | 10 | `mirage-topology` |
| torque | 8 | 7 | `torque-rotational-topology` |
| osis | 7 | 6 | `osis-rotational-topology` |
| pickup | 5 | 4 | `pickup-topology` |
| barfly | 4 | 3 | `barfly-double-loop-topology` |
| blender | 4 | 3 | `blender-rotational-topology` |
| drifter | 4 | 4 | `drifter-miraging-clipper-topology` |
| atw | 3 | 2 | `atw-leg-circle-topology` |
| illusion | 3 | 2 | `illusion-topology` |

**Total coverage:** 78 of the 142 non-stub active tricks (55%) live in these 11 perfectly-coherent families. **IFPA family naming aligns with symbolic topology at multi-member scale.** This is the core finding for Task F: IFPA's families are mechanically coherent where they have enough members to be testable.

### 2.2 Long tail of singleton families

**42 of 59 analyzed IFPA families are singletons** (single member). These are standalone tricks that happen to define their own family because they don't compose into wider modifier cohorts. Examples: bullwhip, paradon, fusion, high-plains-drifter, jani-walker, terrage, dada-curve.

Singletons are **not** mechanically incoherent — they're mechanically distinctive. The family-coherence-score metric doesn't apply (always 1.0 for size-1).

### 2.3 Clipper-stall family anomaly

`clipper-stall` family (size=6, coherence=0.00). The 6 members did NOT map to a primary topology group in this pass — my topology heuristic does not yet have a `clipper-stall-foundation-topology` category. Members: clipper-stall (2), drifter (3) [moved to drifter family], reaper (3), high-plains-drifter (4), spinning-clipper (4), ducking-clipper (4).

**Action item:** add a `clipper-stall-foundation-topology` group to `symbolic_topology_groups.csv` in a future refresh.

### 2.4 Legover family one-off

`legover` family (size=7, coherence=0.86). 6 of 7 members map cleanly to `legover-topology`; 1 outlier doesn't. Likely `flurry` — currently in §3.2 data-debt class (asserted=4 vs barraging-modifier-table=3). Resolution waits on dictionary data-debt reconciliation.

---

## 3. Strongest cross-family bridges

Symbolic groups that **cut across multiple IFPA families** (high educational value because they teach concepts that span the dictionary):

| Symbolic group | Cross-cuts (sampled IFPA families) | Cohort size in pilot tier |
|---|---|--:|
| `spinning-family` | whirl, osis, torque, clipper, drifter, blender, montage-cohort | 13+ |
| `paradox-family` | whirl, mirage, blender, drifter, torque, butterfly | 15+ |
| `pixie-family` | butterfly, mirage, drifter, illusion, legover, pickup | 9+ |
| `ducking-family` | whirl, osis, butterfly, clipper, drifter, montage-cohort | 8+ |
| `stepping-family` | butterfly, whirl, osis, drifter, mirage, surreal-cohort | 12+ |
| `symposium-family` | whirl, mirage, butterfly, montage-cohort, barfly | 9+ |
| `atomic-family` | mirage, butterfly, torque, osis, legover, pickup | 5+ |

**The seven modifier-family groups above are the most educationally durable cross-cuts.** A learner who understands "spinning adds rotational mass on rotational base / +1 universal on non-rotational" can navigate every spinning-X compound consistently regardless of which IFPA family that compound belongs to.

### 3.1 Equivalence cluster cross-cuts

Three equivalence clusters in `symbolic_equivalence_clusters.csv` explicitly cross-cut topology:
- `policy-3-2-trio` (nemesis + jani-walker + bullwhip) — three different IFPA families, one shared §3.2 policy class.
- `multiplicity-doubling-trio` (double-leg-over + double-around-the-world + double-spin) — three different IFPA families, one shared pt8 §10 disposition.
- `blurry-pt12-cluster` (blur + blurry-whirl + blurry-torque + food-processor + blurriest) — pending Red pt12 transitive-blurry resolution.

These cross-cutting clusters are **strong candidates for future educational navigation surfaces** — they're the kind of pattern a learner won't discover from IFPA's family taxonomy alone.

---

## 4. Tricks that are isolated outliers

Tricks belonging to exactly one symbolic group with no cross-cuts (rare):

After dedup, the membership scan produced 323 memberships across 142 tricks (avg 2.3). Tricks with exactly 1 membership are the smallest cohort — typically 1-ADD foundation primitives (toe-stall, clipper, head-stall, etc.) that participate only in the `stall-1add-topology` group.

**Non-primitive isolated outliers worth surfacing for review:**
- Tricks with empty `base_trick` AND `trick_family` that match only their own family-named group.
- Currently small in number; reviewable via:
  ```
  WHERE memberships_count = 1 AND adds > 2 AND slug NOT IN (modifier_stubs)
  ```

This query is a candidate for future curator triage. Not blocking SG-2 close.

---

## 5. Strongest symbolic groups educationally

Ranked by SCALE pilot-tier coverage + cross-cutting reach:

### Tier 1: Highest educational density

1. **`butterfly-wing-topology`** — 12 IFPA pilots; anchors the walking-family + flagship-density rows (Montage). The wing-motion mechanic + cross-body recovery is THE foundational pattern for visualizing composition.
2. **`whirl-rotational-topology`** — 15 IFPA pilots; largest modifier-cohort base. Critical for teaching rotational decomposition.
3. **`spinning-family`** + **`paradox-family`** — the two most frequent modifiers; learners encounter them constantly across compounds.
4. **`mirage-topology`** + **`hippy-in-dex`** dual-axis pair — teaches the canonical 2-ADD set + the canonical hippy mechanic together.
5. **`policy-3-2-trio` equivalence cluster** — nemesis + jani-walker + bullwhip at pilot, teaching the row-asserted ADD disposition.

### Tier 2: Strong but narrower educational value

6. `legover-topology` + `under-foot-scoop` (pickup mechanic) — foundation pair for hop/scoop families.
7. `directional-reverse-pair` execution pattern — drifter/reverse-drifter + whirl/rev-whirl teach direction-is-structural rule.
8. `productive-multiplicity-stabilized` execution pattern — pt8 doubling exceptions (DLO + datw + double-spin).
9. `walking-family-complete` cluster — 5/5 -walk pilots after SCALE-11; closed cohort.

### Tier 3: Educational but specialized

10. `unusual-surface-topology` — 3 rows; small cohort but unique pedagogical content (flapper/sole/etc.).
11. `barfly-double-loop-topology` — 4-5 pilots; teaches a body-discipline pattern not found elsewhere.

---

## 6. Candidate future public features

In rough priority order (each requires curator approval before build phase):

| Priority | Feature | Source spec |
|--:|---|---|
| 1 | `/freestyle/modifier/:slug` modifier-family pages (17 modifiers) | `symbolic_navigation_prototypes/02_all_spinning_tricks.md` |
| 2 | Embedded "Related topology" widget on trick-detail pages | `01_related_topology_tricks.md` |
| 3 | Extended decomposition section on trick-detail (4-layer view) | `05_symbolic_decomposition.md` |
| 4 | `/freestyle/archetype/:id` movement-archetype walkthroughs (11 archetypes) | `04_mechanical_progression.md` |
| 5 | Modifier-ladder companion view per modifier-family page | `03_modifier_ladder.md` |
| 6 | Glossary cross-link rendering on glossary v3 page | `glossary_crosslinks.csv` (data ready) |
| 7 | §3.2 policy-class trio educational page (nemesis + jani-walker + bullwhip) | new spec needed |
| 8 | Equivalence-cluster browse pages | new spec needed |

**Build effort estimates** (per individual prototype spec): 0.5-2 days per feature. The whole stack ≈ 10-15 dev-days if pursued end-to-end. Suggest staging by priority; ship priority 1+2+3 first as the educational baseline.

---

## 7. Recommended next implementation phase

Two complementary paths are reasonable next steps. **Both are deferred from this phase per task-brief constraint H ("Everything produced in this phase is observational ... staging/specification only").**

### Path A: Curator-review + DB schema migration

If the symbolic-grammar layer is approved for inclusion in the dictionary system as a sibling-to-canonical layer:

1. Curator review of `symbolic_group_membership.csv` (323 rows; reviewer drops low-confidence rows + adds missing ones)
2. Curator review of `glossary_crosslinks.csv` (68 rows)
3. DB schema migration: `symbolic_groups` table + `symbolic_group_memberships` table + `glossary_crosslinks` table (additive only; canonical tables untouched)
4. Loader script (transaction-wrapped per `db-write-safety.md`) populates the new tables from the approved CSVs
5. Service-layer extension: `symbolicGrammarService` with methods supporting the 5 navigation prototypes

Effort: ~3-5 dev-days for migration + service. Coordinate with Dave per `feedback_root_claudemd_dave_owned.md` for any service-catalog updates.

### Path B: Public-page incremental rollout

If the symbolic-grammar layer should ship to public surface before formal DB integration:

1. Ship priority 1 (`/freestyle/modifier/:slug`) reading directly from staging CSV (loaded at service startup or refreshed on file change). ~1 dev-day.
2. Ship priority 2 (Related-topology widget) — same pattern. ~0.5 day.
3. Ship priority 3 (Extended decomposition) — extends existing trick-shell template. ~1.5 days.
4. Build adoption signal: page-view analytics + user feedback collection.
5. After 2-4 weeks of public exposure, decide whether to migrate to DB schema (Path A) based on signal strength.

Effort: ~3 dev-days for the priority 1+2+3 trio reading from staging files.

### Path C (recommended): Curator triage first

Before either Path A or Path B, a **curator triage of the SG-2 outputs** would surface:
- Which symbolic groups are clearly correct (high-confidence)
- Which group definitions need refinement (the clipper-stall anomaly in §2.3)
- Which memberships are wrong (false positives from heuristic rules)
- Which clusters or crosslinks need additional curator-written notes

**Estimated effort: 2-4 hours of curator review.** Output: a `passback_intake_approved.txt`-style marker file confirming the staging CSVs are ready for either Path A or Path B.

**This is the immediate next step.** Path A and Path B both depend on it.

---

## 8. Constraint check (final)

| Hard rule | Status |
|---|---|
| Canonical ADDs unchanged | ✓ (no DB writes) |
| `freestyle_tricks` unmutated | ✓ |
| No alias auto-inserts | ✓ |
| Canonical `trick_family` unchanged | ✓ (Task F analysis is a READ; produces analysis CSV separately from canonical column) |
| Parser logic unchanged | ✓ |
| Symbolic groups not auto-promoted to ontology | ✓ (CSV-only output; no DB writes; no schema migration) |
| Symbolic groups not merged with canonical families | ✓ (Task F surfaces correspondence; never collapses) |
| 4-layer separation preserved | ✓ (observational-symbolic layer marked distinctly throughout outputs) |

---

## 9. Inventory ready for review

```
exploration/symbolic-grammar-2/
├── SYMBOLIC_GRAMMAR_2_DESIGN.md           (this design)
├── SYMBOLIC_GRAMMAR_2_ANALYSIS.md         (this analysis)
├── symbolic_topology_groups.csv           (18 rows; Task A)
├── symbolic_modifier_groups.csv           (17 rows; Task A)
├── symbolic_contact_groups.csv            (6 rows; Task A)
├── symbolic_dex_groups.csv                (10 rows; Task A)
├── symbolic_execution_patterns.csv        (11 rows; Task A)
├── symbolic_group_membership.csv          (323 rows; Task B)
├── symbolic_equivalence_clusters.csv      (18 rows; Task C)
├── glossary_crosslinks.csv                (68 rows; Task D)
├── symbolic_vs_ifpa_family_analysis.csv   (59 rows; Task F)
├── movement_archetype_registry.csv        (11 rows; Task G)
└── symbolic_navigation_prototypes/        (5 specs; Task E)
    ├── 01_related_topology_tricks.md
    ├── 02_all_spinning_tricks.md
    ├── 03_modifier_ladder.md
    ├── 04_mechanical_progression.md
    └── 05_symbolic_decomposition.md

legacy_data/scripts/
└── build_symbolic_grammar_2.py            (read-only generator; ~700 lines)
```

Total: **15 files** + 1 generator + 1 directory of 5 spec MDs.

---

## 10. Cross-references

See `SYMBOLIC_GRAMMAR_2_DESIGN.md` § Cross-references.
