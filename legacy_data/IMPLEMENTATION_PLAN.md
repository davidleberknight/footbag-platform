# legacy_data/IMPLEMENTATION_PLAN.md

Historical-pipeline maintainer's track. Pipeline architecture, loader invariants, and MIGRATION_PLAN routing live in `legacy_data/CLAUDE.md`. This file tracks active work, current substitute mechanisms, external blockers, and release-readiness criteria only.

---

## Active work

- **Cross-track schema unification: `freestyle_media_*` → `media_items` family (slice 2, James owns end to end).** Read `CURATED_MEDIA_PLAN.md` top to bottom; full task list in §"Items for James".

  **Priority: ASAP -- complete this slice as soon as possible.** Slice 3 (Dave-owned) is fully blocked on it. Progress check 2026-05-03: none of the seven tasks below have started -- legacy `freestyle_media_*` triad still in `database/schema.sql`, `media_items` lacks `source_id` / `start_seconds` / `end_seconds`, migration script absent, loaders 21/22/23 still wired into `scripts/reset-local-db.sh`.

  Concrete tasks:
  1. Schema rewrite in `database/schema.sql`: drop `freestyle_media_*`, add `media_sources` (renamed from `freestyle_media_sources`, identical columns), extend `media_items` with `source_id` / `start_seconds` / `end_seconds`.
  2. Author + run `scripts/migrate-freestyle-media-to-curated.ts` (or `.py`) to convert `legacy_data/inputs/curated/media/*.csv` into `/curated/freestyle_tricks/*.meta.json` sidecars; apply trick-alias canonicalization; surface 5 footbagspot.com skip rows in a warning summary.
  3. Decide on the 5 footbagspot.com skip rows (re-host on YouTube/Vimeo, or drop). Decision is yours.
  4. Extend the curator seeder for the `freestyle_tricks/` category, applying trick-alias canonicalization at write time.
  5. Delete loaders 21/22/23, the legacy curated-media CSVs at `legacy_data/inputs/curated/media/*.csv`, and the migration script (one-time job).
  6. Edit `scripts/reset-local-db.sh` to drop the three loader entries.
  7. Retarget `pipeline/qc/check_media_coverage.py` and `pipeline/qc/check_snippet_candidates.py` per the column mapping in CMP.
  8. **Apply the "Verify external URLs" rule (legacy_data/CLAUDE.md) to `legacy_data/inputs/curated/media/media_assets.csv`, using oEmbed per DD §6.8.** The original migration asserted only platform-pattern match (youtube/vimeo), not availability. Two confirmed dead URLs surfaced via this gap: `https://vimeo.com/25019188` (page-URL HTTP 404, found 2026-05-04, sidecar `curated/freestyle_tricks/ducking-osis_f5ed2fb5.meta.json` deleted same day, corpus 95 → 94); and YouTube `Dmr7zj_c7cY` ("Passback record by David Clavens", thumbnail `i.ytimg.com/vi/Dmr7zj_c7cY/hqdefault.jpg` returns 404 while the page URL still serves 200, found 2026-05-05). A page-URL HEAD check would have missed the YouTube case; oEmbed catches both classes because YouTube and Vimeo both return non-200 from oEmbed for removed, private, or unavailable videos. Use `verifyExternalVideoUrl` from `src/lib/videoUrlVerifier.ts` (the shared oEmbed util used by the admin URL-reference upload path and by this migration script); drop or rehost any non-200; re-run `scripts/migrate-freestyle-media-to-curated.py`; recommit `/curated/freestyle_tricks/`. Then extend the migration script with a fail-fast oEmbed check (importing the same util) so future re-runs cannot regenerate dead links. The admin act-as URL-reference upload path uses the same util to reject dead URLs at form submit time.

  Commit directly to `main`; no branches, no separate PR, no coordination required. Order is yours; complete the list before Dave starts slice 3.

---

## Current substitute mechanisms

- **`legacy_members` population.** Mirror-derived via `legacy_data/scripts/load_legacy_members_seed.py` (2,507 rows; columns limited to PK + `display_name` + `import_source='mirror'`). Unblock: legacy-site data dump received.

