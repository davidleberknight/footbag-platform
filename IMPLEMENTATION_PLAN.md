# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### PII purge runs as a manual service call

`memberService.purgeAccountPII` performs the row-level erasure, but the
designed caller (OperationsPlatformService grace-window eligibility scan and
the `erasure_log` table) is unbuilt. Until it lands, purges are manual
service calls.
