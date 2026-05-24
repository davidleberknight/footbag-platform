# Promotion Cohort Workbook + Publication Frontier (2026-05-23)

Research-only analytics deliverable. **No DB writes, no UI changes, no canonical promotions.**

> **Primary deliverable (2026-05-23 update):** see `FRONTIER_ANALYSIS_2026-05-23.md`. The cross-source frontier lens uses the new 4,178-row comprehensive corpus and prioritizes the 393 slugs that appear in ≥4 source systems. The earlier cohort-by-family analysis (below) is the secondary view.

## What's here

| File | Purpose | Status |
|---|---|---|
| `FRONTIER_ANALYSIS_2026-05-23.md` | **Primary.** ≥4-source frontier + tier cascade + backfill wave. | active |
| `publication_frontier_2026-05-23.csv` | 393-row frontier per-slug view; ranked Tier 1 → 3. | active |
| `notation_backfill_wave_2026-05-23.csv` | 117-row canonical-DB backfill candidates with per-source notation. | active |
| `analyze_publication_frontier.py` | Re-runnable. Reads the comprehensive corpus + writes 3 outputs. | active |
| `select_wave_alpha.py` | Re-runnable. Reads the frontier + writes Wave Alpha selection. | active |
| `wave_alpha_promotions_2026-05-23.csv` | 30 family-grouped Wave Alpha promotion candidates. | active |
| `wave_alpha_notation_backfill_2026-05-23.csv` | 38-row parallel backfill checklist. | active |
| `WAVE_ALPHA_2026-05-23.md` | Wave Alpha report with by-family detail + curator workflow. | active |
| `promotion_cohorts_2026-05-23.csv` | 26-row cohort-level view (cohort lens). | secondary |
| `easy_job_backfill_candidates_2026-05-23.csv` | 99-row backfill view from cohort lens (superseded by `notation_backfill_wave_*`). | secondary |
| `build_promotion_cohorts.py` | Re-runnable. Cohort-by-family extractor. | secondary |

## Headline stats

| Metric | Count |
|---|---:|
| Master rows analysed | 1052 |
| Cohorts identified | 26 |
| Canonical compounds with JOB-notation gap | 99 |
| LOW-risk rows across all cohorts | 35 |
| MEDIUM-risk rows | 997 |
| HIGH-risk rows | 20 |
| Backfill candidates with LOW doctrine risk | 13 |
| Parser-clean candidates | 77 |
| FM-format JOB strings indexed (trackedNames) | 374 |
| Bases with authored canonical JOB | 46 |

## Top 10 cohorts by promotion-readiness

| Cohort | n | Readiness | Backfill candidates | Notes |
|---|---:|---:|---:|---|
| `clipper-descendants` | 6 | 3.67 | 3 | Highest score; clipper-stall family with clean base JOB. |
| `barraging` | 1 | 3.00 | 0 | Single curator-confirmed row (barraging-osis); not a true "cohort" yet. |
| `symposium` | 6 | 2.00 | 6 | All 6 members backfill-ready; flail / smudge / blizzard / symposium-mirage / symposium-whirl. |
| `legover-descendants` | 5 | 2.00 | 4 | DLO + folk-name siblings; chain depends on legover base JOB. |
| `nuclear` | 2 | 2.00 | 1 | Small cohort; one row backfill-ready via Stanford. |
| `tapping` | 4 | 1.75 | 1 | tap / tapdown / tapping-whirl. |
| `quantum` | 3 | 1.67 | 1 | Curator-locked quantum entry rule (Red pt5); set-modifier family. |
| `atomic` | 4 | 1.50 | 3 | atom-smasher / atomic-butterfly / atomic-torque + folk variant. |
| `pixie` | 10 | 1.40 | 7 | Largest set-modifier cohort with high backfill rate (smear, magellan, smudge, dimwalk, parkwalk, smog, smoke). |
| `whirl-descendants` | 5 | 1.40 | 2 | Direct whirl-base compounds. |

(Full table in `promotion_cohorts_2026-05-23.csv`.)

## Top 50 easiest compound JOB backfills (curator-paced)

Sorted by `doctrine_risk` (`low` first) then by `parser_status` (`parser-clean` first). The CSV has all 99; here are the top illustrative classes:

