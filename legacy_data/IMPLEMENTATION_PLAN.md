# legacy_data/IMPLEMENTATION_PLAN.md

Historical-pipeline maintainer's track. Pipeline architecture, loader invariants, and MIGRATION_PLAN routing live in `legacy_data/CLAUDE.md`. This file is ACTIVE-only; shipped work is deleted (IP-is-AI-facing rule); closed-exploration state lives in memory entries and `exploration/_archive/`.

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
- **Red Husted Wave 2 reply.** Wave 2 packet SENT 2026-05-15; six grammar-level questions covering blurry transitivity, barraging operator class, atomic family X-dex scope, operator-vs-trick boundary + Fairy weight, compression intent, hidden-vs-flat preservation. Freestyle trick dictionary expansion + PassBack intake promotion both gated. See `project_red_consultation_state`.
- **Data review sign-off.** Confirmation that legacy data is complete and member-list presentation is reviewed. Required before removing `requireAuth` from member-list pages.
- **Onboarding wizard club-affiliations step (Dave-owned).** Sole intended writer that transitions affiliations out of `'pending'` (loader contract 4ca0909). On `confirmed_current` against an `onboarding_visible` candidate, the wizard must promote via a new `ClubService.promoteFromCandidate(candidateId, actorMemberId)` helper that mirrors Phase H invariants (create `clubs` row + stamp `mapped_club_id` + insert `member_club_affiliations` with `source='legacy_claim'`). Wire shape detailed in DATA_MODEL §4.25 + MIGRATION_PLAN §9.3.
- **Admin cleanup queue `A_Periodic_Club_Cleanup` (Dave-owned).** Planned ongoing-cadence reviewer surface for wizard-emitted flags, member-flagged outdated clubs, auto-merge holds, unpromoted candidates, and stale legacy-affiliation rows. No current substitute; without it, admin-side cleanup signals have no UI. Independent of the dev-time classifier QC panel (see RESEARCH / TEMP-DEVIATION sweep); the two serve different audiences.

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

- **Skill cleanup pass (cross-track, Dave executes on `.claude/skills/`).** Five James-owned skills carry implementation-status drift (dated waves / phases / audit references), memory cross-references (`[[name]]`, `feedback_*.md`) that aren't portable to non-Dave contributors, em-dash prose, and in some cases curator doctrine that belongs in canonical docs (a skill describes procedure; doctrine belongs in DD or DATA_MODEL). Skill review 2026-05-20 confirmed the per-skill list below. `freestyle-dictionary-surface` is handled by the relocation item above and is not listed here.
  - `footbag-freestyle-dictionary` (612 lines): purge §B "Current strategic posture (post Dictionary-Coherence + Notation-Normalization waves, 2026-05-19)" CR/NCR wave narrative; rename §"Established description templates (Phases 1-3, 2026-04-30)" to drop the dated phase tag; inline or drop `[[project_freestyle_state]]` and `[[project_freestyle_post_slice_e_posture]]`; split curator doctrine (Red Husted clarifications, description templates, media linkage rules) out of the skill: ontology / layer-separation invariants to `docs/DESIGN_DECISIONS.md`, trick / modifier / alias semantics to `docs/DATA_MODEL.md`. Target shape after cleanup: procedural triggers only (what to read, what to check, what to verify when adding or modifying freestyle data), with doctrine linked rather than embedded.
  - `footbag-curated-media`: purge dated event narrative (line 77 PassBack 2026-05-06 backfill, line 254 Phase 2b reclass, §"Audit observation (2026-05-07; superseded by 2026-05-10 reclass)" entire dated section); state the resulting conventions timelessly; inline or drop `feedback_gallery_dave_track.md`, `feedback_admin_post_rebuild_backfill.md`, `project_gallery_organization.md`. Open question for curator: the skill's "core pipeline" + tag rules + CSV schema are reference material that would auto-attach more reliably as a path-scoped `legacy_data/tools/trick_video_discovery/CLAUDE.md` than as a skill triggered on intent. If relocated, the skill shrinks to procedural triggers (staging, promoting, backfilling) and the path-scoped doc carries the invariants.
  - `freestyle-topology-governance`: purge §"Red-wave governance caution. As of 2026-05-15:". State the timeless rule (uncertain readings carry `curatorConfirmPending: true`; do not freeze without curator sign-off) without the wave-status snapshot. Inline or drop `[[project_red_consultation_state]]`, `[[project_semantic_compression_doctrine]]`, `[[feedback_reversible_content_governance]]`, `[[feedback_parser_editorial_separation]]`. Decision needed: this skill self-describes as the "conceptual guardrail" and defers implementation to `footbag-freestyle-dictionary`, which is a merge signal. Two paths: (a) fold the "observational ≠ canonical" invariant + family-semantics warnings into `footbag-freestyle-dictionary`'s foundational-doctrine section and retire this skill; (b) move the core invariant to `docs/DESIGN_DECISIONS.md` and retire this skill. Either way, the skill itself does not survive cleanup as a standalone unit.
  - `migrate-browse-view`: heaviest em-dash density (48 instances); inline or drop memory refs `feedback_modifier_public_visibility` and `feedback_git_commit_boundary`. The skill's six-step recipe is solid; cleanup is drift only. Relevance check before cleanup: skill text lists five browse views shipped (ADD / family / category / component / topology). If no unmigrated browse views remain in scope, retire the skill instead of cleaning it.
  - `pipeline-invariant-enforcer`: single dated event at line 37 (2026-04-27 staging FileNotFoundError); curator call whether to keep as load-bearing concrete example or generalize. Otherwise the skill is exemplary (eight numbered checks, concrete file paths, validation commands per check) and needs no other changes.

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

