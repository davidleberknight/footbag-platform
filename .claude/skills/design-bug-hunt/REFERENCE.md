# Design Bug Hunt — detailed reference

Detailed reference for the design-bug-hunt skill, factored out of SKILL.md to stay under Anthropic's 500-line ceiling; SKILL.md points here at the relevant step.

## Required working method — phase details

### Phase 0: Load and declare scope

Before hunting, write a brief scope declaration:

* docs read
* artifacts inspected
* out-of-scope areas
* whether this run is chat-only or recording findings in the `BUGS.md` Design-bugs group
* whether legacy pipeline code is excluded
* whether Docker/Terraform/parity artifacts are included
* whether all user stories are included, including future stories
* for a scoped run, which phases are skipped and why

### Phase 1: Build design surface inventory

Create an inventory of the design surface.

At minimum include:

* user story sections and roles
* major feature domains
* design decision sections
* service-contract JSDoc entries
* page contracts in service JSDoc and the view-layer rule
* data model areas
* data governance rules
* test/verification standards
* migration plan sections
* DevOps/deployment/runtime artifacts
* environment adapter boundaries
* retained legacy services
* post-go-live data source boundaries

Do not rely on memory. Use repo evidence.

### Phase 2: Build traceability matrix

Build a traceability matrix across:

* user story
* success criteria
* relevant design decision
* service owner or missing service owner
* view/page contract or missing view/page contract
* schema/data model support
* privacy/data governance rule
* tests/verification gate
* operational/deployment consideration
* migration/go-live consideration where relevant
* status or open question

Find bugs where any required cell is missing, contradictory, or too vague to implement safely.

Do this for all user stories in scope, including undelivered future stories, subject to the undelivered-work gate.

### Phase 3: Requirements-quality sweep

For each story and design decision, test for:

* ambiguity
* incompleteness
* contradiction
* unverifiability
* missing actor
* missing precondition
* missing postcondition
* missing failure behavior
* missing authorization rule
* missing data ownership rule
* missing retention/exposure rule
* missing audit/log rule
* missing error handling
* missing edge case
* missing success metric
* missing test oracle
* hidden dependency on legacy data
* hidden dependency on staging-only behavior
* hidden dependency on manual admin knowledge
* hidden policy decision
* hidden migration assumption
* hidden timing assumption
* hidden external service assumption

A statement like "admin can manage X" is not sufficient unless the design says:

* which admin role
* what actions
* what constraints
* what audit event
* what errors
* what user-facing consequences
* what data is visible
* what can be undone
* what is tested

### Phase 4: Design-layer security and privacy threat model

This is the skill's security methodology, and it is deliberately **different from `bug-hunt`'s**. `bug-hunt` runs a code-pattern, file:line, OWASP-style review of deployed source — it answers "does this line do something exploitable." This skill runs an **architecture-and-requirements threat model** on the design itself, before and independent of code — it answers "can this design produce a wrong or unsafe outcome no matter how competently it is coded." Do not wait for code, and do not reach for file:line evidence here; the evidence is the design docs and the data flows they imply.

Compose three established methodologies, in this order. (Framing question for the whole phase, per the threat-modeling four-question framework: what are we working on, what can go wrong, what are we going to do about it, did the design say enough to verify it.)

**4a. STRIDE-per-element over a reconstructed data-flow diagram.**
Reconstruct from the design docs (not the code) a data-flow diagram of each major surface. For each surface, identify the DFD elements — external entities, processes, data stores, data flows — and every **trust boundary** a flow crosses. Then enumerate threats per element with STRIDE: **S**poofing (authentication), **T**ampering (integrity), **R**epudiation (non-repudiation/audit), **I**nformation disclosure (confidentiality), **D**enial of service (availability), **E**levation of privilege (authorization). STRIDE-per-element coverage: external entities → S, R; data flows → T, I, D; data stores → T, I, D; processes → all six. A design bug exists wherever a trust-boundary crossing has no specified authentication, validation, encryption, audit, or authorization rule, or where a STRIDE property an element needs is left unspecified by the docs.

