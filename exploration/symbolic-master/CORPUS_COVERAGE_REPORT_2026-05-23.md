# Comprehensive Symbolic Trick Corpus — Coverage Report (2026-05-23)

This report verifies the comprehensive corpus export at `comprehensive_symbolic_trick_corpus_2026-05-23.csv`. Built by `build_comprehensive_corpus.py`. Read-only review surface.

## Coverage status

**Overall:** PASS

| Source | Expected | Exported | Status | Notes |
|---|---:|---:|---|---|
| canonical_db | 184 | 184 | OK | freestyle_tricks rows (all, including is_active=0) |
| observational_ts | 62 | 62 | OK | freestyleObservationalTricks.ts entries |
| tracked_names_ts | 558 | 558 | OK | freestyleTrackedNames.ts entries (with or without notation) |
| fm_inventory | 573 | 573 | OK | footbagmoves_inventory.csv non-header rows |
| fm_symbolic_grammar | 854 | 854 | OK | SYMBOLIC_GRAMMAR_MASTER.csv non-header rows |
| fborg_text | — | 408 | — | fborg-Nadd.txt + category files (state-machine parser) |
| fborg_insert_staging | 82 | 82 | OK | FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv non-header rows |
| passback_intake | 282 | 282 | OK | passback_trick_sources.csv non-header rows |
| passback_source_links | 95 | 95 | OK | passback_source_links_staging.csv non-header rows |
| stanford_corpus | — | 1080 | — | stanford-2.txt parser (one row per name; aliases expanded) |

## Top-line metrics

- Total exported rows: **4178**
- Unique canonical_slug values: **1679**
- Slugs with ≥2 source-systems: **816**
- Slugs with ≥4 source-systems (strong promotion signal): **393**

## Missing-formula counts by source

A row counted here exists in the source corpus but contributed NO notation/formula content.

| Source | Rows with no formula content |
|---|---:|
| fm_symbolic_grammar | 276 |
| fm_inventory | 196 |
| tracked_names_ts | 183 |
| canonical_db | 78 |
| passback_intake | 32 |
| passback_source_links | 8 |
| fborg_text | 3 |

## ADD-claim alignment (vs canonical_db official_add)

- Rows where source claim exactly matches official_add: **397**
- Rows where source claim DISAGREES with official_add (numeric gap recorded): **239**
- Slugs with conflicting ADD claims across sources: **218**

**First 20 ADD-conflict slugs (curator review surface):**

