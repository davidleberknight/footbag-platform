# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### Club classification overrides ride the pipeline CSV pre-go-live

Until go-live, club force-keep / force-junk classification overrides are
hand-edited rows in `legacy_data/overrides/club_classification_overrides.csv`
(`club_key,name,force_category,reason`), because pipeline reloads rebuild the
DB from the CSVs and the override must survive each reload. After go-live,
reloads stop, the production DB owns club truth, and the admin queue actions
(USER_STORIES `A_Periodic_Club_Cleanup`, MIGRATION_PLAN §10.4) become the
override path. Delete this entry when those queue actions ship.

### Persona harness: classes blocked on unbuilt features

`src/testkit/canonicalPersonas.ts` seeds a persona for every §4.6 class whose code
path has landed. The classes still unseeded are blocked on features that do not yet
exist, not on the harness:

- event organizer / co-organizer — `event_organizers` exists, no organizer-gated edit routes do.
- group owner / co-owner / member — designed in USER_STORIES §3.10 and §6, no schema or routes yet.
- vote-eligibility by inclusion list — no voting routes or eligibility code yet.
- the claimed-legacy banned subject — `legacy_members` has no banned column yet.

Add each persona (plus its adjacent-owner negative where the route is ownership-scoped)
in the change that lands its feature. The system / internal-caller actor is not a catalog
persona: it is exercised by the secret-gated `/ipc` request, not a `/dev/switch` session.

### Accessibility (`@a11y`) axe checks specified but not wired

`docs/TESTING.md` §14.1 specifies automated accessibility checks via
`@axe-core/playwright`, tagged `@a11y`, on every business-critical surface
against WCAG 2.1 AA, with a `@smoke @a11y` subset on high-traffic public pages.
The dependency is installed, but no `@a11y` test exists and the runner has no
accessibility-only gate. To close the gap:

- Add `@a11y` axe assertions (`new AxeBuilder({ page }).analyze()` against the
  WCAG 2.1 AA ruleset, failing on new violations) to the lightweight Playwright
  suite, one per business-critical surface; tag the high-traffic public subset
  `@smoke @a11y`.
- Add an `--axe` flag to `run_all_tests.sh` that runs only the `@a11y`-tagged
  Playwright tests, and ensure `--full` exercises them.

Delete this entry when the `@a11y` axe gate runs green in CI and via
`./run_all_tests.sh --axe`.
