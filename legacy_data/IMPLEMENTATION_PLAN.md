# legacy_data/IMPLEMENTATION_PLAN.md

Historical-pipeline maintainer's track. Pipeline architecture, loader invariants, and MIGRATION_PLAN routing live in `legacy_data/CLAUDE.md`. ACTIVE-only; shipped work is deleted (IP-is-AI-facing). Closed-exploration state lives in memory entries and `exploration/_archive/`.

---

## ACTIVE NOW

- **Glossary family-taxonomy alignment (18-family doctrine pass) — URGENT / ASAP.** Not a someday item: the public glossary currently contradicts the dictionary family doctrine. The glossary presents an independent 8-parent family model (including ATW as a parent) that conflicts with the dictionary's settled 18-family view. Treat the dictionary family view as the SOLE source of truth and align the glossary to it. Scope: audit every glossary family claim against the dictionary; remove ATW parent-family treatment; eliminate the glossary's independent 8-parent model; align family cards, counts, labels, and membership criteria to the dictionary's 18-family system. Produce a reviewable before/after proposal before any implementation. Touch points: `glossary.hbs` §families (~548-627 — the three-tier prose, the "eight parent families" claims at ~553-556/604, the `{{> glossary-family-card}}` parent grid driven by `content.rootTerminalFamilies`, and the descendant-lineage grid); `freestyleParentFamilies.ts` (the 8-parent data to retire); `freestyleService.ts` (the `rootTerminalFamilies` / `branchFamilies` shaping AND the canonical `view=family` 18-family source — identify the authoritative list + membership rule first); the `glossary-family-card` partial. Track: James — doctrine/content alignment. Even if service/card shaping files are touched, the change is curator-directed glossary/family doctrine cleanup, not Dave-owned architecture. Refresh the `project_family_taxonomy_doctrine` memory (still records the 8-parent model) afterward.
- **Club-description PII scrub (known deviation; migration_fixes E-12, ruled).** `legacy_data/seed/clubs.csv` descriptions carry contact PII, deviating from the ratified design: club contact is leader-mechanism-only, never free text in descriptions. Maintainer ruling: curator-reviewed scrub of ALL phones and ALL emails from descriptions; the full hit list is shown to the maintainer before any edit; ambiguous digit-runs are asked, not guessed. Current hit list (re-derive before executing): 34 of 312 clubs, 20 emails, 24 phone-like runs. Three digit-runs look like non-phones and are proposed keeps (a year range "2002 - 2008"; two 15-16 digit messenger/group-id-shaped runs on keys `1466041249` and `austin`); two are ambiguous and proposed scrubs ("29 60389" on `954433125`; "603278769" on `1025613544`). Procedure: maintainer approves the hit list, edit the seed CSV, re-run the pipeline and assert parity (candidate output unchanged except descriptions), show the diff. Hit-list approval is still pending.

- **Mirror member extraction code lives outside the repo.** The production-shaping extraction code for the mirror member pipeline (the source of the ~1,600 club-only `historical_persons` rows) is currently reproducible only by the historical-pipeline maintainer. Commit it into `legacy_data/scripts/` before the MIGRATION_PLAN §24 State 3 → State 4 transition.

