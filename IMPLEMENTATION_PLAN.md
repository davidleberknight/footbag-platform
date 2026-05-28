# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### DOB as auto-link matching signal (F12)

The `classifyAutoLink` function now uses DOB as a disambiguation signal when multiple name candidates match, but the feature is inert until legacy DOB data populates `legacy_members.birth_date` via the legacy data dump.

### Dev-only payment stub (FOOTBAG_DEV_PAYMENT_STUB)

`applyDevPaymentStub` creates a `payments` row and applies `applyPurchaseGrant` without Stripe. Gated by `FOOTBAG_DEV_PAYMENT_STUB=1` + `FOOTBAG_ENV=development`; boot-time guard refuses non-development start. Dashboard shows active upgrade form buttons labeled "(Dev testing)" when enabled; disabled "Coming soon" buttons otherwise. Unblock: Stripe integration wires up real PaymentService with webhook handling.

### Simplified onboarding club-signal collection

Wizard card forms collect a 3-option activity signal (active / not_active / not_sure) on stage 1 cards and a 4-option signal (adding never_heard_of_it) on stage 2A/2B cards and the club detail page. US 3.2 specifies richer per-stage 4-5 option question sets with branching paths; the simplified version satisfies the `crowdsource_club_viability` predicate inputs (S1/S2/S3). Full per-stage question sets deferred.

### Partial admin cleanup predicates

Three of seven A_Periodic_Club_Cleanup predicates are implemented: `crowdsource_club_viability` (G1-G4 gates), `leaderless_active_club`, `stale_provisional_leader`. Remaining four (orphan_legacy_id, purged_member, inactive_onboarding, convergent_auto_merge) and the daily background job are deferred. Admin queue supports defer/snooze (30/90/180 days) and resolution tracking via `club_cleanup_resolutions` table.

### Freestyle dictionary two-line row contract — ADD + Family migrated; Dex / Movement System / By Modifier / Neighborhoods pending

The generalized two-line row partial is `dictionary-trick-row.hbs` (classes `dict-trick-row-*`, stack `dict-trick-row-stack`). Each row: line 1 = trick name + hashtag + optional decomposition/interpretation reading + optional media badge; line 2 = JOB notation + ADD notation (no green `dict-card-add` chip on the row; the ADD value rides the view's grouping header + the line-2 ADD slot). Service field `addViewFormula` on `DictionaryTrickCard` supplies the line-2 ADD formula; `buildFamilyGroup` already builds its `cards` with the shaping `ctx`, so family rows derive the formula too.

Migrated: `?view=add`, `?view=family` (family grouping headers + family-anchor sublabel + shared-structure invariant + anchor-first ordering all preserved). Still on the shared `dictionary-trick-card` (registry/browse density, first-class secondary row): `dex-count`, `movement-system`, `sets`/by-modifier, neighborhoods.

Full migration order: ADD → Family → Dex → Movement System → By Modifier → Neighborhoods. After the last view migrates, retire or shrink the shared `dictionary-trick-card`. The shared-card layout is NOT long-term doctrine.

Test note: shared-card assertions that previously used `?view=add` or `?view=family` as a proxy were repointed to `?view=dex-count` (still a shared-card view) as a temporary safe harbor. `dex-count` is NOT the permanent home — when it migrates, move those assertions onto the two-line contract rather than preserving the old shared-card markup. Cross-view-identity tests (`presentation-hierarchy`, `family-view-identity`, `family-view-identity-extended`) now assert ADD and Family share the two-line contract (the old ADD==Family-as-shared-card identity invariant is dead; convergence on the two-line contract is the target). VIEW_CATALOG's card-rendering standard still describes the shared-card model for these views and needs a doc-sync pass (with approval) once the migration completes.

### Deferred test infrastructure (no current-slice work)

- **Playwright tagging** (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`).
- **Lightweight staging-safe pentest probes** (per `docs/TESTING.md` §9.2): security headers, no stack traces, no dev-shortcut acceptance, auth gates, anti-enumeration timing, no public-route contact fields.

