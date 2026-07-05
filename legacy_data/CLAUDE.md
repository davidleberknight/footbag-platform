# Historical Footbag Pipeline + Platform DB

## Scope

This subtree prepares canonical historical data and loads it into the platform DB.

Stay in this lane:
- Do not modify repo-root code, repo-root docs (except the shared `IMPLEMENTATION_PLAN.md`, which both maintainers own), `.claude/skills/`, or `.claude/rules/`.
- For repo-root/platform tasks, use repo-root `CLAUDE.md` and `IMPLEMENTATION_PLAN.md`.
- `legacy_data` is primarily the data and freestyle maintainer's area, but task ownership is not siloed: any maintainer may pick up work here, and the data/freestyle maintainer may pull other board tasks. Coordinate on overlapping in-flight changes.
- Never run `git commit`, `git push`, or `git pull`. Stage-only changes are allowed; the human owns commits.

## Source of truth

Authoritative data flow:

```text
curated / mirror / overrides
  -> out/canonical/*.csv
  -> pipeline/platform/export_canonical_platform.py
  -> event_results/canonical_input/*.csv
  -> pipeline/build_workbook_release.py
  -> out/Footbag_Results_Release.xlsx
  -> platform DB enrichment/loaders
```

Key rules:
- `out/canonical/*.csv` is authoritative pipeline output. Never edit it directly.
- The workbook is derived only.
- Mirror HTML is the highest-priority source for 1997-present results.
- Structured curated CSVs are authoritative for pre-1997 intake.
- Identity lock files are frozen except through the patch toolchain.
- Unknown data stays unknown. Never fabricate results.

## Local-only inputs and their scripting

Two crucial legacy inputs sit outside version control and are never committed here; never name their machine-local paths in committed text.

- **The static footbag.org mirror** (`mirror_footbag_org/`): a separate, gitignored resource not committed in this repo, produced by `create_mirror_footbag_org.py` (`create_mirror.sh`) and consumed by the results pipeline (`run_pipeline.sh`), the clubs extractor (`scripts/extract_clubs.py`), and name-variant mining. It is the highest-priority source for 1997-present results and also preserves rendered legacy content pages (including the related-links directory), so it is a content-preservation layer: a legacy content domain the mirror captures is not automatically an uncatalogued loss risk even when it is absent from the dump. It is a static snapshot — refresh it before regenerating canonical output, or a stale crawl silently drops recently-completed events (see the canonical-ahead-of-mirror caveat under Pipeline invariants).
- **The legacy footbag.org database dump**: reached read-only through a symlink to a separate footbag.org repository clone (not part of this repo, never written to). It is the complete database export from the current site, as per-module backup SQL files, and spans far more than member and results data — members and admins (`member_data_scripts/extract_legacy_members.py`, `extract_legacy_admins.py`), memberships and payments, committees and board, groups, votes, mailing lists, and site content such as member tips and moves metadata (`scripts/extract_footbag_org_member_tips.py`, `extract_footbag_org_moves_metadata.py`), plus the sealed legacy archive (`legacy_archive/scripts/ingest.py`). Extractors only read it. Delivery status (which modules have arrived, which are pending) is tracked in `IMPLEMENTATION_PLAN.md`; the machine-local symlink path lives only in the operator's memory.

## Runbook routing

Use the runbooks instead of improvising:

| Task | Runbook |
|---|---|
| Full pipeline run | `runbooks/complete-pipeline.md` |
| Rebuild / QC / canonical validation | `runbooks/historical-pipeline.md` |
| Add pre-1997 source | `runbooks/promote-curated-source.md` |
| Workbook work | `runbooks/workbook-v22.md` |
| Identity rebuild | `runbooks/rebuild-identity-pipeline.md` |
| Alias cleanup | `runbooks/cleanup-alias-pattern-c.md` |
| QC investigation | `runbooks/pipeline-diagnostics.md` |

DB mutation safety lives in `.claude/rules/db-write-safety.md`.

## Non-negotiable safety rules