### Class 1 — Strict modifier-stack mechanical (9 candidates, LOW risk)

These have `modifier_links + base_trick` populated, base has authored JOB, and modifiers are not composite-flag. The suggested JOB is the modifier-prepended form; curator picks the entry-position token per modifier convention.

| Slug | Base | Modifiers | Suggested form | Doctrine |
|---|---|---|---|---|
| `ducking-clipper` | clipper-stall | ducking | `<MOD:DUCKING> > <clipper-stall JOB>` | low |
| `spinning-clipper` | clipper-stall | spinning | `<MOD:SPINNING> > <clipper-stall JOB>` | low |
| `paradox-double-leg-over` | double-leg-over | paradox | `<MOD:PARADOX> > <DLO JOB>` | low |
| `pixie-double-leg-over` (smog) | double-leg-over | pixie | `<MOD:PIXIE> > <DLO JOB>` | low |
| `stepping-double-leg-over` (haze) | double-leg-over | stepping | `<MOD:STEPPING> > <DLO JOB>` | low |
| `symposium-double-leg-over` (nova) | double-leg-over | symposium | `<MOD:SYMPOSIUM> > <DLO JOB>` | low |
| `symposium-barfly` (variant) | barfly | symposium | `<MOD:SYMPOSIUM> > <barfly JOB>` | low |
| `stepping-paradox-dlo` (fog) | double-leg-over | stepping + paradox | two-modifier stack | medium |
| `spinning-paradox-X` (variants) | mirage/illusion | spinning + paradox | two-modifier stack | medium |

### Class 2 — FM-format JOB authored upstream (15 candidates, MEDIUM doctrine risk)

These have a FM-parens JOB string in `freestyleTrackedNames.ts`. The curator's task is to translate (parens) → [brackets] per the dual-convention rule. Sample (full list in CSV):

| Slug | FM-format JOB (preserved as-authored) |
|---|---|
| `bedwetter` | `Clip > Op In (DEX) >> Op Out (DEX)(PDX) > Op Out (DEX) > Same Toe (DEL)` |
| `blizzard` | `Clip > Op In (DEX) >> Op Out (DEX)(PDX) > Op Toe (DEL)` |
| `blaze` | `Clip > Op Front Whirl (DEX) >> Op In (DEX) > Op Toe (DEL)` |
| `paradox-barrage` | `Clip > Same In (PDX) (DEX) > Same In (DEX) > Op Toe (DEL)` |
| `paradox-whirling-swirl` | `Clip > Same In (PDX) (DEX) > Op Back Swirl (DEX) > Same Clip (XBD)(DEL)` |
| `stepping-eggbeater` | `Clip > Op In (DEX) (plant) > Same Out (DEX) > Op Out (DEX) > Same Toe (DEL)` |
| `toe-ripwalk` | `Toe > Op In (DEX) (plant) > Op Out (DEX) > Op Clip (XBD)(DEL)` |
| `barfly-swirl` | `Clip > Same Out (DEX) > Same Out (DEX) > Op Back Swirl (DEX) > Same Clip (XBD)(DEL)` |
| ... 7 more in CSV | |

### Class 3 — Stanford-shorthand-parseable (75 candidates, MEDIUM doctrine risk)

These have Stanford shorthand parsed into clean components but no canonical bracket JOB authored. Curator translates Stanford tokens per `STANFORD_TOKEN_DICT.md`. Sample (full list in CSV):

| Slug | Stanford shorthand | Components |
|---|---|---|
| `paradox-mirage` | `*. -1+L` | clipper/toe-set, opp-side in-dex, same-side inside-set |
| `ripwalk` | `Z.+0-0+X` | toe-set + 2 dex + clipper terminal |
| `dimwalk` | `Z.+1+1+X` | toe-set + 2 dex + clipper terminal |
| `smear` | `Z+0.-Z` (or similar) | pixie-class pattern |
| `eggbeater` | `Z.-1-0+Z` | toe-set + two-dex + toe terminal |
| `spinning-osis` | `X-0\.` (or similar) | clipper-set + dex + back-spin |
| `paradox-whirl` | `X-1.+0+X` (or similar) | clipper-set + 2 dex + clipper terminal |

