# Bug Hunt — design-layer reference

Design-layer method detail for the bug-hunt skill, kept out of SKILL.md to stay under the
500-line ceiling; SKILL.md Phase C points here. Evidence at this layer is doc sections,
contracts, and reconstructed data flows, not file:line; code and deployment artifacts serve
only as design evidence (implementation status where docs claim it, parity, testability,
schema alignment, cutover risk).

## Contents

- Definition of a design bug
- Design category taxonomy
- Scope declaration
- Design surface inventory
- Traceability matrix
- Requirements-quality sweep
- Threat model: STRIDE per element, LINDDUN GO, misuse cases
- Service contract sweep
- View-layer sweep
- Data model and data governance sweep
- Migration and go-live design sweep
- Dev/staging/prod parity sweep
- Testing and verification design sweep
- Scenario tabletop
- Cross-document contradiction sweep
- Missing-decision owner classification
- Design-finding refutation checklist
- Reviewer personas second pass
- Dryness loop
- Design-specific high-risk checklist

## Definition of a design bug

A design bug exists when at least one is true:

1. A user story requires behavior but the success criteria do not make it testable.
2. A user story requires behavior but no service, view, schema, governance, or test
   contract supports it.
3. A design decision settles a principle but leaves a production-critical edge case
   unspecified.
4. Two canonical docs conflict.
5. A future implementer would have to invent business rules.
6. A role, authorization boundary, or trust boundary is unspecified.
7. A state transition is missing, ambiguous, or unsafe.
8. A lifecycle lacks failure, retry, cancellation, expiry, rollback, or dispute behavior.
9. A privacy or data-governance rule is missing for PII, legacy data, exports, logs,
   notifications, audit trails, public pages, search, or admin views.
10. A service JSDoc or view-layer contract omits behavior required by the stories.
11. A design assumes data quality that the migration plan does not prove.
12. A migration rule has no validation gate.
13. A go-live rule has no rollback or freeze rule.
14. A dev/staging/prod difference could create production-only behavior.
15. Docker, Terraform, CI/CD, environment variables, or adapters could diverge from the
    documented design.
16. Testing standards do not require deterministic checks for a design-critical invariant.
17. Observability, backup, restore, or incident response is insufficient for the feature's
    risk.
18. A legacy data source is expected to remain useful after go-live without a clear
    source-of-truth handoff.
19. A retained legacy service or subdomain creates unclear auth, cookie, TLS, CSRF, data,
    mail, or DNS behavior.
20. The design does not say who decides an unresolved governance or operational policy.

Do not treat existing design rationale as automatically correct: good rationale can still
hide edge-case bugs. Do not guess; carry uncertainty as `UNKNOWN`, `NOT SPECIFIED`,
`NOT FOUND`, `CONTRADICTED`, or `NEEDS HUMAN DECISION` until resolved through the asking
rule.

## Design category taxonomy

Use these categories in the finding `Class` field where possible: Requirements ambiguity;
Missing acceptance criteria; Missing negative case; Cross-document contradiction; Missing
service ownership; Missing view contract; Missing data-governance rule; Missing
schema/data-model rule; Role/authorization gap; State-machine/lifecycle gap;
Identity/legacy-claim risk; Club/group distinction risk; Payment/tier/status risk; Voting
integrity/anonymity risk; Media/archive boundary risk; Migration source-of-truth risk;
Post-go-live source-of-truth risk; Cutover/rollback risk; Email/DNS risk; Dev/staging/prod
parity risk; Docker/runtime artifact risk; Terraform/infrastructure drift;
Testing/verification gap; Observability/ops gap; Security/threat-model gap; Privacy/PII
exposure risk; Admin workflow gap; Governance decision gap; Future implementation
ambiguity.

## Scope declaration

Before the design sweep, write a brief scope declaration into the run's scratch notes (it
feeds the `BUGS.md` scope note): docs read; artifacts inspected as parity evidence;
out-of-scope areas; whether legacy pipeline code is excluded; whether Docker/Terraform
artifacts are included; whether all user stories are included; and, for a scoped run,
which sweeps are skipped and why.