- **TEMP-DEVIATION sweep before any production environment ships: club-classification QC panel on `/clubs/:key`.** Additional human-QC tool for evaluating classifier output (category, confidence, R1-R10 firings + inputs, decision path). NOT a substitute for the planned admin queue `A_Periodic_Club_Cleanup`; that queue serves a different audience (admins resolving member-flagged + system-flagged clubs at runtime); the panel serves developers auditing the classifier rules at build time. The two coexist independently. Remove the panel (and its 19 evidence columns on `legacy_club_candidates`, the visitor summary section, and the auth-gated full diagnostic section) before prod ships. Touch points: grep `TEMP-DEVIATION` across the tree; entire file `tests/integration/clubs-qc-panel.routes.test.ts` deletes.
- **Glossary v4 multi-layer architecture**: curator triage of 17 synthesis drafts + Phase A static-page rollout pending. See `project_glossary_synthesis`, `exploration/glossary-synthesis-1/`.
- **Symbolic-UX rollout (Path C hybrid)**: Phase 1 (4 surfaces) pending Path-C approval. See `project_symbolic_ux_rollout`, `exploration/symbolic-ux-1/`.
- **SYMBOLIC-GRAMMAR-3 (DB migration or public-page rollout)**: curator triage of staging CSVs + Path A (DB schema) vs Path B (CSV-direct render) pending. See `exploration/symbolic-grammar-2/`.
- **Mirror-local MP4 trick snippets.** Slice 2 sidecar pipeline rejects non-embed `videoPlatform`. Mirror MP4s under `legacy_data/mirror_footbag_org/` need a separate ingestion path: (a) file-backed `media_items`; (b) admin upload via slice 4 UX; (c) re-host on YouTube/Vimeo then ingest as URL; (d) snippet-discovery pipeline.
- **Canonical / canonical_all unification.** Merge post-1997 + pre-1997 into single `canonical`; retire `canonical_all`.
- **Version stamps in outputs.** Add `build_version`, `build_date`, `identity_lock_version` to workbook + canonical CSVs.
- **DATA NOTES sheet in workbook.** Document excluded events, sources used, meaning of "unknown" in placement columns.
