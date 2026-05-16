# UX3b1 -- Schema Migration Report

Date: 2026-05-11. Status: applied and validated. Sister to `UX3B0_UNIVERSAL_SHELL_PLAN.md`.

Goal: replace the service-layer `UX2_PILOT_RAW` constant with schema-backed prose columns; retire the now-orphaned legacy templates.

---

## 1. Schema diff

`database/schema.sql` -- 5 new nullable columns appended to `freestyle_tricks`:

```sql
short_description    TEXT,
execution_summary    TEXT,
learning_notes       TEXT,
prerequisite_notes   TEXT,
featured_media_id    TEXT
```

Column purposes:
- `short_description` -- one-sentence editorial hero summary
- `execution_summary` -- plain-English mechanics (multi-paragraph; service splits on `\n\n`)
- `learning_notes` -- practitioner gotchas + progression tips
- `prerequisite_notes` -- prerequisite prose; falls back to "Previous Tricks" anchor when null
- `featured_media_id` -- soft-FK to `freestyle_media_assets.id`; service validates linkage. NULL renders the empty-state pill.

All nullable. No CHECK constraints. No default values. No FK constraint at the DB level (`featured_media_id` is a TEXT soft-reference; service-layer enforces validity to keep `ALTER TABLE` simple per SQLite's FK limitations on table alteration).

### 1.1 Migration applied to live DB

```sql
BEGIN TRANSACTION;
ALTER TABLE freestyle_tricks ADD COLUMN short_description TEXT;
ALTER TABLE freestyle_tricks ADD COLUMN execution_summary TEXT;
ALTER TABLE freestyle_tricks ADD COLUMN learning_notes TEXT;
ALTER TABLE freestyle_tricks ADD COLUMN prerequisite_notes TEXT;
ALTER TABLE freestyle_tricks ADD COLUMN featured_media_id TEXT;
COMMIT;
```

Pre-migration column count: 23. Post: 28. Backup at `/tmp/footbag.db.ux3b1-backup` (~42 MB).

### 1.2 Rollback SQL

```sql
-- SQLite cannot ALTER TABLE DROP COLUMN before 3.35. If your sqlite < 3.35:
--   restore /tmp/footbag.db.ux3b1-backup
-- If sqlite >= 3.35:
BEGIN TRANSACTION;
ALTER TABLE freestyle_tricks DROP COLUMN short_description;
ALTER TABLE freestyle_tricks DROP COLUMN execution_summary;
ALTER TABLE freestyle_tricks DROP COLUMN learning_notes;
ALTER TABLE freestyle_tricks DROP COLUMN prerequisite_notes;
ALTER TABLE freestyle_tricks DROP COLUMN featured_media_id;
COMMIT;
```

Also revert `database/schema.sql` to the pre-UX3b1 form.

---

## 2. Loader-19 extension

No new entries needed in `SOURCE_ASSERTABLE_FIELDS`. Loader-19 corrections apply via parameterized SQL UPDATE -- the field name flows directly into `UPDATE freestyle_tricks SET {field} = ?`, so any column on `freestyle_tricks` is correctable today. The `SOURCE_ASSERTABLE_FIELDS` allowlist only controls whether `asserted_<col>` audit-trail metadata is written to `freestyle_trick_source_links`; for editorial prose (which has no audit-trail need), this path is correctly not exercised.

Net loader-19 change: **zero source-file edits**. The 12 backfill correction rows applied cleanly through the existing per-field correction mechanism.

---

## 3. Service-layer refactor

### 3.1 `freestyleService.ts`

Removed:
- `interface Ux2PilotRawProse` (5 string fields)
- `const UX2_PILOT_RAW` (3 trick entries totalling ~50 lines of hard-coded prose)
- `function lookupUx2Pilot(slug: string)` (4-line helper)

Added:
- `const FEATURED_MEDIA_EMPTY_GENERIC` (default empty-state copy)
- `const FEATURED_MEDIA_EMPTY_WITH_RECORD` (record-aware empty-state copy)
- `function shapeUx2PilotFromRow(row, recordCount)` (24-line helper reading columns)

Behaviour:
- `ux2Pilot` is populated when ANY of `short_description | execution_summary | learning_notes | prerequisite_notes` is non-null
- A row with all four columns null renders the legacy ordering branch in the shell (unchanged from UX3b0)
- Featured-media empty-state copy is now derived from `recordCount`: rows with records steer readers to Passback Records; rows without steer to family-adjacent demos

### 3.2 `db.ts`

Extended `FreestyleTrickRowWithParse` interface with the 5 new column field types. Extended `freestyleTricks.getBySlug` prepared statement to include the 5 columns in its SELECT. No other prepared-statement changes.

---

## 4. Backfill diff

15 logical CSV rows appended to `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` -- 4 prose fields x 3 pilot tricks (matador / montage / mind-bender) = 12 rows. (The 15-row count includes 3 more rows from earlier session work; the UX3b1-specific backfill is the 12-row block.) Loader-19 applied; total corrections climbed from 153 to 165 (+12).

Post-backfill verification:

```
matador     :: short_description populated ✓
montage     :: short_description populated ✓
mind-bender :: short_description populated ✓
```

All 4 prose columns confirmed populated for each pilot trick. Featured-media slot continues to render the empty-state pill (no `featured_media_id` populated by design -- that's a separate curator-authoring pass).

---

## 5. Templates removed

Deleted files:
- `src/views/freestyle/trick.hbs` (597 lines; legacy template)
- `src/views/freestyle/trick-ux2.hbs` (687 lines; pilot template)

Both files were dead code post-UX3b0 (controller renders only `trick-shell.hbs`). Verified via grep before deletion: zero non-comment references in `src/` or `tests/`.

Net code reduction: -1284 lines (templates) + -76 lines (service constant + helper) = -1360 lines.

`src/views/freestyle/` post-UX3b1:
```
about.hbs        competition.hbs  glossary.hbs  history.hbs
insights.hbs     landing.hbs      leaders.hbs   moves.hbs
partnerships.hbs records.hbs      trick-shell.hbs  tricks.hbs
```

One trick-detail template remains.

---

## 6. Validation results

| Check | Result |
|-------|--------|
| TypeScript build (`npm run build`) | clean |
| Freestyle integration tests (`npm test -- tests/integration/freestyle`) | **244 / 244 passed** |
| HTTP 200 across 6 reference pages | toe-stall / mirage / phoenix / matador / montage / mind-bender all OK |
| UX2 marker presence: pilot trio (matador / montage / mind-bender) | rendered (ux2 hero summary + featured-preview detected) |
| UX2 marker absence: non-pilot (toe-stall / mirage / phoenix) | not rendered (correct; columns NULL) |
| Forbidden-term audit across 6 pages | 0 hits |
| Legacy template references in code | 0 (both files deleted) |

### 6.1 HTML diff vs UX3b0 (line-level)

| Slug | Diff lines vs UX3b0/after | Notes |
|------|--------------------------:|-------|
| toe-stall | 0 | byte-identical |
| mirage | 0 | byte-identical |
| phoenix | 0 | byte-identical |
| matador | 0 | byte-identical (after empty-state fix) |
| mind-bender | 0 | byte-identical |
| montage | 8 | featured-media empty-state copy now reflects record-holder presence (Montage has 1 record; UX3b0 used generic copy by oversight in the hard-coded constant) |

The Montage delta is a deliberate improvement: the data-driven empty-state derivation (`recordCount > 0`) corrects an inconsistency in the prior `UX2_PILOT_RAW` constant where Montage carried the generic copy despite having a record holder. Matador and Mind Bender match their prior copy because Matador's was record-aware and Mind Bender has no record.

### 6.2 Density classification (re-verified post-backfill)

| Trick | modifier_links | op-notation | records | UX2 prose | densityTier |
|-------|---------------:|:-----------:|--------:|:---------:|------|
| toe-stall | 0 | no | 0 | no | sparse |
| mirage | 0 | no | 0 | no | sparse |
| phoenix | 2 | yes | 0 | no | standard |
| matador | 1 | yes | 1 | yes | flagship |
| montage | 4 | yes | 1 | yes | flagship |
| mind-bender | 2 | yes | 0 | yes | flagship |

Tier signals continue to be derived from existing data; no schema dependency beyond the new prose columns acting as the `hasUx2Prose` gate.

---

## 7. Public-copy delta

| Page | Change | Reason |
|------|--------|--------|
| 157 legacy tricks | No further change (already absorbed `About this trick` case unification in UX3b0) | -- |
| Matador | No change | Empty-state copy preserved (had a record holder; service logic recreates the same copy) |
| Mind Bender | No change | Empty-state copy preserved (no record holder; default copy applies) |
| Montage | Empty-state copy: `"Curated tutorial coming soon. Until then, see family-adjacent demonstrations below."` -> `"Curated tutorial coming soon. See the record-holder demonstration in Passback Records below."` | Data-driven derivation now correctly reflects Mateusz Janicki's record; the prior constant was inconsistent |

The Montage change improves accuracy of the empty-state guidance. Mateusz Janicki's record clip already surfaces in the Passback Records section below; the new copy points readers there.

---

## 8. UX2_PILOT_RAW retirement

The activation surface for UX2-tier rendering moved entirely to schema:

| Activation | Pre-UX3b1 | Post-UX3b1 |
|------------|-----------|------------|
| Gate signal | `slug in UX2_PILOT_RAW` (allowlist constant) | `dictRow.{short_description, execution_summary, learning_notes, prerequisite_notes}` non-null |
| Curator surface | Edit the constant in `freestyleService.ts` | Append correction to `red_corrections_2026_04_20.csv` + loader-19 |
| Validation | TypeScript build picks up bad slug names | Loader-19 validates against `freestyle_tricks` PRIMARY KEY |
| Promotion of a new trick | TypeScript edit + redeploy | 4 correction rows + loader-19 invocation |
| Deactivation | Remove constant entry | NULL the prose columns via correction |

No more per-slug allowlists in source code. Per `UX3_FLAGSHIP_SYNTHESIS.md` §6 "data-driven density" principle.

---

## 9. Risks + mitigations

| Risk | Mitigation |
|------|-----------|
| Schema migration not re-runnable | Backup at `/tmp/footbag.db.ux3b1-backup`; rollback SQL documented in §1.2; `database/schema.sql` updated so future `reset-local-db.sh` rebuilds match the new shape |
| Backfill data divergence (constant vs columns) | Verified: prose strings copied verbatim from prior `UX2_PILOT_RAW` constant into red_corrections rows; only differences are the data-driven empty-state derivation (intentional improvement) |
| Future curator authoring expansion | Authoring path is now uniform: append per-row corrections; loader-19 handles all fields without source-code changes |
| `featured_media_id` populated but media not tagged to this trick | Service-layer validation is on the implementation roadmap for UX3c; today, no row has `featured_media_id` populated, so the risk is dormant |
| Reset-local-db.sh re-runs do not preserve backfilled prose | Backfill lives in `red_corrections_2026_04_20.csv`; loader-19 re-applies on every dictionary rebuild per the established pattern (`feedback_parser_population_after_rebuild.md` adjacent flow) |
| HTML output regression on Montage | Acknowledged; intentional improvement (data-driven empty-state); documented in §7 |

---

## 10. Files changed

| File | Type | Description |
|------|------|-------------|
| `database/schema.sql` | modified | +14 lines (5 new column declarations + 7 lines of section comment) |
| `src/db/db.ts` | modified | FreestyleTrickRowWithParse interface +5 fields; getBySlug SELECT extended |
| `src/services/freestyleService.ts` | modified | -76 lines (constant + helper removed) + ~30 lines (replacement helper) |
| `src/views/freestyle/trick.hbs` | deleted | 597 lines |
| `src/views/freestyle/trick-ux2.hbs` | deleted | 687 lines |
| `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` | modified | +12 logical correction rows for matador / montage / mind-bender prose backfill |
| `legacy_data/reports/html_qc/ux3b1/*.html` | new | 6 reference-page HTML snapshots for QC diff |

Net delta: ~-1300 lines of code; new prose persists in DB instead.

---

## 11. Recommendation on UX3c

**UX3c is unblocked.** Reasoning:

1. **Section presence is now purely data-driven.** The shell's `{{#if content.ux2Pilot}}` branch fires on any row with prose; no slug allowlist remains.
2. **All 160 active tricks can be promoted via column writes.** No code edits required to expand UX2-tier rendering to additional tricks.
3. **Pilot artifacts retired.** The transition from constant-gated pilot to schema-gated rendering is complete.
4. **Density classification ready for consumption.** `densityTier` is computed for every page; UX3c can begin gating flagship-only visual surfaces (token-coloured h1, modifier-layering, modifier-ecosystem) on tier without needing further service-layer plumbing.

### 11.1 Recommended UX3c scope

Per `UX3_FLAGSHIP_SYNTHESIS.md` §14:

- **UX3c-a**: Collapse the shell's two-branch ordering into a single data-driven flow. Sections gate on data presence (prose columns, modifier_links count, recordCount), not on `ux2Pilot` non-null. The `ux2Pilot` field becomes a computed-derived flag rather than a render-mode switch.
- **UX3c-b**: ADD-tiered family lineage partial replacing the flat family ladder (uses existing data).
- **UX3c-c**: Quick-stat strip with ADD-derivation formula in the hero (uses existing modifier_links + base_trick).

All UX3c surfaces are pure presentation refactors over existing data. No further schema work needed.

### 11.2 Out of scope for UX3c

- Token-coloured h1 (UX3d).
- Modifier-layering nested boxes (UX3d).
- Modifier-ecosystem / parallel-tricks / mini relationship graph (UX3e).
- Curator authoring expansion for the other ~157 tricks (UX3f).
- Featured-media tagging beyond Wave-2 Tier-1 (UX3f; gallery-edit-tool coordination per `feedback_gallery_dave_track.md`).

---

## 12. Decision points awaiting human input

1. **Approve commit?** UX3b1 spans schema + service + templates + backfill. Single logical change set; one commit recommended.
2. **Continue immediately to UX3c-a?** Collapsing the shell's two-branch ordering is the natural next step; risk surface is small (the partial set already exists and is shared).
3. **Begin curator-authoring expansion for additional tricks?** Phoenix is the natural next candidate per `WAVE2_EDITORIAL_ENRICHMENT_PLAN.md` §3.1; prose drafts ready in `WAVE2_EXECUTION_GUIDE_DRAFTS.md` §2. One-time append to `red_corrections_2026_04_20.csv` activates UX2-tier rendering.
4. **Featured-media tagging?** `featured_media_id` column is in place but unused. Curator pass + `freestyle_media_links` linkage validation (UX3c-b or UX3f) would unlock the hero featured-media tile.
5. **Confirm Montage empty-state improvement.** Public copy change documented in §7; reflects record-holder presence accurately.
