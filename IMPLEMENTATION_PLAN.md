# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### Deferred test infrastructure (no current-slice work)

- **Playwright tagging** (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`).
- **Lightweight staging-safe pentest probes** (per `docs/TESTING.md` §9.2): security headers, no stack traces, no dev-shortcut acceptance, auth gates, anti-enumeration timing, no public-route contact fields.

### Deferred wizard implementation gaps

- **No-bootstrap-row leadership Tier 1+ gate in wizard path (Stage 1B path 1):** `M_Complete_Onboarding_Wizard` line 785 says without a bootstrap row, leadership is offered only to Tier 1+. Current `clubService.claimLeadership` has no tier check; the tier gate is implemented only at the card-rendering layer (cards are not surfaced for Tier 0 members without bootstrap rows). Verify the card-rendering layer enforces this before cutover.
