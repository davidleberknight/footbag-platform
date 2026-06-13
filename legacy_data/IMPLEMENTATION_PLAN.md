# legacy_data/IMPLEMENTATION_PLAN.md

Historical-pipeline maintainer's track. Pipeline architecture, loader invariants, and MIGRATION_PLAN routing live in `legacy_data/CLAUDE.md`. ACTIVE-only; shipped work is deleted (IP-is-AI-facing). Closed-exploration state lives in memory entries and `exploration/_archive/`.

---

## ACTIVE NOW

- **Curator media unification — residual.** No James-side loader populates `freestyle_media_*` anymore; remaining:
  1. **`media_assets.csv` not yet deletable.** Keep the sibling `media_sources.csv` (`seed_fh_curator` reads it as the live media_sources FK registry). The item-6 coverage gate found `media_assets.csv` holds live items absent from `curated/freestyle_tricks/` sidecars: 3 un-migrated YouTube clips (`jy-Tjxfftqw`, `ft9SZPyXd54`, `2URvZFuxBls`, all confirmed live across two oEmbed runs); the 5 footbagspot pending-rehost rows (tracked in `footbagspot_pending_rehost.csv`, `reason=non_youtube_vimeo_url`); and the PassBack source video `u9S7zixV3Yw` (live; a source, not a trick clip). Migrate/resolve those, then delete `media_assets.csv` + `footbagspot_pending_rehost.csv`. Two rows (`vimeo/25019188`, `youtube/YdYxsp6l400`) looked dead but `YdYxsp6l400` flipped live↔dead between runs — re-confirm before dropping.
  2. **Curated-sidecar media-rot SUSPECTED, not confirmed.** The oEmbed sweep over the 190 sidecars was rate-limited: two independent runs returned different dead sets (16 vs 11, only `Dmr7zj_c7cY` in common) and an orphan flipped, so the per-URL dead results are untrustworthy. There is probably some rot, but re-check with request backoff + retries (or `verifyExternalVideoUrl` in small batches with delay) before treating any specific sidecar as dead. Do not act on the earlier 16-ID list.
  TT canonical-sidecar invariant: see `legacy_data/CLAUDE.md`.

- **Club classification force-overrides (operating procedure; force-keep / force-junk).**
  Human classification overrides are hand-edited rows in
  `overrides/club_classification_overrides.csv`, schema `club_key,name,force_category,reason`,
  `force_category` one of pre_populate / onboarding_visible / dormant / junk. Force-keep = a row
  with the non-junk target category; force-junk = a row with `force_category=junk`. Procedure:
  (1) re-derive `club_key` from `seed/clubs.csv` by name, never guess; (2) fill `name` and
  `reason` so the row is auditable on its own; (3) re-run
  `clubs/scripts/02_build_legacy_club_candidates.py` and check its applied-override count and
  diff-vs-previous-run output; (4) run QC. The loader fails loudly: unknown `force_category`
  raises ValueError; a `club_key` absent from the candidate set raises KeyError (delete stale
  rows). A key in `club_duplicates.csv`'s drop set keeps `bootstrap_eligible=0` regardless of a
  force-keep. The platform queue is not part of this loop pre-go-live; the story's platform-side
  request verbs are deferred to live operation (root IP entry).

- **A-priori honors-flag validation against the public rosters (M12, data side).** The imported `is_hof` / `is_bap` flags drive an automatic Tier 2 grant at claim, so a wrong flag mis-grants tier. Add a test-load cross-check of imported `is_hof` / `is_bap` against the authoritative public rosters, footbaghalloffame.net (HoF) and bigaddposse.com (BAP), flagging mismatches for curation before go-live. This a-priori check is the v1 honors-oversight mechanism; the daily email digest is retired (root IP / USER_STORIES), and ongoing oversight is community self-policing plus admin revert.

- **Cross-track: relocate `freestyle-dictionary-surface` from `.claude/skills/` to `exploration/`.** It self-identifies as exploration-derived but sits in the production skill tree where it auto-loads on freestyle-dictionary-UI prompts. Plan: (1) `mv .claude/skills/freestyle-dictionary-surface/SKILL.md exploration/freestyle-dictionary-surface.md` and `rmdir` the empty dir (touches `.claude/skills/`; coordinate with Dave); (2) update `exploration/freestyle-notation-grammar/PROPOSAL.md:579` to the new path; (3) update `legacy_data/scripts/build_structural_alias_adjudication.py` lines 5 and 522 to drop "skill" from the citations.

