# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### Media storage: `data/media` bad name + mixed purpose (redesign later)

`data/media` (the local `MediaStorageAdapter` root, `config.mediaDir`, `src/config/env.ts`) conflates two purposes under a non-self-documenting name, and the whole `data/` tree is only `data/media/` (gitignored):

1. Dev-runtime media store. `MEDIA_STORAGE_ADAPTER` defaults to `local` only in non-prod; the dev app writes avatars + member gallery uploads here. The curator seed (`scripts/seed_fh_curator.py`, `DEFAULT_MEDIA_DIR=./data/media`) also writes curated bytes here.
2. Deploy-time seed source for the prod/staging **S3** media bucket. Staging/prod run `MEDIA_STORAGE_ADAPTER=s3` (deploy seeds it) and never read `data/media` at runtime; `./deploy_to_aws.sh --sync-media` rsyncs `data/media/` → host → S3.

Problems to fix properly later:
- Name reads like generic/shippable data; it is a dev-runtime local media root. Not self-documenting.
- Mixed purpose lets dev-scratch member uploads ride `--sync-media` into the prod S3 bucket alongside the curated bytes that are legitimately destined for S3.
- Doc/script disagree on the sync trigger: `scripts/deploy-rebuild.sh:199` gates the `data/media`→S3 rsync behind opt-in `--sync-media`, but `docs/DEVOPS_GUIDE.md:1368` says the additive rsync runs unconditionally on staging deploys. Resolve which is true.

Direction: self-documenting rename + separate dev-scratch from canonical curated bytes + pin the sync trigger + isolate the test. Touches `env.ts` mediaDir default, `docker/docker-compose.yml` + `docker-compose.prod.yml` bind mounts, `scripts/deploy-rebuild.sh` + `scripts/internal/deploy-rebuild-remote.sh` rsync, `scripts/seed_fh_curator.py`, and docs.

Deferred to a dedicated session (self-contained slice; no app-behavior change). Done when: the dev-runtime local media root has a self-documenting name (not `data/media`); curated bytes and dev-scratch member uploads live under separate roots so only curated bytes can ride `--sync-media` to the prod S3 bucket; and the sync trigger is described identically in `scripts/deploy-rebuild.sh` and `docs/DEVOPS_GUIDE.md` (one of: opt-in `--sync-media`, or unconditional-on-staging). The DEVOPS_GUIDE edit is approval-gated. (The `member.galleries.routes.test.ts` per-test `FOOTBAG_MEDIA_DIR` override is already in place, so the `run_all_tests.sh` real-data fingerprint guard stays clean independent of this rename.)

### DOB as auto-link matching signal (F12)

The `classifyAutoLink` function now uses DOB as a disambiguation signal when multiple name candidates match, but the feature is inert until legacy DOB data populates `legacy_members.birth_date` via the legacy data dump.

### Dev-only payment stub (FOOTBAG_DEV_PAYMENT_STUB)

`applyDevPaymentStub` creates a `payments` row and applies `applyPurchaseGrant` without Stripe. Gated by `FOOTBAG_DEV_PAYMENT_STUB=1` + `FOOTBAG_ENV=development`; boot-time guard refuses non-development start. Dashboard shows active upgrade form buttons labeled "(Dev testing)" when enabled; disabled "Coming soon" buttons otherwise. Unblock: the real PaymentService, webhook verifier, and signed-stub webhook handling now exist; only the live Stripe checkout-session creation (`createCheckoutSession` SDK call) remains. The stub `PAYMENT_ADAPTER` now exercises both the success path (`startMembershipPurchase` → stub checkout → Confirm → signed webhook → tier grant) and the failure path (the checkout Decline button → `payment_intent.payment_failed` → no grant) end-to-end, so `FOOTBAG_DEV_PAYMENT_STUB` may be retireable in favor of the stub adapter (a separate decision, not yet made).

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

Remaining browse-shell consistency items (captured from rendered-surface review; not yet implemented). The top-nav consistency pass, the landing-card count labels, and the per-view scale intros are done; what remains:

1. **Movement System copy should mention Alternative Surfaces** as part of the movement-language axis model (the view already shapes an `alternativeSurfaces` block below the axes; the intro/axis copy should reference it).
2. **Neighborhoods intro should list the six category names** near the top: Hippy downtime dex, Leggy dex, Whirl / swirl structures, Pixie uptime dex, Symposium clipper structures, Ducking clipper structures (the landing card already previews them; the view itself should too).

### Family hierarchy audit (taxonomy maturity — do NOT redesign in a UI slice)

The current `trick_family` grouping is a flat, fine-grained structural browse aid, not a mature canonical taxonomy. Curator goal: a SMALLER set of canonical families. The ~91 family labels are too flat and include things that should not be canonical families at all (curator example: `cross-body-sole-stall` should NOT be a family — it belongs under an alternative-surface / unusual-surface grouping, not the family taxonomy). Two surfaces already disagree on scale because they count different things: the landing "By family" card counts ALL distinct `trick_family` labels (e.g. 91, including singletons), while the family VIEW renders only multi-member families (e.g. 38, since singletons are dropped by the `rows.length > 1` filter). Do not present either number as a settled taxonomy; the family-view scale intro already uses cautious "family groupings ... may later roll into broader family hierarchies" wording, and the landing "N families" label may want the same caution.

This is a future taxonomy/governance slice — schedule it BEFORE the Emerging Vocabulary redesign or any major new promotions, and do NOT change family-grouping implementation inside a browse-shell/UI slice.

Goals:
- Reduce the canonical family count; consolidate micro-families into broader parent families.
- Separate true trick families from: alternative surfaces, modifier ecosystems, movement neighborhoods, one-off terminal-surface variants, and alias / decomposition labels.
- Reconcile the landing count (all labels) vs the view count (multi-member) once hierarchy is decided.

Candidate consolidation / re-routing areas:
- osis / torque / blender (likely an osis-anchored hierarchy).
- whirl / rev-whirl / swirl / twirl (hierarchy or neighborhood framing).
- mirage / illusion / pickup / legover.
- pixie / fairy / stepping / quantum / atomic — probably modifier ECOSYSTEMS, not canonical families.
- alternate surfaces (sole / heel / cloud / cross-body-sole) — probably SURFACE groupings, not families.

### Deferred test infrastructure (no current-slice work)

- **Playwright tagging** (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`).
- **Lightweight staging-safe pentest probes** (per `docs/TESTING.md` §9.2): security headers, no stack traces, no dev-shortcut acceptance, auth gates, anti-enumeration timing, no public-route contact fields.

