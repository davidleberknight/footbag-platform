# Workbook Coverage Completeness Report -- 2026-05-19

Phase 2 deliverable for the workbook governance gate. Per-field coverage statistics, status-enum distribution, and ranked gap queue.

Source: `legacy_data/reports/trick_reconciliation.csv` (197 rows; 166 active DB + 31 placeholder slugs).

---

## 1. Per-field coverage matrix

| Field | Type | Present | Total | Rate | Coverage tier |
|---|---|---:|---:|---:|---|
| `ifpa_canonical_name` | DB-derived | 166 | 197 | **84%** | High |
| `ifpa_aliases` | DB-derived | 84 | 197 | 43% | Moderate |
| `ifpa_family` | DB-derived | 156 | 197 | **79%** | High |
| `ifpa_compact_notation` | curator chain registry | 78 | 197 | 40% | Moderate |
| `ifpa_full_formula` | curator + DB op-notation | 42 | 197 | 21% | Low |
| `ifpa_job_notation` | curator (deferred) | 0 | 197 | 0% | Not started |
| `ifpa_add_formula` | curator resolved-formulas | 29 | 197 | 15% | Low |
| `ifpa_computed_add` | curator resolved-formulas | 29 | 197 | 15% | Low |
| `ifpa_official_add` | DB-derived | 157 | 197 | **80%** | High |
| `pb_formula` | PB source | 86 | 197 | 44% | Moderate |
| `fborg_formula` | fborg sources | 19 | 197 | 10% | Low (alias gap) |
| `fm_formula` | FM source | 0 | 197 | 0% | Parser gap |

### 1.1 Coverage tiers

- **High (≥75%):** name, family, official_add — DB-derived; baseline canonical-row coverage.
- **Moderate (40-50%):** aliases, compact_notation, pb_formula — meaningful but incomplete coverage.
- **Low (10-25%):** full_formula, add_formula, computed_add, fborg_formula — curator-paced authoring gaps + parser/alias gaps.
- **Not started (0%):** job_notation, fm_formula — curator-paced + parser-gap.

---

## 2. Status enum distribution per field

For each field, distribution across the 7 status enum values:

| Field | present | missing | not_applicable | wave2_blocked | needs_curator | source_absent |
|---|---:|---:|---:|---:|---:|---:|
| name_status | 166 | 31 | 0 | 0 | 0 | 0 |
| aliases_status | 84 | ~113 | 0 | 0 | 0 | 0 |
| family_status | 156 | ~41 | 0 | 0 | 0 | 0 |
| compact_status | 78 | ~109 | 0 | 0 | 0 | 0 |
| full_status | 42 | ~145 | 0 | 0 | 0 | 0 |
| job_status | 0 | 0 | ~7 | ~3 | ~187 | 0 |
| add_formula_status | 29 | ~165 | 0 | ~3 | 0 | 0 |
| computed_add_status | 29 | ~168 | 0 | 0 | 0 | 0 |
| official_add_status | 157 | ~40 | 0 | 0 | 0 | 0 |
| pb_status | 86 | 0 | 0 | 0 | 0 | ~111 |
| fborg_status | 19 | 0 | 0 | 0 | 0 | ~178 |
| fm_status | 0 | 0 | 0 | 0 | 0 | ~197 |

