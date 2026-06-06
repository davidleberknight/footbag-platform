# legacy_data/IMPLEMENTATION_PLAN.md

Historical-pipeline maintainer's track. Pipeline architecture, loader invariants, and MIGRATION_PLAN routing live in `legacy_data/CLAUDE.md`. ACTIVE-only; shipped work is deleted (IP-is-AI-facing). Closed-exploration state lives in memory entries and `exploration/_archive/`.

---

## ACTIVE NOW

- **Club-description PII scrub (known deviation; migration_fixes E-12, ruled).** `legacy_data/seed/clubs.csv` descriptions carry contact PII, deviating from the ratified design: club contact is leader-mechanism-only, never free text in descriptions. Maintainer ruling: curator-reviewed scrub of ALL phones and ALL emails from descriptions; the full hit list is shown to the maintainer before any edit; ambiguous digit-runs are asked, not guessed. Current hit list (re-derive before executing): 34 of 312 clubs, 20 emails, 24 phone-like runs. Three digit-runs look like non-phones and are proposed keeps (a year range "2002 - 2008"; two 15-16 digit messenger/group-id-shaped runs on keys `1466041249` and `austin`); two are ambiguous and proposed scrubs ("29 60389" on `954433125`; "603278769" on `1025613544`). Procedure: maintainer approves the hit list, edit the seed CSV, re-run the pipeline and assert parity (candidate output unchanged except descriptions), show the diff. Hit-list approval is still pending.

- **Classifier work set (ratified; migration_fixes §3.2, rulings D10/C1/C4).** Six items on the club classifier and its inputs: (1) parameterize `clubs/scripts/02_build_legacy_club_candidates.py` (five constants become MIGRATION_PLAN §10.1 parameters plus an explicit `--anchor-year`; add diff-vs-previous-run to the existing distribution summary; baseline check first: the default run reproduces byte-identical `legacy_club_candidates.csv`); (2) force-keep/force-junk override CSVs in `legacy_data/overrides/`, force-keep review seeded with Austin Style, Kitsilano, Cortes Island, Net Break Crew, Caracas, North Bay Flyers; (3) R3 gains the edited-after-creation conjunction (the 4 resulting PP demotions are accepted pending curator force-keep review); (4) person-level hosting/roster signals in `04a_compute_bootstrap_leader_signals.py` (lines 146/157 are club-level), then re-run 04a/07a and review the strong/weak distribution at gate G8 (threshold revisit); (5) unify the three `KNOWN_DUPLICATES`-only pairs from `06_cutover_pre_populated_clubs.py` into `overrides/club_duplicates.csv` and delete the dict; (6) tests per the ratified set (parameter-anchored snapshot, overrides, person-level signals, R3 conjunction, duplicate unification, badge display-only). Any cited "expected effect" counts come from the parameterized script's actual output, never hard-coded.

- **Mirror member extraction code lives outside the repo.** The production-shaping extraction code for the mirror member pipeline (the source of the ~1,600 club-only `historical_persons` rows) is currently reproducible only by the historical-pipeline maintainer. Commit it into `legacy_data/scripts/` before the MIGRATION_PLAN §24 State 3 → State 4 transition.

- **Curator media unification residual cleanup (Phase E destructive cleanup).** Residual tasks:
  1. Drop `freestyle_media_*` table definitions from `database/schema.sql`.
  2. Delete the `freestyle_media_*` loaders 21 / 22 / 23 (not `21_load_footbag_org_pending_tricks.py` or `22_qc_trick_dictionary.py`).
  3. Delete `legacy_data/inputs/curated/media/*.csv`.
  4. Delete `scripts/migrate-freestyle-media-to-curated.py`.
  5. Edit `scripts/reset-local-db.sh` (David-owned; needs approval).
  6. Run oEmbed `verifyExternalVideoUrl` over `curated/freestyle_tricks/` sidecars before deleting `media_assets.csv`.
  TT canonical-sidecar invariant: see `legacy_data/CLAUDE.md`.

- **Candidate live-content columns need loader coverage (James-track).** `legacy_club_candidates` now carries nullable `description` and `external_url` columns (platform-side schema add; the promotion path publishes them onto the live club, URL only after validation). The enrichment loader does not yet populate them from the mirror extraction, so platform-promoted clubs currently land with an empty description and no URL. Extend the candidate loader to carry both fields from `seed/clubs.csv` and re-run the load.

- **Cross-track: relocate `freestyle-dictionary-surface` from `.claude/skills/` to `exploration/`.** It self-identifies as exploration-derived but sits in the production skill tree where it auto-loads on freestyle-dictionary-UI prompts. Plan: (1) `mv .claude/skills/freestyle-dictionary-surface/SKILL.md exploration/freestyle-dictionary-surface.md` and `rmdir` the empty dir (touches `.claude/skills/`; coordinate with Dave); (2) update `exploration/freestyle-notation-grammar/PROPOSAL.md:579` to the new path; (3) update `legacy_data/scripts/build_structural_alias_adjudication.py` lines 5 and 522 to drop "skill" from the citations.

