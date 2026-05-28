# Phase E — Implementation Report

**Date:** 2026-05-28
**Type:** implementation slice (offline governance/reconciliation tooling + data
artifacts + an EV redesign proposal). Read-only on the DB; no promotion, no
canonical mutation, no fabricated JOB/ADD/structure.

This report consolidates the artifacts in
`exploration/phase-e-implementation-2026-05-28/`. It executes the strategy in
`exploration/phase-e-observational-universe-2026-05-28/REPORT.md` and turns its
estimates into data-derived numbers.

## 0. What was built (3 deterministic scripts → governed data)

| Script | Reads | Emits |
|---|---|---|
| `classify_universe.py` | RECONCILIATION.csv (spine) + live DB + corpus_names_all.csv | `CLASSIFIED_UNIVERSE.csv` (2,460) + `classification_summary.txt` |
| `build_reports.py` | CLASSIFIED_UNIVERSE.csv + live DB | overlap / doctrine / promotion CSVs + 3 report .md |
| `a0_extrapolate.py` | CLASSIFIED_UNIVERSE.csv + the validated parser (imported) | `A0_EXTRAPOLATION.csv` (1,702) + `A0_REPORT.md` |

All three are re-runnable, deterministic, read-only on the DB. The A0 engine
imports `scripts/parse_freestyle_notation.py`'s pure functions and runs them
in-memory — `--apply` is never called, so the canonical computed-ADD columns are
untouched.

## 1. Goal 1 — full-corpus reclassification (data-derived, no estimates)

`CLASSIFIED_UNIVERSE.csv` enriches all 2,460 names with fresh, live-DB-derived
columns (category, ecosystem, parent-family, in_db_live, promoted, overlap
flags, completeness, source corpus). Headline distributions:

- Governance: state-1 **510**, state-2 **5**, state-3 **1,879**, state-4 **44**,
  state-5 **20**, state-7 **2**.
- Completeness: **canonical 755 · full 394 · name-only 1,311**. The 1,311
  name-only rows are the blank-rich-column population the strategy report flagged
  — now an explicit column, not a silent gap.
- **Live-DB drift: 245** names the spine still marks observational are already
  canonical in the live DB (W1–W9 promotions). The estimate is now a measurement.
- **61** rows resolve to a retired route-out family (family-skeleton aware).

## 2. Goal 2 — overlap elimination

`overlap_removal_candidates.csv` + `observational_duplicate_clusters.csv` +
`OVERLAP_REPORT.md`.

- **248** observational names overlap canon (exact-slug / normalized-name /
  canonical-alias / decomposition-equivalence / retired-family) → must NOT appear
  on the EV surface. These are removed by the EV redesign's mechanical guard
  (§2.2 of `EV_REDESIGN_PROPOSAL.md`).
- **146** lexical-duplicate clusters among unresolved names (e.g. `Fairy Whirl` /
  `(Feral)` / `(same side)`; `Atomic DLO` / `(Predator)`); **27** names appear in
  2+ sources. **No merges performed** — every cluster is flagged "confirm before
  merge."

Source overlap matrix (lexical normalized-name identity):

| Source | exclusive | shared | total |
|---|---:|---:|---:|
| Stanford | 851 | ~0 | 851 |
| FootbagMoves | 801 | 58 | ~859 |
| PassBack | 396 | 52 (w/ FM) | ~448 |
| footbag.org | 306 | 6 (w/ FM) | ~312 |
| IFPA-canonical | 47 | — | 47 |

Cross-source lexical overlap is ~2.4% — the corpora are largely disjoint; true
conceptual overlap is higher but only measurable after structural normalization
(see A0 / §4).

## 3. Goal 4 — doctrine-block concentration

`doctrine_blocked.csv` + `DOCTRINE_BLOCK_REPORT.md`. **206** observational names
are doctrine-blocked; **91%** sit in four ecosystems:

