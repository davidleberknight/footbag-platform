# Bug Hunt: design-layer reference

The design lane's brief, read by the subagent that sweeps the design layer and never by the
orchestrator. Evidence at this layer is doc sections, contracts and reconstructed data
flows, not file:line; code and deployment artifacts serve only as design evidence
(implementation status where docs claim it, parity, schema alignment, cutover risk). The
verification design (whether every design-critical invariant has a deterministic check) is
the `write-tests` skill's; a design finding here may name the invariant it leaves
unguarded, and the hand-off goes there.

## Contents

- Oracle: the expectation table
- Definition of a design bug
- Design category taxonomy
- Scope declaration and surface inventory
- Threat model: STRIDE per element, LINDDUN GO, misuse cases
- Service contract, view-layer, data and migration sweeps
- Dev/staging/prod parity sweep
- Missing-decision owner classification
- Design-finding refutation checklist
- Scenario tabletop (optional)
- Design-specific high-risk checklist

## Oracle: the expectation table

The oracle lane's whole method. It reads the stories, background jobs and design decisions,
never the code: an expectation read off the code only restates the code, and a hunt
checked against it finds nothing the code does not already agree with.

For each success criterion of each deployed story or job, and each design decision a
five-ranked surface rests on, write one row:

- the story, job or decision, by its identifier and heading;
- the criterion, quoted;
- the expected observable: what a request, a page, a row or a sent message shows when the
  criterion holds, concrete enough that a probe passes or fails on it;
- the probe: the request, page visit, `sqlite3 -readonly` query or existing test that would
  show it, and the persona or state it needs.

A criterion that yields no observable (too vague, two readings, no actor, no failure case)
is a gap row naming what is missing. A gap row is a coverage gap in this hunt, never a
design finding: wording is the extended doc sync's. Group the rows by feature domain, the
way Lane 2 is split.

## Definition of a design bug

A design bug exists when at least one is true:

1. A story requires behavior but its success criteria do not make it testable.
2. A story requires behavior but no service, view, schema, governance or test contract
   supports it.
3. A design decision settles a principle but leaves a production-critical edge case
   unspecified.
4. Two canonical docs conflict.
5. A future implementer would have to invent business rules.
6. A role, authorization boundary or trust boundary is unspecified.
7. A state transition is missing, ambiguous or unsafe.
8. A lifecycle lacks failure, retry, cancellation, expiry, rollback or dispute behavior.
9. A privacy or governance rule is missing for PII, legacy data, exports, logs,
   notifications, audit trails, public pages, search or admin views.
10. A service JSDoc or view-layer contract omits behavior the stories require.
11. A design assumes data quality the validation gates do not prove.
12. A migration rule has no validation gate, or a go-live rule has no rollback or freeze rule.
13. A dev/staging/prod difference could create production-only behavior.
14. Observability, backup, restore or incident response is insufficient for the feature's
    risk.
15. A legacy data source is expected to stay useful after go-live with no source-of-truth
    handoff, or a retained legacy service creates unclear auth, cookie, TLS, CSRF, mail or
    DNS behavior.
16. The design does not say who decides an unresolved governance or operational policy.

Items 1, 4 and 5 are found by the extended doc sync, which runs first, and are recorded
here only where they leave a five-ranked surface unsafe.

Existing rationale is not automatically correct: good rationale can hide edge-case bugs. Do
not guess; carry uncertainty as `UNKNOWN`, `NOT SPECIFIED`, `CONTRADICTED` or `NEEDS HUMAN
DECISION` until resolved through the asking rule.

## Design category taxonomy

Use these in the finding `Class` field: Requirements ambiguity; Missing acceptance criteria;
Missing negative case; Cross-document contradiction; Missing service ownership; Missing view
contract; Missing data-governance rule; Missing schema rule; Role/authorization gap;
State-machine/lifecycle gap; Identity/legacy-claim risk; Club/group distinction risk;
Payment/tier/status risk; Voting integrity/anonymity risk; Media/archive boundary risk;
Migration source-of-truth risk; Post-go-live source-of-truth risk; Cutover/rollback risk;
Email/DNS risk; Dev/staging/prod parity risk; Docker/runtime artifact risk;
Terraform/infrastructure drift; Observability/ops gap; Security/threat-model gap;
Privacy/PII exposure risk; Admin workflow gap; Governance decision gap; Future
implementation ambiguity.

## Scope declaration and surface inventory

Before the sweep, write a scope declaration into scratch notes (it feeds the `BUGS.md` scope
note): docs read; artifacts inspected as parity evidence; out-of-scope areas; whether
Docker and Terraform artifacts are included; whether all stories are included; which sweeps
a scoped run skips and why.