**4b. LINDDUN GO over the same diagram (privacy).**
STRIDE does not cover privacy, and this project's PII, legacy-identity linking, historical persons, contact exports, and cross-era correlation are squarely privacy-threat territory. Walk the same DFD against the LINDDUN GO categories: **L**inkability (can records be correlated — e.g. legacy plus current re-identifying a historical person?), **I**dentifiability (can a person be singled out within a population?), **N**on-repudiation (is a data subject unable to deny an action where they *should* be able to — e.g. ballot secrecy?), **D**etectability (can someone tell that data about a person exists?), **D**isclosure of information (confidentiality of personal data), **U**nawareness (is the member uninformed of, or unable to control, collection and use?), **N**on-compliance (purpose limitation, proportionality, retention/storage limits, consent). A design bug exists wherever the governance docs leave a LINDDUN category unaddressed for an element that handles personal data. Cross-check every privacy finding against `docs/DATA_GOVERNANCE.md`.

**4c. Misuse cases over every user story (requirements layer).**
For **each user story — delivered or not** — write the corresponding misuse case: who could misuse this story, and how. "Member registers" → "attacker registers as another member's legacy identity." "Member votes" → "member votes twice, or a third party links a ballot to a voter." Derive the security/privacy acceptance criterion each misuse case demands, then check whether the story's success criteria actually state it. A missing security acceptance criterion is a design bug. This step roots the abstract STRIDE/LINDDUN findings in the actual specification, and it is the mechanism by which **all user stories, not only the deployed ones, get security coverage** — every story in `docs/USER_STORIES.md` gets a misuse case regardless of implementation status.

The threat model must cover these domains (each gets a DFD in 4a and misuse cases in 4c): account registration and login; onboarding wizard; legacy identity claim; profile editing and public profile; member tier/status changes; payments and Stripe webhooks; clubs; groups/committees; events and registration; voting; media upload and archive; email in/out; admin workflows; migration/go-live and cutover; retained legacy services; search and public directories. For each, also note assets, actors, entry points, sensitive data, state transitions, fraud/spam/enumeration risks, rate-limit needs, audit needs, and rollback/recovery needs.

**Optional drill-down — attack trees.** For the one or two highest-severity STRIDE findings (for example "exfiltrate all member PII" or "forge a legacy-identity claim"), build an attack tree: decompose the attacker goal into AND/OR sub-goals down to primitive steps, to test whether the design closes every cheap path. Use attack trees only as a drill-down, never as the primary sweep. Do not adopt PASTA's attack-simulation and vulnerability-analysis stages — those cross into code and runtime territory owned by `bug-hunt`.

Record bugs where the design lacks controls, ownership, tests, or failure behavior.

### Phase 5: Service contract sweep

Review the per-service file-header JSDoc (the service contracts) and the service-related decisions in `docs/DESIGN_DECISIONS.md` against all user stories.

Look for:

* required behavior with no service owner
* service ownership split across multiple services
* controller/template doing business logic by implication
* missing authorization responsibility
* missing transaction/idempotency responsibility
* missing validation responsibility
* missing audit/logging responsibility
* missing privacy filtering responsibility
* missing error taxonomy
* missing query-shape contract
* missing service result shape
* missing migration handoff responsibility
* missing admin service boundary
* missing email/outbox boundary
* missing payment/webhook boundary
* missing club/group distinction
* missing voting anonymity/integrity boundary
* missing media moderation boundary
* missing post-go-live source-of-truth boundary

If a service is intentionally partial, do not mark incompleteness as a bug unless the missing contract would force guessing or create production risk.

### Phase 6: View-layer sweep

Review `.claude/rules/view-layer.md` and the page services' file-header JSDoc page contracts against all user stories and design decisions.

Look for:

* required page with no view contract
* required user journey with no page-state model
* missing empty/loading/error/unauthorized states
* missing draft/unpublished/deleted/private states
* missing admin vs public rendering rules
* missing anti-enumeration behavior
* missing accessibility constraint
* missing mobile/responsive constraint where production-critical
* missing sensitive data redaction rule
* missing CTA visibility rule by role/tier/state
* missing canonical URL rule
* missing redirect/canonicalization rule
* missing success/error message semantics
* missing cross-link behavior
* missing breadcrumbs/navigation rule
* missing legacy archive link behavior
* missing no-JavaScript fallback if required by project standards

Find bugs where future UI code would have to invent rules.

### Phase 7: Data model and data governance sweep