## Design surface inventory

Create an inventory of the design surface from repo evidence, never from memory. At
minimum: user story sections and roles; major feature domains; design decision sections;
service-contract JSDoc entries; page contracts in service JSDoc and the view-layer rule;
data model areas; data governance rules; test/verification standards; migration plan
sections; DevOps/deployment/runtime artifacts; environment adapter boundaries; retained
legacy services; post-go-live data source boundaries.

## Traceability matrix

Build a traceability matrix across: user story; success criteria; relevant design
decision; service owner or missing service owner; view/page contract or missing one;
schema/data-model support; privacy/data-governance rule; tests/verification gate;
operational/deployment consideration; migration/go-live consideration where relevant;
status or open question.

Find bugs where any required cell is missing, contradictory, or too vague to implement
safely. Do this for all user stories in scope, including undelivered future stories,
subject to the undelivered-work gate (design quality only; absence of the feature is never
a finding).

## Requirements-quality sweep

For each story and design decision, test for: ambiguity; incompleteness; contradiction;
unverifiability; missing actor; missing precondition; missing postcondition; missing
failure behavior; missing authorization rule; missing data ownership rule; missing
retention/exposure rule; missing audit/log rule; missing error handling; missing edge
case; missing success metric; missing test oracle; hidden dependency on legacy data,
staging-only behavior, or manual admin knowledge; hidden policy decision; hidden migration
assumption; hidden timing assumption; hidden external service assumption.

A statement like "admin can manage X" is insufficient unless the design says: which admin
role; what actions; what constraints; what audit event; what errors; what user-facing
consequences; what data is visible; what can be undone; what is tested.

## Threat model: STRIDE per element, LINDDUN GO, misuse cases

This is deliberately different from the implementation-layer sweep. That sweep runs a
code-pattern, file:line, OWASP-style review of deployed source — "does this line do
something exploitable." This one runs an architecture-and-requirements threat model on the
design itself, before and independent of code — "can this design produce a wrong or unsafe
outcome no matter how competently it is coded." Do not reach for file:line evidence here.

Compose three methodologies, in order (framing questions for the whole phase: what are we
working on, what can go wrong, what are we going to do about it, did the design say enough
to verify it):

**STRIDE-per-element over a reconstructed data-flow diagram.** Reconstruct from the design
docs (not the code) a data-flow diagram of each major surface. Identify the elements —
external entities, processes, data stores, data flows — and every trust boundary a flow
crosses. Enumerate threats per element with STRIDE: Spoofing, Tampering, Repudiation,
Information disclosure, Denial of service, Elevation of privilege. Coverage: external
entities get S, R; data flows and data stores get T, I, D; processes get all six. A design
bug exists wherever a trust-boundary crossing has no specified authentication, validation,
encryption, audit, or authorization rule, or where a STRIDE property an element needs is
left unspecified.

**LINDDUN GO over the same diagram (privacy).** STRIDE does not cover privacy, and this
project's PII, legacy-identity linking, historical persons, contact exports, and cross-era
correlation are squarely privacy-threat territory. Walk the same diagram against:
Linkability (can records be correlated — legacy plus current re-identifying a historical
person?); Identifiability (can a person be singled out?); Non-repudiation (is a data
subject unable to deny an action where they should be able to — ballot secrecy?);
Detectability (can someone tell data about a person exists?); Disclosure of information;
Unawareness (is the member uninformed of, or unable to control, collection and use?);
Non-compliance (purpose limitation, proportionality, retention, consent). A design bug
exists wherever the governance docs leave a category unaddressed for an element handling
personal data. Cross-check every privacy finding against `docs/DATA_GOVERNANCE.md`.

