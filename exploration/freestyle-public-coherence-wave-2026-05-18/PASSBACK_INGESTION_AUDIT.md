# PassBack-first External Data Ingestion Audit

Phase B audit deliverable. Top-level audit of the PassBack corpus
against the IFPA canonical curated set, framing the 5-stage ingestion
pipeline + concrete numbers + recommended first-batch actions.

## 5-stage ingestion pipeline (locked)

```
1. source ingestion        → raw PassBack text → trick rows
2. structural extraction   → normalized PB fields (name, formula, ADD, components)
3. observational staging   → src/content/freestyleObservationalTricks.ts entries
4. curator review          → A-I classification + accept/defer/reject
5. canonical promotion     → V1 + V2 publication contract gate
```

External ingestion is NOT canonical publication. No PB row becomes
canonical solely by being ingested. The contract gate (V1 § 1-6 + V2
invariants 7-9 + 12-field minimum) is the only path.

## State of the existing pipeline

Per `project_passback_dictionary_intake` memory, a non-destructive
matcher already exists (commit `a1ecfd2` + later staging round) and
has produced:

- `exploration/passback-intake/passback_trick_sources.csv` —
  **282 PB trick rows** (240 main dict + 42 cross-sport pb-dict2)
- `exploration/passback-intake/passback_source_links_staging.csv` —
  **95 link rows** (matched tricks with asserted ADD/notation)
- `exploration/passback-intake/passback_glossary_staging.csv` —
  **180 PB glossary terms**
- `exploration/comparative-reconciliation-2026-05/passback_ifpa_alignment.csv`
  — **282 alignment rows** (the audit input this slice consumes)

The matcher is read-only on DB; deterministic; carries 8 QC tests.

## Headline numbers

### Overlap with IFPA canonical (282 alignment rows)

| Category | Count | % |
|---|---:|---:|
| `passback_only_ifpa_missing` (PB-only tricks; IFPA has no equivalent) | **180** | 64% |
| `agree_name_add_differs` (same name; ADD value differs) | **68** | 24% |
| `agree_formula_name_differs` (same formula; PB uses different name → alias candidate) | **21** | 7% |
| `agree_name_and_formula` (full agreement) | **10** | 4% |
| `agree_name_formula_differs` (name matches; formula differs) | **3** | 1% |

### Wave 2 sensitivity

| Status | Count |
|---|---:|
| `pending_red = true` (Wave 2-sensitive) | **22 (7.8%)** |
| `pending_red = false` | 260 (92.2%) |

### Match status at intake time

| Status | Count |
|---|---:|
| `matched_existing` (PB row matched an IFPA slug) | 94 |
| `new_candidate` (PB row had no IFPA match) | 187 |
| `conflict` (PB row partially matched but with conflict) | 1 |

### Operator vocabulary alignment

- **14 PB operator tokens align with IFPA inventory** (paradox, spinning,
  ducking, gyro, atomic, stepping, pixie, fairy, quantum, nuclear,
  symposium, barraging, blurry, furious — i.e. the IFPA-canonical
  modifier set is well-represented in PB)
- **13 PB-only operator tokens NOT in IFPA inventory** (top
  unmatched: refraction, miraging, terraging, etc.) — flagged in
  `passback_operator_alignment.csv`

## Findings

### Overlap structure (4 distinct populations)

1. **Aligned core (10 rows)**: full agreement on name + formula. Already
   canonical; no action required beyond cross-link / alias governance.
2. **Alias cohort (21 rows)**: PB uses a different name for an
   IFPA-canonical trick (same formula). Candidate for alias
   governance under V1 §4.