| Ecosystem | Names | Unblocking question |
|---|---:|---|
| blurry-furious | 112 | Red Q1.A — `blurry`/`furious` +2 on rotational bases? |
| weaving | 32 | weaving movement ruling |
| pogo | 26 | pogo structural/ADD ruling (Red Wave-3 Q3) |
| shooting | 18 | shooting structural ruling |

Four rulings free ~188 names — the highest-ROI doctrine action.

## 4. Goal 3 — A0 compound-notation extrapolation (the centerpiece)

`A0_EXTRAPOLATION.csv` (1,702 unresolved observational names) + `A0_REPORT.md`.
Ran the validated parser in-memory; every row `observationally_extrapolated=true`;
JOB deferred (not fabricated); DB untouched.

| Layer (independent flag) | Count | % |
|---|---:|---:|
| structurally_readable | 642 | 37.7% |
| **mechanically_derivable** | **615** | **36.1%** |
| doctrine_stable | 1,405 | 82.5% |
| observationally_extrapolated | 1,702 | 100% |
| culturally_canonical | 0 | 0% |

**The honest correction:** real parser-validated mechanical-derivability is
**~36%**, well below the 62% name-string heuristic. The parser is strict;
derivations were spot-checked correct (`Atomic Drifter`=4, `Atomic Pickup`=3,
`Atomic ss Osis`→canonical self-atom=4), and doctrine tokens correctly suppress
the ADD (no provisional value for blurry/furious/nuclear).

Parser-confidence and doctrine-confidence are separate columns. **Failure
classes** (the actionable backlog):

| failure_class | count | drives |
|---|---:|---|
| (derived) | 615 | — |
| folk-name-opacity | 395 | observational-only residual |
| unknown-modifier-token | 359 | parser/registry evolution |
| ambiguous-terminal-mechanic | 264 | parser evolution (surface-as-terminal; 27 multi-word bases) |
| compression-ambiguity | 56 | doctrine prioritization |
| unresolved-directional-syntax | 9 | parser evolution |
| parser-ambiguity | 4 | parser evolution |

Concrete parser-evolution levers: register `inspinning` weight (4 rows); teach
surface-as-terminal (`clipper`→`clipper-stall`); multi-word base recognition
(`double-leg-over`, 27 rows). The Stanford cipher decoder is **unnecessary** —
corpus names are already decoded English; one NL tokenizer covers all sources.

## 5. Goal 5 — promotion shortlist (5 tiers)

`promotion_tier{1..5}_*.csv` + `alias_collapse_candidates.csv` +
`ecosystem_promotion_queues.csv` + `PROMOTION_TIERS.md`.

| Tier | Meaning | Names |
|---|---|---:|
| 1 mechanical | category A + first_class_ready | 14 |
| 2 curator-review | A0-derivable (A+ecosystem) + structural (C) | 597 |
| 3 doctrine-blocked | D + pending-symbolic + policy + ambiguous | 271 |
| 4 observational-only | bare folk names, no compositional structure | 508 |
| 5 junk | category E | 4 |
| (alias-collapse) | category B — collapse, not promote | 308 |

**Caveat (honest):** Tier 4 is over-inclusive — A0 found **64** Tier-4 names that
are actually structurally readable once parsed. Re-tier after the A0 pass: the
real Tier-2 backlog is larger and Tier-4 smaller than the pre-A0 split.

## 6. Goal 8 — governance-state evaluation (evaluate only)

The 9-state model is sound; the gap was sub-classification, now **demonstrated**
by the A0 columns. Recommendation: keep the 9 states; formalize the new signals
as reversible columns (TS/CSV, not schema), since they already exist as data:
`mechanically_derived` (= `mechanically_derivable`), `high-confidence
observational` (= `parser_confidence=high` ∧ `doctrine_stable`), `doctrine-blocked`
(= `doctrine_confidence=blocked`), `parser-derived` (= `observationally_
extrapolated`), `unresolved-folk-name` (= `failure_class=folk-name-opacity`),
`alias-collapsed` (= category B), `policy-dependent` (= `doctrine_confidence=
policy-dependent`). States 6 (obsolete) / 8 (weak-source) stay curator-populated;
state 9 stays the un-enumerable frontier.

