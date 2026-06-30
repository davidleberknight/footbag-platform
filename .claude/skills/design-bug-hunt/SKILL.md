---
name: design-bug-hunt
description: Run a disciplined adversarial design bug hunt across canonical docs, all user stories, design decisions, service and view-layer contracts (file-header JSDoc and the view-layer rule), migration/go-live design, testing/DevOps standards, and environment parity artifacts. Invoke ONLY when the user explicitly asks for a "design bug hunt" or "design bug sweep" by name. Do NOT infer it from "adversarial review", "design review", "review the docs", or any general review phrasing - those mean the plan-mode findings-only review workflow, not this skill. This complements bug-hunt: it focuses on bugs in the intended design and specifications, not primarily implementation bugs.
---

# Design Bug Hunt Skill

> **Invoke ONLY on explicit request.** Run this skill exclusively when the user asks for a "design bug hunt" or "design bug sweep" by name. Do NOT infer it from "adversarial review", "design review", "review the docs", or any general review phrasing — those mean the plan-mode, findings-only review workflow, not this skill. When in doubt, ask before invoking.

This skill performs an adversarial design-level bug hunt for `footbag-platform`.

It complements `.claude/skills/bug-hunt/SKILL.md`.

Use this skill to find bugs that can survive go-live because the design, requirements, operational plan, migration plan, service/view contracts, or environment parity rules are incomplete, ambiguous, contradictory, untestable, unsafe, or missing.

This is not a general documentation polish pass. This is a bug hunt.

A design bug is any gap, contradiction, omission, ambiguity, unverifiable requirement, wrong source-of-truth assumption, missing lifecycle rule, missing acceptance criterion, missing security/privacy/ops constraint, missing parity rule, or unresolved migration/cutover behavior that could reasonably lead to wrong production behavior even if the eventual code is competently implemented.

## Relationship to `bug-hunt`

The existing `bug-hunt` skill focuses on deployed code, route/service behavior, implemented user stories, security/correctness bugs, and implementation evidence.

This skill focuses on the design layer:

* all user stories, including stories not yet delivered
* design decisions and design rationale
* service ownership boundaries and target contracts
* view/page/rendering standards and target page models
* data model semantics
* data governance and privacy boundaries
* testing standards and acceptance criteria
* DevOps/deployment/runtime parity requirements
* migration and go-live design
* post-go-live source-of-truth rules
* environment parity between dev, staging, and production
* documentation gaps that would force future implementers to guess

When a finding is implementation-only, hand it off to `bug-hunt`.

When a finding is a design/specification problem that will cause future implementation ambiguity or production risk, keep it here.

Overlap with `bug-hunt` is intentional and accepted. The two skills sweep overlapping surface from different perspectives — `bug-hunt` from deployed-code reality, this skill from design/specification intent — and that redundancy is a feature: each vantage point catches what the other misses. Do not suppress a real design finding merely because `bug-hunt` might also surface a related code finding. The boundary is by nature, not by territory: a finding that reduces purely to deployed-code behavior with no design-spec defect goes to `bug-hunt`; everything with a specification-layer defect stays here.

## Absolute rules

1. Do not implement code.
2. Do not silently rewrite design docs.
3. Do not change `.claude`, `docs`, `.github`, infrastructure, tests, source, schema, or migration files unless the human explicitly asks for edits after the design-bug report. Recording findings in `BUGS.md` happens only when the human asks for findings to be recorded.
4. Do not run destructive commands.
5. Do not inspect or dump raw PII unnecessarily.
6. Do not print raw member PII, emails, addresses, phone numbers, passwords, password hashes, reset tokens, sessions, secrets, or credential-like values.
7. Do not audit the Python legacy pipeline as code unless the human explicitly expands scope.
8. Do not treat legacy CSVs, mirror feeds, or the legacy data dump as post-go-live runtime sources of truth. After go-live, the production database and live platform become the source of truth unless a canonical doc explicitly says otherwise.
9. Do not treat "not currently implemented" as a design bug by itself. Documented future work is design intent, not audit drift. A missing service, view, schema, governance, or test contract for an undelivered story is reportable ONLY when the intended behavior is ambiguous, contradictory, unsafe, unverifiable, or missing required acceptance criteria. Mere absence of an unbuilt feature is never a finding, and the hunt never proposes building the feature.
10. Do not treat existing design rationale as automatically correct. Good rationale can still hide edge-case bugs.
11. Do not guess. Use `UNKNOWN`, `NOT SPECIFIED`, `NOT FOUND`, `CONTRADICTED`, or `NEEDS HUMAN DECISION`.
12. Ask at most one question at a time, only when truly blocked after collecting available evidence; follow `.claude/rules/asking.md` (one self-contained question with a recommended answer, no codes the maintainer was not given).
13. Findings must be evidence-grounded and actively refuted before recording.
14. Continue until no new candidate design bugs appear after at least two independent passes, subject to the scaling rule below.

