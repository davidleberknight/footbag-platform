# legacy_data/IMPLEMENTATION_PLAN.md

Historical-pipeline maintainer's track. Pipeline architecture, loader invariants, and MIGRATION_PLAN routing live in `legacy_data/CLAUDE.md`. This file is ACTIVE-only — shipped work is deleted (IP-is-AI-facing rule); closed-exploration state lives in memory entries and `exploration/_archive/`.

---

## ACTIVE NOW

- **Curator media unification, slice 2 cleanup (Phase E destructive cleanup).** Phases A through D shipped. Residual tasks:
  1. Drop `freestyle_media_*` table definitions from `database/schema.sql`.
  2. Delete legacy loaders 21 / 22 / 23 (the `freestyle_media_*` loaders only; not `21_load_footbag_org_pending_tricks.py` or `22_qc_trick_dictionary.py`).
  3. Delete `legacy_data/inputs/curated/media/*.csv`.
  4. Delete `scripts/migrate-freestyle-media-to-curated.py`.
  5. Edit `scripts/reset-local-db.sh` (David-owned; needs approval).
  6. Run oEmbed `verifyExternalVideoUrl` over `curated/freestyle_tricks/` sidecars before deleting `media_assets.csv`.

  TT canonical-sidecar invariant: see `legacy_data/CLAUDE.md`.

- **MIGRATION_PLAN §9 cross-track: Phase H cutover hardening.** Locked: loaders default to `'pending'` (4ca0909); Phase H is sole creator of live `clubs` at cutover in prod (3cc3a97); Phase G no longer writes `mapped_club_id` (Phase H owns the linkage); Phase H stamps `mapped_club_id` for every candidate with matching clubs row, not just `bootstrap_eligible=1`. Remaining gaps land as one PR:
  1. **Phase H fail-fast on missing seed-CSV eligible candidates.** `06_cutover_pre_populated_clubs.py` around line 273 prints WARN and continues when eligible candidates are absent from `legacy_data/seed/clubs.csv`. Change to ERROR + `sys.exit(1)`. The silent path leaves `mapped_club_id` NULL and the downstream `07_load_bootstrap_leaders.py` FK-fails with no useful upstream message.
  2. **Phase H fail-fast on zero candidates after enrichment.** Same file, around line 158. Returns 0 silently when `all_candidates` is empty (masks a missing Phase G run or classifier regression). Change to ERROR + `sys.exit(1)`.
  3. **Schema CHECK: `resolved_club_id NOT NULL` when `resolution_status='confirmed_current'`.** Add `CHECK (resolution_status <> 'confirmed_current' OR resolved_club_id IS NOT NULL)` on `legacy_person_club_affiliations` in `database/schema.sql`. Locks the contract the wizard must satisfy.
  4. **Idempotency claim on `load_club_members_seed.py`.** Lines 170 and 186 use bare INSERT but the docstring claims idempotency. Add `OR IGNORE` or amend the docstring to "Phase I one-shot, not re-runnable".
  Tests in the same PR: (a) `legacy_data/tests/test_resolution_status_default.py` extension that simulates wizard `pending → confirmed_current` UPDATE and asserts `resolved_club_id` lands; (b) full-pipeline integration test (Phase G + Phase H against a fresh DB; assert live `clubs` row count matches bootstrap_eligible count; assert stamped `mapped_club_id` count matches the intersection of candidates and clubs rows).

- **MIGRATION_PLAN §9 cross-track: HP linkage broken for membership-only / club-only persons (ID generator drift).** `legacy_data/clubs/scripts/01_build_club_person_universe.py:31` generates `f"membership_only::{sha1(name_norm)[:16]}"` for membership-only persons. `legacy_data/persons/scripts/05_build_persons_master.py:49` generates `sha1(f"master|{source_types}|{name_norm}")[:16]` for the same person. Both flow downstream: the first becomes `legacy_person_club_affiliations.matched_person_id`; the second becomes `historical_persons.person_id` for PROVISIONAL rows. `09_load_enrichment_to_sqlite.py:519–523` (`affiliations_pid_fallback` counter) silently NULLs `historical_person_id` when the IDs don't agree. Symptom: club detail pages show member names but never link to `/history/{personId}` for non-canonical persons. Investigate the right fix (likely: align `01_build_club_person_universe.py` to use the master_person_id from `persons_master.csv` via a join, or introduce a translation table; do NOT change `historical_persons.person_id` after-the-fact because canonical rows already key off it). Validate by spot-checking Wellington Hack Crew (5 members, `linkable_member_count=4`, currently 0 HP links rendered).