---

## External blockers

- **Legacy-site data dump (legacy-site webmaster coordination).** Final source for `legacy_members`; supplies `real_name`, `legacy_email`, `legacy_user_id`, `country`, `city`, `region`, `bio`, `birth_date`, `ifpa_join_date`, `first_competition_year`, `is_hof`, `is_bap`, `legacy_is_admin`, and flips `import_source` to `'legacy_site_data'`. Open coordination: namespace agreement (export IDs and mirror-derived IDs must share the same `legacy_member_id` namespace); MIGRATION_PLAN §2 + §8 platform-side rewrites depend on the final dump structure; `tests/fixtures/factories.ts` may need extensions for the richer fields.
- **Freestyle rules content (IFPA).** Wording for Routine, Circle, Sick 3, Shred 30. Re-enables the "Rules" buttons dropped from `/freestyle` competition-format cards.
- **Freestyle trick dictionary expansion.** Gated on Red Husted second-pass corrections.
- **Data review sign-off.** Confirmation that legacy data is complete and member-list presentation is reviewed. Required before removing the `requireAuth` gate from member-list pages.

---

## Release-readiness criteria

### Data integrity
- [ ] QC STATUS: PASS (0 hard failures from `qc/qc_master.py`)
- [ ] No unexpected row count drops vs previous identity lock version
- [ ] No new NULL `person_id` spikes in participants

### Workbook
- [ ] INDEX event count == `canonical/events.csv` row count
- [ ] No empty year sheets
- [ ] Worlds events correctly labeled (`event_type = worlds`)

### Identity
- [ ] No duplicate `person_canon` values in persons truth
- [ ] No alias leakage into `persons.csv`

### Platform DB
- [ ] Event count in DB matches canonical events CSV
- [ ] Sample event pages load correctly
- [ ] Player pages resolve (no orphan historical person IDs)

---

## Unblocks

- Auto-link coverage for club-only members: gated on `legacy_email` (blocked on legacy-site data dump). `legacy_user_id` and `legacy_member_id` already in canonical persons.
- Legacy account claim at registration: gated on `legacy_email` for full three-key coverage (blocked on legacy-site data dump). `legacy_member_id` and `legacy_user_id` already in canonical persons.

---

## Deferred / parked work (non-blocking)

Kept for visibility only; not part of active work or release gating. No current substitute mechanism, no unblock dependency, no release-readiness impact. Promote to Active work only if scope or priority changes.

- **Smoke test for loader idempotency on non-empty DBs.** Both fixes below landed 2026-05-01 and were verified by running script 17 twice in sequence against a populated DB (no FK violation, identical end-state after re-running 19/20/21). Companion follow-up: add an automated smoke test that runs each loader twice in sequence against the same DB and asserts no exceptions and identical row counts. Surfaces fresh-DB-only assumptions in any future loader. Forward invariant: all loaders must be safe on non-empty DBs (no reliance on external DB reset).

  Fixed defects (resolved 2026-05-01):
  1. **Off-by-one REPO_ROOT** in scripts `17_load_trick_dictionary.py`, `18_scrape_footbag_org_moves.py`, `19_load_red_additions.py`, `20_link_footbag_org_sources.py` (commit `bbc3dd7f`, 2026-04-11). `SCRIPT_DIR.parents[3]` resolved to one level above repo root, breaking default `--db`. Standardized to `parents[2]` matching scripts 21/22/23. Note: `07_build_mvfp_seed_full.py:175` uses `Path(__file__).resolve().parents[3]` (from file, not from `.parent`), which correctly resolves to repo root and was NOT affected.
  2. **Parent-table DELETE before child-table cleanup in `17_load_trick_dictionary.py`.** Wholesale `DELETE FROM freestyle_tricks` ran before child DELETEs of `freestyle_trick_aliases` / `freestyle_trick_source_links` / `freestyle_trick_modifier_links` / `freestyle_trick_relations` (no `ON DELETE CASCADE` on those FKs). Fixed by adding wholesale child-table DELETEs at the start of `load()` before the existing parent wipes, matching the script's existing wholesale-reload semantic. Pattern parallel: `21_load_footbag_org_pending_tricks.py:159–178` does children-first scoped DELETEs.