- **Curator media unification — residual (dead `freestyle_media_*` path removed).** The loader chain is gone (loaders 21/22/23, the migrate script, the dead generator `build_freestyle_media_csvs.py`, `media_links.csv`, the `reset-local-db.sh` calls, and the 3 `ci/assert_loader_row_counts.py` expectations). Remaining:
  1. **Schema half (David-owned platform schema).** Drop the `freestyle_media_sources/assets/links` tables from `database/schema.sql` AND `src/db/db.ts`, and repoint/retire `featured_media_id` (soft-refs `freestyle_media_assets`; live in `freestyleService.ts`). The platform still references these, so it is a coordinated change, not James-track.
  2. **`media_assets.csv` not yet deletable.** Keep the sibling `media_sources.csv` (`seed_fh_curator` reads it as the live media_sources FK registry). The item-6 coverage gate found `media_assets.csv` holds live items absent from `curated/freestyle_tricks/` sidecars: 3 un-migrated YouTube clips (`jy-Tjxfftqw`, `ft9SZPyXd54`, `2URvZFuxBls`, all confirmed live across two oEmbed runs); the 5 footbagspot pending-rehost rows (tracked in `footbagspot_pending_rehost.csv`, `reason=non_youtube_vimeo_url`); and the PassBack source video `u9S7zixV3Yw` (live; a source, not a trick clip). Migrate/resolve those, then delete `media_assets.csv` + `footbagspot_pending_rehost.csv`. Two rows (`vimeo/25019188`, `youtube/YdYxsp6l400`) looked dead but `YdYxsp6l400` flipped live↔dead between runs — re-confirm before dropping.
  3. **Curated-sidecar media-rot SUSPECTED, not confirmed.** The oEmbed sweep over the 190 sidecars was rate-limited: two independent runs returned different dead sets (16 vs 11, only `Dmr7zj_c7cY` in common) and an orphan flipped, so the per-URL dead results are untrustworthy. There is probably some rot, but re-check with request backoff + retries (or `verifyExternalVideoUrl` in small batches with delay) before treating any specific sidecar as dead. Do not act on the earlier 16-ID list.
  TT canonical-sidecar invariant: see `legacy_data/CLAUDE.md`.

- **Candidate live-content columns need loader coverage (James-track).** `legacy_club_candidates` now carries nullable `description` and `external_url` columns (platform-side schema add; the promotion path publishes them onto the live club, URL only after validation). The enrichment loader does not yet populate them from the mirror extraction, so platform-promoted clubs currently land with an empty description and no URL. Extend the candidate loader to carry both fields from `seed/clubs.csv` and re-run the load.

- **Cross-track: relocate `freestyle-dictionary-surface` from `.claude/skills/` to `exploration/`.** It self-identifies as exploration-derived but sits in the production skill tree where it auto-loads on freestyle-dictionary-UI prompts. Plan: (1) `mv .claude/skills/freestyle-dictionary-surface/SKILL.md exploration/freestyle-dictionary-surface.md` and `rmdir` the empty dir (touches `.claude/skills/`; coordinate with Dave); (2) update `exploration/freestyle-notation-grammar/PROPOSAL.md:579` to the new path; (3) update `legacy_data/scripts/build_structural_alias_adjudication.py` lines 5 and 522 to drop "skill" from the citations.

- **Freestyle pages fixes (mixed Dave-track: app/template/route/docs; and James-track: curator content).**
  1. Content (curator): `about.hbs` uses "moves"/"move" where canonical is "tricks"/"trick" (the Shred 30 paragraph's "adds per move", the Sick 3 paragraph's "substitute easier moves").
  2. Content (curator): Glossary §1 vocabulary-stabilization claim lacks an inline citation; add one if corpus-backed.
  3. Content (curator): the glossary's closing about-framing passage names nine community contributors by name; other freestyle pages don't. Decide public-attribution policy.
  4. UI standard (mixed-track: CSS is Dave-track; templates span both): bring the freestyle surfaces onto the VC §4.5 token standard. The non-freestyle site is already compliant; fonts are now tokenized site-wide and the `assert_conventions.sh` font gate scans the whole stylesheet. Remaining scope, per surface:
      - Tokenize the ~360 remaining long-tail hex literals plus raw radii/shadows (the recurring palette is tokenized into the parchment/earth/fern/steel and extended slate/gray groups); low-frequency one-offs need consolidate-or-name calls; new values enter `:root` as named tokens (the existing neutral/status/family token groups are the pattern).
      - Consolidate breakpoints 520/600/640/680/720/1023/1024 onto canonical 480/768.
      - Define the ~40 remaining undefined class tokens (dead tokens are removed; what remains are test-anchored contract classes needing real styling decisions) across `src/views/freestyle/**` and the 8 still-excluded freestyle partials; bespoke families (`dict-card`, `compositional-set-*`, ...) keep their vocabulary but inherit shared tokens per VC §4.5.
      - Gate updates are mandatory per surface, enforced mechanically: when a template becomes compliant, prune it from `EXCLUDED_FILES` / `EXCLUDED_DIRS` in `tests/unit/template-class-vocabulary.test.ts` (a companion test in that file fails while a compliant surface stays excluded, naming the entry to remove).