Review `docs/DATA_MODEL.md`, `database/schema.sql`, `docs/DATA_GOVERNANCE.md`, migration docs, and user stories.

Look for missing or contradictory rules for:

* member identity
* legacy identity links
* historical persons
* former surnames and old emails
* email visibility
* address/location fields
* birth dates
* public profile fields
* club membership
* group/committee membership
* leadership roles
* admin roles
* tiers and flags
* lifetime membership
* Active Player status
* Hall of Fame and BAP flags
* payment history
* event registration
* results
* media ownership
* voting eligibility
* audit events
* exports
* deletion/deactivation
* retention
* archival snapshots
* search indexes
* logs
* backups
* staging/persona data

Specifically check for data that is:

* collected but not governed
* governed but not modeled
* modeled but not in user stories
* public in one doc and private in another
* migrated but not used
* used but not migrated
* retained after go-live without purpose
* allowed in staging but unsafe in production
* required for support but unavailable to admins
* visible to admins without audit rationale

### Phase 8: Migration and go-live design sweep

Migration design is in scope. Python migration code is not.

Review:

* `docs/MIGRATION_PLAN.md`
* `IMPLEMENTATION_PLAN.md`
* data governance docs
* onboarding/claim stories
* club bootstrap stories
* email/DNS/cutover docs
* final export/freeze requirements
* archive/legacy-retention requirements

Find bugs in:

* source-of-truth selection
* final export timing
* write-freeze assumptions
* repeated import idempotency design
* validation gate coverage
* rollback plan
* legacy-site webmaster question ownership
* IFPA board decision ownership
* project-maintainer decision ownership
* legacy account claim safety
* legacy credential exclusion
* legacy admin role migration
* member tier derivation
* board/committee derivation
* old email handling
* club affiliation derivation
* dormant/junk club cleanup
* historical event result source authority
* media/gallery archive scope
* retained subdomains
* route/DNS cutover
* inbound/outbound email transition
* post-go-live retirement of legacy data feeds
* raw dump retention and access
* staging test data derived from legacy data
* production database becoming the source of truth

Critical migration principle:

The Python legacy pipeline, mirror data, the legacy data dump, and CSVs are pre-go-live transition machinery. They must not become indefinite runtime dependencies unless a canonical design explicitly says so. Flag any design that implies continuing dependency on migration inputs after go-live.

### Phase 9: Dev/staging/prod parity sweep

Review deployment and runtime artifacts as design evidence.

Inspect:

* Dockerfiles
* Docker Compose files
* Terraform
* GitHub Actions
* deploy scripts
* environment templates
* config docs
* adapter interfaces
* `package.json` scripts
* test scripts
* staging persona docs
* production runbooks

Look for parity bugs:

* dev uses one adapter, staging/prod another, without contract tests
* staging differs from production in SES/S3/Stripe/DB/auth behavior
* production-only environment variables not checked at boot
* staging-only mocks hide production failure modes
* Docker image omits build/runtime assets
* Terraform creates infrastructure not described by docs
* docs describe infrastructure not created by Terraform
* secrets are supplied differently across environments
* backups differ across environments without rationale
* logging/redaction differs across environments
* migrations run differently across environments
* static assets differ across environments
* email sending differs across environments
* scheduled jobs differ across environments
* rate limits differ across environments
* CSRF/session/cookie/TLS config differs across environments
* CloudFront/S3/SES/DNS assumptions differ between docs and artifacts
* rollback is documented but not artifact-supported
* smoke tests do not exercise production-like adapters

Classify whether each is:

* design bug
* test gap
* documentation drift
* implementation bug for `bug-hunt`
* accepted environment difference
* unknown

### Phase 10: Testing and verification sweep

Review `docs/TESTING.md`, `.claude/rules/testing.md`, package scripts, CI workflows, and user-story success criteria.

Find bugs where the design lacks deterministic verification for:

* every critical user-story success criterion
* every security/privacy invariant
* every service contract
* every view contract
* every data model invariant
* every migration validation gate
* every post-go-live source-of-truth rule
* every environment adapter contract
* every Docker/Terraform/runtime config expectation
* every email/DNS/cutover gate
* every payment/tier/webhook invariant
* every voting integrity/anonymity invariant
* every onboarding/legacy-claim anti-enumeration rule
* every club/group distinction
* every admin action audit rule
* every PII redaction/logging/export rule
* every backup/restore/rollback claim
* every rate-limit/abuse-control claim

