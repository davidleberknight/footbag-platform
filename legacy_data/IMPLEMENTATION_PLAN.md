# legacy_data/IMPLEMENTATION_PLAN.md

Historical-pipeline maintainer's track. Pipeline architecture, loader invariants, and MIGRATION_PLAN routing live in `legacy_data/CLAUDE.md`. ACTIVE-only; shipped work is deleted (IP-is-AI-facing). Closed-exploration state lives in memory entries and `exploration/_archive/`.

---

## ACTIVE NOW

- **Curator media unification residual cleanup (Phase E destructive cleanup).** Residual tasks:
  1. Drop `freestyle_media_*` table definitions from `database/schema.sql`.
  2. Delete the `freestyle_media_*` loaders 21 / 22 / 23 (not `21_load_footbag_org_pending_tricks.py` or `22_qc_trick_dictionary.py`).
  3. Delete `legacy_data/inputs/curated/media/*.csv`.
  4. Delete `scripts/migrate-freestyle-media-to-curated.py`.
  5. Edit `scripts/reset-local-db.sh` (David-owned; needs approval).
  6. Run oEmbed `verifyExternalVideoUrl` over `curated/freestyle_tricks/` sidecars before deleting `media_assets.csv`.
  TT canonical-sidecar invariant: see `legacy_data/CLAUDE.md`.

- **Cross-track: relocate `freestyle-dictionary-surface` from `.claude/skills/` to `exploration/`.** It self-identifies as exploration-derived but sits in the production skill tree where it auto-loads on freestyle-dictionary-UI prompts. Plan: (1) `mv .claude/skills/freestyle-dictionary-surface/SKILL.md exploration/freestyle-dictionary-surface.md` and `rmdir` the empty dir (touches `.claude/skills/`; coordinate with Dave); (2) update `exploration/freestyle-notation-grammar/PROPOSAL.md:579` to the new path; (3) update `legacy_data/scripts/build_structural_alias_adjudication.py` lines 5 and 522 to drop "skill" from the citations.

- **Freestyle pages fixes (mixed Dave-track: app/template/route/docs; and James-track: curator content).**
  1. BUG (app): `freestyleService.ts:709` emits `href:'#reference-media'`; target is `id="media"` in `trick-shell.hbs:66`. Rename href to `#media`.
  2. BUG (route): `/freestyle/moves → /freestyle/sets/reference` 301 at `publicRoutes.ts:79` violates DD §5.2 (redirects limited to auth gates, PRG, canonical-identity). Delete the redirect, remove `moves.hbs`, drop the `VIEW_CATALOG.md` row.
  3. BUG (app): upgrade the remaining HTTP external link in `glossary.hbs:1117` to HTTPS.
  4. UX: `/freestyle` renders 3 "Coming soon" Get Started tiles; hide until populated.
  5. UX: `/freestyle/tricks` modifier rows show ADD as `—` with no gloss; add a pending-entry footnote.
  6. UX: `/freestyle/learn` triple-hedges "observational"; trim and hide unshipped entries.
  7. UX: `/freestyle/tricks` ADD/family/category views lack a per-view lede.
  8. UX: `/freestyle/about` has 2 outbound links; add glossary, tricks index, learn.
  9. UX: `/freestyle/insights`, `/competition`, `/partnerships` are bare tables; add a scaffolding lede + glossary link.
  10. UX: `/freestyle/glossary` §10 and §11 are stubs after run-quality moved to combo-analysis; rewrite or merge into §8.
  11. Content (curator): `about.hbs:27` uses "moves" not canonical "tricks".
  12. Content (curator): Glossary §1 vocabulary-stabilization claim lacks an inline citation; add one if corpus-backed.
  13. Content (curator): glossary §12 names community contributors; other freestyle pages don't. Decide public-attribution policy.
  14. Docs: fix the `trick.hbs`/`trick-ux2.hbs` reference in `VIEW_CATALOG.md` to the unified `trick-shell.hbs`.

