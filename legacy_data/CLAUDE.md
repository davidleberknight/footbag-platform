# Historical Footbag Pipeline — Working Guide

> **SCOPE BOUNDARY:** This subtree is self-contained preparation for platform integration.
> Do not modify repo-root code, docs, or Claude skills from work performed here.

This directory contains the historical footbag results pipeline: the code, overrides,
and identity data that produce the canonical relational dataset covering 1980–present.

---

## Purpose

The pipeline reconstructs and canonicalizes footbag competition results from two source
tracks (mirror-era and pre-1997 historical) into a single authoritative dataset:

    out/canonical/*.csv   ← PRIMARY OUTPUT (authoritative)

The Excel workbook (`out/release_publication/`) is a derived artifact only.

---

## Source Hierarchy

| Priority | Source | Era | Intake path |
|----------|--------|-----|-------------|
| 1 (highest) | Footbag.org mirror HTML | 1997–present | `pipeline/adapters/mirror_results_adapter.py` |
| 2 | Structured curated CSVs | pre-1997 | `pipeline/adapters/curated_events_adapter.py` |
| 3 | Worlds TXT files | 1985–1997 | curated adapter (Variant A/C) |
| 4 | `authoritative-results-1980-1985.txt` | 1980–1985 | curated adapter (Variant C) |
| 5 | Magazine structured CSVs | pre-1997 | curated adapter (Variant B) |
| 6 (lowest) | `stage1_raw_events_magazine.csv` | pre-1997 | legacy-only, no longer required for production |

**Mirror data is always highest priority.** No pre-1997 source may silently override
a mirror placement. If a conflict exists, document it in `overrides/` and prefer the
mirror.

---

## Authoritative-Source Rules

1. **`authoritative-results-1980-1985.txt`** is ground truth for NHSA/WFA Worlds
   1980–1985. No other source may contradict it without explicit override documentation.

2. **Mirror HTML** is ground truth for all events 1997–present. Results file overrides
   (`overrides/results_file_overrides.csv`) may supplement or replace individual events
   when the mirror is corrupt or incomplete — but must be documented.

3. **Structured curated CSVs** (`inputs/curated/events/structured/*.csv`) are the
   authoritative intake format for all pre-1997 data. Raw TXT/magazine stubs are legacy
   and must be promoted to structured CSVs before being treated as authoritative.

4. **Identity lock** (`inputs/identity_lock/Persons_Truth_Final_v51.csv`,
   `Placements_ByPerson_v96.csv`) is frozen. Do not modify identity lock files directly.
   New persons or merges require a new lock version via the patch toolchain.

---

## Active Production Path

```
./run_pipeline.sh rebuild    # parse mirror + curated → stage2 canonical events
./run_pipeline.sh release    # apply identity lock, structural cleanup, export canonical CSVs
./run_pipeline.sh qc         # validate out/canonical/ — must PASS before any commit
```

Full stage sequence:

```
Stage 01   pipeline/adapters/mirror_results_adapter.py     mirror HTML → stage1_raw_events_mirror.csv
Stage 01c  pipeline/adapters/curated_events_adapter.py     curated CSVs → stage1_raw_events_curated.csv
Stage 02   pipeline/02_canonicalize_results.py             raw events → stage2_canonical_events.csv
Stage 02p5 pipeline/02p5_player_token_cleanup.py           apply identity lock (PT v51 / PBP v96)
Stage 02p6 pipeline/02p6_structural_cleanup.py             artifact removal + structural fixes
Stage 05   pipeline/historical/export_historical_csvs.py   export out/canonical/*.csv  ← AUTHORITATIVE
Stage 05p5 pipeline/05p5_remediate_canonical.py            final integrity + event merge pass
QC         pipeline/qc/run_qc.py                           validate — must return QC STATUS: PASS
```

The early pipeline (`./run_early_pipeline.sh`) produces the merged `out/canonical_all/`
dataset combining post-1997 and pre-1997. It is separate from the main production path
and is used for the platform export.

---

## Curated Intake Layer

Pre-1997 data enters the pipeline via structured CSVs in:

    inputs/curated/events/structured/

Three intake variants are supported by `pipeline/adapters/curated_events_adapter.py`:

| Variant | Schema | Use case |
|---------|--------|----------|
| A | `event_id,division,place,player_1,player_2,score,notes` | Raw TXT conversions with known event_id |
| B | `event_name,year,location,category,division,place,player_1,player_2,score,notes` | Magazine/structured events without numeric ID |
| C | Freetext block with `# EVENT:` / `# YEAR:` headers | Worlds TXT and legacy `.txt` files |

**To add a new pre-1997 source:** create a Variant B structured CSV, place it in
`inputs/curated/events/structured/`, and rebuild. Do not hand-edit stage1 files.

**Do not use `stage1_raw_events_magazine.csv` as a model or source.** It is a legacy
static file that has been fully superseded by structured curated CSVs. All
production-relevant events are covered. It is retained only for audit traceability.

---

## Canonical Outputs

After a full `rebuild + release + qc` run:

| File | Description |
|------|-------------|
| `out/canonical/events.csv` | All published events (1980–present) |
| `out/canonical/event_disciplines.csv` | Qualifying disciplines per event |
| `out/canonical/event_results.csv` | Placement rows |
| `out/canonical/event_result_participants.csv` | Participant rows |
| `out/canonical/persons.csv` | Canonically identified persons |

Current totals: **830 events / 4,295 disciplines / 25,807 results / 36,261 participants
/ 3,396 persons**. QC: PASS.

The platform export (`out/release_publication/`) is produced separately by:

    tools/build_canonical_enrichment.py   (discipline normalization, coverage filter)
    tools/export_platform_canonical.py    (platform schema export)

These apply enrichment (discipline normalization, coverage filtering) before export.

---

## What Is Migrated vs Legacy/Research-Only

### Migrated (production canonical)
- All post-1997 mirror events (PT v51 / PBP v96 identity lock)
- 19 FBW structured CSVs (Variant B)
- 15 magazine structured CSVs (Variant B)
- 13 Worlds TXT files 1985–1997 (Variant A/C)
- `authoritative-results-1980-1985.txt` (Variant C)

### Legacy / Research-only (not production canonical)
- `stage1_raw_events_magazine.csv` — legacy-only, no longer required for production;
  25 stubs remain in the file but all production-relevant events are covered by
  structured curated CSVs. Do not use this file as a source of truth.
- `early_data/` — pre-1997 reconstruction artifacts (Gemini outputs, review packages,
  comparison feeds); not part of the production run path
- `tools/patch_*.py` — historical version migration scripts; not called in production;
  do not re-run without understanding their context
- `tools/build_workbook_v13.py` through `v18.py` — superseded workbook builders

### Deferred (known gaps, not blocking)
- Event key standardization for 1982–1986 (18 unambiguous renames identified)
- Full retirement of `stage1_raw_events_magazine.csv` (25 stubs remain)
- `05p5` participant merge limitation for some merged historical events (QC passes)

---

## Non-Negotiable Rules

1. **QC must PASS before any commit that touches canonical outputs.**
   Run: `.venv/bin/python pipeline/qc/run_qc.py`

2. **Never modify `out/canonical/*.csv` directly.** These files are pipeline outputs.
   Fix at the parser, override, or curated CSV level — then rebuild.

3. **Never modify identity lock files directly.**
   `inputs/identity_lock/Persons_Truth_Final_v51.csv` and `Placements_ByPerson_v96.csv`
   are versioned and frozen. Changes require a new version via patch toolchain.

4. **Never fabricate results.** Unknown data stays unknown. Unresolved names are
   preserved as-is. Absence ≠ non-existence.

5. **Mirror data is highest priority.** Pre-1997 data supplements; it does not override.

6. **All exclusions must be traceable.** Junk events: `overrides/events_overrides.jsonl`.
   Override files: `overrides/results_file_overrides.csv`. Person aliases:
   `overrides/person_aliases.csv`. No silent drops.

---

## Safe Rebuild Workflow

```bash
# 1. Full rebuild
./run_pipeline.sh rebuild

# 2. Apply identity lock + export canonical
./run_pipeline.sh release

# 3. Validate
.venv/bin/python pipeline/qc/run_qc.py

# 4. Only commit if QC STATUS: PASS
```

For pre-1997 work (merged canonical_all):

```bash
./run_early_pipeline.sh finalize   # re-merge early data into canonical_all
./run_early_pipeline.sh merge      # produce merged platform export
```

Do not run `./run_pipeline.sh all` without understanding each stage — it combines
rebuild + release + qc in sequence and will fail fast on any QC error.