3. **Disagreement cohort (71 rows: 68 ADD + 3 formula)**: same name,
   different value. Most ADD disagreements are likely PB-counts-dexes
   vs IFPA-counts-ADD (PB's `dex_count` is mechanically distinct from
   IFPA's `adds`). Some may be true reconciliation cases.
4. **PB-only cohort (180 rows)**: tricks PB documents that IFPA
   canonical doesn't carry. This is the observational-layer pilot
   fuel — 71 of these are observational-safe (readable formula, no
   Wave 2 dependency).

### Operator vocabulary

The IFPA modifier inventory has strong PB coverage (14/14 main modifiers
appear in PB formulas). PB introduces 13+ "operator-shaped" tokens
that aren't in the IFPA inventory — most are word-of-mouth folk
terminology rather than structural operators. These need
classification per the operator alignment CSV.

### Safe observational staging

Of the 180 PB-only rows, **71 are observational-safe** (readable
formula referencing IFPA operators + no Wave 2 dependency). These
form the **recommended first observational staging batch**.

### Promotion candidates

**31 candidates** for canonical action:
- 10 full agreements (cross-link / alias-governance only; no new row)
- 21 alias candidates (add as canonical alias to existing IFPA slug;
  no new canonical trick row)

## Recommended first-batch actions

### Batch A — Alias governance pass (21 rows)

For each PB-only-name + IFPA-formula-match, add the PB name as an
alias on the corresponding IFPA canonical row. Surfaces:

- `freestyle_trick_aliases` table (alias_slug + alias_text +
  parent slug)
- Alias-governance under V1 §4 (mapped, not silently ignored)

Risk: low. Reversible. No new canonical rows; no contract gate
required beyond alias governance.

### Batch B — Observational pilot seed (71 safe rows)

For each observational-safe PB-only row, add an entry to
`src/content/freestyleObservationalTricks.ts` (TypeScript content
module per `observational_layer_proposal.md`). Each entry:

- folkSlug (derived from PB primary name)
- displayName (PB primary name)
- proposedReadings (PB formula)
- proposedAddTotal (PB's `dex_count`; explicitly labeled "PB ADD
  claim" not curator-confirmed)
- sourceLabel = `passback`
- status = `pending-review`

NO hashtag chips, NO media, NO trick-detail page. Renders only on
the (proposed) `/freestyle/observational` surface.

Risk: low (observational layer is reversible; TypeScript-only).
Blocker: observational-layer route + template + content module not
yet implemented.

### Batch C — ADD disagreement reconciliation (68 rows)

Surface as observational notes on the corresponding IFPA canonical
trick-detail pages: "PB documents this trick at ADD N; IFPA canonical
ADD is M. Reconciliation: PB counts dexes; IFPA counts ADD.
Reconciled."

Cost: per-row review + reconciliation note. Most should auto-resolve
to the PB-dex-count-vs-IFPA-ADD-count framing.

Risk: low (notes only; no canonical changes; alias governance applies).

### Batch D — Formula-disagreement adjudication (3 rows)

Three rows where name matches but PB formula differs from IFPA
formula. These need curator adjudication per V1 §6 ("no fabricated
structure"): is PB's formula a curator-acceptable alternate reading,
or is one of them wrong?

Risk: medium. Could touch Wave 2 if any of the 3 involve barraging /
blurry transitivity / atomic-family X-dex.

### Batch E — Wave 2 hold (22 rows)

22 rows are flagged `pending_red = true`. Hold all of these from
canonical promotion or observational staging until Wave 2 reply
lands. Mark observational entries (when surfaced) with explicit
"Wave 2 pending" badge.

## Blockers before broader external ingestion (FM / footbag.org)

| Blocker | Resolution path |
|---|---|
| Observational-layer route + template + content module not yet shipped | `observational_layer_proposal.md` + implementation slice (~3-4h) |
| `freestyle_trick_aliases` table integration for PB alias batch | Verify existing table can absorb the 21-row alias batch; otherwise extend |
| V2 contract not promoted to `docs/` | Coordinate with Dave (audit-scope constraint) |
| 13 PB-only operator tokens unclassified | Curator review per `passback_operator_alignment.csv` |
| Wave 2 reply still pending (22 rows blocked) | Red Husted Wave 2 packet (sent 2026-05-15) |

## Recommended sequence

1. **Alias governance pass (Batch A — 21 rows)** — lowest risk, highest
   immediate value. Strengthens V1 §4 compliance.
2. **Observational-layer implementation slice** — ship the route +
   content module + template. Empty seed acceptable.
3. **Observational pilot seed (Batch B — 71 rows)** — fill the
   observational layer with the safe PB-only cohort.
4. **ADD-disagreement reconciliation (Batch C — 68 rows)** — add
   observational notes; preserves canonical contract.
5. **Formula adjudication (Batch D — 3 rows)** — curator review.
6. **Wave 2 hold (Batch E — 22 rows)** — defer until Red replies.
7. **Broader FM ingestion** — gated on the above sequence completing.

## Governance forever-rules (preserved from V1 + V2 + boundary doc)

- No auto-promotion (PB row count + corpus frequency are evidence, not
  authority).
- No canonical formula overwrites from PB.
- No Wave 2 auto-resolution.
- PB wording is not parser truth.
- Observational vs canonical separation preserved at every stage.
- Uncertainty surfaces honestly (per V1 §5).
- Curator adjudication primary (per V1 §6).

## Deliverables in this slice

| File | Content |
|---|---|
| `PASSBACK_INGESTION_AUDIT.md` | This document. |
| `passback_overlap_matrix.csv` | 282 rows × overlap categorization |
| `passback_formula_disagreements.csv` | 71 disagreement rows (68 ADD + 3 formula) |
| `passback_operator_alignment.csv` | PB operator tokens × IFPA inventory match |
| `observational_candidate_queue.csv` | 180 PB-only rows × staging priority |
| `canonical_promotion_candidates.csv` | 31 promotion candidates (10 full + 21 alias) |
| `unresolved_passback_questions.md` | Wave 2 + curator-adjudication cases |