**Misuse cases over every user story (requirements layer).** For each story — delivered or
not — write the misuse case: who could misuse it, and how. "Member registers" → "attacker
registers as another member's legacy identity." "Member votes" → "member votes twice, or a
third party links a ballot to a voter." Derive the security/privacy acceptance criterion
each misuse case demands, then check whether the story's success criteria state it. A
missing security acceptance criterion is a design bug. This is the mechanism by which all
user stories, not only deployed ones, get security coverage.

Domains the threat model must cover (each gets a data-flow diagram and misuse cases):
account registration and login; onboarding wizard; legacy identity claim; profile editing
and public profile; member tier/status changes; payments and Stripe webhooks; clubs;
groups/committees; events and registration; voting; media upload and archive; email in and
out; admin workflows; migration/go-live and cutover; retained legacy services; search and
public directories. For each, note assets, actors, entry points, sensitive data, state
transitions, fraud/spam/enumeration risks, rate-limit needs, audit needs, and
rollback/recovery needs.

Optional drill-down — attack trees, for the one or two highest-severity findings only
(for example "exfiltrate all member PII", "forge a legacy-identity claim"): decompose the
attacker goal into AND/OR sub-goals down to primitive steps, to test whether the design
closes every cheap path. Never the primary sweep, and never runtime attack simulation —
that crosses into the implementation-layer sweep.

## Service contract sweep

Review the per-service file-header JSDoc and the service-related design decisions against
all user stories. Look for: required behavior with no service owner; ownership split
across services; controller/template doing business logic by implication; missing
authorization, transaction/idempotency, validation, audit, or privacy-filtering
responsibility; missing error taxonomy; missing query-shape or result-shape contract;
missing migration handoff responsibility; missing admin, email/outbox, payment/webhook,
club/group, voting, media-moderation, or post-go-live source-of-truth boundary.

If a service is intentionally partial, incompleteness is a bug only when the missing
contract would force guessing or create production risk.

## View-layer sweep

Review `.claude/rules/view-layer.md` and the page services' JSDoc page contracts against
all user stories and design decisions. Look for: a required page with no view contract; a
required journey with no page-state model; missing empty/loading/error/unauthorized
states; missing draft/unpublished/deleted/private states; missing admin-vs-public
rendering rules; missing anti-enumeration behavior; missing accessibility constraint;
missing responsive constraint where production-critical; missing sensitive-data redaction
rule; missing CTA visibility rule by role/tier/state; missing canonical URL,
redirect/canonicalization, or cross-link rule; missing success/error message semantics;
missing legacy archive link behavior; missing no-JavaScript fallback where the project
standard requires one. Find bugs where future UI code would have to invent rules.

## Data model and data governance sweep

Review `docs/DATA_MODEL.md`, `database/schema.sql`, `docs/DATA_GOVERNANCE.md`, migration
docs, and user stories. Look for missing or contradictory rules for: member identity;
legacy identity links; historical persons; former surnames and old emails; email
visibility; address/location; birth dates; public profile fields; club membership;
group/committee membership; leadership and admin roles; tiers and flags; lifetime
membership; Active Player status; Hall of Fame and BAP flags; payment history; event
registration; results; media ownership; voting eligibility; audit events; exports;
deletion/deactivation; retention; archival snapshots; search indexes; logs; backups;
staging/persona data.

Specifically check for data that is: collected but not governed; governed but not modeled;
modeled but not in user stories; public in one doc and private in another; migrated but
not used; used but not migrated; retained after go-live without purpose; allowed in
staging but unsafe in production; required for support but unavailable to admins; visible
to admins without audit rationale.

## Migration and go-live design sweep

Migration design is in scope; Python migration code is not (unless the kickoff prompt
includes it). Review `docs/MIGRATION_PLAN.md`, `IMPLEMENTATION_PLAN.md`, governance docs,
onboarding/claim and club-bootstrap stories, email/DNS/cutover material, final-export and
freeze requirements, archive/legacy-retention requirements.