---

## BLOCKERS

- **Legacy-site data dump (legacy-site webmaster coordination).** Final source for `legacy_members`; supplies `real_name`, `legacy_email`, `legacy_user_id`, `country`, `city`, `region`, `bio`, `birth_date`, `ifpa_join_date`, `first_competition_year`, `is_hof`, `is_bap`, `legacy_is_admin`. Open: namespace agreement (export IDs share `legacy_member_id` namespace); MIGRATION_PLAN §2 + §8 platform rewrites depend on final dump structure; `tests/fixtures/factories.ts` may need extensions.
  - Current substitute: `legacy_data/scripts/load_legacy_members_seed.py` (2,507 rows; PK + `display_name` + `import_source='mirror'`).
  - Gates: auto-link coverage for club-only members; legacy-account-claim at registration (both on `legacy_email`); name_variants seeding (currently 0 rows → `confidence: 'medium'` branch produces no hits); removal of `requireAuth` from member-list pages.
- **Freestyle rules content (IFPA).** Wording for Routine, Circle, Sick 3, Shred 30. Re-enables the "Rules" buttons dropped from `/freestyle` competition-format cards.
- **Red Husted Wave 2 reply.** Wave 2 packet SENT 2026-05-15 — six grammar-level questions covering blurry transitivity, barraging operator class, atomic family X-dex scope, operator-vs-trick boundary + Fairy weight, compression intent, hidden-vs-flat preservation. Freestyle trick dictionary expansion + PassBack intake promotion both gated. See `project_red_consultation_state`.
- **Data review sign-off.** Confirmation that legacy data is complete and member-list presentation is reviewed. Required before removing `requireAuth` from member-list pages.
- **Onboarding wizard club-affiliations step (Dave-owned).** Sole intended writer that transitions affiliations out of `'pending'` (loader contract 4ca0909). On `confirmed_current` against an `onboarding_visible` candidate, the wizard must promote via a new `ClubService.promoteFromCandidate(candidateId, actorMemberId)` helper that mirrors Phase H invariants (create `clubs` row + stamp `mapped_club_id` + insert `member_club_affiliations` with `source='legacy_claim'`). Wire shape detailed in DATA_MODEL §4.25 + MIGRATION_PLAN §9.3.
- **Admin cleanup queue `A_Review_Club_Cleanup_Signals` (Dave-owned).** Planned reviewer surface for wizard-emitted flags + member-flagged outdated clubs + auto-merge holds. No current substitute; without it, admin-side cleanup signals have no UI. Independent of the dev-time classifier QC panel (see RESEARCH / TEMP-DEVIATION sweep); the two serve different audiences.

### Known deviations

- **Loosened read filter on `legacy_person_club_affiliations.resolution_status`.** `src/db/db.ts` `listMembersByClubId` and `listMemberCountsForAllClubs` accept `'pending'` so loader-imported affiliations render as members on `/clubs/:key`. Substitutes for the wizard's `pending → confirmed_current` transition (onboarding-wizard blocker above). Reverts to `IN ('confirmed_current','promoted')` when the wizard ships.

---

## RELEASE GATES

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

### Club cleanup pipeline
- [ ] Phase G + Phase H integration test asserts: live `clubs` row count equals bootstrap_eligible candidate count; stamped `mapped_club_id` count equals intersection of candidates and clubs rows
- [ ] `legacy_person_club_affiliations` schema enforces `resolved_club_id NOT NULL when resolution_status='confirmed_current'`
- [ ] `pending → confirmed_current` wizard-transition test pins the `resolved_club_id` write
- [ ] Phase H exits non-zero on missing seed-CSV rows and on zero candidates after enrichment
- [ ] HP linkage: `affiliations_pid_fallback` counter in Phase G → 0 (or documented exception class with rationale)

---

## SHORT-TERM BACKLOG

