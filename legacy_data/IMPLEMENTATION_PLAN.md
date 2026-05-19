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

- **Cross-track: relocate `freestyle-dictionary-surface` from `.claude/skills/` to `exploration/`.** The file at `.claude/skills/freestyle-dictionary-surface/SKILL.md` self-identifies as "exploration-derived. Not production-shipped" (its own lines 50, 86) but sits in the production-trigger skill tree where it can auto-load on Claude prompts about freestyle-dictionary UI. Plan: (1) `mv .claude/skills/freestyle-dictionary-surface/SKILL.md exploration/freestyle-dictionary-surface.md` and `rmdir` the empty skill directory (touches `.claude/skills/`; coordinate with Dave); (2) update `exploration/freestyle-notation-grammar/PROPOSAL.md:579` from `.claude/skills/freestyle-dictionary-surface/SKILL.md` to `exploration/freestyle-dictionary-surface.md`; (3) update `legacy_data/scripts/build_structural_alias_adjudication.py` lines 5 and 522 to drop the word "skill" from the "freestyle-dictionary-surface skill §X" citations (file is no longer a skill after the move). Audited during Dave's 2026-05-17 docs-refactor session (chunk 25 in that plan).

- **MIGRATION_PLAN §2 cross-track: `club_bootstrap_leader_signals` unwritten.** Schema table `database/schema.sql:3466-3487` exists; no pipeline producer populates it. Closes when a producer emits one row per `club_bootstrap_leaders` candidate × signal_type. Approach: two new scripts (additive, no edits to existing 03/04/07).

  - **`clubs/scripts/05_compute_bootstrap_leader_signals.py`** reads existing outputs (`club_bootstrap_leaders.csv`, `legacy_club_candidates.csv`, `legacy_person_club_affiliations.csv`, `persons_enriched_for_clubs.csv`); per leader, computes 7 signals (5 structural + 2 modifiers); emits `clubs/out/club_bootstrap_leader_signals.csv` with columns `(club_key, legacy_member_id, role, signal_type, is_present, signal_payload_json, source='pipeline_05')`. `tier_signal` modifier deferred (gated on legacy data dump blocker).
  - **`clubs/scripts/08_load_bootstrap_leader_signals.py`** mirrors `07_load_bootstrap_leaders.py` (DELETE+INSERT, single transaction, soft-skip on missing CSV). FK resolution: `bootstrap_leader_id` via `stable_id("cbl", club_key, legacy_member_id, role)` (same formula as script 07 line 175). Schema CASCADE on `bootstrap_leader_id` (line 3474) handles re-runs automatically; script 08 does NOT need its own scoped DELETE on the signals table.
  - **New test** `legacy_data/tests/test_bootstrap_leader_signals.py` follows the pattern in `test_phase_h_creates_pre_populate_only.py`. Seeds minimal fixtures covering each signal, runs 02→03→04→05→07→08, asserts row count == 7 × leader count and JSON payload shape.
  - **`legacy_data/run_pipeline.sh`** registers script 05 after script 04, and script 08 after script 07.

  Pre-implementation notes:
  1. Script 04 emits `person_name` but NOT a pre-normalized variant. Script 05 must apply `norm_name(person_name)` locally for the `mirror_text` substring match. The `norm_name` function lives at `clubs/scripts/03_build_legacy_person_club_affiliations.py:27` (lowercase + trim + replace `-` with space).
  2. `mirror_text` matching strategy is a design call before coding. Codebase has no substring-match precedent (script 03's match is exact-normalized dict lookup). Naive `member_name_norm in description_norm` produces false positives ("John Smith" matches "John Smithfield"). Three options: (A) whole-word: tokenize description, check word-set membership; (B) phrase boundary: regex `\bname\b` against normalized description (recommended default); (C) exact full-word: require contiguous token sequence. Pick before implementation.
  3. Roster signal threshold: use `legacy_club_candidates.linkable_member_count >= 5`. Matches the existing 5-member co-leader floor at script 04 line 156.
  4. Recent_activity modifier formula: OR-aggregate of `last_updated_year`, `last_hosted_year`, `max_affiliated_member_last_year` (club side) AND person `last_year` from `persons_enriched_for_clubs.csv` (person side, joined via `person_id` from `club_bootstrap_leaders.csv` line 142). Within 5-year window (matches `ACTIVE_PLAYER_YEAR = 2020` floor at script 02 line 22).

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

- **Legacy-site data dump (legacy-site webmaster coordination, expected soon).** Final source for `legacy_members`; supplies `real_name`, `legacy_email`, `legacy_user_id`, `country`, `city`, `region`, `bio`, `birth_date`, `ifpa_join_date`, `first_competition_year`, `is_hof`, `is_bap`, `legacy_is_admin`, `last_login`, `profile_modified`, `membership_tier_at_cutover`. Open: namespace agreement (export IDs share `legacy_member_id` namespace); MIGRATION_PLAN §2 + §8 platform rewrites depend on final dump structure; `tests/fixtures/factories.ts` may need extensions.
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
- [ ] `pending → confirmed_current` wizard-transition test pins the `resolved_club_id` write

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