### BACKLOG (lower-priority active)

- **Educational family-card editorial pass (James-track curator content).** All 18 first-class families now have `freestyleGlossaryFamilyCards.ts` cards. The 9 formerly-uncarded families (eclipse, dada-curve, barfly, dyno, paradon, double-over-down, flurry, flail, butterfly-swirl) were added with STRUCTURAL fields derived from existing data only (canonicalFormula from each family's `operational_notation`, ADD from the anchor, descendants/compounds from DB membership, structurally-inferred siblings). REMAINING: author the editorial `observationalNotes` for each (left `[]` — not derivable from data, never fabricated) and review the derived `siblingFamilies` / `commonDescendants` framing. Touch point: `src/content/freestyleGlossaryFamilyCards.ts`.
- **Skill cleanup pass (cross-track, Dave executes on `.claude/skills/`).** Five James-owned skills carry implementation-status drift (dated waves/phases, non-portable memory cross-refs, em-dash prose) and some embed curator doctrine that belongs in canonical docs. Clean each to procedural-trigger form; move ontology/layer-separation invariants to DESIGN_DECISIONS and trick/modifier/alias semantics to DATA_MODEL. Skills: `footbag-freestyle-dictionary`, `footbag-curated-media`, `freestyle-topology-governance`, `migrate-browse-view`, `pipeline-invariant-enforcer`. Open structural calls: whether `freestyle-topology-governance` folds into `footbag-freestyle-dictionary`; whether `migrate-browse-view` retires if no unmigrated views remain; whether `footbag-curated-media` invariants relocate to a path-scoped `legacy_data/tools/trick_video_discovery/CLAUDE.md`.
- **Loader idempotency smoke test.** Run each loader twice; assert no exceptions and identical row counts.
- **FK-off bulk reseed investigation.** `08_load_mvfp_seed_full_to_sqlite.py:141` disables FK during bulk reload (re-enabled :550). Determine whether reorder or cascade-delete preserves FK-on.
- **`score_text` pass-through from legacy HTML.** Field exists; pipeline drops it. Extract consecutives counts + Sick 3 / routine descriptors; skip generic point totals.
- **Workbook parity QC.** Assert `canonical/events.csv` row count == workbook EVENT INDEX == year-sheet event union.
- **Override visibility.** `results_file_overrides.csv` and `events_overrides.jsonl` apply silently. Surface via `is_overridden` or a Data Notes sheet.
- **Top-level pipeline ergonomics.** `reset-local-db.sh` and `scripts/deploy-local-data.sh --db-only` are two fast-paths for the no-enrichment case; collapse or document. `EXPANDED_ARGS` duplicated between `deploy_to_aws.sh` and `scripts/deploy-to-aws.sh`.
- **Dictionary data-debt rows blocked from SCALE pilot.** (a) `fusion` (5-ADD, base `dod`): `dod` slug not active; add row or reclassify base. (b) `omelette` (3-ADD, modifier `illusioning`): `illusioning` ADD bonus unresolved; add to modifiers table or policy class. (c) `flurry` (4-ADD, base `legover`): `barraging` modifier example says 3, asserted ADD 4; reconcile.
- **Club-duplicate roster merge (replace drop-only dedup with curator-confirmed merge).** `overrides/club_duplicates.csv` today only suppresses a duplicate (`apply_club_duplicate_overrides()` in `clubs/scripts/02_build_legacy_club_candidates.py` sets `bootstrap_eligible=0`), which discards the dropped row's roster. Built data has 4 same-name+country duplicate clusters, all with rosters on both sides; only Les Pieds à Gilles (21+1) is curated. The three unhandled clusters split one real roster across two candidates: Penn State Footbag Club (3+3), Memphis Footworks (1+12), Caracas Footbag Club (junk 1 + pre_populate 1). Change the override from drop to merge: `keep_key` absorbs `drop_key`'s `legacy_person_club_affiliations` rows (union, dedupe by resolved person) and best-of candidate fields; record source keys for audit/reversibility. Curator-confirmed (one CSV), deterministic, pipeline-time; no similarity clustering, no platform-side `convergent_auto_merge` predicate, no admin merge/split UI. Source keys stay auditable in the override file and pipeline outputs per the ratified merge design; no DB column is involved.
- **Freestyle comment / text hygiene cleanup (James-track remainder).**
  - Problem: freestyle content modules carry forbidden planning baggage in comments and human-readable string values (slice / phase / wave labels, dated change-markers, doc-path and `exploration/` references). It misleads once a slice ships or is redesigned, and violates the comment standard in `.claude/rules/comments.md`.
  - Solution: rewrite each to a plain-words self-contained WHY, dropping the labels, dates, and doc references; genuine deviations use `Current:` / `Target:` and are recorded here in IP. Do NOT touch genuine data (ADD math, JOB / operational notation, formula strings) or real timestamps in tests.
  - Scope: `src/content/freestyle*.ts`, heaviest in `freestyleResolvedFormulas.ts`, `freestyleSymbolicEquivalences.ts`, `freestyleObservationalTricks.ts`, `freestyleAddAnalysisContent.ts`, including the `freestyleAliasGovernance.ts` `reason:` string values. (The app-side surface, views / partials / service / controller / routes / CSS, is already clean.)
  - Verify: the comment-standard ripgrep returns no freestyle hits; `npm run build` and the full test suite pass.

---

## BLOCKERS

- **Legacy-site data dump (legacy-site webmaster coordination).** Final source for `legacy_members`; supplies `real_name`, `legacy_email`, `legacy_user_id`, `country`, `city`, `region`, `bio`, `birth_date`, `ifpa_join_date`, `first_competition_year`, `is_hof`, `is_bap`, `legacy_is_admin`, `last_login`, `profile_modified`, `membership_tier_at_cutover`. Open: namespace agreement on `legacy_member_id`; MIGRATION_PLAN §2 + §8 rewrites depend on final structure; `tests/fixtures/factories.ts` may need extensions.
  - Current substitute: `load_legacy_members_seed.py` (2,505 rows; PK + `display_name` + `import_source='mirror'`).
  - Gates: auto-link coverage for club-only members; legacy-account-claim at registration (both on `legacy_email`); name_variants re-seeding from the final dump (the mirror-mined seed currently loads 303 high-confidence rows; 82 medium-confidence rows sit in the deferred file); shipping the public member-list surface (`/members` currently renders a welcome page with no list and no auth gate).
- **Freestyle rules content (IFPA).** Wording for Routine, Circle, Sick 3, Shred 30. Re-enables the Rules buttons dropped from `/freestyle` competition-format cards.
- **Red Husted Wave 2 reply.** Six grammar-level questions: blurry transitivity, barraging operator class, atomic family X-dex scope, operator-vs-trick boundary + Fairy weight, compression intent, hidden-vs-flat preservation. Freestyle trick-dictionary expansion + PassBack intake promotion both gated. See `project_red_consultation_state`.
- **Data review sign-off (G20).** Confirmation that legacy data is complete and member-list presentation is reviewed, recorded as the `legacy_pipeline.data_review_signoff` audit row (historical-pipeline maintainer as actor). The cutover checklist's `G20-SIGNOFF` gate asserts the row; legacy-data surfaces must not ship to production without it. No runtime flag and no auth-gate removal are involved.

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
