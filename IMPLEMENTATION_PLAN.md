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

### Freestyle dictionary two-line row contract — all primary browse views migrated; retire shared card + doc-sync pending

The generalized two-line row partial is `dictionary-trick-row.hbs` (classes `dict-trick-row-*`, stack `dict-trick-row-stack`). Each row: line 1 = trick name + hashtag + optional decomposition/interpretation reading + optional media badge; line 2 = JOB notation + ADD notation (no green `dict-card-add` chip on the row; the ADD value rides the view's grouping header + the line-2 ADD slot). Service field `addViewFormula` on `DictionaryTrickCard` supplies the line-2 ADD formula; the per-view group builders (`buildFamilyGroup`, `buildDexGroup`, `buildMovementSystemGroup`, the set-group + topology-group builders) build their `cards` with the shaping `ctx`, so every migrated view derives the formula. First-class atoms render their JOB from `firstClassChainValue` in the same line-2 JOB slot — the old first-class **secondary row** is gone (its JOB/ADD became the universal line 2), so there is no longer a first-class-vs-not visual distinction on a row.

Migrated (all six primary browse views): `?view=add`, `?view=family` (family headers + anchor sublabel + shared-structure invariant + anchor-first ordering preserved), `?view=dex-count` (0/1/2/3+ dex + Unknown bucket headers preserved), `?view=movement-system` (4 axis sections + per-modifier group headings + body-definition + composition-gloss rows preserved), `?view=sets`/by-modifier (per-modifier group headings + modifier-type/add-bonus meta line + jump nav preserved), `?view=topology` / Movement Neighborhoods (6 group sections + body-definition + footer preserved). The shared `dictionary-trick-card` now renders ONLY on the soft-retired `category` + `component` views.

Remaining: (1) retire or shrink the shared `dictionary-trick-card` partial once `category` + `component` are removed (they are soft-retired, reachable only by bookmark/external link); at that point the partial + its `dictionary-trick-card.routes.test.ts` / `card-job-block` shared-card assertions can be deleted. (2) **VIEW_CATALOG doc-sync** (with approval): its card-rendering standard still describes the shared-card model and must be updated to the two-line `dict-trick-row` contract. The shared-card layout is NOT long-term doctrine.

Test note: there is no longer a single shared-card test "safe harbor". Proxy tests for two-line-destined content (first-class JOB/ADD, ≡ interpretation, pending pill) were rewritten onto the two-line contract on the migrated views. Tests that genuinely verify the shared `dictionary-trick-card` partial itself (its required slots, JOB-block wrapper) run against `category` — a stable shared-card view; they retire when `category`/`component` do. Cross-view-identity tests (`presentation-hierarchy`, `family-view-identity`, `family-view-identity-extended`) assert ADD and Family share the two-line contract (the old ADD==Family-as-shared-card identity invariant is dead). Per-view two-line acceptance tests live in `freestyle.add-view-rows`, `freestyle.family-view-rows`, `freestyle.dex-view-rows`, and the `movement-system-view` / `tricks-by-set` / `topology-view` route tests. A cross-view stability guard (`freestyle.browse-row-contract.routes.test.ts`) asserts all six primary views render `dict-trick-row-stack` and never the legacy `dict-card-stack` / `dict-card--registry` / green chip.

### Browse-shell + landing UI cleanup (before Emerging Vocabulary redesign)

Remaining browse-shell consistency items (captured from rendered-surface review; not yet implemented). The top-nav consistency pass and the landing-card count labels are done; what remains:

1. **View intros should state view-relevant row counts.** The global "N canonical tricks" stat is fine on landing/ADD, but each grouped view should also state its own scale: Family = trick-row memberships (or canonical tricks represented); Movement System = memberships displayed; By Modifier = # modifiers + # memberships; Neighborhoods = 6 categories + # memberships; Dex = 5 buckets + total rows.
2. **Movement System copy should mention Alternative Surfaces** as part of the movement-language axis model (the view already shapes an `alternativeSurfaces` block below the axes; the intro/axis copy should reference it).
3. **Neighborhoods intro should list the six category names** near the top: Hippy downtime dex, Leggy dex, Whirl / swirl structures, Pixie uptime dex, Symposium clipper structures, Ducking clipper structures (the landing card already previews them; the view itself should too).

### Deferred test infrastructure (no current-slice work)

- **Playwright tagging** (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`).
- **Lightweight staging-safe pentest probes** (per `docs/TESTING.md` §9.2): security headers, no stack traces, no dev-shortcut acceptance, auth gates, anti-enumeration timing, no public-route contact fields.

