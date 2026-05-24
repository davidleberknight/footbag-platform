# Symbolic Trick Master — 2026-05-24

A research / review artifact integrating three symbolic-notation systems
into one unified table. **No production code, DB, or UI touched.** All
deliverables in this directory.

## What's here

| File | Purpose |
|---|---|
| `README.md` | This file. Navigation + summary stats. |
| `SOURCE_INVENTORY.md` | Part A — every notation / ontology source, active vs. stale, overlap, gaps. |
| `SCHEMA.md` | Part B — column-by-column schema definition for the master CSV. |
| `STANFORD_TOKEN_DICT.md` | Part C — Ben Lynn's Stanford shorthand: token vocabulary, grammar, equivalence map. |
| `FAMILY_GENERATION_INSIGHTS.md` | Part D — what the Stanford lattice reveals about unnamed combinations, modifier symmetries, structural gaps. |
| `symbolic_trick_master_2026-05-23.csv` | Part E — 1052-row master export. Multi-system; preserves provenance + disagreement. |
| `COVERAGE_REPORT.md` | Part F — coverage stats, shorthand-only cohort, canonical-only cohort, promotion clusters. |
| `FUTURE_PLATFORM_IMPLICATIONS.md` | Part G — recommendations for future platform features (no implementation). |
| `extract_stanford_master.py` | The extractor script. Re-runnable; reads `exploration/stanford/stanford-{1,2}.txt` + DB. |

## Headline stats

- **994** Stanford shorthand rows parsed from `stanford-2.txt` (Ben Lynn's adapted Job-notation list).
- **183** active canonical tricks in `freestyle_tricks`.
- **125** name-aligned matches between Stanford corpus and canonical DB.
- **869** Stanford-only entries: not yet canonical, but symbolically authored by an external source.
- **58** canonical tricks with no Stanford-corpus equivalent.
- **994/994** Stanford rows fully parseable under the token map.
- **1006** rows still missing operational JOB notation (across both pools).

## Guardrails (per the slice brief)

- No DB writes, no UI changes, no doctrine resolution.
- Dual-convention rule still holds: `[BRACKETS]` = structural accounting; `(parens)` = dex-event accounting.
- Stanford shorthand is a **third symbolic layer** — neither replaces Job notation nor canonicalizes alternative system claims.
- Source disagreement preserved (Stanford ADD ≠ canonical ADD for any matched row is captured in the `source_add_claim` column).

## Strategic purpose

The master CSV is the foundation for hundreds of future curator-paced promotions. Each Stanford-only entry is a candidate that already has structural shorthand authored externally; matching the shorthand to existing canonical OR proposing it as a new emerging-vocabulary entry becomes a per-row curator decision.

Nothing in this directory commits to a promotion path. The slice is a review surface only.