## Output target

Default output is a design-bug report in chat.

If the human explicitly asks for findings to be recorded, the single sink is `BUGS.md` at the repo root — the same file the `bug-hunt` skill uses. Do not create `DESIGN_BUGS.md` or any other file.

Design findings go in a dedicated **Design bugs (specification/design layer)** group, added after the existing groups (security severity sections, Design-divergence and hygiene, Testing and CI/CD verification gaps, Leads). The group follows `bug-hunt`'s §4.6 discipline:

* It is ephemeral. Remove each finding once its design fix lands; the corrected canonical doc is then authoritative. No closures, no dates, no `RESOLVED` markers, no emojis.
* Design findings use their own `DBH-###` sub-sequence with a `Next design finding ID:` pointer at the top of the group. This is a deliberate divergence from bug-hunt's single `B-###` sequence: a different skill, cadence, and owner set produce these, so a separate counter prevents the two skills contending over one ID.
* Before any write, audit every existing entry in the Design-bugs group and re-verify it still stands, exactly as bug-hunt's §4.5 step-0 audit requires. Audit only the Design-bugs group.
* Never edit, renumber, or remove entries in the code severity / hygiene / testing / Leads groups. This skill owns only the Design-bugs group.

## Read order

Start with the repo guidance and source-of-truth rules.

Read:

1. `CLAUDE.md`
2. all path-scoped rules in `.claude/rules/*.md` (doc-governance, testing, service-layer, controller-conventions, template-conventions, view-layer, db-layer, db-write-safety, adapter-conventions, comments, memory)
3. the `.claude/skills/*` procedures (this skill, `bug-hunt`, and any domain skill bearing on the area under review)
4. `PROJECT_SUMMARY_CONCISE.md`
5. `IMPLEMENTATION_PLAN.md`
6. `docs/USER_STORIES.md`
7. `docs/DESIGN_DECISIONS.md`
8. `docs/DATA_GOVERNANCE.md`
9. `docs/DATA_MODEL.md`
10. per-service file-header JSDoc (the service contracts)
11. `docs/TESTING.md`
12. `docs/DEVOPS_GUIDE.md`
13. `docs/MIGRATION_PLAN.md`
14. `legacy_data/CLAUDE.md`
15. `ifpa/BYLAWS.md`, `ifpa/IFPAMembershipStructure_2026.md`, `ifpa/ArticlesOfIncorporation.md`, `ifpa/rules/**` — required before any finding touching membership tiers, Active Player status, voting eligibility, or published rules; the governing documents `docs/USER_STORIES.md` defers to as the authority of record.

This full read-order applies to a comprehensive design audit. For a scoped ask, read only the subset that bears on the request (see Scaling and budget).

Then inspect parity and deployment artifacts as design evidence:

* `package.json`
* `tsconfig.json`
* Docker files
* Docker Compose files
* Terraform files
* GitHub Actions workflows
* deployment scripts and runbooks
* environment templates
* production/staging config documentation
* database schema
* seed data contracts
* adapter interfaces
* service and view-layer contracts (JSDoc + view-layer rule)
* route catalogs or route discovery scripts
* test scripts and CI commands

Do not perform a code-first review. Use code and deployment artifacts only as evidence for:

* current implementation status when docs claim it
* environment parity
* artifact availability
* service/view boundary enforcement
* testability
* schema/design alignment
* runtime source-of-truth assumptions
* deployment/cutover risk

## Scaling and budget

Scale depth to the request. The full read-order, the two-pass loop, all sixteen phases, the 30-scenario tabletop, and the dryness loop apply to an explicit comprehensive design audit.

For a narrowly scoped ask ("design-review the migration plan", "check parity for SES/S3", "is the voting design testable"), read only the docs and artifacts that bear on it, run only the relevant phases, and state in the scope declaration which phases you skipped and why. Do not read all 18 docs and every infrastructure artifact for a scoped question.

Stop when a marginal pass stops producing verified findings, not on an arbitrary count. If a run is going long, surface what is covered so far and let the maintainer decide whether to continue rather than silently grinding through every phase.

## Scope

In scope:

* all user stories, not just completed stories
* all roles and personas in the user stories
* all success criteria
* all negative/edge cases implied by success criteria
* design decisions and settled rationale
* contradictions between design decisions and user stories
* contradictions between migration plan and design decisions
* contradictions between the page services' JSDoc or view-layer rule and user stories
* contradictions between service contracts (JSDoc) and user stories
* contradictions between data governance and data model
* missing service contracts for required user-story behavior
* missing view/page contracts for required user-story behavior
* missing lifecycle states
* missing authorization rules
* missing privacy rules
* missing audit rules
* missing test requirements
* missing operational runbooks
* missing failure behavior
* migration/go-live/cutover design
* final export and write-freeze design
* legacy archive boundaries
* legacy data source retirement after go-live
* dev/staging/prod parity
* Docker/Terraform/deployment artifact parity
* email, DNS, Stripe, S3, CloudFront, SES, backups, rollback, and observability design
* production bugs that would happen because future code has to guess

