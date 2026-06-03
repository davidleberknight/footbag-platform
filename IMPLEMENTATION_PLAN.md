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

### Orphaned pending payment row on mid-purchase crash

`startMembershipPurchase` (`src/services/paymentService.ts`) inserts a `pending` payment row, then creates the Stripe session, then patches the identifiers via `updateStripeIdentifiers`. A crash between session creation and the ID patch leaves a permanent `pending` row with NULL `stripe_*` identifiers that no webhook can match, and the partial unique index on `(member_id) WHERE status = 'pending' AND payment_type = 'membership'` then blocks the member from starting another purchase. Latent under `PAYMENT_ADAPTER=stub`; surfaces in live mode. Fix needs design: create the Stripe session before the single transaction that writes the row with known IDs, or add a sweep that cancels pending rows older than the session TTL.

### Rules/IFPA markdown rendered without HTML sanitization

`src/lib/rulesLoader.ts` and `src/lib/ifpaLoader.ts` emit `marked.parse(...)` output via `{{{ bodyHtml }}}` without sanitization; both call sites carry `Current:`/`Target:` deviation comments.
Current: the source `.md` files are repo-only operator-authored content and the strict CSP blocks inline `<script>` execution, so unsanitized HTML is defense-in-depth only.
Target: pipe `marked` output through a sanitizer (isomorphic-dompurify) before rendering. Required before either surface becomes DB-backed or broadly admin-editable.

### Deferred test infrastructure (no current-slice work)

- **Playwright tagging** (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`).