### BACKLOG (lower-priority active)

- **Skill cleanup pass (cross-track, Dave executes on `.claude/skills/`).** Five James-owned skills carry implementation-status drift (dated waves/phases, non-portable memory cross-refs, em-dash prose) and some embed curator doctrine that belongs in canonical docs. Clean each to procedural-trigger form; move ontology/layer-separation invariants to DESIGN_DECISIONS and trick/modifier/alias semantics to DATA_MODEL. Skills: `footbag-freestyle-dictionary`, `footbag-curated-media`, `freestyle-topology-governance`, `migrate-browse-view`, `pipeline-invariant-enforcer`. Open structural calls: whether `freestyle-topology-governance` folds into `footbag-freestyle-dictionary`; whether `migrate-browse-view` retires if no unmigrated views remain; whether `footbag-curated-media` invariants relocate to a path-scoped `legacy_data/tools/trick_video_discovery/CLAUDE.md`.
- **Loader idempotency smoke test.** Run each loader twice; assert no exceptions and identical row counts.
- **`reset-local-db.sh` orchestration gap (David-owned; needs approval).** Step 20 consumes `out/scraped_footbag_moves.csv` from step 18, but the script skips step 18. Apply the fail-fast preflight pattern from `run_pipeline.sh`.
- **FK-off bulk reseed investigation.** `08_load_mvfp_seed_full_to_sqlite.py:131` disables FK during bulk reload (re-enabled :534). Determine whether reorder or cascade-delete preserves FK-on.
- **`score_text` pass-through from legacy HTML.** Field exists; pipeline drops it. Extract consecutives counts + Sick 3 / routine descriptors; skip generic point totals.
- **Workbook parity QC.** Assert `canonical/events.csv` row count == workbook EVENT INDEX == year-sheet event union.
- **Override visibility.** `results_file_overrides.csv` and `events_overrides.jsonl` apply silently. Surface via `is_overridden` or a Data Notes sheet.
- **Top-level pipeline ergonomics.** `reset-local-db.sh` and `scripts/deploy-local-data.sh --db-only` are two fast-paths for the no-enrichment case; collapse or document. `EXPANDED_ARGS` duplicated between `deploy_to_aws.sh` and `scripts/deploy-to-aws.sh`.
- **Dictionary data-debt rows blocked from SCALE pilot.** (a) `fusion` (5-ADD, base `dod`): `dod` slug not active; add row or reclassify base. (b) `omelette` (3-ADD, modifier `illusioning`): `illusioning` ADD bonus unresolved; add to modifiers table or policy class. (c) `flurry` (4-ADD, base `legover`): `barraging` modifier example says 3, asserted ADD 4; reconcile.

---

## BLOCKERS

- **Legacy-site data dump (legacy-site webmaster coordination).** Final source for `legacy_members`; supplies `real_name`, `legacy_email`, `legacy_user_id`, `country`, `city`, `region`, `bio`, `birth_date`, `ifpa_join_date`, `first_competition_year`, `is_hof`, `is_bap`, `legacy_is_admin`, `last_login`, `profile_modified`, `membership_tier_at_cutover`. Open: namespace agreement on `legacy_member_id`; MIGRATION_PLAN §2 + §8 rewrites depend on final structure; `tests/fixtures/factories.ts` may need extensions.
  - Current substitute: `load_legacy_members_seed.py` (2,507 rows; PK + `display_name` + `import_source='mirror'`).
  - Gates: auto-link coverage for club-only members; legacy-account-claim at registration (both on `legacy_email`); name_variants seeding (currently 0 rows, so the `confidence:'medium'` branch produces no hits); removal of `requireAuth` from member-list pages.
