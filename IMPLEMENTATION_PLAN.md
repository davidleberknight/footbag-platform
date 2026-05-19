# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md` (even if they are also in Design Decisions as a long-term intent). Documented future work and intentional development versus staging versus production asymmetries are not deviations.

## Active deviations

### `club_bootstrap_leader_signals` unwritten (cross-track)

Schema table `database/schema.sql:3466-3487` exists; no pipeline producer populates it. Platform-side `clubBootstrapLeaderSignals.listByBootstrapLeaderId` returns empty; wizard `submitClubAffiliationsResponse` falls back to all-false classification (operative, but audit-metadata classification is uninformative until pipeline emits). Tracked in `legacy_data/IMPLEMENTATION_PLAN.md`.

### Loosened read filter on `legacy_person_club_affiliations.resolution_status`

`src/db/db.ts:711` and `:765` include `'pending'` in the resolution-status filter so loader-imported affiliations render as members on `/clubs/:key`. TEMP-DEVIATION comments at `db.ts:755-756` and `src/services/clubService.ts:2-6` mark the substitute. Closes when a wizard-side handler transitions `legacy_person_club_affiliations.resolution_status` from `'pending'` to `'confirmed_current'` (see `legacy_data/IMPLEMENTATION_PLAN.md` "Onboarding wizard club-affiliations step"); filter reverts to `IN ('confirmed_current', 'promoted')` and the TEMP-DEVIATION comments come out with the revert.