- **Loader idempotency smoke test.** Run each loader twice; assert no exceptions + identical row counts.
- **`reset-local-db.sh` orchestration gap** (David-owned; needs approval). Step 20 consumes `out/scraped_footbag_moves.csv` from step 18, but `reset-local-db.sh` skips step 18; fresh-clone operator must run step 18 manually. Model: fail-fast preflight pattern from `run_pipeline.sh`.
- **FK-off bulk reseed investigation.** `event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py:131` disables FK during bulk reload (re-enabled :534). Determine whether reorder or cascade-delete preserves FK-on.
- **`score_text` pass-through from legacy HTML.** Schema field `event_result_entries.score_text` exists; pipeline drops it. Extract consecutives counts + Sick 3 / routine descriptors; skip generic point totals.
- **Workbook parity QC.** Assert `canonical/events.csv` row count == workbook EVENT INDEX == year-sheet event union.
- **Override visibility.** `results_file_overrides.csv` and `events_overrides.jsonl` applied silently. Surface via `is_overridden` boolean or Data Notes sheet.
- **Top-level pipeline ergonomics.** `reset-local-db.sh` (default `run_dev.sh`) and `scripts/deploy-local-data.sh --db-only` are two fast-paths for the no-enrichment case; collapse or document. Adjacent: `EXPANDED_ARGS` duplicated between `deploy_to_aws.sh` and `scripts/deploy-to-aws.sh`.
- **Dictionary data-debt rows blocked from SCALE pilot** (surfaced 2026-05-12 by SCALE-11 verification):
  1. **fusion** (5-ADD, `base_trick='dod'`): `dod` slug not active in `freestyle_tricks`; add row or reclassify base.
  2. **omelette** (3-ADD, `base_trick='pickup'`, modifier=`illusioning`): `illusioning` ADD bonus unresolved; add to modifiers table or §3.2 policy class.
  3. **flurry** (4-ADD, `base_trick='legover'`): `barraging` modifier-table example says flurry=3, asserted ADD=4. Reconcile.

---

## RESEARCH / FUTURE DIRECTIONS

Closed-exploration pointers and design questions with no current execution path. Each links to richer state in memory or `exploration/`.

- **TEMP-DEVIATION sweep before any production environment ships: club-classification QC panel on `/clubs/:key`.** Additional human-QC tool for evaluating classifier output (category, confidence, R1-R10 firings + inputs, decision path). NOT a substitute for the planned admin queue `A_Review_Club_Cleanup_Signals` — that queue serves a different audience (admins resolving member-flagged + system-flagged clubs at runtime); the panel serves developers auditing the classifier rules at build time. The two coexist independently. Remove the panel (and its 19 evidence columns on `legacy_club_candidates`, the visitor summary section, and the auth-gated full diagnostic section) before prod ships. Touch points: grep `TEMP-DEVIATION` across the tree; entire file `tests/integration/clubs-qc-panel.routes.test.ts` deletes.
- **Glossary v4 multi-layer architecture** — curator triage of 17 synthesis drafts + Phase A static-page rollout pending. See `project_glossary_synthesis`, `exploration/glossary-synthesis-1/`.
- **Symbolic-UX rollout (Path C hybrid)** — Phase 1 (4 surfaces) pending Path-C approval. See `project_symbolic_ux_rollout`, `exploration/symbolic-ux-1/`.
- **SYMBOLIC-GRAMMAR-3 (DB migration or public-page rollout)** — curator triage of staging CSVs + Path A (DB schema) vs Path B (CSV-direct render) pending. See `exploration/symbolic-grammar-2/`.
- **Mirror-local MP4 trick snippets.** Slice 2 sidecar pipeline rejects non-embed `videoPlatform`. Mirror MP4s under `legacy_data/mirror_footbag_org/` need a separate ingestion path: (a) file-backed `media_items`; (b) admin upload via slice 4 UX; (c) re-host on YouTube/Vimeo then ingest as URL; (d) snippet-discovery pipeline.
- **Canonical / canonical_all unification.** Merge post-1997 + pre-1997 into single `canonical`; retire `canonical_all`.
- **Version stamps in outputs.** Add `build_version`, `build_date`, `identity_lock_version` to workbook + canonical CSVs.
- **DATA NOTES sheet in workbook.** Document excluded events, sources used, meaning of "unknown" in placement columns.