- **Freestyle rules content (IFPA).** Wording for Routine, Circle, Sick 3, Shred 30. Re-enables the Rules buttons dropped from `/freestyle` competition-format cards.
- **Red Husted Wave 2 reply.** Six grammar-level questions: blurry transitivity, barraging operator class, atomic family X-dex scope, operator-vs-trick boundary + Fairy weight, compression intent, hidden-vs-flat preservation. Freestyle trick-dictionary expansion + PassBack intake promotion both gated. See `project_red_consultation_state`.
- **Data review sign-off.** Confirmation that legacy data is complete and member-list presentation is reviewed. Required before removing `requireAuth` from member-list pages.
- **Onboarding wizard club-affiliations step (Dave-owned).** Sole intended writer that transitions affiliations out of `'pending'`. On `confirmed_current` against an `onboarding_visible` candidate, the wizard promotes via a new `ClubService.promoteFromCandidate(candidateId, actorMemberId)` mirroring Phase H invariants (create `clubs` row, stamp `mapped_club_id`, insert `member_club_affiliations` with `source='legacy_claim'`). See DATA_MODEL §4.25 + MIGRATION_PLAN §9.3.
- **Admin cleanup queue `A_Periodic_Club_Cleanup` (Dave-owned).** Reviewer surface for wizard-emitted flags, member-flagged outdated clubs, auto-merge holds, unpromoted candidates, stale legacy-affiliation rows. No current substitute. Distinct from the dev-time classifier QC panel (see DEFERRED).

### Known deviations

- **Loosened read filter on `legacy_person_club_affiliations.resolution_status`.** `db.ts` `listMembersByClubId` and `listMemberCountsForAllClubs` accept `'pending'` so loader-imported affiliations render on `/clubs/:key`. Substitutes for the wizard's `pending → confirmed_current` transition. Reverts to `IN ('confirmed_current','promoted')` when the wizard ships.

---

## RELEASE GATES

**Data integrity**
- [ ] QC STATUS PASS (0 hard failures from `qc/qc_master.py`)
- [ ] No unexpected row-count drops vs previous identity-lock version
- [ ] No new NULL `person_id` spikes in participants

**Workbook**
- [ ] INDEX event count == `canonical/events.csv` row count
- [ ] No empty year sheets
- [ ] Worlds events labeled (`event_type = worlds`)

**Identity**
- [ ] No duplicate `person_canon` in persons truth
- [ ] No alias leakage into `persons.csv`

**Platform DB**
- [ ] Event count matches canonical events CSV
- [ ] Sample event pages load
- [ ] Player pages resolve (no orphan historical person IDs)

**Club cleanup pipeline**
- [ ] `pending → confirmed_current` wizard-transition test pins the `resolved_club_id` write

---

## DEFERRED / PARKED

Non-blocking; no current execution path. Richer state in memory / `exploration/`.

- **Club-classification QC panel on `/clubs/:key` (TEMP-DEVIATION; remove before any production environment).** Dev-time classifier-audit tool; not a substitute for `A_Periodic_Club_Cleanup`. Remove the panel, its 19 evidence columns on `legacy_club_candidates`, and `tests/integration/clubs-qc-panel.routes.test.ts` before prod. Grep `TEMP-DEVIATION`.
- **Glossary v4 multi-layer architecture.** Curator triage + static-page rollout pending. `project_glossary_synthesis`.
- **Symbolic-UX rollout (Path C hybrid).** Phase 1 pending approval. `project_symbolic_ux_rollout`.
- **SYMBOLIC-GRAMMAR-3.** DB-schema vs CSV-direct render decision pending. `exploration/symbolic-grammar-2/`.
- **Mirror-local MP4 trick snippets.** Need a non-embed ingestion path (file-backed media_items / admin upload / re-host / snippet pipeline).
- **Canonical / canonical_all unification.** Merge post-1997 + pre-1997; retire `canonical_all`.
- **Version stamps in outputs.** `build_version`, `build_date`, `identity_lock_version` in workbook + canonical CSVs.
- **DATA NOTES sheet in workbook.** Excluded events, sources, meaning of "unknown".
