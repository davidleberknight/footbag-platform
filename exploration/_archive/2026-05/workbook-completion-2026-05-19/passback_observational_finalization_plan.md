# PassBack Observational Finalization Plan -- 2026-05-19

Phase 3 deliverable for the workbook governance gate. Plan for finalizing PassBack observational ingestion as the next major slice after workbook governance gate is established.

---

## 1. Current PassBack state

Per `[project_passback_dictionary_intake]` memory + workbook generator:

- **Sources parsed:** 3 PassBack files (passback-dicrionary.txt 240 entries + pb-dict2.txt 42 cross-sport + passback-glossary.txt 180 terms)
- **Total PB entries:** 240 in primary dictionary
- **Workbook match rate:** 86 of 197 rows (44%) have pb_status=present
- **Non-matched PB entries:** ~150+ entries cover names not in the canonical IFPA scope
- **Existing non-destructive matcher:** `legacy_data/scripts/build_freestyle_dict_passback_matcher.py` (per memory; 282-row trick staging + 180-term glossary staging + 6 reports + 8-test QC suite; commit a1ecfd2)
- **Existing staging output:** 94 matched / 187 new_candidate / 1 conflict / 162 new_term educational-layer

---

## 2. Finalization goal

PassBack-covered noncanonical entries become **Observed Tricks only** — a dedicated public surface where source-attributed, ADD-claimed external entries surface WITHOUT being promoted to canonical IFPA rows.

**Boundary:**
- Canonical row → IFPA-curator-confirmed; full workbook coverage; eligible for trick-detail pages.
- Observed trick → PB-source-attributed; external ADD claim; no IFPA endorsement; no canonical promotion.

**Why this matters:**
- 187 PB `new_candidate` entries are pedagogically valuable but not curator-confirmed.
- Surfacing them on the public site without canonicalization preserves the source-attribution discipline.
- Avoids the doctrinal hardening risk of premature canonicalization.

---

## 3. Layer separation rules (reinforced)

| Layer | PB content placement |
|---|---|
| Canonical names (`freestyle_tricks`) | NO addition; PB does NOT promote |
| Aliases (`freestyle_trick_aliases`) | Selectively; only when curator confirms PB name = canonical trick alias |
| Symbolic decomposition (chain registry) | NO addition; PB does not author chain readings |
| Glossary pedagogy | Selectively; PB educational content may inform §6 or §11 |
| **Observed tricks (new surface)** | YES; PB `new_candidate` entries surface here |
| External ADD claims | YES; preserved as source-attributed claim |

---

## 4. Observed Tricks data model (proposed)

The Observed Tricks surface should be a NEW read-only view, not a new canonical table.

### 4.1 No schema migration

Per the constraint set ("no schema migration unless absolutely necessary"), the Observed Tricks layer should be implemented via:

- **Curated input CSV** at `legacy_data/inputs/curated/passback/observed_tricks.csv`
- **TypeScript content module** at `src/content/observedTricks.ts` (reversible per `feedback_reversible_content_governance`)
- **Service shaping** via existing service-layer patterns

Schema (curator-authored):

```csv
observed_name,normalized_slug,source,source_attribution,external_add,external_formula,structural_reading,curator_note,is_visible
```

Each row represents one PassBack-source entry. Fields:
- `observed_name`: PB's exact name as written
- `normalized_slug`: snake-case slug (NOT necessarily an IFPA canonical slug)
- `source`: "passback" (later: "footbagmoves")
- `source_attribution`: "2026-05-12 passback-dictionary v1" or similar
- `external_add`: PB's published ADD (often blank since PB publishes dex_count, not ADD)
- `external_formula`: PB's published technical notation
- `structural_reading`: curator-authored decomposition (optional; only when curator-confirmed)
- `curator_note`: per-row curator commentary; can flag uncertainty
- `is_visible`: 0/1; allows curator to hide drafts without deleting

### 4.2 Public surface

Render at `/freestyle/observed-tricks` (or similar). Page contract per `add-public-page` skill:

- View-model: `OutputContent<ObservedTrickCard[]>`
- Each card: observed_name + source attribution + external ADD (if present) + structural reading (if present) + "source-attributed; not curator-confirmed" disclaimer
- Alphabetical grouping (or ADD grouping; see scalability plan)
- Search/filter by source/ADD/name

