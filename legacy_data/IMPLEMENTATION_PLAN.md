# legacy_data/IMPLEMENTATION_PLAN.md

Historical-pipeline maintainer's track. Pipeline architecture, loader invariants, and MIGRATION_PLAN routing live in `legacy_data/CLAUDE.md`. This file tracks active work, current substitute mechanisms, external blockers, and release-readiness criteria only.

---

## Active work

- **Curator media unification, slice 2 cleanup (Phase E destructive cleanup).** Phases A through D shipped. Residual tasks tracked in root `IMPLEMENTATION_PLAN.md` §"Active slice now"; cross-track entries here for visibility:
  1. Drop `freestyle_media_*` table definitions from `database/schema.sql`.
  2. Delete legacy loaders 21 / 22 / 23 (the `freestyle_media_*` loaders, not script `21_load_footbag_org_pending_tricks.py` or `22_qc_trick_dictionary.py`).
  3. Delete `legacy_data/inputs/curated/media/*.csv`.
  4. Delete `scripts/migrate-freestyle-media-to-curated.py`.
  5. Edit `scripts/reset-local-db.sh` (David-owned; needs approval).
  6. Run oEmbed `verifyExternalVideoUrl` over `curated/freestyle_tricks/` sidecars before deleting `media_assets.csv`.
  7. **HANDS OFF the canonical sidecars in `curated/freestyle_tricks/`.** The 40 TT-lesson `*.meta.json` files (`sourceId='tt_youtube'`) were hand-canonicalized on 2026-05-06: `title` rewritten to `NN - <lesson_title>` form (zero-padded lesson number), `#tricks_of_the_trade` appended to `tags`. The Tricks-of-the-Trade named gallery depends on both invariants (caption_asc sort + tag-AND membership). Any tool that regenerates these sidecars (`scripts/migrate-freestyle-media-to-curated.py`, `scripts/promote_snippet_candidates.py`, or any future variant) MUST preserve the canonical title format and the `#tricks_of_the_trade` tag, or the gallery breaks silently and the next dev re-seed (or staging cutover) wipes the canonical state. Path forward: eliminate the staging-CSV pipeline (`curated/freestyle_media/video_snippet_candidates.csv` and similar) by moving the promotion path into the admin curator UX, then delete the legacy sidecar regenerators. Until that's done, do not re-run any sidecar-producing tool without first verifying it produces canonical titles + tags against `curated/freestyle_media/tt_roster.csv`.

- **Red Husted dictionary review, ongoing.** pt1 through pt6 integrated. pt7 / pt8 question batches drafted and waiting to send. Open questions span: pattern-level modifier resolution (Shooting / Inside / Rooted / Symp / Spinning prefixes), pt6 ADD-confirmation backlog (cloud / squeeze / head / peak / shoulder stall, avalanche, scrambled eggbeater, voodoo), bullwhip / nemesis / gauntlet base tricks, terraging / illusioning ADD contributions, surging set/compound flip authorization, PassBack vocabulary triage (53 set names yes/no), bedwetter ADD + structure. Memory entry `project_passback_open_questions.md` carries the 8 PassBack-side questions; pt8 draft consolidates these with tier-3 backlog.

- **PassBack intake lane outputs, awaiting Red triage.** Staging CSVs at `curated/freestyle_media/video_term_inventory.csv`, `curated/freestyle_media/video_snippet_candidates.csv`, `curated/freestyle_sets/set_candidates.csv`, `curated/freestyle_tricks/trick_alias_candidates.csv`. Generator: `legacy_data/tools/build_passback_intake.py`. Promotion to dictionary blocked on Red answers.

---

## Current substitute mechanisms

- **`legacy_members` population.** Mirror-derived via `legacy_data/scripts/load_legacy_members_seed.py` (2,507 rows; columns limited to PK + `display_name` + `import_source='mirror'`). Unblock: legacy-site data dump received.

---

## External blockers