**Gate on undelivered work:** the scope above includes undelivered stories, but only their *design quality* (ambiguity, contradiction, unsafety, unverifiability, missing acceptance criteria) is in scope. "This story isn't built yet" is out of scope by definition. If a candidate finding reduces to "the feature does not exist yet," discard it. The hunt never proposes building an unbuilt feature.

Out of scope by default:

* Python legacy pipeline implementation correctness
* raw SQL dump parser bugs
* low-level TypeScript implementation defects
* browser QA
* visual polish
* wording/style preferences
* implementation progress tracking unless a doc claims a design is already implemented
* refactoring suggestions without production-risk evidence

Migration design is in scope.

Legacy migration Python code is out of scope unless the human explicitly says otherwise.

## Definition of a design bug

A design bug exists when at least one is true:

1. A user story requires behavior but the success criteria do not make the behavior testable.
2. A user story requires behavior but no service, view, schema, governance, or test contract supports it.
3. A design decision settles a principle but leaves a production-critical edge case unspecified.
4. Two canonical docs conflict.
5. A future implementer would have to invent business rules.
6. A role, authorization boundary, or trust boundary is unspecified.
7. A state transition is missing, ambiguous, or unsafe.
8. A lifecycle lacks failure, retry, cancellation, expiry, rollback, or dispute behavior.
9. A privacy or data-governance rule is missing for PII, legacy data, exports, logs, notifications, audit trails, public pages, search, or admin views.
10. A service JSDoc or view-layer contract omits behavior required by the stories.
11. A design assumes data quality that the migration plan does not prove.
12. A migration rule has no validation gate.
13. A go-live rule has no rollback or freeze rule.
14. A dev/staging/prod difference could create production-only behavior.
15. Docker, Terraform, CI/CD, environment variables, or adapters could diverge from the documented design.
16. Testing standards do not require deterministic checks for a design-critical invariant.
17. Observability, backup, restore, or incident response is insufficient for the feature's risk.
18. A legacy data source is expected to remain useful after go-live without a clear source-of-truth handoff.
19. A retained legacy service or subdomain creates unclear auth, cookie, TLS, CSRF, data, mail, or DNS behavior.
20. The design does not say who decides an unresolved governance or operational policy.

## Severity rubric

Use this severity scale.

### P0

Likely go-live blocker or production-critical design flaw.

Examples:

* identity linking can attach a member to the wrong legacy identity
* credentials, password hashes, secrets, or raw PII could be exposed or imported
* inbound or outbound email could be lost at cutover
* production and staging can use materially different adapters
* rollback cannot be performed safely
* role/authorization model allows privilege escalation
* payment/tier design can grant or revoke membership incorrectly
* voting anonymity, integrity, or eligibility is underspecified
* no source-of-truth handoff after go-live for a critical data domain

### P1

Must resolve before final export, cutover, or first real users, but not necessarily architecture-threatening.

Examples:

* missing validation gate for final migration counts
* ambiguous admin workflow for member disputes
* missing Stripe webhook idempotency acceptance criteria
* missing S3/CloudFront retention rule for user media
* missing staging smoke test for critical user journey
* unclear club/group distinction in one feature area

### P2

Should resolve before v1 or explicitly accept as risk.

Examples:

* unclear edge case for dormant clubs
* missing negative test requirement
* incomplete page contract (service JSDoc) for a future page
* missing operational owner for a low-frequency admin workflow

### P3

Post-launch cleanup or documentation hardening.

Examples:

* non-blocking traceability improvement
* minor terminology drift that is unlikely to cause wrong behavior
* useful but nonessential runbook clarification

## Source-of-truth hierarchy

Use the repo's canonical order; do not restate a competing one. The authority order is `CLAUDE.md`'s "Source-of-truth order for active work": explicit current human decision, then `CLAUDE.md` and `.claude/rules/*`, then the active-slice block in `IMPLEMENTATION_PLAN.md`, then current code (implemented behavior, not design authority), then the auto-attached path-scoped rules and service JSDoc, then targeted sections of `docs/USER_STORIES.md`, `docs/DATA_MODEL.md`, and `docs/TESTING.md`, then `docs/DESIGN_DECISIONS.md` for long-term rationale. `docs/DATA_GOVERNANCE.md` is mandatory before any finding touching members, historical persons, search, auth, contact fields, exports, stats, or privacy. Treat legacy data and pipeline outputs as migration evidence, never as authority.