- QC must pass before canonical-output changes are committed.
- Never edit generated canonical CSVs directly.
- Never edit identity lock files directly.
- All exclusions must be traceable in `overrides/`.
- Verify external URLs before reviewer sign-off. Pattern extrapolation is not verification.
  - Unverified extrapolated URLs may sit in staging with blank `reviewer`.
  - Before promotion, confirm by browser, WebFetch, curl, or source-site index.
  - Capture verification in `notes`, for example: `WebFetch 200 YYYY-MM-DD`.
- For wide curated CSV batch edits, use `sed -i`; do not round-trip with `csv.DictReader -> csv.DictWriter`.
  - `DictReader` can place extra columns under a literal `None` key and truncate files on write.
  - Always `wc -l` before and after.
- Prefer one-command workflows defined in skills/runbooks.

## Pipeline invariants

Identity and canonicalization:
- `AliasResolver` is the sole identity authority.
- Alias merges happen upstream only.
- Name normalization is deterministic: NFKC, lowercase, trim.
- Name-variant generators are idempotent.
- Person-likeness gates filter non-person rows.
- No team names in person entities.
- Honor overrides are secondary to `AliasResolver`.

Canonical outputs:
- Canonical CSVs are deterministic: LF, UTF-8, sorted.
- Only HIGH-confidence rows reach DB.
- Corrections carry provenance metadata.
- Workbook person visibility follows the platform filter.
- Federations such as WFA/NHSA may act as host clubs for early events.
- The committed canonical CSVs can be ahead of the local mirror. The committed
  `event_results/canonical_input/*.csv` were generated from a more recent
  footbag.org crawl than the `mirror_footbag_org/` present in a typical local
  checkout. A handful of recently-completed events appear in the committed CSVs
  but not in a locally-rebuilt `out/canonical/`, because the parser drops events
  whose results the older local crawl never captured (their show pages are
  results-less stubs). Do not run a canonical regeneration and commit the result
  from a checkout whose mirror predates those events — it silently deletes them.
  Refresh the mirror first, or treat the committed CSVs as source of truth.

## DB invariants

- Soft delete with `deleted_at`; never hard delete.
- Audit logs are append-only.
- Unique constraints use partial indexes.
- Services enforce business rules; the DB layer stays dumb.
- Controllers contain no SQL or business logic.
- Ambiguous identity resolution never auto-selects.
- Auto-link requires a strong multi-anchor match.
- `name_variants` stores high-confidence entries only.
- Integration tests use real SQLite DBs and isolated temp DBs.
- Writes are transactional.

## Loader contract

For pipeline-regenerated tables:
- Use DELETE + INSERT, not `INSERT OR IGNORE` alone.
- Scope deletes where multiple owners share a table.
  - Example: `DELETE WHERE source='mirror_mined'`.
  - Example: `DELETE WHERE source_scope='PROVISIONAL'`.
- Use one transaction spanning delete and insert; commit once.
- Report honest counters.
  - Good: increment only when `rowcount` shows an insert.
  - Bad: raw `+= 1` after `INSERT OR IGNORE`.
- Every skipped row needs a named category: dedup, FK miss, PK collision, bad row, etc.

## Workbook contract

The only supported workbook pipeline is:

```text
out/canonical/*.csv
  -> pipeline/platform/export_canonical_platform.py
  -> event_results/canonical_input/*.csv
  -> pipeline/build_workbook_release.py
  -> out/Footbag_Results_Release.xlsx
```

Removed legacy builders must not be reintroduced:
- `pipeline/03_build_excel.py`
- `pipeline/04_build_analytics.py`
- `Footbag_Results_Canonical.xlsx`

`build_workbook_release.py` reads only:
- `event_results/canonical_input/`
- `inputs/review_quarantine_events.csv`
- `inputs/identity_lock/`
- `inputs/curated/`

Important:
- EVENT INDEX must match `canonical_input/events.csv` row-for-row.
- If it diverges, debug `build_event_index` or the population of the `events` dict.
- The 30-event delta between `out/canonical/events.csv` and `event_results/canonical_input/events.csv` is intentional. `export_canonical_platform.py` drops sparse disciplines, then drops events with zero remaining disciplines.

## Event-key convention

Default:

```text
event_key = YYYY_city_slug
```

Examples:
- `1985_worlds_golden`
- `2003_eastregion_australia`