- **Legacy-site data dump (legacy-site webmaster coordination).** Final source for `legacy_members`; supplies `real_name`, `legacy_email`, `legacy_user_id`, `country`, `city`, `region`, `bio`, `birth_date`, `ifpa_join_date`, `first_competition_year`, `is_hof`, `is_bap`, `legacy_is_admin`, and flips `import_source` to `'legacy_site_data'`. Open coordination: namespace agreement (export IDs and mirror-derived IDs must share the same `legacy_member_id` namespace); MIGRATION_PLAN §2 + §8 platform-side rewrites depend on the final dump structure; `tests/fixtures/factories.ts` may need extensions for the richer fields.
- **Freestyle rules content (IFPA).** Wording for Routine, Circle, Sick 3, Shred 30. Re-enables the "Rules" buttons dropped from `/freestyle` competition-format cards.
- **Freestyle trick dictionary expansion.** Gated on Red Husted second-pass corrections (pt7 / pt8 round outstanding).
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

- **Smoke test for loader idempotency on non-empty DBs.** Add an automated smoke test that runs each loader twice in sequence against the same DB and asserts no exceptions and identical row counts. Surfaces fresh-DB-only assumptions in any future loader. Forward invariant: all loaders must be safe on non-empty DBs (no reliance on external DB reset).

- **Rebuild orchestration gap in `scripts/reset-local-db.sh` (owner approval required).** `event_results/scripts/20_link_footbag_org_sources.py` consumes `legacy_data/out/scraped_footbag_moves.csv`, produced by `legacy_data/event_results/scripts/18_scrape_footbag_org_moves.py`. `scripts/reset-local-db.sh` runs step 20 but never step 18; on a fresh `out/` the rebuild crashes with `FileNotFoundError` (observed 2026-04-27 on a staging deploy; operator manually ran step 18 to unblock). `legacy_data/out/` is gitignored, so the file is operator-supplied; a fresh-clone operator must run step 18 manually before `reset-local-db.sh` succeeds. Documented risk; not part of this track's active work. `scripts/reset-local-db.sh` is owned by David, and any change requires owner approval. The fail-fast / producer-before-consumer pattern that landed in `run_pipeline.sh` (early preflight + marker-file mirror check) is the obvious model if the work reopens; companion follow-up would be a rebuild smoke test that starts from a clean `out/` and asserts every `out/*` consumer's producer ran earlier.

- **FK-off bulk reseed investigation.** `event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py:131` disables FK enforcement with `PRAGMA foreign_keys = OFF` during bulk delete-and-reload (re-enabled at line 534); only migration script that does so. Determine whether load order can be reordered or cascade-delete applied to preserve FK-on; if operationally necessary, add an explanatory comment at the deviation site.
- **`score_text` pass-through from legacy HTML.** Schema field exists (`event_result_entries.score_text`); pipeline drops it. Worth extracting: consecutives kick counts (e.g. `(826)`) and Sick 3 / routine trick descriptors. Skip generic point totals, judge scores, net rankings.
- **Workbook automated parity QC.** Lightweight check that `canonical/events.csv` row count == workbook EVENT INDEX row count == year-sheet event union. Today verified by hand against the release-readiness checklist.
- **Override visibility.** `results_file_overrides.csv` and `events_overrides.jsonl` are applied silently. Surface via an `is_overridden` boolean on canonical output or a Data Notes sheet in the workbook.
- **Canonical vs canonical_all unification.** Long-term: merge post-1997 + pre-1997 into a single `canonical` and retire `canonical_all`. Simplifies reasoning about the dataset.
- **Version stamps in outputs.** Add `build_version`, `build_date`, `identity_lock_version` to workbook and canonical CSVs. Eases diffing across builds.
- **DATA NOTES sheet in workbook.** Document excluded events (sparse), sources used, and the meaning of "unknown" in placement columns.
- **Top-level pipeline ergonomics, post-flag-parity follow-up.** Post-flag-parity rollout, `run_dev.sh` and `deploy_to_aws.sh` share `--from-csv` / `--soup-to-nuts` at the top level; both delegate to `scripts/deploy-local-data.sh`. Two fast-path entries still coexist for the no-enrichment case: `scripts/reset-local-db.sh` (used by `run_dev.sh` default) and `scripts/deploy-local-data.sh --db-only`. Follow-up: collapse to a single fast-path or document the intentional difference. Adjacent: `EXPANDED_ARGS` short-flag-expansion is duplicated between `deploy_to_aws.sh` (preflight mode classification) and `scripts/deploy-to-aws.sh` (dispatch); a shared helper would deduplicate.