Flag missing tests as design bugs only when the absence of a specified verification gate makes the design unsafe, unverifiable, or likely to regress.

### Phase 11: Scenario simulation

Run adversarial tabletop simulations from the design docs.

Do not use browser QA.

For each scenario, ask: "Can the design determine the correct production behavior without a future implementer guessing?"

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

For each scenario, record:

* design answer
* docs that support it
* missing rule
* likely production bug if not fixed
* owner
* severity

### Phase 12: Cross-document contradiction sweep

Search for contradictions across:

* user stories vs design decisions
* user stories vs data model
* user stories vs service contracts (JSDoc)
* user stories vs page contracts (service JSDoc / view-layer rule)
* user stories vs testing standards
* migration plan vs data governance
* migration plan vs design decisions
* service contracts (JSDoc) vs the view-layer rule
* data model vs schema
* DevOps guide vs Terraform/Docker/scripts
* testing docs vs CI/package scripts
* implementation plan current-state claims vs canonical design docs

Report contradictions only when they affect implementation, testing, migration, privacy, security, operations, or go-live decisions.

### Phase 13: Missing-decision classification

Classify every unresolved issue into exactly one primary owner:

* `legacy-site webmaster factual question`
* `IFPA board / governance decision`
* `project-maintainer decision`
* `Technical design decision`
* `Test/verification backlog`
* `DevOps/parity backlog`
* `Migration validation backlog`
* `Bug-hunt implementation follow-up`

Do not ask the legacy-site webmaster to decide new-platform policy unless the issue is specifically about legacy facts.

Do not ask the IFPA board technical implementation questions.

Do not ask the project maintainer questions that deterministic repo analysis can answer.

### Phase 14: Active refutation

Before recording a finding, try to disprove it.

For each candidate finding:

1. Search the repo for the relevant term, role, table, route, service, view, test, and design-decision id.
2. Check whether `IMPLEMENTATION_PLAN.md` records it as current deviation or known gap.
3. Check whether the user story explicitly defers it.
4. Check whether a design decision intentionally excludes it.
5. Check whether the view-layer rule or a service's JSDoc says the area is intentionally partial.
6. Check whether it is only an implementation bug better handled by `bug-hunt`.
7. Check whether it is only Python legacy pipeline behavior outside this skill's scope.
8. Check whether it matters after go-live.
9. Check whether it has a deterministic validation gate already.
10. Check whether the risk is real enough to affect production behavior.
11. Check whether it reduces to "the feature is not built yet" — if so, discard it per the undelivered-work gate.

Only record the finding if it survives refutation.

### Phase 15: Second-pass role review

Run a second independent pass by mentally switching roles.

Use these reviewer personas:

* malicious user
* careless legitimate member
* legacy member trying to claim an old profile
* club leader
* group/committee owner
* IFPA board member
* event director
* admin support person
* privacy reviewer
* security reviewer
* DevOps/on-call maintainer
* future developer implementing an undelivered story
* the legacy-site webmaster as legacy factual witness
* the project maintainer as docs maintainer

Each persona should try to find production bugs in the design.

Record only evidence-backed findings.

### Phase 16: Dryness loop

After the report draft, do one more search sweep for each major noun in the findings.

Examples:

* `legacy_member`
* `historical_person`
* `tier`
* `lifetime`
* `active player`
* `club`
* `group`
* `committee`
* `vote`
* `media`
* `email`
* `Stripe`
* `SES`
* `S3`
* `CloudFront`
* `Terraform`
* `Docker`
* `staging`
* `production`
* `rollback`
* `archive`
* `privacy`
* `PII`

If new evidence changes a finding, update it.

If no new findings appear, state that the dryness loop found no additional design bugs.

## Report format

Use this report structure.