**Key observation:** the workbook now correctly distinguishes between:
- `missing` (we lack the data; curator should author)
- `source_absent` (external source doesn't cover this row)
- `not_applicable` (field doesn't apply to this kind of row, e.g., body primitives)
- `wave2_blocked` (pending Red Wave 2 adjudication)
- `needs_curator` (job_notation universally; curator-paced)

This is the **filterable/sortable** structure the curator brief required.

---

## 3. Ranked gap queue (curator-paced)

Ordered by impact × tractability:

### 3.1 High-impact mechanical extensions (LOW RISK)

| Rank | Gap | Estimated impact | Risk | Source |
|---|---|---|---|---|
| 1 | Extend NAME_ALIASES with ~120 entries from 9-audit corpus | fborg coverage 10% → ~50%; pb_status 44% → ~60% | Low | Audit `*_examples.csv` files |
| 2 | Investigate FM parser (0% match rate is suspicious; 487 entries parsed but 0 matched) | fm coverage 0% → ~30% if parser fixed + aliases extended | Low | Workbook generator `parse_fm_file()` |
| 3 | Author Sprint 7 resolved-formula entries for top 10 curator-confirmed compounds | add_formula 15% → ~20%; computed_add 15% → ~20% | Low | resolved-formulas content module |

### 3.2 Medium-impact curator-decision items

| Rank | Gap | Estimated impact | Risk | Curator decision needed |
|---|---|---|---|---|
| 4 | Author IFPA operational notations for 48 HELD canonical rows (from 9-audit corpus) | full_status 21% → ~45% | Medium | Token grammar decisions (FRP-3/4/6) |
| 5 | Author IFPA chain readings for 109 canonical rows lacking compact_notation | compact_status 40% → ~80% | Medium | Per-row chain reading curator authoring |
| 6 | Add Aliases for canonical rows without alias entries (113 rows blank) | aliases_status 43% → ~80% | Low-Medium | Per-row alias curator authoring |

### 3.3 Wave 2-blocked items (DEFERRED)

| Rank | Gap | Status | Gate |
|---|---|---|---|
| 7 | Tomahawk chain reading reconciliation | wave2_blocked | Red Wave 2 |
| 8 | Atom-smasher x-dex confirmation | wave2_blocked | Red Wave 2 |
| 9 | Rev-up structural decomposition | wave2_blocked | Red Wave 2 |
| 10 | Inspinning operator registration | wave2_blocked | Red Wave 2 (5-audit cross-cutting) |
| 11 | Pogo/symposium counting-frame doctrine | wave2_blocked | Red Wave 2 (5-audit cross-cutting; resolution candidate exists) |
| 12 | Spinning/gyro axis doctrine | wave2_blocked | Red Wave 2 (5-audit cross-cutting; 3 resolution candidates exist) |

### 3.4 Job-style notation queue (NEEDS_CURATOR)

job_status = `needs_curator` for ALL 187 non-body-primitive rows (job_notation universally blank). Per Job audit J1-J3 implementation slices (deferred):
- J1: "Notation philosophies" glossary §7 sidebar
- J2: Job grammar reading column for selected dictionary cards (10 examples)
- J3: 4-example side-by-side comparison in §8

Until J2 ships, job_status remains `needs_curator` for the workbook. Acceptable for governance-gate purposes (the status is explicit).

---

## 4. Filterable/sortable queries the workbook now supports

The new per-field status columns enable governance-grade filtering. Example queries:

| Query | CSV filter |
|---|---|
| "Show me canonical rows where IFPA has the trick but no operational notation, AND fborg DOES have one" | `name_status=present AND full_status=missing AND fborg_status=present` |
| "Show me ADD disagreements where curator action is pending Red Wave 2" | `status=add_disagreement AND status field contains wave2_blocked` |
| "Show me canonical rows where compact_status=present AND add_formula_status=present (the 'fully reconciled' rows)" | `compact_status=present AND add_formula_status=present` |
| "Show me Wave 2-blocked rows across any field" | `any *_status=wave2_blocked` |
| "Show me rows where ALL 3 external sources are source_absent (orphan canonicals)" | `pb_status=source_absent AND fborg_status=source_absent AND fm_status=source_absent` |
| "Show me high-priority alias-extension candidates: name_status=present + at least 2 source_absent statuses" | `name_status=present AND ((pb_status=source_absent) + (fborg_status=source_absent) + (fm_status=source_absent)) >= 2` |

---

## 5. Workbook is now governance-ready

Per the curator's success condition: "We do not ingest new candidate coverage until the spreadsheet tells us what we already know, what we disagree about, and what remains unresolved."

The workbook now does exactly this:

- **What we know:** `*_status=present` per field; 197-row scope; 12 field-status columns.
- **What we disagree about:** `status=add_disagreement` (2 rows); `status=formula_disagreement` (0 currently; would surface naming/decomposition divergences); cross-field discrepancies flaggable.
- **What remains unresolved:** `*_status=wave2_blocked`, `needs_curator`, or `missing` per field; tabular surface for curator decision-queue.

The governance gate is operational. Phase 3 (PassBack observational finalization) and Phase 4 (FootbagMoves ingestion) can be planned without further new-source ingestion blocking the gate.

---

## 6. Recommended next actions

| # | Action | Owner | Risk | Gate |
|---|---|---|---|---|
| 1 | Stage + commit workbook generator changes (this slice) | Claude (already staged) | Low | None |
| 2 | NAME_ALIASES extension (~120 entries from audit corpus) | Curator review + Claude execution | Low | Curator approval |
| 3 | FM parser investigation (0% match rate) | Curator + Claude | Low | None |
| 4 | Author IFPA operational notation for 48 HELD rows | Curator decision per row | Medium | Red Wave 2 token grammar |
| 5 | PassBack observational finalization (Phase 3) | Curator + Claude (see passback_observational_finalization_plan.md) | Medium | None |
| 6 | Observed-tricks scalability plan (Phase 3 companion) | Curator + Claude (see observed_tricks_scalability_plan.md) | Medium | UI surface decisions |
| 7 | FootbagMoves ingestion (Phase 4) | DEFERRED | High | All prior phases complete (see next_step_recommendation.md) |