Same-year, same-city, multi-org collisions take city + org suffix:
- `1983_worlds_boulder_nhsa`
- `1983_worlds_boulder_wfa`
- `1984_worlds_golden_wfa`
- `1984_worlds_golden_fbw`

No-city exception keys retain non-`YYYY_city_slug` form because the events are not single-city:
- `1982_westregion`
- `1983_oregon_state`
- `1983_secret_underground`

Do not invent synthetic cities for these exceptions.

## Clubs pipeline

Extraction:
- `scripts/extract_clubs.py`
- Mirror HTML -> `seed/clubs.csv`
- Includes `contact_member_id` from `members/profile/{id}` plus `contact_email`.

URL safety verification (data-prep time, no app callout):
- `npm run verify:seed-urls -- --clubs-only` (run_pipeline.sh Phase B) reuses the Node validator and writes `seed/clubs_url_verdicts.csv` (per-`legacy_club_key` `validated_at` / `quarantine_reason`). Idempotent: already-verdicted URLs are kept, so a normal run makes no network callout. Real Safe Browsing verdicts require the live adapter configured in the run environment.
- The loaders (`load_clubs_seed.py`, Phase H `06_cutover_pre_populated_clubs.py`) join that file and stamp `clubs.external_url_validated_at` / `external_url_quarantine_reason`. The public read hides a club URL until it is verified and not quarantined.

Classification:
- `clubs/scripts/02_build_legacy_club_candidates.py`
- Implements the four-way club classification (R1-R10); this file is the overview and the script is the authoritative rule home.
- Emits `clubs/out/legacy_club_candidates.csv`.
- `category` is one of: `pre_populate`, `onboarding_visible`, `dormant`, `junk`.
- `bootstrap_eligible=1` iff `category='pre_populate'`.

Contact signal:
- R3/R4/R5 use real `contact_member_id` when present.
- If absent, they may use the substitute predicate: any affiliated member active 2020+.
- `contact_signal_substitute_applied=1` marks substitute usage.

Bootstrap leaders:
- `clubs/scripts/04_build_club_bootstrap_leaders.py`
- Emits `club_bootstrap_leaders.csv`.
- Filters `confidence_score >= 0.70` and `bootstrap_eligible=1`.

DB load order:
1. Phase G: `09_load_enrichment_to_sqlite.py`
   - Loads candidates and affiliations.
2. Phase H: `06_cutover_pre_populated_clubs.py`
   - Writes `mapped_club_id`.
   - Ensures matching `clubs` rows exist.
3. `07_load_bootstrap_leaders.py`
   - Loads `club_bootstrap_leaders`.
   - FK: `club_id -> clubs.id` via `mapped_club_id`.
4. `07a_load_bootstrap_leader_signals.py`
   - Loads `club_bootstrap_leader_signals`.
5. `08_resolve_event_host_clubs.py`
   - Resolves `events.host_club_id` by matching canonical host-club names
     against live `clubs` rows; federation and unmatched hosts stay NULL.

Club loaders are idempotent, but not uniformly DELETE + INSERT: `07_load_bootstrap_leaders.py` and `07a_load_bootstrap_leader_signals.py` reseed with DELETE + INSERT, while `load_clubs_seed.py` and `06_cutover_pre_populated_clubs.py` are additive (`INSERT OR IGNORE`).

DB tables:
- `clubs`
- `tags`
- `legacy_club_candidates`
- `legacy_person_club_affiliations`
- `club_bootstrap_leaders`

## Records

Authoritative curated inputs:
- `freestyle/inputs/curated/records/records_master.csv`
- `freestyle/inputs/curated/records/consecutives_records.csv`

No pipeline regenerates these.

Loaders:
- `freestyle/loaders/10_load_freestyle_records_to_sqlite.py`
- `freestyle/loaders/11_load_consecutive_records_to_sqlite.py`
- Both run from `freestyle/run_freestyle.sh` (invoked by `scripts/reset-local-db.sh`).
- Patterns differ: loader 11 is `DELETE FROM` + `INSERT OR REPLACE`; loader 10 is additive (`INSERT OR IGNORE`, no DELETE), so record edits take effect only on a fresh build.