| Slug | Claims |
|---|---|
| `around-the-world` | canonical_db=2; fm_symbolic_grammar=2; fborg_text=2; passback_intake=1; passback_source_links=1; stanford_corpus=2 |
| `assassin` | canonical_db=4; fm_inventory=4; fm_inventory=4; fm_symbolic_grammar=4; fm_symbolic_grammar=4; fm_symbolic_grammar=4; passback_intake=2; stanford_corpus=4 |
| `atom-smasher` | canonical_db=4; fm_symbolic_grammar=3; passback_intake=2; passback_source_links=2; stanford_corpus=4 |
| `atomic-butterfly` | canonical_db=4; fborg_text=4; passback_intake=2; passback_source_links=2; stanford_corpus=4 |
| `barfly` | canonical_db=4; fm_inventory=4; fm_inventory=4; fm_symbolic_grammar=4; fm_symbolic_grammar=4; fborg_text=4; passback_intake=2; passback_source_links=2; stanford_corpus=4 |
| `barrage` | canonical_db=3; fm_inventory=3; fm_symbolic_grammar=3; fborg_text=3; passback_intake=2; passback_source_links=2; stanford_corpus=3 |
| `barraging-osis` | canonical_db=5; passback_intake=2; passback_source_links=2; stanford_corpus=5 |
| `bedwetter` | canonical_db=4; fm_inventory=5; fm_inventory=5; fm_symbolic_grammar=5; fm_symbolic_grammar=5; fborg_insert_staging=5; passback_intake=3 |
| `big-apple` | canonical_db=6; fm_inventory=6; fm_inventory=6; fm_symbolic_grammar=6; fm_symbolic_grammar=6; passback_intake=1; stanford_corpus=6 |
| `blaze` | canonical_db=3; fm_inventory=4; fm_inventory=4; fm_symbolic_grammar=4; fm_symbolic_grammar=4; passback_intake=2; stanford_corpus=4 |
| `blender` | canonical_db=4; fm_inventory=4; fm_inventory=4; fm_symbolic_grammar=4; fm_symbolic_grammar=4; fborg_text=4; fborg_text=5; fborg_text=5; passback_intake=1; passback_source_links=1; stanford_corpus=4 |
| `blizzard` | canonical_db=3; fm_inventory=4; fm_symbolic_grammar=4; fborg_text=5; fborg_text=5; fborg_insert_staging=4; passback_intake=2; stanford_corpus=4 |
| `blur` | canonical_db=4; fm_inventory=4; fm_symbolic_grammar=4; fborg_text=5; fborg_text=5; passback_intake=2; passback_source_links=2; stanford_corpus=4 |
| `blurrage` | canonical_db=4; fm_inventory=6; fm_inventory=6; fm_symbolic_grammar=6; fm_symbolic_grammar=6; passback_intake=3; stanford_corpus=5 |
| `blurriest` | canonical_db=5; fm_inventory=5; fm_symbolic_grammar=5; passback_intake=3; passback_source_links=3; stanford_corpus=5 |
| `bullwhip` | canonical_db=5; fm_inventory=5; fm_symbolic_grammar=5; passback_intake=2; passback_source_links=2; stanford_corpus=5 |
| `butterfly` | canonical_db=3; fm_inventory=3; fm_symbolic_grammar=3; fborg_text=3; fborg_text=4; fborg_text=3; passback_intake=1; passback_source_links=1; stanford_corpus=3 |
| `clipper` | canonical_db=1; fm_symbolic_grammar=2; fborg_text=2; fborg_text=3; fborg_text=2; passback_intake=0; passback_source_links=0; stanford_corpus=2 |
| `dada-curve` | canonical_db=4; fm_inventory=4; fm_symbolic_grammar=4; passback_intake=2; passback_source_links=2 |
| `dimwalk` | canonical_db=4; fm_inventory=4; fm_symbolic_grammar=4; passback_intake=2; passback_source_links=2; stanford_corpus=4 |

## Likely alias / merge candidates

Slugs with ≥2 distinct source-name spellings (case-insensitive): **81**

**First 15 examples (curator review surface):**

| Slug | Source names |
|---|---|
| `around-the-world` | around the world / atw |
| `atom-smasher` | atom smasher / atomsmasher |
| `atomic-butterfly` | (atomic butterfly) / atomic butterfly / legbeater |
| `barraging-osis` | barraging osis / barroque |
| `clipper` | clipper / clipper* |
| `cross-body-sole-stall` | cross-body sole stall / flapper |
| `double-around-the-world` | double around the world / double atw |
| `double-leg-over` | dlo / double leg over |
| `flying-clipper` | flying clipper / flying clipper* |
| `grave-digger` | grave digger / gravedigger |
| `high-plains-drifter` | high plains drifter / high-plains-drifter |
| `knee-clipper` | knee clipper / knee-clipper |
| `mirage` | mirage / mirage* |
| `osis` | osis / osis* |
| `paradox-barrage` | paradox barrage / paradox-barrage |

## Promotion-readiness signals

- Canonical-DB rows with operational_notation populated (promotion-ready): **46**
- Canonical-DB rows with NO operational_notation (notation backfill needed): **138**
- Rows flagged for curator review (parser/doctrine): **245**

## Source-system distribution (rows)

| Source system | Rows |
|---|---:|
| `stanford_corpus` | 1080 |
| `fm_symbolic_grammar` | 854 |
| `fm_inventory` | 573 |
| `tracked_names_ts` | 558 |
| `fborg_text` | 408 |
| `passback_intake` | 282 |
| `canonical_db` | 184 |
| `passback_source_links` | 95 |
| `fborg_insert_staging` | 82 |
| `observational_ts` | 62 |

## Naming

Per the slice brief, this corpus is named **comprehensive symbolic corpus** rather than "master" until all coverage checks pass and the curator approves promotion. If `Overall: FAIL` above, the mismatched-row sources need investigation before the corpus can be promoted to "master" status.