Find bugs in: source-of-truth selection; final export timing; write-freeze assumptions;
repeated-import idempotency; validation gate coverage; rollback plan; question ownership
(legacy-site webmaster vs IFPA board vs maintainer); legacy account claim safety; legacy
credential exclusion; legacy admin role migration; member tier derivation; board/committee
derivation; old email handling; club affiliation derivation; dormant/junk club cleanup;
historical result source authority; media/gallery archive scope; retained subdomains;
route/DNS cutover; inbound/outbound email transition; post-go-live retirement of legacy
feeds; raw dump retention and access; staging test data derived from legacy data; the
production database becoming the source of truth.

**Gate-index accuracy and completeness (mandatory).** The go-live blocker index in
`docs/MIGRATION_PLAN.md` and its validation-gate table are themselves audited surfaces:

- Accuracy: every artifact a gate references — script, route, table, column, count,
  section, Terraform resource — must resolve against the current repo. A gate pointing at
  a renamed script or a count the data no longer supports silently passes or blocks
  go-live on wrong evidence; that is a Catastrophic/High finding.
- Completeness: every migration/cutover risk the plan names must map to a gate; a named
  risk with no gate is a missing-gate finding.
- Consistency: the index rows, the detail rows, and the `IMPLEMENTATION_PLAN.md` release
  gates must agree, and every go-live-relevant deviation unblock condition must map to a
  gate that enforces it.

Critical principle: the legacy pipeline, mirror data, dump, and CSVs are pre-go-live
transition machinery. Flag any design implying a runtime dependency on migration inputs
after go-live unless a canonical doc explicitly retains one.

## Dev/staging/prod parity sweep

Inspect as design evidence: Dockerfiles; compose files and committed `docker/env/*.env`
runtime env files; Terraform (staging, production, shared); GitHub Actions workflows;
deploy scripts and `run_all_tests.sh`; `ops/systemd/*` units and timers; `.githooks/`;
environment templates; config docs; adapter interfaces; `package.json` scripts; staging
persona docs; production runbooks.

Look for: dev on one adapter and staging/prod on another without contract tests; staging
differing from production in SES/S3/Stripe/DB/auth behavior; production-only env vars not
checked at boot; staging-only mocks hiding production failure modes; a Docker image
omitting build/runtime assets; Terraform creating infrastructure the docs do not describe,
or docs describing infrastructure Terraform does not create; secrets supplied differently
across environments; backups, logging/redaction, migrations, static assets, email,
scheduled jobs, rate limits, or CSRF/session/cookie/TLS config differing across
environments without rationale; rollback documented but not artifact-supported; smoke
tests that never exercise production-like adapters.

Classify each hit: design bug; test gap; documentation drift; implementation-layer bug;
accepted environment difference; unknown.

## Testing and verification design sweep

Review `docs/TESTING.md`, `.claude/rules/testing.md`, package scripts, CI workflows, and
story success criteria. Find bugs where the design lacks deterministic verification for:
every critical success criterion; every security/privacy invariant; every service and view
contract; every data-model invariant; every migration validation gate; every post-go-live
source-of-truth rule; every environment adapter contract; every Docker/Terraform/runtime
config expectation; every email/DNS/cutover gate; every payment/tier/webhook invariant;
every voting integrity/anonymity invariant; every anti-enumeration rule; every club/group
distinction; every admin-action audit rule; every PII redaction/logging/export rule; every
backup/restore/rollback claim; every rate-limit/abuse-control claim.

A design-critical invariant with no specified deterministic verification is a design bug
outright, with severity calibrated to the surface it leaves unguarded, naming the exact
missing gate and the invariant it would pin.

## Scenario tabletop

Adversarial tabletop from the design docs only — no browser QA. For each scenario ask:
"Can the design determine the correct production behavior without a future implementer
guessing?" Record per scenario: design answer; supporting docs; missing rule; likely
production bug if unfixed; owner; severity.

Required scenarios:

