# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### Dev/staging admin bootstrap rides registration

`identityAccessService.registerMember` calls `applyDevStagingBootstrapAdmin`
(the operator-supplied email allowlist) so dev and staging get admin accounts
without manual SQL. Canonical design has exactly one admin-creation path: the
single-shot SSM-token claim at `/admin/bootstrap-claim`. The allowlist and
every related shortcut are tagged `CUTOVER-REMOVE` in code, and the removal
procedure in `src/dev-bootstrap/README.md` deletes them at production
go-live. Until then, production safety rests on the env-config fail-fast
guards plus the production image build stripping `dist/dev-bootstrap/`.

### Force-keep / force-junk requests deferred to live operation

Classification overrides are hand-edited rows in
`legacy_data/overrides/club_classification_overrides.csv`
(`club_key,name,force_category,reason`; any of the four §10.1 categories),
the same pattern as every other override CSV. Cases are few; the six
curator-review clubs are seeded. The platform is not in the loop: no
export, merge, or bridge tooling exists or should be built. The
A_Periodic_Club_Cleanup story's "force-keep or force-junk request: apply,
modify, or reject" queue item is live-operation work: build it only after
go-live, when pipeline reloads have stopped and the production DB owns club
truth. Until then the queue's existing junk actions (confirm junk, promote
to dormant) cover rescue needs.

### Visitor-facing em dashes pending cleanup and gate

Rendered template text and `src/content` editorial strings contain em dashes,
contrary to the no-em-dash prose rule in `.claude/rules/comments.md` and
`.claude/rules/doc-governance.md`. About 340 occurrences exist, some of which
are legitimate data separators in notation and equivalence arrays. Canonical
state is no em dashes in visitor-facing text. Close the gap with a dedicated
pass that rewrites the prose occurrences (commas, parentheses, or restructure),
exempts the genuine data-separator arrays, then adds an `assert_conventions.sh`
rule scanning `.hbs` text nodes and `src/content` string literals so the
cleaned state cannot regress.

### Test-comment doc and finding-id references pending cleanup and gate

`tests/` comments and `describe` / `it` names reference docs, section
shorthands, and finding ids, contrary to the stricter test-comment rule in
`.claude/rules/comments.md`. About 130 occurrences exist. Canonical state is
plain-words long-term contract descriptions with no doc or finding-id
reference. Close the gap with a pass that rewrites the offending comments and
test names, then adds an `assert_conventions.sh` rule scanning `tests/`
comments and `describe` / `it` string arguments so the cleaned state cannot
regress.

### Migration-readiness audit follow-ups (platform-src)

Buildable to-dos from the cutover-readiness audit. Each is a deviation from a now-decided
design recorded in the canonical docs (USER_STORIES / DESIGN_DECISIONS) or in MIGRATION_PLAN.

- **M8: enforce claim-safety gates at cutover.** `scripts/pre-cutover-checklist.sh` runs the
  named claim-safety integration tests (G17-G27) inline against the shipped artifact, since the
  deploy ships the working tree, not a git SHA. Add the runbook note to `docs/DEVOPS_GUIDE.md`.
- **M12: retire the daily honors digest.** Remove the scheduled daily send in
  `hofBapAdminDigestService`. The v1 honors-oversight mechanism is the a-priori roster
  cross-check (legacy_data IP) plus community self-policing and admin revert. Keep the
  underlying honors-claim query (`listRecentHonorsClaims`) for on-demand admin review; the
  interactive oversight feed stays v2.

### Persona harness completion (platform-src)

The route-by-persona authorization matrix and the automated persona-driven test scripts depend on
a complete actor catalog, but the `/dev/personas` catalog (`src/testkit/canonicalPersonas.ts`)
instantiates only a subset of the persona suite derived in `docs/TESTING.md` §4.6. Extend
`PersonaSpec` (`src/testkit/personaFactory.ts`) with the missing optional fields, add the matching
row builders in `src/testkit/personaRowBuilders.ts`, and add one seedable persona per missing class
in `canonicalPersonas.ts` with coverage notes. Missing classes: resource-scoped roles (event
organizer and co-organizer, club co-leader, country leader, group owner / co-owner, group member),
a switchable curator identity, the honors (HoF / BAP / Board), vote-eligibility by inclusion list,
the legacy no-match auto-link outcome, the claimed-legacy `legacy_is_admin=1` non-inheritance
subject, the registered-unverified state, deceased, and deletion-grace-period. The target is the
§4.6 taxonomy; close this when every class it derives has a catalog entry.