- **Dictionary data debt — three rows blocked from SCALE pilot promotion (surfaced by SCALE-11 verification, 2026-05-12).** Per-row verification before SCALE-11 prose drafting found three rows whose canonical decomposition is unresolved or inconsistent in the dictionary data; promoting them to pilot would require prose that navigates the unresolved state. Reconciliation needed before they re-enter a SCALE batch:
  1. **fusion** (5-ADD, `base_trick='dod'`). The `dod` slug does not exist as an active row in `freestyle_tricks`. Either add a `dod` (double-over-down) row with appropriate ADD and atomic-bonus accounting (atomic+1 non-rot + dod(?) = 5), or reclassify fusion's `base_trick` to an existing pilot row.
  2. **omelette** (3-ADD, `base_trick='pickup'`, modifier=`illusioning`). The `illusioning` dictionary entry says "Body modifier underlying omelette. ADD contribution is an open question." Math: illusioning(?) + pickup(2) = 3 → illusioning needs +1. Resolution requires either adding `illusioning` to `freestyle_trick_modifiers` with a documented add_bonus, or adding omelette to the §3.2 policy class (stated ADD without stated structure).
  3. **flurry** (4-ADD, `base_trick='legover'`, alias='barraging legover'). The `barraging` modifier-table entry's worked example explicitly states "barraging legover = flurry = 3 (legover 2 + 1)", but `freestyle_tricks.adds=4` for flurry. Either correct the modifier-table worked example (`freestyle_trick_modifiers.notes` for `barraging`) to match flurry's asserted=4 reading, or add flurry to the §3.2 policy class with row-specific math closure, or reconcile flurry's asserted ADD to 3.
  All three rows remain SCALE-eligible once their data inconsistencies are resolved. The verification-before-build rule (new from SCALE-11) requires future SCALE batches to per-row-verify: (i) base_trick row exists as active, (ii) all named modifiers have resolved ADD bonuses, (iii) asserted ADD agrees with modifier+base arithmetic OR row is in the published §3.2 policy class.

- **SYMBOLIC-GRAMMAR-2 — observational-symbolic ↔ IFPA-canonical correlation execution.** SYMBOLIC-GRAMMAR-1 closed 2026-05-12 with 679-row master observational layer (FM + PassBack) at `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_*`. The §10 "Later IFPA correlation plan" placeholder in `SYMBOLIC_GRAMMAR_ANALYSIS.md` outlines five correlation axes (symbolic_family ↔ trick_family; operator-tags ↔ modifier_links; FM alternate_names ↔ trick_aliases; source_adds ↔ IFPA adds; topology_family ↔ UX3 filters). Not executed in SYMBOLIC-GRAMMAR-1 per task brief. Constraints carry forward when reopened: no IFPA dictionary mutation; no alias inserts without `PASSBACK_ALIAS_CANDIDATES.csv` queue passage; no ADD-value changes (FM-IFPA disagreements log to `FM_MATH_DIVERGENCES.csv`); four-layer separation forever-rule (parser / editorial / operational / observational-symbolic) preserved.

- **Mirror-local MP4 trick snippets, separate ingestion path needed.** Slice 2 sidecar migration only handles YouTube/Vimeo URL-reference media. The sidecar schema and curator seeder both reject other `videoPlatform` values; non-embed URLs already go to `legacy_data/inputs/curated/media/footbagspot_pending_rehost.csv`. The legacy mirror under `legacy_data/mirror_footbag_org/` may contain local MP4 trick snippets that the Slice 2 surface cannot ingest as-is. Do not force them into the YouTube/Vimeo sidecar model. A future design needs to decide which path mirror MP4s take:
  1. file-backed curator `media_items` (parallel to existing demo loops in `CURATOR_ITEMS`, re-encoded through the seeder's ffmpeg pipeline, stored in the media adapter's local-FS / S3 backend, indexed via `video_platform='s3'`);
  2. upload-managed `media_items` via the slice 4 admin curator UI (admin uploads each MP4; same shape as #1 but operator-driven);
  3. staging candidates for re-hosting on YouTube/Vimeo (then re-ingest as URL-reference sidecars; matches the `footbagspot_pending_rehost.csv` pattern from Phase B);
  4. a separate snippet-discovery pipeline (extract from mirror into `tools/trick_video_discovery/snippet_candidates.csv` for reviewer triage before promotion).
  Out of scope for slice 2; flagged here so the gap doesn't get lost when the legacy `freestyle_media_*` tables are removed in Phase E.
