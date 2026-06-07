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
no undefined template classes. Fonts are now tokenized site-wide (the
`assert_conventions.sh` font gate scans the whole stylesheet). The
freestyle sections of `src/public/css/style.css` (below the "Freestyle
records" banner) still predate the rest of the standard:
~360 long-tail hex literals (the recurring palette is tokenized; what
remains is low-frequency one-offs needing consolidate-or-name calls),
breakpoints 520/600/640/680/720/1023/1024, and ~40 undefined
class tokens (every dead token is removed; the remainder are
test-anchored contract classes that need real styling decisions) across
`src/views/freestyle/**` plus 8 still-excluded freestyle partials, and
bespoke card families that do not inherit the shared tokens.
One gate enforces the standard but excludes freestyle for now: the
template-class-vocabulary test (`tests/unit/template-class-vocabulary.test.ts`,
explicit `EXCLUDED_DIRS` / `EXCLUDED_FILES`). The
exclusions are self-tightening: companion tests in the same file fail the
moment an excluded surface becomes compliant, naming the exclusion to prune.
Closure rides
the freestyle-pages-fixes list in `legacy_data/IMPLEMENTATION_PLAN.md`.