When two sources conflict, classify the conflict as a finding rather than silently choosing one.

The IFPA governing documents (`ifpa/BYLAWS.md`, `ifpa/IFPAMembershipStructure_2026.md`, `ifpa/ArticlesOfIncorporation.md`, `ifpa/rules/**`) are the authority of record for membership policy, tiers, Active Player status, voting eligibility, and published rules content, ranking above `docs/USER_STORIES.md`, which defers to them. A design doc that contradicts them on membership or voting is a design bug detectable now, classified by severity, not a missing decision to route to the IFPA board. Reserve the board-decision bucket for questions the governing documents genuinely leave open.

One rule this skill adds, because it is go-live-specific and `CLAUDE.md` does not state it: after go-live the platform database and live application are the source of truth for production state. Legacy feeds, mirror data, the preliminary legacy data dump, raw SQL backups, and curated CSVs are migration inputs and audit evidence only, never a retained runtime source, unless a canonical design doc explicitly defines a retained legacy source. Flag any design that implies continuing runtime dependency on migration inputs after go-live.

## Required working method

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

## Finding format

Each finding must use this format:

```markdown
### DBH-###: <short title>

- Severity: P0 | P1 | P2 | P3
- Category: <one category>
- Owner: legacy-site webmaster / IFPA / project maintainer / Technical design / Testing / DevOps / Migration / Bug-hunt follow-up
- Status: New | Confirmed | Contradicted | Needs human decision | Needs validation
- Scope: User story | Design decision | Service contract | View-layer | Data model | Migration | DevOps | Testing | Cross-doc
- Evidence:
  - `<path>`: <section/line/function/table/artifact summary>
  - `<path>`: <section/line/function/table/artifact summary>
- Design bug:
  <What is wrong or missing in the design?>
- Why it could survive to production:
  <How competent implementation could still produce wrong behavior because the design is incomplete/contradictory?>
- Refutation attempted:
  <Where you looked to disprove it and why it still stands>
- Recommended fix:
  <Specific doc/design/test/parity/migration update>
- Verification:
  <How to prove the fix works>
- Blocks:
  Go-live | final export | cutover | email switchover | staging parity | v1 feature | post-launch
```

Use stable IDs in the `DBH-###` sub-sequence:

* `DBH-001`, `DBH-002`, etc.

Do not reuse a retired `DBH` id and do not renumber. Do not use vague titles like "Review needed."

## Category taxonomy

Use these categories where possible:

* Requirements ambiguity
* Missing acceptance criteria
* Missing negative case
* Cross-document contradiction
* Missing service ownership
* Missing view contract
* Missing data-governance rule
* Missing schema/data-model rule
* Role/authorization gap
* State-machine/lifecycle gap
* Identity/legacy-claim risk
* Club/group distinction risk
* Payment/tier/status risk
* Voting integrity/anonymity risk
* Media/archive boundary risk
* Migration source-of-truth risk
* Post-go-live source-of-truth risk
* Cutover/rollback risk
* Email/DNS risk
* Dev/staging/prod parity risk
* Docker/runtime artifact risk
* Terraform/infrastructure drift
* Testing/verification gap
* Observability/ops gap
* Security/threat-model gap
* Privacy/PII exposure risk
* Admin workflow gap
* Governance decision gap
* Future implementation ambiguity

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

## Question discipline

Ask a question only when blocked. Follow `.claude/rules/asking.md`: plain self-contained English, no internal codes the human was not given, one recommended answer made the default so a bare "y" takes it.

When asking, use this format:

```markdown
I need one decision before continuing.

Evidence:
- ...
- ...

Question:
<one precise question, self-contained>

Recommended answer:
<the single answer the sources support, and why; research it from the authoritative source rather than leaving it open. This is the default a bare "y" accepts.>

Load-bearing assumptions:
<the assumptions behind the recommendation, so a wrong one can be corrected first>

Why it matters:
<what downstream analysis depends on it>
```

Do not bundle multiple questions.

## What not to record

Do not record:

* grammar/style complaints
* merely incomplete implementation
* missing code for a future story when the design is clear
* issues already explicitly documented as accepted non-v1 scope with no production risk
* duplicate findings
* speculative risks with no evidence
* Python legacy pipeline implementation details
* browser-rendering observations
* refactors
* "could be nicer" suggestions
* anything that will not matter after go-live

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

## Final instruction

Be adversarial, systematic, and evidence-grounded.

The best output is not a long list of worries. The best output is a verified set of design bugs that would plausibly become production bugs unless the canonical docs, design decisions, service/view contracts, migration plan, testing standards, or deployment/parity rules are corrected.

Start by loading the required docs for the requested scope and building the design surface inventory.