## 7. Goal 6 — EV redesign

`EV_REDESIGN_PROPOSAL.md` (proposal only, per scope). Core: regenerate
`/freestyle/observational` from `CLASSIFIED_UNIVERSE.csv` with a mechanical
overlap guard (`in_db_live=False AND governance_state ∉ {1,2}`), grouped by the
seven status sections, with separate parser/doctrine confidence chips and the
five-layer spine made visible. The flat 1,770-name module is retired; the
58-card module becomes a curator-override layer.

## 8. Implementation sequencing (recommended next)

1. **Alias-collapse pass** (308 category-B) — resolve renamings to canon first;
   shrinks the universe and prevents duplicate EV cards.
2. **Tier-1 promotion** (14) + curator review of the A0 mechanically-derivable
   set (615), ecosystem-batched, prose authored family-at-a-time.
3. **Parser-evolution slice** — inspinning weight, surface-as-terminal,
   multi-word base recognition → re-run A0 (raises mechanical coverage).
4. **Four Red rulings** (blurry/weaving/pogo/shooting) → unblock ~188.
5. **EV redesign build** (`EV_REDESIGN_PROPOSAL.md`) once the dataset is stable.
6. **Family-placement rulings (R8)** in parallel.

## 9. Risks if implemented aggressively

1. **Hardening A0 guesses into canon** — the dominant risk. Mitigation: every A0
   row is `observationally_extrapolated=true`, ADD is provisional, JOB deferred;
   DB never written.
2. **Silent alias merges** — the 146 dup clusters + 308 alias candidates are
   FLAGGED, never merged; per-source `source_adds` preserved.
3. **Doctrine pre-emption** — Tier 3 stays frozen until the specific ruling.
4. **Cross-source over-trust** — FM over-counts ADD; never collapse to one value.
5. **Coverage-metric theatre** — extrapolated and canonical are reported
   separately; the 36% is parser-validated, not heuristic.
6. **EV surface drift** — the redesign must regenerate, not hand-edit.

## 10. Constraints compliance

| Constraint | Status |
|---|---|
| Observational ≠ canonical | Held — `culturally_canonical=false` on all A0 rows; layer wall preserved |
| Never auto-promote | Held — no promotion; DB read-only |
| No fabricated formula / JOB / ADD | Held — ADD via the validated parser only; JOB deferred |
| Preserve uncertainty explicitly | Held — completeness flag, failure classes, two confidence axes |
| Never silently merge | Held — 146 + 308 candidates flagged, not merged |
| Family-skeleton respect | Held — parent-family resolution + 61 retired-route-outs flagged; no retired-label regeneration |
| Reversible | Held — all outputs are exploration CSVs; no schema, no DB writes |

## 11. File manifest (`exploration/phase-e-implementation-2026-05-28/`)

```
classify_universe.py            CLASSIFIED_UNIVERSE.csv (2,460)   classification_summary.txt
build_reports.py                overlap_removal_candidates.csv (248)
                                observational_duplicate_clusters.csv (146)
                                doctrine_blocked.csv (206)
                                promotion_tier1_mechanical.csv (14)
                                promotion_tier2_curator_review.csv (597)
                                promotion_tier3_doctrine_blocked.csv (271)
                                promotion_tier4_observational_only.csv (508)
                                promotion_tier5_junk.csv (4)
                                alias_collapse_candidates.csv (308)
                                ecosystem_promotion_queues.csv
                                OVERLAP_REPORT.md  DOCTRINE_BLOCK_REPORT.md  PROMOTION_TIERS.md
a0_extrapolate.py               A0_EXTRAPOLATION.csv (1,702)   A0_REPORT.md
EV_REDESIGN_PROPOSAL.md         REPORT.md (this file)
```

No source data, master spreadsheet, RECONCILIATION.csv, or DB was modified.
