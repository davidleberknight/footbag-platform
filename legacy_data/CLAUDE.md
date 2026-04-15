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

4. **Identity lock** files in `inputs/identity_lock/` (`Persons_Truth_Final_*.csv`,
   `Placements_ByPerson_*.csv`) are frozen. Do not modify identity lock files directly.
   New persons or merges require a new lock version via the patch toolchain.

---

## Pipeline Modes

See `run_pipeline.sh` for the authoritative mode list, stages, and script
invocations. See `README.md` for a human-oriented summary of when to use each
mode.

**Rule:** the pipeline enforces stage ordering and fails fast on QC hard
failures. Do not run post-QC stages manually when QC is failing.

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

After a successful canonical run, the authoritative dataset lives in `out/canonical/`:

| File | Description |
|------|-------------|
| `out/canonical/events.csv` | All published events (1980–present) |
| `out/canonical/event_disciplines.csv` | Qualifying disciplines per event |
| `out/canonical/event_results.csv` | Placement rows |
| `out/canonical/event_result_participants.csv` | Participant rows |
| `out/canonical/persons.csv` | Canonically identified persons |

## Workbook Builds

Workbook builds are **separate** from the canonical pipeline and do not affect `out/canonical/`.
Run them standalone after a completed `rebuild + release + qc` cycle.

### Primary deliverable — v22-style release workbook

**Script:** `pipeline/build_workbook_release.py`
**Output:** `out/Footbag_Results_Release.xlsx`

Rules:
- **Year sheets:** display only **non-sparse** events (events with real placement data)
- **EVENT INDEX sheet:** references **all** events including sparse/excluded ones
- **Person visibility:** workbook persons should align with platform-facing persons
  (`canonical_input/persons.csv`) as closely as practical — the same filtering logic
  (referenced by participants, or has member_id/BAP/HOF) should govern both
- **Not included:** Consecutive Records sheet, Freestyle Insights sheet — these are
  out of scope for the main release deliverable

```bash
.venv/bin/python pipeline/build_workbook_release.py   # v22-style release format
```

### Community distribution format

**Script:** `pipeline/build_workbook_community.py` *(active — v13 lineage port)*
**Output:** `out/Footbag_Results_Community.xlsx`

```bash
.venv/bin/python pipeline/build_workbook_community.py   # community format
```

### Deprecated workbook builders

| Script | Reason deprecated |
|--------|-------------------|
| `pipeline/03_build_excel.py` | Summary-column format — **not** the release deliverable; do not use as model |
| `pipeline/04_build_analytics.py` | Companion to 03; same issue |
| `pipeline/04B_create_community_excel.py` | Predates v13 port; superseded by `build_workbook_community.py` |

`03_build_excel.py` is intentionally retained for audit traceability but must not be
treated as the canonical workbook builder.

## Pipeline Relationship: Rebuild/Workbook vs Release/Platform

The two downstream pipelines are **separate but related**:

| | Rebuild → Workbook | Release → Platform/DB |
|---|---|---|
| Input | `out/canonical/*.csv` (after rebuild) | `out/canonical/*.csv` (after rebuild) |
| Output | `out/Footbag_Results_Release.xlsx` | `event_results/canonical_input/*.csv` → SQLite DB |
| Key script | `pipeline/build_workbook_release.py` | `pipeline/platform/export_canonical_platform.py` |
| Person filtering | Align with platform filtering as closely as practical | Referenced by participants, or has member_id/BAP/HOF |
| Event visibility | Year sheets: non-sparse only; INDEX: all events | All non-excluded events |

**Both paths share the same canonical source** (`out/canonical/`). The workbook's visible
persons and event visibility should reflect the same population as the platform DB — do not
design them independently.

## Platform / DB Export

Handled automatically by `./run_pipeline.sh full` (stages 6–7).

To run manually (e.g. after a release-only change):

```bash
# From legacy_data/:
python event_results/scripts/07_build_mvfp_seed_full.py

# Script 08 needs --db resolved to repo root; run_pipeline.sh handles this automatically.
# If running by hand, pass the absolute path:
python event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py \
  --db ~/projects/footbag-platform/database/footbag.db \
  --seed-dir event_results/seed/mvfp_full
```

