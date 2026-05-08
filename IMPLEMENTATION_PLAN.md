# IMPLEMENTATION_PLAN.md

This file tracks the current build: active sprint, accepted temporary dev shortcuts, and external blockers. Long-term design lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`. The go-live migration detail is here: `docs/MIGRATION_PLAN.md`; anything narrower than these docs is implicit future work and is not enumerated here. See also `legacy_data/IMPLEMENTATION_PLAN.md` for data preparation / James' sprint planning. For all of these files, do not read unless necessary for current work.

## Accepted temporary deviations

### Member upload + gallery write deviations

1. **Tier 1 gating not enforced on member upload + gallery writes.** `POST /members/:memberKey/galleries{,/...}` and `POST /members/:memberKey/media/upload` admit any authenticated member; USER_STORIES M_Upload_Photo / M_Submit_Video / M_Organize_Media_Galleries reserve these for Tier 1. Unblock: platform-wide tier enforcement + tier gate on these routes.

### Adapter parity deviations

1. **SecretsAdapter not yet implemented.** DD §3.6 specifies `SecretsAdapter` (SSM GetParameter in production, local JSON file in development) for Stripe keys, Stripe webhook secrets, admin bootstrap tokens, and other exportable credentials. No such consumer exists in the current code: `SESSION_SECRET` lives in the host env file per DD (not in scope for `SecretsAdapter`); JWT signing and ballot encryption are KMS-backed via their own adapters. Unblock: first time a Parameter-Store-bound secret is needed (likely Stripe integration or the admin bootstrap path).

### System health deviations

1. **Readiness probe is SQLite-only.** SERVICE_CATALOG.md `SystemBackgroundJobsService.checkReadiness()` composes the readiness signal for `/health/ready`. Current implementation probes SQLite only; KMS, SES, and S3 backup health are not included. Unblock: when a downstream system's failure mode requires inclusion in readiness.

### Legacy claim deviations

1. **`/history/claim` runs the direct-lookup shortcut.** VIEW_CATALOG.md route-rules block specifies a two-step token flow (lookup form, emailed token, confirm-and-merge handler). Current implementation is the early-test shortcut: direct lookup + confirm + merge in-session, no emailed token. Unblock: production-readiness work; cutover prerequisite per MP Phase 4.

### Club bootstrap leader rendering deviations

1. **34 of 51 bootstrap leaders silently dropped by INNER JOIN to `historical_persons`.** Both `clubs.listBootstrapLeadersByClubId` (Phase 1, detail page) and the new `clubs.listAllBootstrapLeaders` (country-page summary) inner-join `historical_persons` on `legacy_member_id`. Bootstrap leaders whose `legacy_member_id` has no `historical_persons` row are dropped at query time; they never render. The pipeline that loads `historical_persons` (`08_load_mvfp_seed_full_to_sqlite.py`) only includes people who appear in competition results, while bootstrap leaders include people who were club leaders without competition appearances. Net effect on a fresh DB: ~17 of ~51 leaders render publicly; 34 are invisible. Visibility-by-rendering: USA 2/7, Germany 2/6, Canada 0/6. Unblock: pick one path —
   - **Path A (data fix):** backfill `historical_persons` rows for the 34 leader-only `legacy_member_id`s during `08_load_mvfp_seed_full_to_sqlite.py` or in a post-pass; HP rows would need a `source_scope` distinct from `CANONICAL` to mark leader-only origin.
   - **Path B (query fix):** convert both queries to `LEFT JOIN historical_persons` and `COALESCE(hp.person_name, <fallback>)`; fallback source could be `legacy_members.real_name`, requiring service shaping to know the row may be HP-less and adjust `personId`-driven `/history/{personId}` link behavior accordingly.

   Path A keeps the rendering invariant ("every visible leader has a historical-person identity"); Path B accepts that some leaders are name-only on the public surface. Decision needed before relying on country-page leader counts as a coverage signal.

## Owner-approved fixes pending

### `scripts/reset-local-db.sh` missing club bootstrap-leader loader

**Symptom.** After every `scripts/reset-local-db.sh`, `club_bootstrap_leaders` is empty. Both the detail-page Leaders section and the country-page leader summary render against zero rows; no leader information appears on any public club page until the loader is run manually.

**Owner gate.** `scripts/reset-local-db.sh` is Dave-owned; AI does not edit. Track and hand off.

**Fix.** Add this block to `scripts/reset-local-db.sh` after the `load_club_members_seed.py` step. The required upstream tables (`legacy_club_candidates`, `historical_persons`) are already populated by earlier steps in the chain.

```bash
echo "  → Loading club bootstrap leaders..."
"${PYTHON}" legacy_data/clubs/scripts/07_load_bootstrap_leaders.py --db "${DB_FILE}"
```

**Verify.**
```bash
sqlite3 database/footbag.db "SELECT COUNT(*) FROM club_bootstrap_leaders WHERE status IN ('provisional','claimed');"
# → ~51 rows
```
Then `/clubs/usa`, `/clubs/germany`, `/clubs/canada` should render leader summaries on at least one club card each.

**Manual workaround until merged.** Run the loader directly after each reset:
```bash
scripts/.venv/bin/python3 legacy_data/clubs/scripts/07_load_bootstrap_leaders.py --db database/footbag.db
```
