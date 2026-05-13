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

- **MIGRATION_PLAN §9 cross-track: `legacy_person_club_affiliations` rows imported with `resolution_status='confirmed_current'` instead of `'pending'`.** Schema `database/schema.sql:3236` already has `DEFAULT 'pending'`. Loaders override it:
  - `legacy_data/scripts/load_club_members_seed.py:170` (name-matched) and `:186` (unmatched-but-mirror-id-known) hard-code `'confirmed_current'`.
  - `legacy_data/event_results/scripts/09_load_enrichment_to_sqlite.py:512` hard-codes `'confirmed_current'` in the INSERT for inferred affiliations.
  MIGRATION_PLAN §9.3 and DATA_MODEL §4.25 specify inferred mirror rows arrive as `'pending'` and transition to `'confirmed_current'` only when a member confirms current affiliation via the onboarding wizard. Fix: drop the literal value from both INSERT statements, letting the schema default apply. Confirm with an integration test that mirror-seeded affiliations are `'pending'` after `run_pipeline.sh` completes.

- **MIGRATION_PLAN §9 cross-track: Phase I bulk-loads all seed/clubs.csv rows into live `clubs` regardless of classification.** `legacy_data/run_pipeline.sh:216-224` (`run_phase_clubs_seed_load`) calls `legacy_data/scripts/load_clubs_seed.py`, which inserts every seed row with `status='active'` (lines 196-215). Phase H (`legacy_data/clubs/scripts/06_cutover_pre_populated_clubs.py`) then becomes a no-op against existing rows. MIGRATION_PLAN §9.1 target: only `pre_populate` candidates become live `clubs` rows at cutover; non-junk non-pre-populate candidates remain in `legacy_club_candidates` until promoted via the wizard or admin. Fix paths:
  1. Restrict `load_clubs_seed.py` to a dev-only mode and drop it from the production pipeline; Phase H becomes the sole creator of pre_populate live rows at cutover.
  2. Or re-order so the classifier (Phase D) and enrichment load (Phase G) run before `load_clubs_seed.py`, and change `load_clubs_seed.py` to filter by `classification='pre_populate'` before INSERT.
  Either path leaves Phase H as the canonical live-club creation step. Confirm with an integration test that on a fresh DB, only the §9.1 `pre_populate` set lands in `clubs`.

---

## Current substitute mechanisms

- **`legacy_members` population.** Mirror-derived via `legacy_data/scripts/load_legacy_members_seed.py` (2,507 rows; columns limited to PK + `display_name` + `import_source='mirror'`). Unblock: legacy-site data dump received.
- **`name_variants` table unseeded.** Every successful auto-link match is currently `confidence: 'high'` (exact normalized name). The `confidence: 'medium'` branch (name-variant-aware) produces no hits because the name_variants table has no rows yet. Unblock: ~290-pair name_variants seed from legacy data.

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

- **GLOSSARY v4 — multi-layer glossary architecture; curator triage + staging-page rollout.** GLOSSARY-SYNTHESIS-1 closed 2026-05-12 with 7-deliverable comparative-synthesis + architecture proposal at `exploration/glossary-synthesis-1/`: `GLOSSARY_COMPARISON_MATRIX.csv` (108 terms × 13 fields) + `GLOSSARY_ARCHITECTURE_V4.md` (4-layer architecture: canonical IFPA / educational PassBack / symbolic grammar / operational notation) + `GLOSSARY_SYNTHESIS_DRAFTS.md` (17 high-value best-of drafts) + `SYMBOLIC_GLOSSARY_LINKS.csv` (55 term-group links) + `GLOSSARY_GAP_ANALYSIS.md` + `GLOSSARY_RELATIONSHIP_GRAPH.csv` (102 relationships) + `DELIVERABLES_SUMMARY.md`. Generator: `legacy_data/scripts/build_glossary_synthesis_1.py`. **Top-line analytical finding:** 81% of 108 focal terms have IFPA-side gaps (40% community/PassBack-only + 29% symbolic-only + 12% educational+symbolic with no IFPA). v4 projects ~170 entries vs v2's 25 (7× growth). **Top 10 priority upgrades:** symposium / paradox / ducking / spinning / dex / pixie / whirl / butterfly / osis / clipper. **Next-step blockers:** (1) curator triage of 17 synthesized drafts (8-17 curator-hours total) — confirm Educational + Symbolic + Operational layer attribution accuracy; author or revise Canonical layer for the 12 of 17 terms with IFPA gaps; (2) approved drafts feed v4 staging (NOT yet a public surface); (3) Phase A architecture rollout — static v4 page reading from staging CSVs (~1.5 dev-days) after curator approval; (4) phases B/C/D follow per `GLOSSARY_ARCHITECTURE_V4.md` §12. **Constraints honored:** zero canonical glossary overwrites; zero PassBack auto-promotion to IFPA text; zero canonical structure removal; zero symbolic group ontology merge; zero ADD-rule changes; zero auto-alias-imports; four-layer separation preserved. Memory at [project_glossary_synthesis.md](memory).

