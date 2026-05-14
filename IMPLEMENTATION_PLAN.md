# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI. 
Long-term design: `docs/`. 
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md` (even if they are also in Design Decisions as a long-term intent). Documented future work and intentional development versus staging versus production asymmetries are not deviations.

## Active slice now: wizard backbone (Dave-track)

Two forward slices to ship the onboarding wizard backbone with zero user-visible change. Both close a real gap between current code (no wizard exists) and canonical design (`docs/MIGRATION_PLAN.md` §9.3 + §10, `docs/USER_STORIES.md` `M_Complete_Onboarding_Wizard`, `docs/DATA_MODEL.md` §4.27). Slice 1 must land before slice 2. Land each in its own PR.

### Slice 1: `member_onboarding_tasks` table

Goal: land the persistence target for the wizard's per-member task state. Schema-additive only; no service or route consumes it yet. Zero risk.

Files to touch:
- `database/schema.sql`: add `CREATE TABLE member_onboarding_tasks` per `docs/DATA_MODEL.md` §4.27. Columns: `id` PK; `member_id` FK to `members(id)`; `task_type` TEXT with CHECK in (`legacy_claim`, `club_affiliations`, `first_competition_year`, `show_competitive_results`); `state` TEXT with CHECK in (`pending`, `skipped`, `completed`, `not_applicable`); `created_at`, `updated_at` TEXT timestamps; `completed_at` TEXT nullable. Add `UNIQUE(member_id, task_type)`. Use the project's standard row-metadata convention (inspect existing tables in `schema.sql` for the `created_by` / `updated_by` / `version` pattern).
- `tests/integration/<new test file>`: create a member via factory, insert one row per `task_type`, assert retrieval and the UNIQUE constraint. Use `tests/fixtures/testDb.ts` and `tests/fixtures/factories.ts` per `tests/CLAUDE.md`.

Verification: `npm run build` and `npm test` pass. `grep -n "CREATE TABLE member_onboarding_tasks" database/schema.sql` finds the new table.

### Slice 2: `MemberOnboardingService` scaffold

Prerequisite: slice 1 landed.

Goal: land the backend service that owns wizard task lifecycle. No routes wire it up; no UI calls it. Provides a stable contract for future per-task-handler slices (Stage 1A handler, club_affiliations handler, dashboard widget query path).

Files to touch:
- `src/services/memberOnboardingService.ts` (new). Implement per `docs/MIGRATION_PLAN.md` §10 contract.
- `tests/integration/memberOnboardingService.test.ts` (new).

Method scaffold behaviour:
- `getTaskWidget(memberId)`: real SELECT, returns outstanding tasks (state IN `pending`|`skipped`) in fixed catalog order (`legacy_claim`, `club_affiliations`, `first_competition_year`, `show_competitive_results`).
- `startTaskList(memberId)`: idempotent INSERT OR IGNORE of one row per `task_type` with state=`pending`.
- `startTask`, `skipTask`, `completeTask`: real UPDATE plus `audit_entries` row emission. Audit `action_type` values: `onboarding_task_started`, `onboarding_task_skipped`, `onboarding_task_completed`.
- `submitTaskResponse`: throws `NotImplementedError`. Per-task response handlers land in later slices.

Tests to write:
- Empty widget for a member with no tasks.
- `startTaskList` returns all four tasks in catalog order; idempotent on re-run.
- `skipTask` transitions state and removes from widget.
- `completeTask` removes from widget.
- `audit_entries` rows emitted at every transition with the action_type values listed above.

Verification: `npm run build` and `npm test` pass. `grep -n "MemberOnboardingService" src/services/memberOnboardingService.ts` finds the export.

Style: read an existing slim service (for example `src/services/identityAccessService.ts`) for the project's house pattern (constructor injection, error-class conventions, db-statement structure).

## Accepted temporary deviations

1. **Readiness probe limited to SQLite + memory pressure.** SERVICE_CATALOG.md `OperationsPlatformService.checkReadiness()` composes the readiness signal for `/health/ready`. Current implementation probes SQLite and container memory pressure only; KMS, SES, and S3 backup health are not included. 