- **Rebuild orchestration gap in `scripts/reset-local-db.sh` (owner approval required).** `event_results/scripts/20_link_footbag_org_sources.py` consumes `legacy_data/out/scraped_footbag_moves.csv`, produced by `legacy_data/event_results/scripts/18_scrape_footbag_org_moves.py`. `scripts/reset-local-db.sh` runs step 20 but never step 18; on a fresh `out/` the rebuild crashes with `FileNotFoundError` (observed 2026-04-27 on a staging deploy; operator manually ran step 18 to unblock). `legacy_data/out/` is gitignored, so the file is operator-supplied; a fresh-clone operator must run step 18 manually before `reset-local-db.sh` succeeds. Documented risk; not part of this track's active work. `scripts/reset-local-db.sh` is owned by David, and any change requires owner approval. The fail-fast / producer-before-consumer pattern that landed in `run_pipeline.sh` (early preflight + marker-file mirror check) is the obvious model if the work reopens; companion follow-up would be a rebuild smoke test that starts from a clean `out/` and asserts every `out/*` consumer's producer ran earlier.

- **FK-off bulk reseed investigation.** `event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py:131` disables FK enforcement with `PRAGMA foreign_keys = OFF` during bulk delete-and-reload (re-enabled at line 534); only migration script that does so. Determine whether load order can be reordered or cascade-delete applied to preserve FK-on; if operationally necessary, add an explanatory comment at the deviation site.
- **`score_text` pass-through from legacy HTML.** Schema field exists (`event_result_entries.score_text`); pipeline drops it. Worth extracting: consecutives kick counts (e.g. `(826)`) and Sick 3 / routine trick descriptors. Skip generic point totals, judge scores, net rankings.
- **Workbook automated parity QC.** Lightweight check that `canonical/events.csv` row count == workbook EVENT INDEX row count == year-sheet event union. Today verified by hand against the release-readiness checklist.
- **Override visibility.** `results_file_overrides.csv` and `events_overrides.jsonl` are applied silently. Surface via an `is_overridden` boolean on canonical output or a Data Notes sheet in the workbook.
- **Canonical vs canonical_all unification.** Long-term: merge post-1997 + pre-1997 into a single `canonical` and retire `canonical_all`. Simplifies reasoning about the dataset.
- **Version stamps in outputs.** Add `build_version`, `build_date`, `identity_lock_version` to workbook and canonical CSVs. Eases diffing across builds.
- **DATA NOTES sheet in workbook.** Document excluded events (sparse), sources used, and the meaning of "unknown" in placement columns.

