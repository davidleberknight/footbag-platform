# Ingestion Hook Specification — Historical Pipeline → Platform Repo

This document defines the handoff contract between the historical footbag pipeline
(source: `~/projects/FOOTBAG_DATA/`) and the platform repo. It is a specification only —
no executable code.

---

## Produced Artifacts

The historical pipeline produces the following files for platform ingestion:

| File | Rows (current) | Description |
|------|---------------|-------------|
| `out/release_publication/events.csv` | 812 | Published events, 1980–2026 |
| `out/release_publication/event_disciplines.csv` | 4,112 | Qualifying disciplines (≥3 placements) |
| `out/release_publication/event_results.csv` | 24,932 | Placement rows |
| `out/release_publication/event_result_participants.csv` | 35,237 | Participant rows |
| `out/release_publication/persons.csv` | 3,490 | Canonically identified persons |

These files are the enriched, coverage-filtered platform exports. They differ from
`out/canonical/` (the internal pipeline format) in that:
- Sparse disciplines (fewer than 3 placements) are excluded
- Division names are normalized via `DIVISION_CANONICAL_MAP`
- Event type classification is enriched (worlds, regional, open, etc.)

---

## Expected Input/Output Paths

### Source (historical pipeline repo)
```
~/projects/FOOTBAG_DATA/out/release_publication/events.csv
~/projects/FOOTBAG_DATA/out/release_publication/event_disciplines.csv
~/projects/FOOTBAG_DATA/out/release_publication/event_results.csv
~/projects/FOOTBAG_DATA/out/release_publication/event_result_participants.csv
~/projects/FOOTBAG_DATA/out/release_publication/persons.csv
```

### Target (platform repo)
The platform repo's ingestion layer should read from a designated import path — e.g.:
```
legacy_data/import/events.csv
legacy_data/import/event_disciplines.csv
legacy_data/import/event_results.csv
legacy_data/import/event_result_participants.csv
legacy_data/import/persons.csv
```

Files should be copied (not symlinked) to ensure the platform repo is self-contained
and does not depend on the historical pipeline repo being present at a fixed path.

---

## Validation Steps Before Ingest

A future integration hook must verify the following before accepting any file set:

### 1. File presence
All five files must be present. A partial file set must be rejected.

### 2. QC gate confirmation
The historical pipeline must have passed QC before export:
- Check for a `QC_STATUS: PASS` sentinel in `out/qc/qc_result.json` (if implemented),
  or require the operator to confirm QC was run and passed.

### 3. Row count sanity checks
Reject the file set if any count falls below established minimums:

| File | Minimum rows |
|------|-------------|
| events.csv | 800 |
| event_disciplines.csv | 4,000 |
| event_results.csv | 24,000 |
| event_result_participants.csv | 34,000 |
| persons.csv | 3,400 |

These thresholds represent ~95% of current counts and guard against partial exports
or pipeline regressions.

### 4. Referential integrity spot-checks
- Every `event_id` in `event_disciplines.csv` must appear in `events.csv`
- Every `result_id` in `event_result_participants.csv` must appear in `event_results.csv`
- Every non-blank `person_id` in `event_result_participants.csv` must appear in `persons.csv`

### 5. Version tag check (recommended)
The export should carry a version tag (e.g., `v3.2.0`) that the integration hook can
log for auditability. The historical pipeline sets this in `README.md` — a future
export script should embed it in a `meta.json` alongside the CSV files.

---

## What a Future Root-Level Integration Hook Needs to Call

A future `scripts/ingest_historical.py` (or equivalent) in the platform repo should:

```
1. Copy files from FOOTBAG_DATA/out/release_publication/ → legacy_data/import/
2. Run row count sanity checks (see thresholds above)
3. Run referential integrity spot-checks
4. Log import version, timestamp, and row counts to legacy_data/import/ingest_log.jsonl
5. On failure: abort and do not overwrite existing import/ files
6. On success: write a sentinel file legacy_data/import/.ingest_ok with timestamp
```

The hook must be idempotent — running it twice with the same source files must produce
the same result without error.

The hook must not modify the source files in `FOOTBAG_DATA/` — it reads only.

---

## What This Hook Does Not Cover (Out of Scope for v1)

- Incremental / delta ingestion — first integration is a full replace
- Automatic re-run of the historical pipeline — operator runs pipeline manually first
- Workbook ingestion — platform does not consume the Excel workbook
- Pre-1997 completeness enforcement — sparse coverage is expected and documented
- Identity merge operations — persons.csv is consumed as-is; no platform-side merging