- **Freestyle pages fixes (mixed Dave-track: app/template/route/docs; and James-track: curator content).**
  1. BUG (route): `/freestyle/moves → /freestyle/sets/reference` 301 at `publicRoutes.ts:82` violates DD §5.2 (redirects limited to auth gates, PRG, canonical-identity). Delete the redirect and its pinning test; `moves.hbs` stays (it is the live template for `/freestyle/sets/reference`); update the `VIEW_CATALOG.md` parenthetical.
  2. Content (curator): `about.hbs:27` uses "moves" not canonical "tricks".
  3. Content (curator): Glossary §1 vocabulary-stabilization claim lacks an inline citation; add one if corpus-backed.
  4. Content (curator): glossary §12 names community contributors; other freestyle pages don't. Decide public-attribution policy.
  5. UI standard (mixed-track: CSS is Dave-track per the comment-hygiene item; templates span both): bring the freestyle surfaces onto the VC §4.5 token standard. The non-freestyle site is already compliant and two gates enforce it with freestyle excluded. Scope, per surface:
      - Replace Georgia / Apple-system / raw mono `font-family` stacks (freestyle region of `src/public/css/style.css`, ~60 rules) with `var(--font-body)` / `var(--font-mono)`.
      - Tokenize ~1,060 hex literals plus raw radii/shadows; new values enter `:root` as named tokens (the existing neutral/status/family token groups are the pattern).
      - Consolidate breakpoints 520/600/640/680/720/1024 onto canonical 480/768.
      - Define or replace ~120 undefined class tokens across `src/views/freestyle/**` and the 17 freestyle-owned partials; bespoke families (`dict-card`, `compositional-set-*`, ...) keep their vocabulary but inherit shared tokens per VC §4.5.
      - Gate updates are mandatory per surface, enforced mechanically: when a template becomes compliant, prune it from `EXCLUDED_FILES` / `EXCLUDED_DIRS` in `tests/unit/template-class-vocabulary.test.ts` (a companion test in that file fails while a compliant surface stays excluded, naming the entry to remove); when the last raw font stack is tokenized, remove the "Freestyle records" early-exit from the font-family check in `scripts/ci/assert_conventions.sh` (also enforced by a companion test).

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
- **Club-duplicate roster merge (replace drop-only dedup with curator-confirmed merge).** `overrides/club_duplicates.csv` today only suppresses a duplicate (`apply_club_duplicate_overrides()` in `clubs/scripts/02_build_legacy_club_candidates.py` sets `bootstrap_eligible=0`), which discards the dropped row's roster. Built data has 4 same-name+country duplicate clusters, all with rosters on both sides; only Les Pieds à Gilles (21+1) is curated. The three unhandled clusters split one real roster across two candidates: Penn State Footbag Club (3+3), Memphis Footworks (1+12), Caracas Footbag Club (junk 1 + pre_populate 1). Change the override from drop to merge: `keep_key` absorbs `drop_key`'s `legacy_person_club_affiliations` rows (union, dedupe by resolved person) and best-of candidate fields; record source keys for audit/reversibility. Curator-confirmed (one CSV), deterministic, pipeline-time; no similarity clustering, no platform-side `convergent_auto_merge` predicate, no admin merge/split UI. Needs a `legacy_club_candidates.source_legacy_keys` column (DATA_MODEL §4.24 promises it; `database/schema.sql` lacks it) — David-owned schema add, coordinate.
- **Freestyle comment / text hygiene cleanup (mixed-track; large pass).**
  - Problem: across the freestyle surface, code comments AND human-readable string values carry forbidden planning baggage (slice / phase / wave labels, dated change-markers, doc-path and `exploration/` references). It misleads once a slice ships or is redesigned, and violates the comment standard in `.claude/rules/comments.md`.
  - Solution: rewrite each to a plain-words self-contained WHY, dropping the labels, dates, and doc references; genuine deviations use `Current:` / `Target:` and are recorded here in IP. Do NOT touch genuine data (ADD math, JOB / operational notation, formula strings) or real timestamps in tests.
  - Scope (James-track): `src/content/freestyle*.ts`, heaviest in `freestyleResolvedFormulas.ts`, `freestyleSymbolicEquivalences.ts`, `freestyleObservationalTricks.ts`, `freestyleAddAnalysisContent.ts`, including the `freestyleAliasGovernance.ts` `reason:` string values.
  - Scope (Dave-track): `src/views/freestyle/**` and the freestyle `views/partials/*`, the freestyle comment blocks in `src/public/css/style.css`, residual markers in `src/services/freestyleService.ts` (most already scrubbed), and the freestyle-route comments in `src/routes/publicRoutes.ts` / `src/controllers/freestyleController.ts`.
  - Verify: the comment-standard ripgrep returns no freestyle hits; `npm run build` and the full test suite pass.
