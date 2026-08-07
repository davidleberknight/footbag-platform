# Historical Footbag Pipeline + Platform DB

## Scope

This subtree prepares canonical historical data and loads it into the platform DB.

Stay in this lane:
- Do not modify repo-root code, repo-root docs, `.claude/skills/`, or `.claude/rules/`.
- For repo-root/platform tasks, use repo-root `CLAUDE.md` and the maintainers' private tracker (the `tracker-ops` skill).
- `legacy_data` is primarily the data and freestyle maintainer's area, but task ownership is not siloed: any maintainer may pick up work here, and the data/freestyle maintainer may pull other board tasks. Coordinate on overlapping in-flight changes.

## Source of truth

- `out/canonical/*.csv` is authoritative pipeline output. Never edit it directly.
- The workbook is derived only.
- Mirror HTML is the highest-priority source for 1997-present results.
- Structured curated CSVs are authoritative for pre-1997 intake.
- Identity lock files are frozen except through the patch toolchain.
- Unknown data stays unknown. Never fabricate results.

`run_pipeline.sh` is authoritative for stage order, script paths and arguments; `README.md`
carries the script catalog, the pipeline modes, and the committed-versus-gitignored input
registers.

## Local-only inputs

Two legacy inputs sit outside version control and are never committed here; never name their
machine-local paths in committed text. Both are optional per machine, and a checkout without
them is a fully supported configuration: when one is absent, say one line naming it, skip only
the step that needs it, and never block unrelated work.

- **The footbag.org mirror**, reached through the repo-root `footbag_legacy_mirror` symlink.
  Besides results, it preserves rendered legacy content pages, so a content domain the mirror
  captures is not automatically an uncatalogued loss risk. It is a static snapshot: refresh it
  before regenerating canonical output (see the stale-mirror trap under Pipeline invariants).
- **The legacy footbag.org database dump**, reached read-only through the repo-root
  `footbag_legacy_repo` symlink. The complete per-module export from the live site, spanning far
  more than members and results. Extractors only read it; never write to it. Which modules have
  arrived is tracked in the maintainers' private tracker.

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

DB mutation safety lives in `.claude/rules/db-write-safety.md`. Freestyle tables, the curated
records and their loaders belong to the freestyle subtree, not this one: see `freestyle/CLAUDE.md`.

## Non-negotiable safety rules

- QC must pass before canonical-output changes are committed.
- Never edit generated canonical CSVs directly.
- Never edit identity lock files directly.
- `inputs/name_variants.csv` is generated: hand edits are clobbered on the next run, so add a
  pair upstream in `overrides/person_aliases.csv` instead.
- All exclusions must be traceable in `overrides/`.
- Verify external URLs before reviewer sign-off. Pattern extrapolation is not verification.
  - Unverified extrapolated URLs may sit in staging with blank `reviewer`.
  - Before promotion, confirm by browser, WebFetch, curl, or source-site index.
  - Capture verification in `notes`, for example: `WebFetch 200 YYYY-MM-DD`.
- For wide curated CSV batch edits, use `sed -i`; do not round-trip with `csv.DictReader -> csv.DictWriter`.
  - This is the one approved, scoped exception to the root `CLAUDE.md` ban on `sed -i` file
    editing; each `sed -i` still gates behind the approval prompt, and everywhere outside
    wide curated-CSV batch edits the root ban stands.
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
- **A stale mirror silently deletes events.** The committed canonical CSVs can be ahead of the
  local mirror. Regenerating from a checkout whose crawl predates recently-completed events drops
  them, because the parser skips events whose result pages that crawl never captured. Refresh the
  mirror first, or treat the committed CSVs as source of truth.

## DB invariants

- Soft delete with `deleted_at`; never hard delete.
- Audit logs are append-only.
- Unique constraints use partial indexes.
- Business rules belong in the app's services, not in loaders or the DB layer; the app-layer contract is `.claude/rules/service-layer.md` and `.claude/rules/db-layer.md`.
- Ambiguous identity resolution never auto-selects.
- Auto-link requires a strong multi-anchor match.
- `name_variants` stores high-confidence entries only.
- A club's external URL stays hidden on the public read until it is verified and not quarantined.
- Writes are transactional.

## Loader contract

For pipeline-regenerated tables:
- Use DELETE + INSERT, not `INSERT OR IGNORE` alone.
- Scope deletes where multiple owners share a table.
  - Example: `DELETE WHERE source='mirror_mined'`.
  - Example: `DELETE WHERE source_scope='PROVISIONAL'`.
- `historical_persons` is the live case: its canonical and provisional cohorts have different
  owning loaders and each deletes only its own scope, so widening either delete destroys the
  other's rows.
- Use one transaction spanning delete and insert; commit once.
- Report honest counters.
  - Good: increment only when `rowcount` shows an insert.
  - Bad: raw `+= 1` after `INSERT OR IGNORE`.
- Every skipped row needs a named category: dedup, FK miss, PK collision, bad row, etc.
- The club loaders are the exception to uniformity: the bootstrap-leader loaders reseed with
  DELETE + INSERT, while the clubs seed and cutover loaders are additive.

## Workbook

Build steps, the input contract and the deprecated builders are in `runbooks/workbook-v22.md`.
Two traps:
- EVENT INDEX must match `canonical_input/events.csv` row-for-row. If it diverges, debug
  `build_event_index` or the population of the `events` dict.
- The 30-event delta between `out/canonical/events.csv` and
  `event_results/canonical_input/events.csv` is intentional: `export_canonical_platform.py`
  drops sparse disciplines, then drops events left with none.

## Canonical references

Load only the relevant source:
- Claim, merge, and auto-link design: the Legacy Data Migration decision in DESIGN_DECISIONS,
  with the `M_Claim_Legacy_Account` user story.
- Club classification and onboarding: `clubs/scripts/02_build_legacy_club_candidates.py` is the
  authoritative rule home, with the `M_Complete_Onboarding_Wizard` and `A_Periodic_Club_Cleanup`
  user stories for the member and admin flows.
- Schema, the `name_variants` contract, and the migration staging and bootstrap tables:
  DATA_MODEL and `database/schema.sql`.
- The legacy-site export contract and its credential exclusion: the required schema changes and
  validation gates sections of MIGRATION_PLAN.
- Persons count baseline: the persons data-quality section of MIGRATION_PLAN.

## Archives

Archives are provenance, not instruction: do not load `exploration/_archive/` or
`reports/_archive/` unless reconstructing the rationale behind current state. Closed work becomes
a one-line pointer there, never an inline summary.
