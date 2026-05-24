# Part F — Coverage Report

Stats computed from `symbolic_trick_master_2026-05-23.csv` (1052 rows).

## Top-line metrics

| Metric | Count | Share of total |
|---|---:|---:|
| Total master rows | 1052 | 100% |
| Canonical-DB-backed (publication_status=`canonical`) | 183 | 17.4% |
| Stanford-only unpublished | 869 | 82.6% |
| Stanford↔canonical name matches | 125 | — |
| Canonical rows with NO Stanford equivalent | 58 | — |
| Stanford rows fully parseable | 994 / 994 | 100% |
| Rows missing JOB notation | 1006 | 95.6% |

## Stanford↔canonical alignment

| Status | Count | Notes |
|---|---:|---|
| Stanford shorthand authored + canonical row published | 125 | Both layers agreed; CSV preserves both. |
| Stanford shorthand authored but no canonical row | 869 | The promotion-candidate pool. |
| Canonical row published but no Stanford shorthand | 58 | Post-Stanford-corpus canonical additions (later canonical adds; Stanford corpus is older). |

The 125 aligned rows are the **proof-of-concept set**: Stanford's symbolic shorthand has been authored externally, AND the platform's canonical layer has also picked up the trick. These are the safest test bed for any cross-system search / display feature.

## Stanford-only cohort by claimed ADD

How the 869 unpublished Stanford rows distribute across difficulty:

| Stanford ADD bucket | Count |
|---:|---:|
| 2 | 21 |
| 3 | 155 |
| 4 | 269 |
| 5 | 236 |
| 6 | 126 |
| 7 | 44 |
| 8 | 16 |
| 9 | 2 |

**Observation:** the 4-ADD and 5-ADD buckets are the largest pools of unpublished community-recognized tricks. A curator-paced promotion plan could prioritize these middle-difficulty rows where most learners spend time.

## JOB-notation coverage gap

| State | Count |
|---|---:|
| Canonical rows with op-notation populated | 80 (approx; varies as corrections land) |
| Canonical rows missing op-notation (still `JOB: notation pending` on browse) | ~100 |
| Stanford-only rows (no canonical → no op-notation by definition) | 869 |
| **Total rows missing JOB** | **1006** |

The 100-row canonical JOB gap is the subject of `exploration/derived-job-audit-2026-05-24/AUDIT.md` (35 derivable safely, 33 needs review, 0 fully blocked).

## Cohort identification

### Cohort 1 — "Stanford ↔ canonical alignment validated" (125 rows)

These are the safest base for any future cross-system feature. The shorthand has been independently authored externally, and the canonical layer has the trick. The CSV row carries both notations; a curator can spot-check alignment.

### Cohort 2 — "Stanford-only, low-difficulty, structurally clean" (~176 rows)

Stanford rows in the 2-ADD or 3-ADD bucket. These are the natural next-promotion frontier: small ADD, well-trodden pedagogical territory, and structurally simple. A curator-paced batch from this cohort is the closest analog to the Slice 7-OBS-A intent the prior review pushed back on — but now with structural shorthand authored externally per row, the publication-readiness signal is stronger.

### Cohort 3 — "Stanford-only, mid-difficulty, named compound" (~505 rows)

The 4-ADD and 5-ADD pools. Curator triage at the family-cluster level (e.g. all spinning-paradox-X compounds at once) would be more efficient than per-row.

### Cohort 4 — "Stanford-only, high-difficulty, often composite-modifier" (~188 rows)

6-ADD through 9-ADD. Many of these involve composite modifiers (blurry, surging, gyro+other) and overlap with the curator's Wave-2 doctrine-pending list. Should NOT auto-promote.

## Promotion-readiness signal: combining Stanford + community sources

For any single trick name, the strongest publication signal is when multiple independent sources agree on its existence + structure:

| Signal layer | Source |
|---|---|
| Canonical DB row | Active trick |
| Stanford shorthand | `stanford-2.txt` |
| FootbagMoves entry (operationalNotation) | `freestyleTrackedNames.ts` |
| PassBack claim | `freestyleObservationalTricks.ts` (proposedAddTotal) |
| footbag.org /newmoves description | curator-archived |

A future enrichment slice could add columns showing **how many of these layers agree on the trick's existence + ADD**. Names that appear in 4+ layers are strongest promotion candidates.

This is left as a follow-up (no implementation here).

## Cross-system disagreement examples (not auto-resolved)

These illustrate the kind of curator-judgment rows that the master CSV makes legible:

- **Stepping / Whirling / Blurry / Blazing** — Stanford treats them as a single structural pattern (`X-1.`); the canonical dictionary publishes them as four distinct modifiers with separate ADD bonuses. Curator should decide whether to surface the structural overlap as a docu-feature.
- **Pendulum / Rake** — Stanford has dedicated single-letter tokens (`U` / `R`); the canonical dictionary has them as 2-ADD compound rows with swing-element doctrine. Both representations preserved.
- **Atomic atomic** — Stanford lists `Z-0-0.` as a real shape but tags it as unnamed ("Nonsymposium Warping"). Canonical dictionary has no row. Curator should decide whether the name "Warping" warrants a canonical entry.

These are research observations, not action items. The CSV preserves them honestly.
