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

- **Cross-track: relocate `freestyle-dictionary-surface` from `.claude/skills/` to `exploration/`.** The file at `.claude/skills/freestyle-dictionary-surface/SKILL.md` self-identifies as "exploration-derived. Not production-shipped" (its own lines 50, 86) but sits in the production-trigger skill tree where it can auto-load on Claude prompts about freestyle-dictionary UI. Plan: (1) `mv .claude/skills/freestyle-dictionary-surface/SKILL.md exploration/freestyle-dictionary-surface.md` and `rmdir` the empty skill directory (touches `.claude/skills/`; coordinate with Dave); (2) update `exploration/freestyle-notation-grammar/PROPOSAL.md:579` from `.claude/skills/freestyle-dictionary-surface/SKILL.md` to `exploration/freestyle-dictionary-surface.md`; (3) update `legacy_data/scripts/build_structural_alias_adjudication.py` lines 5 and 522 to drop the word "skill" from the "freestyle-dictionary-surface skill §X" citations (file is no longer a skill after the move). Audited during Dave's 2026-05-17 docs-refactor session (chunk 25 in that plan).

- **MIGRATION_PLAN §2 cross-track: combination-gate signal evidence missing from bootstrap pipeline.** The new MP §2 design (landed 2026-05-18) classifies `(member, club)` candidates over five structural signals (`listed_contact`, `affiliation`, `hosting`, `roster`, `mirror_text`) plus three modifiers. Pipeline gaps:
  1. `clubs/scripts/03_build_legacy_person_club_affiliations.py:126` hardcodes `inferred_role='member'`; contact and leader inference do not run, so the per-row `listed_contact` signal cannot be derived from this CSV.
  2. `clubs/scripts/04_build_club_bootstrap_leaders.py` emits only `confidence_score`, role, and `selection_reason`; no per-signal evidence columns on the CSV.
  3. `clubs/scripts/07_load_bootstrap_leaders.py:179-192` inserts only `confidence_score`, role, `status`, `notes`. The schema at `database/schema.sql:3356-3381` lacks per-signal columns.
  4. No producer scans club page narrative for the `mirror_text` signal.
  
  Schema decision (per-signal columns vs a `club_bootstrap_leader_signals` child table) coordinates with the platform-side "Club leader bootstrap classification and wizard step (W2)" deviation in the root `IMPLEMENTATION_PLAN.md`. After the schema lands, extend `03_build` to emit role inference (contact / leader / member), extend `04_build` to emit per-signal flags, extend `07_load` to populate them. Validators for per-signal distribution postconditions land alongside the columns.

- **MIGRATION_PLAN §2 cross-track: modifier signals (recent_activity, geographic_alignment) not propagated.** `legacy_person_club_affiliations.csv` does not carry the person's `last_year`, `city`, or `country`. `clubs/scripts/03_build_legacy_person_club_affiliations.py` does not merge these from `persons_master.csv` or `legacy_members`. To produce the two modifiers the script must join person attributes and emit overlap predicates (person's `last_year` vs club's `last_updated_year` window; person's city or country vs club's). The third modifier `tier_signal` is gated on the legacy-site data dump per the existing blocker (above) — no pipeline work until tier columns land on `legacy_members`.

- **Freestyle pages audit (2026-05-18). All items for asap triage. Mixed Dave-track (app / template / route / docs) and James-track (curator content).**
  1. **BUG (app).** `src/services/freestyleService.ts:709` emits `href: '#reference-media'`; target section is `id="media"` in `src/views/freestyle/trick-shell.hbs:66`. Every trick-detail "Jump to Reference Media" link is dead. Rename href to `#media`.
  2. **BUG (landing copy).** Operator board on `/freestyle` shows both `STEP + BUTTERFLY → RIPWALK` and `BL + BUTTERFLY → RIPWALK`; only `STEP` is canonical (RIPWALK = Stepping Butterfly per glossary §8). Fix the `BL` example in `src/content/freestyleLandingContent.ts`.
  3. **BUG (route).** `/freestyle/moves → /freestyle/sets` 301 at `src/routes/publicRoutes.ts:58` violates DD §5.2 (redirects limited to auth gates, PRG, canonical-identity). Delete the redirect route; drop the matching `VIEW_CATALOG.md:359` entry.
  4. **BUG (app).** Upgrade HTTP external links to HTTPS: `src/views/freestyle/moves.hbs:21`, `src/views/freestyle/glossary.hbs:1117` (two URLs on that line).
  5. **UX.** `/freestyle` landing renders 3 "Coming soon" Get Started tiles; hide until populated.
  6. **UX.** `/freestyle/tricks` modifier rows show ADD as `—` with no inline gloss; beginners read as missing data. Add a footnote matching the landing's pending-entry pattern.
  7. **UX.** `/freestyle/learn` triple-hedges "observational" (h1 badge, footer, planned-entry style); trim and hide unshipped entries.
  8. **UX.** `/freestyle/tricks` view-toggle: ADD, family, category views lack a per-view lede (component, movement-system, topology already have one).
  9. **UX.** `/freestyle/about` has 2 outbound links only; add glossary, tricks index, `/freestyle/learn`.
  10. **UX.** `/freestyle/insights`, `/freestyle/competition`, `/freestyle/partnerships` are bare tables with no scaffolding lede or glossary link.
  11. **UX.** `/freestyle/glossary` §10 + §11 are stubs after run-quality content relocated to `/freestyle/combo-analysis`; rewrite or merge into §8. Tier badges (Beginner / Intermediate / Advanced) aren't actionable; consider jump-by-tier nav.
  12. **Content (curator).** `src/views/freestyle/about.hbs:27` uses "moves" instead of canonical "tricks".
  13. **Content (curator).** Glossary §1 vocabulary-stabilization claim (2007 to 2008; no new base tricks since) lacks an inline citation; add one if corpus-backed.
  14. **Content (curator).** `src/views/freestyle/moves.hbs:20` and `src/views/freestyle/glossary.hbs` §12 name community contributors (Chris Holden, Jobs notation); other freestyle pages don't. Decide policy.
  15. **Docs.** `docs/VIEW_CATALOG.md`: drop `/freestyle/moves` row (line 359) when redirect is removed; add entries for `/freestyle/progression/walking-family` and `/freestyle/modifier/:slug` (`publicRoutes.ts:63, 64`); fix `trick.hbs` / `trick-ux2.hbs` reference at line 362 to unified `trick-shell.hbs`.
  16. **BUG (landing layout).** `/freestyle` landing renders `Trick Dictionary →` + `Glossary →` in the `freestyle-top-reference-jump` nav (`src/views/freestyle/landing.hbs:16-19`); the same two destinations appear in the portal-cards block below. Two paths to the same target on one page. Remove the top-reference-jump nav and let the portal cards carry the CTAs.
  17. **BUG (main landing scope violation).** The `/freestyle` MAIN landing page body is glossary teaching detail: Basic Components (`landing.hbs:51-69`), Core Tricks grid (`landing.hbs:75-80`), Operator Board (`partials/operator-board.hbs` via `landing.hbs:105`). All of this material already lives on `/freestyle/glossary` §2 through §7. The main landing must be a portal (hero + featured demo + CTA grid), not a parallel primer. Strip the teaching sections off landing; the Glossary portal card carries the entry into that material.

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