- **Mirror-local MP4 trick snippets — separate ingestion path needed.** Slice 2 sidecar migration (`scripts/migrate-freestyle-media-to-curated.py`, completed 2026-05-03) only handles YouTube/Vimeo URL-reference media. The sidecar schema and curator seeder both reject other `videoPlatform` values; non-embed URLs already go to `legacy_data/inputs/curated/media/footbagspot_pending_rehost.csv`. The legacy mirror under `legacy_data/mirror_footbag_org/` may contain local MP4 trick snippets that the Slice 2 surface cannot ingest as-is. Do not force them into the YouTube/Vimeo sidecar model. A future design needs to decide which path mirror MP4s take:
  1. file-backed curator `media_items` (parallel to existing demo loops in `CURATOR_ITEMS` — re-encoded through the seeder's ffmpeg pipeline, stored in the media adapter's local-FS / S3 backend, indexed via `video_platform='s3'`);
  2. upload-managed `media_items` via the Slice 4 admin curator UI (admin uploads each MP4; same shape as #1 but operator-driven);
  3. staging candidates for re-hosting on YouTube/Vimeo (then re-ingest as URL-reference sidecars; matches the `footbagspot_pending_rehost.csv` pattern from Phase B);
  4. a separate snippet-discovery pipeline (extract from mirror into `tools/trick_video_discovery/snippet_candidates.csv` for reviewer triage before promotion).
  Out of scope for Slice 2; flagged here so the gap doesn't get lost when the legacy `freestyle_media_*` tables are removed in Phase E.

- **Tu Vu identity collapsed into Tuan Vu in canonical persons.csv. Root cause: identity-lock alt_alias curation error.** bigaddposse.com lists two distinct BAP members: "Tuan Vu" (1995, Disco Ninja) and "Tu Vu" (1997, Huge). `inputs/bap_data_updated.csv` has both as separate rows. Both also exist as distinct rows in `inputs/identity_lock/Persons_Truth_Final.csv`: Tuan Vu at `28565dd0-2196-5404-bf23-6cf0617ce79b`, Tu Vu at `c50fb80d-aa35-5154-be01-19817c3b84d2` (with main_aliases `Tu Vu | Tu Huge`). The merge is caused by Tuan Vu's `alt_aliases` column listing `Tu Vu` (alongside legitimate aliases `T Vu | T. Vu | Tuan DiscoNinja Vu | Tuan Vu*`). AliasResolver therefore funnels every "Tu Vu" event participation into `28565dd0-…`, leaving Tu Vu with zero events in canonical. Net effect: `out/canonical/persons.csv` row `28565dd0-…` carries Tu Vu's attributes — BAP `nickname=Huge, induction_year=1997`, HoF `induction_year=2007`, 97 events spanning 1985–2025 across two distinct careers (~50 Freestyle 1985–2005 with Eric Wulff / Greg Nelson = Tuan Vu / Disco Ninja; ~130 Net 2007–2025 with Kenny Shults / Carlos Marquez / Emmanuel Bouchard / Tuomas Karki = Tu Vu / Huge).

  The override `overrides/person_aliases.csv` has three related lines that compound the merge: line 2374 (`Tu Vu,28565dd0-…,Tuan Vu,verified`) is definitively wrong; lines 2262 (`T Vu,28565dd0-…,Tuan Vu`) and 2264 (`T. Vu,28565dd0-…,Tuan Vu`) are ambiguous (both abbreviations could belong to either person, needs placement-evidence review). Override fixes alone will not split canonical because AliasResolver reads identity-lock authoritatively.

  Remediation steps:
  1. Edit `legacy_data/overrides/person_aliases.csv` (sed -i per project rule, wc -l before/after = 2762): replace line 2374 → `Tu Vu,c50fb80d-aa35-5154-be01-19817c3b84d2,Tu Vu,verified,`. Review lines 2262 / 2264 against `Placements_ByPerson.csv` to determine whether `T Vu` / `T. Vu` belong to Tuan or Tu and update accordingly.
  2. Author `legacy_data/tools/patch_pt_v63_split_tuan_tu_vu.py` to remove `Tu Vu` from Tuan Vu's `alt_aliases` column in `Persons_Truth_Final.csv`.
  3. Author `patch_placements_v104_split_tuan_tu_vu.py` to reassign placements currently under `28565dd0-…` that belong to Tu Vu (Net career, ~130 events 2007–2025) → `c50fb80d-…`. Tuan Vu retains the Freestyle career (~50 events 1985–2005).
  4. Verify HoF 2007 attribution. The merged row carries `fbhof_member=1, fbhof_induction_year=2007`; reassign to whichever person was actually inducted (cross-reference IFPA HoF records).
  5. Rerun `run_pipeline.sh`; expected outcome is two distinct rows in `out/canonical/persons.csv` with their respective BAP nicknames (Disco Ninja / Huge), induction years (1995 / 1997), HoF attribution, and event participation correctly partitioned.
  Surfaces on `/history/28565dd0-…` profile (currently renders `Tuan Vu "Huge"` with BAP 1997 / HoF 2007 hero and 97 mixed events spanning two distinct careers). The freestyle pioneers editorial Tuan Vu entry (`src/content/freestyleEditorial.ts` HISTORY_PIONEERS) links to that UUID and inherits the wrong-merged display until canonical resolves.