### 4.3 Not in scope for this slice

- Auto-promote any observed trick to canonical
- Auto-resolve any structural reading
- Auto-rewrite any alias
- Auto-publish chain readings on canonical surfaces from PB content

---

## 5. Finalization workflow (curator-paced)

| Phase | Action | Risk |
|---|---|---|
| F1 | Curator review of PB staging output (94 matched + 187 new_candidate + 1 conflict + 162 new_term) | Low (read-only) |
| F2 | Curate `observed_tricks.csv` from PB new_candidate set | Low |
| F3 | Build observedTricksService + observedTricksController + Handlebars template | Medium (UI surface) |
| F4 | Compressed-card design per scalability plan (see `observed_tricks_scalability_plan.md`) | Medium |
| F5 | Tests: integration test for the route; service contract test | Low |
| F6 | Wire navigation entry on /freestyle | Low (curator decision on nav-section placement) |

---

## 6. Source attribution discipline

Per `feedback_no_individual_names_freestyle_views`: do NOT name individual PB contributors on public freestyle pages.

Source attribution format:
- ✓ "2026 PassBack Dictionary entry"
- ✓ "Source: passback-dicrionary.txt"
- ✗ NEVER any individual name as contributor attribution

---

## 7. Workbook ↔ Observed Tricks integration

The workbook governance gate continues to be the truth-maintenance layer:

| Workbook status | Observed Tricks surface |
|---|---|
| `name_status=present` AND `pb_status=present` (canonical with PB match) | NOT in Observed Tricks (covered by canonical trick page) |
| `name_status=missing` AND PB has the name (placeholder slug + PB match) | Surfaces in Observed Tricks |
| PB `new_candidate` entries (not in workbook scope) | Surface in Observed Tricks |
| PB `conflict` entries (1 entry) | Surface in Observed Tricks with explicit conflict disclaimer |

The workbook's `pb_status` column is the bridge: where workbook shows `pb_status=present` and the canonical row has high IFPA coverage, the canonical page is authoritative. Where workbook shows `pb_status=source_absent` but PB has the name (alias-gap case), the Observed Tricks surface fills the gap.

---

## 8. Concepts NOT to import

| Concept | Why NOT |
|---|---|
| Auto-canonicalize PB new_candidate entries | Bypasses CANONICALIZATION_POLICY.md §10 productive multiplicity policy |
| Auto-publish PB external_formula on canonical pages | Canonical operational notation is curator-locked |
| Auto-publish PB ADD claims as IFPA ADD | Cross-references the multi-audit ADD-counting-frame question |
| Surface PB educational content on glossary pedagogical pages | Per audit recommendations: glossary-only opportunities require curator review |
| Auto-create alias rows from PB names | Requires per-row curator confirmation |

---

## 9. Recommended implementation slice (curator-paced)

| Slice | Scope | Risk | Gate |
|---|---|---|---|
| PB1 | Curator triage of 187 new_candidate entries; pick subset for initial Observed Tricks rendering | Low | Curator availability |
| PB2 | Build observed_tricks.csv + content module | Low | PB1 |
| PB3 | Build observedTricksService + controller + template | Medium | PB2 + curator approval of view model |
| PB4 | Wire /freestyle/observed-tricks route + nav | Medium | PB3 + curator approval of nav placement |
| PB5 | Tests + doc-sync | Low | PB4 |

All slices are reversible TypeScript + curated CSV. Zero DB schema change.

---

## 10. Success condition for Phase 3

Per the curator's brief:
- PassBack-covered noncanonical entries become Observed Tricks only ✓ (this plan)
- no canonical promotion unless explicitly approved ✓ (boundary preserved)
- no ontology hardening ✓ (no DB or modifier table changes)
- source attribution preserved ✓ (per-row `source_attribution`)
- compact display suitable for many entries ✓ (cross-references scalability plan)

Phase 3 finalization shouldn't begin until the workbook governance gate (Phase 1 + 2) is curator-confirmed and the FM parser gap is addressed (the latter via the next_step_recommendation).
