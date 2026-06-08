# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### Dev/staging admin bootstrap rides registration

`identityAccessService.registerMember` calls `applyDevStagingBootstrapAdmin`
(the operator-supplied email allowlist) so dev and staging get admin accounts
without manual SQL. Canonical design has exactly one admin-creation path: the
single-shot SSM-token claim at `/admin/bootstrap-claim`. The allowlist and
every related shortcut are tagged `CUTOVER-REMOVE` in code, and the removal
procedure in `src/dev-bootstrap/README.md` deletes them at production
go-live. Until then, production safety rests on the env-config fail-fast
guards plus the production image build stripping `dist/dev-bootstrap/`.

### Force-keep / force-junk requests deferred to live operation

Classification overrides are hand-edited rows in
`legacy_data/overrides/club_classification_overrides.csv`
(`club_key,name,force_category,reason`; any of the four §10.1 categories),
the same pattern as every other override CSV. Cases are few; the six
curator-review clubs are seeded. The platform is not in the loop: no
export, merge, or bridge tooling exists or should be built. The
A_Periodic_Club_Cleanup story's "force-keep or force-junk request: apply,
modify, or reject" queue item is live-operation work: build it only after
go-live, when pipeline reloads have stopped and the production DB owns club
truth. Until then the queue's existing junk actions (confirm junk, promote
to dormant) cover rescue needs.