- **Freestyle template label-shaping (B53; Dave-track app/template/service).**
  - Problem: freestyle Handlebars templates branch on and render RAW domain codes as visible text (equivalence-layer codes like `holden-only`, status codes like `pending-doctrine` / `curator-derived`). Label-derivation logic lives in the view layer and internal codes leak to users.
  - Solution: move label derivation into the service shaping layer and have templates branch only on pre-shaped booleans / labels; keep raw codes only for non-text CSS-class modifiers. Add shaped fields: `SemanticNotation` gains `isEquivalenceLayer` / `isBaseLineageLayer` / `isCurationGapLayer`; `HeroFormulaToken` gains `isOperator` / `isResult`; `ModifierLayer` gains `kindLabel`; introduce an `EquivalenceTopologyView` (`sourceLabel` / `roleLabel` / `showRoleBadge`); `CompositionalSetCardView` and the glossary add-examples gain `statusLabel` at the service boundary.
  - Sites: `views/partials/trick-notation.hbs`, `trick-hero.hbs`, `trick-modifier-layer.hbs`, `trick-equivalence-topology.hbs`; `views/freestyle/compositional-sets.hbs`; `glossary.hbs`.
  - Verify: route integration tests for `GET /freestyle/tricks/:slug` (an equivalence-topology slug and a modifier-heavy slug), `GET /freestyle/glossary`, and `GET /freestyle/compositional-sets` assert the human labels render (e.g. "Holden-only", "pending doctrine") and the raw codes (`holden-only`, `pending-doctrine`, `curator-derived`) never appear as visible text; `npm run build` and the full suite pass.

---

## BLOCKERS

- **Legacy-site data dump (legacy-site webmaster coordination).** Final source for `legacy_members`; supplies `real_name`, `legacy_email`, `legacy_user_id`, `country`, `city`, `region`, `bio`, `birth_date`, `ifpa_join_date`, `first_competition_year`, `is_hof`, `is_bap`, `legacy_is_admin`, `last_login`, `profile_modified`, `membership_tier_at_cutover`. Open: namespace agreement on `legacy_member_id`; MIGRATION_PLAN §2 + §8 rewrites depend on final structure; `tests/fixtures/factories.ts` may need extensions.
  - Current substitute: `load_legacy_members_seed.py` (2,507 rows; PK + `display_name` + `import_source='mirror'`).
  - Gates: auto-link coverage for club-only members; legacy-account-claim at registration (both on `legacy_email`); name_variants seeding (currently 0 rows, so the `confidence:'medium'` branch produces no hits); removal of `requireAuth` from member-list pages.
- **Freestyle rules content (IFPA).** Wording for Routine, Circle, Sick 3, Shred 30. Re-enables the Rules buttons dropped from `/freestyle` competition-format cards.
- **Red Husted Wave 2 reply.** Six grammar-level questions: blurry transitivity, barraging operator class, atomic family X-dex scope, operator-vs-trick boundary + Fairy weight, compression intent, hidden-vs-flat preservation. Freestyle trick-dictionary expansion + PassBack intake promotion both gated. See `project_red_consultation_state`.
- **Data review sign-off (G20).** Confirmation that legacy data is complete and member-list presentation is reviewed, recorded as the `legacy_pipeline.data_review_signoff` audit row (historical-pipeline maintainer as actor). The cutover checklist's `G20-SIGNOFF` gate asserts the row; legacy-data surfaces must not ship to production without it. No runtime flag and no auth-gate removal are involved.
- **Onboarding-visible candidate promotion path (Dave-owned).** The wizard club-affiliations task exists and transitions affiliations out of `'pending'` via `ClubService.confirmAffiliation`, but only candidates with `mapped_club_id` already stamped (pipeline-pre-populated clubs) are confirmable; the wizard never creates a `clubs` row by design (MIGRATION_PLAN §10.3). The admin-override promotion path is live (`ClubService.promoteCandidate` + the cleanup-queue promote action), so candidates can reach live status by admin action. The member-confirmation triggers (Stage 1 confirm, Stage 2B existence confirm) do not yet call it; until they do, wizard confirmations cannot promote.
- **Admin cleanup queue residue (Dave-owned).** `A_Periodic_Club_Cleanup` exists (`clubCleanupService`: on-demand viability and leadership-staleness evaluation, demote/archive/dismiss/defer, per-club residue de-list). Not yet covered from the US contract: candidate-level queue items and actions (promote to live, demote to dormant, archive, defer on unpromoted candidates; junk-flagged candidate handling; force-keep / force-junk requests), wizard-flag grouping by candidate, the admin-home backlog badge, concurrent-admin claim markers, and queue sort / filter. The promote action is live; the rest of the candidate contract is open (see the promotion-path entry above).

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