1. New member registers and matches a legacy member by old email.
2. New member registers and falsely tries to claim someone else's legacy identity.
3. Two people claim the same historical person.
4. A member has a former surname and multiple old emails.
5. A member wants to belong to two clubs.
6. A member tries to join a third current club.
7. A member leads one club and tries to lead another.
8. A dormant legacy club is shown during onboarding.
9. A junk legacy club should be demoted or hidden.
10. A group/committee is confused with a club.
11. A board member at cutover receives tier/status treatment.
12. A Hall of Fame or BAP member has missing or conflicting migrated data.
13. A lifetime member has no current payment.
14. Active Player status expires.
15. Stripe webhook arrives twice or out of order.
16. Email address is invalid in legacy data but valid in new registration.
17. A member opts out of announcements in legacy data.
18. A media upload contains private/sensitive content.
19. Legacy gallery media must be archived but not migrated as live editable content.
20. A public profile should hide a field that admin can see.
21. A club contact email should not be exposed publicly.
22. An admin merges duplicate identities incorrectly.
23. A vote needs anonymity and eligibility.
24. Inbound email MX flips before Google addresses are provisioned.
25. Outbound email sends before SES/DKIM/SPF/DMARC is fully ready.
26. A retained legacy subdomain shares cookies or auth assumptions.
27. Final export happens after some member writes continue.
28. Rollback occurs after some users have used the new platform.
29. Production DB diverges from staging despite green tests.
30. Backups exist but restore procedure has never been tested.
31. A curated media item is published carrying a tag that resolves to no active trick.
32. A trick promotion updates the dictionary row but not the galleries, records, or browse
    surfaces that project it (a propagation miss).

## Cross-document contradiction sweep

Search for contradictions across: user stories vs design decisions, data model, service
contracts (JSDoc), page contracts (service JSDoc / view-layer rule), and testing
standards; migration plan vs data governance and design decisions; service contracts vs
the view-layer rule; data model vs schema; DevOps guide vs Terraform/Docker/scripts;
testing docs vs CI/package scripts; implementation-plan current-state claims vs canonical
docs. Report contradictions only when they affect implementation, testing, migration,
privacy, security, operations, or go-live decisions. When two sources conflict, the
conflict is the finding; never silently choose one.

## Missing-decision owner classification

Classify every unresolved design issue into exactly one primary owner before asking:
legacy-site webmaster factual question; IFPA board / governance decision;
project-maintainer decision; technical design decision; test/verification backlog;
DevOps/parity backlog; migration validation backlog; implementation-layer follow-up.

Do not ask the legacy-site webmaster to decide new-platform policy unless the issue is a
legacy fact. Do not ask the IFPA board technical implementation questions. Do not ask the
maintainer anything deterministic repo analysis can answer. The IFPA governing documents
are the authority of record for membership and voting policy: a design doc that
contradicts them is a design bug classifiable now, not a board question; reserve the board
bucket for questions the governing documents genuinely leave open.

## Design-finding refutation checklist

Before recording a design-layer candidate, try to disprove it:

1. Search the repo for the relevant term, role, table, route, service, view, test, and
   design-decision id.
2. Check whether `IMPLEMENTATION_PLAN.md` tracks it (`[DEVIATION]`, `[BLOCKED]`, `[BUG]`,
   kanban entries). Bidirectional: a tracked entry whose described state no longer matches
   the repo is itself a stale-plan finding.
3. Check whether the user story explicitly defers it.
4. Check whether a design decision intentionally excludes it.
5. Check whether the view-layer rule or a service JSDoc says the area is intentionally
   partial.
6. Check whether it is purely an implementation defect — if so, reclassify the layer
   rather than discarding it.
7. Check whether it is only legacy-pipeline behavior outside scope.
8. Check whether it matters after go-live.
9. Check whether a deterministic validation gate already covers it.
10. Check whether the risk is real enough to affect production behavior.
11. Check whether it reduces to "the feature is not built yet" — if so, discard it.

