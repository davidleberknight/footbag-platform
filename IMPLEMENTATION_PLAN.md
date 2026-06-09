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

- **M4: validate seeded club URLs at boot.** Extend `src/services/externalUrlBootScan.ts` to
  scan `clubs`, not just media gallery links: validate, quarantine, and stamp
  `external_url_validated_at` on club rows at startup, mirroring the media pattern. Closes the
  gap where `clubs/scripts/06_cutover_pre_populated_clubs.py` publishes unvalidated club
  `external_url`.
- **M5: match against all three legacy emails.** Auto-link in `identityAccessService` queries
  the member's verified login email and declared old-email anchors against `legacy_email`,
  `legacy_email2`, and `legacy_email3` (the columns land via the legacy_data IP / `schema.sql`
  add). Cross-column collisions are pre-resolved by the test-load G1 gate; a still-colliding
  address stays match-time-ambiguous as the backstop.
- **M7: third-current-club confirm.** `clubService.confirmAffiliation`: when the member is
  already at the two-current-club cap, do NOT flip the legacy affiliation row to
  `confirmed_current`. Leave it actionable and return a cap-hit branch that surfaces "you are at
  the two current-club limit; mark one as former to add this" (mirror the existing
  `claimLeadership` affiliated-only branch). Add a test.
- **M8: enforce claim-safety gates at cutover.** `scripts/pre-cutover-checklist.sh` runs the
  named claim-safety integration tests (G17-G27) inline against the shipped artifact, since the
  deploy ships the working tree, not a git SHA. Add the runbook note to `docs/DEVOPS_GUIDE.md`.
- **M10: admin-non-promotion test.** Add a negative test to the legacy-claim integration suite
  asserting that claiming a `legacy_members` row with `legacy_is_admin = 1` leaves
  `members.is_admin = 0` (the invariant currently holds only by code-path absence).
- **M12: retire the daily honors digest.** Remove the scheduled daily send in
  `hofBapAdminDigestService`. The v1 honors-oversight mechanism is the a-priori roster
  cross-check (legacy_data IP) plus community self-policing and admin revert. Keep the
  underlying honors-claim query (`listRecentHonorsClaims`) for on-demand admin review; the
  interactive oversight feed stays v2.
- **M15: fix the DNS TTL preflight script.** `scripts/dns-ttl-preflight.sh`: remove the
  `mx-day` phase (it only rewrites A/AAAA, never MX/TXT, and targets Route 53, which is not
  authoritative before the handover, so it cannot pre-shrink the live MX TTL on email day) and
  correct the header; keep the `handover` phase. The email-day MX TTL pre-shrink is the
  webmaster's manual action on his authoritative zone (recorded in MIGRATION_PLAN §19.3 / §29.12a).