```markdown
# Design Bug Hunt Report

## 1. Executive summary

- Overall assessment:
- Highest-risk design assumptions:
- P0 count:
- P1 count:
- P2 count:
- P3 count:
- Areas most likely to create production bugs:

## 2. Scope and evidence

### Read
- ...

### Inspected as design/parity evidence
- ...

### Explicitly out of scope
- ...

### Not inspected
- ...

## 3. Source-of-truth and traceability summary

Summarize the source-of-truth map and major traceability gaps.

## 4. Findings by severity

### P0

<findings>

### P1

<findings>

### P2

<findings>

### P3

<findings>

## 5. Cross-document contradictions

Table:
- id
- docs/artifacts
- contradiction
- impact
- owner
- recommended resolution

## 6. Missing decisions

### Legacy-site webmaster factual questions

Only legacy factual questions.

### IFPA board / governance decisions

Only policy/governance questions.

### Project-maintainer decisions

Design/documentation authority questions.

### Technical design decisions

Engineering design choices.

## 7. Traceability matrix gaps

Table:
- story/design area
- missing service/view/schema/test/ops/migration contract
- severity
- recommendation

## 8. Migration and go-live design risks

Separate migration/go-live issues from normal feature issues.

Explicitly state whether the design correctly treats legacy feeds, mirror data, the legacy data dump, and CSVs as pre-go-live migration inputs rather than post-go-live runtime sources of truth.

## 9. Dev/staging/prod parity risks

Include Docker, Terraform, CI/CD, adapters, environment variables, secrets, email, storage, database, logs, backups, and smoke tests.

## 10. Testing and deterministic verification gaps

List missing tests/checks/gates.

## 11. Negative findings

Important areas checked and found OK.

## 12. Recommended next prompts

Provide one or more follow-up Claude Code prompts:
- highest-priority doc patch prompt
- highest-priority test/parity audit prompt
- highest-priority implementation bug-hunt handoff prompt

Do not implement them unless asked.
```

## Design-specific high-risk checklist

Always check these project-specific risks.

### Identity and onboarding

* legacy member id namespace
* historical person linking
* self-serve claim
* mailbox-control proof
* former surnames
* old emails
* email invalid/opt-out fields
* anti-enumeration messages
* dispute/revert
* admin escalation
* no legacy credentials imported
* no legacy admin auto-promotion
* member-declared anchors privacy
* tier grant from claim
* onboarding skip/resume/detour
* audit trail

### Membership, tiers, and flags

* Tier 0/1/2/3 semantics
* Active Player temporary status
* lifetime membership
* Hall of Fame and BAP status
* payment history
* expired status
* board-at-cutover treatment
* migration-derived grants
* admin overrides
* testability of each status transition

### Clubs

* onboarding asks one club
* downstream allows up to two current clubs
* third current club blocked
* only one club leader at a time
* dormant clubs
* junk clubs
* merge/dedupe
* pending affiliation roster
* legacy residue cleanup
* club contact privacy
* stale external URLs
* leader candidate confidence

### Groups and committees

* groups/committees are not clubs
* committee membership source
* IFPA board semantics
* group ownership
* group pages
* group email aliases
* mail/list archives
* ballots and governance
* privacy/audit of membership

### Events and results

* event creation/approval
* registration
* payment dependency
* CSV export
* results to profiles
* historical event data source
* event director permissions
* cancellation/refund/failure paths
* Worlds 2026 or retained legacy registration boundary

### Voting

* eligibility
* anonymity
* receipts
* auditability
* dispute handling
* admin visibility limits
* duplicate voting prevention
* board/committee relationship

### Media and archive

* new uploads
* YouTube-only new video policy
* legacy gallery archive-only boundary
* MP4/JPEG conversion expectations
* virus scrub expectations
* media ownership
* takedown/moderation
* privacy
* S3/CloudFront retention
* old URLs and redirects

### Email, DNS, and retained legacy

* outbound from new platform through AWS SES
* inbound through Google managed services
* `@ifpa.footbag.org` distinction
* aliases/groups provisioning
* MX/DKIM/SPF/DMARC sequencing
* no dual-sender period unless designed
* retained subdomains
* TLS on retained hosts
* cookie/session scope
* CSRF origins
* rollback behavior
* legacy archive host

### DevOps and parity

* dev/staging/prod adapter parity
* production-like staging smoke tests
* Docker image contents
* Terraform-managed resources
* config validation
* secrets handling
* migration execution environment
* backups and restore
* observability
* logs and redaction
* rate limits
* CI/CD checks
* no staging-only success