Inventory the design surface from repo evidence, never memory: story sections and roles;
feature domains; design decision sections; service-contract JSDoc entries; page contracts
in service JSDoc and the view-layer rule; data model areas; governance rules; deployment
and runtime artifacts; adapter boundaries; retained legacy services; post-go-live data
boundaries.

## Threat model: STRIDE per element, LINDDUN GO, misuse cases

This is an architecture-and-requirements threat model on the design itself, before and
independent of code: can this design produce a wrong or unsafe outcome however competently
it is coded. Do not reach for file:line evidence here. It covers the five-ranked surfaces
and the stories behind them, never the whole design.

**STRIDE per element** over a data-flow diagram reconstructed from the design docs for each
major surface: external entities get Spoofing and Repudiation; flows and stores get
Tampering, Information disclosure and Denial of service; processes get all six. A design
bug exists wherever a trust-boundary crossing has no specified authentication, validation,
encryption, audit or authorization rule.

**LINDDUN GO** over the same diagram: Linkability (legacy plus current re-identifying a
historical person), Identifiability, Non-repudiation (ballot secrecy), Detectability (can
someone tell data about a person exists), Disclosure, Unawareness, Non-compliance (purpose,
proportionality, retention, consent). Cross-check every privacy finding against
`docs/DATA_GOVERNANCE.md`.

