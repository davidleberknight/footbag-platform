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

### Freestyle dictionary two-line row contract — ADD + Family + Dex migrated; Movement System / By Modifier / Neighborhoods pending

The generalized two-line row partial is `dictionary-trick-row.hbs` (classes `dict-trick-row-*`, stack `dict-trick-row-stack`). Each row: line 1 = trick name + hashtag + optional decomposition/interpretation reading + optional media badge; line 2 = JOB notation + ADD notation (no green `dict-card-add` chip on the row; the ADD value rides the view's grouping header + the line-2 ADD slot). Service field `addViewFormula` on `DictionaryTrickCard` supplies the line-2 ADD formula; the per-view group builders (`buildFamilyGroup`, `buildDexGroup`) build their `cards` with the shaping `ctx`, so every migrated view derives the formula. First-class atoms render their JOB from `firstClassChainValue` in the same line-2 JOB slot — the old first-class **secondary row** is gone (its JOB/ADD became the universal line 2), so there is no longer a first-class-vs-not visual distinction on a row.

Migrated: `?view=add`, `?view=family` (family headers + anchor sublabel + shared-structure invariant + anchor-first ordering preserved), `?view=dex-count` (0/1/2/3+ dex + Unknown bucket headers preserved). Still on the shared `dictionary-trick-card`: `movement-system`, `sets`/by-modifier, `category`, `component`, neighborhoods.

Full migration order: ADD → Family → Dex → Movement System → By Modifier → Neighborhoods. After the last view migrates, retire or shrink the shared `dictionary-trick-card`. The shared-card layout is NOT long-term doctrine.

Test note: there is no longer a single shared-card test "safe harbor". Proxy tests for two-line-destined content (first-class JOB/ADD, ≡ interpretation, pending pill) were rewritten onto the two-line contract on the migrated views. Tests that genuinely verify the shared `dictionary-trick-card` partial itself (its required slots, JOB-block wrapper) now run against a still-shared view — `category` (slot tests) or `movement-system` (JOB-block-wrapper). When those views migrate, move the slot tests onto the two-line contract and retire the shared-card assertions. Cross-view-identity tests (`presentation-hierarchy`, `family-view-identity`, `family-view-identity-extended`) assert ADD and Family share the two-line contract (the old ADD==Family-as-shared-card identity invariant is dead). VIEW_CATALOG's card-rendering standard still describes the shared-card model for the unmigrated views and needs a doc-sync pass (with approval) once the migration completes.

### Deferred test infrastructure (no current-slice work)

- **Playwright tagging** (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`).
- **Lightweight staging-safe pentest probes** (per `docs/TESTING.md` §9.2): security headers, no stack traces, no dev-shortcut acceptance, auth gates, anti-enumeration timing, no public-route contact fields.

