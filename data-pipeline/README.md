# data-pipeline

This directory contains the historical data pipeline for the Footbag platform.

## Current state

**The current working flow starts from canonical CSVs:**

```
legacy_data/event_results/canonical_input/   ← canonical CSVs (starting point)
    ↓  scripts/07_build_mvfp_seed_full.py
legacy_data/event_results/seed/mvfp_full/    ← seed CSVs
    ↓  scripts/08_load_mvfp_seed_full_to_sqlite.py
database/footbag.db                          ← SQLite database
    ↓  npm start
website
```

To run this flow from the repo root:

```bash
./scripts/run-full-pipeline.sh --skip-pipeline
npm start
```

## Planned: true soup-to-nuts

The pipeline scripts in this directory (`pipeline/01` through `pipeline/05`) process
raw legacy source data all the way through to the canonical CSVs. Full end-to-end support —
starting from the raw HTML mirror archive — is planned for a future release.

When implemented, the complete flow will be:

```
data-pipeline/mirror/          ← raw HTML mirror archive (not committed; large)
data-pipeline/inputs/          ← reference data (BAP, FBHOF, location maps, identity locks)
    ↓  run_pipeline.sh all     (stages 01–05)
legacy_data/event_results/canonical_input/
    ↓  ...
website
```

## Directory contents

```
pipeline/        Processing scripts (stages 01–05)
                   01  Parse HTML mirror
                   01b Import legacy text results (OLD_RESULTS.txt)
                   01c Merge stage-1 sources
                   02  Canonicalize results
                   02p5 Apply identity lock (person resolution)
                   03  Build Excel workbook
                   04  Build analytics
                   05  Export canonical CSVs → legacy_data/event_results/canonical_input/
inputs/          Reference data committed to the repo:
                   OLD_RESULTS.txt, BAP/FBHOF data, location canonicalization,
                   identity lock files (latest versions only)
overrides/       Manual event and person corrections
qc/              Validation scripts
run_pipeline.sh  Pipeline orchestration (setup / rebuild / release / all)
Makefile         Convenience wrapper for run_pipeline.sh
requirements.txt Python dependencies
```

## Setup (when running the full pipeline)

```bash
cd data-pipeline
./run_pipeline.sh setup    # creates .venv and installs dependencies
```