## Reviewer personas second pass

Re-run the design findings through independent personas, each trying to find production
bugs the first pass missed: malicious user; careless legitimate member; legacy member
claiming an old profile; club leader; group/committee owner; IFPA board member; event
director; admin support person; privacy reviewer; security reviewer; DevOps/on-call
maintainer; future developer implementing an undelivered story; the legacy-site webmaster
as factual witness; the project maintainer as docs maintainer. Record only evidence-backed
findings.

## Dryness loop

After the draft findings, run one more search sweep for each major noun in them (for
example: legacy_member, historical_person, tier, lifetime, active player, club, group,
committee, vote, media, email, Stripe, SES, S3, CloudFront, Terraform, Docker, staging,
production, rollback, archive, privacy, PII). If new evidence changes a finding, update
it; if no new findings appear, state that the dryness loop came up empty.

## Design-specific high-risk checklist

Always check these project-specific risks.

### Identity and onboarding

Legacy member id namespace; historical person linking; self-serve claim; mailbox-control
proof; former surnames; old emails; email invalid/opt-out fields; anti-enumeration
messages; dispute/revert; admin escalation; no legacy credentials imported; no legacy
admin auto-promotion; member-declared anchors privacy; tier grant from claim; onboarding
skip/resume/detour; audit trail.

### Membership, tiers, and flags

Tier 0/1/2/3 semantics; Active Player temporary status; lifetime membership; Hall of Fame
and BAP status; payment history; expired status; board-at-cutover treatment;
migration-derived grants; admin overrides; testability of each status transition.

### Clubs

Onboarding asks one club; downstream allows up to two current clubs; third current club
blocked; only one club leader at a time; dormant clubs; junk clubs; merge/dedupe; pending
affiliation roster; legacy residue cleanup; club contact privacy; stale external URLs;
leader candidate confidence.

### Groups and committees

Groups/committees are not clubs; committee membership source; IFPA board semantics; group
ownership; group pages; group email aliases; mail/list archives; ballots and governance;
privacy/audit of membership.

### Events and results

Event creation/approval; registration; payment dependency; CSV export; results to
profiles; historical event data source; event director permissions;
cancellation/refund/failure paths; retained legacy registration boundary.

### Voting

Eligibility; anonymity; receipts; auditability; dispute handling; admin visibility
limits; duplicate voting prevention; board/committee relationship.

### Media and archive

New uploads; YouTube-only new video policy; legacy gallery archive-only boundary;
MP4/JPEG conversion expectations; virus scrub expectations; media ownership;
takedown/moderation; privacy; S3/CloudFront retention; old URLs and redirects.

### Email, DNS, and retained legacy

Outbound from the new platform through AWS SES; inbound through Google managed services;
the `@ifpa.footbag.org` distinction; aliases/groups provisioning; MX/DKIM/SPF/DMARC
sequencing; no dual-sender period unless designed; retained subdomains; TLS on retained
hosts; cookie/session scope; CSRF origins; rollback behavior; legacy archive host.

### Freestyle and curated media (design layer)

The standing surface-propagation rule in `IMPLEMENTATION_PLAN.md` (every freestyle change
propagates to all affected surfaces before its slice is done) treated as a design rule
with verification; the curated-media pipeline's pre-go-live lifecycle boundary and the
post-go-live handoff to the production DB as source of truth; the trick-tag invariant as a
designed control with a deterministic gate;
`docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md` conformance of the publication design;
naming/slug/hashtag conventions specified well enough to implement without guessing. Deep
domain sweeps hand off to the `freestyle-bug-hunt` skill; this checklist covers only
whether the DESIGN of these controls is complete, consistent, and testable.

### DevOps and parity

Dev/staging/prod adapter parity; production-like staging smoke tests; Docker image
contents; Terraform-managed resources; config validation; secrets handling; migration
execution environment; backups and restore; observability; logs and redaction; rate
limits; CI/CD checks; no staging-only success.