(Each row's exact Stanford string + token decomposition is in `easy_job_backfill_candidates_2026-05-23.csv`.)

## Top doctrine-blocked clusters

These cohorts hold high-risk rows the curator should NOT mass-promote without doctrine adjudication. Per `COHORT_RULES` + `COMPOSITE_MODIFIER_FLAG`:

| Cluster | Trigger | Members (sample) |
|---|---|---|
| `blurry` family | composite-modifier flag | blurriest, blurry-torque, blurry-whirl, blurry-whirling-swirl |
| `surging` family | composite-modifier flag | surging, surge, sumo (some), bigwalk |
| `furious` family | composite-modifier flag | fury, paradox-symposium-furious-mirage |
| `gyro` family | composite-modifier flag | vortex, gyro-mirage, gyro-barfly |
| Drifter-base chained | doctrine-sensitive base | reverse-drifter, royale, smoke, paradox-high-plains-drifter |

## Top shorthand-complete families

Families where Stanford shorthand achieves near-total structural coverage. These are pedagogically rich and could power the "family-lattice" view:

| Family | Stanford coverage |
|---|---|
| Toe-single-dex (atom set: fairy / pixie / atomic / quantum) | 100% |
| Clipper-single-dex (nuclear / bubba / quasi / stepping) | 100% |
| Toe-double-dex compounds | ~80% |
| Clipper-double-dex compounds | ~75% |
| Triple-dex chains | ~50% (curator-named subset) |

(See `exploration/symbolic-master/FAMILY_GENERATION_INSIGHTS.md` for the full lattice analysis.)

## Top parser-clean observational clusters

Inside the 869-row Stanford-only pool, these clusters are parser-clean and could form low-risk Emerging-Vocabulary candidates for future promotion waves:

| Cluster | Approx count | Stanford signature | Notes |
|---|---:|---|---|
| Symposium + base | ~50 | `*-!?<dex>+<surface>` | symposium pattern; curator-locked entry token |
| Spinning + paradox + X | ~40 | `X<spin><dex>+X` etc. | two-modifier stack; review needed |
| Ducking + base | ~35 | `^<dex>` | curator-locked duck token |
| Pixie + base | ~30 | `Z+1+<dex>+<surface>` | set-modifier family |
| Atomic + base | ~25 | `Z-0+<dex>+<surface>` | set-modifier family |

## Families closest to "bulk promotion ready"

Cohorts where ≥75% of members are LOW or MEDIUM risk AND ≥50% are backfill-ready OR canonical:

1. **symposium** — 6/6 backfill-ready (100% rate), all 6 LOW or MEDIUM.
2. **pixie** — 7/10 backfill-ready, all canonical-already.
3. **legover-descendants** — 4/5 backfill-ready, DLO base authored.
4. **spinning** — 12 backfill candidates (largest single-modifier family).
5. **clipper-descendants** — top readiness score; 3 backfill-ready.

## Realistic promotion estimates

Based on the cohort analysis:

| Layer | Estimate |
|---|---|
| Observational tricks realistically promotable with LOW risk | ~50-80 (subset of the 869 Stanford-only pool with FM-format JOB or stable family-pattern) |
| Canonical compounds with enough data for first-class detail pages | 99 backfill candidates → 35 strict LOW-risk + ~50 FM-source MEDIUM-risk |
| Tricks still requiring curator doctrine work | ~20 HIGH-risk + ~20 composite-modifier holds |

These are upper-bound estimates; curator triage per cohort is the natural next step.

## What this slice does NOT do

Per the brief guardrails:

- ❌ No DB writes
- ❌ No UI changes
- ❌ No automatic promotions
- ❌ No doctrine auto-resolution
- ❌ No silent canonicalization from Stanford alone
- ❌ PB stays observational/provenance; PB does NOT define canonical ADD

## Strategic purpose

This is the foundation for **cohort-based** rather than **per-row artisanal** promotion. A future curator slice could:

1. Pick a top-readiness cohort (e.g. `pixie`).
2. Review the 7 backfill candidates in that cohort together.
3. Apply per-row JOB corrections in a single CSV pass.
4. Land all 7 in one slice.

This pattern scales the curator's per-decision capacity from 1 trick at a time to 5-10 per slice without sacrificing review depth.
