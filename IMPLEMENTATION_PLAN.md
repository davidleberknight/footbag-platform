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

### Freestyle dictionary two-line row contract — ADD view migrated, other browse views pending

`/freestyle/tricks?view=add` renders the two-line `dict-add-row` contract: line 1 = trick name + hashtag + optional decomposition/interpretation reading + optional media badge; line 2 = JOB notation + ADD notation (no green `dict-card-add` chip on the row; the ADD value rides the ADD-grouped section header + the line-2 ADD slot). Partial `dictionary-trick-card-add-row.hbs`; service field `addViewFormula` on `DictionaryTrickCard`.

The other browse views (`family`, `movement-system`, `sets`/by-modifier, `dex-count`, neighborhoods) still render the shared `dictionary-trick-card` (registry/browse density, first-class secondary row). Target: migrate every browse view to the same two-line row contract, then retire or shrink the shared `dictionary-trick-card`. The shared-card layout is NOT long-term doctrine.

Test note: shared-card assertions that previously ran against `?view=add` were repointed to `?view=dex-count` (a still-shared-card view) as a temporary safe harbor so the ADD-view contract could land. `dex-count` is not the permanent home for those assertions. When each view migrates to the two-line contract, move its assertions onto the two-line contract rather than preserving the old shared-card markup. Cross-view-identity tests (`presentation-hierarchy`, `family-view-identity`, `family-view-identity-extended`) were rewritten so ADD is no longer expected to equal Family; the old ADD==Family identity invariant is intentionally dead. VIEW_CATALOG's card-rendering standard still describes the shared-card model for the ADD view and needs a doc-sync pass (with approval) once the migration direction is confirmed.

### Deferred test infrastructure (no current-slice work)

- **Playwright tagging** (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`).
- **Lightweight staging-safe pentest probes** (per `docs/TESTING.md` §9.2): security headers, no stack traces, no dev-shortcut acceptance, auth gates, anti-enumeration timing, no public-route contact fields.