- **SYMBOLIC-UX rollout (Path C; hybrid experimental).** SYMBOLIC-UX-1 closed 2026-05-12 with 7-deliverable UX validation at `exploration/symbolic-ux-1/` (DESIGN_OVERVIEW.md + 01_PANEL_MOCKUPS.md 8 panel types + 02_NAVIGATION_MOCKUPS.md 5 nav queries + 03_GLOSSARY_INTEGRATION.md 5 integration patterns + 04_DECOMPOSITION_EXAMPLES.md 4 worked examples + 05_PROGRESSION_CONCEPTS.md 3 progression chains + EVALUATION_AND_RECOMMENDATION.md surface-by-surface 6-axis scoring + final recommendation). **8 surfaces score ≥25 ship-ready** (top: Walking-family progression 29 / Related-tricks glossary panel 29 / Related topology tricks panel 29 / Modifier-family pages 28). Symbolic Decomposition + Cross-family Bridges + Symbolic Families panels deferred to Phase 5 (abstractness risk). **Path C — Hybrid Experimental Rollout** recommended: Phase 1 (3-4 dev-days) ship 4 top-scoring surfaces FROM CSV staging — modifier-family pages (`/freestyle/modifier/spinning` + `paradox` + `butterfly-wing`) + walking-family progression + related-topology widget on trick-detail pages + related-tricks panel on glossary entries. Phase 2 (2-3 dev-days) add 4 more surfaces. Phase 3 (4-5 dev-days) DB schema migration ONLY after 4-8 weeks public-data observation; three additive tables (`symbolic_groups` + `symbolic_group_memberships` + `glossary_relationships`); zero canonical mutation. Phase 4 (3-4 dev-days) curator workflow. Phase 5 (2-3 dev-days) advanced features. **Constraints honored:** zero DB writes Phase 1-2; zero schema migration Phase 1-2; zero canonical mutation all phases; observational layer attribution on every surface; modifier-stub rows filtered. **Next-step blockers:** (1) James approval of Path C recommendation; (2) James approval of 4 Phase-1 surfaces for build; (3) development handoff with implementation specs from SG-2 nav-prototypes + SUX-1 mockups; (4) after 4-8 weeks public exposure, evaluate Phase 3 DB migration. Memory at [project_symbolic_ux_rollout.md](memory).

- **SYMBOLIC-GRAMMAR-3 — DB schema migration + public-page rollout of educational symbolic-grammar layer.** Predecessor phases closed: SYMBOLIC-GRAMMAR-1 (679-row observational master spreadsheet); GRAMMAR-GLOSSARY-1 (5-deliverable glossary rebuild); **SYMBOLIC-GRAMMAR-2 (educational integration layer — 15 deliverables at `exploration/symbolic-grammar-2/`: 5 group-inventory CSVs + symbolic_group_membership.csv + symbolic_equivalence_clusters.csv + glossary_crosslinks.csv + symbolic_vs_ifpa_family_analysis.csv + movement_archetype_registry.csv + 5 navigation-prototype specs + design + analysis docs). Generator: `legacy_data/scripts/build_symbolic_grammar_2.py`**. SG-2 confirmed 11 perfectly-coherent multi-member IFPA families (whirl 17 / butterfly 12 / mirage 11 / torque 8 / osis 7 / pickup 5 / barfly 4 / blender 4 / drifter 4 / atw 3 / illusion 3 — covering 55% of non-stub tricks); IFPA family naming aligns with symbolic topology at multi-member scale. SG-3 work requires: (1) curator triage of SG-2 staging CSVs (2-4 hours) — confirm groups + drop low-confidence memberships + flag clipper-stall topology-group anomaly; (2) Path A — DB schema migration: additive `symbolic_groups` + `symbolic_group_memberships` + `glossary_crosslinks` tables + loader script (transaction-wrapped per `db-write-safety.md`); OR Path B — public-page incremental rollout reading directly from staging CSVs (modifier-family pages / related-topology widget / extended decomposition section per the 5 nav-prototype specs). Constraints carry forward: no IFPA dictionary mutation; no alias inserts without `PASSBACK_ALIAS_CANDIDATES.csv` queue passage; no ADD-value changes (FM-IFPA disagreements log to `FM_MATH_DIVERGENCES.csv`); four-layer separation forever-rule (parser / editorial / operational / observational-symbolic) preserved.

- **Mirror-local MP4 trick snippets, separate ingestion path needed.** Slice 2 sidecar migration only handles YouTube/Vimeo URL-reference media. The sidecar schema and curator seeder both reject other `videoPlatform` values; non-embed URLs already go to `legacy_data/inputs/curated/media/footbagspot_pending_rehost.csv`. The legacy mirror under `legacy_data/mirror_footbag_org/` may contain local MP4 trick snippets that the Slice 2 surface cannot ingest as-is. Do not force them into the YouTube/Vimeo sidecar model. A future design needs to decide which path mirror MP4s take:
  1. file-backed curator `media_items` (parallel to existing demo loops in `CURATOR_ITEMS`, re-encoded through the seeder's ffmpeg pipeline, stored in the media adapter's local-FS / S3 backend, indexed via `video_platform='s3'`);
  2. upload-managed `media_items` via the slice 4 admin curator UI (admin uploads each MP4; same shape as #1 but operator-driven);
  3. staging candidates for re-hosting on YouTube/Vimeo (then re-ingest as URL-reference sidecars; matches the `footbagspot_pending_rehost.csv` pattern from Phase B);
  4. a separate snippet-discovery pipeline (extract from mirror into `tools/trick_video_discovery/snippet_candidates.csv` for reviewer triage before promotion).
  Out of scope for slice 2; flagged here so the gap doesn't get lost when the legacy `freestyle_media_*` tables are removed in Phase E.