DB tables:
- `freestyle_records`
- `consecutive_kicks_records`

Platform consumer:
- `/records` route via `recordsService`.

There is no `out/records/` export. The curated CSVs and DB are the two authoritative representations.

## Name variants

Generator:
- `pipeline/identity/build_name_variants.py`

Inputs:
- `inputs/identity_lock/Person_Display_Names_v1.csv`
- `inputs/bap_data_updated.csv`
- `out/canonical/persons.csv`
- `overrides/person_aliases.csv`

Output:
- `inputs/name_variants.csv`

Rules:
- `inputs/name_variants.csv` is generated, not hand-curated.
- Manual edits are clobbered on the next pipeline run.
- To add a pair, modify the upstream source, usually `overrides/person_aliases.csv`.

Loader:
- `scripts/load_name_variants_seed.py`
- Deletes only `source='mirror_mined'`.
- Inserts only HIGH-confidence pairs.
- MEDIUM rows go to `out/name_variants_deferred.csv`.
- Reports actual inserts with `conn.total_changes`.

DB table:
- `name_variants`
- PK: `(canonical_normalized, variant_normalized)`
- `source` is one of: `mirror_mined`, `admin_added`, `member_submitted`.

## `historical_persons` layers

`source_scope='CANONICAL'`:
- Event-results-derived.
- Owned by `08_load_mvfp_seed_full_to_sqlite.py`.
- DELETE + INSERT pattern.

`source_scope='PROVISIONAL'`:
- Club-only and membership-only cohorts (the ~1,700 club-only persons added with PROVISIONAL provenance).
- Owned by `09_load_enrichment_to_sqlite.py`.
- `source` distinguishes `CLUB`, `MEMBERSHIP`, and `RESULTS`.
- Deletes only `source_scope='PROVISIONAL'`; preserves CANONICAL rows.

Identity locks:
- Patch-toolchain only.
- Tools live under `legacy_data/tools/patch_pt_*.py` and `legacy_data/tools/patch_placements_*.py`.
- Patches mutate `Persons_Truth_Final.csv` / `Placements_ByPerson.csv` in place.
- Git log is the version trail.

## Canonical references

Load only the relevant source:
- Claim, merge, and auto-link design: the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5) and the `M_Claim_Legacy_Account` user story.
- Club classification and onboarding: the classifier under `clubs/scripts/` (the authoritative rule home), with the `M_Complete_Onboarding_Wizard` and `A_Periodic_Club_Cleanup` user stories for the member and admin flows.
- `historical_persons` club-only expansion: the legacy_data pipeline (this file) plus the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5).
- Schema and the `name_variants` contract: DATA_MODEL and `database/schema.sql`.
- Legacy-site data dump requirements: `MIGRATION_PLAN` §19.
- Persons count baseline: `MIGRATION_PLAN` §26.

## Curator-canonical freestyle sidecars

Tricks-of-the-Trade lessons use `sourceId='tt_youtube'`.

The 40 `curated/freestyle_tricks/*.meta.json` sidecars were hand-canonicalized on 2026-05-06:
- `title` must stay in `NN - <lesson_title>` format.
- Lesson number must stay zero-padded.
- `#tricks_of_the_trade` must stay in `tags`.

The TT named gallery `/freestyle/tt-series` depends on both invariants:
- `caption_asc` sort.
- tag-AND membership.

Do not rerun sidecar-producing tools unless they preserve canonical titles and tags:
- `scripts/migrate-freestyle-media-to-curated.py`
- `scripts/promote_snippet_candidates.py`
- future variants.

Until the staging-CSV pipeline is replaced by the admin curator UX, verify sidecar output against:
- `curated/freestyle_media/tt_roster.csv`
- `curated/freestyle_media/video_snippet_candidates.csv`

## Archive governance

Archives are provenance, not active instruction.

Archive locations:
- `exploration/_archive/YYYY-MM/`
- `legacy_data/reports/_archive/`

Rules:
- Completed exploration phases move to archive.
- Active operational docs stay lean: no closed sections, no tombstones.
- Closed exploration becomes one-line pointers, not inline summaries.
- Do not load archived docs by default.
- Load archives only when reconstructing rationale behind current state.
