# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### DOB as auto-link matching signal (F12)

The `classifyAutoLink` function now uses DOB as a disambiguation signal when multiple name candidates match, but the feature is inert until legacy DOB data populates `legacy_members.birth_date` via the legacy data dump.

### Live Stripe checkout-session creation (PAYMENT_ADAPTER=live)

`PAYMENT_ADAPTER=stub` is the working payment path in development and staging: an in-memory adapter that runs the full Stripe-shaped flow (`startMembershipPurchase` → stub checkout → signed webhook → `applyPurchaseGrantInTx` tier grant), including the failure path (Decline → `payment_intent.payment_failed` → no grant). `PAYMENT_ADAPTER=live` (`createLivePaymentAdapter`) throws "not yet implemented"; the remaining work is the real Stripe-SDK `createCheckoutSession` call. Production requires `PAYMENT_ADAPTER=live` and refuses `stub`, so production cannot boot until the live adapter ships.

### Simplified onboarding club-signal collection

Wizard card forms collect a 3-option activity signal (active / not_active / not_sure) on stage 1 cards and a 4-option signal (adding never_heard_of_it) on stage 2A/2B cards and the club detail page. US 3.2 specifies richer per-stage 4-5 option question sets with branching paths; the simplified version satisfies the `crowdsource_club_viability` predicate inputs (S1/S2/S3). Full per-stage question sets deferred.

### Partial admin cleanup predicates

Three of seven A_Periodic_Club_Cleanup predicates are implemented: `crowdsource_club_viability` (G1-G4 gates), `leaderless_active_club`, `stale_provisional_leader`. Remaining four (orphan_legacy_id, purged_member, inactive_onboarding, convergent_auto_merge) and the daily background job are deferred. Admin queue supports defer/snooze (30/90/180 days) and resolution tracking via `club_cleanup_resolutions` table.

### Deferred test infrastructure (no current-slice work)

- **Playwright tagging** (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`).