- **Legacy member-account import: build the raw-dump → `legacy_members` extraction (cutover-blocking; MIGRATION_PLAN §2 / §19, State 4 step 3; see the "Legacy-site data dump" BLOCKER below for the data dependency).** The webmaster delivers the legacy member data as a raw per-module MariaDB dump, same format for the test load and the final post-write-freeze export (the dump arrives as per-module `*/backups/latest.sql` files; operator-supplied, never committed). The test dump is reachable read-only via the gitignored `footbag.org` symlink at repo root (-> the operator's legacy clone). The CSV→DB loader `scripts/load_legacy_export.py` ALREADY EXISTS and owns ALL source-validity filtering, the linkage pull-back, the credential-header abort, the upsert on `legacy_member_id`, and per-rule exclusion counts. **The extraction + admin + export-validation are BUILT, tested, and dry-run-validated against the real dump (see status below); the remaining gap is tier derivation, is_hof/is_bap roster-join, and the production `--apply` at cutover.** All scripts read the dump read-only and write only CSV / report outputs, never the real-data trees.

  **Status / findings (Phases 1+2, validated against the real test dump via loader `--dry-run`):** ~33,665 dump rows → **25,495 importable** (8,010 excluded `MemberValid≤0`, 162 email-conflict, 2 linkage pull-backs; 23,002 new + 2,493 mirror-reconciled); profile coverage real_name 100% / country 99.9%; 73 valid admins, all matched a member row. **Dump-schema corrections (the spec was wrong on these):** the `members` table DOES carry the full IFPA block (`MemberIFPAJoined`/`Tier`/`Expiration`/`Paid`/`PaymentDate`/`PrevExp`), so `ifpa_join_date` + the tier signals are members-level (no `ifpa_memberpayments` join needed for precedence 2–5); `MemberEmail2`/`MemberEmail3` are 0% populated (claim matching is effectively primary-email + name); ~6,840 of 33,665 accounts have no `MemberAlias`/user_id. **Data-quality item:** `historical_persons` carries a non-integer stub `legacy_member_id` `STUB_FOOTBAG_HACKY` (not a real account; `validate_legacy_export.py` reconciles real ids and reports stubs rather than hard-failing).

  1. **`scripts/extract_legacy_members.py`** — **BUILT + tested** (`tests/test_extract_legacy_members.py`). Parse the dump's `members/backups/latest.sql`; emit the canonical credential-free CSV `load_legacy_export.py` consumes (UTF-8, LF, RFC 4180, empty string for NULL, ISO 8601 dates, comma delimiter; headers the loader's alias table recognizes).
     - **Source-validity filter — owned by `load_legacy_export.py`, NOT the extractor.** The loader already applies the full filter (`MemberValid` ≤ 0, no-identity, exact-duplicate, test / placeholder, cross-column email + user_id conflict), the **linkage pull-back** (a row referenced by `historical_persons.legacy_member_id` is re-included even when otherwise excluded), the per-rule exclusion counts, and a same-`MemberID`-differing-data hard-fail. The extractor must NOT duplicate any of this: emit every member with `member_valid` verbatim and let the loader filter and pull back. The extractor emits only the **dump-level** counts the loader cannot see (examined, distinct-`MemberID`, per-email-column populated `MemberEmail` / `MemberEmail2` / `MemberEmail3`), so the true account count and secondary-email prevalence are known on the first test-load run (M11).
     - **Credentials:** drop `MemberPassword` and `MemberSession` entirely; never read them into the CSV (the loader's credential-header abort is the backstop, not the primary guard). `load_legacy_export.py` `CREDENTIAL_HEADER_RE` matches the password family plus `session` / `token` / `cookie` / `auth`, and aborts the load before any write.
     - **Column → field map** (legacy `members` column → `legacy_members` field):
       - `MemberID` → `legacy_member_id` (PK; old-site account id; same namespace as `members/profile/{id}` URLs)
       - `MemberAlias` → `legacy_user_id` (the handle, product term "legacy username"); also the `display_name` candidate
       - `MemberEmail` → `legacy_email`; distinct `MemberEmail2` / `MemberEmail3` → `legacy_email2` / `legacy_email3`. A legacy account's three emails all participate in claim matching; an address shared across accounts (primary on one, secondary on another) is flagged by the G1 cross-column collision gate (`scripts/validate-legacy-import-gates.sh`) before cutover and excluded at load by `load_legacy_export.py`.
       - `MemberFirstName` / `MemberLastName` / `MemberMiddleName` (+ parallel `*Unicode` columns) → `real_name` (Unicode column first, latin1 transcode fallback)
       - `MemberCity` / `MemberState` / `MemberCountry` (+ `*Unicode`) → `city` / `region` / `country` (nullable per §15.2)
       - `MemberComment` → `bio`
       - `MemberBirthMonth` / `MemberBirthDay` / `MemberBirthYear` → `birth_date` (assemble three ints)
       - `MemberAddress1` / `MemberAddress2` → `street_address`; `MemberZIP` → `postal_code`
       - `MemberIFPAJoined` → `ifpa_join_date`
       - `MemberIFPATier` + payment / expiry fields → the five §15.16 tier fields (derived; see script 3)
       - `is_hof` / `is_bap` → **enrichment fields, NOT members-dump columns**: derived by identity-join against the local `legacy_data` rosters (`inputs/fbhof_data*.csv` for HoF, `inputs/bap_data_updated.csv` for BAP). `legacy_is_admin` is likewise relational (the `admins` table, script 2), not a members column.
       - `MemberAnnounceOptIn` / `MemberEmailOptIn` → **NOT imported.** Resolved (MIGRATION_PLAN §28 item 1): legacy mailing opt-in is not carried forward as active consent and no `members` column is added; members set subscriptions fresh post-claim.
       - `MemberPassword`, `MemberSession` → dropped (never imported)
     - **Tests (M1):** fixture-based tests for `extract_legacy_members.py` covering the column→field map, the credential drop, the three-email handling, and the dump-level count emission. (Source-validity filtering is the loader's; its tests live in `test_load_legacy_export.py`.) This extractor is the highest-impact untested transform and does not ship to the State 4 run without tests.

  2. **`scripts/extract_legacy_admins.py`** — **BUILT + tested** (kept separate from script 1; reuses its tuple parser). Derives `legacy_is_admin`. There is NO `banned` / `blocked` column and NO admin flag on `members`; admin status is relational. Source: the `admins` table (test load 108 rows; in the dump's `members/admin/backups/latest.sql`), keyed `AdminID = MemberID`, with `AdminValid` and `AdminRealm` (scope). Set `legacy_is_admin = 1` where `AdminValid = 1`. Audit metadata only; never auto-promotes a live admin role. (The only negative signals in the dump are `MemberValid=0`, already filtered, and `MemberEmailInvalid`.)

  3. **`scripts/derive_legacy_tier_fields.py`** — **REMAINING (deferred).** Compute the five §15.16 tier fields (gate G6). Simpler than first specced: the core signals (`MemberIFPATier`/`Expiration`/`Paid`/`PaymentDate`/`PrevExp`/`Joined`) are members-level, with `ifpa_memberpayments` + `ifpa_membership_transactions` for history. The five columns are NOT yet in `database/schema.sql` (deferred fresh-build extension, added when G6 PASSes per §15.16 — a platform-schema change coordinated with Dave). Source-signal map:
     - `legacy_ever_paid_tier2` ← `ifpa_memberpayments.PaymentLevel` history + `MemberIFPAPrevExp`
     - `legacy_ever_paid_tier1_lifetime` ← `ifpa_memberpayments` (lifetime tier-1 purchase)
     - `legacy_tier1_annual_active_at_cutover` ← `MemberIFPATier` + `MemberIFPAExpiration` active at cutover
     - `legacy_was_board_at_cutover` ← **not yet delivered**: the `groups/backups` dump (`ifpa_committees`, `ifpa_committee_members`) was held back for size and the webmaster will supply it; the committee data exists (the tables are not empty). Until it arrives, derivable only if `MemberIFPATier` encodes a Tier-3 value; once delivered, derive board status from the committee tables. §3 precedence 1 drops only if the data proves insufficient after delivery.
     - `legacy_board_underlying_paid_tier` ← moot unless board members are identifiable (see above); else from prior `ifpa_memberpayments` tier.
     - Spot-check each field against known reference cases (HoF / BAP with documented payment history, board-at-cutover, known lifetime-tier1 payers). If insufficient overall, G6 PASSes via the honors-only fallback (§3 precedence rows 3–5 dropped; HoF / BAP → tier2, else tier0); record the fallback decision in MIGRATION_PLAN §28.

  4. **`scripts/validate_legacy_export.py`** — **BUILT + tested.** Read-only export-CSV gate report for G2 (`legacy_user_id` unique where non-empty), G4 (real_name ≥95% / country ≥50%), G5 (`legacy_member_id` integer-format + unique + `historical_persons` overlap reconciliation; non-integer stub ids are reported, not hard-failed). G1 (cross-column email collision) stays in `scripts/validate-legacy-import-gates.sh` + the loader. Open: the mirror `members/profile/{id}` id-set reconciliation half of G5 (the `historical_persons` half is done).

  5. **Loader — already built.** `scripts/load_legacy_export.py` (CSV → `legacy_members`; supersedes the mirror pre-seed on the shared `legacy_member_id` namespace; flips `import_source` 'mirror'→'legacy_site_data'; never touches claim-state columns). Script 1's CSV is its input; no new loader needed.

  **Sequencing:** the full chain (extract → admin → validate → loader `--dry-run`) is DRY-RUN-VALIDATED against the test dump. Remaining before the State-4-step-3 production `--apply`: (a) script 3 tier derivation + its Dave-coordinated G6 schema columns; (b) `is_hof`/`is_bap` derivation by identity-join against the local `inputs/fbhof_data*.csv` / `inputs/bap_data_updated.csv` rosters (the current chain leaves both blank → loader defaults them to 0); (c) the mirror-id-set half of G5; (d) the final post-write-freeze export.

### BACKLOG (lower-priority active)

- **Educational family-card editorial pass (James-track curator content).** Nine families carry STRUCTURAL fields only (eclipse, dada-curve, barfly, dyno, paradon, double-over-down, flurry, flail, butterfly-swirl): author the editorial `observationalNotes` for each (left `[]` — not derivable from data, never fabricated) and review the derived `siblingFamilies` / `commonDescendants` framing. Touch point: `src/content/freestyleGlossaryFamilyCards.ts`.
- **Skill cleanup pass (cross-track, Dave executes on `.claude/skills/`).** Five James-owned skills carry implementation-status drift (dated waves/phases, non-portable memory cross-refs) and some embed curator doctrine that belongs in canonical docs. Clean each to procedural-trigger form; move ontology/layer-separation invariants to DESIGN_DECISIONS and trick/modifier/alias semantics to DATA_MODEL. Skills: `footbag-freestyle-dictionary`, `footbag-curated-media`, `freestyle-topology-governance`, `migrate-browse-view`, `pipeline-invariant-enforcer`. Open structural calls: whether `freestyle-topology-governance` folds into `footbag-freestyle-dictionary`; whether `migrate-browse-view` retires if no unmigrated views remain; whether `footbag-curated-media` invariants relocate to a path-scoped `legacy_data/tools/trick_video_discovery/CLAUDE.md`.
- **Loader idempotency smoke test — Tier C remainder.** `test_loader_idempotency.py` covers the cleanly-feedable loaders (09, 10, name-variants, 06). Remaining: the loaders needing heavier fixtures or fixed committed/generated paths — the MVFP seed loader (08, `--seed-dir` of many CSVs), the trick-dictionary loaders (17/19, curated CSVs), and the `--db`-only seed loaders (11, `load_clubs_seed`, `load_club_members_seed`, `load_legacy_members_seed`). Each needs a synthetic fixture harness before it can run twice in isolation.
- **FK-off bulk reseed investigation.** `08_load_mvfp_seed_full_to_sqlite.py:140` disables FK during bulk reload (re-enabled :551). Determine whether reorder or cascade-delete preserves FK-on.
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
- **Records with non-canonical trick_names (48 orphans; important when the promotion sprint resumes).** About 48 of the 165 trick_names on records that carry a video resolve to neither an active `freestyle_tricks.slug` nor a `freestyle_trick_aliases.alias_slug` (e.g. "Alpine PLO", "DDD", "DSO", "Double Dyno", "Backside Magellan"). They badge nowhere in the trick dictionary and likely never surface on a trick detail page either (the detail page matches records by canonical-plus-alias slugs, the same resolution). Overlaps the known DDD / DSO / PLO abbreviation cleanup. Resolve by canonicalizing or aliasing each orphan name (upstream in `inputs/curated/records/records_master.csv` or via `freestyle_trick_aliases`) so each record links to its trick. Surfaced by the "Record video" badge work (trickNameToSlug vs the canonical/alias sets).
- **Freestyle frontier promotion — remaining levers (James-track).** Surging compound chassis (`CLIP > OP IN [DEX] >> (back) SPIN [BOD]`, +2) and the inherited-ordering method closed Group C (4 surging rows + reverse-swirling-paradox-symposium-whirl); 8 of 21 Group A op_notations backfilled. Staged in `inputs/curated/tricks/red_additions_2026_04_20.csv` + `red_corrections_2026_04_20.csv`, rendered by `event_results/scripts/19_load_red_additions.py` + parser-populate. Durable doctrine + method live in `project_fm_promotion_arc`. Open levers, each needing a curator call (not derivation):
  1. **Same-operator-twice doctrine.** Corpus audit found ZERO published/derived precedent for any operator applied twice. Blocks double-miraging (pixie-miraging-symposium-miraging-legover, spinning-miraging-symposium-miraging-refraction), double-illusioning (illusioning-symp-illusioning-legover), double-paradox (paradox-blur), double-atomic (atomic-eggbeater via eggbeater == atomic-legover). One ruling on double-operator coherence unblocks all + their op_notation.
  2. **blazing + terraging operator definitions** (undefined tokens, 0 op_notation exemplars to mirror). Blocks 11 of the 13 held Group A op_notation backfills plus further blazing/terraging promotions. Needs curator ADD-weight + chassis.
  3. **crossbody/xbd register + xbd-rake base (~47).** Biggest authoring lever (already the headline item in `project_fm_promotion_arc`).
  4. Two unusual-base rows: spyro-gyro, backside-symposium-toe-blizzard.
  Cross-track: the `footbag-freestyle-dictionary` skill posture (surging chassis, same-operator-twice doctrine, and symposium-blizzard now released from the do-not-re-promote list, 8->7) needs a Dave-side refresh; fold into the Skill cleanup pass above.
- **Glossary finalization — pending (James-track).** Three items to close, separate from the family-card editorial pass already listed above:
  1. **§6 anchor migration** — migrate the glossary §6 (Modifier Reference) per-term anchors. Coordinate with the semantic-token deep-link targets (`#term-{slug}`) so no live deep-link breaks.
  2. **Modifier-reference de-duplication** — collapse the duplicated §6 modifier-reference content.
  3. **Advanced-reference consolidation** — consolidate the advanced-reference material.

---

## BLOCKERS

- **Legacy-site data dump (legacy-site webmaster coordination).** Final source for `legacy_members`; supplies `real_name`, `legacy_email`, `legacy_user_id`, `country`, `city`, `region`, `bio`, `birth_date`, `ifpa_join_date`, `first_competition_year`, `is_hof`, `is_bap`, `legacy_is_admin`, `last_login`, `profile_modified`, `membership_tier_at_cutover`. The test dump has arrived (the `members`, `admins`, and `ifpa_memberpayments` tables are in hand), so the extraction chain can be dry-run now; the committee/board table (`ifpa_committee_members`, the board-at-cutover source) is still pending delivery. Open: the final post-write-freeze export taken at cutover; namespace agreement on `legacy_member_id`; MIGRATION_PLAN §2 + §8 rewrites depend on final structure; `tests/fixtures/factories.ts` may need extensions.
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
- **SYMBOLIC-GRAMMAR-3 (data-home decision; deploy bug un-broken).** Deploy bug FIXED: `docker/web/Dockerfile` now copies `exploration/symbolic-grammar-2/` into the web runtime image (only the web image renders the freestyle pages; worker/image images don't), so `symbolicGrammarService` finds its CSVs and the trick-detail + glossary symbolic-grammar panels populate in staging/production. The data dir stays where it is because it is a generator I/O hub (`build_symbolic_grammar_2.py` writes it, `build_glossary_synthesis_1.py` reads it), so relocating to `src/content` would desync both generators; copying the committed dir is the surgical interim. A ship-the-data regression guard pins the COPY (`tests/unit/dockerfile-symbolic-grammar-data.test.ts`). STILL OPEN: the permanent data home — load into SQLite as explicitly observational tables read via `db.ts` (platform schema + service-read half needs Dave coordination), gated by the reversible-governance doctrine (no observational/taxonomy schema migration until post-Wave-2 Red answers + curator triage). When that lands, drop the Dockerfile COPY + its guard and retire the CSV adapter.
- **Mirror-local MP4 trick snippets.** Need a non-embed ingestion path (file-backed media_items / admin upload / re-host / snippet pipeline).
- **Canonical / canonical_all unification.** Merge post-1997 + pre-1997; retire `canonical_all`.
- **Version stamps in outputs.** `build_version`, `build_date`, `identity_lock_version` in workbook + canonical CSVs.
- **DATA NOTES sheet in workbook.** Excluded events, sources, meaning of "unknown".
