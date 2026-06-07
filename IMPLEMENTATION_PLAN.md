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

### Freestyle-unification follow-ups

The freestyle CSS unification shipped; three cleanups remain (all Dave-track,
non-blocking).

1. **Dead observational-lanes code.** `src/services/freestyleService.ts` carries a
   fully-unreferenced cluster eslint cannot flag (exported types plus an object
   method): `buildObservationalLanes` plus `ObservedSourceBadge` / `ObservedStatusChip`
   / `ObservationalLanesView` / `ObservedTrickCardDetail` / `ObservedTrickCard`. It was
   orphaned when the producer functions were deleted. Re-verify zero refs, delete,
   then build + lint + test.
2. **Minted palette token names.** The 22 freestyle palette tokens added to `:root`
   (`--gold-*`, `--umber-*`, `--azure-*`, `--brick-*`, `--plum-*`, `--moss-*`,
   `--stone-*`, `--mauve-*`) are named by hue and lightness only. Rename so each name
   conveys semantic role AND hue; the alias tokens (`--text-*`, `--accent`, `--link`,
   ...) are already semantic and stay. Grep each token's `style.css` usages for its
   role, rename in `:root` plus usages; the hex gate plus build plus tests verify no
   orphan.
3. **Propagate standards to skills/rules/docs.** `.claude/skills/add-public-page/SKILL.md`:
   add the 1024 tablet breakpoint, the hex/radius/breakpoint gates in
   `assert_conventions.sh`, and notation typography (body font plus chip, not mono) to
   its guidance; fix the button-variant count (it says two, VC §4.5 says three including
   `.btn-inverse`). Same button drift in `.claude/rules/template-conventions.md`.
   Optionally document the extended palette in VC §4.3 and add rationale entries to
   DESIGN_DECISIONS (notation to body font, the three-breakpoint system, the CSS gates).
   No test changes required (the gates already enforce the standards); optionally add an
   alias-token resolution unit test. The `bug-hunt` skill needs no standards edit (it
   cites the updated VIEW_CATALOG and already scopes freestyle in), but the last sweep
   excluded the freestyle surface (BUGS.md scope note); run a freestyle bug sweep now
   that it is unified.