**Misuse cases** over every story behind a five-ranked surface, delivered or not: who could misuse it and how ("member
registers" becomes "attacker registers as another member's legacy identity"). Derive the
security or privacy acceptance criterion each misuse case demands and check the story
states it; a missing one is a design bug. This is how undeployed stories get security
coverage.

Domains: registration and login; onboarding; legacy claim; profile editing and public
profile; tier and status changes; payments and webhooks; clubs; groups and committees;
events; voting; media upload and archive; email in and out; admin workflows; migration and
cutover; retained legacy services; search and public directories. Attack trees only for the
one or two highest-severity findings, never as the primary sweep and never as runtime
simulation.

## Service contract, view-layer, data and migration sweeps

**Service contracts.** Review the per-service file-header JSDoc and the service-related
decisions against every story: required behavior with no owner; ownership split across
services; missing authorization, transaction, idempotency, validation, audit or privacy
responsibility; missing error taxonomy or result-shape contract; missing migration handoff
or post-go-live boundary. Incompleteness in an intentionally partial service is a bug only
when the missing contract would force guessing or create production risk.

**View layer.** Review `.claude/rules/view-layer.md` and the page contracts in service JSDoc
against the stories: a required page with no contract; a journey with no page-state model;
missing empty, error, unauthorized, draft, deleted or private states; missing admin-versus-
public rendering rules; missing anti-enumeration behavior; missing redaction rule; missing
CTA visibility by role, tier or state; missing canonical URL or redirect rule; missing
no-JavaScript fallback where the standard requires one.

**Data model and governance.** Review `docs/DATA_MODEL.md`, `database/schema.sql`,
`docs/DATA_GOVERNANCE.md` and the stories for missing or contradictory rules on identity,
legacy links, historical persons, former surnames and old emails, email and address
visibility, birth dates, club and group membership, roles, tiers, lifetime membership,
Active Player, honours, payments, registration, results, media ownership, voting
eligibility, audit, exports, deletion, retention, archives, search, logs, backups and
persona data. Check for data collected but not governed; governed but not modeled; public
in one doc and private in another; migrated but not used; retained after go-live without
purpose; visible to admins without audit rationale.

**Migration and go-live.** Migration design is in scope; the Python pipeline is not. Review
the pipeline validation gates in `docs/TESTING.md`, GO_LIVE_PLAN.md (private GitHub repo;
skip when unwired), the Launch v1 milestone in the maintainers' private tracker, the
governance docs and the claim and club-bootstrap stories. Find bugs in source-of-truth
selection; visibility of a missing input that changes the loaded result; repeated-import
idempotency; rollback; question ownership; claim safety and legacy credential exclusion;
tier, board and club derivation; archive scope; DNS and email transition; post-go-live
retirement of legacy feeds. **Gate-index accuracy is mandatory**: every artifact a gate
references must resolve against the current repo (a renamed script or an unsupported count
silently passes or blocks go-live on wrong evidence, Catastrophic or High); every named
risk maps to a gate; the index rows, detail rows and milestone issues agree.

## Dev/staging/prod parity sweep

Inspect as design evidence: Dockerfiles, compose and committed `docker/env/*.env` files,
Terraform trees, workflows, deploy scripts and `run_all_tests.sh`, `ops/systemd/*`,
`.githooks/`, adapter interfaces, `package.json` scripts, persona docs and runbooks. Look
for one adapter in dev and another in staging or production without contract tests;
production-only env vars not checked at boot; staging-only mocks hiding production failure
modes; an image omitting assets; Terraform creating what the docs do not describe or the
reverse; secrets, backups, logging, scheduled jobs, rate limits or cookie and TLS config
differing across environments without rationale; rollback documented but not
artifact-supported. Classify each hit: design bug; documentation discrepancy;
implementation bug; accepted environment difference; test gap (hand-off); unknown.

## Missing-decision owner classification

Classify every unresolved design issue into exactly one owner before asking: legacy-site
webmaster (factual questions about the old site); IFPA secretary (IFPA policy, rules,
records, membership, communications); IFPA Board (bylaw votes only: funds account, dues and
membership levels, election timing); CTO (project maintainer); technical design; or a
hand-off backlog (`write-tests`, DevOps parity, migration validation, implementation). Do
not ask the webmaster to decide new-platform policy, the secretary or the Board a technical
question, or the maintainer anything repo analysis can answer. The IFPA governing documents
are the authority of record for membership and voting policy: a doc contradicting them is a
design bug classifiable now, not a question.

## Design-finding refutation checklist

Before recording a design candidate, try to disprove it:

1. Search the repo for the term, role, table, route, service, view, test and decision id.
2. Check the tracked-work exclusion list (open issues plus `BUGS.md`); an open issue whose
   described state no longer matches the repo is itself a finding.
3. Check whether the story defers it, a decision excludes it, or a JSDoc says the area is
   intentionally partial.
4. Check whether it is purely an implementation defect (reclassify), or drift between
   documents, comments and code (a hand-off to the extended doc sync).
5. Check whether it is legacy-pipeline behavior out of scope, or stops mattering after
   go-live.
6. Check whether a deterministic gate already covers it.
7. Check whether it reduces to "the feature is not built yet"; if so, discard it.

## Scenario tabletop (optional)

Run when the kickoff names a design area, or when a lane's leads cluster on one flow. For
each scenario ask whether the design determines the correct production behavior without a
future implementer guessing; record the design answer, the supporting docs, the missing
rule, the likely production bug, the owner and the severity. Build the scenarios from the
high-risk checklist below for the area named: the legacy claimant with a former surname and
three old emails, or a false claim on someone else's identity; a third club or a second
leadership; a dormant or junk club shown in onboarding; a board member, honoree or lifetime
member with conflicting migrated data; a webhook twice or out of order; a private media
upload or an archive item edited; a field an admin sees that the public must not; a wrong
identity merge; MX flipped before Google addresses exist, or a send before SES is ready; a
final export after writes continue, a rollback after use, a restore never rehearsed; a
curated tag resolving to no trick, or a promotion that reaches the dictionary and not its
projections.

## Design-specific high-risk checklist

Always check: identity and onboarding (legacy id namespace, historical person linking,
self-serve claim with one matching component, former surnames, old emails as keys only,
anti-enumeration messages, dispute and revert, no legacy credentials or admin
auto-promotion, tier grant from claim, onboarding skip and resume, audit); membership
(Tier 0 to 3 semantics, Active Player as temporary status, lifetime membership, Hall of Fame
and BAP, board-at-cutover, migration-derived grants, admin overrides); clubs (one club asked
at onboarding, two current clubs allowed and a third blocked, one leader role, dormant and
junk clubs, pending roster, contact privacy, stale URLs); groups and committees (not clubs,
membership source, board semantics, aliases, ballots); events and results (approval,
registration, payment dependency, results to profiles, historical source authority,
cancellation and refund); voting (eligibility, anonymity, receipts, audit, duplicate
prevention); media and archive (YouTube-only new video, archive-only legacy gallery,
ownership, takedown, retention, old URLs); email, DNS and retained legacy (SES out, Google
in, the `@ifpa.footbag.org` distinction, MX, DKIM, SPF and DMARC sequencing, retained
subdomains, cookie and CSRF scope, rollback); freestyle and curated media (the propagation
rule as a design rule, the curated pipeline's pre-go-live boundary and post-go-live
handoff, the trick-tag invariant as a designed control, conformance to the publication
contract in `docs/FREESTYLE.md`; deep domain sweeps hand off to `freestyle-bug-hunt`);
DevOps and parity (adapter parity, production-like staging smoke, image contents,
Terraform-managed resources, config validation, secrets, backups and restore,
observability, redaction, rate limits, no staging-only success).
