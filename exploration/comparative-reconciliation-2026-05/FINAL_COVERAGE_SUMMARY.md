# Final External Coverage Audit — Summary

**Date**: 2026-05-17.

**Companion CSVs** in `exploration/comparative-reconciliation-2026-05/`:
  - `external_trick_coverage_audit.csv` — every external trick × IFPA status
  - `uncovered_tricks_table.csv` — admin-curated 'what's missing' view
  - `passback_ifpa_alignment.csv` — PB-focused agreement matrix
  - `safe_add_candidates.csv` — multi-source canonical-gap candidates
  - `RED_QUESTIONS_REGISTRY.md` — every outstanding Red/SME question

## Coverage metrics

| Metric | Count |
|---|---|
| IFPA canonical tricks (active) | 160 |
| IFPA chain registry entries | 73 |
| FM rows ingested | 679 |
| PB rows ingested | 282 |
| Total external rows audited | 961 |
| Pending Red Wave 2 (any source) | 79 |

## Audit-row distribution by IFPA status

| Status | Count |
|---|---|
| `covered_exact` | 171 |
| `covered_alias` | 32 |
| `covered_formula_equivalent` | 20 |
| `missing_safe_to_add` | 79 |
| `missing_needs_red` | 79 |
| `missing_needs_curator` | 231 |
| `missing_insufficient_evidence` | 349 |

## Major gaps

**Where IFPA is strongest:**

- **Symbolic decomposition** — 71-entry chain registry covers ~51% of cardable browse rows with curator-authored or Red-locked readings; richer than any external source's structural surface.
- **Operator taxonomy** — the 12-modifier + 9-operator + 1-surface kind discriminator (Slice A) plus the four-axis Movement System ontology (Slice L1) is more explicit than FM's symbolic-grammar grouping or PB's prose vocabulary.
- **Branch-family ontology** — Slice M's dual-membership + retirement pattern (torque/blender/drifter in lineage AND own family; clipper-stall retired) has no equivalent in external sources.
- **Honest incompleteness** — Slice M's `UNRESOLVED_COMPOUNDS` pilot + `pendingDecomposition` pill renders folk-derived rows with explicit uncertainty signaling. External sources have no equivalent restraint discipline.
- **ADD math** — pt1-pt12 Red rulings ground IFPA's ADD values in adjudicated decomposition rather than community averaging.

**Where IFPA is visibly thinner:**

- **Trick-name count.** IFPA has 160 active rows. PB's named-trick corpus is ~280 entries. FM's symbolic-grammar master has 680 rows (many duplicates). Public users coming from PB/FM will notice missing names first.
- **PB-side hidden-branch-family compounds.** Slice R found 13 PB candidates that decompose into curator-known operators on recognized branch anchors (Big Applesauce, Cheese Processor, Catacomb, Ego, Phobia, etc.) — clean structural fit but not in IFPA today.
- **PB-`far` dialect.** ~13 PB rows encode paradox as the positional operator `far` per Red 2026-05-15 ruling. Their structural identities are recoverable but they don't surface in IFPA without authoring.
- **Productive multiplicity** (double-X, triple-X). pt8 community-stabilized only 3 cases (DLO + double-ATW + double-spin); PB lists additional productive-multiplicity compounds (e.g., triple ATW, ATW sole) that remain non-canonical.
- **No-plant family.** Symposium covers IFPA's no-plant body modifier dimension, but external sources include flying / midair / suspension tricks (double-knee, eclipse) that IFPA hasn't classified under any axis.
- **Set primitives outside the pilot.** Fairy + atomic appear in Movement System axis L1, but their full Wave 2 boundary (operator vs trick) is pending Red. PB encodes fairy compounds confidently; IFPA must wait.

## What should be added later

- **Safe-add candidates (79 rows in `safe_add_candidates.csv`):** Slice R canonical-gap rows with no Wave 2 operator. Curator decides per-row.
- **Slice N+1 chain authoring (11 known IFPA chain gaps from Slice P):** mind-bender, spinal-tap, tombstone, barraging-osis, magellan, merkon, pigbeater, parkwalk, blur, hatchet, mullet.
- **PB-`far`-dialect normalization:** once chain registry is more complete, the systematic `far ↔ paradox` mapping can drive automated PB→IFPA name reconciliation.
- **Productive-multiplicity case-by-case** per pt8 community-stabilization criterion. Each Red-confirmed addition opens a small batch.

## What must wait for Red

See `RED_QUESTIONS_REGISTRY.md` for the full inventory. Six Wave 2 packet items remain pending (sent 2026-05-15):

1. Operator-vs-trick boundary (Fairy specifically)
2. Compression-intent doctrine
3. Hidden X-dex preservation rules
4. Folk-stabilization adjudication threshold
5. Blurry transitivity (compounds vs base tricks)
6. Barraging operator class

Each gates batches of downstream curator-triage decisions in `chain_external_alignment.csv` / `add_divergence_reclassified.csv` / `missing_move_triage.csv` / `branch_family_candidates.csv`.

## Honest publication caveats

- **FBORG (footbag.org/newmoves/list) is the least-mined external source.** Per `RECONCILIATION_AUDIT_PLAN.md` §13, a future `FBORG-AUDIT-1` lane is planned but not executed. This audit excludes FBORG; the deferral is acknowledged.
- **PB name normalization is partial.** PB writes folk names + technical names + positional qualifiers in free-form prose; the matching here uses string-normalized slugs and may miss alias forms.
- **Coverage metrics double-count when external sources duplicate.** Same trick may appear in FM (canonical) + FM-Wave2 + PB; the audit row count exceeds unique-trick count.
- **The `excluded_non_trick` filter is conservative.** When in doubt the row stays in the audit pile so the curator can decide.

## Recommended next action

1. Curator reviews `RED_QUESTIONS_REGISTRY.md` and confirms whether Wave 2 packet still captures every open question (additions may be needed from this audit).
2. Curator triages `safe_add_candidates.csv` per-row at their own pace. Adoption requires explicit curator approval per row; no automated promotion.
3. Wait for Red Wave 2 responses before resolving `missing_needs_red` rows.
4. Optional: surface `uncovered_tricks_table.csv` on an admin-only `/internal/coverage` page so future maintainers see the visible-gap inventory.
5. FBORG-AUDIT-1 lane remains future work; defer until Wave 2 lands and the curator wants the third-source comparison.

## What this audit does NOT do

- ❌ Did not add any tricks to IFPA
- ❌ Did not modify chain registry, unresolved-compounds, or family overrides
- ❌ Did not change ADD values
- ❌ Did not resolve Wave 2 questions
- ❌ Did not mine FBORG
- ❌ Did not auto-promote single-source claims
- ❌ Did not fabricate formulas

All outputs are research-only; under `exploration/comparative-reconciliation-2026-05/`. Implementation deferred.
