# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### PII purge runs as a manual service call

`memberService.purgeAccountPII` performs the row-level erasure, but the
designed caller (OperationsPlatformService grace-window eligibility scan and
the `erasure_log` table) is unbuilt. Until it lands, purges are manual
service calls.

### Dev/staging admin bootstrap rides registration

`identityAccessService.registerMember` calls `applyDevStagingBootstrapAdmin`
(the operator-supplied email allowlist) so dev and staging get admin accounts
without manual SQL. Canonical design has exactly one admin-creation path: the
single-shot SSM-token claim at `/admin/bootstrap-claim`. The allowlist and
every related shortcut are tagged `CUTOVER-REMOVE` in code, and the removal
procedure in `src/dev-bootstrap/README.md` deletes them at production
go-live. Until then, production safety rests on the env-config fail-fast
guards plus the production image build stripping `dist/dev-bootstrap/`.

### Freestyle surfaces deviate from the VC §4.5 token standard

The non-freestyle site is on the VC §4.4-§4.5 standard: `--font-body` /
`--font-mono` tokens behind every `font-family`, token-only
colors/radii/shadows, canonical 480/768 breakpoints, three button variants,
no undefined template classes. The freestyle sections of
`src/public/css/style.css` (below the "Freestyle records" banner) still
predate it: Georgia/Apple-system and raw mono font stacks (~60 rules),
~1,060 hex literals, breakpoints 520/600/640/680/720/1024, ~120 undefined
class tokens across `src/views/freestyle/**` plus 17 freestyle-owned
partials, and bespoke card families that do not inherit the shared tokens.
Two gates enforce the standard but exclude freestyle for now: the
template-class-vocabulary test (`tests/unit/template-class-vocabulary.test.ts`,
explicit `EXCLUDED_DIRS` / `EXCLUDED_FILES`) and the font-family check in
`scripts/ci/assert_conventions.sh` (scan stops at the freestyle banner). The
exclusions are self-tightening: companion tests in the same file fail the
moment an excluded surface becomes compliant, naming the exclusion to prune,
and the final pruning extends the font gate to the whole file. Closure rides
the freestyle-pages-fixes list in `legacy_data/IMPLEMENTATION_PLAN.md`.

### Wizard Stage 2 club cards deviate from the US card contract

The Stage 2A/2B cards render name and location only; the US contract has
each card surface the club's or candidate's description and external URL,
and gives Stage 2A cards an "I'd like to join" link to the club's join page.
Stage 2 matching also falls back country-wide when the registrant's region
yields nothing, where the US specifies region-level matching; and the
wrap-up tier-gate is a static notice where the US specifies a two-path
advisory with an upgrade route. Closes with the wizard card remediation
alongside the candidate-promotion work.

### Stage 2 viability signals on unpromoted candidates are dropped

`club_viability_signals.club_id` is NOT NULL referencing `clubs`, so the
wizard silently discards every activity signal submitted against a candidate
that has no live club row, including "Not sure" and "Never heard of it"
answers the US says are stored. "Still active" / "Not active anymore"
resolve via candidate promotion (the signal lands post-promotion); the
remaining two need either a candidate-capable signals schema or a ratified
decision that they are recorded only for live clubs. Cleanup hygiene riding
this entry: the orphaned `legacy_auto_link_notification` email-template seed
(superseded model, zero code references), the unused `'stage3a'` value in
the `source_stage` CHECK, and a missing junk-classification guard in
`listPendingForLegacyMember` (latent until promotion lands).
