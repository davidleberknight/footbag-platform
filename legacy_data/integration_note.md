# Integration Note — Historical Pipeline → Platform Repo

## What the Historical Pipeline Produces for the Platform Repo

The historical pipeline produces five canonical relational CSV files:

    out/release_publication/events.csv                    812 events (1980–2026)
    out/release_publication/event_disciplines.csv         4,112 disciplines
    out/release_publication/event_results.csv             24,932 placements
    out/release_publication/event_result_participants.csv  35,237 participants
    out/release_publication/persons.csv                   3,490 persons

These are the enriched, coverage-filtered platform exports. They are produced by:

    tools/build_canonical_enrichment.py   (discipline normalization, coverage filter)
    tools/export_platform_canonical.py    (platform schema export)

The platform repo consumes `out/release_publication/` directly. It does not consume
`out/canonical/` (the internal format) or any workbook files.

**Current release state:** v3.2.0 / PT v51 / PBP v96 / QC PASS.

---

## What Remains Out of Scope for the First Integration

The following are not part of the first integration handoff:

1. **Event key taxonomy cleanup** — 18 pre-1997 event keys use non-standard formats
   (e.g., `1982_worlds_nhsa_2`). Standardization is deferred; current keys are stable
   and consistent enough for platform ingestion.

2. **`stage1_raw_events_magazine.csv` retirement** — 25 legacy stubs remain in the
   file. They are retained for audit traceability only; all production-relevant events
   are covered by structured curated CSVs. No platform-visible data depends on them.

3. **Workbook builder consolidation** — `build_workbook_v17` through `v19` coexist.
   `v19` is the current production builder but has not been formally designated as the
   single canonical entry point. Out of scope for platform integration.

4. **Pipeline refactor (structural)** — the refactor plan (config extraction, script
   renaming, unified orchestrator) is defined but not started. The current pipeline is
   functional and QC-passing; refactor is deferred.

5. **`05p5` participant merge limitation** — some merged historical events may have
   incomplete participant linkage in canonical; QC passes and platform exports are
   unaffected at aggregate level, but this remains a known limitation.

6. **Pre-1997 completeness** — pre-1997 coverage is intentionally incomplete.
   Absence of a result does not mean it did not happen. Career statistics for players
   active before 1997 are lower bounds only. This is documented in README.md and the
   platform export schema.
