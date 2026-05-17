# Coverage Metrics — Formula Accountability View

**Date**: 2026-05-17.

Re-projection of Slice Y's 961-row external coverage audit through 
the formula-accountability lens. Same underlying rows; new 
classification dimensions: `formula_status`, `coverage_tier`, 
`blocker_type`.

## Formula-state distribution

| Formula state | Count |
|---|---|
| `exact_formula` | 223 |
| `approximate_formula` | 168 |
| `policy_dependent_formula` | 226 |
| `observational_formula` | 139 |
| `no_formula_available` | 205 |

## Coverage-tier distribution

| Tier | Count | Description |
|---|---|---|
| `tier_a_canonical_exact` | 223 | Public-ready: exact formula, stable ADD, topology integrated |
| `tier_b_canonical_pending` | 168 | Formula exists; pending markers acceptable for public |
| `tier_c_observational` | 570 | Externally recognized; formula approximate/provisional |
| `tier_d_excluded` | 0 | Duplicate / non-trick / no evidence |

## Blocker-type breakdown (non-canonical rows)

| Blocker | Count |
|---|---|
| `wave_2_dependency` | 226 |
| `no_external_formula` | 165 |
| `partial_vocabulary_recognition` | 139 |
| `curator_classification_pending` | 92 |
| `curator_review_pending` | 63 |
| `no_structural_reading` | 30 |
| `partial_recognition` | 13 |
| `folk_derived` | 10 |

## Curated queues

- **formula_ready_safe_adds.csv**: 63 rows. Strict-criteria publication-ready queue. Multi-source agreement, structurally clean, no Wave 2 dependency, no parser expansion needed.
- **observational_candidates.csv**: 365 rows. Culturally-recognized externally; awaiting Wave 2 or curator structural review. Should NOT be promoted to canonical without per-row curator approval.

## Coverage rate by tier

- **Tier A (canonical-ready)**: 223/961 (23%)
- **Tier B (pending markers)**: 168/961 (17%)
- **Tier C (observational)**: 570/961 (59%)
- **Tier D (excluded)**: 0/961 (0%)
- **Tier A + B**: 391/961 (40%) potentially publishable

## What changed vs Slice Y

Slice Y reported coverage as `covered vs missing` (~23% / ~77%). 
Slice Z re-projects through formula accountability — many `missing` 
rows have formulas (approximate / observational / policy-dependent), 
they're just not in canonical tables. Coverage as **'has a defensible 
structural reading'** is significantly higher than the canonical-
tables-only metric.

## Constraint preservation

- No tricks added to canonical tables
- No Wave 2 resolutions
- No fabricated formulas
- No mass-promotion of observational rows
- All outputs research-only; under exploration/comparative-reconciliation-2026-05/