The platform path is separate from the workbook path — but person and event filtering
decisions in one should inform the other. Do not conflate the mechanics; do align the intent.

---

## What Is Migrated vs Legacy/Research-Only

### Migrated (production canonical)
- All post-1997 mirror events (under the frozen identity lock)
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
- `tools/build_workbook_v13.py` through `v18.py` — superseded workbook builders (in FOOTBAG_DATA repo; ported versions live in `pipeline/`)
- `pipeline/03_build_excel.py` — deprecated workbook builder (summary-column format); **not**
  the release deliverable; do not use as a model or migration base
- `pipeline/04_build_analytics.py` — deprecated workbook builder (companion to 03)
- `pipeline/04B_create_community_excel.py` — deprecated community workbook (predates v13 port)
- `pipeline/06_build_mvfp_seed.py` — deprecated seed builder (superseded by event_results/scripts/07)

### Deferred (known gaps, not blocking)
- Event key standardization for 1982–1986 (18 unambiguous renames identified)
- Full retirement of `stage1_raw_events_magazine.csv` (25 stubs remain)
- `05p5` participant merge limitation for some merged historical events (QC passes)
- 2004 JFK `split_merged_discipline` fix (active=0, pending validator + split implementation)
- ~60 remaining unresolved participant names (Funtastik shorthand, corrupt entries)

---

## Non-Negotiable Rules

1. **QC must PASS before any commit that touches canonical outputs.**
   Run: `.venv/bin/python pipeline/qc/run_qc.py`

2. **Never modify `out/canonical/*.csv` directly.** These files are pipeline outputs.
   Fix at the parser, override, or curated CSV level — then rebuild.

3. **Never modify identity lock files directly.**
   Files in `inputs/identity_lock/` are versioned and frozen. Changes require a new
   version via the patch toolchain.

4. **Never fabricate results.** Unknown data stays unknown. Unresolved names are
   preserved as-is. Absence ≠ non-existence.

5. **Mirror data is highest priority.** Pre-1997 data supplements; it does not override.

6. **All exclusions must be traceable.** Junk events: `overrides/events_overrides.jsonl`.
   Override files: `overrides/results_file_overrides.csv`. Person aliases:
   `overrides/person_aliases.csv`. No silent drops.

---

## Adding New Images / Curated Sources

Every new image or raw result source must be promoted to a structured curated CSV before
entering the pipeline. No raw files enter the pipeline directly.

**Standard workflow:**

```
1. Derive structured CSV from new image/raw source
   → place in inputs/curated/events/structured/  (Variant A, B, or C — see Curated Intake Layer)

2. If new persons appear: add display-name rows to
   inputs/identity_lock/Person_Display_Names_v1.csv
   (existing UUID variant, or new Class B UUID5 entry)

3. Run the complete pipeline:
   cd ~/projects/footbag-platform/legacy_data
   ./run_pipeline.sh full

4. QC must return PASS — pipeline halts on hard failure before workbook/DB stages

5. Inspect diffs:
   git diff out/canonical/
   git diff event_results/canonical_input/

6. Only commit if:
   - QC STATUS: PASS
   - Row count changes are expected (new event added, not existing rows lost)
   - No unintended identity regressions
```

**Do not commit if QC has hard failures.** Fix at the source — parser, override, or
curated CSV — then re-run `./run_pipeline.sh full`.

**Where new files belong:**

| New data type | Location |
|---------------|----------|
| Structured curated CSV (Variant A/B/C) | `inputs/curated/events/structured/` |
| Image-derived structured CSV | same |
| Coverage flag correction | `overrides/coverage_flag_overrides.csv` |
| Event exclusion | `overrides/events_overrides.jsonl` |
| Results file override | `overrides/results_file_overrides.csv` |
| New person display-name variant | `inputs/identity_lock/Person_Display_Names_v1.csv` |
| Supplemental member_id | `inputs/identity_lock/member_id_supplement.csv` |

